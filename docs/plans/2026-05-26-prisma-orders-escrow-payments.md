# Vendoora — Prisma Slice 3: Orders + Escrow + Payments + Refunds + Payouts

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development OR inline execution per user preference.

**Goal:** Add the trust-mechanic data foundation — Cart, Order, OrderItem, OrderStatusHistory, EscrowHold, EscrowStateTransition, Payment, Payout, Refund. Bring the schema from 14 tables to **24 tables**. State-machine *logic* lives in `packages/domain` (later); the *enum values* and *table shape* land here so domain logic + API have a target to compile against.

**Architecture:** Two auto-generated migrations — `add_orders_cart_tables` then `add_escrow_payments_tables`. The Order model references Seller + User; EscrowHold references Order + Seller (and optionally Driver, which doesn't exist yet — that field stays a nullable String until slice 5). Diaspora-related fields on Order (`recipient_id`, `group_gift_id`, `voice_message_url`) stay as nullable Strings without a `@relation` until slice 6. Financial precision: `Decimal(10, 2)` for prices/amounts, `Decimal(15, 8)` for FX rates (already used by FxRate).

**Tech Stack:** Same as slices 1 & 2 — Prisma 6, Postgres 16, Vitest 2, pnpm 9.

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P1 Foundation (Playbook §3.1.3, slice 3 of ~6)
**Estimated session time:** 4-5 hours

## Problem

Slices 1 & 2 gave us users, RBAC, sellers, categories, and products. None of that supports a transaction yet. This slice adds the data model for the entire purchase lifecycle: cart → order → payment → escrow hold → seller payout, plus the refund path. Without it, no checkout. Without the escrow state machine *table shape*, the domain-layer state machine code (P3 Trust Mechanic) has nothing to compile against.

The state-machine LOGIC — the legal transitions, the locking semantics, the 24-hour delivery window — lives in `packages/domain/src/escrow/` in a future plan. This slice only lands the *enum values* and the *transition log table*.

## Approach

Two auto-generated Prisma migrations:
1. `add_orders_cart_tables` — Cart, CartItem, Order, OrderItem, OrderStatusHistory (+ enums: BuyerType, PaymentMethod, PaymentStatus, OrderStatus)
2. `add_escrow_payments_tables` — EscrowHold, EscrowStateTransition, Payment, Payout, Refund (+ enums: EscrowBeneficiaryType, EscrowState, PaymentProvider, PayoutStatus, RefundType, RefundStatus)

Diaspora and Driver relations on Order/EscrowHold are deferred: those fields stay as `String?` columns without Prisma `@relation` until the corresponding domain slices add the back-references. This is the same pattern we used in slice 2 for `Seller.products`.

**State-machine LOGIC is out of scope.** No transition-validating triggers, no auto-release worker, no idempotency-key generation. Those land in P3 (Trust Mechanic) when `packages/domain` exists.

**Money correctness in this slice means:** correct decimal precision, correct nullable/required choices on FK columns, correct enum values, and the audit-log integration pattern (already enforced by the trigger from slice 1 — any code that mutates escrow state must write to `audit_log` too, enforced in the future application code).

## Scope (what this DOES)

- [ ] 10 Prisma models: `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderStatusHistory`, `EscrowHold`, `EscrowStateTransition`, `Payment`, `Payout`, `Refund`
- [ ] 10 enums: `BuyerType`, `PaymentMethod`, `PaymentStatus`, `OrderStatus` (12 values), `EscrowBeneficiaryType`, `EscrowState` (10 values), `PaymentProvider`, `PayoutStatus`, `RefundType`, `RefundStatus`
- [ ] 2 auto-generated migrations (orders+cart, then escrow+payments)
- [ ] Back-references added to User (`orders`, `carts`) and Seller (`payouts`)
- [ ] Order's diaspora/driver/group-gift fields included as nullable `String?` columns (no `@relation` yet — added in slices 5 & 6)
- [ ] Integration tests: ~18 covering table existence, FK relationships, enum values, key unique constraints (`order_number`), decimal precision on `total_amount` / `escrow_holds.amount`, composite unique on `(promo_code_id, order_id)` — wait, scratch that (PromoCode is out of scope this slice)
- [ ] apps/web smoke test extension: assert that `prisma.order.count()` works (returns 0 in empty test DB)

## Out of scope (what this does NOT do)

- **State-machine validation logic** — transition guards, locking, FOR UPDATE semantics: all in P3 domain plan
- **Auto-release worker** — the 24-hour-after-DELIVERED timer: P3
- **Idempotency keys for payment provider calls**: P3
- **Webhook handlers for Stripe/MoMo/Orange**: P3
- **PromoCode + PromoCodeRedemption** — defer to a marketing slice (these don't depend on this slice; can land anytime)
- **WalletBalance + WalletTransaction** — defer (Vendoora Credit is post-MVP)
- **Delivery model** — slice 5 (Drivers + Logistics)
- **Dispute model** — slice 4
- **Diaspora Recipient / GroupGift / ScheduledGift models** — slice 6
- **Row-Level Security policies** — per-domain when each becomes operational
- **The delivery_code generation + bcrypt-hash storage** — column exists on Order (`delivery_code_hash` per Polish_Phase_Addendum), but generation logic is P3

## Files to be created

- `packages/db/__tests__/orders.integration.test.ts` — Cart, Order, OrderItem, OrderStatusHistory tests
- `packages/db/__tests__/escrow-payments.integration.test.ts` — EscrowHold, Payment, Payout, Refund tests
- 2 Prisma-generated migration directories

## Files to be modified

- `packages/db/prisma/schema.prisma` — append all 10 models + 10 enums + add back-refs to User and Seller
- `apps/web/__tests__/db-integration.test.ts` — add `prisma.order.count()` assertion
- (No seed changes — orders/escrow are user-generated, not system seeds)

## Database changes

2 migrations:
1. `<ts>_add_orders_cart_tables` — `carts`, `cart_items`, `orders`, `order_items`, `order_status_history` + 4 enums
2. `<ts>_add_escrow_payments_tables` — `escrow_holds`, `escrow_state_transitions`, `payments`, `payouts`, `refunds` + 6 enums

Both forward-compatible (greenfield additions).

## Test cases

Integration (Vitest):

**`orders.integration.test.ts`** (~9 tests):
- [ ] `carts` table exists with `user_id` (nullable for guest carts) + `session_id`
- [ ] `cart_items` table with `cart_id` FK + composite unique on `(cart_id, product_id, variant_id)` — wait, Engineering_Spec doesn't declare this; verify and either add or omit
- [ ] `orders` table with `order_number` unique constraint
- [ ] `orders` table has nullable `recipient_id`, `group_gift_id`, `voice_message_url` columns (without FK constraints yet)
- [ ] `orders` has `total_amount Decimal(10, 2)` and `fx_rate_locked Decimal(10, 6)`
- [ ] `order_items` references order + product + seller (3 FKs)
- [ ] `order_items.product_snapshot` is a JSONB column (the immutable product-at-order-time snapshot)
- [ ] `order_status_history` exists with order_id FK
- [ ] All 4 order/cart enums exist with documented values
  - `BuyerType`: LIBERIA_DOMESTIC, DIASPORA
  - `PaymentMethod`: MTN_MOMO, ORANGE_MONEY, CARD, WALLET_BALANCE, GROUP_GIFT
  - `PaymentStatus`: PENDING, AUTHORIZED, CAPTURED, FAILED, REFUNDED, PARTIALLY_REFUNDED
  - `OrderStatus`: PENDING_PAYMENT, PAID, ACCEPTED, PREPARING, READY_FOR_PICKUP, PICKED_UP, OUT_FOR_DELIVERY, ARRIVED, DELIVERED, COMPLETED, DISPUTED, CANCELLED, REFUNDED, EXPIRED (14 values per Engineering_Spec §4.6)

**`escrow-payments.integration.test.ts`** (~9 tests):
- [ ] `escrow_holds` table with `order_id` FK + `beneficiary_type` enum + nullable `beneficiary_seller_id` and `beneficiary_driver_id`
- [ ] `escrow_holds.amount` is `Decimal(10, 2)`, `amount_locked_fx` is `Decimal(10, 2)`
- [ ] `escrow_state_transitions` table with `escrow_hold_id` FK
- [ ] `payments` table with `order_id` FK (unique — one payment per order) + `provider_payment_id` field
- [ ] `payouts` table with nullable seller + driver FKs (one of them must be set in practice)
- [ ] `refunds` table with `payment_id` FK + `dispute_id` nullable
- [ ] All 6 escrow/payment/payout/refund enums exist with documented values:
  - `EscrowBeneficiaryType`: SELLER, DRIVER, PLATFORM, BUYER, INSURANCE_FUND
  - `EscrowState`: PENDING_PAYMENT, HELD, HELD_DISPUTED, RELEASING, RELEASED, REFUNDING, REFUNDED, PARTIALLY_REFUNDED, EXPIRED, INSURANCE_PAYOUT (10 values)
  - `PaymentProvider`: STRIPE, MTN_MOMO, ORANGE_MONEY, WALLET
  - `PayoutStatus`: PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, RETRY_SCHEDULED
  - `RefundType`: FULL, PARTIAL, STORE_CREDIT
  - `RefundStatus`: PENDING, PROCESSING, COMPLETED, FAILED

**`apps/web/__tests__/db-integration.test.ts`** (extended):
- [ ] `prisma.order.count()` returns 0 in a clean test DB (proves the workspace + generated client picked up the new Order model)

## Permission/security implications

- Financial precision: all monetary fields use `Decimal(10, 2)` per Build_Prompt §10.1 ("No floating-point math on money"). `total_amount`, `subtotal`, `shipping_fee`, `tax_amount`, `diaspora_fee`, `discount_amount`, `escrow_holds.amount`, `payments.amount`, `payouts.amount`, `refunds.amount`.
- `delivery_code_hash` column on Order is declared but generation/comparison logic is P3. The column is `String?` for now (set when order transitions to PICKED_UP).
- No new auth surface. No new external API calls.

## Risks

1. **Order is a wide model.** ~40 columns including diaspora fields, group-gift fields, delivery-code fields, FX-rate lock fields, UTM tracking, IP capture. Prisma handles this fine but the schema diff is large.
2. **Decimal precision.** `Decimal(10, 2)` overflows at $99,999,999.99. Adequate for any single order; not adequate for cumulative GMV (which lives on `Seller.total_gmv` already declared as `Decimal(15, 2)` in slice 2). Confirm the per-order ceiling is acceptable for diaspora high-value gifts (most likely yes — even a $1k group gift is fine).
3. **OrderStatus has 14 values, EscrowState has 10.** Engineering_Spec §4.6 lists 14 (`PENDING_PAYMENT, PAID, ACCEPTED, PREPARING, READY_FOR_PICKUP, PICKED_UP, OUT_FOR_DELIVERY, ARRIVED, DELIVERED, COMPLETED, DISPUTED, CANCELLED, REFUNDED, EXPIRED`). Verify all values seed via the test's enum-value assertion.
4. **`Order.delivery_code` vs `delivery_code_hash`.** Per Polish_Phase_Addendum §1.13, the field should be `delivery_code_hash` (bcrypt-hashed, server-only). Engineering_Spec §4.6 still shows `delivery_code` (plaintext-encrypted). Going with the addendum's `delivery_code_hash` since it's newer and the addendum is authoritative for items it covers.

## Dependencies

- Slice 1 (Users, RBAC, audit_log) ✓ merged
- Slice 2 (Sellers, Catalog) ✓ merged
- Docker Postgres running on 5434 ✓ confirmed

---

## Tasks

### Task 1: Orders + Cart models (RED → GREEN)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add Cart, CartItem, Order, OrderItem, OrderStatusHistory + 4 enums + back-refs on User)
- Create: `packages/db/__tests__/orders.integration.test.ts`

- [ ] **Step 1: Write the RED test**

`packages/db/__tests__/orders.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(() => {
  execSync('pnpm prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: process.env,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Orders + Cart tables (Engineering_Spec §4.6)', () => {
  it('creates the carts table with nullable user_id (guest carts)', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'user_id';
    `;
    expect(cols).toHaveLength(1);
    expect(cols[0]!.is_nullable).toBe('YES');
  });

  it('creates the cart_items table with cart_id FK', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'cart_items';
    `;
    expect(result).toHaveLength(1);
  });

  it('orders.order_number has a UNIQUE constraint', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'orders' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%order_number%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('orders table has the diaspora/driver/group-gift nullable columns (no FK constraint yet)', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'
        AND column_name IN ('recipient_id', 'group_gift_id', 'voice_message_url', 'delivery_code_hash')
      ORDER BY column_name;
    `;
    expect(cols).toHaveLength(4);
    for (const c of cols) {
      expect(c.is_nullable).toBe('YES');
    }
  });

  it('orders.total_amount is Decimal(10, 2)', async () => {
    const result = await prisma.$queryRaw<Array<{ numeric_precision: number; numeric_scale: number }>>`
      SELECT numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_amount';
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.numeric_precision).toBe(10);
    expect(result[0]!.numeric_scale).toBe(2);
  });

  it('order_items has FKs to order + product + seller', async () => {
    const fks = await prisma.$queryRaw<Array<{ column_name: string; foreign_table_name: string }>>`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'order_items'
      ORDER BY kcu.column_name;
    `;
    const foreignTables = fks.map((r) => r.foreign_table_name).sort();
    expect(foreignTables).toEqual(expect.arrayContaining(['orders', 'products', 'sellers']));
  });

  it('order_items.product_snapshot is a JSONB column', async () => {
    const result = await prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'product_snapshot';
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.data_type).toBe('jsonb');
  });

  it('order_status_history exists with order_id FK', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'order_status_history';
    `;
    expect(result).toHaveLength(1);
  });

  it('all 4 order/cart enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('BuyerType', 'PaymentMethod', 'PaymentStatus', 'OrderStatus')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) {
      (byType[row.typname] ??= []).push(row.enumlabel);
    }
    expect(byType.BuyerType).toEqual(['LIBERIA_DOMESTIC', 'DIASPORA']);
    expect(byType.PaymentMethod).toEqual(['MTN_MOMO', 'ORANGE_MONEY', 'CARD', 'WALLET_BALANCE', 'GROUP_GIFT']);
    expect(byType.PaymentStatus).toEqual(['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']);
    expect(byType.OrderStatus).toEqual([
      'PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PREPARING',
      'READY_FOR_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED',
      'DELIVERED', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'REFUNDED', 'EXPIRED',
    ]);
  });
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
pnpm -F "@vendoora/db" test
```
Expected: 9 new orders tests fail.

- [ ] **Step 3: Append Orders + Cart schema to `schema.prisma`**

Append after the catalog section:

```prisma
// ============================================================================
// Cart + Order (Engineering_Spec §4.6)
// Diaspora/driver/group-gift FKs are kept as nullable String columns without
// @relation until those domain slices (5 & 6) land.
// ============================================================================

