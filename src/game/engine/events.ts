import type { EventChoice, EventEffects, GameEventDef, GameState, LogEntry } from '../types';
import { EVENTS, EVENT_INDEX } from '../data/events';
import { DIFFICULTY_INDEX } from '../data/definitions';
import { clamp, costScale, gdpPerCapita } from '../selectors';
import { nextRandom, weightedPick } from './rng';
import { addTreasury, spendTreasury } from './treasury';

const FREQUENCY_CHANCE: Record<GameState['settings']['eventFrequency'], number> = {
  low: 0.11,
  normal: 0.2,
  high: 0.32,
  chaos: 0.52,
};

/** Whether an event's gating conditions currently hold. */
export function eventEligible(def: GameEventDef, s: GameState): boolean {
  const c = def.conditions;
  if (def.once && s.eventCooldowns[def.id] !== undefined) return false;
  const last = s.eventCooldowns[def.id];
  if (last !== undefined && s.turn - last < def.cooldown) return false;
  if (!c) return true;

  const perCapita = gdpPerCapita(s);
  if (c.minYear !== undefined && s.year < c.minYear) return false;
  if (c.maxYear !== undefined && s.year > c.maxYear) return false;
  if (c.minStability !== undefined && s.stability < c.minStability) return false;
  if (c.maxStability !== undefined && s.stability > c.maxStability) return false;
  if (c.minApproval !== undefined && s.approval < c.minApproval) return false;
  if (c.maxApproval !== undefined && s.approval > c.maxApproval) return false;
  if (c.minGdpPerCapita !== undefined && perCapita < c.minGdpPerCapita) return false;
  if (c.maxGdpPerCapita !== undefined && perCapita > c.maxGdpPerCapita) return false;
  if (c.minUnemployment !== undefined && s.economy.unemployment < c.minUnemployment) return false;
  if (c.maxCorruption !== undefined && s.corruption > c.maxCorruption) return false;
  if (c.minCorruption !== undefined && s.corruption < c.minCorruption) return false;
  if (c.minPopulation !== undefined && s.society.population < c.minPopulation) return false;
  if (c.minEmissions !== undefined && s.environment.emissions < c.minEmissions) return false;
  if (c.minMilitary !== undefined && s.military.strength < c.minMilitary) return false;
  if (c.atWar !== undefined && s.wars.some((w) => !w.resolved) !== c.atWar) return false;
  if (c.government && !c.government.includes(s.identity.government)) return false;
  if (c.era && !c.era.includes(s.settings.era)) return false;
  if (c.requiresTech && !c.requiresTech.every((t) => s.research.completed.includes(t))) return false;
  return true;
}

const DISASTER_CATEGORIES = new Set(['disaster', 'environment']);

/**
 * Rolls for a new event. Mutates `s.eventQueue` and `s.eventCooldowns`, and
 * advances the RNG seed, so it is only ever called from `tick`.
 */
