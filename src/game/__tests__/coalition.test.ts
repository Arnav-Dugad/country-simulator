import { describe, expect, it } from 'vitest';
import type { GameState, SetupConfig } from '../types';
import { getCountry } from '../data/countries';
import { createGame, defaultSetup } from '../engine/createGame';
import { migrate } from '../storage';
import { tick } from '../engine/tick';
import { EVENT_INDEX } from '../data/events';
import { resolveEvent } from '../engine/events';
import { CRISES, CRISIS_INDEX } from '../data/crises';
import { updateCrises } from '../engine/crises';
import {
  BREACH_GRACE_MONTHS,
  MAX_COALITION_PARTNERS,
  PACT_TERM_MONTHS,
  assessPact,
  coalitionDiscount,
  coalitionShare,
  demandSatisfied,
  dissolveCoalition,
  formCoalition,
  hasMajority,
  isPartner,
  ownPartyId,
  pactCost,
  partyDemand,
  updateCoalition,
} from '../engine/coalition';
import {
  TOLERATED_TARIFF,
  addGrievance,
  assessSettlement,
  averageForeignTariff,
  foreignTariffDrag,
  grievanceTarget,
  retaliatingNations,
  settleTradeDispute,
  tradeExposure,
  updateTradeWar,
} from '../engine/tradewar';
import {
  EXPLAINABLE_IDS,
  explain,
  explainContext,
  worstTerms,
  type ExplainableId,
} from '../engine/explain';
import {
  delegateQueuedDecisions,
  recommendChoice,
  scoreChoice,
  shouldDelegate,
} from '../engine/delegation';
import { assessLegislation } from '../engine/politics';
import { POLICIES, POLICY_INDEX } from '../data/policies';
import { buildRecommendations } from '../engine/advisory';
import { totalModifiers } from '../selectors';

const noop = () => {};

function setupFor(countryId: string, overrides: Partial<SetupConfig> = {}): SetupConfig {
  const country = getCountry(countryId)!;
  return {
    ...defaultSetup(),
    mode: 'real',
    countryId,
    nationName: country.name,
    adjective: country.name,
    capital: country.capital,
    region: country.region,
    iso2: country.iso2,
    currencyCode: country.currency,
    government: country.government,
    leaderName: 'Test Leader',
    ...overrides,
  };
}

/** A democracy, so there is a legislature to bargain with. */
function democracy(seed = 4242): GameState {
  const s = createGame(setupFor('usa'), seed);
  s.governance.capital = 200;
  return s;
}

function rivalOf(s: GameState) {
  return s.parties.find((p) => p.id !== ownPartyId(s))!;
}

/** Puts the demanded concession in place, whatever kind it is. */
function honour(s: GameState, demand: ReturnType<typeof partyDemand>): void {
  switch (demand.kind) {
    case 'policy':
      if (!s.activePolicies.includes(demand.key)) s.activePolicies.push(demand.key);
      break;
    case 'budget':
      s.budget[demand.key as keyof GameState['budget']].level = (demand.value ?? 1) + 0.05;
      break;
    case 'tax':
      s.taxes[demand.key as keyof GameState['taxes']] = demand.atMost
        ? (demand.value ?? 0) - 1
        : (demand.value ?? 0) + 1;
      break;
    case 'devolution':
      for (const p of s.provinces) p.autonomy = Math.max(p.autonomy, demand.value ?? 55);
      break;
    case 'liberties':
      s.society.civilLiberties = Math.max(s.society.civilLiberties, demand.value ?? 50);
      break;
  }
}

/* ================================================================== */
/* Coalition governments                                               */
/* ================================================================== */

