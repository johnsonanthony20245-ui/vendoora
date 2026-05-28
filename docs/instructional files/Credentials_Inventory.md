# Vendoora — Credentials & Secrets Inventory

**Purpose:** Every external service in the Vendoora stack, what credential it needs, whether it's needed now (sandbox) or later (production), and where to get it. This turns the directive's stop-and-flag blockers (Build_Fidelity_Directive.md §5) into one upfront task instead of a stream of mid-build interruptions.

**How to use:** Work top-down. Get every "Phase" item before that phase's build session. Sandbox/test credentials are enough to build and test for real — production keys are gated behind launch (see Build_Fidelity_Directive.md §6).

**Secret storage:** All secrets live in **Doppler** (per the locked stack). Never commit a secret to the repo, never paste a production key into a chat. The build references secrets by name (e.g. `STRIPE_SECRET_KEY`), never by value.

---

## Legend

- **Needed by** — the earliest phase that needs this to build for real.
- **Sandbox now** — a test credential is enough to build + test the real code path today.
- **Prod later** — production credential only needed before the pilot/launch; gate it behind stop-and-flag.

---

## 1. Foundation & infrastructure (Phase 1)

| Service | Secret(s) | Needed by | Sandbox now / Prod later | Where to get it |
|---|---|---|---|---|
| **Neon Postgres** | `DATABASE_URL`, `DIRECT_URL` | P1 | Both (free tier for dev) | neon.tech → create project → connection string |
| **Upstash Redis** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | P1 | Both (free tier for dev) | upstash.com → create Redis DB |
| **Clerk** (auth) | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` | P1 | Both (dev instance now) | clerk.com → create app → API keys |
| **Doppler** (secrets) | Doppler service token | P1 | Both | doppler.com → project → service token |
| **Vercel** (web host) | Vercel token, project linked | P1 | Both | vercel.com → account settings → tokens |
| **Cloudflare R2 + Images** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, Images token | P2 (product photos) | Both | dash.cloudflare.com → R2 → create bucket + API token |

---

## 2. The trust mechanic — payments & SMS (Phase 3, the critical path)

These power escrow, the 6-digit code, and money movement. They are the non-negotiable hard parts (Build_Fidelity_Directive.md §2.4). **Build against sandbox now; gate production keys behind stop-and-flag.**

| Service | Secret(s) | Needed by | Sandbox now / Prod later | Where to get it |
|---|---|---|---|---|
| **Stripe Connect** (USD / diaspora) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, Connect client ID | P3 | Sandbox now (test mode keys), Prod later | dashboard.stripe.com → test mode → API keys; enable Connect |
| **MTN MoMo** (primary local) | API user ID, API key, subscription key, target environment | P3 | Sandbox now, Prod later | momodeveloper.mtn.com → subscribe to Collections + Disbursements products |
| **Orange Money** (secondary local) | client ID, client secret, merchant key | P3 | Sandbox now, Prod later | developer.orange.com (Orange Money API) → may require Liberia-specific onboarding |
| **Africa's Talking** (SMS — primary) | `AT_USERNAME`, `AT_API_KEY`, sender ID/shortcode | P3 (code delivery) | Sandbox now (sandbox app), Prod later | africastalking.com → create app → API key; request alphanumeric sender ID for Liberia |
| **Twilio** (SMS — fallback) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, messaging service SID | P3 | Trial now, Prod later | twilio.com → console → account SID + auth token |

> **Heads-up on the local rails:** MTN MoMo and Orange Money sandbox access for Liberia may require business verification and can take days to weeks. Start these applications *now*, even before P3, because they're the longest lead-time items and the most likely to block the trust mechanic. This is the #1 thing to get moving early.

---

## 3. Notifications & engagement (Phase 4–5)

| Service | Secret(s) | Needed by | Sandbox now / Prod later | Where to get it |
|---|---|---|---|---|
| **Firebase Cloud Messaging** (push) | service account JSON, web push key | P4 | Both (dev project) | console.firebase.google.com → project settings → service accounts |
| **Resend** (transactional email) | `RESEND_API_KEY`, verified domain | P4 (receipts) | Sandbox now, Prod later (domain verify) | resend.com → API keys; verify sending domain |
| **Loops** (marketing email) | `LOOPS_API_KEY` | P5 (diaspora campaigns) | Sandbox now | loops.so → API keys |

---

## 4. Background jobs, observability, analytics (Phase 1 setup, used throughout)

| Service | Secret(s) | Needed by | Sandbox now / Prod later | Where to get it |
|---|---|---|---|---|
| **Railway** (BullMQ workers) | Railway token, Redis URL for queues | P1 | Both | railway.app → project → tokens |
| **Sentry** (errors) | `SENTRY_DSN`, auth token | P1 | Both (free tier) | sentry.io → create project → DSN |
| **Better Stack** (uptime/logs) | source token | P1 | Both | betterstack.com → sources |
| **PostHog** (product analytics) | `POSTHOG_KEY`, host | P2 | Both (free tier) | posthog.com → project API key |

---

## 5. Liberia-specific data (Phase 2+)

| Service | Secret(s) | Needed by | Sandbox now / Prod later | Where to get it |
|---|---|---|---|---|
| **CBL exchange rate** (USD↔LRD) | API key *or* manual fallback | P2 (audience pricing) | See note | Central Bank of Liberia — if no public API exists, use a manual daily-updated rate config (the directive allows this; do not hardcode silently) |

> **CBL note:** the prototype hardcodes `1 USD = 180 LRD`. For the live build, if CBL has no public rate API, the honest non-stub approach is an admin-editable rate config refreshed daily (already surfaced in the prototype's admin config screen) — NOT a hardcoded constant. If you want a third-party FX source instead, flag it and we'll pick one.

---

## 6. Trademark / legal (not a build credential, but launch-blocking)

| Item | Status | Needed by |
|---|---|---|
| Vendoora trademark | Pending (per project record) | Before public launch (P8), not before build |
| NLA / regulatory posture for any game mechanic | Confirm before P-relevant work | Whichever phase touches Instant Pool / skill-gated features |

---

## 7. Pre-build action list (do these before the build needs them)

In priority order, because of lead times:

1. **Start MTN MoMo + Orange Money sandbox applications TODAY.** Longest lead time, blocks the trust mechanic (P3). Everything else is fast by comparison.
2. **Set up Doppler** and decide the project/environment structure (dev / staging / prod). Everything else flows through it.
3. **Create the Phase 1 accounts** (Neon, Upstash, Clerk, Vercel, Railway, Sentry) — all instant, all free-tier-friendly.
4. **Stripe test mode keys** — instant, needed for P3.
5. **Africa's Talking sandbox + sender ID request** — sandbox instant; sender ID approval for Liberia takes time, so request early.
6. **Cloudflare R2 bucket** — instant, needed for P2 product photos.
7. **Decide the CBL rate strategy** (admin-editable config vs. third-party FX) before P2.

---

## 8. The rule that ties this to the directive

Per Build_Fidelity_Directive.md §6: **sandbox-against-real-integration-code is functional and acceptable.** You build the complete, real integration (adapters, API calls, webhook handlers, idempotency, error handling, tests) and run it against sandbox. Only when production keys are the single remaining gap do you stop-and-flag for them (§5). At no point do you fake success without integration code — that's a forbidden stub.

So: get the sandbox credentials above, build everything for real against them, and the only thing left at launch is swapping sandbox keys for production keys in Doppler.
