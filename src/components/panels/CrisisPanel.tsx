import { AlertOctagon, Check, Clock, Lock, ShieldCheck, TrendingDown } from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import { CRISIS_CATEGORY_LABELS, CRISIS_INDEX } from '../../game/data/crises';
import { formatMoney } from '../../game/selectors';
import { responseAvailability } from '../../game/engine/crises';
import { useGameStore } from '../../store/gameStore';
import { Badge, Button, Card, EmptyState, Meter, Reveal, Stat, Tooltip } from '../ui/primitives';
import { EffectChips } from './EffectChips';
import { ModifierList } from './ModifierList';

/**
 * The crisis room.
 *
 * Events are one decision in one month. Crises are conditions that sit on the
 * country, apply a monthly drag, and escalate on a timer until they are dealt
 * with — so this panel is built around the two numbers that matter: how bad it
 * is now, and how long until it gets worse.
 */
export function CrisisPanel({ game }: { game: GameState }) {
  const { respondToCrisis } = useGameStore();
  const symbol = game.identity.currency.symbol;

  const sorted = [...game.crises].sort((a, b) => b.severity - a.severity);
  const avgSeverity = game.crises.length
    ? game.crises.reduce((sum, c) => sum + c.severity, 0) / game.crises.length
    : 0;

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Active crises"
            value={game.crises.length}
            accent={game.crises.length > 0 ? '#ff5c6c' : '#7ee787'}
            icon={<AlertOctagon size={14} />}
          />
          <Stat label="Average severity" value={avgSeverity.toFixed(0)} hint="Lower is better" accent="#ffb648" />
          <Stat label="Crises resolved" value={game.records.crisesResolved} accent="#7ee787" icon={<ShieldCheck size={14} />} />
          <Stat
            label="Political capital"
            value={Math.floor(game.governance.capital)}
            hint={`${game.governance.capitalPerMonth >= 0 ? '+' : ''}${game.governance.capitalPerMonth.toFixed(1)}/mo`}
            accent="#9d6bff"
          />
        </div>
      </Reveal>

      {sorted.length === 0 ? (
        <Reveal delay={0.05}>
          <EmptyState
            icon="🕊️"
            title="No crisis in progress"
            body="Nothing is currently escalating. Crises open when the country genuinely reaches the condition that causes them — a collapsed credit rating, runaway inflation, a grid below 90% of demand, water stress past 74, a province past 62 separatism. Every one of those is visible elsewhere before it becomes a crisis here."
          />
        </Reveal>
      ) : (
        sorted.map((crisis, index) => {
          const def = CRISIS_INDEX[crisis.defId];
          if (!def) return null;
          const stage = def.stages[crisis.stage];
          const monthsToEscalate = Math.max(0, (stage?.months ?? 0) - crisis.monthsInStage);
          const finalStage = crisis.stage >= def.stages.length - 1;

          return (
            <Reveal key={crisis.id} delay={0.05 + index * 0.04}>
              <Card
                className="border-aurora-red/30 bg-aurora-red/[0.04]"
                title={def.name}
                icon={def.icon}
                subtitle={`${CRISIS_CATEGORY_LABELS[def.category]} · stage ${crisis.stage + 1} of ${def.stages.length} · began month ${crisis.startedTurn}`}
                action={
                  <Badge tone={crisis.severity > 60 ? 'bad' : crisis.severity > 30 ? 'warn' : 'good'}>
                    Severity {crisis.severity.toFixed(0)}
                  </Badge>
                }
              >
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-white">{stage?.label}</span>
                      <span className="num flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock size={10} />
                        {finalStage
                          ? `${monthsToEscalate} month${monthsToEscalate === 1 ? '' : 's'} before permanent damage`
                          : `escalates in ${monthsToEscalate} month${monthsToEscalate === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <Meter value={crisis.severity} height={7} inverted />
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">{stage?.description}</p>
                  </div>

                  {stage && (
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        Costing us every month
                      </p>
                      <ModifierList modifiers={stage.modifiers} />
                    </div>
                  )}

                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      <TrendingDown size={10} />
                      If it runs its full course unresolved
                    </p>
                    <EffectChips effects={def.climax} />
                  </div>

                  <div className="space-y-2 border-t border-white/[0.07] pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Responses — each can be attempted once
                    </p>
                    {def.responses.map((response) => {
                      const availability = responseAvailability(game, crisis.id, response.id);
                      return (
                        <div
                          key={response.id}
                          className={clsx(
                            'rounded-xl border p-3',
                            availability.used
                              ? 'border-white/[0.05] bg-white/[0.02] opacity-60'
                              : availability.enabled
                                ? 'border-white/10 bg-white/[0.03]'
                                : 'border-white/[0.05] bg-white/[0.02]',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white">{response.label}</p>
                              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                                {response.description}
                              </p>
                            </div>
                            {availability.used && <Badge tone="neutral"><Check size={9} /> Used</Badge>}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                            <span className="num">
                              Cost {response.cost > 0 ? formatMoney(availability.cost, symbol) : 'none'}
                            </span>
                            <span className="num">Political capital {response.politicalCost}</span>
                            <span className="num text-aurora-lime">−{response.severityRelief} severity</span>
                            {response.riskChance !== undefined && (
                              <span className="num text-aurora-amber">
                                {(response.riskChance * 100).toFixed(0)}% chance it achieves nothing
                              </span>
                            )}
                          </div>

                          {response.effects && <EffectChips effects={response.effects} className="mt-2" />}

                          <div className="mt-3">
                            <Tooltip label={availability.reason ?? 'Apply this response'}>
                              <Button
                                size="sm"
                                variant={availability.enabled ? 'primary' : 'secondary'}
                                full
                                disabled={!availability.enabled}
                                icon={availability.enabled ? undefined : <Lock size={12} />}
                                onClick={() => respondToCrisis(crisis.id, response.id)}
                              >
                                {availability.enabled ? response.label : availability.reason}
                              </Button>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </Reveal>
          );
        })
      )}

      <Reveal delay={0.2}>
        <Card title="How crises work" icon="📖">
          <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
            <li>
              <span className="font-semibold text-slate-200">They are conditions, not events.</span> A crisis
              opens because the country reached the state that causes it, and it applies its modifiers every
              month until it is dealt with. Time does not stop for one.
            </li>
            <li>
              <span className="font-semibold text-slate-200">Severity is the dial.</span> It climbs on its own
              and falls when you respond. Below 8 the crisis is over. Every response you apply also leaves
              lasting downward pressure, so a well-managed crisis keeps improving.
            </li>
            <li>
              <span className="font-semibold text-slate-200">Stages escalate on a timer.</span> Each one is
              worse than the last. Reaching the end of the final stage applies the permanent damage shown
              above — that is the thing worth spending real money to avoid.
            </li>
            <li>
              <span className="font-semibold text-slate-200">Three at once, maximum.</span> A bad decade can
              stack them, but the game will not make the country unplayable.
            </li>
          </ul>
        </Card>
      </Reveal>
    </div>
  );
}
