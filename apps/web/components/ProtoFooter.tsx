import Link from 'next/link';
import { ProtoBrandMark } from './ProtoBrandMark';

/**
 * Persistent app footer — mirrors docs/prototype/Vendoora_App.html
 * (.shell-footer). Styled by .proto-shell-scoped prototype-shell.css.
 *
 * The prototype's footer is a single thin strip with brand + four
 * cross-links + a version meta tag. The deeper "rich page footer"
 * (richPageFooter() helper) is a separate component used only on
 * marketing pages; that'll land in the marketing-pages alignment slice.
 */
export function ProtoFooter() {
  return (
    <footer className="shell-footer">
      <div className="footer-brand">
        <ProtoBrandMark className="footer-brand-mark" />
        <span>Vendoora · Verified Liberian marketplace</span>
      </div>
      <div className="footer-links">
        <Link href="/protection" className="footer-link">Buyer protection</Link>
        <Link href="/safe-shopping" className="footer-link">Safe shopping</Link>
        <Link href="/trust-center" className="footer-link">Trust Center</Link>
        <Link href="/pricing" className="footer-link">Sell on Vendoora</Link>
      </div>
      <span className="footer-meta">© 2026 · v0.1</span>
    </footer>
  );
}
