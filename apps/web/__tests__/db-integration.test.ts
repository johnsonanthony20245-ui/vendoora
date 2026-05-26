import { afterAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from repo root.
config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

// Import lazily after env is set up, otherwise the singleton in @vendoora/db
// would capture an unset DATABASE_URL when first evaluated.
const { prisma } = await import('@vendoora/db');

afterAll(async () => {
  await prisma.$disconnect();
});

describe('apps/web → @vendoora/db', () => {
  it('imports the prisma singleton and can count users', async () => {
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
