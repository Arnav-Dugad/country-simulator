import { describe, expect, it } from 'vitest';
import type { DifficultyId, GameState, SetupConfig } from '../types';
import { COUNTRIES, getCountry } from '../data/countries';
import { createGame, defaultSetup } from '../engine/createGame';
import { tick } from '../engine/tick';
import { resolveEvent } from '../engine/events';
import { EVENT_INDEX } from '../data/events';
import { POLICIES } from '../data/policies';
import { TECHNOLOGIES } from '../data/technologies';
import { BUILDINGS } from '../data/buildings';
import {
  computeBudget,
  gdpPerCapita,
  renewableShare,
  totalEnergyProduction,
  totalModifiers,
} from '../selectors';
import { computeScore, victoryProgress } from '../engine/scoring';
import {
  buildAvailability,
  declareWar,
  enactPolicy,
  issueBonds,
  joinOrg,
  launchCovertOp,
  policyAvailability,
  proposeTreaty,
  repayDebt,
  setBudget,
  setTax,
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
      // Doing nothing at all should never be a fast loss.
      expect(s.turn, 'a hands-off campaign should last at least a decade').toBeGreaterThan(120);
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

describe('player actions', () => {
  it('enacts every policy whose prerequisites can be met', () => {
    const s = createGame(setupFor('usa'), 1);
    // Give the player everything so requirements resolve.
    s.research.completed = TECHNOLOGIES.map((t) => t.id);
    s.economy.treasury = 1e9;
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

  it('clamps budget levels', () => {
    const s = createGame(setupFor('france'), 6);
    setBudget(s, 'military', 5);
    expect(s.budget.military.level).toBe(2);
    setBudget(s, 'military', -3);
    expect(s.budget.military.level).toBe(0);
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
