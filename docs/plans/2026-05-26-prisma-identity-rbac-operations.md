# Vendoora — packages/db Scaffold + Identity / RBAC / Operations Schema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `packages/db` with a working Prisma + Postgres pipeline (Docker for dev), plus the first 8 tables — `User` (mirroring Clerk identity, since Clerk owns sessions and OAuth per Engineering_Spec §3.1 and Build_Prompt §10.2), RBAC (4 tables), and cross-cutting Operations (audit log with INSERT-only trigger, feature flags, FX rates). Seed the ~40 permissions enumerated in Engineering_Spec §4.3 + all 12 system roles. Prove the loop with integration tests that boot a real Postgres, apply migrations, run seeds, and assert structural correctness.

**Architecture:** Single Prisma schema under `packages/db/prisma/schema.prisma` per Engineering_Spec §2.1, datasource pointing at `$env('DATABASE_URL')`. Dev Postgres via `docker compose` at `infra/docker/`. Migrations live in `packages/db/prisma/migrations/`. Audit-log immutability enforced by a raw-SQL Postgres trigger (Build_Prompt §10.4). Seeds in `packages/db/prisma/seed.ts` invoked via `prisma db seed`. Integration tests use a separate `vendoora_test` database created at Docker init time.

**Tech Stack:** Prisma 6.x + `@prisma/client`, Postgres 16, Docker Compose v2, Vitest 2 + `@vitest/coverage-v8`, Node 22.12 + pnpm 9.15 already pinned via Volta.

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P1 Foundation (Playbook §3.1.3, slice 1 of ~6)
**Estimated session time:** 4-6 hours

## Problem

The walking skeleton has nothing to persist. Engineering_Spec §4 defines a ~60-table schema across 10 domains plus 6 May-2026 additions. Doing all of it in one plan exceeds Build_Prompt §3.3's complexity budget by 3x. This plan delivers the slice every other domain depends on: User, Permission, Role (the auth/RBAC foundation) + the cross-cutting infrastructure tables (AuditLog, FeatureFlag, FxRate) that every later domain will write into.

**Note on session storage:** Engineering_Spec §4.1 lists "users, sessions, OAuth links" under the Identity & Auth domain but §4.2 only details the User model. Build_Prompt §10.2 says "No bypassing Clerk — Clerk is the only source of authentication truth," and Engineering_Spec §3.1 picks Clerk for the Auth layer. We therefore do NOT mirror Clerk's session or OAuth-link state into our DB. The User model already carries `last_login_at` + `last_login_ip` for audit purposes (§4.2). If app-side session tracking or per-provider OAuth metadata becomes needed later, it can be added in a focused follow-up.

## Approach

`packages/db` is the canonical schema location per Engineering_Spec §2.1 — single Prisma schema, one Prisma client per workspace, generated to `./node_modules/.prisma/client` (default). Dev Postgres via Docker Compose so every developer has the same `postgres:16` image without depending on a remote service. Tests connect to a separate `vendoora_test` database (created in the Docker init script) and reset between runs via `prisma migrate reset --force --skip-seed`.

The audit log is special: per Build_Prompt §10.4 it must reject UPDATE and DELETE at the database level, not just in application code. Prisma migrations don't natively express triggers, so the trigger lives in a custom-named SQL migration file (`prisma migrate dev --create-only` then hand-edit).

Seeds load ~40 permissions (every permission explicitly enumerated in Engineering_Spec §4.3) plus all 12 system roles (8 admin + 4 marketplace) with their permission bundles. The remaining ~80 permissions implied by "~120 permissions" in Engineering_Spec §4.3 are deferred to follow-up domain plans — when each admin surface is built, the permissions it requires are seeded with it.

## Scope (what this DOES)

- [ ] `packages/db/` scaffold: `package.json`, `tsconfig.json`, `prisma/schema.prisma` (datasource + generator + 13 models), `prisma/seed.ts`, `src/index.ts` (client re-export), `README.md`
- [ ] Docker Compose Postgres 16 at `infra/docker/docker-compose.yml` + init SQL that creates `vendoora_dev` and `vendoora_test` databases
- [ ] `.env.example` at repo root with `DATABASE_URL` placeholder
- [ ] Root `package.json` scripts: `db:up`, `db:down`, `db:logs`, `db:reset`, `db:seed`
- [ ] 8 Prisma models + 1 enum: `User` (+ `UserAccountStatus` enum), `Permission`, `Role`, `RolePermission`, `UserRole`, `AuditLog`, `FeatureFlag`, `FxRate`
- [ ] Three migrations: `add_identity_tables`, `add_rbac_tables`, `add_operations_tables`
- [ ] Custom SQL migration `add_audit_log_immutability_trigger` with `BEFORE UPDATE OR DELETE` trigger
- [ ] `prisma/seed.ts` that inserts 40 permissions + 12 roles + role-permission mappings
- [ ] Integration tests in `packages/db/__tests__/`: migration applies cleanly, seed inserts correct counts, audit-log trigger rejects UPDATE+DELETE, role-permission bundles match expected
- [ ] `apps/web` smoke test importing `@vendoora/db` and running `prisma.user.count()` against the test DB
- [ ] `packages/db/README.md` with the dev workflow

## Out of scope (what this does NOT do)

- Remaining 8 domains (Sellers, Catalog, Orders & Cart, Escrow & Payments, Disputes, Drivers, Diaspora, the rest of Operations) — each its own follow-up plan
- 6 May-2026 additions (Reviews, Trust Cases, Profile Change Requests, Webhook/Outbox, Product extensions, KYC Application) — own plan
- Row-Level Security (RLS) policies — per-domain when each domain lands
- The remaining ~80 permissions implied by "~120 permissions" in Engineering_Spec §4.3 — seeded with the admin surfaces that consume them, in P6
- Neon project creation, Doppler secret wiring — P1.3.2 plan that also wires GitHub Actions
- Prisma Accelerate / connection pooling — production wiring concern, not foundational
- Backup/restore runbooks — P1.3.7 / runbooks
- Reconciliation jobs, materialized views — later

