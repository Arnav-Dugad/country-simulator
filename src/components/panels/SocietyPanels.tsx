import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { Baby, Droplets, HeartPulse, Skull, TreePine, Users, Wind } from 'lucide-react';
import type { EnergySource, GameState } from '../../game/types';
import {
  ENERGY_COLORS, ENERGY_LABELS, MONTH_SHORT, energyBalance, formatPopulation,
  renewableShare, totalEnergyProduction,
} from '../../game/selectors';
import { hdi } from '../../game/selectors';
import { Badge, Card, Meter, Reveal, Stat, meterColor } from '../ui/primitives';
import { ChartFrame, chartAxis, chartTooltip } from './chartHelpers';

/* ================================= Society ============================== */

export function SocietyPanel({ game }: { game: GameState }) {
  const s = game.society;

  const ageData = [
    { name: 'Under 15', value: Math.round(s.ageStructure.young * 1000) / 10, color: '#3ddbd9' },
    { name: 'Working age', value: Math.round(s.ageStructure.working * 1000) / 10, color: '#4f8cff' },
    { name: 'Over 65', value: Math.round(s.ageStructure.elderly * 1000) / 10, color: '#9d6bff' },
  ];

  const popHistory = useMemo(
    () =>
      game.history.slice(-180).map((h) => ({
        label: `${MONTH_SHORT[h.month - 1]} ${h.year}`,
        Population: Math.round(h.population / 1e6),
        Happiness: Number(h.happiness.toFixed(1)),
      })),
    [game.history],
  );

  const dependencyRatio = ((s.ageStructure.young + s.ageStructure.elderly) / Math.max(0.01, s.ageStructure.working)) * 100;

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Population" value={formatPopulation(s.population)} accent="#4f8cff" icon={<Users size={14} />} />
          <Stat label="Life expectancy" value={`${s.lifeExpectancy.toFixed(1)}y`} accent="#7ee787" icon={<HeartPulse size={14} />} />
          <Stat label="Median age" value={s.medianAge.toFixed(1)} accent="#9d6bff" />
          <Stat label="Development index" value={hdi(game).toFixed(1)} hint="HDI-style composite" accent="#f5d073" />
        </div>
      </Reveal>

      <div className="grid gap-5 xl:grid-cols-3">
        <Reveal delay={0.05} className="xl:col-span-2">
          <Card title="Population and wellbeing" subtitle="Millions of people against the happiness index" icon="👥">
            {popHistory.length < 2 ? (
              <ChartFrame.Empty message="Advance a few months to build a trend." />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={popHistory} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="popFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" {...chartAxis} minTickGap={48} />
                  <YAxis yAxisId="left" {...chartAxis} width={48} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} {...chartAxis} width={30} />
                  <RTooltip {...chartTooltip} />
                  <Area yAxisId="left" type="monotone" dataKey="Population" stroke="#4f8cff" strokeWidth={2} fill="url(#popFill)" />
                  <Area yAxisId="right" type="monotone" dataKey="Happiness" stroke="#ff6bb5" strokeWidth={2} fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card title="Age structure" subtitle={`Dependency ratio ${dependencyRatio.toFixed(0)}%`} icon="📊">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={ageData} dataKey="value" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="none">
                  {ageData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RTooltip {...chartTooltip} formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1.5">
              {ageData.map((row) => (
                <div key={row.name} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2 w-2 rounded-sm" style={{ background: row.color }} />
                  <span className="text-slate-400">{row.name}</span>
                  <span className="num ml-auto text-slate-200">{row.value}%</span>
                </div>
              ))}
            </div>
            {dependencyRatio > 75 && (
              <Badge tone="warn" className="mt-3">Ageing population strains the budget</Badge>
            )}
          </Card>
        </Reveal>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal delay={0.14}>
          <Card title="Vital statistics" icon={<Baby size={16} />}>
            <dl className="space-y-3">
              <VitalRow icon={<Baby size={13} />} label="Birth rate" value={`${s.birthRate.toFixed(1)} / 1,000`} />
              <VitalRow icon={<Skull size={13} />} label="Death rate" value={`${s.deathRate.toFixed(1)} / 1,000`} />
              <VitalRow icon={<Users size={13} />} label="Net migration" value={`${s.netMigration >= 0 ? '+' : ''}${s.netMigration.toFixed(1)} / 1,000`} />
              <VitalRow icon={<Users size={13} />} label="Natural change" value={`${(s.birthRate - s.deathRate).toFixed(1)} / 1,000`} />
              <VitalRow icon={<Users size={13} />} label="Urbanisation" value={`${s.urbanisation.toFixed(0)}%`} />
              <VitalRow icon={<Users size={13} />} label="Literacy" value={`${s.literacy.toFixed(1)}%`} />
            </dl>
          </Card>
        </Reveal>

        <Reveal delay={0.16} className="lg:col-span-2">
          <Card title="Social indices" icon="🏛️">
            <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {[
                { label: 'Happiness', value: s.happiness },
                { label: 'Healthcare quality', value: s.health },
                { label: 'Education quality', value: s.education },
                { label: 'Civil liberties', value: s.civilLiberties },
                { label: 'Public safety', value: 100 - s.crime },
                { label: 'Soft power', value: s.softPower },
                { label: 'Equality', value: 100 - game.economy.inequality },
                { label: 'Infrastructure', value: game.infrastructure },
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
  );
}

function VitalRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-2 text-xs text-slate-400">
        <span className="text-slate-500">{icon}</span>
        {label}
      </dt>
      <dd className="num text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

/* =============================== Environment ============================ */

export function EnvironmentPanel({ game }: { game: GameState }) {
  const env = game.environment;
  const balance = energyBalance(game);
  const production = totalEnergyProduction(game);

  const energyData = useMemo(
    () =>
      (Object.entries(game.energy.production) as [EnergySource, number][])
        .map(([source, twh]) => ({ source, name: ENERGY_LABELS[source], value: Number(twh.toFixed(1)) }))
        .filter((row) => row.value > 0.05)
        .sort((a, b) => b.value - a.value),
    [game.energy.production],
  );

  const emissionsHistory = useMemo(
    () =>
      game.history.slice(-180).map((h) => ({
        label: `${MONTH_SHORT[h.month - 1]} ${h.year}`,
        Emissions: Number(h.emissions.toFixed(0)),
      })),
    [game.history],
  );

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Annual emissions"
            value={`${env.emissions.toFixed(0)} Mt`}
            accent="#ff5c6c"
            icon={<Wind size={14} />}
            hint="CO₂ equivalent"
          />
          <Stat label="Zero-carbon share" value={`${renewableShare(game).toFixed(0)}%`} accent="#7ee787" />
          <Stat
            label="Grid balance"
            value={`${(balance * 100).toFixed(0)}%`}
            accent={balance >= 1 ? '#7ee787' : '#ff5c6c'}
            hint={`${production.toFixed(0)} of ${game.energy.demand.toFixed(0)} TWh`}
          />
          <Stat label="Global warming" value={`+${env.globalTemp.toFixed(2)}°C`} accent="#ffb648" hint="Shared world figure" />
        </div>
      </Reveal>

      {balance < 0.97 && (
        <Reveal>
          <div className="rounded-xl border border-aurora-red/30 bg-aurora-red/[0.08] p-4">
            <p className="text-sm font-semibold text-aurora-red">Electricity shortfall</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Demand exceeds generation by {((1 - balance) * 100).toFixed(1)}%. This directly suppresses GDP growth and
              raises inflation. Build power stations in Construction, or research grid technology.
            </p>
          </div>
        </Reveal>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <Reveal delay={0.05} className="xl:col-span-2">
          <Card title="Emissions trajectory" subtitle="Megatonnes of CO₂ per year" icon="🌍">
            {emissionsHistory.length < 2 ? (
              <ChartFrame.Empty message="Advance a few months to build a trend." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={emissionsHistory} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="emissionsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff5c6c" stopOpacity={0.42} />
                      <stop offset="100%" stopColor="#ff5c6c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" {...chartAxis} minTickGap={48} />
                  <YAxis {...chartAxis} width={48} />
                  <RTooltip {...chartTooltip} />
                  <Area type="monotone" dataKey="Emissions" stroke="#ff5c6c" strokeWidth={2} fill="url(#emissionsFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card title="Environmental health" icon={<TreePine size={16} />}>
            <div className="space-y-3.5">
              {[
                { label: 'Air quality', value: 100 - env.pollution },
                { label: 'Forest cover', value: env.forestCover },
                { label: 'Biodiversity', value: env.biodiversity },
                { label: 'Water security', value: 100 - env.waterStress },
                { label: 'Disaster resilience', value: 100 - env.disasterRisk },
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
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-white/[0.03] p-3">
              <Droplets size={14} className="mt-0.5 shrink-0 text-aurora-cyan" />
              <p className="text-[11px] leading-relaxed text-slate-400">
                Warming raises water stress and disaster frequency every year. Carbon pricing, renewables and
                environmental spending all push back.
              </p>
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal delay={0.14}>
        <Card title="Electricity generation" subtitle="TWh per year by source" icon="⚡">
          <ResponsiveContainer width="100%" height={Math.max(200, energyData.length * 34)}>
            <BarChart data={energyData} layout="vertical" margin={{ top: 4, right: 20, left: 68, bottom: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" {...chartAxis} />
              <YAxis type="category" dataKey="name" {...chartAxis} width={64} />
              <RTooltip {...chartTooltip} formatter={(v: number) => `${v} TWh`} />
              <Bar dataKey="value" radius={3}>
                {energyData.map((entry) => (
                  <Cell key={entry.source} fill={ENERGY_COLORS[entry.source]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Capacity follows demand automatically, biased toward clean sources by your policies and carbon price.
            Building power stations adds capacity immediately on completion.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}
