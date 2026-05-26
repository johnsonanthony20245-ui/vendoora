import type { ReactNode } from 'react';

interface PillProps {
  children: ReactNode;
  variant: 'escrow' | 'code' | 'kyc-t2' | 'kyc-t3' | 'kyc-t4' | 'condition-new' | 'condition-like-new';
  className?: string;
}

const variantStyles: Record<PillProps['variant'], string> = {
  escrow: 'bg-blue-50 text-blue-700 ring-blue-200',
  code: 'bg-red-50 text-red-600 ring-red-200',
  'kyc-t2': 'bg-neutral-100 text-neutral-700 ring-neutral-300',
  'kyc-t3': 'bg-blue-50 text-blue-700 ring-blue-200',
  'kyc-t4': 'bg-amber-50 text-amber-700 ring-amber-200',
  'condition-new': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'condition-like-new': 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function TrustPill({ children, variant, className = '' }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function KycTierBadge({ tier }: { tier: number }) {
  if (tier >= 4) return <TrustPill variant="kyc-t4">T4 ELITE</TrustPill>;
  if (tier >= 3) return <TrustPill variant="kyc-t3">T3 VERIFIED</TrustPill>;
  if (tier >= 2) return <TrustPill variant="kyc-t2">T2 VERIFIED</TrustPill>;
  return <TrustPill variant="kyc-t2">T{tier}</TrustPill>;
}

export function ConditionPill({ condition }: { condition: string }) {
  if (condition === 'NEW') return <TrustPill variant="condition-new">NEW</TrustPill>;
  if (condition === 'LIKE_NEW') return <TrustPill variant="condition-like-new">LIKE NEW</TrustPill>;
  return <TrustPill variant="kyc-t2">{condition.replace('_', ' ')}</TrustPill>;
}
