# Vendoora — Prisma Slice 2: Sellers + Catalog

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development OR inline execution per user preference. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the second Prisma slice — Seller, SellerStaff, Category, Product, ProductVariant, ProductImage — including the May-2026 product extensions (condition enum, warranty, return policy, authenticity, compare-at-price). Seed 12 Liberian-marketplace categories. Bring the schema from 8 tables to **14 tables**.

**Architecture:** Models added to the same `packages/db/prisma/schema.prisma`. Three new auto-generated migrations (sellers, catalog-base, catalog-extensions) follow the existing ones. Categories self-reference for hierarchy. Products reference Seller + Category. Variants and Images reference Product. The Polish_Phase_Addendum's product condition fields (per Engineering_Spec §4.17) ship in this slice so we never re-migrate every product row later. The condition-immutability-after-first-sale trigger is **deferred to slice 3** when `order_items` exists.

**Tech Stack:** Same as slice 1 — Prisma 6.19.3, Postgres 16, Vitest 2, pnpm 9.

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P1 Foundation (Playbook §3.1.3, slice 2 of ~6)
**Estimated session time:** 3-4 hours

## Problem

Slice 1 gave us users, RBAC, and audit infrastructure. Nothing buyer-facing can be built without sellers and products. This slice adds the catalog spine: seller accounts (with KYC fields), categories (hierarchical), products (with variants, images, the May-2026 condition/warranty/authenticity extensions), and the relationships that wire them together.

Including the May-2026 product extensions now — rather than as a third migration over every existing product row later — costs only a few more fields in this plan and saves an expand-contract dance later.

## Approach

Same pattern as slice 1: three auto-generated Prisma migrations (sellers, catalog-base, catalog-extensions), one test file per domain area, RED-then-GREEN per task. Categories use a self-referential `parent_id` FK for hierarchy. The Product model's enums are all Prisma-native (no separate enum tables) per Engineering_Spec §4.5.

**Per Engineering_Spec §4.17**, every Product row carries `condition`, `condition_note`, `warranty_terms`, `warranty_duration_days`, `return_policy_type`, `return_policy_terms`, `return_window_days`, `authenticity_status`, `authenticity_proof_urls`, `compare_at_price`, and `is_buyer_protection_eligible`. These ship in this slice so the catalog is "complete" for the next visible-progress plans.

**Deferred to slice 3 (Orders):**
- The trigger that makes `Product.condition` immutable after the first sale. It needs to check `EXISTS (SELECT 1 FROM order_items WHERE product_id = ...)` which can't be authored until `order_items` exists. Will land in slice 3 with the same hand-written-migration pattern we used for `audit_log` in slice 1.
- The `pinned_position` field on Product (per Polish_Phase_Addendum §1.16) belongs with the SaaS-tier entitlements work in P4; deferring here.

**Sellers vs Seller "accounts":** A `Seller` row is the business entity. A `User` becomes a seller by having a `Seller` row pointed at them via `user_id`. We seed zero sellers in this slice — they're created via the (future) seller onboarding flow. Categories DO get seeded because they're system data.

## Scope (what this DOES)

- [ ] 6 Prisma models: `Seller`, `SellerStaff`, `Category`, `Product`, `ProductVariant`, `ProductImage`
- [ ] 8 enums: `BusinessType`, `KYCStatus`, `SaasPlan`, `PayoutMethod`, `PayoutSchedule`, `SellerStaffRole`, `ProductStatus`, `ModerationStatus`, `ProductCondition`, `AuthenticityStatus`, `ReturnPolicyType` (the addendum brought in extra enums for product extensions)
- [ ] May-2026 product extensions wired into the `Product` model (condition + note, warranty terms + duration, return policy + window, authenticity + proof URLs, compare-at-price, buyer-protection eligibility)
- [ ] 3 auto-generated migrations: `add_sellers_tables`, `add_catalog_base_tables`, `add_catalog_extensions` (the extensions come last so the migration history is readable as "first the table, then its 2026 additions")
- [ ] Category seed: 12 Liberian-relevant categories with attribute schema stubs (Fashion, Food & Drink, Electronics, Beauty, Home & Garden, Arts & Crafts, Children, Books, Pharmacy, Mobile & Tech, Tools & Hardware, Other)
- [ ] User model gets a `seller Seller?` back-reference (one-to-one)
- [ ] Integration tests: ~15 covering table existence, FK relationships, enum values, hierarchical category reads, seed counts, the unique constraints (seller business_slug, category slug)
- [ ] apps/web smoke test: count categories after seed (should be 12)

## Out of scope (what this does NOT do)

