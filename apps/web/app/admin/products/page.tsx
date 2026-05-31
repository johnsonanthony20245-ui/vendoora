import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma, type Prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Product moderation queue — ${BRAND_NAME}`,
};

type ModerationFilter = 'pending' | 'decided' | 'flagged' | 'all';

// Reviewable today = PENDING (seller submitted, awaiting first decision) +
// FLAGGED (re-review after a buyer trust signal or system flag). Decided =
// terminal review state. `lib/product-moderation.ts` is the single source of
// truth for the reviewable set — keep these arrays in sync.
const PENDING_STATUSES = ['PENDING'] as const;
const DECIDED_STATUSES = ['APPROVED', 'REJECTED'] as const;

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const sp = await searchParams;
  const filter: ModerationFilter =
    sp.filter === 'decided'
      ? 'decided'
      : sp.filter === 'flagged'
        ? 'flagged'
        : sp.filter === 'all'
          ? 'all'
          : 'pending';

  const where: Prisma.ProductWhereInput =
    filter === 'pending'
      ? { moderation_status: { in: [...PENDING_STATUSES] }, deleted_at: null }
      : filter === 'flagged'
        ? { moderation_status: 'FLAGGED', deleted_at: null }
        : filter === 'decided'
          ? { moderation_status: { in: [...DECIDED_STATUSES] }, deleted_at: null }
          : { deleted_at: null };

  // Oldest-first on the queue. Pending products sorted by created_at so the
  // seller who submitted first gets reviewed first; same shape as KYC.
  const products = await prisma.product.findMany({
    where,
    orderBy: [{ created_at: 'asc' }],
    take: 100,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      moderation_status: true,
      base_price: true,
      currency: true,
      created_at: true,
      seller: {
        select: {
          business_name: true,
          business_slug: true,
          kyc_tier: true,
        },
      },
      category: { select: { name: true } },
      images: {
        where: { is_primary: true },
        take: 1,
        select: { url: true },
      },
    },
  });

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">T&amp;S queue</p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Product moderation</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Oldest submission first. Approving publishes the listing site-wide.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <FilterChip label="Pending" current={filter} value="pending" />
          <FilterChip label="Flagged" current={filter} value="flagged" />
          <FilterChip label="Decided" current={filter} value="decided" />
          <FilterChip label="All" current={filter} value="all" />
          <Link
            href="/admin"
            className="ml-auto rounded-full border border-neutral-300 bg-neutral-0 px-3 py-1 text-xs font-semibold text-neutral-700 hover:border-blue-700 hover:text-blue-700"
          >
            ← Admin home
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center text-neutral-600">
            No products in this view.
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Moderation</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-neutral-900">{p.name}</div>
                      <div className="text-xs text-neutral-500">/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      <div className="font-medium">{p.seller.business_name}</div>
                      <div className="text-xs text-neutral-500">
                        T{p.seller.kyc_tier} · /{p.seller.business_slug}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{p.category.name}</td>
                    <td className="px-4 py-3 text-neutral-900 font-semibold">
                      {p.currency} {p.base_price.toString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={p.moderation_status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {p.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-neutral-0 hover:bg-blue-800"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function FilterChip({
  label,
  current,
  value,
}: {
  label: string;
  current: ModerationFilter;
  value: ModerationFilter;
}) {
  const active = current === value;
  const href = `/admin/products${value === 'pending' ? '' : `?filter=${value}`}`;
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? 'border-blue-700 bg-blue-700 text-neutral-0'
          : 'border-neutral-300 bg-neutral-0 text-neutral-700 hover:border-blue-700 hover:text-blue-700'
      }`}
    >
      {label}
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'APPROVED'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : status === 'REJECTED'
        ? 'bg-red-50 text-red-700 ring-red-200'
        : status === 'FLAGGED'
          ? 'bg-amber-50 text-amber-700 ring-amber-200'
          : 'bg-blue-50 text-blue-700 ring-blue-200';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${tone}`}
    >
      {status}
    </span>
  );
}