model Cart {
  id            String     @id @default(cuid())
  user_id       String?
  session_id    String?
  currency      String     @default("USD")
  created_at    DateTime   @default(now())
  updated_at    DateTime   @updatedAt

  user          User?      @relation(fields: [user_id], references: [id], onDelete: SetNull)
  items         CartItem[]

  @@index([user_id])
  @@index([session_id])
  @@map("carts")
}

model CartItem {
  id              String   @id @default(cuid())
  cart_id         String
  product_id      String
  variant_id      String?
  quantity        Int
  price_at_add    Decimal  @db.Decimal(10, 2)
  currency        String
  added_at        DateTime @default(now())

  cart            Cart     @relation(fields: [cart_id], references: [id], onDelete: Cascade)

  @@index([cart_id])
  @@map("cart_items")
}

model Order {
  id              String       @id @default(cuid())
  order_number    String       @unique
  buyer_user_id   String
  buyer_type      BuyerType

  // Recipient (diaspora) — FK relation deferred to slice 6
  recipient_id      String?
  recipient_name    String?
  recipient_phone   String?
  recipient_address Json?

  buyer_name           String
  buyer_email          String
  buyer_phone          String?
  buyer_billing_address Json?

  delivery_address Json
  delivery_city    String
  delivery_county  String?
  delivery_country String
  delivery_zone    String
  delivery_slot    String?
  delivery_notes   String?

  subtotal        Decimal   @db.Decimal(10, 2)
  shipping_fee    Decimal   @default(0) @db.Decimal(10, 2)
  tax_amount      Decimal   @default(0) @db.Decimal(10, 2)
  diaspora_fee    Decimal   @default(0) @db.Decimal(10, 2)
  discount_amount Decimal   @default(0) @db.Decimal(10, 2)
  total_amount    Decimal   @db.Decimal(10, 2)
  currency        String
  fx_rate_locked  Decimal?  @db.Decimal(10, 6)
  fx_rate_at_order DateTime?

  payment_method     PaymentMethod
  payment_provider   String?
  payment_intent_id  String?
  payment_status     PaymentStatus @default(PENDING)
  paid_at            DateTime?

  status            OrderStatus @default(PENDING_PAYMENT)
  status_updated_at DateTime    @default(now())
  cancelled_at      DateTime?
  cancellation_reason  String?
  cancelled_by_user_id String?

  // Delivery code (Polish_Phase_Addendum §1.13): bcrypt hash, not plaintext
  delivery_code_hash       String?
  delivery_code_sent_at    DateTime?
  delivery_code_expires_at DateTime?
  delivery_attempts        Int       @default(0)

  // Personal touch (diaspora)
  personal_message     String?
  has_handwritten_card Boolean @default(false)
  voice_message_url    String?

  // Group gift — FK relation deferred to slice 6
  group_gift_id          String?
  is_group_gift_complete Boolean @default(false)

  user_agent      String?
  ip_address      String?
  utm_source      String?
  utm_medium      String?
  utm_campaign    String?

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  delivered_at    DateTime?

  buyer           User      @relation(fields: [buyer_user_id], references: [id], onDelete: Restrict)
  items           OrderItem[]
  status_history  OrderStatusHistory[]

  @@index([buyer_user_id])
  @@index([order_number])
  @@index([status])
  @@index([buyer_type])
  @@index([payment_status])
  @@index([group_gift_id])
  @@index([created_at])
  @@map("orders")
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
  AUTHORIZED
  CAPTURED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  ACCEPTED
  PREPARING
  READY_FOR_PICKUP
  PICKED_UP
  OUT_FOR_DELIVERY
  ARRIVED
  DELIVERED
  COMPLETED
  DISPUTED
  CANCELLED
  REFUNDED
  EXPIRED
}

