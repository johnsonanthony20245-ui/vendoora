# Vendoora — Monorepo Walking-Skeleton Design

**Date:** 2026-05-26
**Phase:** P1 Foundation (Playbook §3.1.1, partial)
**Status:** Design — awaiting user review before implementation plan is written
**Methodology gate:** Brainstorm (this doc) → plan (next) → /execute-plan → TDD → code-reviewer

---

## Problem

Vendoora's working directory contains only the spec trilogy and prototype HTML. There is no monorepo, no `package.json`, no Prisma schema, no `apps/web`. P1 Foundation cannot begin until the repository skeleton exists. The full P1.3.1 checklist (Playbook §3.1.1) names ~12 distinct deliverables in one bullet list; attempting them as a single plan would exceed Build_Prompt §3.3's 400-line plan cap and bury risk inside an unreviewable change.

This design defines the *smallest* monorepo scaffold that proves the cross-package import loop works end-to-end. Once it lands, each remaining P1.3.1 deliverable (each package, the worker, CI/CD, observability) gets its own focused plan.

## Approach

Hand-roll the layout per Engineering_Spec §2.1, referencing Turborepo 2.x's official template only for known-good config shapes. The deliverable is one `apps/web` (Next.js 15), one shared `packages/config` (TS + ESLint + Prettier exports), and one leaf `packages/types` containing a single `BRAND_NAME` constant and a `Currency` type. A Vitest test in `apps/web` imports both, proving workspace resolution, tsconfig path mapping, Next transpilation, and runtime + compile-time type flow in a single failing-then-passing assertion.

Two notable choices: (1) `packages/config` is one package with `./eslint`, `./prettier`, `./typescript` subpath exports rather than three separate sibling packages — pnpm-idiomatic and reduces workspace count by 3. (2) `packages/types` ships TypeScript source directly (no `dist/` build step); Next.js 15's `transpilePackages` and Vitest's `vite-tsconfig-paths` plugin handle compilation. We add per-package build steps only when a package has runtime concerns Next.js can't handle (Prisma client, native deps).

Node 22.12.0 LTS and pnpm 9.15.0 are pinned via Volta + the root `package.json` `volta` field + `packageManager` field. This reconciles the spec's locked toolchain (Node 22 LTS, pnpm 9.x) against the installed but unsupported Node 25 / pnpm 11.

## Scope (what this DOES)

