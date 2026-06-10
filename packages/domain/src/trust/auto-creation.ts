import { randomUUID } from 'node:crypto';
import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Trust-case auto-creation engine (Engineering_Spec §5.1.11 / trust cases).
 * runFraudScan evaluates risk rules over recent activity and opens a TrustCase
 * for each subject that trips one — so Trust & Safety has a queue of things to
 * look at instead of having to notice patterns by hand. Run on-demand and
 * nightly by the `fraud-detection-scan` worker job.
 *
 * Idempotency is single-flight: a subject with an OPEN auto-created case for the
 * same signal is skipped. This is enforced by a TOCTOU check (find-then-create),
 * NOT a DB constraint — so under truly concurrent scans (e.g. multiple worker
 * replicas) two cases could still open for one subject. The worker runs one
 * replica at concurrency 1, so that doesn't happen today; making it a hard
 * invariant (a partial unique index on (subject_type, subject_id,
 * auto_creation_signal) WHERE the case is open) is a tracked follow-up.
 *
 * This file is the rule registry. The first rule is "a driver with too many
 * failed deliveries"; more rules (dispute pattern vs. a seller, fraud velocity,
 * stale KYC) slot into runFraudScan the same way.
 */

type Db = PrismaClient;

/**
 * Statuses where a trust case is still being worked — while one of these is open
 * for a subject+signal, the scan won't open another. HEALTHY/RESOLVED are
 * "closed", so fresh failures after a resolution DO open a new case (deliberate:
 * fresh evidence = fresh scrutiny; there is no cooldown).
 */
const OPEN_CASE_STATUSES = ['NEW', 'MONITORING', 'NEEDS_INFO', 'ESCALATED', 'RESTRICTED'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULTS = {
  windowDays: 30,
  driverFailureThreshold: 3,
  caseSlaDays: 3,
} as const;

export interface AutoCreatedCase {
  caseId: string;
  caseNumber: string;
  subjectType: 'DRIVER' | 'SELLER';
  subjectId: string;
  signal: string;
  severity: 'MEDIUM' | 'HIGH';
}

export interface FraudScanResult {
  created: AutoCreatedCase[];
}

export interface FraudScanArgs {
  now?: Date;
  windowDays?: number;
  driverFailureThreshold?: number;
}

function makeCaseNumber(now: Date): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  // 8 hex chars (32 bits) of suffix entropy; case_number is @unique, and a clash
  // is isolated per-subject below so it never sinks the whole scan.
  return `TC-${ymd}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export async function runFraudScan(db: Db, args: FraudScanArgs = {}): Promise<FraudScanResult> {
  const now = args.now ?? new Date();
  const windowDays = args.windowDays ?? DEFAULTS.windowDays;
  const driverFailureThreshold = args.driverFailureThreshold ?? DEFAULTS.driverFailureThreshold;
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const dueDate = new Date(now.getTime() + DEFAULTS.caseSlaDays * DAY_MS);

  const created: AutoCreatedCase[] = [];

  // ── Rule: a driver with >= threshold FAILED deliveries in the window ────────
  // NOTE: updated_at is a proxy for "failed in the window" — it's an @updatedAt
  // column, so an old FAILED delivery touched for an unrelated reason (tip edit,
  // proof backfill) re-enters the window. This skews toward false positives, not
  // misses. Switch to a dedicated failed_at column when one exists. (TODO)
  const failingDrivers = await db.delivery.groupBy({
    by: ['driver_id'],
    where: { status: 'FAILED', driver_id: { not: null }, updated_at: { gte: since } },
    _count: { id: true },
    having: { id: { _count: { gte: driverFailureThreshold } } },
  });

  for (const grp of failingDrivers) {
    const driverId = grp.driver_id;
    if (driverId == null) continue;
    const failureCount = grp._count.id;
    const signal = 'delivery_failure_driver';
    const severity: 'MEDIUM' | 'HIGH' =
      failureCount >= driverFailureThreshold * 2 ? 'HIGH' : 'MEDIUM';

    let opened: { id: string; case_number: string } | null = null;
    try {
      opened = await db.$transaction(async (tx) => {
        // Re-check inside the tx to narrow (not eliminate) the create race — see
        // the header note on the single-flight idempotency guarantee.
        const existing = await tx.trustCase.findFirst({
          where: {
            subject_type: 'DRIVER',
            subject_id: driverId,
            auto_creation_signal: signal,
            status: { in: [...OPEN_CASE_STATUSES] },
          },
          select: { id: true },
        });
        if (existing) return null;

        const tc = await tx.trustCase.create({
          data: {
            case_number: makeCaseNumber(now),
            subject_type: 'DRIVER',
            subject_id: driverId,
            title: `Repeated delivery failures — driver ${driverId}`,
            summary: `${failureCount} failed deliveries in the last ${windowDays} days (threshold ${driverFailureThreshold}).`,
            status: 'NEW',
            severity,
            due_date: dueDate,
            auto_created: true,
            auto_creation_signal: signal,
          },
          select: { id: true, case_number: true },
        });
        await tx.auditLog.create({
          data: {
            actor_system: true,
            action: 'trust_case.auto_created',
            resource_type: 'trust_case',
            resource_id: tc.id,
            after_state: {
              signal,
              subject_type: 'DRIVER',
              subject_id: driverId,
              severity,
              failure_count: failureCount,
              window_days: windowDays,
            } satisfies Prisma.InputJsonValue,
          },
        });
        return tc;
      });
    } catch {
      // Isolate per subject: a failure here (a case_number unique clash, or a
      // concurrent scan that beat us) skips this driver, not the whole scan;
      // the next run retries.
      continue;
    }

    if (opened == null) continue;
    created.push({
      caseId: opened.id,
      caseNumber: opened.case_number,
      subjectType: 'DRIVER',
      subjectId: driverId,
      signal,
      severity,
    });
  }

  return { created };
}
