import type {
  BudgetDept,
  CoalitionPact,
  GameState,
  IdeologyId,
  LogEntry,
  PartyDemand,
  PoliticalParty,
  TaxKey,
} from '../types';
import { POLICIES } from '../data/policies';
import { GOVERNMENT_INDEX, IDEOLOGY_INDEX } from '../data/definitions';
import { clamp } from '../math';

/**
 * Coalition government.
 *
 * The legislature existed before this but could only be *paid* — every bill
 * cost more capital the less support you had, and there was nothing you could
 * do about the support itself. A pact is the missing half: you give a rival
 * party a concession it actually wants, and in exchange its seats vote with
 * you for a fixed term.
 *
 * Three rules make it a real decision rather than a free upgrade:
 *
 *  1. The concession is a *standing* commitment. Stop honouring it and the
 *     partner gives you a grace period, then walks — and walking out costs
 *     more support than you ever gained.
 *  2. The partner takes credit. While the pact holds their popular support
 *     grows slowly at your expense, so a permanent coalition slowly hands the
 *     next election to the people propping you up.
 *  3. Pacts expire. Renewal is a fresh negotiation at a fresh price, and the
 *     price tracks how much you need them.
 */

type Logger = (entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>) => void;

/** Months a pact runs before it has to be renegotiated. */
export const PACT_TERM_MONTHS = 48;

/** Months a partner tolerates a broken promise before walking out. */
export const BREACH_GRACE_MONTHS = 3;

/** The most partners you can hold together at once. */
export const MAX_COALITION_PARTNERS = 3;

/* ------------------------------------------------------------------ */
/* What a party wants                                                  */
/* ------------------------------------------------------------------ */

/** Budget line each ideology would name first, and the level it wants. */
const BUDGET_PRIORITY: Partial<Record<IdeologyId, { dept: BudgetDept; level: number }>> = {
  'social-democracy': { dept: 'welfare', level: 1.3 },
  socialist: { dept: 'welfare', level: 1.45 },
  progressive: { dept: 'education', level: 1.3 },
  green: { dept: 'environment', level: 1.4 },
  liberal: { dept: 'education', level: 1.2 },
  conservative: { dept: 'police', level: 1.25 },
  nationalist: { dept: 'military', level: 1.4 },
  traditionalist: { dept: 'culture', level: 1.3 },
  centrist: { dept: 'infrastructure', level: 1.2 },
  libertarian: { dept: 'research', level: 1.15 },
};

/** Tax each ideology would name first, and the rate it wants. */
const TAX_PRIORITY: Partial<Record<IdeologyId, { key: TaxKey; value: number; atMost: boolean }>> = {
  libertarian: { key: 'income', value: 22, atMost: true },
  conservative: { key: 'corporate', value: 20, atMost: true },
  socialist: { key: 'wealth', value: 3, atMost: false },
  'social-democracy': { key: 'capitalGains', value: 26, atMost: false },
  green: { key: 'carbon', value: 40, atMost: false },
  nationalist: { key: 'tariff', value: 12, atMost: false },
  progressive: { key: 'wealth', value: 2, atMost: false },
};

const BUDGET_LABELS: Record<BudgetDept, string> = {
  healthcare: 'health',
  education: 'education',
  military: 'defence',
  infrastructure: 'infrastructure',
  welfare: 'welfare',
  research: 'research',
  police: 'policing',
  environment: 'the environment',
  culture: 'culture',
  intelligence: 'intelligence',
};

const TAX_LABELS: Record<TaxKey, string> = {
  income: 'income tax',
  corporate: 'corporation tax',
  vat: 'VAT',
  capitalGains: 'capital gains tax',
  tariff: 'tariffs',
  wealth: 'the wealth tax',
  carbon: 'the carbon price',
  property: 'property tax',
};

/**
 * The single thing this party would trade its votes for.
 *
 * Deterministic: the same party in the same situation always asks for the same
 * thing, so a player can plan toward it rather than re-rolling for a demand
 * they like. It is chosen from what the party would plausibly want *and* what
 * the government is not already doing — asking for something already in place
 * would be a free pact.
 */
