import type { BuyerStage } from '../lib/order-stage';

interface Props {
  /** 0-4, or null for terminal/failure states (renders muted strip) */
  currentStage: BuyerStage | null;
}

const STAGES: { n: BuyerStage; label: string }[] = [
  { n: 0, label: 'Paid' },
  { n: 1, label: 'Preparing' },
  { n: 2, label: 'Code live' },
  { n: 3, label: 'Arriving' },
  { n: 4, label: 'Delivered' },
];

export function OrderStageStrip({ currentStage }: Props) {
  return (
    <ol className="flex w-full items-start gap-2 md:gap-4">
      {STAGES.map((s, idx) => {
        const isCurrent = currentStage === s.n;
        const isPast = currentStage !== null && currentStage > s.n;
        const isMuted = currentStage === null || (!isCurrent && !isPast);

        return (
          <li
            key={s.n}
            className={`flex flex-1 flex-col items-center gap-2 ${idx > 0 ? 'border-l border-neutral-200 pl-2 md:pl-4' : ''}`}
          >
            <span
              aria-hidden
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-2 transition ${
                isCurrent
                  ? 'bg-blue-700 text-neutral-0 ring-blue-700'
                  : isPast
                    ? 'bg-emerald-600 text-neutral-0 ring-emerald-600'
                    : 'bg-neutral-0 text-neutral-400 ring-neutral-300'
              }`}
              style={isCurrent ? { boxShadow: '0 0 0 4px rgba(26, 61, 174, 0.15)' } : undefined}
            >
              {isPast ? '✓' : s.n + 1}
            </span>
            <span
              className={`text-center text-[10px] font-bold uppercase tracking-wider md:text-xs ${
                isCurrent
                  ? 'text-blue-700'
                  : isPast
                    ? 'text-emerald-700'
                    : isMuted
                      ? 'text-neutral-400'
                      : 'text-neutral-600'
              }`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
