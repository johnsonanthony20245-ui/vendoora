# Credentials — Quick Get

**What this is:** the practical "where to click, what to copy" companion to `Credentials_Inventory.md` (which says *what* secrets you need by phase). Each section here is what's currently blocking real work in the build.

**Where everything goes:** the **repo-root `.env`** (git-ignored). Add lines like:

```
KEY_NAME="paste-value-here"
```

Never paste a secret in chat or commit it to the repo. Test/sandbox keys are fine to drop in `.env` — production keys come later (and via Doppler, not `.env`).

After each one lands, tell Claude **"the X creds are in `.env`"** and it'll wire that integration for real.

---

## 1. Stripe webhook secret (instant — 2 min)

**Unlocks:** finishes the Card-payment loop. Without this, the webhook handler can't verify Stripe's signature, so the order never flips from `PENDING_PAYMENT` to `PAID`.

### Easiest path — Stripe CLI (recommended for local dev)

1. Install once: <https://stripe.com/docs/stripe-cli> (one-line installer for your OS).
2. Log in: `stripe login`
3. Run:
   ```
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. The first line of output prints `> Ready! Your webhook signing secret is whsec_…`
5. Copy the `whsec_…` into `.env`:
   ```
   STRIPE_WEBHOOK_SECRET="whsec_…"
   ```

Leave `stripe listen` running while you test — it forwards real test-mode webhook events to your dev server. Every Card payment you confirm in the UI fires `payment_intent.succeeded` through that tunnel.

### Production path — Stripe Dashboard

1. dashboard.stripe.com → **Developers** → **Webhooks** → **Add endpoint**.
2. Endpoint URL: `https://YOUR-DOMAIN/api/webhooks/stripe`
3. Events to send: `payment_intent.succeeded` (add `payment_intent.payment_failed` later).
4. After creating, click the endpoint → **Reveal signing secret** → copy `whsec_…`.
5. Paste into Doppler (production env) — **not** `.env`.

---

## 2. Cloudflare R2 (instant — 5 min)

**Unlocks:** KYC document upload (completes the KYC flow) and real product-image uploads.

1. dash.cloudflare.com → sign in / sign up (free tier is fine).
2. Left nav → **R2 Object Storage** → enable if first time (no credit card needed for the free tier; you confirm a card later if you exceed the free 10 GB).
3. **Create bucket** → name it `vendoora-dev` (use `vendoora-prod` later).
4. Top right → **Manage R2 API Tokens** → **Create API token**:
   - Permissions: **Object Read & Write**.
   - Specify bucket: the one you just made.
5. The token page shows **four values once** — copy all four to `.env`:
   ```
   R2_ACCOUNT_ID="…"
   R2_ACCESS_KEY_ID="…"
   R2_SECRET_ACCESS_KEY="…"
   R2_BUCKET="vendoora-dev"
   ```
   (Re-open the token isn't possible — it's shown once. If you lose it, create a new token.)
6. Bucket settings → **Public Access** → enable a public R2.dev URL or attach a custom domain so uploaded images load in the browser.

For Cloudflare Images (separate product, optional for thumbnail variants): dash → **Images** → API tokens → copy the Images token into `CLOUDFLARE_IMAGES_TOKEN`. Not needed for the KYC upload — R2 alone is enough.

---

## 3. Africa's Talking — SMS sandbox (instant; sender ID approval slower)

**Unlocks:** real delivery-code SMS to the buyer's phone. Right now the 6-digit code is shown only in-app.

1. africastalking.com → **Sign up** → create an app.
2. Switch to **sandbox** mode (top-right toggle); you get test credits.
3. **Settings → API Key** → generate → copy.
4. **Username** is shown on the same page (often `sandbox`).
5. `.env`:
   ```
   AT_USERNAME="sandbox"
   AT_API_KEY="…"
   AT_SENDER_ID="VENDOORA"
   ```
   `AT_SENDER_ID` is the alphanumeric ID. For sandbox testing, any short string works; for **production**, request an alphanumeric sender ID for Liberia via the Africa's Talking console — approval typically takes **a few days to a couple of weeks**, so file that request early even while you're still on sandbox.

### Twilio (fallback, optional)

