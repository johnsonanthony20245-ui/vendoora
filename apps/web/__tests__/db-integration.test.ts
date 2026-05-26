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

  it('reads the seeded category catalog (>= 12 after seed)', async () => {
    const count = await prisma.category.count();
    expect(count).toBeGreaterThanOrEqual(12);
  });

  it('Order model is generated and queryable', async () => {
    const count = await prisma.order.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('EscrowHold model is generated and queryable', async () => {
    const count = await prisma.escrowHold.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('Dispute model is generated and queryable', async () => {
    const count = await prisma.dispute.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('Driver model is generated and queryable', async () => {
    const count = await prisma.driver.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('DeliveryZone seed has at least 8 zones', async () => {
    const count = await prisma.deliveryZone.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });
});
