/**
 * Integration tests for the placeOrder server action.
 *
 * Mocks next/headers cookies + next/navigation redirect so the action can
 * complete without throwing. Asserts the full transactional shape lands
 * correctly: Order + OrderItems + EscrowHolds per seller + Payment + audit.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const cookieStore = new Map<string, string>();
const SESSION = 'order_test_session';

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (key: string) => (cookieStore.has(key) ? { value: cookieStore.get(key) } : undefined),
    set: (key: string, value: string) => {
      cookieStore.set(key, value);
    },
    delete: (key: string) => {
      cookieStore.delete(key);
    },
  }),
}));

// redirect throws a Next-internal error that flows up; tests should treat
// "redirect thrown" as success and inspect the URL via the mock's call list.
const redirectCalls: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectCalls.push(url);
    throw new Error(`__redirect__:${url}`);
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import('@vendoora/db');
const { placeOrder } = await import('../app/actions/order');
const { addToCart } = await import('../app/actions/cart');

let productIdA = '';
let productIdB = '';
let sellerIdA = '';
let sellerIdB = '';

beforeAll(async () => {
  // Pick two products from DIFFERENT sellers so we exercise the per-seller
  // escrow-hold aggregation. Konah Boutique has the first 4 Fashion products
  // in the seed; Sundayma Foods has the first 4 Food products.
  const konahProducts = await prisma.product.findMany({
    where: { seller: { business_slug: 'konah-boutique' } },
    take: 1,
  });
  const sundaymaProducts = await prisma.product.findMany({
    where: { seller: { business_slug: 'sundayma-foods' } },
    take: 1,
  });
  const [pA] = konahProducts;
  const [pB] = sundaymaProducts;
  if (!pA || !pB) {
    throw new Error('Need both Konah + Sundayma products in test DB. Run pnpm db:seed.');
  }
  productIdA = pA.id;
  productIdB = pB.id;
  sellerIdA = pA.seller_id;
  sellerIdB = pB.seller_id;
});

beforeEach(async () => {
  cookieStore.clear();
  cookieStore.set('vdr_cart', SESSION);
  redirectCalls.length = 0;

  // Wipe any prior cart for this session
  await prisma.cartItem.deleteMany({ where: { cart: { session_id: SESSION } } });
  await prisma.cart.deleteMany({ where: { session_id: SESSION } });

  // Wipe orders for the test buyer email so each test starts clean.
  // Note: audit_log is INSERT-only at the DB level (Build_Prompt §10.4 +
  // trigger from slice 1). Audit entries for prior test orders accumulate
  // forever — that's the design. The resource_id is just a string, no FK,
  // so dangling references after order deletion are fine.
  const testEmail = 'order_test_buyer@vendoora.test';
  const testBuyer = await prisma.user.findUnique({ where: { email: testEmail } });
  if (testBuyer) {
    const orders = await prisma.order.findMany({ where: { buyer_user_id: testBuyer.id } });
    for (const o of orders) {
      await prisma.escrowStateTransition.deleteMany({ where: { escrow_hold: { order_id: o.id } } });
      await prisma.escrowHold.deleteMany({ where: { order_id: o.id } });
      await prisma.payment.deleteMany({ where: { order_id: o.id } });
      await prisma.orderStatusHistory.deleteMany({ where: { order_id: o.id } });
      await prisma.orderItem.deleteMany({ where: { order_id: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeFormData(): FormData {
  const fd = new FormData();
  fd.set('buyer_name', 'Test Buyer');
  fd.set('buyer_email', 'order_test_buyer@vendoora.test');
  fd.set('buyer_phone', '');
  fd.set('delivery_street', '5 Test St');
  fd.set('delivery_city', 'Monrovia');
  fd.set('delivery_county', 'Montserrado');
  fd.set('delivery_country', 'LR');
  fd.set('delivery_zone', 'sinkor');
  fd.set('delivery_notes', '');
  fd.set('payment_method', 'MTN_MOMO');
  return fd;
}

async function addProductToCart(productId: string, quantity: number) {
  const fd = new FormData();
  fd.set('productId', productId);
  fd.set('quantity', String(quantity));
  await addToCart(fd);
}

describe('placeOrder server action', () => {
  it('redirects to /checkout?error= when the cart is empty', async () => {
    await expect(placeOrder(makeFormData())).rejects.toThrow(/__redirect__:\/checkout\?error=/);
    expect(redirectCalls[0]).toMatch(/\/checkout\?error=/);
  });

  it('creates Order with status=PAID + correct line items + per-seller EscrowHolds', async () => {
    await addProductToCart(productIdA, 2);
    await addProductToCart(productIdB, 1);

    await expect(placeOrder(makeFormData())).rejects.toThrow(/__redirect__:\/order-confirmation\//);

    const firstRedirect = redirectCalls[0];
    expect(firstRedirect).toMatch(/\/order-confirmation\/VDR-/);
    const segments = (firstRedirect ?? '').split('/');
    const orderNumber = segments[segments.length - 1] ?? '';

    const order = await prisma.order.findUnique({
      where: { order_number: orderNumber },
      include: { items: true, escrow_holds: true },
    });
    expect(order).not.toBeNull();
    if (!order) return;

    expect(order.status).toBe('PAID');
    expect(order.payment_status).toBe('CAPTURED');
    expect(order.items).toHaveLength(2);

    // Two distinct sellers → two escrow holds
    const sellerBeneficiaries = order.escrow_holds
      .filter((h) => h.beneficiary_type === 'SELLER')
      .map((h) => h.beneficiary_seller_id)
      .sort();
    expect(sellerBeneficiaries).toEqual([sellerIdA, sellerIdB].sort());
    for (const hold of order.escrow_holds) {
      expect(hold.state).toBe('HELD');
    }

    // Payment row
    const payment = await prisma.payment.findUnique({ where: { order_id: order.id } });
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe('CAPTURED');

    // Status history captures the transition
    const history = await prisma.orderStatusHistory.findMany({ where: { order_id: order.id } });
    expect(history).toHaveLength(1);
    expect(history[0]?.from_status).toBe('PENDING_PAYMENT');
    expect(history[0]?.to_status).toBe('PAID');

    // Audit log entry
    const audit = await prisma.auditLog.findMany({
      where: { resource_id: order.id, action: 'order.placed' },
    });
    expect(audit).toHaveLength(1);

    // delivery_code_hash is set (bcrypt format starts with $2)
    expect(order.delivery_code_hash).toMatch(/^\$2[aby]\$/);

    // Cart deleted
    const remainingCart = await prisma.cart.findFirst({ where: { session_id: SESSION } });
    expect(remainingCart).toBeNull();
  });

  it('coalesces same-seller items into a single EscrowHold per seller', async () => {
    // Add two Konah products + one Sundayma product
    const konahProducts = await prisma.product.findMany({
      where: { seller: { business_slug: 'konah-boutique' } },
      take: 2,
    });
    const [k1, k2] = konahProducts;
    if (!k1 || !k2) throw new Error('Need 2 Konah products in test DB');

    await addProductToCart(k1.id, 1);
    await addProductToCart(k2.id, 1);
    await addProductToCart(productIdB, 1);

    await expect(placeOrder(makeFormData())).rejects.toThrow(/__redirect__:\/order-confirmation\//);
    const firstRedirect = redirectCalls[0] ?? '';
    const segments = firstRedirect.split('/');
    const orderNumber = segments[segments.length - 1] ?? '';

    const order = await prisma.order.findUnique({
      where: { order_number: orderNumber },
      include: { escrow_holds: true },
    });
    if (!order) throw new Error('Order missing after placeOrder');

    // 3 items but only 2 sellers → 2 escrow holds
    const holds = order.escrow_holds.filter((h) => h.beneficiary_type === 'SELLER');
    expect(holds).toHaveLength(2);
  });

  it('clears the vdr_cart cookie and sets a one-time delivery-code cookie', async () => {
    await addProductToCart(productIdA, 1);

    await expect(placeOrder(makeFormData())).rejects.toThrow(/__redirect__:\/order-confirmation\//);
    const firstRedirect = redirectCalls[0] ?? '';
    const segments = firstRedirect.split('/');
    const orderNumber = segments[segments.length - 1] ?? '';

    expect(cookieStore.has('vdr_cart')).toBe(false);
    expect(cookieStore.get(`vdr_dc_${orderNumber}`)).toMatch(/^\d{6}$/);
  });
});
