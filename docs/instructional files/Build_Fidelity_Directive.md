# Vendoora — Build Fidelity Directive

**Version:** 1.0 · May 2026
**Status:** Binding — overrides any conflicting interpretation in other build documents
**Read order:** Read this FIRST, before `Build_Prompt.md`, `Engineering_Spec.md`, and `Phased_Build_Playbook.md`. This document does not replace them — it governs *how* you execute them.
**Applies to:** Every Claude Code build session for Vendoora, every screen, every feature, every commit.

---

## 0. Why this document exists

Two failures happened during earlier build sessions, and this directive exists to make them impossible to repeat.

**Failure 1 — Prototype drift.** Instead of building the screens that exist in `Vendoora_App.html`, the build invented its own layouts, flows, and components. The prototype was treated as loose inspiration rather than a binding specification.

**Failure 2 — Stubbing under the banner of "using the prototype."** When corrected and told to "use the prototype," the build reproduced the prototype's *appearance* but not its *function* — buttons that fire a toast instead of submitting, hardcoded arrays instead of database queries, `// TODO` comments where escrow logic should be, and the hard parts (escrow, code verification, payments, KYC) quietly skipped.

Both failures share one root cause: **"done" was never defined in enforceable terms, so the lowest-effort interpretation won.** This document defines "done" precisely and forbids the shortcuts. Read every section. The rules here are not suggestions.

---

## 1. The prototype is a binding visual + flow specification

`Vendoora_App.html` (the master prototype, ~23,000 lines, 81 routes) is the **single source of truth** for what the product looks like and how a user moves through it. It is not a mood board. It is not a starting point you may "improve" structurally. It is a contract.

### 1.1 What the prototype is BINDING for

You **must** match the prototype exactly on all of the following. You may not deviate without explicit written approval from Anthony.

- **Screen inventory.** Every one of the 81 routes is a screen that must exist in the live build. You may not drop screens. You may not merge two screens into one. You may not invent new screens that aren't in the prototype (if you believe one is needed, see §5 — stop and flag).
- **Layout and structure.** The arrangement of every section on every screen — header, hero, cards, tables, sidebars, footers — matches the prototype. Same sections, same order, same hierarchy.
- **Copy.** Headings, body text, button labels, microcopy, empty-state text, error messages, tooltips. Word for word. The prototype's copy was deliberately written (e.g. "Your 6-digit code. Your final word.", "Send a Care Box home in under 5 minutes."). Do not paraphrase it.
- **Navigation.** The nav items per role (buyer, seller, driver, admin), their order, and where each leads. The admin nav has exactly 13 items in a fixed order — reproduce it.
- **Flow order.** The sequence of steps in every multi-step flow (checkout, seller onboarding 5 steps, driver onboarding 3 steps, KYC, dispute, code verification). The order is the product. Do not reorder.
- **States.** Every state shown in the prototype — loading, empty, error, success, in-progress, the 5-stage order tracking, the READY/REVIEW/OUT/CRITICAL/LOW status pills, tier badges (T1–T4). All must exist.
- **Brand system.** Colors, typography (Inter Tight / Fraunces / JetBrains Mono per the locked rules), the hexagonal verified seal, iconography (Lucide + 6 custom marketplace icons), spacing tokens. The prototype embodies the locked brand — match it.
- **Audience behavior.** The geo-routing 3-layer system, the "Shopping as" pill, audience-aware pricing (LRD-first for local, USD-first for diaspora), and the per-audience homepage sections all exist in the prototype and must be reproduced in behavior.

### 1.2 What the prototype is NOT binding for

The prototype is a static HTML file. It necessarily fakes the things a static file cannot do. You are **expected to replace these fakes with real implementations** — that is the entire job. The prototype does not constrain:

