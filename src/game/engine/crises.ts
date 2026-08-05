import type { ActiveCrisis, CrisisDef, CrisisResponseDef, GameState, LogEntry } from '../types';
import { CRISES, CRISIS_INDEX } from '../data/crises';
import { DIFFICULTY_INDEX } from '../data/definitions';
import { clamp, costScale } from '../selectors';

export { crisisModifiers } from '../selectors';
import { applyEventEffects } from './events';
import { spendCapital } from './politics';
import { nextRandom, weightedPick } from './rng';
import { spendTreasury } from './treasury';

/** How many crises can run at once, so a bad year cannot become unplayable. */
export const MAX_CONCURRENT_CRISES = 3;

type Logger = (entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>) => void;

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/** Crisis definitions that could begin right now. */
export function eligibleCrises(s: GameState): CrisisDef[] {
  return CRISES.filter((def) => {
    if (s.crises.some((c) => c.defId === def.id)) return false;
    const last = s.crisisCooldowns[def.id];
    if (last !== undefined && s.turn - last < def.cooldown) return false;
    try {
      return def.trigger(s);
    } catch {
      return false;
    }
  });
}

/**
 * Rolls for a new crisis and advances the ones already running.
 *
 * Crises do not queue behind events: the country can be dealing with a banking
 * collapse and a drought at the same time, which is exactly what makes them
 * different from the one-decision-at-a-time event system.
 */
export function updateCrises(s: GameState, log: Logger): void {
  const difficulty = DIFFICULTY_INDEX[s.settings.difficulty];

  /* --- Advance the live ones --------------------------------------------- */
  const surviving: ActiveCrisis[] = [];
  for (const crisis of s.crises) {
    const def = CRISIS_INDEX[crisis.defId];
    if (!def) continue;

    crisis.monthsInStage += 1;

    // A crisis is the consequence of a situation. While that situation still
    // holds it gets worse on its own; once it has passed the crisis subsides
    // even if nothing was done about it. Without this a transient dip could
    // open a crisis that then became unresolvable through no fault of the
    // player, and every campaign spiralled into permanent emergency.
    let stillCausing = false;
    try {
      stillCausing = def.trigger(s);
    } catch {
      stillCausing = false;
    }
    const drift = stillCausing ? (crisis.severity > 55 ? 1.4 : 0.8) : -3.4;
    crisis.severity = clamp(crisis.severity + drift - responseDecay(crisis), 0, 100);

    // Resolved: the response programme brought it under control.
    if (crisis.severity <= 8) {
      s.crisisCooldowns[crisis.defId] = s.turn;
      s.records.crisesResolved += 1;
      s.governance.momentum = clamp(s.governance.momentum + 18, -100, 100);
      log({
        text: `${def.name} is over. The situation has been brought back under control.`,
        category: 'crisis',
        tone: 'good',
        icon: def.icon,
      });
      continue;
    }

    const stage = def.stages[crisis.stage];
    if (stage && crisis.monthsInStage >= stage.months) {
      if (crisis.stage < def.stages.length - 1) {
        crisis.stage += 1;
        crisis.monthsInStage = 0;
        crisis.severity = clamp(crisis.severity + 12, 0, 100);
        log({
          text: `${def.name} has escalated: ${def.stages[crisis.stage].label}.`,
          category: 'crisis',
          tone: 'critical',
          icon: def.icon,
        });
      } else {
        // Ran its full course unresolved — the bill comes due.
        applyEventEffects(s, def.climax);
        s.crisisCooldowns[crisis.defId] = s.turn;
        s.governance.momentum = clamp(s.governance.momentum - 25, -100, 100);
        log({
          text: `${def.name} ran its course without being contained. The damage is permanent.`,
          category: 'crisis',
          tone: 'critical',
          icon: '💀',
        });
        // Consequences of neglect: a crisis nobody contained is how the next
        // one starts. Rolled here rather than anywhere else in the lifecycle
        // precisely so that a crisis the player *did* bring under control can
        // never chain — a chain is always a price, never bad luck.
        spawnChained(s, def, surviving, log);
        continue;
      }
    }

    surviving.push(crisis);
  }
  s.crises = surviving;

  /* --- Consider opening a new one ---------------------------------------- */
  if (s.crises.length >= MAX_CONCURRENT_CRISES) return;

  const pool = eligibleCrises(s);
  if (pool.length === 0) return;

  // Base rate is deliberately low. A crisis should be a handful of memorable
  // episodes across a fifty-year campaign, not a standing condition — an
  // earlier rate of 5.5% a month produced dozens per run and turned every
  // hands-off campaign into a death spiral.
  let chance = 0.013 * difficulty.crisisMultiplier;
  chance *= 1 + s.world.tension / 260;
  chance *= 1 + Math.max(0, 55 - s.stability) / 160;
  // A country already fighting one has less capacity to prevent the next.
  chance *= 1 + s.crises.length * 0.25;

  if (nextRandom(s) > Math.min(0.2, chance)) return;

  const chosen = weightedPick(s, pool, (def) => def.weight);
  if (!chosen) return;

  s.crises.push({
    id: `crisis-${chosen.id}-${s.turn}-${Math.floor(nextRandom(s) * 1e5).toString(36)}`,
    defId: chosen.id,
    startedTurn: s.turn,
    stage: 0,
    monthsInStage: 0,
    severity: clamp(38 + difficulty.crisisMultiplier * 8, 20, 70),
    responsesUsed: [],
  });
  log({
    text: `${chosen.name} has begun. ${chosen.summary}`,
    category: 'crisis',
    tone: 'critical',
    icon: chosen.icon,
  });
}

