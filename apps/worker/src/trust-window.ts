/**
 * Shared trust-recompute window math, used by BOTH scheduler modes (the BullMQ
 * job in trust-score-queue.ts and the poll-loop sweep in index.ts) so the two
 * can't drift. This module imports nothing heavy, so index.ts can pull it in
 * statically without dragging BullMQ into the poll-loop path.
 */

/** Overlap added to the look-back window so a jittered/late tick skips nobody. */
export const TRUST_RECOMPUTE_LOOKBACK_MARGIN_MS = 60 * 60 * 1000;

/**
 * Activity cutoff for a recompute run: look back one interval plus the margin.
 * On normal cadence each run overlaps the previous by the margin.
 *
 * Downtime semantics: on prolonged worker downtime (longer than interval +
 * margin), buyers active ONLY during the gap are skipped until their next
 * activity re-surfaces them. That's acceptable here and deliberately needs no
 * persisted marker (unlike the cumulative, money-moving insurance top-up): the
 * trust score is a pure, idempotent recompute from current state, so a missed
 * buyer simply keeps a still-valid, slightly stale score until next time.
 */
export function trustRecomputeSince(nowMs: number, intervalMs: number): Date {
  return new Date(nowMs - intervalMs - TRUST_RECOMPUTE_LOOKBACK_MARGIN_MS);
}
