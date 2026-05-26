# Vendoora — Prisma Slice 4: Disputes

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development OR inline execution per user preference.

**Goal:** Add the dispute data model — Dispute, DisputeMessage, DisputeEvidence + 6 enums. Wire up the `Dispute` relation on `EscrowHold.dispute_id` and `Refund.dispute_id` (currently bare `String?` columns from slice 3). Schema goes from 24 → **27 tables**.

**Architecture:** One auto-generated Prisma migration: `add_disputes_tables`. The Dispute model has a complex status enum (12 values) and a resolution enum (6 values) that the resolution-engine code (P3) will validate against. Like slice 3, this slice lands only the *table shape* + *enum values* — the dispute resolution LOGIC lives in `packages/domain/src/dispute/` in a future plan with the 100% coverage requirement.

**Tech Stack:** Prisma 6, Postgres 16, Vitest 2.

---

**Date:** 2026-05-26
**Estimated complexity:** M
**Phase:** P1 Foundation (Playbook §3.1.3, slice 4 of ~6)
**Estimated session time:** 2-3 hours

## Problem

Slices 1-3 gave us users, sellers, products, orders, and the escrow money flow. The trust mechanic requires that buyers and sellers can open disputes when something goes wrong — counterfeit goods, non-delivery, damage, etc. Without disputes, the escrow state machine has nowhere to route disagreements; `HELD_DISPUTED` and `INSURANCE_PAYOUT` are unreachable states.

This slice adds the dispute data shape. The 48-hour SLA timer, the T&S queue UI, the resolution actions (full refund / partial refund / release-to-seller / insurance payout) all consume this schema in later plans.

## Approach

One auto-generated migration. Three models:
- **Dispute** — the case record with category, reason, status lifecycle, resolution, SLA tracking, chargeback metadata
- **DisputeMessage** — buyer/seller/admin/system communication on the dispute (with internal-notes flag for T&S)
- **DisputeEvidence** — file uploads (photos, videos, documents) attached to a dispute

Plus 6 enums:
- `DisputeCategory` (9 values: NOT_RECEIVED, DAMAGED, WRONG_ITEM, COUNTERFEIT, QUALITY_ISSUE, IN_TRANSIT_DAMAGE, PAYMENT_ISSUE, FRAUD, OTHER)
- `DisputeReason` (5 values: BUYER_INITIATED, SELLER_INITIATED, CHARGEBACK, FRAUD_DETECTED, SYSTEM_FLAGGED)
- `DisputeStatus` (11 values: OPEN, IN_REVIEW, PENDING_BUYER, PENDING_SELLER, ESCALATED, RESOLVED_FAVOR_BUYER, RESOLVED_FAVOR_SELLER, RESOLVED_PARTIAL, RESOLVED_INSURANCE, CLOSED, WITHDRAWN)
- `DisputeResolution` (6 values: FULL_REFUND_TO_BUYER, PARTIAL_REFUND_TO_BUYER, RELEASE_TO_SELLER, INSURANCE_PAYOUT, STORE_CREDIT, REPLACEMENT_SHIPPED)
- `DisputeMessageAuthorType` (4 values: BUYER, SELLER, ADMIN, SYSTEM)
- `DisputeEvidenceType` (7 values: PHOTO, VIDEO, DOCUMENT, CHAT_TRANSCRIPT, DELIVERY_PROOF, RECEIPT, OTHER)

After adding the models, **upgrade the deferred FK columns**:
- `EscrowHold.dispute_id`: was bare `String?`, gets `@relation` to Dispute
- `Refund.dispute_id`: was bare `String?`, gets `@relation` to Dispute

Add back-references on `Order` (orders → disputes) since disputes belong to orders.

## Scope (what this DOES)

- [ ] 3 Prisma models: `Dispute`, `DisputeMessage`, `DisputeEvidence`
- [ ] 6 enums
- [ ] One auto-generated migration: `add_disputes_tables`
- [ ] Upgrade deferred FK relations:
  - `EscrowHold.dispute` → `Dispute?`
  - `Refund.dispute` → `Dispute?`
- [ ] Back-references on `Order` (`disputes Dispute[]`)
- [ ] Integration tests: ~10 covering structure, enums, FK relationships, 48hr SLA field, the deferred-relation upgrades
- [ ] apps/web smoke test: `prisma.dispute.count()` works

## Out of scope

