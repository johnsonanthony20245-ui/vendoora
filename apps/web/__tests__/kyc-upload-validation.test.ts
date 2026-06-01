/**
 * Tests for the magic-byte file-content sniff used by the KYC upload server
 * action (apps/web/app/actions/admin-kyc.ts → uploadKycDocument).
 *
 * Today the action trusts the buyer-supplied File.type. That header is set by
 * the browser and is easily forged by a custom client — an attacker can claim
 * `image/png` while POSTing arbitrary bytes (e.g. an executable, a Java applet
 * cross-format, an SVG payload) into our private R2 bucket. The Content-Disposition:
 * attachment header on the presigned GET in lib/r2.ts mitigates inline rendering,
 * but the bytes still land in the bucket misclassified — bad for forensic review,
 * antivirus pipelines, and downstream consumers that trust mime_type.
 *
 * assertFileBytesMatchType() closes the gap by reading the file's actual magic
 * number and rejecting whenever:
 *   (a) the detected MIME isn't in the KYC upload allowlist, or
 *   (b) the detected MIME doesn't match what the browser claimed.
 *
 * Why this test cannot pass against a stub: it doesn't just verify the
 * PNG/PDF-mismatch contract from the spec — it ALSO feeds PDF bytes claiming
 * to be PNG (opposite direction), real PDF claiming PDF (positive control on
 * the PDF path), and unrecognized bytes. A stub that returns ok-for-png and
 * reject-otherwise would fail the PDF-claims-PDF case; a stub that always
 * returns ok would fail every reject case. Only a real magic-byte sniff
 * satisfies all five.
 */
import { describe, expect, it } from 'vitest';

const { assertFileBytesMatchType } = await import('../lib/file-magic');

// Minimal PNG: 8-byte signature + IHDR chunk header. file-type only needs the
// signature for PNG detection but we include IHDR so the buffer is recognisable
// as a real PNG and not just a magic-number prefix.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR length=13 + "IHDR"
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
  0x08, 0x06, 0x00, 0x00, 0x00,                   // bit-depth, RGBA, deflate, none, no-interlace
]);

// Minimal PDF: "%PDF-1.4\n" — enough magic for file-type to detect.
const PDF_BYTES = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary');

describe('assertFileBytesMatchType', () => {
  it('accepts a real PNG buffer when the browser claimed image/png', async () => {
    const result = await assertFileBytesMatchType(PNG_BYTES, 'image/png');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.detectedMime).toBe('image/png');
  });

  it('rejects a real PNG buffer when the browser lied and claimed application/pdf', async () => {
    const result = await assertFileBytesMatchType(PNG_BYTES, 'application/pdf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mime_mismatch');
  });

  it('accepts a real PDF buffer when the browser claimed application/pdf', async () => {
    const result = await assertFileBytesMatchType(PDF_BYTES, 'application/pdf');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.detectedMime).toBe('application/pdf');
  });

  it('rejects a real PDF buffer when the browser lied and claimed image/png', async () => {
    const result = await assertFileBytesMatchType(PDF_BYTES, 'image/png');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mime_mismatch');
  });

  it('rejects bytes whose magic number is unrecognisable', async () => {
    const junk = Buffer.from('not a real file, just plain ascii text padding bytes', 'utf8');
    const result = await assertFileBytesMatchType(junk, 'image/png');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mime_mismatch');
  });
});
