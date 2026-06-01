/**
 * Authenticated checkout identity (lib/order.ts: buildPendingOrder).
 *
 * Clerk owns auth; Vendoora owns the User row (joined on clerk_id). The bug this
 * locks down: checkout used to resolve the buyer purely from the form email, so
 * a signed-in buyer who typed a different contact email had their order forked
 * onto an orphan guest_ row instead of their own account — and a guest could
 * attach an order to any account by typing its email.
 *
 * New contract: when the caller passes an authenticated buyerUserId, that id is
 * authoritative for attribution (Order.buyer_user_id), regardless of the form
 * email. The contact fields (name/email/phone) still reflect what was entered.
 * Guest checkout (no buyerUserId) is unchanged: email find-or-create a guest_.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { buildPendingOrder, GuestEmailBelongsToAccountError } = await import('../lib/order');
import type { OrderDraft } from '../lib/order';

// A signed-in account (Clerk-synced) and a DIFFERENT email typed at checkout.
const ACCOUNT_CLERK_ID = 'user_authcheckout_account_test';
const ACCOUNT_EMAIL = 'auth.checkout.account@vendoora.test';
// Unique per test run: the contact email a signed-in buyer types that differs from
// their account email. The authoritative path must never create a guest_ for it; a
// per-run address keeps the "no orphan guest_" assertion hermetic.
const FORM_EMAIL = `auth.checkout.form.${randomUUID()}@vendoora.test`;
const GUEST_EMAIL = 'auth.checkout.guest@vendoora.test';
// Exercised in both lower- and upper-case to prove citext treats them as one identity.
const CASE_GUEST_EMAIL = 'auth.checkout.caseguest@vendoora.test';

let productId = '';
let sellerId = '';
let basePrice = 0;
let commissionRate = 0;
let accountUserId = '';

beforeAll(async () => {
  const product = await prisma.product.findFirst({
    where: { seller: { business_slug: 'konah-boutique' } },
    include: { seller: { select: { id: true, saas_commission_rate: true } } },
  });
  if (!product) throw new Error('Need konah-boutique products in test DB. Run pnpm db:seed.');
  productId = product.id;
  sellerId = product.seller.id;
  basePrice = Number(product.base_price);
  commissionRate = product.seller.saas_commission_rate;

  // Stable account row (never deleted — audit logs reference it INSERT-only).
  const account = await prisma.user.upsert({
    where: { clerk_id: ACCOUNT_CLERK_ID },
    update: {},
    create: {
      clerk_id: ACCOUNT_CLERK_ID,
      email: ACCOUNT_EMAIL,
      full_name: 'Account Owner',
      is_email_verified: true,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  accountUserId = account.id;
});

// Reset this suite's data between tests: delete the test buyers' orders (+ payment and
// order-item children) and any guest_ user rows for these emails. The list passes
// explicit case-variants (e.g. FOO@ and foo@) so a leftover case-variant guest from a
// byte-exact (pre-citext) run is cleared too — otherwise it would collide with the
// case-insensitive citext unique index on a later migrate. The stable account row (a
// non-guest clerk_id) is never deleted; audit_log.actor_user_id has no FK to users, so
// removing guest rows is safe.
async function purgeTestData(emails: string[]): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, clerk_id: true },
  });
  const buyerIds = [accountUserId, ...users.map((u) => u.id)];
  const orders = await prisma.order.findMany({
    where: { buyer_user_id: { in: buyerIds } },
    select: { id: true },
  });
  for (const o of orders) {
    await prisma.payment.deleteMany({ where: { order_id: o.id } });
    await prisma.orderItem.deleteMany({ where: { order_id: o.id } });
    await prisma.order.delete({ where: { id: o.id } });
  }
  const guestIds = users.filter((u) => u.clerk_id.startsWith('guest_')).map((u) => u.id);
  if (guestIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: guestIds } } });
  }
}

const PURGE_EMAILS = [
  ACCOUNT_EMAIL,
  ACCOUNT_EMAIL.toUpperCase(),
  FORM_EMAIL,
  GUEST_EMAIL,
  CASE_GUEST_EMAIL,
  CASE_GUEST_EMAIL.toUpperCase(),
];

beforeEach(async () => {
  await purgeTestData(PURGE_EMAILS);
});

// Also purge AFTER each test so a case-variant guest a byte-exact (pre-citext) run
// created can't linger and collide with the citext unique index on a later migrate.
afterEach(async () => {
  await purgeTestData(PURGE_EMAILS);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeDraft(email: string): OrderDraft {
  const quantity = 1;
  const subtotal = basePrice * quantity;
  const commission_amount = Number((subtotal * commissionRate).toFixed(2));
  const seller_net = Number((subtotal - commission_amount).toFixed(2));
  return {
    cartId: 'unused-in-build',
    buyer: { name: 'Contact Person', email, phone: null },
    delivery: { street: '1 Test St', city: 'Monrovia', county: 'Montserrado', country: 'LR', zone: 'sinkor', notes: null },
    paymentMethod: 'CARD',
    items: [
      {
        product_id: productId,
        variant_id: null,
        seller_id: sellerId,
        product_snapshot: { name: 'Test', slug: 'test' },
        quantity,
        unit_price: basePrice,
        subtotal,
        commission_rate: commissionRate,
        commission_amount,
        seller_net,
      },
    ],
    subtotal,
    shippingFee: 3,
    totalAmount: subtotal + 3,
    currency: 'USD',
  };
}

describe('buildPendingOrder — authenticated buyer is authoritative', () => {
  it('attributes the order to the signed-in account even when the form email differs', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft(FORM_EMAIL), {
      buyerUserId: accountUserId,
    });

    expect(pending.buyerUserId).toBe(accountUserId);

    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    // Attribution is the account, not an email-derived guest.
    expect(order?.buyer_user_id).toBe(accountUserId);
    // Contact fields still reflect what was entered on the form.
    expect(order?.buyer_email).toBe(FORM_EMAIL);
  });

  it('does not spawn an orphan guest_ user for the form email', async () => {
    await buildPendingOrder(prisma, makeDraft(FORM_EMAIL), { buyerUserId: accountUserId });

    const orphan = await prisma.user.findUnique({ where: { email: FORM_EMAIL } });
    expect(orphan).toBeNull();
  });

  it('attributes both orders to the same account when the buyer checks out twice', async () => {
    // The authoritative path must be stable across repeat checkouts, not just on
    // first sight: two orders by the same signed-in buyer both attach to that one
    // account, and no guest_ rows are minted along the way.
    const first = await buildPendingOrder(prisma, makeDraft(FORM_EMAIL), {
      buyerUserId: accountUserId,
    });
    const second = await buildPendingOrder(prisma, makeDraft(FORM_EMAIL), {
      buyerUserId: accountUserId,
    });

    expect(first.orderId).not.toBe(second.orderId);
    const [o1, o2] = await Promise.all([
      prisma.order.findUnique({ where: { id: first.orderId } }),
      prisma.order.findUnique({ where: { id: second.orderId } }),
    ]);
    expect(o1?.buyer_user_id).toBe(accountUserId);
    expect(o2?.buyer_user_id).toBe(accountUserId);

    const orphan = await prisma.user.findUnique({ where: { email: FORM_EMAIL } });
    expect(orphan).toBeNull();
  });
});

describe('buildPendingOrder — guest checkout unchanged', () => {
  it('find-or-creates a guest_ user from the form email when no account is passed', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft(GUEST_EMAIL));

    const guest = await prisma.user.findUnique({ where: { email: GUEST_EMAIL } });
    expect(guest).not.toBeNull();
    expect(guest?.clerk_id).toMatch(/^guest_/);

    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    expect(order?.buyer_user_id).toBe(guest?.id);
  });

  it('reuses the same guest_ user across repeat guest checkouts with that email', async () => {
    const first = await buildPendingOrder(prisma, makeDraft(GUEST_EMAIL));
    const second = await buildPendingOrder(prisma, makeDraft(GUEST_EMAIL));

    const guest = await prisma.user.findUnique({ where: { email: GUEST_EMAIL } });
    const [o1, o2] = await Promise.all([
      prisma.order.findUnique({ where: { id: first.orderId } }),
      prisma.order.findUnique({ where: { id: second.orderId } }),
    ]);
    expect(o1?.buyer_user_id).toBe(guest?.id);
    expect(o2?.buyer_user_id).toBe(guest?.id);
    expect(o1?.buyer_user_id).toBe(o2?.buyer_user_id);

    // Exactly one guest row for the email — the second checkout minted nothing new.
    const guestCount = await prisma.user.count({ where: { email: GUEST_EMAIL } });
    expect(guestCount).toBe(1);
  });
});

describe('buildPendingOrder — guest cannot attach to a real account by email', () => {
  it('rejects a guest checkout whose contact email belongs to a registered account', async () => {
    // An unauthenticated guest typing a real account's email must not be able to
    // fork an order onto that account. User.email is unique, so we cannot mint a
    // guest_ row for it either — the only safe answer is to refuse and require
    // sign-in. (The account owner, signed in, checks out via the buyerUserId path.)
    await expect(buildPendingOrder(prisma, makeDraft(ACCOUNT_EMAIL))).rejects.toBeInstanceOf(
      GuestEmailBelongsToAccountError,
    );

    // Nothing was attributed to the account through the guest path.
    const orders = await prisma.order.findMany({ where: { buyer_user_id: accountUserId } });
    expect(orders).toHaveLength(0);
  });
});

describe('buildPendingOrder — email identity is case-insensitive (citext)', () => {
  it('blocks a guest whose email is a case-variant of a registered account', async () => {
    // `AUTH...@VENDOORA.TEST` must be recognised as the account `auth...@vendoora.test`:
    // the guard fires and no order is created. (Fails on byte-exact email matching;
    // citext makes findUnique-by-email case-insensitive and closes it.)
    await expect(
      buildPendingOrder(prisma, makeDraft(ACCOUNT_EMAIL.toUpperCase())),
    ).rejects.toBeInstanceOf(GuestEmailBelongsToAccountError);

    const orders = await prisma.order.findMany({ where: { buyer_user_id: accountUserId } });
    expect(orders).toHaveLength(0);
  });

  it('treats case-variant guest emails as one identity (no duplicate rows)', async () => {
    const first = await buildPendingOrder(prisma, makeDraft(CASE_GUEST_EMAIL));
    const second = await buildPendingOrder(prisma, makeDraft(CASE_GUEST_EMAIL.toUpperCase()));

    const [o1, o2] = await Promise.all([
      prisma.order.findUnique({ where: { id: first.orderId } }),
      prisma.order.findUnique({ where: { id: second.orderId } }),
    ]);
    // Both checkouts resolve to one guest identity, regardless of case.
    expect(o1?.buyer_user_id).toBe(o2?.buyer_user_id);

    // And only one row exists for the email across both cases — no drift.
    const rows = await prisma.user.count({
      where: { email: { in: [CASE_GUEST_EMAIL, CASE_GUEST_EMAIL.toUpperCase()] } },
    });
    expect(rows).toBe(1);
  });
});