- **Condition-immutability-after-first-sale trigger** — deferred to slice 3 (needs `order_items` table)
- **`pinned_position`** — deferred to P4 (SaaS tier entitlements)
- Orders/Cart/Escrow tables — slice 3
- Disputes/Drivers/Diaspora — later slices
- 6 May-2026 additional domains (Reviews, Trust Cases, Profile Change Requests, Webhook/Outbox, KYC Application) — slice 6
- RLS policies on these tables — per-domain when each domain lands operationally
- Seeding sample sellers / sample products — onboarding flow creates real ones
- Cloudflare R2 wiring for image storage — P1.3.7 (observability/infra)
- Product full-text search (`@@fulltext`) — Engineering_Spec §4.5 declares it but Postgres doesn't support `@@fulltext` natively in Prisma yet; we add a `tsvector` column + GIN index in a follow-up plan when search lands

## Files to be created

`packages/db/`:
- `__tests__/sellers.integration.test.ts` — Seller, SellerStaff tests
- `__tests__/catalog.integration.test.ts` — Category, Product, Variant, Image tests
- `__tests__/catalog-seed.integration.test.ts` — verifies 12 categories
- 3 Prisma-generated migration directories under `prisma/migrations/`

## Files to be modified

- `packages/db/prisma/schema.prisma` — append Seller + Catalog models + 11 enums + add `seller Seller?` back-ref to User
- `packages/db/prisma/seed.ts` — append the 12-category seed (idempotent upserts) below the existing permissions/roles seed

## Database changes

3 Prisma migrations:
1. `<ts>_add_sellers_tables` — `sellers`, `seller_staff` + enums (BusinessType, KYCStatus, SaasPlan, PayoutMethod, PayoutSchedule, SellerStaffRole)
2. `<ts>_add_catalog_base_tables` — `categories`, `products`, `product_variants`, `product_images` + enums (ProductStatus, ModerationStatus)
3. `<ts>_add_catalog_extensions` — adds the May-2026 columns to `products` (condition, condition_note, warranty_*, return_policy_*, authenticity_*, compare_at_price, is_buyer_protection_eligible) + enums (ProductCondition, AuthenticityStatus, ReturnPolicyType)

All forward-compatible (greenfield). The two-migration split for catalog (base + extensions) is intentional: it documents the May-2026 addendum's additions as a discrete history step, even though they land at the same time in this slice.

## Test cases

Integration (Vitest):

**`sellers.integration.test.ts`** (5 tests):
- [ ] `sellers` table exists with columns `id`, `user_id`, `business_name`, `business_slug`, `kyc_tier`, `saas_plan`, `payout_method`, `created_at`
- [ ] `seller_staff` table exists with composite PK on `(seller_id, user_id)`
- [ ] Unique constraint on `sellers.business_slug` enforced (insert two with same slug → second fails)
- [ ] All 6 enums exist with documented values (BusinessType, KYCStatus, SaasPlan, PayoutMethod, PayoutSchedule, SellerStaffRole)
- [ ] FK relationship Seller.user_id → users.id works (cascade behavior verified)

**`catalog.integration.test.ts`** (8 tests):
- [ ] `categories` table with self-referential `parent_id` FK
- [ ] `products` table with `seller_id` + `category_id` FKs
- [ ] `product_variants` table with `product_id` FK
- [ ] `product_images` table with `product_id` FK
- [ ] All May-2026 product extension columns present (`condition`, `warranty_terms`, `authenticity_status`, `compare_at_price`, `is_buyer_protection_eligible`)
- [ ] `ProductCondition` enum: NEW, LIKE_NEW, USED_GOOD, USED_FAIR, REFURBISHED, FOR_PARTS
- [ ] `AuthenticityStatus` enum: PLATFORM_VERIFIED, PROOF_PROVIDED, CLAIMED, UNCLAIMED
- [ ] Unique constraint on `(seller_id, slug)` for products (slug uniqueness scoped per seller)

**`catalog-seed.integration.test.ts`** (2 tests):
- [ ] `categories` count is exactly 12 after seed
- [ ] Specific category names exist (Fashion, Food & Drink, Electronics, ...)

**`apps/web/__tests__/db-integration.test.ts`** (modified):
- [ ] Extend with a `prisma.category.count()` assertion (>= 12 after seed)

## Permission/security implications

- No new auth surface. No new API.
- `Seller.tax_id` and `Seller.registration_number` are sensitive identifiers; Engineering_Spec §17 covers encryption-at-rest via Postgres. No application-layer change needed in this slice.
- `Seller.business_email` and `Seller.business_phone` are non-PII business contacts (different from `User.email`/`phone`).
- `ProductImage.url` points at Cloudflare R2 (later); for now it's a freeform text field.

## Risks

