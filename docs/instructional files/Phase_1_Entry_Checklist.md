# Vendoora — Phase 1 Build: Entry Checklist & Session Plan

**Purpose:** The operational pre-flight for the very first real Claude Code build sessions. The `Phased_Build_Playbook.md` §3.2 entry gates tell you *what must be true* before Phase 1; this document tells you *exactly what to have on disk and in your accounts before you paste the kickoff snippet*, and *how to break the 8-week Foundation phase into individual Claude Code sessions* so it gets built for real, not stubbed.

**Read alongside:** `Build_Fidelity_Directive.md` (how to build), `Session_Kickoff.md` (how to start each session), `Credentials_Inventory.md` (what secrets), `Phased_Build_Playbook.md` §3 (the canonical P1 scope, entry gates, exit gates).

**Important:** Phase 1 is the one phase where most work is genuinely *scaffolding* — monorepo, schema, auth wiring, CI/CD. Some of it legitimately has no "user-facing functional feature" to test end-to-end, because there are no features yet. The fidelity directive still applies: no fake data, no dead controls, no TODO-in-place-of-logic. But the "passing end-to-end test" requirement in §3.2 of the directive is satisfied here by **infrastructure tests** (a real signup creates a real DB row; `user.can()` returns real results from real seeded permissions) rather than feature-flow tests. The exit gates in the playbook §3.3 ARE the end-to-end proofs for Phase 1.

---

## Part A — Entry checklist (do all of this BEFORE the first session)

### A1. Documents in the project

The Claude Code project must have these files available, all final:

- [ ] `Build_Fidelity_Directive.md`
- [ ] `Build_Prompt.md`
- [ ] `Engineering_Spec.md`
- [ ] `Phased_Build_Playbook.md`
- [ ] `Vendoora_App.html` (the prototype — the binding visual reference)
- [ ] `Session_Kickoff.md` (so you can copy the snippet)
- [ ] `Credentials_Inventory.md`
- [ ] `Polish_Phase_Addendum.md` (v1.3 — the additive features)

### A2. Accounts created (instant ones — do these now)

Per `Credentials_Inventory.md` §1 and §4. All free-tier-friendly, all instant:

- [ ] Neon (Postgres) — project created, `DATABASE_URL` + `DIRECT_URL` in hand
- [ ] Upstash (Redis) — DB created, REST URL + token in hand
- [ ] Clerk — dev instance, publishable + secret + webhook secret in hand
- [ ] Doppler — project created with dev/staging/prod environments, service token in hand
- [ ] Vercel — account + token, ready to link the repo
- [ ] Railway — project + token (for the worker / BullMQ)
- [ ] Sentry — project created, DSN in hand
- [ ] Better Stack — source token in hand
- [ ] PostHog — project API key in hand
- [ ] Cloudflare — R2 bucket + API token (needed end of P1 / start of P2, fine to do now)
- [ ] GitHub — empty repo created, you have push access + can set branch protection

### A3. Secrets loaded into Doppler

- [ ] Every credential from A2 is stored in Doppler under the **dev** environment, by name (e.g. `DATABASE_URL`, `CLERK_SECRET_KEY`). Nothing is in a `.env` file committed to the repo.
- [ ] You know how Claude Code will read them locally (Doppler CLI `doppler run --` wrapper, per the locked stack).

### A4. Long-lead-time items STARTED (won't block P1, but start now)

These don't block Phase 1, but they have long lead times and block Phase 3 (the trust mechanic). Start the applications now so they're ready when you get there:

- [ ] MTN MoMo sandbox application submitted (Collections + Disbursements)
- [ ] Orange Money developer access requested (may need Liberia onboarding)
- [ ] Africa's Talking sender ID / shortcode request submitted for Liberia
- [ ] Stripe account created (test mode keys are instant; just have the account)

### A5. Decisions locked before coding

