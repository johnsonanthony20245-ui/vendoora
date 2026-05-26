# Vendoora — Engineering Specification

**Version:** 1.0 (extended by **Polish_Phase_Addendum.md v1.3** May 2026)
**Date:** May 2026
**Status:** Locked — source of truth for Claude Code implementation
**Audience:** Engineering implementer (Claude Code with Superpowers plugin), reviewed by founder

> **Polish + Merge + Geo-Routing + Admin Tools Phase Update (May 2026):** This spec is extended by `Polish_Phase_Addendum.md v1.3` which adds ~83 features across four phases. Phase 1 (Polish): buyer trust visibility, 5-stage tracking, seller onboarding, Trust Center signature, notifications surface, admin reports/drivers/moderation, UX polish. Phase 2 (Merge): refund breakdown, KYC policy pages, delivery-code mechanic page, unified /brand design system viewer, DLQ, maintenance mode, admin audit log, driver photo capture. Phase 3 (Geo-Routing): 3-layer audience detection (URL > localStorage > IP geo), persistent "Shopping as" pill, first-visit modal, audience-aware LRD-first / USD-first pricing, plus Liberia-specific homepage sections (Local Promise Strip, Just Listed Today, Featured by City, WhatsApp CTA) and Diaspora-specific homepage sections (Multi-Payment row, Currency Context, Holiday Countdown, Group Gift Hero, Photo of Delivery showcase, hero rewrite to "Send a Care Box in under 5 minutes"). Phase 4 (Admin Tools): 4 new admin screens — Analytics Dashboard with 8 chart types (line, bar, donut, sparkline, funnel, stacked bar, area, heatmap) covering revenue trend, GMV by category, buyer growth local-vs-diaspora, order funnel, top sellers, category performance, time-of-day heatmap, and significant events feed; Financial Control Center with KPI bar, revenue breakdown stacked bar, live escrow ledger split by age + tier, currency exposure donut, payout queue table, refund history; Operations Command with KPI bar, live Monrovia map with animated driver pulses, service health grid for 10 integrations, live activity feed, driver coverage by city, stockout alerts, suspicious activity feed; Platform Configuration with commission rate matrix by tier, featured-slot pricing, feature flags with rollout %, Liberian holiday calendar 2026, geography/category taxonomy, notification template editor. The addendum is authoritative for the items it covers; this document remains authoritative for everything else. **Vendoora_App.html is the canonical visual + interaction reference** — the 16 standalone Vendoora_*.html files are historical-only. Read both.

---

## How to read this document

This is the master technical specification for Vendoora. It defines *what* gets built and *how* it should be structured. It does not define *when* things get built (see `Phased_Build_Playbook.md`) or *the rules Claude Code follows during implementation* (see `Build_Prompt.md`).

Three companion documents:

- **`Engineering_Spec.md`** (this document) — the architecture and data model
- **`Build_Prompt.md`** — the operational instructions for Claude Code (Superpowers methodology gates, review rules, conventions)
- **`Phased_Build_Playbook.md`** — the construction order and phase-by-phase execution plan

This document is intended to be consumed by Claude Code as input during build sessions. It is also intended to be human-readable by the founder and any future engineers joining the team.

**Authority hierarchy (when documents conflict):**

