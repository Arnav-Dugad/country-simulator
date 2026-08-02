import type { EventEffects, GameState, GovernmentTypeId, Modifiers } from '../types';

/**
 * Executive actions — the direct levers a head of government can pull between
 * the slow instruments (budgets, policies, construction) and the reactive ones
 * (events). Each has a cooldown so none can be spammed, and every one carries a
 * real cost somewhere: money, approval, liberties or credibility.
 */
export interface Decree {
  id: string;
  name: string;
  category: 'political' | 'economic' | 'security' | 'social' | 'emergency';
  icon: string;
  description: string;
  /** Flavour shown after it is enacted. */
  outcome: string;
  /** Cost in millions USD, scaled to the economy like everything else. */
  cost: number;
  /** Months before it can be used again. */
  cooldown: number;
  /** Immediate one-shot effects. */
  effects: EventEffects;
  /** Optional temporary modifier applied on top. */
  temporary?: { modifiers: Modifiers; months: number; label: string };
  requires?: {
    minStability?: number;
    minApproval?: number;
    maxApproval?: number;
    minTreasuryMultiple?: number;
    government?: GovernmentTypeId[];
    tech?: string[];
    atWar?: boolean;
  };
  /** Explains the trade-off in one line, shown under the button. */
  caution?: string;
}

