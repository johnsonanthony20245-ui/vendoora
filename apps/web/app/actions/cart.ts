'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { prisma } from '@vendoora/db';

const CART_COOKIE = 'vdr_cart';
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Read the cart session id from the cookie, OR create a new one and set it.
 * Returns the session id so callers can query the cart.
 */
async function getOrCreateSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing) return existing;

  const fresh = `cart_${randomUUID()}`;
  jar.set(CART_COOKIE, fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: CART_COOKIE_MAX_AGE,
    path: '/',
  });
  return fresh;
}

/**
 * Read-only variant: get the session id WITHOUT creating a new one.
 * Used by display surfaces (cart count badge, cart page) so a fresh visitor
 * doesn't get a cookie set on every page load.
 */
async function getSessionIdReadOnly(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value ?? null;
}

/**
 * Find or create the Cart row for the current session id.
 * Lazy creation: empty carts are not persisted.
 */
async function findOrCreateCart(sessionId: string): Promise<{ id: string }> {
  const existing = await prisma.cart.findFirst({ where: { session_id: sessionId } });
  if (existing) return { id: existing.id };
  return prisma.cart.create({
    data: { session_id: sessionId, currency: 'USD' },
    select: { id: true },
  });
}

/**
 * Add an item to the cart. Coalesces by (product_id, variant_id) — duplicate
 * adds increment quantity instead of creating multiple rows.
 */
export async function addToCart(formData: FormData): Promise<void> {
  const productId = formData.get('productId');
  const variantIdRaw = formData.get('variantId');
  const quantityRaw = formData.get('quantity');

  if (typeof productId !== 'string' || !productId) {
    throw new Error('Missing productId');
  }
  const variantId =
    typeof variantIdRaw === 'string' && variantIdRaw.length > 0 ? variantIdRaw : null;
  const quantity = Math.max(1, Number(quantityRaw ?? 1) || 1);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      base_price: true,
      currency: true,
      status: true,
      moderation_status: true,
      deleted_at: true,
    },
  });
  if (
    !product ||
    product.status !== 'PUBLISHED' ||
    product.moderation_status !== 'APPROVED' ||
    product.deleted_at
  ) {
    throw new Error('Product not available');
  }

  const sessionId = await getOrCreateSessionId();
  const cart = await findOrCreateCart(sessionId);

  // Coalesce: if a CartItem already exists for this product+variant, bump qty.
  const existingItem = await prisma.cartItem.findFirst({
    where: {
      cart_id: cart.id,
      product_id: productId,
      variant_id: variantId,
    },
  });

  if (existingItem) {
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: existingItem.quantity + quantity },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cart_id: cart.id,
        product_id: productId,
        variant_id: variantId,
        quantity,
        price_at_add: product.base_price,
        currency: product.currency,
      },
    });
  }

  // Invalidate the cart route + every dynamic page so the header badge updates.
  revalidatePath('/cart');
  revalidatePath('/', 'layout');
}

/**
 * Remove a cart item. Only succeeds if the item's cart belongs to the
 * caller's session — prevents tampering by guessing IDs.
 */
export async function removeCartItem(formData: FormData): Promise<void> {
  const cartItemId = formData.get('cartItemId');
  if (typeof cartItemId !== 'string' || !cartItemId) return;

  const sessionId = await getSessionIdReadOnly();
  if (!sessionId) return;

  const item = await prisma.cartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: { select: { session_id: true, user_id: true } } },
  });

  if (!item || item.cart.session_id !== sessionId) {
    // Either item doesn't exist or belongs to a different session.
    return;
  }

  await prisma.cartItem.delete({ where: { id: item.id } });
  revalidatePath('/cart');
  revalidatePath('/', 'layout');
}

/**
 * Sum the cart's item quantities for the header badge.
 * Returns 0 when there's no cookie or no cart yet.
 */
export async function getCartCount(): Promise<number> {
  const sessionId = await getSessionIdReadOnly();
  if (!sessionId) return 0;

  const aggregate = await prisma.cartItem.aggregate({
    where: { cart: { session_id: sessionId } },
    _sum: { quantity: true },
  });

  return aggregate._sum.quantity ?? 0;
}
