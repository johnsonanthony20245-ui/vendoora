import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Add an investigation note to a trust case (Engineering_Spec §5.1.11 / trust
 * cases). T&S annotates a case while working it — separate from the final
 * resolution. INTERNAL by default; SHARED_WITH_SUBJECT notes are intended to be
 * surfaced to the subject. author_user_id is a real User FK (unlike the FK-less
 * audit actor), so callers pass the acting admin's resolved User id.
 */

type Db = PrismaClient;

export type NoteVisibility = 'INTERNAL' | 'SHARED_WITH_SUBJECT';

export type AddTrustCaseNoteReason = 'not_found' | 'empty_body';

export type AddTrustCaseNoteResult =
  | { ok: true; noteId: string }
  | { ok: false; reason: AddTrustCaseNoteReason };

export interface AddTrustCaseNoteArgs {
  caseId: string;
  authorUserId: string;
  body: string;
  visibility?: NoteVisibility;
}

export async function addTrustCaseNote(
  db: Db,
  args: AddTrustCaseNoteArgs,
): Promise<AddTrustCaseNoteResult> {
  const body = args.body.trim();
  if (body.length === 0) return { ok: false, reason: 'empty_body' };

  const tc = await db.trustCase.findUnique({ where: { id: args.caseId }, select: { id: true } });
  if (tc == null) return { ok: false, reason: 'not_found' };

  const visibility: NoteVisibility = args.visibility ?? 'INTERNAL';

  const note = await db.$transaction(async (tx) => {
    const n = await tx.trustCaseNote.create({
      data: {
        trust_case_id: args.caseId,
        author_user_id: args.authorUserId,
        body,
        visibility,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        actor_user_id: args.authorUserId,
        actor_system: false,
        action: 'trust_case.note_added',
        resource_type: 'trust_case',
        resource_id: args.caseId,
        after_state: { note_id: n.id, visibility } satisfies Prisma.InputJsonValue,
      },
    });
    return n;
  });

  return { ok: true, noteId: note.id };
}
