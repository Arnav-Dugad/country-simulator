import { useMemo } from 'react';
import {
  Area, AreaChart, CartesianGrid, Cell, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, Building2, Flame, Gauge, HeartPulse, Radio, TrendingDown, TrendingUp, Users, Zap,
} from 'lucide-react';
import clsx from 'clsx';
import type { GameState, SectorId } from '../../game/types';
import {
  MONTH_SHORT, SECTOR_COLORS, SECTOR_LABELS, computeBudget, debtToGdp, energyBalance,
  formatBillions, formatMoney, formatPopulation, gdpPerCapita, modifierSources, renewableShare,
} from '../../game/selectors';
import { nationalIndex } from '../../game/engine/scoring';
import { frontierPerCapita } from '../../game/engine/tick';
import { Badge, Card, CountUp, Meter, Reveal, Stat, Tooltip, meterColor } from '../ui/primitives';
import { useUiStore } from '../../store/uiStore';
import { ChartFrame, chartAxis, chartTooltip } from './chartHelpers';

export function Dashboard({ game }: { game: GameState }) {
  const setPanel = useUiStore((s) => s.setPanel);
  const budget = useMemo(() => computeBudget(game), [game]);
  const perCapita = gdpPerCapita(game);
  const frontier = useMemo(() => frontierPerCapita(game), [game]);
  const alerts = useMemo(() => buildAlerts(game, budget.net), [game, budget.net]);

  const history = useMemo(
    () =>
      game.history.slice(-120).map((h) => ({
        label: `${MONTH_SHORT[h.month - 1]} ${h.year}`,
        gdp: Number(h.gdp.toFixed(1)),
        approval: Number(h.approval.toFixed(1)),
        stability: Number(h.stability.toFixed(1)),
        happiness: Number(h.happiness.toFixed(1)),
      })),
    [game.history],
  );

  const sectors = useMemo(
    () =>
      (Object.entries(game.economy.sectors) as [SectorId, number][])
        .map(([id, share]) => ({ id, name: SECTOR_LABELS[id], value: Number((share * 100).toFixed(1)) }))
        .sort((a, b) => b.value - a.value),
    [game.economy.sectors],
  );

  const activeModifiers = useMemo(
    () => modifierSources(game).filter((m) => Object.keys(m.modifiers).length > 0).slice(0, 14),
    [game],
  );

  return (
    <div className="space-y-5">
      {alerts.length > 0 && (
        <Reveal>
          <div className="flex flex-wrap gap-2">
            {alerts.map((alert) => (
              <button
                key={alert.text}
                onClick={() => alert.panel && setPanel(alert.panel)}
                className={clsx(
                  'focus-ring flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition',
                  alert.tone === 'danger'
                    ? 'border-aurora-red/30 bg-aurora-red/[0.08] text-aurora-red hover:bg-aurora-red/[0.14]'
                    : 'border-aurora-amber/30 bg-aurora-amber/[0.08] text-aurora-amber hover:bg-aurora-amber/[0.14]',
                  !alert.panel && 'cursor-default',
                )}
              >
                <AlertTriangle size={13} className="shrink-0" />
                {alert.text}
              </button>
            ))}
          </div>
        </Reveal>
      )}

      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Gross Domestic Product"
            value={formatBillions(game.economy.gdp, game.identity.currency.symbol)}
            delta={game.economy.growth}
            hint={`Real growth, annualised`}
            icon={game.economy.growth >= 0 ? <TrendingUp size={14} className="text-aurora-lime" /> : <TrendingDown size={14} className="text-aurora-red" />}
            accent="#f5d073"
          />
          <Stat
            label="GDP per capita"
            value={<CountUp value={perCapita} prefix="$" />}
            hint={`Frontier: $${Math.round(frontier).toLocaleString()}`}
            icon={<Gauge size={14} />}
            accent="#4f8cff"
          />
          <Stat
            label="Population"
            value={formatPopulation(game.society.population)}
            delta={game.society.birthRate - game.society.deathRate + game.society.netMigration}
            hint="Net change per 1,000 / year"
            icon={<Users size={14} />}
            accent="#3ddbd9"
          />
          <Stat
            label="Monthly balance"
            value={formatMoney(budget.net, game.identity.currency.symbol)}
            invertDelta={false}
            hint={`Debt ${debtToGdp(game).toFixed(0)}% of GDP`}
            icon={<Building2 size={14} />}
            accent={budget.net >= 0 ? '#7ee787' : '#ff5c6c'}
          />
        </div>
      </Reveal>

      <div className="grid gap-5 xl:grid-cols-3">
        <Reveal delay={0.05} className="xl:col-span-2">
          <Card
            title="National trajectory"
            subtitle="Output against public sentiment"
            icon="📈"
            action={<Badge tone="gold">Index {nationalIndex(game).toFixed(0)}</Badge>}
          >
            {history.length < 2 ? (
              <ChartFrame.Empty message="Advance a few months to build a trend." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={history} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gdpFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f5d073" stopOpacity={0.42} />
                      <stop offset="100%" stopColor="#f5d073" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" {...chartAxis} minTickGap={44} />
                  <YAxis yAxisId="left" {...chartAxis} width={54} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} {...chartAxis} width={30} />
                  <RTooltip {...chartTooltip} />
                  <Area yAxisId="left" type="monotone" dataKey="gdp" name="GDP ($B)" stroke="#f5d073" strokeWidth={2} fill="url(#gdpFill)" />
                  <Line yAxisId="right" type="monotone" dataKey="approval" name="Approval" stroke="#4f8cff" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="stability" name="Stability" stroke="#7ee787" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card title="Vital signs" icon="🩺">
            <div className="space-y-3.5">
              {[
                { label: 'Approval rating', value: game.approval },
                { label: 'Political stability', value: game.stability },
                { label: 'Institutional integrity', value: 100 - game.corruption },
                { label: 'Public happiness', value: game.society.happiness },
                { label: 'Healthcare', value: game.society.health },
                { label: 'Education', value: game.society.education },
                { label: 'Civil liberties', value: game.society.civilLiberties },
                { label: 'Public safety', value: 100 - game.society.crime },
                { label: 'Infrastructure', value: game.infrastructure },
                { label: 'Soft power', value: game.society.softPower },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
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

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <Reveal delay={0.12}>
          <Card title="Economic structure" subtitle="Share of output" icon="🏭">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={sectors} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2} stroke="none">
                  {sectors.map((entry) => (
                    <Cell key={entry.id} fill={SECTOR_COLORS[entry.id]} />
                  ))}
                </Pie>
                <RTooltip {...chartTooltip} formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {sectors.map((s) => (
                <div key={s.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SECTOR_COLORS[s.id] }} />
                  <span className="truncate text-slate-400">{s.name}</span>
                  <span className="num ml-auto text-slate-300">{s.value}%</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.14}>
          <Card title="Macro indicators" icon="📊">
            <dl className="space-y-3">
              <MacroRow label="Inflation" value={`${game.economy.inflation.toFixed(1)}%`} tone={game.economy.inflation > 6 ? 'bad' : game.economy.inflation > 3.5 ? 'warn' : 'good'} />
              <MacroRow label="Unemployment" value={`${game.economy.unemployment.toFixed(1)}%`} tone={game.economy.unemployment > 9 ? 'bad' : game.economy.unemployment > 6 ? 'warn' : 'good'} />
              <MacroRow label="Policy rate" value={`${game.economy.interestRate.toFixed(2)}%`} tone="neutral" />
              <MacroRow label="Public debt" value={formatBillions(game.economy.debt, game.identity.currency.symbol)} tone={debtToGdp(game) > 120 ? 'bad' : debtToGdp(game) > 80 ? 'warn' : 'good'} />
              <MacroRow label="Credit rating" value={`${game.economy.creditRating.toFixed(0)} / 100`} tone={game.economy.creditRating > 70 ? 'good' : game.economy.creditRating > 40 ? 'warn' : 'bad'} />
              <MacroRow label="Inequality (Gini)" value={game.economy.inequality.toFixed(0)} tone={game.economy.inequality > 55 ? 'bad' : game.economy.inequality > 40 ? 'warn' : 'good'} />
              <MacroRow label="Trade balance" value={formatMoney(game.economy.tradeBalance, game.identity.currency.symbol)} tone={game.economy.tradeBalance >= 0 ? 'good' : 'warn'} />
              <MacroRow label="Exchange rate" value={`${game.economy.exchangeRate.toFixed(2)} / $`} tone="neutral" />
            </dl>
          </Card>
        </Reveal>

        <Reveal delay={0.16}>
          <Card title="Energy & climate" icon="⚡">
            <div className="space-y-3">
              <IndexRow icon={<Zap size={13} />} label="Grid balance" value={energyBalance(game) * 100} suffix="%" hint={`${game.energy.demand.toFixed(0)} TWh demand`} />
              <IndexRow icon={<Radio size={13} />} label="Zero-carbon share" value={renewableShare(game)} suffix="%" />
              <IndexRow icon={<Flame size={13} />} label="Emissions" value={game.environment.emissions} raw suffix=" Mt" inverted />
              <IndexRow icon={<HeartPulse size={13} />} label="Air quality" value={100 - game.environment.pollution} suffix="" />
              <div className="hairline" />
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">Global warming</span>
                <span className="num text-sm font-bold" style={{ color: meterColor(100 - game.environment.globalTemp * 28) }}>
                  +{game.environment.globalTemp.toFixed(2)}°C
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">Disaster risk</span>
                <span className="num text-sm font-bold" style={{ color: meterColor(100 - game.environment.disasterRisk) }}>
                  {game.environment.disasterRisk.toFixed(0)}
                </span>
              </div>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.18}>
          <Card title="Active effects" subtitle={`${activeModifiers.length} sources`} icon="✨">
            <div className="max-h-[15.5rem] space-y-1.5 overflow-y-auto pr-1">
              {activeModifiers.map((mod, i) => (
                <Tooltip
                  key={`${mod.label}-${i}`}
                  label={
                    <span className="block space-y-0.5">
                      {Object.entries(mod.modifiers).map(([k, v]) => (
                        <span key={k} className="block">
                          {k}: {(v as number) > 0 ? '+' : ''}{v as number}
                        </span>
                      ))}
                    </span>
                  }
                >
                  <div className="flex w-full items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                    <span className="shrink-0 text-sm">{mod.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-left text-[11px] text-slate-300">{mod.label}</span>
                  </div>
                </Tooltip>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal delay={0.2}>
        <Card title="Recent dispatches" subtitle="The last thirty entries in the national record" icon="📜">
          <ol className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {game.log.slice(0, 30).map((entry) => (
              <li key={entry.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]">
                <span className="shrink-0 text-sm leading-5">{entry.icon ?? '•'}</span>
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      'block text-xs leading-relaxed',
                      entry.tone === 'good' && 'text-aurora-lime',
                      entry.tone === 'bad' && 'text-aurora-amber',
                      entry.tone === 'critical' && 'text-aurora-red',
                      entry.tone === 'neutral' && 'text-slate-300',
                    )}
                  >
                    {entry.text}
                  </span>
                  <span className="num mt-0.5 block text-[10px] text-slate-600">
                    {MONTH_SHORT[entry.month - 1]} {entry.year}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </Reveal>
    </div>
  );
}

function MacroRow({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const colors = { good: 'text-aurora-lime', warn: 'text-aurora-amber', bad: 'text-aurora-red', neutral: 'text-white' };
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={clsx('num text-sm font-semibold', colors[tone])}>{value}</dd>
    </div>
  );
}

function IndexRow({
  icon, label, value, suffix = '', hint, raw = false, inverted = false,
}: {
  icon: React.ReactNode; label: string; value: number; suffix?: string; hint?: string; raw?: boolean; inverted?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="text-slate-500">{icon}</span>
          {label}
        </span>
        <span className="num text-xs font-semibold text-white">
          {value.toFixed(raw ? 0 : 0)}{suffix}
        </span>
      </div>
      {!raw && <Meter value={Math.min(100, value)} height={3} inverted={inverted} />}
      {hint && <p className="mt-0.5 text-[10px] text-slate-600">{hint}</p>}
    </div>
  );
}

interface Alert {
  text: string;
  tone: 'danger' | 'warning';
  panel?: Parameters<ReturnType<typeof useUiStore.getState>['setPanel']>[0];
}

/** Surfaces the handful of things that most need the player's attention. */
function buildAlerts(game: GameState, net: number): Alert[] {
  const alerts: Alert[] = [];
  const gdpMonthly = (game.economy.gdp * 1000) / 12;

  if (game.stability < 30) alerts.push({ text: 'Stability critical — unrest is spreading', tone: 'danger', panel: 'politics' });
  if (game.approval < 25) alerts.push({ text: 'Approval collapsing', tone: 'danger', panel: 'politics' });
  if (debtToGdp(game) > 140) alerts.push({ text: `Debt at ${debtToGdp(game).toFixed(0)}% of GDP`, tone: 'danger', panel: 'budget' });
  if (net < -gdpMonthly * 0.06) alerts.push({ text: 'Severe budget deficit', tone: 'warning', panel: 'budget' });
  if (game.economy.inflation > 8) alerts.push({ text: `Inflation at ${game.economy.inflation.toFixed(1)}%`, tone: 'danger', panel: 'economy' });
  if (game.economy.unemployment > 11) alerts.push({ text: `Unemployment at ${game.economy.unemployment.toFixed(1)}%`, tone: 'warning', panel: 'economy' });
  if (energyBalance(game) < 0.97) alerts.push({ text: 'Electricity shortfall', tone: 'warning', panel: 'environment' });
  if (!game.research.current) alerts.push({ text: 'No research programme selected', tone: 'warning', panel: 'research' });
  if (game.advisors.length === 0) alerts.push({ text: 'No cabinet appointed', tone: 'warning', panel: 'cabinet' });
  if (game.wars.some((w) => !w.resolved && w.warScore < -25)) alerts.push({ text: 'Losing a war', tone: 'danger', panel: 'military' });
  if (game.monthsToElection > 0 && game.monthsToElection <= 6) {
    alerts.push({ text: `Election in ${game.monthsToElection} month${game.monthsToElection === 1 ? '' : 's'}`, tone: 'warning', panel: 'politics' });
  }

  return alerts.slice(0, 6);
}
