# Vendoora — Prisma Slice 5: Drivers + Logistics

> **For agentic workers:** Inline execution per user preference.

**Goal:** Add the driver-logistics data model — Driver, Vehicle, Delivery, DriverRating, DeliveryZone + 5 enums. Wire up the deferred `Driver` relations on `EscrowHold.beneficiary_driver_id` and `Payout.beneficiary_driver_id`. Seed 8 Monrovia-area delivery zones. Schema goes from 27 → **32 tables**.

**Architecture:** One migration `add_drivers_logistics_tables`. Driver has a one-to-one with User. Vehicle, Delivery, DriverRating link via Driver. Delivery is the actual physical delivery instance (one Order can have multiple Delivery rows in edge cases — re-deliveries after failed attempts). DeliveryZone is system config (seeded).

**Tech Stack:** Prisma 6, Postgres 16, Vitest 2.

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P1 Foundation (Playbook §3.1.3, slice 5 of ~6)
**Estimated session time:** 3-4 hours

## Problem

Slices 1-4 modeled the buyer/seller/order/dispute spine. Without drivers, no physical handoff can happen. The trust mechanic's 6-digit code is meaningless without a Delivery row that captures the code entry and the proof-of-delivery photo. The escrow's `beneficiary_driver_id` and payout's `beneficiary_driver_id` (from slice 3) are bare `String?` columns waiting for the Driver model to exist.

## Approach

One auto-generated migration. Five models per Engineering_Spec §4.9:
- **Driver** — large model: KYC docs, background check, training, operational location/zone, active delivery count, performance (rating, on-time rate, dispute count, tier), payout config, suspension
- **Vehicle** — license plate / make / model / type, primary-vehicle flag
- **Delivery** — the actual physical handoff: pickup + dropoff coords/ETAs, picked_up/arrived/delivered timestamps, **delivery code entry + attempts**, **proof-of-delivery photo with GPS metadata** (Polish_Phase_Addendum §2.2 driver photo-capture step), distance, driver fee + bonus + tip
- **DriverRating** — buyer rates driver post-delivery (1-5 + comment)
- **DeliveryZone** — system config: Monrovia city zones with base fee + estimated delivery hours

Plus 5 enums (BackgroundCheckStatus, DriverOnboardingStatus, DriverTier, VehicleType, DeliveryStatus).

**Upgrades 2 deferred FKs from slice 3:**
- `EscrowHold.beneficiary_driver_id` → `@relation Driver?`
- `Payout.beneficiary_driver_id` → `@relation Driver?`

**Seed 8 delivery zones** (per Polish_Phase_Addendum §2B.6 geography taxonomy):
- Sinkor, Paynesville, Bushrod Island, Old Road, Congo Town, Caldwell (BETA), Gbarnga (BETA), Buchanan (PLANNED)

## Scope (what this DOES)

- [ ] 5 Prisma models + 5 enums
- [ ] One auto-generated migration: `add_drivers_logistics_tables`
- [ ] Upgrade deferred FKs: `EscrowHold.driver` + `Payout.driver`
- [ ] Back-references on User (`driver Driver?`), Order (`deliveries Delivery[]`), Seller (no driver-specific back-ref needed; the FK on Delivery.pickup_seller_id is the canonical link)
- [ ] Seed: 8 delivery zones
- [ ] ~12 integration tests
- [ ] apps/web smoke test: `prisma.driver.count()` + `prisma.deliveryZone.count() >= 8`

## Out of scope

- **Dispatch algorithm** — driver-assignment logic, surge pricing, multi-stop routing — packages/domain (P7 Driver Logistics plan)
- **Real-time location WebSocket** — driver app sends location every 10s — apps/worker + Upstash pub/sub (P7)
- **Background-check provider integration** — manual review for MVP (P7)
- **Driver onboarding flow UI** — apps/web (P7)
- **Insurance/license expiration alerts** — apps/worker scheduled job (P7)
- **Delivery code entry endpoint** — the driver app POSTs the 6-digit code; comparison against `Order.delivery_code_hash` happens in P3 Trust Mechanic
- **Multi-stop routing** — one Delivery row = one pickup → one dropoff in this slice; multi-stop is a future plan

## Test cases (~12)

**`drivers.integration.test.ts`:**
- [ ] `drivers` table with key columns (id, user_id, driver_number, background_check_status, onboarding_status, tier, is_online, current_location_lat/lng)
- [ ] `drivers.driver_number` is UNIQUE
- [ ] `drivers.user_id` is UNIQUE (one driver per user)
- [ ] `vehicles` table with driver_id FK + vehicle_type
- [ ] `deliveries` table with `order_id` + nullable `driver_id` FKs
- [ ] `deliveries.delivery_proof_photo_*` columns (url, lat, lng, taken_at) all present
- [ ] `deliveries.driver_fee` is `Decimal(10, 2)`
- [ ] `driver_ratings.delivery_id` is UNIQUE (one rating per delivery)
- [ ] `delivery_zones` table exists with `name` UNIQUE
- [ ] All 5 enums exist with documented values
- [ ] `escrow_holds.beneficiary_driver_id` now has FK to drivers
- [ ] `payouts.beneficiary_driver_id` now has FK to drivers
- [ ] End-to-end: user → driver → vehicle → delivery linked to existing order

**`drivers-seed.integration.test.ts`:**
- [ ] `delivery_zones` count >= 8 after seed
- [ ] Specific zones present (sinkor, paynesville, bushrod-island, etc.)

**`apps/web/__tests__/db-integration.test.ts`** (extended):
- [ ] `prisma.driver.count()` + `prisma.deliveryZone.count() >= 8`

## Permission/security implications

- `Driver.background_check_status` controls go-online eligibility (PASSED required). Application-layer enforcement in P7.
- `Delivery.delivery_proof_photo_url` lands in Cloudflare R2 (P1.3.7 wiring). The url field is freeform String until then.
- `Driver.current_location_lat/lng` should be purged after 24h per Build_Prompt §11.6 — that's a background job concern (P7), not a schema concern.
- `Delivery.driver_fee + bonus + tip + total` — `Decimal(10, 2)` per Build_Prompt §10.1.

## Risks

1. **`DriverRating.delivery_id @unique`** — one rating per delivery. If a delivery is reassigned mid-flight (driver A picks up, then B takes over), the rating model only tracks the final driver. Acceptable for MVP.
2. **`Delivery.driver_id String?`** — nullable because dispatch happens after order creation. A pending-assignment delivery has no driver yet.
3. **`Vehicle.is_primary Boolean`** — no DB constraint that exactly one vehicle per driver has `is_primary=true`. Application-layer enforcement.

---

## Tasks

### Task 1: Drivers + Vehicle + Delivery + Rating + Zone models (RED → GREEN)

Standard pattern. Write test → confirm RED → append schema + upgrade FKs + add back-refs → migrate → confirm GREEN.

### Task 2: DeliveryZone seed (8 zones)

Append to `packages/db/prisma/seed.ts` with idempotent upserts.

### Task 3: apps/web smoke test extension + cold-state + commit + merge
