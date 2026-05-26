import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { placeOrder } from '../actions/order';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function CheckoutPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const jar = await cookies();
  const sessionId = jar.get('vdr_cart')?.value ?? null;

  const cart = sessionId
    ? await prisma.cart.findFirst({
        where: { session_id: sessionId },
        include: { items: true },
      })
    : null;

  if (!cart || cart.items.length === 0) {
    redirect('/cart');
  }

  // Load item details for the summary
  const productIds = cart.items.map((i) => i.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      seller: { select: { business_name: true, kyc_tier: true } },
      images: { where: { is_primary: true }, take: 1 },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  for (const ci of cart.items) {
    const p = productById.get(ci.product_id);
    if (!p) continue;
    subtotal += Number(p.base_price) * ci.quantity;
  }

  const zones = await prisma.deliveryZone.findMany({
    where: { is_active: true },
    orderBy: { base_delivery_fee: 'asc' },
  });

  return (
    <main className="bg-neutral-50 min-h-screen">
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold text-neutral-900 md:text-4xl">Checkout</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Your payment will sit in escrow. Sellers are paid only after you confirm delivery
            with the 6-digit code we send by SMS.
          </p>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          <form action={placeOrder} className="grid gap-8 lg:grid-cols-[1fr_360px]">
            {/* Left: form */}
            <div className="space-y-6">
              {/* Buyer info */}
              <fieldset className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
                <legend className="px-2 text-sm font-bold uppercase tracking-wider text-neutral-600">
                  Your details
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="buyer_name" name="buyer_name" label="Full name" required />
                  <Field id="buyer_email" name="buyer_email" label="Email" type="email" required />
                  <Field
                    id="buyer_phone"
                    name="buyer_phone"
                    label="Phone (for delivery code SMS)"
                    placeholder="+231 ..."
                  />
                </div>
              </fieldset>

              {/* Delivery */}
              <fieldset className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
                <legend className="px-2 text-sm font-bold uppercase tracking-wider text-neutral-600">
                  Delivery address
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="delivery_street" name="delivery_street" label="Street + number" required containerClassName="sm:col-span-2" />
                  <Field id="delivery_city" name="delivery_city" label="City" defaultValue="Monrovia" required />
                  <Field id="delivery_county" name="delivery_county" label="County" defaultValue="Montserrado" />
                  <div className="sm:col-span-2">
                    <label htmlFor="delivery_zone" className="block text-sm font-semibold text-neutral-900">
                      Delivery zone <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="delivery_zone"
                      name="delivery_zone"
                      required
                      defaultValue="sinkor"
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
                    >
                      {zones.map((z) => (
                        <option key={z.id} value={z.name}>
                          {z.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          {' — '}
                          ${Number(z.base_delivery_fee).toFixed(2)}, ~{z.estimated_delivery_hours}h
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="delivery_notes" className="block text-sm font-semibold text-neutral-900">
                      Delivery notes (optional)
                    </label>
                    <textarea
                      id="delivery_notes"
                      name="delivery_notes"
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
                      placeholder="Landmarks, gate code, etc."
                    />
                  </div>
                </div>
                <input type="hidden" name="delivery_country" value="LR" />
              </fieldset>

              {/* Payment */}
              <fieldset className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
                <legend className="px-2 text-sm font-bold uppercase tracking-wider text-neutral-600">
                  Payment method
                </legend>
                <div className="grid gap-3">
                  <PaymentRadio
                    value="MTN_MOMO"
                    label="MTN MoMo"
                    sub="Pay with your MTN Mobile Money wallet"
                    defaultChecked
                  />
                  <PaymentRadio
                    value="ORANGE_MONEY"
                    label="Orange Money"
                    sub="Pay with your Orange Money wallet"
                  />
                  <PaymentRadio
                    value="CARD"
                    label="Card (diaspora)"
                    sub="Visa / Mastercard via Stripe"
                  />
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  Payment provider integrations land in a later slice. This checkout currently
                  mocks payment success so the rest of the trust mechanic can be built.
                </p>
              </fieldset>
            </div>

            {/* Right: summary */}
            <aside className="h-fit rounded-xl border border-neutral-200 bg-neutral-0 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
                Order summary
              </h2>

              <ul className="mt-4 space-y-3 text-sm">
                {cart.items.map((ci) => {
                  const p = productById.get(ci.product_id);
                  if (!p) return null;
                  const lineTotal = Number(p.base_price) * ci.quantity;
                  return (
                    <li key={ci.id} className="flex justify-between gap-3">
                      <span className="line-clamp-1 text-neutral-700">
                        {p.name} <span className="text-neutral-500">× {ci.quantity}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-neutral-900">
                        ${lineTotal.toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 space-y-2 border-t border-neutral-200 pt-4 text-sm">
                <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
                <Row label="Shipping" value="Calculated by zone" muted />
                <Row label="Escrow protection" value="Included" success />
              </div>

              <div className="mt-4 border-t border-neutral-200 pt-4 flex justify-between text-base">
                <span className="font-bold text-neutral-900">Total</span>
                <span className="font-bold text-neutral-900">≥ ${subtotal.toFixed(2)}</span>
              </div>

              <button
                type="submit"
                className="mt-6 w-full rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-neutral-0 transition hover:bg-blue-800"
              >
                Place order &middot; pay into escrow
              </button>

              <p className="mt-3 text-xs text-neutral-500">
                By placing the order you agree your payment is held by Vendoora and only released to
                the seller after you confirm delivery.
              </p>

              <p className="mt-4 text-xs text-neutral-500">
                <Link href="/cart" className="hover:text-blue-700">← Back to cart</Link>
              </p>
            </aside>
          </form>
        </div>
      </section>
    </main>
  );
}

interface FieldProps {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  containerClassName?: string;
}

function Field({
  id,
  name,
  label,
  type = 'text',
  required,
  placeholder,
  defaultValue,
  containerClassName,
}: FieldProps) {
  return (
    <div className={containerClassName}>
      <label htmlFor={id} className="block text-sm font-semibold text-neutral-900">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
      />
    </div>
  );
}

function PaymentRadio({
  value,
  label,
  sub,
  defaultChecked,
}: {
  value: string;
  label: string;
  sub: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 transition has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50">
      <input
        type="radio"
        name="payment_method"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1"
      />
      <div>
        <div className="text-sm font-semibold text-neutral-900">{label}</div>
        <div className="text-xs text-neutral-600">{sub}</div>
      </div>
    </label>
  );
}

function Row({
  label,
  value,
  muted,
  success,
}: {
  label: string;
  value: string;
  muted?: boolean;
  success?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-neutral-500' : 'text-neutral-600'}>{label}</span>
      <span
        className={
          success
            ? 'font-semibold text-emerald-700'
            : muted
              ? 'text-neutral-500'
              : 'font-semibold text-neutral-900'
        }
      >
        {value}
      </span>
    </div>
  );
}
