import { prisma, type Prisma } from '@vendoora/db';

/**
 * Surface moderation rejection notes back to the seller.
 *
 * When T&S rejects a product, `reviewProduct` writes a `product.rejected`
 * audit row with `metadata.notes` containing the reviewer's explanation.
 * Without surfacing those notes on the seller console, a rejected seller has
 * no way to know what to fix — they re-submit the same broken listing and
 * hit the same wall. This helper bulk-loads the most recent `product.rejected`
 * audit row per product id so the console can render the note inline.
 *
 * Why bulk (one query for N products): renders happen on every seller-console
 * page load with up to 50 products. A per-row `findFirst` would be 50 round
 * trips — a single `findMany` with `where: resource_id IN […]` is one trip.
 *
 * Returned shape is keyed by `productId` so the UI can `.get(p.id)` per row
 * without re-scanning. Approvals don't surface a note today (sellers don't
 * need to read "your listing was fine") but adding `product.approved` to
 * `ACTIONS` here would extend the same pipeline if that changes.
 */

const ACTIONS = ['product.rejected'] as const;

/**
 * One feedback entry. `notes` may be null if the reviewer didn't supply any
 * (the 10-char minimum applies to REJECT but a future workflow change could
 * make it optional — render defensively).
 */
export interface ModerationFeedback {
  /** The latest decision action written for this product. */
  action: 'product.rejected';
  /** The reviewer's explanation, when present. */
  notes: string | null;
  /** When the decision was written. */
  decided_at: Date;
}

export async function getModerationFeedback(
  productIds: string[],
): Promise<Map<string, ModerationFeedback>> {
  const out = new Map<string, ModerationFeedback>();
  if (productIds.length === 0) return out;

  // One query, all products. orderBy created_at desc + distinct on resource_id
  // would be ideal, but Prisma doesn't surface DISTINCT ON portably across
  // databases. Instead: pull every matching row newest-first and let the first
  // hit per resource_id win.
  const rows = await prisma.auditLog.findMany({
    where: {
      resource_type: 'product',
      resource_id: { in: productIds },
      action: { in: [...ACTIONS] },
    },
    orderBy: { created_at: 'desc' },
    select: {
      action: true,
      resource_id: true,
      created_at: true,
      metadata: true,
    },
  });

  for (const row of rows) {
    if (!row.resource_id) continue;
    if (out.has(row.resource_id)) continue; // already have the newest
    const meta = (row.metadata ?? null) as Prisma.JsonValue;
    const notes =
      meta && typeof meta === 'object' && !Array.isArray(meta) && 'notes' in meta
        ? typeof meta.notes === 'string'
          ? meta.notes
          : null
        : null;
    out.set(row.resource_id, {
      action: row.action as 'product.rejected',
      notes,
      decided_at: row.created_at,
    });
  }

  return out;
}
