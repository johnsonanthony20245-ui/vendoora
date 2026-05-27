import Link from 'next/link';
import { getCartCount } from '../app/actions/cart';
import { ProtoBrandMark } from './ProtoBrandMark';
import { ProtoHeaderSearch } from './ProtoHeaderSearch';
import { ProtoThemeToggle } from './ProtoThemeToggle';
import { ProtoAuthSlot } from './ProtoAuthSlot';

/**
 * Persistent app header — mirrors docs/prototype/Vendoora_App.html
 * (.shell-header). Styled by apps/web/app/prototype-shell.css which is
 * scoped to .proto-shell (the wrapper sits in layout.tsx).
 *
 * Role-aware navs (.shell-nav for buyer/seller/admin/driver) are present
 * in markup, but only the buyer nav is visible by default — switching the
 * visible nav is the job of the (future) role-switching UI bound to real
 * auth + RBAC. For now everyone is a guest buyer.
 */
export async function ProtoHeader() {
  const cartCount = await getCartCount();

  return (
    <header className="shell-header">
      <Link href="/" className="brand" aria-label="Vendoora home">
        <ProtoBrandMark />
        <span className="brand-wordmark">Vendoora</span>
      </Link>

      <nav className="shell-nav" data-role-nav="buyer">
        <Link href="/" className="nav-item active">Browse</Link>
        <Link href="/cart" className="nav-item">Orders</Link>
        <Link href="/" className="nav-item">Send home</Link>
        <Link href="/safe-shopping" className="nav-item">Help</Link>
      </nav>

      <div className="shell-header-right">
        <ProtoHeaderSearch />

        <div className="audience-pill" id="audience-pill"></div>

        <Link
          href="/cart"
          className="icon-btn"
          aria-label={`Cart (${cartCount} ${cartCount === 1 ? 'item' : 'items'})`}
          style={{ position: 'relative' }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          {cartCount > 0 && (
            <span className="badge-dot" style={{ background: 'var(--color-accent)' }}>
              {cartCount}
            </span>
          )}
        </Link>

        <ProtoThemeToggle />

        <ProtoAuthSlot />
      </div>
    </header>
  );
}