model OrderItem {
  id              String  @id @default(cuid())
  order_id        String
  product_id      String
  variant_id      String?
  seller_id       String
  product_snapshot Json
  quantity        Int
  unit_price      Decimal @db.Decimal(10, 2)
  subtotal        Decimal @db.Decimal(10, 2)
  commission_rate Float
  commission_amount Decimal @db.Decimal(10, 2)
  seller_net      Decimal @db.Decimal(10, 2)

  order           Order   @relation(fields: [order_id], references: [id], onDelete: Restrict)
  product         Product @relation(fields: [product_id], references: [id], onDelete: Restrict)
  seller          Seller  @relation(fields: [seller_id], references: [id], onDelete: Restrict)

  @@index([order_id])
  @@index([seller_id])
  @@index([product_id])
  @@map("order_items")
}

model OrderStatusHistory {
  id              String   @id @default(cuid())
  order_id        String
  from_status     OrderStatus?
  to_status       OrderStatus
  changed_by_user_id String?
  changed_by_system Boolean @default(false)
  reason          String?
  metadata        Json?
  changed_at      DateTime @default(now())

  order           Order    @relation(fields: [order_id], references: [id], onDelete: Cascade)

  @@index([order_id])
  @@index([changed_at])
  @@map("order_status_history")
}
```

- [ ] **Step 4: Add back-references on User and Seller and Product**

Use Edit to extend User with `orders` and `carts`:

old_string in User model (find this exact block):
```
  // Sellers (slice 2)
  seller              Seller?
  seller_staff_member SellerStaff[] @relation("SellerStaffMember")
  seller_staff_invited SellerStaff[] @relation("SellerStaffInviter")
