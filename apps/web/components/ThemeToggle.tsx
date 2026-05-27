'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vdr-theme';

/**
 * Header button that flips data-theme on <html>.
 *
 * The initial theme is set BEFORE hydration by the inline script in
 * layout.tsx — that prevents the flash-of-wrong-theme that would otherwise
 * happen during React's first paint. This component just syncs its local
 * state from the document on mount and writes back on click.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset['theme'];
    setTheme(current === 'dark' ? 'dark' : 'light');
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-browsing mode or storage disabled — toggle still works for the session.
    }
    setTheme(next);
  }

  // Render a placeholder of the same size on the server / first paint to avoid layout shift.
  if (!mounted) {
    return (
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 text-base"
      />
    );
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-neutral-0 text-base text-neutral-700 transition hover:border-blue-700 hover:text-blue-700"
    >
      <span aria-hidden>{isDark ? '☀️' : '🌙'}</span>
    </button>
  );
}