export function rollEvent(s: GameState): void {
  // A queued event blocks new ones — the player must resolve it first.
  if (s.eventQueue.length > 0) return;

  const difficulty = DIFFICULTY_INDEX[s.settings.difficulty];

  let chance = FREQUENCY_CHANCE[s.settings.eventFrequency];
  // Unstable, unhappy countries generate more news.
  chance *= 1 + (60 - Math.min(60, s.stability)) / 90;
  chance *= 1 + s.environment.disasterRisk / 300;
  // Difficulty is what the setup screen promises it is.
  chance *= difficulty.crisisMultiplier;

  if (nextRandom(s) > Math.min(0.95, chance)) return;

  // Chained events fire first and unconditionally.
  if (s.chainedEvents.length > 0) {
    const id = s.chainedEvents[0];
    s.chainedEvents = s.chainedEvents.slice(1);
    const def = EVENT_INDEX[id];
    if (def && (!def.once || s.eventCooldowns[def.id] === undefined)) {
      s.eventQueue.push({ defId: id, turn: s.turn });
      s.eventCooldowns[id] = s.turn;
      return;
    }
  }

  const pool = EVENTS.filter((def) => {
    if (def.weight <= 0) return false;
    if (!s.settings.enableDisasters && DISASTER_CATEGORIES.has(def.category)) return false;
    if (!s.settings.enableWars && def.category === 'military') return false;
    return eventEligible(def, s);
  });

  const chosen = weightedPick(s, pool, (def) => {
    let w = def.weight;
    // Weight severity toward the player's current situation so events feel causal.
    if (def.severity === 'critical') w *= clamp((70 - s.stability) / 30, 0.15, 2.4);
    // And toward trouble on the harder settings: a brutal campaign should not
    // just get *more* events, it should get worse ones.
    if (def.severity === 'critical' || def.severity === 'major') w *= difficulty.crisisMultiplier;
    if (def.category === 'opportunity') w /= difficulty.crisisMultiplier;
    if (def.category === 'economy' && s.economy.growth < 0) w *= 1.9;
    if (def.category === 'politics' && s.approval < 40) w *= 1.8;
    if (def.category === 'environment' && s.environment.emissions > 600) w *= 1.6;
    if (def.category === 'crime' && s.society.crime > 55) w *= 1.7;
    if (def.category === 'opportunity') w *= clamp(s.stability / 55, 0.4, 1.6);
    return w;
  });

  if (!chosen) return;
  s.eventQueue.push({ defId: chosen.id, turn: s.turn });
  s.eventCooldowns[chosen.id] = s.turn;
}

/** Applies a one-shot effects block directly to the state. */
export function applyEventEffects(s: GameState, e: EventEffects): void {
  if (e.treasury) addTreasury(s, e.treasury * costScale(s.economy.gdp));
  if (e.approval) s.approval = clamp(s.approval + e.approval, 0, 100);
  if (e.stability) s.stability = clamp(s.stability + e.stability, 0, 100);
  if (e.gdpShock) s.economy.gdp = Math.max(0.5, s.economy.gdp * (1 + e.gdpShock / 100));
  if (e.population) {
    // Population figures in the content files are written for a ~100M nation.
    // Scale them so a pandemic costs Fiji and India a comparable *share*, and
    // never let a single event move more than a tenth of the population.
    const scaled = e.population * clamp(s.society.population / 1e8, 0.02, 6);
    const capped = clamp(scaled, -s.society.population * 0.1, s.society.population * 0.1);
    s.society.population = Math.max(1000, Math.round(s.society.population + capped));
  }
  if (e.inflation) s.economy.inflation = clamp(s.economy.inflation + e.inflation, -8, 200);
  if (e.unemployment) s.economy.unemployment = clamp(s.economy.unemployment + e.unemployment, 0.4, 70);
  if (e.corruption) s.corruption = clamp(s.corruption + e.corruption, 0, 100);
  if (e.militaryStrength) s.military.strength = clamp(s.military.strength + e.militaryStrength, 0, 100);
  if (e.research) s.research.points = Math.max(0, s.research.points + e.research);
  if (e.health) s.society.health = clamp(s.society.health + e.health, 0, 100);
  if (e.education) s.society.education = clamp(s.society.education + e.education, 0, 100);
  if (e.happiness) s.society.happiness = clamp(s.society.happiness + e.happiness, 0, 100);
  if (e.crime) s.society.crime = clamp(s.society.crime + e.crime, 0, 100);
  if (e.emissions) s.environment.emissions = Math.max(0, s.environment.emissions * (1 + e.emissions / 100));
  if (e.softPower) s.society.softPower = clamp(s.society.softPower + e.softPower, 0, 100);
  if (e.civilLiberties) s.society.civilLiberties = clamp(s.society.civilLiberties + e.civilLiberties, 0, 100);
  if (e.infrastructure) s.infrastructure = clamp(s.infrastructure + e.infrastructure, 0, 100);
  if (e.inequality) s.economy.inequality = clamp(s.economy.inequality + e.inequality, 5, 95);
  if (e.intelligence) {
    s.intelligence.capability = clamp(s.intelligence.capability + e.intelligence, 0, 100);
  }
  if (e.globalRelations) {
    for (const n of s.nations) n.relations = clamp(n.relations + e.globalRelations, -100, 100);
  }
  if (e.relations) {
    for (const r of e.relations) {
      const nation = s.nations.find((n) => n.id === r.countryId);
      if (nation) nation.relations = clamp(nation.relations + r.amount, -100, 100);
    }
  }
}

