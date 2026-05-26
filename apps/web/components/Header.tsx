import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';
import { getCartCount } from '../app/actions/cart';

export async function Header() {
  const cartCount = await getCartCount();

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-neutral-0/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight text-blue-900 md:text-xl">
            {BRAND_NAME}
          </span>
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-red-500"
            title="Liberian-verified marketplace"
          />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-neutral-700 sm:flex">
          <Link href="/#categories" className="hover:text-blue-700">Browse</Link>
          <Link href="/trust-center" className="hover:text-blue-700">Trust</Link>
          <Link href="/pricing" className="hover:text-blue-700">Sellers</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/cart"
            aria-label={`Cart (${cartCount} ${cartCount === 1 ? 'item' : 'items'})`}
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-900 transition hover:border-blue-700 hover:text-blue-700"
          >
            <span aria-hidden className="text-base">🛒</span>
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span
                aria-hidden
                className="absolute -right-2 -top-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-neutral-0 ring-2 ring-neutral-0"
              >
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
