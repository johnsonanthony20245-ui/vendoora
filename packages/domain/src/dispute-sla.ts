import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Dispute SLA-breach sweep. A dispute that is still open in the T&S queue but
 * has blown past its `sla_due_at` must not age silently — this sweep flags it
 * (`sla_breached`) and escalates it to senior T&S (`status = ESCALATED`,
 * `escalated_at` stamped) so it surfaces in the escalation queue.
 *
 * "Active" = the dispute is still awaiting T&S/party action (OPEN, IN_REVIEW,
 * PENDING_BUYER, PENDING_SELLER). Already-escalated, resolved, closed, or
 * withdrawn disputes are skipped. The sweep is idempotent: once a dispute is
 * flagged it leaves the `sla_breached: false` selection, so a re-run is a no-op.
 */

type Db = PrismaClient;

/** Dispute statuses still actively awaiting action — eligible for SLA escalation. */
const ACTIVE_DISPUTE_STATUSES = ['OPEN', 'IN_REVIEW', 'PENDING_BUYER', 'PENDING_SELLER'] as const;

export interface DisputeSlaSweepResult {
  escalated: number;
  disputeIds: string[];
}

export async function sweepDisputeSlaBreaches(
  db: Db,
  args: { now?: Date } = {},
): Promise<DisputeSlaSweepResult> {
  const now = args.now ?? new Date();

  const breached = await db.dispute.findMany({
    where: {
      status: { in: [...ACTIVE_DISPUTE_STATUSES] },
      sla_breached: false,
      sla_due_at: { lt: now },
    },
    select: { id: true, status: true },
  });

  const disputeIds: string[] = [];
  for (const d of breached) {
    // Flag + escalate + audit atomically, per dispute (each is independent).
    await db.$transaction([
      db.dispute.update({
        where: { id: d.id },
        data: { sla_breached: true, escalated_at: now, status: 'ESCALATED' },
      }),
      db.auditLog.create({
        data: {
          actor_system: true,
          action: 'dispute.sla.escalated',
          resource_type: 'dispute',
          resource_id: d.id,
          before_state: { status: d.status, sla_breached: false } satisfies Prisma.InputJsonValue,
          after_state: {
            status: 'ESCALATED',
            sla_breached: true,
            escalated_at: now.toISOString(),
          } satisfies Prisma.InputJsonValue,
        },
      }),
    ]);
    disputeIds.push(d.id);
  }

  return { escalated: disputeIds.length, disputeIds };
}
