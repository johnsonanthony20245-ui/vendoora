import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-static';

export const metadata = {
  title: `KYC policy — ${BRAND_NAME}`,
  description:
    'What we collect, where it lives, how long we keep it, who can see it, and how to ask for deletion.',
};

const COLLECTED = [
  {
    field: 'Phone number + email',
    purpose: 'Account creation and 2FA. Used for delivery code SMS and order notifications.',
    tier: 'T1+',
  },
  {
    field: 'Full legal name',
    purpose: 'Required for any payout. Matches your bank or MoMo account.',
    tier: 'T2+',
  },
  {
    field: 'Government photo ID',
    purpose: 'Identity verification — passport, voter card, or drivers license. Photo + ID number + expiry.',
    tier: 'T2+',
  },
  {
    field: 'Selfie liveness photo',
    purpose: 'Matched against the ID photo to confirm you are the document holder.',
    tier: 'T2+',
  },
  {
    field: 'Address',
    purpose: 'Cross-checked against ID. For T3, confirmed by postcard or visit.',
    tier: 'T2+',
  },
  {
    field: 'Business registration',
    purpose: 'Liberia Business Registry filing or LRA tax record. Confirms business entity status.',
    tier: 'T3+',
  },
  {
    field: 'Banking / MoMo merchant details',
    purpose: 'Where payouts go. Account name must match the verified business or individual.',
    tier: 'T3+',
  },
];

const PRINCIPLES = [
  {
    title: 'Encrypted at rest',
    body: 'Identity documents are stored in encrypted object storage with per-document keys. Database fields holding sensitive personal data are encrypted with application-layer keys.',
  },
  {
    title: 'Access is logged',
    body: 'Every Trust & Safety review of a KYC document creates an audit log entry — who looked, when, and why. The log is append-only; nobody can hide a lookup.',
  },
  {
    title: 'Other users never see it',
    body: 'A buyer never sees a seller’s ID or address. The only thing public is the KYC tier badge and the business or display name the seller chose.',
  },
  {
    title: 'You can delete your account',
    body: 'Hard delete via the seller console. Identity documents are purged within 30 days; transaction records are retained for the period the Liberian Revenue Authority requires, then purged.',
  },
];

const RETENTION = [
  { what: 'Identity documents (ID, selfie)', period: 'Lifetime of the account + 30 days after deletion request' },
  { what: 'Address + contact details', period: 'Lifetime of the account' },
  { what: 'Transaction records (orders, payouts)', period: '7 years per LRA tax-record requirements, then purged' },
  { what: 'Audit log of KYC lookups', period: '7 years, append-only, never modified' },
  { what: 'Dispute messages + evidence', period: '3 years from dispute resolution, then anonymised' },
];

export default function KycPolicyPage() {
  return (
    <main className="bg-neutral-50">
      {/* Hero */}
      <section className="bg-blue-900 px-6 py-20 text-neutral-0 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            KYC policy
          </p>
          <h1
            className="mt-3 text-4xl font-medium leading-tight md:text-5xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            What we collect.{' '}
            <span className="italic text-red-200">Why. For how long.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-blue-100 md:text-lg">
            {BRAND_NAME} verifies sellers to protect buyers. That means we hold real
            personal data on people. Here is exactly what we hold, the work we do to
            protect it, and how to ask for it back.
          </p>
        </div>
      </section>

      {/* What we collect */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            What we collect
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Seven categories. Nothing more.
          </h2>

          <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                <tr>
                  <th className="px-4 py-3">Field</th>
                  <th className="px-4 py-3">Why we ask</th>
                  <th className="px-4 py-3">Required from</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-neutral-0">
                {COLLECTED.map((c) => (
                  <tr key={c.field}>
                    <td className="px-4 py-3 font-semibold text-neutral-900">{c.field}</td>
                    <td className="px-4 py-3 text-neutral-700">{c.purpose}</td>
                    <td className="px-4 py-3 text-xs font-bold text-blue-700">{c.tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            We do not collect anything not listed here. Optional fields (display name,
            avatar, business description) are obviously optional.
          </p>
        </div>
      </section>

      {/* How we protect it */}
      <section className="border-b border-neutral-200 bg-neutral-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            How we protect it
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Four operating principles.
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div
                key={p.title}
                className="rounded-xl border border-neutral-200 bg-neutral-0 p-6"
              >
                <h3 className="text-base font-bold text-neutral-900">{p.title}</h3>
                <p className="mt-2 text-sm text-neutral-700">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Retention */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            How long we keep it
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Retention windows.
          </h2>

          <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
            <ul className="divide-y divide-neutral-200">
              {RETENTION.map((r) => (
                <li key={r.what} className="flex items-start justify-between gap-6 px-5 py-4">
                  <span className="text-sm font-semibold text-neutral-900">{r.what}</span>
                  <span className="text-sm text-neutral-700">{r.period}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            LRA = Liberia Revenue Authority. Tax records are mandated by Liberian law;
            everything else is on our calendar.
          </p>
        </div>
      </section>

      {/* Your rights */}
      <section className="bg-blue-900 px-6 py-16 text-neutral-0 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Your rights
          </p>
          <h2
            className="mt-3 text-3xl font-medium md:text-4xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Access. Export. <span className="italic text-red-200">Delete.</span>
          </h2>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <h3 className="text-base font-bold text-neutral-0">Access</h3>
              <p className="mt-2 text-sm text-blue-100">
                Request a copy of everything we hold on you. We deliver within 14 days.
              </p>
            </div>
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <h3 className="text-base font-bold text-neutral-0">Export</h3>
              <p className="mt-2 text-sm text-blue-100">
                Machine-readable JSON of your account, orders, listings, and reviews.
                Yours to take elsewhere.
              </p>
            </div>
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <h3 className="text-base font-bold text-neutral-0">Delete</h3>
              <p className="mt-2 text-sm text-blue-100">
                Hard-delete the account. Identity documents purge within 30 days; only
                the records LRA legally requires remain.
              </p>
            </div>
          </div>

          <p className="mt-8 text-sm text-blue-100">
            Email <span className="font-mono text-neutral-0">privacy@vendoora.com</span> to
            exercise any of these. We respond within 14 days, no fee.
          </p>
        </div>
      </section>

      {/* Footer */}
      <section className="border-t border-neutral-200 bg-neutral-0 px-6 py-12">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
          <Link
            href="/seller-verification"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            The 4 KYC tiers explained
          </Link>
          <Link
            href="/trust-center"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            Trust Center
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            ← Back home
          </Link>
        </div>
      </section>
    </main>
  );
}