1. **The May-2026 product extensions enums are extensive.** Three new enums (ProductCondition, AuthenticityStatus, ReturnPolicyType) plus the existing ProductStatus/ModerationStatus = 5 enums in the catalog migration alone. Confirm the values match Polish_Phase_Addendum §1.16 (covered in Engineering_Spec §4.17).
2. **`pgvector` / full-text search.** Engineering_Spec §4.5 declares `@@fulltext([name, description, short_description])` on Product. Prisma doesn't support `@@fulltext` against Postgres yet (only MySQL). We omit this annotation and add the `tsvector` column + GIN index in a follow-up when search lands.
3. **Decimal precision.** Engineering_Spec uses `@db.Decimal(10, 2)` for prices and `@db.Decimal(15, 8)` for FX. Slice 1 already used `Decimal(15, 8)` for FxRate. This slice uses `Decimal(10, 2)` for product prices. Both are correct per spec.

## Dependencies

- Slice 1 (Users, RBAC, audit_log) merged to main ✓ (just done)
- Docker Postgres running on port 5434 ✓ (already up)

---

## Tasks

### Task 1: Sellers schema (RED → GREEN)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add Seller, SellerStaff + 6 enums)
- Create: `packages/db/__tests__/sellers.integration.test.ts`

- [ ] **Step 1: Write the RED test**

`packages/db/__tests__/sellers.integration.test.ts`:

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

