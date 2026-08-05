import { describe, expect, it } from 'vitest';
import type { DifficultyId, GameState, SetupConfig } from '../types';
import { COUNTRIES, getCountry } from '../data/countries';
import { SCHEMA_VERSION, createGame, defaultSetup } from '../engine/createGame';
import { migrate } from '../storage';
import { tick } from '../engine/tick';
import { resolveEvent } from '../engine/events';
import { EVENT_INDEX } from '../data/events';
import { POLICIES } from '../data/policies';
import { TECHNOLOGIES } from '../data/technologies';
import { BUILDINGS } from '../data/buildings';
import { DECREES, DECREE_INDEX } from '../data/decrees';
import { ADVISORS, ADVISOR_INDEX, ORG_INDEX } from '../data/institutions';
import { RESOURCE_IDS } from '../data/definitions';
import { BUILDING_INDEX } from '../data/buildings';
import { POLICY_INDEX } from '../data/policies';
import { TECH_INDEX } from '../data/technologies';
import { allRecommendations } from '../engine/advisory';
import { respondToCrisis } from '../engine/crises';
import { acceptOffer, declineOffer } from '../engine/world';
import { declareAgenda } from '../engine/agenda';
import { AGENDA_INDEX } from '../data/agendas';
import { availableQuantity, quotedPrice, tradeEligibility } from '../engine/trade';
import { agreementFlow, tradeAgreementBalance } from '../selectors';
import {
  computeBudget,
  gdpPerCapita,
  renewableShare,
  totalEnergyProduction,
  totalModifiers,
} from '../selectors';
import { MINIMUM_VICTORY_MONTHS, computeScore, victoryProgress } from '../engine/scoring';
import {
  BUDGET_MAX,
  buildAvailability,
  decreeAvailability,
  declareWar,
  enactDecree,
  enactPolicy,
  issueBonds,
  joinOrg,
  launchCovertOp,
  cancelTradeAgreement,
  policyAvailability,
  proposeTradeAgreement,
  proposeTreaty,
  repayDebt,
  toggleSanctions,
  setBudget,
  setTax,
  setBranchFunding,
  setVictoryGoal,
  startConstruction,
  startResearch,
} from '../engine/actions';

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
    traits: ['charismatic', 'economist'],
    ...overrides,
  };
}

