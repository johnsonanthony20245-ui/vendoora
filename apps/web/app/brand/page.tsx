import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';
import { TrustPill, KycTierBadge, ConditionPill } from '../../components/TrustPills';

export const dynamic = 'force-static';

export const metadata = {
  title: `Brand — ${BRAND_NAME}`,
  description:
    'Vendoora design tokens, type scale, and component samples. The visual source of truth for the system.',
};

const BLUE_SCALE = [
  { name: 'blue-50',  hex: '#EEF2FF' },
  { name: 'blue-100', hex: '#D8E0F5' },
  { name: 'blue-200', hex: '#B6C5EC' },
  { name: 'blue-300', hex: '#8FA5DD' },
  { name: 'blue-400', hex: '#5A78C9' },
  { name: 'blue-500', hex: '#3354B8' },
  { name: 'blue-600', hex: '#2647B0' },
  { name: 'blue-700', hex: '#1A3DAE', tag: 'PRIMARY' },
  { name: 'blue-800', hex: '#142E7A' },
  { name: 'blue-900', hex: '#0E2255', tag: 'HERO' },
];

const RED_SCALE = [
  { name: 'red-50',  hex: '#FFF1F2' },
  { name: 'red-100', hex: '#FFD7DC' },
  { name: 'red-200', hex: '#F3C2C6' },
  { name: 'red-400', hex: '#E5505F' },
  { name: 'red-500', hex: '#CE1126', tag: 'ACCENT (LIBERIAN FLAG)' },
  { name: 'red-600', hex: '#9F0D1C' },
  { name: 'red-700', hex: '#7A0917' },
];

const NEUTRAL_SCALE = [
  { name: 'neutral-0',   hex: '#FFFFFF', tag: 'SURFACE' },
  { name: 'neutral-50',  hex: '#FAFBFC', tag: 'PAGE' },
  { name: 'neutral-100', hex: '#F7F8FA' },
  { name: 'neutral-200', hex: '#F0F2F6' },
  { name: 'neutral-300', hex: '#E3E6EC' },
  { name: 'neutral-400', hex: '#C8CDD7' },
  { name: 'neutral-500', hex: '#8A92A3' },
  { name: 'neutral-600', hex: '#5A6478' },
  { name: 'neutral-700', hex: '#3A4256' },
  { name: 'neutral-800', hex: '#1F2A3F' },
  { name: 'neutral-900', hex: '#0A1226', tag: 'TEXT' },
];

