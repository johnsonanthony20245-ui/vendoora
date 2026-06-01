import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { ProductCard, type ProductCardData } from '../../../components/ProductCard';
import { KycTierBadge } from '../../../components/TrustPills';
import { resolveProductImageUrl } from '../../../lib/r2';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function StorefrontPage({ params }: PageProps) {
  const { slug } = await params;

  const seller = await prisma.seller.findUnique({
    where: { business_slug: slug },
  });
  if (!seller || seller.is_suspended || seller.deleted_at) {
    notFound();
  }

  const products = await prisma.product.findMany({
    where: {
      seller_id: seller.id,
      status: 'PUBLISHED',
      moderation_status: 'APPROVED',
      deleted_at: null,
    },
    orderBy: { created_at: 'desc' },
    include: {
      seller: { select: { business_slug: true, business_name: true, kyc_tier: true } },
      images: { where: { is_primary: true }, take: 1, select: { url: true } },
    },
  });

  // `images[0]?.url` may be an https URL (seed) or an R2 object key (seller
  // upload via createProduct, PR #25). resolveProductImageUrl handles both.
  // See lib/r2.ts.
  const cards: ProductCardData[] = await Promise.all(
    products.map(async (p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      base_price: p.base_price.toString(),
      compare_at_price: p.compare_at_price ? p.compare_at_price.toString() : null,
      condition: p.condition,
      seller: p.seller,
      primary_image_url: p.images[0]?.url
        ? await resolveProductImageUrl(p.images[0].url)
        : null,
    })),
  );

  const ratingText =
    seller.rating_average !== null && seller.rating_count > 0
      ? `★ ${Number(seller.rating_average).toFixed(1)} (${seller.rating_count} reviews)`
      : 'New seller — no reviews yet';

  const sellerSince = new Date(seller.created_at).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <main className="bg-neutral-50 min-h-screen">
      {/* Breadcrumb */}
      <nav className="border-b border-neutral-200 bg-neutral-0 px-6 py-3 text-sm text-neutral-600">
        <div className="mx-auto max-w-7xl">
          <Link href="/" className="hover:text-blue-700">Home</Link>
          <span className="mx-2 text-neutral-400">/</span>
          <span className="text-neutral-500">Stores</span>
          <span className="mx-2 text-neutral-400">/</span>
          <span className="font-semibold text-neutral-900">{seller.business_name}</span>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b border-neutral-200 bg-blue-900 px-6 py-12 text-neutral-0 md:py-16">
        <div className="mx-auto max-w-7xl">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-200"
            style={{ letterSpacing: 'var(--tracking-widest)' }}
          >
            Verified Vendoora seller
          </p>
          <div className="flex flex-wrap items-start gap-4">
            <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
              {seller.business_name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <KycTierBadge tier={seller.kyc_tier} />
            </div>
          </div>
          {seller.business_description && (
            <p
              className="mt-4 max-w-2xl text-base italic text-blue-100 md:text-lg"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              {seller.business_description}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-blue-100">
            <span>{ratingText}</span>
            <span aria-hidden className="text-blue-300">·</span>
            <span>
              <span className="font-semibold text-neutral-0">{seller.total_orders}</span> orders
              delivered
            </span>
            <span aria-hidden className="text-blue-300">·</span>
            <span>
              On Vendoora since <span className="font-semibold text-neutral-0">{sellerSince}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-6">
        <div className="mx-auto grid max-w-7xl grid-cols-3 gap-6 text-center">
          <Stat
            value={`${Number(seller.on_time_rate).toFixed(0)}%`}
            label="On-time delivery"
          />
          <Stat
            value={`${(100 - Number(seller.dispute_rate) * 100).toFixed(1)}%`}
            label="Dispute-free"
          />
          <Stat
            value={`${products.length}`}
            label="Active products"
          />
        </div>
      </section>

      {/* Products */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-2xl font-bold text-neutral-900 md:text-3xl">
            All products from {seller.business_name}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Every order escrow-protected. Pay only releases after you confirm delivery.
          </p>

          {cards.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center text-neutral-600">
              No published products from this seller yet.
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {cards.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-blue-700 md:text-3xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-neutral-600">{label}</div>
    </div>
  );
}
