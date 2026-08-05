import type { EnergySource, FactionId, GameState, Modifiers, ResourceId, SectorId } from './types';
import { BUILDING_INDEX } from './data/buildings';
import { POLICY_INDEX } from './data/policies';
import { TECH_INDEX } from './data/technologies';
import {
  DIFFICULTY_INDEX, ERA_INDEX, GOVERNMENT_INDEX, IDEOLOGY_INDEX, TRAIT_INDEX,
} from './data/definitions';
import { ADVISOR_INDEX, ORG_INDEX } from './data/institutions';
import { FACTION_INDEX } from './data/factions';
import { CRISIS_INDEX } from './data/crises';
import { AGENDA_INDEX } from './data/agendas';
import {
  averageRelations,
  clamp,
  debtToGdp,
  energyBalance,
  gdpPerCapita,
  renewableShare,
  totalEnergyProduction,
} from './math';

export {
  averageRelations,
  clamp,
  debtToGdp,
  energyBalance,
  gdpPerCapita,
  renewableShare,
  totalEnergyProduction,
};

/* ------------------------------------------------------------------ */
/* Derived scalars                                                     */
/* ------------------------------------------------------------------ */

/** Human Development Index proxy, 0–100. */
export function hdi(s: GameState): number {
  const income = Math.min(100, (Math.log10(Math.max(200, gdpPerCapita(s))) - 2.3) * 41);
  const lifeExp = Math.min(100, ((s.society.lifeExpectancy - 35) / 50) * 100);
  const edu = (s.society.education + s.society.literacy) / 2;
  return clamp((income + lifeExp + edu) / 3, 0, 100);
}

/* ------------------------------------------------------------------ */
/* Live system modifiers                                               */
/* ------------------------------------------------------------------ */

/**
 * The aggregate modifier bundle produced by interest-group moods.
 *
 * A faction at 50 satisfaction is neutral. Above that it contributes its
 * `pleasedModifiers`, below it its `angeredModifiers`, in both cases scaled by
 * how much influence it actually holds — so annoying a marginal group is
 * survivable and annoying a dominant one is not.
 */
export function factionModifiers(s: GameState): Modifiers {
  const out: Modifiers = {};
  for (const faction of s.factions ?? []) {
    const def = FACTION_INDEX[faction.id as FactionId];
    if (!def) continue;
    // Neutral is 50, and there is a dead band around it: a group two points
    // off centre is not "displeased", it is indifferent. Without the band the
    // system applied a permanent small drag to every country at all times.
    const offset = faction.satisfaction - 50;
    if (Math.abs(offset) < 6) continue;
    const mood = (offset - Math.sign(offset) * 6) / 44;
    const weight = (faction.influence / 100) * 1.5;
    const source = mood >= 0 ? def.pleasedModifiers : def.angeredModifiers;
    const magnitude = Math.abs(mood) * weight;
    for (const [key, value] of Object.entries(source) as [keyof Modifiers, number][]) {
      out[key] = (out[key] ?? 0) + value * magnitude;
    }
  }
  for (const key of Object.keys(out) as (keyof Modifiers)[]) {
    out[key] = Math.round((out[key] ?? 0) * 100) / 100;
  }
  return out;
}

/** The aggregate drag every live crisis is applying, scaled by severity. */
export function crisisModifiers(s: GameState): Modifiers {
  const out: Modifiers = {};
  for (const crisis of s.crises ?? []) {
    const def = CRISIS_INDEX[crisis.defId];
    const stage = def?.stages[crisis.stage];
    if (!stage) continue;
    const weight = clamp(crisis.severity / 100, 0.1, 1);
    for (const [key, value] of Object.entries(stage.modifiers) as [keyof Modifiers, number][]) {
      out[key] = (out[key] ?? 0) + value * weight;
    }
  }
  for (const key of Object.keys(out) as (keyof Modifiers)[]) {
    out[key] = Math.round((out[key] ?? 0) * 100) / 100;
  }
  return out;
}

/** Reference economy size, in $bn, that every listed cost is calibrated against. */
export const COST_REFERENCE_GDP = 1500;

/**
 * Costs in the content files are written for a $1.5T economy. Everything is
 * scaled by this so a stimulus is ~the same share of GDP in Fiji as in the US.
 */
export function costScale(gdpBillions: number): number {
  return Math.max(0.0025, gdpBillions / COST_REFERENCE_GDP);
}

