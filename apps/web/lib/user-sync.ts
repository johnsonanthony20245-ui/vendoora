/**
 * Mirror a Clerk user into the Prisma User table on first sight.
 *
 * Clerk owns identity (auth, sessions, OAuth links); we own everything else
 * (orders, carts, sellers, reviews, KYC). The bridge between them is the
 * User.clerk_id column.
 *
 * This file is dynamically imported only when Clerk is enabled (see auth.ts)
 * so it never runs in builds without keys.
 */
import { prisma } from '@vendoora/db';
import { currentUser } from '@clerk/nextjs/server';

interface SyncedUser {
  id: string;
  clerk_id: string;
}

/**
 * Find-or-create the local User row for the given Clerk user id. Pulls the
 * authoritative profile from Clerk on insert; on subsequent calls a single
 * SELECT by clerk_id is enough (no Clerk round-trip).
 */
export async function syncClerkUser(clerkId: string): Promise<SyncedUser> {
  const existing = await prisma.user.findUnique({
    where: { clerk_id: clerkId },
    select: { id: true, clerk_id: true },
  });
  if (existing) return existing;

  // First sight — pull from Clerk and create the local row.
  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== clerkId) {
    throw new Error(`Clerk user ${clerkId} not found in active session`);
  }

  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    `${clerkId}@no-email.vendoora`;

  const primaryPhone =
    clerkUser.phoneNumbers.find((p) => p.id === clerkUser.primaryPhoneNumberId)
      ?.phoneNumber ?? null;

  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
    primaryEmail.split('@')[0] ||
    'Vendoora User';

  const created = await prisma.user.create({
    data: {
      clerk_id: clerkId,
      email: primaryEmail,
      phone: primaryPhone,
      full_name: fullName,
      avatar_url: clerkUser.imageUrl ?? null,
      is_email_verified: true, // Clerk only emits verified emails as primary
      is_phone_verified: Boolean(primaryPhone),
    },
    select: { id: true, clerk_id: true },
  });
  return created;
}