describe('Sellers domain (Engineering_Spec §4.4)', () => {
  it('creates the sellers table with key columns', async () => {
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sellers'
      ORDER BY column_name;
    `;
    const cols = result.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'business_name', 'business_slug',
        'kyc_tier', 'saas_plan', 'payout_method',
        'created_at', 'updated_at',
      ]),
    );
  });

  it('creates the seller_staff table with composite PK', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'seller_staff';
    `;
    expect(result).toHaveLength(1);

    const pk = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'seller_staff'::regclass AND i.indisprimary
      ORDER BY column_name;
    `;
    expect(pk.map((r) => r.column_name).sort()).toEqual(['seller_id', 'user_id']);
  });

  it('enforces unique business_slug', async () => {
    // Need a user to satisfy the FK first.
    const user = await prisma.user.create({
      data: { clerk_id: 'clerk_test_seller_1', email: 'seller1@test.local', full_name: 'Test Seller 1' },
    });
    await prisma.seller.create({
      data: {
        user_id: user.id,
        business_name: 'Slug Test',
        business_slug: 'slug-collision-test',
        business_email: 'biz@test.local',
        business_phone: '+231880000001',
        business_address: { street: '1', city: 'Monrovia', country: 'LR' },
        business_type: 'SOLE_PROPRIETOR',
      },
    });

    const user2 = await prisma.user.create({
      data: { clerk_id: 'clerk_test_seller_2', email: 'seller2@test.local', full_name: 'Test Seller 2' },
    });
    await expect(
      prisma.seller.create({
        data: {
          user_id: user2.id,
          business_name: 'Other Biz',
          business_slug: 'slug-collision-test',
          business_email: 'biz2@test.local',
          business_phone: '+231880000002',
          business_address: { street: '2', city: 'Monrovia', country: 'LR' },
          business_type: 'SOLE_PROPRIETOR',
        },
      }),
    ).rejects.toThrow(/Unique constraint/i);
  });

  it('all 6 seller enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('BusinessType', 'KYCStatus', 'SaasPlan', 'PayoutMethod', 'PayoutSchedule', 'SellerStaffRole')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) {
      (byType[row.typname] ??= []).push(row.enumlabel);
    }
    expect(byType.BusinessType).toEqual(['SOLE_PROPRIETOR', 'LIMITED_LIABILITY', 'CORPORATION', 'COOPERATIVE', 'INDIVIDUAL']);
    expect(byType.KYCStatus).toEqual(['NOT_STARTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED']);
    expect(byType.SaasPlan).toEqual(['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE']);
    expect(byType.PayoutMethod).toEqual(['MTN_MOMO', 'ORANGE_MONEY', 'BANK_TRANSFER']);
    expect(byType.PayoutSchedule).toEqual(['INSTANT', 'DAILY', 'WEEKLY', 'MONTHLY']);
    expect(byType.SellerStaffRole).toEqual(['ADMIN', 'FULFILLMENT', 'SUPPORT', 'VIEWER']);
  });

  it('Seller.user_id has an ON DELETE behavior (cascade or restrict)', async () => {
    const fks = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'sellers' AND tc.constraint_type = 'FOREIGN KEY';
    `;
    expect(fks.length).toBeGreaterThanOrEqual(1);
    // Expect deletion of a user to NOT silently leave orphan sellers
    expect(['CASCADE', 'RESTRICT', 'NO ACTION']).toContain(fks[0]!.delete_rule);
  });
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
pnpm -F "@vendoora/db" test
```
Expected: 5 new seller tests fail (tables/enums don't exist).

- [ ] **Step 3: Append Sellers schema to `packages/db/prisma/schema.prisma`**

Append after the Operations section:

```prisma
// ============================================================================
// Sellers (Engineering_Spec §4.4)
// ============================================================================

model Seller {
  id                   String       @id @default(cuid())
  user_id              String       @unique
  business_name        String
  business_slug        String       @unique
  business_description String?
  business_logo_url    String?
  business_banner_url  String?
  business_email       String
  business_phone       String
  business_address     Json
  business_type        BusinessType
  tax_id               String?
  registration_number  String?

  kyc_tier              Int        @default(0)
  kyc_status            KYCStatus  @default(NOT_STARTED)
  kyc_tier_promoted_at  DateTime?
  kyc_documents         Json?

  saas_plan             SaasPlan   @default(STARTER)
  saas_plan_started_at  DateTime?
  saas_plan_renewed_at  DateTime?
  saas_commission_rate  Float      @default(0.12)

  payout_method         PayoutMethod   @default(MTN_MOMO)
  payout_account_id     String?
  payout_schedule       PayoutSchedule @default(WEEKLY)

  is_featured           Boolean    @default(false)
  feature_starts_at     DateTime?
  feature_ends_at       DateTime?

  total_orders          Int        @default(0)
  total_gmv             Decimal    @default(0) @db.Decimal(15, 2)
  total_disputes        Int        @default(0)
  dispute_rate          Float      @default(0)
  on_time_rate          Float      @default(100)
  rating_average        Float?
  rating_count          Int        @default(0)

  is_suspended          Boolean    @default(false)
  suspended_at          DateTime?
  suspended_reason      String?

  created_at            DateTime   @default(now())
  updated_at            DateTime   @updatedAt
  deleted_at            DateTime?

  user                  User       @relation(fields: [user_id], references: [id], onDelete: Restrict)
  staff_members         SellerStaff[]
  products              Product[]

  @@index([business_slug])
  @@index([kyc_tier])
  @@index([saas_plan])
  @@index([is_suspended])
  @@index([is_featured])
  @@map("sellers")
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
  STARTER
  GROWTH
  PRO
  ENTERPRISE
}

enum PayoutMethod {
  MTN_MOMO
  ORANGE_MONEY
  BANK_TRANSFER
}

enum PayoutSchedule {
  INSTANT
  DAILY
  WEEKLY
  MONTHLY
}

model SellerStaff {
  seller_id          String
  user_id            String
  role               SellerStaffRole
  invited_by_user_id String
  invited_at         DateTime @default(now())
  accepted_at        DateTime?

  seller             Seller   @relation(fields: [seller_id], references: [id], onDelete: Cascade)
  user               User     @relation("SellerStaffMember", fields: [user_id], references: [id], onDelete: Cascade)
  invited_by         User     @relation("SellerStaffInviter", fields: [invited_by_user_id], references: [id])

  @@id([seller_id, user_id])
  @@index([user_id])
  @@map("seller_staff")
}

enum SellerStaffRole {
  ADMIN
  FULFILLMENT
  SUPPORT
  VIEWER
}
```

- [ ] **Step 4: Add back-references on the existing User model**

Use Edit on `packages/db/prisma/schema.prisma`. Find this section in the `User` model:

old_string:
```
  user_roles          UserRole[]
  assigned_user_roles UserRole[] @relation("UserRoleAssignedBy")
```
new_string:
```
  user_roles          UserRole[]
  assigned_user_roles UserRole[] @relation("UserRoleAssignedBy")

  // Sellers (slice 2)
  seller              Seller?
  seller_staff_member SellerStaff[] @relation("SellerStaffMember")
  seller_staff_invited SellerStaff[] @relation("SellerStaffInviter")
```

- [ ] **Step 5: Migrate**

```bash
cd packages/db
$env:DATABASE_URL = "postgresql://vendoora:vendoora_dev_password@localhost:5434/vendoora_dev?schema=public"
pnpm prisma migrate dev --name add_sellers_tables
```

- [ ] **Step 6: Run tests — confirm GREEN**

```bash
cd ../..
pnpm -F "@vendoora/db" test
```
Expected: 24 passing (19 from slice 1 + 5 sellers).

---

### Task 2: Catalog base schema (RED → GREEN)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add Category, Product, ProductVariant, ProductImage + 2 enums — without the May-2026 extensions yet; those land in Task 3)
- Create: `packages/db/__tests__/catalog.integration.test.ts`

- [ ] **Step 1: Write the RED test (initial 4 tests for base tables only)**

`packages/db/__tests__/catalog.integration.test.ts`:

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

describe('Catalog base tables (Engineering_Spec §4.5)', () => {
  it('creates the categories table with self-referential parent_id FK', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'categories';
    `;
    expect(result).toHaveLength(1);

    const fk = await prisma.$queryRaw<Array<{ column_name: string; foreign_table_name: string }>>`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'categories' AND kcu.column_name = 'parent_id';
    `;
    expect(fk).toHaveLength(1);
    expect(fk[0]!.foreign_table_name).toBe('categories');
  });

  it('creates the products table with seller_id + category_id FKs', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products';
    `;
    expect(result).toHaveLength(1);

    const fks = await prisma.$queryRaw<Array<{ column_name: string; foreign_table_name: string }>>`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'products' AND kcu.column_name IN ('seller_id', 'category_id')
      ORDER BY kcu.column_name;
    `;
    expect(fks).toHaveLength(2);
    expect(fks.map((r) => r.foreign_table_name).sort()).toEqual(['categories', 'sellers']);
  });

  it('creates the product_variants table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'product_variants';
    `;
    expect(result).toHaveLength(1);
  });

  it('creates the product_images table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'product_images';
    `;
    expect(result).toHaveLength(1);
  });

  it('enforces unique (seller_id, slug) on products', async () => {
    // Need user + seller + category first
    const user = await prisma.user.create({
      data: { clerk_id: 'clerk_test_catalog_1', email: 'cat1@test.local', full_name: 'Cat Test' },
    });
    const seller = await prisma.seller.create({
      data: {
        user_id: user.id,
        business_name: 'Catalog Test Co',
        business_slug: 'catalog-test-co',
        business_email: 'b@test.local',
        business_phone: '+231880000010',
        business_address: { street: '1', city: 'Monrovia', country: 'LR' },
        business_type: 'SOLE_PROPRIETOR',
      },
    });
    const cat = await prisma.category.create({
      data: { name: 'Test Cat', slug: 'test-cat', attributes_schema: {} },
    });

    await prisma.product.create({
      data: {
        seller_id: seller.id,
        category_id: cat.id,
        name: 'Test Product',
        slug: 'unique-slug-test',
        description: 'desc',
        base_price: 10.00,
        attributes: {},
      },
    });

    await expect(
      prisma.product.create({
        data: {
          seller_id: seller.id,
          category_id: cat.id,
          name: 'Duplicate Slug',
          slug: 'unique-slug-test',
          description: 'desc',
          base_price: 20.00,
          attributes: {},
        },
      }),
    ).rejects.toThrow(/Unique constraint/i);
  });
});
```

- [ ] **Step 2: Run — confirm RED**

5 catalog tests should fail (tables don't exist yet).

- [ ] **Step 3: Append Catalog base schema to `schema.prisma`**

```prisma
// ============================================================================
// Catalog — base (Engineering_Spec §4.5)
// May-2026 product extensions added in next migration.
// ============================================================================

model Category {
  id                String    @id @default(cuid())
  parent_id         String?
  name              String
  slug              String    @unique
  description       String?
  icon_name         String?
  banner_url        String?
  attributes_schema Json
  display_order     Int       @default(0)
  is_active         Boolean   @default(true)
  is_featured       Boolean   @default(false)
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt

  parent            Category? @relation("CategoryHierarchy", fields: [parent_id], references: [id])
  children          Category[] @relation("CategoryHierarchy")
  products          Product[]

  @@index([parent_id])
  @@index([slug])
  @@index([is_active])
  @@map("categories")
}

model Product {
  id                       String         @id @default(cuid())
  seller_id                String
  category_id              String
  name                     String
  slug                     String
  description              String
  short_description        String?
  base_price               Decimal        @db.Decimal(10, 2)
  currency                 String         @default("USD")
  cost_price               Decimal?       @db.Decimal(10, 2)
  weight_grams             Int?
  dimensions               Json?
  attributes               Json
  tags                     String[]
  has_variants             Boolean        @default(false)
  status                   ProductStatus  @default(DRAFT)
  moderation_status        ModerationStatus @default(PENDING)
  inventory_tracking       Boolean        @default(true)
  inventory_count          Int            @default(0)
  inventory_low_threshold  Int            @default(5)
  is_featured              Boolean        @default(false)
  feature_ends_at          DateTime?
  promoted_score           Float          @default(0)
  view_count               Int            @default(0)
  order_count              Int            @default(0)
  rating_average           Float?
  rating_count             Int            @default(0)
  is_diaspora_eligible     Boolean        @default(true)
  shipping_zones           String[]

  created_at               DateTime       @default(now())
  updated_at               DateTime       @updatedAt
  published_at             DateTime?
  deleted_at               DateTime?

  seller                   Seller         @relation(fields: [seller_id], references: [id], onDelete: Restrict)
  category                 Category       @relation(fields: [category_id], references: [id], onDelete: Restrict)
  variants                 ProductVariant[]
  images                   ProductImage[]

  @@unique([seller_id, slug])
  @@index([seller_id])
  @@index([category_id])
  @@index([status])
  @@index([moderation_status])
  @@index([is_featured])
  @@index([deleted_at])
  @@map("products")
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
  id              String   @id @default(cuid())
  product_id      String
  sku             String?
  name            String
  attributes      Json
  price_override  Decimal? @db.Decimal(10, 2)
  inventory_count Int      @default(0)
  is_default      Boolean  @default(false)
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  product         Product  @relation(fields: [product_id], references: [id], onDelete: Cascade)

  @@unique([product_id, sku])
  @@index([product_id])
  @@map("product_variants")
}

model ProductImage {
  id                       String   @id @default(cuid())
  product_id               String
  url                      String
  alt_text                 String?
  display_order            Int      @default(0)
  is_primary               Boolean  @default(false)
  photographer_credit      String?
  is_vendoora_photographed Boolean  @default(false)
  created_at               DateTime @default(now())

  product                  Product  @relation(fields: [product_id], references: [id], onDelete: Cascade)

  @@index([product_id])
  @@map("product_images")
}
```

- [ ] **Step 4: Migrate**

```bash
cd packages/db
pnpm prisma migrate dev --name add_catalog_base_tables
```

- [ ] **Step 5: Run — confirm GREEN**

Expected: 29 tests passing (19 slice 1 + 5 sellers + 5 catalog base).

---

### Task 3: Catalog May-2026 extensions (RED → GREEN)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (extend Product model + add 3 enums)
- Modify: `packages/db/__tests__/catalog.integration.test.ts` (add 3 more tests)

- [ ] **Step 1: Extend the test file**

Append to the existing `describe` block in `catalog.integration.test.ts`:

```ts
describe('Catalog May-2026 extensions (Polish_Phase_Addendum §1.16, Engineering_Spec §4.17)', () => {
  it('Product has the May-2026 extension columns', async () => {
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products'
      ORDER BY column_name;
    `;
    const cols = result.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining([
        'condition',
        'condition_note',
        'warranty_terms',
        'warranty_duration_days',
        'return_policy_type',
        'return_policy_terms',
        'return_window_days',
        'authenticity_status',
        'authenticity_proof_urls',
        'compare_at_price',
        'is_buyer_protection_eligible',
      ]),
    );
  });

  it('ProductCondition enum has all 6 documented values', async () => {
    const result = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'ProductCondition'
      ORDER BY enumsortorder;
    `;
    expect(result.map((r) => r.enumlabel)).toEqual([
      'NEW', 'LIKE_NEW', 'USED_GOOD', 'USED_FAIR', 'REFURBISHED', 'FOR_PARTS',
    ]);
  });

  it('AuthenticityStatus enum has all 4 documented values', async () => {
    const result = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'AuthenticityStatus'
      ORDER BY enumsortorder;
    `;
    expect(result.map((r) => r.enumlabel)).toEqual([
      'PLATFORM_VERIFIED', 'PROOF_PROVIDED', 'CLAIMED', 'UNCLAIMED',
    ]);
  });
});
```

- [ ] **Step 2: Run — confirm RED for the 3 new cases**

- [ ] **Step 3: Extend Product model + add 3 enums in `schema.prisma`**

Insert the May-2026 fields into the Product model. Use Edit to add them right before the `seller` relation line:

old_string:
```
  is_diaspora_eligible     Boolean        @default(true)
  shipping_zones           String[]

  created_at               DateTime       @default(now())
