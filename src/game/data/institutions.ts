import type { Advisor, InternationalOrg, OrgId } from '../types';

/* ------------------------------------------------------------------ */
/* Cabinet advisors                                                    */
/* ------------------------------------------------------------------ */

export const ADVISORS: Advisor[] = [
  { id: 'adv-finance', name: 'Dr. Imani Okoro', role: 'Finance Minister', icon: '📊', salary: 4,
    domain: 'taxEfficiency',
    bio: 'Twenty years at the central bank, three of them spent quietly preventing a currency crisis nobody heard about.',
    modifiers: { taxEfficiency: 12, inflation: -0.4, gdpGrowth: 0.2 } },
  { id: 'adv-growth', name: 'Henrik Sandvold', role: 'Chief Economist', icon: '📈', salary: 3.5,
    domain: 'gdpGrowth',
    bio: 'Wrote the standard textbook on industrial policy, then spent a decade arguing with people who had read it.',
    modifiers: { gdpGrowth: 0.55, spendingEfficiency: 5 } },
  { id: 'adv-defence', name: 'Gen. Marisol Vega', role: 'Chief of Defence Staff', icon: '🎖️', salary: 4.5,
    domain: 'militaryPower',
    bio: 'Rose through logistics rather than combat arms, which is why her deployments actually arrive on time.',
    modifiers: { militaryPower: 16, stability: 3 } },
  { id: 'adv-foreign', name: 'Amb. Kenji Watanabe', role: 'Foreign Minister', icon: '🕊️', salary: 3.8,
    domain: 'diplomacy',
    bio: 'Has never raised his voice in a negotiation and has never needed to.',
    modifiers: { diplomacy: 22, softPower: 8, tradeIncome: 5 } },
  { id: 'adv-science', name: 'Prof. Ada Lindqvist', role: 'Chief Scientific Adviser', icon: '🔬', salary: 3.2,
    domain: 'research',
    bio: 'Reformed the grant system so that the money reaches laboratories instead of administrators.',
    modifiers: { research: 26, education: 4 } },
  { id: 'adv-health', name: 'Dr. Samuel Adeyemi', role: 'Health Secretary', icon: '🩺', salary: 3.4,
    domain: 'health',
    bio: 'Ran the pandemic response in a country of ninety million and kept the excess-death figures honest.',
    modifiers: { health: 14, happiness: 3 } },
  { id: 'adv-interior', name: 'Yelena Marchuk', role: 'Interior Minister', icon: '🛡️', salary: 3.6,
    domain: 'crime',
    bio: 'Dismantled two organised crime networks by following the accountants rather than the enforcers.',
    modifiers: { crime: -14, corruption: -6, stability: 4 } },
  { id: 'adv-justice', name: 'Justice Amara Diallo', role: 'Attorney General', icon: '⚖️', salary: 3.1,
    domain: 'corruption',
    bio: 'Prosecuted a sitting cabinet minister in her first year and was somehow not dismissed.',
    modifiers: { corruption: -16, civilLiberties: 6, spendingEfficiency: 4 } },
  { id: 'adv-energy', name: 'Rafael Costa', role: 'Energy Secretary', icon: '⚡', salary: 3.3,
    domain: 'energyOutput',
    bio: 'Built forty gigawatts of renewables and kept the grid stable while doing it.',
    modifiers: { energyOutput: 18, emissions: -10 } },
  { id: 'adv-environment', name: 'Dr. Leilani Mahoe', role: 'Environment Minister', icon: '🌿', salary: 2.9,
    domain: 'emissions',
    bio: 'Negotiated the fisheries treaty that everyone said was impossible, then enforced it.',
    modifiers: { emissions: -18, health: 5, softPower: 5 } },
  { id: 'adv-education', name: 'Dr. Tomás Herrera', role: 'Education Secretary', icon: '🎓', salary: 2.8,
    domain: 'education',
    bio: 'Raised national literacy by eleven points in a decade using nothing more exotic than teacher pay.',
    modifiers: { education: 16, research: 6, inequality: -4 } },
  { id: 'adv-spy', name: '"Director K"', role: 'Director of Intelligence', icon: '🕵️', salary: 4.2,
    domain: 'intelligence',
    bio: 'The personnel file is four pages long and three of them are redacted.',
    modifiers: { intelligence: 32, stability: 3, civilLiberties: -6 } },
  { id: 'adv-labour', name: 'Grace Mbeki', role: 'Labour Secretary', icon: '🔧', salary: 2.7,
    domain: 'unemployment',
    bio: 'Came out of the union movement and still takes their calls, which turns out to be useful.',
    modifiers: { unemployment: -1.3, inequality: -7, happiness: 4 } },
  { id: 'adv-culture', name: 'Zaid Al-Rashid', role: 'Culture Minister', icon: '🎭', salary: 2.4,
    domain: 'softPower',
    bio: 'Turned a national film fund into a global export industry on a budget smaller than one motorway junction.',
    modifiers: { softPower: 20, happiness: 5, tradeIncome: 4 } },
  { id: 'adv-infra', name: 'Eng. Priya Ramanathan', role: 'Infrastructure Secretary', icon: '🏗️', salary: 3.7,
    domain: 'infrastructure',
    bio: 'Delivers major projects on schedule, which in this field qualifies as a supernatural ability.',
    modifiers: { infrastructure: 15, spendingEfficiency: 8, gdpGrowth: 0.15 } },
  { id: 'adv-comms', name: 'Nadia Brekke', role: 'Communications Director', icon: '📣', salary: 2.6,
    domain: 'approval',
    bio: 'Has never lost a news cycle she decided to contest.',
    modifiers: { approval: 8, stability: 3, softPower: 4 } },
];

