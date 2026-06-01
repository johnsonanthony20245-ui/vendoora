import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Seller "edit & resubmit" domain logic. After T&S rejects a product the seller
 * fixes the listing and resubmits it: the edited fields are written, the
 * moderation_status flips back to PENDING (re-entering the T&S queue), the
 * product stays DRAFT (it isn't live), and a `product.resubmitted` audit row is
 * recorded for attribution.
 *
 * next/*-free + tested, same shape as lib/product-moderation.reviewProduct: the
 * Server-Action wrapper (app/actions/seller-products.updateProduct) composes the
 * seller session + R2 image upload on top.
 *
 * Only REJECTED and PENDING products are editable here. APPROVED/PUBLISHED
 * listings are live on the storefront; re-moderating a live listing is a
 * deliberately separate, larger concern and is refused with `not_editable`.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const VALID_CONDITIONS = new Set([
  'NEW',
  'LIKE_NEW',
  'USED_GOOD',
  'USED_FAIR',
  'REFURBISHED',
  'FOR_PARTS',
]);

const EDITABLE_STATUSES = ['REJECTED', 'PENDING'] as const;

type Condition = 'NEW' | 'LIKE_NEW' | 'USED_GOOD' | 'USED_FAIR' | 'REFURBISHED' | 'FOR_PARTS';

type Db = PrismaClient;

export type ProductEditFailure =
  | 'not_found'
  | 'not_owner'
  | 'not_editable'
  | 'name_required'
  | 'description_required'
  | 'bad_slug'
  | 'price_invalid'
  | 'bad_condition'
  | 'bad_category'
  | 'slug_in_use';

/** Raw field values, accepted as strings (from a form) or numbers (from tests). */
export type ProductEditInput = {
  name?: string | null;
  slug?: string | null;
  short_description?: string | null;
  description?: string | null;
  category_id?: string | null;
  condition?: string | null;
  base_price?: string | number | null;
  compare_at_price?: string | number | null;
};

export type ValidatedProductInput = {
  name: string;
  slug: string;
  short_description: string | null;
  description: string;
  category_id: string;
  condition: Condition;
  base_price: number;
  compare_at_price: number | null;
};

export type ProductEditResult =
  | { ok: true; productId: string; slug: string; oldImageKey: string | null }
  | { ok: false; reason: ProductEditFailure };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Pure, side-effect-free field validation. Shared by the action (to fail fast
 * BEFORE burning an R2 upload) and by updateSellerProduct (defense in depth so
 * the lib is correct standalone). Mirrors the validation in createProduct.
 */
export function validateProductInput(
  input: ProductEditInput,
): { ok: true; value: ValidatedProductInput } | { ok: false; reason: ProductEditFailure } {
  const name = String(input.name ?? '').trim();
  if (name.length < 3 || name.length > 200) return { ok: false, reason: 'name_required' };

  const description = String(input.description ?? '').trim();
  if (description.length < 20) return { ok: false, reason: 'description_required' };

  const rawSlug = String(input.slug ?? '').trim().toLowerCase();
  const slug = rawSlug || slugify(name);
  if (!SLUG_RE.test(slug)) return { ok: false, reason: 'bad_slug' };

  const base_price = Number(String(input.base_price ?? '').trim());
  if (!Number.isFinite(base_price) || base_price <= 0) return { ok: false, reason: 'price_invalid' };

  const compareRaw = input.compare_at_price;
  const hasCompare =
    compareRaw !== null && compareRaw !== undefined && String(compareRaw).trim() !== '';
  const compare_at_price = hasCompare ? Number(String(compareRaw).trim()) : null;
  if (compare_at_price !== null && (!Number.isFinite(compare_at_price) || compare_at_price <= 0)) {
    return { ok: false, reason: 'price_invalid' };
  }

  const condition = String(input.condition ?? '').trim();
  if (!VALID_CONDITIONS.has(condition)) return { ok: false, reason: 'bad_condition' };

  const short_description = String(input.short_description ?? '').trim() || null;
  const category_id = String(input.category_id ?? '').trim();

  return {
    ok: true,
    value: {
      name,
      slug,
      short_description,
      description,
      category_id,
      condition: condition as Condition,
      base_price,
      compare_at_price,
    },
  };
}

export async function updateSellerProduct(
  db: Db,
  args: {
    sellerId: string;
    productId: string;
    input: ProductEditInput;
    actorUserId?: string | null;
    actorClerkId?: string | null;
    /**
     * Object key of an already-uploaded replacement image. When present the
     * primary ProductImage row is repointed to it inside the transaction and
     * the previous key is returned as `oldImageKey` so the action can delete
     * the orphaned R2 object after the DB write commits.
     */
    newPrimaryImageKey?: string | null;
  },
): Promise<ProductEditResult> {
  const validated = validateProductInput(args.input);
  if (!validated.ok) return validated;
  const v = validated.value;

  const product = await db.product.findUnique({
    where: { id: args.productId },
    select: {
      id: true,
      seller_id: true,
      status: true,
      moderation_status: true,
      name: true,
      slug: true,
    },
  });
  if (!product) return { ok: false, reason: 'not_found' };
  if (product.seller_id !== args.sellerId) return { ok: false, reason: 'not_owner' };
  if (!(EDITABLE_STATUSES as readonly string[]).includes(product.moderation_status)) {
    return { ok: false, reason: 'not_editable' };
  }

  const category = await db.category.findUnique({
    where: { id: v.category_id },
    select: { id: true, is_active: true },
  });
  if (!category || !category.is_active) return { ok: false, reason: 'bad_category' };

  // Per-seller slug uniqueness, EXCLUDING this product so a seller can keep
  // their existing slug across an edit.
  const slugTaken = await db.product.findFirst({
    where: { seller_id: args.sellerId, slug: v.slug, deleted_at: null, id: { not: args.productId } },
    select: { id: true },
  });
  if (slugTaken) return { ok: false, reason: 'slug_in_use' };

  const actorUserId = args.actorUserId ?? null;
  const actorClerkId = args.actorClerkId ?? null;
  const newKey = args.newPrimaryImageKey ?? null;

  return db.$transaction(async (tx) => {
    // State-guarded so a T&S decision landing between our read and this write
    // (e.g. a reviewer approving the product) isn't clobbered by the resubmit.
    const { count } = await tx.product.updateMany({
      where: { id: args.productId, moderation_status: { in: [...EDITABLE_STATUSES] } },
      data: {
        name: v.name,
        slug: v.slug,
        short_description: v.short_description,
        description: v.description,
        category_id: v.category_id,
        condition: v.condition,
        base_price: v.base_price,
        compare_at_price: v.compare_at_price,
        moderation_status: 'PENDING',
      },
    });
    if (count === 0) return { ok: false, reason: 'not_editable' };

    let oldImageKey: string | null = null;
    if (newKey) {
      const primary = await tx.productImage.findFirst({
        where: { product_id: args.productId, is_primary: true },
        select: { id: true, url: true },
        orderBy: { display_order: 'asc' },
      });
      if (primary) {
        oldImageKey = primary.url;
        await tx.productImage.update({ where: { id: primary.id }, data: { url: newKey } });
      } else {
        await tx.productImage.create({
          data: { product_id: args.productId, url: newKey, is_primary: true, display_order: 0 },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        ...(actorUserId
          ? { actor_user_id: actorUserId, actor_system: false }
          : { actor_system: actorClerkId === null }),
        action: 'product.resubmitted',
        resource_type: 'product',
        resource_id: args.productId,
        before_state: {
          status: product.status,
          moderation_status: product.moderation_status,
          name: product.name,
          slug: product.slug,
        } satisfies Prisma.InputJsonValue,
        after_state: {
          status: product.status,
          moderation_status: 'PENDING',
          name: v.name,
          slug: v.slug,
        } satisfies Prisma.InputJsonValue,
        metadata: {
          actor_clerk_id: actorClerkId,
          image_replaced: newKey !== null,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { ok: true, productId: args.productId, slug: v.slug, oldImageKey };
  });
}
