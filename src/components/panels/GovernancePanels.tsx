import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import { Check, Search, Vote, X } from 'lucide-react';
import clsx from 'clsx';
import type { GameState, PolicyCategory } from '../../game/types';
import { POLICIES, POLICY_CATEGORIES, POLICY_CATEGORY_LABELS, POLICY_INDEX } from '../../game/data/policies';
import { ADVISORS, MAX_ADVISORS } from '../../game/data/institutions';
import { GOVERNMENT_INDEX, IDEOLOGY_INDEX } from '../../game/data/definitions';
import { formatMoney, formatPopulation } from '../../game/selectors';
import { policyAvailability } from '../../game/engine/actions';
import { useGameStore } from '../../store/gameStore';
import { Badge, Button, Card, EmptyState, Meter, Reveal, Slider, Stat, Tabs, meterColor } from '../ui/primitives';
import { ModifierList } from './ModifierList';
import { chartTooltip } from './chartHelpers';

/* ================================ Policies ============================== */

export function PoliciesPanel({ game }: { game: GameState }) {
  const { enactPolicy, repealPolicy } = useGameStore();
  const [category, setCategory] = useState<PolicyCategory | 'active'>('active');
  const [search, setSearch] = useState('');
  const symbol = game.identity.currency.symbol;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = category === 'active'
      ? POLICIES.filter((p) => game.activePolicies.includes(p.id))
      : POLICIES.filter((p) => p.category === category);
    return pool.filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [category, search, game.activePolicies]);

  const tabs = useMemo(
    () => [
      { id: 'active' as const, label: 'Enacted', count: game.activePolicies.length },
      ...POLICY_CATEGORIES.map((c) => ({
        id: c,
        label: POLICY_CATEGORY_LABELS[c],
        count: POLICIES.filter((p) => p.category === c && game.activePolicies.includes(p.id)).length,
      })),
    ],
    [game.activePolicies],
  );

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Policies enacted" value={game.activePolicies.length} accent="#f5d073" />
          <Stat label="Available" value={POLICIES.length - game.activePolicies.length} accent="#4f8cff" />
          <Stat
            label="Programme cost"
            value={formatMoney(
              game.activePolicies.reduce((sum, id) => sum + (POLICY_INDEX[id]?.monthlyCost ?? 0), 0) *
                Math.max(0.0025, game.economy.gdp / 1500),
              symbol,
            )}
            hint="Per month"
            accent="#ff5c6c"
          />
          <Stat label="Treasury" value={formatMoney(game.economy.treasury, symbol)} accent="#7ee787" />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="focus-ring w-full rounded-xl border border-white/10 bg-ink-800/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
              placeholder="Search legislation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <Tabs tabs={tabs} value={category} onChange={setCategory} />
      </Reveal>

      {visible.length === 0 ? (
        <EmptyState
          icon="📜"
          title={category === 'active' ? 'No legislation enacted yet' : 'Nothing here'}
          body={
            category === 'active'
              ? 'Browse a category to enact your first policy. Policies apply permanently until repealed.'
              : 'No policy in this category matches your search.'
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((policy, i) => {
            const active = game.activePolicies.includes(policy.id);
            const availability = policyAvailability(game, policy.id);
            return (
              <Reveal key={policy.id} delay={Math.min(0.3, i * 0.02)}>
                <Card
                  className={clsx('h-full', active && 'border-gold-500/35 bg-gold-500/[0.05]')}
                  title={policy.name}
                  icon={policy.icon}
                  subtitle={POLICY_CATEGORY_LABELS[policy.category]}
                  action={active ? <Badge tone="gold">Active</Badge> : null}
                >
                  <p className="text-xs leading-relaxed text-slate-400">{policy.description}</p>

                  <ModifierList modifiers={policy.modifiers} className="mt-3" />

                  <dl className="mt-3 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">One-off cost</dt>
                      <dd className="num text-slate-300">{formatMoney(availability.cost, symbol)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Monthly</dt>
                      <dd className={clsx('num', policy.monthlyCost > 0 ? 'text-aurora-red' : 'text-aurora-lime')}>
                        {formatMoney(policy.monthlyCost * Math.max(0.0025, game.economy.gdp / 1500), symbol)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    {active ? (
                      <Button size="sm" variant="ghost" full icon={<X size={14} />} onClick={() => repealPolicy(policy.id)}>
                        Repeal
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={availability.enabled ? 'primary' : 'secondary'}
                        full
                        icon={<Check size={14} />}
                        disabled={!availability.enabled}
                        title={availability.reason ?? undefined}
                        onClick={() => enactPolicy(policy.id)}
                      >
                        {availability.enabled ? 'Enact' : availability.reason}
                      </Button>
                    )}
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

/* ================================ Politics ============================== */

export function PoliticsPanel({ game }: { game: GameState }) {
  const gov = GOVERNMENT_INDEX[game.identity.government];
  const ideology = IDEOLOGY_INDEX[game.leader.ideology];
  const playerPartyId = `party-${game.leader.ideology}`;
  const parties = [...game.parties].sort((a, b) => b.support - a.support);
  const totalSeats = parties.reduce((s, p) => s + p.seats, 0);

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Approval" value={`${game.approval.toFixed(0)}%`} accent="#4f8cff" />
          <Stat label="Stability" value={game.stability.toFixed(0)} accent="#7ee787" />
          <Stat label="Corruption" value={game.corruption.toFixed(0)} accent="#ff5c6c" hint="Lower is better" />
          <Stat
            label={gov.holdsElections ? 'Next election' : 'Government'}
            value={gov.holdsElections ? (game.monthsToElection > 0 ? `${game.monthsToElection}mo` : 'Now') : gov.icon}
            hint={gov.holdsElections ? `Term ${game.termsServed}` : 'No elections held'}
            accent="#f5d073"
          />
        </div>
      </Reveal>

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal delay={0.05}>
          <Card title="Parliament" subtitle={`${totalSeats} seats`} icon={<Vote size={16} />}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={parties.map((p) => ({ name: p.name, value: Math.round(p.support * 10) / 10, color: p.color }))}
                  dataKey="value"
                  startAngle={180}
                  endAngle={0}
                  cy="85%"
                  innerRadius={54}
                  outerRadius={92}
                  paddingAngle={1.5}
                  stroke="none"
                >
                  {parties.map((p) => (
                    <Cell key={p.id} fill={p.color} />
                  ))}
                </Pie>
                <RTooltip {...chartTooltip} formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>

            <div className="mt-3 space-y-2.5">
              {parties.map((party) => {
                const isPlayer = party.id === playerPartyId;
                return (
                  <div key={party.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: party.color }} />
                        <span className={clsx('truncate text-xs', isPlayer ? 'font-semibold text-white' : 'text-slate-300')}>
                          {party.name}
                        </span>
                        {isPlayer && <Badge tone="gold">Yours</Badge>}
                      </span>
                      <span className="num shrink-0 text-xs text-slate-400">
                        {party.support.toFixed(1)}% · {party.seats}
                      </span>
                    </div>
                    <Meter value={party.support} max={Math.max(50, parties[0].support)} color={party.color} height={3} />
                    {!isPlayer && (
                      <p className="mt-1 text-[10px] text-slate-600">
                        Relations with your government:{' '}
                        <span className="num" style={{ color: meterColor((party.relation + 100) / 2) }}>
                          {party.relation.toFixed(0)}
                        </span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </Reveal>

        <div className="space-y-5">
          <Reveal delay={0.1}>
            <Card title="Your government" icon={gov.icon}>
              <div className="flex items-start gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-3xl">
                  {game.leader.portrait}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {game.leader.title} {game.leader.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {ideology.name} · age {game.leader.age} · term {game.termsServed}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">{gov.name}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Government modifiers</p>
                <ModifierList modifiers={gov.modifiers} />
                <p className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">Ideological modifiers</p>
                <ModifierList modifiers={ideology.modifiers} />
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.14}>
            <Card title="Political pressure" icon="⚖️">
              <div className="space-y-3.5">
                {[
                  { label: 'Public approval', value: game.approval },
                  { label: 'State stability', value: game.stability },
                  { label: 'Civil liberties', value: game.society.civilLiberties },
                  { label: 'Institutional integrity', value: 100 - game.corruption },
                  { label: 'Average provincial loyalty', value: game.provinces.reduce((s, p) => s + p.loyalty, 0) / Math.max(1, game.provinces.length) },
                  { label: 'Average provincial calm', value: 100 - game.provinces.reduce((s, p) => s + p.unrest, 0) / Math.max(1, game.provinces.length) },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs text-slate-300">{row.label}</span>
                      <span className="num text-xs font-semibold" style={{ color: meterColor(row.value) }}>
                        {row.value.toFixed(0)}
                      </span>
                    </div>
                    <Meter value={row.value} height={4} />
                  </div>
                ))}
              </div>

              {gov.holdsElections && game.monthsToElection > 0 && (
                <div className="mt-4 rounded-xl border border-gold-500/25 bg-gold-500/[0.06] p-3">
                  <p className="text-xs font-semibold text-gold-400">
                    Election in {game.monthsToElection} month{game.monthsToElection === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Your party polls at {(game.parties.find((p) => p.id === playerPartyId)?.support ?? 0).toFixed(1)}%.
                    The leading opposition is on{' '}
                    {(parties.filter((p) => p.id !== playerPartyId)[0]?.support ?? 0).toFixed(1)}%. Lose and the campaign ends.
                  </p>
                </div>
              )}
            </Card>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

/* ================================= Cabinet ============================== */

export function CabinetPanel({ game }: { game: GameState }) {
  const { appointAdvisor, dismissAdvisor } = useGameStore();
  const symbol = game.identity.currency.symbol;
  const scale = Math.max(0.0025, game.economy.gdp / 1500);
  const appointed = ADVISORS.filter((a) => game.advisors.includes(a.id));
  const available = ADVISORS.filter((a) => !game.advisors.includes(a.id));

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Cabinet seats used" value={`${game.advisors.length} / ${MAX_ADVISORS}`} accent="#f5d073" />
          <Stat
            label="Salaries"
            value={formatMoney(appointed.reduce((s, a) => s + a.salary, 0) * scale, symbol)}
            hint="Per month"
            accent="#ff5c6c"
          />
          <Stat label="Available candidates" value={available.length} accent="#4f8cff" />
        </div>
      </Reveal>

      {appointed.length > 0 && (
        <Reveal delay={0.05}>
          <h3 className="mb-3 text-sm font-semibold text-white">Your cabinet</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {appointed.map((advisor) => (
              <Card key={advisor.id} className="border-gold-500/35 bg-gold-500/[0.05]" title={advisor.name} icon={advisor.icon} subtitle={advisor.role}>
                <p className="text-xs leading-relaxed text-slate-400">{advisor.bio}</p>
                <ModifierList modifiers={advisor.modifiers} className="mt-3" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="num text-[11px] text-slate-500">{formatMoney(advisor.salary * scale, symbol)}/mo</span>
                  <Button size="sm" variant="ghost" onClick={() => dismissAdvisor(advisor.id)}>
                    Dismiss
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </Reveal>
      )}

      <Reveal delay={0.1}>
        <h3 className="mb-3 text-sm font-semibold text-white">Candidates</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {available.map((advisor) => {
            const full = game.advisors.length >= MAX_ADVISORS;
            return (
              <Card key={advisor.id} title={advisor.name} icon={advisor.icon} subtitle={advisor.role}>
                <p className="text-xs leading-relaxed text-slate-400">{advisor.bio}</p>
                <ModifierList modifiers={advisor.modifiers} className="mt-3" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="num text-[11px] text-slate-500">{formatMoney(advisor.salary * scale, symbol)}/mo</span>
                  <Button
                    size="sm"
                    variant={full ? 'secondary' : 'primary'}
                    disabled={full}
                    title={full ? 'Cabinet is full' : undefined}
                    onClick={() => appointAdvisor(advisor.id)}
                  >
                    {full ? 'Cabinet full' : 'Appoint'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}

/* ================================ Provinces ============================= */

const SPECIALTY_META: Record<string, { icon: string; label: string }> = {
  agriculture: { icon: '🌾', label: 'Agriculture' },
  industry: { icon: '🏭', label: 'Industry' },
  services: { icon: '🏢', label: 'Services' },
  tech: { icon: '💻', label: 'Technology' },
  mining: { icon: '⛏️', label: 'Mining' },
  tourism: { icon: '🏖️', label: 'Tourism' },
  energy: { icon: '⚡', label: 'Energy' },
};

export function ProvincesPanel({ game }: { game: GameState }) {
  const { investInProvince, grantAutonomy } = useGameStore();
  const symbol = game.identity.currency.symbol;
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const defaultInvestment = Math.max(20, Math.round((game.economy.gdp * 1000) / 12 / 20));

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Provinces" value={game.provinces.length} accent="#4f8cff" />
          <Stat
            label="Average development"
            value={(game.provinces.reduce((s, p) => s + p.development, 0) / game.provinces.length).toFixed(0)}
            accent="#7ee787"
          />
          <Stat
            label="Average unrest"
            value={(game.provinces.reduce((s, p) => s + p.unrest, 0) / game.provinces.length).toFixed(0)}
            accent="#ff5c6c"
            hint="Lower is better"
          />
          <Stat label="Urbanisation" value={`${game.society.urbanisation.toFixed(0)}%`} accent="#9d6bff" />
        </div>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {game.provinces.map((province, i) => {
          const meta = SPECIALTY_META[province.specialty];
          const amount = amounts[province.id] ?? defaultInvestment;
          return (
            <Reveal key={province.id} delay={Math.min(0.3, i * 0.04)}>
              <Card title={province.name} icon={meta.icon} subtitle={`${meta.label} · ${formatPopulation(province.population * 1e6)} people`}>
                <div className="space-y-3">
                  {[
                    { label: 'Development', value: province.development },
                    { label: 'Loyalty', value: province.loyalty },
                    { label: 'Unrest', value: province.unrest, inverted: true },
                    { label: 'Autonomy', value: province.autonomy, inverted: true },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[11px] text-slate-400">{row.label}</span>
                        <span className="num text-[11px] font-semibold" style={{ color: meterColor(row.value, row.inverted) }}>
                          {row.value.toFixed(0)}
                        </span>
                      </div>
                      <Meter value={row.value} inverted={row.inverted} height={3} />
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-500">Share of national output</span>
                    <span className="num text-slate-300">{(province.gdpShare * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-white/[0.07] pt-3">
                  <Slider
                    label="Investment"
                    value={amount}
                    min={Math.round(defaultInvestment / 4)}
                    max={defaultInvestment * 8}
                    step={Math.max(1, Math.round(defaultInvestment / 8))}
                    onChange={(v) => setAmounts((a) => ({ ...a, [province.id]: v }))}
                    format={(v) => formatMoney(v, symbol)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="flex-1"
                      disabled={game.economy.treasury < amount}
                      onClick={() => investInProvince(province.id, amount)}
                    >
                      Invest
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => grantAutonomy(province.id)} title="Reduces unrest, raises autonomy">
                      Devolve
                    </Button>
                  </div>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