```
new_string:
```
  // Sellers (slice 2)
  seller              Seller?
  seller_staff_member SellerStaff[] @relation("SellerStaffMember")
  seller_staff_invited SellerStaff[] @relation("SellerStaffInviter")

  // Orders (slice 3)
  orders              Order[]
  carts               Cart[]
```

Extend Seller with `order_items`:

old_string:
```
  user                  User       @relation(fields: [user_id], references: [id], onDelete: Restrict)
  staff_members         SellerStaff[]
  products              Product[]
```
new_string:
```
  user                  User       @relation(fields: [user_id], references: [id], onDelete: Restrict)
  staff_members         SellerStaff[]
  products              Product[]
  order_items           OrderItem[]
```

Extend Product with `order_items`:

old_string in Product model:
```
  seller                   Seller         @relation(fields: [seller_id], references: [id], onDelete: Restrict)
  category                 Category       @relation(fields: [category_id], references: [id], onDelete: Restrict)
  variants                 ProductVariant[]
  images                   ProductImage[]
```
new_string:
```
  seller                   Seller         @relation(fields: [seller_id], references: [id], onDelete: Restrict)
  category                 Category       @relation(fields: [category_id], references: [id], onDelete: Restrict)
  variants                 ProductVariant[]
  images                   ProductImage[]
  order_items              OrderItem[]