- [ ] Create monorepo root at `C:\Users\Anthony\Documents\vendoora\` (new sibling dir, no spaces in path)
- [ ] Initialize git repository there with `main` branch
- [ ] Install Volta if not already present; install Node 22.12.0 + pnpm 9.15.0
- [ ] Root files: `package.json` (with `volta` and `packageManager` pins), `pnpm-workspace.yaml`, `turbo.json` (Turborepo 2.x `tasks` schema), `tsconfig.base.json` (strict flags including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), `.gitignore`, `.nvmrc`, `.npmrc`, `.editorconfig`, `README.md` stub
- [ ] Copy the four spec docs from current location to `vendoora/docs/`
- [ ] Copy `Vendoora_App.html` and `Vendoora_Design_Tokens.html` to `vendoora/docs/prototype/`
- [ ] Copy this design doc to `vendoora/docs/superpowers/specs/`
- [ ] Create `vendoora/docs/plans/` and `vendoora/docs/decisions/` and `vendoora/docs/runbooks/` (empty)
- [ ] `packages/config/` with `package.json` declaring `./eslint`, `./prettier`, `./typescript` exports
  - [ ] `packages/config/eslint/index.mjs` (flat ESLint 9 config: @eslint/js recommended + @typescript-eslint)
  - [ ] `packages/config/prettier/index.mjs` (single-quote, trailing-comma all, 100 col)
  - [ ] `packages/config/typescript/base.json` (the extendable base)
- [ ] `packages/types/` with `package.json`, `tsconfig.json`, `src/index.ts` exporting `BRAND_NAME` const + `Currency` type
- [ ] `apps/web/` Next.js 15 App Router skeleton
  - [ ] `package.json` with `next@15`, `react@19`, workspace deps on `@vendoora/config` and `@vendoora/types`
  - [ ] `next.config.mjs` with `transpilePackages: ['@vendoora/types']`
  - [ ] `tsconfig.json` extending base + Next plugin
  - [ ] `vitest.config.ts` with `vite-tsconfig-paths` plugin
  - [ ] `app/layout.tsx` (minimal `<html lang="en">` wrapper)
  - [ ] `app/page.tsx` rendering `{BRAND_NAME}` from `@vendoora/types`
  - [ ] `__tests__/cross-package-import.test.ts` (the RED-then-GREEN verification)
- [ ] Verify the loop: test fails RED for module-not-found, then passes GREEN after wiring
- [ ] Verify `pnpm -F web type-check`, `pnpm -F web lint`, `pnpm -F web build` all succeed
- [ ] Verify `pnpm build` at root runs all of the above in topological order
- [ ] One initial commit on `main` (no PR — no GitHub remote yet)

## Out of scope (what this does NOT do)

### Deferred packages (each gets its own focused plan)
- `packages/design-tokens` — CSS variables from `Vendoora_Design_Tokens.html` + RN exports
- `packages/ui` — shadcn/ui base customized to Vendoora design
- `packages/schemas` — Zod schemas
- `packages/domain` — escrow state machine, dispute rules, permissions, fx, kyc, fraud, trust-score
- `packages/api-client` — tRPC client + React Query hooks
- `packages/i18n` — English strings + currency/date/number helpers
- `packages/db` — Prisma schema + migrations + seed (covers all 10 domains including the 6 new May-2026 ones; deserves a dedicated plan)

### Deferred app
- `apps/worker` — BullMQ background processor; lands after `packages/db` exists

### Deferred infrastructure (Phase 1.3.2 territory)
- GitHub remote + branch protection rules + 10-stage CI/CD GitHub Actions (Build_Prompt §7.5)
- Doppler integration for secrets
- Vercel / Neon / Upstash / Clerk / Sentry / Better Stack / PostHog / Resend / Africa's Talking account wiring
- Husky + lint-staged pre-commit hooks
- PR template (`.github/PULL_REQUEST_TEMPLATE.md`)

### Deferred tooling
- Tailwind v4 root config — no UI rendering yet
- shadcn/ui — depends on Tailwind
- Storybook + Chromatic — sit on `packages/ui`
- Sentry / Better Stack / PostHog SDKs — Phase 1.3.7
- React Native / Expo — v2 mobile, not in MVP

## Files to be created

Root (`C:\Users\Anthony\Documents\vendoora\`):
- `.gitignore` — node_modules, .turbo, .next, .env*, dist, coverage, *.log
- `.nvmrc` — `22`
- `.npmrc` — `node-linker=isolated`, `strict-peer-dependencies=false` (workspace-internal peer deps satisfied by consumers, not root; see plan)
- `.editorconfig` — 2-space indent, LF endings, UTF-8
- `README.md` — stub with setup instructions
- `package.json` — root with workspaces, scripts, Volta pin
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`

`docs/` (copied or created):
- Four spec docs copied from current dir
- `prototype/Vendoora_App.html`, `prototype/Vendoora_Design_Tokens.html` copied
- `superpowers/specs/2026-05-26-monorepo-walking-skeleton-design.md` (this file)
- `plans/`, `decisions/`, `runbooks/` (empty dirs with `.gitkeep`)

`packages/config/`:
- `package.json`
- `eslint/index.mjs`
- `prettier/index.mjs`
- `typescript/base.json`

`packages/types/`:
- `package.json`
- `tsconfig.json`
- `src/index.ts`

`apps/web/`:
- `package.json`
- `tsconfig.json`
- `next.config.mjs`
- `vitest.config.ts`
- `next-env.d.ts` (auto-generated by Next on first build — not authored by hand)
- `app/layout.tsx`
- `app/page.tsx`
- `__tests__/cross-package-import.test.ts`

**File count:** ~25 files authored + 6 files copied (4 specs + 2 prototype HTMLs). `next-env.d.ts` is generated, not authored.

## Files to be modified

None — this is a greenfield scaffold.

## Database changes

None — `packages/db` is out of scope for this plan.

## Test cases

Unit (Vitest, in `apps/web/__tests__/cross-package-import.test.ts`):
- [ ] `BRAND_NAME` runtime value resolves from `@vendoora/types` and equals `'Vendoora'`
- [ ] `Currency` type resolves from `@vendoora/types` and accepts `'USD'` and `'LRD'` only (verified via `satisfies`)

Integration tests: none in this plan (no API surface yet).
E2E tests: none in this plan (no user flow yet).

