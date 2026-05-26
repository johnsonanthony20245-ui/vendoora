# Vendoora — Polish Phase Addendum

**Version:** 1.3 · May 2026 (extended with Merge Phase + Geo-Routing Phase + Admin Tools Phase)
**Supersedes:** Nothing. **Extends:** `Engineering_Spec.md`, `Build_Prompt.md`, `Phased_Build_Playbook.md`

This addendum documents four phases of additions to the Vendoora prototype after the original engineering trilogy was locked:

- **Polish Phase** (sections 1, 3, 5) — 21 features added across buyer trust visibility, 5-stage tracking, seller onboarding, Trust Center signature, notifications, admin operations, UX polish
- **Merge Phase** (section 2) — consolidation of 16 standalone prototype HTML files into the master `Vendoora_App.html`, adding 11 new routes and ~1,500 lines while preserving every section/heading/treatment from the source files
- **Geo-Routing Phase** (section 2A) — 3-layer audience detection system (URL > localStorage > IP), persistent "Shopping as" pill, first-visit onboarding modal, plus complete dual-homepage improvements (LRD-first pricing on Liberia / USD-first on diaspora; "Just listed today"; Featured by city; WhatsApp CTA; Multi-payment row; Holiday countdown; Currency converter; Group-gift hero; Photo-of-delivery showcase)
- **Admin Tools Phase** (section 2B) — full data analytics and operational control for admin role: dedicated Analytics dashboard with 8 chart types (line, bar, donut, sparkline, funnel, stacked bar, area, heatmap), Financial Control Center with escrow ledger and payout queue, Operations Command with live Monrovia map and service health grid, Platform Configuration with commission matrix, feature flags, holiday calendar, and notification template editor

All features here are **additive** — they extend the existing scope; they do not replace any locked behavior.

**Scope impact:** ~74 new features bringing total MVP scope from ~189 to **~265 features**. The 18-24 month MVP timeline is unchanged — these features are layered into existing phases (P1, P2, P3, P4, P5, P6, P7, P8) without extending the critical path.

---

## 1. What changed in the prototype

### 1.1 Buyer-side trust visibility (P2 Core Marketplace addition)

**Where:** All product cards across Browse, Home featured row, search results, category landing pages.

**What was added:**
- **Trust Score display** — every product card now shows the seller's composite trust score (0-100) next to the seller name. Score is a deterministic calculation from On-time delivery (30%), Code-verification rate (25%), Dispute-free rate (20%), Fulfillment speed (15%), Buyer response time (10%).
- **KYC tier pill** — every product card shows `T2 VERIFIED` / `T3 VERIFIED` / `T4 ELITE` with the appropriate color treatment (gray / blue / gold).
- **Escrow + Code indicators** — green `ESCROW` pill and red `CODE` pill on every product card, making the trust mechanism visible at-a-glance during browse.

**Engineering implementation notes:**
- Trust Score is computed server-side on product list endpoints. Cache for 1 hour. Recompute nightly + on any significant event (new dispute, KYC tier change, payout failure).
- Pills are rendered as small SVG-bearing badges using the brand palette. Mobile responsive: pills wrap to a second row below 380px.
- Add `trust_score` to the product DTO returned to the buyer client. Do not return component breakdowns at this endpoint — those are on the seller analytics endpoint only.

### 1.2 Product page "How this order is protected" section (P3 Trust Mechanic addition)

**Where:** Every product detail page (PDP), inserted between the trust card and reviews section.

**What was added:**
- **Navy gradient panel** with the 4-step protection flow visualized: Pay into escrow → Code by SMS → Driver arrives → Seller paid.
- Each step renders with a gold number, title, description, and status pill (HELD SAFELY / CODE ARRIVES / YOU DECIDE / DONE).
- **Dashed gold connector line** running between steps to show flow.
- **Footer** showing seller verification claim + "Learn how Vendoora protects you →" link routing to `/trust-center`.

**Engineering implementation notes:**
- This is a static component — no API dependencies. The seller name and KYC level are pulled from the product's seller DTO.
- The "Learn more" link routes to `/trust-center` which now contains the full signature trust visualization.
- Component must remain visible on every PDP without dismissal. It is intentionally not collapsible. This is the trust narrative made visible at the moment of purchase.

### 1.3 5-stage post-checkout buyer flow (P2 Core Marketplace refactor)

**Where:** `/tracking` route refactored to accept a stage parameter `/tracking/N` where N is 0-4.

**What was added:** Five distinct emotional moments instead of one tracking page.

| Stage | Title | Status Pill | Driver Visible | Code Visible |
|-------|-------|-------------|----------------|--------------|
| 0 | Payment confirmed | PAID INTO ESCROW (green) | No | No |
| 1 | Seller is preparing | BEING PREPARED (amber) | No | No |
| 2 | Your code is live | DRIVER EN ROUTE (navy) | Yes | Yes (revealable) |
| 3 | Out for delivery | ARRIVING NOW (red) | Yes | Yes |
| 4 | Delivered. Code verified. | COMPLETE (green) | Yes (complete) | Yes (verified celebration card) |

**Engineering implementation notes:**
- The stage is determined by the order's actual status in the database — buyer client polls/subscribes to order status updates. The route is `/orders/:orderId/tracking` in production (the prototype uses simplified routing).
- The verified-code celebration card at stage 4 shows the actual delivery code that was verified, along with the payout breakdown (seller receives X, driver receives Y).
- A "Simulate next stage →" button exists in the prototype for demos — this MUST be removed in production. Real stage transitions happen via the seller's "Mark shipped" action, the driver's "Pickup complete" + "Code entered" events.
- Push notifications fire on every stage transition. Stage 2 is the critical one (code-live notification, SMS + push + WhatsApp on Pro+).

### 1.4 Seller onboarding (P4 Seller Infrastructure addition)

**Where:** New `/seller-onboarding/:step` route, 5 steps (1-5).

**What was added:**

| Step | Title | Content |
|------|-------|---------|
| 1 | Welcome | Value props: "You always get paid" / "700K+ diaspora buyers" / "Your KYC tier is public" / "Built-in growth tools" |
| 2 | Business details | Business name, role, primary category, address, years in operation, referral source |
| 3 | KYC documents | Tier 2 (required: Gov ID + selfie). Tier 3 (recommended: LBR registration, LRA tax cert, premises photos, supplier invoices) |
| 4 | Payouts | MTN MoMo / Orange Money / bank choice + account holder name. Choose plan: Starter (free) or Growth ($15) |
| 5 | First listing | Product name, price, stock, category, 4 photo upload zones, description |

**Engineering implementation notes:**
- All steps must be resumable — save state to seller record on each "Continue" click. If a seller drops off at step 3 and returns 2 days later, they pick up where they left off.
- Step 3 (KYC) submissions go to the Trust & Safety queue for human review. SLA: Tier 2 instant-or-1hr, Tier 3 within 24h.
- Step 5 product is published in DRAFT status until KYC clears. Once Tier 2 KYC clears, all DRAFT products auto-publish.
- After step 5 submission, redirect to `/seller` (the seller dashboard) with a welcome toast.

### 1.5 Trust Center signature visualization (P3 Trust Mechanic addition)