## Files to be created

**`infra/docker/`**:
- `docker-compose.yml` — Postgres 16 service + healthcheck + named volume
- `init/01-create-databases.sql` — creates `vendoora_dev` + `vendoora_test`

**Root**:
- `.env.example` — `DATABASE_URL` placeholder + `DATABASE_URL_TEST` for integration tests

**`packages/db/`**:
- `package.json`
- `tsconfig.json`
- `README.md`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migrations/` (3 auto-generated + 1 hand-written: `<timestamp>_add_audit_log_immutability_trigger/migration.sql`)
- `src/index.ts` — re-exports `PrismaClient` + a singleton instance helper
- `__tests__/migration.integration.test.ts`
- `__tests__/seed.integration.test.ts`
- `__tests__/audit-log-trigger.integration.test.ts`
- `vitest.config.mts`

**`apps/web/__tests__/`**:
- `db-integration.test.ts` — proves `apps/web` can `import { prisma } from '@vendoora/db'` and reach the DB

## Files to be modified

- Root `package.json`: add `db:up`, `db:down`, `db:logs`, `db:reset`, `db:seed` scripts; add `@types/node` if not in root devDeps
- Root `.gitignore`: add `.env`, `.env.local`, `pnpm-lock.yaml.bak`, `**/prisma/migrations.dev.lock`
- `apps/web/package.json`: add `@vendoora/db: workspace:*` to dependencies; add `dotenv-cli` devDep for test env loading

## Database changes

Three Prisma-generated migrations + one hand-written:
1. `<ts>_add_users_table` — `users` (+ `UserAccountStatus` enum)
2. `<ts>_add_rbac_tables` — `permissions`, `roles`, `role_permissions`, `user_roles`
3. `<ts>_add_operations_tables` — `audit_log`, `feature_flags`, `fx_rates`
4. `<ts>_add_audit_log_immutability_trigger` — hand-written SQL

All migrations forward-compatible (no expand-contract needed — greenfield).

## Test cases

Integration (Vitest, in `packages/db/__tests__/`):
- [ ] `migration.integration.test.ts`: after `prisma migrate deploy`, all 8 expected tables exist (8 = 1+4+3 from the three table-creating migrations; the trigger migration adds no tables)
- [ ] `migration.integration.test.ts`: foreign keys are in place (`role_permissions.role_id` → `roles.id`, `user_roles.user_id` → `users.id`, etc.)
- [ ] `seed.integration.test.ts`: `permissions` table has exactly 40 rows after seed
- [ ] `seed.integration.test.ts`: `roles` table has exactly 12 rows after seed (8 system admin + 4 marketplace)
- [ ] `seed.integration.test.ts`: `superadmin` role has all 40 permissions in `role_permissions`
- [ ] `seed.integration.test.ts`: `finance_admin` role's permissions are exactly the finance + escrow.read + refund + reconciliation subset
- [ ] `audit-log-trigger.integration.test.ts`: INSERT into `audit_log` succeeds
- [ ] `audit-log-trigger.integration.test.ts`: UPDATE on `audit_log` raises Postgres error mentioning "immutable"
- [ ] `audit-log-trigger.integration.test.ts`: DELETE on `audit_log` raises Postgres error mentioning "immutable"

Cross-package (Vitest, in `apps/web/__tests__/`):
- [ ] `db-integration.test.ts`: importing `prisma` from `@vendoora/db` and calling `prisma.user.count()` returns 0 (proves the workspace symlink + Prisma client generation works for downstream consumers)

## Permission/security implications

- Audit log immutability is enforced at the DB layer (Build_Prompt §10.4 non-negotiable). The trigger uses `RAISE EXCEPTION` rather than `RETURN NULL` so misuse fails loudly.
- `.env` is added to `.gitignore` (the walking-skeleton commit already gitignored `.env*`). `.env.example` is the only file with `DATABASE_URL` text, and it has a placeholder value.
- No secrets created. No external service touched.
- Seed data is non-sensitive (permission names + role names).

## Risks

1. **Docker Desktop may not be installed/running on the host.** Task 2 first step verifies `docker compose version`. If absent, the plan halts with an installation message.
2. **First `prisma migrate dev` may prompt for migration name interactively.** Use the `--name <name>` flag to suppress.
3. **Prisma 6's behavior change: `prisma db seed` requires `package.json` `prisma.seed` script.** Plan accounts for this — see Task 7 Step 2.
4. **Volta PATH propagation:** same issue as the walking skeleton. Subagents prepend Volta paths if needed.
5. **`pnpm` recursive script invocation order:** if a subagent runs `pnpm install` from a subdir, it may not refresh the root lockfile correctly. Always run install from the repo root.
6. **Audit log trigger creation is order-sensitive.** Must run AFTER the table-creation migration. The hand-written migration's timestamp must sort after `add_operations_tables`.

## Dependencies

- Docker Desktop installed and running (verify in Task 2 Step 1).
- `apps/web` already has `vite-tsconfig-paths` + Vitest setup — `packages/db` will mirror this pattern.
- The walking skeleton's `tsconfig.base.json` `paths` mapping already covers `@vendoora/*` → `./packages/*/src`. `packages/db` exposes its public surface via `packages/db/src/index.ts`.

---

## Tasks

### Task 1: packages/db scaffold + Prisma init

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/README.md`
- Create: `packages/db/prisma/schema.prisma` (datasource + generator only at this stage; models in later tasks)
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Create directory structure**

```bash
cd /c/Users/Anthony/Documents/vendoora
mkdir -p packages/db/prisma packages/db/src packages/db/__tests__
```

- [ ] **Step 2: Write `packages/db/package.json`**

```json
{
  "name": "@vendoora/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "prisma": "prisma",
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "migrate:reset": "prisma migrate reset --force --skip-seed",
    "generate": "prisma generate",
    "seed": "prisma db seed",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit",
    "lint": "echo \"no lint yet\" && exit 0",
    "build": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^6.1.0"
  },
  "devDependencies": {
    "@vendoora/config": "workspace:*",
    "@types/node": "^22.9.0",
    "dotenv": "^16.4.5",
    "prisma": "^6.1.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 3: Write `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "prisma/**/*.ts", "__tests__/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `packages/db/prisma/schema.prisma`** (datasource + generator only)