Pipeline verification (manual steps, captured in the plan's verification section):
- [ ] `pnpm -F web test` passes (the Vitest test)
- [ ] `pnpm -F web type-check` passes (tsc reports zero errors)
- [ ] `pnpm -F web lint` passes (ESLint reports zero errors)
- [ ] `pnpm -F web build` passes (`next build` succeeds, proves transpilePackages works)
- [ ] `pnpm build` at root passes (Turborepo runs all of the above in topological order)
- [ ] False-positive sanity check: temporarily mutate `BRAND_NAME` to `'NotVendoora'` and confirm the test fails, then revert

## Permission/security implications

None — no auth, no API, no user input, no secrets in this plan.

## Risks

1. **Volta not installed on user's machine.** Plan first step is `volta --version` check; if absent, the plan halts with installation instructions rather than guessing.
2. **Node 25 / pnpm 11 already on PATH.** Volta intercepts and uses the pinned versions once installed, but if the user runs commands outside the project dir Volta won't engage. The plan documents this and adds the `.nvmrc` as a safety net for editors that honor it (VS Code, JetBrains).
3. **First commit has no PR.** GitHub remote doesn't exist yet. Build_Prompt §7.5 mandates PR-required `main`. This is the only "no-PR" commit in project history. A follow-up plan will add the remote and turn on branch protection. Documenting the exception as `docs/decisions/2026-05-26-first-commit-no-pr.md` ADR in the same commit so the audit trail is intact.
4. **Build_Prompt §4.5 "No code without a test."** For config files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`), there's no meaningful per-file test. The Vitest cross-package-import test is the integration test for the *effect* of those configs. Plan documents this interpretation in the testing section.
5. **`pnpm install` first run is slow on Windows.** Cold install of Next.js 15 + React 19 + Vitest + Turborepo touches ~600MB of `node_modules` on first run. Plan timeouts set accordingly.
6. **Spec docs are in folders with spaces in path.** The `cp -r` step has to quote correctly. Plan uses absolute paths with quoting throughout.

## Dependencies

External:
- Volta — installed during plan execution if absent
- Node 22.12.0 LTS — installed via Volta
- pnpm 9.15.0 — installed via Volta
- git ≥ 2.40 — already present (2.53)

npm packages (installed during plan execution):
- Root devDependencies: `turbo@^2.3.0`, `typescript@^5.6.0`, `@types/node@^22`
- `packages/config`:
  - `eslint@^9`, `@eslint/js@^9`, `typescript-eslint@^8`
  - `prettier@^3.4`
- `packages/types`: no deps beyond TS
- `apps/web`:
  - `next@^15`, `react@^19`, `react-dom@^19`
  - dev: `vitest@^2`, `@vitejs/plugin-react@^4`, `vite-tsconfig-paths@^5`, `@types/react@^19`, `@types/react-dom@^19`

## Verification (the Red-Green-Refactor loop, explicitly)

1. **RED-1**: Create `apps/web/__tests__/cross-package-import.test.ts` and `apps/web/package.json` (with Vitest dev dep) and `apps/web/vitest.config.ts`. Do NOT create `packages/types` yet. Run `pnpm install` then `pnpm -F web test`. **Expected:** module-not-found error for `@vendoora/types` (right reason for failure — not a syntax or runner config issue).
2. **GREEN-1a**: Create `packages/types/package.json`, `packages/types/tsconfig.json`, `packages/types/src/index.ts` with `BRAND_NAME` and `Currency`. Run `pnpm install` (creates workspace symlink). Re-run `pnpm -F web test`. **Expected:** test passes.
3. **Sanity check**: Mutate `BRAND_NAME` to `'NotVendoora'`. Re-run. **Expected:** first assertion fails with a specific value mismatch. Revert.
4. **REFACTOR**: No refactor warranted at this surface size; the test, types, and consumer are minimal. Decision logged in commit message.
5. **Final pipeline run**: `pnpm build` at root must succeed. This is the Playbook P1.3.1 exit gate condition.

## Acceptance criteria (the plan is done when…)

- [ ] `cd C:\Users\Anthony\Documents\vendoora && pnpm install` completes without errors
- [ ] `pnpm build` at root succeeds (Turborepo runs all tasks topologically)
- [ ] `pnpm -F web test` passes (the cross-package-import test)
- [ ] `pnpm -F web build` produces a valid `.next/` output
- [ ] `git log --oneline` shows exactly one commit with a clear conventional-commit message
- [ ] The four spec docs + two prototype HTMLs are present under `vendoora/docs/`
- [ ] This design doc is present under `vendoora/docs/superpowers/specs/`
- [ ] `docs/decisions/2026-05-26-first-commit-no-pr.md` ADR is committed alongside
- [ ] `pnpm -F web type-check` and `pnpm -F web lint` both pass
- [ ] No `apps/worker` or other packages exist yet (they're explicitly deferred)
