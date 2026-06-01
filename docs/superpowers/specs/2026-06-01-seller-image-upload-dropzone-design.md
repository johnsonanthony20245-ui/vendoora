# Seller product image upload — click + drag-and-drop dropzone (design)

**Date:** 2026-06-01
**Status:** Approved (verbal), pending written-spec review
**Phase:** P1 Foundation (seller console polish)

## Goal

Replace the bare native `<input type="file">` on the seller **New Product** and
**Edit & resubmit** forms with a styled dropzone that supports **click-to-browse**,
**drag-and-drop**, and a **thumbnail preview** — without changing the existing
server-side upload/validation pipeline or the server-action contract.

## Background / current state

Both seller forms already upload images as files to Cloudflare R2; there is no
image-URL text field anywhere in those forms. The flow today:

- `app/sell/console/products/new/page.tsx` and
  `app/sell/console/products/[id]/edit/page.tsx` are React **Server Components**.
  Each renders a plain `<input type="file" name="image" accept="image/jpeg,image/png,image/webp">`
  inside a `<form action={createProduct | updateProduct}>`.
- The server actions in `app/actions/seller-products.ts` read `formData.get('image')`
  as a `File`, validate the **claimed** MIME against `ALLOWED_IMAGE_MIME` and size
  against `MAX_IMAGE_BYTES` (5 MB), upload to R2 (`uploadObject`), then write the
  `Product` + `ProductImage` rows. `ProductImage.url` stores the **R2 object key**
  (not a URL); `resolveProductImageUrl` presigns it for rendering. This stored key
  is what was mistaken for an "image URL."

The native input is functionally click-to-pick but is unstyled, has no
drag-and-drop, and shows no preview. This is purely a UX upgrade.

## Architecture

One new client component + one new pure lib module, plus a one-line input swap in
each of the two server-component forms and a constants-import swap in the action.
**Server actions keep their exact behavior and FormData contract** (`image` is still
a `File` field). The client check is UX-only; the server remains authoritative.

### New file — `apps/web/lib/product-image-upload.ts`

DOM-free, `next/*`-free, so it is unit-testable under the existing node-env Vitest
with no new dependencies. Single source of truth for the upload rules, shared by the
client component (instant feedback) and the server action (enforcement).

```ts
export const ALLOWED_PRODUCT_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ProductImageRejectReason = 'empty' | 'bad_mime' | 'too_large';

/**
 * Validate the primitives a browser File exposes (type + size). Pure and
 * DOM-free so it runs identically in the client component and in tests.
 */
export function validateProductImageFile(
  file: { type: string; size: number },
):
  | { ok: true }
  | { ok: false; reason: ProductImageRejectReason };
```

Rules: `size === 0` → `empty`; type not in `ALLOWED_PRODUCT_IMAGE_MIME` → `bad_mime`;
`size > MAX_PRODUCT_IMAGE_BYTES` → `too_large`; otherwise `{ ok: true }`. Check order:
empty → bad_mime → too_large.

### New file — `apps/web/components/ImageUpload.tsx`

`'use client'` component. Thin DOM glue around a **real** `<input type="file">` that
still participates in `FormData`, so the server action contract is untouched.

Props:

```ts
interface ImageUploadProps {
  name: string;          // form field name, e.g. "image"
  required?: boolean;    // create=true, edit=false
  disabled?: boolean;    // passed !IS_R2_ENABLED
  helpText?: string;     // small caption under the dropzone
}
```

Behavior:

- Renders a dashed-border dropzone matching the existing form design system
  (`border-2 border-dashed border-neutral-300`, hover/drag-over →
  `border-blue-500 bg-blue-50`), with a centered prompt:
  "Click to upload or drag and drop · JPEG, PNG, WebP up to 5 MB".
- Holds a real `<input ref type="file" name={name} accept="image/jpeg,image/png,image/webp">`
  that is **visually clipped** (an `sr-only`-style class — `absolute`, size 0,
  clipped), **not** `display:none`, so native `required` constraint validation
  still fires on submit when empty. (Browsers skip validation for `display:none`
  inputs.)
- Click anywhere on the dropzone → `inputRef.current.click()`.
- Drag events (`dragenter`/`dragover`/`dragleave`/`drop`) toggle a highlighted
  state; `preventDefault` on dragover/drop. On drop, take `e.dataTransfer.files[0]`,
  validate it, and on success assign it to the input via a fresh `DataTransfer`
  (`inputRef.current.files = dt.files`) so it submits like a normal pick.
- On `change` (click path) or successful drop: validate via
  `validateProductImageFile({ type, size })`. Invalid → inline red error message,
  clear the input, no preview. Valid → set a preview thumbnail
  (`URL.createObjectURL(file)`) shown with the file name + human-readable size and a
  **Remove** button.
