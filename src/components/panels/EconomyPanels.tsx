import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { Banknote, Coins, Landmark, PiggyBank, TrendingDown, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import type { BudgetDept, GameState, ResourceId, TaxKey } from '../../game/types';
import { RESOURCES } from '../../game/data/definitions';
import {
  MONTH_SHORT, baselineDeptSpend, computeBudget, debtToGdp, formatBillions, formatMoney,
  gdpPerCapita, totalModifiers,
} from '../../game/selectors';
import { frontierPerCapita } from '../../game/engine/tick';
import { BUDGET_MAX, TAX_LIMITS } from '../../game/engine/actions';
import { useGameStore } from '../../store/gameStore';
import { Badge, Button, Card, Meter, Reveal, Slider, Stat, Tooltip } from '../ui/primitives';
import { ChartFrame, chartAxis, chartTooltip } from './chartHelpers';

/* ================================ Economy =============================== */

export function EconomyPanel({ game }: { game: GameState }) {
  const symbol = game.identity.currency.symbol;
  const perCapita = gdpPerCapita(game);
  const frontier = frontierPerCapita(game);
  const headroom = Math.max(0, ((frontier - perCapita) / Math.max(1, perCapita)) * 100);
  const mods = useMemo(() => totalModifiers(game), [game]);

  const series = useMemo(
    () =>
      game.history.slice(-180).map((h) => ({
        label: `${MONTH_SHORT[h.month - 1]} ${h.year}`,
        Inflation: Number(h.inflation.toFixed(2)),
        Unemployment: Number(h.unemployment.toFixed(2)),
        'GDP per capita': Number(h.gdpPerCapita.toFixed(0)),
      })),
    [game.history],
  );

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Real growth" value={`${game.economy.growth.toFixed(2)}%`} accent="#7ee787"
            icon={game.economy.growth >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            hint="Annualised" />
          <Stat label="Inflation" value={`${game.economy.inflation.toFixed(2)}%`} accent="#ffb648" hint="Target 2%" />
          <Stat label="Unemployment" value={`${game.economy.unemployment.toFixed(1)}%`} accent="#4f8cff" />
          <Stat label="Productivity" value={game.economy.productivity.toFixed(0)} accent="#9d6bff" hint="Index, 100 = baseline" />
        </div>
      </Reveal>

      <div className="grid gap-5 xl:grid-cols-3">
        <Reveal delay={0.05} className="xl:col-span-2">
          <Card title="Macroeconomic history" subtitle="Inflation and unemployment, monthly" icon="📉">
            {series.length < 2 ? (
              <ChartFrame.Empty message="Advance a few months to build a trend." />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={series} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" {...chartAxis} minTickGap={48} />
                  <YAxis {...chartAxis} width={40} />
                  <RTooltip {...chartTooltip} />
                  <Line type="monotone" dataKey="Inflation" stroke="#ffb648" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Unemployment" stroke="#4f8cff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card title="Productivity frontier" subtitle="How much room is left to grow" icon="🎯">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Current</p>
                <p className="num text-2xl font-bold text-white">${Math.round(perCapita).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Sustainable frontier</p>
                <p className="num text-2xl font-bold text-gold-400">${Math.round(frontier).toLocaleString()}</p>
              </div>
              <Meter value={Math.min(100, (perCapita / Math.max(1, frontier)) * 100)} height={7} />
              <p className="text-[11px] leading-relaxed text-slate-400">
                {headroom > 8
                  ? `Your economy is ${headroom.toFixed(0)}% below what its institutions and technology could support. Growth will stay strong while that gap persists.`
                  : 'Your economy has essentially caught up with its frontier. To grow further, raise the ceiling: research technology, cut corruption, and improve education and infrastructure.'}
              </p>
              <div className="hairline" />
              <div className="space-y-2">
                {[
                  { label: 'Technologies', value: `${game.research.completed.length}` },
                  { label: 'Education index', value: game.society.education.toFixed(0) },
                  { label: 'Infrastructure', value: game.infrastructure.toFixed(0) },
                  { label: 'Corruption', value: game.corruption.toFixed(0) },
                  { label: 'Policy growth bonus', value: `${mods.gdpGrowth >= 0 ? '+' : ''}${mods.gdpGrowth.toFixed(1)}pp` },
                ].map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="num font-semibold text-white">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal delay={0.14}>
          <Card title="Balance sheet" icon="🏦">
            <dl className="space-y-3">
              <Row label="Nominal GDP" value={formatBillions(game.economy.gdp, symbol)} />
              <Row label="Treasury" value={formatMoney(game.economy.treasury, symbol)} tone={game.economy.treasury > 0 ? 'good' : 'bad'} />
              <Row label="Public debt" value={formatBillions(game.economy.debt, symbol)} tone={debtToGdp(game) > 100 ? 'bad' : 'neutral'} />
              <Row label="Debt / GDP" value={`${debtToGdp(game).toFixed(1)}%`} tone={debtToGdp(game) > 120 ? 'bad' : debtToGdp(game) > 80 ? 'warn' : 'good'} />
              <Row label="FX reserves" value={formatMoney(game.economy.reserves, symbol)} />
              <Row label="Credit rating" value={`${game.economy.creditRating.toFixed(0)} / 100`} tone={game.economy.creditRating > 70 ? 'good' : 'warn'} />
              <Row label="Policy rate" value={`${game.economy.interestRate.toFixed(2)}%`} />
              <Row label="Business confidence" value={game.economy.confidence.toFixed(0)} />
              <Row label="Exchange rate" value={`${game.economy.exchangeRate.toFixed(3)} ${game.identity.currency.code} / USD`} />
            </dl>
          </Card>
        </Reveal>

        <Reveal delay={0.18}>
          <ResourcesCard game={game} />
        </Reveal>
      </div>
    </div>
  );
}

function Row({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const colors = { good: 'text-aurora-lime', warn: 'text-aurora-amber', bad: 'text-aurora-red', neutral: 'text-white' };
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={clsx('num text-sm font-semibold', colors[tone])}>{value}</dd>
    </div>
  );
}

function ResourcesCard({ game }: { game: GameState }) {
  const rows = useMemo(
    () =>
      RESOURCES.map((def) => {
        const holding = game.resources[def.id as ResourceId];
        const net = holding.production - holding.consumption;
        return { def, holding, net, price: game.worldPrices[def.id as ResourceId] };
      }).sort((a, b) => Math.abs(b.net * b.price) - Math.abs(a.net * a.price)),
    [game.resources, game.worldPrices],
  );

  return (
    <Card title="Natural resources" subtitle="Production against domestic demand" icon="⛏️">
      <div className="max-h-[22rem] space-y-1 overflow-y-auto pr-1">
        {rows.map(({ def, holding, net, price }) => (
          <Tooltip
            key={def.id}
            label={
              <span className="block">
                <span className="block font-semibold text-white">{def.name}</span>
                <span className="mt-1 block">{def.description}</span>
                <span className="mt-1 block text-slate-400">
                  Reserves remaining: {holding.reserves.toFixed(0)}/100
                </span>
              </span>
            }
          >
            <div className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]">
              <span className="shrink-0 text-base">{def.icon}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs text-slate-300">{def.name}</span>
                <Meter value={holding.reserves} height={2} className="mt-1" />
              </span>
              <span className="shrink-0 text-right">
                <span className={clsx('num block text-xs font-semibold', net >= 0 ? 'text-aurora-lime' : 'text-aurora-red')}>
                  {net >= 0 ? '+' : ''}{net.toFixed(1)}
                </span>
                <span className="num block text-[10px] text-slate-500">×{price.toFixed(2)}</span>
              </span>
            </div>
          </Tooltip>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        A surplus is exported for revenue; a deficit is imported at a cost. Extraction depletes reserves permanently.
      </p>
    </Card>
  );
}

/* ================================ Treasury ============================== */

const DEPT_META: Record<BudgetDept, { label: string; icon: string; effect: string }> = {
  healthcare: { label: 'Healthcare', icon: '🏥', effect: 'Health index, life expectancy, happiness' },
  education: { label: 'Education', icon: '🎓', effect: 'Education, literacy, research, lower crime' },
  military: { label: 'Defence', icon: '🎖️', effect: 'Military strength, morale, readiness' },
  infrastructure: { label: 'Infrastructure', icon: '🛣️', effect: 'Infrastructure index, growth, build speed' },
  welfare: { label: 'Social welfare', icon: '🤲', effect: 'Happiness, equality, approval' },
  research: { label: 'Research', icon: '🔬', effect: 'Research points per month' },
  police: { label: 'Policing & justice', icon: '🚓', effect: 'Lower crime, higher stability' },
  environment: { label: 'Environment', icon: '🌿', effect: 'Pollution, forest cover, water security' },
  culture: { label: 'Culture & sport', icon: '🎭', effect: 'Soft power, happiness' },
  intelligence: { label: 'Intelligence', icon: '🕵️', effect: 'Covert capability, counter-intelligence' },
};

export function BudgetPanel({ game }: { game: GameState }) {
  const { setTax, setBudget, issueBonds, repayDebt, setAutoRepayDebt } = useGameStore();
  const symbol = game.identity.currency.symbol;
  const budget = useMemo(() => computeBudget(game), [game]);
  const baseline = useMemo(() => baselineDeptSpend(game), [game]);
  const [bondAmount, setBondAmount] = useState(50);

  const revenueRows = [
    { key: 'income', label: 'Income tax', value: budget.revenue.income },
    { key: 'corporate', label: 'Corporate tax', value: budget.revenue.corporate },
    { key: 'vat', label: 'VAT / sales tax', value: budget.revenue.vat },
    { key: 'capitalGains', label: 'Capital gains', value: budget.revenue.capitalGains },
    { key: 'property', label: 'Property tax', value: budget.revenue.property },
    { key: 'wealth', label: 'Wealth tax', value: budget.revenue.wealth },
    { key: 'carbon', label: 'Carbon pricing', value: budget.revenue.carbon },
    { key: 'tariff', label: 'Tariffs', value: budget.revenue.tariff },
    { key: 'resources', label: 'Resource exports', value: budget.revenue.resources },
    { key: 'trade', label: 'Trade surplus', value: budget.revenue.trade },
  ].filter((r) => r.value > 0.01);

  const spendRows = [
    ...Object.entries(budget.expenditure.departments).map(([key, value]) => ({
      key,
      label: DEPT_META[key as BudgetDept]?.label ?? key,
      value,
    })),
    { key: 'policies', label: 'Policy programmes', value: budget.expenditure.policies },
    { key: 'upkeep', label: 'Building upkeep', value: budget.expenditure.buildingUpkeep },
    { key: 'interest', label: 'Debt interest', value: budget.expenditure.debtInterest },
    { key: 'orgs', label: 'Membership dues', value: budget.expenditure.orgDues },
    { key: 'cabinet', label: 'Cabinet salaries', value: budget.expenditure.advisors },
    { key: 'imports', label: 'Resource imports', value: budget.expenditure.resourceImports },
    { key: 'war', label: 'War expenditure', value: budget.expenditure.war },
  ].filter((r) => r.value > 0.01);

  const chartData = [
    ...revenueRows.map((r) => ({ name: r.label, value: r.value, kind: 'revenue' as const })),
    ...spendRows.map((r) => ({ name: r.label, value: -r.value, kind: 'spend' as const })),
  ];

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Monthly revenue" value={formatMoney(budget.revenue.total, symbol)} accent="#7ee787" icon={<Coins size={14} />} />
          <Stat label="Monthly spending" value={formatMoney(budget.expenditure.total, symbol)} accent="#ff5c6c" icon={<Banknote size={14} />} />
          <Stat
            label="Net balance"
            value={formatMoney(budget.net, symbol)}
            accent={budget.net >= 0 ? '#7ee787' : '#ff5c6c'}
            hint={`${((budget.net / Math.max(1, (game.economy.gdp * 1000) / 12)) * 100).toFixed(1)}% of monthly GDP`}
            icon={<PiggyBank size={14} />}
          />
          <Stat label="Public debt" value={formatBillions(game.economy.debt, symbol)} accent="#ffb648"
            hint={`${debtToGdp(game).toFixed(0)}% of GDP`} icon={<Landmark size={14} />} />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <Card title="Where the money comes from and goes" subtitle="Millions per month" icon="⚖️">
          <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 22)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 96, bottom: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" {...chartAxis} />
              <YAxis type="category" dataKey="name" {...chartAxis} width={92} />
              <RTooltip {...chartTooltip} formatter={(v: number) => formatMoney(Math.abs(v), symbol)} />
              <Bar dataKey="value" radius={3}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.kind === 'revenue' ? '#7ee787' : '#ff5c6c'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Reveal>

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal delay={0.1}>
          <Card title="Taxation" subtitle="Raising rates costs approval; corruption erodes collection" icon="🧾">
            <div className="space-y-5">
              {(Object.keys(TAX_LIMITS) as TaxKey[]).map((key) => {
                const limits = TAX_LIMITS[key];
                return (
                  <Slider
                    key={key}
                    label={limits.label}
                    value={game.taxes[key]}
                    min={limits.min}
                    max={limits.max}
                    step={0.5}
                    onChange={(v) => setTax(key, v)}
                    format={(v) => `${v.toFixed(1)}%`}
                    hint={limits.hint}
                  />
                );
              })}
            </div>
          </Card>
        </Reveal>

        <div className="space-y-5">
          <Reveal delay={0.14}>
            <Card title="Departmental funding" subtitle="100% is the level that sustains current standards" icon="🏛️">
              <div className="space-y-4">
                {(Object.keys(DEPT_META) as BudgetDept[]).map((dept) => {
                  const meta = DEPT_META[dept];
                  const level = game.budget[dept].level;
                  const cost = baseline[dept] * level;
                  return (
                    <div key={dept}>
                      <Slider
                        label={`${meta.icon} ${meta.label}`}
                        value={level}
                        min={0}
                        max={BUDGET_MAX[dept]}
                        step={0.05}
                        onChange={(v) => setBudget(dept, v)}
                        format={(v) => `${(v * 100).toFixed(0)}%`}
                      />
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[10px] text-slate-600">{meta.effect}</span>
                        <span className="num shrink-0 text-[10px] text-slate-400">{formatMoney(cost, symbol)}/mo</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => (Object.keys(DEPT_META) as BudgetDept[]).forEach((d) => setBudget(d, 1))}>
                  Reset all to 100%
                </Button>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.18}>
            <Card title="Debt management" icon="📜">
              <p className="mb-4 text-xs leading-relaxed text-slate-400">
                Bonds raise cash immediately but you only receive face value if your credit is pristine — at a rating of{' '}
                <span className="num font-semibold text-white">{game.economy.creditRating.toFixed(0)}</span> you would raise about{' '}
                <span className="num font-semibold text-gold-400">{(Math.max(35, game.economy.creditRating)).toFixed(0)}¢</span> on the dollar.
              </p>
              <Slider
                label="Amount"
                value={bondAmount}
                min={5}
                max={Math.max(50, Math.round(game.economy.gdp * 0.35))}
                step={5}
                onChange={setBondAmount}
                format={(v) => formatBillions(v, symbol)}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => issueBonds(bondAmount)}>
                  Issue bonds
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => repayDebt(bondAmount)}
                  disabled={game.economy.debt <= 0 || game.economy.treasury < bondAmount * 1000}
                >
                  Repay {formatBillions(bondAmount, symbol)}
                </Button>
              </div>
              {debtToGdp(game) > 200 && (
                <Badge tone="bad" className="mt-3">Markets are close to refusing new issuance</Badge>
              )}

              <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-3">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-slate-400">Market yield on new debt</span>
                  <span
                    className={clsx(
                      'num font-semibold',
                      game.economy.bondYield > 12 ? 'text-aurora-red' : game.economy.bondYield > 7 ? 'text-aurora-amber' : 'text-white',
                    )}
                  >
                    {game.economy.bondYield.toFixed(2)}%
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  The yield is not the policy rate. It adds a spread for the credit rating, the debt
                  trajectory, inflation, and whether the central bank is independent — which is why a
                  captured bank can cut to zero and still watch borrowing get dearer.
                </p>
                <button
                  onClick={() => setAutoRepayDebt(!game.economy.autoRepayDebt)}
                  className="focus-ring flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left transition hover:bg-white/[0.03]"
                  role="switch"
                  aria-checked={game.economy.autoRepayDebt}
                >
                  <span
                    className={clsx(
                      'mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition',
                      game.economy.autoRepayDebt ? 'justify-end bg-gold-500' : 'justify-start bg-white/15',
                    )}
                  >
                    <span className="block h-3 w-3 rounded-full bg-white" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-white">Sweep surplus into repayment</span>
                    <span className="block text-[11px] leading-relaxed text-slate-500">
                      On, cash above 1.5 months of output pays the debt down automatically. Off, it
                      accumulates in the treasury — a war chest, at the cost of the interest bill.
                    </span>
                  </span>
                </button>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.2}>
            <SovereignFundCard game={game} />
          </Reveal>

          <Reveal delay={0.22}>
            <CentralBankCard game={game} />
          </Reveal>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Sovereign fund ---------------------------- */

/**
 * The sovereign wealth fund.
 *
 * Money moved here stops being spendable and starts compounding at a return
 * that tracks the *world* cycle rather than the domestic one — so the fund is
 * worth most exactly when the economy at home is worst. That is the entire
 * argument for having one, and the entire cost of it.
 */
function SovereignFundCard({ game }: { game: GameState }) {
  const { depositToFund, withdrawFromFund } = useGameStore();
  const symbol = game.identity.currency.symbol;
  const step = Math.max(50, Math.round(((game.economy.gdp * 1000) / 12) * 0.05));
  const [amount, setAmount] = useState(step * 4);

  const annual = (game.economy.sovereignFund * game.economy.fundReturn) / 100;

  return (
    <Card
      title="Sovereign wealth fund"
      icon={<PiggyBank size={16} />}
      subtitle="Cash in the treasury earns nothing. Cash in the fund earns a market return and cannot be spent until it is withdrawn."
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Fund value</p>
          <p className="num text-xl font-bold text-gold-400">{formatMoney(game.economy.sovereignFund, symbol)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Return</p>
          <p
            className={clsx(
              'num text-xl font-bold',
              game.economy.fundReturn >= 0 ? 'text-aurora-lime' : 'text-aurora-red',
            )}
          >
            {game.economy.fundReturn >= 0 ? '+' : ''}
            {game.economy.fundReturn.toFixed(1)}%
          </p>
          <p className="num text-[10px] text-slate-500">
            {formatMoney(annual / 12, symbol)} this month
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Slider
          label="Transfer amount"
          value={amount}
          min={step}
          max={step * 40}
          step={step}
          onChange={setAmount}
          format={(v) => formatMoney(v, symbol)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={game.economy.treasury < amount}
            onClick={() => depositToFund(amount)}
          >
            Deposit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={game.economy.sovereignFund < amount}
            onClick={() => withdrawFromFund(amount)}
          >
            Withdraw
          </Button>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Withdrawing more than a fifth of the fund at once is read as distress: it costs business
        confidence and approval. Building a Sovereign Fund Office raises the return and steadies it.
      </p>
    </Card>
  );
}

/* ---------------------------- Central bank ----------------------------- */

/**
 * Monetary policy.
 *
 * Independence is the inherited arrangement. Taking control lets the player set
 * the rate directly and is permanently priced in by markets — a credit-rating
 * hit, a confidence hit and a standing spread on every bond thereafter.
 */
function CentralBankCard({ game }: { game: GameState }) {
  const { setCentralBankIndependence, setPolicyRate } = useGameStore();
  const independent = game.economy.centralBankIndependent;

  return (
    <Card
      title="Central bank"
      icon={<Landmark size={16} />}
      subtitle={independent ? 'Independent — sets the rate by rule' : 'Under political direction'}
      action={<Badge tone={independent ? 'good' : 'warn'}>{independent ? 'Independent' : 'Directed'}</Badge>}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Policy rate</p>
          <p className="num text-xl font-bold text-white">{game.economy.interestRate.toFixed(2)}%</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Inflation</p>
          <p
            className={clsx(
              'num text-xl font-bold',
              game.economy.inflation > 6 ? 'text-aurora-red' : game.economy.inflation > 3.5 ? 'text-aurora-amber' : 'text-aurora-lime',
            )}
          >
            {game.economy.inflation.toFixed(2)}%
          </p>
        </div>
      </div>

      {!independent && (
        <div className="mt-4">
          <Slider
            label="Directed policy rate"
            value={game.economy.policyRateTarget}
            min={0}
            max={30}
            step={0.25}
            onChange={(v) => setPolicyRate(v)}
            format={(v) => `${v.toFixed(2)}%`}
            hint={
              game.economy.policyRateTarget < game.economy.inflation
                ? 'The real rate is negative. Inflation will keep rising until the rate is above it.'
                : 'A real rate above zero pulls inflation down and growth with it.'
            }
          />
        </div>
      )}

      <div className="mt-4">
        <Button
          size="sm"
          variant={independent ? 'secondary' : 'primary'}
          full
          onClick={() => setCentralBankIndependence(!independent)}
        >
          {independent ? 'Take direct control of the rate' : 'Restore central bank independence'}
        </Button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        {independent
          ? 'Taking control lets you set the rate yourself. Markets will price it immediately: a rating downgrade, a confidence hit, and a standing spread on every bond you issue afterwards.'
          : 'Restoring independence recovers part of the rating and confidence you spent, and hands the rate back to a Taylor rule.'}
      </p>
    </Card>
  );
}

