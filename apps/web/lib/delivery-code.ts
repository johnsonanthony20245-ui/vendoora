import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 10;

/**
 * Generate a 6-digit delivery code (Build_Prompt §10.7).
 *
 * Cryptographically uniform across 100000-999999 (inclusive).
 * Returns the plaintext for one-time delivery to the buyer (SMS in prod;
 * shown on the confirmation page in dev) and the bcrypt hash for storage.
 *
 * The plaintext MUST NOT be persisted. The hash is what lives on the Order.
 */
export async function generateDeliveryCode(): Promise<{ plaintext: string; hash: string }> {
  // randomInt is exclusive on the upper bound — 1_000_000 gives us 100000-999999.
  const num = randomInt(100000, 1_000_000);
  const plaintext = String(num);
  const hash = await bcrypt.hash(plaintext, BCRYPT_COST);
  return { plaintext, hash };
}

/**
 * Compare a candidate code against a stored hash. Used at the door by the
 * driver app (P3). Constant-time via bcrypt.compare.
 */
export async function verifyDeliveryCode(plaintext: string, hash: string): Promise<boolean> {
  if (!/^\d{6}$/.test(plaintext)) return false;
  return bcrypt.compare(plaintext, hash);
}
