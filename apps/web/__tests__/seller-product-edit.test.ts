/**
 * Tests for the seller "edit & resubmit" flow — updateSellerProduct().
 *
 * After T&S rejects a product the seller sees the reviewer notes (PR #28) but,
 * until now, had no way to act on them. This closes the loop: the seller edits
 * the listing and resubmits, which flips moderation_status back to PENDING so
 * the product re-enters the T&S queue, and records a `product.resubmitted`
 * audit row attributable to the seller.
 *
 * Why these tests can't pass against a stub: the happy path asserts the real
 * Product row was mutated (new name/price) AND its moderation_status flipped to
 * PENDING AND an audit row was written. The ownership/state guards assert the
 * row is *unchanged* when refused. A no-op stub fails every mutation assertion;
 * a stub that always mutates fails every guard assertion.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { updateSellerProduct } = await import('../lib/product-edit');

const TAG = 'pedit_test_';
const createdProductIds: string[] = [];
const createdSellerIds: string[] = [];
const createdUserIds: string[] = [];
let categoryId = '';

beforeAll(async () => {
  const cat = await prisma.category.findFirst({ where: { is_active: true }, select: { id: true } });
  if (!cat) throw new Error('Need seeded categories. Run pnpm db:seed.');
  categoryId = cat.id;
});

async function makeSeller(): Promise<{ sellerId: string }> {
  const uid = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      clerk_id: `${TAG}${uid}`,
      email: `${TAG}${uid}@vendoora.test`,
      full_name: 'Seller Edit Test',
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);

  const seller = await prisma.seller.create({
    data: {
      user_id: user.id,
      business_name: `Edit Test ${uid}`,
      business_slug: `${TAG}${uid}`,
      business_email: `${TAG}${uid}@vendoora.test`,
      business_phone: '+231880000000',
      business_address: { city: 'Monrovia' },
      business_type: 'SOLE_PROPRIETOR',
      kyc_tier: 2,
      kyc_status: 'APPROVED',
      saas_plan: 'STARTER',
    },
    select: { id: true },
  });
  createdSellerIds.push(seller.id);
  return { sellerId: seller.id };
}

async function makeProduct(
  sellerId: string,
  opts: {
    moderationStatus?: 'PENDING' | 'FLAGGED' | 'APPROVED' | 'REJECTED';
    status?: 'DRAFT' | 'PUBLISHED';
    slug?: string;
    withImage?: boolean;
  } = {},
): Promise<{ productId: string }> {
  const uid = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      seller_id: sellerId,
      category_id: categoryId,
      name: `Edit Test Product ${uid}`,
      slug: opts.slug ?? `edit-test-${uid}`,
      description: 'A test product that needs an edit before it can go live.',
      base_price: '20.00',
      currency: 'USD',
      attributes: {},
      tags: [],
      condition: 'NEW',
      status: opts.status ?? 'DRAFT',
      moderation_status: opts.moderationStatus ?? 'REJECTED',
      inventory_count: 5,
    },
    select: { id: true },
  });
  createdProductIds.push(product.id);

  if (opts.withImage) {
    await prisma.productImage.create({
      data: {
        product_id: product.id,
        url: `products/${sellerId}/old-${uid}.jpg`,
        is_primary: true,
        display_order: 0,
      },
    });
  }

  return { productId: product.id };
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Refurbished Tecno Spark 10',
    slug: 'refurbished-tecno-spark-10',
    short_description: 'Clean, tested, 30-day warranty',
    description: 'A fully refurbished Tecno Spark 10 with a new battery and screen.',
    category_id: categoryId,
    condition: 'REFURBISHED',
    base_price: 95.5,
    compare_at_price: 120,
    ...overrides,
  };
}

afterAll(async () => {
  // Clean up productImages → products → sellers → users this suite created.
  // audit_log is INSERT-only by Postgres trigger (DB Task 6) so we DON'T delete
  // from it — test-tagged audit rows are allowed to accumulate locally.
  for (const productId of createdProductIds) {
    await prisma.productImage.deleteMany({ where: { product_id: productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
  }
  for (const sellerId of createdSellerIds) {
    await prisma.seller.deleteMany({ where: { id: sellerId } });
  }
  for (const userId of createdUserIds) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe('updateSellerProduct — resubmit happy path', () => {
  it('edits a REJECTED product, flips moderation REJECTED→PENDING, keeps DRAFT, audits product.resubmitted', async () => {
    const { sellerId } = await makeSeller();
    const { productId } = await makeProduct(sellerId, { moderationStatus: 'REJECTED' });

    const result = await updateSellerProduct(prisma, {
      sellerId,
      productId,
      input: validInput(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.productId).toBe(productId);
      expect(result.slug).toBe('refurbished-tecno-spark-10');
      expect(result.oldImageKey).toBeNull();
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.name).toBe('Refurbished Tecno Spark 10');
    expect(product?.slug).toBe('refurbished-tecno-spark-10');
    expect(Number(product?.base_price)).toBe(95.5);
    expect(product?.condition).toBe('REFURBISHED');
    expect(product?.moderation_status).toBe('PENDING');
    expect(product?.status).toBe('DRAFT');

    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: productId, action: 'product.resubmitted' },
    });
    expect(audit).not.toBeNull();
  });

  it('is idempotent from PENDING: stays PENDING and still records the resubmit', async () => {
    const { sellerId } = await makeSeller();
    const { productId } = await makeProduct(sellerId, { moderationStatus: 'PENDING' });

    const result = await updateSellerProduct(prisma, { sellerId, productId, input: validInput() });

    expect(result.ok).toBe(true);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.moderation_status).toBe('PENDING');
    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: productId, action: 'product.resubmitted' },
    });
    expect(audit).not.toBeNull();
  });

  it('swaps the primary image when a new key is supplied and returns the old key for cleanup', async () => {
    const { sellerId } = await makeSeller();
    const { productId } = await makeProduct(sellerId, { moderationStatus: 'REJECTED', withImage: true });
    const newKey = `products/${sellerId}/new-${randomUUID().slice(0, 8)}.jpg`;

    const result = await updateSellerProduct(prisma, {
      sellerId,
      productId,
      input: validInput(),
      newPrimaryImageKey: newKey,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.oldImageKey).toMatch(/^products\/.+\/old-/);
    }
    const image = await prisma.productImage.findFirst({
      where: { product_id: productId, is_primary: true },
    });
    expect(image?.url).toBe(newKey);
  });
});

describe('updateSellerProduct — guards', () => {
  it('refuses to edit a product owned by another seller (not_owner), leaving it unchanged', async () => {
    const { sellerId: ownerId } = await makeSeller();
    const { sellerId: intruderId } = await makeSeller();
    const { productId } = await makeProduct(ownerId, { moderationStatus: 'REJECTED' });

    const result = await updateSellerProduct(prisma, {
      sellerId: intruderId,
      productId,
      input: validInput({ name: 'Hijacked Name' }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_owner');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.name).not.toBe('Hijacked Name');
    expect(product?.moderation_status).toBe('REJECTED');
  });

  it('refuses to edit an APPROVED/PUBLISHED listing (not_editable)', async () => {
    const { sellerId } = await makeSeller();
    const { productId } = await makeProduct(sellerId, {
      moderationStatus: 'APPROVED',
      status: 'PUBLISHED',
    });

    const result = await updateSellerProduct(prisma, { sellerId, productId, input: validInput() });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_editable');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.moderation_status).toBe('APPROVED');
    expect(product?.status).toBe('PUBLISHED');
  });

  it('returns not_found for a missing product id', async () => {
    const { sellerId } = await makeSeller();
    const result = await updateSellerProduct(prisma, {
      sellerId,
      productId: randomUUID(),
      input: validInput(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });
});

describe('updateSellerProduct — validation', () => {
  it('lets a seller keep their own slug (uniqueness excludes self)', async () => {
    const { sellerId } = await makeSeller();
    const { productId } = await makeProduct(sellerId, { moderationStatus: 'REJECTED', slug: 'keep-me' });

    const result = await updateSellerProduct(prisma, {
      sellerId,
      productId,
      input: validInput({ slug: 'keep-me' }),
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a slug already used by a sibling product of the same seller (slug_in_use)', async () => {
    const { sellerId } = await makeSeller();
    await makeProduct(sellerId, { moderationStatus: 'APPROVED', status: 'PUBLISHED', slug: 'taken-slug' });
    const { productId } = await makeProduct(sellerId, { moderationStatus: 'REJECTED' });

    const result = await updateSellerProduct(prisma, {
      sellerId,
      productId,
      input: validInput({ slug: 'taken-slug' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('slug_in_use');
  });

  it('rejects a too-short description (description_required)', async () => {
    const { sellerId } = await makeSeller();
    const { productId } = await makeProduct(sellerId, { moderationStatus: 'REJECTED' });
    const result = await updateSellerProduct(prisma, {
      sellerId,
      productId,
      input: validInput({ description: 'too short' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('description_required');
  });

  it('rejects a non-positive price (price_invalid)', async () => {
    const { sellerId } = await makeSeller();
    const { productId } = await makeProduct(sellerId, { moderationStatus: 'REJECTED' });
    const result = await updateSellerProduct(prisma, {
      sellerId,
      productId,
      input: validInput({ base_price: 0 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('price_invalid');
  });
});

describe('updateSellerProduct — soft-deleted slug collision (P2002)', () => {
  it('maps a unique-constraint hit on a soft-deleted sibling slug to slug_in_use, leaving the row untouched', async () => {
    const { sellerId } = await makeSeller();

    // A soft-deleted sibling still occupies (seller_id, slug) in the DB unique
    // index — @@unique([seller_id, slug]) is NOT partial — even though the
    // app-level uniqueness check filters `deleted_at: null` and skips it. So the
    // edit slips past the app check and the DB write raises Prisma P2002, which
    // must surface as a clean `slug_in_use` rather than an unhandled 500.
    const deadSlug = `pedit-softdel-${randomUUID().slice(0, 8)}`;
    const dead = await prisma.product.create({
      data: {
        seller_id: sellerId,
        category_id: categoryId,
        name: `Soft Deleted ${deadSlug}`,
        slug: deadSlug,
        description: 'A soft-deleted product whose slug still occupies the unique index.',
        base_price: '10.00',
        currency: 'USD',
        attributes: {},
        tags: [],
        condition: 'NEW',
        status: 'DRAFT',
        moderation_status: 'REJECTED',
        inventory_count: 0,
        deleted_at: new Date(),
      },
      select: { id: true, slug: true },
    });
    createdProductIds.push(dead.id);

    const { productId } = await makeProduct(sellerId, { moderationStatus: 'REJECTED' });
    const before = await prisma.product.findUnique({ where: { id: productId } });

    const result = await updateSellerProduct(prisma, {
      sellerId,
      productId,
      input: validInput({ slug: deadSlug }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('slug_in_use');

    // The aborted transaction must leave the edited row exactly as it was — no
    // partial write of the new name/price and no flip to PENDING.
    const after = await prisma.product.findUnique({ where: { id: productId } });
    expect(after?.slug).toBe(before?.slug);
    expect(after?.name).toBe(before?.name);
    expect(after?.moderation_status).toBe('REJECTED');
  });
});
