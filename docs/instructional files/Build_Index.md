# Vendoora — Build Index

**Start here.** This is the front door to the Vendoora project. It maps every document, marks what's authoritative vs. historical, and gives the exact order to read things before building.

**One-line project summary:** Vendoora is a Liberian + diaspora multi-vendor commerce marketplace whose moat is mechanism-visible trust — money is held in escrow and released only when the buyer's 6-digit delivery code is verified at the door. "No code, no package. No package, no payout."

---

## Read order (first build session)

Read these in this exact order. The first five are the operational core — you need all of them before writing a line of code.

| # | Document | Why / what it governs |
|---|---|---|
| 1 | **Build_Fidelity_Directive.md** | READ FIRST. The rules of *how* to build. Prototype is binding for what the user sees; replace every placeholder with real logic; no stubs; prove every feature with a checklist + a test that can't pass against a stub; stop-and-flag instead of faking. |
| 2 | **Build_Index.md** (this file) | The map. Where everything is and what's authoritative. |
| 3 | **Session_Kickoff.md** | The snippet you paste at the top of every Claude Code session so it anchors to the rules. |
| 4 | **Phase_1_Entry_Checklist.md** | The pre-flight + the 8-session plan for the first phase (Foundation). |
| 5 | **Credentials_Inventory.md** | Every external service, what secret it needs, and when. Start the long-lead items (MoMo/Orange) today. |

Then the specification trilogy — the *what* and *how* of the product:

| # | Document | Why / what it governs |
|---|---|---|
| 6 | **Vendoora_App.html** | THE binding visual + flow spec. 81 routes, all 4 roles. What every screen looks like and the order things happen. |
| 7 | **Engineering_Spec.md** | How it actually works underneath — schema, APIs, state machines, RBAC (~120 permissions, 12 roles), the 6 May-2026 domains (§4.13–4.18). |
| 8 | **Build_Prompt.md** | The operational contract — Superpowers methodology (§0.5), TDD (§12.2), founder commitments (§18.2). |
| 9 | **Phased_Build_Playbook.md** | The 8-phase build order with per-phase entry/exit gates. |
| 10 | **Polish_Phase_Addendum.md** (v1.3) | The additive features layered on after the trilogy locked — Polish, Merge, Geo-Routing, and Admin Tools phases. ~272 total features. |

---

## The document set, by purpose

### Tier 1 — Authoritative build documents (use these to build)

- **Build_Fidelity_Directive.md** — how to build (anti-drift, anti-stub). *Binding, overrides conflicting interpretation.*
- **Vendoora_App.html** — the canonical prototype. *Binding visual + flow reference.*
- **Engineering_Spec.md** — the canonical technical spec.
- **Build_Prompt.md** — the operational contract.
- **Phased_Build_Playbook.md** — the phase plan + gates.
- **Polish_Phase_Addendum.md** — additive features, extends the trilogy.

### Tier 2 — Operational helpers (use these to run the build)

- **Build_Index.md** — this file.
- **Session_Kickoff.md** — per-session starter snippet.
- **Phase_1_Entry_Checklist.md** — Phase 1 pre-flight + session plan.
- **Credentials_Inventory.md** — secrets, by phase.
- **Operational_Tracks_Runbook.md** — operational tracks (support, T&S, finance ops, etc.).
- **MarketHub_Feature_Audit.md** — the May-2026 feature audit that expanded scope to ~272 features.

### Tier 3 — Brand & strategy reference (context, not build instructions)

- **Vendoora_Brand_Guidelines_v1_1.docx** — current brand guidelines (v1.1). *Use this, not v1.*
- **Vendoora_Asset_Library_v1.zip** — brand assets.
- **Engineering_Summary.docx**, **Playbook_Summary.docx** — readable summaries of the specs.
- **Multi_Vendor_Commerce_Strategy_v2.docx**, **Competitive_Intelligence_v2.docx** — strategy + market context.
- **Konstellation_Commerce_Strategy.docx** — related-venture strategy (separate product).
- **Vendoora_Seed_Pitch.pptx** — the seed investor deck.

### Tier 4 — HISTORICAL ONLY (do not build from these)

These 16 standalone HTML files were the original per-screen prototypes. **They are fully merged into `Vendoora_App.html` and are no longer authoritative.** Keep them for reference only; never build from them, never reconcile against them. If they conflict with `Vendoora_App.html`, the master prototype wins.

`Vendoora_Homepage.html`, `Vendoora_Checkout_Flow.html`, `Vendoora_Diaspora_Flow.html`, `Vendoora_Seller_Console.html`, `Vendoora_System_Operations.html`, `Vendoora_Trust_Operations.html`, `Vendoora_Product_Trust.html`, `Vendoora_Public_Pages.html`, `Vendoora_Mobile_Apps.html`, `Vendoora_Monetization.html`, `Vendoora_Design_Tokens.html`, `Vendoora_Iconography_System.html`, `Vendoora_Logo_Concepts.html`, `Vendoora_Photography_Direction.html`, `Vendoora_Typography_Comparison.html`, `Vendoora_Visual_Prototypes.html`

Also superseded: **Vendoora_Brand_Guidelines_v1.docx** (use v1.1).

---

## The build, in one breath

1. **Prep:** read Tier 1 + Tier 2; create accounts; load Doppler; start MoMo/Orange applications (`Credentials_Inventory.md`).
2. **Start each session:** paste the snippet from `Session_Kickoff.md` with the phase + one feature filled in.
3. **Build for real:** prototype defines the surface, spec defines the mechanism, every placeholder becomes real logic, every feature proven by checklist + test (`Build_Fidelity_Directive.md`).
4. **Phase order:** P1 Foundation → P2 Core Marketplace → P3 Trust Mechanic → P4 Seller → P5 Diaspora → P6 Admin/RBAC → P7 Driver → P8 Integration/Pilot (`Phased_Build_Playbook.md`). Phase 1 is broken into 8 sessions in `Phase_1_Entry_Checklist.md`.
5. **The non-negotiables:** escrow, 6-digit code verification, payments (MoMo/Orange/Stripe), KYC — built real, tested, never stubbed.
6. **Launch discipline:** no partial launches, scope frozen, test users before paying users (`Build_Prompt.md` §18.2).

---

## Quick facts

- **Stack:** Next.js 15 + React 19 + Tailwind v4 + shadcn/ui + Prisma 6 + Neon Postgres + Upstash Redis + Clerk + Stripe Connect + MTN/Orange + Vercel + Railway (BullMQ) + Cloudflare R2/Images + Resend/Loops + Africa's Talking/Twilio + Doppler + Sentry + Better Stack + PostHog. Turborepo monorepo.
- **Prototype:** `Vendoora_App.html` — 81 routes, 4 roles (buyer/seller/driver/admin).
- **Scope:** ~272 features across 8 phases. Timeline 18–24 months.
- **Exchange rate (prototype):** 1 USD = 180 LRD (live build uses admin-editable config, not a hardcoded constant).
- **Brand:** deep navy + Liberian red + gold accents; Inter Tight / Fraunces / JetBrains Mono; hexagonal verified seal; Lucide + 6 custom marketplace icons.

---

*If you read nothing else before building: read `Build_Fidelity_Directive.md`, open `Vendoora_App.html`, and follow `Phase_1_Entry_Checklist.md`. Everything else supports those three.*