export default function BrandPage() {
  return (
    <main className="bg-neutral-50">
      {/* Hero */}
      <section className="bg-blue-900 px-6 py-20 text-neutral-0 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Brand system
          </p>
          <h1
            className="mt-3 text-4xl font-medium leading-tight md:text-6xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            One book. Every <span className="italic text-red-200">screen.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-blue-100 md:text-lg">
            The {BRAND_NAME} visual system in one place. Tokens, type, and components
            as they ship to production. If something doesn&apos;t look right elsewhere,
            this is the reference to fix it against.
          </p>
        </div>
      </section>

      {/* Color */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Color
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Three palettes. Two themes. No exceptions.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Blue is the brand. Red is the accent — Liberian flag, used sparingly to
            mean &quot;this matters.&quot; Neutrals carry the rest. Dark mode rebinds the
            neutral scale only; blue and red stay constant.
          </p>

          <Swatches title="Blue" scale={BLUE_SCALE} />
          <Swatches title="Red" scale={RED_SCALE} />
          <Swatches title="Neutral" scale={NEUTRAL_SCALE} />
        </div>
      </section>

      {/* Type */}
      <section className="border-b border-neutral-200 bg-neutral-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Type
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Three families. Clear roles.
          </h2>

          <div className="mt-10 space-y-6">
            <TypeRow
              fontVar="var(--font-fraunces)"
              family="Fraunces"
              role="Display (marketing headlines). Variable optical-size axis."
              sample="Every dollar. Every order."
              italic="Verified at the door."
            />
            <TypeRow
              fontVar="var(--font-inter-tight)"
              family="Inter Tight"
              role="Workhorse — 95% of UI text. Body, buttons, navigation."
              sample="Buy with confidence. Sell with trust."
            />
            <TypeRow
              fontVar="var(--font-jetbrains-mono)"
              family="JetBrains Mono"
              role="Numbers, codes, order numbers."
              sample="VDR-2026-04C821"
            />
          </div>

          <div className="mt-10 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                <tr>
                  <th className="px-4 py-3">Scale</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Sample</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {[
                  { token: '2xs', size: '11px' },
                  { token: 'xs', size: '12px' },
                  { token: 'sm', size: '13px' },
                  { token: 'base', size: '15px' },
                  { token: 'md', size: '16px' },
                  { token: 'lg', size: '18px' },
                  { token: 'xl', size: '20px' },
                  { token: '2xl', size: '24px' },
                  { token: '3xl', size: '30px' },
                  { token: '4xl', size: '36px' },
                ].map((t) => (
                  <tr key={t.token}>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-600">{t.token}</td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-600">{t.size}</td>
                    <td className="px-4 py-3 text-neutral-900" style={{ fontSize: t.size }}>
                      Vendoora — verified Liberian marketplace
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Components */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Components
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            The pills, buttons, and surfaces that show up everywhere.
          </h2>

          {/* Trust pills */}
          <div className="mt-10 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              Trust pills
            </h3>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <TrustPill variant="escrow">ESCROW</TrustPill>
              <TrustPill variant="code">CODE</TrustPill>
              <TrustPill variant="condition-new">NEW</TrustPill>
              <TrustPill variant="condition-like-new">LIKE NEW</TrustPill>
            </div>
          </div>

          {/* KYC badges */}
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              KYC tier badges
            </h3>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <KycTierBadge tier={1} />
              <KycTierBadge tier={2} />
              <KycTierBadge tier={3} />
              <KycTierBadge tier={4} />
            </div>
          </div>

          {/* Condition pills */}
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              Product condition
            </h3>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ConditionPill condition="NEW" />
              <ConditionPill condition="LIKE_NEW" />
              <ConditionPill condition="USED_GOOD" />
              <ConditionPill condition="REFURBISHED" />
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              Buttons
            </h3>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
              >
                Primary
              </button>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
              >
                Secondary
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-red-600"
              >
                Danger
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg bg-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-400"
              >
                Disabled
              </button>
            </div>
          </div>

          {/* Card */}
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              Card surface
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <article
                className="rounded-xl border border-neutral-200 bg-neutral-0 p-5"
                style={{ boxShadow: 'var(--shadow-xs)' }}
              >
                <h4 className="text-base font-bold text-neutral-900">Default card</h4>
                <p className="mt-1 text-sm text-neutral-700">
                  Surface = neutral-0. Border = neutral-200. Shadow = xs.
                </p>
              </article>
              <article className="rounded-xl border-2 border-blue-700 bg-neutral-0 p-5 shadow-lg">
                <h4 className="text-base font-bold text-neutral-900">Highlighted card</h4>
                <p className="mt-1 text-sm text-neutral-700">
                  Border = blue-700, shadow = lg. Used for &quot;most popular&quot; surfaces.
                </p>
              </article>
            </div>
          </div>

          {/* Pill stat */}
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              Stage pill
            </h3>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Stage tone="blue" pill="HELD SAFELY" />
              <Stage tone="red" pill="CODE ARRIVES" />
              <Stage tone="amber" pill="YOU DECIDE" />
              <Stage tone="emerald" pill="DONE" />
            </div>
          </div>
        </div>
      </section>

      {/* Voice + tone */}
      <section className="bg-blue-900 px-6 py-16 text-neutral-0 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Voice
          </p>
          <h2
            className="mt-3 text-3xl font-medium md:text-4xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Plain. Specific. <span className="italic text-red-200">Honest.</span>
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <VoiceCard
              do="Inspect before the code."
              dont="Securely authenticate your delivery experience."
              note="Short, imperative, in the room with you."
            />
            <VoiceCard
              do="Money in escrow. Released after the code."
              dont="Funds are held in trust until delivery is confirmed."
              note="Plain words. The reader fills in the meaning."
            />
            <VoiceCard
              do="If something’s wrong, you don’t pay for it."
              dont="In the event of non-conformance, buyer recourse is available."
              note="Promises beat policies."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="border-t border-neutral-200 bg-neutral-0 px-6 py-12">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
          <Link
            href="/trust-center"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            Trust Center
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            Pricing
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

function Swatches({
  title,
  scale,
}: {
  title: string;
  scale: Array<{ name: string; hex: string; tag?: string }>;
}) {
  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-600">{title}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {scale.map((s) => (
          <div
            key={s.name}
            className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0"
          >
            <div
              className="h-16 w-full"
              style={{ background: s.hex }}
              aria-label={`Swatch ${s.name}`}
            />
            <div className="px-3 py-2 text-xs">
              <div className="font-mono font-bold text-neutral-900">{s.name}</div>
              <div className="font-mono text-neutral-500">{s.hex}</div>
              {s.tag && (
                <div className="mt-1 text-[9px] font-bold uppercase tracking-widest text-blue-700">
                  {s.tag}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeRow({
  fontVar,
  family,
  role,
  sample,
  italic,
}: {
  fontVar: string;
  family: string;
  role: string;
  sample: string;
  italic?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
      <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">
        {family}
      </div>
      <div className="mt-1 text-xs text-neutral-600">{role}</div>
      <div className="mt-4 text-3xl text-neutral-900 md:text-4xl" style={{ fontFamily: fontVar }}>
        {sample}
        {italic && <span className="italic text-red-500"> {italic}</span>}
      </div>
    </div>
  );
}

function Stage({
  tone,
  pill,
}: {
  tone: 'blue' | 'red' | 'amber' | 'emerald';
  pill: string;
}) {
  const tones: Record<typeof tone, string> = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${tones[tone]}`}
    >
      {pill}
    </span>
  );
}

function VoiceCard({
  do: doText,
  dont,
  note,
}: {
  do: string;
  dont: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-blue-500 bg-blue-800 p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Do</div>
      <p className="mt-1 text-base font-semibold text-neutral-0">&ldquo;{doText}&rdquo;</p>
      <div className="mt-4 text-xs font-bold uppercase tracking-widest text-red-200">Don&apos;t</div>
      <p className="mt-1 text-sm italic text-blue-100">&ldquo;{dont}&rdquo;</p>
      <p className="mt-4 text-xs text-blue-200">{note}</p>
    </div>
  );
}
