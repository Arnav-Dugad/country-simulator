import type { GameState, Modifiers, PanelTarget } from '../types';
import { TECH_INDEX } from '../data/technologies';
import { DIFFICULTY_INDEX, GOVERNMENT_INDEX } from '../data/definitions';
import {
  activeTradeVolume,
  baselineDeptSpend,
  clamp,
  computeBudget,
  energyBalance,
  gdpPerCapita,
  renewableShare,
  totalModifiers,
  type BudgetBreakdown,
} from '../selectors';
import { foreignTariffDrag } from './tradewar';

/**
 * "Why is this number this?"
 *
 * Every headline index in the simulation is an exponential approach toward a
 * target: `next = current + (target - current) × approach`. This module owns
 * every one of those targets, itemised term by term — and `tick` reads them
 * from here rather than computing its own.
 *
 * That direction of dependency is the whole point. An explanation that merely
 * *described* the engine would drift away from it within a release; an
 * explanation the engine is actually executing cannot. What the player reads
 * in the inspector is, literally, the arithmetic being run on their country.
 */

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

export type ExplainableId =
  | 'approval'
  | 'stability'
  | 'corruption'
  | 'infrastructure'
  | 'mandate'
  | 'legislativeSupport'
  | 'capitalIncome'
  | 'happiness'
  | 'health'
  | 'education'
  | 'crime'
  | 'civilLiberties'
  | 'softPower'
  | 'growth'
  | 'inflation'
  | 'unemployment'
  | 'creditRating'
  | 'confidence'
  | 'productivity'
  | 'inequality'
  | 'militaryStrength'
  | 'emissions'
  | 'pollution'
  | 'research';

export interface ExplainTerm {
  label: string;
  value: number;
  /** Optional one-line note on where the number comes from. */
  hint?: string;
}

export interface Explanation {
  id: ExplainableId;
  label: string;
  /** The value right now. */
  current: number;
  /** What the engine is pulling it toward, after clamping. */
  target: number;
  /** Sum of the terms before clamping — differs from `target` at a bound. */
  raw: number;
  /** Fraction of the remaining gap closed each month. */
  approach: number;
  /** Bounds the target is clamped into. */
  bounds: [number, number];
  /** Display suffix. */
  unit: string;
  terms: ExplainTerm[];
  /** True when a higher number is worse for the player. */
  inverted?: boolean;
  /** Amplitude of the random noise added each month, if any. */
  noise?: number;
  /** Terms multiply rather than add. */
  multiplicative?: boolean;
  /** Where the player goes to change it. */
  panel: PanelTarget;
  note: string;
}

/**
 * Shared working set, so a screen showing eight explanations computes the
 * modifier bundle and the budget once rather than eight times.
 */
export interface ExplainContext {
  mods: Required<Modifiers>;
  /** Filled in lazily — only two metrics need it. */
  budget?: BudgetBreakdown;
}

export function explainContext(s: GameState, mods?: Required<Modifiers>): ExplainContext {
  return { mods: mods ?? totalModifiers(s) };
}

function budgetOf(s: GameState, ctx: ExplainContext): BudgetBreakdown {
  if (!ctx.budget) ctx.budget = computeBudget(s);
  return ctx.budget;
}

/** Sums the terms and clamps, which is what every target below does. */
function assemble(
  base: Omit<Explanation, 'raw' | 'target'>,
): Explanation {
  const raw = base.terms.reduce(
    (acc, t) => (base.multiplicative ? acc * t.value : acc + t.value),
    base.multiplicative ? 1 : 0,
  );
  return { ...base, raw, target: clamp(raw, base.bounds[0], base.bounds[1]) };
}

/* ------------------------------------------------------------------ */
/* Shared sub-expressions                                              */
/* ------------------------------------------------------------------ */

/** Diminishing returns, so stacking twenty growth policies is not twice ten. */
export function softCap(value: number, cap: number): number {
  return cap * Math.tanh(value / cap);
}

/**
 * The log10 of the GDP per capita this country could sustain given its
 * technology, institutions and policy mix.
 *
 * The 4.95 baseline is the current world frontier (~$89,000). Institutions
 * move it by up to two orders of magnitude either way, which is the observed
 * spread between the best- and worst-governed countries on earth.
 */
export function frontierLog(s: GameState, mods: Required<Modifiers>): number {
  const institutions =
    (s.society.education - 82) * 0.011 +
    (s.infrastructure - 80) * 0.008 +
    (60 - s.corruption) * 0.01 +
    (s.stability - 75) * 0.005 +
    (s.economy.productivity - 130) * 0.0018 +
    (s.economy.creditRating - 70) * 0.0015 -
    (s.economy.inequality - 38) * 0.0012;

  // Difficulty moves the ceiling itself, not just the speed of approach.
  const difficultyShift = Math.log10(DIFFICULTY_INDEX[s.settings.difficulty].economyMultiplier) * 0.9;

  return clamp(
    4.95 +
      s.research.completed.length * 0.013 +
      softCap(mods.gdpGrowth, 3) * 0.05 +
      institutions +
      difficultyShift,
    2.4,
    5.9,
  );
}

