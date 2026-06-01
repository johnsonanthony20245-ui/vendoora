# Seller Image Upload Dropzone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare `<input type="file">` on the seller New Product and Edit & Resubmit forms with a styled click + drag-and-drop dropzone that shows a thumbnail preview, without changing the server-action upload pipeline or `FormData` contract.

**Architecture:** A DOM-free validation lib (`validateProductImageFile`) is the single source of truth for image rules, shared by a new `'use client'` `ImageUpload` component (instant feedback) and the existing server action (authoritative enforcement). The component is a styled dropzone with a **transparent full-size `<input type="file">` overlay** — clicking opens the picker natively, native `required` validation still fires, and dropping a file onto the real input sets `.files` + fires `change` natively (no `DataTransfer` hack). The file still flows through `FormData` to the unchanged `createProduct`/`updateProduct` actions.

**Tech Stack:** Next.js 15 App Router, React 19 client component, TypeScript, Tailwind v4, Vitest (node env). Spec: `docs/superpowers/specs/2026-06-01-seller-image-upload-dropzone-design.md`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `apps/web/lib/product-image-upload.ts` | DOM-free shared rules: allowed MIME set, max bytes, `validateProductImageFile`. | **Create** |
| `apps/web/__tests__/product-image-upload.test.ts` | Unit tests for `validateProductImageFile` (TDD target). | **Create** |
| `apps/web/components/ImageUpload.tsx` | `'use client'` dropzone: overlay file input, drag-over highlight, preview, remove, inline error. | **Create** |
| `apps/web/app/actions/seller-products.ts` | Swap inline image constants for shared imports (behavior identical). | **Modify** |
| `apps/web/app/sell/console/products/new/page.tsx` | Use `<ImageUpload>` in the "Primary image" Field. | **Modify** |
| `apps/web/app/sell/console/products/[id]/edit/page.tsx` | Use `<ImageUpload>` in the "Replace primary image" Field. | **Modify** |

All work happens on the existing branch `feat/seller-image-upload-dropzone`.

---

## Task 1: Shared validation lib (TDD)

**Files:**
- Create: `apps/web/lib/product-image-upload.ts`
- Test: `apps/web/__tests__/product-image-upload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/product-image-upload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  validateProductImageFile,
  ALLOWED_PRODUCT_IMAGE_MIME,
  MAX_PRODUCT_IMAGE_BYTES,
} from '../lib/product-image-upload';

describe('validateProductImageFile', () => {
  it('accepts jpeg/png/webp under the size limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateProductImageFile({ type, size: 1024 })).toEqual({ ok: true });
    }
  });

  it('accepts a file at exactly the size limit', () => {
    expect(
      validateProductImageFile({ type: 'image/png', size: MAX_PRODUCT_IMAGE_BYTES }),
    ).toEqual({ ok: true });
  });

  it('rejects an empty file', () => {
    expect(validateProductImageFile({ type: 'image/png', size: 0 })).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('rejects a disallowed mime type', () => {
    for (const type of ['image/gif', 'application/pdf', 'image/svg+xml']) {
      expect(validateProductImageFile({ type, size: 2048 })).toEqual({
        ok: false,
        reason: 'bad_mime',
      });
    }
  });

  it('rejects a file over the size limit', () => {
    expect(
      validateProductImageFile({ type: 'image/jpeg', size: MAX_PRODUCT_IMAGE_BYTES + 1 }),
    ).toEqual({ ok: false, reason: 'too_large' });
  });

  it('exposes the shared limit and allowed mime set', () => {
    expect(MAX_PRODUCT_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect([...ALLOWED_PRODUCT_IMAGE_MIME].sort()).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run: `cd apps/web && pnpm exec vitest run __tests__/product-image-upload.test.ts`
Expected: FAIL — module resolution error, e.g. `Failed to load url ../lib/product-image-upload` / `Cannot find module`, because the lib does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/lib/product-image-upload.ts`:

```ts
/**
 * Shared validation rules for seller PRODUCT image uploads (create + edit).
 *
 * DOM-free and next/*-free on purpose: the client dropzone
 * (components/ImageUpload.tsx) imports validateProductImageFile for instant
 * feedback, the server action (app/actions/seller-products.ts) imports the same
 * constants for authoritative enforcement, and this file is unit-tested under the
 * node-env Vitest with no browser harness. Mirrors the KYC single-source-of-truth
 * pattern in lib/file-magic.ts.
 */

export const ALLOWED_PRODUCT_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ProductImageRejectReason = 'empty' | 'bad_mime' | 'too_large';

/**
 * Validate the primitives a browser File exposes (type + size). Pure and DOM-free
 * so it runs identically in the client component and in tests. Check order:
 * empty -> bad_mime -> too_large.
 */
export function validateProductImageFile(
  file: { type: string; size: number },
): { ok: true } | { ok: false; reason: ProductImageRejectReason } {
  if (file.size === 0) return { ok: false, reason: 'empty' };
  if (!ALLOWED_PRODUCT_IMAGE_MIME.has(file.type)) return { ok: false, reason: 'bad_mime' };
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true };
}
```