- **Backend logic.** Database schema, API contracts, server-side validation, state machines, business rules. Build these per `Engineering_Spec.md` — properly, not as the prototype's `toast()` calls suggest.
- **Data.** The prototype uses hardcoded `SEED` arrays and inline mock data. The live build uses real database queries against the real schema (Prisma 6 + Neon Postgres per the locked stack).
- **Integrations.** MoMo, Orange Money, Stripe, Africa's Talking, Twilio, Firebase, Cloudflare R2 — these are stubbed or absent in the prototype and must be really integrated.
- **Performance, security, and infrastructure.** Caching, rate limiting, RBAC enforcement, audit logging, error handling, retries, idempotency. The prototype shows none of this; you build all of it.

### 1.3 The governing rule

> **The prototype defines what the user sees and the order in which things happen. The engineering spec defines how it actually works. Wherever the prototype shows a `toast()`, a hardcoded value, or a placeholder, you implement the real action behind it — without changing what the user sees.**

When the prototype and the engineering spec appear to conflict, they usually don't: the prototype governs the surface, the spec governs the mechanism. If they genuinely conflict on something real (not surface-vs-mechanism), **stop and flag** (§5). Do not silently pick one.

---

## 2. "Functional" is defined here. Stubs are forbidden.

A screen or feature is **not done** until it actually works against real infrastructure. The following four shortcuts are explicitly banned. If you find yourself doing any of them, you are not "using the prototype" — you are violating this directive.

### 2.1 BANNED: Dead controls

A button, link, form, toggle, or input that does not perform its real action is forbidden in delivered work.

- ❌ `onClick={() => toast("Order placed!")}` — when no order was created
- ❌ `onClick={() => console.log("TODO: submit")}`
- ❌ A form that validates on the client but never POSTs to a real endpoint
- ❌ A toggle that flips visual state but persists nothing
- ✅ The button calls a real API route, which writes to the real database, returns a real result, and the UI reflects that real result — including the real error path.

**Note on the prototype's toasts:** the prototype is *full* of `App.toast('...')` calls. These are placeholders marking *where a real action goes*. Each one is a to-do, not a target. Reproducing the toast is not implementing the feature.

### 2.2 BANNED: Fake data standing in for real data

Hardcoded arrays, mock objects, and invented numbers are forbidden in delivered screens.

- ❌ `const orders = [{id: 'o001', ...}]` baked into the component
- ❌ A dashboard showing `$284,719` as a literal instead of a query result
- ❌ A seller list rendered from a constant instead of `prisma.seller.findMany()`
- ✅ Data comes from the real database via the real data layer. Numbers are computed from real records. Empty states render when there genuinely is no data.

**The prototype's `SEED` data is a fixture for *demonstration*, not a data source for *production*.** Use it, at most, to seed a development database — never to hardcode into a live screen.

### 2.3 BANNED: TODO comments in place of logic

Shipping a feature with its core logic replaced by a comment is forbidden.

- ❌ `// TODO: implement escrow release`
- ❌ `// payment integration goes here`
- ❌ `function verifyDeliveryCode() { /* later */ return true; }`
- ✅ The logic is written, tested, and runs. If it cannot be written now because something is genuinely missing, you **stop and flag** (§5) — you do not leave a TODO and move on.

A TODO is an admission that the feature isn't done. An unfinished feature is not "done with a note" — it is **not done**, and it must not be reported as complete.

### 2.4 BANNED: Skipping the hard parts

The hard parts ARE Vendoora. The entire value proposition is "trust through a working mechanism." The following are **non-negotiable** and must be built as real, working, tested systems — never stubbed, never faked, never deferred without explicit approval:

1. **Escrow.** Money is held on payment and released only on verified delivery. The full state machine — hold, release, refund, dispute-freeze — must work against real records. 100% test coverage required (per `Engineering_Spec.md`).
2. **6-digit delivery code verification.** The code is generated, delivered to the buyer (SMS + in-app), entered by the driver, verified server-side, and *only then* does escrow release. "No code, no package. No package, no payout." This must actually enforce, not simulate.
3. **Payments — MoMo, Orange Money, Stripe.** Real integration. Real money movement (in sandbox/test mode until production keys are provided — see §5). A payment flow that fakes success is forbidden.
4. **KYC.** Tier verification (T1–T4), document upload, review queue, tier gating of seller capabilities. The tier a seller holds must actually govern what they can do.

