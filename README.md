# Vendoora

[![CI](https://github.com/johnsonanthony20245-ui/vendoora/actions/workflows/ci.yml/badge.svg)](https://github.com/johnsonanthony20245-ui/vendoora/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

Multi-vendor marketplace for Liberia and the Liberian diaspora. Every order is
escrow-protected, every seller is KYC-verified, and every delivery is
code-verified at the door.

**Status:** P2 Core Marketplace — buyer flow end-to-end (browse → cart →
checkout → tracking → delivery code → dispute), seller onboarding wizard,
T&S admin queue, full-text search, 10-stage CI.

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

## License

Vendoora is licensed under the [GNU Affero General Public License v3.0](LICENSE).
Anyone who runs a modified version of Vendoora — including over a network — must
make their modified source code available to the people using it.

This protects the trust mechanic at the heart of the marketplace: escrow,
KYC, and the delivery-code rules can't be quietly forked and weakened. If
that doesn't match your use case, contact the maintainers about a commercial
license.
