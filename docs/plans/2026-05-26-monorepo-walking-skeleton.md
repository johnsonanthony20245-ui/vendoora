# Vendoora Monorepo Walking-Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a minimal Vendoora monorepo that proves cross-package import works end-to-end via a Vitest test that fails RED then passes GREEN.

**Architecture:** Hand-rolled Turborepo 2.x + pnpm 9 workspace per Engineering_Spec §2.1. Root configs + `packages/config` (shared TS/ESLint/Prettier via subpath exports) + `packages/types` (one value, one type) + `apps/web` (Next.js 15 minimal page + Vitest test). Node 22 LTS + pnpm 9 pinned via Volta and root `package.json` fields.

**Tech Stack:** Node 22.12.0 LTS, pnpm 9.15.0, Turborepo 2.x, TypeScript 5.6, Next.js 15, React 19, Vitest 2, ESLint 9 (flat config), Prettier 3.

---

**Date:** 2026-05-26
**Estimated complexity:** M
**Phase:** P1 Foundation (Playbook §3.1.1, partial — walking-skeleton subset)
**Estimated session time:** 2-3 hours

## Problem

The Vendoora repository does not exist yet. P1 Foundation cannot begin until a monorepo skeleton is in place. The full P1.3.1 checklist names ~12 deliverables; doing them in one plan exceeds Build_Prompt §3.3's 400-line cap. This plan implements only the *smallest* scaffold that proves cross-package imports work, leaving every other P1.3.1 item to its own focused plan.

## Approach

See [design doc](../superpowers/specs/2026-05-26-monorepo-walking-skeleton-design.md) for the design rationale. In short: hand-roll the layout per Engineering_Spec §2.1 (no `create-turbo` template churn), wire `apps/web` to import a constant + type from `packages/types` via the workspace protocol + tsconfig path mapping + Next's `transpilePackages` + Vitest's `vite-tsconfig-paths` plugin. A Vitest test asserts both the runtime value and (via `satisfies`) the type, failing RED for module-not-found before `packages/types` exists, passing GREEN after.

## Scope (what this DOES)

- [ ] Create monorepo root at `C:\Users\Anthony\Documents\vendoora\`
- [ ] Pin Node 22.12.0 + pnpm 9.15.0 via Volta + root `package.json`
- [ ] Root files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`, `.npmrc`, `.editorconfig`, `README.md`
- [ ] `packages/config` with subpath exports for eslint, prettier, typescript
- [ ] `packages/types` with one const (`BRAND_NAME`) and one type (`Currency`)
- [ ] `apps/web` Next.js 15 skeleton + Vitest test
- [ ] Copy four spec docs + two prototype HTMLs + this plan's design doc into `vendoora/docs/`
- [ ] ADR documenting the one-time "first commit on main without PR" exception
- [ ] Single initial commit on local `main`

## Out of scope (what this does NOT do)

Each item below gets its own focused plan after this one lands:

- `packages/{design-tokens, ui, schemas, domain, api-client, i18n, db}` — each a separate plan
- `apps/worker` — separate plan after `packages/db` exists
- GitHub remote + branch protection + 10-stage CI/CD pipeline (Build_Prompt §7.5)
- Doppler / Vercel / Neon / Upstash / Clerk / Sentry / Better Stack / PostHog / Resend account wiring
- Tailwind v4 + shadcn/ui + Storybook + Chromatic
- Husky / lint-staged / commitlint
- React Native / Expo (v2 mobile)

## Files to be created

