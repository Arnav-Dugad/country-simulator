import { useMemo, useState } from 'react';
import { Beaker, Check, Hammer, Lock, Search, X, Zap } from 'lucide-react';
import clsx from 'clsx';
import type { BuildingCategory, GameState, TechBranch } from '../../game/types';
import {
  TECHNOLOGIES, TECH_BRANCHES, TECH_BRANCH_COLORS, TECH_BRANCH_LABELS, TECH_INDEX,
} from '../../game/data/technologies';
import { BUILDINGS, BUILDING_CATEGORIES, BUILDING_CATEGORY_LABELS, BUILDING_INDEX } from '../../game/data/buildings';
import { formatMoney } from '../../game/selectors';
import { buildAvailability } from '../../game/engine/actions';
import { useGameStore } from '../../store/gameStore';
import { Badge, Button, Card, EmptyState, Meter, Reveal, Stat, Tabs, Tooltip } from '../ui/primitives';
import { ModifierList } from './ModifierList';

/* ================================ Research ============================== */

export function ResearchPanel({ game }: { game: GameState }) {
  const { startResearch, cancelResearch } = useGameStore();
  const [branch, setBranch] = useState<TechBranch | 'all'>('all');
  const [search, setSearch] = useState('');

  const done = useMemo(() => new Set(game.research.completed), [game.research.completed]);
  const current = game.research.current ? TECH_INDEX[game.research.current] : null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TECHNOLOGIES.filter((t) => {
      if (branch !== 'all' && t.branch !== branch) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    }).sort((a, b) => a.tier - b.tier || a.cost - b.cost);
  }, [branch, search]);

  const byTier = useMemo(() => {
    const groups = new Map<number, typeof visible>();
    for (const tech of visible) {
      if (!groups.has(tech.tier)) groups.set(tech.tier, []);
      groups.get(tech.tier)!.push(tech);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  const progressPct = current ? Math.min(100, (game.research.progress / current.cost) * 100) : 0;
  const monthsLeft = current && game.research.perMonth > 0
    ? Math.ceil((current.cost - game.research.progress) / game.research.perMonth)
    : null;

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Technologies" value={`${done.size} / ${TECHNOLOGIES.length}`} accent="#3ddbd9" icon={<Beaker size={14} />} />
          <Stat label="Research output" value={Math.round(game.research.perMonth)} hint="Points per month" accent="#9d6bff" />
          <Stat label="Banked points" value={Math.round(game.research.points)} accent="#4f8cff" />
          <Stat label="Education index" value={game.society.education.toFixed(0)} accent="#7ee787" />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <Card
          title={current ? `Researching: ${current.name}` : 'No active research programme'}
          icon={current?.icon ?? '🔬'}
          subtitle={current ? current.description : 'Select a technology below to begin. Banked points are not lost while idle.'}
          action={
            current ? (
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={cancelResearch}>
                Cancel
              </Button>
            ) : null
          }
        >
          {current ? (
            <div className="space-y-3">
              <Meter value={progressPct} height={8} color={TECH_BRANCH_COLORS[current.branch]} />
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="num text-slate-400">
                  {Math.round(game.research.progress).toLocaleString()} / {current.cost.toLocaleString()} points
                </span>
                <span className="num text-slate-300">
                  {monthsLeft !== null ? `${monthsLeft} month${monthsLeft === 1 ? '' : 's'} remaining` : 'Stalled — fund research'}
                </span>
              </div>
              <ModifierList modifiers={current.modifiers} />
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Raise the research budget in the Treasury and improve education to increase output.
            </p>
          )}
        </Card>
      </Reveal>

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

      {byTier.map(([tier, techs]) => (
        <div key={tier}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tier {tier}
            <span className="h-px flex-1 bg-white/[0.07]" />
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {techs.map((tech) => {
              const completed = done.has(tech.id);
              const missing = tech.requires.filter((r) => !done.has(r));
              const active = game.research.current === tech.id;
              const color = TECH_BRANCH_COLORS[tech.branch];

              return (
                <Card
                  key={tech.id}
                  className={clsx(
                    'h-full transition',
                    completed && 'border-aurora-lime/30 bg-aurora-lime/[0.04]',
                    active && 'border-gold-500/45 bg-gold-500/[0.06]',
                    !completed && missing.length > 0 && 'opacity-70',
                  )}
                  title={tech.name}
                  icon={tech.icon}
                  subtitle={TECH_BRANCH_LABELS[tech.branch]}
                  action={
                    completed ? (
                      <Badge tone="good"><Check size={10} /> Done</Badge>
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
                    <span className="num text-[11px] text-slate-500" style={{ color }}>
                      {tech.cost.toLocaleString()} pts
                    </span>
                    {!completed && (
                      <Button
                        size="sm"
                        variant={missing.length === 0 && !active ? 'primary' : 'secondary'}
                        disabled={missing.length > 0 || active}
                        onClick={() => startResearch(tech.id)}
                      >
                        {active ? 'In progress' : missing.length > 0 ? 'Locked' : 'Research'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================== Construction ============================ */

export function ConstructionPanel({ game }: { game: GameState }) {
  const { build, cancelBuild } = useGameStore();
  const [category, setCategory] = useState<BuildingCategory | 'all'>('all');
  const symbol = game.identity.currency.symbol;
  const scale = Math.max(0.0025, game.economy.gdp / 1500);

  const visible = useMemo(
    () => BUILDINGS.filter((b) => category === 'all' || b.category === category),
    [category],
  );

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
        <EmptyState icon="🏗️" title="Nothing available" body="No project in this category." />
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

export { Zap };