```
new_string:
```
  is_diaspora_eligible     Boolean        @default(true)
  shipping_zones           String[]

  // May-2026 product extensions (Polish_Phase_Addendum §1.16, Engineering_Spec §4.17)
  condition                ProductCondition    @default(NEW)
  condition_note           String?
  warranty_terms           String?
  warranty_duration_days   Int?
  return_policy_type       ReturnPolicyType    @default(NO_RETURNS)
  return_policy_terms      String?
  return_window_days       Int?
  authenticity_status      AuthenticityStatus  @default(UNCLAIMED)
  authenticity_proof_urls  String[]
  compare_at_price         Decimal?            @db.Decimal(10, 2)
  is_buyer_protection_eligible Boolean         @default(true)

  created_at               DateTime       @default(now())
```

Then append the 3 new enums after the `ModerationStatus` enum:

```prisma
enum ProductCondition {
  NEW
  LIKE_NEW
  USED_GOOD
  USED_FAIR
  REFURBISHED
  FOR_PARTS
}

enum AuthenticityStatus {
  PLATFORM_VERIFIED
  PROOF_PROVIDED
  CLAIMED
  UNCLAIMED
}

enum ReturnPolicyType {
  NO_RETURNS
  STORE_CREDIT_ONLY
  REFUND_WITHIN_WINDOW
  CASE_BY_CASE
}
```

- [ ] **Step 4: Migrate**

```bash
cd packages/db
pnpm prisma migrate dev --name add_catalog_extensions
```

- [ ] **Step 5: Run — confirm GREEN**

Expected: 32 tests passing (19 + 5 + 5 + 3).

---

### Task 4: Category seed (12 Liberian categories) (RED → GREEN)

**Files:**
- Modify: `packages/db/prisma/seed.ts` (append category seed below role seed)
- Create: `packages/db/__tests__/catalog-seed.integration.test.ts`

- [ ] **Step 1: Write the RED test**

`packages/db/__tests__/catalog-seed.integration.test.ts`:

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
  execSync('pnpm prisma db seed', { stdio: 'inherit', env: process.env });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Category seed', () => {
  it('seeds exactly 12 categories', async () => {
    const count = await prisma.category.count();
    expect(count).toBe(12);
  });

  it('all expected category slugs are present', async () => {
    const cats = await prisma.category.findMany({ select: { slug: true } });
    const slugs = cats.map((c) => c.slug).sort();
    expect(slugs).toEqual([
      'arts-crafts',
      'beauty',
      'books',
      'children',
      'electronics',
      'fashion',
      'food-drink',
      'home-garden',
      'mobile-tech',
      'other',
      'pharmacy',
      'tools-hardware',
    ]);
  });
});
```