/** Walks every numeric leaf of the state and asserts it is a finite number. */
function assertFinite(value: unknown, path: string, seen = new Set<unknown>()): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} is ${value}`).toBe(true);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertFinite(v, `${path}[${i}]`, seen));
    return;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'function') continue;
    assertFinite(v, `${path}.${key}`, seen);
  }
}

/** Range invariants that must hold after any number of ticks. */
function assertInvariants(s: GameState, label: string): void {
  assertFinite(s, label);

  const pct = (v: number, name: string) => {
    expect(v, `${label} ${name}=${v}`).toBeGreaterThanOrEqual(0);
    expect(v, `${label} ${name}=${v}`).toBeLessThanOrEqual(100);
  };
  pct(s.approval, 'approval');
  pct(s.stability, 'stability');
  pct(s.corruption, 'corruption');
  pct(s.infrastructure, 'infrastructure');
  pct(s.society.happiness, 'happiness');
  pct(s.society.health, 'health');
  pct(s.society.education, 'education');
  pct(s.society.crime, 'crime');
  pct(s.society.civilLiberties, 'civilLiberties');
  pct(s.society.softPower, 'softPower');
  pct(s.military.strength, 'military.strength');
  pct(s.military.morale, 'military.morale');
  pct(s.military.readiness, 'military.readiness');
  pct(s.intelligence.capability, 'intelligence.capability');
  pct(s.economy.creditRating, 'creditRating');
  pct(s.economy.confidence, 'confidence');
  pct(renewableShare(s), 'renewableShare');

  expect(s.economy.gdp, `${label} gdp`).toBeGreaterThan(0);
  expect(s.economy.debt, `${label} debt`).toBeGreaterThanOrEqual(0);
  expect(s.economy.treasury, `${label} treasury`).toBeGreaterThanOrEqual(0);
  expect(s.society.population, `${label} population`).toBeGreaterThan(0);
  expect(s.economy.unemployment, `${label} unemployment`).toBeGreaterThanOrEqual(0);
  expect(s.economy.unemployment, `${label} unemployment`).toBeLessThanOrEqual(100);
  expect(s.economy.inflation, `${label} inflation`).toBeGreaterThan(-50);
  expect(s.energy.demand, `${label} energy demand`).toBeGreaterThan(0);
  expect(totalEnergyProduction(s), `${label} energy production`).toBeGreaterThanOrEqual(0);
  expect(s.environment.emissions, `${label} emissions`).toBeGreaterThanOrEqual(0);

  const sectorSum = Object.values(s.economy.sectors).reduce((a, b) => a + b, 0);
  expect(Math.abs(sectorSum - 1), `${label} sector shares sum to ${sectorSum}`).toBeLessThan(0.02);

  const partySum = s.parties.reduce((a, p) => a + p.support, 0);
  expect(Math.abs(partySum - 100), `${label} party support sums to ${partySum}`).toBeLessThan(0.5);

  const budget = computeBudget(s);
  expect(Number.isFinite(budget.net), `${label} budget net`).toBe(true);
  expect(budget.revenue.total, `${label} revenue`).toBeGreaterThanOrEqual(0);
  expect(budget.expenditure.total, `${label} expenditure`).toBeGreaterThanOrEqual(0);
}

/** Resolves any pending event by always taking the first choice. */
function autoResolve(s: GameState): void {
  let guard = 0;
  while (s.eventQueue.length > 0 && guard++ < 10) {
    const def = EVENT_INDEX[s.eventQueue[0].defId];
    resolveEvent(s, def.choices[0].id);
  }
}

describe('createGame', () => {
  it('produces a valid state for every real country', () => {
    for (const country of COUNTRIES) {
      const s = createGame(setupFor(country.id), 12345);
      assertInvariants(s, country.name);
      expect(s.nations.some((n) => n.id === country.id), `${country.name} appears in its own world`).toBe(false);
      expect(s.provinces.length).toBeGreaterThanOrEqual(4);
      expect(s.parties.length).toBe(5);
      expect(s.identity.currency.code).toBe(country.currency);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = createGame(setupFor('japan'), 777);
    const b = createGame(setupFor('japan'), 777);
    expect(JSON.stringify({ ...a, id: '', createdAt: 0, updatedAt: 0 }))
      .toBe(JSON.stringify({ ...b, id: '', createdAt: 0, updatedAt: 0 }));
  });

  it('supports fully custom nations', () => {
    const s = createGame(
      {
        ...defaultSetup(),
        mode: 'custom',
        countryId: null,
        nationName: 'Aurelia',
        adjective: 'Aurelian',
        capital: 'Solmara',
        region: 'europe',
        currencyCode: 'EUR',
        government: 'technocracy',
        ideology: 'progressive',
        leaderName: 'Vale Rhen',
        traits: ['visionary', 'technocrat', 'reformer'],
        startingFocus: { economy: 30, military: 5, science: 40, welfare: 20, diplomacy: 5 },
      },
      999,
    );
    assertInvariants(s, 'Aurelia');
    expect(s.identity.baseCountryId).toBeNull();
    expect(s.identity.customFlag).not.toBeNull();
  });
});

describe('long-run simulation', () => {
  const sampleCountries = ['usa', 'india', 'nigeria', 'norway', 'singapore', 'venezuela', 'fiji', 'china'];

  for (const id of sampleCountries) {
    it(`stays numerically sound for 600 months as ${id}`, () => {
      const s = createGame(setupFor(id), 4242);
      for (let i = 0; i < 600; i++) {
        autoResolve(s);
        tick(s);
        if (i % 60 === 0) assertInvariants(s, `${id}@${i}`);
      }
      autoResolve(s);
      assertInvariants(s, `${id}@end`);

      // History records exactly one point per elapsed month.
      expect(s.history.length).toBe(s.turn);
      // A hands-off campaign either runs the full fifty years or ends with a
      // stated reason — it must never simply stop advancing.
      if (s.gameOver) expect(s.gameOver.reason.length).toBeGreaterThan(10);
      else expect(s.turn).toBe(600);

      // Doing nothing must never be an *instant* loss anywhere.
      expect(s.turn, 'no country should collapse within three years of inaction').toBeGreaterThan(36);

      // On a country that is not a deliberately punishing start, inaction
      // should still buy at least a decade. Venezuela, Lebanon and the like
      // begin with a state that cannot collect enough revenue to fund itself,
      // and are meant to demand action almost immediately.
      const profile = getCountry(id)!;
      const punishingStart = profile.stability < 40 || profile.corruption > 80;
      if (!punishingStart) {
        expect(s.turn, `${id} should survive a decade of inaction`).toBeGreaterThan(120);
      }
    });
  }

  it('survives every difficulty setting', () => {
    const difficulties: DifficultyId[] = ['sandbox', 'easy', 'normal', 'hard', 'brutal'];
    for (const difficulty of difficulties) {
      const s = createGame(setupFor('brazil', { difficulty }), 31337);
      for (let i = 0; i < 240; i++) {
        autoResolve(s);
        tick(s);
      }
      autoResolve(s);
      assertInvariants(s, `brazil/${difficulty}`);
    }
  });

  it('survives chaos-frequency events without deadlocking', () => {
    const s = createGame(setupFor('turkey', { eventFrequency: 'chaos' }), 606);
    let resolved = 0;
    for (let i = 0; i < 400; i++) {
      while (s.eventQueue.length > 0) {
        const def = EVENT_INDEX[s.eventQueue[0].defId];
        // Always pick the riskiest choice available to exercise failure paths.
        const risky = def.choices.find((c) => c.riskChance) ?? def.choices[0];
        resolveEvent(s, risky.id);
        resolved++;
      }
      tick(s);
    }
    expect(resolved, 'chaos frequency should fire many events').toBeGreaterThan(20);
    assertInvariants(s, 'turkey/chaos');
  });

  it('does not advance time while an event is pending', () => {
    const s = createGame(setupFor('mexico'), 8080);
    let blockedAt = -1;
    for (let i = 0; i < 300 && blockedAt < 0; i++) {
      tick(s);
      if (s.eventQueue.length > 0) blockedAt = s.turn;
    }
    expect(blockedAt, 'an event should appear within 300 months').toBeGreaterThan(0);
    tick(s);
    expect(s.turn, 'time must not advance while an event is pending').toBe(blockedAt);
    autoResolve(s);
    tick(s);
    expect(s.turn).toBe(blockedAt + 1);
  });

  it('reaches a game over state under extreme mismanagement', () => {
    const s = createGame(setupFor('lebanon', { difficulty: 'brutal' }), 11);
    // Tax nothing, spend everything, and refuse to govern.
    for (const key of Object.keys(s.taxes) as (keyof typeof s.taxes)[]) setTax(s, key, 0);
    for (const dept of Object.keys(s.budget) as (keyof typeof s.budget)[]) setBudget(s, dept, 2);
    for (let i = 0; i < 600 && !s.gameOver; i++) {
      autoResolve(s);
      tick(s);
    }
    expect(s.gameOver, 'the campaign should end').not.toBeNull();
    assertInvariants(s, 'lebanon/collapse');
  });
});

describe('eternal mode', () => {
  it('never ends, even under the mismanagement that bankrupts a normal campaign', () => {
    const s = createGame(setupFor('lebanon', { difficulty: 'brutal', neverEndGame: true }), 11);
    for (const key of Object.keys(s.taxes) as (keyof typeof s.taxes)[]) setTax(s, key, 0);
    for (const dept of Object.keys(s.budget) as (keyof typeof s.budget)[]) setBudget(s, dept, 2);

    for (let i = 0; i < 900; i++) {
      autoResolve(s);
      tick(s);
    }

    expect(s.gameOver, 'eternal mode must never end the campaign').toBeNull();
    expect(s.turn, 'time must keep advancing').toBe(900);
    assertInvariants(s, 'lebanon/eternal');
  });

  it('runs past the century cap that ends a normal campaign', () => {
    const eternal = createGame(setupFor('norway', { neverEndGame: true, victoryGoal: 'survival' }), 5);
    for (let i = 0; i < 1300; i++) {
      autoResolve(eternal);
      tick(eternal);
    }
    expect(eternal.gameOver).toBeNull();
    expect(eternal.turn).toBe(1300);
    assertInvariants(eternal, 'norway/eternal-century');
  });

  /** Forces a state that satisfies every superpower condition. */
  function makeSuperpower(overrides: Partial<SetupConfig>): GameState {
    const s = createGame(setupFor('usa', { victoryGoal: 'superpower', ...overrides }), 21);
    s.turn = MINIMUM_VICTORY_MONTHS + 1;
    s.military.strength = 96;
    s.stability = 80;
    s.society.softPower = 85;
    for (const n of s.nations) {
      n.relations = 60;
      n.militaryStrength = Math.min(n.militaryStrength, 70);
    }
    // A decisive economic lead over the largest rival.
    s.economy.gdp = s.nations.reduce((max, n) => Math.max(max, n.gdp), 1) * 2;
    return s;
  }

  it('records a victory without ending the run, and only once', () => {
    const s = makeSuperpower({ neverEndGame: true });
    expect(victoryProgress(s).every((p) => p.met), 'test fixture must satisfy the goal').toBe(true);

    for (let i = 0; i < 40; i++) {
      autoResolve(s);
      tick(s);
    }

    expect(s.victoriesAchieved, 'the objective should be recorded').toContain('superpower');
    expect(s.gameOver, 'recording a victory must not end eternal mode').toBeNull();
    expect(
      s.victoriesAchieved.filter((v) => v === 'superpower').length,
      'a goal must only be recorded once',
    ).toBe(1);
  });

  it('ends a normal campaign on the same victory it merely records in eternal mode', () => {
    const normal = makeSuperpower({ neverEndGame: false });
    for (let i = 0; i < 40 && !normal.gameOver; i++) {
      autoResolve(normal);
      tick(normal);
    }
    expect(normal.gameOver?.victory).toBe(true);
    expect(normal.victoriesAchieved).toContain('superpower');
  });

  it('keeps the player in office after a lost election, with real penalties', () => {
    const s = createGame(setupFor('brazil', { neverEndGame: true }), 77);
    // Force a loss: the player's party is wiped out, a rival dominates.
    const playerParty = s.parties.find((p) => p.id === `party-${s.leader.ideology}`)!;
    const rival = s.parties.find((p) => p.id !== playerParty.id)!;
    playerParty.support = 1;
    rival.support = 80;
    s.monthsToElection = 1;
    s.approval = 60;
    s.stability = 70;
    const termsBefore = s.termsServed;

    tick(s);

    expect(s.gameOver, 'a lost election must not end an eternal campaign').toBeNull();
    expect(s.termsServed, 'a lost election does not grant a new term').toBe(termsBefore);
    expect(s.approval, 'losing must cost approval').toBeLessThan(60);
    expect(s.stability, 'losing must cost stability').toBeLessThan(70);
    expect(s.monthsToElection, 'a new election must be scheduled').toBeGreaterThan(0);
  });

  it('still ends a normal campaign on a lost election', () => {
    const s = createGame(setupFor('brazil', { neverEndGame: false }), 77);
    const playerParty = s.parties.find((p) => p.id === `party-${s.leader.ideology}`)!;
    const rival = s.parties.find((p) => p.id !== playerParty.id)!;
    playerParty.support = 1;
    rival.support = 80;
    s.monthsToElection = 1;

    tick(s);

    expect(s.gameOver?.title).toBe('Voted Out');
  });

  it('only allows the objective to be changed in eternal mode', () => {
    const eternal = createGame(setupFor('india', { neverEndGame: true, victoryGoal: 'superpower' }), 4);
    expect(setVictoryGoal(eternal, 'green').ok).toBe(true);
    expect(eternal.settings.victoryGoal).toBe('green');
    expect(setVictoryGoal(eternal, 'green').ok, 'no-op switches are rejected').toBe(false);

    const normal = createGame(setupFor('india', { neverEndGame: false, victoryGoal: 'superpower' }), 4);
    expect(setVictoryGoal(normal, 'green').ok).toBe(false);
    expect(normal.settings.victoryGoal).toBe('superpower');
  });
});

describe('executive actions', () => {
  it('enacts every decree whose conditions can be met, and respects cooldowns', () => {
    const s = createGame(setupFor('germany'), 12);
    s.economy.treasury = 1e9;
    // Executive actions now cost political capital as well as money, so the
    // sweep has to be funded on both axes to exercise every decree.
    s.governance.capital = 1e5;
    s.governance.capitalCap = 1e5;
    s.research.completed = TECHNOLOGIES.map((t) => t.id);

    let enacted = 0;
    for (const decree of DECREES) {
      const availability = decreeAvailability(s, decree.id);
      if (!availability.enabled) continue;

      const result = enactDecree(s, decree.id);
      expect(result.ok, `${decree.id}: ${result.message}`).toBe(true);
      enacted++;

      // Immediately unavailable again — the cooldown must bite.
      const after = decreeAvailability(s, decree.id);
      expect(after.enabled, `${decree.id} should be on cooldown`).toBe(false);
      expect(after.cooldownRemaining).toBeGreaterThan(0);
      expect(enactDecree(s, decree.id).ok, `${decree.id} must not be repeatable`).toBe(false);
    }

    expect(enacted, 'most decrees should be reachable').toBeGreaterThan(DECREES.length * 0.6);
    assertInvariants(s, 'germany/all-decrees');
  });

  it('lets a decree be used again once its cooldown expires', () => {
    const s = createGame(setupFor('japan'), 13);
    s.economy.treasury = 1e9;
    s.governance.capital = 1e5;

    expect(enactDecree(s, 'national-address').ok).toBe(true);
    const cooldown = DECREE_INDEX['national-address'].cooldown;

    for (let i = 0; i < cooldown - 1; i++) { autoResolve(s); tick(s); }
    expect(decreeAvailability(s, 'national-address').enabled, 'still cooling down').toBe(false);

    autoResolve(s);
    tick(s);
    s.economy.treasury = 1e9;
    expect(decreeAvailability(s, 'national-address').enabled, 'cooldown has expired').toBe(true);
  });

  it('applies the bespoke side effects that plain effect blocks cannot express', () => {
    const s = createGame(setupFor('brazil'), 14);
    s.economy.treasury = 1e9;
    s.governance.capital = 1e5;
    s.economy.debt = 1000;
    s.economy.creditRating = 80;

    expect(enactDecree(s, 'debt-restructuring').ok).toBe(true);
    expect(s.economy.debt, 'creditors take a haircut').toBeCloseTo(800, 3);
    expect(s.economy.creditRating, 'the rating takes the hit').toBeLessThan(80);

    const readinessBefore = s.military.readiness;
    expect(enactDecree(s, 'mobilise-reserves').ok).toBe(true);
    expect(s.military.readiness).toBeGreaterThan(readinessBefore);
  });

  it('refuses a decree the treasury cannot cover', () => {
    const s = createGame(setupFor('fiji'), 15);
    s.economy.treasury = 0;
    const availability = decreeAvailability(s, 'emergency-stimulus');
    expect(availability.enabled).toBe(false);
    expect(availability.reason).toMatch(/treasury/i);
    expect(enactDecree(s, 'emergency-stimulus').ok).toBe(false);
  });

  it('keeps the state sound when decrees are used constantly for fifty years', () => {
    const s = createGame(setupFor('india', { neverEndGame: true }), 16);
    for (let i = 0; i < 600; i++) {
      autoResolve(s);
      s.governance.capital = 1e5;
      // Fire anything that is ready, every single month.
      for (const decree of DECREES) {
        if (decreeAvailability(s, decree.id).enabled) enactDecree(s, decree.id);
      }
      tick(s);
    }
    assertInvariants(s, 'india/decree-spam');
    expect(s.turn).toBe(600);
  });
});

describe('advisory board', () => {
  it('never invents a panel, an action or an advisor that does not exist', () => {
    const panels = new Set<string>([
      'dashboard', 'economy', 'budget', 'policies', 'decrees', 'research', 'construction',
      'society', 'environment', 'military', 'diplomacy', 'trade', 'intelligence',
      'provinces', 'politics', 'cabinet', 'objectives', 'achievements', 'history',
      'crises', 'factions', 'world',
    ]);

    // Sweep a wide spread of states so most advice branches actually fire.
    const states: GameState[] = [];
    for (const id of ['usa', 'fiji', 'drc', 'venezuela', 'norway', 'china']) {
      const fresh = createGame(setupFor(id), 31);
      states.push(fresh);

      const advanced = createGame(setupFor(id), 32);
      for (let i = 0; i < 180; i++) { autoResolve(advanced); tick(advanced); }
      states.push(advanced);

      const broken = createGame(setupFor(id, { difficulty: 'brutal', neverEndGame: true }), 33);
      for (const key of Object.keys(broken.taxes) as (keyof typeof broken.taxes)[]) setTax(broken, key, 0);
      for (let i = 0; i < 120; i++) { autoResolve(broken); tick(broken); }
      states.push(broken);

      const rich = createGame(setupFor(id, { neverEndGame: true }), 34);
      rich.economy.treasury = 1e9;
      rich.research.completed = TECHNOLOGIES.map((t) => t.id);
      states.push(rich);
    }

    let seen = 0;
    for (const s of states) {
      for (const rec of allRecommendations(s)) {
        seen++;
        expect(panels.has(rec.panel), `unknown panel "${rec.panel}" from ${rec.id}`).toBe(true);
        expect(rec.headline.length, `${rec.id} needs a headline`).toBeGreaterThan(8);
        expect(rec.detail.length, `${rec.id} needs real detail`).toBeGreaterThan(30);
        expect(Number.isFinite(rec.urgency), `${rec.id} urgency`).toBe(true);
        // No unrendered placeholders leaking into player-facing text.
        expect(rec.headline).not.toMatch(/NaN|undefined|Infinity/);
        expect(rec.detail).not.toMatch(/NaN|undefined|Infinity/);

        if (rec.advisorId) {
          expect(ADVISOR_INDEX[rec.advisorId], `${rec.id} names unknown advisor`).toBeDefined();
        }

        const action = rec.action;
        if (!action) continue;
        expect(action.label.length).toBeGreaterThan(3);
        switch (action.kind) {
          case 'policy': expect(POLICY_INDEX[action.id], `${rec.id} -> policy ${action.id}`).toBeDefined(); break;
          case 'decree': expect(DECREE_INDEX[action.id], `${rec.id} -> decree ${action.id}`).toBeDefined(); break;
          case 'research': expect(TECH_INDEX[action.id], `${rec.id} -> tech ${action.id}`).toBeDefined(); break;
          case 'build': expect(BUILDING_INDEX[action.id], `${rec.id} -> building ${action.id}`).toBeDefined(); break;
          case 'org': expect(ORG_INDEX[action.id as never], `${rec.id} -> org ${action.id}`).toBeDefined(); break;
          case 'budget': expect(s.budget[action.dept], `${rec.id} -> dept ${action.dept}`).toBeDefined(); break;
          case 'tax': expect(s.taxes[action.key], `${rec.id} -> tax ${action.key}`).toBeDefined(); break;
          case 'crisis':
            expect(s.crises.some((c) => c.id === action.crisisId), `${rec.id} -> crisis ${action.crisisId}`).toBe(true);
            break;
          case 'offer':
            expect(s.offers.some((o) => o.id === action.offerId), `${rec.id} -> offer ${action.offerId}`).toBe(true);
            break;
          case 'agenda': expect(AGENDA_INDEX[action.id], `${rec.id} -> agenda ${action.id}`).toBeDefined(); break;
          case 'branch':
            expect(s.military.branchFunding[action.branch], `${rec.id} -> branch ${action.branch}`).toBeDefined();
            break;
        }
      }
    }
    expect(seen, 'the sweep should produce plenty of advice').toBeGreaterThan(40);
  });

  it('every suggested action actually succeeds when taken', () => {
    // The point of a one-click fix is that it works. Anything the board offers
    // must pass its own availability check at the moment it is offered.
    const s = createGame(setupFor('brazil'), 41);
    s.economy.treasury = 1e9;
    s.governance.capital = 1e5;

    for (let round = 0; round < 40; round++) {
      for (const rec of allRecommendations(s)) {
        const action = rec.action;
        if (!action) continue;
        let result: { ok: boolean; message: string } | null = null;
        switch (action.kind) {
          case 'policy': result = enactPolicy(s, action.id); break;
          case 'decree': result = enactDecree(s, action.id); break;
          case 'research': result = startResearch(s, action.id); break;
          case 'build': result = startConstruction(s, action.id); break;
          case 'org': result = joinOrg(s, action.id as never); break;
          case 'budget': result = setBudget(s, action.dept, action.level); break;
          case 'tax': result = setTax(s, action.key, action.value); break;
          case 'crisis':
            result = respondToCrisis(s, action.crisisId, action.responseId, () => {});
            break;
          case 'offer':
            result = action.accept
              ? acceptOffer(s, action.offerId, () => {})
              : declineOffer(s, action.offerId, () => {});
            break;
          case 'agenda': result = declareAgenda(s, action.id); break;
          case 'branch': result = setBranchFunding(s, action.branch, action.weight); break;
        }
        expect(result?.ok, `${rec.id} suggested "${action.label}" but it failed: ${result?.message}`).toBe(true);
      }
      autoResolve(s);
      tick(s);
      s.economy.treasury = 1e9;
      s.governance.capital = 1e5;
    }
    assertInvariants(s, 'brazil/advisory-actions');
  });

  it('raises the alarm when something is badly wrong', () => {
    const s = createGame(setupFor('germany'), 42);
    s.energy.demand = 1000;
    for (const key of Object.keys(s.energy.production) as (keyof typeof s.energy.production)[]) {
      s.energy.production[key] = 10;
    }
    const advice = allRecommendations(s);
    expect(advice.some((r) => r.id === 'energy-gap'), 'a grid shortfall must be raised').toBe(true);
    expect(advice.find((r) => r.id === 'energy-gap')?.severity).toBe('critical');
  });

  it('stays quiet when a country is running well', () => {
    const s = createGame(setupFor('norway'), 43);
    s.approval = 80;
    s.stability = 85;
    s.corruption = 8;
    s.economy.inflation = 2;
    s.economy.unemployment = 3;
    s.economy.growth = 3;
    s.economy.debt = 0;
    s.advisors = ADVISORS.slice(0, 5).map((a) => a.id);
    s.research.current = 'modern-banking';
    s.energy.demand = 100;
    s.energy.production.hydro = 200;

    const critical = allRecommendations(s).filter((r) => r.severity === 'critical');
    expect(critical, `a well-run country should have no emergencies: ${critical.map((c) => c.id).join(', ')}`)
      .toHaveLength(0);
  });
});

describe('commodity trade', () => {
  it('signs an agreement and settles it through the budget', () => {
    const s = createGame(setupFor('japan'), 51);
    // Japan has almost no oil, so an import contract is the natural case.
    const supplier = s.nations.find((n) => (n.resources.oil ?? 0) > 70 && n.relations > -20);
    expect(supplier, 'a plausible oil supplier should exist').toBeDefined();
    supplier!.relations = 70;
    supplier!.trust = 90;

    const available = availableQuantity(s, supplier!, 'oil', 'import');
    expect(available).toBeGreaterThan(0);

    let signed = false;
    for (let i = 0; i < 25 && !signed; i++) {
      signed = proposeTradeAgreement(s, supplier!.id, 'oil', 'import', available * 0.5, 60).ok;
    }
    expect(signed, 'a warm, trusting partner should eventually agree').toBe(true);

    const agreement = s.tradeAgreements[0];
    expect(agreement.resource).toBe('oil');
    expect(agreement.direction).toBe('import');
    expect(agreement.lockedPrice).toBeGreaterThan(0);

    // Contracted imports raise effective supply and cost money.
    expect(agreementFlow(s, 'oil')).toBeCloseTo(agreement.quantity, 5);
    expect(tradeAgreementBalance(s)).toBeLessThan(0);
    assertInvariants(s, 'japan/oil-import');
  });

  it('refuses to sell a surplus that does not exist', () => {
    const s = createGame(setupFor('japan'), 52);
    // Pick a buyer with genuine appetite, and ask for less than they can take,
    // so the rejection is specifically about Japan having no oil to sell.
    const buyer = s.nations
      .map((n) => ({ n, appetite: availableQuantity(s, n, 'oil', 'export') }))
      .sort((a, b) => b.appetite - a.appetite)[0];
    buyer.n.relations = 80;
    expect(buyer.appetite, 'someone should want to buy oil').toBeGreaterThan(0.5);
    expect(s.resources.oil.production, 'Japan produces almost no oil').toBeLessThan(1);

    const result = proposeTradeAgreement(s, buyer.n.id, 'oil', 'export', 0.4, 24);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/surplus|spare/i);
  });

  it('refuses partners at war or under sanctions', () => {
    const s = createGame(setupFor('india'), 53);
    const enemy = s.nations[0];
    enemy.relations = 80;
    enemy.atWarWithPlayer = true;
    expect(tradeEligibility(s, enemy, 'oil', 'import', 1).ok).toBe(false);

    const sanctioned = s.nations[1];
    sanctioned.relations = 80;
    sanctioned.sanctioned = true;
    expect(tradeEligibility(s, sanctioned, 'oil', 'import', 1).ok).toBe(false);
  });

  it('suspends deliveries when a partner becomes unreachable, and resumes them', () => {
    const s = createGame(setupFor('germany'), 54);
    const partner = s.nations.find((n) => (n.resources.gas ?? 0) > 50)!;
    partner.relations = 80;
    partner.trust = 95;

    let signed = false;
    for (let i = 0; i < 25 && !signed; i++) {
      signed = proposeTradeAgreement(s, partner.id, 'gas', 'import', 1, 120).ok;
    }
    expect(signed).toBe(true);

    // Sanction them: the contract survives but stops delivering.
    toggleSanctions(s, partner.id);
    autoResolve(s);
    tick(s);
    expect(s.tradeAgreements[0].suspended, 'sanctions must suspend delivery').toBe(true);
    expect(agreementFlow(s, 'gas'), 'a suspended contract moves nothing').toBe(0);
    expect(tradeAgreementBalance(s), 'a suspended contract costs nothing').toBe(0);

    // Lift them: it resumes rather than being torn up.
    toggleSanctions(s, partner.id);
    autoResolve(s);
    tick(s);
    expect(s.tradeAgreements[0].suspended).toBe(false);
    expect(agreementFlow(s, 'gas')).toBeGreaterThan(0);
  });

  it('expires an agreement when its term runs out', () => {
    const s = createGame(setupFor('france'), 55);
    const partner = s.nations.find((n) => (n.resources.oil ?? 0) > 60)!;
    partner.relations = 85;
    partner.trust = 95;

    let signed = false;
    for (let i = 0; i < 25 && !signed; i++) {
      signed = proposeTradeAgreement(s, partner.id, 'oil', 'import', 0.5, 24).ok;
    }
    expect(signed).toBe(true);

    for (let i = 0; i < 25; i++) { autoResolve(s); tick(s); }
    expect(s.tradeAgreements, 'the contract should have lapsed').toHaveLength(0);
  });

  it('costs relations to break a contract early', () => {
    const s = createGame(setupFor('brazil'), 56);
    const partner = s.nations.find((n) => (n.resources.oil ?? 0) > 60)!;
    partner.relations = 80;
    partner.trust = 95;

    let signed = false;
    for (let i = 0; i < 25 && !signed; i++) {
      signed = proposeTradeAgreement(s, partner.id, 'oil', 'import', 0.5, 120).ok;
    }
    expect(signed).toBe(true);

    const relationsAfterSigning = partner.relations;
    cancelTradeAgreement(s, s.tradeAgreements[0].id);
    expect(partner.relations).toBeLessThan(relationsAfterSigning);
    expect(s.tradeAgreements).toHaveLength(0);
  });

  it('keeps the state sound with many agreements over fifty years', () => {
    const s = createGame(setupFor('china', { neverEndGame: true }), 57);
    for (const nation of s.nations) {
      nation.relations = 70;
      nation.trust = 90;
    }

    // Contract for everything anyone will sell.
    for (const nation of s.nations.slice(0, 20)) {
      for (const resource of RESOURCE_IDS) {
        const available = availableQuantity(s, nation, resource, 'import');
        if (available > 0.2) proposeTradeAgreement(s, nation.id, resource, 'import', available * 0.4, 120);
      }
    }
    expect(s.tradeAgreements.length, 'many contracts should have been signed').toBeGreaterThan(5);

    for (let i = 0; i < 600; i++) { autoResolve(s); tick(s); }
    assertInvariants(s, 'china/heavy-trade');
  });

  it('prices a longer lock worse than a shorter one', () => {
    const s = createGame(setupFor('india'), 58);
    const partner = s.nations.find((n) => (n.resources.oil ?? 0) > 60)!;
    const short = quotedPrice(s, partner, 'oil', 'import', 24);
    const long = quotedPrice(s, partner, 'oil', 'import', 120);
    expect(long, 'certainty costs a premium').toBeGreaterThan(short);
  });
});

describe('save migration', () => {
  it('upgrades a v1 save and preserves it', () => {
    const s = createGame(setupFor('france'), 8);
    for (let i = 0; i < 24; i++) { autoResolve(s); tick(s); }

    // Simulate a save written before eternal mode existed: the two v2 fields
    // simply are not present on the parsed object.
    const legacy = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    legacy.version = 1;
    delete legacy.victoriesAchieved;
    delete (legacy.settings as Record<string, unknown>).neverEndGame;

    const migrated = migrate(legacy as unknown as GameState);
    expect(migrated.version).toBe(SCHEMA_VERSION);
    expect(migrated.victoriesAchieved).toEqual([]);
    expect(migrated.settings.neverEndGame).toBe(false);
    expect(migrated.turn, 'migration must not lose progress').toBe(s.turn);

    // And it must still simulate.
    for (let i = 0; i < 24; i++) { autoResolve(migrated); tick(migrated); }
    assertInvariants(migrated, 'migrated save');
  });

  it('refuses a save from a newer build', () => {
    const s = createGame(setupFor('france'), 8);
    s.version = SCHEMA_VERSION + 1;
    expect(() => migrate(s)).toThrow(/newer version/i);
  });
});

describe('player actions', () => {
  it('enacts every policy whose prerequisites can be met', () => {
    const s = createGame(setupFor('usa'), 1);
    // Give the player everything so requirements resolve — including the
    // political capital the legislature now charges for a bill.
    s.research.completed = TECHNOLOGIES.map((t) => t.id);
    s.economy.treasury = 1e9;
    s.governance.capital = 1e6;
    s.governance.capitalCap = 1e6;
    s.stability = 95;

    let enacted = 0;
    for (const p of POLICIES) {
      const availability = policyAvailability(s, p.id);
      if (!availability.enabled) continue;
      const result = enactPolicy(s, p.id);
      expect(result.ok, `${p.id}: ${result.message}`).toBe(true);
      enacted++;
    }
    expect(enacted, 'most policies should be enactable').toBeGreaterThan(POLICIES.length * 0.6);

    // No conflicting pair may end up active together.
    for (const id of s.activePolicies) {
      const p = POLICIES.find((x) => x.id === id)!;
      for (const c of p.conflicts ?? []) {
        expect(s.activePolicies.includes(c), `${id} and ${c} are both active`).toBe(false);
      }
    }
    for (let i = 0; i < 60; i++) { autoResolve(s); tick(s); }
    assertInvariants(s, 'usa/all-policies');
  });

  it('builds every building once its technology is available', () => {
    const s = createGame(setupFor('china'), 2);
    s.research.completed = TECHNOLOGIES.map((t) => t.id);
    s.economy.treasury = 1e9;
    s.economy.gdp = 20000;

    for (const b of BUILDINGS) {
      const availability = buildAvailability(s, b.id);
      if (!availability.enabled) continue;
      expect(startConstruction(s, b.id).ok, `${b.id} should be constructible`).toBe(true);
    }
    expect(s.construction.length).toBeGreaterThan(BUILDINGS.length * 0.8);

    for (let i = 0; i < 80; i++) { autoResolve(s); tick(s); }
    expect(Object.values(s.buildings).reduce((a, b) => a + b, 0)).toBeGreaterThan(10);
    assertInvariants(s, 'china/all-buildings');
  });

  it('respects building count limits', () => {
    const s = createGame(setupFor('usa'), 3);
    s.research.completed = TECHNOLOGIES.map((t) => t.id);
    s.economy.treasury = 1e9;
    for (let i = 0; i < 20; i++) startConstruction(s, 'wonder-peace-forum');
    expect(s.construction.filter((c) => c.buildingId === 'wonder-peace-forum').length).toBe(1);
  });

  it('completes the whole technology tree without stalling', () => {
    const s = createGame(setupFor('south-korea'), 4);
    s.society.education = 100;
    s.budget.research.level = 2;

    let guard = 0;
    while (s.research.completed.length < TECHNOLOGIES.length && guard++ < 6000) {
      if (!s.research.current) {
        const next = TECHNOLOGIES.find(
          (t) => !s.research.completed.includes(t.id) && t.requires.every((r) => s.research.completed.includes(r)),
        );
        expect(next, 'every remaining technology became unreachable').toBeDefined();
        expect(startResearch(s, next!.id).ok, `could not start ${next!.id}`).toBe(true);
      }
      autoResolve(s);
      // This test is about the tree, not about surviving; keep the campaign
      // alive so a lost election cannot mask a stalled prerequisite chain.
      s.gameOver = null;
      s.monthsToElection = -1;
      tick(s);
    }
    expect(s.research.completed.length).toBe(TECHNOLOGIES.length);
  });

  it('handles taxes, bonds and repayment coherently', () => {
    const s = createGame(setupFor('germany'), 5);
    setTax(s, 'income', 40);
    expect(s.taxes.income).toBe(40);
    setTax(s, 'income', 999);
    expect(s.taxes.income).toBe(75);
    setTax(s, 'carbon', -20);
    expect(s.taxes.carbon).toBe(0);

    const debtBefore = s.economy.debt;
    const treasuryBefore = s.economy.treasury;
    expect(issueBonds(s, 100).ok).toBe(true);
    expect(s.economy.debt).toBeCloseTo(debtBefore + 100, 5);
    expect(s.economy.treasury).toBeGreaterThan(treasuryBefore);

    expect(repayDebt(s, 50).ok).toBe(true);
    expect(s.economy.debt).toBeCloseTo(debtBefore + 50, 5);
    expect(repayDebt(s, 1e9).ok).toBe(true);
    expect(s.economy.debt).toBeGreaterThanOrEqual(0);
  });

  it('clamps budget levels to each department’s own ceiling', () => {
    const s = createGame(setupFor('france'), 6);

    // Defence has a wider ceiling than the civil departments, because the real
    // spread in defence spending between countries is far wider.
    setBudget(s, 'military', 99);
    expect(s.budget.military.level).toBe(BUDGET_MAX.military);
    setBudget(s, 'military', -3);
    expect(s.budget.military.level).toBe(0);

    setBudget(s, 'healthcare', 99);
    expect(s.budget.healthcare.level).toBe(BUDGET_MAX.healthcare);
    expect(BUDGET_MAX.healthcare).toBeLessThan(BUDGET_MAX.military);
  });

  it('runs diplomacy, treaties, orgs, covert ops and war end-to-end', () => {
    const s = createGame(setupFor('india'), 7);
    s.economy.treasury = 1e8;
    s.society.softPower = 90;

    const friend = s.nations.find((n) => n.gdp > 400)!;
    friend.relations = 80;
    friend.trust = 90;
    let signed = false;
    for (let attempt = 0; attempt < 25 && !signed; attempt++) {
      signed = proposeTreaty(s, friend.id, 'trade').ok;
    }
    expect(signed, 'a friendly nation should eventually sign').toBe(true);

    expect(joinOrg(s, 'un').ok).toBe(true);
    expect(joinOrg(s, 'un').ok, 'cannot join twice').toBe(false);

    const rival = s.nations.find((n) => n.id !== friend.id)!;
    expect(launchCovertOp(s, 'espionage', rival.id).ok).toBe(true);
    expect(launchCovertOp(s, 'espionage', rival.id).ok, 'no duplicate ops').toBe(false);

    expect(declareWar(s, rival.id, 'punitive').ok).toBe(true);
    expect(rival.atWarWithPlayer).toBe(true);

    for (let i = 0; i < 120; i++) { autoResolve(s); tick(s); }
    assertInvariants(s, 'india/war');
    expect(s.wars[0].resolved, 'the war should conclude within ten years').toBeDefined();
  });
});

describe('derived values', () => {
  it('computes a finite score and victory progress for every goal', () => {
    const goals = ['superpower', 'utopia', 'economic', 'green', 'scientific', 'cultural', 'survival'] as const;
    for (const goal of goals) {
      const s = createGame(setupFor('brazil', { victoryGoal: goal }), 8);
      for (let i = 0; i < 36; i++) { autoResolve(s); tick(s); }
      const score = computeScore(s);
      expect(Number.isFinite(score.total), `${goal} score`).toBe(true);
      expect(score.total).toBeGreaterThan(0);
      for (const p of victoryProgress(s)) {
        expect(Number.isFinite(p.current), `${goal}/${p.label} current`).toBe(true);
        expect(Number.isFinite(p.target), `${goal}/${p.label} target`).toBe(true);
        expect(typeof p.display).toBe('string');
      }
    }
  });

  it('keeps gdp per capita and modifier totals finite for tiny economies', () => {
    const s = createGame(setupFor('fiji'), 9);
    expect(gdpPerCapita(s)).toBeGreaterThan(0);
    const mods = totalModifiers(s);
    for (const [key, value] of Object.entries(mods)) {
      expect(Number.isFinite(value), `modifier ${key}`).toBe(true);
    }
  });

  it('scales costs so a policy is affordable relative to the economy', () => {
    const big = createGame(setupFor('usa'), 10);
    const small = createGame(setupFor('fiji'), 10);
    const bigCost = policyAvailability(big, 'stimulus-package').cost;
    const smallCost = policyAvailability(small, 'stimulus-package').cost;
    // Same share of GDP in both, within rounding.
    const bigShare = bigCost / (big.economy.gdp * 1000);
    const smallShare = smallCost / (small.economy.gdp * 1000);
    expect(Math.abs(bigShare - smallShare)).toBeLessThan(0.01);
  });
});
