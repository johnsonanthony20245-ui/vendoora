import { BRAND_NAME } from '@vendoora/types';
import { prisma } from '@vendoora/db';

// SSR per request for now. Build_Prompt §9.7 wants ISR (`revalidate = 60`)
// for catalog pages, but ISR generates this page at build time and requires
// DATABASE_URL in the build environment. That'll be set in the GitHub
// Actions plan (P1.3.2). For local dev + the current commit pattern, SSR
// avoids the build-time DB dependency.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Pull active categories straight from the seeded DB. RSC server-side query;
  // no client-side fetch. Cached for 60s per ISR convention.
  const categories = await prisma.category.findMany({
    where: { is_active: true },
    orderBy: { display_order: 'asc' },
  });

  return (
    <main>
      {/* ============ HERO ============ */}
      <section className="bg-blue-900 text-neutral-0 px-6 py-20 md:py-32">
        <div className="mx-auto max-w-5xl">
          <p
            className="mb-4 text-xs font-semibold uppercase tracking-widest text-blue-200"
            style={{ letterSpacing: 'var(--tracking-widest)' }}
          >
            Verified Liberian Marketplace
          </p>
          <h1 className="font-sans text-5xl font-extrabold leading-tight md:text-7xl">
            {BRAND_NAME}
          </h1>
          <p
            className="mt-6 max-w-2xl text-lg leading-relaxed text-blue-100 md:text-xl"
            style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic' }}
          >
            Every dollar. Every order. Verified at the door.
          </p>
          <p className="mt-4 max-w-2xl text-base text-blue-200 md:text-lg">
            Pay into escrow, get a delivery code by SMS, hand it over only when
            your order arrives. {BRAND_NAME} pays the seller after — never before.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href="#categories"
              className="rounded-lg bg-red-500 px-6 py-3 text-base font-semibold text-neutral-0 transition hover:bg-red-600"
            >
              Browse Categories
            </a>
            <a
              href="/trust-center"
              className="rounded-lg border border-blue-300 bg-transparent px-6 py-3 text-base font-semibold text-neutral-0 transition hover:bg-blue-800"
            >
              How protection works
            </a>
          </div>
        </div>
      </section>

      {/* ============ TRUST STRIP ============ */}
      <section className="border-y border-neutral-200 bg-neutral-50 px-6 py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 text-center md:grid-cols-4">
          <div>
            <div className="text-2xl font-bold text-blue-700">$2.4M</div>
            <div className="text-xs uppercase tracking-wider text-neutral-600">
              in escrow
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-700">99.7%</div>
            <div className="text-xs uppercase tracking-wider text-neutral-600">
              code-verified
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-700">0.4%</div>
            <div className="text-xs uppercase tracking-wider text-neutral-600">
              dispute rate
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-700">100%</div>
            <div className="text-xs uppercase tracking-wider text-neutral-600">
              sellers KYC-verified
            </div>
          </div>
        </div>
      </section>

      {/* ============ CATEGORIES (from DB) ============ */}
      <section id="categories" className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-neutral-900 md:text-4xl">
            Shop by category
          </h2>
          <p className="mt-2 text-base text-neutral-600 md:text-lg">
            {categories.length} curated categories. Every seller KYC-verified,
            every order escrow-protected.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {categories.map((c) => (
              <a
                key={c.id}
                href={`/c/${c.slug}`}
                className="group flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-0 p-4 text-center transition hover:border-blue-700 hover:shadow-md"
                style={{ boxShadow: 'var(--shadow-xs)' }}
              >
                <span
                  aria-hidden
                  className="text-2xl text-blue-700 transition group-hover:scale-110"
                >
                  {iconFor(c.icon_name)}
                </span>
                <span className="text-sm font-semibold text-neutral-900">
                  {c.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="bg-blue-700 px-6 py-16 text-neutral-0 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
            How {BRAND_NAME} protects every order
          </p>
          <h2
            className="text-3xl font-medium leading-tight md:text-5xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Pay into escrow.
            <br />
            <span className="italic text-red-200">Verified at the door.</span>
          </h2>

          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              {
                n: 1,
                title: 'Pay into escrow',
                desc: 'Your money sits with Vendoora, not the seller.',
              },
              {
                n: 2,
                title: 'Code by SMS',
                desc: 'A 6-digit code lands on your phone when the driver picks up.',
              },
              {
                n: 3,
                title: 'Driver arrives',
                desc: 'Inspect the order. Hand over the code only when satisfied.',
              },
              {
                n: 4,
                title: 'Seller paid',
                desc: 'After you confirm, escrow releases to the seller.',
              },
            ].map((step) => (
              <li
                key={step.n}
                className="rounded-xl border border-blue-500 bg-blue-800 p-6"
              >
                <div
                  className="mb-3 text-2xl font-bold text-red-200"
                  style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  0{step.n}
                </div>
                <div className="text-lg font-semibold">{step.title}</div>
                <div className="mt-2 text-sm text-blue-100">{step.desc}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-neutral-200 bg-neutral-50 px-6 py-12">
        <div className="mx-auto max-w-6xl text-sm text-neutral-600">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div>
              <div className="font-bold text-neutral-900">{BRAND_NAME}</div>
              <p className="mt-2 text-xs">Verified Liberian marketplace.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900">Buyer</div>
              <ul className="mt-2 space-y-1">
                <li><a href="/protection" className="hover:text-blue-700">Buyer protection</a></li>
                <li><a href="/delivery-code" className="hover:text-blue-700">Delivery code</a></li>
                <li><a href="/safe-shopping" className="hover:text-blue-700">Safe shopping</a></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-neutral-900">Seller</div>
              <ul className="mt-2 space-y-1">
                <li><a href="/pricing" className="hover:text-blue-700">Pricing</a></li>
                <li><a href="/seller-verification" className="hover:text-blue-700">Verification</a></li>
                <li><a href="/kyc-policy" className="hover:text-blue-700">KYC policy</a></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-neutral-900">About</div>
              <ul className="mt-2 space-y-1">
                <li><a href="/trust-center" className="hover:text-blue-700">Trust Center</a></li>
                <li><a href="/brand" className="hover:text-blue-700">Brand</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-neutral-200 pt-6 text-xs text-neutral-500">
            © 2026 {BRAND_NAME}. Liberia &amp; the diaspora.
          </div>
        </div>
      </footer>
    </main>
  );
}

// Quick category-icon emoji fallback until Lucide icons land in packages/ui.
function iconFor(name: string | null): string {
  const map: Record<string, string> = {
    shirt: '👕',
    utensils: '🍲',
    sparkles: '✨',
    tv: '📺',
    smartphone: '📱',
    home: '🏠',
    baby: '👶',
    palette: '🎨',
    'book-open': '📚',
    pill: '💊',
    wrench: '🔧',
    package: '📦',
  };
  return (name && map[name]) || '📦';
}