- [ ] **Step 4: Run the test to verify it passes (GREEN)**

Run: `cd apps/web && pnpm exec vitest run __tests__/product-image-upload.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/product-image-upload.ts apps/web/__tests__/product-image-upload.test.ts
git -c core.autocrlf=false commit -m "feat(seller): shared product-image validation lib (TDD)"
```

---

## Task 2: ImageUpload client component

**Files:**
- Create: `apps/web/components/ImageUpload.tsx`

No unit test: `apps/web` has no React component test harness (node-env Vitest only),
and per the spec the drag-drop DOM glue is verified by type-check + build. The
testable logic (`validateProductImageFile`) is covered in Task 1.

- [ ] **Step 1: Write the component**

Create `apps/web/components/ImageUpload.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { validateProductImageFile } from '../lib/product-image-upload';

interface ImageUploadProps {
  name: string;
  required?: boolean;
  disabled?: boolean;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

const REJECT_COPY: Record<'empty' | 'bad_mime' | 'too_large', string> = {
  empty: 'That file is empty. Pick another image.',
  bad_mime: 'Only JPEG, PNG, or WebP images are accepted.',
  too_large: 'Image is larger than 5 MB.',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Seller product image dropzone. A transparent, full-size <input type="file">
 * overlays the styled zone, so click-to-pick, native drag-drop (drop -> change),
 * and native `required` validation all work, and the File still submits through
 * the parent <form action={serverAction}> FormData unchanged. Client-side
 * validation is UX only; the server action re-validates authoritatively.
 */
export function ImageUpload({ name, required = false, disabled = false }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Revoke the object URL when it changes to a new value or on unmount.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function clearSelection() {
    if (inputRef.current) inputRef.current.value = '';
    setPreview(null);
    setFileMeta(null);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setError(null);
      clearSelection();
      return;
    }
    const result = validateProductImageFile({ type: file.type, size: file.size });
    if (!result.ok) {
      setError(REJECT_COPY[result.reason]);
      clearSelection();
      return;
    }
    setError(null);
    setPreview(URL.createObjectURL(file));
    setFileMeta({ name: file.name, size: file.size });
  }

  function onRemove() {
    setError(null);
    clearSelection();
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onDrop() {
    // The overlaid native input captures the file and fires onChange; we only
    // clear the visual highlight here.
    setDragOver(false);
  }

  const tone = disabled
    ? 'border-neutral-200 bg-neutral-50'
    : dragOver
      ? 'border-blue-500 bg-blue-50'
      : 'border-neutral-300 bg-neutral-0 hover:border-blue-400';

  return (
    <div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex min-h-[9rem] flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${tone}`}
      >
        <input
          ref={inputRef}
          id={name}
          type="file"
          name={name}
          accept={ACCEPT}
          required={required}
          disabled={disabled}
          onChange={onChange}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label="Upload product image"
        />

        {preview ? (
          <div className="pointer-events-none relative z-20 flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Selected product image preview"
              className="max-h-40 rounded-lg object-contain"
            />
            {fileMeta && (
              <p className="text-xs text-neutral-600">
                {fileMeta.name} · {formatBytes(fileMeta.size)}
              </p>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="pointer-events-auto text-xs font-semibold text-red-700 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="pointer-events-none relative z-0 flex flex-col items-center">
            <span aria-hidden className="text-2xl">
              🖼️
            </span>
            <p className="mt-2 text-sm font-medium text-neutral-700">
              Click to upload or drag and drop
            </p>
            <p className="mt-1 text-xs text-neutral-500">JPEG, PNG, or WebP up to 5 MB</p>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `cd apps/web && pnpm type-check`
Expected: no errors (exit 0).

- [ ] **Step 3: Verify lint passes**

Run: `cd apps/web && pnpm lint`
Expected: no errors (the `<img>` warning is suppressed by the inline
`eslint-disable-next-line @next/next/no-img-element`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ImageUpload.tsx
git -c core.autocrlf=false commit -m "feat(seller): ImageUpload dropzone component (click + drag-drop + preview)"
```

---

## Task 3: Wire ImageUpload into both forms + share constants

**Files:**
- Modify: `apps/web/app/actions/seller-products.ts`
- Modify: `apps/web/app/sell/console/products/new/page.tsx`
- Modify: `apps/web/app/sell/console/products/[id]/edit/page.tsx`

- [ ] **Step 1: Share the constants in the server action**

In `apps/web/app/actions/seller-products.ts`:

(a) Delete the two inline constant declarations (currently lines 15–16):

```ts
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
```

(b) Add an import directly after the existing `product-edit` import block (after line 13, before the remaining `const SLUG_RE` line):

```ts
import {
  ALLOWED_PRODUCT_IMAGE_MIME,
  MAX_PRODUCT_IMAGE_BYTES,
} from '../../lib/product-image-upload';
```

(c) Rename the four usages (in `createProduct` and `updateProduct`) via replace-all:
- `ALLOWED_IMAGE_MIME` → `ALLOWED_PRODUCT_IMAGE_MIME`
- `MAX_IMAGE_BYTES` → `MAX_PRODUCT_IMAGE_BYTES`

The validation logic and redirect error codes (`missing_image` / `bad_mime` /
`too_large` / `r2_not_configured`) are unchanged — this is a behavior-identical
constant swap.

- [ ] **Step 2: Use ImageUpload in the New Product form**

In `apps/web/app/sell/console/products/new/page.tsx`:

(a) Add the import after the existing `createProduct` import (line 8):

```ts
import { ImageUpload } from '../../../../../components/ImageUpload';
```

(b) Replace the `<input type="file" ... />` (currently lines 199–207) inside the
"Primary image" `Field` with the component, keeping the `Field` wrapper:

```tsx
          <Field
            id="image"
            label="Primary image"
            required
            help="JPEG / PNG / WebP, ≤ 5 MB. Will be uploaded to Cloudflare R2 and shown on the public PDP."
          >
            <ImageUpload name="image" required disabled={!IS_R2_ENABLED} />
          </Field>
```

- [ ] **Step 3: Use ImageUpload in the Edit & Resubmit form**

In `apps/web/app/sell/console/products/[id]/edit/page.tsx`:

(a) Add the import after the existing `updateProduct` import (line 7):

```ts
import { ImageUpload } from '../../../../../../components/ImageUpload';
```

(b) Replace the `<input type="file" ... />` (currently lines 220–227) inside the
"Replace primary image" `Field` with the component, keeping the `Field` wrapper
(no `required` — image replacement is optional on edit):

```tsx
          <Field
            id="image"
            label="Replace primary image"
            help="Optional. JPEG / PNG / WebP, ≤ 5 MB. Leave blank to keep the current image."
          >
            <ImageUpload name="image" disabled={!IS_R2_ENABLED} />
          </Field>
```

- [ ] **Step 4: Verify type-check + lint + build pass**

Run: `cd apps/web && pnpm type-check && pnpm lint && pnpm build`
Expected: all exit 0. `next build` compiles the client component and the two
forms, catching any `'use client'` / JSX / import-path issue.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/actions/seller-products.ts apps/web/app/sell/console/products/new/page.tsx "apps/web/app/sell/console/products/[id]/edit/page.tsx"
git -c core.autocrlf=false commit -m "feat(seller): wire ImageUpload dropzone into create/edit forms"
```

---

## Task 4: Full-pipeline verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the full monorepo pipeline from the repo root**

Run: `pnpm type-check && pnpm lint && pnpm test && pnpm build`
Expected: every turbo task reports success, including the web Vitest suite (now
containing `product-image-upload.test.ts`). Observe the output before proceeding.

- [ ] **Step 2: Confirm clean working tree**

Run: `git status --short`
Expected: empty (all changes committed across Tasks 1–3).

---

## Post-plan (orchestration, not a code task)

After all tasks pass: open a PR via the GitHub REST API, poll the 10-stage CI to
green, merge (verify `"merged": true` before deleting the branch), clean up local +
remote branches, then run the `/code-reviewer` subagent pass. Per repo norms: ASCII
PR title, `git -c core.autocrlf=false` for commits, token via `git credential fill`
(never committed).

---

## Self-Review

**Spec coverage:**
- Replace bare file input on both forms → Task 3 (Steps 2, 3). ✓
- New `ImageUpload` client component (overlay input, click + drag-drop, preview, remove, inline error, disabled state) → Task 2. ✓
- New DOM-free `validateProductImageFile` + shared constants → Task 1. ✓
- Server action shares constants, behavior unchanged → Task 3 (Step 1). ✓
- Server-action `FormData` contract unchanged (field name stays `image`) → Tasks 2–3 (component renders `<input name="image">`; forms keep `name="image"`). ✓
- TDD red→green on the validation lib → Task 1 (Steps 2, 4). ✓
- Full pipeline (type-check/lint/test/build) → Task 4. ✓
- Progressive enhancement / native required / `id={name}` label association → Task 2 component + Task 3 Field wrappers. ✓
- Out of scope (multi-image, crop, URL field, product magic-byte, jsdom harness, KYC) → not present in any task. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step shows an exact command + expected result. ✓

**Type consistency:** `validateProductImageFile({ type, size })` returns `{ ok: true } | { ok: false; reason: 'empty' | 'bad_mime' | 'too_large' }` — used identically in the test (Task 1), the component's `REJECT_COPY` record keys (Task 2), and matches `ProductImageRejectReason`. Constant names `ALLOWED_PRODUCT_IMAGE_MIME` / `MAX_PRODUCT_IMAGE_BYTES` are consistent across lib, test, and the action rename (Task 3). Component prop names (`name`, `required`, `disabled`) match the call sites in both forms. ✓
