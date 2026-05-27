import Link from 'next/link';
import type {
  ProductCondition,
  AuthenticityStatus,
  FacetCounts,
} from '../lib/search';

/**
 * Filter sidebar — mirrors docs/prototype/Vendoora_App.html's
 * filter-sidebar shape exactly, but the checkboxes ACTUALLY filter.
 *
 * Each checkbox row is a <Link> that toggles one URL param. Multi-select
 * dimensions (conditions, authenticities, seller tiers) are encoded as
 * comma-separated CSV in the URL (e.g. cond=NEW,LIKE_NEW).
 *
 * Counts come from getFacetCounts() — real groupBy results constrained
 * by every OTHER active filter (Amazon-style faceting).
 */

const CONDITION_LABEL: Record<ProductCondition, string> = {
  NEW: 'Brand new',
  LIKE_NEW: 'Like new',
  USED_GOOD: 'Used – Good',
  USED_FAIR: 'Used – Fair',
  REFURBISHED: 'Refurbished',
  FOR_PARTS: 'For parts',
};

const CONDITION_ORDER: ProductCondition[] = [
  'NEW',
  'LIKE_NEW',
  'USED_GOOD',
  'USED_FAIR',
  'REFURBISHED',
];

const AUTHENTICITY_LABEL: Record<AuthenticityStatus, string> = {
  PLATFORM_VERIFIED: 'Platform verified',
  PROOF_PROVIDED: 'Proof uploaded',
  CLAIMED: 'Claimed authentic',
  UNCLAIMED: 'Unclaimed',
};

const AUTHENTICITY_ORDER: AuthenticityStatus[] = [
  'PLATFORM_VERIFIED',
  'PROOF_PROVIDED',
  'CLAIMED',
];

const TIER_LABEL: Record<number, string> = {
  4: 'Tier 4 (Trusted)',
  3: 'Tier 3 (Verified)',
  2: 'Tier 2 (Standard)',
  1: 'Tier 1 (New)',
};

const TIER_ORDER = [4, 3, 2, 1];

export interface FilterState {
  conditions: ProductCondition[];
  sellerTiers: number[];
  authenticities: AuthenticityStatus[];
  minRating: number;
}

interface Props {
  basePath: string;
  /** Other URL params (q, cat, sort) to preserve across toggles. */
  preservedParams: Record<string, string | undefined>;
  state: FilterState;
  counts: FacetCounts;
}

/** Toggle a value in a CSV-encoded list, returning the new CSV (or undefined to drop). */
function toggleCsv<T extends string | number>(list: T[], value: T): string | undefined {
  const has = list.some((v) => String(v) === String(value));
  const next = has ? list.filter((v) => String(v) !== String(value)) : [...list, value];
  return next.length === 0 ? undefined : next.map(String).join(',');
}

