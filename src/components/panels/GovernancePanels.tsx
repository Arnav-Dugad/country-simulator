import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import { AlertTriangle, Check, Handshake, Search, Vote, X } from 'lucide-react';
import clsx from 'clsx';
import type { GameState, PolicyCategory } from '../../game/types';
import { POLICIES, POLICY_CATEGORIES, POLICY_CATEGORY_LABELS, POLICY_INDEX } from '../../game/data/policies';
import { ADVISORS, MAX_ADVISORS } from '../../game/data/institutions';
import { GOVERNMENT_INDEX, IDEOLOGY_INDEX } from '../../game/data/definitions';
import { formatMoney, formatPopulation } from '../../game/selectors';
import { policyAvailability } from '../../game/engine/actions';
import {
  BREACH_GRACE_MONTHS,
  MAX_COALITION_PARTNERS,
  assessPact,
  coalitionDiscount,
  coalitionShare,
  demandSatisfied,
  ownPartyId,
} from '../../game/engine/coalition';
import { useGameStore } from '../../store/gameStore';
import { useUiStore } from '../../store/uiStore';
import { Badge, Button, Card, ConfirmButton, EmptyState, Meter, Reveal, Slider, Stat, Tabs, Tooltip, meterColor } from '../ui/primitives';
import { ModifierList } from './ModifierList';
import { AdvisoryBoard } from './AdvisoryBoard';
import { Inspect } from '../game/Inspector';
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
          <Stat
            label="Political capital"
            value={Math.floor(game.governance.capital)}
            hint={`${game.governance.capitalPerMonth >= 0 ? '+' : ''}${game.governance.capitalPerMonth.toFixed(1)}/mo`}
            accent="#9d6bff"
          />
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
                    {!active && (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Political capital</dt>
                          <dd
                            className={clsx(
                              'num',
                              game.governance.capital >= availability.politicalCost ? 'text-aurora-violet' : 'text-aurora-red',
                            )}
                          >
                            {availability.politicalCost}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Expected support</dt>
                          <dd className="num" style={{ color: meterColor(availability.support) }}>
                            {availability.support.toFixed(0)}%
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>

                  {!active && availability.note && (
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{availability.note}</p>
                  )}

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
          <Stat
            label="Political capital"
            value={Math.floor(game.governance.capital)}
            hint={`${game.governance.capitalPerMonth >= 0 ? '+' : ''}${game.governance.capitalPerMonth.toFixed(1)}/mo · cap ${Math.round(game.governance.capitalCap)}`}
            accent="#9d6bff"
            icon={<Inspect game={game} id="capitalIncome" label="political capital income" />}
          />
          <Stat
            label="Mandate"
            value={game.governance.mandate.toFixed(0)}
            hint="How legitimate you are seen to be"
            accent="#4f8cff"
            icon={<Inspect game={game} id="mandate" label="mandate" />}
          />
          <Stat
            label="Legislative support"
            value={`${game.governance.legislativeSupport.toFixed(0)}%`}
            hint={`${game.governance.billsPassed} bills passed`}
            accent="#7ee787"
            icon={<Inspect game={game} id="legislativeSupport" label="legislative support" />}
          />
          <Stat
            label={gov.holdsElections ? 'Next election' : 'Government'}
            value={gov.holdsElections ? (game.monthsToElection > 0 ? `${game.monthsToElection}mo` : 'Now') : gov.icon}
            hint={gov.holdsElections ? `Term ${game.termsServed}` : 'No elections held'}
            accent="#f5d073"
          />
        </div>
      </Reveal>

      <Reveal delay={0.02}>
        <CoalitionCard game={game} />
      </Reveal>

      <Reveal delay={0.03}>
        <Card
          title="Political capital"
          subtitle="Money buys things. Capital buys permission."
          icon="🏛️"
          action={
            <Badge tone={game.governance.capital > 40 ? 'good' : game.governance.capital > 12 ? 'warn' : 'bad'}>
              {Math.floor(game.governance.capital)} / {Math.round(game.governance.capitalCap)}
            </Badge>
          }
        >
          <Meter value={game.governance.capital} max={Math.max(1, game.governance.capitalCap)} height={7} color="#9d6bff" />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                What earns it, per month
              </p>
              {[
                { label: 'Base (this government type)', value: gov.holdsElections ? 1.4 : 2.4 },
                { label: `Approval (${game.approval.toFixed(0)})`, value: (game.approval - 35) * 0.09 },
                { label: `Mandate (${game.governance.mandate.toFixed(0)})`, value: (game.governance.mandate - 45) * 0.05 },
                { label: `Legislature (${game.governance.legislativeSupport.toFixed(0)}%)`, value: (game.governance.legislativeSupport - 40) * 0.045 },
                { label: `Stability (${game.stability.toFixed(0)})`, value: (game.stability - 45) * 0.035 },
                { label: 'Momentum', value: game.governance.momentum * 0.02 },
                { label: `Corruption (${game.corruption.toFixed(0)})`, value: -game.corruption * 0.012 },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="truncate text-slate-400">{row.label}</span>
                  <span className={clsx('num shrink-0 font-semibold', row.value >= 0 ? 'text-aurora-lime' : 'text-aurora-red')}>
                    {row.value >= 0 ? '+' : ''}
                    {row.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">What spends it</p>
              <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-400">
                <li>
                  <span className="font-semibold text-slate-200">Legislation.</span> The price rises as
                  legislative support falls — you are buying votes you do not have.
                </li>
                <li>
                  <span className="font-semibold text-slate-200">Executive actions.</span> Acting by decree is
                  fast and spends standing instead of consultation.
                </li>
                <li>
                  <span className="font-semibold text-slate-200">Crisis responses.</span> The serious ones are
                  political decisions, not purchases.
                </li>
                <li>
                  <span className="font-semibold text-slate-200">Devolution and martial law.</span> Both change
                  the constitutional settlement, so both cost authority rather than money.
                </li>
                <li>
                  <span className="font-semibold text-slate-200">Declaring a five-year plan.</span>
                </li>
              </ul>
              <p className="pt-1 text-[11px] leading-relaxed text-slate-500">
                Momentum is currently{' '}
                <span className={clsx('num font-semibold', game.governance.momentum >= 0 ? 'text-aurora-lime' : 'text-aurora-red')}>
                  {game.governance.momentum >= 0 ? '+' : ''}
                  {game.governance.momentum.toFixed(0)}
                </span>
                . It rises when you resolve crises and pass bills, falls when things go wrong, and decays
                toward zero on its own.
              </p>
            </div>
          </div>
        </Card>
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

/* =============================== Coalition ============================== */

/**
 * The floor of the house.
 *
 * Political capital is a cost everywhere else in the game. Here it is a
 * bargaining chip: pay a rival party's price and their seats vote with you,
 * which takes the price off every bill after it. The concession is a standing
 * commitment, so the card's real job is showing whether each bargain is still
 * being kept and how long you have if it is not.
 */
function CoalitionCard({ game }: { game: GameState }) {
  const { openCoalition, endCoalition } = useGameStore();
  const confirmRisky = useUiStore((s) => s.prefs.confirmRisky);
  const gov = GOVERNMENT_INDEX[game.identity.government];

  const share = coalitionShare(game);
  const discount = coalitionDiscount(game);
  const own = ownPartyId(game);
  const partners = game.governance.coalition;
  const rivals = game.parties.filter((p) => p.id !== own && !partners.some((c) => c.partyId === p.id));

  if (!gov.holdsElections) {
    return (
      <Card title="The floor of the house" subtitle="No legislature to bargain with" icon={<Handshake size={16} />}>
        <p className="text-xs leading-relaxed text-slate-400">
          {gov.name} does not answer to a chamber, so there are no votes to buy. What has to be carried instead is the
          apparatus of state — the interest groups who staff it and the officers who guarantee it. That is what the{' '}
          <span className="font-semibold text-slate-200">Interest Groups</span> panel is for.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="The floor of the house"
      subtitle="Their votes for your concession"
      icon={<Handshake size={16} />}
      action={
        <Badge tone={share > 50 ? 'good' : share > 40 ? 'warn' : 'bad'}>
          {share.toFixed(0)}% of the chamber
        </Badge>
      }
    >
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-slate-400">Government bloc</span>
          <span className="num font-semibold text-white">{share.toFixed(1)}%</span>
        </div>
        <div className="relative">
          <Meter value={share} height={7} />
          {/* The line that matters: a majority is what changes the arithmetic. */}
          <span className="absolute inset-y-0 left-1/2 w-px bg-white/45" aria-hidden />
        </div>
        <p className="text-[10.5px] leading-relaxed text-slate-500">
          {share > 50 ? (
            <>
              A working majority. Legislation costs{' '}
              <span className="num font-semibold text-aurora-lime">{((1 - discount) * 100).toFixed(0)}% less</span> than
              it would without the coalition.
            </>
          ) : (
            <>
              Short of the 50% line, so every bill is still bought vote by vote. One more partner would change that.
            </>
          )}
        </p>
      </div>

      {partners.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">In government with you</p>
          {partners.map((pact) => {
            const party = game.parties.find((p) => p.id === pact.partyId);
            const honoured = demandSatisfied(game, pact.demand);
            const grace = Math.max(0, BREACH_GRACE_MONTHS - pact.breachMonths + 1);
            const monthsLeft = Math.max(0, pact.endsTurn - game.turn);
            return (
              <div
                key={pact.partyId}
                className={clsx(
                  'rounded-xl border p-3',
                  honoured ? 'border-aurora-lime/25 bg-aurora-lime/[0.04]' : 'border-aurora-red/35 bg-aurora-red/[0.05]',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: party?.color }} />
                    <span className="truncate text-xs font-semibold text-white">{party?.name ?? pact.partyId}</span>
                    <span className="num shrink-0 text-[10px] text-slate-500">{party?.seats ?? 0} seats</span>
                  </span>
                  {honoured ? (
                    <Badge tone="good">Honoured</Badge>
                  ) : (
                    <Badge tone="bad">
                      <AlertTriangle size={9} /> {grace} month{grace === 1 ? '' : 's'} to fix
                    </Badge>
                  )}
                </div>

                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                  <span className="font-semibold">Their price:</span> {pact.demand.label}
                </p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">{pact.demand.detail}</p>
                <p className="mt-1.5 text-[10.5px] text-slate-500">
                  Agreement runs {monthsLeft} more month{monthsLeft === 1 ? '' : 's'} · cost {pact.capitalPaid} capital
                </p>

                <ConfirmButton
                  size="sm"
                  variant="ghost"
                  full
                  className="mt-2"
                  needsConfirmation={confirmRisky}
                  confirm={{
                    title: `Dismiss ${party?.name ?? 'this partner'}?`,
                    danger: true,
                    confirmLabel: 'Break the agreement',
                    body: (
                      <>
                        Ending the agreement costs you their votes, a further hit to relations with them, and standing
                        with the chamber. You will not get the {pact.capitalPaid} political capital back, and they will
                        be dearer to bring back in later.
                      </>
                    ),
                  }}
                  onConfirm={() => endCoalition(pact.partyId)}
                >
                  Dismiss from government
                </ConfirmButton>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {partners.length >= MAX_COALITION_PARTNERS ? 'Not available — the government already holds three partners' : 'Open negotiations'}
        </p>
        {rivals.length === 0 && (
          <p className="text-[11px] text-slate-500">Every other party is already in government with you.</p>
        )}
        {rivals.map((party) => {
          const pact = assessPact(game, party.id);
          return (
            <div key={party.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: party.color }} />
                  <span className="truncate text-xs font-semibold text-white">{party.name}</span>
                  <span className="num shrink-0 text-[10px] text-slate-500">
                    {party.support.toFixed(0)}% · {party.seats} seats
                  </span>
                </span>
                <Tooltip label="Political capital to open the deal. Larger parties, colder relations and greater ideological distance all raise it — and so does needing them.">
                  <span className="num text-[11px] font-semibold text-aurora-violet">{pact.cost} capital</span>
                </Tooltip>
              </div>

              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                <span className="font-semibold">They want:</span> {pact.demand.label}
                {pact.alreadyMet && <Badge tone="good" className="ml-2">Already done</Badge>}
              </p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">{pact.demand.detail}</p>
              <p className="mt-1 text-[10.5px] text-slate-500">
                Worth about{' '}
                <span className="num font-semibold text-aurora-lime">+{pact.supportGain.toFixed(1)}</span> points of
                legislative support, for 48 months.
              </p>

              <Button
                size="sm"
                variant={pact.enabled ? 'primary' : 'secondary'}
                full
                className="mt-2"
                disabled={!pact.enabled}
                title={pact.reason ?? undefined}
                onClick={() => openCoalition(party.id)}
              >
                {pact.enabled ? `Bring ${party.name} into government` : pact.reason}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-white/[0.07] pt-3 text-[10.5px] leading-relaxed text-slate-500">
        A partner's concession is a standing commitment, not a one-off purchase. Stop honouring it and they give you{' '}
        {BREACH_GRACE_MONTHS} months, then walk — and walking out costs far more than the concession ever would have.
        They also take a little credit while they sit with you, so a permanent coalition slowly transfers votes from
        your party to theirs.
      </p>
    </Card>
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

      <Reveal delay={0.03}>
        <AdvisoryBoard game={game} limit={6} title="Everything your cabinet would raise" />
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
  const { investInProvince, grantAutonomy, setMartialLaw, setProvinceInvestment } = useGameStore();
  const symbol = game.identity.currency.symbol;
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const defaultInvestment = Math.max(20, Math.round((game.economy.gdp * 1000) / 12 / 20));
  const standingCap = Math.max(1, Math.round(((game.economy.gdp * 1000) / 12) * 0.05));
  const standingTotal = game.provinces.reduce((sum, p) => sum + p.investment, 0);
  const worstSeparatism = Math.max(0, ...game.provinces.map((p) => p.separatism));

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
            label="Highest separatism"
            value={worstSeparatism.toFixed(0)}
            hint="A movement opens above 62"
            accent={worstSeparatism > 50 ? '#ff5c6c' : '#ffb648'}
          />
          <Stat
            label="Standing investment"
            value={formatMoney(standingTotal, symbol)}
            hint="Per month, across all provinces"
            accent="#9d6bff"
          />
        </div>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {game.provinces.map((province, i) => {
          const meta = SPECIALTY_META[province.specialty];
          const amount = amounts[province.id] ?? defaultInvestment;
          return (
            <Reveal key={province.id} delay={Math.min(0.3, i * 0.04)}>
              <Card
                className={clsx(province.separatism > 55 && 'border-aurora-red/30 bg-aurora-red/[0.03]')}
                title={province.name}
                icon={meta.icon}
                subtitle={`${meta.label} · ${formatPopulation(province.population * 1e6)} people`}
                action={province.martialLaw ? <Badge tone="bad">Martial law</Badge> : null}
              >
                <div className="space-y-3">
                  {[
                    { label: 'Development', value: province.development },
                    { label: 'Loyalty', value: province.loyalty },
                    { label: 'Unrest', value: province.unrest, inverted: true },
                    { label: 'Autonomy', value: province.autonomy, inverted: true },
                    { label: 'Separatism', value: province.separatism, inverted: true },
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
                    label="One-off investment"
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
                    <Tooltip label="Costs 6 political capital. The durable answer to separatism.">
                      <Button size="sm" variant="ghost" onClick={() => grantAutonomy(province.id)}>
                        Devolve
                      </Button>
                    </Tooltip>
                  </div>

                  <Slider
                    label="Standing monthly budget"
                    value={province.investment}
                    min={0}
                    max={standingCap}
                    step={Math.max(1, Math.round(standingCap / 20))}
                    onChange={(v) => setProvinceInvestment(province.id, v)}
                    format={(v) => (v > 0 ? `${formatMoney(v, symbol)}/mo` : 'None')}
                    hint="Paid every month and shows up in the budget. Slower than a lump sum, and it is what actually bleeds separatism away."
                  />

                  <Tooltip
                    label={
                      province.martialLaw
                        ? 'Restores civil administration. Loyalty recovers.'
                        : 'Costs 10 political capital. Suppresses unrest hard, and costs loyalty, liberties and standing every month it lasts.'
                    }
                  >
                    <Button
                      size="sm"
                      variant={province.martialLaw ? 'secondary' : 'ghost'}
                      full
                      onClick={() => setMartialLaw(province.id, !province.martialLaw)}
                    >
                      {province.martialLaw ? 'Lift martial law' : 'Declare martial law'}
                    </Button>
                  </Tooltip>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
