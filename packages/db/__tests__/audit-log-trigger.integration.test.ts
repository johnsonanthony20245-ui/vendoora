import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(() => {
  execSync('pnpm prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: process.env,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('audit_log immutability (Build_Prompt §10.4)', () => {
  beforeEach(async () => {
    // Clean slate. TRUNCATE bypasses row-level triggers — admin-only operation
    // by design (the trigger guards individual UPDATE/DELETE statements).
    await prisma.$executeRawUnsafe('TRUNCATE TABLE audit_log');
  });

  it('allows INSERT', async () => {
    const before = await prisma.auditLog.count();
    expect(before).toBe(0);

    await prisma.auditLog.create({
      data: {
        action: 'TEST_ACTION',
        actor_system: true,
        metadata: { test: 'insert' },
      },
    });

    const after = await prisma.auditLog.count();
    expect(after).toBe(1);
  });

  it('rejects UPDATE with an "immutable" error', async () => {
    const row = await prisma.auditLog.create({
      data: { action: 'TEST_FOR_UPDATE', actor_system: true },
    });

    await expect(
      prisma.auditLog.update({
        where: { id: row.id },
        data: { action: 'CHANGED' },
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it('rejects DELETE with an "immutable" error', async () => {
    const row = await prisma.auditLog.create({
      data: { action: 'TEST_FOR_DELETE', actor_system: true },
    });

    await expect(
      prisma.auditLog.delete({ where: { id: row.id } }),
    ).rejects.toThrow(/immutable/i);
  });
});
