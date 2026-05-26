import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(() => {
  // Reset and apply all migrations to a clean test DB.
  execSync('pnpm prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: process.env,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('User table', () => {
  it('creates the users table with expected columns', async () => {
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY column_name;
    `;
    const cols = result.map((r) => r.column_name);
    expect(cols).toContain('id');
    expect(cols).toContain('clerk_id');
    expect(cols).toContain('email');
    expect(cols).toContain('account_status');
    expect(cols).toContain('trust_score');
    expect(cols).toContain('created_at');
  });

  it('users.clerk_id has a unique index', async () => {
    const result = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'users' AND indexdef LIKE '%clerk_id%' AND indexdef LIKE '%UNIQUE%';
    `;
    expect(result.length).toBeGreaterThan(0);
  });

  it('UserAccountStatus enum exists with the documented values', async () => {
    const result = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'UserAccountStatus'
      ORDER BY enumlabel;
    `;
    const values = result.map((r) => r.enumlabel).sort();
    expect(values).toEqual(['ACTIVE', 'CLOSED', 'PENDING_VERIFICATION', 'SUSPENDED']);
  });
});

describe('RBAC tables', () => {
  it('creates the permissions table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'permissions';
    `;
    expect(result).toHaveLength(1);
  });

  it('creates the roles table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'roles';
    `;
    expect(result).toHaveLength(1);
  });

  it('creates the role_permissions join table with composite PK', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'role_permissions';
    `;
    expect(result).toHaveLength(1);

    const pk = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'role_permissions'::regclass AND i.indisprimary
      ORDER BY column_name;
    `;
    expect(pk.map((r) => r.column_name).sort()).toEqual(['permission_id', 'role_id']);
  });

  it('creates the user_roles join table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user_roles';
    `;
    expect(result).toHaveLength(1);
  });
});

describe('Operations tables', () => {
  it('creates the audit_log table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_log';
    `;
    expect(result).toHaveLength(1);
  });

  it('creates the feature_flags table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'feature_flags';
    `;
    expect(result).toHaveLength(1);
  });

  it('creates the fx_rates table with the composite unique constraint', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'fx_rates';
    `;
    expect(result).toHaveLength(1);

    // Composite unique on (from_currency, to_currency, effective_date)
    const uniques = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'fx_rates' AND indexdef LIKE '%UNIQUE%';
    `;
    expect(uniques.some((u) => u.indexdef.includes('from_currency') && u.indexdef.includes('to_currency') && u.indexdef.includes('effective_date'))).toBe(true);
  });
});
