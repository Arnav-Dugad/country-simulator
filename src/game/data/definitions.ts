import type {
  Difficulty,
  Era,
  GovernmentType,
  Ideology,
  ResourceDef,
  ResourceId,
  Trait,
  VictoryGoal,
} from '../types';

/* ------------------------------------------------------------------ */
/* Government types                                                    */
/* ------------------------------------------------------------------ */

export const GOVERNMENTS: GovernmentType[] = [
  {
    id: 'democracy',
    name: 'Parliamentary Democracy',
    icon: '🗳️',
    description:
      'Power flows from a legislature that can dissolve you. Legitimacy is high, but so is the volatility.',
    modifiers: { approval: 2, civilLiberties: 6, stability: 1, corruption: -3, research: 5 },
    holdsElections: true,
    termMonths: 48,
  },
  {
    id: 'republic',
    name: 'Presidential Republic',
    icon: '🏛️',
    description:
      'A directly mandated executive. Decisions land faster than in a parliament, and land harder.',
    modifiers: { approval: 1, civilLiberties: 4, stability: 2, spendingEfficiency: 4 },
    holdsElections: true,
    termMonths: 48,
  },
  {
    id: 'federal-republic',
    name: 'Federal Republic',
    icon: '🦅',
    description:
      'Sovereignty is shared with the provinces. Resilient and hard to capture — also hard to steer.',
    modifiers: { stability: 3, civilLiberties: 5, spendingEfficiency: -3, research: 4, infrastructure: 2 },
    holdsElections: true,
    termMonths: 48,
  },
  {
    id: 'constitutional-monarchy',
    name: 'Constitutional Monarchy',
    icon: '👑',
    description:
      'A crown for continuity and a cabinet for governing. Enormous soft power at very little cost.',
    modifiers: { stability: 5, softPower: 6, approval: 1, civilLiberties: 4, taxEfficiency: 2 },
    holdsElections: true,
    termMonths: 60,
  },
  {
    id: 'absolute-monarchy',
    name: 'Absolute Monarchy',
    icon: '🕌',
    description:
      'The sovereign decides. Long horizons, no elections, and a legitimacy that rests on delivery.',
    modifiers: { stability: 6, spendingEfficiency: 8, civilLiberties: -14, corruption: 5, research: -4 },
    holdsElections: false,
    termMonths: 0,
  },
  {
    id: 'single-party',
    name: 'Single-Party State',
    icon: '⚙️',
    description:
      'One party, total planning capacity, and an information problem that grows with the economy.',
    modifiers: {
      stability: 8,
      spendingEfficiency: 10,
      civilLiberties: -22,
      corruption: 7,
      approval: -1,
      research: -2,
      militaryPower: 6,
    },
    holdsElections: false,
    termMonths: 0,
  },
  {
    id: 'military-junta',
    name: 'Military Junta',
    icon: '🎖️',
    description:
      'The army governs directly. Order is cheap, investment is expensive, and sanctions arrive quickly.',
    modifiers: {
      militaryPower: 18,
      stability: 4,
      civilLiberties: -30,
      corruption: 12,
      research: -10,
      diplomacy: -14,
      approval: -3,
    },
    holdsElections: false,
    termMonths: 0,
  },
  {
    id: 'theocracy',
    name: 'Theocracy',
    icon: '☪️',
    description:
      'Doctrine is law. Deep social cohesion among believers, deep friction with everyone else.',
    modifiers: {
      stability: 5,
      happiness: 2,
      civilLiberties: -20,
      research: -10,
      diplomacy: -8,
      birthRate: 0.6,
      crime: -5,
    },
    holdsElections: false,
    termMonths: 0,
  },
  {
    id: 'technocracy',
    name: 'Technocracy',
    icon: '🔬',
    description:
      'Rule by credentialed expertise. Superb at optimisation, poor at explaining itself to voters.',
    modifiers: {
      research: 25,
      spendingEfficiency: 12,
      corruption: -8,
      approval: -3,
      civilLiberties: -6,
      infrastructure: 4,
    },
    holdsElections: false,
    termMonths: 0,
  },
  {
    id: 'direct-democracy',
    name: 'Direct Democracy',
    icon: '🤝',
    description:
      'Citizens vote on the policies themselves. Unshakeable legitimacy, glacial decision-making.',
    modifiers: {
      approval: 6,
      civilLiberties: 12,
      happiness: 4,
      corruption: -10,
      spendingEfficiency: -10,
      stability: 3,
    },
    holdsElections: true,
    termMonths: 36,
  },
  {
    id: 'corporate-state',
    name: 'Corporate State',
    icon: '🏢',
    description:
      'The boardroom and the cabinet are the same room. Growth is fast; the Gini coefficient is faster.',
    modifiers: {
      gdpGrowth: 1.1,
      taxEfficiency: -12,
      inequality: 8,
      corruption: 10,
      research: 10,
      civilLiberties: -6,
      happiness: -3,
    },
    holdsElections: false,
    termMonths: 0,
  },
  {
    id: 'anarcho-syndicalist',
    name: 'Syndicalist Federation',
    icon: '🌹',
    description:
      'Workers’ councils all the way down. Radical equality, radical coordination costs.',
    modifiers: {
      inequality: -18,
      happiness: 6,
      civilLiberties: 14,
      spendingEfficiency: -14,
      militaryPower: -12,
      unemployment: -1.5,
      diplomacy: -6,
    },
    holdsElections: true,
    termMonths: 24,
  },
];

