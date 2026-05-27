/**
 * Integration tests for cart server actions.
 *
 * Bypass next/headers by mocking cookies() to a fixed session id.
 * Actions then talk to the real test DB via @vendoora/db.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const cookieStore = new Map<string, string>();
const FIXED_SESSION = 'cart_test_fixed_session_id';

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (key: string) =>
      cookieStore.has(key) ? { value: cookieStore.get(key) } : undefined,
    set: (key: string, value: string) => {
      cookieStore.set(key, value);
    },
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const { prisma } = await import('@vendoora/db');
const { addToCart, removeCartItem, getCartCount, updateCartItemQuantity } = await import('../app/actions/cart');

let testProductId = '';
let testProductIdAlt = '';

beforeAll(async () => {
  const products = await prisma.product.findMany({
    where: { status: 'PUBLISHED', moderation_status: 'APPROVED' },
    take: 2,
    orderBy: { created_at: 'asc' },
  });
  const [p1, p2] = products;
  if (!p1 || !p2) {
    throw new Error(
      'Need at least 2 seeded products in vendoora_test. Run `pnpm db:seed` against the test DB first.',
    );
  }
  testProductId = p1.id;
  testProductIdAlt = p2.id;
});

beforeEach(async () => {
  cookieStore.clear();
  cookieStore.set('vdr_cart', FIXED_SESSION);
  await prisma.cartItem.deleteMany({
    where: { cart: { session_id: FIXED_SESSION } },
  });
  await prisma.cart.deleteMany({ where: { session_id: FIXED_SESSION } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('cart server actions', () => {
  it('addToCart creates a Cart + CartItem for a fresh session', async () => {
    const fd = new FormData();
    fd.set('productId', testProductId);
    fd.set('quantity', '1');

    await addToCart(fd);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    expect(cart).not.toBeNull();
    if (!cart) return; // type narrow for TS

    const items = await prisma.cartItem.findMany({ where: { cart_id: cart.id } });
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item?.product_id).toBe(testProductId);
    expect(item?.quantity).toBe(1);
  });

  it('addToCart coalesces same product+variant into a single row with summed quantity', async () => {
    const fd1 = new FormData();
    fd1.set('productId', testProductId);
    fd1.set('quantity', '2');
    await addToCart(fd1);

    const fd2 = new FormData();
    fd2.set('productId', testProductId);
    fd2.set('quantity', '3');
    await addToCart(fd2);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    if (!cart) throw new Error('Cart not found after addToCart');
    const items = await prisma.cartItem.findMany({ where: { cart_id: cart.id } });
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(5);
  });

  it('addToCart with different products creates separate rows', async () => {
    const fd1 = new FormData();
    fd1.set('productId', testProductId);
    fd1.set('quantity', '1');
    await addToCart(fd1);

    const fd2 = new FormData();
    fd2.set('productId', testProductIdAlt);
    fd2.set('quantity', '1');
    await addToCart(fd2);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    if (!cart) throw new Error('Cart not found after addToCart');
    const items = await prisma.cartItem.findMany({ where: { cart_id: cart.id } });
    expect(items).toHaveLength(2);
  });

  it('getCartCount returns 0 when no cookie/cart, sums quantities when populated', async () => {
    cookieStore.clear();
    expect(await getCartCount()).toBe(0);

    cookieStore.set('vdr_cart', FIXED_SESSION);
    const fd = new FormData();
    fd.set('productId', testProductId);
    fd.set('quantity', '3');
    await addToCart(fd);

    expect(await getCartCount()).toBe(3);
  });

  it('removeCartItem deletes the item when session owns the cart', async () => {
    const fd = new FormData();
    fd.set('productId', testProductId);
    fd.set('quantity', '1');
    await addToCart(fd);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    if (!cart) throw new Error('Cart not found after addToCart');
    const item = await prisma.cartItem.findFirst({ where: { cart_id: cart.id } });
    if (!item) throw new Error('CartItem not found after addToCart');

    const removeFd = new FormData();
    removeFd.set('cartItemId', item.id);
    await removeCartItem(removeFd);

    const remaining = await prisma.cartItem.findMany({ where: { cart_id: cart.id } });
    expect(remaining).toHaveLength(0);
  });

  it('removeCartItem ignores a request from a different session', async () => {
    const fd = new FormData();
    fd.set('productId', testProductId);
    fd.set('quantity', '1');
    await addToCart(fd);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    if (!cart) throw new Error('Cart not found after addToCart');
    const item = await prisma.cartItem.findFirst({ where: { cart_id: cart.id } });
    if (!item) throw new Error('CartItem not found after addToCart');

    cookieStore.set('vdr_cart', 'attacker_session');

    const removeFd = new FormData();
    removeFd.set('cartItemId', item.id);
    await removeCartItem(removeFd);

    const stillThere = await prisma.cartItem.findUnique({ where: { id: item.id } });
    expect(stillThere).not.toBeNull();
  });

  it('updateCartItemQuantity +1 increments the quantity', async () => {
    const fd = new FormData();
    fd.set('productId', testProductId);
    fd.set('quantity', '2');
    await addToCart(fd);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    if (!cart) throw new Error('Cart not found after addToCart');
    const item = await prisma.cartItem.findFirst({ where: { cart_id: cart.id } });
    if (!item) throw new Error('CartItem not found');

    const incFd = new FormData();
    incFd.set('cartItemId', item.id);
    incFd.set('delta', '1');
    await updateCartItemQuantity(incFd);

    const after = await prisma.cartItem.findUnique({ where: { id: item.id } });
    expect(after?.quantity).toBe(3);
  });

  it('updateCartItemQuantity -1 decrements; reaching 0 deletes the row', async () => {
    const fd = new FormData();
    fd.set('productId', testProductId);
    fd.set('quantity', '2');
    await addToCart(fd);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    if (!cart) throw new Error('Cart not found');
    const item = await prisma.cartItem.findFirst({ where: { cart_id: cart.id } });
    if (!item) throw new Error('CartItem not found');

    // 2 -> 1
    const dec1 = new FormData();
    dec1.set('cartItemId', item.id);
    dec1.set('delta', '-1');
    await updateCartItemQuantity(dec1);
    expect((await prisma.cartItem.findUnique({ where: { id: item.id } }))?.quantity).toBe(1);

    // 1 -> 0 -> deleted
    const dec2 = new FormData();
    dec2.set('cartItemId', item.id);
    dec2.set('delta', '-1');
    await updateCartItemQuantity(dec2);
    expect(await prisma.cartItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it('updateCartItemQuantity caps at 99', async () => {
    const fd = new FormData();
    fd.set('productId', testProductId);
    fd.set('quantity', '90');
    await addToCart(fd);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    if (!cart) throw new Error('Cart not found');
    const item = await prisma.cartItem.findFirst({ where: { cart_id: cart.id } });
    if (!item) throw new Error('CartItem not found');

    const incFd = new FormData();
    incFd.set('cartItemId', item.id);
    incFd.set('delta', '50');
    await updateCartItemQuantity(incFd);

    const after = await prisma.cartItem.findUnique({ where: { id: item.id } });
    expect(after?.quantity).toBe(99);
  });

  it('updateCartItemQuantity ignores requests from a different session', async () => {
    const fd = new FormData();
    fd.set('productId', testProductId);
    fd.set('quantity', '2');
    await addToCart(fd);

    const cart = await prisma.cart.findFirst({ where: { session_id: FIXED_SESSION } });
    if (!cart) throw new Error('Cart not found');
    const item = await prisma.cartItem.findFirst({ where: { cart_id: cart.id } });
    if (!item) throw new Error('CartItem not found');

    cookieStore.set('vdr_cart', 'attacker_session');
    const incFd = new FormData();
    incFd.set('cartItemId', item.id);
    incFd.set('delta', '1');
    await updateCartItemQuantity(incFd);

    const after = await prisma.cartItem.findUnique({ where: { id: item.id } });
    expect(after?.quantity).toBe(2); // unchanged
  });
});
