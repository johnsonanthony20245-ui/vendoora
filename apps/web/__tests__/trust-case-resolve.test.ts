/**
 * Resolve a trust case (packages/domain/src/trust/resolve.ts: resolveTrustCase).
 * A T&S admin closes an open case with a resolution action + summary; the status
 * flip is state-guarded and audited, and is terminal (no re-resolving).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { resolveTrustCase } = await import('@vendoora/domain');

const TAG = `tcr-${randomUUID()}`;
const NOW = new Date('2026-06-10T12:00:00.000Z');
let actorId = '';
const caseIds: string[] = [];

async function makeCase(status: 'NEW' | 'MONITORING' | 'RESOLVED' = 'NEW'): Promise<string> {
  const c = await prisma.trustCase.create({
    data: {
      case_number: `TC-${TAG}-${randomUUID().slice(0, 8).toUpperCase()}`,
      subject_type: 'DRIVER',
      subject_id: `${TAG}-subject`,
      title: 'resolve test case',
      summary: 'resolve test case',
      status,
      severity: 'MEDIUM',
      due_date: new Date(NOW.getTime() + 3 * 24 * 3600 * 1000),
      auto_created: true,
      auto_creation_signal: 'delivery_failure_driver',
    },
    select: { id: true },
  });
  caseIds.push(c.id);
  return c.id;
}

beforeAll(async () => {
  actorId = (
    await prisma.user.create({
      data: {
        clerk_id: `admin_${TAG}`,
        email: `${TAG}@vendoora.test`,
        full_name: 'T&S Admin',
        is_email_verified: true,
        account_status: 'ACTIVE',
      },
      select: { id: true },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.trustCase.deleteMany({ where: { subject_id: `${TAG}-subject` } });
  caseIds.length = 0;
});

afterAll(async () => {
  await prisma.trustCase.deleteMany({ where: { subject_id: `${TAG}-subject` } });
  await prisma.user.deleteMany({ where: { id: actorId } });
  await prisma.$disconnect();
});

describe('resolveTrustCase', () => {
  it('resolves an open case: status RESOLVED + resolution fields + audit', async () => {
    const id = await makeCase('NEW');
    const r = await resolveTrustCase(prisma, {
      caseId: id,
      resolution: 'WARNING_ISSUED',
      summary: 'Warned the driver; monitoring next 30 days.',
      actorUserId: actorId,
      now: NOW,
    });
    expect(r).toEqual({ ok: true, caseId: id });

    const tc = await prisma.trustCase.findUnique({ where: { id } });
    expect(tc?.status).toBe('RESOLVED');
    expect(tc?.resolution_action).toBe('WARNING_ISSUED');
    expect(tc?.resolution_summary).toBe('Warned the driver; monitoring next 30 days.');
    expect(tc?.resolved_at?.toISOString()).toBe(NOW.toISOString());

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'trust_case.resolved', resource_id: id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actor_user_id).toBe(actorId);
  });

  it('rejects an empty summary', async () => {
    const id = await makeCase('NEW');
    const r = await resolveTrustCase(prisma, {
      caseId: id,
      resolution: 'NO_ACTION_TAKEN',
      summary: '   ',
      actorUserId: actorId,
      now: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'empty_summary' });
    expect((await prisma.trustCase.findUnique({ where: { id } }))?.status).toBe('NEW');
  });

  it('rejects a missing case', async () => {
    const r = await resolveTrustCase(prisma, {
      caseId: 'does-not-exist',
      resolution: 'NO_ACTION_TAKEN',
      summary: 'n/a',
      actorUserId: actorId,
      now: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  it('cannot re-resolve an already-resolved case', async () => {
    const id = await makeCase('RESOLVED');
    const r = await resolveTrustCase(prisma, {
      caseId: id,
      resolution: 'RESTORED',
      summary: 'trying again',
      actorUserId: actorId,
      now: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'already_resolved' });
  });

  it('resolves a case from a mid-review status (MONITORING)', async () => {
    const id = await makeCase('MONITORING');
    const r = await resolveTrustCase(prisma, {
      caseId: id,
      resolution: 'RESTORED',
      summary: 'Reviewed; subject back in good standing.',
      actorUserId: actorId,
      now: NOW,
    });
    expect(r).toEqual({ ok: true, caseId: id });
    expect((await prisma.trustCase.findUnique({ where: { id } }))?.status).toBe('RESOLVED');
  });

  it('rejects an unknown resolution action (untyped caller)', async () => {
    const id = await makeCase('NEW');
    const r = await resolveTrustCase(prisma, {
      caseId: id,
      resolution: 'BOGUS_ACTION' as never,
      summary: 'should not apply',
      actorUserId: actorId,
      now: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'invalid_resolution' });
    expect((await prisma.trustCase.findUnique({ where: { id } }))?.status).toBe('NEW');
  });
});