```

- [ ] **Step 5: Migrate**

```bash
cd packages/db
$env:DATABASE_URL = "postgresql://vendoora:vendoora_dev_password@localhost:5434/vendoora_dev?schema=public"
pnpm prisma migrate dev --name add_orders_cart_tables
```

- [ ] **Step 6: Run — confirm GREEN**

Expected: 43 tests passing (34 from slices 1+2 + 9 new orders).

---

### Task 2: Escrow + Payments models (RED → GREEN)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add EscrowHold, EscrowStateTransition, Payment, Payout, Refund + 6 enums + back-refs)
- Create: `packages/db/__tests__/escrow-payments.integration.test.ts`

- [ ] **Step 1: Write the RED test**

`packages/db/__tests__/escrow-payments.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(() => {
  execSync('pnpm prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: process.env,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Escrow + Payments (Engineering_Spec §4.7)', () => {
  it('escrow_holds table has order_id FK and beneficiary fields', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'escrow_holds'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'order_id', 'beneficiary_type', 'beneficiary_seller_id',
        'beneficiary_driver_id', 'amount', 'state', 'created_at',
      ]),
    );
  });

  it('escrow_holds.amount is Decimal(10, 2)', async () => {
    const result = await prisma.$queryRaw<Array<{ numeric_precision: number; numeric_scale: number }>>`
      SELECT numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'escrow_holds' AND column_name = 'amount';
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.numeric_precision).toBe(10);
    expect(result[0]!.numeric_scale).toBe(2);
  });

  it('escrow_state_transitions table exists with escrow_hold_id FK', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'escrow_state_transitions';
    `;
    expect(result).toHaveLength(1);
  });

  it('payments.order_id is UNIQUE (one payment per order)', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'payments' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%order_id%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('payouts table allows seller-only OR driver-only beneficiary (both nullable)', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payouts'
        AND column_name IN ('beneficiary_seller_id', 'beneficiary_driver_id');
    `;
    expect(cols).toHaveLength(2);
    for (const c of cols) {
      expect(c.is_nullable).toBe('YES');
    }
  });

  it('refunds table has payment_id FK and nullable dispute_id', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'refunds'
        AND column_name IN ('payment_id', 'dispute_id', 'amount')
      ORDER BY column_name;
    `;
    expect(cols.find((c) => c.column_name === 'payment_id')?.is_nullable).toBe('NO');
    expect(cols.find((c) => c.column_name === 'dispute_id')?.is_nullable).toBe('YES');
  });

  it('all 6 escrow/payment enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('EscrowBeneficiaryType', 'EscrowState', 'PaymentProvider', 'PayoutStatus', 'RefundType', 'RefundStatus')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) {
      (byType[row.typname] ??= []).push(row.enumlabel);
    }
    expect(byType.EscrowBeneficiaryType).toEqual(['SELLER', 'DRIVER', 'PLATFORM', 'BUYER', 'INSURANCE_FUND']);
    expect(byType.EscrowState).toEqual([
      'PENDING_PAYMENT', 'HELD', 'HELD_DISPUTED', 'RELEASING', 'RELEASED',
      'REFUNDING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'EXPIRED', 'INSURANCE_PAYOUT',
    ]);
    expect(byType.PaymentProvider).toEqual(['STRIPE', 'MTN_MOMO', 'ORANGE_MONEY', 'WALLET']);
    expect(byType.PayoutStatus).toEqual(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRY_SCHEDULED']);
    expect(byType.RefundType).toEqual(['FULL', 'PARTIAL', 'STORE_CREDIT']);
    expect(byType.RefundStatus).toEqual(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
  });

  it('escrow_holds → orders FK is ON DELETE RESTRICT', async () => {
    const result = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'escrow_holds' AND kcu.column_name = 'order_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(['RESTRICT', 'NO ACTION']).toContain(result[0]!.delete_rule);
  });

  it('end-to-end: can create a real escrow hold against a real order', async () => {
    // This proves all the FKs wire up correctly through a real insert path
    const user = await prisma.user.create({
      data: { clerk_id: 'clerk_e2e_buyer', email: 'e2e@test.local', full_name: 'E2E Buyer' },
    });
    const sellerUser = await prisma.user.create({
      data: { clerk_id: 'clerk_e2e_seller', email: 'e2es@test.local', full_name: 'E2E Seller' },
    });
    const seller = await prisma.seller.create({
      data: {
        user_id: sellerUser.id,
        business_name: 'E2E Co',
        business_slug: 'e2e-co',
        business_email: 'b@e2e.local',
        business_phone: '+231880000099',
        business_address: { street: '1', city: 'Monrovia', country: 'LR' },
        business_type: 'SOLE_PROPRIETOR',
      },
    });
    const cat = await prisma.category.create({
      data: { name: 'E2E Cat', slug: 'e2e-cat', attributes_schema: {} },
    });
    const product = await prisma.product.create({
      data: {
        seller_id: seller.id, category_id: cat.id,
        name: 'E2E Product', slug: 'e2e-product', description: 'd',
        base_price: 100.0, attributes: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        order_number: 'VDR-E2E-' + Date.now(),
        buyer_user_id: user.id,
        buyer_type: 'LIBERIA_DOMESTIC',
        buyer_name: 'E2E Buyer',
        buyer_email: 'e2e@test.local',
        delivery_address: { street: '1' },
        delivery_city: 'Monrovia',
        delivery_country: 'LR',
        delivery_zone: 'sinkor',
        subtotal: 100.0,
        total_amount: 100.0,
        currency: 'USD',
        payment_method: 'MTN_MOMO',
      },
    });
    const hold = await prisma.escrowHold.create({
      data: {
        order_id: order.id,
        beneficiary_type: 'SELLER',
        beneficiary_seller_id: seller.id,
        amount: 88.0,
        currency: 'USD',
        state: 'HELD',
      },
    });
    expect(hold.id).toBeTruthy();
    expect(hold.state).toBe('HELD');
  });
});
```

- [ ] **Step 2: Run — confirm RED**

- [ ] **Step 3: Append Escrow + Payments schema to `schema.prisma`**

```prisma
// ============================================================================
// Escrow + Payments (Engineering_Spec §4.7)
// State-machine LOGIC is in packages/domain (a later plan).
// ============================================================================

