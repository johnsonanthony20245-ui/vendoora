/**
 * One row per /search request, fire-and-forget.
 *
 * Called from app/search/page.tsx after searchProducts() resolves. Writes the
 * normalised query, filters, and the total_count so the admin can see what
 * landed on zero results. Failures are swallowed — analytics must never break
 * the buyer surface.
 *
 * The anon_session_id comes from the cart cookie when one exists. We do not
 * create a cookie for search-only sessions; if no cart cookie is set, the
 * field stays null.
 */
import { cookies } from 'next/headers';
import { prisma } from '@vendoora/db';
import { getCurrentBuyerUserId } from './auth';

const CART_COOKIE = 'vdr_cart';

export interface LogSearchInput {
  q: string;
  categorySlug: string | undefined;
  condition: string | undefined;
  totalCount: number;
  page: number;
}

async function readSessionId(): Promise<string | null> {
  try {
    const jar = await cookies();
    return jar.get(CART_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

export async function logSearchEvent(input: LogSearchInput): Promise<void> {
  const q = (input.q ?? '').trim().toLowerCase();
  const anonSessionId = await readSessionId();
  const userId = await getCurrentBuyerUserId();

  try {
    await prisma.searchEvent.create({
      data: {
        q,
        category_slug: input.categorySlug ?? null,
        condition: input.condition ?? null,
        total_count: input.totalCount,
        page: input.page,
        anon_session_id: anonSessionId,
        user_id: userId,
      },
    });
  } catch {
    // Telemetry failures must never surface to the buyer.
  }
}
