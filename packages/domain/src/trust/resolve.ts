import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Resolve a trust case (Engineering_Spec §5.1.11 / trust cases). A T&S admin
 * closes an open case with a resolution action + a summary; this records the
 * decision and stamps the audit trail. Terminal — a case that's already
 * RESOLVED/HEALTHY can't be re-resolved.
 *
 * The status flip is state-guarded (updateMany WHERE not-already-closed) so two
 * admins acting at once can't double-resolve / double-audit.
 */

type Db = PrismaClient;

/** Mirror of the TrustResolution enum. */
export type TrustResolutionAction =
  | 'NO_ACTION_TAKEN'
  | 'WARNING_ISSUED'
  | 'SUSPENDED_TEMPORARY'
  | 'SUSPENDED_PERMANENT'
  | 'REFUND_ISSUED'
  | 'INSURANCE_PAYOUT'
  | 'RESTORED';

const CLOSED_STATUSES = ['RESOLVED', 'HEALTHY'] as const;

/** Valid TrustResolution values — for the runtime guard (untyped route callers). */
const RESOLUTION_ACTIONS: readonly TrustResolutionAction[] = [
  'NO_ACTION_TAKEN',
  'WARNING_ISSUED',
  'SUSPENDED_TEMPORARY',
  'SUSPENDED_PERMANENT',
  'REFUND_ISSUED',
  'INSURANCE_PAYOUT',
  'RESTORED',
];

export type ResolveTrustCaseReason =
  | 'not_found'
  | 'already_resolved'
  | 'empty_summary'
  | 'invalid_resolution';

export type ResolveTrustCaseResult =
  | { ok: true; caseId: string }
  | { ok: false; reason: ResolveTrustCaseReason };

export interface ResolveTrustCaseArgs {
  caseId: string;
  resolution: TrustResolutionAction;
  summary: string;
  actorUserId: string;
  now?: Date;
}

export async function resolveTrustCase(
  db: Db,
  args: ResolveTrustCaseArgs,
): Promise<ResolveTrustCaseResult> {
  const now = args.now ?? new Date();
  const summary = args.summary.trim();
  if (summary.length === 0) return { ok: false, reason: 'empty_summary' };
  // Defensive: a future admin route may pass a raw string from the request body.
  if (!RESOLUTION_ACTIONS.includes(args.resolution)) {
    return { ok: false, reason: 'invalid_resolution' };
  }

  const tc = await db.trustCase.findUnique({
    where: { id: args.caseId },
    select: { id: true, status: true },
  });
  if (tc == null) return { ok: false, reason: 'not_found' };
  if (CLOSED_STATUSES.includes(tc.status as (typeof CLOSED_STATUSES)[number])) {
    return { ok: false, reason: 'already_resolved' };
  }

  const resolved = await db.$transaction(async (tx) => {
    const { count } = await tx.trustCase.updateMany({
      where: { id: args.caseId, status: { notIn: [...CLOSED_STATUSES] } },
      data: {
        status: 'RESOLVED',
        resolved_at: now,
        resolution_action: args.resolution,
        resolution_summary: summary,
      },
    });
    if (count === 0) return false;
    await tx.auditLog.create({
      data: {
        actor_user_id: args.actorUserId,
        actor_system: false,
        action: 'trust_case.resolved',
        resource_type: 'trust_case',
        resource_id: args.caseId,
        before_state: { status: tc.status } satisfies Prisma.InputJsonValue,
        after_state: {
          status: 'RESOLVED',
          resolution_action: args.resolution,
          resolution_summary: summary,
          resolved_at: now.toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });
    return true;
  });

  if (!resolved) return { ok: false, reason: 'already_resolved' };
  return { ok: true, caseId: args.caseId };
}
