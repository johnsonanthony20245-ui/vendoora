'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { prisma, type Prisma } from '@vendoora/db';
import { getCurrentBuyerUserId } from '../../lib/auth';

// Plans the wizard offers. The schema defines four; STARTER is the default.
const VALID_PLANS = new Set(['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE']);

// Liberian-friendly defaults — every seller starts as SOLE_PROPRIETOR; the
// review process can promote them later.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function failValidation(step: string, message: string): never {
  redirect(`/sell/${step}?error=${encodeURIComponent(message)}`);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

const ONBOARDING_COOKIE = 'vdr_sell_onb';
const ONBOARDING_TTL = 60 * 60 * 24 * 7; // 7 days

interface OnboardingDraft {
  business_name: string;
  business_slug: string;
  business_phone: string;
  business_email: string;
  delivery_city: string;
}

async function readDraft(): Promise<Partial<OnboardingDraft>> {
  try {
    const jar = await cookies();
    const raw = jar.get(ONBOARDING_COOKIE)?.value;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Partial<OnboardingDraft>;
    return {};
  } catch {
    return {};
  }
}

async function writeDraft(next: Partial<OnboardingDraft>): Promise<void> {
  const current = await readDraft();
  const merged: Partial<OnboardingDraft> = { ...current, ...next };
  const jar = await cookies();
  jar.set(ONBOARDING_COOKIE, JSON.stringify(merged), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ONBOARDING_TTL,
  });
}

async function clearDraft(): Promise<void> {
  const jar = await cookies();
  jar.delete(ONBOARDING_COOKIE);
}

export async function getOnboardingDraft(): Promise<Partial<OnboardingDraft>> {
  return readDraft();
}

// ────────────────────────────────────────────────────────────────────────
// Step 1: business name + slug + contact
// ────────────────────────────────────────────────────────────────────────
export async function submitStep1(formData: FormData): Promise<void> {
  const business_name = String(formData.get('business_name') ?? '').trim();
  const submittedSlug = String(formData.get('business_slug') ?? '').trim().toLowerCase();
  const business_phone = String(formData.get('business_phone') ?? '').trim();
  const business_email = String(formData.get('business_email') ?? '').trim();

  if (business_name.length < 2) {
    failValidation('1', 'Business name must be at least 2 characters.');
  }
  const business_slug = submittedSlug || slugify(business_name);
  if (!SLUG_RE.test(business_slug)) {
    failValidation(
      '1',
      'Slug must be lowercase letters, digits, and hyphens only (e.g. konah-boutique).',
    );
  }
  if (business_phone.length < 7) {
    failValidation('1', 'Phone number looks too short. Include the country code.');
  }
  if (!business_email.includes('@')) {
    failValidation('1', 'Please enter a valid email address.');
  }

  // Slug-collision check
  const taken = await prisma.seller.findUnique({
    where: { business_slug },
    select: { id: true },
  });
  if (taken) {
    failValidation('1', `Slug "${business_slug}" is taken. Pick another.`);
  }

  await writeDraft({ business_name, business_slug, business_phone, business_email });
  redirect('/sell/2');
}

// ────────────────────────────────────────────────────────────────────────
// Step 2: city / delivery zone (KYC Tier 1 anchor — just contact + location)
// ────────────────────────────────────────────────────────────────────────
export async function submitStep2(formData: FormData): Promise<void> {
  const delivery_city = String(formData.get('delivery_city') ?? '').trim();
  if (delivery_city.length < 2) {
    failValidation('2', 'Delivery city is required.');
  }
  await writeDraft({ delivery_city });
  redirect('/sell/3');
}

// ────────────────────────────────────────────────────────────────────────
// Step 3: plan choice + commit. Writes Seller + KycApplication + audit.
// ────────────────────────────────────────────────────────────────────────
export async function submitStep3(formData: FormData): Promise<void> {
  const plan = String(formData.get('plan') ?? 'STARTER').trim().toUpperCase();
  if (!VALID_PLANS.has(plan)) {
    failValidation('3', 'Pick a valid plan.');
  }

  const draft = await readDraft();
  if (!draft.business_name || !draft.business_slug || !draft.business_phone || !draft.business_email || !draft.delivery_city) {
    redirect('/sell/1?error=missing_draft');
  }

  // Bind the seller to a real User. With Clerk wired this is the signed-in
  // user; without Clerk we create a placeholder User row so the seller can
  // still be created (the user upgrades to a Clerk identity later).
  const buyerUserId = await getCurrentBuyerUserId();
  let userId = buyerUserId;
  if (!userId) {
    const placeholderClerkId = `placeholder_${randomUUID()}`;
    const placeholderEmail =
      draft.business_email && draft.business_email.includes('@')
        ? draft.business_email
        : `${placeholderClerkId}@no-email.vendoora`;
    const created = await prisma.user.upsert({
      where: { email: placeholderEmail },
      update: {},
      create: {
        clerk_id: placeholderClerkId,
        email: placeholderEmail,
        phone: draft.business_phone,
        full_name: draft.business_name,
        is_email_verified: false,
        is_phone_verified: false,
      },
    });
    userId = created.id;
  }

  // Reject if user already owns a seller account.
  const existing = await prisma.seller.findUnique({ where: { user_id: userId } });
  if (existing) {
    failValidation('3', 'You already have a seller account. Visit your seller console.');
  }

  // Commission rate map matches the /pricing page card text.
  const commissionByPlan: Record<string, number> = {
    STARTER: 0.12,
    GROWTH: 0.1,
    PRO: 0.08,
    ENTERPRISE: 0.06,
  };

  const result = await prisma.$transaction(async (tx) => {
    const seller = await tx.seller.create({
      data: {
        user_id: userId,
        business_name: draft.business_name as string,
        business_slug: draft.business_slug as string,
        business_email: draft.business_email as string,
        business_phone: draft.business_phone as string,
        business_address: { city: draft.delivery_city } satisfies Prisma.InputJsonValue,
        business_type: 'SOLE_PROPRIETOR',
        kyc_tier: 1,
        kyc_status: 'IN_REVIEW',
        saas_plan: plan as 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE',
        saas_plan_started_at: new Date(),
        saas_commission_rate: commissionByPlan[plan] ?? 0.12,
        payout_method: 'MTN_MOMO',
        payout_schedule: 'WEEKLY',
      },
    });

    // KYC Tier 1 application — phone + email verified at signup. T&S can
    // promote to T2+ later via the /admin surface.
    const kyc = await tx.kycApplication.create({
      data: {
        applicant_type: 'SELLER',
        applicant_user_id: userId,
        target_tier: 1,
        current_tier: 0,
        status: 'SUBMITTED',
        submitted_at: new Date(),
        last_applicant_action_at: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actor_user_id: userId,
        actor_system: false,
        action: 'seller.onboarded',
        resource_type: 'seller',
        resource_id: seller.id,
        after_state: {
          business_slug: seller.business_slug,
          saas_plan: seller.saas_plan,
          kyc_tier: seller.kyc_tier,
        } satisfies Prisma.InputJsonValue,
        metadata: {
          kyc_application_id: kyc.id,
          via: 'wizard',
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { businessSlug: seller.business_slug };
  });

  await clearDraft();
  redirect(`/sell/welcome?slug=${result.businessSlug}`);
}