/** The sustainable GDP per capita implied by `frontierLog`, in USD. */
export function frontierPerCapita(s: GameState): number {
  return Math.pow(10, frontierLog(s, totalModifiers(s)));
}

/** Shortfall penalty applied to growth and inflation when the grid is short. */
function energyPenalty(s: GameState): number {
  const balance = energyBalance(s);
  return balance >= 1 ? 0 : (1 - balance) * 9;
}

function activeWars(s: GameState): number {
  return s.wars.filter((w) => !w.resolved).length;
}

function avgUnrest(s: GameState): number {
  return s.provinces.reduce((sum, p) => sum + p.unrest, 0) / Math.max(1, s.provinces.length);
}

function devLevel(s: GameState): number {
  return clamp(Math.log10(Math.max(300, gdpPerCapita(s))), 2.5, 5.2);
}

/** Only include a term when it is doing something, to keep the list readable. */
function term(label: string, value: number, hint?: string): ExplainTerm {
  return { label, value, hint };
}

/* ================================================================== */
/* Politics                                                            */
/* ================================================================== */

export function explainApproval(s: GameState, ctx: ExplainContext): Explanation {
  const wars = s.wars.filter((w) => !w.resolved);
  const losing = wars.some((w) => w.warScore < -30);
  return assemble({
    id: 'approval',
    label: 'Public approval',
    current: s.approval,
    approach: 0.12,
    bounds: [0, 100],
    unit: '',
    noise: 0.35,
    panel: 'politics',
    note: 'Approval is what the public thinks of you today. It drives political capital, your mandate, and every election.',
    terms: [
      term('Baseline', 44, 'Where an averagely governed country sits.'),
      term('Active modifiers', ctx.mods.approval, 'Policies, advisors, buildings, traits, factions and crises combined.'),
      term(`Economic growth (${s.economy.growth.toFixed(1)}%)`, (s.economy.growth - 2) * 3.4, 'Measured against 2% trend.'),
      term(`Unemployment (${s.economy.unemployment.toFixed(1)}%)`, -Math.max(0, s.economy.unemployment - 5) * 1.7, 'Only bites above 5%.'),
      term(`Inflation (${s.economy.inflation.toFixed(1)}%)`, -Math.max(0, s.economy.inflation - 3) * 2.1, 'Only bites above 3%.'),
      term(`Happiness (${s.society.happiness.toFixed(0)})`, (s.society.happiness - 50) * 0.36),
      term(`Corruption (${s.corruption.toFixed(0)})`, -(s.corruption - 30) * 0.24),
      term(`Stability (${s.stability.toFixed(0)})`, (s.stability - 50) * 0.12),
      term(`Healthcare (${s.society.health.toFixed(0)})`, (s.society.health - 50) * 0.08),
      term(losing ? 'Losing a war' : 'War', losing ? -14 : wars.length > 0 ? 4 : 0, losing ? 'A war going badly is the single fastest way to lose a country.' : wars.length > 0 ? 'Rally round the flag, while it is going well.' : undefined),
    ],
  });
}

export function explainStability(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'stability',
    label: 'State stability',
    current: s.stability,
    approach: 0.1,
    bounds: [0, 100],
    unit: '',
    panel: 'politics',
    note: 'Stability is the state\'s grip on itself. At 2 the government is swept away; below 30 you are exposed to removal.',
    terms: [
      term('Baseline', 48),
      term('Active modifiers', ctx.mods.stability),
      term(`Approval (${s.approval.toFixed(0)})`, (s.approval - 50) * 0.3),
      term(`Happiness (${s.society.happiness.toFixed(0)})`, (s.society.happiness - 50) * 0.2),
      term(`Corruption (${s.corruption.toFixed(0)})`, -(s.corruption - 30) * 0.2),
      term(`Unemployment (${s.economy.unemployment.toFixed(1)}%)`, -Math.max(0, s.economy.unemployment - 7) * 1.2, 'Only bites above 7%.'),
      term(`Inequality (${s.economy.inequality.toFixed(0)})`, -(s.economy.inequality - 40) * 0.16),
      term(`Provincial unrest (${avgUnrest(s).toFixed(0)})`, -avgUnrest(s) * 0.22, 'Averaged across every province.'),
      term(`Policing budget (${(s.budget.police.level * 100).toFixed(0)}%)`, (s.budget.police.level - 1) * 8),
      term('Wars under way', -activeWars(s) * 5),
    ],
  });
}