export function partyDemand(s: GameState, party: PoliticalParty): PartyDemand {
  const ideology = party.ideology;

  // 1. A flagship policy the party's ideology loves and the state has not passed.
  //    Restricted to policies that are actually enactable, so the ask is never
  //    something the player has no route to.
  const flagship = POLICIES
    .filter((p) => {
      if (s.activePolicies.includes(p.id)) return false;
      const appeal = p.ideologyAppeal?.[ideology] ?? 0;
      if (appeal < 8) return false;
      if (p.conflicts?.some((c) => s.activePolicies.includes(c))) return false;
      if (p.requires?.government && !p.requires.government.includes(s.identity.government)) return false;
      if (p.requires?.tech && !p.requires.tech.every((t) => s.research.completed.includes(t))) return false;
      if (p.requires?.policies && !p.requires.policies.every((t) => s.activePolicies.includes(t))) return false;
      return true;
    })
    .sort((a, b) => (b.ideologyAppeal?.[ideology] ?? 0) - (a.ideologyAppeal?.[ideology] ?? 0))[0];

  if (flagship) {
    return {
      kind: 'policy',
      key: flagship.id,
      label: `Enact ${flagship.name}`,
      detail: `${party.name} has campaigned on it for years. Passing it is the price of their votes, and repealing it would end the arrangement.`,
    };
  }

  // 2. A budget line they want funded above where it currently sits.
  const budget = BUDGET_PRIORITY[ideology];
  if (budget && s.budget[budget.dept].level < budget.level) {
    return {
      kind: 'budget',
      key: budget.dept,
      value: budget.level,
      label: `Fund ${BUDGET_LABELS[budget.dept]} at ${(budget.level * 100).toFixed(0)}%`,
      detail: `${party.name} will not sit in a government that funds ${BUDGET_LABELS[budget.dept]} below ${(budget.level * 100).toFixed(0)}% of the recommended baseline.`,
    };
  }

  // 3. A tax rate.
  const tax = TAX_PRIORITY[ideology];
  if (tax && (tax.atMost ? s.taxes[tax.key] > tax.value : s.taxes[tax.key] < tax.value)) {
    return {
      kind: 'tax',
      key: tax.key,
      value: tax.value,
      atMost: tax.atMost,
      label: `Hold ${TAX_LABELS[tax.key]} ${tax.atMost ? 'at or below' : 'at or above'} ${tax.value}%`,
      detail: `${party.name} has made ${TAX_LABELS[tax.key]} the test of whether this government is serious.`,
    };
  }

  // 4. Regional parties and anyone representing a restless province want
  //    devolution; everyone else falls back to civil liberties, which is the
  //    one ask that is always available and always means something.
  const restless = s.provinces.filter((p) => p.autonomy < 55).length;
  if (restless > 0 && (ideology === 'liberal' || ideology === 'green' || ideology === 'centrist')) {
    return {
      kind: 'devolution',
      key: 'autonomy',
      value: 55,
      label: 'Devolve power to every province',
      detail: `${party.name} wants no province left below 55 autonomy. Devolution is granted province by province, and it costs political capital each time.`,
    };
  }

  const target = Math.min(92, Math.round(s.society.civilLiberties + 8));
  return {
    kind: 'liberties',
    key: 'civilLiberties',
    value: target,
    label: `Raise civil liberties to ${target}`,
    detail: `${party.name} will support a government that widens civil freedoms and abandon one that narrows them.`,
  };
}

