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

describe('Disputes (Engineering_Spec §4.8)', () => {
  it('disputes table has the documented key columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'disputes'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'dispute_number', 'order_id', 'initiated_by_user_id',
        'category', 'status', 'sla_due_at', 'sla_breached',
        'created_at',
      ]),
    );
  });

  it('disputes.dispute_number is UNIQUE', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'disputes' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%dispute_number%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('dispute_messages table has dispute_id FK + author_type + is_internal', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dispute_messages'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining(['dispute_id', 'author_user_id', 'author_type', 'is_internal', 'body']),
    );
  });

  it('dispute_evidence table has dispute_id FK + file_url + evidence_type', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dispute_evidence'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining(['dispute_id', 'file_url', 'file_type', 'file_size_bytes', 'evidence_type']),
    );
  });

  it('all 6 dispute enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('DisputeCategory', 'DisputeReason', 'DisputeStatus', 'DisputeResolution', 'DisputeMessageAuthorType', 'DisputeEvidenceType')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) {
      (byType[row.typname] ??= []).push(row.enumlabel);
    }
    expect(byType.DisputeCategory).toEqual([
      'NOT_RECEIVED', 'DAMAGED', 'WRONG_ITEM', 'COUNTERFEIT',
      'QUALITY_ISSUE', 'IN_TRANSIT_DAMAGE', 'PAYMENT_ISSUE', 'FRAUD', 'OTHER',
    ]);
    expect(byType.DisputeReason).toEqual([
      'BUYER_INITIATED', 'SELLER_INITIATED', 'CHARGEBACK', 'FRAUD_DETECTED', 'SYSTEM_FLAGGED',
    ]);
    expect(byType.DisputeStatus).toEqual([
      'OPEN', 'IN_REVIEW', 'PENDING_BUYER', 'PENDING_SELLER', 'ESCALATED',
      'RESOLVED_FAVOR_BUYER', 'RESOLVED_FAVOR_SELLER', 'RESOLVED_PARTIAL',
      'RESOLVED_INSURANCE', 'CLOSED', 'WITHDRAWN',
    ]);
    expect(byType.DisputeResolution).toEqual([
      'FULL_REFUND_TO_BUYER', 'PARTIAL_REFUND_TO_BUYER', 'RELEASE_TO_SELLER',
      'INSURANCE_PAYOUT', 'STORE_CREDIT', 'REPLACEMENT_SHIPPED',
    ]);
    expect(byType.DisputeMessageAuthorType).toEqual(['BUYER', 'SELLER', 'ADMIN', 'SYSTEM']);
    expect(byType.DisputeEvidenceType).toEqual([
      'PHOTO', 'VIDEO', 'DOCUMENT', 'CHAT_TRANSCRIPT', 'DELIVERY_PROOF', 'RECEIPT', 'OTHER',
    ]);
  });

  it('escrow_holds.dispute_id now has a FK constraint to disputes (was bare String? in slice 3)', async () => {
    const result = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'escrow_holds' AND kcu.column_name = 'dispute_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.foreign_table_name).toBe('disputes');
  });

  it('refunds.dispute_id now has a FK constraint to disputes', async () => {
    const result = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'refunds' AND kcu.column_name = 'dispute_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.foreign_table_name).toBe('disputes');
  });

  it('disputes → orders FK uses ON DELETE RESTRICT semantics', async () => {
    const result = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'disputes' AND kcu.column_name = 'order_id';
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(['RESTRICT', 'NO ACTION']).toContain(result[0]!.delete_rule);
  });

  it('disputes.sla_breached defaults to false', async () => {
    const result = await prisma.$queryRaw<Array<{ column_default: string | null }>>`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'disputes' AND column_name = 'sla_breached';
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.column_default).toMatch(/false/i);
  });

  it('end-to-end: open a dispute, attach a message + evidence', async () => {
    const buyer = await prisma.user.create({
      data: { clerk_id: 'clerk_disp_buyer', email: 'disp_b@test.local', full_name: 'Disp Buyer' },
    });
    const sellerUser = await prisma.user.create({
      data: { clerk_id: 'clerk_disp_seller', email: 'disp_s@test.local', full_name: 'Disp Seller' },
    });
    const seller = await prisma.seller.create({
      data: {
        user_id: sellerUser.id, business_name: 'Disp Co', business_slug: 'disp-co',
        business_email: 'b@disp.local', business_phone: '+231880099001',
        business_address: { street: '1', city: 'Monrovia', country: 'LR' },
        business_type: 'SOLE_PROPRIETOR',
      },
    });
    const cat = await prisma.category.create({
      data: { name: 'Disp Cat', slug: 'disp-cat', attributes_schema: {} },
    });
    const product = await prisma.product.create({
      data: {
        seller_id: seller.id, category_id: cat.id,
        name: 'Disp Product', slug: 'disp-product', description: 'd',
        base_price: 50.0, attributes: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        order_number: 'VDR-DISP-' + Date.now(),
        buyer_user_id: buyer.id, buyer_type: 'LIBERIA_DOMESTIC',
        buyer_name: 'Disp Buyer', buyer_email: 'disp_b@test.local',
        delivery_address: { street: '1' }, delivery_city: 'Monrovia',
        delivery_country: 'LR', delivery_zone: 'sinkor',
        subtotal: 50.0, total_amount: 50.0, currency: 'USD',
        payment_method: 'MTN_MOMO',
      },
    });

    const slaDue = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const dispute = await prisma.dispute.create({
      data: {
        dispute_number: 'VDR-DIS-' + Date.now(),
        order_id: order.id,
        initiated_by_user_id: buyer.id,
        category: 'COUNTERFEIT',
        reason: 'BUYER_INITIATED',
        description: 'Received a counterfeit item',
        sla_due_at: slaDue,
      },
    });

    await prisma.disputeMessage.create({
      data: {
        dispute_id: dispute.id,
        author_user_id: buyer.id,
        author_type: 'BUYER',
        body: 'The Vlisco label looks photocopied.',
      },
    });

    await prisma.disputeEvidence.create({
      data: {
        dispute_id: dispute.id,
        uploaded_by_user_id: buyer.id,
        file_url: 'r2://evidence/photo-1.jpg',
        file_type: 'image/jpeg',
        file_size_bytes: 102400,
        evidence_type: 'PHOTO',
      },
    });

    const reloaded = await prisma.dispute.findUnique({
      where: { id: dispute.id },
      include: { messages: true, evidence: true },
    });
    expect(reloaded).not.toBeNull();
    expect(reloaded!.messages).toHaveLength(1);
    expect(reloaded!.evidence).toHaveLength(1);
    expect(reloaded!.status).toBe('OPEN');

    // Reference product to suppress unused-var lint
    expect(product.id).toBeTruthy();
  });
});
