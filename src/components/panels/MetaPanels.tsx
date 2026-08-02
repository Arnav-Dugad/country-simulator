import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { Check, Lock, Search, Trophy } from 'lucide-react';
import clsx from 'clsx';
import type { EventCategory, GameState, LogEntry } from '../../game/types';
import { ACHIEVEMENTS, TIER_COLORS, TOTAL_ACHIEVEMENT_POINTS } from '../../game/data/achievements';
import { VICTORY_INDEX } from '../../game/data/definitions';
import { MONTH_SHORT } from '../../game/selectors';
import { computeScore, scoreTitle, victoryProgress } from '../../game/engine/scoring';
import { Badge, Card, EmptyState, Meter, Reveal, Stat, Tabs, meterColor } from '../ui/primitives';
import { ChartFrame, chartAxis, chartTooltip } from './chartHelpers';

/* =============================== Objectives ============================= */

export function ObjectivesPanel({ game }: { game: GameState }) {
  const goal = VICTORY_INDEX[game.settings.victoryGoal];
  const progress = useMemo(() => victoryProgress(game), [game]);
  const score = useMemo(() => computeScore(game), [game]);
  const met = progress.filter((p) => p.met).length;

  const pillars = [
    { label: 'Prosperity', value: score.prosperity, max: 1700, color: '#f5d073' },
    { label: 'Wellbeing', value: score.wellbeing, max: 1700, color: '#ff6bb5' },
    { label: 'Governance', value: score.governance, max: 1700, color: '#4f8cff' },
    { label: 'Power', value: score.power, max: 1500, color: '#ff5c6c' },
    { label: 'Sustainability', value: score.sustainability, max: 1400, color: '#7ee787' },
    { label: 'Knowledge', value: score.knowledge, max: 1500, color: '#3ddbd9' },
    { label: 'Achievements', value: score.achievements, max: Math.max(400, TOTAL_ACHIEVEMENT_POINTS * 4), color: '#9d6bff' },
    { label: 'Longevity', value: score.longevity, max: 1000, color: '#ffb648' },
  ];

  const scoreHistory = useMemo(
    () =>
      game.history.slice(-240).map((h) => ({
        label: `${MONTH_SHORT[h.month - 1]} ${h.year}`,
        Score: h.score,
      })),
    [game.history],
  );

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Current score" value={score.total.toLocaleString()} accent="#f5d073" icon={<Trophy size={14} />} />
          <Stat label="Standing" value={scoreTitle(score.total)} accent="#9d6bff" />
          <Stat label="Objectives met" value={`${met} / ${progress.length}`} accent="#7ee787" />
          <Stat label="Months in office" value={game.turn} hint={`${Math.floor(game.turn / 12)} years`} accent="#4f8cff" />
        </div>
      </Reveal>

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal delay={0.05}>
          <Card title={`${goal.icon} ${goal.name}`} subtitle={goal.description} icon="🎯">
            <div className="space-y-4">
              {progress.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className={clsx('flex items-center gap-2 text-xs', item.met ? 'text-aurora-lime' : 'text-slate-300')}>
                      {item.met ? <Check size={13} /> : <Lock size={11} className="text-slate-600" />}
                      {item.label}
                    </span>
                    <span className="num shrink-0 text-[11px] text-slate-400">{item.display}</span>
                  </div>
                  <Meter
                    value={Math.min(100, (item.current / Math.max(0.0001, item.target)) * 100)}
                    height={5}
                    color={item.met ? '#7ee787' : undefined}
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[11px] leading-relaxed text-slate-400">
                {met === progress.length
                  ? 'Every condition is satisfied. Victory will be declared on the next month.'
                  : `${progress.length - met} condition${progress.length - met === 1 ? '' : 's'} still outstanding. You can keep playing after victory if you want a higher score.`}
              </p>
            </div>
          </Card>
        </Reveal>

        <div className="space-y-5">
          <Reveal delay={0.08}>
            <Card title="Score composition" subtitle="Each pillar is capped so no single axis can carry a run" icon="📊">
              <div className="space-y-3">
                {pillars.map((pillar) => (
                  <div key={pillar.label}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs text-slate-300">{pillar.label}</span>
                      <span className="num text-xs font-semibold text-white">
                        {pillar.value.toLocaleString()}
                        <span className="text-slate-600"> / {pillar.max.toLocaleString()}</span>
                      </span>
                    </div>
                    <Meter value={pillar.value} max={pillar.max} color={pillar.color} height={4} />
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.12}>
            <Card title="Score over time" icon="📈">
              {scoreHistory.length < 2 ? (
                <ChartFrame.Empty message="Advance a few months to build a trend." />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={scoreHistory} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" {...chartAxis} minTickGap={56} />
                    <YAxis {...chartAxis} width={52} />
                    <RTooltip {...chartTooltip} />
                    <Line type="monotone" dataKey="Score" stroke="#f5d073" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

/* ============================== Achievements ============================ */

export function AchievementsPanel({ game }: { game: GameState }) {
  const [tab, setTab] = useState<'all' | 'unlocked' | 'locked'>('all');
  const unlocked = useMemo(() => new Set(game.achievements), [game.achievements]);
  const earned = ACHIEVEMENTS.filter((a) => unlocked.has(a.id));
  const points = earned.reduce((s, a) => s + a.points, 0);

  const visible = ACHIEVEMENTS.filter((a) => {
    if (tab === 'unlocked') return unlocked.has(a.id);
    if (tab === 'locked') return !unlocked.has(a.id);
    return true;
  }).sort((a, b) => {
    const order = { bronze: 0, silver: 1, gold: 2, platinum: 3 };
    return order[a.tier] - order[b.tier] || a.points - b.points;
  });

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Unlocked" value={`${earned.length} / ${ACHIEVEMENTS.length}`} accent="#f5d073" icon={<Trophy size={14} />} />
          <Stat label="Points" value={`${points} / ${TOTAL_ACHIEVEMENT_POINTS}`} accent="#9d6bff" />
          <Stat label="Completion" value={`${((earned.length / ACHIEVEMENTS.length) * 100).toFixed(0)}%`} accent="#7ee787" />
          <Stat label="Platinum earned" value={earned.filter((a) => a.tier === 'platinum').length} accent="#7fdbff" />
        </div>
      </Reveal>

      <Reveal delay={0.04}>
        <Tabs
          tabs={[
            { id: 'all' as const, label: 'All', count: ACHIEVEMENTS.length },
            { id: 'unlocked' as const, label: 'Unlocked', count: earned.length },
            { id: 'locked' as const, label: 'Locked', count: ACHIEVEMENTS.length - earned.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </Reveal>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((achievement, i) => {
          const has = unlocked.has(achievement.id);
          const hidden = achievement.hidden && !has;
          const color = TIER_COLORS[achievement.tier];
          return (
            <Reveal key={achievement.id} delay={Math.min(0.3, i * 0.015)}>
              <div
                className={clsx(
                  'glass relative h-full overflow-hidden p-4 transition',
                  has ? 'border-white/20' : 'opacity-60',
                )}
              >
                {has && (
                  <span
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
                  />
                )}
                <div className="flex items-start gap-3">
                  <span
                    className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl', !has && 'grayscale')}
                    style={{ background: `${color}1a`, border: `1px solid ${color}44` }}
                  >
                    {hidden ? '❔' : achievement.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white">{hidden ? 'Hidden achievement' : achievement.name}</h3>
                      <span className="num shrink-0 text-[11px] font-semibold" style={{ color }}>
                        {achievement.points}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      {hidden ? 'Unlocked under conditions you have not discovered yet.' : achievement.description}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge tone="neutral" className="capitalize">{achievement.tier}</Badge>
                      {has && <Badge tone="good"><Check size={9} /> Earned</Badge>}
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}

/* ================================ Chronicle ============================= */

const CATEGORY_TONE: Record<string, string> = {
  economy: '#f5d073', politics: '#4f8cff', disaster: '#ff5c6c', diplomacy: '#3ddbd9',
  military: '#ff8f4f', science: '#9d6bff', society: '#ff6bb5', crime: '#b8c0cc',
  health: '#7ee787', environment: '#7ee787', opportunity: '#ffb648', system: '#8b93a7',
  policy: '#f5d073', build: '#ffb648', research: '#3ddbd9', election: '#4f8cff',
};

export function HistoryPanel({ game }: { game: GameState }) {
  const [filter, setFilter] = useState<'all' | LogEntry['category']>('all');
  const [search, setSearch] = useState('');

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of game.log) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [game.log]);

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return game.log.filter((e) => {
      if (filter !== 'all' && e.category !== filter) return false;
      return !q || e.text.toLowerCase().includes(q);
    });
  }, [game.log, filter, search]);

  const decadeStats = useMemo(() => {
    // One bar per five years, showing where the score came from over time.
    const buckets = new Map<number, { label: string; Score: number; count: number }>();
    for (const point of game.history) {
      const bucket = Math.floor(point.year / 5) * 5;
      const existing = buckets.get(bucket) ?? { label: `${bucket}s`, Score: 0, count: 0 };
      existing.Score += point.score;
      existing.count += 1;
      buckets.set(bucket, existing);
    }
    return [...buckets.values()].map((b) => ({ label: b.label, Score: Math.round(b.Score / Math.max(1, b.count)) }));
  }, [game.history]);

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Entries recorded" value={game.log.length} accent="#4f8cff" />
          <Stat label="Months elapsed" value={game.turn} accent="#f5d073" />
          <Stat label="Terms served" value={game.termsServed} accent="#7ee787" />
          <Stat label="Events resolved" value={Object.keys(game.eventCooldowns).length} accent="#9d6bff" />
        </div>
      </Reveal>

      {decadeStats.length > 1 && (
        <Reveal delay={0.05}>
          <Card title="Score by period" subtitle="Average composite score in each five-year block" icon="📆">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={decadeStats} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" {...chartAxis} />
                <YAxis {...chartAxis} width={52} />
                <RTooltip {...chartTooltip} />
                <Bar dataKey="Score" radius={4}>
                  {decadeStats.map((entry, i) => (
                    <Cell key={i} fill={meterColor(Math.min(100, entry.Score / 150))} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.08}>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="focus-ring w-full rounded-xl border border-white/10 bg-ink-800/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
            placeholder="Search the record…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <Tabs
          tabs={[
            { id: 'all' as const, label: 'Everything', count: game.log.length },
            ...categories.map(([category, count]) => ({
              id: category as LogEntry['category'],
              label: category.charAt(0).toUpperCase() + category.slice(1),
              count,
            })),
          ]}
          value={filter}
          onChange={setFilter}
        />
      </Reveal>

      {entries.length === 0 ? (
        <EmptyState icon="📜" title="Nothing recorded yet" body="Advance time to start writing the national record." />
      ) : (
        <Card padded={false}>
          <ol className="divide-y divide-white/[0.05]">
            {entries.slice(0, 250).map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3 transition hover:bg-white/[0.02]">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
                  style={{
                    background: `${CATEGORY_TONE[entry.category] ?? '#8b93a7'}18`,
                    border: `1px solid ${CATEGORY_TONE[entry.category] ?? '#8b93a7'}33`,
                  }}
                >
                  {entry.icon ?? '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={clsx(
                      'text-xs leading-relaxed',
                      entry.tone === 'good' && 'text-aurora-lime',
                      entry.tone === 'bad' && 'text-aurora-amber',
                      entry.tone === 'critical' && 'text-aurora-red',
                      entry.tone === 'neutral' && 'text-slate-300',
                    )}
                  >
                    {entry.text}
                  </p>
                  <p className="num mt-1 text-[10px] text-slate-600">
                    {MONTH_SHORT[entry.month - 1]} {entry.year} · turn {entry.turn} ·{' '}
                    <span className="capitalize">{entry.category}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {entries.length > 250 && (
            <p className="border-t border-white/[0.05] px-4 py-3 text-center text-[11px] text-slate-500">
              Showing the 250 most recent of {entries.length} entries.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

export type { EventCategory };