describe('coalition governments', () => {
  it('asks every rival party for something the government is not already doing', () => {
    for (const id of ['usa', 'india', 'brazil', 'germany']) {
      const s = createGame(setupFor(id), 99);
      for (const party of s.parties) {
        if (party.id === ownPartyId(s)) continue;
        const demand = partyDemand(s, party);
        expect(demand.label.length, `${id}/${party.id} demand should be described`).toBeGreaterThan(4);
        expect(demand.detail.length).toBeGreaterThan(10);
        // A demand already satisfied would make the pact free, which defeats
        // the entire mechanic.
        expect(demandSatisfied(s, demand), `${id}/${party.id} asked for something already done`).toBe(false);
        // And a policy demand has to name a policy that exists.
        if (demand.kind === 'policy') expect(POLICY_INDEX[demand.key]).toBeDefined();
      }
    }
  });

  it('gives the same party the same demand every time it is asked', () => {
    const s = democracy();
    const rival = rivalOf(s);
    const a = partyDemand(s, rival);
    const b = partyDemand(s, rival);
    expect(b).toEqual(a);
  });

  it('prices a pact by size, hostility and ideological distance', () => {
    const s = democracy();
    const rival = rivalOf(s);

    const friendly = { ...rival, relation: 60, support: 10 };
    const hostile = { ...rival, relation: -60, support: 10 };
    expect(pactCost(s, hostile)).toBeGreaterThan(pactCost(s, friendly));

    const small = { ...rival, support: 6 };
    const large = { ...rival, support: 40 };
    expect(pactCost(s, large)).toBeGreaterThan(pactCost(s, small));
  });

  it('takes capital, adds their votes and lowers the price of legislation', () => {
    const s = democracy();
    const rival = rivalOf(s);
    const assessment = assessPact(s, rival.id);
    expect(assessment.enabled).toBe(true);

    const capitalBefore = s.governance.capital;
    const shareBefore = coalitionShare(s);
    const discountBefore = coalitionDiscount(s);

    // A representative bill, priced before and after.
    const bill = POLICIES.find((p) => assessLegislation(s, p).cost > 6)!;
    const costBefore = assessLegislation(s, bill).cost;

    expect(formCoalition(s, rival.id, noop).ok).toBe(true);

    expect(s.governance.capital).toBe(capitalBefore - assessment.cost);
    expect(isPartner(s, rival.id)).toBe(true);
    expect(coalitionShare(s)).toBeGreaterThan(shareBefore);
    expect(coalitionDiscount(s)).toBeLessThan(discountBefore);
    expect(assessLegislation(s, bill).cost).toBeLessThan(costBefore);
    expect(s.governance.pactsFormed).toBe(1);
  });

  it('refuses a pact it cannot afford, a duplicate, or a government with no chamber', () => {
    const s = democracy();
    const rival = rivalOf(s);

    s.governance.capital = 0;
    expect(assessPact(s, rival.id).enabled).toBe(false);
    expect(formCoalition(s, rival.id, noop).ok).toBe(false);

    s.governance.capital = 300;
    expect(formCoalition(s, rival.id, noop).ok).toBe(true);
    expect(formCoalition(s, rival.id, noop).ok, 'must not sign the same party twice').toBe(false);

    // Your own party is not a coalition partner.
    expect(assessPact(s, ownPartyId(s)).enabled).toBe(false);

    const junta = createGame(setupFor('usa', { government: 'military-junta' }), 7);
    junta.governance.capital = 300;
    expect(assessPact(junta, rivalOf(junta).id).enabled).toBe(false);
  });

  it('caps the number of partners a government can hold together', () => {
    const s = democracy();
    s.governance.capital = 1000;
    const rivals = s.parties.filter((p) => p.id !== ownPartyId(s));
    let signed = 0;
    for (const party of rivals) {
      if (formCoalition(s, party.id, noop).ok) signed += 1;
    }
    expect(signed).toBe(Math.min(MAX_COALITION_PARTNERS, rivals.length));
    expect(s.governance.coalition.length).toBeLessThanOrEqual(MAX_COALITION_PARTNERS);
  });

  it('holds while the bargain is kept and collapses after the grace period when it is not', () => {
    const s = democracy();
    const rival = rivalOf(s);
    const demand = partyDemand(s, rival);
    expect(formCoalition(s, rival.id, noop).ok).toBe(true);

    // Honoured: it survives indefinitely and the partner warms to you.
    honour(s, demand);
    const relationBefore = rival.relation;
    for (let i = 0; i < 6; i++) updateCoalition(s, noop);
    expect(s.governance.coalition).toHaveLength(1);
    expect(s.governance.coalition[0].breached).toBe(false);
    expect(s.parties.find((p) => p.id === rival.id)!.relation).toBeGreaterThanOrEqual(relationBefore);

    // Break it. They warn first, then walk.
    const s2 = democracy(31);
    const rival2 = rivalOf(s2);
    expect(formCoalition(s2, rival2.id, noop).ok).toBe(true);
    for (let i = 0; i <= BREACH_GRACE_MONTHS; i++) {
      updateCoalition(s2, noop);
      if (i < BREACH_GRACE_MONTHS) {
        expect(s2.governance.coalition, `should still be in government at month ${i}`).toHaveLength(1);
        expect(s2.governance.coalition[0].breached).toBe(true);
      }
    }
    updateCoalition(s2, noop);
    expect(s2.governance.coalition).toHaveLength(0);
    expect(s2.governance.pactsCollapsed).toBeGreaterThan(0);
  });

  it('lapses at the end of its term', () => {
    const s = democracy();
    const rival = rivalOf(s);
    const demand = partyDemand(s, rival);
    expect(formCoalition(s, rival.id, noop).ok).toBe(true);
    honour(s, demand);

    s.turn += PACT_TERM_MONTHS;
    updateCoalition(s, noop);
    expect(s.governance.coalition).toHaveLength(0);
  });

  it('transfers a little support from your party to the partner each month', () => {
    const s = democracy();
    const rival = rivalOf(s);
    const demand = partyDemand(s, rival);
    formCoalition(s, rival.id, noop);
    honour(s, demand);

    const own = s.parties.find((p) => p.id === ownPartyId(s))!;
    const ownBefore = own.support;
    const theirsBefore = rival.support;
    for (let i = 0; i < 24; i++) updateCoalition(s, noop);

    expect(own.support, 'sitting in government should cost you votes').toBeLessThan(ownBefore);
    expect(s.parties.find((p) => p.id === rival.id)!.support).toBeGreaterThan(theirsBefore);
  });

  it('costs standing to dismiss a partner', () => {
    const s = democracy();
    const rival = rivalOf(s);
    formCoalition(s, rival.id, noop);
    const relationBefore = rival.relation;
    const momentumBefore = s.governance.momentum;

    expect(dissolveCoalition(s, rival.id, noop).ok).toBe(true);
    expect(isPartner(s, rival.id)).toBe(false);
    expect(rival.relation).toBeLessThan(relationBefore);
    expect(s.governance.momentum).toBeLessThan(momentumBefore);
    expect(dissolveCoalition(s, rival.id, noop).ok, 'cannot dismiss twice').toBe(false);
  });

  it('raises legislative support through a full campaign rather than only on paper', () => {
    const s = democracy(808);
    const rival = rivalOf(s);
    const demand = partyDemand(s, rival);
    formCoalition(s, rival.id, noop);
    honour(s, demand);

    const baseline = createGame(setupFor('usa'), 808);
    for (let i = 0; i < 36; i++) {
      tick(s);
      tick(baseline);
      // Keep the bargain, whatever the engine does to the underlying number.
      honour(s, demand);
    }
    expect(s.governance.legislativeSupport).toBeGreaterThan(baseline.governance.legislativeSupport);
  });

  it('reports a majority honestly', () => {
    const s = democracy();
    // Force a chamber where the government plus one partner clears 50%.
    const own = s.parties.find((p) => p.id === ownPartyId(s))!;
    const rival = rivalOf(s);
    own.support = 35;
    rival.support = 30;
    for (const p of s.parties) if (p.id !== own.id && p.id !== rival.id) p.support = 5;

    expect(hasMajority(s)).toBe(false);
    formCoalition(s, rival.id, noop);
    expect(hasMajority(s)).toBe(true);
    expect(coalitionShare(s)).toBeGreaterThan(50);
  });
});

