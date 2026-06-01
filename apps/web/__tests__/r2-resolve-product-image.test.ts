/**
 * Unit tests for resolveProductImageUrl — the bridge between historical
 * https:// seed URLs in `ProductImage.url` and the R2 object keys that
 * `createProduct` (PR #25, seller console) writes there for new uploads.
 *
 * No DB, no network. The R2 path uses a presigner that signs locally from
 * env credentials; we set the R2_* env so the resolver picks the key path
 * and we assert the returned URL contains the key and points at our test
 * endpoint host. No HTTP is performed against the test endpoint.
 *
 * Why this can't pass against a stub: tests below feed BOTH https inputs
 * (must pass through unchanged) AND bare keys (must be presigned with the
 * key embedded in the URL). A stub that returns input unchanged fails the
 * key→presigned test; a stub that always signs fails the https-passthrough
 * test; a stub that returns null fails both.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  // Configure R2 so IS_R2_ENABLED flips true and the SDK can sign locally.
  // None of these need to be live — the presigner builds a URL purely from
  // these creds + the requested key.
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.R2_ENDPOINT = 'https://test-r2.example.com';
  process.env.R2_BUCKET = 'vendoora-test';
});

afterAll(() => {
  // Restore the original env so other suites in the same vitest process
  // don't accidentally pick up the test R2 credentials.
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('resolveProductImageUrl', () => {
  it('returns an https URL unchanged (historical seed data)', async () => {
    const { resolveProductImageUrl } = await import('../lib/r2');
    const input = 'https://images.example.com/seed/wax-print-01.jpg';
    const out = await resolveProductImageUrl(input);
    expect(out).toBe(input);
  });

  it('returns an http URL unchanged', async () => {
    const { resolveProductImageUrl } = await import('../lib/r2');
    const input = 'http://images.example.com/seed/insecure.jpg';
    const out = await resolveProductImageUrl(input);
    expect(out).toBe(input);
  });

  it('mints a presigned https URL for an R2 object key (new seller uploads)', async () => {
    const { resolveProductImageUrl } = await import('../lib/r2');
    const key = 'products/seller-abc/uploads/2026/05/widget-front.jpg';
    const out = await resolveProductImageUrl(key);
    expect(out).not.toBeNull();
    if (out === null) return; // narrow for TS; assertion above already failed
    expect(out.startsWith('https://')).toBe(true);
    // The bucket appears in the path because S3-style endpoints embed it.
    expect(out).toContain('vendoora-test');
    // The object key path components show up in the URL (URL-encoded).
    expect(out).toContain('products');
    expect(out).toContain('widget-front.jpg');
    // Presigning attaches an AWS signature query param.
    expect(out).toMatch(/X-Amz-Signature=/);
  });

  it('omits Content-Disposition (product images render inline)', async () => {
    const { resolveProductImageUrl } = await import('../lib/r2');
    const key = 'products/seller-abc/uploads/2026/05/widget-front.jpg';
    const out = await resolveProductImageUrl(key);
    if (out === null) throw new Error('R2 should be configured in this test');
    // KYC's getDownloadUrl forces attachment; the product resolver must NOT —
    // inline rendering in <img>/CSS depends on no explicit disposition.
    expect(out).not.toContain('attachment');
    expect(out.toLowerCase()).not.toContain('response-content-disposition');
  });

  it('uses the requested expiresIn TTL (passed through to the presigner)', async () => {
    const { resolveProductImageUrl } = await import('../lib/r2');
    const key = 'products/seller-abc/uploads/x.jpg';
    const out = await resolveProductImageUrl(key, { expiresInSeconds: 7200 });
    expect(out).toContain('X-Amz-Expires=7200');
  });
});
