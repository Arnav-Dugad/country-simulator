import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { Check, Lock, Search, Trophy } from 'lucide-react';
import clsx from 'clsx';
import type { GameState, LogEntry } from '../../game/types';
import { ACHIEVEMENTS, TIER_COLORS, TOTAL_ACHIEVEMENT_POINTS } from '../../game/data/achievements';
import { VICTORY_GOALS, VICTORY_INDEX } from '../../game/data/definitions';
import {
  AGENDAS, AGENDA_DECLARATION_COST, AGENDA_INDEX, AGENDA_METRIC_LABELS, readMetric, targetFor,
} from '../../game/data/agendas';
import { MONTH_SHORT } from '../../game/selectors';
import { EVENT_MODE_LABELS, type EventDecisionMode } from '../../game/storage';
import { computeScore, scoreTitle, victoryProgress } from '../../game/engine/scoring';
import { agendaMet, agendaProgress } from '../../game/engine/agenda';
import { useGameStore } from '../../store/gameStore';
import { useUiStore } from '../../store/uiStore';
import { Badge, Button, Card, EmptyState, Meter, Reveal, Stat, Tabs, meterColor } from '../ui/primitives';
import { ModifierList } from './ModifierList';
import { ChartFrame, chartAxis, chartTooltip } from './chartHelpers';

/* =============================== Objectives ============================= */

