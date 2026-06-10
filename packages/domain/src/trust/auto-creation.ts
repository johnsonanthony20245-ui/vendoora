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
 * This file is the rule registry. Each rule finds tripping subjects and calls
 * openCaseIfAbsent. Rules so far: driver delivery failures, stale KYC. More
 * (dispute pattern vs. a seller, fraud velocity) slot in the same way.
 */

type Db = PrismaClient;

/**
 * Statuses where a trust case is still being worked — while one of these is open
 * for a subject+signal, the scan won't open another. HEALTHY/RESOLVED are
 * "closed", so fresh signals after a resolution DO open a new case (deliberate:
 * fresh evidence = fresh scrutiny; there is no cooldown).
 */
const OPEN_CASE_STATUSES = ['NEW', 'MONITORING', 'NEEDS_INFO', 'ESCALATED', 'RESTRICTED'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULTS = {
  windowDays: 30,
  driverFailureThreshold: 3,
  kycStaleDays: 7,
  caseSlaDays: 3,
} as const;

export type TrustSubject = 'DRIVER' | 'SELLER' | 'KYC';

export interface AutoCreatedCase {
  caseId: string;
  caseNumber: string;
  subjectType: TrustSubject;
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
  kycStaleDays?: number;
}

function makeCaseNumber(now: Date): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  // 8 hex chars (32 bits) of suffix entropy; case_number is @unique, and a clash
  // is isolated per-subject in openCaseIfAbsent so it never sinks the whole scan.
  return `TC-${ymd}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

interface OpenCaseInput {
  subjectType: TrustSubject;
  subjectId: string;
  signal: string;
  severity: 'MEDIUM' | 'HIGH';
  title: string;
  summary: string;
  audit: Prisma.InputJsonValue;
}

/**
 * Open a trust case for a subject unless an open one already exists for the same
 * signal. Single-flight idempotent (see the file header on the TOCTOU caveat).
 * Isolated per subject: a failure here (a case_number clash, a concurrent scan
 * that beat us) returns null instead of sinking the rest of the scan.
 */
async function openCaseIfAbsent(
  db: Db,
  now: Date,
  dueDate: Date,
  input: OpenCaseInput,
): Promise<AutoCreatedCase | null> {
  try {
    const opened = await db.$transaction(async (tx) => {
      const existing = await tx.trustCase.findFirst({
        where: {
          subject_type: input.subjectType,
          subject_id: input.subjectId,
          auto_creation_signal: input.signal,
          status: { in: [...OPEN_CASE_STATUSES] },
        },
        select: { id: true },
      });
      if (existing) return null;

      const tc = await tx.trustCase.create({
        data: {
          case_number: makeCaseNumber(now),
          subject_type: input.subjectType,
          subject_id: input.subjectId,
          title: input.title,
          summary: input.summary,
          status: 'NEW',
          severity: input.severity,
          due_date: dueDate,
          auto_created: true,
          auto_creation_signal: input.signal,
        },
        select: { id: true, case_number: true },
      });
      await tx.auditLog.create({
        data: {
          actor_system: true,
          action: 'trust_case.auto_created',
          resource_type: 'trust_case',
          resource_id: tc.id,
          after_state: input.audit,
        },
      });
      return tc;
    });

    if (opened == null) return null;
    return {
      caseId: opened.id,
      caseNumber: opened.case_number,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      signal: input.signal,
      severity: input.severity,
    };
  } catch {
    return null;
  }
}

export async function runFraudScan(db: Db, args: FraudScanArgs = {}): Promise<FraudScanResult> {
  const now = args.now ?? new Date();
  const windowDays = args.windowDays ?? DEFAULTS.windowDays;
  const driverFailureThreshold = args.driverFailureThreshold ?? DEFAULTS.driverFailureThreshold;
  const kycStaleDays = args.kycStaleDays ?? DEFAULTS.kycStaleDays;
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const dueDate = new Date(now.getTime() + DEFAULTS.caseSlaDays * DAY_MS);

  const created: AutoCreatedCase[] = [];

  // ── Rule: a driver with >= threshold FAILED deliveries in the window ────────
  // NOTE: updated_at is a proxy for "failed in the window" — it's an @updatedAt
  // column, so an old FAILED delivery touched for an unrelated reason re-enters
  // the window. Skews toward false positives, not misses. Switch to a dedicated
  // failed_at column when one exists. (TODO)
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
    const severity: 'MEDIUM' | 'HIGH' = failureCount >= driverFailureThreshold * 2 ? 'HIGH' : 'MEDIUM';
    const c = await openCaseIfAbsent(db, now, dueDate, {
      subjectType: 'DRIVER',
      subjectId: driverId,
      signal: 'delivery_failure_driver',
      severity,
      title: `Repeated delivery failures — driver ${driverId}`,
      summary: `${failureCount} failed deliveries in the last ${windowDays} days (threshold ${driverFailureThreshold}).`,
      audit: {
        signal: 'delivery_failure_driver',
        subject_type: 'DRIVER',
        subject_id: driverId,
        severity,
        failure_count: failureCount,
        window_days: windowDays,
      },
    });
    if (c) created.push(c);
  }

  // ── Rule: a KYC application awaiting review past its SLA ─────────────────────
  const kycCutoff = new Date(now.getTime() - kycStaleDays * DAY_MS);
  const staleKyc = await db.kycApplication.findMany({
    where: {
      status: { in: ['SUBMITTED', 'IN_REVIEW'] },
      submitted_at: { not: null, lt: kycCutoff },
    },
    select: { id: true, applicant_user_id: true, applicant_type: true, submitted_at: true },
  });
  for (const app of staleKyc) {
    // The `where` already excludes null submitted_at; this narrows the type
    // (Prisma's not-null filter doesn't narrow the selected field's type).
    if (app.submitted_at == null) continue;
    const ageDays = Math.floor((now.getTime() - app.submitted_at.getTime()) / DAY_MS);
    const severity: 'MEDIUM' | 'HIGH' = ageDays >= kycStaleDays * 2 ? 'HIGH' : 'MEDIUM';
    const c = await openCaseIfAbsent(db, now, dueDate, {
      subjectType: 'KYC',
      subjectId: app.id,
      signal: 'kyc_stale',
      severity,
      title: `Stale KYC application — ${app.applicant_type.toLowerCase()} ${app.id}`,
      summary: `Submitted ${ageDays} days ago, still awaiting review (SLA ${kycStaleDays} days).`,
      audit: {
        signal: 'kyc_stale',
        subject_type: 'KYC',
        subject_id: app.id,
        applicant_user_id: app.applicant_user_id,
        applicant_type: app.applicant_type,
        age_days: ageDays,
      },
    });
    if (c) created.push(c);
  }

  return { created };
}