export const GOVERNMENT_INDEX = Object.fromEntries(
  GOVERNMENTS.map((g) => [g.id, g]),
) as Record<GovernmentType['id'], GovernmentType>;

/* ------------------------------------------------------------------ */
/* Ideologies                                                          */
/* ------------------------------------------------------------------ */

export const IDEOLOGIES: Ideology[] = [
  {
    id: 'social-democracy',
    name: 'Social Democracy',
    color: '#ff6b8a',
    description: 'Market economy, strong safety net, high tax capacity.',
    economicAxis: -35,
    socialAxis: -15,
    modifiers: { happiness: 4, inequality: -6, taxEfficiency: 6, gdpGrowth: -0.15, health: 3, education: 3 },
  },
  {
    id: 'liberal',
    name: 'Liberalism',
    color: '#f5c451',
    description: 'Open markets, open borders, open society.',
    economicAxis: 30,
    socialAxis: -30,
    modifiers: { tradeIncome: 10, migration: 12, civilLiberties: 8, research: 6, inequality: 3 },
  },
  {
    id: 'conservative',
    name: 'Conservatism',
    color: '#4f8cff',
    description: 'Institutions, order, and incremental change.',
    economicAxis: 35,
    socialAxis: 25,
    modifiers: { stability: 5, gdpGrowth: 0.2, taxEfficiency: -4, civilLiberties: -3, crime: -4 },
  },
  {
    id: 'libertarian',
    name: 'Libertarianism',
    color: '#f5d073',
    description: 'The smallest possible state and the largest possible market.',
    economicAxis: 75,
    socialAxis: -55,
    modifiers: {
      gdpGrowth: 0.7,
      taxEfficiency: -18,
      civilLiberties: 12,
      inequality: 10,
      health: -4,
      education: -4,
      spendingEfficiency: 6,
    },
  },
  {
    id: 'socialist',
    name: 'Socialism',
    color: '#ff5c6c',
    description: 'Public ownership of the commanding heights.',
    economicAxis: -75,
    socialAxis: 10,
    modifiers: {
      inequality: -14,
      unemployment: -1.2,
      health: 5,
      education: 5,
      gdpGrowth: -0.5,
      taxEfficiency: 10,
      research: -4,
    },
  },
  {
    id: 'nationalist',
    name: 'Nationalism',
    color: '#c9942c',
    description: 'The nation first, the world second, and borders that mean something.',
    economicAxis: 10,
    socialAxis: 60,
    modifiers: {
      militaryPower: 12,
      stability: 4,
      diplomacy: -14,
      migration: -25,
      tradeIncome: -8,
      approval: 2,
      softPower: -4,
    },
  },
  {
    id: 'green',
    name: 'Green Politics',
    color: '#7ee787',
    description: 'The economy is a subsidiary of the biosphere.',
    economicAxis: -30,
    socialAxis: -25,
    modifiers: {
      emissions: -22,
      energyOutput: -6,
      health: 5,
      happiness: 3,
      gdpGrowth: -0.35,
      softPower: 6,
      research: 4,
    },
  },
  {
    id: 'centrist',
    name: 'Centrism',
    color: '#9aa4bd',
    description: 'Whatever works, tested against whatever the polls say.',
    economicAxis: 0,
    socialAxis: 0,
    modifiers: { stability: 6, approval: 2, gdpGrowth: 0.1, corruption: -2 },
  },
  {
    id: 'progressive',
    name: 'Progressivism',
    color: '#9d6bff',
    description: 'Institutions should be rebuilt to match the century they operate in.',
    economicAxis: -45,
    socialAxis: -45,
    modifiers: {
      civilLiberties: 12,
      education: 6,
      inequality: -8,
      happiness: 3,
      stability: -3,
      research: 6,
    },
  },
  {
    id: 'traditionalist',
    name: 'Traditionalism',
    color: '#b08968',
    description: 'The old settlement worked. Restore it.',
    economicAxis: 20,
    socialAxis: 70,
    modifiers: {
      stability: 7,
      birthRate: 0.8,
      crime: -6,
      research: -8,
      civilLiberties: -10,
      migration: -18,
    },
  },
];

