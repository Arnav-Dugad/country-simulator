import type { FactionId, FactionState, GameState, LogEntry, Policy } from '../types';
import { FACTIONS } from '../data/factions';
import { GOVERNMENT_INDEX } from '../data/definitions';
import { clamp, debtToGdp, gdpPerCapita } from '../selectors';
import { explainCapitalIncome, explainLegislativeSupport, explainMandate } from './explain';
import { coalitionDiscount, isPartner, updateCoalition } from './coalition';

export { factionModifiers } from '../selectors';

type Logger = (entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>) => void;

/* ------------------------------------------------------------------ */
/* Political capital                                                   */
/* ------------------------------------------------------------------ */

/**
 * How much political capital this government banks, at most.
 *
 * An autocracy can hoard authority; a coalition government spends it as fast
 * as it earns it. The cap is what stops a player idling for ten years and then
 * ramming through the entire policy list in one month.
 */
export function capitalCapacity(s: GameState): number {
  const gov = GOVERNMENT_INDEX[s.identity.government];
  const base = gov?.holdsElections ? 100 : 140;
  return clamp(base + s.governance.mandate * 0.5 + s.termsServed * 6, 60, 260);
}

/**
 * Monthly political capital income.
 *
 * Approval is the engine of it, but a legislature that will not vote with you
 * and a public that does not believe you have a mandate both throttle it —
 * which is why a popular leader with a hostile parliament still cannot govern.
 */
export function capitalIncome(s: GameState): number {
  // Itemised in `explainCapitalIncome`, which the politics panel renders
  // verbatim — the breakdown the player reads is this calculation.
  return explainCapitalIncome(s).target;
}

/** Spends political capital, returning false when there is not enough. */
export function spendCapital(s: GameState, amount: number): boolean {
  if (amount <= 0) return true;
  if (s.governance.capital < amount) return false;
  s.governance.capital -= amount;
  return true;
}

/** Adds capital, respecting the cap. */
export function addCapital(s: GameState, amount: number): void {
  s.governance.capital = clamp(s.governance.capital + amount, 0, capitalCapacity(s));
}

/* ------------------------------------------------------------------ */
/* Legislation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Political capital a policy costs before friction.
 *
 * Stated explicitly on the big constitutional items; otherwise derived from
 * how much the policy actually changes, so a sweeping reform is expensive and
 * a technical adjustment is cheap without anyone having to hand-tune 62 numbers.
 */
export function basePoliticalCost(policy: Policy): number {
  if (typeof policy.politicalCost === 'number') return policy.politicalCost;
  const reach = Object.values(policy.modifiers).reduce(
    (sum, v) => sum + Math.abs(typeof v === 'number' ? v : 0),
    0,
  );
  return clamp(4 + reach * 0.28, 4, 42);
}

export interface LegislativeAssessment {
  /** Capital actually required, after friction and faction opposition. */
  cost: number;
  /** Share of the legislature expected to vote for it, 0–100. */
  support: number;
  /** True when the legislature would block it outright. */
  blocked: boolean;
  /** Human-readable explanation of the number. */
  note: string;
}

/**
 * What it would take to get a policy through.
 *
 * Governments that hold elections have to carry a legislature; the ones that
 * do not still have to carry the factions who staff the state. Either way the
 * bill is paid in political capital rather than money.
 */
