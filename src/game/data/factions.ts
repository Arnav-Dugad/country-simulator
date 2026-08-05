import type { FactionDef, FactionId } from '../types';

/**
 * Interest groups.
 *
 * Parties contest elections; factions contest everything else. They do not
 * vote — they own the firms, staff the ministries, command the divisions and
 * run the provinces, and their mood shows up as a permanent modifier on the
 * whole simulation whether or not there is an election coming.
 *
 * The point of the system is that no policy is free: a tax rise that delights
 * labour infuriates business, and the country you end up with is the one your
 * coalition of the pleased will tolerate.
 */
export const FACTIONS: FactionDef[] = [
  {
    id: 'business',
    name: 'Business & Capital',
    icon: '💼',
    description:
      'Industrialists, banks and the firms that decide where to put next year’s capital expenditure.',
    blurb: 'Low corporate and capital taxes, light regulation, open trade, stable prices.',
    pleasedModifiers: { gdpGrowth: 0.8, tradeIncome: 10, taxEfficiency: 4 },
    angeredModifiers: { gdpGrowth: -0.9, tradeIncome: -12, unemployment: 1.2, taxEfficiency: -8 },
  },
  {
    id: 'labour',
    name: 'Organised Labour',
    icon: '🔧',
    description:
      'Unions, public-sector workers and everyone whose income is a wage rather than a return.',
    blurb: 'Welfare spending, low unemployment, low inequality, strong worker protection.',
    pleasedModifiers: { happiness: 6, unemployment: -0.7, stability: 3 },
    angeredModifiers: { happiness: -7, stability: -6, unemployment: 0.9, crime: 4 },
  },
  {
    id: 'military',
    name: 'The Armed Forces',
    icon: '🎖️',
    description:
      'The general staff, the defence industry, and the officer corps that has to be paid on time.',
    blurb: 'Defence funding, hard-line security posture, modern equipment, national prestige.',
    pleasedModifiers: { militaryPower: 10, stability: 4 },
    angeredModifiers: { militaryPower: -14, stability: -9, corruption: 3 },
  },
  {
    id: 'clergy',
    name: 'Traditional Institutions',
    icon: '⛪',
    description:
      'Religious authorities, community elders and the custodians of the way things have always been done.',
    blurb: 'Social continuity, family policy, restraint on liberalisation, respect for custom.',
    pleasedModifiers: { stability: 5, happiness: 3, crime: -4 },
    angeredModifiers: { stability: -7, approval: -4, crime: 3 },
  },
  {
    id: 'intelligentsia',
    name: 'Universities & Press',
    icon: '📰',
    description:
      'Academics, journalists, courts and the professions that decide what counts as a fact.',
    blurb: 'Research funding, civil liberties, clean government, education spending.',
    pleasedModifiers: { research: 12, corruption: -4, softPower: 6 },
    angeredModifiers: { research: -16, softPower: -10, corruption: 5, civilLiberties: -4 },
  },
  {
    id: 'regions',
    name: 'The Provinces',
    icon: '🏞️',
    description:
      'Governors, mayors and the parts of the country that are not the capital and know it.',
    blurb: 'Infrastructure investment, devolved autonomy, regional development, low unrest.',
    pleasedModifiers: { infrastructure: 6, stability: 4, gdpGrowth: 0.25 },
    angeredModifiers: { infrastructure: -8, stability: -8, spendingEfficiency: -6 },
  },
];

export const FACTION_INDEX = Object.fromEntries(FACTIONS.map((f) => [f.id, f])) as Record<
  FactionId,
  FactionDef
>;

export const FACTION_IDS = FACTIONS.map((f) => f.id);