export const IDEOLOGY_INDEX = Object.fromEntries(
  IDEOLOGIES.map((i) => [i.id, i]),
) as Record<Ideology['id'], Ideology>;

/* ------------------------------------------------------------------ */
/* Leader traits                                                       */
/* ------------------------------------------------------------------ */

export const TRAITS: Trait[] = [
  { id: 'charismatic', name: 'Charismatic', icon: '✨',
    description: 'Crowds lean in when you speak. Approval decays more slowly.',
    modifiers: { approval: 5, softPower: 4, stability: 2 } },
  { id: 'economist', name: 'Economist', icon: '📈',
    description: 'You read the yield curve for pleasure. Growth and tax collection both improve.',
    modifiers: { gdpGrowth: 0.6, taxEfficiency: 8, inflation: -0.3 } },
  { id: 'general', name: 'Career General', icon: '🎖️',
    description: 'You came up through the service. The armed forces are yours.',
    modifiers: { militaryPower: 15, stability: 3, civilLiberties: -4 } },
  { id: 'diplomat', name: 'Master Diplomat', icon: '🕊️',
    description: 'You have a working relationship with everyone who matters.',
    modifiers: { diplomacy: 22, softPower: 6, tradeIncome: 6 } },
  { id: 'reformer', name: 'Reformer', icon: '⚖️',
    description: 'You came in promising to clean house, and you meant it.',
    modifiers: { corruption: -8, spendingEfficiency: 8, stability: -2, approval: 2 } },
  { id: 'iron-fist', name: 'Iron Fist', icon: '✊',
    description: 'Order is maintained. Questions are not encouraged.',
    modifiers: { stability: 10, crime: -10, civilLiberties: -14, approval: -3, happiness: -3 } },
  { id: 'visionary', name: 'Visionary', icon: '🔭',
    description: 'You fund the thirty-year project that nobody else will.',
    modifiers: { research: 20, infrastructure: 4, spendingEfficiency: -4 } },
  { id: 'populist', name: 'Populist', icon: '📣',
    description: 'You speak for the people against the institutions. It polls beautifully.',
    modifiers: { approval: 9, stability: -4, corruption: 4, inflation: 0.4, diplomacy: -6 } },
  { id: 'technocrat', name: 'Technocrat', icon: '🧮',
    description: 'Evidence-based, unsentimental, and slightly boring.',
    modifiers: { spendingEfficiency: 12, corruption: -5, research: 8, approval: -3 } },
  { id: 'ascetic', name: 'Ascetic', icon: '🪷',
    description: 'You live modestly and the public knows it. Graft is not tolerated.',
    modifiers: { corruption: -12, approval: 3, happiness: 2, softPower: 3 } },
  { id: 'orator', name: 'Great Orator', icon: '🎤',
    description: 'Your speeches move markets and mobs alike.',
    modifiers: { approval: 6, stability: 4, softPower: 8, diplomacy: 6 } },
  { id: 'spymaster', name: 'Spymaster', icon: '🕵️',
    description: 'You know things before they happen. Occasionally you make them happen.',
    modifiers: { intelligence: 30, stability: 3, civilLiberties: -8, diplomacy: -3 } },
];

