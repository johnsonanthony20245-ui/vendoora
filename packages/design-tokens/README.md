# @vendoora/design-tokens

The Vendoora brand design token system. Source of truth for colors, typography, spacing, radius, shadows, and motion.

## Usage

**Web (Next.js + Tailwind v4):**

```css
/* apps/web/app/globals.css */
@import "@vendoora/design-tokens/tokens.css";
@import "tailwindcss";

@theme {
  --color-primary: var(--color-action-primary);
  --color-text: var(--color-text-default);
  --font-sans: var(--font-sans);
  /* ...etc — map Vendoora primitives to Tailwind utility classes */
}
```

**Future React Native / partner integrations:** consume `tokens.json` (same values, structured form).

## Token hierarchy

1. **Primitives** — `--blue-700`, `--neutral-900`, `--space-6`, `--shadow-md`, etc. Don't use these directly in product code unless you're authoring a semantic alias.
2. **Semantic aliases** — `--color-action-primary`, `--color-text-default`, `--color-surface-base`, etc. Use these in product code. They survive dark-mode inversion and brand tweaks.

## Dark mode

Toggle by setting `data-theme="dark"` on the `<html>` element. The semantic tokens re-resolve automatically; primitives stay constant.

## Source

Mirrors [`docs/prototype/Vendoora_Design_Tokens.html`](../../docs/prototype/Vendoora_Design_Tokens.html). When the prototype tokens change, update both files in lockstep.
