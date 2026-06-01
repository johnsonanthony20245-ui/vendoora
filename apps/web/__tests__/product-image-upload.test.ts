import { describe, it, expect } from 'vitest';
import {
  validateProductImageFile,
  ALLOWED_PRODUCT_IMAGE_MIME,
  MAX_PRODUCT_IMAGE_BYTES,
} from '../lib/product-image-upload';

describe('validateProductImageFile', () => {
  it('accepts jpeg/png/webp under the size limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateProductImageFile({ type, size: 1024 })).toEqual({ ok: true });
    }
  });

  it('accepts a file at exactly the size limit', () => {
    expect(
      validateProductImageFile({ type: 'image/png', size: MAX_PRODUCT_IMAGE_BYTES }),
    ).toEqual({ ok: true });
  });

  it('rejects an empty file', () => {
    expect(validateProductImageFile({ type: 'image/png', size: 0 })).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('rejects a disallowed mime type', () => {
    for (const type of ['image/gif', 'application/pdf', 'image/svg+xml']) {
      expect(validateProductImageFile({ type, size: 2048 })).toEqual({
        ok: false,
        reason: 'bad_mime',
      });
    }
  });

  it('rejects a file over the size limit', () => {
    expect(
      validateProductImageFile({ type: 'image/jpeg', size: MAX_PRODUCT_IMAGE_BYTES + 1 }),
    ).toEqual({ ok: false, reason: 'too_large' });
  });

  it('exposes the shared limit and allowed mime set', () => {
    expect(MAX_PRODUCT_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect([...ALLOWED_PRODUCT_IMAGE_MIME].sort()).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });
});
