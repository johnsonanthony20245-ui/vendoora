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

  it('creates the cart_items table', async () => {
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

  it('orders has nullable diaspora/group-gift/delivery-code columns (no FK constraint yet)', async () => {
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

  it('order_items has FKs to orders + products + sellers', async () => {
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

  it('order_items.product_snapshot is JSONB', async () => {
    const result = await prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'product_snapshot';
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.data_type).toBe('jsonb');
  });

  it('order_status_history exists', async () => {
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