```prisma
// Vendoora — database schema.
// Source of truth: this file. Engineering_Spec §4 documents the design;
// this file is the implementation. Discrepancies are bugs (Build_Prompt §12.1).

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Models added in subsequent tasks.
```

- [ ] **Step 5: Write `packages/db/src/index.ts`**

```ts
/**
 * @vendoora/db — Prisma client + schema.
 *
 * Re-exports the generated Prisma client as a singleton. Consumers
 * import { prisma } from '@vendoora/db' rather than instantiating
 * their own PrismaClient (avoids connection-pool exhaustion).
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient } from '@prisma/client';
export type { Prisma } from '@prisma/client';
```

- [ ] **Step 6: Write `packages/db/README.md`**

```markdown
# @vendoora/db

Prisma schema + client for Vendoora. Single source of truth for database structure.

## Dev workflow

\`\`\`bash
# From repo root
pnpm db:up           # start Postgres via Docker Compose
pnpm -F @vendoora/db migrate:dev    # apply migrations to vendoora_dev
pnpm -F @vendoora/db seed           # seed permissions + roles
pnpm db:down         # stop Postgres
\`\`\`

## Tests

\`\`\`bash
pnpm -F @vendoora/db test
\`\`\`

Tests connect to \`vendoora_test\` (a separate database created at Docker init time) and reset between runs.

## Schema authoring

See `prisma/schema.prisma`. Models map to Engineering_Spec §4. The audit log's INSERT-only enforcement lives in `prisma/migrations/<ts>_add_audit_log_immutability_trigger/migration.sql` and is a hand-authored SQL migration (Prisma migrate doesn't express triggers natively).
```

(Replace `\`\`\`` with three literal backticks when writing.)

- [ ] **Step 7: Install deps from repo root**

```bash
cd /c/Users/Anthony/Documents/vendoora
pnpm install
```
Expected: pnpm installs `@prisma/client`, `prisma`, `dotenv`, `tsx`, `vitest` for the new workspace. No errors.

- [ ] **Step 8: Verify Prisma CLI works**

```bash
pnpm -F @vendoora/db prisma --version
```
Expected: prints Prisma 6.x version info.

---

### Task 2: Docker Compose Postgres for dev + test

**Files:**
- Create: `infra/docker/docker-compose.yml`
- Create: `infra/docker/init/01-create-databases.sql`
- Create: `.env.example`
- Modify: root `package.json` (add db:* scripts)

- [ ] **Step 1: Verify Docker is installed and running**

```bash
docker compose version
```
Expected: prints `Docker Compose version v2.x.x`. If absent, halt and report — Docker Desktop install requires user action outside this session.

- [ ] **Step 2: Create directories**

```bash
mkdir -p infra/docker/init
```

- [ ] **Step 3: Write `infra/docker/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: vendoora-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: vendoora
      POSTGRES_PASSWORD: vendoora_dev_password
      POSTGRES_DB: vendoora_dev
    ports:
      - "5432:5432"
    volumes:
      - vendoora-postgres-data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vendoora -d vendoora_dev"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  vendoora-postgres-data:
    name: vendoora-postgres-data
```

- [ ] **Step 4: Write `infra/docker/init/01-create-databases.sql`**

```sql
-- Vendoora — Postgres init script.
-- Runs once on first container start (or after volume deletion).
-- Creates the test database alongside the default vendoora_dev.
CREATE DATABASE vendoora_test;
GRANT ALL PRIVILEGES ON DATABASE vendoora_test TO vendoora;
```

- [ ] **Step 5: Write `.env.example` at repo root**

```bash
# Local Postgres via Docker Compose (infra/docker/docker-compose.yml).
# Copy this file to .env and adjust as needed. .env is gitignored.
DATABASE_URL="postgresql://vendoora:vendoora_dev_password@localhost:5432/vendoora_dev?schema=public"

# Test database — same host, different database name. Used by `pnpm -F @vendoora/db test`.
DATABASE_URL_TEST="postgresql://vendoora:vendoora_dev_password@localhost:5432/vendoora_test?schema=public"
```

- [ ] **Step 6: Modify root `package.json` — add db scripts**

Using Edit:
- old_string:
```
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "dev": "turbo run dev --parallel"
  },
```
- new_string:
```
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "dev": "turbo run dev --parallel",
    "db:up": "docker compose -f infra/docker/docker-compose.yml up -d",
    "db:down": "docker compose -f infra/docker/docker-compose.yml down",
    "db:logs": "docker compose -f infra/docker/docker-compose.yml logs -f postgres",
    "db:reset": "docker compose -f infra/docker/docker-compose.yml down -v && pnpm db:up",
    "db:seed": "pnpm -F @vendoora/db seed"
  },
```

- [ ] **Step 7: Start Postgres**

```bash
cp .env.example .env
pnpm db:up
```
Wait ~10 seconds for the container to become healthy.

- [ ] **Step 8: Verify Postgres is up and both databases exist**

```bash
docker exec vendoora-postgres psql -U vendoora -d vendoora_dev -c "\l" | head -20
```
Expected: output lists both `vendoora_dev` and `vendoora_test` in the database list.

---

### Task 3: User model (RED phase first)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add User model + UserAccountStatus enum)
- Create: `packages/db/vitest.config.mts`
- Create: `packages/db/__tests__/setup.ts` (loads .env, prepares test DB)
- Create: `packages/db/__tests__/migration.integration.test.ts`

- [ ] **Step 1: Write `packages/db/vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['../../tsconfig.base.json'] })],
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['./__tests__/setup.ts'],
    // Integration tests share state (a real DB) — run serially to avoid races
    // between migrate/reset/seed.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Migration + seed can take a few seconds on a cold container.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

Also add `vite-tsconfig-paths` to `packages/db/devDependencies` via Edit on `packages/db/package.json`:
- old_string: `"vitest": "^2.1.5"`
- new_string: `"vitest": "^2.1.5",\n    "vite-tsconfig-paths": "^5.1.3"`

Then run `pnpm install` from repo root.

- [ ] **Step 2: Write `packages/db/__tests__/setup.ts`**

```ts
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from repo root (two levels up).
config({ path: resolve(__dirname, '../../../.env') });

