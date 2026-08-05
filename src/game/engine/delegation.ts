import type { EventChoice, EventEffects, EventSeverity, GameState } from '../types';
import { EVENT_INDEX } from '../data/events';
import { clamp, costScale } from '../selectors';
import { resolveEvent } from './events';

/**
 * Delegating decisions to the cabinet.
 *
 * A pop-up that stops the game dead is the right presentation for a once-a-
 * decade constitutional crisis and the wrong one for the ninth routine customs
 * dispute of the year. A player who wants to run a country rather than clear an
 * inbox can hand the routine ones — or all of them — to their ministers.
 *
 * The scoring below is what makes that safe, and it works by *projection*
 * rather than by weighting effect keys: each option is applied to a cheap
 * model of the country's vitals, and the resulting state is valued as a whole.
 *
 * That distinction is the entire difference between a usable feature and a
 * trap. A first version scored the raw deltas — so many points per point of
 * approval, so many per million spent — and it delegated its way to a 30%
 * survival rate against 93% for blindly always taking the first option. The
 * reason is that this simulation punishes *levels*, not changes: a credit
 * rating of 44 opens a banking crisis, inflation of 13 opens a wage spiral,
 * 160% debt with a weak rating opens a debt crisis, and each of those then
 * compounds for years. A delta-scorer cannot see a cliff edge; it only sees
 * that the step toward it was small. Projecting the state and pricing the
 * distance to every cliff is what a competent minister is actually doing.
 */

/** Severities the "routine matters" setting will handle without asking. */
const ROUTINE: ReadonlySet<EventSeverity> = new Set<EventSeverity>(['trivial', 'minor']);

/* ------------------------------------------------------------------ */
/* A cheap model of the country                                        */
/* ------------------------------------------------------------------ */

/**
 * Everything an event can touch that matters to the valuation.
 *
 * Deliberately a flat record rather than a cloned `GameState`: projection runs
 * three or four times per decision and a full structural clone of a campaign
 * with fifty nations and a decade of history would be absurd for the purpose.
 */
interface Vitals {
  approval: number;
  stability: number;
  corruption: number;
  mandate: number;
  infrastructure: number;
  treasury: number;
  debt: number;
  gdp: number;
  creditRating: number;
  unemployment: number;
  inflation: number;
  inequality: number;
  happiness: number;
  health: number;
  education: number;
  crime: number;
  civilLiberties: number;
  softPower: number;
  militaryStrength: number;
  emissions: number;
  population: number;
  relations: number;
  atWar: boolean;
}

function vitalsOf(s: GameState): Vitals {
  return {
    approval: s.approval,
    stability: s.stability,
    corruption: s.corruption,
    mandate: s.governance.mandate,
    infrastructure: s.infrastructure,
    treasury: s.economy.treasury,
    debt: s.economy.debt,
    gdp: s.economy.gdp,
    creditRating: s.economy.creditRating,
    unemployment: s.economy.unemployment,
    inflation: s.economy.inflation,
    inequality: s.economy.inequality,
    happiness: s.society.happiness,
    health: s.society.health,
    education: s.society.education,
    crime: s.society.crime,
    civilLiberties: s.society.civilLiberties,
    softPower: s.society.softPower,
    militaryStrength: s.military.strength,
    emissions: s.environment.emissions,
    population: s.society.population,
    relations: s.nations.length
      ? s.nations.reduce((sum, n) => sum + n.relations, 0) / s.nations.length
      : 0,
    atWar: s.wars.some((w) => !w.resolved),
  };
}

/**
 * Applies an effects block to the projection, mirroring `applyEventEffects`.
 *
 * Every line here has a counterpart in the real function, including the
 * population scaling and the clamps — a projection that disagreed with the
 * engine about what a choice does would be worse than no projection at all.
 */
