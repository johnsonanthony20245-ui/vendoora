'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, type FormEvent } from 'react';

interface Props {
  initialValue?: string;
  /** Compact mode for the header; default false for the standalone hero. */
  compact?: boolean;
}

/**
 * Controlled search input that GETs to /search?q=...
 *
 * Uses router.push() rather than a native form submit so we can preserve any
 * existing filter params (cat, cond) when the user re-runs the search. If
 * those are absent, the URL is just /search?q=...
 */
export function SearchBox({ initialValue = '', compact = false }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialValue);

  // Re-sync when the URL changes (e.g. user clicks a filter chip on /search).
  useEffect(() => {
    setValue(params?.get('q') ?? initialValue);
  }, [params, initialValue]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = new URLSearchParams();
    const trimmed = value.trim();
    if (trimmed) next.set('q', trimmed);
    // Preserve filter params if present.
    const cat = params?.get('cat');
    const cond = params?.get('cond');
    if (cat) next.set('cat', cat);
    if (cond) next.set('cond', cond);
    router.push(`/search${next.toString() ? `?${next.toString()}` : ''}`);
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className={`flex items-center gap-2 ${compact ? 'w-full max-w-md' : 'w-full max-w-2xl'}`}
    >
      <label className="sr-only" htmlFor="search-box-input">
        Search Vendoora
      </label>
      <div className="relative flex-1">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400"
        >
          🔍
        </span>
        <input
          id="search-box-input"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search products, sellers, brands…"
          autoComplete="off"
          className={`w-full rounded-lg border border-neutral-300 bg-neutral-0 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 ${compact ? 'py-1.5' : 'py-2.5'}`}
        />
      </div>
      <button
        type="submit"
        className={`rounded-lg bg-blue-700 font-semibold text-neutral-0 transition hover:bg-blue-800 ${compact ? 'px-3 py-1.5 text-sm' : 'px-5 py-2.5 text-sm'}`}
      >
        Search
      </button>
    </form>
  );
}