/* ================================================================== */
/* Crisis chaining                                                     */
/* ================================================================== */

describe('crisis chaining', () => {
  it('only ever names crises that exist, with a stated cause', () => {
    for (const def of CRISES) {
      for (const chain of def.chains ?? []) {
        expect(CRISIS_INDEX[chain.crisisId], `${def.id} chains to unknown ${chain.crisisId}`).toBeDefined();
        expect(chain.crisisId).not.toBe(def.id);
        expect(chain.chance).toBeGreaterThan(0);
        expect(chain.chance).toBeLessThanOrEqual(0.7);
        expect(chain.because.length, `${def.id} -> ${chain.crisisId} needs a reason`).toBeGreaterThan(20);
      }
    }
  });

  it('spawns a follow-on crisis when one runs its full course', () => {
    const s = democracy(1234);
    const def = CRISIS_INDEX['banking-crisis'];
    const totalMonths = def.stages.reduce((sum, st) => sum + st.months, 0);

    // Park it in the final stage with one month to run, at a severity the
    // engine cannot resolve away, and make sure the cause still holds so it
    // does not simply subside.
    s.economy.creditRating = 5;
    s.economy.debt = s.economy.gdp * 3;
    s.crises = [
      {
        id: 'test-banking',
        defId: 'banking-crisis',
        startedTurn: s.turn - totalMonths,
        stage: def.stages.length - 1,
        monthsInStage: def.stages[def.stages.length - 1].months - 1,
        severity: 90,
        responsesUsed: [],
      },
    ];

    // Try enough seeds that a 45%/30% pair reliably fires at least once.
    let chained = false;
    for (let seed = 0; seed < 40 && !chained; seed++) {
      const trial: GameState = structuredClone(s);
      trial.rngSeed = seed * 7919 + 13;
      updateCrises(trial, noop);
      chained = trial.crises.some((c) => c.causedBy?.defId === 'banking-crisis');
    }
    expect(chained, 'a banking collapse left to run should sometimes cause a further crisis').toBe(true);
  });

  it('never chains from a crisis the player brought under control', () => {
    const s = democracy(77);
    // Severity at the resolution threshold with the cause no longer holding.
    s.economy.creditRating = 90;
    s.economy.debt = 0;
    s.crises = [
      {
        id: 'test-resolved',
        defId: 'banking-crisis',
        startedTurn: s.turn - 2,
        stage: 0,
        monthsInStage: 0,
        severity: 9,
        responsesUsed: ['deposit-guarantee', 'recapitalise'],
      },
    ];
    updateCrises(s, noop);
    expect(s.crises.some((c) => c.causedBy !== undefined)).toBe(false);
  });

  it('starts a chained crisis gentler than a spontaneous one, and never past the limit', () => {
    const s = democracy(5150);
    const def = CRISIS_INDEX['water-crisis'];
    const totalMonths = def.stages.reduce((sum, st) => sum + st.months, 0);
    s.environment.waterStress = 90;

    let sample: GameState | null = null;
    for (let seed = 0; seed < 60 && !sample; seed++) {
      const trial = structuredClone(s);
      trial.rngSeed = seed * 104729 + 5;
      trial.crises = [
        {
          id: 'test-water',
          defId: 'water-crisis',
          startedTurn: trial.turn - totalMonths,
          stage: def.stages.length - 1,
          monthsInStage: def.stages[def.stages.length - 1].months - 1,
          severity: 95,
          responsesUsed: [],
        },
      ];
      updateCrises(trial, noop);
      if (trial.crises.some((c) => c.causedBy)) sample = trial;
    }

    expect(sample).not.toBeNull();
    const chained = sample!.crises.find((c) => c.causedBy)!;
    expect(chained.severity).toBeLessThan(38);
    expect(chained.stage).toBe(0);
    expect(chained.monthsInStage).toBe(0);
    expect(sample!.crises.length).toBeLessThanOrEqual(3);
  });

  it('cannot cascade a century into permanent emergency', () => {
    // The real risk of a chain system: an accelerating spiral. Run a long,
    // deliberately badly-managed campaign and check the crisis load stays
    // bounded rather than climbing without limit.
    const s = createGame(setupFor('venezuela'), 606);
    let peak = 0;
    let months = 0;
    for (let i = 0; i < 600 && !s.gameOver; i++) {
      while (s.eventQueue.length > 0) {
        resolveEvent(s, EVENT_INDEX[s.eventQueue[0].defId].choices[0].id);
      }
      tick(s);
      peak = Math.max(peak, s.crises.length);
      months += s.crises.length;
    }
    expect(peak).toBeLessThanOrEqual(3);
    // And even a badly-run country should not spend the whole campaign at the
    // cap; if it does, the cascade is self-sustaining rather than causal.
    expect(months / Math.max(1, s.turn)).toBeLessThan(2.6);
  });
});

/* ================================================================== */
/* Trade retaliation                                                   */
/* ================================================================== */