**Where:** `/trust-center` route — the signature trust mechanism panel was prepended above the existing pillar cards.

**What was added:**
- **Big navy gradient hero** with headline "Every dollar. Every order. *Verified at the door.*" (gold italic accent on the third line).
- 4-step mechanism diagram (same pattern as PDP but larger and with more breathing room).
- **Live network stats strip** at the bottom: $2.4M in escrow / 99.7% code-verified / 0.4% disputes / 100% sellers KYC-verified.

**Engineering implementation notes:**
- The 4 stats at the bottom MUST be real, computed from production data. Refresh hourly. If a stat ever degrades (e.g., dispute rate above 1%), the panel auto-hides the failing stat rather than display embarrassing numbers.
- The "$2.4M in escrow" stat refreshes more frequently (every 15 min) since it changes continuously.
- This screen is the shareable brand moment — design intentionally for screenshot virality. Buyers should be able to send a screenshot of `/trust-center` to a hesitant friend and have it speak for itself.

### 1.6 Buyer notifications surface (P2 Core Marketplace addition)

**Where:**
1. **Header bell icon** added between search and cart, with a red unread-count badge.
2. New `/notifications` route showing the full notification feed.

**What was added:**
- 8 notification types: delivery, code, order, review, promo, order-complete, diaspora, trust.
- Each notification has: colored icon (matching type), title, meta line, timestamp, unread dot, contextual CTA link.
- Unread notifications have a subtle gradient highlight on their row.
- Bottom info-callout explaining notification channels (SMS for critical, toggleable for marketing).

**Engineering implementation notes:**
- Notification storage: `notifications` table partitioned by user_id and created_at. Hard delete after 90 days.
- Push channels in priority order: SMS (always, for critical) > Push (if device registered) > Email (if opted in) > WhatsApp (Pro+ only) > In-app banner.
- "Critical" notifications (code-live, driver-arriving, dispute-decision) are always sent over SMS regardless of toggles.
- Build the notification settings page to let users toggle marketing/promo channels independently from order/trust channels.

### 1.7 Admin operations depth (P6 Admin/RBAC addition)

**Where:** Three new admin screens added to admin nav.

**`/admin-reports`** — Exportable KPI snapshots
- Top-level KPIs: GMV, orders, active sellers, disputes opened (all with MoM deltas)
- Seller health table (active, new, churned, by tier)
- Buyer activity table (unique buyers, repeat buyers, diaspora share, AOV)
- Escrow & trust mechanics strip ($2.4M held, 99.7% code-verified, 0.4% disputes, 14h T&S avg)
- Vendoora revenue breakdown (commission, SaaS, FX, delivery, ads)
- Saved & scheduled reports table

**`/admin-drivers`** — Driver management
- KPIs: active drivers, deliveries this month, avg rating, flagged accounts
- Filter tabs: All / Active / Flagged / Re-verification
- Driver table: avatar, name/ID/city, rating, deliveries, code-rate (color-coded), last active, status pill
- Action-required callout for flagged drivers

**`/admin-moderation`** — Content moderation queue
- KPIs: open queue, avg resolution time, resolved this week, auto-flagged today
- Filter tabs: All / High priority / Counterfeit / Auto-flagged
- Queue rows: priority pill, case ID, type, target listing, seller, reporter, reason, age, action buttons (Review / Dismiss / Take down)
- Info-callout explaining moderation SLAs

**Engineering implementation notes:**
- All three pages are admin-only routes. RBAC: Admin role + "reports" permission for reports, "drivers" permission for drivers, "moderation" permission for moderation.
- Reports CSV export: generate server-side, deliver via email link rather than direct download (most reports are 5MB+).
- The "auto-flagged today" number on moderation comes from the ML content scanner — listings with profanity, suspicious-cheap prices, image-reuse detection.
- Take-down action requires confirmation modal in production (not just a toast). Audit log entry for every take-down.

### 1.8 UX polish layer