If a build session's scope touches any of these four, they must come out the other side **working and tested**, or the session must **stop and flag** the specific blocker. There is no acceptable middle state where escrow "looks done" but doesn't hold money.

---

## 3. Definition of Done — the per-feature contract

Before you report any feature, screen, or task as complete, you must self-certify it against this checklist **and** prove it with a passing end-to-end test. Both are required. A checklist without a test can be wishful; a test without a checklist can be shallow. Together they close the loop.

### 3.1 The Definition-of-Done checklist

For each feature, confirm every item explicitly (write the confirmation in your summary — do not just assert "done"):

- [ ] **Matches the prototype** on layout, copy, navigation, flow order, and states (§1.1).
- [ ] **No dead controls** — every button/form/toggle performs its real action (§2.1).
- [ ] **No fake data** — all data is read from / written to the real database via the real data layer (§2.2).
- [ ] **No TODO comments** standing in for logic anywhere in the delivered code (§2.3).
- [ ] **Hard parts are real** — if escrow / code-verify / payments / KYC are touched, they actually work and are tested (§2.4).
- [ ] **Server-side validation** exists for every input — not just client-side.
- [ ] **Error paths work** — the failure case is handled and shown to the user, not just the happy path.
- [ ] **RBAC enforced** — the action checks permissions server-side (per the permission-based RBAC in the spec).
- [ ] **Audit logged** — state-changing actions write to the audit log where the spec requires it.
- [ ] **Real persistence** — refresh the page / restart the server, and the result is still there.

### 3.2 The end-to-end test requirement

Following the Superpowers TDD methodology already mandated in `Build_Prompt.md` §0.5 and §12.2 (red → green → refactor), every feature ships with a test that exercises the **real path**, not a mock of it:

- The test drives the actual flow a user would take.
- It hits the real API routes.
- It writes to and reads from a real (test) database.
- For the hard parts, it proves the mechanism: e.g. *"payment held in escrow → wrong code rejected → correct code accepted → escrow released → seller balance increased."* That single test passing is what proves the delivery-code escrow flow is real.
- A test that asserts a toast fired, or that a mock returned true, does **not** count. The test must fail if the underlying mechanism is stubbed. (This is the key property: **a correct test cannot pass against a stub.** If your test passes against stubbed logic, the test is wrong — fix the test, then fix the code.)

### 3.3 Self-certification statement

When you report a feature complete, end with an explicit certification in this form:

```
DONE CERTIFICATION — <feature name>
- Prototype fidelity: <what you matched, any approved deviation>
- Real actions: <the controls and what they now do for real>
- Real data: <the queries/mutations wired>
- Hard parts touched: <none | escrow/code/payments/KYC — and how each is proven>
- Test: <test name, what real path it exercises, confirmation it passes and fails-against-stub>
- DoD checklist: <all 10 items confirmed | list any not-applicable with reason>
```

If you cannot truthfully write this certification, the feature is not done. Do not report it as done.

---

## 4. Build order and pacing — match the locked phases

Follow the 8-phase build in `Phased_Build_Playbook.md` (P1 Foundation → P2 Core Marketplace → P3 Trust Mechanic → P4 Seller Infrastructure → P5 Diaspora → P6 Admin/RBAC → P7 Driver Logistics → P8 Integration/Pilot). Do not jump ahead to a screen in a later phase because it's easier. Each phase has entry and exit gates — meet them.

Within a phase, build **one feature fully to Done (§3) before starting the next.** Do not stub three features to "rough in the screen" and circle back — that is exactly how stubbing creeps in. Depth-first, not breadth-first. One real, working, tested feature beats five hollow ones.

The three founder commitments in `Build_Prompt.md` §18.2 remain binding and reinforce this:
1. **No partial launches** — the trust mechanic must be fully working end-to-end before the first paying customer.
2. **Scope frozen** at the agreed feature set — additions go to the v1.1 backlog, they do not expand the current build.
3. **Test users before paying users** — the pilot runs on real flows with real money before public launch.