/** Whether a concession is currently being honoured. */
export function demandSatisfied(s: GameState, demand: PartyDemand): boolean {
  switch (demand.kind) {
    case 'policy':
      return s.activePolicies.includes(demand.key);
    case 'budget':
      return s.budget[demand.key as BudgetDept]?.level >= (demand.value ?? 1);
    case 'tax': {
      const rate = s.taxes[demand.key as TaxKey];
      return demand.atMost ? rate <= (demand.value ?? 0) : rate >= (demand.value ?? 0);
    }
    case 'devolution':
      return s.provinces.every((p) => p.autonomy >= (demand.value ?? 55));
    case 'liberties':
      return s.society.civilLiberties >= (demand.value ?? 50);
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* Forming and dissolving                                              */
/* ------------------------------------------------------------------ */

/** The player's own party, which is always in the coalition implicitly. */
export function ownPartyId(s: GameState): string {
  return `party-${s.leader.ideology}`;
}

export function isPartner(s: GameState, partyId: string): boolean {
  return s.governance.coalition.some((p) => p.partyId === partyId);
}

/**
 * Political capital it takes to bring a party in.
 *
 * The price is what they can extract, not what they are worth: a large party
 * that dislikes you is expensive precisely because you need it. Ideological
 * distance is the other half — a neighbour on the spectrum is cheap to sit
 * with, and the far side of the chamber is not.
 */
export function pactCost(s: GameState, party: PoliticalParty): number {
  const own = IDEOLOGY_INDEX[s.leader.ideology];
  const theirs = IDEOLOGY_INDEX[party.ideology];
  const distance =
    own && theirs
      ? Math.hypot(own.economicAxis - theirs.economicAxis, own.socialAxis - theirs.socialAxis) / 100
      : 1;

  const leverage = party.support / 22;
  const hostility = clamp((30 - party.relation) / 60, 0, 1.6);
  const desperation = clamp((55 - s.governance.legislativeSupport) / 55, 0, 1);

  return Math.round(
    clamp(14 + leverage * 9 + distance * 14 + hostility * 12 + desperation * 10, 12, 90),
  );
}

export interface PactAssessment {
  /** Capital required to open the deal. */
  cost: number;
  /** What they are asking for. */
  demand: PartyDemand;
  /** Whether the concession is already being honoured. */
  alreadyMet: boolean;
  /** Seats they would bring. */
  seats: number;
  /** Percentage points this would add to legislative support. */
  supportGain: number;
  enabled: boolean;
  reason: string | null;
}

/** Everything the player needs to decide whether to open negotiations. */
export function assessPact(s: GameState, partyId: string): PactAssessment {
  const party = s.parties.find((p) => p.id === partyId);
  const blank: PactAssessment = {
    cost: 0,
    demand: { kind: 'liberties', key: 'civilLiberties', label: '', detail: '' },
    alreadyMet: false,
    seats: 0,
    supportGain: 0,
    enabled: false,
    reason: 'Unknown party',
  };
  if (!party) return blank;

  const demand = partyDemand(s, party);
  const cost = pactCost(s, party);
  const alreadyMet = demandSatisfied(s, demand);
  // Their seats vote at 88 rather than at whatever their relation implies.
  const currentWilling = clamp(50 + party.relation * 0.5, 0, 100);
  const totalSupport = s.parties.reduce((sum, p) => sum + p.support, 0) || 100;
  const supportGain = ((party.support / totalSupport) * (88 - currentWilling));

  const base: PactAssessment = { cost, demand, alreadyMet, seats: party.seats, supportGain, enabled: true, reason: null };

  if (party.id === ownPartyId(s)) return { ...base, enabled: false, reason: 'This is your own party' };
  if (isPartner(s, partyId)) return { ...base, enabled: false, reason: 'Already in the coalition' };
  if (!GOVERNMENT_INDEX[s.identity.government]?.holdsElections) {
    return { ...base, enabled: false, reason: 'This government has no legislature to bargain with' };
  }
  if (s.governance.coalition.length >= MAX_COALITION_PARTNERS) {
    return { ...base, enabled: false, reason: `A government can hold at most ${MAX_COALITION_PARTNERS} partners together` };
  }
  if (party.relation <= -70) {
    return { ...base, enabled: false, reason: 'They will not take your call' };
  }
  if (s.governance.capital < cost) {
    return {
      ...base,
      enabled: false,
      reason: `Needs ${cost} political capital (you have ${Math.floor(s.governance.capital)})`,
    };
  }
  return base;
}

export interface CoalitionOutcome {
  ok: boolean;
  message: string;
}

/**
 * Opens a coalition with a rival party.
 *
 * The concession does not have to be in place first — the deal is that you
 * will deliver it. You get the votes immediately and a grace period to
 * honour the promise, which is exactly how these arrangements work.
 */
export function formCoalition(s: GameState, partyId: string, log?: Logger): CoalitionOutcome {
  const assessment = assessPact(s, partyId);
  if (!assessment.enabled) return { ok: false, message: assessment.reason ?? 'Not possible' };
  const party = s.parties.find((p) => p.id === partyId)!;

  s.governance.capital = Math.max(0, s.governance.capital - assessment.cost);
  s.governance.coalition.push({
    partyId,
    startedTurn: s.turn,
    endsTurn: s.turn + PACT_TERM_MONTHS,
    demand: assessment.demand,
    breached: false,
    breachMonths: 0,
    capitalPaid: assessment.cost,
  });
  s.governance.pactsFormed += 1;
  s.governance.momentum = clamp(s.governance.momentum + 12, -100, 100);
  party.relation = clamp(party.relation + 30, -100, 100);

  log?.({
    text: `${party.name} has joined the government. Their price: ${assessment.demand.label.toLowerCase()}.`,
    category: 'politics',
    tone: 'good',
    icon: '🤝',
  });
  return {
    ok: true,
    message: assessment.alreadyMet
      ? `${party.name} joins the coalition. Their condition is already met.`
      : `${party.name} joins the coalition. You have ${BREACH_GRACE_MONTHS} months to deliver: ${assessment.demand.label}.`,
  };
}

/** Ends a pact from the player's side. */
export function dissolveCoalition(s: GameState, partyId: string, log?: Logger): CoalitionOutcome {
  const index = s.governance.coalition.findIndex((p) => p.partyId === partyId);
  if (index < 0) return { ok: false, message: 'They are not in the coalition' };
  const party = s.parties.find((p) => p.id === partyId);

  s.governance.coalition.splice(index, 1);
  s.governance.pactsCollapsed += 1;
  s.governance.momentum = clamp(s.governance.momentum - 14, -100, 100);
  if (party) party.relation = clamp(party.relation - 34, -100, 100);

  log?.({
    text: `${party?.name ?? 'A coalition partner'} has been dismissed from the government.`,
    category: 'politics',
    tone: 'bad',
    icon: '💔',
  });
  return { ok: true, message: `${party?.name ?? 'The partner'} has left the government.` };
}

/* ------------------------------------------------------------------ */
/* Live effects                                                        */
/* ------------------------------------------------------------------ */

/**
 * Share of the legislature the coalition commands, 0–100.
 *
 * Your own party plus every partner still honouring its bargain. A breached
 * pact still counts — they have not walked yet — which is why the grace
 * period is a real window and not a formality.
 */
export function coalitionShare(s: GameState): number {
  const total = s.parties.reduce((sum, p) => sum + p.support, 0) || 100;
  const ids = new Set([ownPartyId(s), ...s.governance.coalition.map((p) => p.partyId)]);
  return (s.parties.filter((p) => ids.has(p.id)).reduce((sum, p) => sum + p.support, 0) / total) * 100;
}

/** True when the government commands the chamber outright. */
export function hasMajority(s: GameState): boolean {
  return coalitionShare(s) > 50;
}

/**
 * Discount on the political price of legislation, as a multiplier.
 *
 * A government with a working majority is not buying votes any more, so bills
 * get materially cheaper. Below a majority the discount tapers to nothing.
 */
export function coalitionDiscount(s: GameState): number {
  if (s.governance.coalition.length === 0) return 1;
  const share = coalitionShare(s);
  if (share <= 50) return clamp(1 - (share / 50) * 0.1, 0.9, 1);
  return clamp(0.9 - ((share - 50) / 50) * 0.25, 0.65, 0.9);
}

/**
 * Advances every pact by a month: breaches, grace periods, expiry and credit.
 *
 * Called from `updateGovernance` before legislative support is recomputed, so
 * a partner who walks out this month is felt in the same month's arithmetic.
 */
export function updateCoalition(s: GameState, log: Logger): void {
  if (!Array.isArray(s.governance.coalition)) s.governance.coalition = [];
  if (s.governance.coalition.length === 0) return;

  const surviving: CoalitionPact[] = [];

  for (const pact of s.governance.coalition) {
    const party = s.parties.find((p) => p.id === pact.partyId);
    if (!party) continue; // party no longer exists — the pact goes with it

    // --- Is the bargain still being kept? ---------------------------------
    const honoured = demandSatisfied(s, pact.demand);
    if (honoured) {
      if (pact.breached) {
        log({
          text: `${party.name} is satisfied: ${pact.demand.label.toLowerCase()} has been delivered. The coalition holds.`,
          category: 'politics',
          tone: 'good',
          icon: '🤝',
        });
      }
      pact.breached = false;
      pact.breachMonths = 0;
      party.relation = clamp(party.relation + 0.8, -100, 100);
    } else {
      if (!pact.breached) {
        pact.breached = true;
        pact.breachMonths = 0;
        log({
          text: `${party.name} is warning that the coalition agreement is not being honoured: ${pact.demand.label.toLowerCase()}. They will give it ${BREACH_GRACE_MONTHS} months.`,
          category: 'politics',
          tone: 'bad',
          icon: '⚠️',
        });
      }
      pact.breachMonths += 1;
      party.relation = clamp(party.relation - 3.5, -100, 100);

      if (pact.breachMonths > BREACH_GRACE_MONTHS) {
        // Walking out costs far more than the pact ever gained, which is the
        // whole reason a concession is a commitment rather than a purchase.
        s.governance.pactsCollapsed += 1;
        s.governance.momentum = clamp(s.governance.momentum - 26, -100, 100);
        s.governance.mandate = clamp(s.governance.mandate - 8, 0, 100);
        s.stability = clamp(s.stability - 3, 0, 100);
        party.relation = clamp(party.relation - 25, -100, 100);
        log({
          text: `${party.name} has walked out of the government over ${pact.demand.label.toLowerCase()}. The coalition has collapsed.`,
          category: 'politics',
          tone: 'critical',
          icon: '💔',
        });
        continue;
      }
    }

    // --- Term expiry -------------------------------------------------------
    if (s.turn >= pact.endsTurn) {
      s.governance.pactsCollapsed += 1;
      log({
        text: `The coalition agreement with ${party.name} has run its term and lapsed. It can be renegotiated.`,
        category: 'politics',
        tone: 'neutral',
        icon: '📜',
      });
      continue;
    }

    // --- Partners take credit ----------------------------------------------
    // Sitting in government is worth votes to them, and those votes come off
    // your own party's share. A permanent coalition slowly hands the next
    // election to the people propping you up.
    const own = s.parties.find((p) => p.id === ownPartyId(s));
    if (own && own.support > 6) {
      const transfer = Math.min(0.09, own.support * 0.0022);
      own.support -= transfer;
      party.support += transfer;
    }

    surviving.push(pact);
  }

  s.governance.coalition = surviving;
}
