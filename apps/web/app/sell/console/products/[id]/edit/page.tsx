import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getSellerSession } from '../../../../../../lib/seller-auth';
import { IS_R2_ENABLED } from '../../../../../../lib/r2';
import { updateProduct } from '../../../../../actions/seller-products';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Edit product — ${BRAND_NAME}`,
};

const ERROR_COPY: Record<string, string> = {
  name_required: 'Product name is required (3–200 characters).',
  description_required: 'Add a description (at least 20 characters).',
  price_invalid: 'Base price must be greater than zero.',
  slug_in_use: 'You already have another product with that slug. Pick another.',
  bad_slug: 'Slug must be lowercase letters, digits, and hyphens (e.g. country-rice-25kg).',
  bad_category: 'Pick a valid category.',
  bad_condition: 'Pick a valid condition.',
  bad_mime: 'Only JPEG, PNG, or WebP images are accepted.',
  too_large: 'Image is larger than 5 MB.',
  r2_not_configured: 'Image upload is not configured in this environment.',
  not_owner: 'That listing belongs to another seller.',
  not_editable: 'Only rejected or pending listings can be edited and resubmitted.',
  not_found: 'That listing could not be found.',
};

const CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'LIKE_NEW', label: 'Like new' },
  { value: 'USED_GOOD', label: 'Used — good' },
  { value: 'USED_FAIR', label: 'Used — fair' },
  { value: 'REFURBISHED', label: 'Refurbished' },
  { value: 'FOR_PARTS', label: 'For parts' },
] as const;

const EDITABLE = new Set(['REJECTED', 'PENDING']);

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function EditProductPage({ params, searchParams }: PageProps) {
  const session = await getSellerSession();
  if (!session) redirect('/sell/sign-in');

  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      seller_id: true,
      name: true,
      slug: true,
      short_description: true,
      description: true,
      category_id: true,
      condition: true,
      base_price: true,
      compare_at_price: true,
      moderation_status: true,
    },
  });

  // Ownership + editable-state gate. Anything the seller can't legitimately edit
  // bounces back to the console rather than rendering a form that would be
  // refused on submit.
  if (!product || product.seller_id !== session.sellerId) {
    redirect('/sell/console');
  }
  if (!EDITABLE.has(product.moderation_status)) {
    redirect('/sell/console');
  }

  const categories = await prisma.category.findMany({
    where: { is_active: true },
    orderBy: { display_order: 'asc' },
    select: { id: true, name: true },
  });

  const sp = await searchParams;
  const errorCopy = sp.error ? ERROR_COPY[sp.error] ?? 'Could not save the product.' : null;

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/sell/console" className="text-xs font-semibold text-blue-700 hover:underline">
          ← Console
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-neutral-900">Edit &amp; resubmit</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Currently <strong>{product.moderation_status}</strong>. Saving resubmits the listing for
          T&amp;S moderation (status returns to <strong>PENDING</strong>).
        </p>

        {errorCopy && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorCopy}
          </div>
        )}

        <form
          action={updateProduct}
          className="mt-6 space-y-6 rounded-xl border border-neutral-200 bg-neutral-0 p-6"
        >
          <input type="hidden" name="product_id" value={product.id} />

          <Field id="name" label="Product name" required>
            <input
              id="name"
              name="name"
              required
              minLength={3}
              maxLength={200}
              defaultValue={product.name}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>

          <Field id="slug" label="URL slug" help="Lowercase, dashes only.">
            <input
              id="slug"
              name="slug"
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              defaultValue={product.slug}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>

          <Field id="short_description" label="Short description" help="One-liner shown on cards (max 160 chars).">
            <input
              id="short_description"
              name="short_description"
              maxLength={160}
              defaultValue={product.short_description ?? ''}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>

          <Field id="description" label="Description" required>
            <textarea
              id="description"
              name="description"
              required
              minLength={20}
              rows={4}
              defaultValue={product.description}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="category_id" label="Category" required>
              <select
                id="category_id"
                name="category_id"
                required
                defaultValue={product.category_id}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="condition" label="Condition" required>
              <select
                id="condition"
                name="condition"
                defaultValue={product.condition}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="base_price" label="Price (USD)" required>
              <input
                id="base_price"
                name="base_price"
                type="number"
                required
                min={0.01}
                step={0.01}
                defaultValue={Number(product.base_price)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </Field>
            <Field id="compare_at_price" label="Compare-at price" help="Optional, e.g. for a sale.">
              <input
                id="compare_at_price"
                name="compare_at_price"
                type="number"
                min={0.01}
                step={0.01}
                defaultValue={product.compare_at_price ? Number(product.compare_at_price) : ''}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </Field>
          </div>

          <Field
            id="image"
            label="Replace primary image"
            help="Optional. JPEG / PNG / WebP, ≤ 5 MB. Leave blank to keep the current image."
          >
            <input
              id="image"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="w-full text-sm"
              disabled={!IS_R2_ENABLED}
            />
          </Field>

          <div className="flex items-center justify-between border-t border-neutral-200 pt-5">
            <Link href="/sell/console" className="text-xs font-semibold text-neutral-600 hover:text-neutral-900">
              ← Cancel
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
            >
              Save &amp; resubmit
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  required,
  help,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-widest text-neutral-600">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      <div className="mt-2">{children}</div>
      {help && <p className="mt-1 text-xs text-neutral-500">{help}</p>}
    </div>
  );
}
