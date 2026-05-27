'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { SortOption } from '../lib/search';

interface Props {
  /** Path to navigate to on change — current /c/[slug] or /search. */
  basePath: string;
  current: SortOption;
}

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'best', label: 'Sort: Best match' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'new', label: 'Newest first' },
  { value: 'rating', label: 'Top rated' },
];

/**
 * Sort dropdown — mirrors the prototype's sort-select look + content,
 * with real navigation. Tiny client component so we can hook onChange;
 * everything else on the browse/search pages stays server-rendered.
 */
export function ProtoSortDropdown({ basePath, current }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params?.toString() ?? '');
    if (e.target.value === 'best') {
      next.delete('sort');
    } else {
      next.set('sort', e.target.value);
    }
    // Reset page on sort change.
    next.delete('page');
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <select className="input sort-select" value={current} onChange={onChange}>
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
