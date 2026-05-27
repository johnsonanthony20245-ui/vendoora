/**
 * Tests for the /sell onboarding flow.
 *
 * Step 1 + 2 are draft-cookie writes — we cover Step 3's commit path which
 * is the one that touches the database: creates Seller + KycApplication +
 * audit log inside a single $transaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const redirectCalls: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectCalls.push(url);
    throw new Error(`__redirect__:${url}`);
  },
}));

// Simulate the onboarding-draft cookie storage with an in-memory map.
const draftStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = draftStore.get(name);
      return value ? { value } : undefined;
    },
    set: (name: string, value: string) => {
      draftStore.set(name, value);
    },
    delete: (name: string) => {
      draftStore.delete(name);
    },
  }),
}));

const { prisma } = await import('@vendoora/db');
const { submitStep3 } = await import('../app/actions/seller-onboarding');

const TEST_MARKER = `onboarding_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

let phoneCounter = 0;
function setDraft(business_name: string, business_slug: string) {
  // Each invocation gets a unique phone so the User.phone @unique constraint
  // doesn't collide when the same `it()` block creates multiple sellers.
  phoneCounter += 1;
  draftStore.set(
    'vdr_sell_onb',
    JSON.stringify({
      business_name,
      business_slug,
      business_phone: `+231 77 5${String(phoneCounter).padStart(2, '0')} ${String(phoneCounter * 7 % 10000).padStart(4, '0')}`,
      business_email: `${business_slug}@vendoora.test`,
      delivery_city: 'sinkor',
    }),
  );
}

async function cleanup() {
  const sellers = await prisma.seller.findMany({
    where: { business_slug: { startsWith: TEST_MARKER } },
    select: { id: true, user_id: true },
  });
  for (const s of sellers) {
    await prisma.kycApplication.deleteMany({ where: { applicant_user_id: s.user_id } });
    await prisma.seller.delete({ where: { id: s.id } });
    await prisma.user.deleteMany({ where: { id: s.user_id } });
  }
}

beforeEach(() => {
  redirectCalls.length = 0;
  draftStore.clear();
});
afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe('submitStep3 (commit onboarding)', () => {
  it('creates a Seller + KycApplication and redirects to /sell/welcome', async () => {
    const slug = `${TEST_MARKER}-konah`;
    setDraft('Konah Test Boutique', slug);

    const fd = new FormData();
    fd.set('plan', 'GROWTH');
    await expect(submitStep3(fd)).rejects.toThrow(
      new RegExp(`__redirect__:/sell/welcome\\?slug=${slug}`),
    );

    const seller = await prisma.seller.findUnique({ where: { business_slug: slug } });
    expect(seller).not.toBeNull();
    expect(seller?.saas_plan).toBe('GROWTH');
    expect(seller?.saas_commission_rate).toBeCloseTo(0.1);
    expect(seller?.kyc_tier).toBe(1);
    expect(seller?.kyc_status).toBe('IN_REVIEW');
    expect(seller?.payout_method).toBe('MTN_MOMO');

    if (!seller) throw new Error('seller missing');
    const kyc = await prisma.kycApplication.findFirst({
      where: { applicant_user_id: seller.user_id },
    });
    expect(kyc).not.toBeNull();
    expect(kyc?.applicant_type).toBe('SELLER');
    expect(kyc?.status).toBe('SUBMITTED');
    expect(kyc?.target_tier).toBe(1);
  });

  it('writes a seller.onboarded AuditLog row', async () => {
    const slug = `${TEST_MARKER}-audit`;
    setDraft('Audit Test Shop', slug);

    const fd = new FormData();
    fd.set('plan', 'STARTER');
    await expect(submitStep3(fd)).rejects.toThrow(/__redirect__/);

    const seller = await prisma.seller.findUnique({ where: { business_slug: slug } });
    if (!seller) throw new Error('seller missing');

    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: seller.id, action: 'seller.onboarded' },
    });
    expect(audit).not.toBeNull();
  });

  it('maps each plan to the expected commission rate', async () => {
    const expected: Record<string, number> = {
      STARTER: 0.12,
      GROWTH: 0.1,
      PRO: 0.08,
      ENTERPRISE: 0.06,
    };

    for (const [plan, rate] of Object.entries(expected)) {
      const slug = `${TEST_MARKER}-${plan.toLowerCase()}`;
      setDraft(`${plan} Test Shop`, slug);

      const fd = new FormData();
      fd.set('plan', plan);
      await expect(submitStep3(fd)).rejects.toThrow(/__redirect__/);

      const seller = await prisma.seller.findUnique({ where: { business_slug: slug } });
      expect(seller?.saas_plan).toBe(plan);
      expect(seller?.saas_commission_rate).toBeCloseTo(rate);
    }
  });

  it('refuses when the draft is missing required fields', async () => {
    // No draft set.
    const fd = new FormData();
    fd.set('plan', 'STARTER');
    await expect(submitStep3(fd)).rejects.toThrow(/__redirect__:\/sell\/1/);
  });

  it('refuses invalid plan values', async () => {
    setDraft('Invalid Plan Shop', `${TEST_MARKER}-bad`);
    const fd = new FormData();
    fd.set('plan', 'PLATINUM_DIAMOND_TURBO');
    await expect(submitStep3(fd)).rejects.toThrow(/__redirect__:\/sell\/3\?error=/);
  });
});