- **Remove** clears the input value and selected state and revokes the object URL.
  The object URL is also revoked on unmount and whenever it is replaced, to avoid
  leaks.
- `disabled` greys out the dropzone, blocks click/drop, and disables the input.

### Modified — the two form pages

In each form, replace the existing `<input type="file" ...>` inside its `Field`
wrapper with `<ImageUpload .../>`:

- `new/page.tsx`: `<ImageUpload name="image" required disabled={!IS_R2_ENABLED} helpText="JPEG / PNG / WebP, ≤ 5 MB. Uploaded to Cloudflare R2 and shown on the public PDP." />`
- `[id]/edit/page.tsx`: `<ImageUpload name="image" disabled={!IS_R2_ENABLED} helpText="Optional. JPEG / PNG / WebP, ≤ 5 MB. Leave blank to keep the current image." />`
  (not `required` — image replacement is optional on edit).

The surrounding `Field` label, the `<form action={...}>`, the field name `image`,
and every other field are unchanged.

### Modified — `apps/web/app/actions/seller-products.ts`

Swap the two inline constants for imports so the client preview and the server
enforcement share one source of truth:

- Remove the local `ALLOWED_IMAGE_MIME` / `MAX_IMAGE_BYTES` definitions.
- `import { ALLOWED_PRODUCT_IMAGE_MIME, MAX_PRODUCT_IMAGE_BYTES } from '../../lib/product-image-upload';`
  and reference those in the existing inline checks.

The server's validation logic and its redirect error codes
(`missing_image` / `bad_mime` / `too_large` / `r2_not_configured`) are **unchanged**.
This is a behavior-identical, ~2-line-per-action import swap.

## Data flow

1. Seller picks/drops a file → dropzone validates for instant feedback and shows a
   preview; the real input now carries the `File`.
2. Form submits → the existing server action re-reads `formData.get('image')` and
   re-validates (authoritative) against the **shared** constants.
3. Action uploads to R2 and writes the DB rows exactly as today.

The client validation never uploads on its own and is not trusted server-side.

## Error handling

- **Client:** invalid file → inline red error, input cleared, no preview; never
  uploads. Drag-over visual state. Object URLs revoked on remove/replace/unmount.
- **Server:** unchanged authoritative checks remain the backstop — they cover
  JS-disabled browsers and forged/non-browser clients
  (`missing_image` / `bad_mime` / `too_large` / `r2_not_configured`).
- **Progressive enhancement:** with JS off, the clipped real input still works as a
  plain file picker, so the form still submits — no regression.

## Testing

- **TDD target (red → green):** `validateProductImageFile` in
  `apps/web/__tests__/product-image-upload.test.ts`. Cases:
  - `image/jpeg`, `image/png`, `image/webp` at 1 KB and at exactly 5 MB → `{ ok: true }`.
  - `image/gif`, `application/pdf`, `image/svg+xml` → `{ ok: false, reason: 'bad_mime' }`.
  - valid MIME at `MAX_PRODUCT_IMAGE_BYTES + 1` → `{ ok: false, reason: 'too_large' }`.
  - `size: 0` → `{ ok: false, reason: 'empty' }`.
  - assert `MAX_PRODUCT_IMAGE_BYTES === 5 * 1024 * 1024` and the allowed-MIME set
    contents (guards the client/server shared contract).
  Write the test first, run it RED (function not implemented), implement, run GREEN.
- **Full pipeline:** `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`. The
  build compiles the client component, catching `'use client'` / JSX issues.
- The component's drag-drop DOM glue is verified by build + manual exercise; a
  jsdom / @testing-library/react harness is intentionally **out of scope** (see below).

## Visual fidelity

Matches the existing seller-form design system (the `Field` wrapper, `rounded-lg`/`xl`,
`border-neutral-300`, `focus:ring-blue-200`, blue-700 primary button). The seller
console is beyond the buyer-facing prototype's scope, so there is no prototype screen
to mirror; the dropzone follows the established in-app form styling for consistency.

## Out of scope (YAGNI)

- Multiple-image gallery / ordering (single primary image stays the contract).
- Crop / rotate / client-side compression.
- An image-URL paste field (sellers upload from their device; a URL field would
  invite hotlinking arbitrary external images — a moderation/security concern).
- Magic-byte (content-sniff) verification for **product** images. KYC has it
  (`lib/file-magic.ts`); products currently validate claimed MIME + size only.
  Adding content-sniffing here is a separate security hardening follow-up, not part
  of this UX change.
- A React component test harness (jsdom + @testing-library/react + react plugin).
  Adding it for one component expands the toolchain and CI; deferred.
- Any change to the KYC uploader (different surface, PII rules).
