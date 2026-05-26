// OrderStatus is re-exported via @vendoora/db's Prisma re-exports. We
// could also import from @prisma/client directly but apps/web doesn't
// declare it as a direct dep — we always go through @vendoora/db.
import type { Prisma } from '@vendoora/db';

type OrderStatus = Prisma.OrderGetPayload<{ select: { status: true } }>['status'];

/**
 * Map Order.status to the 5-stage buyer-facing tracking flow from
 * Polish_Phase_Addendum §1.3. Terminal/failure states (CANCELLED,
 * REFUNDED, EXPIRED, DISPUTED) get their own panel and don't map to
 * a numeric stage.
 */
export type BuyerStage = 0 | 1 | 2 | 3 | 4;

export interface StageInfo {
  stage: BuyerStage | null; // null for terminal/failure states
  title: string;
  pillLabel: string;
  pillTone: 'paid' | 'preparing' | 'live' | 'arriving' | 'complete' | 'cancelled' | 'disputed';
  driverVisible: boolean;
  codeVisible: boolean;
  description: string;
}

export function stageFor(status: OrderStatus): StageInfo {
  switch (status) {
    case 'PENDING_PAYMENT':
      // Edge: order placed but payment hasn't captured. Shouldn't happen in
      // our current mock-payment-success flow, but handle defensively.
      return {
        stage: 0,
        title: 'Awaiting payment',
        pillLabel: 'PAYMENT PENDING',
        pillTone: 'paid',
        driverVisible: false,
        codeVisible: false,
        description: "Your payment hasn't cleared yet. Refresh if you just placed the order.",
      };
    case 'PAID':
      return {
        stage: 0,
        title: 'Payment confirmed',
        pillLabel: 'PAID INTO ESCROW',
        pillTone: 'paid',
        driverVisible: false,
        codeVisible: false,
        description:
          "Your money is sitting safely with Vendoora. The seller doesn't see a cent until you confirm delivery.",
      };
    case 'ACCEPTED':
    case 'PREPARING':
    case 'READY_FOR_PICKUP':
      return {
        stage: 1,
        title: 'Seller is preparing your order',
        pillLabel: 'BEING PREPARED',
        pillTone: 'preparing',
        driverVisible: false,
        codeVisible: false,
        description:
          "The seller has acknowledged your order and is packing it. You'll get a notification the moment a driver picks it up.",
      };
    case 'PICKED_UP':
      return {
        stage: 2,
        title: 'Your delivery code is live',
        pillLabel: 'DRIVER EN ROUTE',
        pillTone: 'live',
        driverVisible: true,
        codeVisible: true,
        description:
          "The driver has the order. Your 6-digit code is on its way by SMS. Hand the code over only when you've inspected the order and you're satisfied.",
      };
    case 'OUT_FOR_DELIVERY':
    case 'ARRIVED':
      return {
        stage: 3,
        title: status === 'ARRIVED' ? 'Driver is at your door' : 'Out for delivery',
        pillLabel: status === 'ARRIVED' ? 'ARRIVING NOW' : 'OUT FOR DELIVERY',
        pillTone: 'arriving',
        driverVisible: true,
        codeVisible: true,
        description:
          status === 'ARRIVED'
            ? 'Inspect the order before you hand over the code. If anything looks wrong, refuse the handoff and the money stays in escrow.'
            : 'Your driver is heading to your address. Keep your phone close — the SMS code is the only way they can complete the handoff.',
      };
    case 'DELIVERED':
      return {
        stage: 4,
        title: 'Delivered. Code verified.',
        pillLabel: 'COMPLETE',
        pillTone: 'complete',
        driverVisible: true,
        codeVisible: false,
        description:
          "The driver entered your code at the door. Escrow will release to the seller automatically 24 hours from now unless you open a dispute.",
      };
    case 'COMPLETED':
      return {
        stage: 4,
        title: 'Order complete',
        pillLabel: 'COMPLETE',
        pillTone: 'complete',
        driverVisible: true,
        codeVisible: false,
        description: 'Escrow has released to the seller. Thank you for choosing Vendoora.',
      };
    case 'CANCELLED':
      return {
        stage: null,
        title: 'Order cancelled',
        pillLabel: 'CANCELLED',
        pillTone: 'cancelled',
        driverVisible: false,
        codeVisible: false,
        description: 'This order was cancelled. Your payment was refunded.',
      };
    case 'EXPIRED':
      return {
        stage: null,
        title: 'Order expired',
        pillLabel: 'EXPIRED',
        pillTone: 'cancelled',
        driverVisible: false,
        codeVisible: false,
        description:
          "The seller didn't accept this order within 24 hours, so it was auto-cancelled and your money refunded.",
      };
    case 'REFUNDED':
      return {
        stage: null,
        title: 'Order refunded',
        pillLabel: 'REFUNDED',
        pillTone: 'cancelled',
        driverVisible: false,
        codeVisible: false,
        description: 'Your payment has been returned to your original payment method.',
      };
    case 'DISPUTED':
      return {
        stage: null,
        title: 'Dispute open',
        pillLabel: 'IN REVIEW',
        pillTone: 'disputed',
        driverVisible: false,
        codeVisible: false,
        description:
          "Trust & Safety is reviewing this dispute. Money stays in escrow until it's resolved.",
      };
    default:
      // OrderStatus is a closed set — TS exhaustiveness check.
      return {
        stage: 0,
        title: 'Order',
        pillLabel: status,
        pillTone: 'paid',
        driverVisible: false,
        codeVisible: false,
        description: '',
      };
  }
}

const HAPPY_PATH: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'ARRIVED',
  'DELIVERED',
  'COMPLETED',
];

/**
 * Next status in the linear happy path. Returns null if already at the
 * end (COMPLETED) or in a terminal failure state.
 */
export function nextHappyStatus(current: OrderStatus): OrderStatus | null {
  const idx = HAPPY_PATH.indexOf(current);
  if (idx === -1) return null; // failure states aren't advanceable
  const next = HAPPY_PATH[idx + 1];
  return next ?? null;
}
