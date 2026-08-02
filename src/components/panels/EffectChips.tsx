import clsx from 'clsx';
import type { EventEffects } from '../../game/types';

/**
 * Human-readable labels for one-shot effects. `inverted` marks the keys where a
 * negative number is the good outcome, so green always means "good for you".
 */
export const EFFECT_LABELS: Record<keyof EventEffects, { label: string; inverted?: boolean; suffix?: string }> = {
  treasury: { label: 'Treasury' },
  approval: { label: 'Approval' },
  stability: { label: 'Stability' },
  gdpShock: { label: 'GDP', suffix: '%' },
  population: { label: 'Population' },
  inflation: { label: 'Inflation', inverted: true, suffix: 'pp' },
  unemployment: { label: 'Unemployment', inverted: true, suffix: 'pp' },
  corruption: { label: 'Corruption', inverted: true },
  militaryStrength: { label: 'Military' },
  research: { label: 'Research', suffix: ' pts' },
  health: { label: 'Healthcare' },
  education: { label: 'Education' },
  happiness: { label: 'Happiness' },
  crime: { label: 'Crime', inverted: true },
  emissions: { label: 'Emissions', inverted: true, suffix: '%' },
  softPower: { label: 'Soft power' },
  civilLiberties: { label: 'Civil liberties' },
  infrastructure: { label: 'Infrastructure' },
  inequality: { label: 'Inequality', inverted: true },
  intelligence: { label: 'Intelligence' },
  globalRelations: { label: 'World relations' },
  relations: { label: 'Relations' },
};

/** Renders a one-shot effects block as coloured chips, strongest first. */
export function EffectChips({
  effects,
  muted,
  className,
}: {
  effects: EventEffects;
  muted?: boolean;
  className?: string;
}) {
  const entries = (Object.entries(effects) as [keyof EventEffects, unknown][])
    .filter(([key, value]) => key !== 'relations' && typeof value === 'number' && value !== 0)
    .sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number));

  if (entries.length === 0) return null;

  return (
    <div className={clsx('flex flex-wrap gap-1', className)}>
      {entries.map(([key, raw]) => {
        const value = raw as number;
        const meta = EFFECT_LABELS[key];
        const good = meta.inverted ? value < 0 : value > 0;
        const display =
          key === 'population'
            ? `${value > 0 ? '+' : ''}${Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`
            : `${value > 0 ? '+' : ''}${value}${meta.suffix ?? ''}`;
        return (
          <span
            key={key}
            className={clsx(
              'num rounded px-1.5 py-0.5 text-[10px] font-medium',
              muted
                ? 'bg-white/[0.06] text-slate-400'
                : good
                  ? 'bg-aurora-lime/12 text-aurora-lime'
                  : 'bg-aurora-red/12 text-aurora-red',
            )}
          >
            {meta.label} {display}
          </span>
        );
      })}
    </div>
  );
}