/**
 * How fast a crisis calms down on its own given how much has been done about it.
 *
 * Each response applied leaves a lasting pressure on the severity rather than
 * a one-off drop, which is why a well-managed crisis keeps improving and an
 * abandoned one does not.
 */
function responseDecay(crisis: ActiveCrisis): number {
  return crisis.responsesUsed.length * 2.4;
}

/**
 * Rolls a crisis's declared chains after it has run its full course.
 *
 * Three guards keep this from becoming a death spiral, which is the obvious
 * failure mode of any cascade system:
 *
 *  - At most one chain fires per climax, however many are declared.
 *  - Nothing chains past the concurrent-crisis limit, and nothing chains onto
 *    a crisis already running or still inside its cooldown.
 *  - A chained crisis begins at low severity with its stage clock reset, so it
 *    arrives as a warning the player has time to answer rather than as an
 *    emergency that was already half over when it appeared.
 *
 * The trigger predicate is *not* consulted: the parent crisis is the cause, so
 * requiring the usual preconditions as well would mean the most causally
 * obvious chains almost never fired.
 */
function spawnChained(
  s: GameState,
  parent: CrisisDef,
  surviving: ActiveCrisis[],
  log: Logger,
): void {
  if (!parent.chains || parent.chains.length === 0) return;
  if (surviving.length >= MAX_CONCURRENT_CRISES) return;

  for (const chain of parent.chains) {
    const def = CRISIS_INDEX[chain.crisisId];
    if (!def) continue;
    if (surviving.some((c) => c.defId === def.id)) continue;
    const last = s.crisisCooldowns[def.id];
    if (last !== undefined && s.turn - last < def.cooldown) continue;

    const difficulty = DIFFICULTY_INDEX[s.settings.difficulty];
    if (nextRandom(s) > clamp(chain.chance * difficulty.crisisMultiplier, 0, 0.7)) continue;

    surviving.push({
      id: `crisis-${def.id}-${s.turn}-${Math.floor(nextRandom(s) * 1e5).toString(36)}`,
      defId: def.id,
      startedTurn: s.turn,
      stage: 0,
      monthsInStage: 0,
      // Deliberately below the 38–70 band a spontaneous crisis opens at.
      severity: clamp(26 + difficulty.crisisMultiplier * 6, 18, 50),
      responsesUsed: [],
      causedBy: { defId: parent.id, because: chain.because },
    });
    log({
      text: `${def.name} has broken out in the wake of ${parent.name}. ${chain.because}`,
      category: 'crisis',
      tone: 'critical',
      icon: def.icon,
    });
    return; // one consequence per climax, whatever else was declared
  }
}

