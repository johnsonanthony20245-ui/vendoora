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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { buildPendingOrder } = await import('../lib/order');
import type { OrderDraft } from '../lib/order';

// A signed-in account (Clerk-synced) and a DIFFERENT email typed at checkout.
const ACCOUNT_CLERK_ID = 'user_authcheckout_account_test';
const ACCOUNT_EMAIL = 'auth.checkout.account@vendoora.test';
// Unique per test run. This is the contact email a signed-in buyer types that
// differs from their account email. The authoritative path must never create a
// guest_ for it. Why a fresh address each run: this suite's purge deletes orders
// but deliberately never deletes users (audit_log rows reference actor_user_id
// and the table is INSERT-only, so we keep the referenced users around). A guest_
// row that a prior buggy run created therefore lingers and would poison a fixed
// FORM_EMAIL's findUnique-by-email — a per-run address keeps the "no orphan
// guest_" assertion hermetic against those lingering rows.
const FORM_EMAIL = `auth.checkout.form.${randomUUID()}@vendoora.test`;
const GUEST_EMAIL = 'auth.checkout.guest@vendoora.test';

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

async function purgeOrdersForEmails(emails: string[]): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
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
}

beforeEach(async () => {
  await purgeOrdersForEmails([ACCOUNT_EMAIL, FORM_EMAIL, GUEST_EMAIL]);
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
});
