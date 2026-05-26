import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { prisma } from '@vendoora/db';
import { removeCartItem } from '../actions/cart';
import { ConditionPill, KycTierBadge } from '../../components/TrustPills';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const jar = await cookies();
  const sessionId = jar.get('vdr_cart')?.value ?? null;

  const cart = sessionId
    ? await prisma.cart.findFirst({
        where: { session_id: sessionId },
        include: {
          items: {
            include: {
              cart: false,
            },
          },
        },
      })
    : null;

  // For each cart item, load the associated product + variant + seller for display.
  const itemRows = cart
    ? await Promise.all(
        cart.items.map(async (item) => {
          const product = await prisma.product.findUnique({
            where: { id: item.product_id },
            include: {
              seller: { select: { business_slug: true, business_name: true, kyc_tier: true } },
              images: { where: { is_primary: true }, take: 1 },
            },
          });
          const variant = item.variant_id
            ? await prisma.productVariant.findUnique({ where: { id: item.variant_id } })
            : null;
          return { item, product, variant };
        }),
      )
    : [];

  // Filter out items whose product or seller disappeared (defensive — shouldn't happen but cheap to handle).
  const rows = itemRows.filter((r) => r.product !== null);

  const subtotal = rows.reduce((sum, r) => {
    const price = Number(r.item.price_at_add);
    return sum + price * r.item.quantity;
  }, 0);

  const itemCount = rows.reduce((sum, r) => sum + r.item.quantity, 0);

  return (
    <main className="bg-neutral-50 min-h-screen">
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold text-neutral-900 md:text-4xl">Your cart</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {itemCount === 0
              ? 'Nothing in your cart yet.'
              : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · escrow-protected on checkout`}
          </p>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center">
              <p className="text-neutral-700">Your cart is empty.</p>
              <Link
                href="/"
                className="mt-4 inline-block rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
              >
                Browse categories
              </Link>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
              {/* Items list */}
              <ul className="space-y-4">
                {rows.map(({ item, product, variant }) => {
                  if (!product) return null;
                  const price = Number(item.price_at_add);
                  const lineTotal = price * item.quantity;
                  const img = product.images[0]?.url;
                  const pdpHref = `/p/${product.seller.business_slug}/${product.slug}`;

                  return (
                    <li
                      key={item.id}
                      className="flex gap-4 rounded-xl border border-neutral-200 bg-neutral-0 p-4"
                    >
                      <Link href={pdpHref} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                        {img ? (
                          <Image src={img} alt={product.name} fill sizes="96px" className="object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-2xl text-neutral-400">📦</div>
                        )}
                      </Link>

                      <div className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <Link href={pdpHref} className="line-clamp-2 text-sm font-semibold text-neutral-900 hover:text-blue-700">
                            {product.name}
                          </Link>
                          <div className="text-sm font-bold text-neutral-900 shrink-0">
                            ${lineTotal.toFixed(2)}
                          </div>
                        </div>

                        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
                          <span>{product.seller.business_name}</span>
                          <KycTierBadge tier={product.seller.kyc_tier} />
                        </div>

                        {variant && (
                          <div className="mt-1 text-xs text-neutral-600">
                            Variant: <span className="font-semibold text-neutral-900">{variant.name}</span>
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <ConditionPill condition={product.condition} />
                          <span className="text-neutral-500">
                            Qty {item.quantity} · ${price.toFixed(2)} each
                          </span>
                        </div>

                        <div className="mt-3">
                          <form action={removeCartItem}>
                            <input type="hidden" name="cartItemId" value={item.id} />
                            <button
                              type="submit"
                              className="text-xs font-semibold text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </form>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Right rail: summary */}
              <aside className="h-fit rounded-xl border border-neutral-200 bg-neutral-0 p-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
                  Order summary
                </h2>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Subtotal ({itemCount} items)</span>
                    <span className="font-semibold text-neutral-900">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-500">
                    <span>Shipping</span>
                    <span>Calculated at checkout</span>
                  </div>
                  <div className="flex justify-between text-neutral-500">
                    <span>Escrow protection</span>
                    <span className="font-semibold text-emerald-700">Included</span>
                  </div>
                </div>

                <div className="mt-4 border-t border-neutral-200 pt-4 flex justify-between text-base">
                  <span className="font-bold text-neutral-900">Total</span>
                  <span className="font-bold text-neutral-900">${subtotal.toFixed(2)}</span>
                </div>

                <Link
                  href="/checkout"
                  className="mt-6 block w-full rounded-lg bg-blue-700 px-6 py-3 text-center text-sm font-semibold text-neutral-0 transition hover:bg-blue-800"
                >
                  Checkout
                </Link>

                <p className="mt-3 text-xs text-neutral-500">
                  Your payment will sit in escrow. Sellers are paid only after you confirm delivery with the 6-digit code.
                </p>
              </aside>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
