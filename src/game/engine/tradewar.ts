import type { ForeignNation, GameState, LogEntry } from '../types';
import { clamp } from '../math';
import { nextRandom } from './rng';

/**
 * Trade retaliation.
 *
 * Tariffs used to be a pure revenue slider: you raised them, you collected
 * more, and the world said nothing. Now the world answers. Every nation keeps
 * a running grievance about your trade policy, weighted by how much of their
 * commerce actually runs through you, and when that grievance passes a
 * threshold they impose a counter-tariff of their own.
 *
 * The design rules that keep it fair:
 *
 *  - It is *slow*. Grievance builds and decays over years, so a temporary
 *    tariff to cover a bad budget year does not start a trade war.
 *  - It is *proportionate*. A nation retaliates roughly to the level you set,
 *    never beyond it, and only against a rate they can feel.
 *  - It is *reversible*. Cutting your own tariff bleeds the grievance away and
 *    they stand their tariff down on a lag. There is also a diplomatic exit —
 *    a trade settlement — bought with political capital.
 *  - It has *character*. A mercantile state retaliates hard and fast; an
 *    isolationist one barely notices; a bloc partner gives you far more room.
 */

type Logger = (entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>) => void;

/** Grievance above which a nation will consider a counter-tariff. */
export const RETALIATION_THRESHOLD = 45;

/** Player tariff below which nobody takes offence at all. */
export const TOLERATED_TARIFF = 6;

/** How hard each personality reacts to a trade grievance. */
const RETALIATION_TEMPERAMENT: Record<ForeignNation['personality'], number> = {
  mercantile: 1.45,
  pragmatic: 1,
  aggressive: 1.2,
  idealist: 0.75,
  isolationist: 0.4,
};

/* ------------------------------------------------------------------ */
/* Grievance                                                           */
/* ------------------------------------------------------------------ */

/**
 * How exposed a nation is to the player's trade policy, 0–1.
 *
 * A country that sends a fifth of its exports to you cares enormously about
 * your tariff schedule. One that barely trades with you does not, and it would
 * be absurd for it to start a trade war over a rate it never pays.
 */
export function tradeExposure(n: ForeignNation): number {
  const theirMonthlyGdp = (n.gdp * 1000) / 12;
  if (theirMonthlyGdp <= 0) return 0;
  return clamp(n.tradeVolume / theirMonthlyGdp, 0, 1);
}

/**
 * The grievance level this nation's situation implies right now.
 *
 * Grievance drifts toward this rather than jumping to it, which is what makes
 * a trade war something you can see coming and head off.
 */
export function grievanceTarget(s: GameState, n: ForeignNation): number {
  if (n.atWarWithPlayer) return 100;

  const exposure = tradeExposure(n);
  // Anything under the tolerated rate is simply how the world works.
  const excessTariff = Math.max(0, s.taxes.tariff - TOLERATED_TARIFF);
  // Exposure is the multiplier, but even an unexposed partner notices a wall.
  const tariffTerm = excessTariff * (1.1 + exposure * 6.5) * 1.5;

  const sanctionTerm = s.nations.some((x) => x.id === n.id && x.sanctioned) ? 55 : 0;
  const blocRelief = n.bloc !== null && n.bloc === playerBlocOf(s) ? 0.65 : 1;
  const warmth = clamp((n.relations + 100) / 200, 0, 1);

  return clamp(
    (tariffTerm + sanctionTerm) * blocRelief * (1.25 - warmth * 0.5) * RETALIATION_TEMPERAMENT[n.personality],
    0,
    100,
  );
}

