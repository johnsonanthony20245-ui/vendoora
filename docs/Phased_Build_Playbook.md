# Vendoora — Phased Build Playbook

**Version:** 1.0 (extended by **Polish_Phase_Addendum.md v1.3** May 2026)
**Date:** May 2026
**Status:** Locked — construction order for the 18-24 month MVP build (revised May 2026 after MarketHub feature audit, extended May 2026 with polish phase + merge phase)
**Audience:** Claude Code (the implementing engineer), founder, future team members

> **Polish + Merge + Geo-Routing + Admin Tools Phase Update (May 2026):** This playbook is extended by `Polish_Phase_Addendum.md v1.3` which adds ~83 features distributed across P1, P2, P3, P4, P5, P6, P7, P8 + cross-cutting brand design system + Liberia-specific cross-cut. Critical path unchanged — additions are parallel to existing work. Phase impact: P1 +1w (geo-detection foundation), P2 +7w (polish + merge homepage + audience-aware pricing), P3 +4w (polish + refund breakdown + KYC pages + delivery-code page), P4 +4w (seller onboarding), P5 +4w (diaspora bundle expansion + multi-payment + currency context + holiday countdown + group gift + photo showcase + hero rewrite), P6 +11w (admin operations + DLQ + maintenance + audit log + Analytics Dashboard + Financial Control + Operations Command + Platform Configuration), P7 +1w (driver photo capture), P8 distributed UX polish, +2w cross-cutting brand system, +2w Liberia-specific cross-cut (Promise Strip + Just Listed + City Featured + WhatsApp CTA). Total scope: ~272 features (was ~189). Vendoora_App.html is the canonical visual reference going forward.

---

## How to read this document

This document defines the *order* in which Vendoora gets built. It is the third document in the spec trilogy:

- **`Engineering_Spec.md`** — defines *what* to build (architecture, data model, APIs, domain logic)
- **`Build_Prompt.md`** — defines *how* to build it (methodology, gates, conventions)
- **`Phased_Build_Playbook.md`** (this document) — defines *when* things get built (phases, sequencing, dependencies)

**Authority hierarchy when documents conflict:**

1. `Build_Prompt.md` methodology rules supersede everything else
2. `Engineering_Spec.md` for architectural decisions
3. `Phased_Build_Playbook.md` (this document) for sequencing
4. Anything in the codebase that contradicts these documents is a bug

**The 18-24 month timeline is realistic, not aspirational.** Original scope (106 features) was estimated at 14-18 months. After the May 2026 MarketHub feature audit added ~83 features (reviews, trust case management, profile change requests, product condition system, expanded monetization, system operations admin tooling, dark mode, public marketing pages, KYC reminders), the timeline extends by ~4-6 months. This document allocates ~18 months of build work plus 3-6 months of buffer for the unknown unknowns. Pretending it's 12 months would produce a low-quality product or a broken trust mechanic. Pretending it's 30 months would invite scope creep. 18-24 is the honest number.

**Reading order for build sessions:**

At the start of every session, you read in this order:
1. `Build_Prompt.md` — the rules of engagement
2. This document — to identify which phase you're in
3. The phase-specific section of this document — what's in scope right now
4. `Engineering_Spec.md` — the architectural details for the specific feature

---

## Table of Contents

