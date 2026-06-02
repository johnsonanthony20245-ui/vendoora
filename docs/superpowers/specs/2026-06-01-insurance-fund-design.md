# Insurance Fund — Design

**Date:** 2026-06-01
**Status:** Approved (autonomous build under founder's standing /goal authorization)
**Phase:** 3 — Trust Mechanic (Engineering_Spec §7.5, Phased_Build_Playbook §5.1.8)

## Problem

When T&S resolves a dispute as `INSURANCE_PAYOUT` (in-transit damage / lost package,
neither party at fault), `resolveDispute` sets the escrow hold's state to
`INSURANCE_PAYOUT` but **moves no money** — there is no platform insurance fund to
debit. The trust mechanic claims insurance coverage it cannot actually pay. There is
also no `PlatformConfig` table, so the fund balance and its limits have nowhere to live.

## Goal

Make the insurance fund real: a configurable balance that is debited (transactionally,
guarded against overdraw and the §7.5 caps) when an insurance claim is paid, with a
ledger of every payout for audit and per-buyer / per-seller annual limit enforcement.

This slice delivers the **fund mechanic + domain function + ledger**. Wiring it into
`resolveDispute` and the nightly 0.5%-commission top-up + Finance-Admin low-balance
alert are follow-on slices (kept separate to bound risk).

## Engineering_Spec §7.5 rules

- Initial capitalization: $5,000 USD (configurable via `PlatformConfig`).
- Max per incident: $500 USD (configurable).
- Max per buyer per year: $2,000 USD (anti-fraud).
- Max per seller per year: 10 incidents.
- Replenishment trigger: balance < $2,000 → alert Finance Admin (follow-on slice).
- Payout flow: buyer refunded **from the insurance fund**; seller paid **from escrow**
  (this slice handles the fund→buyer debit; the escrow→seller side is the existing
  escrow path).

## Data model (new)

```prisma
model PlatformConfig {
  id                 String   @id @default(cuid())
  key                String   @unique
  value              Json
  description        String?
  category           String
  updated_by_user_id String?
  updated_at         DateTime @updatedAt
  created_at         DateTime @default(now())

  @@index([category])
  @@map("platform_config")
}

model InsurancePayout {
  id                 String   @id @default(cuid())
  order_id           String
  dispute_id         String?
  escrow_hold_id     String?
  buyer_user_id      String
  seller_user_id     String?
  amount             Decimal  @db.Decimal(12, 2)
  currency           String   @default("USD")
  balance_after      Decimal  @db.Decimal(12, 2)
  created_by_user_id String?
  created_at         DateTime @default(now())

  @@index([buyer_user_id, created_at])
  @@index([seller_user_id, created_at])
  @@index([order_id])
  @@map("insurance_payouts")
}
```

`InsurancePayout` deliberately stores actor/buyer/seller/order/dispute as plain indexed
string ids without Prisma relations — the same pattern `audit_log` uses — so the
migration stays focused and the huge `User`/`Order` models gain no back-relations.

## Config keys (seeded, category `insurance`)

| key | value |
|---|---|
| `insurance_fund.balance` | `5000.00` |
| `insurance_fund.currency` | `"USD"` |
| `insurance_fund.max_per_incident` | `500` |
| `insurance_fund.max_per_buyer_year` | `2000` |
| `insurance_fund.max_per_seller_year_incidents` | `10` |
| `insurance_fund.replenish_threshold` | `2000` |

## Domain function

`packages/domain/src/insurance.ts`:

```
payInsuranceClaim(db, {
  orderId, disputeId?, escrowHoldId?, buyerUserId, sellerUserId?, amount,
  currency?, actorUserId?, now?,
}): Promise<InsuranceClaimResult>
```

`InsuranceClaimResult = { ok: true; payoutId; balanceAfter } | { ok: false; reason }`
where `reason ∈ { 'invalid_amount', 'over_per_incident_cap', 'insufficient_fund',
'over_buyer_year_cap', 'over_seller_year_limit' }`.

Algorithm (single `$transaction`). Cheap, pure checks run before the balance check;
the first violated cap is the returned `reason` (no state is mutated on any rejection):
1. Reject `amount ≤ 0` (`invalid_amount`) — before opening the transaction.
2. `SELECT ... FOR UPDATE` the `insurance_fund.balance` config row so concurrent
   claims serialize (no double-spend of the fund); assert the row exists.
3. Reject `amount > max_per_incident` (`over_per_incident_cap`).
4. Sum this buyer's `InsurancePayout.amount` over the trailing 365 days; reject if
   `+ amount > max_per_buyer_year` (`over_buyer_year_cap`).
5. Count this seller's `InsurancePayout` rows over the trailing 365 days; reject if
   `+ 1 > max_per_seller_year_incidents` (`over_seller_year_limit`).
6. Reject `amount > balance` (`insufficient_fund`) — the fund-sufficiency check runs
   LAST, after the cheap request-level caps.
7. On pass: decrement `insurance_fund.balance`, insert an `InsurancePayout` row
   (`balance_after` = new balance), write an `audit_log` row (`action =
   'insurance.payout'`). Return `{ ok, payoutId, balanceAfter }`.

Money is computed in integer cents internally to avoid float drift. The balance
(money-of-record) is stored as a fixed-2dp **string** in the JSON config value, never a
JSON float; ledger amounts are `Decimal`.

## Out of scope (follow-on slices)

- Wiring `payInsuranceClaim` into `resolveDispute`'s `INSURANCE_PAYOUT` branch.
- Nightly 0.5%-of-commission top-up worker.
- Finance-Admin low-balance alert.
- Admin UI to view/adjust the fund.

## Testing (real DB, `apps/web/__tests__/insurance-fund.test.ts`)

RED → GREEN on `payInsuranceClaim`:
1. Happy path: debits the fund by the amount; balance_after correct; ledger row written;
   audit row written.
2. `invalid_amount` (≤ 0) rejected, no debit.
3. `over_per_incident_cap` (> $500) rejected, no debit.
4. `insufficient_fund` (amount > balance) rejected, no debit.
5. `over_buyer_year_cap`: prior payouts to the same buyer summing near $2,000 block the
   next.
6. `over_seller_year_limit`: 10 prior incidents for a seller block the 11th.
7. Concurrency/serialization: the `FOR UPDATE` lock prevents two parallel claims from
   overdrawing (assert final balance never negative).

Each test seeds/raises the fund balance to a known value in `beforeEach` and cleans its
`InsurancePayout` rows, so runs are hermetic.

## Verification

`migrate dev` (dev) + apply to test, then type-check · lint ·
`pnpm --filter @vendoora/web test` · build · code-reviewer · PR through 10-stage CI.