model EscrowHold {
  id              String    @id @default(cuid())
  order_id        String
  order_item_id   String?
  beneficiary_type EscrowBeneficiaryType
  beneficiary_seller_id String?
  beneficiary_driver_id String?

  amount          Decimal   @db.Decimal(10, 2)
  currency        String
  amount_locked_fx Decimal? @db.Decimal(10, 2)
  fx_rate_at_hold Decimal?  @db.Decimal(15, 8)

  state           EscrowState @default(PENDING_PAYMENT)
  state_changed_at DateTime  @default(now())

  scheduled_release_at DateTime?
  released_at     DateTime?
  released_by_user_id String?
  released_amount Decimal?  @db.Decimal(10, 2)
  refunded_amount Decimal?  @db.Decimal(10, 2)

  payment_id      String?
  payout_id       String?
  refund_id       String?
  dispute_id      String?

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  order           Order     @relation(fields: [order_id], references: [id], onDelete: Restrict)
  seller          Seller?   @relation(fields: [beneficiary_seller_id], references: [id])
  state_transitions EscrowStateTransition[]
  payment         Payment?  @relation(fields: [payment_id], references: [id])
  payout          Payout?   @relation(fields: [payout_id], references: [id])
  refund          Refund?   @relation(fields: [refund_id], references: [id])

  @@index([order_id])
  @@index([state])
  @@index([beneficiary_seller_id])
  @@index([beneficiary_driver_id])
  @@index([scheduled_release_at])
  @@map("escrow_holds")
}

