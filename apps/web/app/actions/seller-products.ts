'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { prisma, Prisma } from '@vendoora/db';
import { getSellerSession } from '../../lib/seller-auth';
import { getListingUsage, type SellerPlan } from '../../lib/seller-tier';
import { IS_R2_ENABLED, uploadObject, deleteObject } from '../../lib/r2';
import {
  updateSellerProduct,
  validateProductInput,
  type ProductEditInput,
} from '../../lib/product-edit';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const VALID_CONDITIONS = new Set(['NEW', 'LIKE_NEW', 'USED_GOOD', 'USED_FAIR', 'REFURBISHED', 'FOR_PARTS']);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Create a new product (DRAFT + PENDING moderation) on behalf of the seller.
 *
 * Pipeline mirrors the KYC upload: file → R2 first, DB row second, with
 * best-effort R2 cleanup on DB-write failure so we never leak orphan PII /
 * orphan uploaded bytes.
 *
 * Tier-gating (lib/seller-tier) is enforced server-side BEFORE the R2 PUT so a
 * seller at the listing cap can't burn an upload. Slug uniqueness is checked
 * per-seller (the unique constraint is on `Product.slug` per seller scope at
 * the application level).
 */
export async function createProduct(formData: FormData): Promise<void> {
  const session = await getSellerSession();
  if (!session) redirect('/sell/sign-in');

  const seller = await prisma.seller.findUnique({
    where: { id: session.sellerId },
    select: { id: true, business_slug: true, saas_plan: true },
  });
  if (!seller) redirect('/sell/sign-in');

  // ---- form parse ----
  const name = String(formData.get('name') ?? '').trim();
  const rawSlug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const short_description = String(formData.get('short_description') ?? '').trim() || null;
  const description = String(formData.get('description') ?? '').trim();
  const category_id = String(formData.get('category_id') ?? '').trim();
  const condition = String(formData.get('condition') ?? '').trim();
  const basePriceRaw = String(formData.get('base_price') ?? '').trim();
  const compareAtRaw = String(formData.get('compare_at_price') ?? '').trim();
  const image = formData.get('image');

  // ---- field validation ----
  if (name.length < 3 || name.length > 200) {
    redirect('/sell/console/products/new?error=name_required');
  }
  if (description.length < 20) {
    redirect('/sell/console/products/new?error=description_required');
  }
  const slug = rawSlug || slugify(name);
  if (!SLUG_RE.test(slug)) {
    redirect('/sell/console/products/new?error=bad_slug');
  }
  const base_price = Number(basePriceRaw);
  if (!Number.isFinite(base_price) || base_price <= 0) {
    redirect('/sell/console/products/new?error=price_invalid');
  }
  const compare_at_price = compareAtRaw ? Number(compareAtRaw) : null;
  if (compare_at_price !== null && (!Number.isFinite(compare_at_price) || compare_at_price <= 0)) {
    redirect('/sell/console/products/new?error=price_invalid');
  }
  if (!VALID_CONDITIONS.has(condition)) {
    redirect('/sell/console/products/new?error=bad_condition');
  }

  // ---- category sanity ----
  const category = await prisma.category.findUnique({
    where: { id: category_id },
    select: { id: true, is_active: true },
  });
  if (!category || !category.is_active) {
    redirect('/sell/console/products/new?error=bad_category');
  }

  // ---- tier-gating (lib/seller-tier) ----
  const usage = await getListingUsage(seller.id, seller.saas_plan as SellerPlan);
  if (usage.atCap) {
    redirect('/sell/console?error=at_cap');
  }

  // ---- per-seller slug uniqueness ----
  const slugTaken = await prisma.product.findFirst({
    where: { seller_id: seller.id, slug, deleted_at: null },
    select: { id: true },
  });
  if (slugTaken) {
    redirect('/sell/console/products/new?error=slug_in_use');
  }

  // ---- image file validation ----
  if (!(image instanceof File) || image.size === 0) {
    redirect('/sell/console/products/new?error=missing_image');
  }
  if (!ALLOWED_IMAGE_MIME.has(image.type)) {
    redirect('/sell/console/products/new?error=bad_mime');
  }
  if (image.size > MAX_IMAGE_BYTES) {
    redirect('/sell/console/products/new?error=too_large');
  }
  if (!IS_R2_ENABLED) {
    redirect('/sell/console/products/new?error=r2_not_configured');
  }

  // ---- resolve actor for audit ----
  let actorUserId: string | null = null;
  const actorClerkId = session.kind === 'clerk' ? session.clerk_user_id : null;
  if (actorClerkId) {
    const u = await prisma.user.findUnique({
      where: { clerk_id: actorClerkId },
      select: { id: true },
    });
    actorUserId = u?.id ?? null;
  }

  // ---- R2 upload ----
  const safeFileName = image.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const objectKey = `products/${seller.id}/${randomUUID()}-${safeFileName}`;
  const bytes = Buffer.from(await image.arrayBuffer());
  await uploadObject({
    key: objectKey,
    body: bytes,
    contentType: image.type,
    contentLength: image.size,
  });

  // ---- DB writes (with best-effort R2 cleanup on failure) ----
  let createdSlug: string | null = null;
  let slugConflict = false;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          seller_id: seller.id,
          category_id: category.id,
          name,
          slug,
          description,
          short_description,
          base_price,
          compare_at_price,
          currency: 'USD',
          attributes: {} satisfies Prisma.InputJsonValue,
          tags: [],
          condition: condition as 'NEW' | 'LIKE_NEW' | 'USED_GOOD' | 'USED_FAIR' | 'REFURBISHED' | 'FOR_PARTS',
          status: 'DRAFT',
          moderation_status: 'PENDING',
          inventory_tracking: false,
        },
        select: { id: true, slug: true },
      });
      await tx.productImage.create({
        data: {
          product_id: product.id,
          // Stored as R2 object key. The public image-render pipeline that
          // resolves keys → presigned URLs (or a public R2 URL) is a follow-up.
          // Products are PENDING moderation here, so they don't render publicly yet.
          url: objectKey,
          is_primary: true,
          display_order: 0,
        },
      });
      await tx.auditLog.create({
        data: {
          ...(actorUserId
            ? { actor_user_id: actorUserId, actor_system: false }
            : { actor_system: actorClerkId === null }),
          action: 'product.created',
          resource_type: 'product',
          resource_id: product.id,
          after_state: {
            seller_id: seller.id,
            slug: product.slug,
            status: 'DRAFT',
            moderation_status: 'PENDING',
          } satisfies Prisma.InputJsonValue,
          metadata: {
            actor_clerk_id: actorClerkId,
            seller_slug: seller.business_slug,
            image_object_key: objectKey,
          } satisfies Prisma.InputJsonValue,
        },
      });
      return product;
    });
    createdSlug = created.slug;
  } catch (e) {
    // A soft-deleted product can still occupy (seller_id, slug) in the unique
    // index — @@unique([seller_id, slug]) is NOT partial — so the app-level
    // check above (filtering `deleted_at: null`) can miss it and the write
    // raises P2002. Map that to the clean slug_in_use message rather than the
    // generic db_write_failed below.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      slugConflict = true;
    }
    // Best-effort R2 cleanup so we don't leak orphan bytes.
    try {
      await deleteObject(objectKey);
    } catch {
      /* swallowed */
    }
  }

  if (slugConflict) {
    redirect('/sell/console/products/new?error=slug_in_use');
  }
  if (!createdSlug) {
    redirect('/sell/console/products/new?error=db_write_failed');
  }
  redirect(`/sell/console?created=${encodeURIComponent(createdSlug)}`);
}