export function explainCorruption(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'corruption',
    label: 'Corruption',
    current: s.corruption,
    approach: 0.05,
    bounds: [0, 100],
    unit: '',
    inverted: true,
    panel: 'politics',
    note: 'Corruption quietly taxes everything: collection rates, spending efficiency, research, growth and approval all run through it.',
    terms: [
      term('Baseline', 36),
      term('Active modifiers', ctx.mods.corruption),
      term(`Education (${s.society.education.toFixed(0)})`, -(s.society.education - 50) * 0.16),
      term(`Civil liberties (${s.society.civilLiberties.toFixed(0)})`, -(s.society.civilLiberties - 50) * 0.12, 'A free press is an anti-corruption institution.'),
      term(`Instability (${(100 - s.stability).toFixed(0)})`, (100 - s.stability) * 0.14),
      term(`Policing budget (${(s.budget.police.level * 100).toFixed(0)}%)`, -(s.budget.police.level - 1) * 5),
    ],
  });
}

export function explainInfrastructure(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'infrastructure',
    label: 'Infrastructure',
    current: s.infrastructure,
    approach: 0.05,
    bounds: [1, 100],
    unit: '',
    panel: 'budget',
    note: 'Infrastructure raises the productivity frontier, shortens construction, and is what provincial governments judge you on.',
    terms: [
      term('Baseline', 44),
      term(`Infrastructure budget (${(s.budget.infrastructure.level * 100).toFixed(0)}%)`, (s.budget.infrastructure.level - 1) * 32, 'The dominant term by a distance.'),
      term('Active modifiers', ctx.mods.infrastructure),
      term('Development level', (Math.log10(Math.max(300, gdpPerCapita(s))) - 3.5) * 6),
      term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.16, 'Money that never reaches the concrete.'),
    ],
  });
}

export function explainMandate(s: GameState): Explanation {
  const gov = GOVERNMENT_INDEX[s.identity.government];
  const ownSupport = s.parties.find((p) => p.id === `party-${s.leader.ideology}`)?.support ?? 25;
  const electoral = gov?.holdsElections
    ? clamp(40 + ownSupport * 1.1, 0, 100)
    : clamp(30 + s.stability * 0.5 + s.approval * 0.2, 0, 100);
  const martial = s.provinces.filter((p) => p.martialLaw).length;

  return assemble({
    id: 'mandate',
    label: 'Mandate',
    current: s.governance.mandate,
    approach: 0.09,
    bounds: [0, 100],
    unit: '',
    panel: 'politics',
    note: 'Mandate is how legitimate your government is considered to be. It sets your capital ceiling and is one of the three conditions for being removed from office.',
    terms: [
      term(
        gov?.holdsElections ? `Electoral standing (${ownSupport.toFixed(0)}% polling)` : 'Institutional standing',
        electoral * 0.45,
        gov?.holdsElections ? 'Your own party\'s share of the vote.' : 'Stability and approval, since there is no ballot.',
      ),
      term(`Approval (${s.approval.toFixed(0)})`, s.approval * 0.28),
      term(`Civil liberties (${s.society.civilLiberties.toFixed(0)})`, s.society.civilLiberties * 0.12),
      term(`Integrity (${(100 - s.corruption).toFixed(0)})`, (100 - s.corruption) * 0.15),
      term('Provinces under martial law', -martial * 4, martial > 0 ? 'Occupation is legitimacy spent.' : undefined),
    ],
  });
}

export function explainLegislativeSupport(s: GameState): Explanation {
  const gov = GOVERNMENT_INDEX[s.identity.government];
  const totalSupport = s.parties.reduce((sum, p) => sum + p.support, 0) || 100;
  const ownId = `party-${s.leader.ideology}`;
  const partners = new Set(s.governance.coalition?.map((c) => c.partyId) ?? []);

  if (!gov?.holdsElections) {
    return assemble({
      id: 'legislativeSupport',
      label: 'Institutional support',
      current: s.governance.legislativeSupport,
      approach: 0.14,
      bounds: [0, 100],
      unit: '%',
      panel: 'politics',
      note: 'With no legislature, the apparatus of state is what has to be carried instead. Stability and clean administration are the whole of it.',
      terms: [
        term('Baseline', 55),
        term(`Stability (${s.stability.toFixed(0)})`, s.stability * 0.3),
        term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.15),
      ],
    });
  }

  return assemble({
    id: 'legislativeSupport',
    label: 'Legislative support',
    current: s.governance.legislativeSupport,
    approach: 0.14,
    bounds: [0, 100],
    unit: '%',
    panel: 'politics',
    note: 'Every party votes according to its relations with you — except coalition partners, who vote with you at 88 for as long as their bargain holds.',
    terms: s.parties.map((party) => {
      const weight = party.support / totalSupport;
      const willing =
        party.id === ownId ? 95 : partners.has(party.id) ? 88 : clamp(50 + party.relation * 0.5, 0, 100);
      return term(
        `${party.name} (${party.support.toFixed(0)}%)`,
        weight * willing,
        party.id === ownId
          ? 'Your own party.'
          : partners.has(party.id)
            ? 'Coalition partner — voting with you under the agreement.'
            : `Relations ${party.relation.toFixed(0)} ⇒ ${willing.toFixed(0)}% willing.`,
      );
    }),
  });
}

