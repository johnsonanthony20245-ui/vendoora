import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Checkout lifecycle sweep: expire abandoned PENDING_PAYMENT orders.
 *
 * A buyer who abandons checkout between buildPendingOrder and Stripe
 * confirmation leaves an Order(PENDING_PAYMENT) that no rail will ever
 * finalize. This module transitions such orders to EXPIRED (the enum value
 * exists for exactly this), marks the in-flight Payment FAILED, writes
 * history + audit, and best-effort cancels the Stripe PaymentIntent.
 *
 * Stripe-free by design (mirrors escrow.ts): the cancel is an injected
 * closure so the domain package never imports the Stripe SDK and the tests
 * pass a spy. The cancel runs AFTER the DB transaction commits — never holding
 * a Postgres transaction open across a network round-trip.
 */

/** Default age past which a PENDING_PAYMENT order is considered abandoned. */
export const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;

type Db = PrismaClient;

export interface ExpiryResult {
  expiredOrderIds: string[];
}

export interface ExpirySweepResult {
  ordersExpired: number;
  stripeCancelFailures: number;
}

/**
 * Expire one specific order iff it is still PENDING_PAYMENT. The state-guarded
 * updateMany is the racing-payment safety property: if finalizePaidOrder lands
 * between the read and the update, the WHERE status='PENDING_PAYMENT' clause
 * matches zero rows, count is 0, and we bail — the order is correctly PAID, no
 * expiry audit, no clobber.
 *
 * The Stripe cancel runs after the transaction commits. A cancel that throws
 * (PI already succeeded/canceled) is logged to audit and rethrown to the
 * caller's closure if it chose to observe failures — the order stays EXPIRED.
 */
export async function expirePendingOrder(
  db: Db,
  args: {
    orderId: string;
    now?: Date;
    cancelStripeIntent?: (pi: string) => Promise<void>;
  },
): Promise<ExpiryResult> {
  const { orderId } = args;
  const now = args.now ?? new Date();

  const { expiredOrderIds, paymentIntentId } = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, payment_intent_id: true, created_at: true },
    });
    if (!order || order.status !== 'PENDING_PAYMENT') {
      return { expiredOrderIds: [] as string[], paymentIntentId: null as string | null };
    }

    // State-guarded write — atomic re-check of status='PENDING_PAYMENT'.
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING_PAYMENT' },
      data: { status: 'EXPIRED', status_updated_at: now },
    });
    if (count === 0) {
      return { expiredOrderIds: [] as string[], paymentIntentId: null as string | null };
    }

    await tx.payment.updateMany({
      where: { order_id: orderId, status: 'PENDING' },
      data: { status: 'FAILED', failed_at: now, failure_reason: 'order_expired' },
    });

    await tx.orderStatusHistory.create({
      data: {
        order_id: orderId,
        from_status: 'PENDING_PAYMENT',
        to_status: 'EXPIRED',
        changed_by_system: true,
        reason: 'abandoned_checkout',
      },
    });

    await tx.auditLog.create({
      data: {
        actor_system: true,
        action: 'order.expired',
        resource_type: 'order',
        resource_id: orderId,
        before_state: { status: 'PENDING_PAYMENT' } satisfies Prisma.InputJsonValue,
        after_state: { status: 'EXPIRED' } satisfies Prisma.InputJsonValue,
        metadata: {
          reason: 'abandoned_checkout',
          payment_intent_id: order.payment_intent_id,
          age_ms: now.getTime() - order.created_at.getTime(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { expiredOrderIds: [orderId], paymentIntentId: order.payment_intent_id };
  });

  // Best-effort Stripe cancel AFTER commit. A throw here does not undo the
  // expiry — it is logged and rethrown so an observing caller (the sweep) can
  // count it.
  if (expiredOrderIds.length > 0 && paymentIntentId && args.cancelStripeIntent) {
    try {
      await args.cancelStripeIntent(paymentIntentId);
    } catch (err) {
      await db.auditLog.create({
        data: {
          actor_system: true,
          action: 'payment.stripe_cancel_failed',
          resource_type: 'order',
          resource_id: orderId,
          metadata: {
            payment_intent_id: paymentIntentId,
            error: err instanceof Error ? err.message : String(err),
          } satisfies Prisma.InputJsonValue,
        },
      });
      throw err;
    }
  }

  return { expiredOrderIds };
}

/**
 * Sweep the marketplace for abandoned PENDING_PAYMENT orders older than
 * olderThanMs and expire each. Candidate discovery is a single FIFO-ordered
 * query (oldest first, so a backlog larger than `limit` can't starve the most
 * overdue). Each order is its own transaction via expirePendingOrder, so one
 * slow/failed order can't roll back the others. stripeCancelFailures counts
 * post-commit cancel rejections purely for observability.
 */
export async function expireStalePendingOrders(
  db: Db,
  args: {
    now?: Date;
    olderThanMs?: number;
    limit?: number;
    cancelStripeIntent?: (pi: string) => Promise<void>;
  } = {},
): Promise<ExpirySweepResult> {
  const now = args.now ?? new Date();
  const olderThanMs = args.olderThanMs ?? DEFAULT_EXPIRY_MS;
  const limit = args.limit ?? 500;
  const cancel = args.cancelStripeIntent;

  const due = await db.order.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      created_at: { lte: new Date(now.getTime() - olderThanMs) },
    },
    orderBy: { created_at: 'asc' },
    select: { id: true },
    take: limit,
  });

  let ordersExpired = 0;
  let stripeCancelFailures = 0;

  for (const { id } of due) {
    // Wrap the injected cancel so we can tell WHICH failure mode threw.
    // expirePendingOrder commits the expiry (+ history + audit) and only THEN
    // runs the cancel; a cancel rejection sets cancelFailed=true and is rethrown
    // (the expiry already stands). Any OTHER throw is a genuine pre-commit
    // failure (e.g. the DB transaction) where the order was NOT expired.
    let cancelFailed = false;
    const countingCancel = cancel
      ? async (pi: string) => {
          try {
            await cancel(pi);
          } catch (err) {
            cancelFailed = true;
            throw err;
          }
        }
      : undefined;

    try {
      const res = await expirePendingOrder(db, {
        orderId: id,
        now,
        ...(countingCancel ? { cancelStripeIntent: countingCancel } : {}),
      });
      ordersExpired += res.expiredOrderIds.length;
    } catch (err) {
      if (!cancelFailed) {
        // Genuine pre-commit failure — the order was NOT expired. Don't inflate
        // the counts; let the scheduler layer (poll-loop / BullMQ) log it.
        throw err;
      }
      // Expiry committed + audited; only the post-commit Stripe cancel threw.
      ordersExpired += 1;
      stripeCancelFailures += 1;
    }
  }

  return { ordersExpired, stripeCancelFailures };
}
