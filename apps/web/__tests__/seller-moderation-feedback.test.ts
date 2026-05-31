/**
 * Tests for the seller-console rejection-feedback bridge.
 *
 * When T&S rejects a product, `reviewProduct` writes a `product.rejected`
 * audit row with `metadata.notes`. The seller-console UI reads those notes
 * via `getModerationFeedback(productIds)` so the seller knows what to fix.
 *
 * Why this can't pass against a stub: a stub that returns the empty map
 * fails the rendering test below; a stub that always returns "ok" without
 * the actual notes fails the "round-trip" assertion. Only a real reader of
 * `audit_log.metadata.notes` for the latest `product.rejected` row passes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { reviewProduct } = await import('../lib/product-moderation');
const { getModerationFeedback } = await import('../lib/seller-moderation-feedback');

const TAG = 'pfeedback_test_';
const createdProductIds: string[] = [];
const createdSellerIds: string[] = [];
const createdUserIds: string[] = [];
let categoryId = '';

beforeAll(async () => {
  const cat = await prisma.category.findFirst({ select: { id: true } });
  if (!cat) throw new Error('Need seeded categories. Run pnpm db:seed.');
  categoryId = cat.id;
});

async function makeDraftProduct(): Promise<{ productId: string }> {
  const uid = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      clerk_id: `${TAG}${uid}`,
      email: `${TAG}${uid}@vendoora.test`,
      full_name: 'Feedback Test',
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  const seller = await prisma.seller.create({
    data: {
      user_id: user.id,
      business_name: `Feedback ${uid}`,
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
      name: `Feedback Test Product ${uid}`,
      slug: `feedback-test-${uid}`,
      description: 'Test fixture.',
      base_price: '9.99',
      currency: 'USD',
      attributes: {},
      tags: [],
      status: 'DRAFT',
      moderation_status: 'PENDING',
      inventory_count: 5,
    },
    select: { id: true },
  });
  createdProductIds.push(product.id);
  return { productId: product.id };
}

afterAll(async () => {
  // audit_log is INSERT-only by trigger (DB Task 6) — leave the test-tagged
  // audit rows in the local DB; production never sees this prefix.
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

describe('getModerationFeedback', () => {
  it('returns the latest rejection notes for a REJECTED product', async () => {
    const { productId } = await makeDraftProduct();
    const REJECTION_NOTES =
      'Photos do not match the description — re-shoot with the actual item visible.';

    const result = await reviewProduct(prisma, {
      productId,
      decision: 'REJECT',
      notes: REJECTION_NOTES,
      reviewerUserId: null,
    });
    expect(result.ok).toBe(true);

    const feedback = await getModerationFeedback([productId]);
    const fb = feedback.get(productId);
    expect(fb).toBeDefined();
    expect(fb?.action).toBe('product.rejected');
    expect(fb?.notes).toBe(REJECTION_NOTES);
    expect(fb?.decided_at).toBeInstanceOf(Date);
  });

  it('returns the newest decision when a product was rejected twice', async () => {
    // Sellers in practice can re-submit, hit a second reviewer, and be
    // rejected again. The console should show the NEWEST rejection, not the
    // first one. Simulate by writing a manual older audit row first, then a
    // real reviewProduct rejection on top.
    const { productId } = await makeDraftProduct();
    const OLD_NOTES = 'First-round rejection notes that are now stale.';
    const NEW_NOTES = 'Newer rejection notes the seller actually needs to see.';

    // Older audit row (5s ago) — write directly so we control created_at.
    await prisma.auditLog.create({
      data: {
        actor_system: true,
        action: 'product.rejected',
        resource_type: 'product',
        resource_id: productId,
        metadata: { notes: OLD_NOTES },
        created_at: new Date(Date.now() - 5_000),
      },
    });
    // Newer rejection via the real lib (created_at = NOW).
    const result = await reviewProduct(prisma, {
      productId,
      decision: 'REJECT',
      notes: NEW_NOTES,
      reviewerUserId: null,
    });
    expect(result.ok).toBe(true);

    const feedback = await getModerationFeedback([productId]);
    expect(feedback.get(productId)?.notes).toBe(NEW_NOTES);
  });

  it('returns null notes when the rejection metadata had no notes field', async () => {
    // Defensive: if a future workflow path writes a product.rejected row
    // without a notes field, the helper should still return an entry with
    // notes:null rather than crash. The UI renders a fallback string.
    const { productId } = await makeDraftProduct();
    await prisma.auditLog.create({
      data: {
        actor_system: true,
        action: 'product.rejected',
        resource_type: 'product',
        resource_id: productId,
        metadata: {}, // no notes
      },
    });
    const feedback = await getModerationFeedback([productId]);
    expect(feedback.get(productId)?.notes).toBeNull();
  });

  it('returns nothing for products that were never rejected', async () => {
    const { productId } = await makeDraftProduct();
    // Approve, not reject.
    await reviewProduct(prisma, {
      productId,
      decision: 'APPROVE',
      notes: 'Looks good.',
      reviewerUserId: null,
    });
    const feedback = await getModerationFeedback([productId]);
    expect(feedback.get(productId)).toBeUndefined();
  });

  it('returns an empty map for an empty input (no DB round-trip required)', async () => {
    const feedback = await getModerationFeedback([]);
    expect(feedback.size).toBe(0);
  });

  it('bulk-loads many products in one query (does not N+1)', async () => {
    // Build 3 rejected products and prove the helper returns 3 entries from
    // one call. We're not directly measuring query count here (vitest can't
    // observe Prisma internals without a tap), but the contract is that the
    // function accepts an array and returns a Map — which is the API shape
    // that lets the caller render N rows from one trip.
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { productId } = await makeDraftProduct();
      await reviewProduct(prisma, {
        productId,
        decision: 'REJECT',
        notes: `Rejection #${i} — at least ten characters.`,
        reviewerUserId: null,
      });
      ids.push(productId);
    }
    const feedback = await getModerationFeedback(ids);
    expect(feedback.size).toBe(3);
    for (const id of ids) {
      expect(feedback.get(id)?.action).toBe('product.rejected');
    }
  });
});