export function explainCapitalIncome(s: GameState): Explanation {
  const gov = GOVERNMENT_INDEX[s.identity.government];
  return assemble({
    id: 'capitalIncome',
    label: 'Political capital income',
    current: s.governance.capitalPerMonth,
    // Capital income is not an approach — it is banked directly each month.
    approach: 1,
    bounds: [-4, 14],
    unit: '/mo',
    panel: 'politics',
    note: 'Money buys things; capital buys permission. This is what you bank each month, up to the cap set by your mandate and terms served.',
    terms: [
      term(
        gov?.holdsElections ? 'Elected government' : 'Government answering to nobody',
        gov?.holdsElections ? 1.4 : 2.4,
        'Not having to consult a legislature is worth something on its own.',
      ),
      term(`Approval (${s.approval.toFixed(0)})`, (s.approval - 35) * 0.09),
      term(`Mandate (${s.governance.mandate.toFixed(0)})`, (s.governance.mandate - 45) * 0.05),
      term(`Legislature (${s.governance.legislativeSupport.toFixed(0)}%)`, (s.governance.legislativeSupport - 40) * 0.045),
      term(`Stability (${s.stability.toFixed(0)})`, (s.stability - 45) * 0.035),
      term(`Momentum (${s.governance.momentum.toFixed(0)})`, s.governance.momentum * 0.02, 'Rises with bills passed and crises resolved; decays on its own.'),
      term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.012),
    ],
  });
}

/* ================================================================== */
/* Society                                                             */
/* ================================================================== */

export function explainHappiness(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'happiness',
    label: 'Happiness',
    current: s.society.happiness,
    approach: 0.07,
    bounds: [1, 100],
    unit: '',
    panel: 'society',
    note: 'Happiness is the largest single input to approval, and it moves slowly. Nothing you do to it today shows up for a year.',
    terms: [
      term('Baseline', 30),
      term('Active modifiers', ctx.mods.happiness),
      term('Development level', (devLevel(s) - 3.5) * 4),
      term(`Healthcare (${s.society.health.toFixed(0)})`, (s.society.health - 50) * 0.2),
      term(`Education (${s.society.education.toFixed(0)})`, (s.society.education - 50) * 0.12),
      term(`Safety (crime ${s.society.crime.toFixed(0)})`, (100 - s.society.crime) * 0.16),
      term(`Civil liberties (${s.society.civilLiberties.toFixed(0)})`, (s.society.civilLiberties - 50) * 0.14),
      term(`Welfare budget (${(s.budget.welfare.level * 100).toFixed(0)}%)`, (s.budget.welfare.level - 1) * 11),
      term(`Inequality (${s.economy.inequality.toFixed(0)})`, (60 - s.economy.inequality) * 0.24),
      term(`Unemployment (${s.economy.unemployment.toFixed(1)}%)`, -Math.max(0, s.economy.unemployment - 5) * 1.3),
      term(`Inflation (${s.economy.inflation.toFixed(1)}%)`, -Math.max(0, s.economy.inflation - 3) * 1.1),
      term(`Pollution (${s.environment.pollution.toFixed(0)})`, -s.environment.pollution * 0.1),
      term(`Growth (${s.economy.growth.toFixed(1)}%)`, (s.economy.growth - 1.5) * 1.4),
    ],
  });
}

export function explainHealth(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'health',
    label: 'Healthcare',
    current: s.society.health,
    approach: 0.06,
    bounds: [2, 100],
    unit: '',
    panel: 'budget',
    note: 'Funding health at 100% sustains the level a country of this development already has. Anything above it is a real improvement.',
    terms: [
      term('Baseline', 40),
      term(`Health budget (${(s.budget.healthcare.level * 100).toFixed(0)}%)`, (s.budget.healthcare.level - 1) * 30),
      term('Active modifiers', ctx.mods.health),
      term('Development level', devLevel(s) * 8),
      term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.16),
    ],
  });
}

export function explainEducation(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'education',
    label: 'Education',
    current: s.society.education,
    approach: 0.05,
    bounds: [2, 100],
    unit: '',
    panel: 'budget',
    note: 'Education compounds into everything: research output, productivity, corruption, crime and the frontier itself.',
    terms: [
      term('Baseline', 42),
      term(`Education budget (${(s.budget.education.level * 100).toFixed(0)}%)`, (s.budget.education.level - 1) * 30),
      term('Active modifiers', ctx.mods.education),
      term('Development level', devLevel(s) * 8),
      term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.14),
    ],
  });
}

export function explainCrime(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'crime',
    label: 'Crime',
    current: s.society.crime,
    approach: 0.07,
    bounds: [1, 100],
    unit: '',
    inverted: true,
    panel: 'society',
    note: 'Crime answers to inequality and unemployment far more than to policing — the policing term is the smallest of the three.',
    terms: [
      term('Baseline', 34),
      term('Active modifiers', ctx.mods.crime),
      term(`Policing budget (${(s.budget.police.level * 100).toFixed(0)}%)`, -(s.budget.police.level - 1) * 18),
      term(`Education (${s.society.education.toFixed(0)})`, -(s.society.education - 50) * 0.3),
      term('Development level', -(devLevel(s) - 3.5) * 6),
      term(`Unemployment (${s.economy.unemployment.toFixed(1)}%)`, (s.economy.unemployment - 6) * 1.5),
      term(`Inequality (${s.economy.inequality.toFixed(0)})`, (s.economy.inequality - 38) * 0.42),
      term(`Corruption (${s.corruption.toFixed(0)})`, s.corruption * 0.16),
    ],
  });
}

