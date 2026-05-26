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

  it('escrow_state_transitions table exists', async () => {
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

  it('payouts has nullable seller + driver beneficiary FKs', async () => {
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

  it('refunds has payment_id (required) + dispute_id (nullable)', async () => {
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

  it('escrow_holds → orders FK uses ON DELETE RESTRICT semantics', async () => {
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

  it('end-to-end: create user → seller → category → product → order → escrow hold', async () => {
    const buyer = await prisma.user.create({
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
        buyer_user_id: buyer.id,
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
    expect(hold.order_id).toBe(order.id);
    expect(hold.beneficiary_seller_id).toBe(seller.id);

    // Product unused by linter — reference it to suppress
    expect(product.id).toBeTruthy();
  });
});