**Root** (`C:\Users\Anthony\Documents\vendoora\`):
`.gitignore`, `.nvmrc`, `.npmrc`, `.editorconfig`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`

**`packages/config/`**:
`package.json`, `eslint/index.mjs`, `prettier/index.mjs`, `typescript/base.json`

**`packages/types/`**:
`package.json`, `tsconfig.json`, `src/index.ts`

**`apps/web/`**:
`package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.mts`, `app/layout.tsx`, `app/page.tsx`, `__tests__/cross-package-import.test.ts`

**`docs/`**:
- Copied: `Build_Prompt.md`, `Engineering_Spec.md`, `Phased_Build_Playbook.md`, `Polish_Phase_Addendum.md`, `prototype/Vendoora_App.html`, `prototype/Vendoora_Design_Tokens.html`
- Copied: `superpowers/specs/2026-05-26-monorepo-walking-skeleton-design.md`, `plans/2026-05-26-monorepo-walking-skeleton.md` (this file)
- New: `decisions/2026-05-26-first-commit-no-pr.md`
- Empty (`.gitkeep`): `runbooks/`

**Total: 25 files authored + 7 files copied.**

## Files to be modified

None — greenfield scaffold.

## Database changes

None — `packages/db` is out of scope.

## Test cases

Unit (Vitest):
- [ ] `BRAND_NAME` runtime value resolves from `@vendoora/types` and equals `'Vendoora'` — in `apps/web/__tests__/cross-package-import.test.ts`
- [ ] `Currency` type resolves from `@vendoora/types` (verified via `satisfies readonly Currency[]`) — same file

Pipeline (manual verification at the end):
- [ ] `pnpm -F web test` passes
- [ ] `pnpm -F web type-check` passes
- [ ] `pnpm -F web lint` passes
- [ ] `pnpm -F web build` passes
- [ ] `pnpm build` at root passes (Turborepo topological build)
- [ ] False-positive sanity check: mutate `BRAND_NAME` → confirm test fails → revert

## Permission/security implications

None — no auth, no API, no user input, no secrets.

## Risks

Per the design doc Risks section. Most relevant during execution:

1. **Volta install requires user-level admin** on Windows; if `volta install` fails, fall back to manual MSI install from https://github.com/volta-cli/volta/releases.
2. **First-run `pnpm install` downloads ~600MB** of Next.js + React + Vitest + Turborepo. Allow up to 5 minutes on a slow connection.
3. **Git `user.name`/`user.email` may not be set** — Task 2 step verifies and sets if absent.

## Dependencies

Pre-execution: Volta installed (Task 1). Git ≥ 2.40 (already present).

npm packages installed during execution: see Tasks 5-7 `package.json` contents.

---

## Tasks

### Task 1: Verify and install toolchain (Volta + Node + pnpm)

**Files:** none authored; verifies host tooling.

- [ ] **Step 1: Check whether Volta is already installed**

Run (Bash tool):
```bash
volta --version 2>/dev/null || echo "VOLTA_NOT_FOUND"
```
Expected: a version string (e.g., `2.0.2`) OR `VOLTA_NOT_FOUND`. If found, skip to Step 3.

- [ ] **Step 2: Install Volta (only if Step 1 reported VOLTA_NOT_FOUND)**

Run (PowerShell tool — Windows-native install):
```powershell
winget install --id Volta.Volta -e --source winget --accept-package-agreements --accept-source-agreements
```
After install, restart the shell (close + reopen the PowerShell tool session) so the `volta` shim is on PATH.

Fallback if `winget` is not available: download and run the MSI from https://github.com/volta-cli/volta/releases/latest.

Verify after install:
```bash
volta --version
```
Expected: a version string (any 2.x is fine).

- [ ] **Step 3: Install Node 22.12.0 and pnpm 9.15.0 via Volta**

```bash
volta install node@22.12.0
volta install pnpm@9.15.0
```
Expected: both commands print `success: installed and set ... as default`.

- [ ] **Step 4: Verify active versions**

```bash
node --version && pnpm --version
```
Expected output:
```
v22.12.0
9.15.0
```

If Node still reports v25 (Volta not on PATH yet), close and reopen the shell session, then retry.

- [ ] **Step 5: Configure git user identity if not set**

```bash
git config --global user.email >/dev/null 2>&1 || git config --global user.email "aj3335398@gmail.com"
git config --global user.name  >/dev/null 2>&1 || git config --global user.name  "Anthony"
git config --global init.defaultBranch main
```
Expected: no output (silent success).

---

### Task 2: Create monorepo root and initialize git

**Files:**
- Create: `C:\Users\Anthony\Documents\vendoora\` (directory)
- Create: `C:\Users\Anthony\Documents\vendoora\.git\` (via `git init`)

- [ ] **Step 1: Create the monorepo root directory**

```bash
mkdir -p "/c/Users/Anthony/Documents/vendoora"
cd "/c/Users/Anthony/Documents/vendoora"
```
Verify:
```bash
pwd
```
Expected: `/c/Users/Anthony/Documents/vendoora`

- [ ] **Step 2: Initialize git repository on `main`**

```bash
git init --initial-branch=main
```
Expected output: `Initialized empty Git repository in .../vendoora/.git/`.

Verify:
```bash
git status && git branch --show-current
```
Expected: "On branch main / No commits yet" and `main`.

---

### Task 3: Root tooling configs

**Files (all at `C:\Users\Anthony\Documents\vendoora\`):** `.gitignore`, `.nvmrc`, `.npmrc`, `.editorconfig`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`

- [ ] **Step 1: Write `.gitignore`**

Content:
```
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
.next/
.turbo/
dist/
build/
out/

# Tests
coverage/
.vitest-cache/

# Env
.env
.env.*
!.env.example

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Editor / OS
.DS_Store
Thumbs.db
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea/

# TypeScript
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 2: Write `.nvmrc`**

Content (single line):
```
22
```

- [ ] **Step 3: Write `.npmrc`**

Content:
```
node-linker=isolated
strict-peer-dependencies=false
auto-install-peers=false
```

(`strict-peer-dependencies=false` because `@vendoora/config` declares ESLint + TS as peer deps that only consumer workspaces — not the root — satisfy. Enabling strict mode causes a root `pnpm install` to error before consumers can be resolved. Revisit when the workspace is larger.)

- [ ] **Step 4: Write `.editorconfig`**

Content:
```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Write `README.md`**

Content:
```markdown
# Vendoora

Multi-vendor marketplace for Liberia and the Liberian diaspora.

## Getting started

```bash
volta install node@22.12.0
volta install pnpm@9.15.0
pnpm install
pnpm build
pnpm -F web dev
```

## Repository layout

See [docs/Engineering_Spec.md §2.1](docs/Engineering_Spec.md).

## Methodology

See [docs/Build_Prompt.md](docs/Build_Prompt.md). Every change goes through brainstorm → plan → /execute-plan → TDD → code-reviewer.
```

- [ ] **Step 6: Write root `package.json`**

Content:
```json
{
  "name": "vendoora",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.15.0",
  "volta": {
    "node": "22.12.0",
    "pnpm": "9.15.0"
  },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "dev": "turbo run dev --parallel"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.6.3"
  },
  "engines": {
    "node": ">=22.12.0",
    "pnpm": ">=9.15.0"
  }
}
```

- [ ] **Step 7: Write `pnpm-workspace.yaml`**

Content:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 8: Write `turbo.json`**

Content:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 9: Write `tsconfig.base.json`**

Content:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@vendoora/*": ["./packages/*/src"]
    }
  }
}
```

---

### Task 4: Copy spec docs, prototype HTMLs, and design doc

**Files:** all copied into `vendoora/docs/...`

- [ ] **Step 1: Create the docs directory structure**

```bash
cd "/c/Users/Anthony/Documents/vendoora"
mkdir -p docs/prototype docs/plans docs/decisions docs/runbooks docs/superpowers/specs
```

- [ ] **Step 2: Copy the four spec documents**

```bash
SRC="/c/Users/Anthony/Documents/Saas Application Pending Production/Saas Application/Marketplace/Multi Vendor Marketplace/Vendoora/Vendoora"
cp "$SRC/Engineering Trilogy For Claude/Build_Prompt.md"            docs/Build_Prompt.md
cp "$SRC/Engineering Trilogy For Claude/Engineering_Spec.md"        docs/Engineering_Spec.md
cp "$SRC/Engineering Trilogy For Claude/Phased_Build_Playbook.md"   docs/Phased_Build_Playbook.md
cp "$SRC/Engineering Trilogy For Claude/Polish_Phase_Addendum.md"   docs/Polish_Phase_Addendum.md
```

Verify:
```bash
ls -la docs/*.md
```
Expected: four files listed.

- [ ] **Step 3: Copy the canonical prototype HTMLs**

```bash
cp "$SRC/Supporting files - Claude Reference Files/Vendoora_App.html"            docs/prototype/Vendoora_App.html
cp "$SRC/Supporting files - Claude Reference Files/Vendoora_Design_Tokens.html"  docs/prototype/Vendoora_Design_Tokens.html
```

- [ ] **Step 4: Copy the design doc and this plan**

```bash
cp "$SRC/docs/superpowers/specs/2026-05-26-monorepo-walking-skeleton-design.md"  docs/superpowers/specs/
cp "$SRC/docs/plans/2026-05-26-monorepo-walking-skeleton.md"                     docs/plans/
```

- [ ] **Step 5: Add `.gitkeep` to the otherwise-empty `runbooks/` dir**

```bash
touch docs/runbooks/.gitkeep
```

---

### Task 5: `packages/config` — shared toolchain configs

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/eslint/index.mjs`
- Create: `packages/config/prettier/index.mjs`
- Create: `packages/config/typescript/base.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/config/eslint packages/config/prettier packages/config/typescript
```

- [ ] **Step 2: Write `packages/config/package.json`**

Content:
```json
{
  "name": "@vendoora/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./eslint": "./eslint/index.mjs",
    "./prettier": "./prettier/index.mjs",
    "./typescript": "./typescript/base.json"
  },
  "dependencies": {
    "@eslint/js": "^9.15.0",
    "typescript-eslint": "^8.15.0",
    "prettier": "^3.4.0"
  },
  "peerDependencies": {
    "eslint": "^9.15.0",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 3: Write `packages/config/eslint/index.mjs`**

Content:
```js
// Shared ESLint 9 flat config for the Vendoora monorepo.
// Consumers import this from `@vendoora/config/eslint` and re-export.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Build_Prompt §9.4: No `any`, no non-null assertions, no unsafe assertions.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/.turbo/**', '**/dist/**', '**/coverage/**'],
  },
);
```

- [ ] **Step 4: Write `packages/config/prettier/index.mjs`**

Content:
```js
/** Shared Prettier config for the Vendoora monorepo. */
export default {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  arrowParens: 'always',
  endOfLine: 'lf',
};
```

- [ ] **Step 5: Write `packages/config/typescript/base.json`**

Content (a thin pass-through to the root base; lets consumers `"extends": "@vendoora/config/typescript"`):
```json
{
  "extends": "../../../tsconfig.base.json"
}
```

---

### Task 6: `apps/web` scaffold + failing Vitest test (RED phase)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/vitest.config.mts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/__tests__/cross-package-import.test.ts`

