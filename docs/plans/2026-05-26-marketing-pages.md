# Vendoora — Marketing / Policy Pages (Trust Center + Protection + Pricing)

> Inline execution. Content-heavy, no schema.

**Goal:** Fill in the three highest-priority marketing/policy pages that existing UI links to with 404s:

1. `/trust-center` — Polish_Phase_Addendum §1.5: navy hero "Every dollar. Every order. Verified at the door." + 4-step mechanism diagram + live network stats (stubbed for now) + 4 trust pillars
2. `/protection` — Polish_Phase_Addendum §2.2 Gap #10: buyer protection page with "What you're protected against" (6 categories), "What we don't cover" (5 exclusions), "How to open a dispute" (6 steps), Insurance Fund panel
3. `/pricing` — public-facing seller SaaS-tier comparison table (Starter / Growth / Pro / Enterprise), pulled from the existing `SaasPlan` enum values

Deferred (still 404 after this slice): `/safe-shopping`, `/seller-verification`, `/kyc-policy`, `/kyc-policy-doc`, `/delivery-code`, `/brand` (the design system viewer is its own substantial slice).

---

**Date:** 2026-05-26
**Estimated complexity:** M (content-heavy, no schema)
**Phase:** P2 Core Marketplace + Polish_Phase_Addendum §2.2
**Estimated session time:** 2 hours

## Approach

All three are **static server components** — no DB queries, no Server Actions. Just brand-aligned content using existing design tokens and Tailwind utility classes. Each page exports `dynamic = 'force-static'` so Next renders them as static HTML at build time (unlike the rest of the app which is SSR per request).

**`/trust-center`** mirrors the homepage's "How Vendoora protects you" trust panel but bigger:
- Navy gradient hero with the signature line in Fraunces italic
- 4-step mechanism (pay → code → driver → seller paid) — larger, more breathing room
- "Live network stats" strip (stubbed: $2.4M in escrow, 99.7% code-verified, 0.4% disputes, 100% sellers KYC-verified)
- 4 trust pillars (Verified sellers, Money in escrow, Code at the door, Insurance fund)

**`/protection`** is the comprehensive policy explainer:
- Hero with the protection promise
- "What you're protected against" (6 cards: Not delivered, Damaged, Wrong item, Counterfeit, Quality issue, Fraud)
- "What we don't cover" (5 honest exclusions)
- "How to open a dispute" (6 steps with screenshots/icons placeholder)
- Insurance Fund panel with the $248K balance + 100% disputes funded + $0 cost-to-you (stubbed stats)

**`/pricing`** is the seller-acquisition page:
- Hero
- 4-column comparison table (Starter free / Growth $15/mo / Pro $45/mo / Enterprise custom)
- Commission rate per tier (12% / 10% / 8% / 5-7%)
- Feature differences (listings limit, pinned slots, instant payouts, SEO controls, etc.)
- "Start selling" CTA stub (links to "/seller-onboarding/1" which doesn't exist yet — flag for the seller onboarding slice)

## Scope

- [ ] `apps/web/app/trust-center/page.tsx` — static server component
- [ ] `apps/web/app/protection/page.tsx` — static server component
- [ ] `apps/web/app/pricing/page.tsx` — static server component
- [ ] Smoke tests verifying each route renders (build succeeds + key text appears in the rendered output)
- [ ] All three pages cross-link each other where natural

## Out of scope

- Live network stats from real DB (P3 surface — needs the read-models aggregating real escrow/dispute/KYC counts; defer)
- `/brand` design system viewer — substantial scope on its own
- `/kyc-policy` + `/kyc-policy-doc` — separate slice
- `/safe-shopping` + `/seller-verification` — separate slice
- `/delivery-code` mechanic explainer — separate slice
- A11y audit, screen-reader testing — flag for a focused a11y slice later
- Internationalization (en is fine; fr is v1.1 per Engineering_Spec §19)

## Files to be created

- `apps/web/app/trust-center/page.tsx`
- `apps/web/app/protection/page.tsx`
- `apps/web/app/pricing/page.tsx`

## Files to be modified

None (other surfaces already link to these paths).

## Tests

Smoke-level. Since the pages are pure server-rendered HTML with no DB queries, the test asserts:
- Each route compiles in `next build` (covered by build verification)
- Lint passes (covered by lint step)

No new vitest tests; the build step is the verification surface.

## Risks

1. **Long static content can be brittle** — typos in copy land in commits. Mitigation: keep copy concise, use the prototype HTML as reference, don't fabricate stats.
2. **The "live stats" on /trust-center are stubbed** — must be clearly marked as illustrative. The Polish_Phase_Addendum §1.5 implementation note says these MUST come from real production data and auto-hide if degraded. Adding a small visible "Illustrative — production wires these to real data" footnote.

---

## Tasks

1. /trust-center page
2. /protection page
3. /pricing page
4. Build + lint + commit
