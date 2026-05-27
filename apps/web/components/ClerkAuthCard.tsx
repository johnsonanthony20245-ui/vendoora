'use client';

import { SignIn, SignUp } from '@clerk/nextjs';

interface Props {
  mode: 'signIn' | 'signUp';
}

/**
 * Thin client wrapper around Clerk's <SignIn /> / <SignUp />. The 'use client'
 * boundary is required because the underlying components render the hosted
 * Clerk widget on the browser.
 *
 * Rendered only when IS_CLERK_ENABLED — see /sign-in and /sign-up pages.
 */
export function ClerkAuthCard({ mode }: Props) {
  if (mode === 'signIn') {
    return <SignIn appearance={{ elements: { rootBox: 'mx-auto' } }} />;
  }
  return <SignUp appearance={{ elements: { rootBox: 'mx-auto' } }} />;
}
