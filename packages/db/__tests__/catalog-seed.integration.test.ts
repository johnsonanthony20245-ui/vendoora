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

describe('Category seed (Liberian-marketplace top-levels)', () => {
  it('seeds exactly 12 categories', async () => {
    const count = await prisma.category.count();
    expect(count).toBe(12);
  });

  it('all expected category slugs are present', async () => {
    const cats = await prisma.category.findMany({ select: { slug: true } });
    const slugs = cats.map((c) => c.slug).sort();
    expect(slugs).toEqual([
      'arts-crafts',
      'beauty',
      'books',
      'children',
      'electronics',
      'fashion',
      'food-drink',
      'home-garden',
      'mobile-tech',
      'other',
      'pharmacy',
      'tools-hardware',
    ]);
  });
});