/**
 * Edit a REJECTED (or still-PENDING) product and resubmit it for moderation.
 *
 * Closes the loop opened by the seller-console rejection feedback (PR #28):
 * the seller fixes the listing and resubmits, which flips moderation_status
 * back to PENDING via lib/product-edit.updateSellerProduct. The image is
 * OPTIONAL on edit — if the seller attaches a new file we upload it and the lib
 * repoints the primary ProductImage, returning the old key so we can delete the
 * orphaned R2 object after the DB write commits. Field validation runs BEFORE
 * any R2 upload so a bad form never burns an upload.
 */
export async function updateProduct(formData: FormData): Promise<void> {
  const session = await getSellerSession();
  if (!session) redirect('/sell/sign-in');

  const seller = await prisma.seller.findUnique({
    where: { id: session.sellerId },
    select: { id: true, business_slug: true },
  });
  if (!seller) redirect('/sell/sign-in');

  const productId = String(formData.get('product_id') ?? '').trim();
  if (!productId) redirect('/sell/console');

  const editPath = `/sell/console/products/${productId}/edit`;

  // ---- form parse ----
  const input: ProductEditInput = {
    name: String(formData.get('name') ?? '').trim(),
    slug: String(formData.get('slug') ?? '').trim().toLowerCase(),
    short_description: String(formData.get('short_description') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    category_id: String(formData.get('category_id') ?? '').trim(),
    condition: String(formData.get('condition') ?? '').trim(),
    base_price: String(formData.get('base_price') ?? '').trim(),
    compare_at_price: String(formData.get('compare_at_price') ?? '').trim(),
  };

  // ---- fail fast on field errors BEFORE touching R2 ----
  const validated = validateProductInput(input);
  if (!validated.ok) {
    redirect(`${editPath}?error=${validated.reason}`);
  }

  // ---- resolve actor for audit ----
  let actorUserId: string | null = null;
  const actorClerkId = session.kind === 'clerk' ? session.clerk_user_id : null;
  if (actorClerkId) {
    const u = await prisma.user.findUnique({
      where: { clerk_id: actorClerkId },
      select: { id: true },
    });
    actorUserId = u?.id ?? null;
  }

  // ---- optional image replacement ----
  let newImageKey: string | null = null;
  const image = formData.get('image');
  if (image instanceof File && image.size > 0) {
    if (!ALLOWED_IMAGE_MIME.has(image.type)) {
      redirect(`${editPath}?error=bad_mime`);
    }
    if (image.size > MAX_IMAGE_BYTES) {
      redirect(`${editPath}?error=too_large`);
    }
    if (!IS_R2_ENABLED) {
      redirect(`${editPath}?error=r2_not_configured`);
    }
    const safeFileName = image.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    newImageKey = `products/${seller.id}/${randomUUID()}-${safeFileName}`;
    const bytes = Buffer.from(await image.arrayBuffer());
    await uploadObject({
      key: newImageKey,
      body: bytes,
      contentType: image.type,
      contentLength: image.size,
    });
  }

  // ---- apply the edit (validates + guards ownership/state inside) ----
  const result = await updateSellerProduct(prisma, {
    sellerId: seller.id,
    productId,
    input,
    actorUserId,
    actorClerkId,
    newPrimaryImageKey: newImageKey,
  });

  if (!result.ok) {
    // The DB write was refused — drop the just-uploaded replacement so we don't
    // leak orphan bytes in R2.
    if (newImageKey) {
      try {
        await deleteObject(newImageKey);
      } catch {
        /* swallowed */
      }
    }
    redirect(`${editPath}?error=${result.reason}`);
  }

  // Success: the primary image was repointed to the new key, so the previous
  // object is now orphaned — best-effort delete it.
  if (result.oldImageKey) {
    try {
      await deleteObject(result.oldImageKey);
    } catch {
      /* swallowed */
    }
  }

  redirect(`/sell/console?resubmitted=${encodeURIComponent(result.slug)}`);
}
