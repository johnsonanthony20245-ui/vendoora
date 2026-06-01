import { fileTypeFromBuffer } from 'file-type';

/**
 * MIME types accepted for KYC document uploads. Mirrors the `accept=` on the
 * <input type="file"> in apps/web/app/admin/kyc/[id]/page.tsx. Single source of
 * truth — the server action and the magic-byte sniff both read it from here.
 */
export const ALLOWED_KYC_UPLOAD_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export type FileMagicResult =
  | { ok: true; detectedMime: string }
  | { ok: false; reason: 'mime_mismatch' };

/**
 * Verify a file's actual content matches what the browser claimed by reading
 * its magic bytes. Rejects when:
 *   1. file-type can't identify the bytes at all (no known signature),
 *   2. the detected MIME isn't in the KYC upload allowlist, or
 *   3. the detected MIME doesn't match the claimed MIME.
 *
 * The browser-supplied File.type is set client-side and trivially forged by a
 * custom HTTP client — never trust it on its own for anything that touches
 * persistent storage. This helper is the second line of defense behind the
 * cheap allowlist check on the claimed type.
 *
 * Returns a discriminated union rather than throwing so the caller can map the
 * reject straight into a redirect query param without a try/catch that would
 * also swallow Next.js's own redirect-throws.
 */
export async function assertFileBytesMatchType(
  bytes: Buffer | Uint8Array,
  claimedMime: string,
): Promise<FileMagicResult> {
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected) {
    return { ok: false, reason: 'mime_mismatch' };
  }
  if (!ALLOWED_KYC_UPLOAD_MIME.has(detected.mime)) {
    return { ok: false, reason: 'mime_mismatch' };
  }
  if (detected.mime !== claimedMime) {
    return { ok: false, reason: 'mime_mismatch' };
  }
  return { ok: true, detectedMime: detected.mime };
}