export function explainCivilLiberties(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'civilLiberties',
    label: 'Civil liberties',
    current: s.society.civilLiberties,
    approach: 0.06,
    bounds: [1, 100],
    unit: '',
    panel: 'society',
    note: 'Liberties feed happiness, mandate, soft power and — through the press — corruption. Policy is by far the largest lever on them.',
    terms: [
      term('Baseline', 50),
      term('Active modifiers', ctx.mods.civilLiberties, 'Policies and government type dominate here.'),
      term(`Approval (${s.approval.toFixed(0)})`, (s.approval - 50) * 0.08),
      term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.1),
    ],
  });
}

export function explainSoftPower(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'softPower',
    label: 'Soft power',
    current: s.society.softPower,
    approach: 0.05,
    bounds: [1, 100],
    unit: '',
    panel: 'diplomacy',
    note: 'Soft power is how the rest of the world reads you. It drives relation drift, the frequency of unsolicited offers, and the cultural objective.',
    terms: [
      term('Baseline', 8),
      term('Active modifiers', ctx.mods.softPower),
      term('Economic weight', Math.log10(Math.max(1, s.economy.gdp)) * 8),
      term(`Culture budget (${(s.budget.culture.level * 100).toFixed(0)}%)`, (s.budget.culture.level - 1) * 14),
      term(`Civil liberties (${s.society.civilLiberties.toFixed(0)})`, s.society.civilLiberties * 0.16),
      term(`Technologies (${s.research.completed.length})`, s.research.completed.length * 0.5),
      term('Wars under way', -activeWars(s) * 6),
    ],
  });
}

/* ================================================================== */
/* Economy                                                             */
/* ================================================================== */

export function explainGrowth(s: GameState, ctx: ExplainContext): Explanation {
  const difficulty = DIFFICULTY_INDEX[s.settings.difficulty];
  const logPerCapita = Math.log10(Math.max(400, gdpPerCapita(s)));
  const frontier = frontierLog(s, ctx.mods);
  const convergence = clamp((frontier - logPerCapita) * 6, -9, 7.5) * difficulty.economyMultiplier;
  const gdpMonthly = (s.economy.gdp * 1000) / 12;
  const openness = clamp(activeTradeVolume(s) / Math.max(1, gdpMonthly), 0, 0.6);

  return assemble({
    id: 'growth',
    label: 'Real GDP growth',
    current: s.economy.growth,
    approach: 0.3,
    bounds: [-20, 15],
    unit: '%',
    noise: 0.7,
    panel: 'economy',
    note: `Growth is convergence toward a productivity frontier, not a free-standing rate. Yours sits at $${Math.round(Math.pow(10, frontier)).toLocaleString()} per head against $${Math.round(gdpPerCapita(s)).toLocaleString()} today — the further below it you are, the faster you grow.`,
    terms: [
      term(
        'Convergence to the frontier',
        convergence,
        `Frontier $${Math.round(Math.pow(10, frontier)).toLocaleString()} per head. Raised by education, infrastructure, integrity, stability and technology.`,
      ),
      term(`Confidence (${s.economy.confidence.toFixed(0)})`, (s.economy.confidence - 50) * 0.02),
      term(
        `Working-age share (${(s.society.ageStructure.working * 100).toFixed(0)}%)`,
        (s.society.ageStructure.working - 0.62) * 4.5,
        'Demography is destiny, and it is not a fast lever.',
      ),
      term(
        `World cycle (${s.world.cycle >= 0 ? '+' : ''}${s.world.cycle.toFixed(2)})`,
        s.world.cycle * (0.6 + openness * 2.4),
        `Your trade openness is ${(openness * 100).toFixed(0)}% of monthly output, which is what sets your exposure to it.`,
      ),
      term('Nations sanctioning you', -s.nations.filter((n) => n.sanctioningPlayer).length * 0.12),
      term(`Inflation (${s.economy.inflation.toFixed(1)}%)`, -Math.max(0, s.economy.inflation - 4) * 0.28),
      term(`Policy rate (${s.economy.interestRate.toFixed(1)}%)`, -Math.max(0, s.economy.interestRate - 3) * 0.16),
      term(`Unemployment (${s.economy.unemployment.toFixed(1)}%)`, -Math.max(0, s.economy.unemployment - 6) * 0.1),
      term('Electricity shortfall', -energyPenalty(s), energyPenalty(s) > 0 ? 'The grid cannot meet demand. Nothing else on this list is worth as much as fixing it.' : undefined),
      term('Wars under way', -activeWars(s) * 1.3),
    ],
  });
}