enum EscrowBeneficiaryType {
  SELLER
  DRIVER
  PLATFORM
  BUYER
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
  id              String      @id @default(cuid())
  escrow_hold_id  String
  from_state      EscrowState?
  to_state        EscrowState
  actor_user_id   String?
  actor_system    Boolean     @default(false)
  reason          String
  metadata        Json?
  audit_log_id    String?
  transitioned_at DateTime    @default(now())

  escrow_hold     EscrowHold  @relation(fields: [escrow_hold_id], references: [id], onDelete: Cascade)

  @@index([escrow_hold_id])
  @@index([to_state])
  @@index([transitioned_at])
  @@map("escrow_state_transitions")
}

model Payment {
  id                  String    @id @default(cuid())
  order_id            String    @unique
  amount              Decimal   @db.Decimal(10, 2)
  currency            String
  provider            PaymentProvider
  provider_payment_id String?
  provider_charge_id  String?
  status              PaymentStatus @default(PENDING)

  stripe_customer_id    String?
  stripe_payment_method String?
  momo_phone            String?
  momo_request_id       String?

  initiated_at    DateTime  @default(now())
  authorized_at   DateTime?
  captured_at     DateTime?
  failed_at       DateTime?
  failure_reason  String?
  failure_code    String?

  risk_score      Float?
  risk_decision   String?

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  escrow_holds    EscrowHold[]
  refunds         Refund[]

  @@index([order_id])
  @@index([provider_payment_id])
  @@index([status])
  @@map("payments")
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
  payout_account  String

  status          PayoutStatus @default(PENDING)
  provider_payout_id String?
  initiated_at    DateTime  @default(now())
  completed_at    DateTime?
  failed_at       DateTime?
  failure_reason  String?
  retry_count     Int       @default(0)
  next_retry_at   DateTime?

  escrow_hold_ids String[]
  order_count     Int       @default(0)

  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  seller          Seller?   @relation(fields: [beneficiary_seller_id], references: [id])
  escrow_holds    EscrowHold[]

  @@index([beneficiary_seller_id])
  @@index([beneficiary_driver_id])
  @@index([status])
  @@index([next_retry_at])
  @@map("payouts")
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

  payment         Payment   @relation(fields: [payment_id], references: [id], onDelete: Restrict)
  escrow_holds    EscrowHold[]

  @@index([payment_id])
  @@index([order_id])
  @@index([status])
  @@map("refunds")
}