export interface ChoiceAvailability {
  enabled: boolean;
  reason: string | null;
}

/** Whether the player can currently select a given choice. */
export function choiceAvailable(s: GameState, choice: EventChoice): ChoiceAvailability {
  const scale = costScale(s.economy.gdp);
  if (choice.cost && s.economy.treasury < choice.cost * scale) {
    return { enabled: false, reason: 'Insufficient treasury' };
  }
  const r = choice.requires;
  if (!r) return { enabled: true, reason: null };
  if (r.minTreasury !== undefined && s.economy.treasury < r.minTreasury * scale) {
    return { enabled: false, reason: 'Insufficient treasury' };
  }
  if (r.minStability !== undefined && s.stability < r.minStability) {
    return { enabled: false, reason: `Requires ${r.minStability} stability` };
  }
  if (r.minMilitary !== undefined && s.military.strength < r.minMilitary) {
    return { enabled: false, reason: `Requires ${r.minMilitary} military strength` };
  }
  if (r.tech && !r.tech.every((t) => s.research.completed.includes(t))) {
    return { enabled: false, reason: 'Missing required technology' };
  }
  return { enabled: true, reason: null };
}

export interface ResolutionOutcome {
  failed: boolean;
  headline: string;
}

/**
 * Resolves the player's choice on the front event in the queue. Returns the
 * outcome so the UI can show whether a risky option paid off.
 */
export function resolveEvent(s: GameState, choiceId: string): ResolutionOutcome | null {
  const pending = s.eventQueue[0];
  if (!pending) return null;
  const def = EVENT_INDEX[pending.defId];
  if (!def) {
    s.eventQueue = s.eventQueue.slice(1);
    return null;
  }
  const choice = def.choices.find((c) => c.id === choiceId) ?? def.choices[0];

  // Borrows if the treasury is short — the UI gates unaffordable choices, but
  // the engine must stay consistent even when it is driven directly.
  if (choice.cost) spendTreasury(s, choice.cost * costScale(s.economy.gdp));

  let failed = false;
  if (choice.riskChance && choice.failureEffects) {
    // Competence tilts the odds: a stable, well-run state gambles better.
    // Difficulty tilts them back, but more gently than it drives frequency —
    // a gamble should still feel like the odds you were quoted.
    const competence = (s.stability + (100 - s.corruption) + s.intelligence.capability) / 300;
    const difficultyBias = 0.7 + DIFFICULTY_INDEX[s.settings.difficulty].crisisMultiplier * 0.3;
    const effectiveRisk = clamp(choice.riskChance * (1.35 - competence * 0.6) * difficultyBias, 0.02, 0.95);
    failed = nextRandom(s) < effectiveRisk;
  }

  applyEventEffects(s, failed ? choice.failureEffects! : choice.effects);

  if (!failed && choice.temporaryModifiers) {
    const t = choice.temporaryModifiers;
    s.activeModifiers.push({
      id: `evt-${def.id}-${choice.id}-${s.turn}`,
      label: t.label,
      source: def.title,
      modifiers: t.modifiers,
      monthsRemaining: t.months,
      icon: def.icon,
    });
  }

  if (def.chains) s.chainedEvents.push(...def.chains);

  s.eventQueue = s.eventQueue.slice(1);
  s.records.eventsResolved += 1;
  // Handling a crisis well builds standing; fumbling one costs it.
  s.governance.momentum = clamp(
    s.governance.momentum + (failed ? -6 : def.severity === 'critical' ? 8 : 3),
    -100,
    100,
  );

  const headline = failed
    ? `${def.title}: "${choice.label}" backfired.`
    : `${def.title}: ${choice.label}.`;

  s.log.unshift({
    id: `log-evt-${s.turn}-${def.id}`,
    turn: s.turn,
    year: s.year,
    month: s.month,
    text: headline,
    category: def.category,
    tone: failed ? 'bad' : def.severity === 'critical' ? 'critical' : 'neutral',
    icon: def.icon,
  } satisfies LogEntry);

  return { failed, headline };
}