- [ ] **Step 2: Run — confirm RED**

The 2 new tests fail because seed doesn't seed categories yet.

- [ ] **Step 3: Append category seed to `packages/db/prisma/seed.ts`**

Before the final `main().then(...).catch(...)` block, add a category-seeding section:

```ts
// ----------------------------------------------------------------------------
// Category catalog — 12 top-level Liberian-marketplace categories
// ----------------------------------------------------------------------------

interface CategoryDef {
  name: string;
  slug: string;
  description: string;
  icon_name: string;
  display_order: number;
}

const CATEGORIES: CategoryDef[] = [
  { name: 'Fashion',          slug: 'fashion',          description: 'Clothing, fabrics, accessories, footwear',                       icon_name: 'shirt',         display_order: 1 },
  { name: 'Food & Drink',     slug: 'food-drink',       description: 'Foodstuffs, beverages, pantry, fresh produce',                   icon_name: 'utensils',      display_order: 2 },
  { name: 'Beauty',           slug: 'beauty',           description: 'Cosmetics, hair care, skincare, fragrances',                     icon_name: 'sparkles',      display_order: 3 },
  { name: 'Electronics',      slug: 'electronics',      description: 'TVs, audio, appliances, accessories',                            icon_name: 'tv',            display_order: 4 },
  { name: 'Mobile & Tech',    slug: 'mobile-tech',      description: 'Phones, tablets, chargers, SIM cards, data bundles',             icon_name: 'smartphone',    display_order: 5 },
  { name: 'Home & Garden',    slug: 'home-garden',      description: 'Furniture, decor, kitchenware, garden supplies',                 icon_name: 'home',          display_order: 6 },
  { name: 'Children',         slug: 'children',         description: 'Kids clothing, toys, school supplies, baby goods',               icon_name: 'baby',          display_order: 7 },
  { name: 'Arts & Crafts',    slug: 'arts-crafts',      description: 'Liberian art, traditional crafts, fabrics, handmade goods',      icon_name: 'palette',       display_order: 8 },
  { name: 'Books',            slug: 'books',            description: 'Books, magazines, stationery, educational materials',            icon_name: 'book-open',     display_order: 9 },
  { name: 'Pharmacy',         slug: 'pharmacy',         description: 'OTC medicines, vitamins, health products (regulated)',           icon_name: 'pill',          display_order: 10 },
  { name: 'Tools & Hardware', slug: 'tools-hardware',   description: 'Hand tools, power tools, building materials',                    icon_name: 'wrench',        display_order: 11 },
  { name: 'Other',            slug: 'other',            description: 'Everything else',                                                icon_name: 'package',       display_order: 12 },
];
```

