import Link from 'next/link';

/**
 * Rich page footer — mirrors docs/prototype/Vendoora_App.html
 * `richPageFooter()`. The dark navy gradient panel with brand + 4
 * link columns + bottom meta strip.
 *
 * Sits ABOVE the thin .shell-footer (which is the persistent app shell
 * footer). The prototype calls richPageFooter() at the end of most
 * page-body screens (home, marketing pages); shorter functional surfaces
 * (cart, checkout, admin queue) typically skip it.
 *
 * Styled by .page-footer-* rules in prototype-home.css (the same scope
 * file currently — when we partition CSS into a shared "page-shell"
 * scope later, this can move there). For now this component must be
 * rendered INSIDE a .proto-home / .proto-X wrapper that ships the
 * page-footer rules.
 */
export function ProtoPageFooter() {
  return (
    <footer className="page-footer">
      <div className="page-footer-grid">
        <div>
          <div className="page-footer-brand">
            Vendoora<span className="dot" aria-hidden></span>
          </div>
          <p className="page-footer-tagline">
            The marketplace where the trust is built into the code. Liberia&apos;s
            verified-seller commerce platform, for Liberia and the diaspora.
          </p>
        </div>
        <div className="page-footer-col">
          <h4>Shop</h4>
          <ul>
            <li><Link href="/search">All Categories</Link></li>
            <li><Link href="/search">Today&apos;s Deals</Link></li>
            <li><Link href="/">Diaspora Bundles</Link></li>
            <li><Link href="/">Gift Cards</Link></li>
          </ul>
        </div>
        <div className="page-footer-col">
          <h4>Sell</h4>
          <ul>
            <li><Link href="/sell">Become a Seller</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
            <li><Link href="/seller-verification">Seller Guide</Link></li>
            <li><Link href="/kyc-policy">Verification</Link></li>
          </ul>
        </div>
        <div className="page-footer-col">
          <h4>Support</h4>
          <ul>
            <li><Link href="/safe-shopping">Help Center</Link></li>
            <li><Link href="/delivery-code">Delivery Codes</Link></li>
            <li><Link href="/protection">Disputes</Link></li>
            <li><Link href="/trust-center">Contact</Link></li>
          </ul>
        </div>
        <div className="page-footer-col">
          <h4>About</h4>
          <ul>
            <li><Link href="/trust-center">Our Story</Link></li>
            <li><Link href="/brand">Press</Link></li>
            <li><Link href="/sell">Careers</Link></li>
            <li><Link href="/kyc-policy">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="page-footer-bottom">
        <span>
          © 2026 Vendoora · Registered in Liberia ·{' '}
          <strong>LBR-2026-XXXXX</strong>
        </span>
        <span><strong>Made in Monrovia</strong></span>
      </div>
    </footer>
  );
}
