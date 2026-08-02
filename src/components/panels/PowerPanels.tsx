import { useMemo, useState } from 'react';
import {
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts';
import { Ban, Handshake, Radar as RadarIcon, Search, Send, Shield, Swords, Target } from 'lucide-react';
import clsx from 'clsx';
import type { CovertOp, ForeignNation, GameState, MilitaryState, OrgId, TreatyType, WarGoal } from '../../game/types';
import { ORGS } from '../../game/data/institutions';
import { REGION_LABELS } from '../../game/data/countries';
import { averageRelations, formatBillions, formatMoney, formatNumber, formatPopulation } from '../../game/selectors';
import { COVERT_OPS, orgEligibility } from '../../game/engine/actions';
import { useGameStore } from '../../store/gameStore';
import { useUiStore } from '../../store/uiStore';
import { Badge, Button, Card, EmptyState, Meter, Modal, Reveal, Slider, Stat, Tabs, Tooltip, meterColor } from '../ui/primitives';
import { Flag } from '../ui/Flag';
import { ModifierList } from './ModifierList';
import { chartTooltip } from './chartHelpers';

/* ================================ Military ============================== */

const DOCTRINES: { id: MilitaryState['doctrine']; name: string; icon: string; description: string }[] = [
  { id: 'defensive', name: 'Defensive', icon: '🛡️', description: 'Fortify and hold. Favours the army and cyber defence.' },
  { id: 'offensive', name: 'Offensive', icon: '⚔️', description: 'Manoeuvre and strike first. Favours army and air force.' },
  { id: 'deterrence', name: 'Deterrence', icon: '☢️', description: 'Be too costly to attack. Favours air and space.' },
  { id: 'expeditionary', name: 'Expeditionary', icon: '🚢', description: 'Project power globally. Favours the navy.' },
  { id: 'asymmetric', name: 'Asymmetric', icon: '💻', description: 'Deny and disrupt. Favours cyber above all.' },
];

export function MilitaryPanel({ game }: { game: GameState }) {
  const { setDoctrine, sueForPeace } = useGameStore();
  const m = game.military;
  const symbol = game.identity.currency.symbol;
  const activeWars = game.wars.filter((w) => !w.resolved);
  const pastWars = game.wars.filter((w) => w.resolved);

  const branchData = [
    { branch: 'Army', value: Math.round(m.army) },
    { branch: 'Navy', value: Math.round(m.navy) },
    { branch: 'Air', value: Math.round(m.airForce) },
    { branch: 'Cyber', value: Math.round(m.cyber) },
    { branch: 'Space', value: Math.round(m.space) },
  ];

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Military strength" value={m.strength.toFixed(0)} accent="#ff5c6c" icon={<Swords size={14} />} />
          <Stat label="Active personnel" value={formatPopulation(m.manpower)} accent="#4f8cff" hint={`${formatPopulation(m.reserves)} reserves`} />
          <Stat label="Readiness" value={m.readiness.toFixed(0)} accent="#7ee787" hint={`Morale ${m.morale.toFixed(0)}`} />
          <Stat
            label="Nuclear warheads"
            value={m.nuclearWarheads > 0 ? formatNumber(m.nuclearWarheads) : '—'}
            accent="#ffb648"
            hint={m.nuclearWarheads > 0 ? 'Strategic deterrent active' : 'None deployed'}
          />
        </div>
      </Reveal>

      {activeWars.length > 0 && (
        <Reveal delay={0.03}>
          <Card title="Active conflicts" icon="⚔️" className="border-aurora-red/35">
            <div className="space-y-4">
              {activeWars.map((war) => {
                const enemyId = war.attackerId === 'player' ? war.defenderId : war.attackerId;
                const enemy = game.nations.find((n) => n.id === enemyId);
                const winning = war.warScore > 0;
                return (
                  <div key={war.id} className="rounded-xl border border-white/10 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {enemy && <Flag iso2={enemy.iso2} width={80} className="h-7 w-10" title={enemy.name} />}
                        <div>
                          <p className="text-sm font-semibold text-white">War with {enemy?.name ?? enemyId}</p>
                          <p className="text-[11px] capitalize text-slate-500">
                            {war.goal} · started turn {war.startTurn} · {formatMoney(war.monthlyCost, symbol)}/mo
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => sueForPeace(war.id)}>
                        Sue for peace
                      </Button>
                    </div>

                    <div className="mb-1 flex items-baseline justify-between text-[11px]">
                      <span className="text-slate-400">War score</span>
                      <span className={clsx('num font-semibold', winning ? 'text-aurora-lime' : 'text-aurora-red')}>
                        {war.warScore > 0 ? '+' : ''}
                        {war.warScore.toFixed(0)} / 100
                      </span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                      <div
                        className="absolute inset-y-0 rounded-full transition-all"
                        style={{
                          background: winning ? '#7ee787' : '#ff5c6c',
                          left: winning ? '50%' : `${50 - Math.min(50, Math.abs(war.warScore) / 2)}%`,
                          width: `${Math.min(50, Math.abs(war.warScore) / 2)}%`,
                        }}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <p className="text-slate-500">Own casualties</p>
                        <p className="num font-semibold text-aurora-red">{formatNumber(war.playerCasualties)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Enemy casualties</p>
                        <p className="num font-semibold text-slate-300">{formatNumber(war.enemyCasualties)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </Reveal>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal delay={0.06}>
          <Card title="Force composition" subtitle="Relative capability by branch" icon="🎯">
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={branchData} outerRadius="72%">
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="branch" tick={{ fill: 'rgba(226,232,240,0.6)', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'rgba(226,232,240,0.3)', fontSize: 9 }} axisLine={false} />
                <RTooltip {...chartTooltip} />
                <Radar name="Capability" dataKey="value" stroke="#ff5c6c" fill="#ff5c6c" fillOpacity={0.28} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
        </Reveal>

        <div className="space-y-5">
          <Reveal delay={0.1}>
            <Card title="Doctrine" subtitle="Determines which branches develop fastest" icon="📖">
              <div className="space-y-2">
                {DOCTRINES.map((doctrine) => (
                  <button
                    key={doctrine.id}
                    onClick={() => setDoctrine(doctrine.id)}
                    className={clsx(
                      'focus-ring flex w-full items-start gap-3 rounded-xl border p-3 text-left transition',
                      m.doctrine === doctrine.id
                        ? 'border-gold-500/55 bg-gold-500/[0.08]'
                        : 'border-white/10 hover:border-white/25 hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="text-base">{doctrine.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-white">{doctrine.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{doctrine.description}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-500">Changing doctrine temporarily reduces readiness.</p>
            </Card>
          </Reveal>

          <Reveal delay={0.14}>
            <Card title="Readiness" icon="📊">
              <div className="space-y-3.5">
                {[
                  { label: 'Overall strength', value: m.strength },
                  { label: 'Morale', value: m.morale },
                  { label: 'Readiness', value: m.readiness },
                  { label: 'Veterancy', value: m.veterancy },
                  { label: 'Defence funding', value: game.budget.military.level * 50 },
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
            </Card>
          </Reveal>
        </div>
      </div>

      {pastWars.length > 0 && (
        <Reveal delay={0.18}>
          <Card title="War record" icon="🏅">
            <div className="space-y-2">
              {pastWars.map((war) => {
                const enemyId = war.attackerId === 'player' ? war.defenderId : war.attackerId;
                const enemy = game.nations.find((n) => n.id === enemyId);
                return (
                  <div key={war.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                    {enemy && <Flag iso2={enemy.iso2} width={40} className="h-5 w-7" />}
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{enemy?.name ?? enemyId}</span>
                    <Badge tone={war.resolved === 'victory' ? 'good' : war.resolved === 'defeat' ? 'bad' : 'neutral'}>
                      {war.resolved === 'white-peace' ? 'Stalemate' : war.resolved}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </Reveal>
      )}
    </div>
  );
}

/* =============================== Diplomacy ============================== */

const TREATY_OPTIONS: { type: TreatyType; label: string; minRelations: number }[] = [
  { type: 'non-aggression', label: 'Non-aggression pact', minRelations: -10 },
  { type: 'trade', label: 'Trade agreement', minRelations: 10 },
  { type: 'research', label: 'Research pact', minRelations: 30 },
  { type: 'open-borders', label: 'Open borders', minRelations: 35 },
  { type: 'defense', label: 'Defence pact', minRelations: 50 },
  { type: 'alliance', label: 'Full alliance', minRelations: 65 },
];

export function DiplomacyPanel({ game }: { game: GameState }) {
  const store = useGameStore();
  const { selectedNation, selectNation } = useUiStore();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'nations' | 'treaties' | 'orgs'>('nations');
  const symbol = game.identity.currency.symbol;

  const nations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...game.nations]
      .filter((n) => !q || n.name.toLowerCase().includes(q))
      .sort((a, b) => b.relations - a.relations);
  }, [game.nations, search]);

  const active = game.nations.find((n) => n.id === selectedNation) ?? null;

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average relations" value={averageRelations(game).toFixed(0)} accent="#4f8cff" />
          <Stat label="Treaties" value={game.treaties.length} accent="#7ee787" />
          <Stat label="Organisations" value={`${game.orgs.length} / ${ORGS.length}`} accent="#f5d073" />
          <Stat label="Soft power" value={game.society.softPower.toFixed(0)} accent="#9d6bff" />
        </div>
      </Reveal>

      <Reveal delay={0.04}>
        <Tabs
          tabs={[
            { id: 'nations' as const, label: 'Nations', count: game.nations.length },
            { id: 'treaties' as const, label: 'Treaties', count: game.treaties.length },
            { id: 'orgs' as const, label: 'Organisations', count: game.orgs.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </Reveal>

      {tab === 'nations' && (
        <>
          <Reveal delay={0.06}>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="focus-ring w-full rounded-xl border border-white/10 bg-ink-800/70 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
                placeholder="Search nations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Reveal>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {nations.map((nation, i) => (
              <Reveal key={nation.id} delay={Math.min(0.25, i * 0.012)}>
                <button
                  onClick={() => selectNation(nation.id)}
                  className="focus-ring flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-white/25 hover:bg-white/[0.06]"
                >
                  <Flag iso2={nation.iso2} width={80} className="h-8 w-11 shrink-0" title={nation.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-semibold text-white">{nation.name}</p>
                      {nation.atWarWithPlayer && <Badge tone="bad">War</Badge>}
                      {nation.sanctioned && <Badge tone="warn">Sanctioned</Badge>}
                      {nation.nuclear && <span title="Nuclear armed">☢️</span>}
                    </div>
                    <p className="truncate text-[10px] text-slate-500">
                      {REGION_LABELS[nation.region]} · {formatBillions(nation.gdp, '$')}
                    </p>
                    <div className="mt-1.5">
                      <Meter value={nation.relations + 100} max={200} height={3} />
                    </div>
                  </div>
                  <span className="num shrink-0 text-sm font-bold" style={{ color: meterColor((nation.relations + 100) / 2) }}>
                    {nation.relations.toFixed(0)}
                  </span>
                </button>
              </Reveal>
            ))}
          </div>
        </>
      )}

      {tab === 'treaties' && (
        game.treaties.length === 0 ? (
          <EmptyState icon="📜" title="No treaties signed" body="Select a nation and propose an agreement to build your diplomatic network." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {game.treaties.map((treaty) => {
              const nation = game.nations.find((n) => n.id === treaty.countryId);
              return (
                <Card key={treaty.id} title={nation?.name ?? treaty.countryId} icon="🤝" subtitle={TREATY_OPTIONS.find((t) => t.type === treaty.type)?.label ?? treaty.type}>
                  <dl className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Signed</dt>
                      <dd className="num text-slate-300">Turn {treaty.signedTurn}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Monthly value</dt>
                      <dd className={clsx('num', treaty.monthlyValue >= 0 ? 'text-aurora-lime' : 'text-aurora-red')}>
                        {formatMoney(treaty.monthlyValue * Math.max(0.0025, game.economy.gdp / 1500), symbol)}
                      </dd>
                    </div>
                  </dl>
                  <Button size="sm" variant="ghost" full className="mt-3" onClick={() => store.cancelTreaty(treaty.id)}>
                    Withdraw
                  </Button>
                </Card>
              );
            })}
          </div>
        )
      )}

      {tab === 'orgs' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ORGS.map((org) => {
            const member = game.orgs.includes(org.id);
            const eligibility = orgEligibility(game, org.id);
            return (
              <Card
                key={org.id}
                className={clsx('h-full', member && 'border-gold-500/35 bg-gold-500/[0.05]')}
                title={org.name}
                icon={org.icon}
                action={member ? <Badge tone="gold">Member</Badge> : null}
              >
                <p className="text-xs leading-relaxed text-slate-400">{org.description}</p>
                <ModifierList modifiers={org.modifiers} className="mt-3" />
                <p className="num mt-2 text-[11px] text-slate-500">
                  Dues {formatMoney(org.monthlyDues * Math.max(0.0025, game.economy.gdp / 1500), symbol)}/mo
                </p>
                <div className="mt-3">
                  {member ? (
                    <Button size="sm" variant="ghost" full onClick={() => store.leaveOrg(org.id as OrgId)}>
                      Withdraw
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={eligibility.enabled ? 'primary' : 'secondary'}
                      full
                      disabled={!eligibility.enabled}
                      onClick={() => store.joinOrg(org.id as OrgId)}
                    >
                      {eligibility.enabled ? 'Accede' : eligibility.reason}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NationDetail game={game} nation={active} onClose={() => selectNation(null)} />
    </div>
  );
}

function NationDetail({ game, nation, onClose }: { game: GameState; nation: ForeignNation | null; onClose: () => void }) {
  const store = useGameStore();
  const [aid, setAid] = useState(0);
  const symbol = game.identity.currency.symbol;

  if (!nation) return <Modal open={false} onClose={onClose}>{null}</Modal>;

  const defaultAid = Math.max(10, Math.round((game.economy.gdp * 1000) / 12 / 40));
  const aidAmount = aid || defaultAid;
  const existingTreaties = game.treaties.filter((t) => t.countryId === nation.id).map((t) => t.type);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          <Flag iso2={nation.iso2} width={80} className="h-7 w-10" title={nation.name} />
          {nation.name}
        </span>
      }
      subtitle={`${REGION_LABELS[nation.region]} · ${nation.personality} foreign policy`}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Relations" value={nation.relations.toFixed(0)} accent="#4f8cff" />
          <Stat label="Trust" value={nation.trust.toFixed(0)} accent="#7ee787" />
          <Stat label="GDP" value={formatBillions(nation.gdp, '$')} accent="#f5d073" />
          <Stat label="Military" value={nation.militaryStrength.toFixed(0)} accent="#ff5c6c" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 text-xs">
            <Row label="Population" value={formatPopulation(nation.population)} />
            <Row label="Technology" value={nation.techLevel.toFixed(0)} />
            <Row label="Stability" value={nation.stability.toFixed(0)} />
            <Row label="Government" value={nation.government.replace(/-/g, ' ')} />
            <Row label="Trade volume" value={`${formatMoney(nation.tradeVolume, symbol)}/mo`} />
            <Row label="Nuclear" value={nation.nuclear ? 'Yes' : 'No'} />
            <Row label="Embassy" value={nation.embassy ? 'Established' : 'None'} />
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Treaties</p>
            <div className="space-y-1.5">
              {TREATY_OPTIONS.map((option) => {
                const signed = existingTreaties.includes(option.type);
                const eligible = nation.relations >= option.minRelations && !nation.atWarWithPlayer;
                return (
                  <Button
                    key={option.type}
                    size="sm"
                    variant={signed ? 'secondary' : eligible ? 'primary' : 'secondary'}
                    full
                    disabled={signed || !eligible}
                    icon={<Handshake size={13} />}
                    onClick={() => store.proposeTreaty(nation.id, option.type)}
                  >
                    {signed ? `${option.label} — signed` : eligible ? option.label : `${option.label} (needs ${option.minRelations})`}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="hairline" />

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actions</p>
          <Slider
            label="Foreign aid"
            value={aidAmount}
            min={defaultAid / 4}
            max={defaultAid * 12}
            step={Math.max(1, Math.round(defaultAid / 8))}
            onChange={setAid}
            format={(v) => formatMoney(v, symbol)}
            hint="Larger transfers relative to their economy buy more goodwill."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              icon={<Send size={13} />}
              disabled={game.economy.treasury < aidAmount}
              onClick={() => store.sendAid(nation.id, aidAmount)}
            >
              Send aid
            </Button>
            {!nation.embassy && (
              <Button size="sm" variant="secondary" onClick={() => store.establishEmbassy(nation.id)}>
                Open embassy
              </Button>
            )}
            <Button size="sm" variant={nation.sanctioned ? 'secondary' : 'danger'} icon={<Ban size={13} />} onClick={() => store.toggleSanctions(nation.id)}>
              {nation.sanctioned ? 'Lift sanctions' : 'Impose sanctions'}
            </Button>
            {game.settings.enableWars && !nation.atWarWithPlayer && (
              <DeclareWarButton onDeclare={(goal) => store.declareWar(nation.id, goal)} name={nation.name} />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="num font-semibold capitalize text-white">{value}</span>
    </div>
  );
}

function DeclareWarButton({ onDeclare, name }: { onDeclare: (goal: WarGoal) => void; name: string }) {
  const [open, setOpen] = useState(false);
  const goals: { id: WarGoal; label: string; description: string }[] = [
    { id: 'punitive', label: 'Punitive', description: 'Force concessions and withdraw.' },
    { id: 'conquest', label: 'Conquest', description: 'Seize territory outright. Maximum international backlash.' },
    { id: 'liberation', label: 'Liberation', description: 'Change their government. Popular at home, costly abroad.' },
    { id: 'resources', label: 'Resources', description: 'Secure access to their commodities.' },
    { id: 'defensive', label: 'Pre-emptive', description: 'Strike before they do.' },
  ];

  return (
    <>
      <Button size="sm" variant="danger" icon={<Swords size={13} />} onClick={() => setOpen(true)}>
        Declare war
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Declare war on ${name}?`}
        subtitle="Every other nation will react. This cannot be undone quickly."
      >
        <div className="space-y-2">
          {goals.map((goal) => (
            <button
              key={goal.id}
              onClick={() => {
                onDeclare(goal.id);
                setOpen(false);
              }}
              className="focus-ring w-full rounded-xl border border-white/10 p-3 text-left transition hover:border-aurora-red/40 hover:bg-aurora-red/[0.06]"
            >
              <span className="block text-xs font-semibold text-white">{goal.label}</span>
              <span className="mt-0.5 block text-[11px] text-slate-400">{goal.description}</span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

/* ============================== Intelligence ============================ */

export function IntelligencePanel({ game }: { game: GameState }) {
  const store = useGameStore();
  const [target, setTarget] = useState<string>('');
  const symbol = game.identity.currency.symbol;
  const scale = Math.max(0.0025, game.economy.gdp / 1500);
  const intel = game.intelligence;

  const targets = useMemo(() => [...game.nations].sort((a, b) => a.relations - b.relations), [game.nations]);
  const selected = targets.find((n) => n.id === target) ?? targets[0];

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Capability" value={intel.capability.toFixed(0)} accent="#9d6bff" icon={<RadarIcon size={14} />} />
          <Stat label="Counter-intelligence" value={intel.counterIntel.toFixed(0)} accent="#4f8cff" icon={<Shield size={14} />} />
          <Stat label="Active operations" value={`${intel.activeOps.length} / 4`} accent="#f5d073" />
          <Stat label="Intelligence budget" value={`${(game.budget.intelligence.level * 100).toFixed(0)}%`} accent="#3ddbd9" />
        </div>
      </Reveal>

      {intel.activeOps.length > 0 && (
        <Reveal delay={0.04}>
          <Card title="Operations in progress" icon="🕵️">
            <div className="space-y-3">
              {intel.activeOps.map((op) => {
                const spec = COVERT_OPS[op.type];
                const pct = ((spec.turns - op.turnsRemaining) / spec.turns) * 100;
                return (
                  <div key={op.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-white">{op.label}</span>
                        <span className="num shrink-0 text-[11px] text-slate-400">
                          {op.turnsRemaining}mo · {(op.successChance * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Meter value={pct} height={4} color="#9d6bff" />
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => store.abortOp(op.id)}>
                      Abort
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        </Reveal>
      )}

      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Reveal delay={0.08}>
          <Card title="Select a target" icon={<Target size={16} />}>
            <div className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
              {targets.map((nation) => (
                <button
                  key={nation.id}
                  onClick={() => setTarget(nation.id)}
                  className={clsx(
                    'focus-ring flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition',
                    selected?.id === nation.id ? 'border-gold-500/50 bg-gold-500/[0.08]' : 'border-transparent hover:bg-white/[0.04]',
                  )}
                >
                  <Flag iso2={nation.iso2} width={40} className="h-5 w-7 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{nation.name}</span>
                  <span className="num shrink-0 text-[11px]" style={{ color: meterColor((nation.relations + 100) / 2) }}>
                    {nation.relations.toFixed(0)}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.12}>
          <Card
            title={selected ? `Operations against ${selected.name}` : 'Operations'}
            subtitle="Success depends on your capability against their stability. Failure costs relations and standing."
            icon="🎯"
          >
            {!selected ? (
              <EmptyState icon="🕵️" title="No target selected" body="Choose a nation from the list." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(COVERT_OPS) as CovertOp['type'][]).map((type) => {
                  const spec = COVERT_OPS[type];
                  const cost = spec.cost * scale;
                  const chance = Math.max(
                    0.05,
                    Math.min(0.94, spec.baseChance + (intel.capability - 50) / 160 - (selected.stability - 50) / 260),
                  );
                  const running = intel.activeOps.some((o) => o.targetId === selected.id && o.type === type);
                  const affordable = game.economy.treasury >= cost;
                  const slotsFull = intel.activeOps.length >= 4;

                  return (
                    <div key={type} className="rounded-xl border border-white/10 p-3">
                      <h4 className="text-xs font-semibold text-white">{spec.label}</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{spec.description}</p>
                      <dl className="mt-2 space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Cost</dt>
                          <dd className="num text-slate-300">{formatMoney(cost, symbol)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Duration</dt>
                          <dd className="num text-slate-300">{spec.turns} months</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Estimated success</dt>
                          <dd className="num font-semibold" style={{ color: meterColor(chance * 100) }}>
                            {(chance * 100).toFixed(0)}%
                          </dd>
                        </div>
                      </dl>
                      <Tooltip label={running ? 'Already running' : slotsFull ? 'Too many operations' : !affordable ? 'Insufficient treasury' : 'Authorise'}>
                        <Button
                          size="sm"
                          variant="secondary"
                          full
                          className="mt-3"
                          disabled={running || slotsFull || !affordable}
                          onClick={() => store.launchOp(type, selected.id)}
                        >
                          {running ? 'In progress' : 'Authorise'}
                        </Button>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