export function explainInflation(s: GameState, ctx: ExplainContext): Explanation {
  const budget = budgetOf(s, ctx);
  const gdpMonthly = (s.economy.gdp * 1000) / 12;
  const deficitRatio = gdpMonthly > 0 ? -budget.net / gdpMonthly : 0;

  return assemble({
    id: 'inflation',
    label: 'Inflation',
    current: s.economy.inflation,
    approach: 0.24,
    bounds: [-6, 400],
    unit: '%',
    noise: 0.5,
    inverted: true,
    panel: 'economy',
    note: 'A Phillips curve plus deficit monetisation plus energy costs. The deficit term is the one that runs away if you let it.',
    terms: [
      term('Target', 2, 'Every central bank in the game aims at 2%.'),
      term('Active modifiers', ctx.mods.inflation),
      term(
        `Labour tightness (unemployment ${s.economy.unemployment.toFixed(1)}%)`,
        Math.max(0, 5.5 - s.economy.unemployment) * 0.34,
        'Below 5.5% unemployment wages start to bid up.',
      ),
      term(
        `Deficit (${(deficitRatio * 100).toFixed(1)}% of output)`,
        Math.max(0, deficitRatio) * 11,
        'Borrowing at this scale is ultimately paid for by the price level.',
      ),
      term('Energy shortfall', energyPenalty(s) * 0.55),
      term(`Corruption (${s.corruption.toFixed(0)})`, (s.corruption - 35) * 0.02),
      term(`Policy rate (${s.economy.interestRate.toFixed(1)}%)`, -(s.economy.interestRate - 2.5) * 0.46, s.economy.centralBankIndependent ? 'Set by an independent central bank following a Taylor rule.' : 'Set by you. Markets have noticed.'),
    ],
  });
}

export function explainUnemployment(s: GameState, ctx: ExplainContext): Explanation {
  const structural = clamp(
    5.4 + ctx.mods.unemployment - (s.society.education - 50) * 0.02 + (s.corruption - 35) * 0.02,
    1.2,
    40,
  );
  return assemble({
    id: 'unemployment',
    label: 'Unemployment',
    current: s.economy.unemployment,
    approach: 0.16,
    bounds: [0.6, 60],
    unit: '%',
    inverted: true,
    panel: 'economy',
    note: 'Okun\'s law around a structural rate: growth above trend pulls people into work, and the structural floor is what education and clean institutions buy you.',
    terms: [
      term('Structural rate', structural, `Baseline 5.4, moved by modifiers (${ctx.mods.unemployment.toFixed(2)}), education and corruption.`),
      term(`Growth gap (${s.economy.growth.toFixed(1)}% vs 2.2% trend)`, -(s.economy.growth - 2.2) * 0.55),
    ],
  });
}

export function explainCreditRating(s: GameState, ctx: ExplainContext): Explanation {
  const budget = budgetOf(s, ctx);
  const gdpMonthly = (s.economy.gdp * 1000) / 12;
  const deficitRatio = gdpMonthly > 0 ? -budget.net / gdpMonthly : 0;
  const debtRatio = s.economy.gdp > 0 ? (s.economy.debt / s.economy.gdp) * 100 : 0;

  return assemble({
    id: 'creditRating',
    label: 'Credit rating',
    current: s.economy.creditRating,
    approach: 0.09,
    bounds: [1, 100],
    unit: '',
    panel: 'budget',
    note: 'The rating sets the spread on your debt — up to 4 extra points of interest — and below 12, with debt over 320% of GDP, you default.',
    terms: [
      term('Baseline', 96),
      term(`Debt (${debtRatio.toFixed(0)}% of GDP)`, -debtRatio * 0.34),
      term(`Deficit (${(deficitRatio * 100).toFixed(1)}% of output)`, -Math.max(0, deficitRatio) * 60, 'The single heaviest term here.'),
      term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.26),
      term(`Stability (${s.stability.toFixed(0)})`, s.stability * 0.2),
      term(`Growth (${s.economy.growth.toFixed(1)}%)`, (s.economy.growth - 2) * 1.4),
      term(`Inflation (${s.economy.inflation.toFixed(1)}%)`, -Math.max(0, s.economy.inflation - 5) * 1.1),
    ],
  });
}

export function explainConfidence(s: GameState): Explanation {
  return assemble({
    id: 'confidence',
    label: 'Business confidence',
    current: s.economy.confidence,
    approach: 0.2,
    bounds: [2, 99],
    unit: '',
    panel: 'economy',
    note: 'Confidence feeds back into growth, so it is the loop that turns a good year into a boom and a bad one into a slump.',
    terms: [
      term('Baseline', 46),
      term(`Growth (${s.economy.growth.toFixed(1)}%)`, (s.economy.growth - 2) * 5.4, 'By far the dominant term.'),
      term(`Stability (${s.stability.toFixed(0)})`, (s.stability - 50) * 0.34),
      term(`Approval (${s.approval.toFixed(0)})`, (s.approval - 50) * 0.18),
      term(`Inflation (${s.economy.inflation.toFixed(1)}%)`, -Math.max(0, s.economy.inflation - 3) * 2.4),
      term('Wars under way', -activeWars(s) * 8),
    ],
  });
}

