# @vendoora/db

Prisma schema + client for Vendoora. Single source of truth for database structure.

## Dev workflow

```bash
# From repo root
pnpm db:up                          # start Postgres via Docker Compose
pnpm -F @vendoora/db migrate:dev    # apply migrations to vendoora_dev
pnpm -F @vendoora/db seed           # seed permissions + roles
pnpm db:down                        # stop Postgres
```

## Tests

```bash
pnpm -F @vendoora/db test
```

Tests connect to `vendoora_test` (a separate database created at Docker init time) and reset between runs.

## Schema authoring

See `prisma/schema.prisma`. Models map to Engineering_Spec §4. The audit log's INSERT-only enforcement lives in `prisma/migrations/<ts>_add_audit_log_immutability_trigger/migration.sql` and is a hand-authored SQL migration (Prisma migrate doesn't express triggers natively).

## Note on sessions and OAuth

Engineering_Spec §3.1 + Build_Prompt §10.2 designate Clerk as the source of truth for authentication. Session state and OAuth provider links are NOT mirrored into this schema. The `User` row carries `last_login_at` + `last_login_ip` for audit-relevant moments.
