import type {
  CountryProfile,
  EnergySource,
  ForeignNation,
  GameState,
  IdeologyId,
  PoliticalParty,
  Province,
  ResourceHolding,
  ResourceId,
  SectorId,
  SetupConfig,
} from '../types';
import { COUNTRIES, getCountry } from '../data/countries';
import { CURRENCIES, getCurrency } from '../data/currencies';
import {
  DIFFICULTY_INDEX,
  ERA_INDEX,
  GOVERNMENT_INDEX,
  IDEOLOGIES,
  IDEOLOGY_INDEX,
  RESOURCE_IDS,
  RESOURCE_INDEX,
} from '../data/definitions';
import { TECHNOLOGIES } from '../data/technologies';
import { baselineDeptSpend, clamp, computeBudget } from '../selectors';
import { BUDGET_MAX } from './actions';
import { nextRandom, pick, randRange } from './rng';

/**
 * Save schema version.
 *
 * 1 — initial release.
 * 2 — adds `settings.neverEndGame` and `victoriesAchieved`.
 * 3 — adds `decreeCooldowns` for executive actions.
 */
export const SCHEMA_VERSION = 3;

/* ------------------------------------------------------------------ */
/* Province generation                                                 */
/* ------------------------------------------------------------------ */

const PROVINCE_PREFIXES = [
  'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'Upper', 'Lower', 'Coastal',
  'Highland', 'Lakeland', 'Riverside', 'Border',
];

const SPECIALTIES: Province['specialty'][] = [
  'agriculture', 'industry', 'services', 'tech', 'mining', 'tourism', 'energy',
];

function generateProvinces(
  seedState: { rngSeed: number },
  capital: string,
  population: number,
  profile: CountryProfile | null,
): Province[] {
  const count = population > 200_000_000 ? 8 : population > 40_000_000 ? 6 : population > 8_000_000 ? 5 : 4;
  const provinces: Province[] = [];

  // The capital region is always present and always the richest per head.
  provinces.push({
    id: 'prov-capital',
    name: `${capital} Capital Region`,
    population: 0,
    gdpShare: 0,
    development: clamp((profile?.techLevel ?? 55) + 15, 20, 99),
    unrest: clamp(18 - (profile?.stability ?? 60) / 8, 2, 40),
    specialty: 'services',
    autonomy: 10,
    loyalty: clamp((profile?.stability ?? 60) + 12, 25, 98),
  });

  const used = new Set<string>();
  for (let i = 1; i < count; i++) {
    let prefix = pick(seedState, PROVINCE_PREFIXES);
    let guard = 0;
    while (used.has(prefix) && guard++ < 20) prefix = pick(seedState, PROVINCE_PREFIXES);
    used.add(prefix);

    const specialty =
      i === 1 && (profile?.resources.oil ?? 0) > 50
        ? 'energy'
        : pick(seedState, SPECIALTIES);

    provinces.push({
      id: `prov-${i}`,
      name: `${prefix} Province`,
      population: 0,
      gdpShare: 0,
      development: clamp((profile?.techLevel ?? 55) - randRange(seedState, 4, 26), 8, 95),
      unrest: clamp(randRange(seedState, 4, 30) + (100 - (profile?.stability ?? 60)) / 6, 1, 60),
      specialty,
      autonomy: clamp(randRange(seedState, 8, 45), 5, 70),
      loyalty: clamp((profile?.stability ?? 60) - randRange(seedState, 0, 22), 15, 98),
    });
  }

  // Distribute population and GDP share, weighted by development.
  const weights = provinces.map((p, i) => (i === 0 ? 1.9 : 1) * (0.5 + p.development / 100));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  provinces.forEach((p, i) => {
    const share = weights[i] / weightSum;
    p.gdpShare = share;
    p.population = (population * share) / 1e6;
  });

  return provinces;
}

/* ------------------------------------------------------------------ */
/* Party generation                                                    */
/* ------------------------------------------------------------------ */