export function explainProductivity(s: GameState): Explanation {
  return assemble({
    id: 'productivity',
    label: 'Productivity index',
    current: s.economy.productivity,
    approach: 0.05,
    bounds: [25, 280],
    unit: '',
    panel: 'economy',
    note: 'Productivity sets your export competitiveness and raises the growth frontier. Research is the only term here that has no ceiling.',
    terms: [
      term('Baseline', 60),
      term(`Technologies (${s.research.completed.length})`, s.research.completed.length * 1.9),
      term(`Education (${s.society.education.toFixed(0)})`, s.society.education * 0.42),
      term(`Infrastructure (${s.infrastructure.toFixed(0)})`, s.infrastructure * 0.3),
      term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.16),
    ],
  });
}

export function explainInequality(s: GameState, ctx: ExplainContext): Explanation {
  return assemble({
    id: 'inequality',
    label: 'Inequality',
    current: s.economy.inequality,
    approach: 0.05,
    bounds: [8, 92],
    unit: '',
    inverted: true,
    panel: 'economy',
    note: 'Inequality drags on happiness, stability and crime at once, which makes it one of the cheapest things to fix and one of the most expensive to ignore.',
    terms: [
      term('Baseline', 38),
      term('Active modifiers', ctx.mods.inequality),
      term('Very low income tax', s.taxes.income < 20 ? 8 : 0, s.taxes.income < 20 ? 'Below 20% the system stops being progressive at all.' : undefined),
      term(`Wealth tax (${s.taxes.wealth.toFixed(1)}%)`, -s.taxes.wealth * 0.7, 'Point for point the strongest lever here.'),
      term(`Income tax (${s.taxes.income.toFixed(0)}%)`, -(s.taxes.income - 26) * 0.24),
      term(`Welfare budget (${(s.budget.welfare.level * 100).toFixed(0)}%)`, -(s.budget.welfare.level - 1) * 9),
      term(`Corruption (${s.corruption.toFixed(0)})`, s.corruption * 0.12),
    ],
  });
}

/* ================================================================== */
/* Military, environment, research                                     */
/* ================================================================== */

export function explainMilitaryStrength(s: GameState, ctx: ExplainContext): Explanation {
  const annualDefence = Math.max(0.5, baselineDeptSpend(s).military * s.budget.military.level * 12);
  const spendPower = (Math.log10(annualDefence) - 2.2) * 22;
  const techCount = s.research.completed.filter((t) => TECH_INDEX[t]?.branch === 'military').length;

  return assemble({
    id: 'militaryStrength',
    label: 'Military strength',
    current: s.military.strength,
    approach: 0.05,
    bounds: [1, 100],
    unit: '',
    panel: 'military',
    note: 'Strength tracks absolute defence spending, not the budget ratio — a superpower spending 1% of a $27T economy fields something a small state cannot match at 100% of its own.',
    terms: [
      term('Baseline', 18),
      term(
        `Defence spending ($${(annualDefence / 1000).toFixed(1)}B/yr)`,
        spendPower,
        'Log scale: doubling the defence budget is worth about 6.6 points.',
      ),
      term(`Military technologies (${techCount})`, techCount * 3.4),
      term('Active modifiers', ctx.mods.militaryPower * 0.5),
      term(`Veterancy (${s.military.veterancy.toFixed(0)})`, s.military.veterancy * 0.15),
      term(`Corruption (${s.corruption.toFixed(0)})`, -s.corruption * 0.14, 'Procurement that never arrives.'),
    ],
  });
}

export function explainEmissions(s: GameState, ctx: ExplainContext): Explanation {
  const fossilTWh = (['coal', 'gas', 'oil'] as const).reduce((sum, k) => sum + s.energy.production[k], 0);
  return assemble({
    id: 'emissions',
    label: 'CO₂ emissions',
    current: s.environment.emissions,
    approach: 0.05,
    bounds: [0.5, Number.POSITIVE_INFINITY],
    unit: ' Mt/yr',
    inverted: true,
    multiplicative: true,
    panel: 'environment',
    note: 'A product, not a sum: the emitting base multiplied by your modifiers and by what the carbon price suppresses.',
    terms: [
      term('Emitting base', s.economy.gdp * 0.12 + fossilTWh * 0.42, `Output ($${s.economy.gdp.toFixed(0)}B) plus ${fossilTWh.toFixed(0)} TWh of fossil generation.`),
      term('Active modifiers', 1 + ctx.mods.emissions / 100),
      term(`Carbon price (${s.taxes.carbon.toFixed(0)})`, 1 - s.taxes.carbon / 190, 'The single strongest lever on emissions in the game.'),
    ],
  });
}