export function assessLegislation(s: GameState, policy: Policy): LegislativeAssessment {
  const gov = GOVERNMENT_INDEX[s.identity.government];
  const base = basePoliticalCost(policy);

  // Parties that dislike the policy make it dearer; allies make it cheaper.
  // A coalition partner votes for the government's programme whether or not
  // it is their programme — that is what they signed up to.
  let partyLean = 0;
  const totalSupport = s.parties.reduce((sum, p) => sum + p.support, 0) || 100;
  for (const party of s.parties) {
    const appeal = policy.ideologyAppeal?.[party.ideology] ?? 0;
    const weight = party.support / totalSupport;
    const loyalty = isPartner(s, party.id) ? 24 : 0;
    partyLean += weight * (appeal * 1.6 + party.relation * 0.22 + loyalty);
  }

  // Factions apply pressure whether or not there is a parliament.
  let factionLean = 0;
  for (const faction of s.factions) {
    const appeal = policy.factionAppeal?.[faction.id] ?? 0;
    factionLean += (appeal * faction.influence) / 100;
  }

  const support = clamp(
    s.governance.legislativeSupport + partyLean * 0.5 + factionLean * 0.8,
    0,
    100,
  );

  // Below a majority you are buying votes; above it you are being carried.
  const friction = gov?.holdsElections
    ? clamp(1.9 - support / 60, 0.35, 2.4)
    : clamp(1.5 - support / 90, 0.4, 1.7);

  // A government with a working coalition is not buying votes any more.
  const discount = coalitionDiscount(s);
  const cost = Math.round(clamp(base * friction * discount, 2, 160));
  // Nothing is unpassable outright — but at very low support the price is the
  // point. A hard block only happens when the house is actively against you.
  const blocked = gov?.holdsElections === true && support < 12;

  const coalitionNote =
    discount < 0.99 ? ` The coalition takes ${((1 - discount) * 100).toFixed(0)}% off the price.` : '';

  const note = blocked
    ? `The house will not hear it: only ${support.toFixed(0)}% would vote for it.`
    : support >= 60
      ? `Comfortable majority — ${support.toFixed(0)}% behind it.${coalitionNote}`
      : support >= 35
        ? `Passable, but it will take work: ${support.toFixed(0)}% support.${coalitionNote}`
        : `You would be forcing this through on ${support.toFixed(0)}% support.${coalitionNote}`;

  return { cost, support, blocked, note };
}

/* ------------------------------------------------------------------ */
/* Factions                                                            */
/* ------------------------------------------------------------------ */

/** Fresh faction state for a new campaign, weighted by the country's shape. */
export function initialFactions(s: {
  identity: GameState['identity'];
  military: { strength: number };
  economy: { gdp: number; inequality: number };
  society: { education: number; civilLiberties: number };
  corruption: number;
}): FactionState[] {
  const gov = s.identity.government;
  const militarised = gov === 'military-junta' ? 34 : gov === 'single-party' ? 22 : 16;
  const clerical = gov === 'theocracy' ? 32 : gov === 'absolute-monarchy' ? 22 : 13;
  const academic = gov === 'technocracy' ? 28 : gov === 'democracy' ? 20 : 13;

  const raw: Record<FactionId, number> = {
    business: gov === 'corporate-state' ? 34 : 20,
    labour: gov === 'anarcho-syndicalist' ? 34 : 18,
    military: militarised,
    clergy: clerical,
    intelligentsia: academic,
    regions: gov === 'federal-republic' ? 26 : 16,
  };
  const total = Object.values(raw).reduce((a, b) => a + b, 0);

  return FACTIONS.map((f) => ({
    id: f.id,
    satisfaction: 55,
    influence: (raw[f.id] / total) * 100,
  }));
}

/**
 * What would make each faction happy, evaluated against the live state.
 *
 * Every term here is a real number the player can see somewhere else in the
 * game, so a dissatisfied faction is always traceable to a decision.
 *
 * Calibration matters more here than anywhere else in the system. Each base is
 * set so that an *averagely governed* country — departments near 1.0, default
 * tax rates, middling corruption — lands its factions around 52–58 rather than
 * in the hostile band. A first pass keyed the bases too low, which meant every
 * country on earth began quietly alienating half its establishment before the
 * player had done anything at all, and passive campaigns collapsed that had
 * previously survived a century.
 */
