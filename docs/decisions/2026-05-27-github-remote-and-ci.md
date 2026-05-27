# ADR-002 — GitHub remote + 10-stage CI/CD

**Status:** Accepted
**Date:** 2026-05-27

## Context

The Vendoora monorepo has been local-only through the first 22 commits (P1–P2
slices). Code review has been informal: TDD + the four-phase debugging
discipline running locally per Build_Prompt §0.5. The methodology gate requires
a `code-reviewer` subagent before merge, but no remote means no PRs, no
branch-protection rules, and no automated CI.

This ADR records the decision to host on GitHub with a 10-stage workflow that
runs every PR and every push to `main`.

## Decision

1. **Remote**: GitHub, private repository named `vendoora`. The repo lives
   under the project owner&apos;s personal account until the entity is registered;
   it moves to a `vendoora-marketplace` org at that point.
2. **Default branch**: `main`. PRs only; direct push to `main` disabled once
   the remote is created.
3. **Workflow**: `.github/workflows/ci.yml` runs 10 stages — 9 functional
   stages + 1 summary gate that blocks the merge when any stage failed:

   | # | Stage              | Purpose                                          |
   |---|--------------------|--------------------------------------------------|
   | 1 | install            | Warm pnpm + Turbo caches for downstream jobs     |
   | 2 | type-check         | `pnpm -r type-check` — every package + apps/web  |
   | 3 | lint               | `pnpm -r lint` — ESLint across the workspace     |
   | 4 | prisma-format      | `prisma format` is a no-op (no schema drift)     |
   | 5 | prisma-validate    | `prisma validate` parses the schema cleanly       |
   | 6 | prisma-migrate     | `migrate deploy` + seed against fresh Postgres   |
   | 7 | test               | `pnpm -r test` — vitest against the seeded DB    |
   | 8 | build              | `pnpm -F @vendoora/web build` — Next emits        |
   | 9 | secret-scan        | trufflehog on the diff range                     |
   | 10| summary            | Blocks merge if any stage failed                 |

4. **Branch protection** (set via GitHub UI after the remote is created):
   - Require PRs to merge into `main`
   - Require status checks: `10 · CI summary` must pass
   - Require linear history (no merge commits — ff-only)
   - Require signed commits (matches Build_Prompt §11.3)
   - Dismiss stale reviews when new commits land

5. **Secrets**: none required for the public path. CI uses an ephemeral
   Postgres service container; no production credentials are needed.

## Consequences

**Positive**
- A clear merge gate replaces local code-reviewer subagent gating.
- Every PR shows the full 10-stage report in the GitHub UI.
- Secret-scanning catches accidental key leakage before merge.
- Trufflehog runs against the diff range (`base..head`), so the run cost
  stays predictable as history grows.

**Negative**
- Adds GitHub Actions usage to the bill (mitigated by `concurrency.cancel-
  in-progress: true` and `--frozen-lockfile` cache warmth).
- First push of 23 commits will take a few minutes to surface in the UI.

## How to publish

The repo isn't pushed yet — `gh` CLI is not installed on the workstation that
authored these commits. Two options to publish:

### Option A: Install `gh` and run
```bash
# Install on Windows
winget install --id GitHub.cli

# Authenticate (browser-based)
gh auth login

# Create + push the repo
cd C:\Users\Anthony\Documents\vendoora
gh repo create vendoora --private --source=. --remote=origin --push
```

### Option B: Create the repo in the GitHub UI and push manually
```bash
# Create a new private repo named "vendoora" at github.com/new (do NOT add
# README, .gitignore, or license; we already have them).
cd C:\Users\Anthony\Documents\vendoora
git remote add origin git@github.com:<your-username>/vendoora.git
git push -u origin main
```

Either way, the workflow at `.github/workflows/ci.yml` fires automatically on
the first push.

## Follow-ups

- Once the org exists, transfer the repo and update remote URLs.
- Add a CodeQL workflow for the JavaScript/TypeScript surface.
- Add Renovate or Dependabot for dependency updates.
- Wire a deploy workflow (Vercel preview on PR, production on `main` push)
  once the production deployment target is chosen.