- [ ] **Node version** pinned (per the locked stack — confirm the exact LTS).
- [ ] **Package manager:** pnpm (locked).
- [ ] **The 8 system admin role names + ~120 permissions** are final in `Engineering_Spec.md` §4.3 (Claude seeds these in P1 — they must be right before seeding).
- [ ] **CBL exchange rate strategy** decided (admin-editable config vs. third-party FX — see `Credentials_Inventory.md` §5). Not needed until P2 but decide now.
- [ ] You've read `Phased_Build_Playbook.md` §3.3 (exit gates) so you know what "Phase 1 done" looks like before you start.

### A6. The one mindset check

- [ ] You accept that **Phase 1 produces no user-facing features** — it's foundation. Resist the urge to ask Claude to "also build the homepage for real" mid-P1. The marketing landing page (§3.1.9) is the *only* user-facing surface in P1, and it's a placeholder. Everything else is plumbing. Trying to pull feature work forward is how foundations get half-built.

---

## Part B — Session plan (how to break Phase 1 into Claude Code sessions)

Phase 1 is ~8 weeks of work. Do NOT try to do it in one session. Break it into the sessions below. Each is one kickoff-snippet paste, one focused goal, one Done certification. Run them in order — later sessions depend on earlier ones.

For each session: fill the `Session_Kickoff.md` blanks with **Phase: P1 Foundation** and the **session goal** shown, paste it, wait for Claude to restate the goal, then go.

### Session 1 — Monorepo skeleton

**Goal:** Initialize the Turborepo + pnpm monorepo with all packages and apps stubbed at the *structure* level (folders, configs, cross-package imports working), Turborepo pipeline running.
**Done proof:** `pnpm build`, `pnpm lint`, `pnpm type-check` all run clean across the workspace; a trivial cross-package import compiles end-to-end.
**Maps to playbook:** §3.1.1.
**Note:** "Structure stubbed" here means empty-but-wired packages — this is legitimate scaffolding, NOT the forbidden kind of stub. There's no feature to fake yet.

### Session 2 — Database schema + migrations

**Goal:** Implement the COMPLETE Prisma schema from `Engineering_Spec.md` §4 including all 6 May-2026 domains (§4.13–4.18). Generate and apply the initial squashed migration. Write seed scripts for dev data.
**Done proof:** Migration applies to a real Neon dev DB; `prisma studio` shows every table; seed script populates dev data; a test reads a seeded row back.
**Maps to playbook:** §3.1.3.
**Watch for stubbing:** every table in the spec must exist, even ones not used until later phases. Do not "add tables as needed" — the schema is built whole in P1.

### Session 3 — Auth (Clerk) wired for real