export function factionTargets(s: GameState): Record<FactionId, number> {
  const perCapita = gdpPerCapita(s);
  const dev = clamp(Math.log10(Math.max(300, perCapita)), 2.5, 5.2);
  const avgUnrest = s.provinces.reduce((sum, p) => sum + p.unrest, 0) / Math.max(1, s.provinces.length);
  const avgAutonomy = s.provinces.reduce((sum, p) => sum + p.autonomy, 0) / Math.max(1, s.provinces.length);
  const losingWars = s.wars.filter((w) => !w.resolved && w.warScore < -20).length;

  return {
    business: clamp(
      60 -
        (s.taxes.corporate - 22) * 0.9 -
        (s.taxes.capitalGains - 18) * 0.5 -
        s.taxes.wealth * 2.2 -
        Math.max(0, s.economy.inflation - 4) * 1.3 -
        Math.max(0, s.taxes.tariff - 6) * 0.4 +
        (s.economy.growth - 2) * 2.2 +
        (s.economy.confidence - 50) * 0.16 -
        Math.max(0, s.corruption - 30) * 0.2,
      0,
      100,
    ),
    labour: clamp(
      50 +
        (s.budget.welfare.level - 1) * 22 +
        s.taxes.wealth * 1.8 +
        Math.max(0, 55 - s.economy.inequality) * 0.4 -
        Math.max(0, s.economy.unemployment - 6) * 2.2 -
        Math.max(0, s.economy.inflation - 4) * 1.5 +
        (s.society.happiness - 50) * 0.18,
      0,
      100,
    ),
    // Keyed to the posture the forces can actually sustain rather than to the
    // slider alone: a small country that funds its army honestly at 0.7 is not
    // insulting it, and treating that as a grievance made every modest state
    // start with a resentful officer corps.
    military: clamp(
      50 +
        (s.budget.military.level - 1) * 18 +
        (s.military.strength - 45) * 0.18 +
        (s.military.readiness - 50) * 0.1 -
        losingWars * 20 +
        (s.military.nuclearProgrammeActive ? 5 : 0),
      0,
      100,
    ),
    clergy: clamp(
      55 -
        (s.society.civilLiberties - 50) * 0.2 +
        (s.society.birthRate - 14) * 0.8 -
        Math.max(0, s.society.crime - 35) * 0.25 +
        (s.stability - 50) * 0.18 -
        Math.max(0, s.society.netMigration) * 0.7,
      0,
      100,
    ),
    // Corruption is what this group cares about most, but the coefficient is
    // applied above an average baseline rather than to the raw figure, so a
    // normally-corrupt country is not treated as an outrage.
    intelligentsia: clamp(
      52 +
        (s.budget.research.level - 1) * 18 +
        (s.budget.education.level - 1) * 15 +
        (s.society.civilLiberties - 50) * 0.28 -
        Math.max(0, s.corruption - 32) * 0.34 +
        (dev - 3.5) * 4,
      0,
      100,
    ),
    regions: clamp(
      54 +
        (s.budget.infrastructure.level - 1) * 20 +
        avgAutonomy * 0.12 -
        Math.max(0, avgUnrest - 25) * 0.4 +
        (s.infrastructure - 50) * 0.18 -
        s.provinces.filter((p) => p.martialLaw).length * 8,
      0,
      100,
    ),
  };
}