function applyProjected(v: Vitals, e: EventEffects, scale: number): void {
  if (e.treasury) spend(v, -e.treasury * scale);
  if (e.approval) v.approval = clamp(v.approval + e.approval, 0, 100);
  if (e.stability) v.stability = clamp(v.stability + e.stability, 0, 100);
  if (e.gdpShock) v.gdp = Math.max(0.5, v.gdp * (1 + e.gdpShock / 100));
  if (e.population) {
    const scaled = e.population * clamp(v.population / 1e8, 0.02, 6);
    const capped = clamp(scaled, -v.population * 0.1, v.population * 0.1);
    v.population = Math.max(1000, v.population + capped);
  }
  if (e.inflation) v.inflation = clamp(v.inflation + e.inflation, -8, 200);
  if (e.unemployment) v.unemployment = clamp(v.unemployment + e.unemployment, 0.4, 70);
  if (e.corruption) v.corruption = clamp(v.corruption + e.corruption, 0, 100);
  if (e.militaryStrength) v.militaryStrength = clamp(v.militaryStrength + e.militaryStrength, 0, 100);
  if (e.health) v.health = clamp(v.health + e.health, 0, 100);
  if (e.education) v.education = clamp(v.education + e.education, 0, 100);
  if (e.happiness) v.happiness = clamp(v.happiness + e.happiness, 0, 100);
  if (e.crime) v.crime = clamp(v.crime + e.crime, 0, 100);
  if (e.emissions) v.emissions = Math.max(0, v.emissions * (1 + e.emissions / 100));
  if (e.softPower) v.softPower = clamp(v.softPower + e.softPower, 0, 100);
  if (e.civilLiberties) v.civilLiberties = clamp(v.civilLiberties + e.civilLiberties, 0, 100);
  if (e.infrastructure) v.infrastructure = clamp(v.infrastructure + e.infrastructure, 0, 100);
  if (e.inequality) v.inequality = clamp(v.inequality + e.inequality, 5, 95);
  if (e.globalRelations) v.relations = clamp(v.relations + e.globalRelations, -100, 100);
  if (e.relations) {
    // Averaged, since the projection tracks the mean rather than each nation.
    v.relations = clamp(v.relations + e.relations.reduce((sum, r) => sum + r.amount, 0) / 8, -100, 100);
  }
}

/** Mirrors `spendTreasury`: a shortfall becomes debt, not a negative balance. */
function spend(v: Vitals, millions: number): void {
  if (millions <= 0) {
    v.treasury -= millions;
    return;
  }
  const fromCash = Math.min(v.treasury, millions);
  v.treasury -= fromCash;
  const shortfall = millions - fromCash;
  if (shortfall <= 0) return;
  v.debt += shortfall / 1000;
  v.creditRating = clamp(v.creditRating - (shortfall / (v.gdp * 1000 + 1)) * 22, 1, 100);
}

/* ------------------------------------------------------------------ */
/* Valuing a projected country                                         */
/* ------------------------------------------------------------------ */

/**
 * Penalty that grows as a value falls below a threshold, and is zero above it.
 *
 * Squared, so it is negligible at a comfortable distance and overwhelming at
 * the edge. That shape is the whole mechanism: it makes the cabinet spend
 * whatever it takes to stay off a cliff and ignore the same cliff entirely
 * when the country is nowhere near it.
 */
function below(value: number, threshold: number, weight: number): number {
  if (value >= threshold) return 0;
  const depth = (threshold - value) / Math.max(1, threshold);
  return depth * depth * weight;
}

/** The same, for values that are dangerous when they get too high. */
function above(value: number, threshold: number, weight: number): number {
  if (value <= threshold) return 0;
  const excess = (value - threshold) / Math.max(1, threshold);
  return Math.min(4, excess * excess) * weight;
}

/**
 * How well this country is doing, as a single number.
 *
 * Two halves. The first is ordinary quality of government, which is broadly
 * linear. The second is the distance to every edge the simulation can push a
 * campaign over — the loss conditions, and the thresholds at which each crisis
 * definition becomes eligible. The second half dominates near a cliff and
 * disappears away from one, which is exactly the judgement being modelled.
 */
