import type { ForeignNation, GameState, ResourceId, TradeAgreement } from '../types';
import { RESOURCE_INDEX } from '../data/definitions';
import { agreementFlow, clamp } from '../selectors';

/**
 * Commodity trade.
 *
 * Resources otherwise settle automatically against a drifting world price. A
 * standing agreement replaces that for a fixed quantity: the price is locked
 * at signing, which protects you from a spike — and costs you when the market
 * falls. The counterparty is a specific nation, so the contract is exposed to
 * sanctions, war and their own depletion. That is what makes it diplomacy
 * rather than a spreadsheet.
 */

/** Contract lengths a player can choose, in months. */
export const TRADE_TERMS = [24, 60, 120] as const;
export type TradeTerm = (typeof TRADE_TERMS)[number];

/** Longer contracts lock a worse price — that is what the certainty costs. */
const TERM_PREMIUM: Record<TradeTerm, number> = { 24: 0.02, 60: 0.06, 120: 0.12 };

/** How much of a commodity a nation can plausibly export each month. */
export function exportCapacity(nation: ForeignNation, resource: ResourceId): number {
  const endowment = nation.resources[resource] ?? 0;
  if (endowment < 15) return 0;
  // Scaled by both the endowment and the size of their economy.
  return (endowment / 100) * Math.pow(Math.max(1, nation.gdp), 0.42) * 0.55;
}

/** How much of a commodity a nation can plausibly absorb each month. */
export function importAppetite(nation: ForeignNation, resource: ResourceId): number {
  const endowment = nation.resources[resource] ?? 0;
  // A country rich in something does not want to buy much more of it.
  const need = clamp(1 - endowment / 90, 0.05, 1);
  return need * Math.pow(Math.max(1, nation.gdp), 0.42) * 0.4;
}

/** Units already committed to this partner for this commodity. */
export function committedQuantity(
  s: GameState,
  countryId: string,
  resource: ResourceId,
  direction: TradeAgreement['direction'],
): number {
  return s.tradeAgreements
    .filter((a) => a.countryId === countryId && a.resource === resource && a.direction === direction)
    .reduce((sum, a) => sum + a.quantity, 0);
}

/** The most the player could still contract for, given what is already signed. */
export function availableQuantity(
  s: GameState,
  nation: ForeignNation,
  resource: ResourceId,
  direction: TradeAgreement['direction'],
): number {
  const capacity =
    direction === 'import' ? exportCapacity(nation, resource) : importAppetite(nation, resource);
  return Math.max(0, capacity - committedQuantity(s, nation.id, resource, direction));
}

/**
 * The price multiplier a nation will offer, against the resource base price.
 *
 * Warm relations and a mercantile counterparty get you a better deal; buying
 * from someone who barely has the stuff costs a premium. Importers pay above
 * spot and exporters receive below it — the spread is the counterparty's
 * margin, and it is how the market makes its money.
 */
export function quotedPrice(
  s: GameState,
  nation: ForeignNation,
  resource: ResourceId,
  direction: TradeAgreement['direction'],
  term: TradeTerm,
): number {
  const spot = s.worldPrices[resource] ?? 1;
  const goodwill = clamp((nation.relations + 100) / 200, 0, 1);
  const scarcity = direction === 'import' ? clamp(1 - (nation.resources[resource] ?? 0) / 130, 0.6, 1.4) : 1;
  const mercantile = nation.personality === 'mercantile' ? 0.97 : 1;

  // Importers pay a spread above spot, exporters receive one below it.
  const spread = direction === 'import' ? 1 + 0.14 - goodwill * 0.16 : 1 - 0.14 + goodwill * 0.16;

  return clamp(spot * spread * scarcity * mercantile * (1 + TERM_PREMIUM[term]), 0.2, 4);
}

/** Whether a nation would accept the proposal, and why not if it would not. */
export function tradeEligibility(
  s: GameState,
  nation: ForeignNation,
  resource: ResourceId,
  direction: TradeAgreement['direction'],
  quantity: number,
): { ok: boolean; reason: string | null } {
  if (nation.atWarWithPlayer) return { ok: false, reason: 'You are at war with this nation' };
  if (nation.sanctioned) return { ok: false, reason: 'You are sanctioning this nation' };
  if (nation.relations < -20) return { ok: false, reason: 'Relations are too hostile' };
  if (quantity <= 0) return { ok: false, reason: 'Set a quantity' };

  const available = availableQuantity(s, nation, resource, direction);
  if (available < quantity) {
    return {
      ok: false,
      reason:
        available <= 0
          ? direction === 'import'
            ? `${nation.name} has none to spare`
            : `${nation.name} has no appetite for it`
          : `${nation.name} can only manage ${available.toFixed(1)} units`,
    };
  }

  if (direction === 'export') {
    // You cannot promise what you do not produce.
    const holding = s.resources[resource];
    const alreadyPromised = s.tradeAgreements
      .filter((a) => a.resource === resource && a.direction === 'export')
      .reduce((sum, a) => sum + a.quantity, 0);
    const spare = holding.production - holding.consumption - alreadyPromised;
    if (spare < quantity) {
      return {
        ok: false,
        reason: spare <= 0 ? 'You have no surplus to sell' : `You can only spare ${spare.toFixed(1)} units`,
      };
    }
  }

  return { ok: true, reason: null };
}

/**
 * Effective supply of a commodity after contracts: domestic production plus
 * contracted imports, less contracted exports. What the panel actually shows.
 */
export function effectiveSupply(s: GameState, resource: ResourceId): number {
  return s.resources[resource].production + agreementFlow(s, resource);
}

/**
 * Advances every agreement by a month: suspends contracts with partners who
 * have become unreachable, resumes them when relations recover, and expires
 * those that have run their term. Called from `tick`.
 */
export function updateTradeAgreements(
  s: GameState,
  log: (text: string, tone: 'good' | 'bad' | 'neutral') => void,
): void {
  const surviving: TradeAgreement[] = [];

  for (const agreement of s.tradeAgreements) {
    const nation = s.nations.find((n) => n.id === agreement.countryId);
    const resource = RESOURCE_INDEX[agreement.resource];

    if (!nation) continue; // partner no longer simulated

    if (s.turn - agreement.signedTurn >= agreement.termMonths) {
      log(`The ${resource.name} agreement with ${nation.name} has run its term.`, 'neutral');
      continue;
    }

    // War and sanctions stop delivery without tearing up the contract, so it
    // resumes if relations recover before the term expires.
    const unreachable = nation.atWarWithPlayer || nation.sanctioned;
    if (unreachable && !agreement.suspended) {
      agreement.suspended = true;
      log(`${resource.name} deliveries from ${nation.name} have been suspended.`, 'bad');
    } else if (!unreachable && agreement.suspended) {
      agreement.suspended = false;
      log(`${resource.name} deliveries from ${nation.name} have resumed.`, 'good');
    }

    surviving.push(agreement);
  }

  s.tradeAgreements = surviving;

  // Contracted imports raise the stockpile; contracted exports draw it down.
  for (const id of Object.keys(s.resources) as ResourceId[]) {
    const flow = agreementFlow(s, id);
    if (flow !== 0) {
      s.resources[id].stockpile = Math.max(0, s.resources[id].stockpile + flow * 0.1);
    }
  }
}
