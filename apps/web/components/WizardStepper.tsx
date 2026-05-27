interface Props {
  current: 1 | 2 | 3;
}

const STEPS: Array<{ n: 1 | 2 | 3; label: string; sub: string }> = [
  { n: 1, label: 'Business', sub: 'Name + contact' },
  { n: 2, label: 'Location', sub: 'Where you sell from' },
  { n: 3, label: 'Plan', sub: 'Commission rate' },
];

export function WizardStepper({ current }: Props) {
  return (
    <ol className="flex items-stretch gap-2">
      {STEPS.map((s, i) => {
        const isActive = s.n === current;
        const isDone = s.n < current;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-3">
            <span
              aria-hidden
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                isActive
                  ? 'bg-blue-700 text-neutral-0'
                  : isDone
                  ? 'bg-emerald-600 text-neutral-0'
                  : 'bg-neutral-200 text-neutral-500'
              }`}
            >
              {isDone ? '✓' : s.n}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={`truncate text-xs font-bold uppercase tracking-widest ${
                  isActive ? 'text-blue-700' : 'text-neutral-500'
                }`}
              >
                {s.label}
              </div>
              <div className="truncate text-xs text-neutral-600">{s.sub}</div>
            </div>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className={`hidden h-px flex-1 ${
                  isDone ? 'bg-emerald-300' : 'bg-neutral-200'
                } md:block`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