---

## 5. The stop-and-flag rule — never stub silently

This is the rule that prevents the original failure from recurring.

When you **genuinely cannot** build something for real in the current step, you must **stop and tell Anthony exactly what you need.** You may not paper over the gap with a stub, a TODO, or a fake and continue as if the feature were done.

### 5.1 When to stop and flag

- You need a credential or secret you don't have (e.g. live MoMo / Orange / Stripe production keys, an SMS provider account, a CBL rate API key).
- An external integration's sandbox isn't available or behaves differently from production in a way that blocks real verification.
- The prototype and the engineering spec genuinely conflict on something substantive (not surface-vs-mechanism).
- A dependency from an earlier phase isn't actually done (e.g. you're asked to build payouts but escrow isn't real yet).
- The requirement is ambiguous in a way that would force you to guess at real business logic (e.g. exact commission rounding, exact refund eligibility window).

### 5.2 How to flag

Stop work on that item and surface a clear blocker in this form:

```
BLOCKED — <feature name>
- What I was building: <the feature>
- What's blocking real implementation: <the specific missing thing>
- What I need from you: <credential / decision / clarification — be specific>
- What I can do meanwhile: <other real work I can complete, or "nothing in this feature until unblocked">
- What I will NOT do: ship a stub of this and call it done.
```

Then continue with other **real** work that isn't blocked, or stop the session if everything is blocked. A surfaced blocker is good news — it means we find the gap now, in the open, instead of discovering three screens later that escrow never actually held money.

### 5.3 The one thing you must never do

> **Never silently substitute a stub for real functionality and report the feature as done.** Silent stubbing is the specific failure this entire directive exists to prevent. If in doubt, stop and flag. Over-flagging is mildly annoying; silent stubbing is what wastes weeks.

---

## 6. Sandbox vs. production — the honest middle ground

"Build it for real" does not mean "move real money in production today." The honest, non-stub way to handle integrations you can't fully run yet:

- **Use real sandbox/test modes.** Stripe test mode, MoMo/Orange sandbox endpoints, SMS provider trial accounts. The code path is real and complete; only the environment is test. This is **functional** — it is not a stub.
- **Build the real integration code** even if you can only run it against sandbox. The adapter, the API calls, the webhook handlers, the idempotency, the error handling — all real and tested against sandbox.
- **Gate production keys behind §5.** When you reach the point where only live production credentials are missing, stop and flag for them. Do not fake live behavior.

The line is simple: **sandbox-against-real-integration-code = functional and acceptable. Faking success without integration code = stub and forbidden.**

---

## 7. How to self-check before every "done"

Before reporting any work complete, run this three-question gut check. If the answer to any is "no," it's not done — fix it or stop-and-flag.

1. **If I refresh the page or restart the server, is the result still there?** (Real persistence, not client state.)
2. **If I write a test that asserts the real mechanism happened, does it pass — and would it fail if I deleted the logic and left a stub?** (Real logic, not a fake the test can't tell apart.)
3. **Does what the user sees match the prototype exactly?** (No drift.)

Three yeses, plus the §3 certification, is "done." Anything less is not — regardless of how finished the screen looks.

---

## 8. Summary — the contract in one paragraph

Build Vendoora into a live, functional marketplace using `Vendoora_App.html` as the binding specification for everything the user sees and the order in which it happens, and `Engineering_Spec.md` as the specification for how it actually works underneath. Replace every prototype placeholder — every `toast()`, every hardcoded array, every faked success — with the real action, real data, and real integration behind it. Never leave a dead control, fake datum, TODO, or skipped hard part in delivered work. Escrow, 6-digit code verification, payments, and KYC are the product and must be real, working, and tested. Prove every feature done with both the Definition-of-Done checklist and a passing end-to-end test that could not pass against a stub. Build depth-first, one real feature at a time, in the locked phase order. And when you genuinely cannot build something for real, stop and tell Anthony exactly what you need — never, ever substitute a stub and call it done.
