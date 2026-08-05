import { useMemo, useState } from 'react';
import { ArrowRight, HelpCircle, TrendingDown } from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import {
  explain,
  worstTerms,
  type ExplainTerm,
  type ExplainableId,
  type Explanation,
} from '../../game/engine/explain';
import { useUiStore } from '../../store/uiStore';
import { Modal, meterColor } from '../ui/primitives';

/**
 * "Why is this number this?"
 *
 * A small affordance next to any headline index that opens the engine's own
 * arithmetic — every term, its contribution, the sum, and how fast the value
 * is moving toward it. The numbers are not a re-description of the simulation;
 * `explain.ts` owns the target formulas and `tick` reads them from there, so
 * what is on screen is literally what is being executed.
 */

export function Inspect({
  game,
  id,
  className,
  label,
}: {
  game: GameState;
  id: ExplainableId;
  className?: string;
  /** Overrides the accessible name; defaults to the metric's own label. */
  label?: string;
}) {
  const enabled = useUiStore((s) => s.prefs.showInspector);
  const [open, setOpen] = useState(false);

  const explanation = useMemo(
    () => (open ? explain(game, id) : null),
    [open, game, id],
  );

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={clsx(
          'focus-ring inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/10 hover:text-gold-400',
          className,
        )}
        aria-label={`Why is ${label ?? id} this number?`}
        title="Why is this number this?"
      >
        <HelpCircle size={13} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title={explanation ? `Why is ${explanation.label.toLowerCase()} ${formatValue(explanation, explanation.current)}?` : ''}
        subtitle="Every term the engine is applying, live"
      >
        {explanation && <ExplanationBody explanation={explanation} />}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Body                                                                */
/* ------------------------------------------------------------------ */

function formatValue(e: Explanation, value: number): string {
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}${e.unit}`;
}

export function ExplanationBody({ explanation: e }: { explanation: Explanation }) {
  const gap = e.target - e.current;
  const perMonth = gap * e.approach;
  const worst = worstTerms(e, 2);
  const magnitude = Math.max(
    ...e.terms.map((t) => Math.abs(e.multiplicative ? t.value - 1 : t.value)),
    0.001,
  );

  // A term is good for the player when it pushes the metric the helpful way.
  const toneOf = (t: ExplainTerm): 'good' | 'bad' | 'flat' => {
    const magnitudeOf = e.multiplicative ? t.value - 1 : t.value;
    if (Math.abs(magnitudeOf) < 0.005) return 'flat';
    const helps = e.inverted ? magnitudeOf < 0 : magnitudeOf > 0;
    return helps ? 'good' : 'bad';
  };

  return (
    <div className="space-y-5">
      {/* Where it is going, and how fast */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Now</p>
            <p className="num text-2xl font-bold text-white">{formatValue(e, e.current)}</p>
          </div>
          <ArrowRight size={18} className="text-slate-600" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Heading for</p>
            <p className="num text-2xl font-bold" style={{ color: meterColor(barPercent(e, e.target), e.inverted) }}>
              {formatValue(e, e.target)}
            </p>
          </div>
          {e.approach < 1 && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">This month</p>
              <p
                className={clsx(
                  'num text-lg font-bold',
                  Math.abs(perMonth) < 0.005
                    ? 'text-slate-400'
                    : (perMonth > 0) !== Boolean(e.inverted)
                      ? 'text-aurora-lime'
                      : 'text-aurora-red',
                )}
              >
                {perMonth >= 0 ? '+' : ''}
                {perMonth.toFixed(Math.abs(perMonth) >= 10 ? 0 : 2)}
              </p>
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          {e.approach >= 1 ? (
            <>This is recomputed from scratch every month rather than drifting toward a target.</>
          ) : (
            <>
              It closes <span className="num font-semibold text-slate-200">{(e.approach * 100).toFixed(0)}%</span> of the
              remaining gap each month, so roughly{' '}
              <span className="num font-semibold text-slate-200">
                {Math.abs(gap) < 0.01 ? 'no' : `${halfLife(e.approach)}`}
              </span>{' '}
              {Math.abs(gap) < 0.01 ? 'movement is left' : 'months to close half of what is left'}.
            </>
          )}
          {e.noise !== undefined && (
            <> A random ±{e.noise.toFixed(2)} is added on top each month, which is why it never sits perfectly still.</>
          )}
        </p>

        {Math.abs(e.raw - e.target) > 0.01 && (
          <p className="mt-2 rounded-lg bg-aurora-amber/[0.08] px-2.5 py-1.5 text-[11px] leading-relaxed text-aurora-amber">
            The terms sum to {e.raw.toFixed(1)}, which is outside the {e.bounds[0]}–
            {Number.isFinite(e.bounds[1]) ? e.bounds[1] : '∞'} range this index is capped to. Anything past the cap is
            being thrown away.
          </p>
        )}
      </div>

      {/* The arithmetic */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {e.multiplicative ? 'Factors — these multiply' : 'Terms — these add up'}
        </p>
        <ul className="space-y-1.5">
          {e.terms.map((t, i) => {
            const tone = toneOf(t);
            const width = (Math.abs(e.multiplicative ? t.value - 1 : t.value) / magnitude) * 100;
            return (
              <li key={`${t.label}-${i}`} className="group/term">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-xs text-slate-300">{t.label}</span>
                  <span
                    className={clsx(
                      'num shrink-0 text-xs font-semibold tabular-nums',
                      tone === 'good' ? 'text-aurora-lime' : tone === 'bad' ? 'text-aurora-red' : 'text-slate-500',
                    )}
                  >
                    {e.multiplicative ? `×${t.value.toFixed(2)}` : `${t.value >= 0 ? '+' : ''}${t.value.toFixed(2)}`}
                  </span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, width)}%`,
                      background: tone === 'good' ? '#7ee787' : tone === 'bad' ? '#ff5c6c' : '#475569',
                    }}
                  />
                </div>
                {t.hint && <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">{t.hint}</p>}
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-2">
          <span className="text-xs font-semibold text-white">{e.multiplicative ? 'Product' : 'Total'}</span>
          <span className="num text-xs font-bold text-white">{e.raw.toFixed(2)}</span>
        </div>
      </div>

      {/* What to fix */}
      {worst.length > 0 && (
        <div className="rounded-xl border border-aurora-red/25 bg-aurora-red/[0.05] p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-aurora-red">
            <TrendingDown size={12} /> Holding it back most
          </p>
          <ul className="mt-1.5 space-y-1">
            {worst.map((t, i) => (
              <li key={`${t.label}-${i}`} className="text-[11px] leading-relaxed text-slate-300">
                <span className="font-semibold text-white">{t.label}</span>{' '}
                <span className="num text-aurora-red">
                  {e.multiplicative ? `×${t.value.toFixed(2)}` : `${t.value.toFixed(2)}`}
                </span>
                {t.hint && <span className="text-slate-500"> — {t.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">{e.note}</p>
    </div>
  );
}

function barPercent(e: Explanation, value: number): number {
  const [min, max] = e.bounds;
  if (!Number.isFinite(max)) return Math.min(100, Math.max(0, value));
  return ((value - min) / Math.max(0.0001, max - min)) * 100;
}

/** Months for the remaining gap to halve at this approach rate. */
function halfLife(approach: number): number {
  if (approach <= 0 || approach >= 1) return 1;
  return Math.max(1, Math.round(Math.log(0.5) / Math.log(1 - approach)));
}