export const TRAIT_INDEX = Object.fromEntries(TRAITS.map((t) => [t.id, t])) as Record<
  Trait['id'],
  Trait
>;

/* ------------------------------------------------------------------ */
/* Difficulty                                                          */
/* ------------------------------------------------------------------ */

export const DIFFICULTIES: Difficulty[] = [
  {
    id: 'sandbox',
    name: 'Sandbox',
    description: 'No fail states, no crises worth the name. Build the country you want to look at.',
    economyMultiplier: 1.5,
    crisisMultiplier: 0.25,
    scoreMultiplier: 0.4,
    startingTreasuryMultiplier: 4,
  },
  {
    id: 'easy',
    name: 'Statesman',
    description: 'Forgiving markets and a patient electorate. Good for learning the systems.',
    economyMultiplier: 1.2,
    crisisMultiplier: 0.6,
    scoreMultiplier: 0.75,
    startingTreasuryMultiplier: 2,
  },
  {
    id: 'normal',
    name: 'Head of State',
    description: 'The intended experience. Real trade-offs, recoverable mistakes.',
    economyMultiplier: 1,
    crisisMultiplier: 1,
    scoreMultiplier: 1,
    startingTreasuryMultiplier: 1,
  },
  {
    id: 'hard',
    name: 'Crisis Cabinet',
    description: 'Thinner margins, harsher markets, an opposition that smells blood.',
    economyMultiplier: 0.85,
    crisisMultiplier: 1.5,
    scoreMultiplier: 1.4,
    startingTreasuryMultiplier: 0.6,
  },
  {
    id: 'brutal',
    name: 'Doomsday Clock',
    description: 'Everything is on fire, the treasury is empty, and the coup plotters are already talking.',
    economyMultiplier: 0.7,
    crisisMultiplier: 2.2,
    scoreMultiplier: 2,
    startingTreasuryMultiplier: 0.3,
  },
];

export const DIFFICULTY_INDEX = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.id, d]),
) as Record<Difficulty['id'], Difficulty>;

/* ------------------------------------------------------------------ */
/* Eras                                                                */
/* ------------------------------------------------------------------ */

export const ERAS: Era[] = [
  {
    id: 'cold-war',
    name: 'The Cold War',
    startYear: 1975,
    description:
      'Two blocs, proxy wars everywhere, and a nuclear arsenal that makes diplomacy a matter of survival.',
    modifiers: { militaryPower: 12, research: -18, diplomacy: -10, emissions: 22, gdpGrowth: 0.4 },
  },
  {
    id: 'nineties',
    name: 'The Unipolar Moment',
    startYear: 1992,
    description:
      'Globalisation at full tilt. Capital moves freely, borders open, and history is briefly declared over.',
    modifiers: { tradeIncome: 18, research: -8, gdpGrowth: 0.5, migration: 14, inequality: 5 },
  },
  {
    id: 'modern',
    name: 'The Present Day',
    startYear: 2025,
    description:
      'Fragmenting supply chains, an energy transition mid-flight, and AI arriving faster than regulation.',
    modifiers: { research: 8, emissions: -4, diplomacy: -4, inflation: 0.3 },
  },
  {
    id: 'near-future',
    name: 'The Long 2040s',
    startYear: 2040,
    description:
      'Climate costs are on the books, automation has eaten the middle of the labour market, and space is commercial.',
    modifiers: {
      research: 24,
      unemployment: 2.4,
      emissions: -14,
      health: 5,
      gdpGrowth: 0.3,
      inequality: 8,
    },
  },
];

