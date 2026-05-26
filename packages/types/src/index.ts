/**
 * Vendoora — shared types package.
 *
 * Walking-skeleton scope: one runtime value + one type to prove the
 * cross-package import loop works end-to-end. Real domain types land
 * in later focused plans.
 */
export const BRAND_NAME = 'Vendoora' as const;

/** ISO 4217 currency codes Vendoora supports. */
export type Currency = 'USD' | 'LRD';
