import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../../lib/admin';
import { resolveTrustCaseAction, addTrustCaseNoteAction } from '../../../actions/trust-case';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Trust case — ${BRAND_NAME}`,
};

const OPEN_STATUSES = ['NEW', 'MONITORING', 'NEEDS_INFO', 'ESCALATED', 'RESTRICTED'];

const RESOLUTIONS: { value: string; label: string }[] = [
  { value: 'NO_ACTION_TAKEN', label: 'No action taken' },
  { value: 'WARNING_ISSUED', label: 'Warning issued' },
  { value: 'SUSPENDED_TEMPORARY', label: 'Suspended — temporary' },
  { value: 'SUSPENDED_PERMANENT', label: 'Suspended — permanent' },
  { value: 'REFUND_ISSUED', label: 'Refund issued' },
  { value: 'INSURANCE_PAYOUT', label: 'Insurance payout' },
  { value: 'RESTORED', label: 'Restored to good standing' },
];

const ERROR_COPY: Record<string, string> = {
  missing_case: 'Could not identify the case.',
  invalid_resolution: 'Pick a valid resolution.',
  short_summary: 'Add at least 10 characters explaining the resolution.',
  empty_summary: 'A resolution summary is required.',
  not_found: 'Case not found.',
  already_resolved: 'This case was already resolved.',
  short_note: 'A note needs at least 3 characters.',
  empty_body: 'A note needs at least 3 characters.',
  note_requires_user: 'Notes require a Clerk admin linked to a user profile (not available in dev sessions).',
};

interface PageProps {
  params: Promise<{ caseNumber: string }>;
  searchParams: Promise<{ error?: string; resolved?: string; noted?: string }>;
}

export default async function TrustCaseDetailPage({ params, searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const { caseNumber } = await params;
  const sp = await searchParams;

  const tc = await prisma.trustCase.findUnique({ where: { case_number: caseNumber } });

  if (!tc) {
    return (
      <main className="bg-neutral-50 min-h-screen px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <Link href="/admin/trust-cases" className="text-sm font-semibold text-blue-700 hover:underline">
            ← Trust case queue
          </Link>
          <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center text-neutral-600">
            Case {caseNumber} not found.
          </div>
        </div>
      </main>
    );
  }

  const isOpen = OPEN_STATUSES.includes(tc.status);
  const errorMsg = sp.error ? (ERROR_COPY[sp.error] ?? 'Something went wrong.') : null;

  const notes = await prisma.trustCaseNote.findMany({
    where: { trust_case_id: tc.id },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      body: true,
      visibility: true,
      created_at: true,
      author: { select: { full_name: true } },
    },
  });

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/trust-cases" className="text-sm font-semibold text-blue-700 hover:underline">
          ← Trust case queue
        </Link>

        <h1 className="mt-4 font-mono text-2xl font-bold text-neutral-900">{tc.case_number}</h1>
        <p className="mt-1 text-neutral-700">{tc.title}</p>

        {sp.resolved && (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Case resolved.
          </div>
        )}
        {sp.noted && (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Note added.
          </div>
        )}
        {errorMsg && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {errorMsg}
          </div>
        )}

        <dl className="mt-8 grid grid-cols-2 gap-4 rounded-xl border border-neutral-200 bg-neutral-0 p-6 text-sm">
          <Field label="Subject">
            {tc.subject_type} <span className="font-mono text-xs text-neutral-500">{tc.subject_id}</span>
          </Field>
          <Field label="Severity">{tc.severity}</Field>
          <Field label="Status">{tc.status.replace(/_/g, ' ')}</Field>
          <Field label="Source">
            {tc.auto_created ? (tc.auto_creation_signal ?? 'auto').replace(/_/g, ' ') : 'Manual'}
          </Field>
          <Field label="Opened">{tc.created_at.toISOString().slice(0, 16).replace('T', ' ')}</Field>
          <Field label="Due">{tc.due_date.toISOString().slice(0, 16).replace('T', ' ')}</Field>
          <div className="col-span-2">
            <Field label="Summary">{tc.summary}</Field>
          </div>
        </dl>

        <section className="mt-8 rounded-xl border border-neutral-200 bg-neutral-0 p-6">
          <h2 className="text-lg font-bold text-neutral-900">Investigation notes</h2>

          {notes.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No notes yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="font-semibold text-neutral-700">
                      {n.author.full_name ?? 'Admin'}
                    </span>
                    <span>· {n.created_at.toISOString().slice(0, 16).replace('T', ' ')}</span>
                    {n.visibility === 'SHARED_WITH_SUBJECT' && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-200">
                        Shared
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{n.body}</p>
                </li>
              ))}
            </ul>
          )}

          <form action={addTrustCaseNoteAction} className="mt-5 border-t border-neutral-200 pt-5">
            <input type="hidden" name="caseId" value={tc.id} />
            <input type="hidden" name="caseNumber" value={tc.case_number} />
            <label htmlFor="noteBody" className="sr-only">
              Add a note
            </label>
            <textarea
              id="noteBody"
              name="noteBody"
              required
              minLength={3}
              rows={3}
              placeholder="Add an investigation note…"
              className="w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex items-center gap-3">
              <select
                name="visibility"
                defaultValue="INTERNAL"
                aria-label="Note visibility"
                className="rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
              >
                <option value="INTERNAL">Internal</option>
                <option value="SHARED_WITH_SUBJECT">Shared with subject</option>
              </select>
              <button
                type="submit"
                className="rounded-lg border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
              >
                Add note
              </button>
            </div>
          </form>
        </section>

        {isOpen ? (
          <form
            action={resolveTrustCaseAction}
            className="mt-8 rounded-xl border border-neutral-200 bg-neutral-0 p-6"
          >
            <h2 className="text-lg font-bold text-neutral-900">Resolve</h2>
            <input type="hidden" name="caseId" value={tc.id} />
            <input type="hidden" name="caseNumber" value={tc.case_number} />

            <label
              htmlFor="resolution"
              className="mt-4 block text-xs font-bold uppercase tracking-widest text-neutral-600"
            >
              Resolution
            </label>
            <select
              id="resolution"
              name="resolution"
              required
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select an action…
              </option>
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>

            <label
              htmlFor="summary"
              className="mt-4 block text-xs font-bold uppercase tracking-widest text-neutral-600"
            >
              Summary
            </label>
            <textarea
              id="summary"
              name="summary"
              required
              minLength={10}
              rows={4}
              placeholder="What did you find, and what action did you take?"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
            />

            <button
              type="submit"
              className="mt-5 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
            >
              Resolve case
            </button>
          </form>
        ) : (
          <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-0 p-6 text-sm">
            <h2 className="text-lg font-bold text-neutral-900">Resolution</h2>
            <p className="mt-2 text-neutral-700">
              <span className="font-semibold">{(tc.resolution_action ?? '—').replace(/_/g, ' ')}</span>
              {tc.resolved_at && (
                <span className="text-neutral-500">
                  {' '}
                  · {tc.resolved_at.toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              )}
            </p>
            {tc.resolution_summary && <p className="mt-2 text-neutral-700">{tc.resolution_summary}</p>}
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-widest text-neutral-500">{label}</dt>
      <dd className="mt-1 text-neutral-800">{children}</dd>
    </div>
  );
}