export const ERA_INDEX = Object.fromEntries(ERAS.map((e) => [e.id, e])) as Record<Era['id'], Era>;

/* ------------------------------------------------------------------ */
/* Victory goals                                                       */
/* ------------------------------------------------------------------ */

export const VICTORY_GOALS: VictoryGoal[] = [
  {
    id: 'superpower',
    name: 'Superpower',
    icon: '🌐',
    description: 'Project force and influence further than anyone else alive.',
    conditions: ['Military strength ≥ 90', 'GDP ≥ $8T', 'Average relations ≥ 20', 'Stability ≥ 60'],
  },
  {
    id: 'utopia',
    name: 'Utopia',
    icon: '🌈',
    description: 'Build the place everyone else wants to emigrate to.',
    conditions: ['Happiness ≥ 90', 'Inequality ≤ 25', 'Unemployment ≤ 4%', 'Healthcare & education ≥ 85'],
  },
  {
    id: 'economic',
    name: 'Economic Hegemon',
    icon: '💹',
    description: 'Own the trade routes, the reserve flows and the balance sheet.',
    conditions: ['GDP per capita ≥ $85,000', 'Debt-to-GDP ≤ 40%', 'Credit rating ≥ 90', 'Treasury ≥ $500B'],
  },
  {
    id: 'green',
    name: 'Carbon Negative',
    icon: '🌱',
    description: 'Decarbonise a real economy without wrecking it.',
    conditions: ['Renewable share ≥ 90%', 'Emissions ≤ 20% of start', 'GDP ≥ start', 'Happiness ≥ 65'],
  },
  {
    id: 'scientific',
    name: 'Scientific Singularity',
    icon: '🧬',
    description: 'Reach the end of the tech tree and the beginning of the next one.',
    conditions: ['All tier-5 technologies researched', 'Research ≥ 4,000/mo', 'Education ≥ 90'],
  },
  {
    id: 'cultural',
    name: 'Cultural Empire',
    icon: '🎭',
    description: 'Win without firing anything. Everyone wants to be you.',
    conditions: ['Soft power ≥ 95', 'Average relations ≥ 50', 'Member of 5+ organisations', 'Happiness ≥ 75'],
  },
  {
    id: 'survival',
    name: 'Endure',
    icon: '🛡️',
    description: 'Simply still be here, intact, in fifty years.',
    conditions: ['Survive 600 months', 'Stability ≥ 50 at the end', 'Never lose a war'],
  },
];

export const VICTORY_INDEX = Object.fromEntries(
  VICTORY_GOALS.map((v) => [v.id, v]),
) as Record<VictoryGoal['id'], VictoryGoal>;

/* ------------------------------------------------------------------ */
/* Resources                                                           */
/* ------------------------------------------------------------------ */

