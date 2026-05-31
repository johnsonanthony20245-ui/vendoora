import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../../lib/admin';
import { resolveProductImageUrl } from '../../../../lib/r2';
import { moderateProduct } from '../../../actions/admin-products';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Product review — ${BRAND_NAME}`,
};

const ERROR_COPY: Record<string, string> = {
  already_decided: 'This product was already decided by another reviewer.',
  not_found: 'Product not found.',
  notes_required: 'Add at least 10 characters of review notes to reject.',
  bad_decision: 'Pick a valid decision.',
  missing_product: 'Product id missing from the form.',
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reviewed?: string }>;
}

export default async function AdminProductReviewPage({ params, searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const { id } = await params;
  const sp = await searchParams;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      seller: {
        select: {
          business_name: true,
          business_slug: true,
          kyc_tier: true,
          kyc_status: true,
          business_type: true,
        },
      },
      category: { select: { name: true, slug: true } },
      images: { orderBy: [{ is_primary: 'desc' }, { display_order: 'asc' }] },
    },
  });
  if (!product) notFound();

  const resolvedImages = await Promise.all(
    product.images.map(async (img) => ({
      id: img.id,
      url: await resolveProductImageUrl(img.url),
      alt_text: img.alt_text ?? '',
    })),
  );

  const decided =
    product.moderation_status === 'APPROVED' ||
    product.moderation_status === 'REJECTED';

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/products" className="text-xs font-semibold text-blue-700 hover:underline">
          ← Product queue
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-neutral-900">{product.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {product.seller.business_name} (T{product.seller.kyc_tier}) ·{' '}
          <Link
            href={`/store/${product.seller.business_slug}`}
            className="text-blue-700 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            view storefront ↗
          </Link>
        </p>

        {sp.reviewed && (
          <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            Product {sp.reviewed === 'approve' ? 'approved and published' : 'rejected'}.
          </div>
        )}
        {sp.error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {ERROR_COPY[sp.error] ?? 'Could not complete the review.'}
          </div>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Panel title="Listing">
            <Row label="Slug" value={`/${product.slug}`} />
            <Row label="Category" value={product.category.name} />
            <Row label="Condition" value={product.condition.replace(/_/g, ' ')} />
            <Row
              label="Price"
              value={`${product.currency} ${product.base_price.toString()}`}
            />
            {product.compare_at_price && (
              <Row
                label="Compare-at"
                value={`${product.currency} ${product.compare_at_price.toString()}`}
              />
            )}
            <Row label="Inventory" value={product.inventory_count.toString()} />
            <Row label="Authenticity" value={product.authenticity_status.replace(/_/g, ' ')} />
          </Panel>
          <Panel title="Seller">
            <Row label="Business" value={product.seller.business_name} />
            <Row label="Type" value={product.seller.business_type.replace(/_/g, ' ')} />
            <Row label="KYC tier" value={`T${product.seller.kyc_tier}`} />
            <Row
              label="KYC status"
              value={product.seller.kyc_status.replace(/_/g, ' ')}
            />
            <Row label="Status" value={product.status.replace(/_/g, ' ')} />
            <Row
              label="Moderation"
              value={product.moderation_status.replace(/_/g, ' ')}
            />
          </Panel>
        </div>

        <Panel title="Description" className="mt-6">
          {product.short_description && (
            <p className="text-sm font-medium text-neutral-800">
              {product.short_description}
            </p>
          )}
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">
            {product.description}
          </p>
        </Panel>

        <Panel title={`Images (${resolvedImages.length})`} className="mt-6">
          {resolvedImages.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Seller did not include any images.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {resolvedImages.map((img) =>
                img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={img.url}
                    alt={img.alt_text}
                    className="aspect-square w-full rounded-lg border border-neutral-200 object-cover"
                  />
                ) : (
                  <div
                    key={img.id}
                    className="aspect-square w-full rounded-lg border border-dashed border-neutral-300 bg-neutral-100 p-3 text-center text-xs text-neutral-500"
                  >
                    Image stored in R2 but R2 credentials are not configured in this environment.
                  </div>
                ),
              )}
            </div>
          )}
        </Panel>

        {/* Review action */}
        {decided ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-0 p-6 text-sm text-neutral-600">
            This product is <strong>{product.moderation_status}</strong>.
            {product.moderation_status === 'APPROVED' && product.published_at
              ? ` Published ${product.published_at.toISOString().slice(0, 16).replace('T', ' ')}.`
              : ''}
          </div>
        ) : (
          <form
            action={moderateProduct}
            className="mt-6 rounded-xl border border-neutral-200 bg-neutral-0 p-6"
          >
            <input type="hidden" name="productId" value={product.id} />
            <label
              htmlFor="notes"
              className="text-xs font-bold uppercase tracking-widest text-neutral-600"
            >
              Review notes{' '}
              <span className="font-normal normal-case text-neutral-400">
                (required to reject — minimum 10 characters)
              </span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="What did you verify? For a rejection, say what was wrong so the seller can fix it."
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                name="decision"
                value="APPROVE"
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-emerald-700"
              >
                Approve &amp; publish
              </button>
              <button
                type="submit"
                name="decision"
                value="REJECT"
                className="rounded-lg border border-red-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Reject
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-neutral-0 p-6 ${className}`}>
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}