And in the `main()` function, add the category seeding loop after the role seeding:

```ts
  console.log(`Seeding ${CATEGORIES.length} categories...`);
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        description: c.description,
        icon_name: c.icon_name,
        display_order: c.display_order,
      },
      create: {
        name: c.name,
        slug: c.slug,
        description: c.description,
        icon_name: c.icon_name,
        display_order: c.display_order,
        attributes_schema: {},
      },
    });
  }
```

- [ ] **Step 4: Run — confirm GREEN**

Expected: 34 tests passing (19 + 5 + 5 + 3 + 2).

---

### Task 5: apps/web smoke test extension

**Files:**
- Modify: `apps/web/__tests__/db-integration.test.ts` (add category-count assertion)

- [ ] **Step 1: Update the existing test**

Use Edit on `apps/web/__tests__/db-integration.test.ts`:

old_string:
```
describe('apps/web → @vendoora/db', () => {
  it('imports the prisma singleton and can count users', async () => {
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
```
new_string:
```
describe('apps/web → @vendoora/db', () => {
  it('imports the prisma singleton and can count users', async () => {
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('reads the seeded category catalog (>=12 after seed)', async () => {
    const count = await prisma.category.count();
    expect(count).toBeGreaterThanOrEqual(12);
  });
});
```

Note: this test depends on seed having been run against the test DB. The packages/db tests reset and seed in their own beforeAll. By the time apps/web tests run (in a separate test runner invocation), the test DB has the seed. If running `apps/web/test` standalone, run `pnpm db:seed` against the test DB first, or wrap the test in a conditional.

