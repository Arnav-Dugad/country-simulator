import { useMemo } from 'react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { Activity, Flame, Globe2, Swords, TrendingDown, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import type { BlocId, GameState, NationAgenda } from '../../game/types';
import { MONTH_SHORT, formatBillions } from '../../game/selectors';
import { AGENDA_LABELS, BLOC_LABELS, estimatedStrength, naturalBloc } from '../../game/engine/world';
import { Badge, Card, EmptyState, Meter, Reveal, Stat, Tooltip, meterColor } from '../ui/primitives';
import { Flag } from '../ui/Flag';
import { ChartFrame, chartAxis, chartTooltip } from './chartHelpers';

const PHASE_COPY: Record<GameState['world']['cyclePhase'], { label: string; body: string; tone: string }> = {
  expansion: {
    label: 'Expansion',
    body: 'World demand is growing. Export-facing economies do best now, and it is the cheapest time to borrow against future output.',
    tone: 'text-aurora-lime',
  },
  peak: {
    label: 'Peak',
    body: 'Growth has plateaued. Everything still looks good and the turn is coming — this is when to build reserves rather than commitments.',
    tone: 'text-aurora-amber',
  },
  contraction: {
    label: 'Contraction',
    body: 'External demand is falling. Trade-dependent economies feel this hardest; the sovereign fund earns least exactly now.',
    tone: 'text-aurora-red',
  },
  trough: {
    label: 'Trough',
    body: 'The downturn has bottomed out. Nothing is recovering yet, but this is where counter-cyclical investment pays for itself.',
    tone: 'text-slate-300',
  },
};

const BLOC_COLORS: Record<BlocId, string> = {
  western: '#4f8cff',
  eastern: '#ff5c6c',
  'non-aligned': '#f5d073',
  southern: '#7ee787',
};

const AGENDA_TONES: Record<NationAgenda, 'neutral' | 'good' | 'bad' | 'warn' | 'info'> = {
  expansion: 'bad',
  rearmament: 'warn',
  isolation: 'neutral',
  trade: 'good',
  influence: 'info',
  development: 'neutral',
};

/**
 * The world report.
 *
 * Everything happening outside the player's borders that they can observe:
 * the global business cycle, geopolitical tension, bloc alignment, wars
 * between third parties, and what each nation is currently trying to do.
 *
 * Military figures here are *estimates* wherever intelligence coverage is
 * thin, which is the panel's other job — showing the player how much of what
 * they think they know is actually known.
 */