/* ------------------------------------------------------------------ */
/* Player responses                                                    */
/* ------------------------------------------------------------------ */

export interface ResponseAvailability {
  enabled: boolean;
  reason: string | null;
  cost: number;
  politicalCost: number;
  used: boolean;
}

export function responseAvailability(
  s: GameState,
  crisisId: string,
  responseId: string,
): ResponseAvailability {
  const crisis = s.crises.find((c) => c.id === crisisId);
  const def = crisis ? CRISIS_INDEX[crisis.defId] : undefined;
  const response = def?.responses.find((r) => r.id === responseId);
  if (!crisis || !def || !response) {
    return { enabled: false, reason: 'Unknown response', cost: 0, politicalCost: 0, used: false };
  }

  const cost = response.cost * costScale(s.economy.gdp);
  const used = crisis.responsesUsed.includes(responseId);
  const base = { cost, politicalCost: response.politicalCost, used };

  if (used) return { ...base, enabled: false, reason: 'Already attempted' };
  if (s.economy.treasury < cost) return { ...base, enabled: false, reason: 'Insufficient treasury' };
  if (s.governance.capital < response.politicalCost) {
    return { ...base, enabled: false, reason: `Needs ${response.politicalCost} political capital` };
  }
  const r = response.requires;
  if (r?.tech && !r.tech.every((t) => s.research.completed.includes(t))) {
    return { ...base, enabled: false, reason: 'Missing required technology' };
  }
  if (r?.minStability !== undefined && s.stability < r.minStability) {
    return { ...base, enabled: false, reason: `Requires ${r.minStability} stability` };
  }
  if (r?.minMilitary !== undefined && s.military.strength < r.minMilitary) {
    return { ...base, enabled: false, reason: `Requires ${r.minMilitary} military strength` };
  }
  return { ...base, enabled: true, reason: null };
}

export interface ResponseOutcome {
  ok: boolean;
  message: string;
  failed?: boolean;
}

/** Applies a chosen response to a live crisis. */
export function respondToCrisis(
  s: GameState,
  crisisId: string,
  responseId: string,
  log: Logger,
): ResponseOutcome {
  const availability = responseAvailability(s, crisisId, responseId);
  if (!availability.enabled) return { ok: false, message: availability.reason ?? 'Not available' };

  const crisis = s.crises.find((c) => c.id === crisisId)!;
  const def = CRISIS_INDEX[crisis.defId];
  const response = def.responses.find((r) => r.id === responseId) as CrisisResponseDef;

  spendTreasury(s, availability.cost);
  spendCapital(s, response.politicalCost);
  crisis.responsesUsed.push(responseId);

  // Competence tilts the odds, exactly as it does for event gambles.
  let failed = false;
  if (response.riskChance) {
    const competence = (s.stability + (100 - s.corruption) + s.governance.mandate) / 300;
    const effective = clamp(response.riskChance * (1.3 - competence * 0.55), 0.02, 0.9);
    failed = nextRandom(s) < effective;
  }

  if (failed) {
    crisis.severity = clamp(crisis.severity + 6, 0, 100);
    s.governance.momentum = clamp(s.governance.momentum - 8, -100, 100);
    log({
      text: `${response.label} failed. ${def.name} is worse than before.`,
      category: 'crisis',
      tone: 'bad',
      icon: def.icon,
    });
    return { ok: true, failed: true, message: `${response.label} achieved nothing.` };
  }

  crisis.severity = clamp(crisis.severity - response.severityRelief, 0, 100);
  if (response.effects) applyEventEffects(s, response.effects);
  s.governance.momentum = clamp(s.governance.momentum + 6, -100, 100);

  log({
    text: `${response.label}: ${def.name} severity down to ${crisis.severity.toFixed(0)}.`,
    category: 'crisis',
    tone: 'good',
    icon: def.icon,
  });
  return { ok: true, message: `${response.label} applied. Severity now ${crisis.severity.toFixed(0)}.` };
}

/** Highest-severity live crisis, for the dashboard banner. */
export function worstCrisis(s: GameState): ActiveCrisis | null {
  if (s.crises.length === 0) return null;
  return [...s.crises].sort((a, b) => b.severity - a.severity)[0];
}
