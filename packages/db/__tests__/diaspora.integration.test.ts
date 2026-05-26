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

describe('Diaspora (Engineering_Spec §4.10)', () => {
  it('recipients table has key columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recipients'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'sender_user_id', 'name', 'phone', 'phone_country_code',
        'address_line1', 'city', 'country', 'is_primary', 'created_at',
      ]),
    );
  });

  it('gift_bundles.slug is UNIQUE', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'gift_bundles' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%slug%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('bundle_items has bundle_id + product_id FKs', async () => {
    const fks = await prisma.$queryRaw<Array<{ column_name: string; foreign_table_name: string }>>`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'bundle_items'
      ORDER BY kcu.column_name;
    `;
    const tables = fks.map((r) => r.foreign_table_name).sort();
    expect(tables).toEqual(expect.arrayContaining(['gift_bundles', 'products']));
  });

  it('group_gifts.group_gift_code is UNIQUE (shareable invite)', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'group_gifts' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%group_gift_code%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('group_gifts.target_amount + collected_amount are Decimal(10, 2)', async () => {
    const result = await prisma.$queryRaw<Array<{ column_name: string; numeric_precision: number; numeric_scale: number }>>`
      SELECT column_name, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'group_gifts'
        AND column_name IN ('target_amount', 'collected_amount')
      ORDER BY column_name;
    `;
    expect(result).toHaveLength(2);
    for (const c of result) {
      expect(c.numeric_precision).toBe(10);
      expect(c.numeric_scale).toBe(2);
    }
  });

  it('group_gift_contributors has composite UNIQUE on (group_gift_id, user_id)', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'group_gift_contributors' AND indexdef LIKE '%UNIQUE%';
    `;
    const found = result.some((r) =>
      r.indexdef.includes('group_gift_id') && r.indexdef.includes('user_id'),
    );
    expect(found).toBe(true);
  });

  it('scheduled_gifts has recurrence_rule (nullable)', async () => {
    const result = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'scheduled_gifts' AND column_name = 'recurrence_rule';
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.is_nullable).toBe('YES');
  });

  it('all 3 diaspora enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('BundleOccasion', 'GroupGiftStatus', 'ScheduleType')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) {
      (byType[row.typname] ??= []).push(row.enumlabel);
    }
    expect(byType.BundleOccasion).toEqual([
      'BIRTHDAY', 'CHRISTMAS', 'EASTER', 'RAMADAN', 'GRADUATION',
      'WEDDING', 'NEW_BABY', 'EVERYDAY_ESSENTIALS', 'MONTHLY_BOX',
      'CONDOLENCES', 'OTHER',
    ]);
    expect(byType.GroupGiftStatus).toEqual(['OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'REFUNDED']);
    expect(byType.ScheduleType).toEqual(['ONE_TIME', 'RECURRING']);
  });

  it('orders.recipient_id now has FK to recipients (was bare String? in slice 3)', async () => {
    const result = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'orders' AND kcu.column_name = 'recipient_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.foreign_table_name).toBe('recipients');
  });

  it('orders.group_gift_id now has FK to group_gifts', async () => {
    const result = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'orders' AND kcu.column_name = 'group_gift_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.foreign_table_name).toBe('group_gifts');
  });

  it('end-to-end: sender → recipient → diaspora order with recipient_id set', async () => {
    const sender = await prisma.user.create({
      data: { clerk_id: 'clerk_dia_sender', email: 'sender@diaspora.test', full_name: 'Sender Atlanta' },
    });
    const recipient = await prisma.recipient.create({
      data: {
        sender_user_id: sender.id,
        name: 'Auntie Mary',
        phone: '88 555 0123',
        phone_country_code: '+231',
        address_line1: '7 Tubman Blvd',
        city: 'Monrovia',
        country: 'Liberia',
        is_primary: true,
      },
    });

    const order = await prisma.order.create({
      data: {
        order_number: 'VDR-DIA-' + Date.now(),
        buyer_user_id: sender.id,
        buyer_type: 'DIASPORA',
        recipient_id: recipient.id,
        recipient_name: recipient.name,
        recipient_phone: recipient.phone,
        buyer_name: 'Sender Atlanta',
        buyer_email: 'sender@diaspora.test',
        delivery_address: { line1: recipient.address_line1, city: recipient.city },
        delivery_city: recipient.city,
        delivery_country: 'LR',
        delivery_zone: 'sinkor',
        subtotal: 145.0,
        diaspora_fee: 2.9,
        total_amount: 147.9,
        currency: 'USD',
        payment_method: 'CARD',
      },
    });

    expect(order.recipient_id).toBe(recipient.id);
    expect(order.buyer_type).toBe('DIASPORA');
  });

  it('end-to-end: group gift with contributors', async () => {
    const initiator = await prisma.user.create({
      data: { clerk_id: 'clerk_gg_init', email: 'init@gg.test', full_name: 'GG Initiator' },
    });
    const c1User = await prisma.user.create({
      data: { clerk_id: 'clerk_gg_c1', email: 'c1@gg.test', full_name: 'GG C1' },
    });
    const c2User = await prisma.user.create({
      data: { clerk_id: 'clerk_gg_c2', email: 'c2@gg.test', full_name: 'GG C2' },
    });
    const recipient = await prisma.recipient.create({
      data: {
        sender_user_id: initiator.id,
        name: 'Mom',
        phone: '88 555 9999',
        address_line1: '1 Beach Rd',
        city: 'Monrovia',
        country: 'Liberia',
      },
    });

    const gg = await prisma.groupGift.create({
      data: {
        group_gift_code: 'GG-' + Date.now(),
        initiator_user_id: initiator.id,
        recipient_id: recipient.id,
        target_amount: 200.0,
        deadline_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });

    await prisma.groupGiftContributor.create({
      data: { group_gift_id: gg.id, user_id: c1User.id, amount: 50.0, currency: 'USD' },
    });
    await prisma.groupGiftContributor.create({
      data: { group_gift_id: gg.id, user_id: c2User.id, amount: 75.0, currency: 'USD' },
    });

    const contribs = await prisma.groupGiftContributor.findMany({
      where: { group_gift_id: gg.id },
    });
    expect(contribs).toHaveLength(2);
    expect(contribs.reduce((s, c) => s + Number(c.amount), 0)).toBe(125);
  });
});