/** Cached bloc lookup that does not need the world module. */
function playerBlocOf(s: GameState): string | null {
  // Most nations carry a bloc; the player's is whichever bloc most of their
  // warmest partners belong to. Cheap, stable, and good enough for a modifier.
  const counts = new Map<string, number>();
  for (const n of s.nations) {
    if (n.bloc === null || n.relations < 30) continue;
    counts.set(n.bloc, (counts.get(n.bloc) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [bloc, count] of counts) {
    if (count > bestCount) {
      best = bloc;
      bestCount = count;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

/**
 * The weighted average counter-tariff the player's exporters face, in percent.
 *
 * This is the number the trade panel shows, and the one that feeds through to
 * the trade balance — a wall of foreign tariffs makes your goods dearer abroad
 * whatever your own productivity says.
 */
export function averageForeignTariff(s: GameState): number {
  let weighted = 0;
  let volume = 0;
  for (const n of s.nations) {
    if (n.atWarWithPlayer || n.sanctioned) continue;
    const v = Math.max(0, n.tradeVolume);
    weighted += (n.tariffOnPlayer ?? 0) * v;
    volume += v;
  }
  return volume > 0 ? weighted / volume : 0;
}

/**
 * Multiplier applied to the player's trade competitiveness by foreign tariffs.
 *
 * Capped so that even a total trade war leaves some commerce standing —
 * smuggling, transshipment and exempt categories all exist.
 */
export function foreignTariffDrag(s: GameState): number {
  return clamp(1 - averageForeignTariff(s) / 130, 0.6, 1);
}

/** Nations currently levying a counter-tariff, worst first. */
export function retaliatingNations(s: GameState): ForeignNation[] {
  return s.nations
    .filter((n) => (n.tariffOnPlayer ?? 0) > 0.5)
    .sort((a, b) => b.tariffOnPlayer - a.tariffOnPlayer);
}

/* ------------------------------------------------------------------ */
/* Monthly update                                                      */
/* ------------------------------------------------------------------ */

/**
 * Advances grievance and counter-tariffs by one month. Called from `tick`
 * after diplomacy, so it reacts to this month's trade volumes.
 */
export function updateTradeWar(s: GameState, log: Logger): void {
  for (const n of s.nations) {
    if (typeof n.tradeGrievance !== 'number') n.tradeGrievance = 0;
    if (typeof n.tariffOnPlayer !== 'number') n.tariffOnPlayer = 0;

    const target = grievanceTarget(s, n);
    // Anger builds faster than it fades: a grudge outlives the policy that
    // caused it, which is why an on-again-off-again tariff is the worst of
    // both worlds.
    const rate = target > n.tradeGrievance ? 0.055 : 0.03;
    n.tradeGrievance = clamp(n.tradeGrievance + (target - n.tradeGrievance) * rate, 0, 100);

    /* --- Escalation ------------------------------------------------------- */
    if (n.tradeGrievance >= RETALIATION_THRESHOLD && !n.atWarWithPlayer) {
      // They match roughly what you levy, scaled by how angry they are, and
      // never beyond your own rate plus a small overshoot.
      const ceiling = clamp(
        Math.min(45, s.taxes.tariff * 1.15 + 3) * ((n.tradeGrievance - RETALIATION_THRESHOLD) / 55 + 0.35),
        0,
        45,
      );
      if (ceiling > n.tariffOnPlayer + 0.5) {
        const wasZero = n.tariffOnPlayer < 0.5;
        // Escalation is a decision, not a continuous function: they move in
        // steps, and only occasionally, so the player gets a chance to react.
        if (wasZero ? nextRandom(s) < 0.28 : nextRandom(s) < 0.16) {
          n.tariffOnPlayer = clamp(n.tariffOnPlayer + Math.max(2, (ceiling - n.tariffOnPlayer) * 0.6), 0, 45);
          n.relations = clamp(n.relations - 3, -100, 100);
          s.world.tension = clamp(s.world.tension + 1.2, 0, 100);
          if (wasZero) {
            log({
              text: `${n.name} has imposed a ${n.tariffOnPlayer.toFixed(0)}% retaliatory tariff on our exports.`,
              category: 'diplomacy',
              tone: 'bad',
              icon: '🧱',
            });
          }
        }
      }
    }

    /* --- De-escalation ---------------------------------------------------- */
    if (n.tariffOnPlayer > 0.5 && n.tradeGrievance < RETALIATION_THRESHOLD - 8) {
      // Standing a tariff down is politically slow everywhere, so it lags the
      // grievance rather than tracking it.
      n.tariffOnPlayer = Math.max(0, n.tariffOnPlayer - 0.9);
      if (n.tariffOnPlayer < 0.5) {
        n.tariffOnPlayer = 0;
        n.relations = clamp(n.relations + 4, -100, 100);
        log({
          text: `${n.name} has lifted its retaliatory tariffs. Normal trade resumes.`,
          category: 'diplomacy',
          tone: 'good',
          icon: '🕊️',
        });
      }
    }
  }
}

/**
 * Registers a specific commercial injury, used when the player tears up a
 * contract or imposes sanctions. Grievance from an act is immediate, unlike
 * grievance from a standing rate.
 */
export function addGrievance(s: GameState, countryId: string, amount: number): void {
  const nation = s.nations.find((n) => n.id === countryId);
  if (!nation) return;
  nation.tradeGrievance = clamp((nation.tradeGrievance ?? 0) + amount, 0, 100);
}

/* ------------------------------------------------------------------ */
/* The diplomatic exit                                                 */
/* ------------------------------------------------------------------ */

export interface SettlementAssessment {
  enabled: boolean;
  reason: string | null;
  /** Political capital the settlement costs. */
  cost: number;
  /** Current counter-tariff, for the UI. */
  theirTariff: number;
  grievance: number;
}

/**
 * What it would take to settle a trade dispute.
 *
 * The price scales with how angry they are and how big they are, because a
 * settlement is a negotiation and both of those are leverage.
 */
export function assessSettlement(s: GameState, countryId: string): SettlementAssessment {
  const n = s.nations.find((x) => x.id === countryId);
  if (!n) {
    return { enabled: false, reason: 'Unknown nation', cost: 0, theirTariff: 0, grievance: 0 };
  }
  const cost = Math.round(
    clamp(10 + (n.tradeGrievance ?? 0) * 0.35 + Math.log10(Math.max(1, n.gdp)) * 4, 8, 70),
  );
  const base = { cost, theirTariff: n.tariffOnPlayer ?? 0, grievance: n.tradeGrievance ?? 0 };

  if (n.atWarWithPlayer) return { ...base, enabled: false, reason: 'You are at war with this nation' };
  if ((n.tradeGrievance ?? 0) < 12) return { ...base, enabled: false, reason: 'There is no dispute to settle' };
  if (n.sanctioned) return { ...base, enabled: false, reason: 'Lift your own sanctions first' };
  if (s.governance.capital < cost) {
    return { ...base, enabled: false, reason: `Needs ${cost} political capital (you have ${Math.floor(s.governance.capital)})` };
  }
  return { ...base, enabled: true, reason: null };
}

/**
 * Negotiates a trade settlement: their tariffs come down at once and the
 * grievance is largely cleared.
 *
 * It does not touch the cause. If your own tariff is still what angered them,
 * the grievance simply starts building again — which is the point.
 */
export function settleTradeDispute(
  s: GameState,
  countryId: string,
  log?: Logger,
): { ok: boolean; message: string } {
  const assessment = assessSettlement(s, countryId);
  if (!assessment.enabled) return { ok: false, message: assessment.reason ?? 'Not possible' };
  const nation = s.nations.find((n) => n.id === countryId)!;

  // Spent directly rather than through `politics`, which would import this
  // module back through the explanation layer and close a cycle.
  s.governance.capital = Math.max(0, s.governance.capital - assessment.cost);
  nation.tradeGrievance = clamp(nation.tradeGrievance * 0.25, 0, 100);
  nation.tariffOnPlayer = 0;
  nation.relations = clamp(nation.relations + 8, -100, 100);
  nation.trust = clamp(nation.trust + 6, 0, 100);

  log?.({
    text: `A trade settlement has been signed with ${nation.name}. Their tariffs on our exports are lifted.`,
    category: 'diplomacy',
    tone: 'good',
    icon: '🤝',
  });
  return {
    ok: true,
    message:
      s.taxes.tariff > TOLERATED_TARIFF
        ? `${nation.name} stands its tariffs down — but your own rate is still what angered them.`
        : `${nation.name} stands its tariffs down.`,
  };
}
