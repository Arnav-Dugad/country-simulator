import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Check, Crown, Flag as FlagIcon, Gauge, Globe2, Landmark,
  Rocket, Search, Shield, Sparkles, Swords, Target, Users, Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import type {
  CustomFlag, DifficultyId, EraId, GovernmentTypeId, IdeologyId, MilitaryState,
  RegionId, SetupConfig, TraitId, VictoryGoalId,
} from '../../game/types';
import { COUNTRIES, REGION_IDS, REGION_LABELS, getCountry } from '../../game/data/countries';
import { CURRENCY_LIST, getCurrency } from '../../game/data/currencies';
import {
  DIFFICULTIES, ERAS, FLAG_EMBLEMS, FLAG_PATTERNS, GOVERNMENTS, IDEOLOGIES,
  LEADER_TITLES, NATION_COLORS, PORTRAITS, TRAITS, VICTORY_GOALS,
} from '../../game/data/definitions';
import { defaultSetup } from '../../game/engine/createGame';
import { formatPopulation } from '../../game/selectors';
import { Badge, Button, Card, Slider } from '../ui/primitives';
import { CustomFlagSvg, Flag } from '../ui/Flag';
import { ModifierList } from '../panels/ModifierList';

const STEPS = [
  { id: 'mode', label: 'Start', icon: Sparkles },
  { id: 'nation', label: 'Nation', icon: Globe2 },
  { id: 'identity', label: 'Identity', icon: FlagIcon },
  { id: 'government', label: 'Government', icon: Landmark },
  { id: 'leader', label: 'Leader', icon: Crown },
  { id: 'traits', label: 'Traits', icon: Sparkles },
  { id: 'focus', label: 'Doctrine', icon: Target },
  { id: 'era', label: 'Era', icon: Rocket },
  { id: 'difficulty', label: 'Difficulty', icon: Gauge },
  { id: 'victory', label: 'Objective', icon: Target },
  { id: 'rules', label: 'Rules', icon: Shield },
  { id: 'review', label: 'Review', icon: Check },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const MAX_TRAITS = 3;

export function SetupWizard({ onBegin, onCancel }: { onBegin: (config: SetupConfig) => void; onCancel?: () => void }) {
  const [config, setConfig] = useState<SetupConfig>(defaultSetup);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const patch = (update: Partial<SetupConfig>) => setConfig((c) => ({ ...c, ...update }));

  // The identity step is skipped for real nations — their identity is fixed.
  const visibleSteps = useMemo(
    () => STEPS.filter((s) => !(s.id === 'identity' && config.mode === 'real')),
    [config.mode],
  );
  const step = visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)];

  const blocker = validate(step.id, config);
  const isLast = stepIndex === visibleSteps.length - 1;

  const go = (delta: number) => {
    setDirection(delta);
    setStepIndex((i) => Math.max(0, Math.min(visibleSteps.length - 1, i + delta)));
  };

  const jumpTo = (index: number) => {
    // Only allow jumping backwards, or forwards to an already-valid position.
    if (index > stepIndex && validate(step.id, config)) return;
    setDirection(index > stepIndex ? 1 : -1);
    setStepIndex(index);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-500">New Campaign</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Form a Government</h1>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </header>

      <Stepper steps={visibleSteps} current={stepIndex} onJump={jumpTo} />

      <div className="relative mt-6 flex-1">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 34 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -34 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <StepBody step={step.id} config={config} patch={patch} />
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="sticky bottom-0 z-10 mt-8 -mx-4 border-t border-white/10 bg-ink-950/80 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => go(-1)} disabled={stepIndex === 0}>
            Back
          </Button>

          <p className="hidden min-w-0 flex-1 truncate text-center text-xs text-slate-500 sm:block" role="status">
            {blocker ?? `Step ${stepIndex + 1} of ${visibleSteps.length}`}
          </p>

          {isLast ? (
            <Button variant="primary" size="lg" icon={<Crown size={18} />} onClick={() => onBegin(normalise(config))}>
              Take Office
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<ArrowRight size={16} />}
              onClick={() => go(1)}
              disabled={Boolean(blocker)}
              title={blocker ?? undefined}
            >
              Continue
            </Button>
          )}
        </div>
        {/* Narrow screens have no room for the inline status, so repeat it
            below the controls. Hidden from assistive tech to avoid a
            duplicate announcement of the same message. */}
        {blocker && (
          <p className="mt-2 text-center text-xs text-aurora-amber sm:hidden" aria-hidden="true">
            {blocker}
          </p>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Validation & normalisation                                          */
/* ------------------------------------------------------------------ */

function validate(step: StepId, c: SetupConfig): string | null {
  switch (step) {
    case 'nation':
      if (c.mode === 'real' && !c.countryId) return 'Choose a nation to govern.';
      if (c.mode === 'custom' && !c.nationName.trim()) return 'Give your nation a name.';
      return null;
    case 'identity':
      if (!c.nationName.trim()) return 'Give your nation a name.';
      if (!c.capital.trim()) return 'Name your capital city.';
      return null;
    case 'leader':
      if (!c.leaderName.trim()) return 'Enter your leader’s name.';
      return null;
    case 'traits':
      if (c.traits.length === 0) return 'Choose at least one trait.';
      return null;
    default:
      return null;
  }
}

/** Fills in anything the player left implicit before the engine sees it. */
function normalise(c: SetupConfig): SetupConfig {
  const country = c.countryId ? getCountry(c.countryId) : undefined;
  const name = (c.nationName || country?.name || 'New Republic').trim();
  return {
    ...c,
    nationName: name,
    adjective: (c.adjective || name).trim(),
    capital: (c.capital || country?.capital || 'Capital City').trim(),
    motto: (c.motto || 'Strength through unity').trim(),
    leaderName: (c.leaderName || 'Alex Marlowe').trim(),
    iso2: c.mode === 'real' ? (c.iso2 || country?.iso2 || '') : '',
    customFlag: c.mode === 'custom' ? c.customFlag : null,
    currencyCode: c.currencyCode || country?.currency || 'USD',
    region: c.region || country?.region || 'europe',
  };
}

/* ------------------------------------------------------------------ */
/* Stepper                                                             */
/* ------------------------------------------------------------------ */

function Stepper({
  steps,
  current,
  onJump,
}: {
  steps: readonly { id: string; label: string; icon: typeof Sparkles }[];
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="flex min-w-max items-center gap-1">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className="flex items-center">
              <button
                onClick={() => onJump(i)}
                disabled={i > current}
                className={clsx(
                  'focus-ring flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition',
                  active && 'bg-gold-500 text-ink-950',
                  done && 'text-gold-400 hover:bg-white/[0.07]',
                  !active && !done && 'cursor-default text-slate-600',
                )}
              >
                <span
                  className={clsx(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                    active && 'bg-ink-950/25',
                    done && 'bg-gold-500/20',
                    !active && !done && 'bg-white/[0.06]',
                  )}
                >
                  {done ? <Check size={11} /> : <Icon size={11} />}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < steps.length - 1 && <span className="h-px w-3 bg-white/10" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step bodies                                                         */
/* ------------------------------------------------------------------ */

interface StepProps {
  config: SetupConfig;
  patch: (update: Partial<SetupConfig>) => void;
}

function StepBody({ step, config, patch }: StepProps & { step: StepId }) {
  switch (step) {
    case 'mode': return <ModeStep config={config} patch={patch} />;
    case 'nation': return <NationStep config={config} patch={patch} />;
    case 'identity': return <IdentityStep config={config} patch={patch} />;
    case 'government': return <GovernmentStep config={config} patch={patch} />;
    case 'leader': return <LeaderStep config={config} patch={patch} />;
    case 'traits': return <TraitsStep config={config} patch={patch} />;
    case 'focus': return <FocusStep config={config} patch={patch} />;
    case 'era': return <EraStep config={config} patch={patch} />;
    case 'difficulty': return <DifficultyStep config={config} patch={patch} />;
    case 'victory': return <VictoryStep config={config} patch={patch} />;
    case 'rules': return <RulesStep config={config} patch={patch} />;
    case 'review': return <ReviewStep config={config} patch={patch} />;
  }
}

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

function SelectCard({
  selected,
  onClick,
  children,
  className,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'focus-ring group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
        selected
          ? 'border-gold-500/60 bg-gold-500/[0.08] shadow-glow-gold'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      {selected && (
        <motion.span
          layoutId={undefined}
          className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-ink-950"
        >
          <Check size={12} strokeWidth={3} />
        </motion.span>
      )}
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  'focus-ring w-full rounded-xl border border-white/10 bg-ink-800/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600';

/* --------------------------------- Mode ---------------------------- */

function ModeStep({ config, patch }: StepProps) {
  return (
    <div>
      <StepHeading
        title="How do you want to begin?"
        body="Take command of a real country with its actual population, economy, resources and flag — or found an entirely new nation and design it from nothing."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectCard
          selected={config.mode === 'real'}
          onClick={() => patch({ mode: 'real' })}
          className="p-6"
        >
          <div className="mb-3 flex -space-x-2">
            {['us', 'in', 'br', 'jp', 'ng'].map((iso) => (
              <Flag key={iso} iso2={iso} width={80} className="h-8 w-12 shadow-lg" />
            ))}
          </div>
          <h3 className="text-base font-bold text-white">Govern a Real Nation</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            {COUNTRIES.length} countries with real populations, GDP, currencies, resource endowments and flags.
            Inherit their advantages and their problems.
          </p>
        </SelectCard>

        <SelectCard
          selected={config.mode === 'custom'}
          onClick={() => patch({ mode: 'custom' })}
          className="p-6"
        >
          <div className="mb-3">
            <CustomFlagSvg
              flag={config.customFlag ?? { pattern: 'triband-v', colors: ['#0f1729', '#e5b447', '#4f8cff'], emblem: '★' }}
              className="h-8 w-12 rounded ring-1 ring-white/15"
            />
          </div>
          <h3 className="text-base font-bold text-white">Found a New Nation</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Choose a name, capital, motto, currency and region, design a flag, and allocate your founding
            resources across five national priorities.
          </p>
        </SelectCard>
      </div>
    </div>
  );
}

/* -------------------------------- Nation --------------------------- */

function NationStep({ config, patch }: StepProps) {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<RegionId | 'all'>('all');

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (region !== 'all' && c.region !== region) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.capital.toLowerCase().includes(q) || c.currency.toLowerCase().includes(q);
    }).sort((a, b) => b.gdp - a.gdp);
  }, [search, region]);

  if (config.mode === 'custom') {
    return (
      <div>
        <StepHeading
          title="Name your nation"
          body="This is the country you will be remembered for. Its starting statistics are generated from the region you choose and the priorities you set later."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nation name" hint="Used everywhere in the game.">
            <input
              className={inputClass}
              value={config.nationName}
              maxLength={40}
              placeholder="e.g. Aurelia"
              onChange={(e) => patch({ nationName: e.target.value })}
            />
          </Field>
          <Field label="Demonym / adjective" hint="“The Aurelian economy”. Defaults to the nation name.">
            <input
              className={inputClass}
              value={config.adjective}
              maxLength={40}
              placeholder="e.g. Aurelian"
              onChange={(e) => patch({ adjective: e.target.value })}
            />
          </Field>
          <Field label="Capital city">
            <input
              className={inputClass}
              value={config.capital}
              maxLength={40}
              placeholder="e.g. Solmara"
              onChange={(e) => patch({ capital: e.target.value })}
            />
          </Field>
          <Field label="National motto">
            <input
              className={inputClass}
              value={config.motto}
              maxLength={60}
              placeholder="e.g. Through reason, forward"
              onChange={(e) => patch({ motto: e.target.value })}
            />
          </Field>
          <Field label="Region" hint="Determines neighbours, trade partners and which blocs you can join.">
            <select className={inputClass} value={config.region} onChange={(e) => patch({ region: e.target.value as RegionId })}>
              {REGION_IDS.map((r) => (
                <option key={r} value={r} className="bg-ink-800">
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency">
            <select
              className={inputClass}
              value={config.currencyCode}
              onChange={(e) => patch({ currencyCode: e.target.value })}
            >
              {CURRENCY_LIST.map((c) => (
                <option key={c.code} value={c.code} className="bg-ink-800">
                  {c.code} — {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepHeading
        title="Choose your nation"
        body="Every country starts with its real population, economy, resource endowment, government type and flag."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className={clsx(inputClass, 'pl-9')}
            placeholder="Search by country, capital or currency…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={clsx(inputClass, 'sm:w-64')}
          value={region}
          onChange={(e) => setRegion(e.target.value as RegionId | 'all')}
        >
          <option value="all" className="bg-ink-800">All regions</option>
          {REGION_IDS.map((r) => (
            <option key={r} value={r} className="bg-ink-800">
              {REGION_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {results.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No country matches “{search}”.</p>
      ) : (
        <div className="grid max-h-[52vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((country) => {
            const selected = config.countryId === country.id;
            return (
              <button
                key={country.id}
                onClick={() =>
                  patch({
                    countryId: country.id,
                    nationName: country.name,
                    adjective: country.name,
                    capital: country.capital,
                    region: country.region,
                    iso2: country.iso2,
                    currencyCode: country.currency,
                    government: country.government,
                  })
                }
                className={clsx(
                  'focus-ring flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                  selected
                    ? 'border-gold-500/60 bg-gold-500/[0.08] shadow-glow-gold'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]',
                )}
              >
                <Flag iso2={country.iso2} width={80} className="h-8 w-12 shrink-0" title={country.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{country.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{country.capital}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge tone="info">${(country.gdp / 1000).toFixed(2)}T</Badge>
                    <Badge>{formatPopulation(country.population)}</Badge>
                    <Badge tone="gold">{country.currency}</Badge>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {config.countryId && <CountryBrief id={config.countryId} />}
    </div>
  );
}

function CountryBrief({ id }: { id: string }) {
  const country = getCountry(id);
  if (!country) return null;
  const stats = [
    { label: 'Stability', value: country.stability },
    { label: 'Military', value: country.militaryStrength },
    { label: 'Technology', value: country.techLevel },
    { label: 'Integrity', value: 100 - country.corruption },
    { label: 'Development', value: country.hdi },
  ];
  return (
    <Card className="mt-4" padded>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Flag iso2={country.iso2} width={320} className="h-24 w-36 shrink-0 self-start" title={country.name} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-white">{country.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{country.blurb}</p>
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-5">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
                <p className="num text-sm font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>
          {(country.nuclear || country.unSecurityCouncil) && (
            <div className="mt-3 flex gap-2">
              {country.nuclear && <Badge tone="bad">☢️ Nuclear armed</Badge>}
              {country.unSecurityCouncil && <Badge tone="gold">🛡️ UN Security Council</Badge>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------- Identity -------------------------- */

function IdentityStep({ config, patch }: StepProps) {
  const flag: CustomFlag = config.customFlag ?? {
    pattern: 'triband-v',
    colors: ['#0f1729', '#e5b447', '#4f8cff'],
    emblem: '★',
  };
  const setFlag = (update: Partial<CustomFlag>) => patch({ customFlag: { ...flag, ...update } });

  return (
    <div>
      <StepHeading title="Design your flag" body="Pick a layout, three colours and an emblem. This flag appears throughout the game." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card title="Layout" icon="🎨">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FLAG_PATTERNS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFlag({ pattern: p.id })}
                  className={clsx(
                    'focus-ring rounded-xl border p-2 transition',
                    flag.pattern === p.id
                      ? 'border-gold-500/60 bg-gold-500/[0.08]'
                      : 'border-white/10 hover:border-white/25',
                  )}
                >
                  <CustomFlagSvg flag={{ ...flag, pattern: p.id }} className="h-10 w-full rounded" />
                  <p className="mt-1.5 truncate text-[10px] text-slate-400">{p.name}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Colours" icon="🎯">
            <div className="space-y-4">
              {([0, 1, 2] as const).map((i) => (
                <div key={i}>
                  <p className="mb-1.5 text-xs font-medium text-slate-300">
                    {['Primary', 'Secondary', 'Accent'][i]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {NATION_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          const next = [...flag.colors] as CustomFlag['colors'];
                          next[i] = color;
                          setFlag({ colors: next });
                          if (i === 0) patch({ primaryColor: color });
                          if (i === 1) patch({ secondaryColor: color });
                        }}
                        aria-label={`Colour ${color}`}
                        className={clsx(
                          'focus-ring h-7 w-7 rounded-lg border-2 transition hover:scale-110',
                          flag.colors[i] === color ? 'border-white' : 'border-white/15',
                        )}
                        style={{ background: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={flag.colors[i]}
                      onChange={(e) => {
                        const next = [...flag.colors] as CustomFlag['colors'];
                        next[i] = e.target.value;
                        setFlag({ colors: next });
                      }}
                      className="h-7 w-7 cursor-pointer rounded-lg border-2 border-white/15 bg-transparent p-0"
                      aria-label="Custom colour"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Emblem" icon="⭐">
            <div className="flex flex-wrap gap-1.5">
              {FLAG_EMBLEMS.map((emblem, i) => (
                <button
                  key={`${emblem}-${i}`}
                  onClick={() => setFlag({ emblem })}
                  className={clsx(
                    'focus-ring flex h-9 w-9 items-center justify-center rounded-lg border text-base transition hover:scale-105',
                    flag.emblem === emblem ? 'border-gold-500/60 bg-gold-500/10' : 'border-white/10',
                  )}
                >
                  {emblem || '—'}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card title="Preview" icon="🏳️">
            <CustomFlagSvg flag={flag} className="aspect-[3/2] w-full rounded-lg ring-1 ring-white/15" />
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-lg font-bold text-white">{config.nationName || 'Your Nation'}</p>
                <p className="text-xs text-slate-400">Capital: {config.capital || '—'}</p>
              </div>
              {config.motto && <p className="border-l-2 border-gold-500/50 pl-3 text-xs italic text-slate-400">“{config.motto}”</p>}
              <div className="hairline" />
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="gold">{getCurrency(config.currencyCode).symbol} {config.currencyCode}</Badge>
                <Badge tone="info">{REGION_LABELS[config.region]}</Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Government ------------------------- */

function GovernmentStep({ config, patch }: StepProps) {
  return (
    <div>
      <StepHeading
        title="Choose a system of government"
        body="This determines whether you face elections, how efficiently you can spend, and the civil liberties your citizens enjoy. It shapes everything downstream."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GOVERNMENTS.map((gov) => (
          <SelectCard
            key={gov.id}
            selected={config.government === gov.id}
            onClick={() => patch({ government: gov.id as GovernmentTypeId })}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xl">{gov.icon}</span>
              <h3 className="pr-6 text-sm font-semibold text-white">{gov.name}</h3>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">{gov.description}</p>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {gov.holdsElections ? (
                <Badge tone="info">Elections every {gov.termMonths / 12}y</Badge>
              ) : (
                <Badge tone="warn">No elections</Badge>
              )}
            </div>
            <ModifierList modifiers={gov.modifiers} limit={4} className="mt-2.5" />
          </SelectCard>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- Leader --------------------------- */

function LeaderStep({ config, patch }: StepProps) {
  return (
    <div>
      <StepHeading title="Who are you?" body="Your name, your title, your politics. Your ideology determines which party is yours and how the electorate reacts to what you do." />

      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card title="Portrait" icon="🖼️">
          <div className="mb-4 flex justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-white/[0.02] text-5xl ring-1 ring-white/10">
              {config.portrait}
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {PORTRAITS.map((p) => (
              <button
                key={p}
                onClick={() => patch({ portrait: p })}
                className={clsx(
                  'focus-ring flex h-9 items-center justify-center rounded-lg border text-lg transition hover:scale-105',
                  config.portrait === p ? 'border-gold-500/60 bg-gold-500/10' : 'border-white/10',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <input
                className={inputClass}
                value={config.leaderName}
                maxLength={40}
                placeholder="e.g. Vale Rhen"
                onChange={(e) => patch({ leaderName: e.target.value })}
              />
            </Field>
            <Field label="Title">
              <select className={inputClass} value={config.leaderTitle} onChange={(e) => patch({ leaderTitle: e.target.value })}>
                {LEADER_TITLES.map((t) => (
                  <option key={t} value={t} className="bg-ink-800">{t}</option>
                ))}
              </select>
            </Field>
          </div>

          <Slider
            label="Age at inauguration"
            value={config.leaderAge}
            min={28}
            max={80}
            onChange={(leaderAge) => patch({ leaderAge })}
            format={(v) => `${v} years old`}
            hint="Younger leaders can serve more terms; older ones start with more legitimacy."
          />

          <div>
            <p className="mb-2 text-xs font-medium text-slate-300">Political ideology</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {IDEOLOGIES.map((ideology) => (
                <SelectCard
                  key={ideology.id}
                  selected={config.ideology === ideology.id}
                  onClick={() => patch({ ideology: ideology.id as IdeologyId })}
                  className="p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ideology.color }} />
                    <h4 className="pr-6 text-xs font-semibold text-white">{ideology.name}</h4>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{ideology.description}</p>
                  <ModifierList modifiers={ideology.modifiers} limit={3} className="mt-2.5" />
                </SelectCard>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Traits --------------------------- */

function TraitsStep({ config, patch }: StepProps) {
  const toggle = (id: TraitId) => {
    const has = config.traits.includes(id);
    if (has) patch({ traits: config.traits.filter((t) => t !== id) });
    else if (config.traits.length < MAX_TRAITS) patch({ traits: [...config.traits, id] });
  };

  return (
    <div>
      <StepHeading
        title={`Choose up to ${MAX_TRAITS} traits`}
        body="Traits are permanent. They apply for the whole campaign and stack with your government, ideology and policies."
      />
      <p className="mb-4 text-xs text-slate-400">
        Selected <span className="num font-semibold text-gold-400">{config.traits.length}</span> of {MAX_TRAITS}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TRAITS.map((trait) => {
          const selected = config.traits.includes(trait.id);
          const blocked = !selected && config.traits.length >= MAX_TRAITS;
          return (
            <SelectCard key={trait.id} selected={selected} onClick={() => toggle(trait.id)} disabled={blocked}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-lg">{trait.icon}</span>
                <h3 className="pr-6 text-sm font-semibold text-white">{trait.name}</h3>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">{trait.description}</p>
              <ModifierList modifiers={trait.modifiers} limit={3} className="mt-2.5" />
            </SelectCard>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- Focus --------------------------- */

const FOCUS_META: { key: keyof SetupConfig['startingFocus']; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: 'economy', label: 'Economy', icon: <Wallet size={14} />, hint: 'Treasury, growth and lower unemployment at the start.' },
  { key: 'military', label: 'Military', icon: <Swords size={14} />, hint: 'Larger, better-equipped armed forces from day one.' },
  { key: 'science', label: 'Science', icon: <Rocket size={14} />, hint: 'Higher technology level and research output.' },
  { key: 'welfare', label: 'Welfare', icon: <Users size={14} />, hint: 'Better health, happiness and lower inequality.' },
  { key: 'diplomacy', label: 'Diplomacy', icon: <Globe2 size={14} />, hint: 'Warmer relations, cleaner institutions, more soft power.' },
];

const DOCTRINES: { id: MilitaryState['doctrine']; name: string; icon: string; description: string }[] = [
  { id: 'defensive', name: 'Defensive', icon: '🛡️', description: 'Fortify and hold. Strong at home, limited abroad.' },
  { id: 'offensive', name: 'Offensive', icon: '⚔️', description: 'Manoeuvre and strike first. Army and air force lead.' },
  { id: 'deterrence', name: 'Deterrence', icon: '☢️', description: 'Be too expensive to attack. Air, space and strategic forces.' },
  { id: 'expeditionary', name: 'Expeditionary', icon: '🚢', description: 'Project power globally. Navy and long-range logistics.' },
  { id: 'asymmetric', name: 'Asymmetric', icon: '💻', description: 'Cyber, irregulars and denial. Cheap, deniable, effective.' },
];

function FocusStep({ config, patch }: StepProps) {
  const total = Object.values(config.startingFocus).reduce((a, b) => a + b, 0);

  return (
    <div>
      <StepHeading
        title="Set your founding priorities"
        body="Distribute your starting emphasis across five areas. This shifts where your nation begins — it does not lock you in."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="National priorities" subtitle={`${total} points allocated`} icon="⚖️">
          <div className="space-y-4">
            {FOCUS_META.map((focus) => (
              <Slider
                key={focus.key}
                label={focus.label}
                value={config.startingFocus[focus.key]}
                min={0}
                max={50}
                step={5}
                onChange={(value) =>
                  patch({ startingFocus: { ...config.startingFocus, [focus.key]: value } })
                }
                format={(v) => `${total > 0 ? Math.round((v / total) * 100) : 0}%`}
                hint={focus.hint}
              />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => patch({ startingFocus: { economy: 20, military: 20, science: 20, welfare: 20, diplomacy: 20 } })}
            >
              Reset to balanced
            </Button>
          </div>
        </Card>

        <Card title="Military doctrine" subtitle="Shapes which branches develop fastest" icon="🎖️">
          <div className="space-y-2">
            {DOCTRINES.map((doctrine) => (
              <SelectCard
                key={doctrine.id}
                selected={config.doctrine === doctrine.id}
                onClick={() => patch({ doctrine: doctrine.id })}
                className="p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{doctrine.icon}</span>
                  <h4 className="pr-6 text-xs font-semibold text-white">{doctrine.name}</h4>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{doctrine.description}</p>
              </SelectCard>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------- Era ---------------------------- */

function EraStep({ config, patch }: StepProps) {
  return (
    <div>
      <StepHeading title="Choose your era" body="The era sets the starting year and the global conditions you govern under — technology, trade, tension and the climate." />
      <div className="grid gap-3 sm:grid-cols-2">
        {ERAS.map((era) => (
          <SelectCard key={era.id} selected={config.era === era.id} onClick={() => patch({ era: era.id as EraId })}>
            <div className="mb-1 flex items-baseline gap-2">
              <h3 className="pr-6 text-sm font-semibold text-white">{era.name}</h3>
              <span className="num text-xs text-gold-400">{era.startYear}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">{era.description}</p>
            <ModifierList modifiers={era.modifiers} limit={4} className="mt-2.5" />
          </SelectCard>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Difficulty ------------------------- */

function DifficultyStep({ config, patch }: StepProps) {
  return (
    <div>
      <StepHeading title="How hard should this be?" body="Difficulty scales the economy, how often crises hit, how much treasury you inherit, and your final score multiplier." />
      <div className="space-y-2">
        {DIFFICULTIES.map((d) => (
          <SelectCard key={d.id} selected={config.difficulty === d.id} onClick={() => patch({ difficulty: d.id as DifficultyId })}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{d.name}</h3>
              <Badge tone="gold">×{d.scoreMultiplier} score</Badge>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{d.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge tone={d.economyMultiplier >= 1 ? 'good' : 'bad'}>Economy ×{d.economyMultiplier}</Badge>
              <Badge tone={d.crisisMultiplier <= 1 ? 'good' : 'bad'}>Crises ×{d.crisisMultiplier}</Badge>
              <Badge tone={d.startingTreasuryMultiplier >= 1 ? 'good' : 'bad'}>Treasury ×{d.startingTreasuryMultiplier}</Badge>
            </div>
          </SelectCard>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- Victory -------------------------- */

function VictoryStep({ config, patch }: StepProps) {
  return (
    <div>
      <StepHeading title="What counts as winning?" body="Your objective defines the victory conditions tracked all campaign. You can always keep playing after you achieve it." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VICTORY_GOALS.map((goal) => (
          <SelectCard key={goal.id} selected={config.victoryGoal === goal.id} onClick={() => patch({ victoryGoal: goal.id as VictoryGoalId })}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-lg">{goal.icon}</span>
              <h3 className="pr-6 text-sm font-semibold text-white">{goal.name}</h3>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">{goal.description}</p>
            <ul className="mt-2.5 space-y-1">
              {goal.conditions.map((condition) => (
                <li key={condition} className="flex items-start gap-1.5 text-[10px] text-slate-500">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold-500/70" />
                  {condition}
                </li>
              ))}
            </ul>
          </SelectCard>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Rules --------------------------- */

function RulesStep({ config, patch }: StepProps) {
  const toggles: { key: 'enableWars' | 'enableDisasters' | 'ironman'; label: string; hint: string }[] = [
    { key: 'enableWars', label: 'Armed conflict', hint: 'Allows wars, border incidents and military events. Turn off for a purely civilian campaign.' },
    { key: 'enableDisasters', label: 'Natural disasters', hint: 'Earthquakes, storms, droughts, wildfires and pandemics.' },
    { key: 'ironman', label: 'Ironman', hint: 'One save slot, no reloading. Your decisions are final.' },
  ];

  const frequencies: { id: SetupConfig['eventFrequency']; label: string; hint: string }[] = [
    { id: 'low', label: 'Sparse', hint: 'Long stretches of quiet governance.' },
    { id: 'normal', label: 'Balanced', hint: 'The intended pace.' },
    { id: 'high', label: 'Eventful', hint: 'Something is always happening.' },
    { id: 'chaos', label: 'Relentless', hint: 'Crisis management as a full-time job.' },
  ];

  return (
    <div>
      <StepHeading title="Set the house rules" body="How much of the world's chaos do you want to deal with?" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Event frequency" icon="📰">
          <div className="space-y-2">
            {frequencies.map((f) => (
              <SelectCard key={f.id} selected={config.eventFrequency === f.id} onClick={() => patch({ eventFrequency: f.id })} className="p-3">
                <h4 className="pr-6 text-xs font-semibold text-white">{f.label}</h4>
                <p className="mt-0.5 text-[11px] text-slate-400">{f.hint}</p>
              </SelectCard>
            ))}
          </div>
        </Card>

        <Card title="Systems" icon="⚙️">
          <div className="space-y-3">
            {toggles.map((t) => (
              <button
                key={t.key}
                onClick={() => patch({ [t.key]: !config[t.key] } as Partial<SetupConfig>)}
                className="focus-ring flex w-full items-start gap-3 rounded-xl border border-white/10 p-3 text-left transition hover:border-white/25"
              >
                <span
                  className={clsx(
                    'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition',
                    config[t.key] ? 'bg-gold-500' : 'bg-white/15',
                  )}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                    className={clsx('h-4 w-4 rounded-full bg-white shadow', config[t.key] && 'ml-auto')}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-white">{t.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------- Review --------------------------- */

function ReviewStep({ config }: StepProps) {
  const country = config.countryId ? getCountry(config.countryId) : undefined;
  const gov = GOVERNMENTS.find((g) => g.id === config.government);
  const ideology = IDEOLOGIES.find((i) => i.id === config.ideology);
  const era = ERAS.find((e) => e.id === config.era);
  const difficulty = DIFFICULTIES.find((d) => d.id === config.difficulty);
  const goal = VICTORY_GOALS.find((v) => v.id === config.victoryGoal);
  const currency = getCurrency(config.currencyCode);

  const rows: [string, React.ReactNode][] = [
    ['Nation', config.nationName || country?.name || '—'],
    ['Capital', config.capital || country?.capital || '—'],
    ['Region', REGION_LABELS[config.region]],
    ['Currency', `${currency.name} (${currency.symbol} ${currency.code})`],
    ['Government', `${gov?.icon} ${gov?.name}`],
    ['Leader', `${config.portrait} ${config.leaderTitle} ${config.leaderName || '—'}, ${config.leaderAge}`],
    ['Ideology', ideology?.name ?? '—'],
    ['Traits', config.traits.length ? config.traits.map((t) => TRAITS.find((x) => x.id === t)?.name).join(', ') : 'None'],
    ['Doctrine', DOCTRINES.find((d) => d.id === config.doctrine)?.name ?? '—'],
    ['Era', `${era?.name} — ${era?.startYear}`],
    ['Difficulty', difficulty?.name ?? '—'],
    ['Objective', `${goal?.icon} ${goal?.name}`],
    ['Events', config.eventFrequency],
    ['Rules', [
      config.enableWars ? 'wars on' : 'wars off',
      config.enableDisasters ? 'disasters on' : 'disasters off',
      config.ironman ? 'ironman' : 'normal saves',
    ].join(' · ')],
  ];

  return (
    <div>
      <StepHeading title="Ready to take office" body="Review the government you are about to form. You can go back and change anything." />

      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card padded={false} className="overflow-hidden">
          <div className="relative">
            {config.mode === 'real' && country ? (
              <Flag iso2={country.iso2} width={640} className="h-40 w-full rounded-none object-cover" title={country.name} />
            ) : (
              <CustomFlagSvg
                flag={config.customFlag ?? { pattern: 'triband-v', colors: ['#0f1729', '#e5b447', '#4f8cff'], emblem: '★' }}
                className="h-40 w-full"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h3 className="text-xl font-bold text-white">{config.nationName || country?.name}</h3>
              {config.motto && <p className="text-xs italic text-slate-300">“{config.motto}”</p>}
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-2xl">{config.portrait}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {config.leaderTitle} {config.leaderName || 'Unnamed'}
                </p>
                <p className="text-xs text-slate-400">{ideology?.name}</p>
              </div>
            </div>
            {config.traits.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {config.traits.map((id) => {
                  const trait = TRAITS.find((t) => t.id === id);
                  return <Badge key={id} tone="gold">{trait?.icon} {trait?.name}</Badge>;
                })}
              </div>
            )}
          </div>
        </Card>

        <Card title="Campaign summary" icon="📋">
          <dl className="divide-y divide-white/[0.06]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
                <dd className="min-w-0 text-right text-xs font-medium capitalize text-white">{value}</dd>
              </div>
            ))}
          </dl>

          {goal && (
            <div className="mt-4 rounded-xl border border-gold-500/25 bg-gold-500/[0.06] p-3">
              <p className="text-xs font-semibold text-gold-400">{goal.icon} Victory conditions</p>
              <ul className="mt-2 space-y-1">
                <li className="flex items-start gap-1.5 text-[11px] text-slate-300">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold-500" />
                  At least 10 years in office
                </li>
                {goal.conditions.map((condition) => (
                  <li key={condition} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold-500" />
                    {condition}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
