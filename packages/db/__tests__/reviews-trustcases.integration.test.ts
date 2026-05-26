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

describe('Reviews (Engineering_Spec §4.13)', () => {
  it('reviews table has key polymorphic columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reviews'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'subject_type', 'subject_id', 'author_user_id',
        'order_item_id', 'verified_purchase', 'rating', 'title', 'body',
        'status', 'seller_response', 'seller_response_at',
        'helpful_count', 'reported_count',
      ]),
    );
  });

  it('reviews.order_item_id is UNIQUE (one review per verified purchase)', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'reviews' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%order_item_id%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('review_reports has review_id and reporter_user_id FKs', async () => {
    const fks = await prisma.$queryRaw<Array<{ column_name: string; foreign_table_name: string }>>`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'review_reports'
      ORDER BY kcu.column_name;
    `;
    const tables = fks.map((r) => r.foreign_table_name).sort();
    expect(tables).toEqual(expect.arrayContaining(['reviews', 'users']));
  });

  it('review_aggregates has UNIQUE (subject_type, subject_id)', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'review_aggregates' AND indexdef LIKE '%UNIQUE%';
    `;
    const found = result.some((r) =>
      r.indexdef.includes('subject_type') && r.indexdef.includes('subject_id'),
    );
    expect(found).toBe(true);
  });

  it('review_aggregates.average_rating is Decimal(3, 2)', async () => {
    const result = await prisma.$queryRaw<Array<{ numeric_precision: number; numeric_scale: number }>>`
      SELECT numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'review_aggregates' AND column_name = 'average_rating';
    `;
    expect(result[0]!.numeric_precision).toBe(3);
    expect(result[0]!.numeric_scale).toBe(2);
  });

  it('all 4 review enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('ReviewSubjectType', 'ReviewStatus', 'ReportReason', 'ReportStatus')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) {
      (byType[row.typname] ??= []).push(row.enumlabel);
    }
    expect(byType.ReviewSubjectType).toEqual(['PRODUCT', 'SELLER']);
    expect(byType.ReviewStatus).toEqual(['PUBLISHED', 'PENDING_REVIEW', 'HIDDEN', 'DELETED']);
    expect(byType.ReportReason).toEqual([
      'FAKE_REVIEW', 'OFFENSIVE_LANGUAGE', 'OFF_TOPIC',
      'COMPETITOR_ATTACK', 'SPAM', 'OTHER',
    ]);
    expect(byType.ReportStatus).toEqual(['PENDING', 'REVIEWED_VALID', 'REVIEWED_INVALID', 'DUPLICATE']);
  });
});

describe('Trust Cases (Engineering_Spec §4.14)', () => {
  it('trust_cases table has key columns + polymorphic subject', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trust_cases'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'case_number', 'subject_type', 'subject_id',
        'title', 'summary', 'status', 'severity',
        'assigned_to_user_id', 'due_date', 'resolved_at',
        'resolution_action', 'auto_created', 'parent_case_id',
      ]),
    );
  });

  it('trust_cases.case_number is UNIQUE', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'trust_cases' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%case_number%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('trust_cases self-references via parent_case_id', async () => {
    const fk = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'trust_cases' AND kcu.column_name = 'parent_case_id';
    `;
    expect(fk.length).toBeGreaterThan(0);
    expect(fk[0]!.foreign_table_name).toBe('trust_cases');
  });

  it('trust_case_notes and trust_case_actions reference trust_cases', async () => {
    const notes = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('trust_case_notes', 'trust_case_actions');
    `;
    expect(notes).toHaveLength(2);
  });

  it('all 6 trust-case enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('TrustSubjectType', 'TrustCaseStatus', 'TrustSeverity', 'TrustResolution', 'NoteVisibility', 'TrustActionType')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) {
      (byType[row.typname] ??= []).push(row.enumlabel);
    }
    expect(byType.TrustSubjectType).toEqual(['SELLER', 'DRIVER', 'PRODUCT', 'ORDER', 'DISPUTE', 'KYC', 'USER']);
    expect(byType.TrustCaseStatus).toEqual(['NEW', 'HEALTHY', 'MONITORING', 'NEEDS_INFO', 'ESCALATED', 'RESTRICTED', 'RESOLVED']);
    expect(byType.TrustSeverity).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    expect(byType.TrustResolution).toEqual([
      'NO_ACTION_TAKEN', 'WARNING_ISSUED', 'SUSPENDED_TEMPORARY', 'SUSPENDED_PERMANENT',
      'REFUND_ISSUED', 'INSURANCE_PAYOUT', 'RESTORED',
    ]);
    expect(byType.NoteVisibility).toEqual(['INTERNAL', 'SHARED_WITH_SUBJECT']);
    expect(byType.TrustActionType).toEqual([
      'CASE_CREATED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED',
      'NOTE_ADDED', 'INFO_REQUESTED', 'ESCALATED', 'MARKED_MONITORING',
      'MARKED_REVIEWED', 'FOLLOW_UP_CREATED', 'RESTRICTED', 'RESOLVED', 'REOPENED',
    ]);
  });

  it('end-to-end: create trust case → add note → log action', async () => {
    const tsAdmin = await prisma.user.create({
      data: { clerk_id: 'clerk_ts_admin', email: 'ts@vendoora.test', full_name: 'T&S Admin' },
    });

    const tc = await prisma.trustCase.create({
      data: {
        case_number: 'TC-2026-' + Date.now(),
        subject_type: 'SELLER',
        subject_id: 'fake-seller-id-for-test',
        title: 'Suspicious dispute pattern',
        summary: 'Seller has 5 disputes in 7 days',
        severity: 'HIGH',
        due_date: new Date(Date.now() + 48 * 3600 * 1000),
        auto_created: true,
        auto_creation_signal: 'dispute_pattern_seller',
      },
    });

    await prisma.trustCaseNote.create({
      data: {
        trust_case_id: tc.id,
        author_user_id: tsAdmin.id,
        visibility: 'INTERNAL',
        body: 'Reaching out to seller for context.',
      },
    });

    await prisma.trustCaseAction.create({
      data: {
        trust_case_id: tc.id,
        actor_user_id: tsAdmin.id,
        action_type: 'CASE_CREATED',
        details: { source: 'fraud_engine', signal: 'dispute_pattern_seller' },
      },
    });

    const reloaded = await prisma.trustCase.findUnique({
      where: { id: tc.id },
      include: { notes: true, actions: true },
    });
    expect(reloaded!.notes).toHaveLength(1);
    expect(reloaded!.actions).toHaveLength(1);
    expect(reloaded!.status).toBe('NEW');
  });
});
