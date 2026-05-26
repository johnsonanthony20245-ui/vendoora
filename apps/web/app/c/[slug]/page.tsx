import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { ProductCard, type ProductCardData } from '../../../components/ProductCard';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;

  const category = await prisma.category.findUnique({
    where: { slug },
  });
  if (!category) notFound();

  const products = await prisma.product.findMany({
    where: {
      category_id: category.id,
      status: 'PUBLISHED',
      moderation_status: 'APPROVED',
      deleted_at: null,
    },
    orderBy: { created_at: 'desc' },
    include: {
      seller: { select: { business_slug: true, business_name: true, kyc_tier: true } },
      images: {
        where: { is_primary: true },
        take: 1,
        select: { url: true },
      },
    },
  });

  const cards: ProductCardData[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    base_price: p.base_price.toString(),
    compare_at_price: p.compare_at_price ? p.compare_at_price.toString() : null,
    condition: p.condition,
    seller: p.seller,
    primary_image_url: p.images[0]?.url ?? null,
  }));

  return (
    <main className="bg-neutral-50 min-h-screen">
      {/* Breadcrumb */}
      <nav className="border-b border-neutral-200 bg-neutral-0 px-6 py-3 text-sm text-neutral-600">
        <div className="mx-auto max-w-7xl">
          <Link href="/" className="hover:text-blue-700">Home</Link>
          <span className="mx-2 text-neutral-400">/</span>
          <span className="font-semibold text-neutral-900">{category.name}</span>
        </div>
      </nav>

      {/* Header */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold text-neutral-900 md:text-4xl">
            {category.name}
          </h1>
          {category.description && (
            <p className="mt-2 text-base text-neutral-600">{category.description}</p>
          )}
          <p className="mt-2 text-sm text-neutral-500">
            {products.length} {products.length === 1 ? 'product' : 'products'} · all sellers KYC-verified
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          {cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center text-neutral-600">
              No products in this category yet. Check back soon.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