- **Dispute resolution LOGIC** — `packages/domain/src/dispute/` with the resolution-action handlers + escrow-transition triggers — lands in P3 Trust Mechanic (with 100% coverage per Build_Prompt §5.1)
- **48-hour SLA timer worker** — fires escalations at 24hr/36hr/48hr — P3
- **T&S queue UI** — P6 Admin/RBAC
- **Chargeback webhook handler** — P3
- **Insurance fund flow** — P3 (the `INSURANCE_PAYOUT` resolution triggers a write to PlatformConfig.insurance_fund_balance which doesn't exist yet)

## Files to be created

- `packages/db/__tests__/disputes.integration.test.ts` — 10 tests
- 1 Prisma-generated migration directory

## Files to be modified

- `packages/db/prisma/schema.prisma` — append 3 models + 6 enums; upgrade `EscrowHold.dispute_id` + `Refund.dispute_id` from bare String? to `@relation`; add `disputes Dispute[]` back-ref to Order
- `apps/web/__tests__/db-integration.test.ts` — add `prisma.dispute.count()` assertion

## Database changes

1 migration: `<ts>_add_disputes_tables` — `disputes`, `dispute_messages`, `dispute_evidence` + 6 enums + (implicit) addition of named indexes for the now-typed `dispute_id` FK columns on escrow_holds and refunds.

Greenfield additions. The "upgrade" of `dispute_id` from String? to `@relation` doesn't change the column type — Prisma just adds a foreign-key constraint at the DB level pointing to disputes.id.

## Test cases (~10)

**`disputes.integration.test.ts`:**
- [ ] `disputes` table exists with key columns (`id`, `dispute_number`, `order_id`, `initiated_by_user_id`, `category`, `status`, `resolution`, `sla_due_at`, `created_at`)
- [ ] `disputes.dispute_number` is UNIQUE
- [ ] `dispute_messages` table with `dispute_id` FK + `author_type` + `is_internal` flag
- [ ] `dispute_evidence` table with `dispute_id` FK + `file_url` + `evidence_type`
- [ ] All 6 dispute enums exist with documented values (DisputeCategory, DisputeReason, DisputeStatus, DisputeResolution, DisputeMessageAuthorType, DisputeEvidenceType)
- [ ] `escrow_holds.dispute_id` now has a FK constraint to disputes (was bare String? in slice 3)
- [ ] `refunds.dispute_id` now has a FK constraint to disputes
- [ ] FK delete behavior on `Dispute → Order` is `Restrict`
- [ ] `disputes.sla_breached` is a Boolean with default false
- [ ] End-to-end: create dispute → attach a message → attach evidence → resolve → confirm escrow hold's `dispute_id` is set

**`apps/web/__tests__/db-integration.test.ts`** (extended):
- [ ] `prisma.dispute.count()` returns 0

## Permission/security implications

- Disputes can be opened by buyer (within 24hr of DELIVERED), seller, or system. The `dispute.read.all`, `dispute.assign`, `dispute.resolve`, `dispute.escalate` permissions were already seeded in slice 1 — they target this slice's data.
- `DisputeMessage.is_internal = true` means a T&S-only note; UI rendering MUST filter these from buyer/seller views (responsibility of the API layer, P3).

## Risks

1. **`DisputeStatus` has 11 values** including the 4 "RESOLVED_*" terminal states. State-machine guards (P3) will validate transitions — e.g., you can't go from CLOSED back to OPEN.
2. **`DisputeResolution` (when set) must trigger an escrow state transition.** The application-layer requirement: setting `resolution = FULL_REFUND_TO_BUYER` should drive escrow_hold to `REFUNDING → REFUNDED`. Cross-table consistency is application code, not DB constraint, in this slice.
3. **Engineering_Spec §4.8** lists `DisputeStatus` with 11 values; the Polish_Phase_Addendum doesn't change this. Going with the spec values exactly.

## Dependencies

- Slices 1-3 ✓ merged
- Docker Postgres on 5434 ✓ running

---

## Tasks

### Task 1: Disputes models + tests (RED → GREEN)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` — append 3 models + 6 enums + upgrade `dispute_id` relations + add Order back-ref
- Create: `packages/db/__tests__/disputes.integration.test.ts`

- [ ] **Step 1: Write the RED test**

Provided in the test cases section above. Save as `packages/db/__tests__/disputes.integration.test.ts`.

- [ ] **Step 2: Run — confirm RED**

10 new dispute tests fail (tables don't exist; the deferred-relation FK upgrades also fail because `dispute_id` columns still have no FK constraint).

- [ ] **Step 3: Append Disputes schema to `schema.prisma`**

Per the Approach section. The Dispute model is large; transcribe carefully.

- [ ] **Step 4: Upgrade EscrowHold.dispute_id and Refund.dispute_id to `@relation`**

In EscrowHold, change:
```
  dispute_id      String?
```
to:
```
  dispute_id      String?

  dispute         Dispute? @relation(fields: [dispute_id], references: [id])
```
(Move it adjacent to the other relation declarations near the end of the model.)

Same for Refund.dispute_id.

Add `disputes Dispute[]` back-ref to Order.

- [ ] **Step 5: Migrate**

```bash
pnpm prisma migrate dev --name add_disputes_tables
```

- [ ] **Step 6: Run — confirm GREEN**

Expected: 62 db tests + 7 web tests passing.

---

### Task 2: apps/web smoke test extension

Use Edit to add `prisma.dispute.count()` assertion to `apps/web/__tests__/db-integration.test.ts`.

---

### Task 3: Cold-state + commit + merge

Standard pattern: db:reset → migrate → seed → all tests → build → commit + merge.
