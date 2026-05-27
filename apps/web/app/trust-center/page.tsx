import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-static';

export const metadata = {
  title: `Trust Center — ${BRAND_NAME}`,
  description:
    "Every dollar. Every order. Verified at the door. How Vendoora protects buyers and sellers.",
};

export default function TrustCenterPage() {
  return (
    <main className="bg-neutral-50">
      {/* Hero */}
      <section className="bg-blue-900 px-6 py-20 text-neutral-0 md:py-28">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Trust Center
          </p>
          <h1
            className="mt-3 text-4xl font-medium leading-tight md:text-6xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Every dollar. Every order.
            <br />
            <span className="italic text-red-200">Verified at the door.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-blue-100 md:text-lg">
            {BRAND_NAME} sits between buyer and seller. Your payment lives with us until
            you tell us the package arrived and it&apos;s right. Sellers know they&apos;ll get
            paid because the money&apos;s already there. Buyers know they won&apos;t lose money
            because we don&apos;t release it until they say so.
          </p>
        </div>
      </section>

      {/* The mechanism — 4 steps */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            How the trust mechanic works
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-4xl">
            Four steps. No surprises.
          </h2>

          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              {
                n: 1,
                title: 'Pay into escrow',
                desc: 'Your money sits with Vendoora. The seller doesn’t see a cent yet.',
                pill: 'HELD SAFELY',
                pillTone: 'bg-blue-50 text-blue-700 ring-blue-200',
              },
              {
                n: 2,
                title: 'Code by SMS',
                desc: 'A 6-digit code lands on your phone when the driver picks up.',
                pill: 'CODE ARRIVES',
                pillTone: 'bg-red-50 text-red-700 ring-red-200',
              },
              {
                n: 3,
                title: 'Driver arrives',
                desc: 'Inspect the order before you hand over the code. If it’s wrong, refuse.',
                pill: 'YOU DECIDE',
                pillTone: 'bg-amber-50 text-amber-700 ring-amber-200',
              },
              {
                n: 4,
                title: 'Seller paid',
                desc: 'Escrow releases automatically 24 hours after you confirm delivery.',
                pill: 'DONE',
                pillTone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
              },
            ].map((step) => (
              <li
                key={step.n}
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-6"
              >
                <div
                  className="text-3xl font-bold text-blue-700"
                  style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  0{step.n}
                </div>
                <div className="mt-3 text-base font-semibold text-neutral-900">
                  {step.title}
                </div>
                <p className="mt-2 text-sm text-neutral-700">{step.desc}</p>
                <span
                  className={`mt-4 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${step.pillTone}`}
                >
                  {step.pill}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Live stats (illustrative) */}
      <section className="bg-blue-900 px-6 py-12 text-neutral-0">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat value="$2.4M" label="In escrow right now" />
            <Stat value="99.7%" label="Code-verified delivery" />
            <Stat value="0.4%" label="Dispute rate" />
            <Stat value="100%" label="Sellers KYC-verified" />
          </div>
          <p className="mt-6 text-center text-xs text-blue-200">
            Illustrative — production wires these to real read models that refresh every
            15 minutes and auto-hide any stat that degrades below threshold.
          </p>
        </div>
      </section>

      {/* Pillars */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            The four pillars
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Why this works
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Pillar
              icon="🪪"
              title="Verified sellers"
              body="Every seller goes through KYC. T2 verifies identity. T3 verifies business registration. T4 is platform-verified — we&apos;ve walked into their shop. The badge on every product card tells you exactly which tier."
              cta={{ href: '/protection', label: 'How tiers work' }}
            />
            <Pillar
              icon="🔒"
              title="Money in escrow"
              body="Your payment doesn&apos;t go to the seller at checkout. It goes to Vendoora&apos;s segregated escrow account. Sellers know it&apos;s coming. Buyers know it hasn&apos;t left yet."
              cta={{ href: '/protection', label: 'Protection terms' }}
            />
            <Pillar
              icon="📱"
              title="6-digit code at the door"
              body="Generated server-side, sent only to you. The driver can&apos;t complete the delivery without it. Three wrong tries puts the order under Trust & Safety review."
              cta={null}
            />
            <Pillar
              icon="🛟"
              title="Insurance fund"
              body="When a dispute is genuinely fraud and the seller can&apos;t make the buyer whole, Vendoora&apos;s insurance fund covers the refund. You don&apos;t pay for this — it&apos;s funded by 0.5% of every order."
              cta={null}
            />
          </div>
        </div>
      </section>

      {/* Cross-links */}
      <section className="border-t border-neutral-200 bg-neutral-0 px-6 py-12">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
          <Link
            href="/protection"
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
          >
            Read full buyer protection →
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            For sellers: pricing
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-neutral-0 md:text-4xl">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-blue-200">{label}</div>
    </div>
  );
}

function Pillar({
  icon,
  title,
  body,
  cta,
}: {
  icon: string;
  title: string;
  body: string;
  cta: { href: string; label: string } | null;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
      <div className="text-3xl" aria-hidden>
        {icon}
      </div>
      <h3 className="mt-3 text-lg font-bold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-neutral-700">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
