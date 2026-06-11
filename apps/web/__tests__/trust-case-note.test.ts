/**
 * Add an investigation note to a trust case (packages/domain/src/trust/notes.ts:
 * addTrustCaseNote). Validates a non-empty body, requires the case to exist,
 * creates a TrustCaseNote + audit row.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { addTrustCaseNote } = await import('@vendoora/domain');

const TAG = `tcn-${randomUUID()}`;
let authorId = '';
const caseIds: string[] = [];

async function makeCase(): Promise<string> {
  const c = await prisma.trustCase.create({
    data: {
      case_number: `TC-${TAG}-${randomUUID().slice(0, 8).toUpperCase()}`,
      subject_type: 'DRIVER',
      subject_id: `${TAG}-subject`,
      title: 'note test case',
      summary: 'note test case',
      status: 'NEW',
      severity: 'MEDIUM',
      due_date: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      auto_created: true,
      auto_creation_signal: 'delivery_failure_driver',
    },
    select: { id: true },
  });
  caseIds.push(c.id);
  return c.id;
}

beforeAll(async () => {
  authorId = (
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
  await prisma.trustCaseNote.deleteMany({ where: { trust_case: { subject_id: `${TAG}-subject` } } });
  await prisma.trustCase.deleteMany({ where: { subject_id: `${TAG}-subject` } });
  caseIds.length = 0;
});

afterAll(async () => {
  await prisma.trustCaseNote.deleteMany({ where: { trust_case: { subject_id: `${TAG}-subject` } } });
  await prisma.trustCase.deleteMany({ where: { subject_id: `${TAG}-subject` } });
  await prisma.user.deleteMany({ where: { id: authorId } });
  await prisma.$disconnect();
});

describe('addTrustCaseNote', () => {
  it('adds an internal note + an audit row', async () => {
    const id = await makeCase();
    const r = await addTrustCaseNote(prisma, {
      caseId: id,
      authorUserId: authorId,
      body: 'Reviewed the delivery logs; pattern looks like address errors.',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const note = await prisma.trustCaseNote.findUnique({ where: { id: r.noteId } });
    expect(note?.trust_case_id).toBe(id);
    expect(note?.author_user_id).toBe(authorId);
    expect(note?.visibility).toBe('INTERNAL');
    expect(note?.body).toBe('Reviewed the delivery logs; pattern looks like address errors.');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'trust_case.note_added', resource_id: id },
    });
    expect(audit?.actor_user_id).toBe(authorId);
  });

  it('honors SHARED_WITH_SUBJECT visibility', async () => {
    const id = await makeCase();
    const r = await addTrustCaseNote(prisma, {
      caseId: id,
      authorUserId: authorId,
      body: 'Shared note to the subject.',
      visibility: 'SHARED_WITH_SUBJECT',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await prisma.trustCaseNote.findUnique({ where: { id: r.noteId } }))?.visibility).toBe(
      'SHARED_WITH_SUBJECT',
    );
  });

  it('rejects an empty body', async () => {
    const id = await makeCase();
    const r = await addTrustCaseNote(prisma, { caseId: id, authorUserId: authorId, body: '   ' });
    expect(r).toEqual({ ok: false, reason: 'empty_body' });
    expect(await prisma.trustCaseNote.count({ where: { trust_case_id: id } })).toBe(0);
  });

  it('rejects a missing case', async () => {
    const r = await addTrustCaseNote(prisma, {
      caseId: 'does-not-exist',
      authorUserId: authorId,
      body: 'orphan note',
    });
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });
});
