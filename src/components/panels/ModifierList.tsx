import clsx from 'clsx';
import type { Modifiers } from '../../game/types';
import { INVERTED_MODIFIERS, MODIFIER_LABELS } from '../../game/types';

/**
 * Renders a modifier bundle as coloured chips, strongest effect first.
 * Green always means "good for the player", which is why inverted keys
 * (inflation, corruption, crime…) flip their sign test.
 */
export function ModifierList({
  modifiers,
  limit,
  className,
}: {
  modifiers: Modifiers;
  limit?: number;
  className?: string;
}) {
  const entries = (Object.entries(modifiers) as [keyof Modifiers, number | undefined][])
    .filter((entry): entry is [keyof Modifiers, number] => typeof entry[1] === 'number' && entry[1] !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const shown = limit ? entries.slice(0, limit) : entries;
  if (shown.length === 0) return null;

  return (
    <div className={clsx('flex flex-wrap gap-1', className)}>
      {shown.map(([key, value]) => {
        const good = INVERTED_MODIFIERS.has(key) ? value < 0 : value > 0;
        return (
          <span
            key={key}
            className={clsx(
              'num rounded px-1.5 py-0.5 text-[10px] font-medium',
              good ? 'bg-aurora-lime/12 text-aurora-lime' : 'bg-aurora-red/12 text-aurora-red',
            )}
          >
            {MODIFIER_LABELS[key]} {value > 0 ? '+' : ''}
            {value}
          </span>
        );
      })}
      {limit && entries.length > limit && (
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">
          +{entries.length - limit} more
        </span>
      )}
    </div>
  );
}
