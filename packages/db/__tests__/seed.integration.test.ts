import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(() => {
  // Reset, apply migrations, then run seed.
  execSync('pnpm prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: process.env,
  });
  execSync('pnpm prisma db seed', { stdio: 'inherit', env: process.env });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seed: permissions + roles (Engineering_Spec §4.3)', () => {
  it('inserts exactly 40 permissions', async () => {
    const count = await prisma.permission.count();
    expect(count).toBe(40);
  });

  it('inserts exactly 12 roles', async () => {
    const count = await prisma.role.count();
    expect(count).toBe(12);
  });

  it('8 of the 12 roles are system admin roles (is_system_role=true)', async () => {
    const count = await prisma.role.count({ where: { is_system_role: true } });
    expect(count).toBe(8);
  });

  it('superadmin role has all 40 permissions', async () => {
    const role = await prisma.role.findUnique({
      where: { name: 'superadmin' },
      include: { role_permissions: true },
    });
    expect(role).not.toBeNull();
    expect(role!.role_permissions).toHaveLength(40);
  });

  it('finance_admin role has the documented finance + escrow.read + refund subset', async () => {
    const role = await prisma.role.findUnique({
      where: { name: 'finance_admin' },
      include: { role_permissions: { include: { permission: true } } },
    });
    expect(role).not.toBeNull();
    const names = role!.role_permissions.map((rp) => rp.permission.name).sort();
    expect(names).toEqual(
      [
        'escrow.read.all',
        'fx_rate.override',
        'payout.delay',
        'payout.execute',
        'reconciliation.run',
        'refund.authorize.over_500',
        'refund.authorize.under_500',
        'refund.deny',
      ].sort(),
    );
  });

  it('4 of the 12 roles are marketplace (non-system) roles', async () => {
    const marketplace = await prisma.role.findMany({
      where: { name: { in: ['buyer', 'seller', 'seller_staff', 'driver'] } },
    });
    expect(marketplace).toHaveLength(4);
    expect(marketplace.every((r) => r.is_system_role === false)).toBe(true);
  });
});
