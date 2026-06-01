/**
 * Shared validation rules for seller PRODUCT image uploads (create + edit).
 *
 * DOM-free and next/*-free on purpose: the client dropzone
 * (components/ImageUpload.tsx) imports validateProductImageFile for instant
 * feedback, the server action (app/actions/seller-products.ts) imports the same
 * constants for authoritative enforcement, and this file is unit-tested under the
 * node-env Vitest with no browser harness. Mirrors the KYC single-source-of-truth
 * pattern in lib/file-magic.ts.
 */

export const ALLOWED_PRODUCT_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ProductImageRejectReason = 'empty' | 'bad_mime' | 'too_large';

/**
 * Validate the primitives a browser File exposes (type + size). Pure and DOM-free
 * so it runs identically in the client component and in tests. Check order:
 * empty -> bad_mime -> too_large.
 */
export function validateProductImageFile(
  file: { type: string; size: number },
): { ok: true } | { ok: false; reason: ProductImageRejectReason } {
  if (file.size === 0) return { ok: false, reason: 'empty' };
  if (!ALLOWED_PRODUCT_IMAGE_MIME.has(file.type)) return { ok: false, reason: 'bad_mime' };
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true };
}
