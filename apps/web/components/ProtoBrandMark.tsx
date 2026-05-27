/**
 * Brand SVG mark — pentagon shield with checkmark + red dot at top.
 * Source: docs/prototype/Vendoora_App.html (.brand-mark / .footer-brand-mark).
 */
interface Props {
  className?: string;
}

export function ProtoBrandMark({ className = 'brand-mark' }: Props) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <path
        d="M 60 8 L 105 34 L 105 86 L 60 112 L 15 86 L 15 34 Z"
        fill="var(--color-action-primary)"
      />
      <path
        d="M 38 62 L 53 77 L 84 46"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="8" r="7" fill="var(--color-accent)" />
    </svg>
  );
}
