import { useMemo, useState } from 'react';
import {
  Beaker, Check, ChevronDown, ChevronUp, Hammer, ListPlus, Lock, Search, Sparkles, X, Zap,
} from 'lucide-react';
import clsx from 'clsx';
import type { BuildingCategory, GameState, TechBranch } from '../../game/types';
import {
  TECHNOLOGIES, TECH_BRANCHES, TECH_BRANCH_COLORS, TECH_BRANCH_LABELS, TECH_INDEX,
} from '../../game/data/technologies';
import { BUILDINGS, BUILDING_CATEGORIES, BUILDING_CATEGORY_LABELS, BUILDING_INDEX } from '../../game/data/buildings';
import { formatMoney } from '../../game/selectors';
import { buildAvailability } from '../../game/engine/actions';
import {
  MAX_RESEARCH_SLOTS, lockedSlotSources, monthsRemaining, researchCapacity,
} from '../../game/engine/research';
import { useGameStore } from '../../store/gameStore';
import { Badge, Button, Card, EmptyState, Meter, Reveal, Stat, Tabs, Tooltip } from '../ui/primitives';
import { ModifierList } from './ModifierList';

/* ================================ Research ============================== */

export function ResearchPanel({ game }: { game: GameState }) {
  const { startResearch, cancelResearch, setResearchWeight, moveResearchQueue, rushResearch } = useGameStore();
  const [branch, setBranch] = useState<TechBranch | 'all'>('all');
  const [search, setSearch] = useState('');
  const [hideDone, setHideDone] = useState(false);

  const done = useMemo(() => new Set(game.research.completed), [game.research.completed]);
  const capacity = researchCapacity(game);
  const active = game.research.active;
  const idleSlots = Math.max(0, capacity - active.length);
  const locked = lockedSlotSources(game);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TECHNOLOGIES.filter((t) => {
      if (branch !== 'all' && t.branch !== branch) return false;
      if (hideDone && done.has(t.id)) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    }).sort((a, b) => a.tier - b.tier || a.cost - b.cost);
  }, [branch, search, hideDone, done]);

  const byTier = useMemo(() => {
    const groups = new Map<number, typeof visible>();
    for (const tech of visible) {
      if (!groups.has(tech.tier)) groups.set(tech.tier, []);
      groups.get(tech.tier)!.push(tech);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  const weightTotal = active.reduce((sum, p) => sum + p.priority, 0) || 1;

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Technologies" value={`${done.size} / ${TECHNOLOGIES.length}`} accent="#3ddbd9" icon={<Beaker size={14} />} />
          <Stat label="Research output" value={Math.round(game.research.perMonth)} hint="Points per month" accent="#9d6bff" />
          <Stat
            label="Laboratories"
            value={`${active.length} / ${capacity}`}
            hint={idleSlots > 0 ? `${idleSlots} idle` : 'All occupied'}
            accent={idleSlots > 0 ? '#ffb648' : '#7ee787'}
          />
          <Stat label="Banked points" value={Math.round(game.research.points).toLocaleString()} hint="Spent on start or rush" accent="#4f8cff" />
          <Stat label="Queued" value={game.research.queue.length} accent="#f5d073" />
        </div>
      </Reveal>

      {/* ------------------------- Active programmes ------------------------- */}
      <Reveal delay={0.04}>
        <Card
          title="Active programmes"
          icon="🔬"
          subtitle={
            capacity === 1
              ? 'One laboratory. Output goes entirely to the single project you choose.'
              : `${capacity} laboratories. Monthly output is divided between them by weight — running three projects does not make research faster, it keeps three branches moving at once.`
          }
          action={<Badge tone={idleSlots > 0 ? 'warn' : 'good'}>{active.length} / {capacity} in use</Badge>}
        >
          {active.length === 0 ? (
            <EmptyState
              icon="🧪"
              title="No research under way"
              body="Every point produced this month is going into the bank instead of into a technology. Start something below — banked points are applied the moment a project begins."
            />
          ) : (
            <div className="space-y-4">
              {active.map((project) => {
                const tech = TECH_INDEX[project.techId];
                if (!tech) return null;
                const pct = Math.min(100, (project.progress / tech.cost) * 100);
                const months = monthsRemaining(game, project.techId);
                const share = (project.priority / weightTotal) * 100;
                const rushPrice = Math.ceil(Math.max(0, tech.cost - project.progress) * 1.6);
                const canRush = game.research.points >= rushPrice && rushPrice > 0;

                return (
                  <div key={project.techId} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 text-xl leading-none">{tech.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{tech.name}</span>
                          <span className="num text-[11px] text-slate-400">
                            {months !== null ? `${months} month${months === 1 ? '' : 's'} left` : 'Stalled — fund research'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{tech.description}</p>
                      </div>
                      <Tooltip label="Cancel — progress on this project is lost">
                        <Button size="sm" variant="ghost" onClick={() => cancelResearch(project.techId)} aria-label={`Cancel ${tech.name}`}>
                          <X size={13} />
                        </Button>
                      </Tooltip>
                    </div>

                    <div className="mt-3">
                      <Meter value={pct} height={7} color={TECH_BRANCH_COLORS[tech.branch]} />
                      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                        <span className="num text-slate-400">
                          {Math.round(project.progress).toLocaleString()} / {tech.cost.toLocaleString()} pts
                        </span>
                        <span className="num text-slate-500">
                          receiving {share.toFixed(0)}% of output
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {capacity > 1 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] uppercase tracking-wider text-slate-600">Priority</span>
                          {[0.5, 1, 2].map((weight) => (
                            <button
                              key={weight}
                              onClick={() => setResearchWeight(project.techId, weight)}
                              className={clsx(
                                'focus-ring rounded px-2 py-1 text-[10px] font-semibold transition',
                                Math.abs(project.priority - weight) < 0.01
                                  ? 'bg-gold-500 text-ink-950'
                                  : 'bg-white/[0.06] text-slate-400 hover:text-white',
                              )}
                            >
                              {weight === 0.5 ? 'Low' : weight === 1 ? 'Normal' : 'High'}
                            </button>
                          ))}
                        </div>
                      )}

                      <Tooltip
                        label={
                          canRush
                            ? `Spend ${rushPrice.toLocaleString()} banked points to finish immediately.`
                            : `Needs ${rushPrice.toLocaleString()} banked points; you have ${Math.floor(game.research.points).toLocaleString()}.`
                        }
                      >
                        <Button
                          size="sm"
                          variant={canRush ? 'secondary' : 'ghost'}
                          disabled={!canRush}
                          icon={<Zap size={12} />}
                          onClick={() => rushResearch(project.techId)}
                        >
                          Rush
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Slot unlocks */}
          {locked.length > 0 && (
            <div className="mt-4 rounded-xl border border-aurora-blue/25 bg-aurora-blue/[0.05] p-3">
              <p className="text-[11px] font-semibold text-aurora-blue">
                {capacity} of {MAX_RESEARCH_SLOTS} laboratories unlocked
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Each of these grants one more concurrent programme:
              </p>
              <ul className="mt-2 space-y-1">
                {locked.map((source) => (
                  <li key={`${source.kind}-${source.id}`} className="flex items-center gap-2 text-[11px] text-slate-300">
                    <Lock size={10} className="shrink-0 text-slate-600" />
                    <span className="font-medium">{source.label}</span>
                    <span className="text-slate-600">
                      ({source.kind === 'tech' ? 'technology' : source.kind === 'policy' ? 'legislation' : 'building'})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </Reveal>

      {/* ------------------------------ Queue -------------------------------- */}
      {game.research.queue.length > 0 && (
        <Reveal delay={0.06}>
          <Card
            title="Research queue"
            icon="📋"
            subtitle="Starts automatically as laboratories free up and prerequisites complete."
            action={<Badge tone="neutral">{game.research.queue.length}</Badge>}
          >
            <ol className="space-y-1.5">
              {game.research.queue.map((id, i) => {
                const tech = TECH_INDEX[id];
                if (!tech) return null;
                const blocked = tech.requires.filter((r) => !done.has(r));
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                    <span className="num w-5 shrink-0 text-[10px] text-slate-600">{i + 1}</span>
                    <span className="shrink-0 text-sm">{tech.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{tech.name}</span>
                    {blocked.length > 0 && (
                      <span className="hidden shrink-0 text-[10px] text-aurora-amber sm:block">
                        waiting on {blocked.map((b) => TECH_INDEX[b]?.name ?? b).join(', ')}
                      </span>
                    )}
                    <span className="num shrink-0 text-[10px] text-slate-500">{tech.cost.toLocaleString()} pts</span>
                    <button
                      onClick={() => moveResearchQueue(id, -1)}
                      disabled={i === 0}
                      className="focus-ring rounded p-1 text-slate-500 transition hover:text-white disabled:opacity-25"
                      aria-label={`Move ${tech.name} up`}
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      onClick={() => moveResearchQueue(id, 1)}
                      disabled={i === game.research.queue.length - 1}
                      className="focus-ring rounded p-1 text-slate-500 transition hover:text-white disabled:opacity-25"
                      aria-label={`Move ${tech.name} down`}
                    >
                      <ChevronDown size={12} />
                    </button>
                    <button
                      onClick={() => cancelResearch(id)}
                      className="focus-ring rounded p-1 text-slate-500 transition hover:text-aurora-red"
                      aria-label={`Remove ${tech.name} from the queue`}
                    >
                      <X size={12} />
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>
        </Reveal>
      )}

      {/* ------------------------------ Browser ------------------------------ */}
      <Reveal delay={0.08}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="focus-ring w-full rounded-xl border border-white/10 bg-ink-800/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
              placeholder="Search technologies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant={hideDone ? 'primary' : 'secondary'}
            onClick={() => setHideDone((v) => !v)}
            icon={<Check size={14} />}
          >
            {hideDone ? 'Hiding completed' : 'Hide completed'}
          </Button>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <Tabs
          tabs={[
            { id: 'all' as const, label: 'All branches', count: done.size },
            ...TECH_BRANCHES.map((b) => ({
              id: b,
              label: TECH_BRANCH_LABELS[b],
              count: TECHNOLOGIES.filter((t) => t.branch === b && done.has(t.id)).length,
            })),
          ]}
          value={branch}
          onChange={setBranch}
        />
      </Reveal>

      {byTier.length === 0 ? (
        <EmptyState icon="🔬" title="Nothing matches" body="No technology matches your search in this branch." />
      ) : (
        byTier.map(([tier, techs]) => (
          <div key={tier}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tier {tier}
              <span className="h-px flex-1 bg-white/[0.07]" />
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {techs.map((tech) => {
                const completed = done.has(tech.id);
                const missing = tech.requires.filter((r) => !done.has(r));
                const running = active.some((p) => p.techId === tech.id);
                const queued = game.research.queue.includes(tech.id);
                const color = TECH_BRANCH_COLORS[tech.branch];
                const missingInFlight = missing.every(
                  (m) => active.some((p) => p.techId === m) || game.research.queue.includes(m),
                );
                const canQueue = !completed && !running && !queued && (missing.length === 0 || missingInFlight);
                const startsNow = missing.length === 0 && idleSlots > 0;

                return (
                  <Card
                    key={tech.id}
                    className={clsx(
                      'h-full transition',
                      completed && 'border-aurora-lime/30 bg-aurora-lime/[0.04]',
                      running && 'border-gold-500/45 bg-gold-500/[0.06]',
                      queued && 'border-aurora-blue/35 bg-aurora-blue/[0.04]',
                      !completed && !running && !queued && missing.length > 0 && 'opacity-70',
                    )}
                    title={tech.name}
                    icon={tech.icon}
                    subtitle={TECH_BRANCH_LABELS[tech.branch]}
                    action={
                      completed ? (
                        <Badge tone="good"><Check size={10} /> Done</Badge>
                      ) : running ? (
                        <Badge tone="gold">Running</Badge>
                      ) : queued ? (
                        <Badge tone="info">Queued</Badge>
                      ) : missing.length > 0 ? (
                        <Lock size={13} className="text-slate-600" />
                      ) : null
                    }
                  >
                    <p className="text-xs leading-relaxed text-slate-400">{tech.description}</p>
                    <ModifierList modifiers={tech.modifiers} className="mt-3" />

                    {(tech.unlocksPolicies?.length || tech.unlocksBuildings?.length) && (
                      <p className="mt-2 text-[10px] text-slate-500">
                        Unlocks:{' '}
                        {[...(tech.unlocksPolicies ?? []), ...(tech.unlocksBuildings ?? [])]
                          .map((id) => BUILDING_INDEX[id]?.name ?? id.replace(/-/g, ' '))
                          .join(', ')}
                      </p>
                    )}

                    {missing.length > 0 && (
                      <p className="mt-2 text-[10px] text-aurora-amber">
                        Requires: {missing.map((m) => TECH_INDEX[m]?.name ?? m).join(', ')}
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="num text-[11px]" style={{ color }}>
                        {tech.cost.toLocaleString()} pts
                      </span>
                      {!completed && (
                        <Tooltip
                          label={
                            running ? 'Already under way'
                              : queued ? 'Already in the queue'
                                : !canQueue ? 'Prerequisites are not started'
                                  : startsNow ? 'Begins immediately in a free laboratory'
                                    : 'Every laboratory is busy — this goes into the queue'
                          }
                        >
                          <Button
                            size="sm"
                            variant={startsNow ? 'primary' : canQueue ? 'secondary' : 'secondary'}
                            disabled={!canQueue}
                            icon={startsNow ? <Sparkles size={12} /> : <ListPlus size={12} />}
                            onClick={() => startResearch(tech.id)}
                          >
                            {running ? 'Running' : queued ? 'Queued' : startsNow ? 'Research' : canQueue ? 'Queue' : 'Locked'}
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ============================== Construction ============================ */

export function ConstructionPanel({ game }: { game: GameState }) {
  const { build, cancelBuild } = useGameStore();
  const [category, setCategory] = useState<BuildingCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(false);
  const symbol = game.identity.currency.symbol;
  const scale = Math.max(0.0025, game.economy.gdp / 1500);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BUILDINGS.filter((b) => {
      if (category !== 'all' && b.category !== category) return false;
      if (affordableOnly && !buildAvailability(game, b.id).enabled) return false;
      if (!q) return true;
      return b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q);
    });
  }, [category, search, affordableOnly, game]);

  const totalBuilt = Object.values(game.buildings).reduce((a, b) => a + b, 0);
  const upkeep = Object.entries(game.buildings).reduce(
    (sum, [id, count]) => sum + (BUILDING_INDEX[id]?.upkeep ?? 0) * count * scale,
    0,
  );

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Completed projects" value={totalBuilt} accent="#f5d073" icon={<Hammer size={14} />} />
          <Stat label="Under construction" value={game.construction.length} accent="#4f8cff" />
          <Stat label="Total upkeep" value={formatMoney(upkeep, symbol)} hint="Per month" accent="#ff5c6c" />
          <Stat label="Treasury" value={formatMoney(game.economy.treasury, symbol)} accent="#7ee787" />
        </div>
      </Reveal>

      {game.construction.length > 0 && (
        <Reveal delay={0.05}>
          <Card title="Active projects" icon="🏗️">
            <div className="space-y-3">
              {game.construction.map((project) => {
                const building = BUILDING_INDEX[project.buildingId];
                const pct = ((project.totalTurns - project.turnsRemaining) / project.totalTurns) * 100;
                return (
                  <div key={project.instanceId} className="flex items-center gap-3">
                    <span className="shrink-0 text-lg">{building?.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-white">{building?.name}</span>
                        <span className="num shrink-0 text-[11px] text-slate-400">
                          {project.turnsRemaining} month{project.turnsRemaining === 1 ? '' : 's'} left
                        </span>
                      </div>
                      <Meter value={pct} height={4} />
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => cancelBuild(project.instanceId)} title="Cancel (50% of remaining value refunded)">
                      <X size={13} />
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.07}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="focus-ring w-full rounded-xl border border-white/10 bg-ink-800/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant={affordableOnly ? 'primary' : 'secondary'}
            onClick={() => setAffordableOnly((v) => !v)}
            icon={<Check size={14} />}
          >
            {affordableOnly ? 'Buildable only' : 'Show all'}
          </Button>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <Tabs
          tabs={[
            { id: 'all' as const, label: 'All', count: totalBuilt },
            ...BUILDING_CATEGORIES.map((c) => ({
              id: c,
              label: BUILDING_CATEGORY_LABELS[c],
              count: BUILDINGS.filter((b) => b.category === c).reduce((s, b) => s + (game.buildings[b.id] ?? 0), 0),
            })),
          ]}
          value={category}
          onChange={setCategory}
        />
      </Reveal>

      {visible.length === 0 ? (
        <EmptyState
          icon="🏗️"
          title="Nothing available"
          body={affordableOnly ? 'Nothing in this category can be started right now.' : 'No project matches your search.'}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((building, i) => {
            const availability = buildAvailability(game, building.id);
            const owned = availability.owned;
            const isWonder = building.category === 'wonder';
            return (
              <Reveal key={building.id} delay={Math.min(0.3, i * 0.02)}>
                <Card
                  className={clsx('h-full', isWonder && 'border-gold-500/30', owned > 0 && 'bg-white/[0.05]')}
                  title={building.name}
                  icon={building.icon}
                  subtitle={BUILDING_CATEGORY_LABELS[building.category]}
                  action={
                    owned > 0 ? (
                      <Badge tone={isWonder ? 'gold' : 'good'}>
                        {owned} / {building.maxCount}
                      </Badge>
                    ) : null
                  }
                >
                  <p className="text-xs leading-relaxed text-slate-400">{building.description}</p>
                  <ModifierList modifiers={building.modifiers} className="mt-3" limit={6} />

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Cost</dt>
                      <dd className="num text-slate-300">{formatMoney(availability.cost, symbol)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Time</dt>
                      <dd className="num text-slate-300">{building.buildTime}mo</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Upkeep</dt>
                      <dd className="num text-slate-300">{formatMoney(building.upkeep * scale, symbol)}</dd>
                    </div>
                    {building.energy !== undefined && building.energy !== 0 && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Power</dt>
                        <dd className={clsx('num', building.energy > 0 ? 'text-aurora-lime' : 'text-aurora-amber')}>
                          {building.energy > 0 ? '+' : ''}
                          {building.energy} TWh
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-4">
                    <Tooltip label={availability.reason ?? 'Begin construction'}>
                      <Button
                        size="sm"
                        variant={availability.enabled ? 'primary' : 'secondary'}
                        full
                        disabled={!availability.enabled}
                        icon={availability.enabled ? <Hammer size={14} /> : <Lock size={13} />}
                        onClick={() => build(building.id)}
                      >
                        {availability.enabled ? 'Build' : availability.reason}
                      </Button>
                    </Tooltip>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