This task lands the consumer side before `packages/types` exists. The test MUST fail in Step 9 — this is the RED phase. **Do not skip the failure verification.**

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/web/app apps/web/__tests__
```

- [ ] **Step 2: Write `apps/web/package.json`**

Note: `@vendoora/types` is **NOT** in `dependencies` yet — it's added in Task 7 Step 3 after the package exists. This keeps `pnpm install` from failing during RED.

Content:
```json
{
  "name": "@vendoora/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.0.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vendoora/config": "workspace:*",
    "@types/node": "^22.9.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.15.0",
    "eslint-config-next": "^15.0.3",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5",
    "vite-tsconfig-paths": "^5.1.3"
  }
}
```

- [ ] **Step 3: Write `apps/web/tsconfig.json`**

Content:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "noEmit": true,
    "incremental": true,
    "allowJs": false
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `apps/web/next.config.mjs`**

Content:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vendoora/types'],
};

export default nextConfig;
```

- [ ] **Step 5: Write `apps/web/vitest.config.mts`**

Content:
```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['../../tsconfig.base.json'] })],
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Write `apps/web/app/layout.tsx`**

Content:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Write `apps/web/app/page.tsx`**

Note: this imports from `@vendoora/types` which does not exist yet. `next build` will fail until Task 7 completes — that's expected. This task ends after the Vitest RED check; the full pipeline runs in Task 7.

Content:
```tsx
import { BRAND_NAME } from '@vendoora/types';