export const DECREES: Decree[] = [
  /* ------------------------------- Political ------------------------------ */
  {
    id: 'national-address',
    name: 'Address the Nation',
    category: 'political',
    icon: '🎙️',
    description:
      'Take to the airwaves and make the case for your government directly to the public, over the heads of the press.',
    outcome: 'The speech lands. Polling improves for a while.',
    cost: 220,
    cooldown: 18,
    effects: { approval: 7, stability: 2 },
    temporary: { modifiers: { approval: 3 }, months: 9, label: 'Address Bounce' },
    caution: 'Speeches lose their power if used too often — hence the cooldown.',
  },
  {
    id: 'cabinet-reshuffle',
    name: 'Reshuffle the Cabinet',
    category: 'political',
    icon: '🔄',
    description:
      'Sack the underperformers, promote the loyalists, and buy yourself a fresh news cycle and a fresh start.',
    outcome: 'New faces at the despatch box. The government looks renewed.',
    cost: 400,
    cooldown: 36,
    effects: { approval: 6, corruption: -4, stability: -2 },
    caution: 'Disrupts the machinery of government for a few months.',
    requires: { maxApproval: 65 },
  },
  {
    id: 'anti-corruption-purge',
    name: 'Anti-Corruption Purge',
    category: 'political',
    icon: '⚖️',
    description:
      'Arrest the worst offenders across the civil service and state enterprises. Televised, uncompromising and genuinely effective.',
    outcome: 'Prosecutions begin. The bureaucracy is rattled and rather more honest.',
    cost: 3200,
    cooldown: 48,
    effects: { corruption: -14, approval: 8, stability: -6, civilLiberties: -4 },
    temporary: { modifiers: { taxEfficiency: 8, spendingEfficiency: 6 }, months: 36, label: 'Post-Purge Discipline' },
    caution: 'Destabilising: you are removing people who hold real power.',
    requires: { minStability: 30 },
  },
  {
    id: 'constitutional-convention',
    name: 'Call a Constitutional Convention',
    category: 'political',
    icon: '📜',
    description:
      'Convene citizens and jurists to rewrite the basic law. A generational reset of how the state works.',
    outcome: 'A new settlement is drafted and ratified.',
    cost: 8000,
    cooldown: 240,
    effects: { civilLiberties: 12, corruption: -8, stability: -8, happiness: 5, approval: 3 },
    temporary: { modifiers: { stability: 5, corruption: -5, civilLiberties: 4 }, months: 999, label: 'New Constitution' },
    caution: 'A long, disruptive process. Once in a generation.',
    requires: { minStability: 45 },
  },

  /* -------------------------------- Economic ------------------------------ */
  {
    id: 'emergency-stimulus',
    name: 'Emergency Stimulus',
    category: 'economic',
    icon: '💸',
    description:
      'Push money into the economy immediately — direct payments, accelerated public works, guaranteed credit lines.',
    outcome: 'Demand jumps. So does the deficit.',
    cost: 26000,
    cooldown: 30,
    effects: { gdpShock: 1.6, unemployment: -1.2, approval: 5, inflation: 0.7 },
    temporary: { modifiers: { gdpGrowth: 0.6, inflation: 0.3 }, months: 12, label: 'Stimulus Wave' },
    caution: 'Inflationary, and expensive.',
  },
  {
    id: 'privatisation-drive',
    name: 'Privatisation Drive',
    category: 'economic',
    icon: '🏷️',
    description:
      'Sell state holdings — utilities, the airline, the ports. A one-off windfall in exchange for a permanently smaller state.',
    outcome: 'The sale completes. The treasury is fuller and the state is smaller.',
    cost: 0,
    cooldown: 60,
    effects: { treasury: 42000, gdpShock: 0.4, inequality: 5, approval: -7, happiness: -3 },
    caution: 'You cannot sell the same asset twice.',
  },
  {
    id: 'debt-restructuring',
    name: 'Restructure Sovereign Debt',
    category: 'economic',
    icon: '🧾',
    description:
      'Go to your creditors and renegotiate. Haircuts and extended maturities in exchange for a credibility hit that lasts years.',
    outcome: 'Creditors accept new terms. The debt burden eases; the rating does not.',
    cost: 2000,
    cooldown: 96,
    effects: { approval: -6, stability: -3 },
    temporary: { modifiers: { taxEfficiency: -6 }, months: 48, label: 'Restructuring Stigma' },
    caution: 'Cuts your debt by a fifth, but markets will not forget.',
    requires: { minStability: 25 },
  },
  {
    id: 'sovereign-fund-injection',
    name: 'Draw on the Sovereign Fund',
    category: 'economic',
    icon: '🏦',
    description:
      'Liquidate part of the national endowment to cover an immediate need. Every finance minister swears it is a one-off.',
    outcome: 'The transfer clears. Future generations will have opinions.',
    cost: 0,
    cooldown: 48,
    effects: { treasury: 30000, stability: -2, approval: 3 },
    caution: 'Spends capital you cannot replace quickly.',
  },

  /* -------------------------------- Security ------------------------------ */
  {
    id: 'mobilise-reserves',
    name: 'Mobilise the Reserves',
    category: 'security',
    icon: '🎖️',
    description:
      'Call up reservists and surge readiness across every branch. Expensive to sustain, decisive in the short term.',
    outcome: 'Units report to depots. Readiness climbs sharply.',
    cost: 9000,
    cooldown: 24,
    effects: { militaryStrength: 9, happiness: -4, approval: -2 },
    temporary: { modifiers: { militaryPower: 12 }, months: 18, label: 'Mobilisation' },
    caution: 'Pulls workers out of the economy while it lasts.',
  },
  {
    id: 'security-crackdown',
    name: 'Nationwide Security Operation',
    category: 'security',
    icon: '🚔',
    description:
      'Flood the streets with police, run sweeps against organised crime, and suspend a few procedural niceties.',
    outcome: 'Crime falls sharply. So does everyone’s patience.',
    cost: 5200,
    cooldown: 30,
    effects: { crime: -14, stability: 6, civilLiberties: -12, happiness: -5, approval: 3 },
    caution: 'Real cost in civil liberties and public trust.',
  },
  {
    id: 'declassify-archives',
    name: 'Declassify the Archives',
    category: 'security',
    icon: '🗝️',
    description:
      'Open the state’s historical files. Painful, cathartic, and an enormous signal of confidence in your own institutions.',
    outcome: 'Historians and journalists get to work. The country reckons with itself.',
    cost: 900,
    cooldown: 120,
    effects: { civilLiberties: 10, softPower: 12, corruption: -6, stability: -4, approval: -3 },
    caution: 'Some of what comes out will be about your own side.',
    requires: { minStability: 40 },
  },

  /* --------------------------------- Social ------------------------------- */
  {
    id: 'mass-vaccination',
    name: 'Mass Immunisation Drive',
    category: 'social',
    icon: '💉',
    description:
      'A nationwide campaign — mobile clinics, schools, workplaces — to close every gap in coverage at once.',
    outcome: 'Coverage reaches almost everyone. Public health metrics improve for years.',
    cost: 6400,
    cooldown: 60,
    effects: { health: 10, happiness: 4, approval: 4 },
    temporary: { modifiers: { health: 5 }, months: 60, label: 'High Immunity' },
  },
  {
    id: 'amnesty',
    name: 'General Amnesty',
    category: 'social',
    icon: '🕊️',
    description:
      'Release non-violent prisoners, regularise undocumented residents, and draw a line under an era of enforcement.',
    outcome: 'Prisons empty, families reunite, and the opposition is furious.',
    cost: 1800,
    cooldown: 96,
    effects: { happiness: 8, civilLiberties: 10, crime: 4, approval: -5, inequality: -3 },
    caution: 'Crime ticks up, and the politics are brutal.',
  },
  {
    id: 'housing-emergency',
    name: 'Declare a Housing Emergency',
    category: 'social',
    icon: '🏘️',
    description:
      'Override local planning, requisition empty stock and start building at emergency speed on public land.',
    outcome: 'Cranes appear. Rents stop climbing quite so fast.',
    cost: 18000,
    cooldown: 72,
    effects: { happiness: 9, inequality: -7, infrastructure: 5, approval: 4, stability: -3 },
    temporary: { modifiers: { happiness: 4, inequality: -3 }, months: 48, label: 'Emergency Housing Programme' },
  },
  {
    id: 'national-service',
    name: 'Introduce National Service',
    category: 'social',
    icon: '🤝',
    description:
      'A year of civic or military service for every school leaver. Divisive, formative, and a genuine social leveller.',
    outcome: 'The first cohort reports for duty.',
    cost: 7200,
    cooldown: 120,
    effects: { militaryStrength: 5, education: 4, crime: -5, happiness: -6, approval: -4 },
    temporary: { modifiers: { stability: 4, crime: -4, inequality: -3 }, months: 999, label: 'National Service' },
    caution: 'Deeply unpopular with the people who have to do it.',
  },

  /* ------------------------------- Emergency ------------------------------ */
  {
    id: 'state-of-emergency',
    name: 'Declare a State of Emergency',
    category: 'emergency',
    icon: '🚨',
    description:
      'Assume emergency powers: rule by decree, curfews, and the suspension of ordinary process until the crisis passes.',
    outcome: 'Emergency powers are in force. Order returns; scrutiny does not.',
    cost: 3000,
    cooldown: 60,
    effects: { stability: 14, crime: -8, civilLiberties: -22, happiness: -8, approval: -4, softPower: -8 },
    temporary: { modifiers: { spendingEfficiency: 10, stability: 4, civilLiberties: -6 }, months: 24, label: 'Emergency Powers' },
    caution: 'Only for a genuine crisis. The world will notice.',
    requires: { maxApproval: 70 },
  },
  {
    id: 'price-freeze',
    name: 'Freeze Essential Prices',
    category: 'emergency',
    icon: '🧊',
    description:
      'Cap the price of food, fuel and energy by decree. Immediate relief, gathering distortion.',
    outcome: 'Prices hold. Shortages begin to appear at the margins.',
    cost: 7000,
    cooldown: 48,
    effects: { inflation: -2.2, approval: 9, happiness: 6 },
    temporary: { modifiers: { gdpGrowth: -0.5, corruption: 4 }, months: 18, label: 'Price Controls' },
    caution: 'Suppresses the symptom, worsens the cause.',
  },
  {
    id: 'international-appeal',
    name: 'Appeal for International Support',
    category: 'emergency',
    icon: '🌍',
    description:
      'Go to the multilateral institutions and your partners and ask for help. Money arrives; so do conditions.',
    outcome: 'A support package is agreed.',
    cost: 0,
    cooldown: 72,
    effects: { treasury: 20000, globalRelations: 6, approval: -8, softPower: -6, stability: 3 },
    caution: 'Publicly admits you cannot manage alone.',
    requires: { maxApproval: 60 },
  },
];

export const DECREE_INDEX = Object.fromEntries(DECREES.map((d) => [d.id, d])) as Record<string, Decree>;

export const DECREE_CATEGORY_LABELS: Record<Decree['category'], string> = {
  political: 'Political',
  economic: 'Economic',
  security: 'Security',
  social: 'Social',
  emergency: 'Emergency',
};

export const DECREE_CATEGORIES = Object.keys(DECREE_CATEGORY_LABELS) as Decree['category'][];

/** Months remaining before a decree can be used again; 0 when ready. */
export function decreeCooldownRemaining(s: GameState, decree: Decree): number {
  const last = s.decreeCooldowns[decree.id];
  if (last === undefined) return 0;
  return Math.max(0, decree.cooldown - (s.turn - last));
}