1. `Build_Prompt.md` rules about methodology supersede everything else
2. `Engineering_Spec.md` (this document) for architectural decisions
3. `Phased_Build_Playbook.md` for sequencing
4. Anything in the codebase that contradicts these documents is a bug

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Structure](#2-repository-structure)
3. [Technology Stack](#3-technology-stack)
4. [Data Model](#4-data-model)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Escrow State Machine](#6-escrow-state-machine)
7. [Dispute Resolution System](#7-dispute-resolution-system)
8. [Payments Architecture](#8-payments-architecture)
9. [API Surface](#9-api-surface)
10. [Search & Discovery](#10-search--discovery)
11. [Notification System](#11-notification-system)
12. [Driver Logistics Engine](#12-driver-logistics-engine)
13. [Admin Panel Architecture](#13-admin-panel-architecture)
14. [Diaspora-Specific Features](#14-diaspora-specific-features)
15. [Background Jobs & Async Work](#15-background-jobs--async-work)
16. [Observability & Monitoring](#16-observability--monitoring)
17. [Security Posture](#17-security-posture)
18. [Performance Targets](#18-performance-targets)
19. [Internationalization](#19-internationalization)
20. [Integration Contracts](#20-integration-contracts)

---

# 1. Architecture Overview

## 1.1 System Topology

Vendoora is a single-database, multi-tenant marketplace platform with three primary user surfaces (buyer, seller, admin) plus a driver logistics surface, all served by a single web application during MVP. Mobile applications are v2.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT SURFACES                              │
│  ┌────────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Buyer     │  │  Seller     │  │  Admin   │  │  Driver Web  │   │
│  │  (web)     │  │  Console    │  │  Panel   │  │  (v1)        │   │
│  └─────┬──────┘  └──────┬──────┘  └────┬─────┘  └──────┬───────┘   │
└────────┼─────────────────┼──────────────┼───────────────┼───────────┘
         │                 │              │               │
         └─────────────────┴──────────────┴───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  NEXT.JS APPLICATION (Vercel)                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  App Router · RSC + ISR + SSR + SSG · Server Actions        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  tRPC API · Permission middleware · Audit logging            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────┬───────────────────────────────────┬──────────────────-┘
              │                                   │
              ▼                                   ▼
┌──────────────────────────┐         ┌────────────────────────────┐
│   PostgreSQL (Neon)      │         │   Redis (Upstash)          │
│   • Source of truth      │         │   • Session cache          │
│   • RLS multi-tenancy    │         │   • Rate limiting          │
│   • Append-only audit    │         │   • Job queue (BullMQ)     │
└──────────────────────────┘         │   • Pub/sub for real-time  │
                                     └─────────────┬──────────────┘
                                                   │
                                                   ▼
                                     ┌────────────────────────────┐
                                     │   Worker Process (Railway) │
                                     │   • Email/SMS dispatch     │
                                     │   • Payment webhooks       │
                                     │   • Escrow timeouts        │
                                     │   • Fraud detection runs   │
                                     │   • Reconciliation         │
                                     └────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                          │
│  Clerk · Stripe · MTN MoMo · Orange Money · Africa's Talking ·   │
│  Twilio · Resend · Loops · Cloudflare R2 · Cloudflare Images ·   │
│  Better Stack · Sentry · PostHog · Doppler                       │
└──────────────────────────────────────────────────────────────────┘
```

## 1.2 Architectural Principles

These principles govern every implementation decision. When a tradeoff arises, principles win over expedience.

**Principle 1: Trust mechanic is sacred.** The escrow state machine, delivery code system, and dispute resolution flow must work correctly under every condition. Bugs in these systems are P0 incidents that block all other work.

**Principle 2: Money is never wrong.** Every financial state change is wrapped in a database transaction. Every transition logs to the audit log. Reconciliation runs daily. No code path moves money without explicit authorization and an audit trail.

**Principle 3: Permissions are enforced at every layer.** Frontend hides UI from unauthorized users. Backend rejects unauthorized requests. Database enforces row-level security. Defense in depth.

**Principle 4: Data is owned by the user, not the platform.** Soft deletes preserve history for disputes and compliance, but users can request export and deletion. Audit logs are exempt from deletion (7-year retention).

**Principle 5: Type safety end-to-end.** Database schema → Prisma types → tRPC procedures → React components. No manual type maintenance, no `any`, no type assertions outside test code.

**Principle 6: Boring technology, novel product.** The product differentiation is in the trust mechanic and diaspora experience, not in cutting-edge tech. Use proven tools (Postgres, Next.js, Stripe, Clerk) and build novel UX on top.

**Principle 7: Observability is non-optional.** Every error logged, every slow request traced, every financial state change auditable. Production incidents are debugged from logs and traces, never from production data access.

**Principle 8: Tests document behavior.** Tests are the executable specification. If a behavior matters, a test proves it. Coverage thresholds are minimums, not targets.

## 1.3 Failure Modes & Recovery

The system is designed to degrade gracefully:

- **Payment provider outage (Stripe).** Diaspora checkout shows "temporarily unavailable" with retry. No silent failures, no orphaned orders.
- **Mobile money provider outage (MTN/Orange).** Liberia-domestic checkout falls back to the other provider if user has both. Otherwise queued for retry with user notification.
- **SMS provider outage.** Delivery codes fall back to in-app push notification + email. Critical OTPs retry across both providers (Africa's Talking → Twilio fallback).
- **Database failover.** Neon handles automatically with sub-30-second failover.
- **Worker process crash.** BullMQ retries failed jobs with exponential backoff. Critical jobs (payouts, escrow releases) have dead-letter queue + admin alerts.
- **Clerk outage.** Existing sessions remain valid (cookie-based). New logins fail. Critical-path operations (active checkout) complete. Admin actions blocked until restored.

# 2. Repository Structure

## 2.1 Monorepo Layout

```
vendoora/
├── apps/
│   ├── web/                    # Next.js 15 application
│   │   ├── app/
│   │   │   ├── (marketing)/    # SSG marketing pages
│   │   │   ├── (buyer)/        # Buyer surfaces
│   │   │   ├── (diaspora)/     # Diaspora-specific routes
│   │   │   ├── (seller)/       # Seller console
│   │   │   ├── (admin)/        # Admin panel (RBAC-gated)
│   │   │   ├── (driver)/       # Driver web app (v1)
│   │   │   ├── api/            # API route handlers
│   │   │   └── layout.tsx
│   │   ├── components/         # Web-specific React components
│   │   ├── lib/                # Web-specific utilities
│   │   └── public/             # Static assets
│   ├── worker/                 # Background job processor
│   │   ├── src/
│   │   │   ├── jobs/           # Job definitions
│   │   │   ├── processors/     # Job processors
│   │   │   └── index.ts        # Worker entry point
│   │   └── package.json
│   ├── mobile-buyer/           # v2 — Expo React Native
│   └── mobile-driver/          # v2 — Expo React Native
├── packages/
│   ├── ui/                     # Shared web React components
│   │   ├── src/
│   │   │   ├── components/     # shadcn/ui-based components
│   │   │   └── styles/         # Component-specific styles
│   │   └── package.json
│   ├── ui-native/              # v2 — shared React Native components
│   ├── design-tokens/          # CSS variables + RN StyleSheet
│   │   ├── src/
│   │   │   ├── tokens.css      # Web CSS variables
│   │   │   ├── tokens.native.ts # RN style objects
│   │   │   └── tokens.json     # Source of truth
│   │   └── package.json
│   ├── types/                  # TypeScript types
│   │   ├── src/
│   │   │   ├── domain/         # Domain types
│   │   │   ├── api/            # API request/response types
│   │   │   └── index.ts
│   │   └── package.json
│   ├── schemas/                # Zod validation schemas
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   ├── product.ts
│   │   │   ├── order.ts
│   │   │   ├── escrow.ts
│   │   │   ├── dispute.ts
│   │   │   ├── payment.ts
│   │   │   ├── kyc.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── api-client/             # tRPC client + React hooks
│   ├── domain/                 # Pure business logic
│   │   ├── src/
│   │   │   ├── escrow/         # Escrow state machine
│   │   │   ├── dispute/        # Dispute resolution rules
│   │   │   ├── permissions/    # Permission checks
│   │   │   ├── fx/             # Currency conversion
│   │   │   ├── kyc/            # KYC tier logic
│   │   │   ├── fraud/          # Fraud detection
│   │   │   └── trust-score/    # Buyer trust scoring
│   │   └── package.json
│   ├── i18n/                   # Copy strings
│   │   ├── src/
│   │   │   ├── en.ts           # English (primary)
│   │   │   ├── fr.ts           # French (v1.1)
│   │   │   └── index.ts
│   │   └── package.json
│   ├── config/                 # Shared configs
│   │   ├── eslint/
│   │   ├── tsconfig/
│   │   ├── tailwind/
│   │   └── prettier/
│   └── db/                     # Prisma schema + migrations + seed
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       └── package.json
├── infra/
│   ├── docker/                 # Docker Compose for local dev
│   └── scripts/                # Operational scripts
├── docs/
│   ├── Engineering_Spec.md     # This document
│   ├── Build_Prompt.md
│   ├── Phased_Build_Playbook.md
│   ├── runbooks/               # Operational procedures
│   ├── decisions/              # Architecture Decision Records
│   └── api/                    # Auto-generated API docs
├── .github/
│   └── workflows/              # GitHub Actions CI/CD
├── turbo.json                  # Turborepo config
├── pnpm-workspace.yaml
└── package.json
```

## 2.2 Package Dependency Rules

These rules are enforced via ESLint configuration:

1. `packages/domain` may not depend on anything except `packages/types` and `packages/schemas`. It is pure business logic with no I/O.
2. `packages/types` may not depend on anything except other type packages.
3. `packages/schemas` may depend on `packages/types`.
4. `packages/ui` may depend on `packages/types`, `packages/schemas`, `packages/design-tokens`, `packages/i18n`.
5. `packages/db` may depend on `packages/types` and `packages/schemas`.
6. `apps/*` may depend on any package.
7. Apps may not depend on other apps directly. Cross-app code goes in a package.

## 2.3 Naming Conventions

- **Files:** `kebab-case.ts` for files. `PascalCase.tsx` for React components.
- **Variables:** `camelCase` for variables, `PascalCase` for types/classes, `UPPER_SNAKE_CASE` for constants.
- **Database:** `snake_case` for tables and columns. Plural for tables (`users`, `orders`).
- **Routes:** kebab-case for URL paths. `/buyer/order-tracking/[orderId]`.
- **API endpoints:** verb-based for tRPC procedures (`createOrder`, `cancelDispute`). Noun-based for REST endpoints (`/api/products`).

# 3. Technology Stack

## 3.1 Locked Choices

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| **Frontend framework** | Next.js | 15.x (App Router) | RSC + ISR + SSR + SSG in one framework |
| **UI library** | React | 19.x | Server Components, async transitions |
| **Component library** | shadcn/ui | latest (copy-paste) | Owned code, accessible by default |
| **Styling** | Tailwind CSS | 4.x | Performance, design token integration |
| **Type system** | TypeScript | 5.6+ | Strict mode, no `any` outside tests |
| **Runtime** | Node.js | 22 LTS | Stable, long-term support |
| **Package manager** | pnpm | 9.x | Monorepo workspace support |
| **Build orchestration** | Turborepo | 2.x | Incremental builds, caching |
| **Database** | PostgreSQL | 16+ | ACID, JSONB, RLS, full-text search |
| **Cache/Queue** | Redis | 7+ | BullMQ, session cache, rate limiting |
| **ORM** | Prisma | 6.x | TS-first, schema-first, migrations |
| **API layer** | tRPC | 11.x | End-to-end type safety |
| **Validation** | Zod | 3.x | Runtime + compile-time validation |
| **Auth** | Clerk | latest | Sessions, MFA, organizations |
| **Background jobs** | BullMQ | 5.x | Redis-backed, retries, scheduling |
| **Web hosting** | Vercel | — | Native Next.js, preview envs |
| **Worker hosting** | Railway | — | Container-based, long-running |
| **Postgres hosting** | Neon | — | Serverless, branching, point-in-time |
| **Redis hosting** | Upstash | — | Serverless Redis, REST API |
| **File storage** | Cloudflare R2 | — | S3-compatible, zero egress |
| **Image transforms** | Cloudflare Images | — | On-the-fly resize, format conversion |
| **Email (transactional)** | Resend | — | React Email native |
| **Email (marketing)** | Loops | — | Drip campaigns, segmentation |
| **SMS (Liberia)** | Africa's Talking | — | Direct carrier integration |
| **SMS (diaspora)** | Twilio | — | Global SMS delivery |
| **Card payments** | Stripe | latest API | Connect for marketplace |
| **Mobile money** | MTN MoMo + Orange | direct API | Liberian local rails |
| **Logging** | Better Stack | — | Structured logs + uptime |
| **Errors** | Sentry | latest | JS errors, source maps, releases |
| **Web vitals** | Vercel Analytics | — | Free with Vercel |
| **Product analytics** | PostHog | — | Funnels, A/B, feature flags |
| **Secrets** | Doppler | — | Multi-platform sync |
| **Testing (unit)** | Vitest | latest | Fast, ESM-native |
| **Testing (E2E)** | Playwright | latest | Cross-browser, reliable |
| **Visual regression** | Chromatic | — | Storybook integration |
| **Linting** | ESLint | 9+ | Flat config, custom rules |
| **Formatting** | Prettier | 3+ | With Tailwind plugin |

## 3.2 Library Restrictions

These libraries are **prohibited** without explicit justification in an ADR (Architecture Decision Record):

- **Redux, MobX, Zustand for global state.** Use React Server Components + URL state + Tanstack Query.
- **Axios.** Use native `fetch` (with tRPC for API calls).
- **Moment.js.** Use `date-fns` or native `Intl.DateTimeFormat`.
- **Lodash (full).** Use native JS methods or specific Lodash submodules only.
- **CSS-in-JS libraries (styled-components, emotion).** Tailwind only.
- **GraphQL.** tRPC for internal APIs.
- **jQuery, any DOM-manipulation library.** React only.

## 3.3 Required Libraries

These are pre-approved and should be used as the default for their purpose:

- **`react-hook-form`** for forms (with Zod resolver)
- **`@tanstack/react-query`** for client-side data fetching (auto-installed with tRPC)
- **`@tanstack/react-table`** for data tables (admin, seller console)
- **`date-fns`** for date manipulation
- **`zod`** for validation
- **`nanoid`** for IDs where Prisma's `cuid()` isn't appropriate
- **`framer-motion`** for animations (use sparingly)
- **`recharts`** for charts (seller analytics, admin dashboards)
- **`react-email`** for email templates (renders via Resend)
- **`@react-pdf/renderer`** for PDF generation (invoices, statements)


# 4. Data Model

## 4.1 Schema Overview

The Vendoora database has approximately 60 tables organized into 10 logical domains:

1. **Identity & Auth** — users, sessions, OAuth links
2. **RBAC** — permissions, roles, role assignments
3. **Sellers** — seller profiles, KYC verification, team members
4. **Catalog** — products, variants, categories, attributes, images
5. **Orders & Cart** — carts, orders, order items
6. **Escrow & Payments** — escrow holds, payments, payouts, refunds
7. **Disputes** — disputes, messages, evidence, resolutions
8. **Drivers & Logistics** — drivers, vehicles, deliveries, routes
9. **Diaspora** — recipients, gift bundles, group gifts, scheduled gifts
10. **Operations** — audit log, notifications, feature flags, FX rates

All tables follow these conventions:

- Primary key is `id` of type `String` (CUID2 via Prisma `cuid()`)
- Timestamps: `created_at`, `updated_at` on every table (timezone: UTC)
- Soft deletes: `deleted_at` (nullable, defaults to null) on user-facing entities
- Audit fields: `created_by_user_id`, `updated_by_user_id` where applicable
- All foreign keys named `{entity}_id` (e.g., `seller_id`, `order_id`)
- Booleans prefixed with `is_` or `has_` (e.g., `is_verified`, `has_2fa`)

## 4.2 Identity & Auth Domain

```prisma
model User {
  id                String    @id @default(cuid())
  clerk_id          String    @unique  // Clerk user ID
  email             String    @unique
  phone             String?   @unique
  phone_country_code String?
  full_name         String
  display_name      String?
  avatar_url        String?
  preferred_currency String   @default("USD")
  preferred_language String   @default("en")
  timezone          String    @default("UTC")
  is_email_verified Boolean   @default(false)
  is_phone_verified Boolean   @default(false)
  has_2fa_enabled   Boolean   @default(false)
  account_status    UserAccountStatus @default(ACTIVE)
  last_login_at     DateTime?
  last_login_ip     String?
  trust_score       Float     @default(50.0)  // 0-100, hidden internal
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt
  deleted_at        DateTime?

  // Relations
  seller            Seller?
  driver            Driver?
  user_roles        UserRole[]
  orders            Order[]
  carts             Cart[]
  recipients        Recipient[]
  notifications     Notification[]
  audit_actions     AuditLog[]    @relation("actor")
  audit_targets     AuditLog[]    @relation("target")

  @@index([clerk_id])
  @@index([email])
  @@index([phone])
  @@index([account_status])
  @@index([trust_score])
  @@index([deleted_at])
}

enum UserAccountStatus {
  ACTIVE
  SUSPENDED
  PENDING_VERIFICATION
  CLOSED
}
```

**Key design decisions:**

- `clerk_id` is the link to Clerk's auth system. We mirror minimal user data; Clerk holds credentials.
- `trust_score` is an internal-only field used by the risk engine. Buyers never see this; it influences fraud detection thresholds.
- `account_status` is the lifecycle state. `SUSPENDED` blocks login; `PENDING_VERIFICATION` allows browse but not purchase; `CLOSED` is permanent termination.
- Soft delete via `deleted_at` preserves data for audit/disputes. Hard delete only on user-requested GDPR deletion.

## 4.3 RBAC Domain

```prisma
model Permission {
  id          String   @id @default(cuid())
  name        String   @unique  // e.g., "refund.authorize"
  category    String              // e.g., "finance"
  description String
  is_system   Boolean  @default(true)
  created_at  DateTime @default(now())

  role_permissions RolePermission[]

  @@index([category])
}

model Role {
  id          String   @id @default(cuid())
  name        String   @unique  // e.g., "finance_admin"
  display_name String              // e.g., "Finance Admin"
  description String
  is_system_role Boolean @default(false)  // true for the 8 system roles
  created_by_user_id String?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  role_permissions RolePermission[]
  user_roles       UserRole[]
  created_by       User?   @relation(fields: [created_by_user_id], references: [id])

  @@index([is_system_role])
}

model RolePermission {
  role_id       String
  permission_id String
  granted_at    DateTime @default(now())

  role       Role       @relation(fields: [role_id], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permission_id], references: [id], onDelete: Cascade)

  @@id([role_id, permission_id])
  @@index([permission_id])
}

model UserRole {
  user_id            String
  role_id            String
  assigned_at        DateTime  @default(now())
  assigned_by_user_id String?
  expires_at         DateTime?  // null = no expiry

  user        User  @relation(fields: [user_id], references: [id], onDelete: Cascade)
  role        Role  @relation(fields: [role_id], references: [id], onDelete: Cascade)
  assigned_by User? @relation("assigned_by", fields: [assigned_by_user_id], references: [id])

  @@id([user_id, role_id])
  @@index([role_id])
  @@index([expires_at])
}
```

**Permission catalog at MVP launch** (approximate count: 120 permissions across 10 categories):

| Category | Example Permissions |
|----------|---------------------|
| `auth` | `auth.login_as_other_user`, `auth.force_password_reset`, `auth.disable_mfa` |
| `user` | `user.read`, `user.suspend`, `user.delete`, `user.role.assign`, `user.role.revoke` |
| `seller` | `seller.kyc.review`, `seller.kyc.promote`, `seller.kyc.demote`, `seller.suspend`, `seller.payout.manual` |
| `product` | `product.read.all`, `product.moderate`, `product.delete`, `product.feature` |
| `order` | `order.read.all`, `order.cancel`, `order.status.override` |
| `escrow` | `escrow.read.all`, `escrow.force_release`, `escrow.force_refund`, `escrow.freeze` |
| `dispute` | `dispute.read.all`, `dispute.assign`, `dispute.resolve`, `dispute.escalate` |
| `refund` | `refund.authorize.under_500`, `refund.authorize.over_500`, `refund.deny` |
| `finance` | `payout.execute`, `payout.delay`, `reconciliation.run`, `fx_rate.override` |
| `system` | `feature_flag.toggle`, `permission.create`, `role.create`, `audit_log.read`, `audit_log.export` |

**System roles seeded at first deploy:**

1. **`superadmin`** — All 120+ permissions including `permission.create`, `role.create`, and role-modification permissions.
2. **`finance_admin`** — Finance category + payout/refund/escrow read + reconciliation. Cannot modify other admins.
3. **`ts_admin`** — Dispute + KYC review + product moderation + user suspension. Cannot authorize refunds over $500.
4. **`support_admin`** — Read-mostly access + password resets + order status overrides. Cannot directly authorize refunds.
5. **`operations_admin`** — Driver management + delivery zone configuration + logistics oversight.
6. **`marketing_admin`** — Promo codes + featured products + bundle curation + email campaigns.
7. **`catalog_admin`** — Category management + attribute schema + seller onboarding queue.
8. **`analytics_admin`** — Read-only access to all dashboards. Export permission. Cannot modify anything.

Plus implicit marketplace roles assigned automatically:
- **`buyer`** — Granted to every registered user.
- **`seller`** — Granted when KYC Tier 1 is completed.
- **`seller_staff`** — Granted by a seller admin to their employees.
- **`driver`** — Granted when driver onboarding completes.

## 4.4 Seller Domain

```prisma
model Seller {
  id                  String    @id @default(cuid())
  user_id             String    @unique
  business_name       String
  business_slug       String    @unique  // for /store/{slug} URL
  business_description String?
  business_logo_url   String?
  business_banner_url String?
  business_email      String
  business_phone      String
  business_address    Json      // {street, city, county, country}
  business_type       BusinessType
  tax_id              String?   // LRA TIN
  registration_number String?   // LBR registration

  kyc_tier            Int       @default(0)  // 0-4
  kyc_status          KYCStatus @default(NOT_STARTED)
  kyc_tier_promoted_at DateTime?
  kyc_documents       Json?     // {license_url, id_url, articles_url, ...}

  saas_plan           SaasPlan  @default(STARTER)
  saas_plan_started_at DateTime?
  saas_plan_renewed_at DateTime?
  saas_commission_rate Float    @default(0.12)  // 12% for Starter

  payout_method       PayoutMethod @default(MTN_MOMO)
  payout_account_id   String?   // MoMo number or bank account ref
  payout_schedule     PayoutSchedule @default(WEEKLY)

  is_featured         Boolean   @default(false)
  feature_starts_at   DateTime?
  feature_ends_at     DateTime?

  total_orders        Int       @default(0)
  total_gmv           Decimal   @default(0) @db.Decimal(15, 2)
  total_disputes      Int       @default(0)
  dispute_rate        Float     @default(0)
  on_time_rate        Float     @default(100)
  rating_average      Float?
  rating_count        Int       @default(0)

  is_suspended        Boolean   @default(false)
  suspended_at        DateTime?
  suspended_reason    String?

  created_at          DateTime  @default(now())
  updated_at          DateTime  @updatedAt
  deleted_at          DateTime?

  user                User      @relation(fields: [user_id], references: [id])
  staff_members       SellerStaff[]
  products            Product[]
  orders              OrderItem[]
  payouts             Payout[]
  reviews             SellerReview[]

  @@index([business_slug])
  @@index([kyc_tier])
  @@index([saas_plan])
  @@index([is_suspended])
  @@index([is_featured])
}

enum BusinessType {
  SOLE_PROPRIETOR
  LIMITED_LIABILITY
  CORPORATION
  COOPERATIVE
  INDIVIDUAL
}

enum KYCStatus {
  NOT_STARTED
  IN_REVIEW
  APPROVED
  REJECTED
  EXPIRED
}

enum SaasPlan {
  STARTER       // Free, 12% commission
  GROWTH        // $15/mo, 10% commission
  PRO           // $45/mo, 8% commission
  ENTERPRISE    // Custom, 5-7% commission
}

enum PayoutMethod {
  MTN_MOMO
  ORANGE_MONEY
  BANK_TRANSFER
}

enum PayoutSchedule {
  INSTANT     // Pay after each order
  DAILY       // Aggregate, pay daily
  WEEKLY      // Aggregate, pay weekly
  MONTHLY     // Aggregate, pay monthly
}

model SellerStaff {
  id          String    @id @default(cuid())
  seller_id   String
  user_id     String
  role        SellerStaffRole
  invited_by_user_id String
  invited_at  DateTime  @default(now())
  accepted_at DateTime?

  seller      Seller    @relation(fields: [seller_id], references: [id])
  user        User      @relation(fields: [user_id], references: [id])

  @@unique([seller_id, user_id])
  @@index([user_id])
}

enum SellerStaffRole {
  ADMIN       // Full access to seller account
  FULFILLMENT // Can manage orders and inventory
  SUPPORT     // Can read orders, respond to buyer messages
  VIEWER      // Read-only access
}
```

## 4.5 Catalog Domain

```prisma
model Category {
  id              String    @id @default(cuid())
  parent_id       String?
  name            String
  slug            String    @unique
  description     String?
  icon_name       String?   // Lucide icon name
  banner_url      String?
  attributes_schema Json    // JSONB defining custom attributes
  display_order   Int       @default(0)
  is_active       Boolean   @default(true)
  is_featured     Boolean   @default(false)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  parent          Category? @relation("CategoryHierarchy", fields: [parent_id], references: [id])
  children        Category[] @relation("CategoryHierarchy")
  products        Product[]

  @@index([parent_id])
  @@index([slug])
  @@index([is_active])
}

model Product {
  id              String    @id @default(cuid())
  seller_id       String
  category_id     String
  name            String
  slug            String
  description     String    @db.Text
  short_description String?
  base_price      Decimal   @db.Decimal(10, 2)
  currency        String    @default("USD")
  cost_price      Decimal?  @db.Decimal(10, 2)  // seller's internal cost
  weight_grams    Int?
  dimensions      Json?     // {length, width, height}
  attributes      Json      // JSONB for category-specific attributes
  tags            String[]
  has_variants    Boolean   @default(false)
  status          ProductStatus @default(DRAFT)
  moderation_status ModerationStatus @default(PENDING)
  inventory_tracking Boolean @default(true)
  inventory_count Int       @default(0)
  inventory_low_threshold Int @default(5)
  is_featured     Boolean   @default(false)
  feature_ends_at DateTime?
  promoted_score  Float     @default(0)  // for promoted listings

  view_count      Int       @default(0)
  order_count     Int       @default(0)
  rating_average  Float?
  rating_count    Int       @default(0)

  is_diaspora_eligible Boolean @default(true)
  shipping_zones  String[]  // delivery zones this can ship to

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  published_at    DateTime?
  deleted_at      DateTime?

  seller          Seller    @relation(fields: [seller_id], references: [id])
  category        Category  @relation(fields: [category_id], references: [id])
  variants        ProductVariant[]
  images          ProductImage[]
  reviews         ProductReview[]

  @@unique([seller_id, slug])
  @@index([seller_id])
  @@index([category_id])
  @@index([status])
  @@index([moderation_status])
  @@index([is_featured])
  @@index([deleted_at])
  @@fulltext([name, description, short_description])
}

enum ProductStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
  OUT_OF_STOCK
}

enum ModerationStatus {
  PENDING
  APPROVED
  REJECTED
  FLAGGED
}

model ProductVariant {
  id              String    @id @default(cuid())
  product_id      String
  sku             String?
  name            String    // e.g., "6 yard / Earth Red"
  attributes      Json      // {size: "6 yard", color: "Earth Red"}
  price_override  Decimal?  @db.Decimal(10, 2)
  inventory_count Int       @default(0)
  is_default      Boolean   @default(false)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  product         Product   @relation(fields: [product_id], references: [id])

  @@unique([product_id, sku])
  @@index([product_id])
}

model ProductImage {
  id              String    @id @default(cuid())
  product_id      String
  url             String
  alt_text        String?
  display_order   Int       @default(0)
  is_primary      Boolean   @default(false)
  photographer_credit String?
  is_vendoora_photographed Boolean @default(false)
  created_at      DateTime  @default(now())

  product         Product   @relation(fields: [product_id], references: [id])

  @@index([product_id])
}
```

## 4.6 Orders & Cart Domain

```prisma
model Cart {
  id            String    @id @default(cuid())
  user_id       String?   // null for guest carts
  session_id    String?
  currency      String    @default("USD")
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  user          User?     @relation(fields: [user_id], references: [id])
  items         CartItem[]

  @@index([user_id])
  @@index([session_id])
}

model CartItem {
  id              String    @id @default(cuid())
  cart_id         String
  product_id      String
  variant_id      String?
  quantity        Int
  price_at_add    Decimal   @db.Decimal(10, 2)
  currency        String
  added_at        DateTime  @default(now())

  cart            Cart      @relation(fields: [cart_id], references: [id])

  @@index([cart_id])
}

model Order {
  id              String    @id @default(cuid())
  order_number    String    @unique  // e.g., "VDR-48291"
  buyer_user_id   String
  buyer_type      BuyerType // LIBERIA_DOMESTIC or DIASPORA

  // Recipient details (for diaspora orders)
  recipient_id    String?
  recipient_name  String?
  recipient_phone String?
  recipient_address Json?

  // Buyer details (always populated)
  buyer_name      String
  buyer_email     String
  buyer_phone     String?
  buyer_billing_address Json?

  // Delivery
  delivery_address Json
  delivery_city   String
  delivery_county String?
  delivery_country String
  delivery_zone   String
  delivery_slot   String?   // e.g., "tomorrow 9am-12pm"
  delivery_notes  String?

  // Pricing
  subtotal        Decimal   @db.Decimal(10, 2)
  shipping_fee    Decimal   @db.Decimal(10, 2) @default(0)
  tax_amount      Decimal   @db.Decimal(10, 2) @default(0)
  diaspora_fee    Decimal   @db.Decimal(10, 2) @default(0)
  discount_amount Decimal   @db.Decimal(10, 2) @default(0)
  total_amount    Decimal   @db.Decimal(10, 2)
  currency        String
  fx_rate_locked  Decimal?  @db.Decimal(10, 6)  // locked at order time
  fx_rate_at_order DateTime?

  // Payment
  payment_method  PaymentMethod
  payment_provider String?  // "stripe", "mtn_momo", "orange_money"
  payment_intent_id String? // Stripe payment intent or MoMo transaction ref
  payment_status  PaymentStatus @default(PENDING)
  paid_at         DateTime?

  // Status
  status          OrderStatus @default(PENDING_PAYMENT)
  status_updated_at DateTime  @default(now())
  cancelled_at    DateTime?
  cancellation_reason String?
  cancelled_by_user_id String?

  // Trust mechanic
  delivery_code   String?   // 6-digit code, encrypted
  delivery_code_sent_at DateTime?
  delivery_code_expires_at DateTime?
  delivery_attempts Int     @default(0)

  // Personal touch
  personal_message String?
  has_handwritten_card Boolean @default(false)
  voice_message_url String?

  // Group gift
  group_gift_id   String?
  is_group_gift_complete Boolean @default(false)

  // Metadata
  user_agent      String?
  ip_address      String?
  utm_source      String?
  utm_medium      String?
  utm_campaign    String?

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  delivered_at    DateTime?

  buyer           User      @relation(fields: [buyer_user_id], references: [id])
  recipient       Recipient? @relation(fields: [recipient_id], references: [id])
  items           OrderItem[]
  escrow_holds    EscrowHold[]
  payment         Payment?
  deliveries      Delivery[]
  disputes        Dispute[]
  group_gift      GroupGift? @relation(fields: [group_gift_id], references: [id])
  status_history  OrderStatusHistory[]

  @@index([buyer_user_id])
  @@index([order_number])
  @@index([status])
  @@index([buyer_type])
  @@index([payment_status])
  @@index([group_gift_id])
  @@index([created_at])
}

enum BuyerType {
  LIBERIA_DOMESTIC
  DIASPORA
}

enum PaymentMethod {
  MTN_MOMO
  ORANGE_MONEY
  CARD
  WALLET_BALANCE
  GROUP_GIFT
}

enum PaymentStatus {
  PENDING
  AUTHORIZED  // payment confirmed but not yet captured (Stripe)
  CAPTURED    // funds moved to escrow
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  ACCEPTED       // seller accepted within 24hr
  PREPARING      // seller is preparing
  READY_FOR_PICKUP
  PICKED_UP      // driver collected
  OUT_FOR_DELIVERY
  ARRIVED        // driver at destination
  DELIVERED      // code confirmed, photo captured
  COMPLETED      // 24hr dispute window passed
  DISPUTED
  CANCELLED
  REFUNDED
  EXPIRED        // seller didn't accept in 24hr
}

model OrderItem {
  id              String    @id @default(cuid())
  order_id        String
  product_id      String
  variant_id      String?
  seller_id       String
  product_snapshot Json     // immutable snapshot of product at order time
  quantity        Int
  unit_price      Decimal   @db.Decimal(10, 2)
  subtotal        Decimal   @db.Decimal(10, 2)
  commission_rate Float     // seller's rate at order time
  commission_amount Decimal @db.Decimal(10, 2)
  seller_net      Decimal   @db.Decimal(10, 2)  // unit_price - commission

  order           Order     @relation(fields: [order_id], references: [id])
  seller          Seller    @relation(fields: [seller_id], references: [id])

  @@index([order_id])
  @@index([seller_id])
  @@index([product_id])
}

model OrderStatusHistory {
  id              String    @id @default(cuid())
  order_id        String
  from_status     OrderStatus?
  to_status       OrderStatus
  changed_by_user_id String?
  changed_by_system Boolean @default(false)
  reason          String?
  metadata        Json?
  changed_at      DateTime  @default(now())

  order           Order     @relation(fields: [order_id], references: [id])

  @@index([order_id])
  @@index([changed_at])
}
```

## 4.7 Escrow & Payments Domain

```prisma
model EscrowHold {
  id              String    @id @default(cuid())
  order_id        String
  order_item_id   String?   // null if this is a delivery/platform hold
  beneficiary_type EscrowBeneficiaryType
  beneficiary_seller_id String?
  beneficiary_driver_id String?

  amount          Decimal   @db.Decimal(10, 2)
  currency        String
  amount_locked_fx Decimal? @db.Decimal(10, 2)  // amount in LRD if locked
  fx_rate_at_hold Decimal?  @db.Decimal(10, 6)

  state           EscrowState @default(PENDING_PAYMENT)
  state_changed_at DateTime  @default(now())

  // Release rules
  scheduled_release_at DateTime?  // 24hr post-DELIVERED
  released_at     DateTime?
  released_by_user_id String?
  released_amount Decimal?  @db.Decimal(10, 2)
  refunded_amount Decimal?  @db.Decimal(10, 2)

  // Linked entities
  payment_id      String?
  payout_id       String?
  refund_id       String?
  dispute_id      String?

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  order           Order     @relation(fields: [order_id], references: [id])
  order_item      OrderItem? @relation(fields: [order_item_id], references: [id])
  payment         Payment?  @relation(fields: [payment_id], references: [id])
  payout          Payout?   @relation(fields: [payout_id], references: [id])
  refund          Refund?   @relation(fields: [refund_id], references: [id])
  dispute         Dispute?  @relation(fields: [dispute_id], references: [id])
  state_transitions EscrowStateTransition[]

  @@index([order_id])
  @@index([state])
  @@index([beneficiary_seller_id])
  @@index([beneficiary_driver_id])
  @@index([scheduled_release_at])
}

enum EscrowBeneficiaryType {
  SELLER
  DRIVER
  PLATFORM      // commission, fees
  BUYER         // refund
  INSURANCE_FUND
}

enum EscrowState {
  PENDING_PAYMENT
  HELD
  HELD_DISPUTED
  RELEASING
  RELEASED
  REFUNDING
  REFUNDED
  PARTIALLY_REFUNDED
  EXPIRED
  INSURANCE_PAYOUT
}

model EscrowStateTransition {
  id              String    @id @default(cuid())
  escrow_hold_id  String
  from_state      EscrowState?
  to_state        EscrowState
  actor_user_id   String?
  actor_system    Boolean   @default(false)
  reason          String
  metadata        Json?
  audit_log_id    String?   // link to audit_log
  transitioned_at DateTime  @default(now())

  escrow_hold     EscrowHold @relation(fields: [escrow_hold_id], references: [id])

  @@index([escrow_hold_id])
  @@index([to_state])
  @@index([transitioned_at])
}

model Payment {
  id              String    @id @default(cuid())
  order_id        String    @unique
  amount          Decimal   @db.Decimal(10, 2)
  currency        String
  provider        PaymentProvider
  provider_payment_id String? // Stripe payment_intent_id, MoMo txn ID
  provider_charge_id String?
  status          PaymentStatus @default(PENDING)

  // Provider-specific metadata
  stripe_customer_id String?
  stripe_payment_method String?
  momo_phone      String?
  momo_request_id String?

  // Timing
  initiated_at    DateTime  @default(now())
  authorized_at   DateTime?
  captured_at     DateTime?
  failed_at       DateTime?
  failure_reason  String?
  failure_code    String?

  // Risk
  risk_score      Float?
  risk_decision   String?   // "approve", "review", "block"

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  order           Order     @relation(fields: [order_id], references: [id])
  escrow_holds    EscrowHold[]
  refunds         Refund[]

  @@index([order_id])
  @@index([provider_payment_id])
  @@index([status])
}

enum PaymentProvider {
  STRIPE
  MTN_MOMO
  ORANGE_MONEY
  WALLET
}

model Payout {
  id              String    @id @default(cuid())
  beneficiary_type EscrowBeneficiaryType
  beneficiary_seller_id String?
  beneficiary_driver_id String?

  amount          Decimal   @db.Decimal(10, 2)
  currency        String
  payout_method   PayoutMethod
  payout_account  String    // MoMo number or bank account ref

  status          PayoutStatus @default(PENDING)
  provider_payout_id String?
  initiated_at    DateTime  @default(now())
  completed_at    DateTime?
  failed_at       DateTime?
  failure_reason  String?
  retry_count     Int       @default(0)
  next_retry_at   DateTime?

  // Aggregation
  escrow_hold_ids String[]  // EscrowHold IDs included in this payout
  order_count     Int       @default(0)

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  seller          Seller?   @relation(fields: [beneficiary_seller_id], references: [id])
  driver          Driver?   @relation(fields: [beneficiary_driver_id], references: [id])
  escrow_holds    EscrowHold[]

  @@index([beneficiary_seller_id])
  @@index([beneficiary_driver_id])
  @@index([status])
  @@index([next_retry_at])
}

enum PayoutStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
  RETRY_SCHEDULED
}

model Refund {
  id              String    @id @default(cuid())
  payment_id      String
  order_id        String
  amount          Decimal   @db.Decimal(10, 2)
  currency        String
  reason          String
  refund_type     RefundType
  status          RefundStatus @default(PENDING)
  provider_refund_id String?
  authorized_by_user_id String
  initiated_at    DateTime  @default(now())
  completed_at    DateTime?
  failed_at       DateTime?
  failure_reason  String?

  dispute_id      String?
  is_dispute_resolution Boolean @default(false)

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  payment         Payment   @relation(fields: [payment_id], references: [id])
  dispute         Dispute?  @relation(fields: [dispute_id], references: [id])
  escrow_holds    EscrowHold[]

  @@index([payment_id])
  @@index([order_id])
  @@index([status])
}

enum RefundType {
  FULL
  PARTIAL
  STORE_CREDIT  // refunded to Vendoora Credit wallet
}

enum RefundStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model WalletBalance {
  id              String    @id @default(cuid())
  user_id         String    @unique
  available_amount Decimal  @default(0) @db.Decimal(10, 2)
  pending_amount  Decimal   @default(0) @db.Decimal(10, 2)
  currency        String    @default("USD")
  last_transaction_at DateTime?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  user            User      @relation(fields: [user_id], references: [id])
  transactions    WalletTransaction[]

  @@index([user_id])
}

model WalletTransaction {
  id              String    @id @default(cuid())
  wallet_id       String
  type            WalletTransactionType
  amount          Decimal   @db.Decimal(10, 2)
  currency        String
  balance_after   Decimal   @db.Decimal(10, 2)
  reference_type  String?   // "order", "refund", "deposit", "loyalty_credit"
  reference_id    String?
  description     String
  created_at      DateTime  @default(now())

  wallet          WalletBalance @relation(fields: [wallet_id], references: [id])

  @@index([wallet_id])
  @@index([type])
  @@index([reference_type, reference_id])
}

enum WalletTransactionType {
  DEPOSIT
  PURCHASE
  REFUND
  LOYALTY_CREDIT
  REFERRAL_BONUS
  WITHDRAWAL
  ADJUSTMENT
}

model PromoCode {
  id              String    @id @default(cuid())
  code            String    @unique
  type            PromoCodeType
  value           Decimal   @db.Decimal(10, 2)  // percentage or fixed amount
  currency        String?
  min_order_value Decimal?  @db.Decimal(10, 2)
  max_discount    Decimal?  @db.Decimal(10, 2)
  applicable_to   String?   // "all", "first_order", "diaspora_only", category, seller_id
  applicable_id   String?
  uses_per_user   Int       @default(1)
  total_uses_limit Int?
  total_uses      Int       @default(0)
  starts_at       DateTime?
  expires_at      DateTime?
  is_active       Boolean   @default(true)
  created_by_user_id String
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  redemptions     PromoCodeRedemption[]

  @@index([code])
  @@index([is_active])
  @@index([expires_at])
}

enum PromoCodeType {
  PERCENTAGE
  FIXED_AMOUNT
  FREE_DELIVERY
}

model PromoCodeRedemption {
  id              String    @id @default(cuid())
  promo_code_id   String
  user_id         String
  order_id        String
  discount_applied Decimal  @db.Decimal(10, 2)
  redeemed_at     DateTime  @default(now())

  promo_code      PromoCode @relation(fields: [promo_code_id], references: [id])

  @@unique([promo_code_id, order_id])
  @@index([user_id])
}

model FxRate {
  id              String    @id @default(cuid())
  from_currency   String
  to_currency     String
  rate            Decimal   @db.Decimal(15, 8)
  source          String    @default("CBL")  // Central Bank of Liberia
  fetched_at      DateTime  @default(now())
  effective_date  DateTime  @db.Date
  is_active       Boolean   @default(true)

  @@unique([from_currency, to_currency, effective_date])
  @@index([effective_date])
}
```

## 4.8 Disputes Domain

```prisma
model Dispute {
  id              String    @id @default(cuid())
  dispute_number  String    @unique  // e.g., "VDR-DIS-00284"
  order_id        String
  initiated_by_user_id String
  initiated_at    DateTime  @default(now())

  category        DisputeCategory
  reason          DisputeReason
  description     String    @db.Text

  status          DisputeStatus @default(OPEN)
  assigned_to_admin_user_id String?
  assigned_at     DateTime?

  resolution      DisputeResolution?
  resolution_amount Decimal? @db.Decimal(10, 2)
  resolution_notes String?  @db.Text
  resolved_at     DateTime?
  resolved_by_user_id String?

  sla_due_at      DateTime  // 48hr from open
  sla_breached    Boolean   @default(false)
  escalated_at    DateTime?

  buyer_response_at DateTime?
  seller_response_at DateTime?

  is_chargeback   Boolean   @default(false)
  chargeback_provider_case_id String?

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  order           Order     @relation(fields: [order_id], references: [id])
  messages        DisputeMessage[]
  evidence        DisputeEvidence[]
  escrow_holds    EscrowHold[]
  refunds         Refund[]

  @@index([order_id])
  @@index([status])
  @@index([assigned_to_admin_user_id])
  @@index([sla_due_at])
  @@index([initiated_at])
}

enum DisputeCategory {
  NOT_RECEIVED          // package never arrived
  DAMAGED               // arrived damaged
  WRONG_ITEM            // got wrong product
  COUNTERFEIT           // received counterfeit
  QUALITY_ISSUE         // not as described
  IN_TRANSIT_DAMAGE     // damaged during delivery
  PAYMENT_ISSUE         // billing dispute
  FRAUD                 // unauthorized transaction
  OTHER
}

enum DisputeReason {
  BUYER_INITIATED
  SELLER_INITIATED
  CHARGEBACK
  FRAUD_DETECTED
  SYSTEM_FLAGGED
}

enum DisputeStatus {
  OPEN
  IN_REVIEW         // T&S reviewing
  PENDING_BUYER     // waiting for buyer response
  PENDING_SELLER    // waiting for seller response
  ESCALATED         // escalated to senior T&S
  RESOLVED_FAVOR_BUYER
  RESOLVED_FAVOR_SELLER
  RESOLVED_PARTIAL  // partial refund
  RESOLVED_INSURANCE // insurance fund covers
  CLOSED            // resolved and finalized
  WITHDRAWN         // buyer withdrew
}

enum DisputeResolution {
  FULL_REFUND_TO_BUYER
  PARTIAL_REFUND_TO_BUYER
  RELEASE_TO_SELLER
  INSURANCE_PAYOUT
  STORE_CREDIT
  REPLACEMENT_SHIPPED
}

model DisputeMessage {
  id              String    @id @default(cuid())
  dispute_id      String
  author_user_id  String
  author_type     DisputeMessageAuthorType
  body            String    @db.Text
  is_internal     Boolean   @default(false)  // T&S internal notes
  created_at      DateTime  @default(now())

  dispute         Dispute   @relation(fields: [dispute_id], references: [id])

  @@index([dispute_id])
  @@index([created_at])
}

enum DisputeMessageAuthorType {
  BUYER
  SELLER
  ADMIN
  SYSTEM
}

model DisputeEvidence {
  id              String    @id @default(cuid())
  dispute_id      String
  uploaded_by_user_id String
  file_url        String
  file_type       String    // mime type
  file_size_bytes Int
  description     String?
  evidence_type   DisputeEvidenceType
  created_at      DateTime  @default(now())

  dispute         Dispute   @relation(fields: [dispute_id], references: [id])

  @@index([dispute_id])
}

enum DisputeEvidenceType {
  PHOTO
  VIDEO
  DOCUMENT
  CHAT_TRANSCRIPT
  DELIVERY_PROOF
  RECEIPT
  OTHER
}
```

## 4.9 Drivers & Logistics Domain

```prisma
model Driver {
  id              String    @id @default(cuid())
  user_id         String    @unique
  driver_number   String    @unique  // e.g., "VDR-DRV-00472"

  // KYC documents
  drivers_license_url String?
  drivers_license_number String?
  drivers_license_expires_at DateTime?
  national_id_url String?
  national_id_number String?
  proof_of_address_url String?
  vehicle_registration_url String?

  // Background check
  background_check_status BackgroundCheckStatus @default(NOT_STARTED)
  background_check_completed_at DateTime?
  background_check_notes String?

  // Training
  training_completed Boolean @default(false)
  training_completed_at DateTime?

  // Onboarding
  onboarding_status DriverOnboardingStatus @default(SIGNUP)
  onboarded_at    DateTime?

  // Operational
  is_online       Boolean   @default(false)
  last_online_at  DateTime?
  current_location_lat Float?
  current_location_lng Float?
  current_zone    String?
  active_delivery_count Int @default(0)
  max_concurrent_deliveries Int @default(3)

  // Performance
  total_deliveries Int      @default(0)
  total_earnings  Decimal   @default(0) @db.Decimal(15, 2)
  rating_average  Float?
  rating_count    Int       @default(0)
  on_time_rate    Float     @default(100)
  dispute_count   Int       @default(0)
  tier            DriverTier @default(STANDARD)

  // Payout
  payout_method   PayoutMethod @default(MTN_MOMO)
  payout_account  String?

  // Status
  is_suspended    Boolean   @default(false)
  suspended_at    DateTime?
  suspended_reason String?

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  deleted_at      DateTime?

  user            User      @relation(fields: [user_id], references: [id])
  vehicles        Vehicle[]
  deliveries      Delivery[]
  payouts         Payout[]
  ratings         DriverRating[]

  @@index([is_online])
  @@index([current_zone])
  @@index([tier])
  @@index([is_suspended])
}

enum BackgroundCheckStatus {
  NOT_STARTED
  IN_PROGRESS
  PASSED
  FAILED
  EXPIRED
}

enum DriverOnboardingStatus {
  SIGNUP           // initial signup
  DOCUMENTS        // uploading documents
  BACKGROUND_CHECK // pending background check
  TRAINING         // completing training
  READY            // approved, can go online
}

enum DriverTier {
  STANDARD      // 0-99 deliveries
  EXPERIENCED   // 100-499 deliveries, 4.5+ rating
  PRO           // 500+ deliveries, 4.7+ rating
  ELITE         // 1000+ deliveries, 4.9+ rating, top 5%
}

model Vehicle {
  id              String    @id @default(cuid())
  driver_id       String
  vehicle_type    VehicleType
  make            String?
  model           String?
  year            Int?
  license_plate   String?
  color           String?
  insurance_url   String?
  insurance_expires_at DateTime?
  is_primary      Boolean   @default(true)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  driver          Driver    @relation(fields: [driver_id], references: [id])

  @@index([driver_id])
}

enum VehicleType {
  MOTORCYCLE
  CAR
  VAN
  TRUCK
  BICYCLE
  ON_FOOT
}

model Delivery {
  id              String    @id @default(cuid())
  order_id        String
  driver_id       String?

  // Pickup
  pickup_address  Json
  pickup_lat      Float?
  pickup_lng      Float?
  pickup_seller_id String
  pickup_eta      DateTime?
  picked_up_at    DateTime?

  // Dropoff
  dropoff_address Json
  dropoff_lat     Float?
  dropoff_lng     Float?
  dropoff_eta     DateTime?
  arrived_at      DateTime?
  delivered_at    DateTime?

  // Trust mechanic
  delivery_code_entered_at DateTime?
  delivery_code_attempts Int @default(0)
  delivery_proof_photo_url String?
  delivery_proof_photo_lat Float?
  delivery_proof_photo_lng Float?
  delivery_proof_photo_taken_at DateTime?

  // Route
  distance_km     Float?
  estimated_duration_minutes Int?
  actual_duration_minutes Int?

  // Driver pay
  driver_fee      Decimal   @db.Decimal(10, 2)
  driver_bonus    Decimal   @default(0) @db.Decimal(10, 2)
  driver_tip      Decimal   @default(0) @db.Decimal(10, 2)
  driver_total    Decimal   @db.Decimal(10, 2)

  status          DeliveryStatus @default(PENDING_ASSIGNMENT)

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  order           Order     @relation(fields: [order_id], references: [id])
  driver          Driver?   @relation(fields: [driver_id], references: [id])
  ratings         DriverRating[]

  @@index([order_id])
  @@index([driver_id])
  @@index([status])
  @@index([pickup_eta])
}

enum DeliveryStatus {
  PENDING_ASSIGNMENT
  ASSIGNED
  ACCEPTED_BY_DRIVER
  EN_ROUTE_TO_PICKUP
  AT_PICKUP
  PICKED_UP
  EN_ROUTE_TO_DROPOFF
  ARRIVED
  COMPLETED
  FAILED
  CANCELLED
  RETURNED        // returned to seller after failed delivery
}

model DriverRating {
  id              String    @id @default(cuid())
  delivery_id     String    @unique
  driver_id       String
  rated_by_user_id String
  rating          Int       // 1-5
  comment         String?
  created_at      DateTime  @default(now())

  delivery        Delivery  @relation(fields: [delivery_id], references: [id])
  driver          Driver    @relation(fields: [driver_id], references: [id])

  @@index([driver_id])
}

model DeliveryZone {
  id              String    @id @default(cuid())
  name            String    @unique
  county          String
  city            String?
  is_active       Boolean   @default(true)
  base_delivery_fee Decimal @db.Decimal(10, 2)
  estimated_delivery_hours Int @default(24)
  active_drivers_count Int  @default(0)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  @@index([is_active])
}
```

## 4.10 Diaspora Domain

```prisma
model Recipient {
  id              String    @id @default(cuid())
  sender_user_id  String
  name            String
  relationship    String?   // "Mom", "Sister", "Aunt", etc.
  phone           String
  phone_country_code String @default("+231")
  address_line1   String
  address_line2   String?
  city            String
  county          String?
  country         String    @default("Liberia")
  landmark        String?   // "Across from Stop & Shop"
  delivery_zone   String?
  is_primary      Boolean   @default(false)
  order_count     Int       @default(0)
  last_order_at   DateTime?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  deleted_at      DateTime?

  sender          User      @relation(fields: [sender_user_id], references: [id])
  orders          Order[]

  @@index([sender_user_id])
  @@index([phone])
}

model GiftBundle {
  id              String    @id @default(cuid())
  slug            String    @unique
  name            String
  description     String    @db.Text
  occasion        BundleOccasion
  hero_image_url  String
  price           Decimal   @db.Decimal(10, 2)
  currency        String    @default("USD")
  contents_summary String   @db.Text
  is_customizable Boolean   @default(false)
  is_active       Boolean   @default(true)
  is_featured     Boolean   @default(false)
  display_order   Int       @default(0)
  created_by_user_id String
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  items           BundleItem[]

  @@index([occasion])
  @@index([is_active])
  @@index([is_featured])
}

enum BundleOccasion {
  BIRTHDAY
  CHRISTMAS
  EASTER
  RAMADAN
  GRADUATION
  WEDDING
  NEW_BABY
  EVERYDAY_ESSENTIALS
  MONTHLY_BOX
  CONDOLENCES
  OTHER
}

model BundleItem {
  id              String    @id @default(cuid())
  bundle_id       String
  product_id      String
  variant_id      String?
  quantity        Int       @default(1)
  is_substitutable Boolean  @default(false)
  display_order   Int       @default(0)

  bundle          GiftBundle @relation(fields: [bundle_id], references: [id])

  @@index([bundle_id])
}

model GroupGift {
  id              String    @id @default(cuid())
  group_gift_code String    @unique  // shareable invite code
  initiator_user_id String
  recipient_id    String
  bundle_id       String?
  target_amount   Decimal   @db.Decimal(10, 2)
  currency        String    @default("USD")
  collected_amount Decimal  @default(0) @db.Decimal(10, 2)
  contributor_count Int     @default(1)
  deadline_at     DateTime
  status          GroupGiftStatus @default(OPEN)
  completed_order_id String?
  message_from_group String?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  completed_at    DateTime?
  cancelled_at    DateTime?

  contributors    GroupGiftContributor[]
  orders          Order[]

  @@index([group_gift_code])
  @@index([initiator_user_id])
  @@index([status])
  @@index([deadline_at])
}

enum GroupGiftStatus {
  OPEN              // accepting contributions
  COMPLETED         // target reached, order placed
  EXPIRED           // deadline passed without target reached
  CANCELLED         // initiator cancelled
  REFUNDED          // all contributors refunded
}

model GroupGiftContributor {
  id              String    @id @default(cuid())
  group_gift_id   String
  user_id         String
  amount          Decimal   @db.Decimal(10, 2)
  currency        String
  message         String?
  payment_id      String?
  contributed_at  DateTime  @default(now())

  group_gift      GroupGift @relation(fields: [group_gift_id], references: [id])

  @@unique([group_gift_id, user_id])
  @@index([user_id])
}

model ScheduledGift {
  id              String    @id @default(cuid())
  sender_user_id  String
  recipient_id    String
  bundle_id       String?
  product_id      String?
  variant_id      String?
  schedule_type   ScheduleType
  fire_date       DateTime?  // for ONE_TIME
  recurrence_rule String?    // RRULE for RECURRING (e.g., "FREQ=MONTHLY;BYMONTHDAY=15")
  payment_method_token String  // saved payment method
  is_active       Boolean   @default(true)
  last_fired_at   DateTime?
  next_fire_at    DateTime?
  fire_count      Int       @default(0)
  max_fires       Int?      // null = unlimited
  personal_message String?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  @@index([sender_user_id])
  @@index([is_active])
  @@index([next_fire_at])
}

enum ScheduleType {
  ONE_TIME
  RECURRING
}
```

## 4.11 Operations Domain

```prisma
model AuditLog {
  id              String    @id @default(cuid())
  timestamp       DateTime  @default(now())

  actor_user_id   String?
  actor_ip        String?
  actor_user_agent String?
  actor_session_id String?

  action          String    // e.g., "refund.authorize", "user.suspend"
  resource_type   String    // e.g., "order", "user", "seller"
  resource_id     String?

  target_user_id  String?   // user affected by the action

  before_state    Json?
  after_state     Json?
  metadata        Json?

  is_sensitive    Boolean   @default(false)  // hide details in non-superadmin views
  retention_until DateTime  // 7 years from timestamp

  actor           User?     @relation("actor", fields: [actor_user_id], references: [id])
  target          User?     @relation("target", fields: [target_user_id], references: [id])

  @@index([timestamp])
  @@index([actor_user_id])
  @@index([target_user_id])
  @@index([action])
  @@index([resource_type, resource_id])
  @@index([retention_until])
}

// CRITICAL: AuditLog table has database-level UPDATE/DELETE prevention via Postgres trigger.
// Records are append-only. Cold storage after 1 year via batch job.

model Notification {
  id              String    @id @default(cuid())
  user_id         String
  type            NotificationType
  channel         NotificationChannel
  title           String
  body            String    @db.Text
  action_url      String?
  related_resource_type String?
  related_resource_id String?
  metadata        Json?
  is_read         Boolean   @default(false)
  read_at         DateTime?
  sent_at         DateTime?
  delivered_at    DateTime?
  failed_at       DateTime?
  failure_reason  String?
  created_at      DateTime  @default(now())

  user            User      @relation(fields: [user_id], references: [id])

  @@index([user_id])
  @@index([is_read])
  @@index([type])
  @@index([created_at])
}

enum NotificationType {
  ORDER_PLACED
  ORDER_ACCEPTED
  ORDER_PICKED_UP
  ORDER_OUT_FOR_DELIVERY
  ORDER_DELIVERED
  ORDER_DELAYED
  ORDER_CANCELLED
  PAYMENT_RECEIVED
  PAYMENT_FAILED
  PAYOUT_INITIATED
  PAYOUT_COMPLETED
  PAYOUT_FAILED
  DISPUTE_OPENED
  DISPUTE_RESPONSE_NEEDED
  DISPUTE_RESOLVED
  KYC_TIER_PROMOTED
  KYC_REJECTED
  ADMIN_ACTION_REQUIRED
  SECURITY_ALERT
  MARKETING
  SYSTEM
}

enum NotificationChannel {
  EMAIL
  SMS
  WHATSAPP
  PUSH
  IN_APP
}

model FeatureFlag {
  id              String    @id @default(cuid())
  key             String    @unique
  name            String
  description     String?
  is_enabled      Boolean   @default(false)
  rollout_percentage Int    @default(0)  // 0-100
  applies_to      String[]  // ["buyer", "seller", "diaspora", "admin"]
  variant_config  Json?     // for A/B tests
  created_by_user_id String
  updated_by_user_id String?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  @@index([key])
  @@index([is_enabled])
}

model PlatformConfig {
  id              String    @id @default(cuid())
  key             String    @unique
  value           Json
  description     String?
  category        String
  updated_by_user_id String
  updated_at      DateTime  @updatedAt
  created_at      DateTime  @default(now())

  @@index([category])
}

// Examples of PlatformConfig keys:
// - "commission.starter_rate" -> 0.12
// - "commission.growth_rate" -> 0.10
// - "escrow.release_window_hours" -> 24
// - "dispute.sla_hours" -> 48
// - "delivery_code.expiry_hours" -> 72
// - "insurance_fund.balance" -> 5000.00
// - "diaspora_fee.percentage" -> 0.02
```

## 4.12 Supporting Tables

```prisma
model ProductReview {
  id              String    @id @default(cuid())
  product_id      String
  buyer_user_id   String
  order_id        String
  rating          Int       // 1-5
  title           String?
  body            String?   @db.Text
  is_verified_purchase Boolean @default(true)
  is_visible      Boolean   @default(true)
  helpful_count   Int       @default(0)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  product         Product   @relation(fields: [product_id], references: [id])

  @@unique([product_id, order_id])
  @@index([product_id])
  @@index([buyer_user_id])
}

model SellerReview {
  id              String    @id @default(cuid())
  seller_id       String
  buyer_user_id   String
  order_id        String
  rating          Int       // 1-5
  comment         String?
  created_at      DateTime  @default(now())

  seller          Seller    @relation(fields: [seller_id], references: [id])

  @@unique([seller_id, order_id])
  @@index([seller_id])
}

model Wishlist {
  id              String    @id @default(cuid())
  user_id         String
  product_id      String
  variant_id      String?
  added_at        DateTime  @default(now())

  @@unique([user_id, product_id, variant_id])
  @@index([user_id])
}

model SavedSearch {
  id              String    @id @default(cuid())
  user_id         String
  name            String
  query           String?
  filters         Json
  alert_enabled   Boolean   @default(false)
  last_alert_at   DateTime?
  result_count_at_save Int  @default(0)
  created_at      DateTime  @default(now())

  @@index([user_id])
}

model RecentlyViewed {
  id              String    @id @default(cuid())
  user_id         String
  product_id      String
  viewed_at       DateTime  @default(now())

  @@unique([user_id, product_id])
  @@index([user_id, viewed_at])
}

model SupportTicket {
  id              String    @id @default(cuid())
  ticket_number   String    @unique
  user_id         String
  category        String
  subject         String
  status          SupportTicketStatus @default(OPEN)
  priority        SupportPriority @default(NORMAL)
  assigned_to_user_id String?
  related_order_id String?
  related_dispute_id String?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  closed_at       DateTime?

  messages        SupportTicketMessage[]

  @@index([user_id])
  @@index([status])
  @@index([assigned_to_user_id])
}

enum SupportTicketStatus {
  OPEN
  IN_PROGRESS
  WAITING_USER
  RESOLVED
  CLOSED
}

enum SupportPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

model SupportTicketMessage {
  id              String    @id @default(cuid())
  ticket_id       String
  author_user_id  String
  body            String    @db.Text
  is_internal     Boolean   @default(false)
  attachments     String[]
  created_at      DateTime  @default(now())

  ticket          SupportTicket @relation(fields: [ticket_id], references: [id])

  @@index([ticket_id])
}
```


## 4.13 Reviews Domain

Added in MVP expansion (May 2026). Product and seller review system with moderation workflow, verified-purchase badging, and reporting.

```prisma
model Review {
  id              String      @id @default(cuid())
  subject_type    ReviewSubjectType  // PRODUCT | SELLER
  subject_id      String      // product_id OR seller_id depending on subject_type

  author_user_id  String
  author_user     User        @relation("author", fields: [author_user_id], references: [id])

  // Verified purchase linkage
  order_item_id   String?     @unique  // null if not a verified purchase
  order_item      OrderItem?  @relation(fields: [order_item_id], references: [id])
  verified_purchase Boolean   @default(false)

  // Review content
  rating          Int         // 1-5
  title           String?     // optional headline
  body            String      // review text (required)

  // Moderation state
  status          ReviewStatus @default(PUBLISHED)
  // PUBLISHED, PENDING_REVIEW (if flagged), HIDDEN (admin-hidden), DELETED (author-deleted)

  // Seller response (single response per review)
  seller_response       String?
  seller_response_at    DateTime?

  // Aggregation cache (denormalized for query performance)
  helpful_count   Int         @default(0)
  reported_count  Int         @default(0)

  created_at      DateTime    @default(now())
  updated_at      DateTime    @updatedAt

  reports         ReviewReport[]

  @@index([subject_type, subject_id, status, created_at])
  @@index([author_user_id])
  @@index([order_item_id])
  @@index([status])
}

enum ReviewSubjectType {
  PRODUCT
  SELLER
}

enum ReviewStatus {
  PUBLISHED
  PENDING_REVIEW
  HIDDEN
  DELETED
}

model ReviewReport {
  id              String      @id @default(cuid())
  review_id       String
  review          Review      @relation(fields: [review_id], references: [id])

  reporter_user_id String
  reporter_user   User        @relation(fields: [reporter_user_id], references: [id])

  reason          ReportReason
  // FAKE_REVIEW, OFFENSIVE_LANGUAGE, OFF_TOPIC, COMPETITOR_ATTACK, SPAM, OTHER

  details         String?     // optional free text

  status          ReportStatus @default(PENDING)
  // PENDING, REVIEWED_VALID (review hidden), REVIEWED_INVALID (no action), DUPLICATE

  reviewed_by_user_id  String?
  reviewed_by_user     User?  @relation("reviewed_by", fields: [reviewed_by_user_id], references: [id])
  reviewed_at          DateTime?
  resolution_note      String?

  created_at      DateTime    @default(now())

  @@index([review_id])
  @@index([reporter_user_id])
  @@index([status])
}

enum ReportReason {
  FAKE_REVIEW
  OFFENSIVE_LANGUAGE
  OFF_TOPIC
  COMPETITOR_ATTACK
  SPAM
  OTHER
}

enum ReportStatus {
  PENDING
  REVIEWED_VALID
  REVIEWED_INVALID
  DUPLICATE
}

// Aggregation cache for fast read-side queries
model ReviewAggregate {
  id              String      @id @default(cuid())
  subject_type    ReviewSubjectType
  subject_id      String

  total_reviews   Int         @default(0)
  average_rating  Decimal     @default(0) @db.Decimal(3, 2)
  rating_1_count  Int         @default(0)
  rating_2_count  Int         @default(0)
  rating_3_count  Int         @default(0)
  rating_4_count  Int         @default(0)
  rating_5_count  Int         @default(0)

  last_review_at  DateTime?
  updated_at      DateTime    @updatedAt

  @@unique([subject_type, subject_id])
  @@index([subject_type, subject_id])
}
```

**Business rules:**

- A buyer can review a product OR a seller, not arbitrary entities. Driver ratings remain in the existing `DriverRating` model (different schema for delivery-specific metadata).
- A buyer can only leave ONE review per `order_item_id` for products, and one per `order_id` for sellers. The `@unique` constraint on `order_item_id` enforces this for product reviews.
- `verified_purchase` is `true` only when the review is linked to a completed (DELIVERED or COMPLETED) order item. Unverified reviews are allowed but flagged in UI.
- Sellers can respond ONCE per review. Edits to the response are allowed within 7 days.
- Reviews enter PUBLISHED status by default. They move to PENDING_REVIEW when reported 3+ times by distinct users. T&S admin then decides HIDDEN or PUBLISHED.
- `ReviewAggregate` is updated transactionally on every review create/update/hide via a database trigger or in the same transaction as the Review write.

**Permissions:**

- `review.create` — any authenticated buyer (with valid `order_item_id` for verified review)
- `review.update.own` — author within 30 days of creation
- `review.delete.own` — author at any time (sets status to DELETED, preserves audit trail)
- `review.report` — any authenticated user
- `review.moderate` — `ts_admin` and `support_admin`
- `review.respond` — seller for reviews on their own products/store

## 4.14 Trust Cases Domain

Added in MVP expansion (May 2026). Unified case management for trust & safety operations across all subject types.

```prisma
model TrustCase {
  id              String      @id @default(cuid())
  case_number     String      @unique // human-readable, e.g., TC-2026-00001

  // Subject of the case (polymorphic)
  subject_type    TrustSubjectType
  // SELLER | DRIVER | PRODUCT | ORDER | DISPUTE | KYC | USER
  subject_id      String

  // Case metadata
  title           String
  summary         String
  status          TrustCaseStatus  @default(NEW)
  // NEW, HEALTHY, MONITORING, NEEDS_INFO, ESCALATED, RESTRICTED, RESOLVED

  severity        TrustSeverity
  // LOW, MEDIUM, HIGH, CRITICAL

  // Assignment and SLA
  assigned_to_user_id  String?
  assigned_to_user     User?      @relation("assigned_to", fields: [assigned_to_user_id], references: [id])
  assigned_at          DateTime?

  due_date            DateTime    // computed at creation based on severity SLA
  // CRITICAL = +24h, HIGH = +48h, MEDIUM = +72h, LOW = +7d

  // Resolution
  resolved_at         DateTime?
  resolution_summary  String?
  resolution_action   TrustResolution?
  // NO_ACTION_TAKEN, WARNING_ISSUED, SUSPENDED_TEMPORARY, SUSPENDED_PERMANENT, REFUND_ISSUED, INSURANCE_PAYOUT, RESTORED

  // Auto-creation source (if applicable)
  auto_created            Boolean     @default(false)
  auto_creation_signal    String?     // e.g., "fraud_velocity_check", "dispute_pattern_seller"

  // Audit
  created_at      DateTime    @default(now())
  created_by_user_id   String?
  created_by_user      User?      @relation("created_by", fields: [created_by_user_id], references: [id])
  updated_at      DateTime    @updatedAt

  notes           TrustCaseNote[]
  actions         TrustCaseAction[]
  follow_ups      TrustCase[]    @relation("follow_up_parent")
  parent_case_id  String?
  parent_case     TrustCase?     @relation("follow_up_parent", fields: [parent_case_id], references: [id])

  @@index([subject_type, subject_id])
  @@index([status, due_date])
  @@index([assigned_to_user_id, status])
  @@index([severity, due_date])
  @@index([created_at])
}

enum TrustSubjectType {
  SELLER
  DRIVER
  PRODUCT
  ORDER
  DISPUTE
  KYC
  USER
}

enum TrustCaseStatus {
  NEW
  HEALTHY
  MONITORING
  NEEDS_INFO
  ESCALATED
  RESTRICTED
  RESOLVED
}

enum TrustSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum TrustResolution {
  NO_ACTION_TAKEN
  WARNING_ISSUED
  SUSPENDED_TEMPORARY
  SUSPENDED_PERMANENT
  REFUND_ISSUED
  INSURANCE_PAYOUT
  RESTORED
}

model TrustCaseNote {
  id              String      @id @default(cuid())
  trust_case_id   String
  trust_case      TrustCase   @relation(fields: [trust_case_id], references: [id])

  author_user_id  String
  author_user     User        @relation(fields: [author_user_id], references: [id])

  visibility      NoteVisibility  @default(INTERNAL)
  // INTERNAL (T&S only), SHARED_WITH_SUBJECT (seller/buyer can see)

  body            String

  created_at      DateTime    @default(now())

  @@index([trust_case_id, created_at])
}

enum NoteVisibility {
  INTERNAL
  SHARED_WITH_SUBJECT
}

model TrustCaseAction {
  id              String      @id @default(cuid())
  trust_case_id   String
  trust_case      TrustCase   @relation(fields: [trust_case_id], references: [id])

  actor_user_id   String
  actor_user      User        @relation(fields: [actor_user_id], references: [id])

  action_type     TrustActionType
  // CASE_CREATED, ASSIGNED, REASSIGNED, STATUS_CHANGED, NOTE_ADDED, INFO_REQUESTED, ESCALATED,
  // MARKED_MONITORING, MARKED_REVIEWED, FOLLOW_UP_CREATED, RESTRICTED, RESOLVED, REOPENED

  details         Json        // flexible payload, e.g., { from_status: "NEW", to_status: "MONITORING" }

  created_at      DateTime    @default(now())

  @@index([trust_case_id, created_at])
  @@index([actor_user_id])
}

enum TrustActionType {
  CASE_CREATED
  ASSIGNED
  REASSIGNED
  STATUS_CHANGED
  NOTE_ADDED
  INFO_REQUESTED
  ESCALATED
  MARKED_MONITORING
  MARKED_REVIEWED
  FOLLOW_UP_CREATED
  RESTRICTED
  RESOLVED
  REOPENED
}
```

**Business rules:**

- Trust cases auto-create from risk signals: fraud rule triggers, repeated disputes against the same seller, stale KYC applications, multiple failed deliveries by the same driver. The auto-creation engine is implemented in `packages/domain/src/trust/auto-creation.ts`.
- Default SLA per severity: CRITICAL = 24h, HIGH = 48h, MEDIUM = 72h, LOW = 7 days. SLA calculated from `created_at`, stored in `due_date`.
- Cases can have follow-up cases (e.g., a SELLER case spawns a PRODUCT case for a specific listing). Parent-child relationship tracked via `parent_case_id`.
- Notifications fire on: assignment, due_date update, status change to ESCALATED, 24h before due_date.
- A `trust_case_evidence_summary` view (computed on read) shows subject-specific context per the brief's evidence requirements.

**Permissions:**

- `trust_case.create` — `ts_admin`, `superadmin`, or auto-creation engine
- `trust_case.assign` — `ts_admin` (assign self or other T&S members), `superadmin`
- `trust_case.read.all` — `ts_admin`, `superadmin`, `support_admin` (limited view)
- `trust_case.read.assigned` — assigned user
- `trust_case.action.escalate` — `ts_admin`, `superadmin`
- `trust_case.action.restrict` — `ts_admin` (low/medium severity), `superadmin` (any)
- `trust_case.resolve` — assigned user OR `ts_admin` with override permission

**Trust case evidence summary by subject type (computed read-side, not stored):**

- **Seller** → store metadata, KYC tier + history, current trust tier, Stripe payout readiness, product count + status breakdown, open disputes, ratings (when reviews ship), payout history
- **Driver** → KYC + service zones, completed/active assignments, failed handoffs count, ratings, vehicle status, last active date
- **Product** → seller link, condition, authenticity claim/proof, report count, stock, reviews + aggregate, last edit date
- **Order** → buyer + seller + driver links, delivery assignment state, payment + refund state, escrow hold state, timeline events
- **Dispute** → linked order, buyer + seller messages, evidence uploads, current resolution state, T&S notes
- **KYC** → applicant, current tier, documents uploaded, risk tier, review history, time-in-state per status
- **User** → role(s), account age, status (active/suspended), linked seller/driver profile, recent activity (orders, reviews, support tickets), suspension history

## 4.15 Profile Change Request Domain

Added in MVP expansion (May 2026). Approval workflow for sensitive seller and driver profile changes.

```prisma
model ProfileChangeRequest {
  id              String      @id @default(cuid())
  subject_type    ProfileSubjectType
  // SELLER | DRIVER
  subject_id      String      // seller_id OR driver_id

  requested_by_user_id  String
  requested_by_user     User        @relation("requested_by", fields: [requested_by_user_id], references: [id])

  // What's being changed
  change_type     ProfileChangeType
  // BUSINESS_NAME, LEGAL_NAME, ADDRESS, BANK_ACCOUNT, MOMO_NUMBER, VEHICLE_DETAILS,
  // SERVICE_ZONE, STORE_SLUG, TAX_ID, OWNER_NAME, OTHER

  field_changes   Json        // { field_name: { from: "old", to: "new" } }

  // Supporting documents (R2 URLs)
  supporting_docs Json?       // array of { url, doc_type, uploaded_at }

  reason          String?     // free-text reason from the requester

  status          ProfileChangeStatus  @default(PENDING)
  // PENDING, APPROVED, REJECTED, NEEDS_MORE_INFO, CANCELLED

  // Admin review
  reviewed_by_user_id   String?
  reviewed_by_user      User?       @relation("reviewed_by", fields: [reviewed_by_user_id], references: [id])
  reviewed_at           DateTime?
  decision_note         String?

  // If approved, when applied
  applied_at      DateTime?

  // Auto-routing tier (some changes require ts_admin or superadmin)
  required_approver_tier  ApproverTier  @default(TS_ADMIN)
  // TS_ADMIN, SUPERADMIN

  created_at      DateTime    @default(now())
  updated_at      DateTime    @updatedAt

  @@index([subject_type, subject_id])
  @@index([status, created_at])
  @@index([reviewed_by_user_id])
}

enum ProfileSubjectType {
  SELLER
  DRIVER
}

enum ProfileChangeType {
  BUSINESS_NAME
  LEGAL_NAME
  ADDRESS
  BANK_ACCOUNT
  MOMO_NUMBER
  VEHICLE_DETAILS
  SERVICE_ZONE
  STORE_SLUG
  TAX_ID
  OWNER_NAME
  OTHER
}

enum ProfileChangeStatus {
  PENDING
  APPROVED
  REJECTED
  NEEDS_MORE_INFO
  CANCELLED
}

enum ApproverTier {
  TS_ADMIN
  SUPERADMIN
}
```

**Business rules:**

- "Sensitive" changes always go through this workflow: BANK_ACCOUNT, MOMO_NUMBER, LEGAL_NAME, OWNER_NAME, TAX_ID. These have `required_approver_tier = SUPERADMIN`.
- "Reviewable" changes go through T&S: BUSINESS_NAME, ADDRESS, VEHICLE_DETAILS, SERVICE_ZONE, STORE_SLUG. These have `required_approver_tier = TS_ADMIN`.
- "Trivial" changes (store description, store hours, etc.) do NOT go through this workflow — they update directly via the normal seller/driver self-service flow.
- The actual field changes are NOT applied to the Seller/Driver model until status = APPROVED. Then a background job applies the changes within a transaction and writes to the audit log.
- A pending request blocks subsequent requests for the same field on the same subject. The seller/driver sees "Change pending review" in their UI.

**Permissions:**

- `profile_change_request.create.self` — seller can request changes to their own SellerProfile; driver can request changes to their own DriverProfile
- `profile_change_request.read.assigned` — assigned reviewer
- `profile_change_request.review.ts_tier` — `ts_admin`, `superadmin`
- `profile_change_request.review.super_tier` — `superadmin` only
- `profile_change_request.apply` — system worker after approval

## 4.16 Webhook & Outbox Domain

Added in MVP expansion (May 2026). Structured logging for outbound webhooks (to partners) and inbound webhook receipts, plus outbox pattern for guaranteed event delivery.

```prisma
model WebhookLog {
  id              String      @id @default(cuid())

  direction       WebhookDirection
  // INBOUND | OUTBOUND

  provider        String      // e.g., "stripe", "mtn_momo", "orange_money", "africastalking"
  event_type      String      // e.g., "payment_intent.succeeded", "collection.completed"

  // Request/response data
  request_url     String?     // for OUTBOUND
  request_headers Json?
  request_body    Json
  response_status Int?
  response_body   Json?

  // Outcome
  status          WebhookStatus
  // RECEIVED, PROCESSED, FAILED, RETRYING, DUPLICATE (already processed)

  // Idempotency
  external_event_id    String?  // provider's event id, e.g., Stripe's evt_xxx
  idempotency_key      String?  // for outbound, the key we sent

  // Retry tracking
  retry_count     Int         @default(0)
  next_retry_at   DateTime?

  // Linkage to business object
  related_resource_type  String?  // "order", "escrow_hold", "payout"
  related_resource_id    String?

  // Timing
  received_at     DateTime    @default(now())
  processed_at    DateTime?
  duration_ms     Int?

  // Error context
  error_message   String?
  error_stack     String?

  @@unique([provider, external_event_id])  // idempotency enforcement
  @@index([provider, direction, status])
  @@index([related_resource_type, related_resource_id])
  @@index([received_at])
}

enum WebhookDirection {
  INBOUND
  OUTBOUND
}

enum WebhookStatus {
  RECEIVED
  PROCESSED
  FAILED
  RETRYING
  DUPLICATE
}

model OutboxEvent {
  id              String      @id @default(cuid())

  // Event identity
  aggregate_type  String      // "order", "escrow_hold", "dispute", etc.
  aggregate_id    String
  event_type      String      // "OrderPlaced", "EscrowReleased", "DisputeOpened"

  // Payload
  payload         Json

  // Dispatch state
  status          OutboxStatus  @default(PENDING)
  // PENDING, DISPATCHED, FAILED, DEAD_LETTER

  // Retry tracking
  attempt_count   Int         @default(0)
  last_attempt_at DateTime?
  next_attempt_at DateTime?
  max_attempts    Int         @default(10)

  // Destination(s)
  destinations    Json        // [{ type: "notification", target: "user:123" }, { type: "webhook", target: "https://..." }]

  // Outcome
  dispatched_at   DateTime?
  failed_reason   String?

  created_at      DateTime    @default(now())

  @@index([status, next_attempt_at])
  @@index([aggregate_type, aggregate_id])
  @@index([created_at])
}

enum OutboxStatus {
  PENDING
  DISPATCHED
  FAILED
  DEAD_LETTER
}
```

**Business rules:**

- Every business event that triggers external action (notification, webhook, downstream system) writes an OutboxEvent in the SAME transaction as the business state change. A separate worker polls and dispatches.
- This guarantees at-least-once delivery: if the database commits but the dispatch crashes, the worker retries.
- Idempotency: every event has a unique aggregate + event_type combination; downstream consumers must handle duplicates.
- Dead letter queue: events that fail after `max_attempts` (default 10) move to DEAD_LETTER status. Operations Admin reviews these.
- WebhookLog is the AUDIT TRAIL for everything that crosses the trust boundary (inbound or outbound). Required for reconciliation and dispute investigation.

**Admin UI surfaces:**

- `/admin/webhooks` — searchable webhook log, filterable by provider/status/date
- `/admin/outbox` — pending events queue, retry button, dead letter queue
- `/admin/system-readiness` — health dashboard showing webhook backlog, outbox backlog, alert thresholds

## 4.17 Product Condition & Authenticity Domain

Added in MVP expansion (May 2026). Per-product condition, warranty, return policy, and authenticity claims.

```prisma
// Extension to existing Product model — new fields added
// (Full Product model is defined in Section 4.5 Catalog Domain)
//
// NEW FIELDS ADDED TO Product:
//   condition           ProductCondition  @default(NEW)
//   condition_note      String?
//   warranty_terms      String?           // free-text, max 2000 chars
//   warranty_duration_days Int?
//   return_policy_type  ReturnPolicyType  @default(PLATFORM_DEFAULT)
//   return_policy_terms String?           // overrides platform default if RETURN_POLICY_CUSTOM
//   return_window_days  Int?              // overrides platform default if RETURN_POLICY_CUSTOM
//   authenticity_status AuthenticityStatus @default(UNCLAIMED)
//   authenticity_proof_urls Json?         // array of R2 URLs
//   buyer_protection_eligible Boolean     @default(true)
//   compare_at_price    Decimal?          // optional "was $X" pricing
//   pinned_position     Int?              // 1-N for pinned products (tier feature)

enum ProductCondition {
  NEW                 // Brand new, unopened
  LIKE_NEW            // Open box, never used
  USED_GOOD           // Used, functioning, normal wear
  USED_FAIR           // Used, functional but visible wear ("Fairly used")
  REFURBISHED         // Professionally restored
  FOR_PARTS           // Damaged / Broken / for parts
}

enum ReturnPolicyType {
  PLATFORM_DEFAULT    // Uses platform-wide return policy
  RETURN_POLICY_CUSTOM // Seller-specified per-product terms
  NO_RETURNS          // Final sale (must be disclosed prominently)
}

enum AuthenticityStatus {
  UNCLAIMED           // Seller has made no claim
  CLAIMED             // Seller claims authentic, no proof uploaded
  PROOF_PROVIDED      // Seller uploaded receipts/COA/etc.
  PLATFORM_VERIFIED   // T&S has confirmed authenticity (Trusted Partner tier mostly)
  DISPUTED            // Active claim of counterfeit
}
```

**Business rules:**

- `condition` is REQUIRED on every product. Default is NEW.
- `condition_note` is required when condition is anything other than NEW or LIKE_NEW.
- Condition is IMMUTABLE once a product has received its first order — sellers cannot change the condition of a product they've already sold.
- `return_policy_type = NO_RETURNS` must be prominently displayed on the product detail page and in checkout.
- `authenticity_status = PROOF_PROVIDED` requires at least one document upload in `authenticity_proof_urls`.
- `buyer_protection_eligible = false` requires explicit seller acknowledgment and is restricted to certain conditions (FOR_PARTS, NO_RETURNS).
- Search filter: buyers can filter by condition. By default, search shows NEW + LIKE_NEW; buyers must opt-in to see USED, REFURBISHED, FOR_PARTS.

## 4.18 KYC Application & Reminder Domain

Added in MVP expansion (May 2026). Explicit modeling of KYC applications as first-class entities with reminder workflow.

```prisma
model KycApplication {
  id              String      @id @default(cuid())

  // Applicant
  applicant_type  KycApplicantType
  // SELLER | DRIVER
  applicant_user_id  String
  applicant_user     User       @relation(fields: [applicant_user_id], references: [id])

  // Target tier
  target_tier     Int         // 0-4 for sellers, 0-2 for drivers
  current_tier    Int         @default(0)

  // Application state
  status          KycApplicationStatus  @default(NOT_STARTED)
  // NOT_STARTED, IN_PROGRESS, SUBMITTED, IN_REVIEW, NEEDS_MORE_INFO,
  // APPROVED, DENIED, EXPIRED

  // Risk classification (independent of KYC tier)
  risk_tier       RiskTier?   // assigned during review
  // LOW, MEDIUM, HIGH (drives transaction monitoring thresholds)

  // Documents (joined from KycDocument)
  documents       KycDocument[]

  // Review tracking
  reviewer_user_id    String?
  reviewer_user       User?      @relation("reviewer", fields: [reviewer_user_id], references: [id])
  review_started_at   DateTime?
  review_completed_at DateTime?
  review_notes        String?

  // Reminders
  last_reminder_sent_at DateTime?
  reminder_count        Int        @default(0)

  // Staleness
  last_applicant_action_at DateTime?
  stale_at                 DateTime?  // computed: if no action for 14 days, marked stale

  created_at      DateTime    @default(now())
  submitted_at    DateTime?
  expires_at      DateTime?   // some tiers expire (e.g., business license renewal)
  updated_at      DateTime    @updatedAt

  @@index([applicant_type, applicant_user_id])
  @@index([status, created_at])
  @@index([reviewer_user_id])
  @@index([stale_at])
}

enum KycApplicantType {
  SELLER
  DRIVER
}

enum KycApplicationStatus {
  NOT_STARTED
  IN_PROGRESS
  SUBMITTED
  IN_REVIEW
  NEEDS_MORE_INFO
  APPROVED
  DENIED
  EXPIRED
}

enum RiskTier {
  LOW
  MEDIUM
  HIGH
}

model KycDocument {
  id              String      @id @default(cuid())
  kyc_application_id   String
  kyc_application      KycApplication  @relation(fields: [kyc_application_id], references: [id])

  doc_type        KycDocType
  // GOVERNMENT_ID, SELFIE, PROOF_OF_ADDRESS, BUSINESS_REGISTRATION,
  // TAX_CERTIFICATE, BANK_STATEMENT, DRIVER_LICENSE, VEHICLE_REGISTRATION, OTHER

  storage_url     String      // R2 URL (encrypted at rest)
  file_name       String
  file_size_bytes Int
  mime_type       String

  // Verification state
  status          KycDocStatus  @default(UPLOADED)
  // UPLOADED, REVIEWED_VALID, REVIEWED_INVALID, EXPIRED, SUPERSEDED

  reviewer_note   String?

  uploaded_at     DateTime    @default(now())
  reviewed_at     DateTime?

  @@index([kyc_application_id])
  @@index([doc_type])
  @@index([status])
}

enum KycDocType {
  GOVERNMENT_ID
  SELFIE
  PROOF_OF_ADDRESS
  BUSINESS_REGISTRATION
  TAX_CERTIFICATE
  BANK_STATEMENT
  DRIVER_LICENSE
  VEHICLE_REGISTRATION
  OTHER
}

enum KycDocStatus {
  UPLOADED
  REVIEWED_VALID
  REVIEWED_INVALID
  EXPIRED
  SUPERSEDED
}
```

**Business rules:**

- A user can have multiple KycApplication records over time (one per tier promotion attempt). The active application is the most recent non-terminal one (status not in APPROVED, DENIED, EXPIRED).
- `risk_tier` is set by the reviewer during review. It drives transaction monitoring thresholds: HIGH risk = stricter velocity rules, lower auto-release thresholds, more conservative auto-trust signals.
- Driver KYC REQUIRES a SELFIE document. Seller Tier 1 also requires SELFIE.
- A KycApplication that sits in IN_PROGRESS for >14 days is automatically marked `stale_at`. Stale applications appear in the T&S admin's "stale list."
- KYC reminders: automated background job sends reminders at days 3, 7, 14 for applications in NOT_STARTED or IN_PROGRESS status. Reminders sent via email + SMS.
- Admin bulk reminder: T&S admin can trigger bulk reminders to all users with stale applications via a single action.

**KYC Admin queue surfaces (Phase 6):**

- `/admin/kyc/queue` — all PENDING applications, sortable by SLA, age, risk_tier
- `/admin/kyc/needs-info` — applications waiting on additional documents from applicant
- `/admin/kyc/stale` — applications with no applicant action for 14+ days
- `/admin/kyc/not-started` — registered users who haven't started KYC (for reminder campaigns)
- `/admin/kyc/completed` — APPROVED applications (for audit/review)

---

# 5. Authentication & Authorization

## 5.1 Auth Flow Architecture

Vendoora uses Clerk as the auth provider with custom RBAC layered on top. Clerk handles credentials, sessions, MFA, password reset; Vendoora's database holds the canonical user record and all role/permission state.

**The user model is bifurcated:**

- **Clerk's `User`** — stores authentication credentials, MFA secrets, social OAuth links, password hash, session tokens. Vendoora never touches these.
- **Vendoora's `User` table** — stores everything else: trust score, account status, business relationships (seller/driver), preferences, audit trail. Linked to Clerk via `clerk_id`.

**Synchronization:** Clerk webhook fires on user creation/update/deletion. Worker process syncs to Vendoora's `User` table. Idempotent — replaying any webhook event is safe.

## 5.2 Session Management

**Session storage:**

- Clerk issues a session token in an HTTP-only, Secure, SameSite=Lax cookie.
- Cookie is httpOnly (immune to XSS-based token theft), Secure (HTTPS-only), SameSite=Lax (CSRF protection while allowing top-level navigation).
- Session validation: middleware reads cookie, calls Clerk's `auth()` to validate, attaches user to request context.

**Session duration:**

- Admin sessions (anyone with an `admin*` role): 4 hours. After 4 hours, full re-authentication required.
- Seller sessions: 30 days, refreshable.
- Buyer sessions: 30 days, refreshable.
- Driver sessions: 30 days, refreshable.

**Session revocation:**

- User-initiated logout → Clerk revokes the session immediately across all devices.
- Admin-initiated user suspension → Clerk session revoked + Vendoora `user.account_status = SUSPENDED`.
- Detected anomaly (login from new country, suspicious behavior) → session flagged for re-authentication on next request.

**Cookie configuration:**

```typescript
{
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: sessionDuration,
  domain: '.vendoora.com',  // shared across subdomains
}
```

## 5.3 Permission Middleware Architecture

Every API request and every page render passes through permission middleware. The check happens at three layers:

**Layer 1 — Route-level middleware (Next.js `middleware.ts`):**

Coarse-grained authorization. "Is this user logged in? Is this an admin route?"

```typescript
// Pseudocode
export function middleware(request) {
  const session = await auth();

  if (request.url.includes('/admin') && !session?.user) {
    return redirect('/login');
  }

  if (request.url.includes('/admin')) {
    const user = await getUser(session.userId);
    if (!user.roles.some(r => r.startsWith('admin'))) {
      return forbidden();
    }
  }

  return NextResponse.next();
}
```

**Layer 2 — Server Action / API handler authorization:**

Fine-grained, permission-specific checks. "Can this user authorize a refund of this amount?"

```typescript
// Pseudocode
async function authorizeRefund(orderId, amount) {
  const session = await auth();
  const user = await getUserWithPermissions(session.userId);

  // Check permission
  if (amount <= 500) {
    if (!user.can('refund.authorize.under_500')) {
      throw new ForbiddenError('Missing permission: refund.authorize.under_500');
    }
  } else {
    if (!user.can('refund.authorize.over_500')) {
      throw new ForbiddenError('Missing permission: refund.authorize.over_500');
    }
    // Step-up auth required for refunds over $500
    await requireStepUpAuth(session);
  }

  // ... execute refund logic
  await auditLog.record({
    actor_user_id: user.id,
    action: 'refund.authorize',
    resource_type: 'order',
    resource_id: orderId,
    metadata: { amount }
  });
}
```

**Layer 3 — Database row-level security:**

Defense in depth. Even if application code has a bug, Postgres RLS prevents data leakage.

```sql
-- Pseudocode RLS policy
CREATE POLICY seller_owns_data ON products
  FOR ALL
  USING (
    seller_id = current_setting('vendoora.current_seller_id')::uuid
    OR current_setting('vendoora.current_user_roles')::text LIKE '%admin%'
  );
```

Application sets `vendoora.current_seller_id` and `vendoora.current_user_roles` at the start of each transaction via `SET LOCAL`. Postgres enforces the policy automatically.

## 5.4 Step-Up Authentication

Step-up auth required for these operations:

- Any refund > $500
- Any role assignment or revocation
- Any KYC tier override (manual promotion or demotion beyond progression rules)
- Any escrow override (force-release or force-freeze outside state machine)
- Any account suspension or deletion
- Any permission matrix modification (creating roles, modifying role-permission mappings)
- All superadmin actions
- Changing payout method or payout account
- Bulk operations (refunding > 10 orders at once, suspending > 10 users at once)

**Implementation:**

When step-up is required:

1. Backend returns `401 STEP_UP_REQUIRED` with a challenge token.
2. Frontend prompts user for password + TOTP code.
3. User submits to `/api/auth/step-up` endpoint.
4. On success, a short-lived (5-minute) elevated session token is issued.
5. User re-submits the original request with the elevated token.
6. Backend validates elevated token, executes the operation, logs to audit_log with `step_up_used: true`.

Elevated tokens are scoped to the specific action — getting a step-up token for "refund authorization" doesn't grant access to "role assignment."

## 5.5 MFA Implementation

**TOTP (Time-based One-Time Password):**

- Clerk handles TOTP enrollment, secret generation, QR code display, verification.
- Compatible with any authenticator app (Authy, Google Authenticator, 1Password, Bitwarden).
- Backup codes generated at enrollment (10 single-use codes).

**Enforcement matrix:**

| User type | MFA required | When |
|-----------|--------------|------|
| Superadmin | Mandatory | At first login after role assignment |
| Other admin roles | Mandatory | At first login after role assignment |
| Seller (Tier 2+) | Optional | Recommended at signup; required for payout method changes |
| Seller (Tier 0-1) | Optional | — |
| Driver | Optional | — |
| Buyer | Optional | — |

**Admin MFA enrollment flow:**

1. Superadmin assigns admin role to user.
2. On user's next login, they're redirected to MFA setup before any admin UI access.
3. User scans QR code with authenticator app.
4. User enters verification code to confirm setup.
5. User downloads backup codes.
6. Admin UI access granted.

**Lost MFA recovery:**

- Backup codes are the first recovery path.
- If backup codes are also lost, superadmin can reset MFA for any other admin (logged in audit_log).
- Superadmin MFA reset requires a different superadmin (if multiple) OR an offline process documented in `docs/runbooks/superadmin-mfa-recovery.md`.

# 6. Escrow State Machine

## 6.1 State Diagram

```
                    ┌──────────────────┐
                    │ PENDING_PAYMENT  │ (initial)
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       payment confirmed  24hr timeout   payment failed
              │              │              │
              ▼              ▼              ▼
        ┌─────────┐     ┌─────────┐    ┌──────────┐
        │  HELD   │     │ EXPIRED │    │ (initial │
        └────┬────┘     └────┬────┘    │  failed) │
             │               │          └──────────┘
             │          auto-refund
             │          to buyer
             │               │
             │               ▼
             │          ┌─────────┐
             │          │REFUNDED │
             │          └─────────┘
             │
   ┌─────────┼─────────┐
   │         │         │
order   delivered    dispute
delivered  + 24hr    opened
           passed
   │         │         │
   ▼         ▼         ▼
┌─────────────┐   ┌──────────────┐
│  RELEASING  │   │HELD_DISPUTED │
└──────┬──────┘   └──────┬───────┘
       │                 │
       │       ┌─────────┼─────────┬──────────┐
       │       │         │         │          │
       │   buyer wins seller wins partial  insurance
       │       │         │         │          │
       │       ▼         ▼         ▼          ▼
       │  ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐
       │  │REFUND- │ │RELEASING│ │PARTIAL │ │INSURANCE │
       │  │ ING    │ │         │ │REFUNDED│ │_PAYOUT   │
       │  └───┬────┘ └────┬────┘ └────────┘ └──────────┘
       │      │           │
       │      ▼           ▼
       │ ┌──────────┐ ┌─────────┐
       └▶│ REFUNDED │ │RELEASED │
         └──────────┘ └─────────┘
```

## 6.2 State Transition Rules

Every transition is implemented as a function in `packages/domain/src/escrow/transitions.ts`. Each function:

1. Validates the from-state allows the to-state.
2. Validates the actor has permission to trigger the transition.
3. Executes any side effects (payout initiation, refund execution, notification).
4. Updates the `escrow_holds.state` field.
5. Inserts a row in `escrow_state_transitions`.
6. Writes to `audit_log`.

All steps run inside a single database transaction with `SELECT FOR UPDATE` row locking on the escrow_hold row.

**The complete transition table:**

| From State | To State | Trigger | Actor | Side Effects |
|-----------|----------|---------|-------|--------------|
| PENDING_PAYMENT | HELD | Payment webhook (success) | System | None |
| PENDING_PAYMENT | EXPIRED | 24hr timeout, seller didn't accept | System | Auto-refund initiated |
| PENDING_PAYMENT | REFUNDED | Payment provider auto-refund | System | None (already refunded) |
| HELD | RELEASING | Order DELIVERED + 24hr passed, no dispute | System | Schedule payout |
| HELD | HELD_DISPUTED | Buyer opens dispute within 24hr of DELIVERED | Buyer | Freeze release |
| HELD | REFUNDING | Admin force-refund (with step-up auth) | Admin | Refund initiated |
| HELD_DISPUTED | RELEASING | T&S resolves in seller's favor | Admin (T&S) | Schedule payout |
| HELD_DISPUTED | REFUNDING | T&S resolves in buyer's favor | Admin (T&S) | Refund initiated |
| HELD_DISPUTED | PARTIALLY_REFUNDED | T&S partial resolution | Admin (T&S) | Split refund + payout |
| HELD_DISPUTED | INSURANCE_PAYOUT | T&S determines in-transit damage | Admin (T&S) | Buyer refunded from insurance fund, seller paid in full |
| RELEASING | RELEASED | Payout webhook (success) | System | Update seller balance |
| RELEASING | HELD | Payout webhook (failed), retry scheduled | System | None, retry later |
| REFUNDING | REFUNDED | Refund webhook (success) | System | Update buyer wallet/card |
| REFUNDING | HELD | Refund webhook (failed) | System | Manual review required |

## 6.3 Concurrency Safety

The escrow state machine MUST be safe against concurrent modifications. Two scenarios where this matters:

**Scenario 1: Two T&S admins simultaneously resolve a dispute.**

Both admins click "Resolve in buyer's favor" at the same moment. Without locking, both might execute the refund, doubling the refund amount.

**Solution:**

```typescript
await prisma.$transaction(async (tx) => {
  // SELECT ... FOR UPDATE locks the row
  const escrow = await tx.$queryRaw`
    SELECT * FROM escrow_holds
    WHERE id = ${escrowId}
    FOR UPDATE
  `;

  if (escrow.state !== 'HELD_DISPUTED') {
    throw new Error('Escrow not in disputable state');
  }

  // ... execute transition
});
```

The first admin's transaction acquires the lock. The second admin's transaction waits. When the first completes, the second reads the updated state and sees the escrow is no longer in HELD_DISPUTED → throws error → admin gets "this dispute has already been resolved by another admin" message.

**Scenario 2: Payment webhook arrives twice (idempotency).**

Payment providers can deliver webhooks multiple times. We must not double-credit.

**Solution:**

Every payment provider event has a unique `provider_event_id`. Before processing, check if we've seen this event. If yes, return success without processing. This is the idempotency key pattern.

## 6.4 Auto-Release Worker

A background worker runs every 5 minutes checking for escrow holds eligible for auto-release.

```typescript
// Pseudocode
async function autoReleaseWorker() {
  const eligible = await prisma.escrowHold.findMany({
    where: {
      state: 'HELD',
      scheduled_release_at: { lte: new Date() },
    },
    include: { order: true }
  });

  for (const hold of eligible) {
    try {
      await escrowTransition({
        escrow_hold_id: hold.id,
        to_state: 'RELEASING',
        reason: 'auto_release_window_passed',
        actor_system: true,
      });
    } catch (error) {
      // Log and continue with other holds
      logger.error('Auto-release failed', { hold_id: hold.id, error });
    }
  }
}
```

This worker has these safety properties:

- Idempotent: re-running it on the same hold is safe (state check prevents re-transition).
- Resilient: one failure doesn't block other holds.
- Auditable: every transition logged to audit_log with `actor_system: true`.

## 6.5 Multi-Vendor Splitting Example

Concrete walkthrough of the escrow_holds for a multi-vendor order:

**Order VDR-48291:**
- Buyer: Fatu Kromah, $173 total
- Item 1: Wrapper from Mariama's Boutique, $48
- Item 2: Headwrap (×2) from Mariama's Boutique, $60
- Item 3: Bag from Konah Leather Works, $65
- Mariama's commission rate: 10% (Growth plan)
- Konah's commission rate: 8% (Pro plan)

**Resulting escrow_holds:**

| ID | Beneficiary | Amount | State | Linked OrderItem |
|----|-------------|--------|-------|------------------|
| eh_001 | SELLER (Mariama) | $43.20 | PENDING_PAYMENT | item_001 |
| eh_002 | PLATFORM | $4.80 | PENDING_PAYMENT | item_001 (commission) |
| eh_003 | SELLER (Mariama) | $54.00 | PENDING_PAYMENT | item_002 |
| eh_004 | PLATFORM | $6.00 | PENDING_PAYMENT | item_002 (commission) |
| eh_005 | SELLER (Konah) | $59.80 | PENDING_PAYMENT | item_003 |
| eh_006 | PLATFORM | $5.20 | PENDING_PAYMENT | item_003 (commission) |

Total: $173.00 across 6 escrow holds.

When payment confirms, all 6 transition PENDING_PAYMENT → HELD.

If buyer disputes only Mariama's wrapper: only eh_001 and eh_002 go to HELD_DISPUTED. The other 4 release normally on schedule.

If T&S resolves dispute in buyer's favor for wrapper: eh_001 → REFUNDING → REFUNDED. eh_002 also → REFUNDING → REFUNDED (commission refunded too).

# 7. Dispute Resolution System

## 7.1 Dispute Lifecycle

```
buyer/seller            T&S admin           resolution
  initiates             review              executes

OPEN ───► IN_REVIEW ───► (decision) ───► RESOLVED_FAVOR_BUYER
                                    ────► RESOLVED_FAVOR_SELLER
                                    ────► RESOLVED_PARTIAL
                                    ────► RESOLVED_INSURANCE
                                    ────► ESCALATED
```

## 7.2 SLA Rules

Every dispute has a 48-hour SLA from open to resolution. SLA breach triggers:

- Notification to assigned T&S admin at 24hr (50% of SLA)
- Notification to T&S admin lead at 36hr (75% of SLA)
- Auto-escalation at 48hr if unresolved
- Dispute appears in "SLA Breached" filter on T&S queue

**SLA exceptions:**

- Waiting for buyer response: SLA paused (max 7 days)
- Waiting for seller response: SLA paused (max 5 days)
- Escalated to senior T&S: SLA reset to 24hr

## 7.3 Resolution Decision Tree

T&S admins follow a decision tree when resolving disputes:

```
Did the order arrive?
├── No
│   ├── Did the driver attempt delivery?
│   │   ├── Yes (failed delivery, returned)
│   │   │   ├── Buyer's fault (wrong address, not home) → RESOLVED_FAVOR_SELLER
│   │   │   └── Seller's fault (bad address provided) → FULL_REFUND_TO_BUYER
│   │   └── No (driver issue) → INSURANCE_PAYOUT
│   └── Was the order ever shipped?
│       ├── Never picked up → FULL_REFUND_TO_BUYER
│       └── Lost in transit → INSURANCE_PAYOUT
└── Yes
    ├── Item matches description?
    │   ├── Yes → RESOLVED_FAVOR_SELLER
    │   └── No
    │       ├── Severity: minor → PARTIAL_REFUND_TO_BUYER (typically 20-50%)
    │       └── Severity: major → FULL_REFUND_TO_BUYER
    └── Item damaged?
        ├── Pre-existing damage (seller fault) → FULL_REFUND_TO_BUYER
        ├── In-transit damage (driver fault) → INSURANCE_PAYOUT
        └── Buyer-caused damage → RESOLVED_FAVOR_SELLER
```

## 7.4 Evidence Requirements

Before any resolution, T&S admin must verify:

- For "not received" disputes: delivery proof photo from driver, GPS location at delivery, code-entry timestamp
- For "damaged" disputes: photos from buyer of damage, packaging condition photo if available
- For "wrong item" disputes: photo from buyer of received item, seller's product listing photos for comparison
- For "counterfeit" disputes: photos showing authenticity markers (or lack thereof), buyer's purchase context

Evidence is uploaded by buyer/seller via `DisputeEvidence` model. T&S admin reviews in the dispute detail UI before making a decision.

## 7.5 Insurance Fund Mechanics

The platform-funded insurance fund covers in-transit damage and lost packages where neither buyer nor seller is at fault.

**Funding:**
- Initial capitalization: $5,000 USD (configurable via PlatformConfig)
- Top-up source: 0.5% of every order's commission allocated to insurance fund
- Replenishment trigger: balance drops below $2,000 USD → alert to Finance Admin

**Eligibility for insurance payout:**
- T&S admin determines the case fits insurance criteria (in-transit damage, lost package, driver fault)
- Maximum per-incident: $500 USD (configurable)
- Maximum per-buyer per-year: $2,000 USD (anti-fraud)
- Maximum per-seller per-year: 10 incidents

**Insurance payout flow:**
- Buyer receives full refund from insurance fund
- Seller receives full payout from escrow (insurance pays the difference)
- Driver may be penalized (rating impact, potential suspension if pattern emerges)

# 8. Payments Architecture

## 8.1 Payment Provider Abstraction

All payment providers implement a common interface:

```typescript
// packages/domain/src/payments/types.ts
interface PaymentProvider {
  readonly name: string;
  readonly supportedCurrencies: string[];

  initiatePayment(input: InitiatePaymentInput): Promise<PaymentResult>;
  confirmPayment(reference: string): Promise<PaymentStatus>;
  cancelPayment(reference: string): Promise<void>;

  initiateRefund(input: InitiateRefundInput): Promise<RefundResult>;

  initiatePayout(input: InitiatePayoutInput): Promise<PayoutResult>;
  checkPayoutStatus(reference: string): Promise<PayoutStatus>;

  validateWebhook(payload: unknown, signature: string): boolean;
  parseWebhookEvent(payload: unknown): WebhookEvent;
}

// Concrete implementations
class StripeProvider implements PaymentProvider { ... }
class MTNMoMoProvider implements PaymentProvider { ... }
class OrangeMoneyProvider implements PaymentProvider { ... }
class WalletProvider implements PaymentProvider { ... }
```

Application code routes to the correct provider based on payment method:

```typescript
function getProvider(method: PaymentMethod): PaymentProvider {
  switch (method) {
    case 'CARD': return new StripeProvider();
    case 'MTN_MOMO': return new MTNMoMoProvider();
    case 'ORANGE_MONEY': return new OrangeMoneyProvider();
    case 'WALLET_BALANCE': return new WalletProvider();
    case 'GROUP_GIFT': return new GroupGiftProvider();
  }
}
```

## 8.2 Stripe Connect Flow (Diaspora)

Diaspora buyers pay via Stripe Connect. The flow:

**Setup (one-time, per seller):**

Not required. Vendoora is the merchant of record. Sellers don't need Stripe accounts. Vendoora collects from buyers via Stripe, then disburses to sellers via local rails (MoMo, bank transfer).

**Per-transaction flow:**

```
1. Buyer initiates checkout in web UI
   └─► Vendoora server creates Stripe PaymentIntent
       (amount, currency, metadata: order_id, seller_ids[])

2. Buyer sees Stripe Elements checkout form
   └─► Buyer enters card details (handled by Stripe iframe, not our servers)

3. Buyer confirms payment
   └─► Stripe processes payment

4. Stripe sends webhook: payment_intent.succeeded
   └─► Vendoora webhook handler:
       a. Verify webhook signature
       b. Idempotency check (have we seen this event ID before?)
       c. Look up Payment record by stripe_payment_intent_id
       d. Update Payment.status = CAPTURED
       e. Transition all EscrowHolds for this order: PENDING_PAYMENT → HELD
       f. Update Order.status: PENDING_PAYMENT → PAID
       g. Notify seller via push/email
       h. Audit log entry

5. (Later) Order delivered, 24hr passes, no dispute
   └─► Auto-release worker transitions EscrowHolds: HELD → RELEASING
       └─► Payout worker initiates seller payout via MoMo
```

**Refund flow:**

```
1. Admin (with step-up auth) authorizes refund
   └─► Vendoora server creates Refund record
       └─► Calls Stripe API: stripe.refunds.create({ payment_intent, amount })

2. Stripe processes refund
3. Stripe sends webhook: charge.refunded
   └─► Vendoora updates Refund.status = COMPLETED
       └─► Audit log entry
```

## 8.3 MTN MoMo Integration

MTN MoMo uses a Request-to-Pay (RTP) flow. The integration is more complex than Stripe.

**Per-transaction flow:**

```
1. Buyer selects "Pay with MTN MoMo" at checkout
   └─► Vendoora server calls MTN Collections API:
       POST /collection/v1_0/requesttopay
       {
         amount, currency, externalId: order_id,
         payer: { partyIdType: "MSISDN", partyId: buyer_phone },
         payerMessage: "Vendoora order #VDR-48291",
         payeeNote: "Payment for order #VDR-48291"
       }
   └─► MTN responds with X-Reference-Id

2. MTN pushes USSD prompt to buyer's phone
   └─► Buyer enters MoMo PIN to confirm

3. Vendoora polls MTN status endpoint every 5 seconds:
   GET /collection/v1_0/requesttopay/{X-Reference-Id}
   └─► Response: { status: "PENDING" | "SUCCESSFUL" | "FAILED" }

   - If SUCCESSFUL: process as payment confirmation
   - If FAILED: mark Payment as FAILED, notify buyer
   - If PENDING: continue polling (max 5 minutes)

4. On SUCCESSFUL:
   - Update Payment.status = CAPTURED
   - Transition EscrowHolds: PENDING_PAYMENT → HELD
   - Update Order.status: PENDING_PAYMENT → PAID
   - All other side effects as Stripe flow
```

**Webhook alternative:**

MTN does support webhooks but with lower reliability than Stripe. We poll as primary mechanism and accept webhooks as a faster signal when they arrive.

**Common MTN failure modes:**

- "Payer wallet inactive" — buyer's MoMo wallet is suspended or closed
- "Insufficient funds" — buyer doesn't have enough balance
- "Wrong PIN" — buyer entered incorrect PIN three times
- "Network timeout" — MTN's system didn't respond in time
- "Payer cancelled" — buyer cancelled the USSD prompt

Each failure mode has specific user-facing messaging and retry guidance.

## 8.4 MoMo Payout Flow (To Sellers/Drivers)

```
1. Payout worker reads eligible payouts:
   - All EscrowHolds in RELEASING state for a seller
   - Aggregated by seller and payout schedule

2. Worker calls MTN Disbursements API:
   POST /disbursement/v1_0/transfer
   {
     amount, currency, externalId: payout_id,
     payee: { partyIdType: "MSISDN", partyId: seller_momo_number },
     payerMessage: "Vendoora payout for orders X, Y, Z",
     payeeNote: "Vendoora payout"
   }

3. MTN processes transfer to seller's MoMo wallet

4. Worker polls status:
   - SUCCESSFUL → Update EscrowHolds: RELEASING → RELEASED
                  Update Payout.status = COMPLETED
                  Notify seller
   - FAILED → Update Payout.status = FAILED
              Schedule retry with exponential backoff
              After 3 failures: alert Finance Admin for manual review
```

## 8.5 FX Rate Handling

**Daily rate fetch:**

```typescript
// Scheduled at 06:00 UTC daily
async function fetchDailyFxRates() {
  const cblRates = await fetchCBLRates(); // Central Bank of Liberia

  for (const rate of cblRates) {
    await prisma.fxRate.create({
      data: {
        from_currency: rate.from,
        to_currency: rate.to,
        rate: rate.value,
        source: 'CBL',
        effective_date: today(),
        is_active: true,
      }
    });
  }

  // Cache today's rates in Redis with 25hr TTL
  await redis.setex('fx_rates:today', 25 * 3600, JSON.stringify(cblRates));
}
```

**Rate lookup at order time:**

```typescript
async function convertCurrency(amount: Decimal, from: string, to: string): Promise<Decimal> {
  if (from === to) return amount;

  // Try cache first
  const cached = await redis.get('fx_rates:today');
  if (cached) {
    const rates = JSON.parse(cached);
    const rate = rates.find(r => r.from === from && r.to === to);
    if (rate) return amount.mul(rate.value);
  }

  // Fallback to database
  const rate = await prisma.fxRate.findFirst({
    where: { from_currency: from, to_currency: to, is_active: true },
    orderBy: { effective_date: 'desc' }
  });

  if (!rate) throw new Error(`No FX rate available for ${from}->${to}`);

  return amount.mul(rate.rate);
}
```

**Rate locking at order:**

When an order is created, the FX rate at that moment is stored in `Order.fx_rate_locked`. All subsequent calculations for this order use the locked rate, not the current rate. This protects the buyer from FX volatility between order and payout.


# 9. API Surface

## 9.1 API Architecture

Vendoora uses **tRPC for internal APIs** (web app → backend, mobile app → backend) and **REST endpoints for external integrations** (webhooks from Stripe/MoMo, third-party access in v2).

**Why tRPC for internal:**
- End-to-end type safety. Backend types automatically available in frontend without code generation.
- Auto-completion for procedure names and inputs.
- Runtime validation via Zod schemas.
- No manual API documentation maintenance.

**Why REST for webhooks:**
- External services don't speak tRPC.
- Stripe, MTN, Twilio all send standard HTTP POST.
- Easier for partners to integrate against if/when third-party APIs ship.

## 9.2 tRPC Router Structure

```typescript
// apps/web/src/server/api/root.ts
export const appRouter = router({
  // Public (no auth required)
  public: publicRouter,       // Browse products, search, view storefronts

  // Authenticated user
  user: userRouter,           // Profile, preferences, addresses
  cart: cartRouter,           // Cart operations
  order: orderRouter,         // Place orders, view history, track
  wishlist: wishlistRouter,
  notification: notificationRouter,

  // Buyer-specific
  buyer: buyerRouter,         // Buyer-only operations
  diaspora: diasporaRouter,   // Recipient management, gifts

  // Seller (requires seller role)
  seller: sellerRouter,       // Seller console operations
  product: productRouter,     // Product management
  payout: payoutRouter,       // Payout history, settings

  // Driver (requires driver role)
  driver: driverRouter,       // Queue, active delivery, earnings

  // Admin (requires admin role + permission checks per procedure)
  admin: adminRouter,
});

// Sub-router example
export const orderRouter = router({
  create: protectedProcedure
    .input(createOrderSchema)
    .mutation(async ({ input, ctx }) => {
      return await createOrder({ ...input, buyer_user_id: ctx.user.id });
    }),

  list: protectedProcedure
    .input(listOrdersSchema)
    .query(async ({ input, ctx }) => {
      return await listOrders({ ...input, user_id: ctx.user.id });
    }),

  get: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await getOrder({ orderId: input.orderId, viewer: ctx.user });
    }),

  cancel: protectedProcedure
    .input(z.object({ orderId: z.string(), reason: z.string() }))
    .use(requirePermission('order.cancel'))
    .mutation(async ({ input, ctx }) => {
      return await cancelOrder({ ...input, actor: ctx.user });
    }),
});
```

## 9.3 Permission Middleware

Every protected procedure goes through permission middleware:

```typescript
const requirePermission = (permission: string) => {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const userPermissions = await getUserPermissions(ctx.user.id);

    if (!userPermissions.has(permission)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Missing permission: ${permission}`
      });
    }

    return next({ ctx: { ...ctx, userPermissions } });
  });
};

// Usage
adminRouter.refund.authorize = adminProcedure
  .use(requirePermission('refund.authorize.under_500'))
  .input(authorizeRefundSchema)
  .mutation(async ({ input, ctx }) => {
    // If amount > 500, additional step-up check
    if (input.amount > 500) {
      await requireStepUpAuth(ctx.session);
      await requirePermission('refund.authorize.over_500')(ctx);
    }

    return await authorizeRefund({ ...input, actor: ctx.user });
  });
```

## 9.4 REST Endpoints (Webhooks Only)

```
POST /api/webhooks/stripe
  - Validates Stripe signature
  - Handles: payment_intent.succeeded, charge.refunded, charge.dispute.created
  - Idempotent via Stripe event ID

POST /api/webhooks/mtn-momo
  - Validates MTN signature (if available)
  - Handles: collection success, disbursement success/failure
  - Idempotent via X-Reference-Id

POST /api/webhooks/orange-money
  - Validates Orange signature
  - Handles: collection success, disbursement success/failure
  - Idempotent via reference ID

POST /api/webhooks/clerk
  - Validates Clerk webhook signature
  - Handles: user.created, user.updated, user.deleted, session.created

POST /api/webhooks/africastalking
  - Validates Africa's Talking signature
  - Handles: SMS delivery reports

POST /api/webhooks/resend
  - Validates Resend signature
  - Handles: email delivery, bounce, complaint
```

## 9.5 Public API (v1.1, deferred)

Per category 10 deferral (10.8 API for third-party integration), no public REST API in MVP. Architecture preserves this option:

- tRPC procedures are already typed and validated
- Adding REST endpoints later requires only an HTTP→tRPC adapter
- API key authentication scheme designed but not implemented in v1
- Rate limiting infrastructure (Redis-based) already in place for internal use

# 10. Search & Discovery

## 10.1 Search Architecture

Vendoora uses **Postgres full-text search for v1**, with Meilisearch as a planned upgrade for v1.1 if performance demands it.

**Why Postgres for v1:**
- Already in our stack, no additional service
- Sufficient for MVP scale (< 100k products)
- Built-in stemming, ranking, multilingual support
- Trigram indexing for typo tolerance
- No data sync issues — search index is the database

**When to upgrade to Meilisearch:**
- Product count > 100k
- Search queries exceed 10/sec
- Need for advanced features (faceting performance, instant-search UI)

## 10.2 Search Implementation

```sql
-- Postgres setup
ALTER TABLE products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'B')
  ) STORED;

CREATE INDEX products_search_idx ON products USING GIN (search_vector);

-- Trigram for typo tolerance
CREATE EXTENSION pg_trgm;
CREATE INDEX products_name_trgm_idx ON products USING GIN (name gin_trgm_ops);
```

**Search query:**

```typescript
async function searchProducts(query: string, filters: SearchFilters) {
  const results = await prisma.$queryRaw`
    SELECT
      p.*,
      ts_rank(p.search_vector, websearch_to_tsquery('english', ${query})) AS rank,
      similarity(p.name, ${query}) AS name_similarity
    FROM products p
    WHERE p.search_vector @@ websearch_to_tsquery('english', ${query})
      OR p.name % ${query}  -- trigram match for typos
      AND p.status = 'PUBLISHED'
      AND p.moderation_status = 'APPROVED'
      ${filters.category_id ? Prisma.sql`AND p.category_id = ${filters.category_id}` : Prisma.empty}
      ${filters.min_price ? Prisma.sql`AND p.base_price >= ${filters.min_price}` : Prisma.empty}
      ${filters.max_price ? Prisma.sql`AND p.base_price <= ${filters.max_price}` : Prisma.empty}
      ${filters.tier ? Prisma.sql`AND s.kyc_tier >= ${filters.tier}` : Prisma.empty}
    ORDER BY rank DESC, name_similarity DESC, p.promoted_score DESC
    LIMIT ${filters.limit ?? 20}
    OFFSET ${filters.offset ?? 0}
  `;

  return results;
}
```

## 10.3 Faceted Filters

Filters available on category and search pages:

- **Price range** (slider + presets: under $30, $30-$60, $60-$100, $100+)
- **Seller tier** (Tier 1+, Tier 2+, Tier 3+, Tier 4 only)
- **Delivery zone** (auto-detected from user location, manually overridable)
- **In stock** (boolean)
- **Free delivery** (boolean)
- **Has variants** (boolean — useful for shoppers wanting choices)
- **Rating** (4+, 4.5+)
- **Category-specific attributes** (color, size, material — from product.attributes JSONB)

Filter state persisted in URL as query params for shareability:
`/browse/fashion?min_price=30&max_price=60&tier=2&in_stock=true`

## 10.4 Personalized Recommendations

**Algorithm:**

For each buyer, generate recommendations from three sources:

1. **Collaborative filtering** (40% weight): "Buyers who bought X also bought Y"
2. **Content-based** (30% weight): Products similar to buyer's purchase history
3. **Popular in zone** (20% weight): Top sellers in buyer's delivery zone
4. **Editorial** (10% weight): Featured products curated by Marketing admin

**Cold-start handling** (new buyer, no purchase history):

- Default to "Popular in zone" + "Editorial featured"
- Quickly personalize as buyer views products (track in RecentlyViewed)

**Implementation:**

Recommendations computed nightly by a background worker and cached per-user in Redis with 24hr TTL. Recomputation triggered on:
- Buyer completes a purchase
- Buyer favorites a product
- Buyer views a product detail page for > 30 seconds

## 10.5 Search Ranking Signals

Products are ranked by a composite score:

```
ranking_score =
  0.40 × text_match_relevance +   // ts_rank from Postgres
  0.20 × promoted_score +          // paid placement
  0.15 × seller_tier_boost +       // higher tier = boost
  0.10 × rating_average +
  0.10 × recency_boost +           // newer = slight boost
  0.05 × order_count_normalized    // popularity
```

Promoted listings (paid placement) are clearly labeled "Promoted" in the UI. Marketplace integrity > revenue maximization.

# 11. Notification System

## 11.1 Notification Architecture

Every notification flows through a unified pipeline:

```
Event occurs (order placed, dispute opened, etc.)
  ↓
NotificationDispatcher decides:
  - Which user to notify?
  - Which channels (email, SMS, WhatsApp, push, in-app)?
  - What priority?
  - What template?
  ↓
For each channel:
  - Render template with data
  - Enqueue job in BullMQ
  ↓
Worker picks up job:
  - Send via provider (Resend, Africa's Talking, etc.)
  - Update Notification record with status
  - Retry on failure with exponential backoff
```

## 11.2 Channel Selection Rules

```typescript
function selectChannels(notification: NotificationEvent, user: User): Channel[] {
  const channels: Channel[] = [];

  // Always store in-app
  channels.push('IN_APP');

  // Email if user has email and isn't unsubscribed from this type
  if (user.email && !user.unsubscribed_types.includes(notification.type)) {
    channels.push('EMAIL');
  }

  // SMS for critical only
  const smsCritical = [
    'ORDER_DELIVERY_CODE',
    'PAYMENT_FAILED',
    'DISPUTE_RESPONSE_NEEDED',
    'SECURITY_ALERT'
  ];
  if (user.phone && smsCritical.includes(notification.type)) {
    channels.push('SMS');
  }

  // WhatsApp if user opted in (Liberia preference)
  if (user.whatsapp_opted_in && user.phone) {
    channels.push('WHATSAPP');
  }

  // Push if mobile app installed (v2)
  if (user.push_tokens?.length > 0) {
    channels.push('PUSH');
  }

  return channels;
}
```

## 11.3 Critical Notifications (Must Not Fail)

These notifications have special handling:

- **Delivery code SMS**: must arrive within 60 seconds. Falls back from Africa's Talking → Twilio → in-app push within that window.
- **Payment OTP**: same fallback chain. Critical for checkout completion.
- **Security alerts** (new device login, password change, role assignment): sent via all available channels simultaneously.

## 11.4 Notification Templates

Templates stored in `packages/i18n/src/notifications/` as React Email components for email and parameterized strings for SMS/WhatsApp/push.

```typescript
// Example: order delivered notification
export const OrderDeliveredEmail = ({ order, recipient }: Props) => (
  <Email>
    <Heading>Your order arrived!</Heading>
    <Text>Hi {recipient.name},</Text>
    <Text>
      Your order #{order.order_number} was delivered at {format(order.delivered_at, 'h:mm a')}.
    </Text>
    {order.delivery_proof_photo_url && (
      <Img src={order.delivery_proof_photo_url} alt="Delivery proof" />
    )}
    <Button href={`${baseUrl}/orders/${order.id}`}>View order</Button>
  </Email>
);

// SMS template
export const orderDeliveredSms = (order: Order) =>
  `Vendoora: Your order #${order.order_number} was delivered. View: ${shortUrl(`/o/${order.id}`)}`;
```

# 12. Driver Logistics Engine

## 12.1 Dispatch Algorithm

When a new order is paid, it enters the dispatch queue. The algorithm assigns it to a driver:

```
1. Find all available drivers in or near the pickup zone:
   - is_online = true
   - active_delivery_count < max_concurrent_deliveries
   - Distance from pickup < 5km (configurable)
   - Driver has accepted similar deliveries before (vehicle type compatible)

2. Rank candidates by composite score:
   - 40% closest to pickup
   - 30% driver rating
   - 20% on-time rate
   - 10% acceptance rate (avoid drivers who accept then cancel)

3. Send offer to top-ranked driver:
   - Driver has 60 seconds to accept
   - If accepted, move to ACCEPTED_BY_DRIVER
   - If declined or timeout, offer to next driver

4. If no driver accepts within 5 minutes:
   - Increase pickup radius
   - Add small surge bonus
   - Re-offer

5. If still no driver after 15 minutes:
   - Alert Operations admin
   - Notify seller of delay
   - Continue trying with increased radius/surge
```

## 12.2 Real-Time Location Tracking

When a delivery is in EN_ROUTE_TO_DROPOFF state:

- Driver app posts location every 30 seconds to a WebSocket channel
- Backend updates `driver.current_location_lat/lng` and broadcasts to subscribers
- Buyer's order tracking page subscribes to the channel and updates the map

**Privacy:**
- Location tracking only active during a delivery
- Location data older than 24 hours is purged from operational store
- Aggregated location heatmaps preserved for Operations admin analytics

## 12.3 Multi-Stop Optimization

When a driver has multiple deliveries queued, route optimization computes the optimal order:

```typescript
async function optimizeRoute(driver: Driver, deliveries: Delivery[]) {
  // Use Google Maps Distance Matrix or self-hosted OSRM
  const distances = await computeDistanceMatrix(
    [driver.current_location, ...deliveries.flatMap(d => [d.pickup, d.dropoff])]
  );

  // Solve as a constrained TSP: pickups before dropoffs for each delivery
  const optimal = solveTSPWithPrecedence(distances, deliveries);

  return optimal;
}
```

Refresh on:
- New delivery accepted
- Delivery completed
- Significant location deviation from planned route

## 12.4 Driver Tier Promotion

Tiers update nightly via background job:

```typescript
function computeDriverTier(driver: Driver): DriverTier {
  if (driver.total_deliveries >= 1000 && driver.rating_average >= 4.9) return 'ELITE';
  if (driver.total_deliveries >= 500 && driver.rating_average >= 4.7) return 'PRO';
  if (driver.total_deliveries >= 100 && driver.rating_average >= 4.5) return 'EXPERIENCED';
  return 'STANDARD';
}
```

Tier impacts:
- Priority in dispatch (higher tier = first offer)
- Eligibility for high-value deliveries (orders > $200 prefer EXPERIENCED+)
- Earnings (tier-based delivery fee multipliers)
- Featured driver badge in buyer UI

# 13. Admin Panel Architecture

## 13.1 Admin Surfaces

The admin panel is a single Next.js route subtree under `/admin/*` with permission-gated sub-routes:

```
/admin/dashboard               (superadmin + analytics_admin)
/admin/users                   (superadmin + ts_admin + support_admin)
/admin/users/[id]              (varies by permission)
/admin/sellers                 (superadmin + ts_admin + catalog_admin)
/admin/sellers/kyc-queue       (ts_admin)
/admin/products                (superadmin + catalog_admin + ts_admin)
/admin/products/moderation     (ts_admin)
/admin/orders                  (superadmin + ts_admin + support_admin)
/admin/disputes                (ts_admin)
/admin/disputes/[id]           (ts_admin)
/admin/escrow                  (finance_admin)
/admin/payments                (finance_admin)
/admin/refunds                 (finance_admin)
/admin/payouts                 (finance_admin)
/admin/reconciliation          (finance_admin)
/admin/drivers                 (operations_admin)
/admin/drivers/fleet           (operations_admin)
/admin/delivery-zones          (operations_admin)
/admin/categories              (catalog_admin)
/admin/promo-codes             (marketing_admin)
/admin/bundles                 (marketing_admin)
/admin/email-campaigns         (marketing_admin)
/admin/feature-flags           (superadmin)
/admin/audit-log               (superadmin)
/admin/roles                   (superadmin)
/admin/permissions             (superadmin — read only)
/admin/platform-config         (superadmin)
/admin/support-tickets         (support_admin)
/admin/analytics               (all admin roles, scoped data)

// Added in MVP expansion (May 2026):

// Trust Case Management (unified trust ops)
/admin/trust/cases             (ts_admin + superadmin)
/admin/trust/cases/[id]        (ts_admin + superadmin)
/admin/trust/workload          (ts_admin + superadmin — workload board)
/admin/trust/urgent            (ts_admin + superadmin — critical cases panel)
/admin/trust/unassigned        (ts_admin + superadmin — unassigned cases panel)
/admin/trust/my-assigned       (assigned T&S staff)
/admin/trust/follow-ups        (ts_admin + superadmin)

// KYC Center (expanded)
/admin/kyc/queue               (ts_admin — pending review)
/admin/kyc/needs-info          (ts_admin — applications waiting on docs)
/admin/kyc/stale               (ts_admin — 14+ days no action)
/admin/kyc/not-started         (ts_admin + marketing_admin — reminder targets)
/admin/kyc/completed           (ts_admin + analytics_admin)
/admin/kyc/reminders           (ts_admin — bulk reminder management)

// Profile Change Request Queues
/admin/profile-changes         (ts_admin — pending standard changes)
/admin/profile-changes/sensitive (superadmin — bank/MoMo/legal name changes)
/admin/profile-changes/[id]    (assigned reviewer)

// Review Moderation
/admin/reviews                 (ts_admin + support_admin — all reviews)
/admin/reviews/reports         (ts_admin — reported reviews queue)
/admin/reviews/hidden          (ts_admin — admin-hidden reviews)

// System Operations
/admin/webhooks                (superadmin + operations_admin)
/admin/webhooks/[id]           (superadmin + operations_admin)
/admin/outbox                  (superadmin + operations_admin)
/admin/outbox/dead-letter      (superadmin + operations_admin)
/admin/system-readiness        (superadmin + operations_admin)
/admin/maintenance-mode        (superadmin)

// Monetization Expansion
/admin/promoted-listings       (marketing_admin — paid placement queue)
/admin/featured-vendors        (marketing_admin — featured vendor slots)
/admin/promoted-posts          (marketing_admin — promoted social-style posts)
/admin/monetization            (superadmin + marketing_admin — pricing dashboard)
/admin/subscriptions           (finance_admin — subscription review queue)
/admin/subscription-tiers      (superadmin — CRUD SaaS tier definitions)

// Logistics Tower (unified)
/admin/logistics               (operations_admin + superadmin)
/admin/logistics/active-routes (operations_admin)
/admin/logistics/driver-workload (operations_admin)
/admin/logistics/fee-config    (operations_admin + superadmin)
```

## 13.2 Role-Based Navigation

The admin sidebar dynamically renders based on the user's permissions:

```typescript
function buildAdminNav(user: User, permissions: Set<string>): NavItem[] {
  const nav: NavItem[] = [];

  if (permissions.has('user.read')) {
    nav.push({ label: 'Users', href: '/admin/users', icon: 'users' });
  }
  if (permissions.has('seller.kyc.review')) {
    nav.push({ label: 'KYC Queue', href: '/admin/sellers/kyc-queue', icon: 'shield-check' });
  }
  if (permissions.has('dispute.read.all')) {
    nav.push({
      label: 'Disputes',
      href: '/admin/disputes',
      icon: 'alert-circle',
      badge: await countOpenDisputes(),
    });
  }
  // ... etc

  return nav;
}
```

## 13.3 Audit Log Viewer

Available only to superadmin. The audit log is the most sensitive admin surface:

- Search by actor user, target user, action, resource, date range
- Export to CSV for compliance/regulatory requests
- View detailed before/after state diffs
- Cannot be modified — interface enforces read-only

## 13.4 Custom Role Creation UI

Superadmin can create custom roles by composing existing permissions:

```
1. Navigate to /admin/roles → "Create Role"
2. Enter role name + description
3. Select permissions from grouped list:
   - Auth category (15 permissions)
   - User category (12 permissions)
   - Seller category (18 permissions)
   - ... etc
4. Preview: "This role will be able to: [bulleted list of permissions]"
5. Save: requires step-up auth
6. Role appears in role management UI, can be assigned to users
```

# 14. Diaspora-Specific Features

## 14.1 Diaspora User Detection

A user is treated as "diaspora" when:
- They register with a non-Liberian phone country code, OR
- They self-identify as diaspora during signup, OR
- They're making an order with a Liberian recipient but billing to non-Liberian card

The diaspora flag affects:
- Currency display (USD primary, LRD equivalent)
- Payment methods shown (Stripe cards prioritized)
- Recipient picker shown at checkout
- Gift bundle marketing surfaces
- Tax calculation rules

## 14.2 Recipient Management

```typescript
// Recipient address book
const recipients = await trpc.diaspora.recipient.list();

// Add new recipient
await trpc.diaspora.recipient.create({
  name: 'Mama Florence',
  relationship: 'Mother',
  phone: '+231 77 555 2914',
  address_line1: '14th Street, Sinkor',
  city: 'Monrovia',
  county: 'Montserrado',
  landmark: 'Across from Stop & Shop',
});

// Recipient selected at checkout, populates delivery details
```

## 14.3 Cultural Gift Bundles

Bundles are curated collections sold as a unit:

```
Bundle: "Mama's Monthly Essentials"
Contents:
  - 2× Palm butter, frozen (1kg each)
  - 1× Country pepper sauce
  - 1× Handwoven headwrap
  - 1× Personal care basket
Price: $89 USD
Customizable: yes (recipient can substitute headwrap color)
```

Implementation: `GiftBundle` model with `BundleItem` join table. Order created from bundle gets bundle metadata in Order.metadata.

## 14.4 Group Gifting Flow

```
1. Initiator creates group gift:
   - Selects recipient or bundle
   - Sets target amount and deadline
   - Invites contributors (email, link, social)

2. Each contributor:
   - Opens invite link → /gift/{group_gift_code}
   - Chooses contribution amount
   - Pays via Stripe (their payment held in group escrow)
   - Optional message to recipient

3. When target reached or deadline arrives:
   - If target reached: order placed automatically with combined funds
   - If deadline passed without target: all contributors auto-refunded

4. Recipient receives:
   - Single delivery with combined gift
   - Card listing all contributors and messages
```

## 14.5 Scheduled & Recurring Gifts

Two types:

**ONE_TIME scheduled**: "Send a gift to mom on her birthday May 28th."
- ScheduledGift record with `fire_date`
- Worker fires the order at fire_date - 48 hours (so it arrives on the day)

**RECURRING**: "Send monthly essentials to mom on the 15th of every month."
- ScheduledGift record with `recurrence_rule` (RRULE format)
- Worker computes next_fire_at after each successful fire
- Continues until cancelled or payment method fails

**Failure handling:**
- Payment method declined: pause schedule, notify sender, prompt to update
- Recipient address invalid: same flow
- Product out of stock: try substitution, fallback to "send a note instead"

## 14.6 Voice Message Attached to Gift

Unique feature: sender records a 30-second voice message that the recipient can play.

**Flow:**
1. Sender records audio in browser (Web Audio API) at order time
2. Audio uploaded to Cloudflare R2 as MP3
3. Order includes `voice_message_url` field
4. Recipient receives SMS with a tel-link or short URL
5. When clicked: plays the audio (no Vendoora account needed for recipient)

**Privacy:**
- Audio URL contains an unguessable token
- Audio expires 90 days after delivery
- Recipient never sees Vendoora platform unless they opt in


# 15. Background Jobs & Async Work

## 15.1 Job Architecture

All async work runs through BullMQ on Redis with workers hosted on Railway. The worker process is a separate Node.js application (`apps/worker/`) that:

- Connects to the same Redis instance as the web app
- Subscribes to all configured queues
- Processes jobs with retry logic
- Reports metrics to PostHog and errors to Sentry

## 15.2 Job Catalog

| Queue | Purpose | Frequency | Concurrency | Retry Policy |
|-------|---------|-----------|-------------|--------------|
| `email-transactional` | Order confirmations, OTPs | On-demand | 10 | 5 attempts, exp backoff |
| `email-marketing` | Drip campaigns, broadcasts | On-demand | 5 | 3 attempts |
| `sms-critical` | Delivery codes, OTPs | On-demand | 20 | 5 attempts, fast retry |
| `sms-transactional` | Order updates | On-demand | 10 | 3 attempts |
| `whatsapp-message` | WhatsApp notifications | On-demand | 5 | 3 attempts |
| `push-notification` | Mobile push (v2) | On-demand | 20 | 2 attempts |
| `payment-webhook` | Process payment provider webhooks | On-demand | 5 | 5 attempts |
| `payment-poll-momo` | Poll MTN/Orange for status | Every 5s during active | 1 per payment | continue until terminal |
| `payout-execute` | Initiate seller/driver payouts | On-demand | 3 | 3 attempts, manual escalation |
| `payout-poll` | Check payout status | Every 30s during active | 1 per payout | continue until terminal |
| `escrow-auto-release` | Auto-release 24hr post-delivery | Every 5min cron | 1 | 3 attempts |
| `dispute-sla-check` | SLA warnings and escalations | Every 15min cron | 1 | 1 attempt |
| `scheduled-gift-fire` | Fire scheduled gift orders | Every 1hr cron | 1 | 3 attempts |
| `group-gift-deadline-check` | Check group gift deadlines | Every 1hr cron | 1 | 1 attempt |
| `fraud-detection-scan` | Background fraud rule evaluation | On-demand + nightly | 3 | 1 attempt |
| `fx-rate-fetch` | Fetch daily FX rates from CBL | Daily at 06:00 UTC | 1 | 5 attempts |
| `recommendation-compute` | Compute personalized recommendations | Nightly + on event | 1 | 1 attempt |
| `analytics-aggregate` | Roll up daily metrics | Nightly at 02:00 UTC | 1 | 3 attempts |
| `audit-log-archive` | Move 1yr+ logs to cold storage | Weekly | 1 | 3 attempts |
| `inventory-low-alert` | Notify sellers of low stock | Every 6hr cron | 1 | 1 attempt |
| `clerk-sync` | Sync user changes from Clerk webhook | On-demand | 5 | 5 attempts |
| `image-process` | Generate thumbnails, optimize | On-demand | 5 | 3 attempts |
| `tax-calculate` | Quarterly tax computation | Quarterly | 1 | 3 attempts |
| `driver-tier-update` | Recompute driver tiers | Nightly | 1 | 1 attempt |
| `seller-kpi-update` | Recompute seller KPIs | Nightly | 1 | 1 attempt |
| `recently-viewed-cleanup` | Trim old recently viewed records | Daily | 1 | 1 attempt |
| `cart-abandonment` | Send cart abandonment emails | Every 6hr | 5 | 1 attempt |
| `subscription-renewal` | Renew seller SaaS subscriptions | Daily at 00:00 UTC | 5 | 3 attempts |

## 15.3 Dead Letter Queue

Jobs that fail all retries land in a dead letter queue. The dead letter queue:

- Persists failed jobs for 30 days
- Sends alerts to Operations admin for review
- Allows manual retry via admin UI
- Captures full job context (input, attempts, errors) for debugging

Critical jobs (payouts, escrow releases) bypass standard DLQ and immediately alert Finance/Operations admins.

# 16. Observability & Monitoring

## 16.1 Logging

**Structured logs** via Better Stack (Logtail):

```typescript
import { logger } from '@vendoora/logger';

logger.info('Order created', {
  order_id: order.id,
  buyer_user_id: order.buyer_user_id,
  amount: order.total_amount,
  currency: order.currency,
  buyer_type: order.buyer_type,
});

logger.error('Payment failed', {
  order_id: order.id,
  provider: 'mtn_momo',
  error_code: error.code,
  error_message: error.message,
});
```

Log levels: `debug`, `info`, `warn`, `error`, `fatal`.

PII redaction at the logger layer: full credit card numbers, raw passwords, raw OTP codes, full email/phone bodies are automatically redacted before sending to log aggregator.

## 16.2 Metrics

**Application metrics tracked:**

- Request rate per endpoint
- p50/p95/p99 latency per endpoint
- Error rate per endpoint
- Database query duration (slow query alerts at >500ms)
- Redis operation duration
- Job queue depth per queue
- Job processing duration per job type

**Business metrics tracked (PostHog):**

- Orders placed per hour
- GMV per hour
- Conversion rate (cart → checkout → paid)
- Abandonment rate at each checkout step
- Dispute rate (disputes/orders)
- Dispute resolution time (open → resolved)
- Driver acceptance rate
- Driver on-time rate
- Average delivery time per zone
- Seller payout success rate

## 16.3 Errors

All errors flow to Sentry with:

- Stack traces with source maps
- User context (user_id, role, plan)
- Request context (URL, method, IP)
- Release tagging (matches Vercel deployment)
- Breadcrumbs (last 50 events before error)

Alert thresholds:
- Any error in critical paths (payment, escrow, dispute resolution): immediate alert
- Error rate >5% over 5min: immediate alert
- New error type not seen before: alert within 1hr

## 16.4 Uptime Monitoring

Better Stack runs synthetic checks every 60 seconds on:

- Homepage (public unauthenticated)
- Login page
- Product detail page (cached one)
- API health endpoint
- Checkout flow (synthetic test buyer)

Multi-region checks: US-East, EU-West, Africa (Cape Town if available).

Status page at `status.vendoora.com` shows current state to public.

## 16.5 Tracing

Distributed tracing via OpenTelemetry (when scale demands):

- Trace ID propagates through HTTP headers
- Spans cover: HTTP request → tRPC procedure → database queries → external API calls
- Sampling: 1% of all requests, 100% of errors

# 17. Security Posture

## 17.1 Threat Model

**In-scope threats:**

- Account takeover (credential stuffing, password reuse, phishing)
- Payment fraud (stolen cards, fraudulent buyers, fraudulent sellers)
- Data exfiltration (mass scraping, unauthorized access to other users' data)
- SQL injection, XSS, CSRF
- API abuse (rate limiting bypass, scraping)
- Privilege escalation (buyer accessing seller data, seller accessing admin)
- Webhook spoofing (fake Stripe/MoMo webhooks)
- Session hijacking
- Audit log tampering

**Out-of-scope (accepted risk):**

- Physical security of data center (Vercel/Neon/Upstash responsibility)
- Nation-state actors (not a realistic threat for MVP)
- Insider threats (mitigated by audit log, no developer access to production data)

## 17.2 Security Controls

**At the edge (Vercel/Cloudflare):**

- DDoS protection (Cloudflare automatic)
- Bot detection
- Rate limiting (per IP, per user)
- TLS 1.3 only, HSTS enabled
- Content Security Policy headers
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: max-age=31536000

**At the application:**

- Input validation via Zod schemas (every API input)
- Output encoding (React auto-escapes by default)
- Parameterized queries only (Prisma enforces this)
- CSRF tokens on state-changing operations
- Session token rotation on privilege change
- Webhook signature validation (Stripe, Clerk, etc.)
- Idempotency keys on financial operations

**At the database:**

- Row-level security policies
- Encrypted at rest (Neon default)
- Encrypted in transit (TLS)
- Backup encryption
- No direct production access for engineers (only via approved procedures)

**For secrets:**

- Doppler stores all secrets
- Never in code, never in env files committed to git
- Rotation policy: quarterly for sensitive (payment APIs), annually for less sensitive

## 17.3 Penetration Testing

- Annual third-party pen test (mandatory for fintech)
- Quarterly internal security review
- Bug bounty program in v1.1

## 17.4 Compliance

**PCI-DSS:**
- SAQ-A compliance posture
- Stripe handles cardholder data environment
- Quarterly vulnerability scans by Stripe-approved scanner

**GDPR (for diaspora users in EU):**
- Data export endpoint
- Data deletion endpoint
- Cookie consent banner
- Privacy policy
- Lawful basis documented (legitimate interest + consent)

**Liberian regulations:**
- CBL reporting on payment volumes (monthly)
- LTA reporting on mobile money flows
- LRA tax filings (quarterly)
- KYC documentation per CBL guidelines for sellers Tier 2+

**SOC 2:**
- Not required for MVP
- Architectural decisions designed for future certification
- Audit log + access controls + change management already aligned

# 18. Performance Targets

## 18.1 User-Perceived Performance

**Page load (Largest Contentful Paint, LCP):**

| Surface | Target | Hard limit |
|---------|--------|------------|
| Homepage (US/EU) | < 1.5s | < 2.5s |
| Homepage (Liberia) | < 3s | < 5s |
| Product detail (cached, ISR) | < 1s | < 2s |
| Search results | < 2s | < 4s |
| Checkout step | < 1.5s | < 3s |
| Order tracking (live) | < 2s | < 4s |
| Seller console dashboard | < 2s | < 4s |
| Admin panel | < 2s | < 4s |

**Interaction latency (Interaction to Next Paint, INP):**

- All interactions < 200ms
- Hard limit < 500ms

## 18.2 Backend Performance

**API response times (p95):**

| Endpoint type | Target |
|---------------|--------|
| Public read (cached) | < 100ms |
| Public read (database) | < 300ms |
| Authenticated read | < 400ms |
| Authenticated write | < 600ms |
| Search query | < 500ms |
| Admin operation | < 800ms |

**Database query targets:**

- p95 query latency < 50ms
- No single query > 500ms (slow query alert)
- No N+1 queries (caught by Prisma query logging)

## 18.3 Scalability Targets (MVP)

The system should handle without degradation:

- 10,000 concurrent users
- 100 orders per minute
- 50 dispute messages per minute
- 500 search queries per minute
- 1,000 product views per minute

Beyond these, horizontal scaling via Vercel auto-scaling for web + Railway scaling for workers. Postgres on Neon scales vertically; if vertical maxes out, partition by tenant or move analytics to warehouse.

# 19. Internationalization

## 19.1 Languages

**MVP:**

- English (primary, 100% coverage)

**v1.1:**

- Liberian English idioms (extension of English locale)
- French (for French-speaking diaspora and West African neighbors)

**v2:**

- Vai, Kpelle, other Liberian languages (deferred per scope decision)

## 19.2 Implementation

`packages/i18n/` exports translated strings:

```typescript
import { t } from '@vendoora/i18n';

t('order.delivered.title');  // "Your order arrived!"
t('order.delivered.body', { orderNumber: 'VDR-48291' });  // "Your order #VDR-48291 was delivered."
```

Translation files structured by domain:

```
packages/i18n/src/
├── locales/
│   ├── en.ts
│   ├── fr.ts  (v1.1)
│   └── lr.ts  (Liberian English, v1.1)
└── index.ts
```

## 19.3 Currency Formatting

Per user preference:

```typescript
formatCurrency(173.50, 'USD');  // "$173.50"
formatCurrency(38830, 'LRD');   // "L$38,830"
formatCurrency(173.50, 'USD', { showSecondary: 'LRD' });  // "$173.50 (L$38,830)"
```

## 19.4 Date/Time Formatting

Use native `Intl.DateTimeFormat` with user's timezone:

```typescript
formatDateTime(order.delivered_at, user.timezone);
// "May 23, 2026 at 9:47 AM LRT"
```

## 19.5 Number Formatting

```typescript
formatNumber(1234567);  // "1,234,567"
formatPercent(0.0825);  // "8.25%"
```

# 20. Integration Contracts

## 20.1 Stripe Webhook Contract

**Endpoint:** `POST /api/webhooks/stripe`

**Verification:** `Stripe-Signature` header validated against `STRIPE_WEBHOOK_SECRET`.

**Events handled:**

```
payment_intent.created
payment_intent.succeeded         → process payment success
payment_intent.payment_failed    → process payment failure
payment_intent.canceled
charge.succeeded
charge.refunded                  → process refund completion
charge.dispute.created           → flag potential chargeback
charge.dispute.closed
account.updated                  (v2 — for direct seller accounts)
```

**Idempotency:** Stripe event ID stored in `processed_webhooks` table. Duplicate events ignored.

## 20.2 MTN MoMo API Contract

**Base URL:** `https://sandbox.momodeveloper.mtn.com` (dev) / `https://momodeveloper.mtn.com` (prod)

**Auth:** API key + subscription key in headers.

**Endpoints used:**

```
POST /collection/v1_0/requesttopay      → initiate payment
GET  /collection/v1_0/requesttopay/{id} → check payment status
POST /disbursement/v1_0/transfer        → send payout
GET  /disbursement/v1_0/transfer/{id}   → check payout status
GET  /collection/v1_0/account/balance   → check our collection balance
GET  /disbursement/v1_0/account/balance → check our disbursement balance
```

**Retry strategy:** Exponential backoff, max 5 retries.

## 20.3 Orange Money API Contract

Similar to MTN MoMo with different endpoint paths and auth scheme.

## 20.4 Clerk Webhook Contract

**Endpoint:** `POST /api/webhooks/clerk`

**Verification:** Svix signature header validated against `CLERK_WEBHOOK_SECRET`.

**Events handled:**

```
user.created                  → create User record in Vendoora DB
user.updated                  → sync changes
user.deleted                  → soft-delete in Vendoora
session.created               → log session for audit
session.ended                 → log session end
```

## 20.5 Africa's Talking API Contract

**Base URL:** `https://api.africastalking.com/version1`

**Endpoints used:**

```
POST /messaging                → send SMS
POST /sms/bulk                 → bulk send (for marketing)
POST /sms/delivery-report      → webhook for delivery confirmations
```

## 20.6 Twilio API Contract

**Base URL:** `https://api.twilio.com/2010-04-01`

Used as fallback to Africa's Talking and for diaspora SMS.

## 20.7 Resend API Contract

**Base URL:** `https://api.resend.com`

```
POST /emails                   → send email
GET  /emails/{id}              → check delivery status
POST /webhooks (Resend webhook) → delivery, bounce, complaint events
```

## 20.8 Cloudflare R2 API Contract

S3-compatible. Use AWS SDK with R2 endpoint.

```
PutObject     → upload file
GetObject     → download file
DeleteObject  → remove file
ListObjects   → list bucket contents
```

## 20.9 Cloudflare Images API Contract

```
POST /accounts/{account_id}/images/v1                  → upload image
GET  /cdn-cgi/imagedelivery/{account_hash}/{image_id}/{variant} → serve transformed image
```

Variants pre-defined: `thumbnail` (200×200), `card` (400×400), `hero` (1200×800), `full` (original).

## 20.10 PostHog API Contract

JS SDK for client-side tracking + server-side capture for backend events:

```typescript
import { posthog } from '@vendoora/posthog';

posthog.capture({
  distinctId: user.id,
  event: 'order_placed',
  properties: {
    order_id: order.id,
    amount: order.total_amount,
    currency: order.currency,
    buyer_type: order.buyer_type,
  }
});
```

---

# Document Status

**Version 1.0** — Initial specification, locked May 2026.

This document defines what gets built. For *how* to build it (methodology, conventions, review gates), see `Build_Prompt.md`. For *when* things get built (phasing, sequencing), see `Phased_Build_Playbook.md`.

**Change control:** Modifications to this document require:
1. Architectural Decision Record (ADR) in `docs/decisions/`
2. Founder approval
3. Version bump (1.0 → 1.1 for additions, 2.0 for breaking changes)
4. Update propagated to dependent documents

**End of Engineering_Spec.md**
