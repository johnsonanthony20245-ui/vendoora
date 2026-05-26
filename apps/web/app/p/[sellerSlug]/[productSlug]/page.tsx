import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@vendoora/db';
import { TrustPill, KycTierBadge, ConditionPill } from '../../../../components/TrustPills';
import { addToCart } from '../../../actions/cart';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ sellerSlug: string; productSlug: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { sellerSlug, productSlug } = await params;

  const seller = await prisma.seller.findUnique({ where: { business_slug: sellerSlug } });
  if (!seller) notFound();

  const product = await prisma.product.findUnique({
    where: { seller_id_slug: { seller_id: seller.id, slug: productSlug } },
    include: {
      category: true,
      images: { orderBy: { display_order: 'asc' } },
      variants: { orderBy: { created_at: 'asc' } },
    },
  });
  if (!product) notFound();

  const price = Number(product.base_price);
  const compareAt = product.compare_at_price ? Number(product.compare_at_price) : null;
  const hasDiscount = compareAt !== null && compareAt > price;

  return (
    <main className="bg-neutral-50 min-h-screen">
      {/* Breadcrumb */}
      <nav className="border-b border-neutral-200 bg-neutral-0 px-6 py-3 text-sm text-neutral-600">
        <div className="mx-auto max-w-7xl">
          <Link href="/" className="hover:text-blue-700">Home</Link>
          <span className="mx-2 text-neutral-400">/</span>
          <Link href={`/c/${product.category.slug}`} className="hover:text-blue-700">
            {product.category.name}
          </Link>
          <span className="mx-2 text-neutral-400">/</span>
          <span className="font-semibold text-neutral-900">{product.name}</span>
        </div>
      </nav>

      {/* Main product surface */}
      <section className="bg-neutral-0 px-6 py-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2">
          {/* Image gallery */}
          <div>
            <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100">
              {product.images[0] ? (
                <Image
                  src={product.images[0].url}
                  alt={product.images[0].alt_text ?? product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center text-6xl text-neutral-400">📦</div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {product.images.slice(1).map((img) => (
                  <div key={img.id} className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
                    <Image
                      src={img.url}
                      alt={img.alt_text ?? ''}
                      fill
                      sizes="100px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info column */}
          <div>
            <div className="flex flex-wrap gap-1">
              <ConditionPill condition={product.condition} />
              {product.authenticity_status === 'PROOF_PROVIDED' && (
                <TrustPill variant="condition-new">PROOF PROVIDED</TrustPill>
              )}
              {product.authenticity_status === 'PLATFORM_VERIFIED' && (
                <TrustPill variant="kyc-t4">PLATFORM VERIFIED</TrustPill>
              )}
            </div>

            <h1 className="mt-3 text-3xl font-bold text-neutral-900 md:text-4xl">
              {product.name}
            </h1>

            <div className="mt-3 flex items-center gap-2">
              <Link
                href={`/store/${seller.business_slug}`}
                className="text-sm text-neutral-600 hover:text-blue-700"
              >
                by <span className="font-semibold text-neutral-900">{seller.business_name}</span>
              </Link>
              <KycTierBadge tier={seller.kyc_tier} />
              {seller.rating_average && (
                <span className="text-sm text-neutral-600">
                  ★ {Number(seller.rating_average).toFixed(1)}{' '}
                  <span className="text-xs">({seller.rating_count})</span>
                </span>
              )}
            </div>

            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-4xl font-bold text-neutral-900">${price.toFixed(2)}</span>
              {hasDiscount && compareAt !== null && (
                <>
                  <span className="text-lg text-neutral-500 line-through">${compareAt.toFixed(2)}</span>
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-neutral-0">
                    Save ${(compareAt - price).toFixed(2)}
                  </span>
                </>
              )}
            </div>

            {product.short_description && (
              <p className="mt-4 text-base text-neutral-700">{product.short_description}</p>
            )}

            {/* Variant picker + Add to cart form */}
            <form action={addToCart} className="mt-6">
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="quantity" value="1" />
              {product.variants.length > 0 && (
                <div className="mb-4">
                  <label htmlFor="variantId" className="block text-sm font-semibold text-neutral-900">
                    Option
                  </label>
                  <select
                    id="variantId"
                    name="variantId"
                    className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  >
                    {product.variants.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-blue-700 px-6 py-3 text-base font-semibold text-neutral-0 transition hover:bg-blue-800"
                >
                  Add to cart
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 bg-neutral-0 px-4 py-3 text-base font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-50"
                  aria-label="Save"
                  title="Wishlist functionality lands in a future slice"
                  disabled
                >
                  ♡
                </button>
              </div>
            </form>

            {/* Warranty / Return summary */}
            {(product.warranty_terms || product.return_policy_type !== 'NO_RETURNS') && (
              <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                {product.warranty_terms && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <div className="font-semibold text-neutral-900">Warranty</div>
                    <div className="mt-1 text-neutral-600">
                      {product.warranty_terms}
                      {product.warranty_duration_days && ` (${product.warranty_duration_days} days)`}
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <div className="font-semibold text-neutral-900">Returns</div>
                  <div className="mt-1 text-neutral-600">
                    {product.return_policy_type === 'NO_RETURNS' ? 'Final sale' : 'Returns accepted'}
                    {product.return_window_days && ` · ${product.return_window_days} days`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* "How this order is protected" — per Polish_Phase_Addendum §1.2 */}
      <section className="bg-blue-700 px-6 py-12 text-neutral-0 md:py-16">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
            How this order is protected
          </p>
          <h2
            className="text-2xl font-medium md:text-4xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            {seller.business_name} is <span className="italic text-red-200">{tierLabel(seller.kyc_tier)} verified</span>. Your payment sits in escrow until you confirm delivery.
          </h2>

          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              { n: 1, title: 'Pay into escrow', desc: 'Held safely. Seller doesn’t see a cent yet.' },
              { n: 2, title: 'Code by SMS', desc: 'A 6-digit code lands on your phone.' },
              { n: 3, title: 'Driver arrives', desc: 'Inspect first. Code only if satisfied.' },
              { n: 4, title: 'Seller paid', desc: 'Escrow releases after you confirm.' },
            ].map((step) => (
              <li key={step.n} className="rounded-xl border border-blue-500 bg-blue-800 p-4">
                <div className="text-xl font-bold text-red-200" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                  0{step.n}
                </div>
                <div className="mt-2 text-base font-semibold">{step.title}</div>
                <div className="mt-1 text-sm text-blue-100">{step.desc}</div>
              </li>
            ))}
          </ol>

          <div className="mt-6">
            <Link href="/trust-center" className="text-sm text-blue-100 underline hover:text-neutral-0">
              Learn how {BRAND_NAME} protects you →
            </Link>
          </div>
        </div>
      </section>

      {/* Description */}
      <section className="px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-bold text-neutral-900">About this item</h2>
          <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-neutral-700">
            {product.description}
          </p>
        </div>
      </section>
    </main>
  );
}

function tierLabel(tier: number): string {
  if (tier >= 4) return 'T4 Elite';
  if (tier >= 3) return 'T3';
  if (tier >= 2) return 'T2';
  return `T${tier}`;
}