export default function Page() {
  return (
    <main>
      <h1>{BRAND_NAME}</h1>
    </main>
  );
}
```

- [ ] **Step 8: Write `apps/web/__tests__/cross-package-import.test.ts` — the RED test**

Content:
```ts
import { describe, expect, it } from 'vitest';
import { BRAND_NAME, type Currency } from '@vendoora/types';

describe('cross-package wiring: @vendoora/types', () => {
  it('resolves the runtime value from @vendoora/types', () => {
    expect(BRAND_NAME).toBe('Vendoora');
  });

  it('resolves the type from @vendoora/types', () => {
    const supported = ['USD', 'LRD'] as const satisfies readonly Currency[];
    expect(supported).toHaveLength(2);
  });
});
```

- [ ] **Step 9: Run `pnpm install` — expect partial success (workspace symlinks created, but no `@vendoora/types` resolution yet)**

```bash
cd "/c/Users/Anthony/Documents/vendoora"
pnpm install
```
Expected: pnpm completes without error (it doesn't resolve `@vendoora/types` because nothing depends on it yet). May print a peer-dep warning for `@vendoora/config` — that's fine.

- [ ] **Step 10: Run the test — confirm RED for the right reason**

```bash
pnpm -F @vendoora/web test
```
Expected: Vitest fails with an error containing `Failed to resolve import "@vendoora/types"` or `Cannot find module '@vendoora/types'`. **This is the correct RED failure mode** — the consumer can't find the symbol because the package doesn't exist yet.

If the test fails for any OTHER reason (syntax error, runner config error, etc.), stop and fix the cause before proceeding.

---

### Task 7: `packages/types` — minimal exports (GREEN phase)

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`
- Modify: `apps/web/package.json` (add `@vendoora/types` to dependencies)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/types/src
```

- [ ] **Step 2: Write `packages/types/package.json`**

Content:
```json
{
  "name": "@vendoora/types",
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
    "type-check": "tsc --noEmit",
    "lint": "echo \"no lint configured yet\" && exit 0",
    "test": "echo \"no tests yet\" && exit 0",
    "build": "echo \"no build step (library is just source)\" && exit 0"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 3: Modify `apps/web/package.json` — add `@vendoora/types` dependency**

Using Edit:
- old_string:
```
  "dependencies": {
    "next": "^15.0.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```
- new_string:
```
  "dependencies": {
    "@vendoora/types": "workspace:*",
    "next": "^15.0.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```

- [ ] **Step 4: Write `packages/types/tsconfig.json`**

Content:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

(No `outDir`/`rootDir` — `noEmit: true` means tsc never writes files. The library ships as TypeScript source via `package.json` `main: ./src/index.ts`; consumers transpile it.)

- [ ] **Step 5: Write `packages/types/src/index.ts`**

Content:
```ts
/**
 * Vendoora — shared types package.
 *
 * Walking-skeleton scope: one runtime value + one type to prove the
 * cross-package import loop works end-to-end. Real domain types land
 * in later focused plans.
 */
export const BRAND_NAME = 'Vendoora' as const;

/** ISO 4217 currency codes Vendoora supports. */
export type Currency = 'USD' | 'LRD';
```

- [ ] **Step 6: Re-run `pnpm install` so pnpm creates the `@vendoora/types` symlink in `apps/web/node_modules`**

```bash
pnpm install
```
Expected: pnpm prints something like `+ @vendoora/types 0.0.0 <- ../../packages/types` for the `apps/web` workspace.

- [ ] **Step 7: Run the test — confirm GREEN**

```bash
pnpm -F @vendoora/web test
```
Expected: both tests pass. Output contains `Test Files  1 passed` and `Tests  2 passed`.

- [ ] **Step 8: Sanity check — confirm the test would have failed for a real reason**

Use Edit to temporarily change `packages/types/src/index.ts`:
- old_string: `export const BRAND_NAME = 'Vendoora' as const;`
- new_string: `export const BRAND_NAME = 'NotVendoora' as const;`

Re-run:
```bash
pnpm -F @vendoora/web test
```
Expected: the first test fails with `expected 'NotVendoora' to be 'Vendoora'`.

Revert via Edit:
- old_string: `export const BRAND_NAME = 'NotVendoora' as const;`
- new_string: `export const BRAND_NAME = 'Vendoora' as const;`

Re-run to confirm GREEN restored:
```bash
pnpm -F @vendoora/web test
```
Expected: both tests pass.

- [ ] **Step 9: Run the full apps/web pipeline**

```bash
pnpm -F @vendoora/web type-check
pnpm -F @vendoora/web lint
pnpm -F @vendoora/web build
```
Expected: all three succeed.
- `type-check`: `tsc --noEmit` reports zero errors.
- `lint`: ESLint reports zero errors. (If `eslint .` complains about missing flat-config, this means `apps/web/eslint.config.mjs` is needed — see note at end of this step.)
- `build`: `next build` finishes with route listing including `/` and `.next/` directory present.

**Eslint config note:** if Step 9 lint fails because `apps/web/eslint.config.mjs` doesn't exist, create it with this content and re-run:
```js
import config from '@vendoora/config/eslint';
import next from 'eslint-config-next';
export default [...config, ...next];
```
Add this file to the Files-to-create list in the commit.

- [ ] **Step 10: Run the root Turborepo build — Playbook P1.3.1 exit gate**

```bash
cd "/c/Users/Anthony/Documents/vendoora"
pnpm build
```
Expected: Turborepo runs all workspace `build` tasks topologically and finishes with `Tasks: 3 successful, 3 total` (or similar — exact count depends on which packages declare a `build` script).

---

### Task 8: ADR + initial commit

**Files:**
- Create: `docs/decisions/2026-05-26-first-commit-no-pr.md`

- [ ] **Step 1: Write the ADR for the first-commit-no-PR exception**

Content:
```markdown
# ADR: First commit lands directly on `main` without a PR

**Date:** 2026-05-26
**Status:** Accepted
**Deciders:** Founder (Anthony)

## Context

Build_Prompt §7.5 mandates that all changes to `main` go through a pull request with the 10-stage CI/CD pipeline. At the moment of the very first commit of the project, no GitHub remote exists, no `.github/workflows/` directory has been authored, and there is no `main` on a remote against which to open a PR.

## Decision

The very first commit lands directly on local `main`. The PR-required rule activates as soon as the GitHub remote is configured and branch protection is enabled (planned in a near-term follow-up plan that adds `.github/workflows/` and remote setup).

## Consequences

**Positive:**
- The project starts. The scaffold can be reviewed in its entirety at the GitHub remote setup time.
- The audit trail is complete: this ADR is committed alongside the scaffold, so future readers see exactly what was bypassed and why.

**Negative:**
- One commit in project history did not pass the 10-stage pipeline. That commit's diff is auditable post-hoc by anyone reviewing the initial scaffold.

**Neutral:**
- Local pre-commit hooks, branch protection rules, and CI/CD all activate at the GitHub remote setup step. No further commits should bypass these gates.

## Alternatives Considered

- **Configure GitHub remote first, then commit empty scaffold via PR.** Rejected: requires GitHub repo creation + secrets + Actions setup *before* a single line of code exists locally. Doubles the bootstrap surface and creates a chicken-and-egg with secrets management.
- **Squash this scaffold into the first PR-gated commit later.** Rejected: rewrites git history; loses the discrete record of the bootstrap step.
```

- [ ] **Step 2: Stage everything and commit**

```bash
cd "/c/Users/Anthony/Documents/vendoora"
git add -A
git status
```

Verify `git status` shows ~30+ new files staged, including the four spec docs, the configs, the packages, the apps/web tree, the ADR, and this plan.

```bash
git commit -m "$(cat <<'EOF'
feat(scaffold): initial Vendoora monorepo walking skeleton

Bootstraps Turborepo + pnpm workspace per Engineering_Spec §2.1 with the
smallest scaffold that proves cross-package imports work end-to-end.

Contents:
- Root: package.json (Volta-pinned Node 22.12 + pnpm 9.15), pnpm-workspace.yaml,
  turbo.json (Turborepo 2.x tasks), tsconfig.base.json with strict + paths.
- packages/config: shared TS/ESLint/Prettier configs via subpath exports.
- packages/types: BRAND_NAME const + Currency type (walking-skeleton scope).
- apps/web: Next.js 15 minimal page + Vitest test that proves
  @vendoora/types resolves via workspace protocol + tsconfig paths +
  Next transpilePackages.
- docs/: copied spec trilogy + Polish addendum + prototype HTMLs + design
  doc + this plan + ADR for the no-PR first commit exception.

Verification:
- pnpm -F @vendoora/web test          (2 passed)
- pnpm -F @vendoora/web type-check    (zero errors)
- pnpm -F @vendoora/web lint          (zero errors)
- pnpm -F @vendoora/web build         (next build succeeds)
- pnpm build                          (root Turborepo topological build)
- False-positive sanity: mutated BRAND_NAME, confirmed failure, reverted.

Methodology gates (Build_Prompt §1.3):
- Brainstorm: docs/superpowers/specs/2026-05-26-monorepo-walking-skeleton-design.md
- Plan:       docs/plans/2026-05-26-monorepo-walking-skeleton.md
- ADR:        docs/decisions/2026-05-26-first-commit-no-pr.md

Phase: P1 Foundation (Playbook §3.1.1, walking-skeleton subset).
Each deferred package and the GitHub remote setup get focused follow-up plans.
EOF
)"
```

Expected: commit succeeds. `git log --oneline` shows one commit.

Verify:
```bash
git log --stat | head -50
```
Expected: ~30+ files in the commit including the four spec docs, packages, apps/web, and ADR.

---

## Acceptance criteria (Playbook P1.3.1 partial exit gate)

The plan is done when ALL of these are true:

- [ ] `cd C:\Users\Anthony\Documents\vendoora && pnpm install` completes without errors
- [ ] `pnpm build` at root succeeds
- [ ] `pnpm -F @vendoora/web test` passes (2 tests)
- [ ] `pnpm -F @vendoora/web type-check` reports zero errors
- [ ] `pnpm -F @vendoora/web lint` reports zero errors
- [ ] `pnpm -F @vendoora/web build` produces a valid `.next/` output
- [ ] `git log --oneline` shows exactly one commit
- [ ] `git status` is clean (no uncommitted changes)
- [ ] Four spec docs + 2 prototype HTMLs + the design doc + this plan + the ADR are all present under `docs/`
- [ ] No `apps/worker` or other packages exist (deferred items not started)
- [ ] Node version reported by `node --version` is `v22.12.0` (Volta pinning works)
- [ ] pnpm version reported by `pnpm --version` is `9.15.0`

## Next steps (out of scope for this plan)

Follow-up plans, in suggested order:

1. **GitHub remote + branch protection + 10-stage CI/CD** — enables Build_Prompt §7.5 PR workflow
2. **`packages/design-tokens`** — extract CSS variables from `Vendoora_Design_Tokens.html`
3. **`packages/schemas`** — Zod schemas for auth, product, order, escrow, dispute, payment, kyc
4. **`packages/db`** — Prisma schema for all 10 domains (including the 6 May-2026 ones)
5. **`packages/domain`** — pure business logic (escrow state machine first, then dispute, permissions, fx, kyc, fraud, trust-score)
6. **`apps/worker`** — BullMQ background processor scaffold
7. Remaining P1 Foundation items: Clerk auth (P1.3.4), RBAC seeds (P1.3.5), Tailwind + shadcn/ui in `packages/ui` (P1.3.6), observability SDKs (P1.3.7), i18n scaffolding (P1.3.8), marketing-page stubs (P1.3.9)