1. twilio.com → **Sign up** (free trial credits).
2. Console → **Account info** → copy `Account SID` and `Auth Token`.
3. **Messaging → Services** → create a Messaging Service → copy its SID.
4. `.env`:
   ```
   TWILIO_ACCOUNT_SID="AC…"
   TWILIO_AUTH_TOKEN="…"
   TWILIO_MESSAGING_SERVICE_SID="MG…"
   ```

---

## 4. MTN MoMo (sandbox — start TODAY, it's the long pole)

**Unlocks:** the primary local payment rail. Sandbox application can take **days to weeks** — start now even if it sits unused.

1. momodeveloper.mtn.com → **Sign up** (developer account).
2. **Products** → subscribe to **Collections** (buyer→Vendoora) AND **Disbursements** (Vendoora→seller payout). Each gives a **Primary Subscription Key**.
3. **Sandbox provisioning** — MTN's docs walk you through provisioning a sandbox `API User` and `API Key`. The result is two strings (User Reference Id + API Key).
4. `.env`:
   ```
   MOMO_TARGET_ENVIRONMENT="sandbox"
   MOMO_SUBSCRIPTION_KEY_COLLECTIONS="…"
   MOMO_SUBSCRIPTION_KEY_DISBURSEMENTS="…"
   MOMO_API_USER_ID="…"
   MOMO_API_KEY="…"
   ```

Heads-up: production MoMo for Liberia requires business KYC verification on MTN's side. That can take additional weeks — gate it behind launch.

---

## 5. Orange Money (sandbox — start TODAY)

**Unlocks:** secondary local rail.

1. developer.orange.com → **Sign up**.
2. **Orange Money Web Payment** (or **Cash In / Cash Out** API, depending on what's available in your region) → subscribe.
3. **My Apps → Add app** → get `client_id` + `client_secret`.
4. For Liberia you may also need a `merchant_key` from Orange Money Liberia's onboarding team — email them via the developer portal contact.
5. `.env`:
   ```
   ORANGE_CLIENT_ID="…"
   ORANGE_CLIENT_SECRET="…"
   ORANGE_MERCHANT_KEY="…"
   ```

Liberia-specific onboarding can take time; flag what's blocking when you get there.

---

## 6. Stripe Connect — seller payouts (when you're ready to flip `RELEASING → RELEASED`)

**Unlocks:** the final step of the trust mechanic for the diaspora/USD path — paying the seller after escrow releases.

1. dashboard.stripe.com (same Stripe account as the test keys you already gave me) → **Settings → Connect**.
2. Click **Get started with Connect**, fill the platform profile (Vendoora, marketplace, etc.).
3. **Settings → Connect → Onboarding options** → pick **Express** (recommended — Stripe hosts the seller onboarding UI, fastest to build against).
4. Once Connect is enabled:
   - **Developers → API keys** still gives your existing `sk_test_…` / `pk_test_…`.
   - **Settings → Connect → Client ID** → copy the `ca_…` value.
5. `.env`:
   ```
   STRIPE_CONNECT_CLIENT_ID="ca_…"
   ```

(Your `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` are already in `.env` and are reused for Connect.)

When this lands I'll build the seller Connect onboarding flow (`/sell/connect`), the Transfer call on escrow release, and the `account.updated` / `transfer.created` webhook handlers — which is what finally flips `EscrowState` `RELEASING → RELEASED` for the USD path.

---

## Quick checklist — what to do today

In this priority order:

1. ☐ **Stripe CLI** → `stripe listen` → drop the `whsec_…` into `.env` (2 min, unblocks the Card flow end-to-end).
2. ☐ **Cloudflare R2** → bucket + token → 4 keys into `.env` (5 min, unblocks KYC upload + product images).
3. ☐ **Africa's Talking sandbox** → 3 keys into `.env`; request the production sender ID in the same sitting (5 min + waiting; unblocks SMS code delivery).
4. ☐ **MTN MoMo sandbox application** — file it now even if it sits unused for weeks.
5. ☐ **Orange Money sandbox application** — same; file it now.
6. ☐ **Stripe Connect** — enable in the dashboard, copy the `ca_…` (5 min; unblocks the seller-payout half of the trust mechanic).

After each, message Claude: **"<service> creds are in `.env`"** and the build moves forward against real sandbox keys.
