import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import { Scale, TrendingDown, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import type { FactionId, GameState } from '../../game/types';
import { FACTIONS, FACTION_INDEX } from '../../game/data/factions';
import { factionModifiers } from '../../game/selectors';
import { coupRisk, factionTargets } from '../../game/engine/politics';
import { Badge, Card, Meter, Reveal, Stat, meterColor } from '../ui/primitives';
import { ModifierList } from './ModifierList';
import { chartTooltip } from './chartHelpers';

const FACTION_COLORS: Record<FactionId, string> = {
  business: '#f5d073',
  labour: '#ff5c6c',
  military: '#ffb648',
  clergy: '#b08968',
  intelligentsia: '#3ddbd9',
  regions: '#7ee787',
};

/**
 * Interest groups.
 *
 * Parties contest elections; these people run the country between them. The
 * panel is built to make one thing obvious: every faction's mood is the sum of
 * decisions the player made elsewhere, and it is currently producing a real
 * modifier on the simulation whether they have looked at it or not.
 */
export function FactionsPanel({ game }: { game: GameState }) {
  const targets = useMemo(() => factionTargets(game), [game]);
  const aggregate = useMemo(() => factionModifiers(game), [game]);
  const risk = coupRisk(game);

  const pieData = game.factions.map((f) => ({
    name: FACTION_INDEX[f.id]?.name ?? f.id,
    value: Number(f.influence.toFixed(1)),
    id: f.id,
  }));

  const average = game.factions.length
    ? game.factions.reduce((sum, f) => sum + f.satisfaction, 0) / game.factions.length
    : 50;
  const hostile = game.factions.filter((f) => f.satisfaction < 30);

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average satisfaction" value={average.toFixed(0)} accent={meterColor(average)} icon={<Scale size={14} />} />
          <Stat label="Hostile groups" value={hostile.length} hint="Below 30 they work against you" accent="#ff5c6c" />
          <Stat
            label="Coup risk"
            value={`${(risk * 100).toFixed(2)}%`}
            hint="Per month, from the armed forces"
            accent={risk > 0.01 ? '#ff5c6c' : '#7ee787'}
          />
          <Stat label="Legislative support" value={`${game.governance.legislativeSupport.toFixed(0)}%`} accent="#9d6bff" />
        </div>
      </Reveal>

      {risk > 0.005 && (
        <Reveal delay={0.03}>
          <div className="rounded-xl border border-aurora-red/35 bg-aurora-red/[0.07] p-4">
            <p className="text-sm font-semibold text-aurora-red">The armed forces are a standing risk</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              At their current satisfaction and influence there is roughly a {(risk * 100).toFixed(2)}% chance
              per month that the officer corps moves against the government — about{' '}
              {(1 - Math.pow(1 - risk, 12) > 0.01 ? ((1 - Math.pow(1 - risk, 12)) * 100).toFixed(1) : '<1')}% over
              the next year. Defence funding is the fastest lever; stability and mandate both restrain them.
              {game.settings.neverEndGame && ' In eternal mode an attempt will fail rather than end the campaign, but it will cost you badly.'}
            </p>
          </div>
        </Reveal>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal delay={0.05}>
          <Card title="Distribution of influence" subtitle="Who actually holds power" icon="⚖️">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                  {pieData.map((entry) => (
                    <Cell key={entry.id} fill={FACTION_COLORS[entry.id as FactionId]} />
                  ))}
                </Pie>
                <RTooltip {...chartTooltip} formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Influence shifts with the shape of the economy and the state. Industrialising moves power toward
              business and labour; war and defence spending move it toward the armed forces; devolution moves
              it toward the provinces.
            </p>
          </Card>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-2">
          <Card
            title="Net effect on the country"
            subtitle="What the current balance of moods is doing to the simulation right now"
            icon="✨"
          >
            {Object.keys(aggregate).length === 0 ? (
              <p className="text-xs text-slate-500">
                Every group is close to neutral. Nobody is helping and nobody is in the way.
              </p>
            ) : (
              <ModifierList modifiers={aggregate} />
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              A faction at 50 is neutral. Above it they contribute their support; below it they obstruct. The
              size of either is scaled by how much influence they hold, which is why annoying a marginal group
              is survivable and annoying a dominant one is not.
            </p>
          </Card>
        </Reveal>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {FACTIONS.map((def, i) => {
          const state = game.factions.find((f) => f.id === def.id);
          if (!state) return null;
          const target = targets[def.id] ?? state.satisfaction;
          const trending = target - state.satisfaction;
          const pleased = state.satisfaction >= 50;

          return (
            <Reveal key={def.id} delay={0.1 + i * 0.03}>
              <Card
                className={clsx(
                  'h-full',
                  state.satisfaction < 30 && 'border-aurora-red/30 bg-aurora-red/[0.04]',
                  state.satisfaction > 72 && 'border-aurora-lime/25 bg-aurora-lime/[0.03]',
                )}
                title={def.name}
                icon={def.icon}
                subtitle={`${state.influence.toFixed(0)}% of national influence`}
                action={
                  <Badge tone={state.satisfaction < 30 ? 'bad' : state.satisfaction > 65 ? 'good' : 'neutral'}>
                    {state.satisfaction.toFixed(0)} / 100
                  </Badge>
                }
              >
                <p className="text-xs leading-relaxed text-slate-400">{def.description}</p>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[11px] text-slate-400">Satisfaction</span>
                      <span className="num flex items-center gap-1 text-[11px]" style={{ color: meterColor(state.satisfaction) }}>
                        {trending > 0.4 ? <TrendingUp size={10} /> : trending < -0.4 ? <TrendingDown size={10} /> : null}
                        {state.satisfaction.toFixed(0)}
                        <span className="text-slate-600">→ {target.toFixed(0)}</span>
                      </span>
                    </div>
                    <Meter value={state.satisfaction} height={5} />
                  </div>
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[11px] text-slate-400">Influence</span>
                      <span className="num text-[11px] text-slate-300">{state.influence.toFixed(1)}%</span>
                    </div>
                    <Meter value={state.influence} max={40} height={3} color={FACTION_COLORS[def.id]} />
                  </div>
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-400">They want:</span> {def.blurb}
                </p>

                <div className="mt-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    {pleased ? 'Currently contributing' : 'Currently obstructing'}
                  </p>
                  <ModifierList modifiers={pleased ? def.pleasedModifiers : def.angeredModifiers} limit={4} />
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