**What was added:**
- **Skeleton/shimmer CSS** (`.skeleton-pulse`) ready for use in production loading states — apply to initial data fetches.
- **Visible focus rings** via `:focus-visible` on all interactive elements (buttons, links, inputs, nav items, product cards). Uses primary brand color (#1A3DAE) with 2px outline and 2px offset.
- **Working search bar dropdown** with: Recent searches / Popular right now / Browse by category. Toggle-able on focus/blur.
- **Empty state** styles for filtered-result-empty / no-products / no-orders pages.
- **Print stylesheet** (`@media print`) hiding nav/header/buttons, ensuring receipts and reports print cleanly.

**Engineering implementation notes:**
- Search dropdown is a starting point — production version needs to actually call the search service. Use Algolia or self-hosted Meilisearch.
- Skeletons should appear during any initial data fetch >300ms (snappier loads don't need them).
- Print stylesheet has been tested for receipt pages and admin reports. Verify on additional surfaces during P2.

### 1.9 Copy + Help content

**What was added:**
- **Seller help center** — 6 articles with real content (not just toast placeholders). Articles: Getting started in 15 minutes / Photos that convert / Authenticity & proof / Handling a dispute / Selling to the diaspora / Tools to grow faster. Each card includes a 3-sentence preview that's actually useful.
- **Real placeholder copy** replacing some "Coming soon" toasts with sharper text.
- The full article bodies will be authored during P4 by the marketing/T&S team — the current cards are tightly-written previews that serve the demo and frame the eventual full articles.

---

## 2. Merge Phase — Standalone-to-App consolidation (May 2026)

After the polish phase shipped, an audit revealed that the 16 standalone Vendoora_*.html prototypes contained content (sections, copy, design treatments, screens) that hadn't been folded into the master `Vendoora_App.html`. This created a risk of artifact conflict — an engineer or designer reading two artifacts that said different things and not knowing which was authoritative.

The Merge Phase resolved this by methodically reading every standalone file, identifying gaps against the App, and merging every missing piece — preserving all content from all artifacts with no editorial cuts.

### 2.1 Source files audited

The 16 standalone files audited and merged from:

1. `Vendoora_Homepage.html` (66 KB · 2,117 lines)
2. `Vendoora_Diaspora_Flow.html` (133 KB · 4,126 lines)
3. `Vendoora_Seller_Console.html` (156 KB · 3,779 lines)
4. `Vendoora_Checkout_Flow.html` (119 KB · 3,398 lines)
5. `Vendoora_Mobile_Apps.html` (234 KB · 5,537 lines)
6. `Vendoora_Monetization.html` (50 KB · 1,031 lines)
7. `Vendoora_Product_Trust.html` (55 KB · 848 lines)
8. `Vendoora_Trust_Operations.html` (42 KB · 666 lines)
9. `Vendoora_System_Operations.html` (43 KB · 776 lines)
10. `Vendoora_Public_Pages.html` (38 KB · 547 lines)
11. `Vendoora_Visual_Prototypes.html` (56 KB · 1,903 lines) — design-decision artifact, kept for reference
12. `Vendoora_Design_Tokens.html` (51 KB · 1,228 lines) — design-system reference
13. `Vendoora_Logo_Concepts.html` (31 KB · 990 lines) — design-system reference
14. `Vendoora_Iconography_System.html` (51 KB · 1,106 lines) — design-system reference
15. `Vendoora_Typography_Comparison.html` (39 KB · 1,255 lines) — design-system reference
16. `Vendoora_Photography_Direction.html` (45 KB · 1,341 lines) — design-system reference

**Authority hierarchy going forward:** `Vendoora_App.html` is canonical. The 16 standalone files are kept as historical artifacts (they show the design-iteration process) but engineering decisions and content should reference the App.

### 2.2 What was merged

**Homepage additions:**
- Testimonials section with 3 named-quote cards (Fatu Kollie buyer · Konah Tubman seller · James Williams diaspora)
- Featured verified sellers row with 4 storefront preview cards (Konah Boutique T3 · Mariama's Liberian Crafts T3 · Sundayma Foods T4 · Bessie's Fabrics T3)
- Expanded 4-step mechanism narrative — full paragraphs instead of brief labels

**Diaspora expansion (Gap #2):**
- Bundles count expanded from 6 to 8 — added "Take Care of Mom Box" ($145, 8 items, MOST POPULAR) and "Mom's 70th Birthday Box" ($425, 9 items, LIMITED EDITION)
- "Most-sent to Liberia" row showing bundle rankings with order counts
- "Curated by Vendoora" merchandising callout explaining how bundles are assembled by the Sinkor curation team

**Public/Legal pages expansion (Gap #10 — largest content add):**
- `/protection` (Buyer Protection) — added 4 detailed sub-sections: "What you're protected against" (6 categories with icons + descriptions), "What we don't cover" (5 honest exclusions), "How to open a dispute" (6-step ordered guide), Insurance Fund (with $248K balance + 100% disputes funded + $0 cost-to-you stats in navy gradient panel)
- `/kyc-policy` — NEW page explaining the 5-tier KYC ladder (T0 through T4), what's checked at each tier (12-row matrix), why it matters for buyers, re-verification and demotion policies
- `/kyc-policy-doc` — NEW regulator-facing full policy document (Sections 1-6: Purpose / Scope / Verification tiers / Required documentation by tier / Document review process / Document storage and security)
- `/delivery-code` — NEW page explaining the 6-digit code mechanic (4-step flow, fraud-proofing math, what-if scenarios: not home / problem at delivery / lost code / code doesn't work)

**Brand/Design System unified (Gap #11):**
- NEW `/brand` route with 5 tabs replacing 5 separate standalone files:
  - `/brand/tokens` — Color system (6-color blue scale, 3-color red scale, 4 status colors), Typography (7-tier scale), Spacing (8 sizes), Border Radius (7 sizes), Shadows (4 levels), Motion (3 speeds), Copy-into-codebase CSS block
  - `/brand/logo` — Wordmark in Inter Tight 800 with red dot, hexagonal verified seal mark, lockup, scale test 14-80px, V monogram
  - `/brand/icons` — Lucide base library + 6 custom Vendoora icons (Verified Seal / Delivery Code / Escrow Shield / MTN MoMo / Orange Money / Verified Seller Badge), size scale, KYC tier badges
  - `/brand/type` — Inter Tight (workhorse, 95% of system) + Fraunces (marketing only) + JetBrains Mono (numbers/codes), with explicit rule about transactional vs storytelling surfaces
  - `/brand/photo` — Tiered standards by KYC level (Tier 1 loose / Tier 2-3 strict / Tier 3+ Vendoora service), 4 photography categories (Product / Portraits / Lifestyle / Operational), mandatory standards

**Checkout variants (Gap #4):**
- NEW `/refund-breakdown` route — post-dispute settlement screen showing: Refund approved hero with payout amount, How your refund breaks down (line-item table), What happened to each party (3 color-coded panels: Buyer +$62 / Seller −$62 / Driver +$2), When you'll see the refund (4-step timeline), If you have concerns callout

**System Operations expansion (Gap #9):**
- Dead Letter Queue section in `/admin-system` — 3 failed events (notification.send timeout, payout.disburse 503, webhook.notify connection refused) with manual retry buttons
- Maintenance mode section — current status indicator + schedule new window button + recent maintenance windows table (3 historical windows with date/scope/impact)
- Admin audit log — 6 recent admin actions (CASE_RESOLVED, SELLER_TIER_UPGRADE, KYC_APPROVED, DRIVER_FLAGGED, COMMISSION_CHANGE, LISTING_TAKEDOWN) with risk-coloring (normal/high/critical), timestamps, admin attribution, target entities, CSV export

**Mobile / Driver enhancement (Gap #5):**
- `/driver-code` enhanced with Photo Capture step BEFORE code entry — driver now: (Step 1) takes photo of package at door with auto-overlay (timestamp + GPS + order ID + driver ID), then (Step 2) enters the 6-digit code. This matches the standalone's "Code Entry & Photo Capture" pattern.

### 2.3 What was already present (no merge needed)

During the audit several "missing" items turned out to already exist in the App at sufficient depth:

- **Product Trust disclosure form** (Gap #7) — `/seller-product-edit` already has Condition (5-chip selector), Authenticity Claim (3-option select with proof upload zone), Warranty & Returns (2 selects + buyer-protection callout). No work needed.
- **Browse filters by condition + authenticity** (Gap #7) — `/browse` sidebar already has Condition / Authenticity / Seller tier / Rating filter groups with counts. No work needed.
- **Seller Console rich product form** (Gap #3) — already has 7 editor sections (Photos / Basic info / Variants / Condition & Authenticity / Pricing / Warranty & Returns / Status sidebar). No work needed.
- **Verification audit log** (Gap #3) — `/seller-kyc` already shows "What we've verified" with each check marked, dated, and attributed. No work needed.
- **Store Settings sub-sections** (Gap #3) — `/seller-settings` already has Store Identity / Operations / Contact & Pickup. No work needed.
- **Case-detail audit log** (Gap #8) — `/admin-case` already has full chronological timeline with buyer evidence (with attachments), seller response (with attachments), system delivery check, T&S review notes, system escrow-hold event. No work needed.
- **Counterfeit case workflow** (Gap #8) — the example case in `/admin-case` IS a counterfeit case ("Buyer reports counterfeit goods received" — Vlisco wax print). No work needed.
- **Webhook log** (Gap #9) — `/admin-system` already has 10 recent events with type/target/status/retry-counter. No work needed.
- **Diaspora checkout variant** (Gap #4) — `/gift-checkout` already exists as a specialized diaspora flow distinct from regular checkout. No work needed.
- **Dispute-in-flight screen** (Gap #4) — `/dispute` already renders "Under review by Trust & Safety" status with frozen-in-escrow indicator and case timeline. No work needed.
- **Driver onboarding expansion** (Gap #5) — `/driver-onboarding/1-3` already covers the 3-step flow. The standalone's deeper detail is reflected in the existing copy.

### 2.4 What was intentionally deferred (lower priority)

These items were considered during the merge but kept out of the App to avoid scope creep:

- **Direction A/B/C comparison screen** — `Vendoora_Visual_Prototypes.html` is a design-decision artifact showing the three explored directions before Direction A "Confident & Institutional" was locked. Could be a `/brand/directions` reference page but adds historical-archive content that engineers/investors don't need to see. Stays in the standalone file.
- **Promoted Listings campaign creator** — the actual ad-buying flow with budget/duration/audience controls. Currently the App shows entry points but not the full creation flow. Deferred to v1.1 backlog per the original deferred-items list.
- **Buyer-side "Vendoora+" subscription** — appears in the monetization standalone as a future revenue stream. Not in MVP.

### 2.5 Merge methodology applied

For every gap identified:

1. Read the source standalone file's relevant section
2. Extract the HTML + CSS verbatim
3. Adapt class names to match the App's existing conventions
4. Insert into Vendoora_App.html via str_replace or Python script
5. Verify JS still validates via `node --check` after each edit
6. Render via Playwright to confirm visual integrity
7. Test all routes after every 2-3 categories

**No editorial decisions.** Every section heading from every standalone got a home, either as a new screen, a new section within an existing screen, or a merge-target where the App's version was kept and the standalone's additional content was layered on.

### 2.6 New routes added in the merge

11 new routes (App now has 75 total):
- `/protection` — expanded with 4 new sub-sections
- `/kyc-policy` — NEW
- `/kyc-policy-doc` — NEW
- `/delivery-code` — NEW
- `/brand` (defaults to tokens)
- `/brand/tokens` — NEW
- `/brand/logo` — NEW
- `/brand/icons` — NEW
- `/brand/type` — NEW
- `/brand/photo` — NEW
- `/refund-breakdown` — NEW

### 2.7 File metrics

- **Pre-merge:** Vendoora_App.html · 17,763 lines · 847 KB · 64 routes
- **Post-merge:** Vendoora_App.html · 19,269 lines · 965 KB · 77 routes (75 navigable + 2 demo states)
- **Net addition:** +1,506 lines · +118 KB · +13 navigable routes

### 2.8 Engineering implementation notes

Most merge-phase additions are display-layer or content-layer additions to surfaces that already had server-side support. Specifically:

- **Refund Breakdown screen** requires a new `GET /api/orders/:id/refund-breakdown` endpoint returning the per-party allocation. Implementation guideline: compute from the dispute resolution event + original order ledger; cache for 60 days.
- **Dead Letter Queue** requires real DLQ infrastructure — recommend `pgmq` (Postgres message queue) extension with an `events_dlq` table. Manual-retry buttons trigger a `POST /admin/dlq/:id/retry` endpoint that re-enqueues the failed event with retry-count reset to 0.
- **Maintenance mode** requires a `system_maintenance_windows` table and a feature flag service. Banner copy is templated; SMS/email are sent T-24h, T-1h, and T-0 to all active buyers + sellers.
- **Admin audit log** requires the existing `admin_actions` table to be enriched with risk classification (normal/high/critical) — risk level is derived from action type via a small classification table.
- **Brand design system** (`/brand/*`) is entirely static content; no backend required. The CSS code block in `/brand/tokens` should also be available at `https://vendoora.com/tokens.css` for partner integrations.
- **Photo capture step in driver app** requires the existing photo-upload endpoint to accept a `purpose: 'delivery_proof'` parameter. The auto-overlay is server-side (driver app uploads raw photo, server adds timestamp + GPS metadata before storing).

### 2.9 Acceptance criteria — merge phase

- [ ] All 16 standalone files' content is accessible somewhere in `Vendoora_App.html` (either as new routes, expanded sections, or verified-already-present items)
- [ ] `Vendoora_App.html` is the canonical source. All eng/design references should point here, not the standalones
- [ ] All 77 routes render without JS errors (excluding the pre-existing `review/o001` failure which predates the merge work)
- [ ] Mobile responsive at 380px on every new route (especially `/brand/*` and `/refund-breakdown`)
- [ ] Dark mode works on every new component
- [ ] The 16 standalone files remain in `/mnt/user-data/outputs/` as historical reference, but are NOT treated as authoritative for engineering or design decisions going forward

### 2.10 Phase impact summary — merge additions

The merge adds work to existing phases as follows:

| Phase | Original polish-phase add | Merge-phase add | Combined |
|-------|--------------------------|-----------------|----------|
| P1 Foundation | 0 | 0 | 0 |
| P2 Core Marketplace | +5w polish | +1w (homepage testimonials, search results) | +6w |
| P3 Trust Mechanic | +2w | +2w (refund breakdown, expanded protection page, delivery-code page, KYC policy pages) | +4w |
| P4 Seller Infrastructure | +4w | 0 (already present) | +4w |
| P5 Diaspora | 0 | +1w (2 new bundles + curated callouts + most-sent row) | +1w |
| P6 Admin/RBAC | +3w | +2w (DLQ, maintenance mode, audit log) | +5w |
| P7 Driver Logistics | 0 | +1w (photo capture step in driver code entry) | +1w |
| P8 Integration/Pilot | distributed | 0 | distributed |
| **Cross-cutting** | n/a | +2w (`/brand/*` design system pages — static content but ~1,500 lines of CSS-and-content) | +2w |

**Critical path impact:** None. All additions are parallel to existing phase work. P3 (the highest-risk phase) absorbs the most merge work (refund breakdown, KYC policy pages, delivery-code mechanic) but these are content + display additions over existing escrow/code/dispute infrastructure.

---

## 2A. Geo-Routing Phase — Audience detection + dual-homepage personalization (May 2026)

After the merge phase shipped, the next step was to make the Vendoora experience adapt to each audience automatically. A Liberian buyer in Sinkor and a diaspora buyer in Atlanta want fundamentally different things from their first screen — local LRD pricing + 4-hour delivery promise vs. USD pricing + gift bundles + photo-of-delivery emotional sell. The geo-routing phase implements both the technical detection layer and the per-audience homepage personalization.

### 2A.1 The 3-layer detection system

Implemented as `GeoRouter` object in the app's JavaScript. Authority order (highest first):

1. **URL query parameter** (`?as=local` or `?as=diaspora`) — overrides for current session, also persists to localStorage
2. **localStorage explicit choice** (`vendoora-audience` key) — persists forever, set when user explicitly picks via switcher or first-visit modal
3. **IP geo-detection** (ipapi.co free tier) — first-time visitors only; country code `LR` → `'local'`, anything else → `'diaspora'`

**Failure modes:** IP API timeout (2.5s limit) → defaults to `'local'`. localStorage blocked → silent fall-through. URL `?demo-geo=LR` query param overrides IP API for prototype demos.

### 2A.2 The persistent "Shopping as" pill

Added between header search bar and notifications bell. Always visible across all routes. Shows current audience with flag (🇱🇷 Liberia / ✈️ Diaspora). Clicks open a dropdown with both options, green check on current, detection source footer. Switching triggers immediate route + toast confirmation.

### 2A.3 First-visit onboarding modal

Triggered only on first visit with no stored preference. Modal with "👋 WELCOME TO VENDOORA / Where are you shopping from?" + two large option cards with RECOMMENDED FOR YOU badge on detected option + 4 feature bullets per option. Footer: "You can switch any time using the 'Shopping as' button at the top." Dismisses on choice.

### 2A.4 Audience-aware pricing helper

New `Screens.renderPrice(usdPrice, compareAt)` function replaces hard-coded `$${price.toFixed(2)}` patterns in product cards.

Local audience: `L$11,160` primary + `≈ $62.00 USD` secondary
Diaspora audience: `$62.00` primary + `L$11,160` secondary

Exchange rate constant: `1 USD = 180 LRD` (May 2026). Production: fetch daily from Central Bank of Liberia API, cache 1 hour.

### 2A.5 Liberia homepage improvements (audience === 'local')

Five new sections on `/home`:

- **Local Promise Strip** — 4-tile gradient panel after hero: ⚡ Delivered in 4 hours · 💳 MoMo first · 💬 WhatsApp support · 🚚 Free over L$9,000
- **Just Listed Today** — freshness row with pulsing green dot, 6 product cards showing time-ago (4m / 12m / 32m / 1h / 2h / 3h) + seller city + LRD price
- **WhatsApp Support CTA** — green gradient banner with phone number (+231 88 555 0149) and Message us button
- **Featured by City** — city tab selector (Sinkor / Paynesville / Old Road / Congo Town / Bushrod) + 4 nearby seller cards with distance (0.9-3.1 km) and avg delivery time (22-45 min)
- **LRD-first product pricing** — applied to all product cards globally

### 2A.6 Diaspora homepage improvements (audience === 'diaspora')

Six new sections + hero rewrite on `/diaspora`:

- **New hero headline:** "Send a Care Box home in *under 5 minutes.*" — time-to-completion promise
- **Updated subhead:** adds "Pay in your local currency" + "Photo of delivery sent to your phone"
- **Updated trust line:** "Apple Pay, Google Pay, Card, PayPal, Zelle"
- **Multi-Payment Methods Callout** — 5-method strip with branded logos (Apple Pay, Google Pay, VISA Card, PayPal, Zelle)
- **Currency Converter Context Strip** — "$50 ≈ L$9,000 (week of groceries) · $100 ≈ L$18,000 (month of phone credit) · $200 ≈ L$36,000 (school fees)" — concrete purchasing-power references
- **Holiday Countdown Banner** — red-to-amber gradient with gift icon, countdown to next Liberian holiday (Independence Day July 26), 3-pill countdown + CTA promotion
- **Group Gift Hero** — gold gradient panel "Chip in for Mom's birthday with the whole family" + 3 feature bullets + CTA "Start a group gift" + social proof "487 groups active this week"
- **Photo of Delivery Showcase** — 3 testimonial cards with timestamp + GPS overlay frame, recipient emoji, quote, sender attribution. Eyebrow: "📸 PROOF OF JOY / You see the moment *it arrives.*"

### 2A.7 Engineering notes for production

- **Geo-detection API:** ipapi.co rate-limited to 1,000/day. For production, switch to MaxMind GeoLite2 (offline) or Cloudflare Workers `request.cf.country` (zero-latency).
- **Privacy:** Add cookie/privacy notice about IP-based detection. Opt-out defaults to diaspora.
- **VPN handling:** ~5-8% wrong detection — pill switcher + persistent localStorage mitigates. Never hard-lock; always allow override.
- **Holiday calendar:** Implement as `holidays_lr` table with CMS surface for admins to add ad-hoc holidays.
- **Group gift mechanics:** Need backend support — contribution tracking, multi-currency conversion to USD at lock-in, payout split, shared delivery code across contributors.
- **Currency converter context:** Dynamic from CMS reference table updated quarterly based on actual LRD inflation.

### 2A.8 Acceptance criteria

- [ ] First-time visitor with Liberia IP lands on `/home` with no manual interaction
- [ ] First-time visitor with non-Liberia IP lands on `/diaspora`
- [ ] First-visit onboarding modal appears once, then never again
- [ ] "Shopping as: X" pill visible in header on every route
- [ ] localStorage `vendoora-audience` persists choice across sessions
- [ ] URL `?as=local` / `?as=diaspora` overrides and saves
- [ ] Product cards render LRD primary when audience is `local`, USD primary when `diaspora`
- [ ] Liberia homepage shows all 4 new sections + Promise Strip + Just Listed + WhatsApp CTA + City Featured
- [ ] Diaspora homepage shows Multi-Payment + Currency Context + Holiday Countdown + Group Gift + Photo of Delivery
- [ ] Mobile responsive at 380px on all new sections
- [ ] Dark mode works on all new components

### 2A.9 File metrics

- **Pre-geo-routing:** 19,205 lines · 961 KB · 77 routes
- **Post-geo-routing:** 20,789 lines · 1,015 KB · 77 routes (same routes, new global behavior + 11 new sections)
- **Net addition:** +1,584 lines · +54 KB

### 2A.10 Phase impact

| Phase | Polish | Merge | Geo-Routing | Combined |
|-------|--------|-------|-------------|----------|
| P1 Foundation | 0 | 0 | +1w (geo-detection, audience pill, modal) | +1w |
| P2 Core Marketplace | +5w | +1w | +1w (audience-aware pricing) | +7w |
| P3 Trust Mechanic | +2w | +2w | 0 | +4w |
| P4 Seller Infrastructure | +4w | 0 | 0 | +4w |
| P5 Diaspora | 0 | +1w | +3w (multi-payment, currency, holiday, group-gift, photo, hero rewrite) | +4w |
| P6 Admin/RBAC | +3w | +2w | 0 | +5w |
| P7 Driver Logistics | 0 | +1w | 0 | +1w |
| P8 Integration/Pilot | distributed | 0 | 0 | distributed |
| **Liberia-specific cross-cut** | n/a | n/a | +2w (Promise Strip, Just Listed, City Featured, WhatsApp) | +2w |
| Cross-cutting | n/a | +2w | 0 | +2w |

**Critical path impact:** None. Total scope now ~235 features (was ~189). The 18-24 month MVP timeline holds.

---

## 2B. Admin Tools Phase — Full data analytics + operational control (May 2026)

After the geo-routing phase shipped, the next gap was the admin role's depth. The existing admin surface had Trust Cases, KYC, Disputes, Payouts, Reports, and System status — but the dashboard was mostly KPI tiles with no real charts, no financial ledger detail, no live operational view, and no surface to manage commission rates, feature flags, or holiday calendars. A real marketplace operator can't run the platform from KPI tiles alone. The Admin Tools phase fills this gap with four new screens, each replacing a category of unknown-to-the-operator into known-and-actionable.

### 2B.1 The 4 admin tools added

| Route | Screen | What it answers |
|-------|--------|-----------------|
| `/admin-analytics` | Analytics Dashboard | "Is the business healthy this week?" |
| `/admin-finance` | Financial Control Center | "Where's the money? Who gets paid Thursday?" |
| `/admin-ops` | Operations Command | "What's failing right now? Who's delivering what?" |
| `/admin-config` | Platform Configuration | "I need to change a rate, a flag, a holiday, a template." |

Existing routes preserved unchanged: admin (Dashboard), admin-trust (Trust Cases), admin-kyc, admin-disputes, admin-moderation, admin-drivers, admin-payouts, admin-reports, admin-system.

**Updated admin nav** (13 items): Dashboard | Analytics | Finance | Operations | Trust Cases | KYC Queue | Disputes | Moderation | Drivers | Payouts | Reports | Config | System.

### 2B.2 Inline SVG chart helpers

Eight chart helper methods added to the `Screens` object, all inline SVG (no external libraries — keeps prototype self-contained, works offline, no dependency surface for the production engineering team to debate):

- `svgLineChart(data, opts)` — smooth Bezier line with area fill gradient, optional prior-period dashed comparison, Y-axis ticks, X-axis labels
- `svgBarChart(data, opts)` — vertical bars with rounded corners, per-bar color, Y-axis grid
- `svgDonutChart(segments, opts)` — donut with optional center label + value, segment stroke separation
- `svgSparkline(data, opts)` — tiny inline trend line for KPI cards (80x24px default)
- `svgFunnel(stages, opts)` — horizontal funnel with stage-to-stage conversion %, total %, drop-off labels
- `svgStackedBar(months, segmentKeys, segmentColors, opts)` — stacked monthly bars (for revenue breakdown by source)
- `svgAreaChart(seriesA, seriesB, opts)` — two-series stacked area chart (for diaspora-vs-local growth)
- `formatChartNum(n)` / `formatPlainNum(n)` — number formatters with $K/$M abbreviation

All charts use CSS variables for colors so they adapt to dark mode automatically. All charts are responsive — they scale to container width while preserving aspect ratio via SVG viewBox.

### 2B.3 Analytics Dashboard (`/admin-analytics`)

**Top KPI bar (5 cards with sparklines):**
- Gross merchandise value: $284,719 ↑ 18.4% (sparkline showing growth)
- Orders: 2,847 ↑ 14.2%
- Average order value: $100 ↑ 3.6%
- Active sellers: 142 (+23 new, 7 churned)
- Dispute rate: 0.4% (down 0.4pp)

**Revenue trend** — full-width line chart, 30 days daily, with prior 30-day dashed comparison line.

**GMV by category donut** — 6 segments (Fashion, Food, Electronics, Beauty, Home, Other) with center label "TOTAL $284K" + full legend with values + percentages.

**Buyer growth area chart** — local vs diaspora stacked area over 5 months with footer KPIs (2,240 local +23% MoM, 1,180 diaspora +51% MoM, diaspora share of GMV 62%).

**Order funnel** — 7-stage funnel (visit → product view → cart → checkout → paid → delivered → reviewed) with conversion percentages between stages, plus 4 insight cards below: biggest drop-off, cart abandonment %, delivery success %, review rate %.

**Top sellers table** — 6-row table with rank, name, tier, 10-day sparkline (per-seller color), revenue, growth %.

**Category performance** — bar chart + table with orders, AOV, and average rating per category.

**Time-of-day heatmap** — hour × day grid (6:00-22:00 × Mon-Sun) showing order density. Peak times clearly visible (12-14 lunch, 18-20 evening). Legend with Less→More scale.

**Recent significant events feed** — 7 auto-detected events with timestamps and color-coded pills (MILESTONE green, TIER UP gold, ANOMALY blue, RISK red, SPIKE purple, CONFIG gray).

**Header controls:** Time range selector (7d / 30d / 90d / YTD), Compare button (vs prior period), Export to CSV.

### 2B.4 Financial Control Center (`/admin-finance`)

**Top KPI bar (5 cards):**
- In escrow now: $48,247 (412 orders, USD + LRD pooled)
- May revenue (gross): $49,247 ↑ 22.4%
- Pending payouts: $28,420 (142 sellers, next batch Thursday)
- Refunds (May): $1,847 ↓ 12% (12 cases, below 1% of GMV)
- Insurance fund: $248K (0.4% reserve ratio)

**Revenue breakdown stacked bar** — 6 months × 5 segments (Commission $34.2K blue / SaaS subs $4.1K green / FX margin $2.7K orange / Delivery $6.4K purple / Ad revenue $1.8K red) with per-source breakdown below showing % of total.

**Live escrow ledger** — split two ways:
- By order age: 0-6h ($14,820 / 142 orders), 6-24h ($18,420 / 187), 1-3 days ($12,180 / 68), 3-7 days ($2,240 / 12), 7+ days under review ($587 / 3) — color-coded urgency
- By seller tier: T4 Elite ($18.4K), T3 Verified ($24.2K), T2 Standard ($5.6K)

**Currency exposure** — donut showing USD reserves $384.2K (88.8%) vs LRD reserves L$8.7M ($48.4K equivalent, 11.2%). Current CBL exchange rate 1 USD = L$180 displayed. Warning callout: "⚠ LRD exposure rising — up 38% MoM. Consider converting L$3M to USD this week to maintain < 15% LRD exposure target."

**Payout queue this week** — full table with 7 sellers visible (Konah Boutique, Mariama's Liberian Crafts, Sundayma Foods, Bessie's Fabrics, Tubman Foods, Anthony's Goods, Grace's Beauty Bar) showing tier badge, orders, gross, commission, net payout, method (MoMo/Bank/Orange), status (READY/REVIEW). Totals row: $31,578 gross → $28,420 net. Batch process button.

**Refund history** — 3 stat cards (total refunded, median resolution time, from insurance fund) + 5-reason breakdown (Item not as described $642 / Counterfeit $510 / Damaged $318 / Non-delivery $287 / Cancellation $90).

**Header controls:** Bank reconciliation, Export to CSV (GL export).

### 2B.5 Operations Command (`/admin-ops`)

**Top KPI bar (5 cards):**
- Orders in flight: 412 (238 in escrow, 174 in transit)
- Drivers active now: 28 (17 delivering, 11 available)
- Avg time to delivery: 3.8h ↓ 12% (target < 4h)
- Code-verified rate: 99.4% (3 manual review pending)
- SMS delivery: 99.8% (last 1h, Africa's Talking)

**Live order map of Monrovia** — stylized SVG with city zones (Sinkor, Paynesville, Bushrod Island, Old Road, Congo Town), Atlantic Ocean, Mesurado River. Order density circles per zone (147 Sinkor / 68 Paynesville / 42 Bushrod / etc), animated green driver pulse dots (4 drivers in motion with staggered pulse animations). Legend below.

**Service health grid** — 10 integration points in a 2-col grid:
- Payment: MTN MoMo OK / Orange Money OK / Stripe USD OK
- SMS: Africa's Talking OK / Twilio OK
- Push: Firebase FCM OK
- Webhooks: outbound **DEGRADED** (97.2% uptime, p95 2.4s)
- Database: Neon Postgres OK / Cache: Upstash Redis OK / Storage: Cloudflare R2 OK

Each row shows status dot, uptime %, p95 latency, status pill (OK / SLOW / DOWN). Warning callout under the degraded webhooks service.

**Live activity feed** — 12 streaming events with timestamps (14:23:14 down to 14:19:48), icon-coded (✓ delivered, 💳 payment, 🚚 driver, 📦 shipped, 👤 signup, ⚠ dispute, 🎁 group gift), short event text. "LIVE" pulse indicator in header.

**Driver coverage by city** — 5 cities with active driver count, pending jobs, ratio, demand pill (HIGH/MED/LOW). Sinkor flagged "⚠ Sinkor over-demanded — Driver demand 1:3.2. Consider surge pricing or activating standby drivers."

**Stockout alerts** — 5 products with stock count, daily run-rate, status pill (OUT / CRITICAL / LOW).

**Suspicious activity** — 5 auto-flagged events with timestamp, severity pill (HIGH/MED/LOW), description, action button (Review / Check / Investigate / Throttled).

### 2B.6 Platform Configuration (`/admin-config`)

**Commission rate matrix** — full table with 4 plans (Starter free 12% / Growth $15/mo 10% / Pro $45/mo 8% / Enterprise custom 5-7%) showing tier range, commission, monthly fee, active sellers, May revenue, last changed date. Edit Rates button.

**Featured-slot pricing** — 6 sponsored placement surfaces:
- Homepage Hero (Liberia): $280/7d, 6 booked LIMITED
- Homepage Hero (Diaspora): $480/7d, 4 booked LIMITED
- Category landing Fashion: $140/7d, 8 booked OPEN
- Category landing Electronics: $95/7d, 4 booked OPEN
- Search results top: $0.80/click, 24 booked OPEN
- Promoted listing: $0.40/click, 38 booked OPEN

**Feature flags** — 6 toggleable flags with rollout %, audience, state pill:
- `group_gift_enabled` ON 100% Diaspora only
- `instant_pool_game` ON 100% All
- `crypto_payments` OFF 0% N/A
- `voice_search` BETA 15% Local mobile
- `surge_pricing` OFF 0% N/A
- `whatsapp_orders` BETA 5% Tier 3+ buyers

**Liberian holiday calendar 2026** — 6 cards (4 upcoming, 2 past): Independence Day Jul 26 (62 days, Independence Day Box 18% off), Flag Day Aug 24, Thanksgiving LR Nov 5, Christmas Dec 25, New Year's Day passed, Armed Forces Day passed. Upcoming holidays highlighted with blue left-border accent.

**Geography & category taxonomy** — two-column grid:
- Cities served (8): Sinkor (12 drv / 38 slr ACTIVE), Paynesville, Bushrod, Old Road, Congo Town, Caldwell BETA, Gbarnga BETA, Buchanan PLANNED
- Categories (9): Fashion, Food, Electronics, Beauty, Home, Arts, Children, Books, Pharmacy PLANNED

**Notification templates** — 6 SMS/Email/Push templates in 2-col grid with trigger condition + sample copy + ON/OFF toggle.

**Header controls:** Config change History, Pending approvals (2 awaiting Superadmin review).

### 2B.7 Engineering implementation notes

**For production:**

- **Data refresh cadence:** Analytics charts refresh hourly from warehouse (snowflake or similar). KPI tiles and events feed refresh every 5 minutes. Operations Command refreshes order map every 30s, service health every 10s, activity feed every 5s via WebSocket/SSE.
- **Service health:** Each integration in the health grid is a separate health-check endpoint. Webhook degradation auto-creates an incident in PagerDuty if p95 > 3s for 5 consecutive minutes.
- **Charts:** Production implementation should consider whether to keep inline SVG (zero dependencies, full control, current approach) or switch to Recharts/Visx for richer interactivity (tooltips on hover, click-to-drill, zoom). Recommended: keep inline SVG for v1, evaluate library upgrade in v1.1 if interactivity demand justifies the bundle size cost.
- **RBAC:** Analytics is read-only and visible to all admin roles. Finance write actions (process batch payout, edit commission rates) require `finance:write` permission. Configuration changes affecting >5% of users require Superadmin co-approval (4-eye rule, see Build_Prompt §10.4).
- **Audit logging:** Every config change writes to the audit log (existing `/admin-system` surface). Includes who, when, what changed, before/after values, IP, user-agent.
- **CSV export:** Export buttons generate signed S3 URLs with 1-hour expiry. Large exports (>10K rows) queue as background jobs and notify admin by in-app notification when ready.
- **Live order map:** In production the map should integrate Mapbox GL with real lat/lng pins from active orders, clustered at zoom-out. The prototype's stylized SVG zones are intentionally simpler for the prototype context.
- **Mock data caveats:** All charts in the prototype use realistic but synthetic data. Production wiring requires data warehouse models for: GMV by day/category, order funnel events, seller revenue rankings, refund classifications, escrow positions, payout queue, service health metrics.

**For the prototype:**

- All 8 chart helpers are pure functions of input data — no DOM coupling. Production engineering can lift them directly into a chart utility module.
- The Monrovia map SVG uses approximate zone polygons — not geographically accurate. Production should use real GeoJSON.
- Service health "DEGRADED" status is intentional in the prototype to demonstrate the warning callout treatment.

### 2B.8 New routes added

| Route | Renders | Required permission |
|-------|---------|---------------------|
| `/admin-analytics` | Analytics Dashboard | `admin:read` |
| `/admin-finance` | Financial Control Center | `admin:read` (write requires `finance:write`) |
| `/admin-ops` | Operations Command | `admin:read` |
| `/admin-config` | Platform Configuration | `admin:read` (write requires `config:write` + Superadmin co-approval for >5% impact changes) |

### 2B.9 Acceptance criteria — admin tools phase

- [ ] All 4 new admin routes load without JS errors
- [ ] Analytics dashboard shows 8 distinct chart types (line, bar, donut, sparkline, funnel, stacked bar, area, heatmap)
- [ ] Revenue trend chart shows current period solid + prior period dashed for comparison
- [ ] Donut chart includes center label + value (TOTAL $284K)
- [ ] Order funnel shows conversion % between every stage + total
- [ ] Top sellers table includes per-seller sparkline
- [ ] Heatmap shows clear lunch (12-14) and evening (18-20) peak patterns
- [ ] Financial Control Center: escrow ledger split by age AND by tier
- [ ] Payout queue table totals row reconciles (gross - commission = net)
- [ ] Currency exposure shows CBL exchange rate + LRD exposure warning when > 15%
- [ ] Operations Command: Monrovia map with animated driver pulse dots
- [ ] Service health grid: all 10 integrations visible with status pills
- [ ] Live activity feed shows time-ordered events with icon coding
- [ ] Driver coverage table shows demand-level pills + over-demand warning
- [ ] Platform Configuration: commission matrix editable
- [ ] Feature flags: ON/OFF/BETA state visible with rollout %
- [ ] Holiday calendar: upcoming highlighted with countdown, past dimmed
- [ ] Notification templates: trigger + sample + enable toggle per template
- [ ] All 4 screens mobile-responsive at 380px (KPI grid reflows, tables scroll, charts scale)
- [ ] Dark mode works on all 4 screens (charts adapt via CSS vars)
- [ ] Admin nav shows all 13 items (existing 9 + 4 new) — Dashboard | Analytics | Finance | Operations | Trust Cases | KYC Queue | Disputes | Moderation | Drivers | Payouts | Reports | Config | System

### 2B.10 File metrics

- **Pre-admin-tools:** 21,000 lines · 1,022 KB · 77 routes (admin had 9)
- **Post-admin-tools:** 22,976 lines · 1,141 KB · 81 routes (admin has 13)
- **Net addition:** +1,976 lines · +119 KB
- **Code split:** ~700 lines chart helpers + analytics screen, ~320 lines finance, ~430 lines ops, ~260 lines config, ~270 lines CSS

### 2B.11 Phase impact summary

| Phase | Polish | Merge | Geo-Routing | Admin Tools | Combined |
|-------|--------|-------|-------------|-------------|----------|
| P1 Foundation | 0 | 0 | +1w | 0 | +1w |
| P2 Core Marketplace | +5w | +1w | +1w | 0 | +7w |
| P3 Trust Mechanic | +2w | +2w | 0 | 0 | +4w |
| P4 Seller Infrastructure | +4w | 0 | 0 | 0 | +4w |
| P5 Diaspora | 0 | +1w | +3w | 0 | +4w |
| P6 Admin/RBAC | +3w | +2w | 0 | **+6w** (4 new screens, RBAC for finance/config write actions, audit log integration) | **+11w** |
| P7 Driver Logistics | 0 | +1w | 0 | 0 | +1w |
| P8 Integration/Pilot | distributed | 0 | 0 | distributed | distributed |
| **Liberia-specific cross-cut** | n/a | n/a | +2w | 0 | +2w |
| Cross-cutting | n/a | +2w | 0 | +1w (chart helpers, data warehouse models for analytics) | +3w |

**Critical path impact:** None. Admin Tools work runs in P6 (Admin/RBAC) which has existing slack. The new screens depend on existing escrow, payout, and audit log infrastructure — all built in earlier phases. Total scope now ~265 features. The 18-24 month MVP timeline holds.

---

## 3. Updated feature count

| Phase | Original | Polish | Merge | Geo-Routing | Admin Tools | New total |
|-------|----------|--------|-------|-------------|-------------|-----------|
| P1 Foundation | 22 | 0 | 0 | 1 | 0 | 23 |
| P2 Core Marketplace | 41 | 5 | 1 | 1 | 0 | 48 |
| P3 Trust Mechanic | 28 | 3 | 4 | 0 | 0 | 35 |
| P4 Seller Infrastructure | 34 | 7 | 0 | 0 | 0 | 41 |
| P5 Diaspora | 18 | 0 | 1 | 6 | 0 | 25 |
| P6 Admin/RBAC | 24 | 3 | 3 | 0 | 28 (8 analytics surfaces + 8 financial + 6 operations + 6 config) | 64 |
| P7 Driver Logistics | 12 | 0 | 1 | 0 | 0 | 13 |
| P8 Integration/Pilot | 10 | 3 | 0 | 0 | 0 | 13 |
| Liberia-specific cross-cut | 0 | 0 | 0 | 4 | 0 | 4 |
| Cross-cutting | 0 | 0 | 5 | 0 | 1 (chart helper library) | 6 |
| **TOTAL** | **189** | **21** | **15** | **12** | **29** | **272** |

**Note:** Total now ~272 with admin tools fully built out (slightly above the ~265 estimate in the header due to feature granularity counting). All admin tool features are read-and-display in v1; write/edit functionality stubs in v1, full editor surfaces in v1.1.

**Critical path impact:** None. All additions slot into existing phases without extending P3 (the highest-risk phase) or pushing P8 (launch readiness) further out.

---

## 4. Updated acceptance criteria

### 4.1 Product card trust visibility
- [ ] Every product card on Browse, Home featured, search results, and category pages displays: seller name, trust score (0-100), KYC tier pill, ESCROW pill, CODE pill.
- [ ] Trust score is cached and refreshes hourly.
- [ ] Mobile (≤380px): pills wrap to a second row, no horizontal overflow.

### 4.2 Product page protection section
- [ ] Every PDP shows the 4-step protection section between description and reviews.
- [ ] Section is not dismissible.
- [ ] "Learn how Vendoora protects you" link routes to `/trust-center`.

### 4.3 5-stage tracking
- [ ] Tracking page renders differently at each of 5 stages (0-4).
- [ ] Driver section appears only at stage 2+.
- [ ] Code-reveal card appears at stage 2-3; verified-celebration card at stage 4.
- [ ] Stage transitions fire push + SMS notifications.

### 4.4 Seller onboarding
- [ ] All 5 steps are resumable (state saved on Continue click).
- [ ] Tier 2 KYC clears within 1 hour during business hours.
- [ ] First product is published in DRAFT, auto-publishes when KYC clears.

### 4.5 Trust Center signature
- [ ] Live network stats refresh hourly (escrow stat: every 15 min).
- [ ] Stats auto-hide if degraded below threshold (dispute rate > 1%, code-verified < 99%).

### 4.6 Notifications
- [ ] Bell icon in header shows accurate unread count.
- [ ] Critical notifications (code, driver-arriving, dispute-decision) always SMS-send.
- [ ] Marketing notifications respect user preferences.

### 4.7 Admin operations
- [ ] Reports page CSV exports complete within 60 seconds.
- [ ] Drivers page flagged-count matches actual flagged-driver records.
- [ ] Moderation take-down action requires confirmation modal + audit log entry.

### 4.8 UX polish
- [ ] All interactive elements have visible focus rings on Tab navigation.
- [ ] Skeleton loaders appear on any data fetch >300ms.
- [ ] Receipt and report pages print cleanly without nav/buttons/header.

---

## 5. Phase impact summary

**P2 (Core Marketplace)** — adds 5 weeks of polish work, distributed evenly across the phase. No timeline impact since polish work is parallel to feature work, not blocking.

**P3 (Trust Mechanic)** — adds 2 weeks of work for the PDP protection section + Trust Center signature visualization. These are display-only additions; no new server logic.

**P4 (Seller Infrastructure)** — adds 4 weeks of work for seller onboarding (the only meaningful timeline addition). Recommended to start this work in parallel with the seller console in week 2 of P4 rather than serially.

**P6 (Admin/RBAC)** — adds 3 weeks for the three new admin surfaces. Reports is the heaviest of the three (CSV generation infrastructure). Drivers and Moderation are mostly display layer on top of existing data models.

**P8 (Integration/Pilot)** — UX polish (skeletons, focus rings, print, empty states) is layered across all surfaces during the integration phase. Not a blocking item.

---

## 6. What this addendum does NOT change

- The locked Build Prompt §0.5 methodology (brainstorm → plan → /execute-plan → TDD red-green-refactor → four-phase debugging → code-reviewer subagent). **All polish-phase work must follow §0.5.**
- The locked Build Prompt §12.2 TDD-mandatory and four-phase debugging language.
- The locked Build Prompt §12.7 methodology gates.
- The locked Build Prompt §17 Final Instructions item 1 (Install Superpowers and follow §0.5).
- The 18-24 month MVP timeline.
- The three founder commitments (no partial launches / scope frozen post-MarketHub-audit / test users before paying users).
- The pricing/commission matrix locked previously.

---

## 7. Open items for future sessions

These were considered during polish phase but **intentionally deferred** to keep scope manageable:

- Promoted Listings campaign creator (the actual buying flow — currently just card placeholders)
- Buyer-side subscription tier ("Vendoora+") with free same-day delivery
- Product performance table on seller analytics (every product as a row with views/cart-rate/return-rate/dispute-rate)
- 30-day revenue forecast widget on seller dashboard
- Inventory restock recommendations
- WhatsApp Business API integration (currently described in tier matrix but not built into the prototype)
- Native mobile app (deliberately not in MVP scope)
- Multi-language (Liberia is English-first; localization is v2)

When pivoting to engineering handoff, these should appear in the v1.1 backlog rather than being absorbed into MVP.

---

*This addendum is the source of truth for polish-phase scope. When it conflicts with the original Engineering Spec, Build Prompt, or Playbook, this addendum prevails for the items it covers. All other items remain governed by the original docs.*
