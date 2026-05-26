# Vendoora — Design Tokens + Tailwind + Brand-Styled Homepage

> Inline execution. The pivot from data-model work to visible site progress.

**Goal:** Three things in one plan:
1. **packages/design-tokens** — the Vendoora token system from `docs/prototype/Vendoora_Design_Tokens.html`, packaged as CSS variables + JSON source of truth
2. **Tailwind v4 in apps/web** consuming the tokens via @theme
3. **Brand-styled homepage** at `apps/web/app/page.tsx` — replacing the bare `<h1>{BRAND_NAME}</h1>` with a hero + brand colors + Inter Tight typography + a categories grid reading from the seeded `categories` table

**Why one plan:** Each step alone is incomplete. Tokens without Tailwind don't produce visible output. Tailwind without tokens uses Tailwind defaults instead of Vendoora brand. Both without a homepage doesn't show the user anything. Together, this is "the site is visibly real."

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P1 Foundation (Playbook §3.1.6 — design system + §3.1.9 marketing site stub)
**Estimated session time:** 3-4 hours

## Approach

**Phase A — `packages/design-tokens`:**
- New workspace package
- `src/tokens.css` — full Vendoora token system: blue scale + neutral + red + status colors, typography (Inter Tight + Fraunces + JetBrains Mono), spacing scale, radius, shadows, motion, z-index, semantic aliases (color-action-primary, color-text-default, etc.)
- `src/tokens.json` — same values machine-readable (future RN consumption, partner integrations)
- Dark mode tokens via `[data-theme="dark"]` selector per Polish_Phase_Addendum §1.8
- Package exports `./tokens.css` and `./tokens.json`

**Phase B — Tailwind v4 in apps/web:**
- Install `tailwindcss@^4` + the PostCSS plugin
- `apps/web/app/globals.css` imports `@vendoora/design-tokens/tokens.css` then declares `@theme` mapping Vendoora CSS vars → Tailwind utility namespace (`--color-primary` → `bg-primary`, `text-primary`, etc.)
- `apps/web/postcss.config.mjs` with the Tailwind PostCSS plugin
- Fonts via `next/font/google` — Inter Tight + Fraunces + JetBrains Mono, weighted to spec
- Smoke test: the existing cross-package-import test still passes; a new visual smoke test (skipped by default, has documented `pnpm -F @vendoora/web dev` instructions for manual verification)

**Phase C — Brand-styled homepage:**
- `apps/web/app/page.tsx` becomes an async server component that calls `prisma.category.findMany()` server-side (no client-side data fetching yet)
- Hero section with Vendoora navy gradient + Fraunces serif accent + tagline
- 12-category grid populated from the DB seed
- "How Vendoora protects you" 4-step trust section (static)
- Footer with policy links (placeholder hrefs)
- Mobile-first responsive (sm/md/lg breakpoints)
- Light mode only this slice; dark mode tokens exist but theme toggle defers to next slice

## Scope (what this DOES)

- [ ] `packages/design-tokens/` workspace package with `tokens.css` (full token system) + `tokens.json` (machine-readable)
- [ ] Tailwind v4 + PostCSS wired into `apps/web` consuming the tokens
- [ ] Inter Tight + Fraunces + JetBrains Mono fonts via `next/font/google`
- [ ] `apps/web/app/page.tsx` translated to a brand-styled async server component
- [ ] `apps/web/app/layout.tsx` updated with the font setup + globals.css import
- [ ] DB data flows into the page: 12 categories rendered from the seeded table
- [ ] Two integration tests in `apps/web/__tests__/`: page-render test (asserts page renders with `Vendoora` brand name + at least 12 category names), tokens-import test (asserts the design-tokens CSS file is reachable)
- [ ] Visual screenshot via `pnpm -F @vendoora/web dev` manual verification step in the verification checklist

## Out of scope

- **Dark mode toggle UI** — tokens exist, but the toggle component + persistence lands in the next UI slice
- **shadcn/ui base components** — defer to a focused packages/ui slice
- **Search bar + cart icon + nav header** — defer
- **Featured products section with real product data** — needs sample products seeded; defer until pilot data lands
- **Trust Center signature visualization** — separate /trust-center route, defer
- **Geo-routing pill ("Shopping as: Liberia/Diaspora")** — Polish_Phase_Addendum §2A, defer to its own slice
- **Browse + category landing pages** — separate plan after this homepage lands

## Files to be created

