import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Welcome to ${BRAND_NAME}`,
};

interface PageProps {
  searchParams: Promise<{ slug?: string }>;
}

export default async function SellerWelcome({ searchParams }: PageProps) {
  const { slug } = await searchParams;
  if (!slug) notFound();

  const seller = await prisma.seller.findUnique({
    where: { business_slug: slug },
    select: {
      business_name: true,
      business_slug: true,
      saas_plan: true,
      kyc_tier: true,
      saas_commission_rate: true,
    },
  });
  if (!seller) notFound();

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-700">
          ✓
        </div>
        <h1
          className="mt-4 text-4xl font-medium text-neutral-900 md:text-5xl"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          Welcome to{' '}
          <span className="italic text-blue-700">{seller.business_name}</span>.
        </h1>
        <p className="mt-4 text-base text-neutral-700">
          Your store is live. Your KYC Tier 1 application is in review — most are
          decided within an hour. Until then you can prepare listings; you just
          can&apos;t publish them yet.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Stat label="Plan" value={seller.saas_plan} />
          <Stat
            label="Commission"
            value={`${(Number(seller.saas_commission_rate) * 100).toFixed(0)}%`}
          />
          <Stat label="KYC tier" value={`T${seller.kyc_tier}`} />
        </div>

        <div className="mt-10 space-y-4 rounded-2xl border border-neutral-200 bg-neutral-0 p-6">
          <h2 className="text-base font-bold text-neutral-900">What&apos;s next</h2>
          <ol className="space-y-3 text-sm text-neutral-700">
            <li className="flex gap-3">
              <span
                aria-hidden
                className="shrink-0 font-mono font-bold text-blue-700"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                01
              </span>
              <span>
                <strong>KYC review.</strong> We&apos;re verifying your phone +
                email. Watch your inbox — the email confirmation activates the
                store.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="shrink-0 font-mono font-bold text-blue-700"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                02
              </span>
              <span>
                <strong>Prepare your first listings.</strong> Upload photos,
                set prices, write honest descriptions. The listings stay as
                drafts until your KYC review completes.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="shrink-0 font-mono font-bold text-blue-700"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                03
              </span>
              <span>
                <strong>Graduate to T2.</strong> Upload a government ID from
                the seller console to unlock the T2 badge, 200 active
                listings, and the lower commission rate on the Growth plan.
              </span>
            </li>
          </ol>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/store/${seller.business_slug}`}
            className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-bold text-neutral-0 hover:bg-blue-800"
          >
            View my storefront →
          </Link>
          <Link
            href="/seller-verification"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            How tier graduation works
          </Link>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-4">
      <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-blue-700">{value}</div>
    </div>
  );
}