**Goal:** Full Clerk integration — signup, login, logout, password reset, email verification, phone verification (Clerk + Africa's Talking SMS OTP), Clerk→Vendoora user sync via webhook, secure cookie sessions, Next.js session middleware.
**Done proof (this is a REAL end-to-end test, not infra-only):** a new signup creates a real row in the `users` table; login sets a real session cookie; logout revokes it; the webhook handler survives the edge cases (deleted user, re-signup). Test must fail if the sync webhook is stubbed.
**Maps to playbook:** §3.1.4.
**This is the first session where the full fidelity directive bites** — auth is real functionality. No faking the webhook.

### Session 4 — RBAC infrastructure

**Goal:** Seed all ~120 permissions and all 12 roles (8 system admin + 4 marketplace) with correct role→permission mappings. Implement `user.can(permission)`, permission middleware for tRPC + Next.js routes, and RLS policies enforcing at the DB level.
**Done proof:** `user.can("some.permission")` returns correct real results from real seeded data; a permission-gated route rejects an unauthorized user server-side; RLS blocks a cross-tenant query at the database level (test via raw SQL).
**Maps to playbook:** §3.1.5.
**Watch for stubbing:** `user.can()` must read real role assignments, not return `true`. The test must prove an unauthorized user is actually rejected.

### Session 5 — Design system + dark mode

**Goal:** Generate `tokens.css` + `tokens.native.ts` from canonical `tokens.json`; wire Tailwind v4 to consume them; bring shadcn/ui base components into `packages/ui` customized to Vendoora; configure Inter Tight / Fraunces / JetBrains Mono; dark mode tokens + theme toggle + persistence; Storybook with stories for base components.
**Done proof:** Storybook deploys and shows base components in BOTH light and dark; a sample component renders with the exact brand tokens (verify against the prototype's brand system); theme toggle persists across refresh.
**Maps to playbook:** §3.1.6.
**Fidelity link:** this is where prototype-matching starts. The design tokens must match the prototype's brand exactly — same colors, type, spacing.

### Session 6 — Audit log + outbox worker

**Goal:** Audit log table with database-level UPDATE/DELETE prevention via trigger; outbox pattern worker (`apps/worker`) that polls `OutboxEvent`; BullMQ on Railway.
**Done proof:** an attempted UPDATE or DELETE on the audit log fails at the DB level (test via raw SQL); a written OutboxEvent is picked up and processed by the real worker.
**Maps to playbook:** §3.1.3 (audit + outbox) and §3.1.7 partially.

### Session 7 — Observability + i18n scaffolding

**Goal:** Sentry in web + worker; Better Stack structured logging in `packages/logger` with PII redaction; PostHog client + server; Vercel Analytics; `packages/i18n` with English strings + currency/date/number formatters.
**Done proof:** a test error appears in Sentry from a deployed environment; a test event appears in PostHog; the PII redaction layer is tested (a log line with a fake email/phone is redacted); currency formatter produces correct LRD + USD output.
**Maps to playbook:** §3.1.7, §3.1.8.

### Session 8 — CI/CD + marketing placeholder + exit-gate sweep

**Goal:** GitHub Actions with all 10 PR pipeline stages (`Build_Prompt.md` §7.5); branch protection on main; Doppler wired into Vercel/Railway/Actions; preview deploys per PR; Neon DB branching per preview; production deploy from main; post-deploy smoke tests. Plus the marketing placeholder pages (§3.1.9). Then run the FULL §3.3 exit-gate checklist.
**Done proof:** every one of the 13 exit gates in `Phased_Build_Playbook.md` §3.3 passes. This session ends Phase 1.
**Maps to playbook:** §3.1.2, §3.1.9, §3.3.

---

## Part C — Sequencing notes

- **Sessions 1→8 are ordered by dependency.** Don't reorder. Schema (S2) before auth (S3) before RBAC (S4). CI/CD (S8) can technically start earlier, but doing it last lets it cover everything built.
- **One session can span more than one sitting.** "Session" = one focused goal, not one calendar block. If auth (S3) takes three sittings, that's fine — it's still one Done certification at the end.
- **If a session's Done proof won't pass, do NOT move to the next session.** A half-real auth layer poisons everything built on top. Depth-first is non-negotiable here more than anywhere, because it's the foundation.
- **Expect S3 (auth) and S4 (RBAC) to be the hardest.** The playbook §3.4 flags Clerk webhook edge cases and Prisma+RLS `SET LOCAL` correctness as the top risks. Budget more time there. These are also where silent stubbing is most tempting — watch for it.

---

## Part D — The "Phase 1 is actually done" gate

Before you declare Phase 1 complete and move to Phase 2, confirm — for real, by running them — every exit gate in `Phased_Build_Playbook.md` §3.3. The headline proofs:

- [ ] `pnpm build` succeeds across the monorepo
- [ ] All 10 PR pipeline stages pass on a sample PR
- [ ] A real signup creates a real `users` row; login sets a session; logout revokes it
- [ ] `user.can("some.permission")` returns correct real results
- [ ] All ~120 permissions + all 12 roles seeded correctly
- [ ] Audit log cannot be UPDATEd/DELETEd (proven via raw SQL attempt)
- [ ] Marketing landing page live at the production URL
- [ ] Storybook deployed, base components shown in light + dark
- [ ] Sentry captures a real test error from production
- [ ] PostHog receives a real test event from production
- [ ] Coverage thresholds met for every package created
- [ ] Phase 1 work documented in `docs/runbooks/`

When all of these are genuinely true — not "look done," but *verified by running them* — Phase 1 is complete and Phase 2 (Core Marketplace) can begin. That's the first phase where real user-facing features get built against this foundation, and the fidelity directive carries straight through.