- `packages/design-tokens/package.json`
- `packages/design-tokens/src/tokens.css`
- `packages/design-tokens/src/tokens.json`
- `packages/design-tokens/README.md`
- `apps/web/app/globals.css`
- `apps/web/postcss.config.mjs`
- `apps/web/__tests__/homepage-render.test.tsx`

## Files to be modified

- `apps/web/package.json` — add `@vendoora/design-tokens` dep + `tailwindcss@^4` + `@tailwindcss/postcss` + `next/font` (already in Next.js, not a new dep)
- `apps/web/app/page.tsx` — full rewrite as brand-styled async server component
- `apps/web/app/layout.tsx` — load fonts + import globals.css
- `apps/web/vitest.config.mts` — add `@vitejs/plugin-react` for `.tsx` test files + `environment: 'jsdom'`

## Test cases (~4)

- [ ] `tokens.css` is parseable and contains key variables (`--blue-700`, `--neutral-900`, `--font-sans`, `--space-6`, `--shadow-md`)
- [ ] `tokens.json` is valid JSON and round-trips with tokens.css values
- [ ] `apps/web/app/page.tsx` renders with brand name in the heading and 12 category names from the DB seed (integration test using @testing-library/react)
- [ ] `pnpm -F @vendoora/web build` succeeds and emits CSS containing `--blue-700` (proves Tailwind is consuming the tokens)

## Manual verification

- [ ] `pnpm -F @vendoora/web dev` starts the dev server
- [ ] Navigate to `http://localhost:3000` — page renders with:
  - Vendoora navy background (or navy hero with white text)
  - Inter Tight typography (no Times New Roman fallback)
  - 12 category cards visible
  - Mobile responsive (resize browser to 380px, content reflows)

## Risks

1. **Tailwind v4 is recently stable** — its `@theme` directive replaces the v3 `tailwind.config.js`. The PostCSS plugin import path changed. Verify against the latest docs during execution.
2. **Vitest + React component testing** — needs `@vitejs/plugin-react` and `jsdom` environment. Existing tests use `environment: 'node'`. Update vitest.config.mts to switch per-file or use separate configs.
3. **Server component testing** — `app/page.tsx` is async and calls Prisma. The integration test mocks Prisma or talks to the test DB. We'll talk to the test DB for consistency with the existing pattern.

---

## Tasks

### Task 1: `packages/design-tokens` scaffold + token CSS + JSON

- [ ] Create `packages/design-tokens/` directory + `src/`
- [ ] Author `tokens.css` — copy verbatim from `docs/prototype/Vendoora_Design_Tokens.html`'s `:root` block (the section between `/* VENDOORA DESIGN TOKENS — Master CSS Variables */` and the dark-mode block)
- [ ] Author `tokens.json` — same values, JSON-shaped (use a flat structure: `{ "color.blue.700": "#1A3DAE", "font.family.sans": "...", ... }`)
- [ ] `packages/design-tokens/package.json` with exports for `./tokens.css` and `./tokens.json`
- [ ] `packages/design-tokens/README.md` — brief usage notes

### Task 2: Tailwind v4 setup in apps/web

- [ ] Add `tailwindcss@^4`, `@tailwindcss/postcss@^4`, and `@vendoora/design-tokens` to `apps/web/package.json`
- [ ] `apps/web/postcss.config.mjs` with the Tailwind PostCSS plugin
- [ ] `apps/web/app/globals.css` — imports `@vendoora/design-tokens/tokens.css`, declares `@import "tailwindcss"`, declares `@theme` mapping Vendoora CSS vars to Tailwind utility classes
- [ ] Update `apps/web/app/layout.tsx` to import globals.css + load fonts via `next/font/google`
- [ ] Run `pnpm install`

### Task 3: Homepage page component

- [ ] Rewrite `apps/web/app/page.tsx` as `async` server component
  - imports `prisma` from `@vendoora/db` + `BRAND_NAME` from `@vendoora/types`
  - calls `prisma.category.findMany({ where: { is_active: true }, orderBy: { display_order: 'asc' } })`
  - returns JSX: hero (navy gradient bg, Inter Tight 800 brand name, Fraunces tagline), 12-category grid, trust section, footer

### Task 4: Tests + manual verification + cold-state + commit + merge

- [ ] Add tokens-CSS parse test
- [ ] Add homepage-render test (uses test DB seed; verifies brand name + ≥12 category names appear in rendered output)
- [ ] `pnpm -F @vendoora/web type-check` + `lint` + `build`
- [ ] `pnpm -F @vendoora/web dev` — manual screenshot verification
- [ ] Commit on `feature/design-tokens-homepage` branch, merge to main
