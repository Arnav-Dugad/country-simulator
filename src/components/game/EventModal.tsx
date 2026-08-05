import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronRight, Dices, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import type { EventChoice, GameState } from '../../game/types';
import { EVENT_INDEX } from '../../game/data/events';
import { costScale, formatMoney } from '../../game/selectors';
import { choiceAvailable } from '../../game/engine/events';
import { recommendChoice } from '../../game/engine/delegation';
import { useGameStore } from '../../store/gameStore';
import { Badge, Button, Modal, Tooltip } from '../ui/primitives';
import { ModifierList } from '../panels/ModifierList';
import { EffectChips } from '../panels/EffectChips';

const SEVERITY: Record<string, { label: string; tone: 'neutral' | 'info' | 'warn' | 'bad'; ring: string }> = {
  trivial: { label: 'Routine', tone: 'neutral', ring: 'border-white/15' },
  minor: { label: 'Notable', tone: 'info', ring: 'border-aurora-blue/30' },
  major: { label: 'Major', tone: 'warn', ring: 'border-aurora-amber/35' },
  critical: { label: 'Critical', tone: 'bad', ring: 'border-aurora-red/40' },
};

export function EventModal({ game }: { game: GameState }) {
  const { chooseEventOption } = useGameStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  const pending = game.eventQueue[0];
  const def = pending ? EVENT_INDEX[pending.defId] : null;
  const scale = useMemo(() => costScale(game.economy.gdp), [game.economy.gdp]);
  const symbol = game.identity.currency.symbol;

  // What a competent cabinet would do — the same scoring the delegation
  // setting uses, surfaced here so the recommendation is available to
  // everyone rather than only to players who hand the decision over.
  const recommended = useMemo(
    () => (pending ? recommendChoice(game, pending.defId) : null),
    [game, pending],
  );

  if (!def) return null;
  const severity = SEVERITY[def.severity] ?? SEVERITY.minor;

  return (
    <Modal
      open
      onClose={() => {}}
      dismissable={false}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-2xl">{def.icon}</span>
          {def.title}
          <Badge tone={severity.tone}>{severity.label}</Badge>
        </span>
      }
      subtitle={<span className="capitalize">{def.category} · this decision cannot be deferred</span>}
      footer={
        recommended ? (
          <Button
            variant="secondary"
            full
            icon={<Sparkles size={14} />}
            onClick={() => chooseEventOption(recommended.id)}
          >
            Let the cabinet decide — {recommended.label}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-300">{def.description}</p>

        <div className="space-y-2.5">
          {def.choices.map((choice, index) => (
            <ChoiceRow
              key={choice.id}
              choice={choice}
              index={index}
              game={game}
              scale={scale}
              symbol={symbol}
              recommended={recommended?.id === choice.id}
              expanded={expanded === choice.id}
              onToggle={() => setExpanded(expanded === choice.id ? null : choice.id)}
              onSelect={() => chooseEventOption(choice.id)}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ChoiceRow({
  choice, index, game, scale, symbol, recommended, expanded, onToggle, onSelect,
}: {
  choice: EventChoice;
  index: number;
  game: GameState;
  scale: number;
  symbol: string;
  recommended: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const availability = choiceAvailable(game, choice);
  const cost = (choice.cost ?? 0) * scale;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className={clsx(
        'rounded-xl border transition',
        recommended
          ? 'border-gold-500/45 bg-gold-500/[0.06]'
          : availability.enabled
            ? 'border-white/12 bg-white/[0.03] hover:border-gold-500/40'
            : 'border-white/[0.07] bg-white/[0.015] opacity-60',
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
              {choice.label}
              {recommended && (
                <Tooltip label="Your cabinet weighs each option's real effects against what the country needs right now. This is what they would do.">
                  <Badge tone="gold">
                    <Sparkles size={9} /> Cabinet's pick
                  </Badge>
                </Tooltip>
              )}
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{choice.description}</p>
          </div>
          {choice.riskChance !== undefined && (
            <Tooltip label={`Roughly a ${(choice.riskChance * 100).toFixed(0)}% chance this backfires. Stable, low-corruption states with good intelligence gamble better.`}>
              <Badge tone="warn" className="shrink-0">
                <Dices size={10} /> {(choice.riskChance * 100).toFixed(0)}% risk
              </Badge>
            </Tooltip>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {cost > 0 && (
            <Badge tone={game.economy.treasury >= cost ? 'neutral' : 'bad'}>
              {formatMoney(cost, symbol)}
            </Badge>
          )}
          {choice.temporaryModifiers && (
            <Badge tone="info">
              {choice.temporaryModifiers.label} ·{' '}
              {choice.temporaryModifiers.months > 900 ? 'permanent' : `${choice.temporaryModifiers.months}mo`}
            </Badge>
          )}
        </div>

        <EffectChips effects={choice.effects} className="mt-2" />

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant={availability.enabled ? 'primary' : 'secondary'}
            disabled={!availability.enabled}
            onClick={onSelect}
            className="flex-1"
          >
            {availability.enabled ? 'Choose this' : availability.reason}
          </Button>
          {(choice.failureEffects || choice.temporaryModifiers) && (
            <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={expanded}>
              <ChevronRight size={14} className={clsx('transition-transform', expanded && 'rotate-90')} />
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/[0.07]"
          >
            <div className="space-y-3 p-4">
              {choice.temporaryModifiers && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Ongoing effect — {choice.temporaryModifiers.label}
                  </p>
                  <ModifierList modifiers={choice.temporaryModifiers.modifiers} className="mt-1.5" />
                </div>
              )}
              {choice.failureEffects && (
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-aurora-amber">
                    <AlertTriangle size={11} /> If it goes wrong
                  </p>
                  <EffectChips effects={choice.failureEffects} muted />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
