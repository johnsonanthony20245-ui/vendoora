import { randomUUID } from 'node:crypto';
import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Trust-case auto-creation engine (Engineering_Spec §5.1.11 / trust cases).
 * runFraudScan evaluates risk rules over recent activity and opens a TrustCase
 * for each subject that trips one — so Trust & Safety has a queue of things to
 * look at instead of having to notice patterns by hand. Run on-demand and
 * nightly by the `fraud-detection-scan` worker job.
 *
 * Idempotent: a subject that already has an OPEN auto-created case for the same
 * signal is skipped, so re-running the scan never piles up duplicates.
 *
 * This file is the rule registry. The first rule is "a driver with too many
 * failed deliveries"; more rules (dispute pattern vs. a seller, fraud velocity,
 * stale KYC) slot into runFraudScan the same way.
 */

type Db = PrismaClient;

/** Statuses where a trust case is still being worked — a duplicate must not open. */
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
  return `TC-${ymd}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function runFraudScan(db: Db, args: FraudScanArgs = {}): Promise<FraudScanResult> {
  const now = args.now ?? new Date();
  const windowDays = args.windowDays ?? DEFAULTS.windowDays;
  const driverFailureThreshold = args.driverFailureThreshold ?? DEFAULTS.driverFailureThreshold;
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const dueDate = new Date(now.getTime() + DEFAULTS.caseSlaDays * DAY_MS);

  const created: AutoCreatedCase[] = [];

  // ── Rule: a driver with >= threshold FAILED deliveries in the window ────────
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

    const opened = await db.$transaction(async (tx) => {
      // Guard inside the tx so two concurrent scans can't both open a case.
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