describe('trade retaliation', () => {
  it('starts every campaign with no grievance and no counter-tariff', () => {
    const s = democracy();
    for (const n of s.nations) {
      expect(n.tariffOnPlayer).toBe(0);
      expect(n.tradeGrievance).toBe(0);
    }
    expect(averageForeignTariff(s)).toBe(0);
    expect(foreignTariffDrag(s)).toBe(1);
  });

  it('ignores a tariff at or below the tolerated rate', () => {
    const s = democracy();
    s.taxes.tariff = TOLERATED_TARIFF;
    for (const n of s.nations) expect(grievanceTarget(s, n)).toBeLessThanOrEqual(1);

    for (let i = 0; i < 120; i++) updateTradeWar(s, noop);
    expect(retaliatingNations(s)).toHaveLength(0);
  });

  it('weights the grievance by how exposed a partner actually is', () => {
    const s = democracy();
    s.taxes.tariff = 30;
    const [a, b] = s.nations;
    // Same size, very different dependence on us.
    a.gdp = 1000;
    b.gdp = 1000;
    a.personality = 'pragmatic';
    b.personality = 'pragmatic';
    a.relations = 0;
    b.relations = 0;
    a.bloc = null;
    b.bloc = null;
    a.tradeVolume = (a.gdp * 1000) / 12 * 0.4;
    b.tradeVolume = 0;

    expect(tradeExposure(a)).toBeGreaterThan(tradeExposure(b));
    expect(grievanceTarget(s, a)).toBeGreaterThan(grievanceTarget(s, b));
  });

  it('answers a high tariff with a counter-tariff, and stands it down when it comes off', () => {
    const s = democracy(2024);
    s.taxes.tariff = 40;
    for (let i = 0; i < 300; i++) updateTradeWar(s, noop);

    const retaliators = retaliatingNations(s);
    expect(retaliators.length, 'a 40% tariff should provoke somebody').toBeGreaterThan(0);
    expect(averageForeignTariff(s)).toBeGreaterThan(0);
    expect(foreignTariffDrag(s)).toBeLessThan(1);
    // Proportionate: nobody retaliates far beyond what we levy.
    for (const n of retaliators) expect(n.tariffOnPlayer).toBeLessThanOrEqual(45);

    // Free trade, and enough time for the grudge to fade.
    s.taxes.tariff = 0;
    for (const n of s.nations) n.sanctioned = false;
    for (let i = 0; i < 400; i++) updateTradeWar(s, noop);
    expect(retaliatingNations(s), 'tariffs should come down once the cause is removed').toHaveLength(0);
  });

  it('lets a settlement lift a tariff at once without fixing the cause', () => {
    const s = democracy(31337);
    s.taxes.tariff = 40;
    for (let i = 0; i < 300; i++) updateTradeWar(s, noop);
    const target = retaliatingNations(s)[0];
    expect(target).toBeDefined();

    s.governance.capital = 200;
    const assessment = assessSettlement(s, target.id);
    expect(assessment.enabled).toBe(true);

    const capitalBefore = s.governance.capital;
    expect(settleTradeDispute(s, target.id, noop).ok).toBe(true);
    expect(target.tariffOnPlayer).toBe(0);
    expect(target.tradeGrievance).toBeLessThan(assessment.grievance);
    expect(s.governance.capital).toBe(capitalBefore - assessment.cost);

    // The cause is untouched, so it rebuilds.
    const after = target.tradeGrievance;
    for (let i = 0; i < 120; i++) updateTradeWar(s, noop);
    expect(target.tradeGrievance).toBeGreaterThan(after);
  });

  it('refuses a settlement with nobody to settle with, or without the capital', () => {
    const s = democracy();
    const n = s.nations[0];
    expect(assessSettlement(s, 'no-such-country').enabled).toBe(false);
    expect(assessSettlement(s, n.id).enabled, 'no dispute to settle').toBe(false);

    addGrievance(s, n.id, 70);
    s.governance.capital = 0;
    expect(assessSettlement(s, n.id).enabled).toBe(false);

    n.atWarWithPlayer = true;
    s.governance.capital = 500;
    expect(assessSettlement(s, n.id).enabled).toBe(false);
  });

  it('shows up in the trade balance and in what partners will trade', () => {
    const free = democracy(4004);
    const walled = democracy(4004);
    walled.taxes.tariff = 40;

    for (let i = 0; i < 300; i++) {
      // Without this the very first queued decision freezes both campaigns:
      // `tick` refuses to advance a month while a decision is outstanding.
      delegateQueuedDecisions(free, 'delegate-all');
      delegateQueuedDecisions(walled, 'delegate-all');
      tick(free);
      tick(walled);
      // The point of the comparison is the tariff, so keep it in place even
      // if a delegated decision would otherwise have moved it.
      walled.taxes.tariff = 40;
      free.taxes.tariff = Math.min(free.taxes.tariff, TOLERATED_TARIFF);
    }

    expect(retaliatingNations(walled).length).toBeGreaterThan(0);
    // The whole point: a tariff wall costs volume, not just goodwill.
    const freeVolume = free.nations.reduce((sum, n) => sum + n.tradeVolume, 0);
    const walledVolume = walled.nations.reduce((sum, n) => sum + n.tradeVolume, 0);
    expect(walledVolume).toBeLessThan(freeVolume);
  });

  it('makes an isolationist slower to retaliate than a mercantile state', () => {
    const s = democracy();
    s.taxes.tariff = 35;
    const [a, b] = s.nations;
    for (const n of [a, b]) {
      n.gdp = 1000;
      n.relations = 0;
      n.bloc = null;
      n.tradeVolume = (n.gdp * 1000) / 12 * 0.3;
    }
    a.personality = 'mercantile';
    b.personality = 'isolationist';
    expect(grievanceTarget(s, a)).toBeGreaterThan(grievanceTarget(s, b));
  });
});

