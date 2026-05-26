import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(() => {
  execSync('pnpm prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: process.env,
  });
  execSync('pnpm prisma db seed', { stdio: 'inherit', env: process.env });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('DeliveryZone seed (Monrovia + outer cities)', () => {
  it('seeds at least 8 delivery zones', async () => {
    const count = await prisma.deliveryZone.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it('all expected zone names are present', async () => {
    const zones = await prisma.deliveryZone.findMany({ select: { name: true } });
    const names = zones.map((z) => z.name).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        'sinkor', 'paynesville', 'bushrod-island', 'old-road', 'congo-town',
        'caldwell', 'gbarnga', 'buchanan',
      ]),
    );
  });
});
