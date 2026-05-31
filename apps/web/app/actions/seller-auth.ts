'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { DEV_SELLER_COOKIE_NAME } from '../../lib/seller-auth';

/**
 * Dev-only sign-in for the seller console: accepts a `slug`, confirms the
 * seller exists, and sets the `vdr_seller_dev` cookie. Refused in production
 * (Clerk is the real gate there). Mirrors the admin dev sign-in.
 */
export async function devSellerSignIn(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    redirect('/sell/sign-in?error=dev_only');
  }
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  if (!slug) {
    redirect('/sell/sign-in?error=missing_slug');
  }
  const seller = await prisma.seller.findUnique({
    where: { business_slug: slug },
    select: { id: true },
  });
  if (!seller) {
    redirect(`/sell/sign-in?error=not_found&slug=${encodeURIComponent(slug)}`);
  }
  const jar = await cookies();
  jar.set(DEV_SELLER_COOKIE_NAME, slug, {
    httpOnly: true,
    secure: false, // dev-only code path; production uses Clerk
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect('/sell/console');
}

export async function devSellerSignOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEV_SELLER_COOKIE_NAME);
  redirect('/sell/sign-in');
}