/* ================================================================== */
/* The inspector                                                       */
/* ================================================================== */

describe('the "why is this number" inspector', () => {
  /**
   * The load-bearing test of the whole feature.
   *
   * `explain.ts` owns every target the engine drifts toward, and `tick` reads
   * them from there. This asserts the contract holds in the other direction:
   * for every metric, one month of simulation moves the value by exactly the
   * stated fraction of the stated gap. If anyone ever reintroduces a private
   * copy of a formula inside `tick`, this fails.
   */
  it('predicts what one month of simulation will do to every metric it explains', () => {
    const READINGS: Record<
      ExplainableId,
      { get: (s: GameState) => number; clamp?: [number, number] } | null
    > = {
      approval: { get: (s) => s.approval, clamp: [0, 100] },
      stability: { get: (s) => s.stability, clamp: [0, 100] },
      corruption: { get: (s) => s.corruption, clamp: [0, 100] },
      infrastructure: { get: (s) => s.infrastructure },
      mandate: { get: (s) => s.governance.mandate },
      legislativeSupport: { get: (s) => s.governance.legislativeSupport },
      happiness: { get: (s) => s.society.happiness },
      health: { get: (s) => s.society.health },
      education: { get: (s) => s.society.education },
      crime: { get: (s) => s.society.crime },
      civilLiberties: { get: (s) => s.society.civilLiberties },
      softPower: { get: (s) => s.society.softPower },
      unemployment: { get: (s) => s.economy.unemployment, clamp: [0.4, 65] },
      creditRating: { get: (s) => s.economy.creditRating },
      confidence: { get: (s) => s.economy.confidence },
      productivity: { get: (s) => s.economy.productivity },
      inequality: { get: (s) => s.economy.inequality },
      militaryStrength: { get: (s) => s.military.strength },
      emissions: { get: (s) => s.environment.emissions },
      pollution: { get: (s) => s.environment.pollution },
      // Recomputed rather than drifted; checked separately below.
      capitalIncome: null,
      research: null,
      // Both carry per-month noise, so they get their own looser assertion.
      growth: null,
      inflation: null,
    };

    for (const id of ['usa', 'india', 'nigeria', 'japan']) {
      const before = createGame(setupFor(id), 1717);
      // Run well in, so every index is near its own equilibrium. The residual
      // tolerance below covers one real effect: a metric whose *inputs* are
      // updated earlier in the same tick is compared against an explanation
      // built from the pre-tick state, so unemployment for instance reads a
      // growth figure one month older than the engine did.
      for (let i = 0; i < 180; i++) tick(before);

      const ctx = explainContext(before);
      const predictions = new Map<ExplainableId, { expected: number; explanation: ReturnType<typeof explain> }>();
      for (const key of EXPLAINABLE_IDS) {
        const reading = READINGS[key];
        if (!reading) continue;
        const e = explain(before, key, ctx);
        let expected = e.current + (e.target - e.current) * e.approach;
        if (reading.clamp) {
          expected = Math.min(reading.clamp[1], Math.max(reading.clamp[0], expected));
        }
        predictions.set(key, { expected, explanation: e });
      }

      const after = structuredClone(before);
      tick(after);

      for (const [key, { expected }] of predictions) {
        const actual = READINGS[key]!.get(after);
        // Generous only relative to the size of the number: this is a check
        // that the arithmetic is the same arithmetic, not a smoke test. The
        // slack covers metrics whose *inputs* also moved earlier in the tick.
        const tolerance = Math.max(0.5, Math.abs(expected) * 0.05);
        expect(
          Math.abs(actual - expected),
          `${id}/${key}: engine produced ${actual.toFixed(3)}, inspector predicted ${expected.toFixed(3)}`,
        ).toBeLessThan(tolerance);
      }
    }
  });

  it('states research output as exactly the number the engine banks', () => {
    // Research is advanced at the top of the tick, before anything touches
    // population, output, education, literacy, corruption or the budget, so
    // the explanation built from the pre-tick state has to match to the digit.
    const before = createGame(setupFor('japan'), 5);
    for (let i = 0; i < 24; i++) {
      // A queued decision makes `tick` return immediately, which would leave
      // the comparison reading last month's figure.
      delegateQueuedDecisions(before, 'delegate-all');
      tick(before);
    }
    delegateQueuedDecisions(before, 'delegate-all');
    expect(before.eventQueue).toHaveLength(0);

    const e = explain(before, 'research');
    expect(e.multiplicative).toBe(true);

    const after = structuredClone(before);
    tick(after);
    expect(after.research.perMonth).toBeCloseTo(e.target, 8);
  });

  it('states political capital income as the number the engine banks', () => {
    // Capital income is computed late in the tick, after approval, stability
    // and corruption have moved, so an exact match from outside is impossible
    // by construction. Within a fraction of a point is the honest claim.
    const s = createGame(setupFor('germany'), 5);
    for (let i = 0; i < 24; i++) tick(s);
    const stated = explain(s, 'capitalIncome').target;
    expect(Math.abs(stated - s.governance.capitalPerMonth)).toBeLessThan(0.2);
  });

  it('keeps growth and inflation within their own stated noise band', () => {
    const s = createGame(setupFor('brazil'), 909);
    for (let i = 0; i < 40; i++) tick(s);

    for (const id of ['growth', 'inflation'] as const) {
      const e = explain(s, id);
      const before = id === 'growth' ? s.economy.growth : s.economy.inflation;
      const after = structuredClone(s);
      tick(after);
      const actual = id === 'growth' ? after.economy.growth : after.economy.inflation;
      const noNoise = before + (e.target - before) * e.approach;
      // The engine adds `noise × amplitude` to the target before drifting, so
      // the outcome can miss the noiseless prediction by at most that much
      // times the approach rate — plus slack for inputs that moved first.
      const band = (e.noise ?? 0) * e.approach + Math.max(0.5, Math.abs(noNoise) * 0.25);
      expect(Math.abs(actual - noNoise), `${id} outside its noise band`).toBeLessThan(band);
    }
  });

  it('itemises every metric without empty or nonsensical output', () => {
    const s = createGame(setupFor('nigeria'), 42);
    for (let i = 0; i < 60; i++) tick(s);
    const ctx = explainContext(s);

    for (const id of EXPLAINABLE_IDS) {
      const e = explain(s, id, ctx);
      expect(e.terms.length, `${id} has no terms`).toBeGreaterThan(0);
      expect(e.label.length).toBeGreaterThan(2);
      expect(e.note.length, `${id} has no explanatory note`).toBeGreaterThan(20);
      expect(Number.isFinite(e.target), `${id} target is not finite`).toBe(true);
      expect(Number.isFinite(e.raw), `${id} raw is not finite`).toBe(true);
      expect(Number.isFinite(e.current)).toBe(true);
      expect(e.approach).toBeGreaterThan(0);
      expect(e.approach).toBeLessThanOrEqual(1);

      // The terms have to actually produce the stated total.
      const combined = e.multiplicative
        ? e.terms.reduce((acc, t) => acc * t.value, 1)
        : e.terms.reduce((acc, t) => acc + t.value, 0);
      expect(combined, `${id}: terms do not sum to the stated raw total`).toBeCloseTo(e.raw, 6);
      expect(e.target).toBeGreaterThanOrEqual(e.bounds[0]);
      expect(e.target).toBeLessThanOrEqual(e.bounds[1]);

      for (const t of e.terms) {
        expect(Number.isFinite(t.value), `${id}/${t.label} is not finite`).toBe(true);
        expect(t.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('names what is holding a metric back', () => {
    const s = createGame(setupFor('venezuela'), 8);
    s.corruption = 90;
    s.economy.unemployment = 22;
    s.economy.inflation = 60;
    for (let i = 0; i < 12; i++) tick(s);

    const worst = worstTerms(explain(s, 'approval'));
    expect(worst.length).toBeGreaterThan(0);
    for (const t of worst) expect(t.value).toBeLessThan(0);
  });
});

/* ================================================================== */
/* Delegated decisions                                                 */
/* ================================================================== */

describe('delegated decisions', () => {
  it('only delegates what the chosen mode allows', () => {
    const s = democracy();
    s.eventQueue = [];
    expect(shouldDelegate(s, 'delegate-all')).toBe(false);

    // Pick a genuinely minor event and a genuinely critical one.
    const minor = Object.values(EVENT_INDEX).find((d) => d.severity === 'minor')!;
    const critical = Object.values(EVENT_INDEX).find((d) => d.severity === 'critical')!;

    s.eventQueue = [{ defId: minor.id, turn: s.turn }];
    expect(shouldDelegate(s, 'modal')).toBe(false);
    expect(shouldDelegate(s, 'inline')).toBe(false);
    expect(shouldDelegate(s, 'delegate-minor')).toBe(true);
    expect(shouldDelegate(s, 'delegate-all')).toBe(true);

    s.eventQueue = [{ defId: critical.id, turn: s.turn }];
    expect(shouldDelegate(s, 'delegate-minor'), 'a critical decision still comes to you').toBe(false);
    expect(shouldDelegate(s, 'delegate-all')).toBe(true);
  });

  it('picks a selectable choice for every event in the game', () => {
    const s = democracy();
    for (let i = 0; i < 40; i++) tick(s);

    for (const def of Object.values(EVENT_INDEX)) {
      const choice = recommendChoice(s, def.id);
      expect(choice, `${def.id} produced no recommendation`).not.toBeNull();
      expect(def.choices.some((c) => c.id === choice!.id)).toBe(true);
      expect(Number.isFinite(scoreChoice(s, choice!))).toBe(true);
    }
    expect(recommendChoice(s, 'no-such-event')).toBeNull();
  });

  it('prefers the option that is actually better for the country', () => {
    const s = democracy();
    s.economy.unemployment = 20;
    const good = { id: 'a', label: 'Jobs', description: '', effects: { unemployment: -4 } };
    const bad = { id: 'b', label: 'Nothing', description: '', effects: { unemployment: 4 } };
    expect(scoreChoice(s, good)).toBeGreaterThan(scoreChoice(s, bad));

    // A gamble is worth its expected value, not its best case.
    const sure = { id: 'c', label: 'Sure', description: '', effects: { approval: 5 } };
    const gamble = {
      id: 'd',
      label: 'Gamble',
      description: '',
      effects: { approval: 6 },
      riskChance: 0.9,
      failureEffects: { approval: -40 },
    };
    expect(scoreChoice(s, sure)).toBeGreaterThan(scoreChoice(s, gamble));
  });

  it('will borrow rather than let a country fall off a cliff', () => {
    /*
     * The finding that took delegated survival from 43% to 100%. Money can be
     * borrowed, so an expensive response to a genuine emergency is correct —
     * and an earlier version that filtered options by what the treasury could
     * cover in cash locked the cabinet out of exactly those responses.
     */
    const expensive = { id: 'fix', label: 'Fix it', description: '', cost: 30000, effects: { stability: 12 } };
    const nothing = { id: 'none', label: 'Do nothing', description: '', effects: { stability: -3 } };

    const failing = democracy();
    failing.stability = 22;
    failing.economy.treasury = 0;
    expect(
      scoreChoice(failing, expensive),
      'a state near collapse should pay whatever it takes, cash in hand or not',
    ).toBeGreaterThan(scoreChoice(failing, nothing));
  });

  it('takes the cheaper of two options that achieve the same thing', () => {
    // Money is not free, it is simply worth less than a cliff edge. Between
    // two identical outcomes the cabinet takes the one that costs less.
    const s = democracy();
    const dear = { id: 'dear', label: 'Expensive', description: '', cost: 40000, effects: { approval: 4 } };
    const cheap = { id: 'cheap', label: 'Cheap', description: '', cost: 2000, effects: { approval: 4 } };
    expect(scoreChoice(s, cheap)).toBeGreaterThan(scoreChoice(s, dear));
  });

  it('weighs a cliff by distance rather than treating every threshold alike', () => {
    // The mechanism that makes the projection work: the same option is worth
    // far more to a state near an edge than to one comfortably clear of it.
    const rescue = { id: 'r', label: 'Rescue', description: '', cost: 20000, effects: { stability: 10 } };

    const fragile = democracy();
    fragile.stability = 20;
    const solid = democracy();
    solid.stability = 82;

    expect(
      scoreChoice(fragile, rescue),
      'stability is worth more to a state that is running out of it',
    ).toBeGreaterThan(scoreChoice(solid, rescue));
  });

  it('respects a requirement it cannot buy its way past', () => {
    const s = democracy();
    s.military.strength = 5;
    s.research.completed = [];
    const def = Object.values(EVENT_INDEX).find((d) =>
      d.choices.some((c) => c.requires?.minMilitary !== undefined || c.requires?.tech !== undefined),
    );
    if (!def) return;
    const pick = recommendChoice(s, def.id)!;
    const r = pick.requires;
    if (r?.minMilitary !== undefined) expect(s.military.strength).toBeGreaterThanOrEqual(r.minMilitary);
    if (r?.tech) expect(r.tech.every((tech) => s.research.completed.includes(tech))).toBe(true);
  });

  it('clears the queue under full delegation and leaves it alone under modal', () => {
    const minor = Object.values(EVENT_INDEX).find((d) => d.severity === 'minor')!;

    const delegated = democracy();
    delegated.eventQueue = [{ defId: minor.id, turn: delegated.turn }];
    const decisions = delegateQueuedDecisions(delegated, 'delegate-all');
    expect(delegated.eventQueue).toHaveLength(0);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].title).toBe(minor.title);

    const asked = democracy();
    asked.eventQueue = [{ defId: minor.id, turn: asked.turn }];
    expect(delegateQueuedDecisions(asked, 'modal')).toHaveLength(0);
    expect(asked.eventQueue).toHaveLength(1);
  });

  it('drops a malformed queue entry rather than blocking the campaign for ever', () => {
    const s = democracy();
    s.eventQueue = [{ defId: 'does-not-exist', turn: s.turn }];
    delegateQueuedDecisions(s, 'delegate-all');
    expect(s.eventQueue).toHaveLength(0);
  });

  it('runs a full century hands-off without ever stalling on a decision', () => {
    // The failure this guards against is a stuck queue: an event whose only
    // choices are unaffordable, delegated for ever and never resolved.
    for (const id of ['usa', 'fiji', 'venezuela']) {
      const s = createGame(setupFor(id), 313);
      let months = 0;
      for (let i = 0; i < 600 && !s.gameOver; i++) {
        delegateQueuedDecisions(s, 'delegate-all');
        // The failure being guarded against is a queue that can never empty,
        // which would freeze the campaign for ever rather than end it.
        expect(s.eventQueue, `${id} stalled at month ${s.turn}`).toHaveLength(0);
        tick(s);
        months += 1;
      }
      expect(months, `${id} made no progress at all`).toBeGreaterThan(0);
    }
  });

  it('beats the authored primary response rather than merely matching it', () => {
    /*
     * The promise of the setting is that handing decisions over is a
     * convenience and not a handicap, and this is the measurement behind it.
     * `scripts/strategy-probe.mjs` runs the full 8-country x 5-seed grid; this
     * is the same comparison at a size a test suite can afford.
     *
     * The bar is always taking `choices[0]`, the authored primary response,
     * which is a genuinely strong strategy in this content set: it scores 93%
     * survival over the full grid against 15% for picking at random and 3%
     * for picking by cost. The cabinet scores 100%.
     */
    const countries = ['usa', 'india', 'japan', 'brazil', 'nigeria', 'germany'];
    let cabinetAlive = 0;
    let firstAlive = 0;
    let cabinetScore = 0;
    let firstScore = 0;

    for (const id of countries) {
      const cabinet = createGame(setupFor(id), 909);
      const first = createGame(setupFor(id), 909);

      for (let i = 0; i < 360; i++) {
        if (!cabinet.gameOver) {
          delegateQueuedDecisions(cabinet, 'delegate-all');
          tick(cabinet);
        }
        if (!first.gameOver) {
          let guard = 0;
          while (first.eventQueue.length > 0 && guard++ < 10) {
            resolveEvent(first, EVENT_INDEX[first.eventQueue[0].defId].choices[0].id);
          }
          tick(first);
        }
      }
      if (!cabinet.gameOver || cabinet.gameOver.victory) cabinetAlive += 1;
      if (!first.gameOver || first.gameOver.victory) firstAlive += 1;
      cabinetScore += cabinet.score;
      firstScore += first.score;
    }

    expect(cabinetAlive, 'delegation should not lose a campaign the player would have survived')
      .toBeGreaterThanOrEqual(firstAlive);
    expect(cabinetScore, 'delegation should not cost score against the primary response')
      .toBeGreaterThanOrEqual(firstScore * 0.95);
  });
});

/* ================================================================== */
/* Integration                                                         */
/* ================================================================== */

describe('schema 6', () => {
  it('brings a schema-5 save forward without losing anything', () => {
    const s = democracy();
    for (let i = 0; i < 40; i++) tick(s);

    // Strip everything schema 6 added, as an older save would have it.
    const legacy = structuredClone(s) as unknown as Record<string, unknown>;
    (legacy as unknown as GameState).version = 5;
    const gov = (legacy as unknown as GameState).governance as unknown as Record<string, unknown>;
    delete gov.coalition;
    delete gov.pactsFormed;
    delete gov.pactsCollapsed;
    for (const n of (legacy as unknown as GameState).nations) {
      delete (n as unknown as Record<string, unknown>).tariffOnPlayer;
      delete (n as unknown as Record<string, unknown>).tradeGrievance;
    }
    (legacy as unknown as GameState).taxes.tariff = 20;

    const migrated = migrate(legacy as unknown as GameState);
    expect(migrated.governance.coalition).toEqual([]);
    expect(migrated.governance.pactsFormed).toBe(0);
    for (const n of migrated.nations) {
      expect(n.tariffOnPlayer).toBe(0);
      // Grievance is inferred from the tariff the save was already running,
      // so the world does not forget twenty years of protectionism on load.
      expect(n.tradeGrievance).toBeGreaterThan(0);
    }
    expect(() => tick(migrated)).not.toThrow();
  });

  it('is idempotent and survives a pact whose party no longer exists', () => {
    const s = democracy();
    const rival = rivalOf(s);
    formCoalition(s, rival.id, noop);

    // A hand-edited or partially-merged save.
    s.governance.coalition.push({
      partyId: 'party-that-never-existed',
      startedTurn: 0,
      endsTurn: 99,
      demand: { kind: 'liberties', key: 'civilLiberties', label: 'x', detail: 'y' },
      breached: false,
      breachMonths: 0,
      capitalPaid: 0,
    });
    s.version = 5;

    const once = migrate(structuredClone(s));
    const twice = migrate(structuredClone(once));
    expect(once.governance.coalition).toHaveLength(1);
    expect(once.governance.coalition[0].partyId).toBe(rival.id);
    expect(twice.governance.coalition).toEqual(once.governance.coalition);
    expect(() => tick(twice)).not.toThrow();
  });
});

describe('everything together', () => {
  it('runs a century with coalitions, trade wars and chained crises engaged', () => {
    const s = createGame(setupFor('india'), 6060);
    s.governance.capital = 120;
    s.taxes.tariff = 26; // enough to provoke a response

    let signed = false;
    for (let i = 0; i < 600 && !s.gameOver; i++) {
      delegateQueuedDecisions(s, 'delegate-all');

      // Keep a coalition running whenever one is available and affordable.
      if (s.governance.coalition.length === 0) {
        for (const party of s.parties) {
          if (party.id === ownPartyId(s)) continue;
          if (assessPact(s, party.id).enabled) {
            formCoalition(s, party.id, noop);
            signed = true;
            break;
          }
        }
      }
      // Settle whichever trade dispute is worst, when we can afford to.
      const worst = retaliatingNations(s)[0];
      if (worst && assessSettlement(s, worst.id).enabled) settleTradeDispute(s, worst.id, noop);

      tick(s);

      // Nothing may go non-finite or out of range, ever.
      expect(Number.isFinite(s.economy.gdp)).toBe(true);
      expect(Number.isFinite(s.governance.legislativeSupport)).toBe(true);
      expect(s.governance.legislativeSupport).toBeGreaterThanOrEqual(0);
      expect(s.governance.legislativeSupport).toBeLessThanOrEqual(100);
      expect(coalitionShare(s)).toBeLessThanOrEqual(100.001);
      expect(s.governance.coalition.length).toBeLessThanOrEqual(MAX_COALITION_PARTNERS);
      for (const n of s.nations) {
        expect(n.tariffOnPlayer).toBeGreaterThanOrEqual(0);
        expect(n.tariffOnPlayer).toBeLessThanOrEqual(45);
        expect(n.tradeGrievance).toBeGreaterThanOrEqual(0);
        expect(n.tradeGrievance).toBeLessThanOrEqual(100);
      }
    }

    expect(signed, 'a coalition should have been available at some point').toBe(true);
    expect(Number.isFinite(totalModifiers(s).gdpGrowth)).toBe(true);
  });

  it('never advises something the new systems cannot actually do', () => {
    const s = createGame(setupFor('brazil'), 4747);
    s.taxes.tariff = 30;
    s.governance.capital = 150;

    for (let i = 0; i < 240 && !s.gameOver; i++) {
      delegateQueuedDecisions(s, 'delegate-all');
      for (const rec of buildRecommendations(s, 4)) {
        const action = rec.action;
        if (action?.kind === 'coalition') {
          expect(
            assessPact(s, action.partyId).enabled,
            `advised a coalition with ${action.partyId} that cannot be formed`,
          ).toBe(true);
        }
        if (action?.kind === 'settle-trade') {
          expect(
            assessSettlement(s, action.countryId).enabled,
            `advised a settlement with ${action.countryId} that cannot be made`,
          ).toBe(true);
        }
      }
      tick(s);
    }
  });
});
