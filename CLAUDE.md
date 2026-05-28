# Vendoora — Claude Code Instructions (live monorepo)

This is the **live monorepo** (`C:\Users\Anthony\Documents\vendoora`). Code ships from
here. (The docs-only copy under `Saas Application Pending Production\…` is not the build.)

## Read at the start of every session, in this order

The binding governance set lives in `docs/instructional files/`. Read these FIRST:

1. **docs/instructional files/Build_Fidelity_Directive.md** — **READ FIRST. Binding,
   overrides any conflicting interpretation.** Governs *how* to build: the prototype is a
   binding spec for everything the user sees and the order things happen; replace every
   `toast()` / hardcoded array / placeholder with the REAL action, REAL data, REAL
   integration; no dead controls, no fake data, no TODO-in-place-of-logic, no skipping the
   hard parts. Prove every feature with the §3.1 Definition-of-Done checklist AND a
   passing end-to-end test that could not pass against a stub. If you genuinely can't build
   something for real, **STOP and flag** (§5) — never silently substitute a stub.
2. **docs/instructional files/Build_Index.md** — the map: what's authoritative vs historical.
3. **docs/instructional files/Session_Kickoff.md** — the per-session anchor + the three gut-checks.
4. **docs/instructional files/Phase_1_Entry_Checklist.md** — Phase-1 pre-flight + session plan.
5. **docs/instructional files/Credentials_Inventory.md** — every external secret, by phase.

Then the specification set (the *what* and *how*):

6. **docs/prototype/Vendoora_App.html** — THE binding visual + flow spec (81 routes, 4 roles).
7. **docs/Engineering_Spec.md** — schema, APIs, state machines, RBAC.
8. **docs/Build_Prompt.md** — operational contract (Superpowers methodology §0.5, TDD §12.2).
9. **docs/Phased_Build_Playbook.md** — the 8-phase build order with entry/exit gates.
10. **docs/Polish_Phase_Addendum.md** — additive features layered on the trilogy.

## Current state (honest, 2026-05)

- **Foundation (P1)** + **core-marketplace surfaces (P2/P4/P6 UI)** are built and read real
  data: browse, search (tsvector), PDP + real reviews, cart, checkout, order placement,
  order tracking, disputes (open + T&S admin resolution), seller onboarding wizard, admin
  dispute queue, search-insights. Escrow *records* + dispute/admin escrow transitions are real.
- **Trust mechanic (P3) hard parts are NOT yet real** and are credential-blocked:
  - **Payments** — SCAFFOLD-ONLY. `placeOrder` auto-captures with `provider:'WALLET'`; no
    Stripe / MTN MoMo / Orange Money adapters or webhooks. Needs sandbox keys (§Credentials).
  - **6-digit code** — generation + bcrypt verify are real; **SMS delivery and the
    driver-entry → verify → escrow-release path are absent.** Needs an SMS provider + `apps/worker`.
  - **Escrow auto-release** — `scheduled_release_at` is set but no worker processes it.
  - **KYC** — T1 application submit is real; document upload, T2+ review queue, and
    capability tier-gating are absent.
- **Structure:** packages present = `config, db, design-tokens, types`; missing per
  Engineering_Spec §2.1 = `ui, schemas, api-client, domain, i18n`; `apps/worker` is missing.

Treat the four hard parts as **§5 stop-and-flag** items until their sandbox credentials are
loaded into the environment. Building real adapter code against sandbox is *functional and
acceptable* (Directive §6); faking success without integration code is a forbidden stub.

## Definition of Done (Directive §3 — required before reporting any feature complete)

Matches prototype (layout/copy/nav/flow/states) · no dead controls · no fake data · no TODO ·
hard parts real if touched · server-side validation · error paths · RBAC enforced · audit
logged · real persistence. End with the §3.3 DONE CERTIFICATION block. A correct test **cannot
pass against a stub** — if it does, the test is wrong.

## The three gut-checks before any "done" (Directive §7)

1. If I refresh / restart, is the result still there? (real persistence)
2. Would the test fail if the logic were replaced with a stub? (real logic)
3. Does what the user sees match the prototype exactly? (no drift)

## Environment / workflow

- Live monorepo: `C:\Users\Anthony\Documents\vendoora`. Postgres (Docker) on host port **5434**.
- Prisma 6 destructive ops require `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` — only ever
  against the **local test DB**, never production.
- GitHub: `github.com/johnsonanthony20245-ui/vendoora` (Git Credential Manager carries the token).
- Methodology gate (Build_Prompt §0.5): brainstorm → plan → /execute-plan → TDD red-green-refactor
  → four-phase debugging → code-reviewer subagent. No exceptions.
- Depth-first: build ONE feature fully to Done before starting the next.