if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    'DATABASE_URL_TEST is not set. Copy .env.example to .env at repo root.',
  );
}

// Point Prisma at the test database for the whole test run.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
```

- [ ] **Step 3: Write the RED test**

`packages/db/__tests__/migration.integration.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the test — confirm RED**

```bash
pnpm -F @vendoora/db test
```
Expected: test fails because `prisma migrate reset` errors with `Migration history is empty but the database has tables, or models reference non-existent tables`. (Or: tests fail because the tables don't exist yet.) This is the right kind of RED — Prisma is running but the schema is empty.

- [ ] **Step 5: Write the User model in `schema.prisma`**

Append to `packages/db/prisma/schema.prisma`:

```prisma
// ============================================================================
// Identity (Engineering_Spec §4.2)
// Sessions and OAuth links are owned by Clerk (Engineering_Spec §3.1,
// Build_Prompt §10.2) and are not mirrored here.
// ============================================================================

model User {
  id                  String    @id @default(cuid())
  clerk_id            String    @unique
  email               String    @unique
  phone               String?   @unique
  phone_country_code  String?
  full_name           String
  display_name        String?
  avatar_url          String?
  preferred_currency  String    @default("USD")
  preferred_language  String    @default("en")
  timezone            String    @default("UTC")
  is_email_verified   Boolean   @default(false)
  is_phone_verified   Boolean   @default(false)
  has_2fa_enabled     Boolean   @default(false)
  account_status      UserAccountStatus @default(ACTIVE)
  last_login_at       DateTime?
  last_login_ip       String?
  trust_score         Float     @default(50.0)
  created_at          DateTime  @default(now())
  updated_at          DateTime  @updatedAt
  deleted_at          DateTime?

  user_roles          UserRole[]
  assigned_user_roles UserRole[] @relation("UserRoleAssignedBy")

  @@index([clerk_id])
  @@index([email])
  @@index([phone])
  @@index([account_status])
  @@index([trust_score])
  @@index([deleted_at])
  @@map("users")
}

enum UserAccountStatus {
  ACTIVE
  SUSPENDED
  PENDING_VERIFICATION
  CLOSED
}
```

- [ ] **Step 6: Generate migration and apply**

```bash
cd /c/Users/Anthony/Documents/vendoora
pnpm -F @vendoora/db prisma migrate dev --name add_users_table
```
Expected: Prisma generates a new migration file and applies it. Output ends with `Your database is now in sync with your schema.`

- [ ] **Step 7: Run the test — confirm GREEN**

```bash
pnpm -F @vendoora/db test
```
Expected: all 3 tests pass.

---

### Task 4: RBAC models

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add Permission, Role, RolePermission, UserRole)
- Modify: `packages/db/__tests__/migration.integration.test.ts` (add 4 more test cases)

- [ ] **Step 1: Extend the integration test (RED-additions)**

Append to `migration.integration.test.ts` inside the same `describe` block, OR add a new `describe('RBAC tables', ...)` block:

```ts
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

    // Composite PK on (role_id, permission_id)
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
```

- [ ] **Step 2: Run the test — confirm RED for the new cases**

```bash
pnpm -F @vendoora/db test
```
Expected: Identity tests still pass; the 4 new RBAC tests fail because those tables don't exist.

- [ ] **Step 3: Append RBAC models to `schema.prisma`**

```prisma
// ============================================================================
// RBAC (Engineering_Spec §4.3)
// ============================================================================

model Permission {
  id          String   @id @default(cuid())
  name        String   @unique
  category    String
  description String
  is_system   Boolean  @default(true)
  created_at  DateTime @default(now())

  role_permissions RolePermission[]

  @@index([category])
  @@map("permissions")
}

model Role {
  id              String   @id @default(cuid())
  name            String   @unique
  display_name    String
  description     String
  is_system_role  Boolean  @default(false)
  created_by_user_id String?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  role_permissions RolePermission[]
  user_roles       UserRole[]

  @@index([is_system_role])
  @@map("roles")
}

model RolePermission {
  role_id       String
  permission_id String
  granted_at    DateTime @default(now())

  role       Role       @relation(fields: [role_id], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permission_id], references: [id], onDelete: Cascade)

  @@id([role_id, permission_id])
  @@index([permission_id])
  @@map("role_permissions")
}

model UserRole {
  user_id             String
  role_id             String
  assigned_at         DateTime  @default(now())
  assigned_by_user_id String?
  expires_at          DateTime?

  user        User  @relation(fields: [user_id], references: [id], onDelete: Cascade)
  role        Role  @relation(fields: [role_id], references: [id], onDelete: Cascade)
  assigned_by User? @relation("UserRoleAssignedBy", fields: [assigned_by_user_id], references: [id])

  @@id([user_id, role_id])
  @@index([role_id])
  @@index([expires_at])
  @@map("user_roles")
}
```

- [ ] **Step 4: Generate migration and apply**

```bash
pnpm -F @vendoora/db prisma migrate dev --name add_rbac_tables
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
pnpm -F @vendoora/db test
```
Expected: all 7 tests pass (3 identity + 4 RBAC).

---