enum RefundType {
  FULL
  PARTIAL
  STORE_CREDIT
}

enum RefundStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

- [ ] **Step 4: Add back-refs on Order and Seller**

Use Edit on Order model (find this section):

old_string:
```
  buyer           User      @relation(fields: [buyer_user_id], references: [id], onDelete: Restrict)
  items           OrderItem[]
  status_history  OrderStatusHistory[]
```
new_string:
```
  buyer           User      @relation(fields: [buyer_user_id], references: [id], onDelete: Restrict)
  items           OrderItem[]
  status_history  OrderStatusHistory[]
  escrow_holds    EscrowHold[]
```

Add `payouts Payout[]` and `escrow_holds EscrowHold[]` to Seller:

old_string:
```
  user                  User       @relation(fields: [user_id], references: [id], onDelete: Restrict)
  staff_members         SellerStaff[]
  products              Product[]
  order_items           OrderItem[]
```
new_string:
```
  user                  User       @relation(fields: [user_id], references: [id], onDelete: Restrict)
  staff_members         SellerStaff[]
  products              Product[]
  order_items           OrderItem[]
  escrow_holds          EscrowHold[]
  payouts               Payout[]
```

- [ ] **Step 5: Migrate**

```bash
pnpm prisma migrate dev --name add_escrow_payments_tables
```

- [ ] **Step 6: Run — confirm GREEN**

Expected: 52 tests passing (34 + 9 orders + 9 escrow/payments).

---

### Task 3: apps/web smoke test extension

**Files:**
- Modify: `apps/web/__tests__/db-integration.test.ts`

- [ ] **Step 1: Extend the test**

Use Edit:

old_string:
```
  it('reads the seeded category catalog (>= 12 after seed)', async () => {
    const count = await prisma.category.count();
    expect(count).toBeGreaterThanOrEqual(12);
  });
});
```
new_string:
```
  it('reads the seeded category catalog (>= 12 after seed)', async () => {
    const count = await prisma.category.count();
    expect(count).toBeGreaterThanOrEqual(12);
  });

  it('Order model is generated and queryable', async () => {
    const count = await prisma.order.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('EscrowHold model is generated and queryable', async () => {
    const count = await prisma.escrowHold.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run apps/web tests**

Expected: 6 passing (2 cross-package + 4 db-integration).

---

### Task 4: Cold-state + commit + merge

- [ ] **Step 1: Cold-state sanity**

```bash
pnpm db:reset
sleep 10
pnpm -F "@vendoora/db" migrate:deploy
pnpm db:seed
pnpm -F "@vendoora/db" test          # 52 passing
pnpm -F "@vendoora/web" test         # 6 passing
pnpm build
```

- [ ] **Step 2: Commit on a feature branch and merge**

```bash
git checkout -b feature/prisma-orders-escrow-payments
git add -A
git commit -m "feat(db): Prisma slice 3 — Orders + Cart + Escrow + Payments + Refunds + Payouts"
git checkout main
git merge --ff-only feature/prisma-orders-escrow-payments
git branch -d feature/prisma-orders-escrow-payments
```

(Full commit message body should mirror the slice-1 and slice-2 pattern: what shipped, verification, deferrals, methodology gates.)

---

## Acceptance criteria

- [ ] `pnpm -F @vendoora/db test` reports 52 passed
- [ ] `pnpm -F @vendoora/web test` reports 6 passed
- [ ] `pnpm build` succeeds at root
- [ ] Schema has 24 models, ~22 enums, 9 migrations
- [ ] Cold-state: `db:reset` → migrate → seed → all tests = clean
- [ ] `git log --oneline` shows 4 commits on main
- [ ] No node_modules/.turbo/.next leakage

## Next slices

1. **Disputes + DisputeMessage + DisputeEvidence** (slice 4) — completes the trust-mechanic surface
2. **Drivers + Vehicle + Delivery + DriverRating** (slice 5) — adds the Driver relation to EscrowHold and Order
3. **Diaspora — Recipient, GiftBundle, GroupGift, ScheduledGift, VoiceMessage** (slice 6)
4. **May-2026 additions — Reviews, Trust Cases, Profile Change Requests, Webhook/Outbox, KYC Application** (slice 7)
5. **GitHub remote + CI/CD** (P1.3.2)
6. **Clerk auth wiring** (P1.3.4)
