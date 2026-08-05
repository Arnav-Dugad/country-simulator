import type { AgendaDef, AgendaMetric, GameState } from '../types';
import { gdpPerCapita, renewableShare } from '../math';

/**
 * National agendas — five-year plans.
 *
 * A campaign is otherwise a series of independent monthly decisions. An agenda
 * is the one mechanic that makes the player commit in advance: declare a
 * target, accept a real handicap for the duration, and either hit it and keep
 * a permanent bonus or miss it and have publicly failed.
 *
 * The handicap is the point. A plan that only had upside would be a free
 * bonus, and everyone would run one permanently.
 */
export const AGENDAS: AgendaDef[] = [
  {
    id: 'industrial-leap',
    name: 'The Industrial Leap',
    icon: '🏗️',
    description:
      'Everything into capacity: plant, ports, power and the people to run them. Consumption waits five years.',
    metric: 'gdpPerCapita',
    improvement: 18,
    duringModifiers: { happiness: -6, emissions: 10, inequality: 4 },
    rewardModifiers: { gdpGrowth: 0.5, infrastructure: 6, spendingEfficiency: 4 },
    rewardCapital: 40,
  },
  {
    id: 'great-society',
    name: 'The Great Society',
    icon: '🤝',
    description:
      'A five-year commitment to make this a place people want to live, measured on whether they actually say so.',
    metric: 'happiness',
    improvement: 12,
    duringModifiers: { gdpGrowth: -0.4, taxEfficiency: -4 },
    rewardModifiers: { happiness: 8, stability: 5, inequality: -5 },
    rewardCapital: 45,
  },
  {
    id: 'rearmament',
    name: 'Rearmament Programme',
    icon: '🎖️',
    description:
      'Rebuild the armed forces to a standard that deters rather than merely exists.',
    metric: 'militaryStrength',
    improvement: 15,
    duringModifiers: { happiness: -5, research: -8, diplomacy: -8 },
    rewardModifiers: { militaryPower: 12, stability: 4 },
    rewardCapital: 35,
  },
  {
    id: 'energy-transition',
    name: 'The Energy Transition',
    icon: '🌬️',
    description:
      'Rebuild the grid around zero-carbon generation inside a single parliament.',
    metric: 'renewableShare',
    improvement: 22,
    duringModifiers: { gdpGrowth: -0.5, energyOutput: -5, spendingEfficiency: -4 },
    rewardModifiers: { emissions: -18, energyOutput: 10, softPower: 8 },
    rewardCapital: 45,
  },
  {
    id: 'knowledge-economy',
    name: 'The Knowledge Economy',
    icon: '🔬',
    description:
      'Reorient the state around research output and the institutions that produce it.',
    metric: 'researchCompleted',
    improvement: 8,
    duringModifiers: { gdpGrowth: -0.3, militaryPower: -6 },
    rewardModifiers: { research: 18, education: 6, gdpGrowth: 0.3 },
    rewardCapital: 45,
  },
  {
    id: 'clean-hands',
    name: 'The Clean Hands Programme',
    icon: '🧼',
    description:
      'Publicly stake the government on measurably reducing corruption, and accept the fight that starts.',
    metric: 'corruption',
    improvement: 14,
    lower: true,
    duringModifiers: { stability: -5, approval: -3, spendingEfficiency: -4 },
    rewardModifiers: { corruption: -10, taxEfficiency: 8, spendingEfficiency: 6 },
    rewardCapital: 50,
  },
  {
    id: 'full-employment',
    name: 'The Full Employment Pledge',
    icon: '👷',
    description:
      'Commit the government to a jobs guarantee and be judged on the unemployment rate alone.',
    metric: 'unemployment',
    improvement: 3,
    lower: true,
    duringModifiers: { inflation: 0.6, spendingEfficiency: -5 },
    rewardModifiers: { unemployment: -1.2, happiness: 6, inequality: -4 },
    rewardCapital: 40,
  },
  {
    id: 'cultural-offensive',
    name: 'The Cultural Offensive',
    icon: '🎭',
    description:
      'Fund the arts, the language, the diaspora and the broadcasters until the world knows who we are.',
    metric: 'softPower',
    improvement: 16,
    duringModifiers: { spendingEfficiency: -4, gdpGrowth: -0.2 },
    rewardModifiers: { softPower: 12, diplomacy: 10, tradeIncome: 5 },
    rewardCapital: 35,
  },
  {
    id: 'national-renewal',
    name: 'The National Renewal',
    icon: '🛤️',
    description:
      'Rebuild the physical country: roads, rail, water, grid and everything under them.',
    metric: 'infrastructure',
    improvement: 16,
    duringModifiers: { happiness: -4, emissions: 6 },
    rewardModifiers: { infrastructure: 10, gdpGrowth: 0.35, spendingEfficiency: 4 },
    rewardCapital: 40,
  },
  {
    id: 'mandate-restoration',
    name: 'Restore the Mandate',
    icon: '🗳️',
    description:
      'Stake the government on winning back public consent, and accept a harder job while doing it.',
    metric: 'approval',
    improvement: 18,
    duringModifiers: { spendingEfficiency: -6, taxEfficiency: -5 },
    rewardModifiers: { approval: 8, stability: 6 },
    rewardCapital: 55,
  },
];

export const AGENDA_INDEX = Object.fromEntries(AGENDAS.map((a) => [a.id, a])) as Record<
  string,
  AgendaDef
>;

/** How long a plan runs, in months. */
export const AGENDA_MONTHS = 60;

/** Political capital required to declare a plan. */
export const AGENDA_DECLARATION_COST = 25;

export const AGENDA_METRIC_LABELS: Record<AgendaMetric, string> = {
  gdpPerCapita: 'GDP per capita',
  happiness: 'Happiness',
  militaryStrength: 'Military strength',
  renewableShare: 'Zero-carbon share',
  researchCompleted: 'Technologies completed',
  approval: 'Approval',
  corruption: 'Corruption',
  unemployment: 'Unemployment',
  softPower: 'Soft power',
  infrastructure: 'Infrastructure',
};

/** Reads the live value of an agenda metric. */
export function readMetric(s: GameState, metric: AgendaMetric): number {
  switch (metric) {
    case 'gdpPerCapita': return gdpPerCapita(s);
    case 'happiness': return s.society.happiness;
    case 'militaryStrength': return s.military.strength;
    case 'renewableShare': return renewableShare(s);
    case 'researchCompleted': return s.research.completed.length;
    case 'approval': return s.approval;
    case 'corruption': return s.corruption;
    case 'unemployment': return s.economy.unemployment;
    case 'softPower': return s.society.softPower;
    case 'infrastructure': return s.infrastructure;
    default: return 0;
  }
}

/**
 * The target value a plan has to reach.
 *
 * Percentage-based for GDP per capita, because an 18-point rise means nothing
 * for a country starting at $1,200; absolute points for every index, because
 * a 12-point rise in happiness means the same thing everywhere.
 */
export function targetFor(def: AgendaDef, baseline: number): number {
  if (def.metric === 'gdpPerCapita') return baseline * (1 + def.improvement / 100);
  if (def.lower) return Math.max(0, baseline - def.improvement);
  return baseline + def.improvement;
}