- [ ] **Step 2: Run apps/web tests**

```bash
pnpm -F "@vendoora/web" test
```
Expected: 4 tests passing (2 cross-package + 2 db-integration).

---

### Task 6: Cold-state sanity + commit

- [ ] **Step 1: Full cold-state verification**

```bash
cd /c/Users/Anthony/Documents/vendoora
pnpm db:reset
sleep 10
pnpm -F "@vendoora/db" migrate:deploy
pnpm db:seed
pnpm -F "@vendoora/db" test          # 34 passing
pnpm -F "@vendoora/web" test         # 4 passing
pnpm build
```

- [ ] **Step 2: Stage and commit**

```bash
git checkout -b feature/prisma-sellers-catalog   # if branch flow desired
git add -A
git status
git commit -m "$(cat <<'EOF'
feat(db): Prisma slice 2 — Sellers + Catalog (with May-2026 extensions)

Adds the catalog spine to the schema (slice 2 of ~6 for the data model):
- Seller, SellerStaff (Engineering_Spec §4.4) + 6 enums
- Category (self-referential hierarchy), Product, ProductVariant,
  ProductImage (§4.5) + 2 enums
- May-2026 product extensions per Polish_Phase_Addendum §1.16 / §4.17:
  condition, condition_note, warranty_terms, warranty_duration_days,
  return_policy_type, return_policy_terms, return_window_days,
  authenticity_status, authenticity_proof_urls, compare_at_price,
  is_buyer_protection_eligible (3 new enums: ProductCondition,
  AuthenticityStatus, ReturnPolicyType)
- 12 top-level categories seeded (Fashion, Food & Drink, Beauty,
  Electronics, Mobile & Tech, Home & Garden, Children, Arts & Crafts,
  Books, Pharmacy, Tools & Hardware, Other)

Schema goes from 8 tables to 14. Three new auto-generated migrations
(sellers, catalog-base, catalog-extensions) — the two-step catalog split
documents the May-2026 additions as a discrete history entry.

Verification (cold-state):
- pnpm -F @vendoora/db test         (34 passed: 19 slice-1 + 10 new slice-2 + 2 seed + 3 extensions)
- pnpm -F @vendoora/web test        (4 passed)
- pnpm build                        (Turborepo OK)

Deferred:
- Product.condition immutable-after-first-sale trigger — needs order_items
  table (slice 3)
- pinned_position — belongs with P4 SaaS-tier entitlements work
- Postgres full-text search on Product — Prisma doesn't support @@fulltext
  for Postgres yet; tsvector + GIN index lands when search is built

Phase: P1 Foundation (Playbook §3.1.3, slice 2 of ~6).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Acceptance criteria

- [ ] `pnpm -F @vendoora/db test` reports 34 passed
- [ ] `pnpm -F @vendoora/web test` reports 4 passed
- [ ] `pnpm build` succeeds at root
- [ ] Three new migrations present under `packages/db/prisma/migrations/`
- [ ] Cold-state: `db:reset` → `migrate:deploy` → `db:seed` → tests all pass
- [ ] No leakage of node_modules/.turbo/.next into the commit
- [ ] `git log --oneline` shows 3 commits total (walking skeleton + slice 1 + slice 2)

## Next slices (in suggested order)

1. **Orders + Cart + Escrow + Payments** — the trust-mechanic surface (BIG slice; may split)
2. **Disputes + Refunds**
3. **Drivers + Logistics**
4. **Diaspora**
5. **May-2026 additions** (Reviews, Trust Cases, Profile Change Requests, Webhook/Outbox, KYC Application)
