import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getSellerSession } from '../../../../../lib/seller-auth';
import { getListingUsage, formatLimit, type SellerPlan } from '../../../../../lib/seller-tier';
import { IS_R2_ENABLED } from '../../../../../lib/r2';
import { createProduct } from '../../../../actions/seller-products';
import { ImageUpload } from '../../../../../components/ImageUpload';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `New product — ${BRAND_NAME}`,
};

const ERROR_COPY: Record<string, string> = {
  name_required: 'Product name is required (3–200 characters).',
  description_required: 'Add a description (at least 20 characters).',
  price_invalid: 'Base price must be greater than zero.',
  slug_in_use: 'You already have a product with that slug. Pick another.',
  bad_slug: 'Slug must be lowercase letters, digits, and hyphens (e.g. country-rice-25kg).',
  bad_category: 'Pick a valid category.',
  bad_condition: 'Pick a valid condition.',
  bad_mime: 'Only JPEG, PNG, or WebP images are accepted.',
  too_large: 'Image is larger than 5 MB.',
  missing_image: 'Add a primary product image.',
  at_cap: 'You\'ve reached the listing limit for your plan.',
  r2_not_configured: 'Image upload is not configured in this environment.',
  db_write_failed: 'The image uploaded but the product could not be saved. Try again.',
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

const CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'LIKE_NEW', label: 'Like new' },
  { value: 'USED_GOOD', label: 'Used — good' },
  { value: 'USED_FAIR', label: 'Used — fair' },
  { value: 'REFURBISHED', label: 'Refurbished' },
  { value: 'FOR_PARTS', label: 'For parts' },
] as const;

export default async function NewProductPage({ searchParams }: PageProps) {
  const session = await getSellerSession();
  if (!session) redirect('/sell/sign-in');

  const seller = await prisma.seller.findUnique({
    where: { id: session.sellerId },
    select: { id: true, business_name: true, saas_plan: true },
  });
  if (!seller) redirect('/sell/sign-in');

  const usage = await getListingUsage(seller.id, seller.saas_plan as SellerPlan);
  // Refuse to render the form if the seller is at-cap; redirect them back so they can't
  // submit and burn an R2 upload that will be rejected.
  if (usage.atCap) {
    redirect('/sell/console?error=at_cap');
  }

  const categories = await prisma.category.findMany({
    where: { is_active: true },
    orderBy: { display_order: 'asc' },
    select: { id: true, name: true, slug: true },
  });

  const sp = await searchParams;
  const errorCopy = sp.error ? ERROR_COPY[sp.error] ?? 'Could not create the product.' : null;

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/sell/console" className="text-xs font-semibold text-blue-700 hover:underline">
          ← Console
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-neutral-900">New product</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Goes live after T&amp;S moderation. Plan: <strong>{seller.saas_plan}</strong> · {usage.used} of{' '}
          {formatLimit(usage.limit)} listings used.
        </p>

        {errorCopy && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorCopy}
          </div>
        )}
        {!IS_R2_ENABLED && (
          <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Image upload is disabled (Cloudflare R2 not configured). You can fill the form but
            submitting will fail until R2 is wired.
          </div>
        )}

        <form
          action={createProduct}
          className="mt-6 space-y-6 rounded-xl border border-neutral-200 bg-neutral-0 p-6"
        >
          <Field id="name" label="Product name" required>
            <input
              id="name"
              name="name"
              required
              minLength={3}
              maxLength={200}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Country Rice — 25 kg bag"
            />
          </Field>

          <Field id="slug" label="URL slug" help="Lowercase, dashes only. Leave blank to auto-generate from the name.">
            <input
              id="slug"
              name="slug"
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="country-rice-25kg"
            />
          </Field>

          <Field id="short_description" label="Short description" help="One-liner shown on cards (max 160 chars).">
            <input
              id="short_description"
              name="short_description"
              maxLength={160}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Lofa-grown, 25 kg"
            />
          </Field>

          <Field id="description" label="Description" required>
            <textarea
              id="description"
              name="description"
              required
              minLength={20}
              rows={4}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Premium Liberian country rice, 25 kg. Locally grown in Lofa County. Cooks fluffy and aromatic."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="category_id" label="Category" required>
              <select id="category_id" name="category_id" required defaultValue="" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="" disabled>
                  Pick a category…
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="condition" label="Condition" required>
              <select id="condition" name="condition" defaultValue="NEW" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
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
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="42.00"
              />
            </Field>
            <Field id="compare_at_price" label="Compare-at price" help="Optional, e.g. for a sale.">
              <input
                id="compare_at_price"
                name="compare_at_price"
                type="number"
                min={0.01}
                step={0.01}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="48.00"
              />
            </Field>
          </div>

          <Field
            id="image"
            label="Primary image"
            required
            help="JPEG / PNG / WebP, ≤ 5 MB. Will be uploaded to Cloudflare R2 and shown on the public PDP."
          >
            <ImageUpload name="image" required disabled={!IS_R2_ENABLED} />
          </Field>

          <div className="flex items-center justify-between border-t border-neutral-200 pt-5">
            <Link href="/sell/console" className="text-xs font-semibold text-neutral-600 hover:text-neutral-900">
              ← Cancel
            </Link>
            <button
              type="submit"
              disabled={!IS_R2_ENABLED}
              className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-600"
            >
              Create draft
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
