# Email normalization (citext) — Design

**Date:** 2026-06-01
**Status:** Approved
**Author:** Claude (brainstormed + confirmed with AJ)

## Problem

`users.email` is a byte-exact `TEXT @unique` column. Email is matched case-sensitively
everywhere, which produces two defects:

1. **The guest-checkout guard misses case-variants.** `resolveGuestBuyer`
   (`apps/web/lib/order.ts`) throws `GuestEmailBelongsToAccountError` when a guest's
   contact email matches a non-guest account, via `findUnique({ where: { email } })`.
   Because the match is byte-exact, a guest typing `Victim@x.com` when the account is
   `victim@x.com` is **not** blocked — the "please sign in" prompt never fires. (The
   security invariant still holds: the order is not attributed to the victim's account;
   the guest gets a separate row.)
2. **Duplicate-identity drift.** `joe@x.com` and `Joe@x.com` create two distinct
   `users` rows.

## Goal

Make `users.email` identity case-insensitive for both **matching** and **uniqueness**,
so the existing guard fires regardless of case and no case-variant duplicate rows can
be created — without touching application lookup code and without losing the original
display case.

## Decision: PostgreSQL `citext` (DB-level)

Convert `users.email` to the `citext` type. `citext` stores the original text but
compares case-insensitively, so:

- The existing `@unique` becomes case-insensitive — `joe@`/`Joe@` cannot coexist.
- `findUnique({ where: { email } })` matches case-insensitively — the guard fires on
  case-variants **with zero application code change**.
- Display case is preserved (receipts, admin KYC views show what was typed).

### Why not app-level lowercasing

Lowercasing at every write/lookup boundary works but is only as strong as developer
discipline (a future forgotten `.toLowerCase()` silently reintroduces drift), it loses
the original display case, and it still requires a data backfill. DB-level enforcement
cannot be bypassed and needs no lookup changes.

### Feasibility (verified)

- `citext` 1.6 is available in the project's Postgres image (not yet installed).
- Prisma 6.1 supports `@db.Citext` natively.
- Zero case-insensitive duplicate emails exist in dev or test, so the column type
  change (which rebuilds the unique index) is collision-free.

## Changes

### 1. Migration (`packages/db/prisma/migrations/<ts>_email_citext/migration.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE CITEXT;
```

`users_email_key` (unique) and `users_email_idx` rebuild automatically with citext's
comparison semantics. If case-only duplicates existed the `ALTER` would fail loudly —
the correct, safe behavior; verified none exist.

### 2. Prisma schema (`packages/db/prisma/schema.prisma`)

- Datasource: declare the `citext` extension (via the `postgresqlExtensions` preview
  feature) so Prisma tracks it and reports no drift.
- `User.email`: `email String @unique @db.Citext`.

### 3. Application code

No changes. The guard, all `findUnique({ where: { email } })` lookups, `user.create`,
and `user-sync` keep working; citext makes them case-insensitive.

## Out of scope

- `orders.buyer_email` — a recorded contact field, not identity-matched; keep exact
  case for receipts.
- `users.phone` (`@unique`) — a separate E.164 normalization concern.
- `sellers.business_email` — not identity-unique-matched.

## Testing (real DB, extend `apps/web/__tests__/order-buyer-identity.test.ts`)

These are the RED tests that drive the change (they fail on byte-exact matching, pass
after citext):

1. **Case-variant guard fires** — a guest draft whose email is
   `ACCOUNT_EMAIL.toUpperCase()` rejects with `GuestEmailBelongsToAccountError` and
   creates no order.
2. **Case-variant guest reuse** — guest checkout with a fresh email then its
   upper-cased form reuses exactly one guest row (no drift).

## Verification

Apply the migration to dev + test DBs, then: type-check · lint ·
`pnpm --filter @vendoora/web test` · build · code-reviewer subagent · PR through the
10-stage CI before squash-merge.

## Rollback

`ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;` restores the prior
byte-exact behavior (stored values are unchanged, since citext preserved them). The
`citext` extension can be left installed (harmless) or dropped if unused elsewhere.
