'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, type FormEvent } from 'react';

/**
 * Header search — mirrors the prototype's .header-search-wrap + .header-search-dropdown.
 *
 * On focus, opens a dropdown of "Recent searches" / "Popular right now" /
 * "Browse by category". These are illustrative — production wires recent
 * searches to per-session history (SearchEvent rows) and popular to a
 * rolling top-N aggregation.
 *
 * Submitting the input routes to /search?q=...
 */
export function ProtoHeaderSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    setOpen(false);
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="header-search-wrap"
      style={{ flex: 1, maxWidth: 480 }}
      ref={wrapRef}
    >
      <div className="header-search">
        <svg
          className="header-search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          placeholder="Search products, sellers, categories…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setOpen(true)}
        />
      </div>
      <div className={`header-search-dropdown${open ? ' active' : ''}`}>
        <div className="header-search-section-label">Recent searches</div>
        <Link className="header-search-item" href="/c/fashion">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
          </svg>
          <span>wrappers</span>
        </Link>
        <Link className="header-search-item" href="/c/food-drink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
          </svg>
          <span>palm oil</span>
        </Link>
        <Link className="header-search-item" href="/c/beauty">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
          </svg>
          <span>black soap</span>
        </Link>

        <div className="header-search-section-label">Popular right now</div>
        <Link className="header-search-item" href="/c/fashion">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>handwoven wrapper</span>
          <span className="kbd">+42% today</span>
        </Link>
        <Link className="header-search-item" href="/">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>diaspora gift bundles</span>
          <span className="kbd">Trending</span>
        </Link>
        <Link className="header-search-item" href="/c/food-drink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>jollof rice ingredients</span>
          <span className="kbd">Trending</span>
        </Link>

        <div className="header-search-section-label">Browse by category</div>
        <Link className="header-search-item" href="/c/fashion">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>Fashion &amp; Wrappers</span>
        </Link>
        <Link className="header-search-item" href="/c/food-drink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>Food &amp; Groceries</span>
        </Link>
      </div>
    </form>
  );
}