/** Applies a one-off satisfaction change to a set of factions. */
export function nudgeFactions(
  s: GameState,
  appeal: Partial<Record<FactionId, number>> | undefined,
  scale = 1,
): void {
  if (!appeal) return;
  for (const faction of s.factions) {
    const delta = appeal[faction.id];
    if (typeof delta === 'number' && delta !== 0) {
      faction.satisfaction = clamp(faction.satisfaction + delta * scale, 0, 100);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Monthly update                                                      */
/* ------------------------------------------------------------------ */

/**
 * Advances governance: capital, mandate, legislative support and factions.
 *
 * Called from `tick` before the political block so approval and stability can
 * respond to a legislature that has stopped cooperating in the same month.
 */
export function updateGovernance(s: GameState, log?: Logger): void {
  // Coalitions move first: a partner who walks out this month has to be felt
  // in this month's arithmetic, not next month's.
  updateCoalition(s, log ?? (() => {}));

  /* --- Mandate: how legitimate the government is considered to be ------- */
  s.governance.mandate += (explainMandate(s).target - s.governance.mandate) * 0.09;

  /* --- Legislative support ---------------------------------------------- */
  s.governance.legislativeSupport +=
    (explainLegislativeSupport(s).target - s.governance.legislativeSupport) * 0.14;

  /* --- Momentum decays toward nothing ------------------------------------ */
  s.governance.momentum *= 0.94;
  if (Math.abs(s.governance.momentum) < 0.05) s.governance.momentum = 0;

  /* --- Capital ------------------------------------------------------------ */
  s.governance.capitalCap = capitalCapacity(s);
  s.governance.capitalPerMonth = capitalIncome(s);
  s.governance.capital = clamp(
    s.governance.capital + s.governance.capitalPerMonth,
    0,
    s.governance.capitalCap,
  );

  /* --- Factions ----------------------------------------------------------- */
  const targets = factionTargets(s);
  for (const faction of s.factions) {
    const target = targets[faction.id];
    if (typeof target === 'number') {
      faction.satisfaction = clamp(faction.satisfaction + (target - faction.satisfaction) * 0.08, 0, 100);
    }
  }

  // Influence drifts toward the structure of the economy and the state, so a
  // country that industrialises really does shift power toward business.
  const debtPressure = clamp(debtToGdp(s) / 200, 0, 1);
  const influenceTargets: Record<FactionId, number> = {
    business: 14 + s.economy.sectors.finance * 46 + s.economy.sectors.industry * 26 + debtPressure * 8,
    labour: 12 + s.economy.sectors.industry * 32 + s.economy.sectors.services * 16,
    military: 10 + s.budget.military.level * 9 + s.wars.filter((w) => !w.resolved).length * 8,
    clergy: 8 + (100 - s.society.education) * 0.14 + (s.society.birthRate - 10) * 0.35,
    intelligentsia: 8 + s.society.education * 0.16 + s.budget.research.level * 6,
    regions: 10 + s.provinces.reduce((sum, p) => sum + p.autonomy, 0) / Math.max(1, s.provinces.length) * 0.18,
  };
  const influenceTotal = Object.values(influenceTargets).reduce((a, b) => a + b, 0) || 1;
  for (const faction of s.factions) {
    const target = ((influenceTargets[faction.id] ?? 0) / influenceTotal) * 100;
    faction.influence = clamp(faction.influence + (target - faction.influence) * 0.03, 1, 60);
  }
  // Keep the shares honest so the UI can present them as a distribution.
  const influenceSum = s.factions.reduce((sum, f) => sum + f.influence, 0);
  if (influenceSum > 0) {
    for (const faction of s.factions) faction.influence = (faction.influence / influenceSum) * 100;
  }
}

/** Factions currently hostile enough to be actively working against you. */
export function hostileFactions(s: GameState): FactionState[] {
  return s.factions.filter((f) => f.satisfaction < 30).sort((a, b) => a.satisfaction - b.satisfaction);
}

/**
 * Chance per month that the armed forces move against the government.
 *
 * Deliberately hard to trigger. A coup is one of the few things that can end a
 * campaign the player never chose to risk, so it requires all three conditions
 * to hold at once: an officer corps that is genuinely alienated rather than
 * merely unhappy, real influence behind it, and a government that has lost its
 * mandate. Any one of those on its own returns zero.
 */
export function coupRisk(s: GameState): number {
  const army = s.factions.find((f) => f.id === 'military');
  if (!army) return 0;
  if (army.satisfaction >= 25) return 0;
  if (army.influence < 14) return 0;
  if (s.governance.mandate >= 40) return 0;

  const anger = (25 - army.satisfaction) / 25;
  const weight = clamp((army.influence - 14) / 26, 0, 1);
  const weakness = (40 - s.governance.mandate) / 40;
  const restraint = clamp(s.stability / 90, 0, 1);
  return clamp(anger * weight * weakness * 0.02 * (1 - restraint), 0, 0.02);
}
