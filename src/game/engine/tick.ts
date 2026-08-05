import type { EnergySource, GameState, LogEntry, MilitaryBranch, SectorId } from '../types';
import { BUILDING_INDEX } from '../data/buildings';
import { TECH_INDEX } from '../data/technologies';
import { ACHIEVEMENTS } from '../data/achievements';
import { RESOURCE_INDEX } from '../data/definitions';
import { DIFFICULTY_INDEX, GOVERNMENT_INDEX, IDEOLOGY_INDEX, VICTORY_INDEX } from '../data/definitions';
import {
  activeTradeVolume,
  baselineDeptSpend,
  clamp,
  computeBudget,
  costScale,
  energyBalance,
  gdpPerCapita,
  renewableShare,
  totalEnergyProduction,
  totalModifiers,
} from '../selectors';
import { computeScore, checkVictory, scoreTitle } from './scoring';
import { rollEvent } from './events';
import { updateTradeAgreements } from './trade';
import { nextRandom, noise, randRange } from './rng';
import { addTreasury, spendTreasury } from './treasury';
import { advanceResearchProjects, normaliseResearch } from './research';
import { coupRisk, updateGovernance } from './politics';
import { updateCrises } from './crises';
import { updateAgenda } from './agenda';
import { naturalBloc, updateDossiers, updateWorld } from './world';
import { updateFinance } from './finance';