export function WorldPanel({ game }: { game: GameState }) {
  const phase = PHASE_COPY[game.world.cyclePhase];
  const playerBloc = naturalBloc({
    government: game.identity.government,
    region: game.identity.region,
    gdp: game.economy.gdp,
  });

  const ranking = useMemo(
    () =>
      [...game.nations]
        .sort((a, b) => b.gdp - a.gdp)
        .slice(0, 12),
    [game.nations],
  );

  const blocTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const n of game.nations) {
      const bloc = n.bloc ?? 'non-aligned';
      totals[bloc] = (totals[bloc] ?? 0) + n.gdp;
    }
    totals[playerBloc] = (totals[playerBloc] ?? 0) + game.economy.gdp;
    return totals;
  }, [game.nations, game.economy.gdp, playerBloc]);

  const history = useMemo(
    () =>
      game.history.slice(-120).map((h) => ({
        label: `${MONTH_SHORT[h.month - 1]} ${h.year}`,
        gdp: Number(h.gdp.toFixed(1)),
      })),
    [game.history],
  );

  const playerShare = game.world.globalGdp > 0 ? (game.economy.gdp / game.world.globalGdp) * 100 : 0;

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Global tension"
            value={game.world.tension.toFixed(0)}
            hint="Drives war and crisis frequency"
            accent={game.world.tension > 60 ? '#ff5c6c' : game.world.tension > 35 ? '#ffb648' : '#7ee787'}
            icon={<Flame size={14} />}
          />
          <Stat
            label="World growth"
            value={`${game.world.globalGrowth.toFixed(1)}%`}
            hint={phase.label}
            accent="#4f8cff"
            icon={game.world.globalGrowth >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          />
          <Stat
            label="Our share of world GDP"
            value={`${playerShare.toFixed(1)}%`}
            hint={formatBillions(game.world.globalGdp, '$')}
            accent="#f5d073"
            icon={<Globe2 size={14} />}
          />
          <Stat
            label="Wars in progress"
            value={game.foreignWars.length + game.wars.filter((w) => !w.resolved).length}
            hint={`${game.foreignWars.length} not involving us`}
            accent="#ff5c6c"
            icon={<Swords size={14} />}
          />
        </div>
      </Reveal>

      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal delay={0.05} className="lg:col-span-2">
          <Card
            title="The global business cycle"
            subtitle="What the outside world is doing to your economy"
            icon={<Activity size={16} />}
            action={<Badge tone="neutral">{phase.label}</Badge>}
          >
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Cycle position</span>
                  <span className={clsx('num text-xs font-semibold', phase.tone)}>
                    {game.world.cycle >= 0 ? '+' : ''}
                    {game.world.cycle.toFixed(2)}
                  </span>
                </div>
                {/* -1..1 mapped onto a 0..100 meter. */}
                <Meter value={(game.world.cycle + 1) * 50} height={7} />
              </div>
              <p className="text-xs leading-relaxed text-slate-300">{phase.body}</p>
              <p className="text-[11px] text-slate-500">
                The phase turns in roughly {game.world.monthsToPhaseShift} month
                {game.world.monthsToPhaseShift === 1 ? '' : 's'}. How hard it hits you depends on how open
                your economy is — trade is currently worth a real share of monthly output, so a downturn
                abroad shows up here whether or not anything domestic changed.
              </p>

              {history.length > 2 && (
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={history} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="worldGdpFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" {...chartAxis} minTickGap={44} />
                    <YAxis {...chartAxis} width={52} />
                    <RTooltip {...chartTooltip} />
                    <Area type="monotone" dataKey="gdp" name="Our GDP ($B)" stroke="#4f8cff" strokeWidth={2} fill="url(#worldGdpFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              {history.length <= 2 && <ChartFrame.Empty message="Advance a few months to build a trend." />}
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.08}>
          <Card title="Blocs" subtitle="Economic weight by alignment" icon="🧭">
            <div className="space-y-3">
              {(Object.keys(BLOC_LABELS) as BlocId[]).map((bloc) => {
                const total = blocTotals[bloc] ?? 0;
                const share = game.world.globalGdp > 0 ? (total / game.world.globalGdp) * 100 : 0;
                return (
                  <div key={bloc}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-slate-300">
                        {BLOC_LABELS[bloc]}
                        {bloc === playerBloc && <Badge tone="gold">Ours</Badge>}
                      </span>
                      <span className="num text-[11px] text-slate-400">{share.toFixed(0)}%</span>
                    </div>
                    <Meter value={share} height={4} color={BLOC_COLORS[bloc]} />
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Nations drift toward the bloc of whoever they are warmest with. Sharing a bloc adds a standing
              relations bonus and a quarter more trade volume.
            </p>
          </Card>
        </Reveal>
      </div>

      {game.foreignWars.length > 0 && (
        <Reveal delay={0.1}>
          <Card title="Wars we are not in" subtitle="Third-party conflicts you can watch, exploit or join" icon="⚔️">
            <div className="space-y-3">
              {game.foreignWars.map((war) => {
                const a = game.nations.find((n) => n.id === war.aId);
                const b = game.nations.find((n) => n.id === war.bId);
                if (!a || !b) return null;
                // -120..120 mapped onto 0..100, from A's perspective.
                const swing = ((war.score + 120) / 240) * 100;
                return (
                  <div key={war.id} className="rounded-xl bg-white/[0.03] p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <Flag iso2={a.iso2} width={40} className="h-4 w-6 shrink-0" title={a.name} />
                      <span className="font-medium text-white">{a.name}</span>
                      <span className="mx-auto shrink-0 text-[10px] text-slate-500">
                        month {game.turn - war.startTurn} of the war
                      </span>
                      <span className="font-medium text-white">{b.name}</span>
                      <Flag iso2={b.iso2} width={40} className="h-4 w-6 shrink-0" title={b.name} />
                    </div>
                    <div className="mt-2">
                      <Meter value={swing} height={5} color={war.score > 0 ? '#4f8cff' : '#ff5c6c'} />
                      <p className="mt-1 text-center text-[10px] text-slate-500">
                        {Math.abs(war.score) < 20
                          ? 'Deadlocked'
                          : `${war.score > 0 ? a.name : b.name} is winning`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.12}>
        <Card
          title="The powers"
          subtitle="Ranked by economy. Military figures are estimates where our intelligence coverage is thin."
          icon="🌍"
        >
          {ranking.length === 0 ? (
            <EmptyState icon="🌍" title="No foreign nations" body="This campaign has no simulated world." />
          ) : (
            <div className="space-y-1.5">
              {ranking.map((nation) => {
                const estimate = estimatedStrength(game, nation);
                const coverage = game.intelligence.dossiers[nation.id] ?? 0;
                return (
                  <div
                    key={nation.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.03]"
                  >
                    <Flag iso2={nation.iso2} width={40} className="h-5 w-7 shrink-0" title={nation.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white">{nation.name}</p>
                      <p className="num text-[10px] text-slate-500">
                        {formatBillions(nation.gdp, '$')} · {BLOC_LABELS[nation.bloc ?? 'non-aligned']}
                      </p>
                    </div>

                    <Badge tone={AGENDA_TONES[nation.agenda]} className="hidden shrink-0 sm:inline-flex">
                      {AGENDA_LABELS[nation.agenda]}
                    </Badge>

                    <Tooltip
                      label={
                        estimate.confident
                          ? `Confirmed military strength: ${nation.militaryStrength.toFixed(0)}. Intelligence coverage ${coverage.toFixed(0)}%.`
                          : `Estimated military strength — coverage is only ${coverage.toFixed(0)}%. Open an embassy or run operations there to sharpen it.`
                      }
                    >
                      <div className="w-20 shrink-0">
                        <div className="mb-0.5 flex items-baseline justify-between">
                          <span className="text-[9px] uppercase tracking-wider text-slate-600">
                            {estimate.confident ? 'Military' : 'Est.'}
                          </span>
                          <span
                            className={clsx('num text-[10px] font-semibold', !estimate.confident && 'italic')}
                            style={{ color: meterColor(100 - estimate.value) }}
                          >
                            {estimate.value.toFixed(0)}
                            {!estimate.confident && '?'}
                          </span>
                        </div>
                        <Meter value={estimate.value} height={3} inverted />
                      </div>
                    </Tooltip>

                    <div className="hidden w-20 shrink-0 sm:block">
                      <div className="mb-0.5 flex items-baseline justify-between">
                        <span className="text-[9px] uppercase tracking-wider text-slate-600">Relations</span>
                        <span className="num text-[10px] font-semibold" style={{ color: meterColor((nation.relations + 100) / 2) }}>
                          {nation.relations.toFixed(0)}
                        </span>
                      </div>
                      <Meter value={(nation.relations + 100) / 2} height={3} />
                    </div>

                    {nation.sanctioningPlayer && <Badge tone="bad" className="shrink-0">Sanctioning us</Badge>}
                    {nation.atWarWithPlayer && <Badge tone="bad" className="shrink-0">At war</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
