import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cloudflare R2 adapter (S3-compatible). Reads R2_* env vars; degrades
 * gracefully when unconfigured (callers check IS_R2_ENABLED so the build
 * doesn't crash in environments where uploads aren't wired). Same fallback
 * shape as the Clerk / Stripe gates.
 */

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint = process.env.R2_ENDPOINT;
const bucket = process.env.R2_BUCKET;

export const IS_R2_ENABLED = Boolean(
  accountId && accessKeyId && secretAccessKey && endpoint && bucket,
);

let client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!IS_R2_ENABLED || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 is not configured');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export function getR2Bucket(): string {
  if (!bucket) throw new Error('R2_BUCKET is not configured');
  return bucket;
}

/** Upload bytes to R2 at the given object key. */
export async function uploadObject(opts: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  contentLength?: number;
}): Promise<{ key: string }> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    }),
  );
  return { key: opts.key };
}

/** Best-effort delete; throws on failure so callers can decide whether to swallow. */
export async function deleteObject(key: string): Promise<void> {
  await getR2Client().send(
    new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }),
  );
}

/**
 * Sanitize a file name to a header-safe token (RFC 6266) used in
 * Content-Disposition. Strips anything outside [a-zA-Z0-9._-] so a name like
 * `"; rm -rf` can't break out of the quoted header value.
 */
function sanitizeForContentDisposition(name: string): string {
  const stripped = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return stripped.length > 0 ? stripped : 'download';
}

/**
 * Presigned GET URL for browser-side download.
 *
 * - Default TTL is **120 seconds** because KYC docs are PII — a URL that leaks
 *   via referer / screen-share / history shouldn't grant hours of access.
 * - Forces **Content-Disposition: attachment** so the browser always downloads
 *   the file rather than rendering it inline (defense against polyglot files
 *   or a future SVG/HTML mis-typing). The sanitized file name is suggested.
 */
export async function getDownloadUrl(
  key: string,
  opts: { expiresInSeconds?: number; fileName?: string } = {},
): Promise<string> {
  const suggestedName = opts.fileName
    ? sanitizeForContentDisposition(opts.fileName)
    : 'download';
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${suggestedName}"`,
    }),
    { expiresIn: opts.expiresInSeconds ?? 120 },
  );
}