/** Exponential approach: moves `current` a fraction of the way to `target`. */
function drift(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

/** Monthly output in millions USD — used all over the engine for scaling. */
function gdpMonthlyFor(s: GameState): number {
  return (s.economy.gdp * 1000) / 12;
}

/**
 * Diminishing returns. Stacking twenty growth policies should be better than
 * ten, but not twice as good — without this, modifier stacking compounds into
 * absurdity over a fifty-year campaign.
 */
function softCap(value: number, cap: number): number {
  return cap * Math.tanh(value / cap);
}

function log(s: GameState, entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>): void {
  s.log.unshift({
    id: `log-${s.turn}-${s.log.length}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    turn: s.turn,
    year: s.year,
    month: s.month,
    ...entry,
  });
  if (s.log.length > 400) s.log.length = 400;
}

/* ------------------------------------------------------------------ */
/* Sub-systems                                                         */
/* ------------------------------------------------------------------ */

/** Monthly research output, before it is divided between the active slots. */
export function researchOutput(s: GameState, mods: ReturnType<typeof totalModifiers>): number {
  const pop = s.society.population;
  const base =
    Math.pow(pop / 1e6, 0.55) * 0.9 +
    Math.pow(Math.max(1, s.economy.gdp), 0.5) * 1.1;

  const quality =
    (0.35 + s.society.education / 145) *
    (0.55 + s.society.literacy / 220) *
    (1 - s.corruption / 260) *
    s.budget.research.level;

  return Math.max(0, base * quality * (1 + mods.research / 100));
}

function advanceResearch(s: GameState, mods: ReturnType<typeof totalModifiers>): void {
  s.research.perMonth = researchOutput(s, mods);
  const { completed } = advanceResearchProjects(s, s.research.perMonth);
  for (const tech of completed) {
    log(s, {
      text: `Research complete: ${tech.name}.`,
      category: 'research',
      tone: 'good',
      icon: tech.icon,
    });
  }
}

function advanceConstruction(s: GameState): void {
  if (s.construction.length === 0) return;
  const remaining: typeof s.construction = [];
  for (const project of s.construction) {
    project.turnsRemaining -= 1;
    if (project.turnsRemaining <= 0) {
      const b = BUILDING_INDEX[project.buildingId];
      s.buildings[project.buildingId] = (s.buildings[project.buildingId] ?? 0) + 1;
      if (b) {
        // Power stations feed the grid the moment they come online.
        if (b.energy && b.energy > 0) {
          const source = energySourceFor(b.id);
          s.energy.production[source] += b.energy;
        }
        log(s, {
          text: `${b.name} completed and entered service.`,
          category: 'build',
          tone: 'good',
          icon: b.icon,
        });
      }
    } else {
      remaining.push(project);
    }
  }
  s.construction = remaining;
}

function energySourceFor(buildingId: string): EnergySource {
  switch (buildingId) {
    case 'coal-plant': return 'coal';
    case 'power-plant-gas': return 'gas';
    case 'nuclear-plant':
    case 'fusion-plant': return 'nuclear';
    case 'hydro-dam': return 'hydro';
    case 'solar-farm':
    case 'wonder-solar-belt': return 'solar';
    case 'wind-farm': return 'wind';
    default: return 'other';
  }
}

/**
 * Electricity every completed building consumes, TWh/yr.
 *
 * Buildings declare a negative `energy` when they are a net load. That was
 * previously written into the data and then never read, so an arcology drawing
 * 20 TWh cost the grid nothing. It is now part of demand.
 */
function buildingEnergyDemand(s: GameState): number {
  let total = 0;
  for (const [id, count] of Object.entries(s.buildings)) {
    const b = BUILDING_INDEX[id];
    if (b?.energy !== undefined && b.energy < 0) total += -b.energy * count;
  }
  return total;
}

/**
 * The log10 of the GDP per capita this country could sustain given its
 * technology, institutions and policy mix. Exported so the economy panel can
 * show the player how much headroom is left.
 *
 * The 4.95 baseline is the current world frontier (~$89,000). Institutions
 * move it by up to two orders of magnitude in either direction, which is the
 * observed spread between the best- and worst-governed countries on earth.
 * The clamp puts a hard ceiling on a fifty-year campaign.
 */
export function frontierLog(s: GameState, mods: ReturnType<typeof totalModifiers>): number {
  const institutions =
    (s.society.education - 82) * 0.011 +
    (s.infrastructure - 80) * 0.008 +
    (60 - s.corruption) * 0.01 +
    (s.stability - 75) * 0.005 +
    (s.economy.productivity - 130) * 0.0018 +
    (s.economy.creditRating - 70) * 0.0015 -
    (s.economy.inequality - 38) * 0.0012;

  // Difficulty moves the ceiling itself, not just the speed of approach.
  // Scaling convergence alone did almost nothing for a developed economy,
  // because its convergence term is already near zero — which meant the
  // difficulty setting barely touched the countries where it mattered most.
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

function updateEconomy(s: GameState, mods: ReturnType<typeof totalModifiers>): void {
  const difficulty = DIFFICULTY_INDEX[s.settings.difficulty];
  const perCapita = gdpPerCapita(s);
  const balance = energyBalance(s);
  const energyPenalty = balance >= 1 ? 0 : (1 - balance) * 9;
  const warPenalty = s.wars.filter((w) => !w.resolved).length * 1.3;

  // Growth is convergence toward a productivity frontier, not a free-standing
  // rate. Technology, institutions and good policy raise the frontier; the
  // economy then grows fast when far below it and stalls once it arrives.
  // This is what stops a well-played campaign compounding into absurdity.
  const logPerCapita = Math.log10(Math.max(400, perCapita));
  const frontier = frontierLog(s, mods);
  const convergence = clamp((frontier - logPerCapita) * 6, -9, 7.5) * difficulty.economyMultiplier;

  const workingShare = s.society.ageStructure.working;
  const demographicTerm = (workingShare - 0.62) * 4.5;

  // Cyclical deviations around the trend. The world cycle is the largest
  // single term a player cannot control, which is the point of having one:
  // an export-driven economy genuinely does live or die by external demand.
  const opennessExposure = clamp(activeTradeVolume(s) / Math.max(1, (s.economy.gdp * 1000) / 12), 0, 0.6);
  const worldTerm = s.world.cycle * (0.6 + opennessExposure * 2.4);
  const sanctionPenalty = s.nations.filter((n) => n.sanctioningPlayer).length * 0.12;

  const cyclical =
    (s.economy.confidence - 50) * 0.02 +
    demographicTerm +
    worldTerm -
    sanctionPenalty -
    Math.max(0, s.economy.inflation - 4) * 0.28 -
    Math.max(0, s.economy.interestRate - 3) * 0.16 -
    Math.max(0, s.economy.unemployment - 6) * 0.1 -
    energyPenalty -
    warPenalty +
    noise(s) * 0.7;

  s.economy.growth = clamp(drift(s.economy.growth, convergence + cyclical, 0.3), -20, 15);
  // `gdp` tracks real output; inflation is modelled separately so the two
  // never get conflated in the UI.
  s.economy.gdp = Math.max(0.5, s.economy.gdp * (1 + s.economy.growth / 100 / 12));
  s.economy.realIndex = Math.max(0.01, s.economy.realIndex * (1 + s.economy.growth / 100 / 12));

  // --- Inflation: Phillips curve + deficit monetisation + energy costs ------
  const budget = computeBudget(s);
  const gdpMonthly = (s.economy.gdp * 1000) / 12;
  const deficitRatio = gdpMonthly > 0 ? -budget.net / gdpMonthly : 0;
  const targetInflation =
    2 +
    mods.inflation +
    Math.max(0, 5.5 - s.economy.unemployment) * 0.34 +
    Math.max(0, deficitRatio) * 11 +
    energyPenalty * 0.55 +
    (s.corruption - 35) * 0.02 -
    (s.economy.interestRate - 2.5) * 0.46 +
    noise(s) * 0.5;
  s.economy.inflation = clamp(drift(s.economy.inflation, targetInflation, 0.24), -6, 400);

  // --- Central bank -------------------------------------------------------
  // An independent bank follows a Taylor rule. A captured one does what the
  // player told it to, which is exactly why markets charge more for the debt.
  const taylorRate = clamp(
    1.6 + 1.5 * (s.economy.inflation - 2) + 0.5 * (s.economy.growth - 2),
    0,
    30,
  );
  const policyTarget = s.economy.centralBankIndependent ? taylorRate : s.economy.policyRateTarget;
  s.economy.interestRate = drift(s.economy.interestRate, policyTarget, 0.18);

  // --- Unemployment: Okun's law around a structural rate ------------------
  const structural = clamp(
    5.4 + mods.unemployment - (s.society.education - 50) * 0.02 + (s.corruption - 35) * 0.02,
    1.2,
    40,
  );
  const targetUnemployment = clamp(structural - (s.economy.growth - 2.2) * 0.55, 0.6, 60);
  s.economy.unemployment = clamp(drift(s.economy.unemployment, targetUnemployment, 0.16), 0.4, 65);

  // --- Productivity ------------------------------------------------------
  const targetProductivity = clamp(
    60 +
      s.research.completed.length * 1.9 +
      s.society.education * 0.42 +
      s.infrastructure * 0.3 -
      s.corruption * 0.16,
    25,
    280,
  );
  s.economy.productivity = drift(s.economy.productivity, targetProductivity, 0.05);

  // --- Confidence --------------------------------------------------------
  const targetConfidence = clamp(
    46 +
      (s.economy.growth - 2) * 5.4 +
      (s.stability - 50) * 0.34 +
      (s.approval - 50) * 0.18 -
      Math.max(0, s.economy.inflation - 3) * 2.4 -
      s.wars.filter((w) => !w.resolved).length * 8,
    2,
    99,
  );
  s.economy.confidence = drift(s.economy.confidence, targetConfidence, 0.2);

  // --- Trade ---------------------------------------------------------------
  // Volume is set in updateDiplomacy; the balance is the surplus or deficit
  // that competitiveness produces on top of it, centred on zero.
  const competitiveness =
    (s.economy.productivity / 100) *
    (1 + mods.tradeIncome / 100) *
    (1 - s.taxes.tariff / 260);
  s.economy.tradeBalance = activeTradeVolume(s) * clamp(competitiveness - 1, -0.45, 0.45);

  // --- Exchange rate: inflation differential and confidence ---------------
  const drifting =
    (s.economy.inflation - 2.5) / 1200 - (s.economy.confidence - 50) / 26000;
  s.economy.exchangeRate = Math.max(0.0001, s.economy.exchangeRate * (1 + drifting));

  // --- Treasury and debt --------------------------------------------------
  // A deficit is financed by borrowing rather than by a negative balance.
  addTreasury(s, budget.net);
  if (s.economy.autoRepayDebt && s.economy.debt > 0 && s.economy.treasury > gdpMonthly * 1.5) {
    // Surplus above 1.5 months of GDP pays the debt down. The player can turn
    // this off in the treasury to build a war chest instead.
    const repay = Math.min(s.economy.debt, (s.economy.treasury - gdpMonthly * 1.5) / 1000);
    s.economy.debt -= repay;
    s.economy.treasury -= repay * 1000;
  }
  s.economy.debt = Math.max(0, s.economy.debt);
  s.economy.reserves = Math.max(0, s.economy.reserves + budget.net * 0.06);

  // --- Credit rating -------------------------------------------------------
  const debtRatio = s.economy.gdp > 0 ? (s.economy.debt / s.economy.gdp) * 100 : 0;
  const targetRating = clamp(
    96 -
      debtRatio * 0.34 -
      Math.max(0, deficitRatio) * 60 -
      s.corruption * 0.26 +
      s.stability * 0.2 +
      (s.economy.growth - 2) * 1.4 -
      Math.max(0, s.economy.inflation - 5) * 1.1,
    1,
    100,
  );
  s.economy.creditRating = drift(s.economy.creditRating, targetRating, 0.09);

  // --- Sector rotation -----------------------------------------------------
  const sectorTargets = sectorTargetsFor(s);
  for (const k of Object.keys(s.economy.sectors) as SectorId[]) {
    s.economy.sectors[k] = drift(s.economy.sectors[k], sectorTargets[k], 0.02);
  }
  const sectorSum = (Object.values(s.economy.sectors) as number[]).reduce((a, b) => a + b, 0);
  if (sectorSum > 0) {
    for (const k of Object.keys(s.economy.sectors) as SectorId[]) {
      s.economy.sectors[k] = s.economy.sectors[k] / sectorSum;
    }
  }

  // --- Inequality ----------------------------------------------------------
  const targetInequality = clamp(
    38 +
      mods.inequality +
      (s.taxes.income < 20 ? 8 : 0) -
      (s.taxes.wealth * 0.7) -
      (s.taxes.income - 26) * 0.24 -
      (s.budget.welfare.level - 1) * 9 +
      s.corruption * 0.12,
    8,
    92,
  );
  s.economy.inequality = drift(s.economy.inequality, targetInequality, 0.05);
}

function sectorTargetsFor(s: GameState): Record<SectorId, number> {
  const perCapita = gdpPerCapita(s);
  const dev = clamp(Math.log10(Math.max(300, perCapita)) / 5, 0.4, 1);
  const techLevel = clamp(s.research.completed.length / 30, 0, 1);
  const raw: Record<SectorId, number> = {
    agriculture: clamp(0.32 - dev * 0.3, 0.008, 0.34),
    industry: clamp(0.3 - Math.abs(dev - 0.72) * 0.24, 0.08, 0.34),
    services: clamp(dev * 0.54, 0.16, 0.58),
    technology: clamp(0.02 + techLevel * 0.2 * dev, 0.005, 0.24),
    energy: clamp(0.03 + renewableShare(s) / 1400 + s.resources.oil.production / 900, 0.01, 0.3),
    tourism: clamp(0.04 + s.society.softPower / 900, 0.008, 0.16),
    finance: clamp(dev * 0.12 + s.economy.creditRating / 1300, 0.008, 0.18),
  };
  const sum = (Object.values(raw) as number[]).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(raw) as SectorId[]) raw[k] = raw[k] / sum;
  return raw;
}

function updateSociety(s: GameState, mods: ReturnType<typeof totalModifiers>): void {
  const perCapita = gdpPerCapita(s);
  const dev = clamp(Math.log10(Math.max(300, perCapita)), 2.5, 5.2);

  // --- Public services -----------------------------------------------------
  // Calibrated so that funding a department at level 1.0 roughly *sustains*
  // the index a country of that development level starts with. Anything below
  // 1.0 is a real cut; anything above it is a real improvement.
  const healthTarget = clamp(
    40 + (s.budget.healthcare.level - 1) * 30 + mods.health + dev * 8 - s.corruption * 0.16,
    2,
    100,
  );
  s.society.health = drift(s.society.health, healthTarget, 0.06);

  const eduTarget = clamp(
    42 + (s.budget.education.level - 1) * 30 + mods.education + dev * 8 - s.corruption * 0.14,
    2,
    100,
  );
  s.society.education = drift(s.society.education, eduTarget, 0.05);

  s.society.literacy = clamp(
    drift(s.society.literacy, clamp(30 + s.society.education * 0.72, 20, 99.8), 0.03),
    5,
    99.9,
  );

  const crimeTarget = clamp(
    34 +
      mods.crime -
      (s.budget.police.level - 1) * 18 -
      (s.society.education - 50) * 0.3 -
      (dev - 3.5) * 6 +
      (s.economy.unemployment - 6) * 1.5 +
      (s.economy.inequality - 38) * 0.42 +
      s.corruption * 0.16,
    1,
    100,
  );
  s.society.crime = drift(s.society.crime, crimeTarget, 0.07);

  const libertyTarget = clamp(
    50 + mods.civilLiberties + (s.approval - 50) * 0.08 - s.corruption * 0.1,
    1,
    100,
  );
  s.society.civilLiberties = drift(s.society.civilLiberties, libertyTarget, 0.06);

  const softPowerTarget = clamp(
    8 +
      mods.softPower +
      Math.log10(Math.max(1, s.economy.gdp)) * 8 +
      (s.budget.culture.level - 1) * 14 +
      s.society.civilLiberties * 0.16 +
      s.research.completed.length * 0.5 -
      s.wars.filter((w) => !w.resolved).length * 6,
    1,
    100,
  );
  s.society.softPower = drift(s.society.softPower, softPowerTarget, 0.05);

  const happinessTarget = clamp(
    30 +
      mods.happiness +
      (dev - 3.5) * 4 +
      (s.society.health - 50) * 0.2 +
      (s.society.education - 50) * 0.12 +
      (100 - s.society.crime) * 0.16 +
      (s.society.civilLiberties - 50) * 0.14 +
      (s.budget.welfare.level - 1) * 11 +
      (60 - s.economy.inequality) * 0.24 -
      Math.max(0, s.economy.unemployment - 5) * 1.3 -
      Math.max(0, s.economy.inflation - 3) * 1.1 -
      s.environment.pollution * 0.1 +
      (s.economy.growth - 1.5) * 1.4,
    1,
    100,
  );
  s.society.happiness = drift(s.society.happiness, happinessTarget, 0.07);

  // --- Demography -----------------------------------------------------------
  const birthTarget = clamp(
    34 - dev * 5.2 + mods.birthRate - (s.society.education - 50) * 0.045 + (s.society.happiness - 50) * 0.02,
    5.5,
    48,
  );
  s.society.birthRate = drift(s.society.birthRate, birthTarget, 0.05);

  const lifeTarget = clamp(
    40 + s.society.health * 0.32 + dev * 5.6 - s.environment.pollution * 0.05,
    38,
    95,
  );
  s.society.lifeExpectancy = drift(s.society.lifeExpectancy, lifeTarget, 0.035);

  const deathTarget = clamp(
    26 - s.society.lifeExpectancy * 0.2 + s.society.ageStructure.elderly * 22,
    4.5,
    26,
  );
  s.society.deathRate = drift(s.society.deathRate, deathTarget, 0.05);

  const migrationTarget = clamp(
    (s.society.happiness - 52) * 0.06 +
      (dev - 3.6) * 2.2 +
      mods.migration * 0.09 -
      s.wars.filter((w) => !w.resolved).length * 2.5 -
      Math.max(0, 40 - s.stability) * 0.08,
    -14,
    16,
  );
  s.society.netMigration = drift(s.society.netMigration, migrationTarget, 0.1);

  const netPerThousand = s.society.birthRate - s.society.deathRate + s.society.netMigration;
  s.society.population = Math.max(
    1000,
    Math.round(s.society.population * (1 + netPerThousand / 1000 / 12)),
  );

  // --- Age structure ---------------------------------------------------------
  const youngTarget = clamp(s.society.birthRate / 90, 0.1, 0.48);
  const elderlyTarget = clamp((s.society.lifeExpectancy - 55) / 130, 0.02, 0.34);
  s.society.ageStructure.young = drift(s.society.ageStructure.young, youngTarget, 0.02);
  s.society.ageStructure.elderly = drift(s.society.ageStructure.elderly, elderlyTarget, 0.02);
  s.society.ageStructure.working = clamp(
    1 - s.society.ageStructure.young - s.society.ageStructure.elderly,
    0.2,
    0.8,
  );
  s.society.medianAge = clamp(
    drift(s.society.medianAge, 18 + s.society.ageStructure.elderly * 90 + (1 - s.society.ageStructure.young) * 14, 0.02),
    14,
    58,
  );
  s.society.urbanisation = clamp(
    drift(s.society.urbanisation, clamp(18 + dev * 15 + s.infrastructure * 0.2, 12, 98), 0.02),
    8,
    99,
  );
}

function updateEnergyAndEnvironment(s: GameState, mods: ReturnType<typeof totalModifiers>): void {
  // Demand tracks output and population; efficiency gains pull it back down.
  const efficiency = 1 - clamp(s.research.completed.length * 0.006, 0, 0.35);
  const targetDemand = Math.max(
    2,
    (s.economy.gdp * 0.3 + (s.society.population / 1e6) * 1.5) * efficiency + buildingEnergyDemand(s),
  );
  s.energy.demand = drift(s.energy.demand, targetDemand, 0.05);

  // Fossil capacity slowly follows the modifier signal; a negative energyOutput
  // modifier (e.g. a coal phase-out) retires plant over time.
  const outputBias = mods.energyOutput / 100;
  const fossil: EnergySource[] = ['coal', 'gas', 'oil'];
  const clean: EnergySource[] = ['nuclear', 'hydro', 'solar', 'wind'];
  const shortfall = s.energy.demand - totalEnergyProduction(s);

  if (shortfall > 0) {
    // Markets fill a gap with whatever is cheapest, biased by policy.
    const cleanBias = clamp(0.25 + outputBias * 0.6 - mods.emissions / 260, 0.05, 0.95);
    const addClean = shortfall * 0.06 * cleanBias;
    const addFossil = shortfall * 0.06 * (1 - cleanBias);
    for (const k of clean) s.energy.production[k] += addClean / clean.length;
    for (const k of fossil) s.energy.production[k] += addFossil / fossil.length;
  } else if (outputBias < 0) {
    for (const k of fossil) s.energy.production[k] = Math.max(0, s.energy.production[k] * (1 + outputBias * 0.02));
  }

  s.environment.renewableShare = renewableShare(s);

  // --- Emissions -------------------------------------------------------------
  const fossilTWh = fossil.reduce((sum, k) => sum + s.energy.production[k], 0);
  const targetEmissions = Math.max(
    0.5,
    (s.economy.gdp * 0.12 + fossilTWh * 0.42) * (1 + mods.emissions / 100) * (1 - s.taxes.carbon / 190),
  );
  s.environment.emissions = drift(s.environment.emissions, targetEmissions, 0.05);

  // A single country only nudges the global figure; the rest is the world's.
  // Baseline warming is ~0.019 °C/yr, plus this nation's share of world emissions.
  const worldEmissions = 40000;
  const share = clamp(s.environment.emissions / worldEmissions, 0, 0.4);
  s.environment.globalTemp = clamp(s.environment.globalTemp + (0.019 + share * 0.05) / 12, 0, 6);

  const pollutionTarget = clamp(
    s.environment.emissions / Math.max(1, s.economy.gdp) * 60 +
      (1 - s.budget.environment.level) * 22 +
      (100 - s.environment.renewableShare) * 0.18,
    1,
    100,
  );
  s.environment.pollution = drift(s.environment.pollution, pollutionTarget, 0.05);

  s.environment.forestCover = clamp(
    drift(
      s.environment.forestCover,
      clamp(s.environment.forestCover + (s.budget.environment.level - 1) * 8 - s.economy.growth * 0.25, 1, 92),
      0.03,
    ),
    0,
    95,
  );
  s.environment.biodiversity = clamp(
    drift(s.environment.biodiversity, clamp(s.environment.forestCover * 0.7 + (100 - s.environment.pollution) * 0.4, 2, 98), 0.03),
    0,
    100,
  );
  s.environment.disasterRisk = clamp(
    10 + s.environment.globalTemp * 14 + s.environment.pollution * 0.18 - s.infrastructure * 0.1,
    2,
    95,
  );
  s.environment.waterStress = clamp(
    drift(
      s.environment.waterStress,
      clamp(s.environment.waterStress + s.environment.globalTemp * 1.2 - (s.budget.environment.level - 1) * 12, 1, 99),
      0.02,
    ),
    0,
    100,
  );
}

function updateResources(s: GameState): void {
  const scaleFactor = s.economy.gdp * 0.06 + s.society.population / 1e6 * 0.35;
  // Efficiency gains reduce how much of everything an economy burns per unit
  // of output — the same term that pulls electricity demand down.
  const efficiency = 1 - clamp(s.research.completed.length * 0.004, 0, 0.28);

  for (const [id, holding] of Object.entries(s.resources)) {
    // Extraction depletes reserves; depleted fields stop producing.
    if (holding.reserves > 0 && holding.production > 0) {
      holding.reserves = Math.max(0, holding.reserves - holding.production / (scaleFactor * 380 + 1));
      if (holding.reserves <= 0) holding.production = 0;
    }
    holding.stockpile = Math.max(0, holding.stockpile + (holding.production - holding.consumption) * 0.1);

    // Consumption is category-specific. Previously every commodity drifted to
    // the same target, which quietly erased the distinction between how much
    // oil and how much gold an economy actually uses.
    const category = RESOURCE_INDEX[id as keyof typeof RESOURCE_INDEX]?.category;
    const weight =
      category === 'energy' ? 1.3 :
      category === 'agricultural' ? 1.1 :
      category === 'metal' ? 0.8 : 0.35;
    holding.consumption = drift(holding.consumption, scaleFactor * weight * 0.55 * efficiency, 0.05);
  }

  // World prices mean-revert around 1, pushed by the global cycle and by how
  // tense the world is — commodities are the first thing to price geopolitics.
  const pressure = 1 + s.world.cycle * 0.12 + s.world.tension / 500;
  for (const key of Object.keys(s.worldPrices) as (keyof typeof s.worldPrices)[]) {
    const current = s.worldPrices[key];
    s.worldPrices[key] = clamp(drift(current, pressure, 0.02) + noise(s) * 0.03, 0.35, 3.2);
  }
}

function updateMilitary(s: GameState, mods: ReturnType<typeof totalModifiers>): void {
  const funding = s.budget.military.level;
  const techBonus = s.research.completed.filter((t) => TECH_INDEX[t]?.branch === 'military').length * 3.4;

  // Military power tracks *absolute* defence spending, not the budget ratio.
  // A superpower spending 1% of a $27T economy fields something Fiji cannot
  // match at 100% of its own. The log scale means doubling the defence budget
  // is a real but not overwhelming gain (~+6.6 points).
  const annualDefenceMillions = Math.max(
    0.5,
    baselineDeptSpend(s).military * funding * 12,
  );
  const spendPower = (Math.log10(annualDefenceMillions) - 2.2) * 22;

  const targetStrength = clamp(
    18 +
      spendPower +
      techBonus +
      mods.militaryPower * 0.5 +
      s.military.veterancy * 0.15 -
      s.corruption * 0.14,
    1,
    100,
  );
  s.military.strength = drift(s.military.strength, targetStrength, 0.05);

  const branchTarget = s.military.strength;
  const doctrineBias: Record<GameState['military']['doctrine'], Partial<Record<MilitaryBranch, number>>> = {
    defensive: { army: 8, cyber: 4 },
    offensive: { army: 6, airForce: 8 },
    deterrence: { airForce: 6, space: 8 },
    expeditionary: { navy: 10, airForce: 6 },
    asymmetric: { cyber: 12, army: 4 },
  };
  const bias = doctrineBias[s.military.doctrine];
  const branches: MilitaryBranch[] = ['army', 'navy', 'airForce', 'cyber', 'space'];
  // Branch funding is a split of the same money, not extra money: the weights
  // are normalised so favouring one arm genuinely starves the others.
  const fundingTotal = branches.reduce((sum, b) => sum + (s.military.branchFunding[b] ?? 1), 0) || branches.length;
  for (const branch of branches) {
    const share = ((s.military.branchFunding[branch] ?? 1) / fundingTotal) * branches.length;
    const emphasis = (share - 1) * 18;
    s.military[branch] = clamp(
      drift(s.military[branch], clamp(branchTarget + (bias[branch] ?? -3) + emphasis, 0, 100), 0.04),
      0,
      100,
    );
  }

  // --- Nuclear weapons programme -------------------------------------------
  // A slow, expensive, diplomatically ruinous project that cannot be rushed.
  if (s.military.nuclearProgrammeActive) {
    const hasTech = s.research.completed.includes('nuclear-weapons');
    if (!hasTech) {
      s.military.nuclearProgrammeActive = false;
      log(s, {
        text: 'The weapons programme has been suspended: the underlying physics package is not ready.',
        category: 'military',
        tone: 'bad',
        icon: '☢️',
      });
    } else {
      const cost = baselineDeptSpend(s).military * 0.55;
      spendTreasury(s, cost);
      const rate = 0.9 + s.economy.gdp / 4000 + s.research.completed.length * 0.02;
      s.military.nuclearProgramme = clamp(s.military.nuclearProgramme + rate, 0, 100);
      s.society.softPower = clamp(s.society.softPower - 0.06, 0, 100);
      if (s.military.nuclearProgramme >= 100) {
        s.military.nuclearWarheads += 1;
        s.military.nuclearProgramme = 0;
        for (const n of s.nations) {
          n.relations = clamp(n.relations - (s.military.nuclearWarheads === 1 ? 12 : 1.5), -100, 100);
          n.threatPerception = clamp(n.threatPerception + 6, 0, 100);
        }
        log(s, {
          text:
            s.military.nuclearWarheads === 1
              ? 'The first device has been assembled. The world has been informed by its own sensors.'
              : `Warhead ${s.military.nuclearWarheads} has entered the stockpile.`,
          category: 'military',
          tone: 'neutral',
          icon: '☢️',
        });
      }
    }
  }

  s.military.manpower = Math.round(
    s.society.population * clamp(0.0012 + (funding * s.military.strength) / 26000, 0.0003, 0.02),
  );
  s.military.reserves = Math.round(s.society.population * 0.004 * funding);
  s.military.morale = clamp(
    drift(s.military.morale, clamp(40 + s.approval * 0.28 + s.stability * 0.24 + funding * 8, 5, 100), 0.07),
    0,
    100,
  );
  s.military.readiness = clamp(
    drift(s.military.readiness, clamp(30 + funding * 30 + s.military.morale * 0.22, 5, 100), 0.07),
    0,
    100,
  );

  s.intelligence.capability = clamp(
    drift(
      s.intelligence.capability,
      clamp(10 + s.budget.intelligence.level * 26 + mods.intelligence * 0.5 + s.military.cyber * 0.2, 1, 100),
      0.06,
    ),
    0,
    100,
  );
  s.intelligence.counterIntel = clamp(
    drift(s.intelligence.counterIntel, s.intelligence.capability * 0.85, 0.05),
    0,
    100,
  );

  // Covert operations tick down and resolve.
  const stillRunning: typeof s.intelligence.activeOps = [];
  for (const op of s.intelligence.activeOps) {
    op.turnsRemaining -= 1;
    if (op.turnsRemaining > 0) {
      stillRunning.push(op);
      continue;
    }
    const target = s.nations.find((n) => n.id === op.targetId);
    const success = nextRandom(s) < op.successChance;
    if (success && target) {
      switch (op.type) {
        case 'espionage':
          s.research.points += 220 + s.intelligence.capability * 9;
          break;
        case 'sabotage':
          target.militaryStrength = clamp(target.militaryStrength - 6, 0, 100);
          break;
        case 'propaganda':
          target.relations = clamp(target.relations + 12, -100, 100);
          break;
        case 'coup':
          target.stability = clamp(target.stability - 22, 0, 100);
          target.relations = clamp(target.relations - 18, -100, 100);
          break;
        case 'cyberattack':
          target.gdp = Math.max(1, target.gdp * 0.985);
          break;
        case 'assassination':
          target.stability = clamp(target.stability - 14, 0, 100);
          break;
      }
      log(s, {
        text: `Operation ${op.label} succeeded in ${target.name}.`,
        category: 'diplomacy',
        tone: 'good',
        icon: '🕵️',
      });
    } else if (target) {
      // Blown operations cost relations and, occasionally, standing.
      target.relations = clamp(target.relations - 16, -100, 100);
      s.society.softPower = clamp(s.society.softPower - 3, 0, 100);
      log(s, {
        text: `Operation ${op.label} in ${target.name} was exposed.`,
        category: 'diplomacy',
        tone: 'bad',
        icon: '🕵️',
      });
    }
  }
  s.intelligence.activeOps = stillRunning;
}

function updateDiplomacy(s: GameState, mods: ReturnType<typeof totalModifiers>): void {
  const openGov = ['democracy', 'republic', 'federal-republic', 'constitutional-monarchy', 'direct-democracy'];
  const playerOpen = openGov.includes(s.identity.government);
  const playerBloc = naturalBloc({
    government: s.identity.government,
    region: s.identity.region,
    gdp: s.economy.gdp,
  });

  for (const n of s.nations) {
    if (n.atWarWithPlayer) {
      n.relations = clamp(n.relations - 2.5, -100, 100);
      continue;
    }

    const govAffinity = openGov.includes(n.government) === playerOpen ? 6 : -6;
    const personalityBias =
      n.personality === 'idealist' ? (s.society.civilLiberties - 50) * 0.12 :
      n.personality === 'aggressive' ? -(s.military.strength - 50) * 0.06 :
      n.personality === 'mercantile' ? n.tradeVolume * 0.05 :
      n.personality === 'isolationist' ? -3 :
      2;

    // Bloc alignment matters as much as government type once blocs exist.
    const blocAffinity = n.bloc === playerBloc ? 10 : n.bloc === null ? 0 : -5;

    const target = clamp(
      govAffinity +
        blocAffinity +
        personalityBias +
        mods.diplomacy * 0.35 +
        s.society.softPower * 0.22 -
        (n.sanctioned ? 45 : 0) -
        (n.sanctioningPlayer ? 20 : 0) -
        n.threatPerception * 0.14 +
        (s.treaties.some((t) => t.countryId === n.id) ? 22 : 0) +
        (s.orgs.length > 0 ? s.orgs.length * 2 : 0) -
        s.wars.filter((w) => !w.resolved).length * 5 -
        s.world.tension * 0.08,
      -100,
      100,
    );
    n.relations = clamp(drift(n.relations, target, 0.03) + noise(s) * 0.25, -100, 100);
    n.trust = clamp(drift(n.trust, 50 + n.relations * 0.35, 0.02), 0, 100);
  }

  // Trade is a fixed share of the player's own economy, split between partners
  // by their size, proximity and warmth. This keeps it in proportion whether
  // the player runs Fiji or the United States.
  const openness = clamp(0.2 * (1 + mods.tradeIncome / 220) * (1 - s.taxes.tariff / 200), 0.03, 0.6);
  const gdpMonthly = (s.economy.gdp * 1000) / 12;
  const weights = s.nations.map((n) => {
    if (n.atWarWithPlayer || n.sanctioned || n.sanctioningPlayer) return 0;
    const proximity = n.region === s.identity.region ? 1.8 : 1;
    const sameBloc = n.bloc === playerBloc ? 1.25 : 1;
    return Math.max(0, n.gdp) * proximity * sameBloc * (0.35 + (n.relations + 100) / 260);
  });
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  s.nations.forEach((n, i) => {
    const target = weightTotal > 0 ? gdpMonthly * openness * (weights[i] / weightTotal) : 0;
    n.tradeVolume = drift(n.tradeVolume, target, 0.08);
  });

  updateTradeAgreements(s, (text, tone) =>
    log(s, { text, category: 'diplomacy', tone, icon: '🚢' }),
  );

  // Expiring treaties.
  s.treaties = s.treaties.filter((t) => {
    if (t.expiresTurn !== undefined && s.turn >= t.expiresTurn) {
      log(s, { text: `The ${t.type} treaty with ${t.countryId} has lapsed.`, category: 'diplomacy', tone: 'neutral', icon: '📜' });
      return false;
    }
    return true;
  });
  for (const t of s.treaties) addTreasury(s, t.monthlyValue * costScale(s.economy.gdp));
}

function updateWars(s: GameState): void {
  if (!s.settings.enableWars) return;
  for (const war of s.wars) {
    if (war.resolved) continue;
    const enemy = s.nations.find((n) => n.id === (war.attackerId === 'player' ? war.defenderId : war.attackerId));
    if (!enemy) {
      war.resolved = 'white-peace';
      continue;
    }

    const playerPower =
      s.military.strength * (0.55 + s.military.readiness / 220) * (0.7 + s.military.morale / 330);
    const enemyPower = enemy.militaryStrength * (0.75 + enemy.stability / 400);
    const swing = clamp((playerPower - enemyPower) * 0.28 + noise(s) * 3.2, -22, 22);
    war.warScore = clamp(war.warScore + swing, -140, 140);

    const intensity = Math.max(0.4, (playerPower + enemyPower) / 100);
    war.playerCasualties += Math.round(intensity * randRange(s, 260, 2400));
    war.enemyCasualties += Math.round(intensity * randRange(s, 260, 2400) * (1 + swing / 40));
    war.monthlyCost = ((s.economy.gdp * 1000) / 12) * 0.045 * intensity;

    s.society.population = Math.max(1000, s.society.population - Math.round(intensity * randRange(s, 200, 1800)));
    s.military.veterancy = clamp(s.military.veterancy + 0.35, 0, 100);
    s.military.morale = clamp(s.military.morale + (swing > 0 ? 0.6 : -1.1), 0, 100);

    if (war.warScore >= 100) {
      war.resolved = 'victory';
      s.approval = clamp(s.approval + 16, 0, 100);
      s.stability = clamp(s.stability + 8, 0, 100);
      addTreasury(s, enemy.gdp * 1000 * 0.02);
      enemy.atWarWithPlayer = false;
      enemy.relations = -60;
      enemy.gdp *= 0.9;
      log(s, { text: `Victory over ${enemy.name}. Terms have been signed.`, category: 'military', tone: 'good', icon: '🏆' });
    } else if (war.warScore <= -100) {
      war.resolved = 'defeat';
      s.approval = clamp(s.approval - 26, 0, 100);
      s.stability = clamp(s.stability - 20, 0, 100);
      s.economy.gdp *= 0.88;
      addTreasury(s, -s.economy.gdp * 1000 * 0.03);
      enemy.atWarWithPlayer = false;
      enemy.relations = -70;
      log(s, { text: `Defeat by ${enemy.name}. The peace terms are punitive.`, category: 'military', tone: 'critical', icon: '💀' });
    } else if (s.turn - war.startTurn > 60) {
      war.resolved = 'white-peace';
      enemy.atWarWithPlayer = false;
      enemy.relations = -30;
      log(s, { text: `The war with ${enemy.name} has ended without a settlement.`, category: 'military', tone: 'neutral', icon: '🏳️' });
    }
  }
}

function updatePolitics(s: GameState, mods: ReturnType<typeof totalModifiers>): void {
  const activeWars = s.wars.filter((w) => !w.resolved);
  const losingWar = activeWars.some((w) => w.warScore < -30);

  const approvalTarget = clamp(
    44 +
      mods.approval +
      (s.economy.growth - 2) * 3.4 -
      Math.max(0, s.economy.unemployment - 5) * 1.7 -
      Math.max(0, s.economy.inflation - 3) * 2.1 +
      (s.society.happiness - 50) * 0.36 -
      (s.corruption - 30) * 0.24 +
      (s.stability - 50) * 0.12 +
      (s.society.health - 50) * 0.08 -
      (losingWar ? 14 : 0) +
      (activeWars.length > 0 && !losingWar ? 4 : 0),
    0,
    100,
  );
  s.approval = clamp(drift(s.approval, approvalTarget, 0.12) + noise(s) * 0.35, 0, 100);

  const avgUnrest = s.provinces.reduce((sum, p) => sum + p.unrest, 0) / Math.max(1, s.provinces.length);
  const stabilityTarget = clamp(
    48 +
      mods.stability +
      (s.approval - 50) * 0.3 +
      (s.society.happiness - 50) * 0.2 -
      (s.corruption - 30) * 0.2 -
      Math.max(0, s.economy.unemployment - 7) * 1.2 -
      (s.economy.inequality - 40) * 0.16 -
      avgUnrest * 0.22 +
      (s.budget.police.level - 1) * 8 -
      activeWars.length * 5,
    0,
    100,
  );
  s.stability = clamp(drift(s.stability, stabilityTarget, 0.1), 0, 100);

  const corruptionTarget = clamp(
    36 +
      mods.corruption -
      (s.society.education - 50) * 0.16 -
      (s.society.civilLiberties - 50) * 0.12 +
      (100 - s.stability) * 0.14 -
      (s.budget.police.level - 1) * 5,
    0,
    100,
  );
  s.corruption = clamp(drift(s.corruption, corruptionTarget, 0.05), 0, 100);

  const devLevel = Math.log10(Math.max(300, gdpPerCapita(s)));
  const infraTarget = clamp(
    44 +
      (s.budget.infrastructure.level - 1) * 32 +
      mods.infrastructure +
      (devLevel - 3.5) * 6 -
      s.corruption * 0.16,
    1,
    100,
  );
  s.infrastructure = drift(s.infrastructure, infraTarget, 0.05);

  // --- Provinces ------------------------------------------------------------
  const provinceInvestment = s.provinces.reduce((sum, p) => sum + Math.max(0, p.investment), 0);
  if (provinceInvestment > 0) spendTreasury(s, provinceInvestment);

  for (const p of s.provinces) {
    // Martial law suppresses unrest hard, and costs liberties and legitimacy.
    const suppression = p.martialLaw ? 24 : 0;
    const unrestTarget = clamp(
      36 -
        s.stability * 0.34 +
        (s.economy.unemployment - 6) * 1.6 +
        (100 - p.loyalty) * 0.2 +
        p.autonomy * 0.1 -
        s.society.happiness * 0.18 -
        suppression,
      0,
      100,
    );
    p.unrest = clamp(drift(p.unrest, unrestTarget, 0.06), 0, 100);

    // Occupation buys quiet and spends consent — loyalty falls under it.
    const loyaltyTarget = clamp(
      s.stability * 0.6 + s.approval * 0.3 - p.autonomy * 0.15 - (p.martialLaw ? 22 : 0),
      0,
      100,
    );
    p.loyalty = clamp(drift(p.loyalty, loyaltyTarget, 0.04), 0, 100);

    // Standing investment raises the local ceiling on development.
    const investmentBoost = clamp((p.investment / Math.max(1, gdpMonthlyFor(s) * 0.02)) * 12, 0, 30);
    p.development = clamp(
      drift(
        p.development,
        clamp(s.infrastructure * 0.6 + s.society.education * 0.3 + 10 + investmentBoost, 0, 100),
        0.02,
      ),
      0,
      100,
    );

    // Separatism is a slow accumulator, not a monthly reading. Years of
    // neglect build it; investment, loyalty and devolution bleed it away.
    const pressure =
      (p.unrest - 45) * 0.05 +
      (p.autonomy - 40) * 0.02 +
      (55 - p.loyalty) * 0.045 -
      (p.martialLaw ? -0.25 : 0.15) -
      investmentBoost * 0.02;
    p.separatism = clamp(p.separatism + pressure, 0, 100);

    p.population *= 1 + (s.society.birthRate - s.society.deathRate) / 1000 / 12;
  }

  const occupied = s.provinces.filter((p) => p.martialLaw).length;
  if (occupied > 0) {
    s.society.civilLiberties = clamp(s.society.civilLiberties - occupied * 0.25, 0, 100);
    spendTreasury(s, baselineDeptSpend(s).police * 0.35 * occupied);
  }

  // --- Parties ---------------------------------------------------------------
  const totalSeats = s.parties.reduce((sum, p) => sum + p.seats, 0) || 300;
  const playerPartyId = `party-${s.leader.ideology}`;
  let supportSum = 0;
  for (const party of s.parties) {
    const isPlayer = party.id === playerPartyId;
    const ideology = IDEOLOGY_INDEX[party.ideology];
    // Rivals gain when the country hurts on the axis they care about.
    const grievance =
      (ideology?.economicAxis ?? 0) > 20 ? Math.max(0, s.taxes.income - 32) * 0.16 :
      (ideology?.economicAxis ?? 0) < -20 ? Math.max(0, s.economy.inequality - 40) * 0.1 : 0;

    const target = isPlayer
      ? clamp(18 + s.approval * 0.34, 4, 70)
      : clamp(10 + grievance + (60 - s.approval) * 0.12, 2, 55);
    party.support = Math.max(0.5, drift(party.support, target, 0.05) + noise(s) * 0.2);
    party.relation = clamp(
      drift(party.relation, isPlayer ? 100 : clamp(-20 + (s.approval - 50) * 0.4, -100, 60), 0.04),
      -100,
      100,
    );
    supportSum += party.support;
  }
  // Guard: with no parties, or every party at zero, normalising would divide
  // by zero and put NaN through the whole political block.
  if (supportSum > 0) {
    for (const party of s.parties) {
      party.support = (party.support / supportSum) * 100;
      party.seats = Math.round((party.support / 100) * totalSeats);
    }
  }

  // --- Elections --------------------------------------------------------------
  if (s.monthsToElection > 0) {
    s.monthsToElection -= 1;
    if (s.monthsToElection === 0) runElection(s);
  }
}

function runElection(s: GameState): void {
  const gov = GOVERNMENT_INDEX[s.identity.government];
  const playerParty = s.parties.find((p) => p.id === `party-${s.leader.ideology}`);
  const playerShare = playerParty?.support ?? s.approval * 0.5;
  const topRival = s.parties
    .filter((p) => p.id !== playerParty?.id)
    .reduce((best, p) => (p.support > (best?.support ?? -1) ? p : best), null as typeof s.parties[number] | null);

  // Incumbency, turnout noise and a small advantage for a stable state. A
  // government mid-way through a plan that is visibly working gets credit for
  // it; one that has just abandoned a plan does not.
  const record = s.governance.momentum * 0.06 + (s.governance.mandate - 50) * 0.05;
  const swing = noise(s) * 4 + (s.stability - 50) * 0.04 + record;
  const playerResult = playerShare + swing;
  const rivalResult = topRival?.support ?? 0;

  if (playerResult >= rivalResult) {
    s.termsServed += 1;
    s.leader.legacy += 25;
    // The leader ages one year per year in `tick`; adding a term's worth here
    // as well made every incumbent age at double speed.
    s.monthsToElection = gov.termMonths;
    s.approval = clamp(s.approval + 6, 0, 100);
    s.governance.mandate = clamp(s.governance.mandate + 14, 0, 100);
    s.governance.momentum = clamp(s.governance.momentum + 30, -100, 100);
    log(s, {
      text: `Election won with ${playerResult.toFixed(1)}% of the vote. Term ${s.termsServed} begins.`,
      category: 'election',
      tone: 'good',
      icon: '🗳️',
    });
  } else if (s.settings.neverEndGame) {
    // Eternal mode: the loss is real but not terminal. The opposition fails to
    // form a government, you stay on with a badly weakened mandate, and the
    // next election comes round sooner than it otherwise would.
    s.monthsToElection = Math.max(12, Math.round(gov.termMonths * 0.6));
    s.approval = clamp(s.approval - 12, 0, 100);
    s.stability = clamp(s.stability - 10, 0, 100);
    s.governance.mandate = clamp(s.governance.mandate - 22, 0, 100);
    s.governance.momentum = clamp(s.governance.momentum - 35, -100, 100);
    for (const party of s.parties) {
      if (party.id !== playerParty?.id) party.relation = clamp(party.relation - 18, -100, 100);
    }
    log(s, {
      text: `Election lost ${rivalResult.toFixed(1)}% to ${playerResult.toFixed(1)}%, but ${topRival?.name ?? 'the opposition'} could not form a government. You continue as a caretaker.`,
      category: 'election',
      tone: 'bad',
      icon: '🗳️',
    });
  } else {
    s.gameOver = {
      reason: `Defeated at the ballot box by the ${topRival?.name ?? 'opposition'} with ${rivalResult.toFixed(1)}% to your ${playerResult.toFixed(1)}%.`,
      victory: false,
      turn: s.turn,
      title: 'Voted Out',
    };
    log(s, {
      text: `Election lost. ${topRival?.name ?? 'The opposition'} forms a government.`,
      category: 'election',
      tone: 'critical',
      icon: '🗳️',
    });
  }
}

function updateModifiers(s: GameState): void {
  const kept: typeof s.activeModifiers = [];
  for (const m of s.activeModifiers) {
    if (m.monthsRemaining === Infinity || m.monthsRemaining > 900) {
      kept.push(m);
      continue;
    }
    m.monthsRemaining -= 1;
    if (m.monthsRemaining > 0) kept.push(m);
    else log(s, { text: `${m.label} has expired.`, category: 'system', tone: 'neutral', icon: '⌛' });
  }
  s.activeModifiers = kept;
}

function checkAchievements(s: GameState): void {
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue;
    let unlocked = false;
    try {
      unlocked = a.check(s);
    } catch {
      unlocked = false;
    }
    if (unlocked) {
      s.achievements.push(a.id);
      log(s, {
        text: `Achievement unlocked: ${a.name} (+${a.points})`,
        category: 'system',
        tone: 'good',
        icon: a.icon,
      });
    }
  }
}

function checkGameOver(s: GameState): void {
  if (s.gameOver) return;

  // Victory registers in every mode. In eternal mode it is recorded and
  // celebrated rather than ending the run, so the player can keep building.
  if (checkVictory(s) && !s.victoriesAchieved.includes(s.settings.victoryGoal)) {
    s.victoriesAchieved.push(s.settings.victoryGoal);
    const goal = VICTORY_INDEX[s.settings.victoryGoal];
    log(s, {
      text: `Objective achieved: ${goal?.name ?? s.settings.victoryGoal}. ${
        s.settings.neverEndGame ? 'The campaign continues.' : ''
      }`.trim(),
      category: 'system',
      tone: 'good',
      icon: goal?.icon ?? '🏆',
    });

    if (!s.settings.neverEndGame) {
      s.gameOver = {
        reason: 'Every objective of your chosen path has been met.',
        victory: true,
        turn: s.turn,
        title: scoreTitle(s.score),
      };
      return;
    }
  }

  // Eternal mode switches off every loss condition and the century cap.
  if (s.settings.neverEndGame) return;

  if (s.stability <= 2) {
    s.gameOver = {
      reason: 'The state lost its monopoly on force. The government has been swept away.',
      victory: false,
      turn: s.turn,
      title: 'Collapse',
    };
    return;
  }
  // Removal requires a collapsed mandate, a state too weak to protect the
  // incumbent, and no residual legitimacy to fall back on. Before the
  // governance model existed "mandate" was inferred from approval alone, which
  // meant one very bad month at the bottom of a global downturn could remove a
  // government that every institution still recognised. It is now the actual
  // mandate figure, so the three conditions are genuinely independent.
  if (s.approval <= 4 && s.stability < 30 && s.governance.mandate < 35 && s.turn > 24) {
    s.gameOver = {
      reason: 'With no public mandate and no institutional support left, you were removed from office.',
      victory: false,
      turn: s.turn,
      title: 'Forced Out',
    };
    return;
  }
  const debtRatio = s.economy.gdp > 0 ? (s.economy.debt / s.economy.gdp) * 100 : 0;
  if (debtRatio > 320 && s.economy.creditRating < 12) {
    s.gameOver = {
      reason: 'Sovereign default. The country can no longer fund itself in any market.',
      victory: false,
      turn: s.turn,
      title: 'Bankruptcy',
    };
    return;
  }
  if (s.society.population < 100_000) {
    s.gameOver = {
      reason: 'The population has fallen below any viable threshold.',
      victory: false,
      turn: s.turn,
      title: 'Depopulation',
    };
    return;
  }
  if (s.turn >= 1200) {
    s.gameOver = {
      reason: 'A century in office. History will have to judge the rest.',
      victory: true,
      turn: s.turn,
      title: scoreTitle(s.score),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

/**
 * Advances the simulation by one month. Mutates and returns `s` — callers in
 * the store always pass a structural clone, so this stays safe for React.
 */
export function tick(s: GameState): GameState {
  if (s.gameOver) return s;
  // An unresolved event blocks time: the player must decide first.
  if (s.eventQueue.length > 0) return s;

  s.turn += 1;
  s.month += 1;
  if (s.month > 12) {
    s.month = 1;
    s.year += 1;
    s.leader.age += 1;
  }

  normaliseResearch(s);

  const mods = totalModifiers(s);
  const logger = (entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>) => log(s, entry);

  // The world moves first, so the domestic economy reacts to the cycle and to
  // any war that broke out this month rather than to last month's world.
  updateWorld(s, logger);

  advanceResearch(s, mods);
  advanceConstruction(s);
  updateEconomy(s, mods);
  updateFinance(s);
  updateSociety(s, mods);
  updateEnergyAndEnvironment(s, mods);
  updateResources(s);
  updateMilitary(s, mods);
  updateDossiers(s);
  updateDiplomacy(s, mods);
  updateWars(s);
  updateGovernance(s);
  updatePolitics(s, mods);
  updateCrises(s, logger);
  updateAgenda(s, logger);
  updateModifiers(s);
  checkCoup(s, logger);

  rollEvent(s);

  s.score = computeScore(s).total;
  checkAchievements(s);
  updateRecords(s);

  s.history.push({
    turn: s.turn,
    year: s.year,
    month: s.month,
    gdp: s.economy.gdp,
    gdpPerCapita: gdpPerCapita(s),
    population: s.society.population,
    approval: s.approval,
    stability: s.stability,
    treasury: s.economy.treasury,
    debt: s.economy.debt,
    unemployment: s.economy.unemployment,
    inflation: s.economy.inflation,
    happiness: s.society.happiness,
    emissions: s.environment.emissions,
    militaryStrength: s.military.strength,
    score: s.score,
    politicalCapital: s.governance.capital,
    research: s.research.perMonth,
  });
  if (s.history.length > 1400) s.history.splice(0, s.history.length - 1400);

  checkGameOver(s);
  s.updatedAt = Date.now();
  return s;
}

/** Keeps the campaign's best-ever figures for the chronicle. */
function updateRecords(s: GameState): void {
  const r = s.records;
  r.peakGdp = Math.max(r.peakGdp, s.economy.gdp);
  r.peakScore = Math.max(r.peakScore, s.score);
  r.peakApproval = Math.max(r.peakApproval, s.approval);
  r.peakPopulation = Math.max(r.peakPopulation, s.society.population);
  r.lowestCorruption = Math.min(r.lowestCorruption, s.corruption);
  r.warsWon = s.wars.filter((w) => w.resolved === 'victory').length;
  r.warsLost = s.wars.filter((w) => w.resolved === 'defeat').length;
}

/**
 * A military that has been alienated, is influential, and faces a government
 * with no mandate left will eventually act. Disabled in eternal mode along
 * with every other terminal condition.
 */
function checkCoup(s: GameState, logger: (e: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>) => void): void {
  if (s.gameOver || s.turn < 24) return;
  const risk = coupRisk(s);
  if (risk <= 0 || nextRandom(s) > risk) return;

  if (s.settings.neverEndGame) {
    // Eternal mode: the attempt happens and fails, at a real cost.
    s.stability = clamp(s.stability - 18, 0, 100);
    s.approval = clamp(s.approval - 8, 0, 100);
    s.military.morale = clamp(s.military.morale - 20, 0, 100);
    s.governance.mandate = clamp(s.governance.mandate - 15, 0, 100);
    const army = s.factions.find((f) => f.id === 'military');
    if (army) army.satisfaction = clamp(army.satisfaction + 12, 0, 100);
    logger({
      text: 'Elements of the officer corps attempted to seize power overnight. The attempt failed, narrowly.',
      category: 'politics',
      tone: 'critical',
      icon: '🎖️',
    });
    return;
  }

  s.gameOver = {
    reason:
      'The general staff moved against you before dawn. The armed forces had stopped considering the government theirs to obey.',
    victory: false,
    turn: s.turn,
    title: 'Deposed',
  };
  logger({
    text: 'A military coup has removed the government.',
    category: 'politics',
    tone: 'critical',
    icon: '🎖️',
  });
}