function buildHref(
  basePath: string,
  preserved: Record<string, string | undefined>,
  state: FilterState,
  patch: Partial<Record<'cond' | 'tier' | 'auth' | 'rating', string | undefined>>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(preserved)) {
    if (v && v.length > 0) params.set(k, v);
  }

  const csvCond = patch.cond !== undefined ? patch.cond : state.conditions.join(',') || undefined;
  const csvTier = patch.tier !== undefined ? patch.tier : state.sellerTiers.join(',') || undefined;
  const csvAuth = patch.auth !== undefined ? patch.auth : state.authenticities.join(',') || undefined;
  const rating = patch.rating !== undefined ? patch.rating : state.minRating > 0 ? String(state.minRating) : undefined;

  if (csvCond) params.set('cond', csvCond);
  if (csvTier) params.set('tier', csvTier);
  if (csvAuth) params.set('auth', csvAuth);
  if (rating) params.set('rating', rating);

  // Reset page on any filter change.
  params.delete('page');

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function ProtoFilterSidebar({
  basePath,
  preservedParams,
  state,
  counts,
}: Props) {
  const anyFilterActive =
    state.conditions.length > 0 ||
    state.sellerTiers.length > 0 ||
    state.authenticities.length > 0 ||
    state.minRating > 0;

  return (
    <aside className="filter-sidebar">
      <FilterGroup label="Condition">
        {CONDITION_ORDER.map((c) => {
          const checked = state.conditions.includes(c);
          const count = counts.conditions[c] ?? 0;
          if (count === 0 && !checked) return null; // hide empty options unless already selected
          return (
            <FilterRow
              key={c}
              href={buildHref(basePath, preservedParams, state, {
                cond: toggleCsv(state.conditions, c),
              })}
              checked={checked}
              label={CONDITION_LABEL[c]}
              count={count}
            />
          );
        })}
      </FilterGroup>

      <FilterGroup label="Authenticity">
        {AUTHENTICITY_ORDER.map((a) => {
          const checked = state.authenticities.includes(a);
          const count = counts.authenticities[a] ?? 0;
          if (count === 0 && !checked) return null;
          return (
            <FilterRow
              key={a}
              href={buildHref(basePath, preservedParams, state, {
                auth: toggleCsv(state.authenticities, a),
              })}
              checked={checked}
              label={AUTHENTICITY_LABEL[a]}
              count={count}
            />
          );
        })}
      </FilterGroup>

      <FilterGroup label="Seller tier">
        {TIER_ORDER.map((t) => {
          const checked = state.sellerTiers.includes(t);
          const count = counts.sellerTiers[t] ?? 0;
          if (count === 0 && !checked) return null;
          return (
            <FilterRow
              key={t}
              href={buildHref(basePath, preservedParams, state, {
                tier: toggleCsv(state.sellerTiers, t),
              })}
              checked={checked}
              label={TIER_LABEL[t] ?? `Tier ${t}`}
              count={count}
            />
          );
        })}
      </FilterGroup>

      <FilterGroup label="Rating">
        <FilterRow
          href={buildHref(basePath, preservedParams, state, {
            rating: state.minRating === 4 ? undefined : '4',
          })}
          checked={state.minRating === 4}
          label="4★ & up"
        />
        <FilterRow
          href={buildHref(basePath, preservedParams, state, {
            rating: state.minRating === 3 ? undefined : '3',
          })}
          checked={state.minRating === 3}
          label="3★ & up"
        />
      </FilterGroup>

      {anyFilterActive && (
        <div className="filter-group">
          <Link
            href={buildHref(basePath, preservedParams, state, {
              cond: undefined,
              tier: undefined,
              auth: undefined,
              rating: undefined,
            })}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-action-primary)',
            }}
          >
            ← Clear all filters
          </Link>
        </div>
      )}
    </aside>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="filter-group">
      <div className="filter-group-label">{label}</div>
      {children}
    </div>
  );
}

function FilterRow({
  href,
  checked,
  label,
  count,
}: {
  href: string;
  checked: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className="filter-option"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <input type="checkbox" checked={checked} readOnly /> {label}
      {count !== undefined && (
        <span className="filter-option-count">{count}</span>
      )}
    </Link>
  );
}

// ────────────────────────────────────────────────────────────────────────
// URL parsing — also exported so /search and /c/[slug] can decode
// ────────────────────────────────────────────────────────────────────────

const VALID_CONDITIONS = new Set<ProductCondition>([
  'NEW',
  'LIKE_NEW',
  'USED_GOOD',
  'USED_FAIR',
  'REFURBISHED',
  'FOR_PARTS',
]);

const VALID_AUTHENTICITIES = new Set<AuthenticityStatus>([
  'PLATFORM_VERIFIED',
  'PROOF_PROVIDED',
  'CLAIMED',
  'UNCLAIMED',
]);

export function parseFilterParams(sp: {
  cond?: string;
  tier?: string;
  auth?: string;
  rating?: string;
}): FilterState {
  const conditions = (sp.cond ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ProductCondition => VALID_CONDITIONS.has(s as ProductCondition));

  const sellerTiers = (sp.tier ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 4);

  const authenticities = (sp.auth ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AuthenticityStatus =>
      VALID_AUTHENTICITIES.has(s as AuthenticityStatus),
    );

  const ratingNum = Number(sp.rating);
  const minRating = Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum : 0;

  return { conditions, sellerTiers, authenticities, minRating };
}
