import type { Prisma } from '@vendoora/db';

type OrderStatus = Prisma.OrderGetPayload<{ select: { status: true } }>['status'];

/**
 * Disputable order states: anything PAID through COMPLETED, excluding
 * already-DISPUTED and the terminal failure states.
 */
const DISPUTABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'ARRIVED',
  'DELIVERED',
  'COMPLETED',
]);

export function isOrderDisputable(status: OrderStatus): boolean {
  return DISPUTABLE.has(status);
}

/**
 * Hours remaining until `date`, rounded down (so 47.9h shows as "47h").
 * Returns 0 if the date is in the past — SLA breached, render accordingly.
 */
export function hoursUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.floor(ms / (60 * 60 * 1000));
}

export const DISPUTE_CATEGORIES = [
  { value: 'NOT_RECEIVED', label: "I didn't receive my order" },
  { value: 'DAMAGED', label: 'Order arrived damaged' },
  { value: 'WRONG_ITEM', label: 'Wrong item delivered' },
  { value: 'COUNTERFEIT', label: 'I think this is counterfeit' },
  { value: 'QUALITY_ISSUE', label: 'Quality not as described' },
  { value: 'IN_TRANSIT_DAMAGE', label: 'Damaged during delivery' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export type DisputeCategoryValue = (typeof DISPUTE_CATEGORIES)[number]['value'];