### Task 5: Operations cross-cutting models (AuditLog, FeatureFlag, FxRate)

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/__tests__/migration.integration.test.ts`

- [ ] **Step 1: Extend tests (RED-additions)**

Add a new `describe('Operations tables', ...)` block:

```ts
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

  it('creates the fx_rates table', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'fx_rates';
    `;
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — confirm RED for the new cases**

```bash
pnpm -F @vendoora/db test
```

- [ ] **Step 3: Append Operations models to `schema.prisma`**

```prisma
// ============================================================================
// Operations — cross-cutting (Engineering_Spec §4.18, §4.19)
// ============================================================================

model AuditLog {
  id                String   @id @default(cuid())
  actor_user_id     String?
  actor_system      Boolean  @default(false)
  target_user_id    String?
  action            String
  resource_type     String?
  resource_id       String?
  before_state      Json?
  after_state       Json?
  ip_address        String?
  user_agent        String?
  metadata          Json?
  created_at        DateTime @default(now())

  @@index([actor_user_id, created_at])
  @@index([resource_type, resource_id])
  @@index([action])
  @@index([created_at])
  @@map("audit_log")
}

model FeatureFlag {
  id              String   @id @default(cuid())
  name            String   @unique
  description     String?
  is_enabled      Boolean  @default(false)
  rollout_percent Int      @default(0)
  audience        String?
  metadata        Json?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  @@map("feature_flags")
}

model FxRate {
  id              String   @id @default(cuid())
  from_currency   String
  to_currency     String
  rate            Decimal  @db.Decimal(15, 8)
  source          String   @default("CBL")
  fetched_at      DateTime @default(now())
  effective_date  DateTime @db.Date
  is_active       Boolean  @default(true)

  @@unique([from_currency, to_currency, effective_date])
  @@index([effective_date])
  @@map("fx_rates")
}
```

- [ ] **Step 4: Generate migration and apply**

```bash
pnpm -F @vendoora/db prisma migrate dev --name add_operations_tables
```

- [ ] **Step 5: Run tests — confirm GREEN**

```bash
pnpm -F @vendoora/db test
```
Expected: 10 tests pass.

---

### Task 6: Audit log INSERT-only trigger (raw SQL migration)

**Files:**
- Create: `packages/db/__tests__/audit-log-trigger.integration.test.ts`
- Create: `packages/db/prisma/migrations/<auto-timestamp>_add_audit_log_immutability_trigger/migration.sql`

- [ ] **Step 1: Write the RED test**

`packages/db/__tests__/audit-log-trigger.integration.test.ts`:

```ts
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

describe('audit_log immutability', () => {
  beforeEach(async () => {
    // Clean slate — but we cannot DELETE if the trigger is in place.
    // Instead, use TRUNCATE which bypasses row triggers (the trigger is row-level).
    // This is intentional: TRUNCATE is an admin-only operation.
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
```

- [ ] **Step 2: Run — confirm RED**

```bash
pnpm -F @vendoora/db test
```
Expected: the 3 new trigger tests fail. INSERT test passes (no constraint yet); UPDATE and DELETE tests fail because the trigger doesn't exist — Prisma successfully updates/deletes, so the test's `rejects.toThrow` assertion fails.

- [ ] **Step 3: Create the trigger migration**

```bash
cd /c/Users/Anthony/Documents/vendoora
pnpm -F @vendoora/db prisma migrate dev --create-only --name add_audit_log_immutability_trigger
```
Expected: Prisma creates a new migration directory under `packages/db/prisma/migrations/` with an empty `migration.sql`.

- [ ] **Step 4: Hand-write the trigger SQL**

Open the newly-created `migration.sql` (the path will be something like `packages/db/prisma/migrations/20260526xxxxxx_add_audit_log_immutability_trigger/migration.sql`). Replace its contents with:

```sql
-- Audit log immutability (Build_Prompt §10.4).
-- The audit log is append-only at the database level. UPDATE and DELETE
-- raise an exception. INSERT is unaffected. TRUNCATE (DDL) bypasses this
-- row-level trigger by design — TRUNCATE is an explicit, audited admin
-- operation, not a row-mutation.

CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable — % is not permitted', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_reject_mutation();
```

- [ ] **Step 5: Apply the migration**

```bash
pnpm -F @vendoora/db prisma migrate dev
```
Expected: Prisma detects the newly-authored migration and applies it. Output: `The following migration(s) have been applied: <ts>_add_audit_log_immutability_trigger`.

- [ ] **Step 6: Run tests — confirm GREEN**

```bash
pnpm -F @vendoora/db test
```
Expected: all 13 tests pass (10 schema + 3 trigger).

- [ ] **Step 7: Sanity check — verify the trigger is actually firing**

```bash
docker exec vendoora-postgres psql -U vendoora -d vendoora_test -c "INSERT INTO audit_log (id, action, actor_system, created_at) VALUES ('test1', 'X', true, NOW());"
docker exec vendoora-postgres psql -U vendoora -d vendoora_test -c "UPDATE audit_log SET action='Y' WHERE id='test1';"
```
Expected output of second command: `ERROR:  audit_log is immutable — UPDATE is not permitted`.

---

### Task 7: Seeds — 40 permissions + 12 system roles

**Files:**
- Create: `packages/db/prisma/seed.ts`
- Create: `packages/db/__tests__/seed.integration.test.ts`

The permission catalog enumerated below is the exact list from Engineering_Spec §4.3 (40 permissions). The remaining ~80 implied permissions are deferred to follow-up plans that build the admin surfaces consuming them.

- [ ] **Step 1: Write the RED test**

`packages/db/__tests__/seed.integration.test.ts`:

```ts
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

describe('seed: permissions + roles', () => {
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

  it('finance_admin role has the finance + escrow.read + refund + reconciliation subset', async () => {
    const role = await prisma.role.findUnique({
      where: { name: 'finance_admin' },
      include: { role_permissions: { include: { permission: true } } },
    });
    expect(role).not.toBeNull();
    const names = role!.role_permissions.map((rp) => rp.permission.name).sort();
    // Finance category (4) + escrow.read.all (1) + refund (3) + reconciliation (1 within finance category — payout.execute is in finance)
    // From Engineering_Spec §4.3: finance has payout.execute, payout.delay, reconciliation.run, fx_rate.override
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
```

- [ ] **Step 2: Run — confirm RED**

```bash
pnpm -F @vendoora/db test
```
Expected: the 6 new seed tests fail because `prisma db seed` fails — there's no `seed.ts` yet.

- [ ] **Step 3: Write `packages/db/prisma/seed.ts`**

```ts
/**
 * Vendoora — database seed.
 *
 * Seeds the 40 permissions explicitly enumerated in Engineering_Spec §4.3
 * plus the 8 system admin roles + 4 marketplace roles.
 *
 * Idempotent: re-running the seed updates existing rows rather than failing
 * on unique-constraint violations.
 *
 * The remaining ~80 permissions implied by "~120 permissions" in the spec
 * are seeded by the plans that build the admin surfaces consuming them.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ----------------------------------------------------------------------------
// Permission catalog — 40 permissions across 10 categories (Engineering_Spec §4.3)
// ----------------------------------------------------------------------------

interface PermissionDef {
  name: string;
  category: string;
  description: string;
}

const PERMISSIONS: PermissionDef[] = [
  // auth (3)
  { name: 'auth.login_as_other_user',  category: 'auth', description: 'Impersonate another user for support purposes' },
  { name: 'auth.force_password_reset', category: 'auth', description: 'Force a password reset for any user' },
  { name: 'auth.disable_mfa',          category: 'auth', description: 'Disable MFA for a user (support recovery)' },

  // user (5)
  { name: 'user.read',         category: 'user', description: 'Read any user record' },
  { name: 'user.suspend',      category: 'user', description: 'Suspend a user account' },
  { name: 'user.delete',       category: 'user', description: 'Hard-delete a user (GDPR)' },
  { name: 'user.role.assign',  category: 'user', description: 'Assign roles to users' },
  { name: 'user.role.revoke',  category: 'user', description: 'Revoke roles from users' },

  // seller (5)
  { name: 'seller.kyc.review',    category: 'seller', description: 'Review seller KYC submissions' },
  { name: 'seller.kyc.promote',   category: 'seller', description: 'Promote a seller to a higher KYC tier' },
  { name: 'seller.kyc.demote',    category: 'seller', description: 'Demote a seller to a lower KYC tier' },
  { name: 'seller.suspend',       category: 'seller', description: 'Suspend a seller account' },
  { name: 'seller.payout.manual', category: 'seller', description: 'Manually trigger a seller payout' },

  // product (4)
  { name: 'product.read.all',  category: 'product', description: 'Read all products including DRAFT/ARCHIVED' },
  { name: 'product.moderate',  category: 'product', description: 'Moderate (approve/reject/take-down) products' },
  { name: 'product.delete',    category: 'product', description: 'Soft-delete a product' },
  { name: 'product.feature',   category: 'product', description: 'Mark a product as featured' },

  // order (3)
  { name: 'order.read.all',         category: 'order', description: 'Read any order' },
  { name: 'order.cancel',           category: 'order', description: 'Cancel an order' },
  { name: 'order.status.override',  category: 'order', description: 'Override order status (support)' },

  // escrow (4)
  { name: 'escrow.read.all',      category: 'escrow', description: 'Read any escrow hold' },
  { name: 'escrow.force_release', category: 'escrow', description: 'Force-release an escrow hold' },
  { name: 'escrow.force_refund',  category: 'escrow', description: 'Force-refund an escrow hold' },
  { name: 'escrow.freeze',        category: 'escrow', description: 'Freeze an escrow hold pending investigation' },

  // dispute (4)
  { name: 'dispute.read.all',  category: 'dispute', description: 'Read any dispute' },
  { name: 'dispute.assign',    category: 'dispute', description: 'Assign disputes to T&S admins' },
  { name: 'dispute.resolve',   category: 'dispute', description: 'Resolve disputes' },
  { name: 'dispute.escalate',  category: 'dispute', description: 'Escalate a dispute to senior T&S' },

  // refund (3)
  { name: 'refund.authorize.under_500', category: 'refund', description: 'Authorize refunds under $500' },
  { name: 'refund.authorize.over_500',  category: 'refund', description: 'Authorize refunds over $500 (step-up auth)' },
  { name: 'refund.deny',                category: 'refund', description: 'Deny a refund request' },

  // finance (4)
  { name: 'payout.execute',     category: 'finance', description: 'Execute a queued payout' },
  { name: 'payout.delay',       category: 'finance', description: 'Delay a queued payout' },
  { name: 'reconciliation.run', category: 'finance', description: 'Run reconciliation jobs' },
  { name: 'fx_rate.override',   category: 'finance', description: 'Override the daily FX rate' },

  // system (5)
  { name: 'feature_flag.toggle', category: 'system', description: 'Toggle feature flags' },
  { name: 'permission.create',   category: 'system', description: 'Create new permissions (superadmin only)' },
  { name: 'role.create',         category: 'system', description: 'Create custom roles' },
  { name: 'audit_log.read',      category: 'system', description: 'Read the audit log' },
  { name: 'audit_log.export',    category: 'system', description: 'Export the audit log' },
];

// ----------------------------------------------------------------------------
// Role catalog — 8 system admin roles + 4 marketplace roles
// ----------------------------------------------------------------------------

interface RoleDef {
  name: string;
  display_name: string;
  description: string;
  is_system_role: boolean;
  permissions: string[]; // permission names this role gets
}

const ALL_PERMISSION_NAMES = PERMISSIONS.map((p) => p.name);

const ROLES: RoleDef[] = [
  {
    name: 'superadmin',
    display_name: 'Superadmin',
    description: 'All permissions including permission.create and role.create',
    is_system_role: true,
    permissions: ALL_PERMISSION_NAMES,
  },
  {
    name: 'finance_admin',
    display_name: 'Finance Admin',
    description: 'Finance category + escrow read + refund + reconciliation',
    is_system_role: true,
    permissions: [
      'payout.execute', 'payout.delay', 'reconciliation.run', 'fx_rate.override',
      'escrow.read.all',
      'refund.authorize.under_500', 'refund.authorize.over_500', 'refund.deny',
    ],
  },
  {
    name: 'ts_admin',
    display_name: 'Trust & Safety Admin',
    description: 'Dispute, KYC review, product moderation, user suspension',
    is_system_role: true,
    permissions: [
      'dispute.read.all', 'dispute.assign', 'dispute.resolve', 'dispute.escalate',
      'seller.kyc.review', 'seller.kyc.promote', 'seller.kyc.demote',
      'product.moderate',
      'user.suspend',
      'refund.authorize.under_500', // T&S can authorize small refunds as part of dispute resolution
    ],
  },
  {
    name: 'support_admin',
    display_name: 'Support Admin',
    description: 'Read-mostly + password resets + order status overrides',
    is_system_role: true,
    permissions: [
      'user.read',
      'order.read.all', 'order.status.override',
      'auth.force_password_reset',
    ],
  },
  {
    name: 'operations_admin',
    display_name: 'Operations Admin',
    description: 'Driver management + delivery zone configuration',
    is_system_role: true,
    // Driver / delivery_zone permissions land with the Drivers domain plan.
    // For now, operations_admin has order visibility.
    permissions: ['order.read.all'],
  },
  {
    name: 'marketing_admin',
    display_name: 'Marketing Admin',
    description: 'Promo codes + featured products + bundle curation',
    is_system_role: true,
    permissions: ['product.feature'],
  },
  {
    name: 'catalog_admin',
    display_name: 'Catalog Admin',
    description: 'Category + attribute schema + seller onboarding queue',
    is_system_role: true,
    permissions: ['seller.kyc.review', 'product.read.all'],
  },
  {
    name: 'analytics_admin',
    display_name: 'Analytics Admin',
    description: 'Read-only access to all dashboards + export',
    is_system_role: true,
    permissions: [
      'user.read', 'order.read.all', 'escrow.read.all', 'dispute.read.all',
      'product.read.all', 'audit_log.read', 'audit_log.export',
    ],
  },
  // Marketplace roles
  { name: 'buyer',         display_name: 'Buyer',         description: 'Standard marketplace buyer', is_system_role: false, permissions: [] },
  { name: 'seller',        display_name: 'Seller',        description: 'Verified marketplace seller', is_system_role: false, permissions: [] },
  { name: 'seller_staff',  display_name: 'Seller Staff',  description: 'Staff member of a seller account', is_system_role: false, permissions: [] },
  { name: 'driver',        display_name: 'Driver',        description: 'Verified delivery driver', is_system_role: false, permissions: [] },
];

// ----------------------------------------------------------------------------
// Seed runner
// ----------------------------------------------------------------------------

async function main() {
  console.log(`Seeding ${PERMISSIONS.length} permissions...`);
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: p.name },
      update: { category: p.category, description: p.description },
      create: p,
    });
  }

  console.log(`Seeding ${ROLES.length} roles...`);
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: {
        display_name: r.display_name,
        description: r.description,
        is_system_role: r.is_system_role,
      },
      create: {
        name: r.name,
        display_name: r.display_name,
        description: r.description,
        is_system_role: r.is_system_role,
      },
    });

    // Reset the role's permissions to exactly the seeded set (idempotent).
    await prisma.rolePermission.deleteMany({ where: { role_id: role.id } });
    if (r.permissions.length > 0) {
      const perms = await prisma.permission.findMany({
        where: { name: { in: r.permissions } },
      });
      if (perms.length !== r.permissions.length) {
        const found = perms.map((p) => p.name);
        const missing = r.permissions.filter((n) => !found.includes(n));
        throw new Error(`Role ${r.name}: missing permissions ${missing.join(', ')}`);
      }
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({ role_id: role.id, permission_id: p.id })),
      });
    }
  }

  console.log('Seed complete.');
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

**Note:** the seed's `rolePermission.deleteMany` will fail if any UserRole references a Role being modified mid-run — but on a fresh test DB this is empty. For production seed re-runs, a more careful diff would be needed (deferred to a later plan).

- [ ] **Step 4: Run seed manually first to catch any issues**

```bash
pnpm -F @vendoora/db prisma migrate reset --force --skip-seed
pnpm -F @vendoora/db prisma db seed
```
Expected: prints "Seeding 40 permissions..." then "Seeding 12 roles..." then "Seed complete."

- [ ] **Step 5: Run the seed tests — confirm GREEN**

```bash
pnpm -F @vendoora/db test
```
Expected: all 19 tests pass (10 schema + 3 trigger + 6 seed).

- [ ] **Step 6: Sanity check the finance_admin assertion is meaningful**

Temporarily remove `'refund.deny'` from finance_admin's permissions list in `seed.ts`, re-run tests, confirm the `finance_admin role has the finance...` test fails with a specific permission mismatch. Then revert.

---

### Task 8: apps/web smoke test — proves @vendoora/db is importable

**Files:**
- Modify: `apps/web/package.json` (add `@vendoora/db` dep)
- Create: `apps/web/__tests__/db-integration.test.ts`

- [ ] **Step 1: Add `@vendoora/db` to apps/web**

Use Edit on `apps/web/package.json`:
- old_string:
```
  "dependencies": {
    "@vendoora/types": "workspace:*",
    "next": "^15.0.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```
- new_string:
```
  "dependencies": {
    "@vendoora/db": "workspace:*",
    "@vendoora/types": "workspace:*",
    "next": "^15.0.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```

Also add `dotenv` to devDependencies via another Edit:
- old_string: `"vite-tsconfig-paths": "^5.1.3"`
- new_string: `"vite-tsconfig-paths": "^5.1.3",\n    "dotenv": "^16.4.5"`

Run `pnpm install` from repo root.

- [ ] **Step 2: Generate Prisma client (so `@prisma/client` types resolve in apps/web)**

```bash
pnpm -F @vendoora/db prisma generate
```

- [ ] **Step 3: Write `apps/web/__tests__/db-integration.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

describe('apps/web → @vendoora/db', () => {
  it('imports the prisma singleton and can count users', async () => {
    const { prisma } = await import('@vendoora/db');
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 4: Run the test**

Pre-condition: the test database has been migrated (from running `packages/db` tests). If running fresh:
```bash
DATABASE_URL=$DATABASE_URL_TEST pnpm -F @vendoora/db prisma migrate deploy
```

Then:
```bash
pnpm -F @vendoora/web test
```
Expected: all tests pass, including the new `db-integration` and the existing `cross-package-import`.

---

### Task 9: Documentation polish + commit

**Files:**
- Modify: root `README.md` (mention `db:up` / `db:seed`)
- (No new ADR — the existing first-commit ADR's "until GitHub is wired" implicitly covers this)

- [ ] **Step 1: Update root `README.md` Getting Started section**

Use Edit on `README.md`:
- old_string:
```
\`\`\`bash
volta install node@22.12.0
volta install pnpm@9.15.0
pnpm install
pnpm build
pnpm -F web dev
\`\`\`
```
- new_string:
```
\`\`\`bash
# One-time toolchain
volta install node@22.12.0
volta install pnpm@9.15.0

# Install + start Postgres
pnpm install
pnpm db:up
pnpm -F @vendoora/db migrate:dev    # apply migrations to vendoora_dev
pnpm db:seed                        # seed permissions + roles

# Build + dev
pnpm build
pnpm -F @vendoora/web dev
\`\`\`
```

(Where `\`\`\`` means three literal backticks.)

- [ ] **Step 2: Verify everything works from a cold state**

```bash
cd /c/Users/Anthony/Documents/vendoora
pnpm db:reset                       # tears down volume, restarts container fresh
sleep 10                            # wait for postgres to come up
pnpm -F @vendoora/db migrate:deploy
pnpm db:seed
pnpm -F @vendoora/db test           # all tests should pass
pnpm -F @vendoora/web test          # cross-package + db-integration tests should pass
pnpm build                          # root Turbo build
```

If any step fails, investigate before committing.

- [ ] **Step 3: Stage and commit**

```bash
cd /c/Users/Anthony/Documents/vendoora
git add -A
git status
```
Verify ~25-30 new/modified files. None of `node_modules/`, `.next/`, `.turbo/`, `vendoora-postgres-data/` should appear.

```bash
git commit -m "$(cat <<'EOF'
feat(db): packages/db scaffold + Identity/RBAC/Operations schema

Adds the first slice of the Vendoora data model:
- packages/db with Prisma 6 client + schema + seed + integration tests
- infra/docker Compose Postgres 16 for dev and test (vendoora_dev + vendoora_test)
- Identity: users (Engineering_Spec §4.2). Sessions + OAuth links owned by
  Clerk (§3.1, Build_Prompt §10.2), so they're not mirrored here.
- RBAC tables: permissions, roles, role_permissions, user_roles (§4.3)
- Operations cross-cutting tables: audit_log, feature_flags, fx_rates (§4.18, §4.19)
- audit_log INSERT-only enforcement via Postgres BEFORE UPDATE/DELETE trigger
  (Build_Prompt §10.4 — append-only at the database level)
- Seed: 40 permissions (every permission enumerated in Engineering_Spec §4.3)
  + 12 system roles (8 admin + 4 marketplace) with permission bundles
- apps/web smoke test proves the workspace dep loop works for @vendoora/db

Verification:
- pnpm -F @vendoora/db test         (19 passed: 10 schema + 3 trigger + 6 seed)
- pnpm -F @vendoora/web test        (cross-package + db-integration pass)
- pnpm build                        (Turborepo topological build OK)
- Cold-state sanity: db:reset -> migrate:deploy -> seed -> test all clean

Deferred per the slice plan:
- Remaining 8 domains (Sellers, Catalog, Orders, Escrow, Disputes, Drivers,
  Diaspora, rest of Operations) — each its own follow-up plan
- 6 May-2026 additions (Reviews, Trust Cases, Profile Change Requests,
  Webhook/Outbox, Product extensions, KYC Application)
- The remaining ~80 permissions implied by "~120 permissions" in §4.3 —
  seeded with the admin surfaces that consume them (P6)
- Row-Level Security policies — per-domain when each domain lands
- Neon project creation + Doppler secrets — P1.3.2 plan with GitHub remote

Methodology gates:
- Brainstorm: conversational (no separate design doc — this slice is a
  direct translation of Engineering_Spec §4.2 + §4.3 + §4.18-19)
- Plan: docs/plans/2026-05-26-prisma-identity-rbac-operations.md

Phase: P1 Foundation (Playbook §3.1.3, slice 1 of ~6).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Verify:
```bash
git log --oneline
git show --stat HEAD | tail -5
```
Expected: 2 commits total (the walking-skeleton + this one), this commit shows ~25-30 files changed.

---

## Acceptance criteria

- [ ] `pnpm db:up` brings up Postgres 16 via Docker Compose
- [ ] `pnpm -F @vendoora/db migrate:deploy` applies 4 migrations cleanly (3 table + 1 trigger)
- [ ] `pnpm db:seed` inserts 40 permissions + 12 roles with correct bundles
- [ ] `pnpm -F @vendoora/db test` reports 19/19 passing
- [ ] `pnpm -F @vendoora/web test` reports the existing 2 tests + the new db-integration test passing
- [ ] `pnpm build` at root succeeds
- [ ] Direct INSERT into `audit_log` works; direct UPDATE/DELETE via psql returns `ERROR: audit_log is immutable`
- [ ] `git log --oneline` shows exactly 2 commits on `feature/prisma-identity-rbac-operations` branch
- [ ] No leakage of `node_modules/`, `.turbo/`, `.next/`, or `vendoora-postgres-data/` into the commit

## Next slices (in suggested order, each own plan)

1. **Sellers + Catalog** — `Seller`, `SellerStaff`, `Category`, `Product`, `ProductVariant`, `ProductImage`, including May-2026 product extensions (condition, warranty, authenticity)
2. **Orders + Cart + Escrow + Payments** — the trust-mechanic surface
3. **Disputes + Refunds** — complete the trust mechanic
4. **Drivers + Logistics** — `Driver`, `Vehicle`, `Delivery`
5. **Diaspora** — `Recipient`, `GiftBundle`, `GroupGift`, `ScheduledGift`, `VoiceMessage`
6. **May-2026 additions** — Reviews, Trust Cases, Profile Change Requests, Webhook/Outbox, KYC Application
