# Vendoora

Multi-vendor marketplace for Liberia and the Liberian diaspora.

## Getting started

```bash
# One-time toolchain (Windows: winget install Volta.Volta first)
volta install node@22.12.0
volta install pnpm@9.15.0

# Local Postgres + dependencies
pnpm install
cp .env.example .env
pnpm db:up                          # Postgres 16 on host port 5434

# Apply schema + seed
pnpm -F @vendoora/db migrate:dev    # creates tables in vendoora_dev
pnpm db:seed                        # 40 permissions + 12 roles

# Build + dev
pnpm build
pnpm -F @vendoora/web dev
```

Tests (require Docker Postgres up):

```bash
pnpm -F @vendoora/db test           # 19 integration tests
pnpm -F @vendoora/web test          # cross-package + db-integration
```

## Database

Local dev uses Docker Compose Postgres on host port **5434** (not 5432 — Windows machines often have a system PostgreSQL service bound there, and Docker Desktop's WSL relay can hold 5433). See [docs/Engineering_Spec.md §4](docs/Engineering_Spec.md) for schema design and [packages/db/README.md](packages/db/README.md) for the dev workflow.

## Repository layout

See [docs/Engineering_Spec.md §2.1](docs/Engineering_Spec.md).

## Methodology

See [docs/Build_Prompt.md](docs/Build_Prompt.md). Every change goes through brainstorm → plan → /execute-plan → TDD → code-reviewer.