export function ObjectivesPanel({ game }: { game: GameState }) {
  const setVictoryGoal = useGameStore((s) => s.setVictoryGoal);
  const goal = VICTORY_INDEX[game.settings.victoryGoal];
  const progress = useMemo(() => victoryProgress(game), [game]);
  const score = useMemo(() => computeScore(game), [game]);
  const met = progress.filter((p) => p.met).length;
  const alreadyWon = game.victoriesAchieved.includes(game.settings.victoryGoal);

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
          <Stat
            label={game.victoriesAchieved.length > 0 ? 'Objectives achieved' : 'Conditions met'}
            value={game.victoriesAchieved.length > 0 ? game.victoriesAchieved.length : `${met} / ${progress.length}`}
            accent="#7ee787"
          />
          <Stat label="Months in office" value={game.turn} hint={`${Math.floor(game.turn / 12)} years`} accent="#4f8cff" />
        </div>
      </Reveal>

      {game.victoriesAchieved.length > 0 && (
        <Reveal delay={0.03}>
          <Card title="Objectives achieved" subtitle="Recorded permanently in this campaign" icon="🏆">
            <div className="flex flex-wrap gap-2">
              {game.victoriesAchieved.map((id) => {
                const achieved = VICTORY_INDEX[id];
                return (
                  <Badge key={id} tone="gold">
                    {achieved?.icon} {achieved?.name ?? id}
                  </Badge>
                );
              })}
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.04}>
        <AgendaSection game={game} />
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
                {alreadyWon
                  ? 'You have already achieved this objective. In eternal mode the campaign continues — keep building for a higher score.'
                  : met === progress.length
                    ? game.settings.neverEndGame
                      ? 'Every condition is satisfied. It will be recorded next month, and the campaign will continue.'
                      : 'Every condition is satisfied. Victory will be declared on the next month.'
                    : `${progress.length - met} condition${progress.length - met === 1 ? '' : 's'} still outstanding. You can keep playing after victory if you want a higher score.`}
              </p>
            </div>

            {game.settings.neverEndGame && (
              <div className="mt-3 rounded-xl border border-aurora-violet/30 bg-aurora-violet/[0.07] p-3">
                <p className="text-[11px] font-semibold text-aurora-violet">♾️ Eternal mode</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  No loss condition can end this campaign — not bankruptcy, collapse, depopulation, a lost
                  election or the hundred-year mark. Objectives are recorded when you reach them.
                </p>
              </div>
            )}
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

          {game.settings.neverEndGame && (
            <Reveal delay={0.1}>
              <Card
                title="Change objective"
                subtitle="Eternal mode lets you redirect the campaign at a new goal"
                icon="🎯"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {VICTORY_GOALS.map((option) => {
                    const current = option.id === game.settings.victoryGoal;
                    const won = game.victoriesAchieved.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        disabled={current}
                        onClick={() => setVictoryGoal(option.id)}
                        className={clsx(
                          'focus-ring rounded-xl border p-3 text-left transition',
                          current
                            ? 'cursor-default border-gold-500/50 bg-gold-500/[0.08]'
                            : 'border-white/10 hover:border-white/25 hover:bg-white/[0.05]',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{option.icon}</span>
                          <span className="text-xs font-semibold text-white">{option.name}</span>
                          {current && <Badge tone="gold">Active</Badge>}
                          {won && !current && <Badge tone="good">Done</Badge>}
                        </span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </Reveal>
          )}

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

/* ============================ National agenda =========================== */

/**
 * Five-year plans.
 *
 * The one mechanic that makes the player commit in advance rather than
 * reacting month to month: declare a public target, accept a real handicap for
 * the duration, and either deliver it for a permanent bonus or be seen to fail.
 */
function AgendaSection({ game }: { game: GameState }) {
  const { declareAgenda, abandonAgenda } = useGameStore();
  const active = game.agenda;
  const def = active ? AGENDA_INDEX[active.defId] : null;

  if (active && def) {
    const current = readMetric(game, def.metric);
    const progress = agendaProgress(game) * 100;
    const met = agendaMet(game);
    const monthsLeft = Math.max(0, active.endsTurn - game.turn);

    return (
      <Card
        className={clsx(met ? 'border-aurora-lime/35 bg-aurora-lime/[0.04]' : 'border-gold-500/30 bg-gold-500/[0.04]')}
        title={def.name}
        icon={def.icon}
        subtitle={`Five-year plan · ${monthsLeft} month${monthsLeft === 1 ? '' : 's'} remaining`}
        action={<Badge tone={met ? 'good' : 'gold'}>{met ? 'On target' : 'Behind'}</Badge>}
      >
        <p className="text-xs leading-relaxed text-slate-400">{def.description}</p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs text-slate-300">{AGENDA_METRIC_LABELS[def.metric]}</span>
            <span className="num text-xs font-semibold text-white">
              {formatMetric(def.metric, current)}
              <span className="text-slate-600">
                {' '}
                from {formatMetric(def.metric, active.baseline)} → {formatMetric(def.metric, active.target)}
              </span>
            </span>
          </div>
          <Meter value={progress} height={7} color={met ? '#7ee787' : undefined} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Costing us while it runs
            </p>
            <ModifierList modifiers={def.duringModifiers} />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Permanent, if delivered
            </p>
            <ModifierList modifiers={def.rewardModifiers} />
            <p className="num mt-1 text-[10px] text-aurora-violet">+{def.rewardCapital} political capital</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Missing the target costs approval, mandate and momentum. Abandoning it early costs more.
          </p>
          <Button size="sm" variant="ghost" onClick={abandonAgenda}>
            Abandon
          </Button>
        </div>
      </Card>
    );
  }

  const affordable = game.governance.capital >= AGENDA_DECLARATION_COST;

  return (
    <Card
      title="Declare a five-year plan"
      icon="🗓️"
      subtitle={`Costs ${AGENDA_DECLARATION_COST} political capital. You have ${Math.floor(game.governance.capital)}.`}
    >
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        A plan stakes the government publicly on one measurable target over sixty months. It imposes a real
        handicap for the whole term — that is what makes it a commitment rather than a bonus — and pays a
        permanent modifier plus political capital if you deliver it.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {AGENDAS.map((option) => {
          const done = game.agendasCompleted.includes(option.id);
          const baseline = readMetric(game, option.metric);
          const target = targetFor(option, baseline);
          return (
            <button
              key={option.id}
              disabled={!affordable || done}
              onClick={() => declareAgenda(option.id)}
              className={clsx(
                'focus-ring rounded-xl border p-3 text-left transition',
                done
                  ? 'cursor-default border-aurora-lime/25 bg-aurora-lime/[0.04] opacity-70'
                  : affordable
                    ? 'border-white/10 hover:border-gold-500/40 hover:bg-gold-500/[0.06]'
                    : 'cursor-not-allowed border-white/[0.05] opacity-50',
              )}
            >
              <span className="flex items-center gap-1.5">
                <span>{option.icon}</span>
                <span className="text-xs font-semibold text-white">{option.name}</span>
                {done && <Badge tone="good">Delivered</Badge>}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{option.description}</span>
              <span className="num mt-1.5 block text-[10px] text-slate-500">
                Target: {AGENDA_METRIC_LABELS[option.metric]} {formatMetric(option.metric, baseline)} →{' '}
                {formatMetric(option.metric, target)}
              </span>
              <span className="mt-1.5 block">
                <ModifierList modifiers={option.rewardModifiers} limit={3} />
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ============================== Preferences ============================= */

type ToggleKey =
  | 'showNextMove'
  | 'showTutorial'
  | 'showInspector'
  | 'confirmRisky'
  | 'compactNumbers'
  | 'mobileNav'
  | 'reduceMotion'
  | 'autosaveToCloud';

const PREFERENCE_ROWS: { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: 'showNextMove',
    label: 'Next-move strip',
    hint: 'Keeps one line of live advice under the top bar, with its action attached.',
  },
  {
    key: 'showTutorial',
    label: 'Cabinet advice on the dashboard',
    hint: 'Shows the full advisory board in the Situation Room.',
  },
  {
    key: 'showInspector',
    label: 'Show "why is this number?"',
    hint: 'Puts a question mark beside every headline index that opens the engine\'s own arithmetic for it.',
  },
  {
    key: 'confirmRisky',
    label: 'Confirm irreversible actions',
    hint: 'Asks before declaring war, repealing legislation or breaking an agreement.',
  },
  {
    key: 'compactNumbers',
    label: 'Compact figures',
    hint: 'Shows $1.24T rather than $1,240,000M. Turn it off to read exact numbers.',
  },
  {
    key: 'mobileNav',
    label: 'Bottom navigation on small screens',
    hint: 'Puts the four most-used ministries and the advance button under your thumb.',
  },
  {
    key: 'reduceMotion',
    label: 'Reduce motion',
    hint: 'Removes panel transitions. Useful on slower machines.',
  },
  {
    key: 'autosaveToCloud',
    label: 'Autosave to the cloud',
    hint: 'Pushes a save roughly once a game-year while signed in.',
  },
];

/** Everything the player can change about how the game presents itself. */
function PreferencesCard() {
  const prefs = useUiStore((s) => s.prefs);
  const setPref = useUiStore((s) => s.setPref);

  return (
    <Card title="Preferences" subtitle="Stored on this device, not in the save" icon="⚙️">
      {/*
        The decision-presentation setting is the one preference that changes
        how the game is played rather than how it looks, so it sits above the
        toggles with room to explain what each option actually does.
      */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-white">When a situation needs a decision</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          A dialogue that stops the game is right for a constitutional crisis and wrong for the ninth routine customs
          dispute of the year. Anything your cabinet settles is still written into the chronicle and announced.
        </p>
        <div className="mt-2.5 space-y-1.5">
          {(Object.keys(EVENT_MODE_LABELS) as EventDecisionMode[]).map((mode) => {
            const meta = EVENT_MODE_LABELS[mode];
            const active = prefs.eventMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setPref('eventMode', mode)}
                className={clsx(
                  'focus-ring flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                  active
                    ? 'border-gold-500/45 bg-gold-500/[0.07]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                )}
                role="radio"
                aria-checked={active}
              >
                <span
                  className={clsx(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition',
                    active ? 'border-gold-400' : 'border-white/25',
                  )}
                >
                  {active && <span className="block h-2 w-2 rounded-full bg-gold-400" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-white">{meta.label}</span>
                  <span className="block text-[11px] leading-relaxed text-slate-500">{meta.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 border-t border-white/[0.07] pt-4">
        {PREFERENCE_ROWS.map((row) => {
          const on = Boolean(prefs[row.key]);
          return (
            <button
              key={row.key}
              onClick={() => setPref(row.key, !on)}
              className="focus-ring flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-white/[0.03]"
              role="switch"
              aria-checked={on}
            >
              <span
                className={clsx(
                  'mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition',
                  on ? 'justify-end bg-gold-500' : 'justify-start bg-white/15',
                )}
              >
                <span className="block h-3 w-3 rounded-full bg-white" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-white">{row.label}</span>
                <span className="block text-[11px] leading-relaxed text-slate-500">{row.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** Formats an agenda metric the way the rest of the game shows that number. */
function formatMetric(metric: string, value: number): string {
  if (metric === 'gdpPerCapita') return `$${Math.round(value).toLocaleString()}`;
  if (metric === 'unemployment' || metric === 'renewableShare') return `${value.toFixed(1)}%`;
  if (metric === 'researchCompleted') return value.toFixed(0);
  return value.toFixed(0);
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
          <Stat label="Events resolved" value={game.records.eventsResolved} accent="#9d6bff" />
        </div>
      </Reveal>

      <Reveal delay={0.03}>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Campaign records" subtitle="The high-water marks of this government" icon="🏅">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {[
                { label: 'Peak GDP', value: `$${game.records.peakGdp >= 1000 ? `${(game.records.peakGdp / 1000).toFixed(2)}T` : `${game.records.peakGdp.toFixed(0)}B`}` },
                { label: 'Peak score', value: game.records.peakScore.toLocaleString() },
                { label: 'Peak approval', value: `${game.records.peakApproval.toFixed(0)}%` },
                { label: 'Peak population', value: game.records.peakPopulation.toLocaleString() },
                { label: 'Cleanest government', value: `${game.records.lowestCorruption.toFixed(0)} corruption` },
                { label: 'Wars won / lost', value: `${game.records.warsWon} / ${game.records.warsLost}` },
                { label: 'Crises resolved', value: game.records.crisesResolved },
                { label: 'Bills passed', value: game.governance.billsPassed },
                { label: 'Plans delivered', value: game.agendasCompleted.length },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-slate-400">{row.label}</dt>
                  <dd className="num text-xs font-semibold text-white">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <PreferencesCard />
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

