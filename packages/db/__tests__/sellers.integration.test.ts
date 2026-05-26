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

  it('Seller.user_id has an ON DELETE RESTRICT behavior', async () => {
    const fks = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'sellers' AND tc.constraint_type = 'FOREIGN KEY';
    `;
    expect(fks.length).toBeGreaterThanOrEqual(1);
    expect(['RESTRICT', 'NO ACTION']).toContain(fks[0]!.delete_rule);
  });
});
