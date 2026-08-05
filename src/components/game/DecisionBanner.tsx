import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import { EVENT_INDEX } from '../../game/data/events';
import { costScale, formatMoney } from '../../game/selectors';
import { choiceAvailable } from '../../game/engine/events';
import { recommendChoice } from '../../game/engine/delegation';
import { useGameStore } from '../../store/gameStore';
import { useUiStore } from '../../store/uiStore';
import { Badge, Button } from '../ui/primitives';
import { EffectChips } from '../panels/EffectChips';

/**
 * The decision, docked rather than thrown at you.
 *
 * This is what the "never pop up" setting shows instead of the modal. Time is
 * still stopped — a decision genuinely does block the month — but nothing
 * covers the screen, so the player can go and read the treasury before
 * answering. It also carries the cabinet's own recommendation, which is the
 * thing the modal never had room for.
 */
export function DecisionBanner({ game }: { game: GameState }) {
  const mode = useUiStore((s) => s.prefs.eventMode);
  const { chooseEventOption } = useGameStore();
  const [expanded, setExpanded] = useState(true);

  const pending = game.eventQueue[0];
  const def = pending ? EVENT_INDEX[pending.defId] : null;
  const scale = useMemo(() => costScale(game.economy.gdp), [game.economy.gdp]);
  const recommended = useMemo(
    () => (pending ? recommendChoice(game, pending.defId) : null),
    [game, pending],
  );

  // Only the inline mode renders here; the modal owns the other paths, and a
  // delegated decision never reaches the player at all.
  if (mode !== 'inline' || !def || game.gameOver) return null;

  const symbol = game.identity.currency.symbol;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-14 z-20 border-b border-aurora-amber/25 bg-aurora-amber/[0.07] backdrop-blur-xl"
    >
      <div className="px-3 py-2.5 sm:px-5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="focus-ring flex w-full items-center gap-2.5 rounded-lg text-left"
          aria-expanded={expanded}
        >
          <span className="text-lg leading-none">{def.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-white">{def.title}</span>
              <Badge tone={def.severity === 'critical' ? 'bad' : def.severity === 'major' ? 'warn' : 'info'}>
                Decision required
              </Badge>
            </span>
            {!expanded && (
              <span className="mt-0.5 block truncate text-[11px] text-slate-400">{def.description}</span>
            )}
          </span>
          <ChevronDown
            size={16}
            className={clsx('shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')}
          />
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{def.description}</p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {def.choices.map((choice) => {
                  const availability = choiceAvailable(game, choice);
                  const cost = (choice.cost ?? 0) * scale;
                  const isPick = recommended?.id === choice.id;
                  return (
                    <div
                      key={choice.id}
                      className={clsx(
                        'rounded-xl border p-3 transition',
                        isPick
                          ? 'border-gold-500/45 bg-gold-500/[0.07]'
                          : availability.enabled
                            ? 'border-white/10 bg-white/[0.03]'
                            : 'border-white/[0.06] bg-white/[0.01] opacity-60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-white">{choice.label}</p>
                        {isPick && (
                          <Badge tone="gold" className="shrink-0">
                            <Sparkles size={9} /> Cabinet
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{choice.description}</p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {cost > 0 && (
                          <Badge tone={game.economy.treasury >= cost ? 'neutral' : 'bad'}>
                            {formatMoney(cost, symbol)}
                          </Badge>
                        )}
                        {choice.riskChance !== undefined && (
                          <Badge tone="warn">
                            <AlertTriangle size={9} /> {(choice.riskChance * 100).toFixed(0)}% risk
                          </Badge>
                        )}
                      </div>

                      <EffectChips effects={choice.effects} className="mt-1.5" />

                      <Button
                        size="sm"
                        full
                        className="mt-2.5"
                        variant={isPick ? 'primary' : 'secondary'}
                        disabled={!availability.enabled}
                        onClick={() => chooseEventOption(choice.id)}
                      >
                        {availability.enabled ? 'Choose this' : availability.reason}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