/** Turn index -> { year, month }. */
export function turnToDate(startYear: number, turn: number): { year: number; month: number } {
  return { year: startYear + Math.floor(turn / 12), month: (turn % 12) + 1 };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------ */
/* Modifier aggregation                                                */
/* ------------------------------------------------------------------ */

const MODIFIER_KEYS: (keyof Modifiers)[] = [
  'gdpGrowth', 'taxEfficiency', 'spendingEfficiency', 'inflation', 'unemployment', 'approval',
  'stability', 'corruption', 'research', 'militaryPower', 'diplomacy', 'birthRate', 'migration',
  'health', 'education', 'happiness', 'emissions', 'crime', 'tradeIncome', 'energyOutput',
  'softPower', 'civilLiberties', 'inequality', 'infrastructure', 'intelligence',
];

function addInto(target: Required<Modifiers>, src: Modifiers | undefined): void {
  if (!src) return;
  for (const k of MODIFIER_KEYS) {
    const v = src[k];
    if (typeof v === 'number') target[k] += v;
  }
}

export function emptyModifiers(): Required<Modifiers> {
  const out = {} as Required<Modifiers>;
  for (const k of MODIFIER_KEYS) out[k] = 0;
  return out;
}

export interface ModifierSource {
  label: string;
  icon: string;
  modifiers: Modifiers;
}

/**
 * Everything currently modifying the simulation, itemised. The UI shows this
 * verbatim so a player can always trace why a number is what it is.
 */
export function modifierSources(s: GameState): ModifierSource[] {
  const out: ModifierSource[] = [];

  const gov = GOVERNMENT_INDEX[s.identity.government];
  if (gov) out.push({ label: gov.name, icon: gov.icon, modifiers: gov.modifiers });

  const ideology = IDEOLOGY_INDEX[s.leader.ideology];
  if (ideology) out.push({ label: ideology.name, icon: '🎯', modifiers: ideology.modifiers });

  const era = ERA_INDEX[s.settings.era];
  if (era) out.push({ label: era.name, icon: '🕰️', modifiers: era.modifiers });

  for (const t of s.leader.traits) {
    const trait = TRAIT_INDEX[t];
    if (trait) out.push({ label: trait.name, icon: trait.icon, modifiers: trait.modifiers });
  }

  for (const id of s.activePolicies) {
    const p = POLICY_INDEX[id];
    if (p) out.push({ label: p.name, icon: p.icon, modifiers: p.modifiers });
  }

  for (const id of s.research.completed) {
    const t = TECH_INDEX[id];
    if (t) out.push({ label: t.name, icon: t.icon, modifiers: t.modifiers });
  }

  for (const [id, count] of Object.entries(s.buildings)) {
    const b = BUILDING_INDEX[id];
    if (!b || count <= 0) continue;
    const scaled: Modifiers = {};
    for (const k of MODIFIER_KEYS) {
      const v = b.modifiers[k];
      if (typeof v === 'number') scaled[k] = v * count;
    }
    out.push({ label: count > 1 ? `${b.name} ×${count}` : b.name, icon: b.icon, modifiers: scaled });
  }

  for (const id of s.advisors) {
    const a = ADVISOR_INDEX[id];
    if (a) out.push({ label: `${a.name} (${a.role})`, icon: a.icon, modifiers: a.modifiers });
  }

  for (const id of s.orgs) {
    const o = ORG_INDEX[id];
    if (o) out.push({ label: o.name, icon: o.icon, modifiers: o.modifiers });
  }

  for (const m of s.activeModifiers) {
    out.push({ label: m.label, icon: m.icon ?? '⏳', modifiers: m.modifiers });
  }

  // Live systems. These are computed rather than stored, so they always
  // describe the state as it is right now.
  const factions = factionModifiers(s);
  if (Object.keys(factions).length > 0) {
    out.push({ label: 'Interest groups', icon: '⚖️', modifiers: factions });
  }

  for (const crisis of s.crises) {
    const def = CRISIS_INDEX[crisis.defId];
    const stage = def?.stages[crisis.stage];
    if (!def || !stage) continue;
    const weight = clamp(crisis.severity / 100, 0.1, 1);
    const scaled: Modifiers = {};
    for (const [key, value] of Object.entries(stage.modifiers) as [keyof Modifiers, number][]) {
      scaled[key] = Math.round(value * weight * 100) / 100;
    }
    out.push({ label: `${def.name} — ${stage.label}`, icon: def.icon, modifiers: scaled });
  }

  if (s.agenda) {
    const def = AGENDA_INDEX[s.agenda.defId];
    if (def && Object.keys(def.duringModifiers).length > 0) {
      out.push({ label: `${def.name} (in progress)`, icon: def.icon, modifiers: def.duringModifiers });
    }
  }

  return out;
}

/** Sum of every active modifier in the game. */
export function totalModifiers(s: GameState): Required<Modifiers> {
  const total = emptyModifiers();
  for (const src of modifierSources(s)) addInto(total, src.modifiers);
  return total;
}

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

/**
 * Recommended monthly spend per department, in millions USD.
 *
 * Calibrated so that funding every department at level 1.0 costs ~19% of GDP,
 * against ~20% of GDP in revenue at the default tax rates and clean collection.
 * A new campaign therefore starts close to balance: deficits are a consequence
 * of the player's choices, not of the defaults.
 */
export function baselineDeptSpend(s: GameState): Record<string, number> {
  const gdpMonthly = (s.economy.gdp * 1000) / 12; // millions USD/month
  return {
    healthcare: gdpMonthly * 0.042,
    education: gdpMonthly * 0.031,
    military: gdpMonthly * 0.013,
    infrastructure: gdpMonthly * 0.02,
    welfare: gdpMonthly * 0.048,
    research: gdpMonthly * 0.012,
    police: gdpMonthly * 0.0095,
    environment: gdpMonthly * 0.0065,
    culture: gdpMonthly * 0.0045,
    intelligence: gdpMonthly * 0.0035,
  };
}

/**
 * Two-way trade with every partner that can still reach you.
 *
 * Sanctions cut both ways: a nation you have sanctioned and a nation
 * sanctioning you both stop trading, which is why an isolated country's trade
 * revenue collapses whichever direction the isolation came from.
 */
export function activeTradeVolume(s: GameState): number {
  return s.nations.reduce(
    (sum, n) => (n.atWarWithPlayer || n.sanctioned || n.sanctioningPlayer ? sum : sum + n.tradeVolume),
    0,
  );
}

export interface BudgetBreakdown {
  revenue: {
    income: number;
    corporate: number;
    vat: number;
    capitalGains: number;
    tariff: number;
    wealth: number;
    carbon: number;
    property: number;
    /** Net receipts from selling resource surpluses. Never negative. */
    resources: number;
    trade: number;
    total: number;
  };
  expenditure: {
    departments: Record<string, number>;
    departmentTotal: number;
    policies: number;
    buildingUpkeep: number;
    advisors: number;
    orgDues: number;
    debtInterest: number;
    war: number;
    /** Cost of importing resources the country does not produce enough of. */
    resourceImports: number;
    total: number;
  };
  net: number;
}

/**
 * The full monthly budget, in millions USD. This is the single source of truth
 * used by both the engine and the treasury panel — they cannot diverge.
 */
export function computeBudget(s: GameState): BudgetBreakdown {
  const mods = totalModifiers(s);
  const gdpMonthly = (s.economy.gdp * 1000) / 12;

  // Corruption and administrative quality gate how much of the headline rate
  // actually reaches the treasury — and so does difficulty, because a harder
  // campaign should mean a harder state to run, not just noisier headlines.
  const difficultyCollection = 0.75 + DIFFICULTY_INDEX[s.settings.difficulty].economyMultiplier * 0.25;
  const collection = clamp(
    (1 + mods.taxEfficiency / 100) *
      (1 - s.corruption / 260) *
      (0.55 + s.stability / 220) *
      difficultyCollection,
    0.12,
    1.5,
  );

  const t = s.taxes;
  // A resource deficit is an import bill, not negative tax revenue.
  const resourceNet = resourceExportIncome(s);
  const revenue = {
    income: gdpMonthly * 0.52 * (t.income / 100) * collection,
    corporate: gdpMonthly * 0.21 * (t.corporate / 100) * collection,
    vat: gdpMonthly * 0.6 * (t.vat / 100) * collection * 0.55,
    capitalGains: gdpMonthly * 0.06 * (t.capitalGains / 100) * collection,
    // Tariffs are levied on the import half of trade, not on the balance.
    tariff: activeTradeVolume(s) * 0.5 * (t.tariff / 100) * collection,
    wealth: gdpMonthly * 0.9 * (t.wealth / 100) * collection * 0.14,
    carbon: (s.environment.emissions / 12) * (t.carbon / 100) * 3.2 * collection,
    property: gdpMonthly * 0.3 * (t.property / 100) * collection,
    resources: Math.max(0, resourceNet),
    trade: Math.max(0, s.economy.tradeBalance) * Math.max(0, 1 + mods.tradeIncome / 100),
    total: 0,
  };
  revenue.total =
    revenue.income + revenue.corporate + revenue.vat + revenue.capitalGains + revenue.tariff +
    revenue.wealth + revenue.carbon + revenue.property + revenue.resources + revenue.trade;

  const baseline = baselineDeptSpend(s);
  const departments: Record<string, number> = {};
  let departmentTotal = 0;
  for (const [dept, line] of Object.entries(s.budget)) {
    const amount = baseline[dept] * line.level;
    departments[dept] = amount;
    departmentTotal += amount;
  }

  const scale = costScale(s.economy.gdp);

  let policies = 0;
  for (const id of s.activePolicies) {
    const p = POLICY_INDEX[id];
    if (p) policies += p.monthlyCost * scale;
  }

  let buildingUpkeep = 0;
  for (const [id, count] of Object.entries(s.buildings)) {
    const b = BUILDING_INDEX[id];
    if (b) buildingUpkeep += b.upkeep * count * scale;
  }

  let advisors = 0;
  for (const id of s.advisors) advisors += (ADVISOR_INDEX[id]?.salary ?? 0) * scale;

  let orgDues = 0;
  for (const id of s.orgs) orgDues += (ORG_INDEX[id]?.monthlyDues ?? 0) * scale;

  // Interest scales with the rating: worse credit, dearer money. The spread
  // tops out at 4pp so a downgrade hurts without being instantly terminal.
  const spread = (100 - s.economy.creditRating) / 100;
  const effectiveRate = (s.economy.interestRate + spread * 4) / 100;
  const debtInterest = Math.max(0, (s.economy.debt * 1000 * effectiveRate) / 12);

  let war = 0;
  for (const w of s.wars) if (!w.resolved) war += w.monthlyCost;

  const resourceImports = Math.max(0, -resourceNet);

  const efficiency = clamp(1 - mods.spendingEfficiency / 100, 0.55, 1.6);
  const expenditureTotal =
    Math.max(0, departmentTotal + policies + buildingUpkeep) * efficiency +
    Math.max(0, advisors) +
    Math.max(0, orgDues) +
    debtInterest +
    war +
    resourceImports;

  return {
    revenue,
    expenditure: {
      departments,
      departmentTotal,
      policies,
      buildingUpkeep,
      advisors,
      orgDues,
      debtInterest,
      war,
      resourceImports,
      total: expenditureTotal,
    },
    net: revenue.total - expenditureTotal,
  };
}

/**
 * Units a live agreement adds to (import) or removes from (export) the supply
 * of one commodity each month.
 */
export function agreementFlow(s: GameState, resource: ResourceId): number {
  let flow = 0;
  for (const agreement of s.tradeAgreements) {
    if (agreement.suspended || agreement.resource !== resource) continue;
    flow += agreement.direction === 'import' ? agreement.quantity : -agreement.quantity;
  }
  return flow;
}

/**
 * Net monthly cash flow from contracted trade, in millions USD. Positive means
 * the contracts earn; negative means they cost.
 */
export function tradeAgreementBalance(s: GameState): number {
  let total = 0;
  for (const agreement of s.tradeAgreements) {
    if (agreement.suspended) continue;
    const value = agreement.quantity * agreement.lockedPrice * 0.85;
    total += agreement.direction === 'export' ? value : -value;
  }
  return total;
}

/**
 * Net monthly income from commodities, millions USD.
 *
 * Contracts settle at the price locked when they were signed; only whatever is
 * left over after them touches the spot market. That is the whole point of an
 * agreement — it takes that volume out of the world price entirely.
 */
export function resourceExportIncome(s: GameState): number {
  let total = tradeAgreementBalance(s);

  for (const [id, holding] of Object.entries(s.resources)) {
    const key = id as ResourceId;
    // Contracted volume is already paid for above; the residual clears at spot.
    const residual = holding.production + agreementFlow(s, key) - holding.consumption;
    total += residual * (s.worldPrices[key] ?? 1) * 0.85;
  }

  return total;
}

/* ------------------------------------------------------------------ */
/* Sector helpers                                                      */
/* ------------------------------------------------------------------ */

export const SECTOR_LABELS: Record<SectorId, string> = {
  agriculture: 'Agriculture',
  industry: 'Industry',
  services: 'Services',
  technology: 'Technology',
  energy: 'Energy',
  tourism: 'Tourism',
  finance: 'Finance',
};

export const SECTOR_COLORS: Record<SectorId, string> = {
  agriculture: '#7ee787',
  industry: '#ffb648',
  services: '#4f8cff',
  technology: '#9d6bff',
  energy: '#ff5c6c',
  tourism: '#3ddbd9',
  finance: '#f5d073',
};

export const ENERGY_LABELS: Record<EnergySource, string> = {
  coal: 'Coal',
  gas: 'Natural Gas',
  oil: 'Oil',
  nuclear: 'Nuclear',
  hydro: 'Hydro',
  solar: 'Solar',
  wind: 'Wind',
  other: 'Other',
};

export const ENERGY_COLORS: Record<EnergySource, string> = {
  coal: '#6b7280',
  gas: '#ffb648',
  oil: '#8b5a2b',
  nuclear: '#3ddbd9',
  hydro: '#4f8cff',
  solar: '#f5d073',
  wind: '#7ee787',
  other: '#9d6bff',
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * Re-exported from `format` so the ~60 existing call sites keep working while
 * the formatting layer — the only part of the game with a display preference
 * behind it — lives in one place of its own.
 */
export {
  formatBillions,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPopulation,
  formatSigned,
} from './format';