1. [Build Philosophy](#1-build-philosophy)
2. [Phase Overview](#2-phase-overview)
3. [Phase 1 — Foundation](#3-phase-1--foundation)
4. [Phase 2 — Core Marketplace](#4-phase-2--core-marketplace)
5. [Phase 3 — Trust Mechanic](#5-phase-3--trust-mechanic)
6. [Phase 4 — Seller Infrastructure](#6-phase-4--seller-infrastructure)
7. [Phase 5 — Diaspora Experience](#7-phase-5--diaspora-experience)
8. [Phase 6 — Admin & RBAC](#8-phase-6--admin--rbac)
9. [Phase 7 — Driver Logistics](#9-phase-7--driver-logistics)
10. [Phase 8 — Integration, Testing, Pilot](#10-phase-8--integration-testing-pilot)
11. [Cross-Phase Concerns](#11-cross-phase-concerns)
12. [Phase Gate Reviews](#12-phase-gate-reviews)
13. [Risk Register](#13-risk-register)
14. [Post-MVP Roadmap](#14-post-mvp-roadmap)

---

# 1. Build Philosophy

## 1.1 Why Phased

The 106 MVP features could theoretically be built in any order. They're not. The order matters because:

1. **Dependencies force orderings.** You can't build the seller console before authentication. You can't build dispute resolution before escrow. You can't build the diaspora storefront before products exist.

2. **Trust mechanic correctness compounds.** If we build the escrow state machine in month 3 and rely on it for everything in months 4-14, a subtle bug discovered in month 12 is catastrophic. Build the trust mechanic early, harden it, then build everything else on top of it.

3. **Pilot phase needs working infrastructure.** The last 4-6 weeks are pilot phase with real sellers, real buyers, real money. If foundational infrastructure isn't done by month 12, the pilot phase becomes a feature-completion phase, not a real-world validation phase.

4. **Cognitive load is real.** Even a 20-year-experienced engineer (and Claude Code is one) can only hold so much context at once. Phasing reduces the surface area of any given build session. You're not building the entire platform — you're building Phase 3 today.

## 1.2 Phase Boundaries Are Hard

Each phase has explicit entry and exit gates. You do not start Phase 3 until Phase 2's exit gate passes. You do not declare Phase 4 done if Phase 3's exit gate didn't pass.

The temptation will be to declare a phase "mostly done" and start the next one. Resist this. "Mostly done" Phase 2 + "started" Phase 3 = neither is done, and the technical debt compounds.

The exception: **scaffolding for the next phase can happen in parallel with the current phase**, but it cannot ship to staging or production until the current phase passes its exit gate. Use feature flags to land code without exposing functionality.

## 1.3 The Three Founder Commitments Reaffirmed

Per `Build_Prompt.md` Section 18.2:

1. **No partial launches.** The trust mechanic must be fully working before any paying customer.
2. **Scope frozen at ~189 features.** No additions during build (post May 2026 MarketHub audit).
3. **Test users before paying users.** Pilot phase before public launch.

These commitments shape every phase boundary in this playbook. Phase 3 (trust mechanic) is explicitly long because Commitment 1 requires it to be airtight. Phase 8 (integration, testing, pilot) is explicitly long because Commitment 3 requires real-world validation before opening to the public.

# 2. Phase Overview

## 2.1 The Eight Phases

**Note on duration revision:** The original plan estimated 14.5 months base + 2-4 month buffer = 14-18 months. After the May 2026 MarketHub feature audit added ~83 features to MVP scope, the base estimate revised to **20 months + 3-4 month buffer = 18-24 months**.

| Phase | Name | Original months | Revised months | Goal |
|-------|------|-----------------|----------------|------|
| 1 | Foundation | 1.5 | **2** | Monorepo, auth, RBAC infrastructure, design system (incl. dark mode), CI/CD, expanded data model |
| 2 | Core Marketplace | 2.5 | **3.5** | Catalog (with conditions/warranty/authenticity), search, cart, checkout, public marketing pages |
| 3 | Trust Mechanic | 2.5 | **3** | Escrow, delivery codes, disputes, photo proof, insurance, expanded notifications |
| 4 | Seller Infrastructure | 1.5 | **3** | Seller console, KYC, payouts, reviews, profile change requests, expanded monetization |
| 5 | Diaspora Experience | 1.5 | **1.5** | Recipients, bundles, group gifts, scheduled gifts, voice messages |
| 6 | Admin & RBAC | 1.5 | **3** | All admin surfaces, audit log, trust case model, KYC reminders, system ops tooling |
| 7 | Driver Logistics | 1.5 | **2** | Driver app, dispatch, tracking, multi-stop, profile change requests |
| 8 | Integration, Testing, Pilot | 2 | **2** | End-to-end testing, security audit, pilot launch with real users |
| **TOTAL** | | **14.5 months** | **20 months** | Plus 3-4 month buffer for unknowns = **18-24 months** |

## 2.2 Why This Order

**Phase 1 (Foundation) before everything.** Auth + RBAC + design system must exist before any feature can be built. CI/CD must be working before any code merges to main.

**Phase 2 (Core Marketplace) before Phase 3 (Trust Mechanic).** You can't escrow money against products that don't exist. Catalog + cart + checkout come first. Phase 2 builds the *structure* of orders; Phase 3 builds the *integrity* of orders.

**Phase 3 (Trust Mechanic) before Phase 4 (Seller Infrastructure).** Sellers need real payouts. Payouts require escrow release. Escrow release requires the state machine. The trust mechanic is foundational to the seller experience, not a separate feature.

**Phase 4 (Seller Infrastructure) before Phase 5 (Diaspora Experience).** Diaspora orders come from real sellers with real products. Sellers need to be onboarded, verified, paid out. Diaspora layered on top.

**Phase 5 (Diaspora Experience) before Phase 6 (Admin & RBAC).** Diaspora introduces new flows (group gifts, scheduled gifts) that admin tooling must support. Building admin tooling first means rebuilding parts of it after diaspora exists.

**Phase 6 (Admin & RBAC) before Phase 7 (Driver Logistics).** Driver operations require T&S admin tooling for background check review, Operations admin for fleet management, Support admin for incidents. Admin infrastructure precedes driver scale.

**Phase 7 (Driver Logistics) before Phase 8 (Pilot).** Without drivers, there are no real deliveries. Without real deliveries, the trust mechanic can't be validated end-to-end. Drivers are the last operational layer.

**Phase 8 (Pilot) is the final gate before public launch.** 4-6 weeks of real-world validation with hand-picked sellers, diaspora design partners, and drivers running real orders with real money.

## 2.3 Parallel Work Within Phases

Within a phase, multiple features can be built in parallel — but they all must pass that phase's exit gate together. Feature flags are the tool for this: code can land in main without being exposed to users.

The discipline: a feature is not "shipped" until it's:
1. Built with tests
2. Reviewed and merged
3. Deployed to production
4. Behind a feature flag (defaulting to off)
5. Validated in staging
6. Documented in the relevant runbook
7. The feature flag is flipped to on for the appropriate audience

Steps 1-6 can happen during the phase. Step 7 (flag-on) happens at phase exit (or later, per rollout plan).

## 2.4 Pacing Reality

A 14-month build at a steady pace is approximately:

- **~30 weeks of build work** (assuming 5 days/week, with realistic time for review, debugging, refactoring)
- **~6-8 major features per phase** on average
- **~3-4 weeks per major feature** on average

Some features are smaller (a single component, a CRUD UI). Some are larger (the escrow state machine, the dispatch algorithm). The ratios will vary by phase.

The buffer for unknowns (2-4 months) covers:
- Integration debugging (MoMo APIs, Stripe webhooks, Africa's Talking delivery)
- Security audit findings
- Pilot phase iterations
- Compliance work that takes longer than estimated
- Regulatory conversations and document requirements

# 3. Phase 1 — Foundation

**Estimated duration:** 2 months (8 weeks) — revised May 2026 after MarketHub scope addition
**Goal:** Vendoora has a working monorepo with authentication, RBAC infrastructure, design system (with dark mode), CI/CD, and the complete expanded Prisma schema including all 6 new domains added in the May 2026 audit. No user-facing features yet.

## 3.1 Phase 1 Scope

### 3.1.1 Repository setup

- [ ] Initialize monorepo with Turborepo + pnpm workspaces
- [ ] Configure `apps/web` as Next.js 15 with App Router
- [ ] Configure `apps/worker` as standalone Node.js process
- [ ] Configure `packages/db` with Prisma + Neon
- [ ] Configure `packages/design-tokens` with CSS variables + RN StyleSheet exports
- [ ] Configure `packages/ui` with shadcn/ui base
- [ ] Configure `packages/types`, `packages/schemas`, `packages/domain`, `packages/api-client`, `packages/i18n`
- [ ] Configure shared `packages/config` (ESLint, TS, Tailwind, Prettier)
- [ ] Configure Turborepo pipeline (build, test, lint, type-check, dev)
- [ ] Verify cross-package imports work, types flow end-to-end

### 3.1.2 CI/CD

- [ ] GitHub Actions workflow for all 10 PR pipeline stages (per `Build_Prompt.md` Section 7.5)
- [ ] Branch protection on main configured
- [ ] Doppler integration for secrets in Vercel, Railway, GitHub Actions
- [ ] Preview deployments per PR via Vercel
- [ ] Neon database branching per preview environment
- [ ] Production deployment from main merges
- [ ] Smoke test suite running post-deploy

### 3.1.3 Database foundation

- [ ] Neon production + staging + dev databases provisioned
- [ ] Prisma schema initialized with all tables from `Engineering_Spec.md` Section 4 (full schema, even tables not yet used)
- [ ] **NEW (May 2026 audit additions):** Schema includes all 6 new domains from Sections 4.13-4.18:
  - [ ] Section 4.13 — Reviews Domain (Review, ReviewReport, ReviewAggregate)
  - [ ] Section 4.14 — Trust Cases Domain (TrustCase, TrustCaseNote, TrustCaseAction)
  - [ ] Section 4.15 — Profile Change Request Domain (ProfileChangeRequest)
  - [ ] Section 4.16 — Webhook & Outbox Domain (WebhookLog, OutboxEvent)
  - [ ] Section 4.17 — Product extensions (condition, warranty, return, authenticity, compare_at_price, pinned_position fields on Product)
  - [ ] Section 4.18 — KYC Application Domain (KycApplication, KycDocument as first-class models)
- [ ] Initial migration generated and applied (single squashed migration for clean start)
- [ ] Seed scripts for development data
- [ ] Row-Level Security policies for multi-tenancy implemented
- [ ] Audit log table with database-level UPDATE/DELETE prevention via trigger
- [ ] Outbox pattern background worker scaffolded (worker that polls OutboxEvent table)

### 3.1.4 Authentication (Clerk integration)

- [ ] Clerk account configured for development, staging, production
- [ ] Clerk-Vendoora user sync via webhook
- [ ] Login, signup, password reset flows
- [ ] HTTP-only secure cookie session management
- [ ] Session middleware in Next.js
- [ ] Logout flow
- [ ] Email verification flow
- [ ] Phone verification flow (via Clerk + Africa's Talking for SMS OTP)

### 3.1.5 RBAC infrastructure

- [ ] Permission table seeded with all ~120 permissions from `Engineering_Spec.md` Section 4.3
- [ ] 8 system admin roles seeded with `is_system_role=true`: superadmin, finance_admin, ts_admin, support_admin, operations_admin, marketing_admin, catalog_admin, analytics_admin
- [ ] 4 marketplace roles seeded (auto-assigned via application logic): buyer, seller, seller_staff, driver
- [ ] Role-permission mappings seeded for all 12 roles
- [ ] `user.can(permission)` helper implemented
- [ ] Permission middleware for tRPC procedures
- [ ] Permission middleware for Next.js routes
- [ ] RLS policies enforce permissions at database level

### 3.1.6 Design system

- [ ] Design tokens.css + tokens.native.ts generated from canonical tokens.json
- [ ] Tailwind v4 configured to consume design tokens as CSS variables
- [ ] shadcn/ui components copied into `packages/ui` and customized to Vendoora design
- [ ] Inter Tight + Fraunces + JetBrains Mono fonts configured
- [ ] Storybook initialized with stories for all base components
- [ ] Chromatic visual regression set up
- [ ] **NEW (May 2026 audit):** Dark mode tokens defined and tested in design system
- [ ] **NEW (May 2026 audit):** Theme toggle component with sun/moon icon
- [ ] **NEW (May 2026 audit):** Dark mode persistence via cookie + system preference detection
- [ ] **NEW (May 2026 audit):** All base components verified to work in both light and dark themes

### 3.1.7 Observability infrastructure

- [ ] Sentry integrated in `apps/web` and `apps/worker`
- [ ] Better Stack (Logtail) integrated with structured logging in `packages/logger`
- [ ] PostHog SDK integrated for client and server event tracking
- [ ] Vercel Analytics enabled
- [ ] PII redaction layer in `packages/logger` tested

### 3.1.8 Internationalization scaffolding

- [ ] `packages/i18n` structure with English strings
- [ ] Currency formatting helpers
- [ ] Date/time formatting helpers
- [ ] Number formatting helpers

### 3.1.9 Marketing site (placeholder)

- [ ] Landing page at `/` with hero, value props, signup CTA
- [ ] About page
- [ ] How it works page
- [ ] Terms of Service, Privacy Policy stubs
- [ ] SSG configuration for marketing pages

## 3.2 Phase 1 Entry Gates

Before Phase 1 begins:

- [ ] `Engineering_Spec.md` is locked
- [ ] `Build_Prompt.md` is locked
- [ ] This document is locked
- [ ] Brand visual artifacts (homepage design, seller console design, etc.) are available as canonical reference
- [ ] Vercel, Neon, Upstash, Clerk, Doppler, Cloudflare, Resend, Africa's Talking, Sentry, Better Stack, PostHog accounts are created
- [ ] Founder has reviewed and approved the phase scope

## 3.3 Phase 1 Exit Gates

Phase 1 is done when ALL of these are true:

- [ ] Monorepo builds successfully with `pnpm build`
- [ ] All 10 PR pipeline stages pass on a sample PR
- [ ] A new user can sign up via Clerk and a record appears in Vendoora's `users` table
- [ ] A user can log in and a session cookie is set
- [ ] A user can log out and the session is revoked
- [ ] A user can be assigned a role via direct database write (admin UI doesn't exist yet)
- [ ] `user.can("some.permission")` returns correct results based on role assignments
- [ ] All ~120 permissions are seeded in the database
- [ ] All 12 roles (8 system admin roles with `is_system_role=true` + 4 marketplace roles auto-assigned via application logic) are seeded with correct permissions
- [ ] Audit log table cannot be UPDATEd or DELETEd from any client (test via attempted raw SQL)
- [ ] Marketing landing page is deployed at production URL
- [ ] Storybook is deployed and shows all base components
- [ ] Sentry captures a test error from production
- [ ] PostHog receives a test event from production
- [ ] Coverage thresholds for all created packages are met
- [ ] All Phase 1 work is documented in `docs/runbooks/` where operational

## 3.4 Phase 1 Specific Risks

- **Clerk integration complexity.** Clerk's webhooks have edge cases (deleted users, merged accounts, soft deletes). Budget extra time for webhook handler hardening.
- **Prisma + RLS interaction.** Setting `SET LOCAL` correctly in every transaction is tricky. Test thoroughly.
- **Design token consumption.** The handoff from `tokens.json` to Tailwind v4 + RN StyleSheet has multiple steps. Verify both web and (future) mobile consume identical values.
- **CI/CD pipeline duration.** A 10-stage pipeline can become slow. Optimize for parallel execution from the start.

# 4. Phase 2 — Core Marketplace

**Estimated duration:** 3.5 months (14 weeks) — revised May 2026 after MarketHub scope addition
**Goal:** Buyers can browse products (with full condition/warranty/authenticity metadata), search, filter, add to cart, and checkout. Public marketing pages exist. Orders are created but the trust mechanic doesn't activate yet (that's Phase 3).

## 4.1 Phase 2 Scope

### 4.1.1 Catalog data model

- [ ] Category management (CRUD via admin tRPC, no UI yet)
- [ ] Category hierarchy (parent_id) working
- [ ] Category attributes schema (JSONB) defined for top 10 categories
- [ ] Initial seed: 10-15 product categories matching Liberian commerce reality (Fashion, Food, Beauty, Electronics, Home, etc.)

### 4.1.2 Product management (basic — full seller console in Phase 4)

- [ ] Product table populated via direct seed (no UI yet)
- [ ] Product variants supported
- [ ] Product images uploaded to Cloudflare R2
- [ ] Product image transformations via Cloudflare Images (thumbnail, card, hero, full variants)
- [ ] Inventory tracking enabled
- [ ] Product status states (DRAFT, PUBLISHED, ARCHIVED, OUT_OF_STOCK, PENDING_REVIEW, REJECTED) working
- [ ] **NEW (May 2026 audit):** Product condition system per Engineering_Spec §4.17:
  - [ ] Condition enum (NEW, LIKE_NEW, USED_GOOD, USED_FAIR, REFURBISHED, FOR_PARTS)
  - [ ] Required condition field on every product
  - [ ] Condition note field (required when not NEW/LIKE_NEW)
  - [ ] Condition immutability after first sale enforced via trigger
- [ ] **NEW (May 2026 audit):** Per-product warranty fields (warranty_terms, warranty_duration_days)
- [ ] **NEW (May 2026 audit):** Per-product return policy (return_policy_type, return_policy_terms, return_window_days)
- [ ] **NEW (May 2026 audit):** Per-product authenticity (authenticity_status enum + authenticity_proof_urls upload)
- [ ] **NEW (May 2026 audit):** Compare-at-price field (strikethrough pricing UI)
- [ ] **NEW (May 2026 audit):** Buyer protection eligibility flag (default true; restricted false for certain conditions)

### 4.1.2a Public marketing & policy pages (NEW — May 2026 audit)

- [ ] Public seller pricing page (/pricing) showing all 4 SaaS tiers + comparison table
- [ ] Public buyer protection page (/buyer-protection) explaining escrow + dispute resolution + insurance
- [ ] Public seller verification page (/seller-verification) explaining the 5-tier KYC system
- [ ] Public delivery verification page (/delivery-verification) explaining the 6-digit code system
- [ ] Public safe shopping page (/safe-shopping) — consumer-facing trust mechanic explanation
- [ ] Public KYC policy page (/kyc-policy) — for sellers and drivers
- [ ] Delivery policy and refund policy pages (extracted from ToS as standalone)
- [ ] All public pages SSG with revalidate-on-deploy

### 4.1.3 Buyer browsing

- [ ] Homepage with featured products, categories, active order banner (3.7 buyer screen — see Vendoora_Mobile_Apps.html for visual reference)
- [ ] Category browse page with product grid
- [ ] Product detail page with images, variants, description, escrow promise card
- [ ] Seller storefront pages (`/store/{slug}`)
- [ ] Recently viewed tracking
- [ ] Wishlist functionality

### 4.1.4 Search

- [ ] Full-text search with Postgres `tsvector`
- [ ] Trigram indexing for typo tolerance
- [ ] Search API endpoint with ranking
- [ ] Faceted filters (price, category, seller tier, in-stock, free delivery, rating)
- [ ] **NEW (May 2026 audit):** Condition filter (default to NEW + LIKE_NEW; opt-in to see USED/REFURBISHED/FOR_PARTS)
- [ ] **NEW (May 2026 audit):** Authenticity filter (PLATFORM_VERIFIED, PROOF_PROVIDED, CLAIMED, UNCLAIMED)
- [ ] Filter state in URL for shareability
- [ ] Search results page with pagination

### 4.1.5 Cart

- [ ] Cart data model (with guest cart support via session_id)
- [ ] Add to cart, update quantity, remove item
- [ ] Cart persistence across sessions
- [ ] Cart price calculation (subtotal, shipping fee, tax, total)
- [ ] Multi-vendor cart support (items from multiple sellers)

### 4.1.6 Checkout (Liberia-domestic flow)

- [ ] Delivery address selection (saved addresses + new address)
- [ ] Delivery slot selection
- [ ] Payment method selection (MTN MoMo, Orange Money — diaspora cards in Phase 5)
- [ ] Order summary with line items
- [ ] Promo code application
- [ ] Order confirmation page
- [ ] Order email confirmation via Resend

### 4.1.7 Order management (basic — full lifecycle in Phase 3)

- [ ] Order table populated on checkout completion
- [ ] Order status workflow stub (PENDING_PAYMENT only — full lifecycle in Phase 3)
- [ ] Buyer order list page
- [ ] Buyer order detail page

### 4.1.8 Geographic delivery zones

- [ ] Delivery zones seeded for Monrovia + Buchanan + Gbarnga + Sanniquellie
- [ ] Each zone has base delivery fee + estimated delivery hours
- [ ] Buyer's location detected/specified, products filtered by deliverable zones

### 4.1.9 Notifications (transactional, basic)

- [ ] In-app notification center
- [ ] Email notifications via Resend (order placed)
- [ ] SMS notifications via Africa's Talking (order placed — diaspora SMS via Twilio in Phase 5)

### 4.1.10 Performance baseline

- [ ] ISR caching configured for product detail and category pages
- [ ] Image lazy loading
- [ ] Performance budget tracking via Vercel Analytics

## 4.2 Phase 2 Entry Gates

- [ ] Phase 1 exit gates all pass
- [ ] Founder has reviewed and approved Phase 2 scope
- [ ] Seed data plan reviewed (which products, which sellers, which categories)

## 4.3 Phase 2 Exit Gates

Phase 2 is done when ALL of these are true:

- [ ] A buyer can browse the homepage and see featured products
- [ ] A buyer can navigate to a category and see products in that category
- [ ] A buyer can search for "wrapper" and see relevant results with typo tolerance ("wraper" also works)
- [ ] A buyer can filter results by price, seller tier, delivery zone
- [ ] A buyer can view a product detail page with full information and add to cart
- [ ] A buyer can have items from multiple sellers in the cart
- [ ] A buyer can checkout (the order is created but payment doesn't activate yet — uses stub)
- [ ] An order record is created with PENDING_PAYMENT status
- [ ] The buyer receives an in-app notification, email, and SMS for the order
- [ ] Coverage thresholds are met for all new code
- [ ] All Phase 2 features are documented
- [ ] Performance: product detail LCP < 2s on US/EU connection, < 4s on simulated Liberia connection
- [ ] Search query p95 latency < 500ms

## 4.4 Phase 2 Specific Risks

- **Search ranking quality.** Postgres full-text search works but ranking takes tuning. Plan for iteration cycles.
- **Multi-vendor cart complexity.** Cart calculations get tricky with multiple sellers, different commission rates, mixed currencies. Test extensively.
- **Image upload pipeline.** Cloudflare R2 + Images integration has multiple steps. Document the runbook thoroughly.
- **Phase 2 introduces the buyer UI.** Stick closely to the canonical visual artifacts (Vendoora_Homepage.html, etc.) — don't redesign during implementation.

# 5. Phase 3 — Trust Mechanic

**Estimated duration:** 3 months (12 weeks) — revised May 2026 after MarketHub scope addition
**Goal:** The trust mechanic is fully working. Escrow holds money, delivery codes gate package handoff, disputes can be opened and resolved, photo proof is captured, insurance fund operates correctly, all delivery state transitions emit explicit notifications. This is the most consequential phase.

## 5.1 Phase 3 Scope

### 5.1.1 Escrow state machine

- [ ] All 10 escrow states implemented (PENDING_PAYMENT, HELD, HELD_DISPUTED, RELEASING, RELEASED, REFUNDING, REFUNDED, PARTIALLY_REFUNDED, EXPIRED, INSURANCE_PAYOUT)
- [ ] All documented state transitions implemented (per `Engineering_Spec.md` Section 6.2)
- [ ] Row-level locking via `SELECT FOR UPDATE` on every transition
- [ ] Every transition writes to `escrow_state_transitions` AND `audit_log`
- [ ] Every transition writes to `OutboxEvent` for downstream notifications
- [ ] Concurrency safety tested (two simultaneous resolution attempts produce expected error)
- [ ] **100% coverage requirement met for `packages/domain/src/escrow/`**

### 5.1.2 Payment integration (MTN MoMo first, then Orange Money, then Stripe)

- [ ] `PaymentProvider` abstraction in `packages/domain/src/payments/`
- [ ] `MTNMoMoProvider` implementation with sandbox testing
- [ ] `OrangeMoneyProvider` implementation with sandbox testing
- [ ] `StripeProvider` implementation with test mode
- [ ] Idempotency keys on every outbound call
- [ ] Webhook handlers for each provider with signature verification
- [ ] Webhook idempotency via `processed_webhooks` table
- [ ] **NEW (May 2026 audit):** All webhook receipts logged to `WebhookLog` table (per Engineering_Spec §4.16)
- [ ] Polling pattern for MTN/Orange (every 5 seconds, max 5 minutes)
- [ ] Failure mode handling for each provider per Engineering_Spec.md Section 8

### 5.1.3 Multi-vendor payment splitting

- [ ] Order creates multiple `EscrowHold` records (one per seller per item + platform commission holds + delivery fee holds)
- [ ] Each `EscrowHold` has its own state
- [ ] Payment captured triggers all PENDING_PAYMENT → HELD transitions atomically
- [ ] Tested with sample multi-vendor order (Mariama's wrapper + Konah's bag scenario from spec)

### 5.1.4 Delivery code system

- [ ] 6-digit code generated server-side on order PICKED_UP (cryptographically random)
- [ ] **NEW (May 2026 audit):** Code stored as bcrypt hash in `orders.delivery_code_hash` field (not reversible encryption; admin cannot read the plaintext code)
- [ ] **NEW (May 2026 audit):** Code expires 72 hours after PICKED_UP if not entered; expiry triggers T&S escalation
- [ ] **NEW (May 2026 audit):** Code attempt count stored on Order (max 3 attempts; resets on admin resend)
- [ ] **NEW (May 2026 audit):** Admin/superadmin can resend the code via a step-up-authenticated action; resend invalidates old code and generates new one
- [ ] Code sent to buyer's phone via SMS within 30 seconds of generation
- [ ] Code never sent to seller or driver
- [ ] Code displayed in buyer's order tracking screen
- [ ] Code entry by driver via driver app (Phase 7 will build the driver UI, but the API endpoint exists in Phase 3)
- [ ] Three failed entries triggers T&S escalation
- [ ] Successful code entry triggers PICKED_UP → DELIVERED transition

### 5.1.5 Photo proof of delivery

- [ ] Driver app endpoint accepts photo upload (Phase 7 builds the UI)
- [ ] Photo metadata enforced: GPS coordinates + timestamp must be present
- [ ] Photo stored in Cloudflare R2 with 2-year retention
- [ ] Photo URL added to `deliveries.delivery_proof_photo_url`
- [ ] Photo sent to buyer via email (and to diaspora sender via Phase 5 logic)

### 5.1.6 Order status lifecycle

- [ ] All 12 order status states from `Engineering_Spec.md` Section 4.6 (PENDING_PAYMENT, PAID, ACCEPTED, PREPARING, READY_FOR_PICKUP, PICKED_UP, OUT_FOR_DELIVERY, ARRIVED, DELIVERED, COMPLETED, DISPUTED, CANCELLED, REFUNDED, EXPIRED)
- [ ] Order status transitions trigger appropriate escrow state changes
- [ ] Order status history tracked in `order_status_history`
- [ ] Buyer's order tracking UI shows full lifecycle with timestamps

### 5.1.7 Dispute resolution system

- [ ] Dispute can be opened by buyer within 24hr of DELIVERED
- [ ] Dispute can be opened by seller within 24hr of escrow release (for fraud/abuse cases)
- [ ] Dispute UI for buyer (initiate dispute, upload evidence)
- [ ] Dispute UI for seller (respond to dispute, upload evidence)
- [ ] Dispute admin queue (T&S role — full surface built in Phase 6, but queue exists in Phase 3)
- [ ] Dispute messages, evidence uploads, status tracking
- [ ] 48-hour SLA timer with notifications at 24hr, 36hr, auto-escalation at 48hr
- [ ] Dispute resolution actions: FULL_REFUND_TO_BUYER, PARTIAL_REFUND_TO_BUYER, RELEASE_TO_SELLER, INSURANCE_PAYOUT
- [ ] Each resolution triggers correct escrow state transition
- [ ] **100% coverage requirement met for `packages/domain/src/dispute/`**

### 5.1.8 Insurance fund

- [ ] `PlatformConfig` entry for `insurance_fund.balance` with initial $5,000 USD
- [ ] Insurance payout flow when T&S admin selects INSURANCE_PAYOUT resolution
- [ ] Insurance fund balance updated transactionally
- [ ] Replenishment trigger: balance < $2,000 alerts Finance Admin
- [ ] Per-incident, per-buyer-per-year, per-seller-per-year limits enforced
- [ ] Commission top-up (0.5% of every order) automated nightly

### 5.1.9 Auto-release worker

- [ ] Background worker runs every 5 minutes (cron via BullMQ)
- [ ] Queries `EscrowHold` rows in HELD state with `scheduled_release_at <= NOW()`
- [ ] Transitions each to RELEASING and triggers payout
- [ ] Idempotent: re-running on same hold is safe
- [ ] Failure handling: log and continue with other holds

### 5.1.10 Refund engine

- [ ] Refund authorization API (with step-up auth for amounts >$500)
- [ ] Refund execution via correct payment provider
- [ ] Refund linked to dispute_id when dispute-driven
- [ ] Refund status tracked
- [ ] Refund failure handling (failed refunds surface to Finance Admin)
- [ ] Buyer notification on refund completion

### 5.1.11 Fraud detection (basic)

- [ ] Rules-based fraud detection engine (simple rules: rapid-fire orders, mismatched billing/shipping for diaspora, high-value first orders, MoMo wallet velocity)
- [ ] Flagged orders go to T&S queue
- [ ] No automatic order blocking — humans make all fraud decisions in MVP

### 5.1.12 Buyer trust score (internal)

- [ ] `users.trust_score` (0-100, hidden from user)
- [ ] Score initialized at 50 for new users
- [ ] Score adjusted based on: dispute rate, return rate, payment success rate
- [ ] Score affects fraud detection thresholds (low score = stricter rules)

## 5.2 Phase 3 Entry Gates

- [ ] Phase 2 exit gates all pass
- [ ] MTN MoMo sandbox credentials obtained
- [ ] Orange Money sandbox credentials obtained
- [ ] Stripe test mode account configured
- [ ] Founder has reviewed and approved Phase 3 scope

## 5.3 Phase 3 Exit Gates

This is the most rigorous exit gate of the entire build. Phase 3 is done when ALL of these are true:

**Escrow correctness:**

- [ ] Every escrow state transition documented in spec is exercised by a test
- [ ] 100% code coverage on `packages/domain/src/escrow/`
- [ ] 100% branch coverage on `packages/domain/src/escrow/`
- [ ] Property-based tests confirm: no transition produces an invalid state
- [ ] Concurrency tests confirm: parallel modifications are serialized correctly
- [ ] Idempotency tests confirm: replaying any webhook produces correct state

**End-to-end trust mechanic:**

- [ ] Test buyer in staging: place order → pay via MoMo sandbox → escrow holds money → driver "delivers" via test endpoint → buyer enters code → escrow releases → seller receives test payout
- [ ] Test diaspora buyer in staging: place order → pay via Stripe test → escrow holds → driver "delivers" → code entered → escrow releases
- [ ] Test dispute flow: buyer opens dispute → uploads evidence → T&S resolves in buyer's favor → refund executes → buyer receives refund
- [ ] Test insurance flow: T&S marks dispute as INSURANCE_PAYOUT → buyer refunded from insurance fund → seller paid in full
- [ ] Test failure modes: MoMo timeout, Stripe decline, webhook replay, concurrent dispute resolution

**Operational:**

- [ ] Audit log entries present for every test transition above
- [ ] Reconciliation runbook documented
- [ ] Failed payout retry logic tested
- [ ] All Phase 3 features have associated runbooks

**Compliance:**

- [ ] PCI-DSS SAQ-A questionnaire completed (no raw card data touches our servers — verified)
- [ ] Encryption-at-rest confirmed for all financial tables in Neon

## 5.4 Phase 3 Specific Risks

This is the highest-risk phase. Specific concerns:

- **MoMo API documentation gaps.** Real-world MTN MoMo integration has undocumented behaviors. Budget extra time for support tickets with MTN and reading other African fintech projects' open-source code.
- **Webhook reliability.** Stripe is reliable. MTN and Orange are less so. Polling backup is critical, not optional.
- **Concurrency edge cases.** Two admins resolving the same dispute simultaneously. A buyer opening a dispute while an admin is approving the release. These edge cases must be tested explicitly.
- **The "happy path" temptation.** It's easy to test the working path and miss the failure modes. Disciplined error-path testing is mandatory.
- **Code generation security.** The 6-digit delivery code must be truly random (cryptographic), not predictable. Tested via statistical analysis of generated codes.

# 6. Phase 4 — Seller Infrastructure

**Estimated duration:** 3 months (12 weeks) — revised May 2026 after MarketHub scope addition
**Goal:** Sellers can fully operate their businesses on Vendoora. Onboard, get KYC'd, list products (with condition/warranty/authenticity), manage orders, receive payouts, view analytics, request profile changes for review, receive product/seller reviews from buyers, opt into expanded monetization (featured vendor slots, promoted posts).

## 6.1 Phase 4 Scope

### 6.1.1 Seller onboarding

- [ ] Seller signup flow (extends buyer signup with business info)
- [ ] Business profile setup (name, slug, description, logo, banner, address)
- [ ] Initial KYC Tier 0 (email + phone verification — done in Phase 1)
- [ ] KYC Tier 1 (government ID upload + selfie)
- [ ] KYC Tier 2 (LRA TIN + LBR sole proprietor certificate)
- [ ] KYC Tier 3 (corporate registration + bank/MoMo verification)
- [ ] KYC Tier 4 (Trusted Partner — manual promotion only, requires founder approval)
- [ ] KYC document upload to Cloudflare R2 with encryption
- [ ] KYC status tracking and notifications

### 6.1.2 Seller console (11 screens per Vendoora_Seller_Console.html)

- [ ] Dashboard with KPIs (revenue, orders, conversion, top products)
- [ ] Orders screen (sortable table with delivery codes — codes only visible to seller for their own orders)
- [ ] Product editor (create, edit, variants, images, pricing)
- [ ] KYC & Verification screen (tier ladder, document checklist, status)
- [ ] Payouts screen (history, payment method, schedule)
- [ ] Analytics screen (revenue, conversion, top products, customer demographics)
- [ ] Products list with bulk actions
- [ ] Store Settings (business profile, hours, delivery zones)
- [ ] Plan & Billing (SaaS tier selection: Starter/Growth/Pro/Enterprise)
- [ ] Staff Management (invite, role assignment, remove)
- [ ] Messages (split-panel chat with buyers)

### 6.1.3 Seller staff accounts

- [ ] Seller admin can invite staff via email
- [ ] Staff role assignment (ADMIN, FULFILLMENT, SUPPORT, VIEWER)
- [ ] Permission scoping (e.g., FULFILLMENT can manage orders but not billing)
- [ ] Staff onboarding flow

### 6.1.4 Product management (full UI)

- [ ] Product creation with variants
- [ ] Image upload via Cloudflare R2 + Cloudflare Images transformations
- [ ] Category and attribute selection
- [ ] Pricing (base price + variant overrides + currency)
- [ ] Inventory tracking
- [ ] Status management (DRAFT → PUBLISHED → ARCHIVED)
- [ ] Bulk CSV upload for Tier 3+ sellers

### 6.1.5 Order fulfillment

- [ ] Order acceptance flow (24hr deadline)
- [ ] Order preparation status updates
- [ ] Ready for pickup notification to dispatch
- [ ] Order detail view with buyer info, items, delivery address

### 6.1.6 SaaS subscription billing

- [ ] Plan selection UI (Starter Free, Growth $15/mo, Pro $45/mo, Enterprise Custom)
- [ ] Stripe subscription created for paying plans
- [ ] Commission rate adjusts based on plan
- [ ] Auto-renewal handling
- [ ] Plan downgrade/upgrade flow
- [ ] Failed payment handling (grace period + downgrade to Starter)

### 6.1.7 Seller payouts

- [ ] Payout method configuration (MTN MoMo, Orange Money, bank transfer)
- [ ] Payout schedule configuration (instant, daily, weekly, monthly)
- [ ] Payout aggregation logic
- [ ] Payout execution via correct provider
- [ ] Payout history with downloadable statements
- [ ] Failed payout retry + manual intervention escalation

### 6.1.8 Seller analytics

- [ ] Revenue chart (daily, weekly, monthly)
- [ ] Order volume chart
- [ ] Conversion funnel (views → cart → checkout → completed)
- [ ] Top products by revenue and volume
- [ ] Customer demographics (anonymized)
- [ ] Dispute rate tracking

### 6.1.9 Seller messaging

- [ ] In-platform messaging between seller and buyer
- [ ] Pre-purchase questions
- [ ] Order-related communication
- [ ] Dispute coordination via messages
- [ ] Message read receipts
- [ ] File attachments (photos)

### 6.1.10 Promotions and discounts

- [ ] Seller-side promotions (sale prices, percentage off)
- [ ] Promoted listings (paid placement) — billing handled
- [ ] Seller-created promo codes for their own products

### 6.1.11 Tax filing support

- [ ] Annual transaction export in LRA-compatible format
- [ ] Quarterly tax summary
- [ ] Downloadable VAT reports for Tier 2+ sellers

### 6.1.12 Vendoora Academy (seller education)

- [ ] Video tutorial library (initially 5-10 videos)
- [ ] Written guides (best practices for photos, descriptions, pricing)
- [ ] Certification badges for completed training
- [ ] Onboarding checklist for new sellers

### 6.1.13 Photographed by Vendoora service

- [ ] Service request UI for Tier 3+ sellers
- [ ] Dispatch to vetted local Liberian photographers
- [ ] Payment to photographer ($5 per photo, $2 platform margin)
- [ ] Photo upload by photographer
- [ ] Seller approval workflow
- [ ] First 10 products free for Tier 3+

### 6.1.14 Reviews on products and sellers (NEW — May 2026 audit)

- [ ] Buyer review submission UI (post-delivery only)
- [ ] Product review form (rating 1-5, optional title, body, photo upload)
- [ ] Seller review form (rating 1-5, optional title, body)
- [ ] Verified purchase badge displayed on linked reviews
- [ ] Buyer can edit their own review for 30 days
- [ ] Buyer can delete their own review (sets status to DELETED)
- [ ] Seller can respond to reviews on their products/store (once per review, editable for 7 days)
- [ ] Product detail page shows review aggregates + recent reviews
- [ ] Seller storefront page shows seller review aggregates
- [ ] Review aggregates updated transactionally via trigger on Review write
- [ ] Helpful/unhelpful voting on reviews
- [ ] Report review flow (any user can flag with reason)
- [ ] 3+ reports auto-route to T&S moderation queue (Phase 6 surface)

### 6.1.15 Seller profile change request flow (NEW — May 2026 audit)

- [ ] Seller dashboard "Settings → Business Info" with locked fields (legal name, business name, tax ID, bank account, MoMo number, owner name, address)
- [ ] Edit attempts on locked fields open a "Request Change" modal instead of direct save
- [ ] Supporting documents upload (R2-backed)
- [ ] Reason field
- [ ] Pending change badge appears on the locked field until approved
- [ ] Status notifications (pending review, approved, denied, needs more info)
- [ ] Read-only history of past change requests visible to seller

### 6.1.16 Expanded monetization — Featured vendor + promoted posts (NEW — May 2026 audit)

- [ ] **Featured Vendor Slot model + admin pricing (Phase 6 builds admin UI)**
- [ ] Seller request flow: select slot (homepage, category landing page, diaspora storefront)
- [ ] Slot duration options (1 week, 4 weeks, 12 weeks)
- [ ] Pricing tiered by slot popularity + duration
- [ ] Stripe charge on request; refund on rejection
- [ ] Slot rendering on featured surfaces with "Featured" label
- [ ] **Promoted Post model + seller composer**
- [ ] Seller creates promoted post (product announcement, sale, restock, new arrival)
- [ ] Post composer (image + headline + CTA)
- [ ] Reach + impression tracking
- [ ] Pricing per impression with budget cap
- [ ] Post moderation by Marketing Admin before publication
- [ ] Posts surface in dedicated "From sellers you might like" feed surfaces

### 6.1.17 Expanded SaaS tier entitlements (NEW — May 2026 audit)

- [ ] Tier entitlement engine: per-tier feature flags computed at request time
- [ ] Product listing limits enforced per tier (Starter: 25, Growth: 200, Pro: unlimited, Enterprise: custom)
- [ ] Pinned product allowance per tier (Starter: 0, Growth: 3, Pro: 10, Enterprise: 25)
- [ ] Promoted listing credits bundled per tier (monthly allowance)
- [ ] SEO controls (custom title/meta description) gated by tier (Pro+)
- [ ] Bulk CSV upload access gated by tier (Growth+)
- [ ] Advanced analytics gated by tier (Pro+)
- [ ] Instant payout eligibility gated by tier (Pro+)
- [ ] Priority support gated by tier (Pro+)
- [ ] Store customization (theme colors, custom banner positions) gated by tier (Pro+)
- [ ] Lower commission rates on higher tiers (per existing pricing structure)

## 6.2 Phase 4 Entry Gates

- [ ] Phase 3 exit gates all pass (escrow + payouts work)
- [ ] Stripe Connect platform account configured for subscriptions
- [ ] First sample sellers identified for testing (3-5 willing volunteers)

## 6.3 Phase 4 Exit Gates

Phase 4 is done when ALL of these are true:

- [ ] A new seller can sign up, complete Tier 1 KYC, list their first product, and receive an order
- [ ] Seller can manage the order through fulfillment (accept → preparing → ready for pickup)
- [ ] Seller can receive payout to MoMo within configured schedule
- [ ] Seller can view dashboard, analytics, orders, messages
- [ ] Seller can manage staff accounts
- [ ] Seller can upgrade from Starter to Growth and commission rate adjusts
- [ ] All 11 seller console screens match canonical visual artifacts
- [ ] Bulk CSV upload works for sample of 50 products
- [ ] Photographed by Vendoora service can dispatch a request and receive uploaded photos
- [ ] Coverage thresholds met for all new code
- [ ] All Phase 4 features documented in runbooks

## 6.4 Phase 4 Specific Risks

- **KYC document review queue.** Manual review of KYC documents will be a bottleneck. Build the queue UI to be efficient.
- **Bulk CSV upload complexity.** Real seller CSVs are messy. Plan for validation, error reporting, partial uploads.
- **Stripe Connect subscriptions.** Some Liberian sellers may not have credit cards. Subscription billing for paying plans needs a graceful "pay via MoMo" alternative — flag for v1.1 if not feasible in MVP.
- **Photographed by Vendoora coordination.** Real-world dispatch to photographers is operationally complex. Start with manual coordination via support team; automate in v1.1.

# 7. Phase 5 — Diaspora Experience

**Estimated duration:** 1.5 months (6 weeks)
**Goal:** Diaspora buyers can shop, send gifts, schedule recurring deliveries, and emotionally connect with recipients in Liberia. The diaspora storefront feels distinct from the domestic Liberian experience.

## 7.1 Phase 5 Scope

### 7.1.1 Diaspora user detection and routing

- [ ] User signup with non-Liberian phone country code flagged as diaspora
- [ ] Self-identification at signup ("Are you sending to family in Liberia?")
- [ ] Diaspora flag affects currency display, payment methods, UI surfaces
- [ ] Buyer can toggle between domestic and diaspora modes

### 7.1.2 Diaspora landing and storefront

- [ ] Emotional-first landing page with Fraunces serif hero (per Vendoora_Diaspora_Flow.html)
- [ ] Diaspora storefront with red-gradient hero, USD pricing with LRD conversion pills
- [ ] Cultural gift bundle promotion
- [ ] Diaspora-specific featured products curation (handled by Marketing Admin in Phase 6)

### 7.1.3 Recipient address book

- [ ] Recipient model (name, relationship, phone, address, landmark)
- [ ] Add, edit, delete recipients
- [ ] Set primary recipient
- [ ] Track order history per recipient
- [ ] Recipient picker at checkout

### 7.1.4 Cultural gift bundles

- [ ] GiftBundle model with occasions (Birthday, Christmas, Easter, Ramadan, etc.)
- [ ] Bundle items (products + variants + quantities)
- [ ] Customizable bundles (recipient can substitute items)
- [ ] Bundle pricing (often discounted vs individual items)
- [ ] Marketing Admin can create bundles (Phase 6 builds the admin UI; bundles can be created via direct DB in Phase 5 for testing)

### 7.1.5 Diaspora checkout

- [ ] USD-primary pricing with LRD equivalent display
- [ ] Stripe Connect for card payments (already integrated in Phase 3)
- [ ] 2% diaspora processing fee transparently displayed
- [ ] Recipient address auto-populated from address book
- [ ] Delivery date selection (express delivery for premium)
- [ ] Personal message field
- [ ] Handwritten card service add-on ($2-5)
- [ ] Voice message attachment (browser audio recording → R2 upload)
- [ ] Currency display preference (USD, LRD, or both side-by-side)

### 7.1.6 Group gifting

- [ ] Initiator creates group gift (recipient or bundle, target amount, deadline)
- [ ] Shareable invite code/URL
- [ ] Contributor flow (open link → pay → message to recipient)
- [ ] Funds held in group escrow
- [ ] When target reached: auto-place order with combined funds
- [ ] When deadline passes without target: refund all contributors
- [ ] Group gift dashboard for initiator (progress, contributor list)

### 7.1.7 Scheduled and recurring gifts

- [ ] One-time scheduled gifts (e.g., "send for mom's birthday May 28")
- [ ] Recurring gifts via RRULE (e.g., "monthly essentials on the 15th")
- [ ] Saved payment method required
- [ ] Order fires 48 hours before scheduled date
- [ ] Failure handling: payment declined, address invalid, product out of stock
- [ ] User notifications for upcoming and completed scheduled gifts
- [ ] Pause, modify, cancel scheduled gifts

### 7.1.8 Voice messages

- [ ] Browser audio recording via Web Audio API (30-second max)
- [ ] Audio upload to R2 as MP3 with unguessable URL
- [ ] SMS to recipient with short URL to play message
- [ ] No Vendoora account required for recipient to play
- [ ] 90-day TTL on voice message URLs

### 7.1.9 Photo + video proof of delivery (diaspora-specific upgrades)

- [ ] Photo proof from Phase 3 already exists
- [ ] Photo sent to diaspora sender within minutes of code entry
- [ ] Optional: 5-second video clip of handoff (premium add-on)
- [ ] Video upload from driver app to R2
- [ ] Video sent to diaspora sender

### 7.1.10 Hometown delivery (outside Monrovia)

- [ ] Extended delivery zones: Buchanan, Gbarnga, Sanniquellie, etc.
- [ ] Pricing tiers by zone (further = higher fee)
- [ ] Estimated delivery time by zone
- [ ] Driver coordination for hometown deliveries (manual dispatch initially)

### 7.1.11 Diaspora dashboard

- [ ] Active orders and scheduled gifts at a glance
- [ ] Recipient relationship view (per-recipient order history)
- [ ] Upcoming birthdays/anniversaries reminder
- [ ] Total spent on each recipient
- [ ] Last sent date per recipient

### 7.1.12 Diaspora referral program

- [ ] Referral code per user
- [ ] Track referrals (who signed up via code)
- [ ] Reward both referrer and referee with Vendoora Credit
- [ ] Referral leaderboard (optional, for engagement)

## 7.2 Phase 5 Entry Gates

- [ ] Phase 4 exit gates all pass
- [ ] Phase 3's Stripe integration confirmed working for diaspora cards
- [ ] At least 3-5 diaspora design partners identified for testing

## 7.3 Phase 5 Exit Gates

- [ ] A diaspora buyer can sign up, add a recipient, browse the diaspora storefront, and place an order paying in USD
- [ ] Recipient receives the package via the Liberian fulfillment + delivery flow (no separate flow needed — same trust mechanic)
- [ ] Sender receives photo proof of delivery within minutes
- [ ] A buyer can attach a voice message to a gift, and the recipient can play it via SMS link
- [ ] Group gifting works: 3+ contributors → target reached → order placed
- [ ] Scheduled gift fires correctly on the scheduled date with current FX rate locked
- [ ] Cultural bundles can be ordered as a unit
- [ ] All 6 diaspora flow screens match canonical visual artifacts (Vendoora_Diaspora_Flow.html)
- [ ] Coverage thresholds met
- [ ] Hometown delivery to at least 2 additional cities (Buchanan, Gbarnga) works end-to-end

## 7.4 Phase 5 Specific Risks

- **Voice message UX.** Browser audio recording has cross-browser quirks. Test extensively on iOS Safari, Chrome, Firefox.
- **Group gift edge cases.** What if a contributor's payment fails after target reached? What if a contributor wants to withdraw? Define and test these flows.
- **Hometown delivery operations.** Outside Monrovia, driver supply is thinner. Manual coordination is acceptable in MVP; automation is v1.1.
- **Stripe FX handling.** Stripe collects in the buyer's currency; we pay out in LRD. Ensure the FX flow is auditable.

# 8. Phase 6 — Admin & RBAC

**Estimated duration:** 3 months (12 weeks) — revised May 2026 after MarketHub scope addition
**Goal:** All 8 admin role surfaces fully functional, plus the unified Trust Case management system, expanded KYC center with reminders, profile change request review queues, review moderation, system operations tooling (webhooks, outbox, system readiness, maintenance mode), and subscription tier management. Superadmin can create custom roles. Audit log is browsable. Step-up auth works. Internal team can fully operate Vendoora through admin tooling.

## 8.1 Phase 6 Scope

### 8.1.1 Admin shell

- [ ] `/admin/*` route subtree with permission-based access
- [ ] Admin sidebar dynamically rendered based on user permissions
- [ ] Admin header with logged-in user, MFA status, current role
- [ ] Admin theme (slightly distinct from buyer/seller theme to signal context)
- [ ] Admin session enforcement (4-hour timeout, step-up auth integration)

### 8.1.2 Superadmin surfaces

- [ ] Superadmin dashboard (platform-wide KPIs)
- [ ] Role management UI (create, edit, delete custom roles)
- [ ] Permission matrix viewer (read-only catalog of all 120 permissions)
- [ ] User role assignment UI
- [ ] Audit log viewer with full-text search, filters, export
- [ ] Platform configuration UI (commission rates, escrow timeouts, insurance fund balance)
- [ ] Feature flag management

### 8.1.3 Finance Admin surfaces

- [ ] Finance dashboard (GMV, revenue, fees, insurance fund balance)
- [ ] Payouts queue (pending, processing, completed, failed)
- [ ] Refunds queue (with authorize/deny actions, step-up auth for >$500)
- [ ] Escrow oversight (search by order, view state, force-release/freeze with step-up)
- [ ] MoMo reconciliation interface
- [ ] Daily close process
- [ ] FX rate viewer and override capability

### 8.1.4 Trust & Safety Admin surfaces

- [ ] T&S dashboard (open disputes, SLA status, recent escalations)
- [ ] Disputes queue (filterable by status, age, priority)
- [ ] Dispute detail view (full thread, evidence, resolution actions)
- [ ] KYC review queue (Tier 1 → 2, Tier 2 → 3, Tier 3 → 4 promotions)
- [ ] Product moderation queue (flagged products, counterfeit reports)
- [ ] User suspension interface with reason tracking
- [ ] Fraud case management

### 8.1.5 Support Admin surfaces

- [ ] Support ticket queue
- [ ] Ticket detail view with conversation thread
- [ ] User account lookup
- [ ] Password reset trigger
- [ ] Order status override (with step-up for sensitive changes)
- [ ] Refund request escalation to Finance

### 8.1.6 Operations Admin surfaces

- [ ] Driver fleet view (all drivers, status, performance)
- [ ] Delivery zone management
- [ ] Pickup hub management
- [ ] Real-time order monitoring (active deliveries, delays)
- [ ] Surge configuration

### 8.1.7 Marketing Admin surfaces

- [ ] Promo code management (create, edit, deactivate, view usage)
- [ ] Featured products curation
- [ ] Email campaign creation and sending (via Loops)
- [ ] Cultural bundle creation and editing
- [ ] Diaspora landing page A/B test management

### 8.1.8 Catalog Admin surfaces

- [ ] Category management (CRUD, hierarchy)
- [ ] Attribute schema management per category
- [ ] Product moderation queue (separate from T&S moderation — Catalog handles structural issues, T&S handles violations)
- [ ] Seller onboarding queue management

### 8.1.9 Analytics Admin surfaces

- [ ] Read-only access to all dashboards
- [ ] Custom report builder
- [ ] Export to CSV/Excel
- [ ] Scheduled report delivery

### 8.1.10 MFA enrollment and step-up auth UI

- [ ] First-login MFA enrollment for admins
- [ ] TOTP QR code display and verification
- [ ] Backup code generation and download
- [ ] Step-up auth prompt UI
- [ ] Re-authentication flow

### 8.1.11 Audit log UX

- [ ] Searchable by actor, target, action, resource, date range
- [ ] Filter by category (auth, financial, RBAC, KYC)
- [ ] Detail view with before/after state diff
- [ ] CSV export for compliance/regulatory requests
- [ ] Cannot UPDATE/DELETE (enforced both at UI and database level)

### 8.1.12 Trust Case Management System (NEW — May 2026 audit)

This is the single largest addition to Phase 6 — a unified case management system replacing per-subject queues.

- [ ] Trust Case list view (`/admin/trust/cases`) with comprehensive filters (open, my assigned, unassigned, escalated, needs info, restricted, due soon, overdue, resolved)
- [ ] Trust Case detail page (`/admin/trust/cases/[id]`) with timeline, notes, actions, evidence summary
- [ ] Trust Case creation flow (manual case creation by T&S admin)
- [ ] Auto-creation engine (`packages/domain/src/trust/auto-creation.ts`) triggering cases from risk signals
- [ ] Workload board (`/admin/trust/workload`) — Kanban view by status, staff workload cards
- [ ] Urgent cases panel (`/admin/trust/urgent`) — CRITICAL severity cases
- [ ] Unassigned cases panel (`/admin/trust/unassigned`)
- [ ] My Assigned view per T&S staff member
- [ ] SLA timers per case (CRITICAL=24h, HIGH=48h, MEDIUM=72h, LOW=7d)
- [ ] Due date computed automatically based on severity at creation
- [ ] Notifications on case assignment, due date update, escalation (24h before due)
- [ ] Trust Case actions: add note (internal vs shared), request info, escalate, mark monitoring, mark reviewed, create follow-up, restrict, resolve
- [ ] Evidence summary computed per subject type (seller/driver/product/order/dispute/KYC/user — see Engineering_Spec §4.14)
- [ ] Follow-up cases linked via parent_case_id
- [ ] Case action audit log per case
- [ ] Internal-only notes vs shared-with-subject notes
- [ ] **Migration:** Existing dispute queue records migrate to TrustCase entries with subject_type=DISPUTE
- [ ] **Migration:** Existing KYC review queue records migrate to TrustCase entries with subject_type=KYC
- [ ] **Migration:** Existing product moderation queue records migrate to TrustCase entries with subject_type=PRODUCT

### 8.1.13 KYC Center expansion (NEW — May 2026 audit)

- [ ] `/admin/kyc/queue` — pending review (sortable by SLA, age, risk_tier)
- [ ] `/admin/kyc/needs-info` — applications waiting on additional documents
- [ ] `/admin/kyc/stale` — applications with no applicant action 14+ days
- [ ] `/admin/kyc/not-started` — registered users who haven't started KYC
- [ ] `/admin/kyc/completed` — APPROVED applications (read-only audit)
- [ ] `/admin/kyc/reminders` — reminder management UI
- [ ] Send individual KYC reminder button (per application)
- [ ] Bulk reminder action (send to all stale OR all not-started)
- [ ] Background worker auto-sends reminders at days 3, 7, 14
- [ ] Reminder count tracked per application
- [ ] Risk tier assignment UI during review (LOW/MEDIUM/HIGH)
- [ ] "Needs more info" state with structured feedback to applicant
- [ ] KYC document upload review per document (REVIEWED_VALID/INVALID per doc)

### 8.1.14 Profile Change Request Review Queues (NEW — May 2026 audit)

- [ ] `/admin/profile-changes` — pending standard changes (ts_admin)
- [ ] `/admin/profile-changes/sensitive` — pending sensitive changes (superadmin only)
- [ ] Per-request detail view with before/after diff, supporting documents, reason
- [ ] Approve / Deny / Needs More Info actions with notes
- [ ] On approval: background worker applies the change within a transaction with audit log
- [ ] Sensitive changes (bank, MoMo, legal name, tax ID, owner name) require step-up auth even after permission check
- [ ] Notifications back to requester (pending, approved, denied, needs info)

### 8.1.15 Review Moderation (NEW — May 2026 audit)

- [ ] `/admin/reviews` — all reviews searchable by status, subject, author
- [ ] `/admin/reviews/reports` — reported reviews queue (auto-populated when 3+ reports)
- [ ] `/admin/reviews/hidden` — admin-hidden reviews (audit trail)
- [ ] Per-review actions: hide (sets HIDDEN status), publish (overrides report queue), delete (admin-initiated)
- [ ] Reviewer note required on every moderation action
- [ ] Notification to author on hide/restore actions
- [ ] T&S admin permission: `review.moderate`

### 8.1.16 System Operations Admin Tooling (NEW — May 2026 audit)

- [ ] `/admin/webhooks` — searchable webhook log (inbound + outbound), filter by provider/status/date
- [ ] `/admin/webhooks/[id]` — detail view with request/response payload (sanitized)
- [ ] `/admin/outbox` — pending OutboxEvent queue with manual retry button
- [ ] `/admin/outbox/dead-letter` — failed events past retry limit
- [ ] `/admin/system-readiness` — health dashboard:
  - [ ] Database connection + latency
  - [ ] Redis connection + latency
  - [ ] Email service status
  - [ ] Stripe webhook health
  - [ ] MTN MoMo + Orange Money API health
  - [ ] Outbox backlog count
  - [ ] Webhook backlog count
  - [ ] Background worker status
- [ ] `/admin/maintenance-mode` (superadmin only) — toggle maintenance mode with custom message
- [ ] Maintenance mode displays maintenance illustration to public traffic; admins can still log in

### 8.1.17 Subscription Tier Management (NEW — May 2026 audit)

- [ ] `/admin/subscriptions` — subscription review queue (Finance Admin)
- [ ] `/admin/subscription-tiers` — superadmin CRUD on SaaS tier definitions
- [ ] Per-tier configuration: name, price, commission rate, product limits, pinned allowance, promoted credits, entitlements (SEO/bulk/analytics/instant payout/priority support/store customization)
- [ ] Tier change history audit log
- [ ] Active subscription list view per tier
- [ ] Failed payment recovery workflow

### 8.1.18 Featured Vendor + Promoted Posts Admin (NEW — May 2026 audit)

- [ ] `/admin/promoted-listings` — moderation + pricing queue (Marketing Admin)
- [ ] `/admin/featured-vendors` — slot inventory + pricing
- [ ] `/admin/promoted-posts` — post moderation queue (approve/reject before publication)
- [ ] `/admin/monetization` — pricing dashboard for all paid placements
- [ ] Slot inventory configuration (homepage, category landing, diaspora storefront)
- [ ] Pricing curves (base price × duration × demand multiplier)

## 8.2 Phase 6 Entry Gates

- [ ] Phase 5 exit gates all pass
- [ ] All permissions seeded in database (done in Phase 1)
- [ ] All 8 system roles seeded (done in Phase 1)
- [ ] Founder identifies at least 2 internal admins for testing

## 8.3 Phase 6 Exit Gates

- [ ] Superadmin can create a custom role, assign it to a user, and that user gains the corresponding permissions
- [ ] Finance Admin can view payouts, authorize refunds under $500 without step-up, authorize refunds over $500 with step-up
- [ ] T&S Admin can review and resolve disputes via the resolution decision tree
- [ ] Support Admin can look up a user, reset their password, view their orders
- [ ] Operations Admin can manage drivers and delivery zones
- [ ] Marketing Admin can create a promo code and see it work at checkout
- [ ] Catalog Admin can add a new category and attribute schema
- [ ] Analytics Admin can view dashboards but cannot modify data (test enforcement)
- [ ] Audit log shows entries for every admin action performed during Phase 6 testing
- [ ] All admin surfaces match the role-based navigation rules
- [ ] Step-up auth blocks high-value operations correctly
- [ ] Coverage thresholds met

## 8.4 Phase 6 Specific Risks

- **Admin UI is large.** 27+ distinct surfaces (per `Engineering_Spec.md` Section 13.1). Time-box each surface ruthlessly.
- **Audit log UX complexity.** Search across 100K+ entries needs proper indexing and pagination.
- **Step-up auth flow friction.** Every step-up event interrupts the admin's work. UX must be smooth even when functionality is strict.
- **Custom role creation safety.** Superadmin could accidentally create a role that breaks things. Validation must prevent obviously bad combinations.

# 9. Phase 7 — Driver Logistics

**Estimated duration:** 2 months (8 weeks) — revised May 2026 after MarketHub scope addition
**Goal:** Drivers can sign up, complete KYC (including selfie verification), get verified, accept orders, navigate to pickup and delivery, complete with code entry + photo proof, and receive payouts. Drivers can request profile changes for review. The driver web app and dispatch system are operational.

## 9.1 Phase 7 Scope

### 9.1.1 Driver onboarding flow

- [ ] Sign Up screen (OTP verification, basic info) — per Vendoora_Mobile_Apps.html screen 11
- [ ] Document Upload screen — screen 12. **NEW (May 2026 audit):** Required documents expanded:
  - [ ] Driver's License (existing)
  - [ ] National ID (existing)
  - [ ] Vehicle Registration (existing)
  - [ ] Proof of Address (existing)
  - [ ] **Selfie (NEW)** — required for identity matching against ID document
- [ ] Background Check & Training screen — screen 13
- [ ] Ready to Drive activation screen — screen 14
- [ ] Each step has state tracking in `drivers.onboarding_status`
- [ ] **NEW (May 2026 audit):** Driver KYC application uses the new `KycApplication` + `KycDocument` first-class models (per Engineering_Spec §4.18)
- [ ] **NEW (May 2026 audit):** Driver risk tier assigned during T&S review (LOW/MEDIUM/HIGH)
- [ ] **NEW (May 2026 audit):** "Needs more info" state allows T&S to request specific additional documents
- [ ] Background check integration (manual review by T&S Admin initially — Phase 6 built this surface)
- [ ] Training video library
- [ ] Approval workflow with founder/Operations Admin sign-off

### 9.1.1a Driver profile change request flow (NEW — May 2026 audit)

- [ ] Driver dashboard "Settings → Profile" with locked fields (legal name, driver's license number, vehicle details, service zone, bank account, MoMo number)
- [ ] Edit attempts on locked fields open a "Request Change" modal
- [ ] Supporting documents upload (e.g., new license photo if license changed)
- [ ] Pending change badge appears on locked fields until approved
- [ ] Status notifications (pending review, approved, denied, needs info)
- [ ] Read-only history of past change requests
- [ ] Sensitive changes (bank account, MoMo number) require Superadmin approval; routine changes (vehicle details, service zone) require T&S Admin approval

### 9.1.2 Driver web app

- [ ] Driver Queue / Home — screen 7 from canonical artifacts
- [ ] Active Delivery — screen 8 with map view
- [ ] Code Entry & Photo Capture — screen 9 (uses Phase 3 backend)
- [ ] Earnings Dashboard — screen 10
- [ ] Driver profile and settings
- [ ] Online/offline toggle

### 9.1.3 Dispatch algorithm

- [ ] Driver candidate ranking (40% closest + 30% rating + 20% on-time + 10% acceptance)
- [ ] Offer mechanism (60 seconds for driver to accept)
- [ ] Escalation if no acceptance (radius expansion, surge bonus, alert at 15 minutes)
- [ ] Multi-driver concurrent offers (avoid wasted offers when one driver is already responding)

### 9.1.4 Real-time location tracking

- [ ] Driver app posts location every 30 seconds during active delivery
- [ ] Backend updates `drivers.current_location_*`
- [ ] WebSocket channel for buyer order tracking page
- [ ] Privacy: location data purged from operational store after 24 hours
- [ ] Privacy: aggregated heatmaps preserved for Operations admin analytics

### 9.1.5 Multi-stop route optimization

- [ ] When driver has multiple deliveries queued, compute optimal route
- [ ] Constrained TSP solver (pickups before dropoffs)
- [ ] Use Google Maps Distance Matrix API (or self-hosted OSRM)
- [ ] Refresh on new delivery acceptance, delivery completion, location deviation

### 9.1.6 Driver-buyer communication (masked numbers)

- [ ] Twilio Proxy session created at dispatch
- [ ] Driver and buyer each get a masked number for the duration of the delivery
- [ ] All calls/texts logged for dispute investigation
- [ ] Session torn down after delivery complete + 24 hours

### 9.1.7 Driver tier system

- [ ] Nightly job recomputes driver tiers per `Engineering_Spec.md` Section 12.4
- [ ] Tier display in driver app
- [ ] Tier impacts: dispatch priority, eligibility for high-value orders, earnings multipliers
- [ ] Featured driver badge in buyer UI for ELITE tier

### 9.1.8 Driver incentive engine

- [ ] Peak hour bonuses
- [ ] Weekend coverage bonuses
- [ ] Specific zone surge pricing
- [ ] Completion streak bonuses (e.g., 10 deliveries in a row → bonus)
- [ ] First 90 days bonus ($10 on first 3 deliveries — per screen 14)

### 9.1.9 Driver vehicle types

- [ ] Vehicle registration with type (motorcycle, car, van, truck, bicycle, on-foot)
- [ ] Insurance upload and expiration tracking
- [ ] Dispatch matches order to vehicle capacity (large orders need vans/trucks)

### 9.1.10 In-app navigation

- [ ] Integration with Google Maps or Mapbox for turn-by-turn
- [ ] Option to open native nav app (Google Maps, Waze)
- [ ] ETA updates from nav back to system

### 9.1.11 Returns / failed delivery flow

- [ ] Driver indicates failed delivery (buyer not home, wrong address, refused)
- [ ] Package returns to depot or seller
- [ ] T&S admin reviews failure case
- [ ] Buyer notified with options (reschedule, refund, redelivery)

### 9.1.12 Driver payouts

- [ ] Instant MoMo cashout flow (per screen 10)
- [ ] Configurable schedule (instant, daily, weekly)
- [ ] Payout history with per-delivery breakdown
- [ ] Failed payout retry + manual intervention

### 9.1.13 Driver ratings

- [ ] Buyer rates driver after delivery (1-5 stars + optional comment)
- [ ] Rating updates `drivers.rating_average` and `rating_count`
- [ ] Tier promotion triggers on rating thresholds

### 9.1.14 Delivery insurance fund integration

- [ ] When T&S marks a dispute as INSURANCE_PAYOUT (Phase 3 + 6 logic), the driver may be flagged
- [ ] Pattern detection: drivers with multiple in-transit damage cases get reviewed
- [ ] Operations admin can suspend a driver pending investigation

## 9.2 Phase 7 Entry Gates

- [ ] Phase 6 exit gates all pass
- [ ] Operations Admin tooling working (built in Phase 6)
- [ ] T&S Admin can review background checks (built in Phase 6)
- [ ] At least 3-5 driver candidates identified for pilot

## 9.3 Phase 7 Exit Gates

- [ ] A new driver can complete onboarding end-to-end (signup → documents → background check → training → ready)
- [ ] A driver goes online and receives a real (test) dispatch offer
- [ ] Driver accepts, navigates to pickup, picks up, navigates to dropoff, enters delivery code, captures proof photo, completes delivery
- [ ] Escrow transitions correctly through the entire flow (relies on Phase 3)
- [ ] Driver receives MoMo payout
- [ ] Multi-stop route works (driver with 2 concurrent deliveries gets optimized route)
- [ ] Driver tier promotion works (nightly job creates EXPERIENCED tier from STANDARD after threshold)
- [ ] Masked number communication works between driver and buyer
- [ ] All 4 driver app screens match canonical visual artifacts
- [ ] Coverage thresholds met

## 9.4 Phase 7 Specific Risks

- **Real-world driver behavior.** Drivers may share codes with friends to pick up packages. Drivers may fake photos. Mitigation: GPS + timestamp on photos, rating system, dispute investigation.
- **Connectivity in Liberia.** Drivers operate on budget Android phones with intermittent connectivity. Offline-tolerance is important (some basic state caching).
- **Battery drain from real-time tracking.** 30-second location updates drain batteries. Acceptable tradeoff but document for drivers.
- **Dispatch algorithm tuning.** The first iteration of dispatch won't be optimal. Plan for iteration based on real driver acceptance data.

# 10. Phase 8 — Integration, Testing, Pilot

**Estimated duration:** 2 months (8 weeks)
**Goal:** Vendoora is validated end-to-end with real users running real money through real flows. Public launch readiness confirmed.

## 10.1 Phase 8 Scope

### 10.1.1 End-to-end integration testing

- [ ] Full E2E test suite covering critical flows (Playwright)
- [ ] Buyer journey: signup → browse → checkout → tracking → delivery → review
- [ ] Diaspora journey: signup → add recipient → gift bundle → checkout → photo proof
- [ ] Group gift journey: initiate → invite → contributions → target reached → order placed
- [ ] Scheduled gift journey: create → fires on date → payment → delivery → notification
- [ ] Seller journey: signup → KYC → list product → receive order → fulfill → payout
- [ ] Driver journey: onboard → online → accept → deliver → payout
- [ ] Admin journey: each admin role's primary tasks validated end-to-end
- [ ] Dispute journey (multiple scenarios): not received, damaged, wrong item, counterfeit, in-transit damage
- [ ] Payment failure recovery: MoMo timeout, Stripe decline, retry handling
- [ ] Concurrency: multiple admins simultaneous actions, multiple buyers same product

**NEW (May 2026 audit) — Expanded E2E coverage:**

- [ ] Review journey: buyer completes order → leaves review → seller responds → review appears with verified badge → buyer edits → buyer reports bad review → T&S moderates
- [ ] Trust Case journey: auto-creation from fraud signal → assignment to T&S → notes added → escalated → resolved → audit trail intact
- [ ] Trust Case journey (manual): T&S admin creates case for problematic seller → adds evidence → suspends seller → resolves
- [ ] Seller profile change journey: seller requests bank account change → routed to Superadmin → approved with step-up auth → applied to seller record with audit log
- [ ] Driver profile change journey: driver requests vehicle change → routed to T&S Admin → approved → applied
- [ ] Product condition journey: seller lists used product → condition note required → buyer filters by condition → purchases USED_GOOD item → buyer protection applies appropriately
- [ ] Product authenticity journey: seller lists with PROOF_PROVIDED → upload documents → product detail shows verified badge → dispute over counterfeit → T&S reviews proof → resolution
- [ ] KYC reminder journey: buyer signs up but doesn't start KYC → 3-day reminder → 7-day reminder → 14-day stale flag → admin sends bulk reminder
- [ ] Featured Vendor journey: seller requests homepage slot → pricing computed → Stripe charge → Marketing Admin reviews → approved → rendered on homepage for duration
- [ ] Promoted Post journey: seller composes post → Marketing Admin reviews → approved → published with impressions tracking → budget cap reached → automatically deactivated
- [ ] Subscription tier change: seller upgrades from Growth to Pro → commission rate adjusts → product limit increases → entitlements unlock (SEO controls, advanced analytics)
- [ ] Maintenance mode: superadmin enables → public traffic sees maintenance page → admins still log in → superadmin disables → normal traffic restored
- [ ] System operations: webhook log shows recent inbound MoMo events → outbox dead letter shows a failed notification → admin retries → succeeds
- [ ] Code expiry: delivery code generated → 72 hours pass without entry → expiry triggers T&S escalation → admin resends code → driver completes delivery
- [ ] Code admin resend: failed delivery + admin intervention → new code generated → old code invalidated → driver enters new code successfully
- [ ] Dark mode: every primary surface tested in both light and dark themes; theme persists across sessions

### 10.1.2 Security audit

- [ ] Third-party penetration test (mandatory for fintech)
- [ ] OWASP Top 10 review
- [ ] Authentication and session security audit
- [ ] RBAC enforcement audit
- [ ] Audit log integrity verification
- [ ] Secret management audit
- [ ] PCI-DSS SAQ-A final completion
- [ ] All security findings remediated before pilot

### 10.1.3 Performance audit

- [ ] Real device testing from Liberia (budget Android over Lonestar/Orange networks)
- [ ] LCP measurements meet thresholds per `Engineering_Spec.md` Section 18
- [ ] API latency p95 meets thresholds
- [ ] Database queries p95 meets thresholds
- [ ] Load testing: 10K concurrent users, 100 orders/min sustained
- [ ] Bottleneck identification and remediation

### 10.1.4 Compliance verification

- [ ] Terms of Service finalized and posted
- [ ] Privacy Policy finalized and posted
- [ ] Seller Agreement finalized
- [ ] Cookie consent banner working
- [ ] GDPR data export endpoint tested
- [ ] GDPR data deletion endpoint tested
- [ ] Age verification working for restricted goods
- [ ] CBL reporting capability tested
- [ ] LTA reporting capability tested
- [ ] LRA tax filing export tested

### 10.1.5 Disaster recovery testing

- [ ] Database backup/restore tested end-to-end
- [ ] Failover scenarios documented
- [ ] Incident response runbook drilled (simulated production outage)
- [ ] Communication plan for incidents

### 10.1.6 Documentation completion

- [ ] All runbooks complete and reviewed
- [ ] API documentation generated and published
- [ ] Help center content for buyers, sellers, drivers
- [ ] Onboarding flows tested with real users (not just team)

### 10.1.7 Pilot recruitment

- [ ] 20-30 hand-picked Monrovia sellers onboarded
- [ ] 5-10 US-based Liberian diaspora design partners recruited
- [ ] 10-15 drivers approved and ready
- [ ] Pilot participants briefed on the trust mechanic
- [ ] Pilot participants have direct line to founder for feedback

### 10.1.8 Pilot launch (4-6 weeks)

- [ ] Week 1-2: Soft launch with first 5 sellers, 3 diaspora design partners, 5 drivers
  - Real orders, real money, close monitoring
  - Daily check-ins with all participants
  - Immediate bug triage
- [ ] Week 3-4: Expand to remaining pilot participants
  - All 20-30 sellers active
  - All diaspora design partners active
  - All drivers active
  - Continue daily monitoring, weekly retrospectives
- [ ] Week 5-6: Stabilization
  - Bug fixes from weeks 1-4
  - UX iteration based on participant feedback
  - Performance optimization based on real usage patterns
  - Final readiness assessment

### 10.1.9 Public launch preparation

- [ ] Marketing site fully polished
- [ ] PR strategy ready
- [ ] Customer support team trained
- [ ] Operations team trained on admin tools
- [ ] Founder communication plan finalized
- [ ] Status page configured
- [ ] Monitoring dashboards reviewed daily

## 10.2 Phase 8 Entry Gates

- [ ] Phases 1-7 exit gates all pass
- [ ] Security audit firm contracted
- [ ] Pilot participants identified

## 10.3 Phase 8 Exit Gates (= MVP Launch Readiness)

ALL of these must be true before public launch:

**Trust mechanic verified:**

- [ ] 50+ real orders completed end-to-end in pilot
- [ ] At least 5 disputes opened and resolved in pilot
- [ ] At least 1 insurance fund payout executed
- [ ] Zero financial discrepancies in reconciliation across all pilot orders
- [ ] Zero escrow state machine bugs surfaced in pilot

**Quality verified:**

- [ ] No P0 or P1 bugs open
- [ ] All security audit findings remediated
- [ ] All performance thresholds met under load
- [ ] All E2E tests passing in CI

**Operations ready:**

- [ ] Support team can handle inbound questions
- [ ] T&S team can resolve disputes within SLA
- [ ] Finance team can run daily reconciliation
- [ ] Founder has reviewed and approved launch

**Compliance ready:**

- [ ] All legal documents posted
- [ ] All regulatory reporting capabilities tested
- [ ] PCI compliance posture verified

**Pilot feedback addressed:**

- [ ] All pilot participants surveyed
- [ ] All critical feedback themes addressed
- [ ] Pilot participants endorse readiness

If ANY of these is not true, public launch is delayed until it is. No exceptions.

## 10.4 Phase 8 Specific Risks

- **Pilot feedback may require significant rework.** Build buffer time into the 2-month estimate.
- **Security audit findings may take time to remediate.** Some findings may require architectural changes.
- **Regulatory questions may delay launch.** CBL, LTA, or LRA may have requirements that surface during compliance verification.
- **Operations team readiness.** A platform is only as good as the team operating it. Don't underestimate training time.

# 11. Cross-Phase Concerns

Some work doesn't fit neatly into one phase. These concerns are tracked and addressed across phases.

## 11.1 Documentation

Documentation is created in the same phase as the feature it describes. No documentation backlog.

Tracked artifacts:
- `docs/runbooks/` — operational procedures
- `docs/decisions/` — Architecture Decision Records
- `docs/api/` — auto-generated API reference
- Package READMEs
- In-code comments per `Build_Prompt.md` Section 9.5

## 11.2 Testing

Testing is not a phase — it's an attribute of every feature in every phase per TDD discipline. The Phase 8 testing work is integration and end-to-end validation, not "now we add tests."

## 11.3 Security

Security is built in from Phase 1, not bolted on in Phase 8. Every feature has security review during plan phase per `Build_Prompt.md` Section 13. Phase 8's security audit is the *external validation*, not the *first time* security gets considered.

## 11.4 Performance

Performance budgets per `Engineering_Spec.md` Section 18 apply from Phase 1. Vercel Analytics tracks real user metrics from launch. Phase 8 is for load testing and remediation, not for "we'll think about performance later."

## 11.5 Feature flags

Every new feature ships behind a feature flag, defaulting to off. Flags are managed via PostHog. Phase exits include "flag the feature on for the appropriate audience" as part of the exit gate.

## 11.6 i18n preparation

All user-facing strings flow through `packages/i18n` from Phase 1. Initially only English is supported, but the structure is in place. French and Liberian English are v1.1 work; the prep work happens in v1 phases.

## 11.7 Compliance work threading

Some compliance work spans multiple phases:
- KYC tier system: Phase 4 builds the seller side, Phase 7 builds the driver side
- Audit logging: Phase 1 builds the infrastructure, every subsequent phase adds entries
- GDPR data export: Phase 1 builds the framework, every entity-handling phase adds export support
- Regulatory reporting: Phase 8 validates that all data needed for reports is captured

# 12. Phase Gate Reviews

Each phase exit gate is a formal review with the founder. The review:

1. **Lasts 60-90 minutes**
2. **Walks through the exit gate checklist** (every item verified by demonstration, not just self-attestation)
3. **Surfaces any deferred items** (things that didn't make this phase but are needed for the next)
4. **Updates risk register** based on what was learned
5. **Confirms readiness to proceed** to the next phase

If exit gate items fail:
- Items are added to a "carry-forward" list with target dates
- Decision: continue to next phase with carry-forward, or extend current phase
- If continuing with carry-forward: items must be completed within 2 weeks or the next phase pauses

The discipline: gates are gates. "Mostly done" Phase 3 + "started" Phase 4 = neither is done.

# 13. Risk Register

The largest risks across the build, monitored continuously:

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MTN MoMo integration delays | Medium | High | Start MTN commercial conversations in Phase 1, not Phase 3 |
| Orange Money integration delays | Medium | High | Same as MTN |
| Clerk pricing model changes | Low | Medium | Mirror user data in our DB so migration is feasible |
| Vercel pricing model changes | Low | Medium | Next.js runs anywhere; migration is open |
| Neon outage / pricing changes | Low | High | Postgres is portable; migration to AWS RDS is feasible |
| Founder bandwidth | High | High | Review burden grows with build. Pre-schedule review windows. |
| Scope creep | High | High | The ~189-feature freeze (post-MarketHub audit) is the primary mitigation. Enforce it. |
| Trust mechanic bug post-launch | Low | Catastrophic | Phase 3's 100% coverage requirement is the mitigation. |
| Regulatory requirement surfaces late | Medium | Medium | Engage CBL, LTA, LRA early (not waiting until Phase 8). |
| Pilot reveals fundamental UX issues | Medium | High | Diaspora design partners recruited in Phase 5, not Phase 8. |
| Security vulnerability surfaces post-launch | Low | High | Phase 8 audit + ongoing bug bounty program (v1.1) |
| Real-world delivery operations harder than expected | Medium | Medium | Pilot phase is specifically designed to surface this. |
| Tax/AML regulations more complex than expected | Medium | Medium | Engage a Liberian tax attorney early. |
| Diaspora demand lower than expected | Medium | High | Continuous feedback loop with design partners; pivot if needed |
| FX volatility larger than expected | Low | Medium | Rate locking at order time + platform absorption + v1.1 hedging |
| **Trust Case System complexity (NEW — May 2026 audit risk)** | **Medium** | **High** | Phase 6 has 3 months allocated; subagent reviews must catch over-engineering; migrate existing dispute/KYC queues incrementally |
| **Review system abuse (NEW — May 2026 audit risk)** | **High** | **Medium** | Verified-purchase badge + reporting + auto-route to moderation at 3+ reports + clear T&S response SLA |
| **Featured Vendor / Promoted Post abuse (NEW — May 2026 audit risk)** | **Medium** | **Medium** | Marketing Admin reviews ALL paid placements before publication; no auto-approval |
| **Timeline drift from 18-24 to 24+ months (NEW — May 2026 audit risk)** | **High** | **High** | Hard scope freeze at 189 features; weekly phase progress reviews; aggressive use of v1.1 backlog for any additions |
| **Dark mode rendering edge cases (NEW — May 2026 audit risk)** | **Medium** | **Low** | Chromatic visual regression covers both themes; every component story has light + dark variant |

This register is reviewed at every phase gate.

# 14. Post-MVP Roadmap

## 14.1 v1.1 (Months 1-6 after MVP launch)

Features explicitly deferred from MVP, prioritized for v1.1:

- **Sanctions screening** (1.9) — integrate ComplyAdvantage or Alloy
- **Counterfeit detection** (1.10) — ML model trained on production data
- **Seller insurance bonds** (1.12) — capital program design
- **Featured editorial collections** (3.9) — Marketing admin UI for curation
- **Family group accounts** (4.13) — multi-user diaspora households
- **Seller mobile app** (5.11) — Expo build
- **Seller financing / cash advances** (5.14) — fintech partnership required
- **Currency hedging** (2.15) — treasury function
- **Crypto payments architecture** — USDC support if measurable demand
- **v1.1 backlog items** from `docs/v1.1-backlog.md`

## 14.2 v2 (Months 6-18 after MVP launch)

Long-term differentiators:

- **Trust Score API** (10.1) — public API for third parties
- **Open seller export** (10.2) — full data portability
- **Vendoora Express B2B fulfillment** (10.3) — logistics-as-a-service
- **Buyer-protection guarantee fund** (10.4) — public capitalized fund
- **Liberian-language UI** (10.5) — Vai, Kpelle
- **Offline mode** (10.6) — for low-connectivity zones
- **Voice-driven shopping** (10.7) — accessibility for low-literacy users
- **Third-party integration API** (10.8) — platform play
- **Editorial content** (10.9) — blog, recipes, stories
- **In-person events** (10.10) — diaspora city marketplaces
- **Native iOS and Android apps** — mobile-buyer and mobile-driver Expo apps to full production

## 14.3 v3+ (Beyond)

Strategic possibilities, not committed:

- Cross-border expansion to Sierra Leone, Liberian diaspora in additional cities
- Vendoora as the trust layer for other African e-commerce platforms
- B2B marketplace alongside consumer
- Embedded finance products (credit, insurance) for sellers

These are aspirations, not commitments. The path from MVP to v3+ depends entirely on what's learned during MVP operation.

---

# Document Status

**Version 1.0** — Initial construction order, locked May 2026.

This document defines when Vendoora gets built. For *what* to build, see `Engineering_Spec.md`. For *how* to build it, see `Build_Prompt.md`.

**Change control:** Modifications to this document require:
1. Founder approval
2. Version bump
3. Phase gate review schedule updated

**End of Phased_Build_Playbook.md**