export const ADVISOR_INDEX = Object.fromEntries(ADVISORS.map((a) => [a.id, a])) as Record<
  string,
  Advisor
>;

/** How many advisors can be appointed at once. */
export const MAX_ADVISORS = 5;

/* ------------------------------------------------------------------ */
/* International organisations                                         */
/* ------------------------------------------------------------------ */

export const ORGS: InternationalOrg[] = [
  {
    id: 'un',
    name: 'United Nations',
    icon: '🌐',
    description: 'Universal membership, a general assembly vote, and access to every agency and treaty body.',
    requires: { minStability: 20 },
    monthlyDues: 120,
    modifiers: { diplomacy: 10, softPower: 6, stability: 2 },
  },
  {
    id: 'wto',
    name: 'World Trade Organization',
    icon: '📦',
    description: 'Most-favoured-nation treatment and a dispute settlement body with real teeth.',
    requires: { minStability: 35 },
    monthlyDues: 90,
    modifiers: { tradeIncome: 18, gdpGrowth: 0.25, diplomacy: 5 },
  },
  {
    id: 'g20',
    name: 'G20',
    icon: '💼',
    description: 'The room where global macroeconomic policy is actually coordinated.',
    requires: { minGdp: 900, minStability: 45 },
    monthlyDues: 180,
    modifiers: { diplomacy: 12, tradeIncome: 8, softPower: 10, spendingEfficiency: 3 },
  },
  {
    id: 'nato',
    name: 'North Atlantic Treaty Organization',
    icon: '🛡️',
    description: 'Collective defence, interoperability standards, and a 2%-of-GDP expectation.',
    requires: {
      minStability: 50,
      minCivilLiberties: 45,
      government: ['democracy', 'republic', 'federal-republic', 'constitutional-monarchy', 'direct-democracy'],
      region: ['europe', 'north-america'],
    },
    monthlyDues: 420,
    modifiers: { militaryPower: 22, stability: 6, diplomacy: 8 },
  },
  {
    id: 'eu',
    name: 'European Union',
    icon: '🇪🇺',
    description: 'Single market, freedom of movement, structural funds, and a great deal of regulation.',
    requires: {
      region: ['europe'],
      minStability: 55,
      minCivilLiberties: 55,
      government: ['democracy', 'republic', 'federal-republic', 'constitutional-monarchy', 'direct-democracy'],
    },
    monthlyDues: 620,
    modifiers: {
      tradeIncome: 26,
      gdpGrowth: 0.35,
      migration: 15,
      infrastructure: 6,
      civilLiberties: 6,
      diplomacy: 10,
    },
  },
  {
    id: 'brics',
    name: 'BRICS+',
    icon: '🔶',
    description: 'A non-Western bloc for development finance, currency swaps and mutual diplomatic cover.',
    requires: { minGdp: 250 },
    monthlyDues: 150,
    modifiers: { tradeIncome: 14, diplomacy: 8, gdpGrowth: 0.2, softPower: 4 },
  },
  {
    id: 'opec',
    name: 'OPEC+',
    icon: '🛢️',
    description: 'Production quotas in exchange for price support. Only useful if you pump.',
    requires: { requiresOil: true },
    monthlyDues: 60,
    modifiers: { tradeIncome: 16, diplomacy: 4, emissions: 6 },
  },
  {
    id: 'asean',
    name: 'ASEAN',
    icon: '🌏',
    description: 'Consensus-based regional integration with an emphasis on non-interference.',
    requires: { region: ['southeast-asia', 'east-asia', 'oceania'], minStability: 35 },
    monthlyDues: 70,
    modifiers: { tradeIncome: 14, diplomacy: 10, stability: 3 },
  },
  {
    id: 'au',
    name: 'African Union',
    icon: '🌍',
    description: 'Continental free trade, a peace and security council, and a growing common voice.',
    requires: { region: ['africa'] },
    monthlyDues: 45,
    modifiers: { tradeIncome: 12, diplomacy: 10, stability: 4, infrastructure: 3 },
  },
  {
    id: 'paris-accord',
    name: 'Paris Climate Accord',
    icon: '🌱',
    description: 'Nationally determined contributions, ratcheted every five years, with reputational enforcement.',
    requires: { minEmissionsPolicy: true },
    monthlyDues: 55,
    modifiers: { emissions: -14, softPower: 12, diplomacy: 8, gdpGrowth: -0.15 },
  },
];

export const ORG_INDEX = Object.fromEntries(ORGS.map((o) => [o.id, o])) as Record<
  OrgId,
  InternationalOrg
>;
