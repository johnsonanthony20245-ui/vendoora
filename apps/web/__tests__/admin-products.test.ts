/**
 * Tests for the T&S product moderation review — confirms reviewProduct()
 * approves/rejects against the real DB, that an approval really flips the
 * product to PUBLISHED + stamps published_at (the observable change that
 * makes the listing reach browse / search / PDP), and that the state-guarded
 * updateMany prevents two reviewers from deciding one product twice.
 *
 * Why this test cannot pass against a stub: an approve that didn't flip
 * status or stamp published_at fails the assertion on a real Product row.
 * A guard that let an already-decided product be re-decided fails the
 * already_decided assertion. A stub that always returns ok fails the
 * notes_required assertion on REJECT with empty notes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { reviewProduct } = await import('../lib/product-moderation');

const TAG = 'pmod_test_';
const createdProductIds: string[] = [];
const createdSellerIds: string[] = [];
const createdUserIds: string[] = [];
let categoryId = '';

beforeAll(async () => {
  const cat = await prisma.category.findFirst({ select: { id: true } });
  if (!cat) throw new Error('Need seeded categories. Run pnpm db:seed.');
  categoryId = cat.id;
});

async function makeDraftProduct(opts: {
  moderationStatus?: 'PENDING' | 'FLAGGED' | 'APPROVED' | 'REJECTED';
  status?: 'DRAFT' | 'PUBLISHED';
} = {}): Promise<{ productId: string }> {
  const uid = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      clerk_id: `${TAG}${uid}`,
      email: `${TAG}${uid}@vendoora.test`,
      full_name: 'Product Moderation Test',
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);

  const seller = await prisma.seller.create({
    data: {
      user_id: user.id,
      business_name: `Mod Test ${uid}`,
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

  const product = await prisma.product.create({
    data: {
      seller_id: seller.id,
      category_id: categoryId,
      name: `Mod Test Product ${uid}`,
      slug: `mod-test-${uid}`,
      description: 'A test product awaiting moderation.',
      base_price: '12.50',
      currency: 'USD',
      attributes: {},
      tags: [],
      status: opts.status ?? 'DRAFT',
      moderation_status: opts.moderationStatus ?? 'PENDING',
      inventory_count: 5,
    },
    select: { id: true },
  });
  createdProductIds.push(product.id);

  return { productId: product.id };
}

afterAll(async () => {
  // Clean up products → sellers → users this suite created. audit_log is
  // INSERT-only by Postgres trigger (DB Task 6) so we DON'T delete from it —
  // the test-tagged audit rows are intentionally allowed to accumulate in
  // the local test DB; production would never see them.
  for (const productId of createdProductIds) {
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

describe('reviewProduct — approve', () => {
  it('flips DRAFT→PUBLISHED + moderation PENDING→APPROVED + stamps published_at + audits', async () => {
    const { productId } = await makeDraftProduct();
    const before = Date.now();

    const result = await reviewProduct(prisma, {
      productId,
      decision: 'APPROVE',
      notes: 'Listing matches the photos; price reasonable.',
      reviewerUserId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.productId).toBe(productId);
      expect(result.published).toBe(true);
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.status).toBe('PUBLISHED');
    expect(product?.moderation_status).toBe('APPROVED');
    expect(product?.published_at).not.toBeNull();
    // published_at was stamped during this test (not some preexisting value).
    expect(product?.published_at?.getTime()).toBeGreaterThanOrEqual(before);

    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: productId, action: 'product.approved' },
    });
    expect(audit).not.toBeNull();
  });

  it('approves a FLAGGED product the same way (re-review path)', async () => {
    const { productId } = await makeDraftProduct({ moderationStatus: 'FLAGGED' });

    const result = await reviewProduct(prisma, {
      productId,
      decision: 'APPROVE',
      notes: 'False positive on the flag.',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(true);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.moderation_status).toBe('APPROVED');
    expect(product?.status).toBe('PUBLISHED');
  });

  it('refuses to re-decide an already-approved product', async () => {
    const { productId } = await makeDraftProduct({
      moderationStatus: 'APPROVED',
      status: 'PUBLISHED',
    });
    const result = await reviewProduct(prisma, {
      productId,
      decision: 'APPROVE',
      notes: 'n/a',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('already_decided');
  });

  it('returns not_found for a missing product', async () => {
    const result = await reviewProduct(prisma, {
      productId: 'does-not-exist',
      decision: 'APPROVE',
      notes: '',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });
});

describe('reviewProduct — reject', () => {
  it('rejects + keeps product DRAFT (so seller can edit & resubmit) + audits', async () => {
    const { productId } = await makeDraftProduct();

    const result = await reviewProduct(prisma, {
      productId,
      decision: 'REJECT',
      notes: 'Description does not match the photos — please correct.',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.published).toBe(false);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.moderation_status).toBe('REJECTED');
    expect(product?.status).toBe('DRAFT'); // NOT published
    expect(product?.published_at).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: productId, action: 'product.rejected' },
    });
    expect(audit).not.toBeNull();
  });

  it('requires at least 10 characters of review notes to reject', async () => {
    const { productId } = await makeDraftProduct();
    const result = await reviewProduct(prisma, {
      productId,
      decision: 'REJECT',
      notes: 'too short',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('notes_required');
  });

  it('refuses to re-decide an already-rejected product', async () => {
    const { productId } = await makeDraftProduct({ moderationStatus: 'REJECTED' });
    const result = await reviewProduct(prisma, {
      productId,
      decision: 'REJECT',
      notes: 'Same problem as before — would be re-decided.',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('already_decided');
  });
});

describe('reviewProduct — concurrent reviewers', () => {
  it('lets exactly one of two simultaneous reviewers win (state-guarded updateMany)', async () => {
    const { productId } = await makeDraftProduct();

    // Two reviewers race to approve the same product. The updateMany state
    // guard (moderation_status IN ['PENDING','FLAGGED']) means whichever
    // transaction commits second sees count=0 and returns already_decided.
    const [a, b] = await Promise.all([
      reviewProduct(prisma, {
        productId,
        decision: 'APPROVE',
        notes: 'Reviewer A signs off.',
        reviewerUserId: null,
      }),
      reviewProduct(prisma, {
        productId,
        decision: 'APPROVE',
        notes: 'Reviewer B signs off.',
        reviewerUserId: null,
      }),
    ]);

    const oks = [a, b].filter((r) => r.ok).length;
    const losses = [a, b].filter(
      (r) => !r.ok && r.reason === 'already_decided',
    ).length;
    expect(oks).toBe(1);
    expect(losses).toBe(1);

    // And the product is in a single coherent state.
    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.moderation_status).toBe('APPROVED');
    expect(product?.status).toBe('PUBLISHED');
  });
});