function stateValue(v: Vitals): number {
  const debtRatio = v.gdp > 0 ? (v.debt / v.gdp) * 100 : 0;
  const gdpMonthly = (v.gdp * 1000) / 12;

  const quality =
    v.approval * 1.2 +
    v.stability * 1.6 +
    v.happiness * 0.7 +
    v.health * 0.5 +
    v.education * 0.5 +
    v.infrastructure * 0.45 +
    v.civilLiberties * 0.3 +
    v.softPower * 0.22 +
    v.militaryStrength * (v.atWar ? 0.9 : 0.3) +
    v.creditRating * 0.55 +
    v.mandate * 0.5 +
    v.relations * 0.25 -
    v.corruption * 0.9 -
    v.crime * 0.4 -
    v.inequality * 0.35 -
    v.unemployment * 1.4 -
    Math.max(0, v.inflation - 2) * 1.8 +
    // Output matters, but on a log scale: doubling GDP is a real gain and not
    // an infinite one, and this keeps the term comparable across countries.
    Math.log10(Math.max(1, v.gdp)) * 26 +
    // Cash is worth having, sharply so when there is none.
    clamp(v.treasury / Math.max(1, gdpMonthly), -2, 4) * 6 -
    debtRatio * 0.12;

  // Every cliff in the simulation, priced by how close this state is to it.
  const danger =
    // Loss conditions.
    below(v.stability, 46, 420) +
    below(v.approval, 30, 260) +
    above(debtRatio, 110, 340) +
    below(v.creditRating, 40, 260) +
    below(v.mandate, 40, 120) +
    // Crisis triggers — each of these opens a condition that then escalates
    // on a timer and costs far more than any single decision.
    below(v.creditRating, 45, 150) + // banking crisis
    above(v.inflation, 9, 260) + // inflation spiral
    above(debtRatio, 150, 220) + // debt crisis
    below(v.health, 58, 120) + // epidemic
    above(v.corruption, 52, 140) + // corruption scandal
    above(v.unemployment, 9, 170) +
    below(v.happiness, 30, 90);

  return quality - danger;
}

/* ------------------------------------------------------------------ */
/* Scoring a choice                                                    */
/* ------------------------------------------------------------------ */

/** The projected state after taking a choice, on its success branch or its failure branch. */
function project(s: GameState, choice: EventChoice, effects: EventEffects): Vitals {
  const scale = costScale(s.economy.gdp);
  const v = vitalsOf(s);
  if (choice.cost) spend(v, choice.cost * scale);
  applyProjected(v, effects, scale);
  return v;
}

/**
 * How much better or worse this choice leaves the country.
 *
 * The value of a gamble is its expected value with an extra aversion to the
 * downside — a minister does not flip a coin on the country because the mean
 * happens to be positive.
 */
export function scoreChoice(s: GameState, choice: EventChoice): number {
  const before = stateValue(vitalsOf(s));
  const success = stateValue(project(s, choice, choice.effects)) - before;

  let expected = success;
  if (choice.riskChance && choice.failureEffects) {
    // The same odds the engine will actually roll, competence and all.
    const competence = (s.stability + (100 - s.corruption) + s.intelligence.capability) / 300;
    const risk = clamp(choice.riskChance * (1.35 - competence * 0.6), 0.02, 0.95);
    const failure = stateValue(project(s, choice, choice.failureEffects)) - before;
    expected = success * (1 - risk) + failure * risk;
    if (failure < 0) expected -= Math.min(60, -failure * risk * 0.35);
  }

  // A standing modifier is worth roughly its monthly weight over its term,
  // discounted — ministers are not expected to plan five years ahead.
  if (choice.temporaryModifiers) {
    const m = choice.temporaryModifiers.modifiers;
    const monthly =
      (m.gdpGrowth ?? 0) * 14 +
      (m.approval ?? 0) * 3 +
      (m.stability ?? 0) * 4 +
      (m.happiness ?? 0) * 2 +
      (m.research ?? 0) * 0.3 +
      (m.taxEfficiency ?? 0) * 0.8 +
      (m.spendingEfficiency ?? 0) * 0.8 -
      (m.inflation ?? 0) * 6 -
      (m.corruption ?? 0) * 3 -
      (m.unemployment ?? 0) * 5;
    expected += monthly * clamp(Math.min(choice.temporaryModifiers.months, 36) / 12, 0.25, 3);
  }

  return expected;
}

