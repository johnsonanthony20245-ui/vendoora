/**
 * Tests for the KYC admin review — confirms reviewKycApplication() approves /
 * denies against the real DB and that an approval really promotes the seller's
 * KYC tier (the observable tier change browse/search/PDP read).
 *
 * Cannot pass against a stub: an approve that didn't write the seller tier, or
 * a guard that let an already-decided application be re-decided, fails here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { reviewKycApplication } = await import('../lib/kyc');

const TAG = 'kyc_test_';
const createdUserIds: string[] = [];

async function makeSellerWithApplication(opts: {
  targetTier: number;
  appStatus?: 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED';
}) {
  const uid = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      clerk_id: `${TAG}${uid}`,
      email: `${TAG}${uid}@vendoora.test`,
      full_name: 'KYC Test Seller',
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);

  await prisma.seller.create({
    data: {
      user_id: user.id,
      business_name: `KYC Test ${uid}`,
      business_slug: `kyc-test-${uid}`,
      business_email: `${TAG}${uid}@vendoora.test`,
      business_phone: '+231880000000',
      business_address: { city: 'Monrovia' },
      business_type: 'SOLE_PROPRIETOR',
      kyc_tier: 1,
      kyc_status: 'IN_REVIEW',
    },
  });

  const app = await prisma.kycApplication.create({
    data: {
      applicant_type: 'SELLER',
      applicant_user_id: user.id,
      target_tier: opts.targetTier,
      current_tier: 1,
      status: opts.appStatus ?? 'SUBMITTED',
      submitted_at: new Date(),
    },
    select: { id: true },
  });

  return { userId: user.id, applicationId: app.id };
}

beforeAll(async () => {
  // sanity: DB reachable
  await prisma.user.count();
});

afterAll(async () => {
  // Clean up everything this suite created (apps → sellers → users).
  for (const userId of createdUserIds) {
    await prisma.kycApplication.deleteMany({ where: { applicant_user_id: userId } });
    await prisma.seller.deleteMany({ where: { user_id: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe('reviewKycApplication — approve', () => {
  it('promotes the seller tier + flips statuses + writes an audit row', async () => {
    const { userId, applicationId } = await makeSellerWithApplication({ targetTier: 2 });

    const result = await reviewKycApplication(prisma, {
      applicationId,
      decision: 'APPROVE',
      notes: 'Documents verified against the business registry.',
      reviewerUserId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newTier).toBe(2);
      expect(result.sellerId).not.toBeNull();
    }

    const seller = await prisma.seller.findUnique({ where: { user_id: userId } });
    expect(seller?.kyc_tier).toBe(2);
    expect(seller?.kyc_status).toBe('APPROVED');
    expect(seller?.kyc_tier_promoted_at).not.toBeNull();

    const app = await prisma.kycApplication.findUnique({ where: { id: applicationId } });
    expect(app?.status).toBe('APPROVED');
    expect(app?.current_tier).toBe(2);
    expect(app?.review_completed_at).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: applicationId, action: 'kyc.approved' },
    });
    expect(audit).not.toBeNull();
  });

  it('refuses to re-decide an already-approved application', async () => {
    const { applicationId } = await makeSellerWithApplication({
      targetTier: 2,
      appStatus: 'APPROVED',
    });
    const result = await reviewKycApplication(prisma, {
      applicationId,
      decision: 'APPROVE',
      notes: 'n/a',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('already_decided');
  });

  it('returns not_found for a missing application', async () => {
    const result = await reviewKycApplication(prisma, {
      applicationId: 'does-not-exist',
      decision: 'APPROVE',
      notes: '',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });
});

describe('reviewKycApplication — deny', () => {
  it('denies the application + marks the seller REJECTED + audits, leaving tier unchanged', async () => {
    const { userId, applicationId } = await makeSellerWithApplication({ targetTier: 2 });

    const result = await reviewKycApplication(prisma, {
      applicationId,
      decision: 'DENY',
      notes: 'Business registration document was illegible — resubmit.',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(true);

    const seller = await prisma.seller.findUnique({ where: { user_id: userId } });
    expect(seller?.kyc_status).toBe('REJECTED');
    expect(seller?.kyc_tier).toBe(1); // not promoted

    const app = await prisma.kycApplication.findUnique({ where: { id: applicationId } });
    expect(app?.status).toBe('DENIED');

    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: applicationId, action: 'kyc.denied' },
    });
    expect(audit).not.toBeNull();
  });

  it('requires review notes to deny', async () => {
    const { applicationId } = await makeSellerWithApplication({ targetTier: 2 });
    const result = await reviewKycApplication(prisma, {
      applicationId,
      decision: 'DENY',
      notes: 'too short',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('notes_required');
  });
});

describe('reviewKycApplication — tier integrity', () => {
  it('approving a lower-tier application never downgrades an already-higher seller', async () => {
    const { userId, applicationId } = await makeSellerWithApplication({ targetTier: 1 });
    // Seller has already advanced to tier 3 / APPROVED via a prior application.
    await prisma.seller.update({
      where: { user_id: userId },
      data: { kyc_tier: 3, kyc_status: 'APPROVED' },
    });

    const result = await reviewKycApplication(prisma, {
      applicationId,
      decision: 'APPROVE',
      notes: 'stale low-tier application',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newTier).toBe(3); // max(3, 1), not 1

    const seller = await prisma.seller.findUnique({ where: { user_id: userId } });
    expect(seller?.kyc_tier).toBe(3); // NOT downgraded to 1
    expect(seller?.kyc_status).toBe('APPROVED');
  });

  it('denying an upgrade leaves an already-approved seller approved (no clobber)', async () => {
    const { userId, applicationId } = await makeSellerWithApplication({ targetTier: 3 });
    // Seller is already approved at tier 2; this is an upgrade request to 3.
    await prisma.seller.update({
      where: { user_id: userId },
      data: { kyc_tier: 2, kyc_status: 'APPROVED' },
    });

    const result = await reviewKycApplication(prisma, {
      applicationId,
      decision: 'DENY',
      notes: 'Tier 3 requires a physical shop visit — not yet completed.',
      reviewerUserId: null,
    });
    expect(result.ok).toBe(true);

    const seller = await prisma.seller.findUnique({ where: { user_id: userId } });
    expect(seller?.kyc_status).toBe('APPROVED'); // NOT clobbered to REJECTED
    expect(seller?.kyc_tier).toBe(2); // still their verified tier

    const app = await prisma.kycApplication.findUnique({ where: { id: applicationId } });
    expect(app?.status).toBe('DENIED'); // the upgrade itself is denied
  });
});
