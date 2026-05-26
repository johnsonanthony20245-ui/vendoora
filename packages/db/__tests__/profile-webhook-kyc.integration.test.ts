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

describe('ProfileChangeRequest (§4.15)', () => {
  it('profile_change_requests table has key columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profile_change_requests'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'subject_type', 'subject_id', 'requested_by_user_id',
        'change_type', 'field_changes', 'status', 'required_approver_tier',
        'reviewed_by_user_id', 'applied_at',
      ]),
    );
  });

  it('all 4 ProfileChangeRequest enums exist', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('ProfileSubjectType', 'ProfileChangeType', 'ProfileChangeStatus', 'ApproverTier')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) (byType[row.typname] ??= []).push(row.enumlabel);
    expect(byType.ProfileSubjectType).toEqual(['SELLER', 'DRIVER']);
    expect(byType.ProfileChangeType).toEqual([
      'BUSINESS_NAME', 'LEGAL_NAME', 'ADDRESS', 'BANK_ACCOUNT', 'MOMO_NUMBER',
      'VEHICLE_DETAILS', 'SERVICE_ZONE', 'STORE_SLUG', 'TAX_ID', 'OWNER_NAME', 'OTHER',
    ]);
    expect(byType.ProfileChangeStatus).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_MORE_INFO', 'CANCELLED']);
    expect(byType.ApproverTier).toEqual(['TS_ADMIN', 'SUPERADMIN']);
  });
});

describe('Webhook + Outbox (§4.16)', () => {
  it('webhook_logs has UNIQUE (provider, external_event_id) for idempotency', async () => {
    const result = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'webhook_logs' AND indexdef LIKE '%UNIQUE%';
    `;
    const found = result.some((r) =>
      r.indexdef.includes('provider') && r.indexdef.includes('external_event_id'),
    );
    expect(found).toBe(true);
  });

  it('webhook_logs has direction + status enum columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'webhook_logs'
        AND column_name IN ('direction', 'status', 'provider', 'event_type',
                            'request_body', 'response_body', 'retry_count');
    `;
    expect(cols.length).toBe(7);
  });

  it('outbox_events table has aggregate fields + dispatch tracking', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'outbox_events'
        AND column_name IN ('aggregate_type', 'aggregate_id', 'event_type',
                            'payload', 'status', 'attempt_count', 'max_attempts',
                            'next_attempt_at', 'destinations');
    `;
    expect(cols.length).toBe(9);
  });

  it('all 3 webhook/outbox enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('WebhookDirection', 'WebhookStatus', 'OutboxStatus')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) (byType[row.typname] ??= []).push(row.enumlabel);
    expect(byType.WebhookDirection).toEqual(['INBOUND', 'OUTBOUND']);
    expect(byType.WebhookStatus).toEqual(['RECEIVED', 'PROCESSED', 'FAILED', 'RETRYING', 'DUPLICATE']);
    expect(byType.OutboxStatus).toEqual(['PENDING', 'DISPATCHED', 'FAILED', 'DEAD_LETTER']);
  });
});

describe('KYC Application (§4.18)', () => {
  it('kyc_applications has documented key columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kyc_applications'
      ORDER BY column_name;
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'applicant_type', 'applicant_user_id', 'target_tier', 'current_tier',
        'status', 'risk_tier', 'reviewer_user_id', 'review_started_at',
        'last_reminder_sent_at', 'reminder_count', 'stale_at',
      ]),
    );
  });

  it('kyc_documents has kyc_application_id FK + doc_type', async () => {
    const fk = await prisma.$queryRaw<Array<{ foreign_table_name: string }>>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'kyc_documents' AND kcu.column_name = 'kyc_application_id';
    `;
    expect(fk[0]!.foreign_table_name).toBe('kyc_applications');
  });

  it('all 5 KYC enums exist with documented values', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('KycApplicantType', 'KycApplicationStatus', 'RiskTier', 'KycDocType', 'KycDocStatus')
      ORDER BY t.typname, e.enumsortorder;
    `;
    const byType: Record<string, string[]> = {};
    for (const row of enums) (byType[row.typname] ??= []).push(row.enumlabel);
    expect(byType.KycApplicantType).toEqual(['SELLER', 'DRIVER']);
    expect(byType.KycApplicationStatus).toEqual([
      'NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'IN_REVIEW',
      'NEEDS_MORE_INFO', 'APPROVED', 'DENIED', 'EXPIRED',
    ]);
    expect(byType.RiskTier).toEqual(['LOW', 'MEDIUM', 'HIGH']);
    expect(byType.KycDocType).toEqual([
      'GOVERNMENT_ID', 'SELFIE', 'PROOF_OF_ADDRESS', 'BUSINESS_REGISTRATION',
      'TAX_CERTIFICATE', 'BANK_STATEMENT', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'OTHER',
    ]);
    expect(byType.KycDocStatus).toEqual(['UPLOADED', 'REVIEWED_VALID', 'REVIEWED_INVALID', 'EXPIRED', 'SUPERSEDED']);
  });

  it('end-to-end: create KYC application + attach documents + query relation', async () => {
    const applicant = await prisma.user.create({
      data: { clerk_id: 'clerk_kyc_app', email: 'kyc@test.local', full_name: 'KYC Applicant' },
    });
    const app = await prisma.kycApplication.create({
      data: {
        applicant_type: 'SELLER',
        applicant_user_id: applicant.id,
        target_tier: 2,
        status: 'IN_PROGRESS',
      },
    });
    await prisma.kycDocument.create({
      data: {
        kyc_application_id: app.id,
        doc_type: 'GOVERNMENT_ID',
        storage_url: 'r2://kyc/id-1.jpg',
        file_name: 'id.jpg',
        file_size_bytes: 204800,
        mime_type: 'image/jpeg',
      },
    });
    await prisma.kycDocument.create({
      data: {
        kyc_application_id: app.id,
        doc_type: 'SELFIE',
        storage_url: 'r2://kyc/selfie-1.jpg',
        file_name: 'selfie.jpg',
        file_size_bytes: 153600,
        mime_type: 'image/jpeg',
      },
    });

    const reloaded = await prisma.kycApplication.findUnique({
      where: { id: app.id },
      include: { documents: true },
    });
    expect(reloaded!.documents).toHaveLength(2);
    expect(reloaded!.documents.map((d) => d.doc_type).sort()).toEqual(['GOVERNMENT_ID', 'SELFIE']);
  });
});