export function explainPollution(s: GameState): Explanation {
  return assemble({
    id: 'pollution',
    label: 'Pollution',
    current: s.environment.pollution,
    approach: 0.05,
    bounds: [1, 100],
    unit: '',
    inverted: true,
    panel: 'environment',
    note: 'Pollution is emissions intensity rather than emissions: a large clean economy scores better than a small dirty one.',
    terms: [
      term('Emissions intensity', (s.environment.emissions / Math.max(1, s.economy.gdp)) * 60),
      term(`Environment budget (${(s.budget.environment.level * 100).toFixed(0)}%)`, (1 - s.budget.environment.level) * 22),
      term(`Fossil generation (${(100 - renewableShare(s)).toFixed(0)}% of the grid)`, (100 - renewableShare(s)) * 0.18),
    ],
  });
}

export function explainResearch(s: GameState, ctx: ExplainContext): Explanation {
  const pop = s.society.population;
  const base = Math.pow(pop / 1e6, 0.55) * 0.9 + Math.pow(Math.max(1, s.economy.gdp), 0.5) * 1.1;
  return assemble({
    id: 'research',
    label: 'Research output',
    current: s.research.perMonth,
    approach: 1,
    bounds: [0, Number.POSITIVE_INFINITY],
    unit: ' pts/mo',
    multiplicative: true,
    panel: 'research',
    note: 'A product of scale and quality. Every factor multiplies, so a large country with a hollowed-out education system produces less than a small one that funds it.',
    terms: [
      term('Scale', base, `Population ${(pop / 1e6).toFixed(0)}M and output $${s.economy.gdp.toFixed(0)}B.`),
      term(`Education (${s.society.education.toFixed(0)})`, 0.35 + s.society.education / 145),
      term(`Literacy (${s.society.literacy.toFixed(0)}%)`, 0.55 + s.society.literacy / 220),
      term(`Corruption (${s.corruption.toFixed(0)})`, 1 - s.corruption / 260),
      term(`Research budget (${(s.budget.research.level * 100).toFixed(0)}%)`, s.budget.research.level, 'Linear — the only factor here you can double overnight.'),
      term('Active modifiers', 1 + ctx.mods.research / 100),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

type Explainer = (s: GameState, ctx: ExplainContext) => Explanation;

const EXPLAINERS: Record<ExplainableId, Explainer> = {
  approval: explainApproval,
  stability: explainStability,
  corruption: explainCorruption,
  infrastructure: explainInfrastructure,
  mandate: (s) => explainMandate(s),
  legislativeSupport: (s) => explainLegislativeSupport(s),
  capitalIncome: (s) => explainCapitalIncome(s),
  happiness: explainHappiness,
  health: explainHealth,
  education: explainEducation,
  crime: explainCrime,
  civilLiberties: explainCivilLiberties,
  softPower: explainSoftPower,
  growth: explainGrowth,
  inflation: explainInflation,
  unemployment: explainUnemployment,
  creditRating: explainCreditRating,
  confidence: (s) => explainConfidence(s),
  productivity: (s) => explainProductivity(s),
  inequality: explainInequality,
  militaryStrength: explainMilitaryStrength,
  emissions: explainEmissions,
  pollution: (s) => explainPollution(s),
  research: explainResearch,
};

export const EXPLAINABLE_IDS = Object.keys(EXPLAINERS) as ExplainableId[];

/**
 * The itemised explanation for one index.
 *
 * Pass a context when showing several at once so the modifier bundle and the
 * budget are computed once rather than per metric.
 */
export function explain(s: GameState, id: ExplainableId, ctx?: ExplainContext): Explanation {
  return EXPLAINERS[id](s, ctx ?? explainContext(s));
}

/** Just the target, for the engine. */
export function targetFor(s: GameState, id: ExplainableId, ctx: ExplainContext): number {
  return EXPLAINERS[id](s, ctx).target;
}

/**
 * The terms that are currently hurting a metric, largest first.
 *
 * This is what makes the inspector actionable rather than merely honest: it
 * answers "what should I fix" instead of only "what is the sum".
 */
export function worstTerms(explanation: Explanation, count = 3): ExplainTerm[] {
  if (explanation.multiplicative) {
    return explanation.terms
      .filter((t) => t.value < 1 && t.value > 0)
      .sort((a, b) => a.value - b.value)
      .slice(0, count);
  }
  const sign = explanation.inverted ? 1 : -1;
  return explanation.terms
    .filter((t) => Math.sign(t.value) === sign && Math.abs(t.value) > 0.05)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, count);
}

/**
 * Trade competitiveness, itemised — used by the trade panel rather than the
 * generic inspector because it is a multiplier chain rather than an index.
 */
export function explainCompetitiveness(s: GameState, ctx: ExplainContext): ExplainTerm[] {
  return [
    term(`Productivity (${s.economy.productivity.toFixed(0)})`, s.economy.productivity / 100),
    term('Trade modifiers', 1 + ctx.mods.tradeIncome / 100),
    term(`Your tariffs (${s.taxes.tariff.toFixed(0)}%)`, 1 - s.taxes.tariff / 260, 'Tariffs raise input costs for your own exporters.'),
    term('Foreign counter-tariffs', foreignTariffDrag(s), 'What other governments levy on your goods in return.'),
  ];
}
