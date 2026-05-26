import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from repo root (two levels up from packages/db/).
config({ path: resolve(__dirname, '../../../.env') });

if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    'DATABASE_URL_TEST is not set. Copy .env.example to .env at repo root.',
  );
}

// Point Prisma at the test database for the whole test run.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

// Prisma 6's safety gate for AI-driven runs of `migrate reset`.
// The integration test suite resets the LOCAL TEST DATABASE between runs
// (vendoora_test in the Docker Compose Postgres). Consent recorded on
// 2026-05-26 for this local-test-database-only purpose.
process.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION =
  'yes, run prisma migrate reset against the local test database';
