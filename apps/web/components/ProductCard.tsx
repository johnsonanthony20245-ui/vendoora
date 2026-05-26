import Link from 'next/link';
import Image from 'next/image';
import { TrustPill, KycTierBadge, ConditionPill } from './TrustPills';

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  base_price: number | string; // Decimal serializes as string
  compare_at_price: number | string | null;
  condition: string;
  seller: {
    business_slug: string;
    business_name: string;
    kyc_tier: number;
  };
  primary_image_url: string | null;
}

interface Props {
  product: ProductCardData;
  compact?: boolean;
}

export function ProductCard({ product, compact = false }: Props) {
  const href = `/p/${product.seller.business_slug}/${product.slug}`;
  const price = Number(product.base_price);
  const compareAt = product.compare_at_price ? Number(product.compare_at_price) : null;
  const hasDiscount = compareAt !== null && compareAt > price;

  return (
    <Link
      href={href}
      className={`group block rounded-xl border border-neutral-200 bg-neutral-0 transition hover:border-blue-700 hover:shadow-md ${compact ? '' : ''}`}
      style={{ boxShadow: 'var(--shadow-xs)' }}
    >
      <div className="relative aspect-square overflow-hidden rounded-t-xl bg-neutral-100">
        {product.primary_image_url ? (
          <Image
            src={product.primary_image_url}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-400">📦</div>
        )}
        {hasDiscount && (
          <span className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-0">
            Sale
          </span>
        )}
      </div>

      <div className="p-3">
        <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-neutral-900">
          {product.name}
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-600">
          <span className="truncate">{product.seller.business_name}</span>
          <KycTierBadge tier={product.seller.kyc_tier} />
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-base font-bold text-neutral-900">${price.toFixed(2)}</span>
          {hasDiscount && compareAt !== null && (
            <span className="text-xs text-neutral-500 line-through">${compareAt.toFixed(2)}</span>
          )}
        </div>

        {!compact && (
          <div className="mt-2 flex flex-wrap gap-1">
            <ConditionPill condition={product.condition} />
            <TrustPill variant="escrow">ESCROW</TrustPill>
            <TrustPill variant="code">CODE</TrustPill>
          </div>
        )}
      </div>
    </Link>
  );
}