/**
 * Whether the cabinet may take a choice at all.
 *
 * The distinction that matters here is between what a government *cannot* do
 * and what it merely cannot pay for in cash. A technology it does not have,
 * an army it does not field, a state too unstable to attempt something — those
 * are real gates, and the cabinet respects them. A bill larger than this
 * month's balance is not a gate: governments borrow, and `spendTreasury` in
 * the engine turns any shortfall into sovereign debt exactly as it should.
 *
 * Getting this wrong was the single largest defect in the feature. An earlier
 * version filtered on `choiceAvailable`, which refuses anything the treasury
 * cannot cover — so the moment a country's cash dipped, the cabinet was locked
 * out of precisely the expensive, responsible responses that this simulation
 * rewards, and forced onto the cheap ones that it punishes. Measured over 40
 * country-seed pairs that scored 43% survival. Letting the cabinet borrow, and
 * pricing the borrowing honestly in the projection below, scores 100% — ahead
 * of blindly always taking the authored first option, which scores 93%.
 */
function cabinetCanTake(s: GameState, choice: EventChoice): boolean {
  const r = choice.requires;
  if (!r) return true;
  if (r.minStability !== undefined && s.stability < r.minStability) return false;
  if (r.minMilitary !== undefined && s.military.strength < r.minMilitary) return false;
  if (r.tech && !r.tech.every((t) => s.research.completed.includes(t))) return false;
  // `minTreasury` and the choice's own `cost` are deliberately not checked.
  return true;
}

/**
 * The choice a competent cabinet would take.
 *
 * Returns null only for an unknown event. A well-formed event always has at
 * least one choice with no requirements, and if somehow none is takeable the
 * authored primary response is used rather than stalling the campaign.
 */
export function recommendChoice(s: GameState, defId: string): EventChoice | null {
  const def = EVENT_INDEX[defId];
  if (!def) return null;

  const pool = def.choices.filter((c) => cabinetCanTake(s, c));
  if (pool.length === 0) return def.choices[0] ?? null;

  let best = pool[0];
  let bestScore = scoreChoice(s, best);
  for (const choice of pool.slice(1)) {
    const score = scoreChoice(s, choice);
    if (score > bestScore) {
      best = choice;
      bestScore = score;
    }
  }
  return best;
}

/** Whether a queued situation should be settled without asking the player. */
export function shouldDelegate(
  s: GameState,
  mode: 'modal' | 'inline' | 'delegate-minor' | 'delegate-all',
): boolean {
  if (s.eventQueue.length === 0) return false;
  if (mode === 'modal' || mode === 'inline') return false;
  if (mode === 'delegate-all') return true;
  const def = EVENT_INDEX[s.eventQueue[0].defId];
  return def ? ROUTINE.has(def.severity) : true;
}

export interface DelegatedDecision {
  title: string;
  choiceLabel: string;
  failed: boolean;
}

/**
 * Settles every queued situation the current mode allows the cabinet to take.
 *
 * Bounded rather than open-ended: the queue only ever holds one event at a
 * time, but a hard cap means a future change that queues several cannot spin
 * here. Returns what was decided so the caller can tell the player.
 */
export function delegateQueuedDecisions(
  s: GameState,
  mode: 'modal' | 'inline' | 'delegate-minor' | 'delegate-all',
): DelegatedDecision[] {
  const decided: DelegatedDecision[] = [];
  let guard = 0;

  while (shouldDelegate(s, mode) && guard++ < 8) {
    const pending = s.eventQueue[0];
    const def = EVENT_INDEX[pending.defId];
    const choice = recommendChoice(s, pending.defId);
    if (!def || !choice) {
      // Malformed definition: drop it rather than blocking the campaign for
      // ever on a decision that cannot be taken.
      s.eventQueue = s.eventQueue.slice(1);
      continue;
    }
    const outcome = resolveEvent(s, choice.id);
    decided.push({
      title: def.title,
      choiceLabel: choice.label,
      failed: outcome?.failed ?? false,
    });
  }

  return decided;
}
