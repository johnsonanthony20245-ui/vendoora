import { describe, expect, it } from 'vitest';
import { BRAND_NAME, type Currency } from '@vendoora/types';

describe('cross-package wiring: @vendoora/types', () => {
  it('resolves the runtime value from @vendoora/types', () => {
    expect(BRAND_NAME).toBe('Vendoora');
  });

  it('resolves the type from @vendoora/types', () => {
    const supported = ['USD', 'LRD'] as const satisfies readonly Currency[];
    expect(supported).toHaveLength(2);
  });
});