const PARTY_NAME_PATTERNS: Record<string, string[]> = {
  'social-democracy': ['Social Democratic Party', "Labour Alliance", 'Workers & Citizens Party'],
  liberal: ['Liberal Party', 'Free Democratic Union', 'Open Society Movement'],
  conservative: ['Conservative Party', 'National Union', 'Christian Democratic Alliance'],
  libertarian: ['Liberty Party', 'Free Market Alliance', 'Individual Rights Movement'],
  socialist: ['Socialist Party', "People's Front", 'Democratic Left'],
  nationalist: ['National Front', 'Patriotic Alliance', 'Sovereignty Party'],
  green: ['Green Party', 'Ecological Alliance', 'Future Generations Party'],
  centrist: ['Centre Party', 'Moderate Union', 'Pragmatic Alliance'],
  progressive: ['Progressive Party', 'Reform Movement', 'New Horizon Coalition'],
  traditionalist: ['Traditionalist Party', 'Heritage Union', 'Order & Faith Party'],
};

function generateParties(
  seedState: { rngSeed: number },
  playerIdeology: IdeologyId,
  totalSeats: number,
): PoliticalParty[] {
  // The player's own party plus four rivals sampled across the spectrum.
  const others = IDEOLOGIES.filter((i) => i.id !== playerIdeology);
  const chosen = [IDEOLOGY_INDEX[playerIdeology] ?? IDEOLOGIES[7]];
  const pool = [...others];
  for (let i = 0; i < 4 && pool.length > 0; i++) {
    const idx = Math.floor(nextRandom(seedState) * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }

  const rawSupport = chosen.map((_, i) => (i === 0 ? randRange(seedState, 30, 42) : randRange(seedState, 8, 24)));
  const supportSum = rawSupport.reduce((a, b) => a + b, 0);

  return chosen.map((ideology, i) => {
    const support = (rawSupport[i] / supportSum) * 100;
    const names = PARTY_NAME_PATTERNS[ideology.id] ?? ['Independent Alliance'];
    return {
      id: `party-${ideology.id}`,
      name: names[Math.floor(nextRandom(seedState) * names.length)],
      ideology: ideology.id,
      color: ideology.color,
      support,
      seats: Math.round((support / 100) * totalSeats),
      relation: i === 0 ? 100 : Math.round(randRange(seedState, -55, 45)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Foreign nations                                                     */
/* ------------------------------------------------------------------ */

const PERSONALITIES: ForeignNation['personality'][] = [
  'pragmatic', 'aggressive', 'isolationist', 'mercantile', 'idealist',
];

function generateNations(
  seedState: { rngSeed: number },
  playerCountryId: string | null,
  playerGovernment: string,
  playerRegion: string,
): ForeignNation[] {
  // Everyone except the player's own country. Large economies always appear;
  // smaller ones are sampled so no two campaigns look identical.
  const candidates = COUNTRIES.filter((c) => c.id !== playerCountryId);
  const majors = candidates.filter((c) => c.gdp >= 400);
  const minors = candidates.filter((c) => c.gdp < 400);

  const sampledMinors: CountryProfile[] = [];
  const pool = [...minors];
  const minorCount = Math.min(24, pool.length);
  for (let i = 0; i < minorCount; i++) {
    const idx = Math.floor(nextRandom(seedState) * pool.length);
    sampledMinors.push(pool.splice(idx, 1)[0]);
  }

  return [...majors, ...sampledMinors].map((c) => {
    const sameRegion = c.region === playerRegion;
    const sameGovFamily = governmentFamily(c.government) === governmentFamily(playerGovernment);
    const base =
      randRange(seedState, -18, 26) +
      (sameRegion ? 12 : 0) +
      (sameGovFamily ? 14 : -8);

    return {
      id: c.id,
      name: c.name,
      iso2: c.iso2,
      region: c.region,
      relations: clamp(base, -60, 70),
      gdp: c.gdp,
      population: c.population,
      militaryStrength: c.militaryStrength,
      techLevel: c.techLevel,
      stability: c.stability,
      government: c.government,
      nuclear: c.nuclear ?? false,
      tradeVolume: 0,
      atWarWithPlayer: false,
      sanctioned: false,
      embassy: c.gdp >= 400,
      personality: PERSONALITIES[Math.floor(nextRandom(seedState) * PERSONALITIES.length)],
      trust: clamp(50 + randRange(seedState, -15, 15), 10, 90),
    };
  });
}

function governmentFamily(gov: string): 'open' | 'closed' {
  return ['democracy', 'republic', 'federal-republic', 'constitutional-monarchy', 'direct-democracy'].includes(gov)
    ? 'open'
    : 'closed';
}

/* ------------------------------------------------------------------ */
/* Sectors, energy, resources                                          */
/* ------------------------------------------------------------------ */

function deriveSectors(profile: CountryProfile | null, gdpPerCap: number): Record<SectorId, number> {
  // Structural transformation: agriculture shrinks and services grow with income.
  const dev = clamp(Math.log10(Math.max(300, gdpPerCap)) / 5, 0.4, 1);
  const oil = (profile?.resources.oil ?? 10) / 100;
  const tech = (profile?.techLevel ?? 55) / 100;

  const raw: Record<SectorId, number> = {
    agriculture: clamp(0.34 - dev * 0.3, 0.01, 0.35),
    industry: clamp(0.3 - Math.abs(dev - 0.72) * 0.25, 0.1, 0.34),
    services: clamp(dev * 0.55, 0.16, 0.58),
    technology: clamp(tech * 0.16 * dev, 0.005, 0.2),
    energy: clamp(0.03 + oil * 0.22, 0.01, 0.3),
    tourism: clamp(0.05 + (1 - oil) * 0.05, 0.01, 0.14),
    finance: clamp(dev * 0.12, 0.01, 0.16),
  };
  const sum = (Object.values(raw) as number[]).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(raw) as SectorId[]) raw[k] = raw[k] / sum;
  return raw;
}

function deriveEnergy(
  profile: CountryProfile | null,
  gdp: number,
  population: number,
): { production: Record<EnergySource, number>; demand: number } {
  // Rough TWh/yr: richer, larger economies consume more per head.
  const demand = Math.max(2, gdp * 0.32 + (population / 1e6) * 1.6);
  const r = profile?.resources ?? {};
  const weights: Record<EnergySource, number> = {
    coal: 8 + (r.coal ?? 0) * 0.42,
    gas: 6 + (r.gas ?? 0) * 0.38,
    oil: 3 + (r.oil ?? 0) * 0.14,
    nuclear: (profile?.techLevel ?? 50) > 65 ? 6 + (r.uranium ?? 0) * 0.14 : 1,
    hydro: 3 + (r.freshwater ?? 0) * 0.22,
    solar: 2 + (profile?.techLevel ?? 50) * 0.05,
    wind: 2 + (profile?.techLevel ?? 50) * 0.05,
    other: 1.5,
  };
  const weightSum = (Object.values(weights) as number[]).reduce((a, b) => a + b, 0);
  const production = {} as Record<EnergySource, number>;
  // Start marginally over-supplied so a new player isn't immediately in deficit.
  const supply = demand * 1.04;
  for (const k of Object.keys(weights) as EnergySource[]) {
    production[k] = (weights[k] / weightSum) * supply;
  }
  return { production, demand };
}

function deriveResources(
  profile: CountryProfile | null,
  gdp: number,
  population: number,
): Record<ResourceId, ResourceHolding> {
  const out = {} as Record<ResourceId, ResourceHolding>;
  const demandScale = gdp * 0.06 + (population / 1e6) * 0.35;
  for (const id of RESOURCE_IDS) {
    const endowment = profile?.resources[id] ?? 0;
    const def = RESOURCE_INDEX[id];
    const consumptionWeight =
      def.category === 'energy' ? 1.3 : def.category === 'agricultural' ? 1.1 : def.category === 'metal' ? 0.8 : 0.35;
    out[id] = {
      production: (endowment / 100) * demandScale * 1.25,
      consumption: demandScale * consumptionWeight * 0.55,
      stockpile: (endowment / 100) * demandScale * 6,
      reserves: endowment > 0 ? clamp(endowment + 15, 10, 100) : 0,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Main factory                                                        */
/* ------------------------------------------------------------------ */

export function createGame(config: SetupConfig, seed = Date.now()): GameState {
  const seedState = { rngSeed: seed >>> 0 };
  const profile = config.countryId ? getCountry(config.countryId) ?? null : null;
  const difficulty = DIFFICULTY_INDEX[config.difficulty];
  const era = ERA_INDEX[config.era];
  const government = GOVERNMENT_INDEX[config.government];

  const focus = config.startingFocus;
  const focusTotal = Math.max(1, Object.values(focus).reduce((a, b) => a + b, 0));
  /** Focus points normalised into a -1..+1 tilt around an even split. */
  const tilt = (key: keyof typeof focus): number =>
    (focus[key] / focusTotal - 0.2) * 5;

  const population = profile?.population ?? Math.round(randRange(seedState, 6_000_000, 90_000_000));
  const gdp = profile?.gdp ?? Math.max(8, (population / 1e6) * randRange(seedState, 3, 26));
  const gdpPerCap = (gdp * 1e9) / population;

  const baseStability = profile?.stability ?? 60;
  const baseTech = clamp((profile?.techLevel ?? 55) + tilt('science') * 8, 5, 98);
  const baseMilitary = clamp((profile?.militaryStrength ?? 40) + tilt('military') * 12, 2, 99);
  const baseCorruption = clamp((profile?.corruption ?? 45) - tilt('diplomacy') * 4, 2, 96);
  const hdiScore = profile?.hdi ?? clamp(38 + Math.log10(Math.max(400, gdpPerCap)) * 12, 25, 95);

  const currency = getCurrency(
    config.currencyCode || profile?.currency || 'USD',
  );

  const { production, demand } = deriveEnergy(profile, gdp, population);

  const debtRatio = clamp(0.55 + (100 - baseStability) / 200 - tilt('economy') * 0.08, 0.08, 1.6);
  const treasury = gdp * 1000 * 0.04 * difficulty.startingTreasuryMultiplier;

  const totalSeats = population > 100_000_000 ? 500 : population > 20_000_000 ? 300 : 150;

  const health = clamp(hdiScore * 0.85 + tilt('welfare') * 8, 8, 96);
  const education = clamp(hdiScore * 0.9 + tilt('science') * 6, 8, 97);
  const literacy = clamp(hdiScore * 0.98 + 4, 15, 99.8);
  const lifeExpectancy = clamp(42 + hdiScore * 0.44 + tilt('welfare') * 2, 42, 88);

  const state: GameState = {
    version: SCHEMA_VERSION,
    id: `game_${seed.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),

    turn: 0,
    year: era.startYear,
    month: 1,

    identity: {
      name: config.nationName,
      adjective: config.adjective || config.nationName,
      baseCountryId: config.countryId,
      iso2: config.mode === 'real' ? config.iso2 : '',
      customFlag: config.mode === 'custom' ? config.customFlag : null,
      capital: config.capital,
      motto: config.motto,
      region: config.region,
      currency,
      government: config.government,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
    },

    leader: {
      name: config.leaderName,
      title: config.leaderTitle,
      age: config.leaderAge,
      portrait: config.portrait,
      traits: config.traits,
      ideology: config.ideology,
      legacy: 0,
    },

    settings: {
      difficulty: config.difficulty,
      era: config.era,
      victoryGoal: config.victoryGoal,
      autoSpeed: 2,
      eventFrequency: config.eventFrequency,
      enableWars: config.enableWars,
      enableDisasters: config.enableDisasters,
      ironman: config.ironman,
      neverEndGame: config.neverEndGame,
      startYear: era.startYear,
      mapSeed: seed >>> 0,
    },

    economy: {
      gdp,
      // Matches the engine's convergence-to-frontier model; the first tick
      // refines it once the full modifier stack is known.
      growth:
        clamp((4.88 - Math.log10(Math.max(400, gdpPerCap))) * 6 + 1.4, 0.3, 9) *
        difficulty.economyMultiplier,
      inflation: clamp(2.4 + (baseCorruption - 40) / 22, 0.2, 24),
      unemployment: clamp(5.6 + (60 - baseStability) / 9 - tilt('economy') * 1.4, 1.5, 34),
      interestRate: clamp(2.5 + (baseCorruption - 40) / 18, 0.1, 22),
      debt: gdp * debtRatio,
      treasury,
      sectors: deriveSectors(profile, gdpPerCap),
      creditRating: clamp(88 - debtRatio * 26 - baseCorruption * 0.32 + baseStability * 0.18, 8, 99),
      confidence: clamp(46 + baseStability * 0.22 + tilt('economy') * 6, 10, 95),
      tradeBalance: 0,
      reserves: gdp * 1000 * 0.035,
      inequality: clamp(38 + baseCorruption * 0.16 - tilt('welfare') * 7, 15, 78),
      productivity: clamp(58 + baseTech * 0.45, 30, 140),
      exchangeRate: currency.perUsd,
    },

    society: {
      population,
      birthRate: clamp(34 - hdiScore * 0.26, 6.4, 46),
      deathRate: clamp(16 - hdiScore * 0.085, 5.6, 20),
      netMigration: clamp((hdiScore - 60) * 0.09, -6, 8),
      lifeExpectancy,
      literacy,
      urbanisation: clamp(18 + hdiScore * 0.66, 14, 98),
      medianAge: clamp(15 + hdiScore * 0.31, 15, 52),
      happiness: clamp(hdiScore * 0.72 + tilt('welfare') * 7, 10, 92),
      health,
      education,
      crime: clamp(52 - hdiScore * 0.42 + baseCorruption * 0.2, 2, 92),
      civilLiberties: clamp(
        50 + (government.modifiers.civilLiberties ?? 0) * 1.6 + (hdiScore - 60) * 0.35,
        2,
        98,
      ),
      softPower: clamp(12 + Math.log10(Math.max(1, gdp)) * 11 + tilt('diplomacy') * 8, 3, 92),
      ageStructure: {
        young: clamp(0.46 - hdiScore * 0.0032, 0.12, 0.48),
        working: 0,
        elderly: clamp(0.02 + hdiScore * 0.0026, 0.02, 0.3),
      },
    },

    environment: {
      emissions: Math.max(1, gdp * 0.29 * (1 + (profile?.resources.coal ?? 20) / 130)),
      globalTemp: era.id === 'cold-war' ? 0.3 : era.id === 'nineties' ? 0.5 : era.id === 'modern' ? 1.25 : 1.9,
      pollution: clamp(24 + (profile?.resources.coal ?? 20) * 0.28 - hdiScore * 0.12, 4, 92),
      renewableShare: 0,
      forestCover: clamp((profile?.resources.timber ?? 35) * 0.72, 2, 88),
      disasterRisk: clamp(16 + (profile?.resources.coal ?? 20) * 0.1, 5, 60),
      waterStress: clamp(78 - (profile?.resources.freshwater ?? 50) * 0.72, 4, 95),
      biodiversity: clamp(35 + (profile?.resources.timber ?? 35) * 0.5, 8, 95),
    },

    energy: { production, demand },

    military: {
      strength: baseMilitary,
      manpower: Math.round(population * clamp(0.0016 + baseMilitary / 24000, 0.0004, 0.012)),
      reserves: Math.round(population * 0.004),
      army: clamp(baseMilitary + randRange(seedState, -8, 8), 2, 99),
      navy: clamp(baseMilitary * 0.85 + randRange(seedState, -12, 10), 1, 99),
      airForce: clamp(baseMilitary * 0.92 + randRange(seedState, -10, 10), 1, 99),
      cyber: clamp(baseTech * 0.6 + randRange(seedState, -8, 12), 1, 99),
      space: clamp(baseTech * 0.35 + randRange(seedState, -10, 8), 0, 99),
      nuclearWarheads: profile?.nuclear ? Math.round(randRange(seedState, 60, 400)) : 0,
      morale: clamp(58 + baseStability * 0.28, 15, 96),
      readiness: clamp(52 + baseMilitary * 0.3, 12, 96),
      doctrine: config.doctrine,
      veterancy: clamp(28 + baseMilitary * 0.24, 5, 90),
    },

    research: {
      points: 0,
      perMonth: 0,
      completed: [],
      current: null,
      progress: 0,
    },

    intelligence: {
      capability: clamp(20 + baseTech * 0.35 + tilt('diplomacy') * 6, 3, 90),
      activeOps: [],
      counterIntel: clamp(22 + baseTech * 0.3, 5, 88),
      networkCountries: [],
    },

    approval: clamp(56 + tilt('welfare') * 4, 20, 88),
    stability: baseStability,
    corruption: baseCorruption,
    infrastructure: clamp(hdiScore * 0.8 + tilt('economy') * 6, 8, 95),

    taxes: {
      income: 26,
      corporate: 22,
      vat: 15,
      capitalGains: 18,
      tariff: 5,
      wealth: 0,
      carbon: 0,
      property: 3,
    },

    budget: {
      healthcare: { level: 1 },
      education: { level: 1 },
      military: { level: 1 },
      infrastructure: { level: 1 },
      welfare: { level: 1 },
      research: { level: 1 },
      police: { level: 1 },
      environment: { level: 1 },
      culture: { level: 1 },
      intelligence: { level: 1 },
    },

    activePolicies: [],
    buildings: {},
    construction: [],
    provinces: generateProvinces(seedState, config.capital, population, profile),
    parties: generateParties(seedState, config.ideology, totalSeats),
    monthsToElection: government.holdsElections ? government.termMonths : -1,
    termsServed: 1,

    nations: generateNations(seedState, config.countryId, config.government, config.region),
    treaties: [],
    wars: [],
    orgs: [],

    advisors: [],
    resources: deriveResources(profile, gdp, population),
    worldPrices: Object.fromEntries(RESOURCE_IDS.map((id) => [id, 1])) as Record<ResourceId, number>,

    activeModifiers: [],
    achievements: [],
    eventCooldowns: {},
    decreeCooldowns: {},
    eventQueue: [],
    chainedEvents: [],

    history: [],
    log: [
      {
        id: 'log-start',
        turn: 0,
        year: era.startYear,
        month: 1,
        text: `${config.leaderTitle} ${config.leaderName} takes office. ${config.nationName} enters ${era.name}.`,
        category: 'system',
        tone: 'neutral',
        icon: '🏛️',
      },
    ],

    score: 0,
    victoriesAchieved: [],
    gameOver: null,
    rngSeed: seedState.rngSeed,
  } satisfies GameState;

  // Working-age share is whatever is left after young and elderly.
  state.society.ageStructure.working = clamp(
    1 - state.society.ageStructure.young - state.society.ageStructure.elderly,
    0.25,
    0.75,
  );

  // Two-way trade starts at ~20% of GDP, split between partners by size,
  // proximity and warmth. Mirrors the formula the engine uses each tick.
  const gdpMonthly = (state.economy.gdp * 1000) / 12;
  const weights = state.nations.map((n) => {
    const proximity = n.region === state.identity.region ? 1.8 : 1;
    return Math.max(0, n.gdp) * proximity * (0.35 + (n.relations + 100) / 260);
  });
  const weightTotal = weights.reduce((a, b) => a + b, 0) || 1;
  state.nations.forEach((n, i) => {
    n.tradeVolume = gdpMonthly * 0.2 * (weights[i] / weightTotal);
  });
  state.economy.tradeBalance = 0;

  // Start the research queue on the cheapest available project so a new
  // campaign is already making progress on turn one.
  const firstTech = TECHNOLOGIES.filter((t) => t.requires.length === 0).sort((a, b) => a.cost - b.cost)[0];
  if (firstTech) state.research.current = firstTech.id;

  balanceInheritedBudget(state);

  return state;
}

/**
 * Sets the starting department funding to what the country can actually pay
 * for, so a new government inherits a roughly balanced budget rather than an
 * automatic debt spiral. A rich, clean state inherits well-funded services; a
 * poor or corrupt one inherits threadbare ones. Either way the player decides
 * where it goes from there.
 */
function balanceInheritedBudget(state: GameState): void {
  const baseline = baselineDeptSpend(state);

  // Defence comes first and is set to whatever sustains the country's actual
  // military posture — otherwise a heavily armed state like Israel or Russia
  // would watch its forces decay at "100% funding" through no fault of the
  // player. The civil departments then share out whatever is left, so a
  // militarised country genuinely starts with less to spend on everything else.
  const revenue = computeBudget(state).revenue.total;
  state.budget.military.level = defenceLevelFor(state, revenue);

  const budget = computeBudget(state);
  const fixed =
    budget.expenditure.debtInterest +
    budget.expenditure.advisors +
    budget.expenditure.orgDues +
    budget.expenditure.resourceImports +
    baseline.military * state.budget.military.level;

  const civilDepts = (Object.keys(state.budget) as (keyof typeof state.budget)[]).filter(
    (d) => d !== 'military',
  );
  const civilBaseline = civilDepts.reduce((sum, d) => sum + baseline[d], 0);
  if (civilBaseline <= 0) return;

  // Aim marginally under balance so there is a little headroom on turn one.
  // The floor means a poor country inherits a real deficit rather than a
  // gutted state — which is both truer to life and more playable.
  const available = budget.revenue.total - fixed;
  const level = clamp((available / civilBaseline) * 0.97, 0.55, 1.4);
  for (const dept of civilDepts) {
    state.budget[dept].level = Math.round(level * 20) / 20;
  }
}

/** Share of revenue the inherited defence budget is not allowed to exceed. */
const MAX_INHERITED_DEFENCE_SHARE = 0.28;

/**
 * Solves the military-strength model for the funding level that holds this
 * country's starting strength steady. Inverse of the `targetStrength`
 * calculation in `updateMilitary`.
 *
 * Capped at a share of revenue so an over-militarised, low-revenue state does
 * not start with defence crowding out every civil department — which produced
 * an unrecoverable collapse in the first months. A country whose forces are
 * genuinely beyond its means starts under-funding them and watches them
 * decline, which is the honest outcome.
 */
function defenceLevelFor(state: GameState, revenue: number): number {
  const baselineMilitary = baselineDeptSpend(state).military;
  if (baselineMilitary <= 0) return 1;

  const required =
    state.military.strength - 18 - state.military.veterancy * 0.15 + state.corruption * 0.14;
  const annualDefence = Math.pow(10, required / 22 + 2.2);
  const postureLevel = annualDefence / (baselineMilitary * 12);
  const affordableLevel = (revenue * MAX_INHERITED_DEFENCE_SHARE) / baselineMilitary;

  const level = Math.min(postureLevel, affordableLevel);
  return clamp(Math.round(level * 20) / 20, 0.15, BUDGET_MAX.military);
}

/** Default setup used by the wizard before the player changes anything. */
export function defaultSetup(): SetupConfig {
  return {
    mode: 'real',
    countryId: null,
    nationName: '',
    adjective: '',
    capital: '',
    motto: 'Strength through unity',
    region: 'europe',
    iso2: '',
    customFlag: {
      pattern: 'triband-v',
      colors: ['#0f1729', '#e5b447', '#4f8cff'],
      emblem: '★',
    },
    currencyCode: 'USD',
    government: 'democracy',
    ideology: 'centrist',
    leaderName: '',
    leaderTitle: 'President',
    leaderAge: 52,
    portrait: '🧑‍💼',
    traits: [],
    difficulty: 'normal',
    era: 'modern',
    victoryGoal: 'superpower',
    doctrine: 'defensive',
    eventFrequency: 'normal',
    enableWars: true,
    enableDisasters: true,
    ironman: false,
    neverEndGame: false,
    primaryColor: '#e5b447',
    secondaryColor: '#4f8cff',
    startingFocus: { economy: 20, military: 20, science: 20, welfare: 20, diplomacy: 20 },
  };
}

export { CURRENCIES };