export const RESOURCES: ResourceDef[] = [
  { id: 'oil', name: 'Crude Oil', icon: '🛢️', basePrice: 80, category: 'energy',
    description: 'Still the master commodity. Prices set the mood of half the world’s governments.' },
  { id: 'gas', name: 'Natural Gas', icon: '🔥', basePrice: 45, category: 'energy',
    description: 'The transition fuel everyone claims to be leaving and nobody has left.' },
  { id: 'coal', name: 'Coal', icon: '⛏️', basePrice: 20, category: 'energy',
    description: 'Cheapest electricity per tonne of regret.' },
  { id: 'uranium', name: 'Uranium', icon: '☢️', basePrice: 140, category: 'strategic',
    description: 'Powers reactors and, with enough enrichment, other things.' },
  { id: 'iron', name: 'Iron Ore', icon: '🪨', basePrice: 30, category: 'metal',
    description: 'Steel is the physical substrate of industrialisation.' },
  { id: 'copper', name: 'Copper', icon: '🔶', basePrice: 95, category: 'metal',
    description: 'Every electrified thing needs it. Demand only goes one way.' },
  { id: 'gold', name: 'Gold', icon: '🥇', basePrice: 220, category: 'metal',
    description: 'A hedge, a reserve asset and a store of political anxiety.' },
  { id: 'lithium', name: 'Lithium', icon: '🔋', basePrice: 175, category: 'strategic',
    description: 'The battery bottleneck. Whoever holds the brine holds the transition.' },
  { id: 'rareEarths', name: 'Rare Earths', icon: '💎', basePrice: 260, category: 'strategic',
    description: 'Neither rare nor earths, but processing them is a genuine chokepoint.' },
  { id: 'timber', name: 'Timber', icon: '🌲', basePrice: 18, category: 'agricultural',
    description: 'Renewable if you are patient, and a carbon sink if you are not greedy.' },
  { id: 'grain', name: 'Grain', icon: '🌾', basePrice: 25, category: 'agricultural',
    description: 'Bread prices have started more revolutions than any ideology.' },
  { id: 'freshwater', name: 'Fresh Water', icon: '💧', basePrice: 12, category: 'agricultural',
    description: 'Unpriced almost everywhere, and about to be the binding constraint almost everywhere.' },
];

export const RESOURCE_INDEX = Object.fromEntries(
  RESOURCES.map((r) => [r.id, r]),
) as Record<ResourceId, ResourceDef>;

export const RESOURCE_IDS = RESOURCES.map((r) => r.id);

/* ------------------------------------------------------------------ */
/* Leader portraits & flag design options                              */
/* ------------------------------------------------------------------ */

export const PORTRAITS = [
  '🧑‍💼', '👩‍💼', '🧑‍⚖️', '👨‍✈️', '👩‍✈️', '🧑‍🚀', '🧑‍🔬', '👩‍🔬',
  '🤴', '👸', '🧕', '👳', '🧑‍🎓', '👩‍🎓', '🕵️', '🧑‍🌾',
  '🎩', '🦉', '🦅', '🦁', '🐉', '🐺', '🦊', '🐻',
];

export const LEADER_TITLES = [
  'President',
  'Prime Minister',
  'Chancellor',
  'Premier',
  'Supreme Leader',
  'First Secretary',
  'Chairperson',
  'Sovereign',
  'Consul',
  'Director-General',
  'Head of State',
  'Grand Marshal',
];

export const FLAG_PATTERNS = [
  { id: 'horizontal', name: 'Horizontal Bands' },
  { id: 'vertical', name: 'Vertical Bands' },
  { id: 'triband-h', name: 'Horizontal Triband' },
  { id: 'triband-v', name: 'Vertical Triband' },
  { id: 'cross', name: 'Nordic Cross' },
  { id: 'diagonal', name: 'Diagonal Split' },
  { id: 'canton', name: 'Canton' },
  { id: 'sun', name: 'Central Disc' },
] as const;

export const FLAG_EMBLEMS = [
  '★', '☀', '☾', '⚜', '🦅', '🦁', '⚙', '🌲', '⚓', '🔱', '🕊', '⛰', '🌾', '⚔', '🐉', '❄', '🔥', '🌊', '',
];

export const NATION_COLORS = [
  '#e5b447', '#4f8cff', '#ff5c6c', '#7ee787', '#9d6bff', '#3ddbd9',
  '#ff6bb5', '#ffb648', '#ffffff', '#0f1729', '#c0392b', '#1abc9c',
];
