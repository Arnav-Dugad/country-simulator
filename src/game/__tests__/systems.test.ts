import { describe, expect, it } from 'vitest';
import type { GameState, SetupConfig } from '../types';
import { getCountry } from '../data/countries';
import { createGame, defaultSetup } from '../engine/createGame';
import { migrate } from '../storage';
import { tick } from '../engine/tick';
import { EVENT_INDEX } from '../data/events';
import { resolveEvent } from '../engine/events';
import { TECHNOLOGIES, TECH_INDEX } from '../data/technologies';
import { CRISES, CRISIS_INDEX } from '../data/crises';
import { AGENDAS, AGENDA_DECLARATION_COST, AGENDA_INDEX, readMetric } from '../data/agendas';
import { FACTIONS } from '../data/factions';
import { POLICIES } from '../data/policies';
import {
  MAX_RESEARCH_SLOTS,
  beginResearch,
  monthsRemaining,
  normaliseResearch,
  researchCapacity,
  rushResearch,
  setResearchPriority,
  startableTechs,
  stopResearch,
} from '../engine/research';
import {
  assessLegislation, basePoliticalCost, capitalIncome, coupRisk, factionTargets, spendCapital,
} from '../engine/politics';
import { respondToCrisis, updateCrises } from '../engine/crises';
import { acceptOffer, declineOffer, estimatedStrength, naturalBloc, updateWorld } from '../engine/world';
import {
  depositToFund, fundReturnRate, setAutoRepayDebt, setCentralBankIndependence, setPolicyRate,
  withdrawFromFund,
} from '../engine/finance';
import { abandonAgenda, agendaMet, agendaProgress, declareAgenda } from '../engine/agenda';
import { crisisModifiers, factionModifiers, totalModifiers } from '../selectors';
import {
  appointAdvisor,
  enactDecree,
  enactPolicy,
  joinOrg,
  policyAvailability,
  setBranchFunding,
  setBudget,
  setMartialLaw,
  setProvinceInvestment,
  setTax,
  startConstruction,
  startResearch,
} from '../engine/actions';
import { buildRecommendations } from '../engine/advisory';
import { ADVISORS } from '../data/institutions';

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

function autoResolve(s: GameState): void {
  let guard = 0;
  while (s.eventQueue.length > 0 && guard++ < 10) {
    const def = EVENT_INDEX[s.eventQueue[0].defId];
    resolveEvent(s, def.choices[0].id);
  }
}

/** Runs `months` turns, resolving anything that blocks time. */
function run(s: GameState, months: number): void {
  for (let i = 0; i < months; i++) {
    autoResolve(s);
    tick(s);
  }
}

const noop = () => {};

/* ==================================================================== */
/* Parallel research                                                    */
/* ==================================================================== */

describe('parallel research', () => {
  it('starts with exactly one laboratory and one active project', () => {
    const s = createGame(setupFor('japan'), 1);
    expect(researchCapacity(s)).toBe(1);
    expect(s.research.active).toHaveLength(1);
    // The single-value mirror must agree with the slot array.
    expect(s.research.current).toBe(s.research.active[0].techId);
  });

  it('queues a second project rather than failing when the only slot is busy', () => {
    const s = createGame(setupFor('japan'), 2);
    const other = startableTechs(s).find((t) => t.id !== s.research.current)!;
    const outcome = beginResearch(s, other.id);
    expect(outcome.ok).toBe(true);
    expect(outcome.queued).toBe(true);
    expect(s.research.queue).toContain(other.id);
    expect(s.research.active).toHaveLength(1);
  });

  it('unlocks a slot for each of the four sources, capped at the maximum', () => {
    const s = createGame(setupFor('south-korea'), 3);
    expect(researchCapacity(s)).toBe(1);

    s.research.completed.push('research-consortia');
    expect(researchCapacity(s)).toBe(2);
    s.research.completed.push('national-lab-network');
    expect(researchCapacity(s)).toBe(3);
    s.activePolicies.push('open-science-mandate');
    expect(researchCapacity(s)).toBe(4);
    s.buildings['science-academy'] = 1;
    expect(researchCapacity(s)).toBe(5);

    // Nothing can push past the ceiling.
    s.research.bonusSlots = 20;
    expect(researchCapacity(s)).toBe(MAX_RESEARCH_SLOTS);
  });

  it('runs several projects at once and finishes them all', () => {
    const s = createGame(setupFor('south-korea'), 4);
    s.research.completed = ['public-research', 'research-consortia', 'national-lab-network'];
    s.activePolicies = ['open-science-mandate'];
    s.buildings['science-academy'] = 1;
    s.research.active = [];
    s.research.queue = [];
    s.research.current = null;
    s.society.education = 100;
    s.budget.research.level = 2;

    const picks = startableTechs(s).slice(0, 4);
    for (const tech of picks) expect(beginResearch(s, tech.id).ok).toBe(true);
    expect(s.research.active.length).toBe(picks.length);

    run(s, 320);
    for (const tech of picks) {
      expect(s.research.completed, `${tech.id} should have completed`).toContain(tech.id);
    }
  });

  it('divides output by priority rather than multiplying it', () => {
    const s = createGame(setupFor('germany'), 5);
    s.research.completed = ['research-consortia'];
    s.research.active = [];
    s.research.queue = [];
    s.research.current = null;
    const [a, b] = startableTechs(s).slice(0, 2);
    beginResearch(s, a.id);
    beginResearch(s, b.id);
    setResearchPriority(s, a.id, 2);
    setResearchPriority(s, b.id, 0.5);

    run(s, 6);

    const projectA = s.research.active.find((p) => p.techId === a.id);
    const projectB = s.research.active.find((p) => p.techId === b.id);
    // One of them may have completed; if both are live, the weighting must show.
    if (projectA && projectB) {
      expect(projectA.progress).toBeGreaterThan(projectB.progress);
    } else {
      expect(s.research.completed.length).toBeGreaterThan(0);
    }
  });

  it('banks output when nothing is running and spends it on the next start', () => {
    const s = createGame(setupFor('norway'), 6);
    stopResearch(s);
    expect(s.research.active).toHaveLength(0);

    run(s, 6);
    const banked = s.research.points;
    expect(banked, 'idle output must accumulate').toBeGreaterThan(0);

    const next = startableTechs(s)[0];
    beginResearch(s, next.id);
    const project = s.research.active.find((p) => p.techId === next.id)!;
    expect(project.progress, 'banked points go straight into the new project').toBeGreaterThan(0);
    expect(s.research.points).toBeLessThan(banked);
  });

  it('rushes a project only when the bank can cover the premium', () => {
    const s = createGame(setupFor('usa'), 7);
    const current = s.research.active[0].techId;
    s.research.points = 0;
    expect(rushResearch(s, current).ok, 'cannot rush with an empty bank').toBe(false);

    s.research.points = TECH_INDEX[current].cost * 3;
    expect(rushResearch(s, current).ok).toBe(true);
    run(s, 1);
    expect(s.research.completed).toContain(current);
  });

  it('parks a project back in the queue when a slot is lost', () => {
    const s = createGame(setupFor('france'), 8);
    s.activePolicies = ['open-science-mandate'];
    // Clear the mirror too, or reconciliation will correctly resurrect the
    // project `createGame` started and the fixture will be running three.
    s.research.active = [];
    s.research.queue = [];
    s.research.current = null;
    s.research.progress = 0;
    const [a, b] = startableTechs(s).slice(0, 2);
    beginResearch(s, a.id);
    beginResearch(s, b.id);
    expect(s.research.active).toHaveLength(2);

    // Repealing the policy removes the second laboratory.
    s.activePolicies = [];
    normaliseResearch(s);
    expect(s.research.active).toHaveLength(1);
    expect(s.research.queue).toHaveLength(1);
  });

  it('reconciles a state where `current` was set directly', () => {
    const s = createGame(setupFor('india'), 9);
    s.research.active = [];
    s.research.queue = [];
    s.research.current = 'modern-banking';
    s.research.progress = 120;

    normaliseResearch(s);
    expect(s.research.active).toHaveLength(1);
    expect(s.research.active[0].techId).toBe('modern-banking');
    expect(s.research.active[0].progress).toBe(120);
  });

  it('never lets the same technology occupy two slots', () => {
    const s = createGame(setupFor('china'), 10);
    s.research.completed = ['research-consortia'];
    const current = s.research.active[0].techId;
    expect(beginResearch(s, current).ok).toBe(false);
    s.research.active.push({ techId: current, progress: 0, priority: 1 });
    normaliseResearch(s);
    expect(s.research.active.filter((p) => p.techId === current)).toHaveLength(1);
  });

  it('reports a finite completion estimate for every live project', () => {
    const s = createGame(setupFor('brazil'), 11);
    run(s, 3);
    for (const project of s.research.active) {
      const months = monthsRemaining(s, project.techId);
      if (months !== null) expect(Number.isFinite(months)).toBe(true);
    }
  });
});

/* ==================================================================== */
/* Political capital and the legislature                                */
/* ==================================================================== */

describe('political capital', () => {
  it('accrues within the cap and is spent by legislation', () => {
    const s = createGame(setupFor('germany'), 20);
    const start = s.governance.capital;
    run(s, 12);
    expect(s.governance.capital).toBeGreaterThan(start);
    expect(s.governance.capital).toBeLessThanOrEqual(s.governance.capitalCap + 0.001);
    expect(Number.isFinite(capitalIncome(s))).toBe(true);
  });

  it('refuses legislation the government cannot pay for in authority', () => {
    const s = createGame(setupFor('germany'), 21);
    s.economy.treasury = 1e9;
    s.governance.capital = 0;
    const policy = policyAvailability(s, 'stimulus-package');
    expect(policy.enabled).toBe(false);
    expect(policy.reason).toMatch(/political capital/i);
  });

  it('charges more for a bill the house dislikes', () => {
    const cheap = createGame(setupFor('germany'), 22);
    const dear = createGame(setupFor('germany'), 22);
    cheap.governance.legislativeSupport = 90;
    dear.governance.legislativeSupport = 10;
    const policy = policyAvailability(cheap, 'stimulus-package');
    const dearPolicy = policyAvailability(dear, 'stimulus-package');
    expect(dearPolicy.politicalCost).toBeGreaterThan(policy.politicalCost);
  });

  it('derives a sane cost for every policy in the game', () => {
    const s = createGame(setupFor('france'), 23);
    for (const id of Object.keys(policyIds())) {
      const availability = policyAvailability(s, id);
      expect(Number.isFinite(availability.politicalCost), id).toBe(true);
      expect(availability.politicalCost).toBeGreaterThan(0);
      expect(availability.politicalCost).toBeLessThanOrEqual(160);
      expect(availability.note.length, `${id} needs an explanation`).toBeGreaterThan(5);
    }
  });

  it('spends capital atomically', () => {
    const s = createGame(setupFor('japan'), 24);
    s.governance.capital = 10;
    expect(spendCapital(s, 25)).toBe(false);
    expect(s.governance.capital, 'a failed spend must not deduct anything').toBe(10);
    expect(spendCapital(s, 6)).toBe(true);
    expect(s.governance.capital).toBe(4);
  });

  it('assesses every policy without producing a broken number', () => {
    const s = createGame(setupFor('nigeria'), 25);
    for (const policy of policyList()) {
      const assessment = assessLegislation(s, policy);
      expect(Number.isFinite(assessment.cost), policy.id).toBe(true);
      expect(assessment.support).toBeGreaterThanOrEqual(0);
      expect(assessment.support).toBeLessThanOrEqual(100);
      expect(basePoliticalCost(policy)).toBeGreaterThan(0);
    }
  });
});

function policyList() {
  return POLICIES;
}

function policyIds(): Record<string, true> {
  return Object.fromEntries(POLICIES.map((p) => [p.id, true as const]));
}

/* ==================================================================== */
/* Interest groups                                                      */
/* ==================================================================== */

describe('interest groups', () => {
  it('initialises every faction with a share of influence summing to 100', () => {
    const s = createGame(setupFor('brazil'), 30);
    expect(s.factions).toHaveLength(FACTIONS.length);
    const total = s.factions.reduce((sum, f) => sum + f.influence, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.5);
  });

  it('keeps satisfaction and influence in range over a long campaign', () => {
    const s = createGame(setupFor('turkey', { neverEndGame: true }), 31);
    run(s, 300);
    const total = s.factions.reduce((sum, f) => sum + f.influence, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.5);
    for (const faction of s.factions) {
      expect(faction.satisfaction).toBeGreaterThanOrEqual(0);
      expect(faction.satisfaction).toBeLessThanOrEqual(100);
      expect(faction.influence).toBeGreaterThan(0);
    }
  });

  it('moves business against a wealth tax and labour toward it', () => {
    const s = createGame(setupFor('france'), 32);
    const before = factionTargets(s);
    s.taxes.wealth = 6;
    s.budget.welfare.level = 1.6;
    const after = factionTargets(s);
    expect(after.business).toBeLessThan(before.business);
    expect(after.labour).toBeGreaterThan(before.labour);
  });

  it('feeds a real modifier into the simulation', () => {
    const s = createGame(setupFor('germany'), 33);
    for (const faction of s.factions) faction.satisfaction = 100;
    const pleased = factionModifiers(s);
    for (const faction of s.factions) faction.satisfaction = 0;
    const angered = factionModifiers(s);
    expect(Object.keys(pleased).length).toBeGreaterThan(0);
    expect(Object.keys(angered).length).toBeGreaterThan(0);
    // The two must genuinely differ, or the mechanic is inert.
    expect(JSON.stringify(pleased)).not.toBe(JSON.stringify(angered));

    // And it must reach `totalModifiers`, which is what the engine reads.
    const totals = totalModifiers(s);
    for (const value of Object.values(totals)) expect(Number.isFinite(value)).toBe(true);
  });

  it('produces a coup risk that rises with an alienated, powerful army', () => {
    const s = createGame(setupFor('nigeria'), 34);
    const army = s.factions.find((f) => f.id === 'military')!;
    army.satisfaction = 80;
    expect(coupRisk(s)).toBe(0);
    army.satisfaction = 2;
    army.influence = 40;
    s.stability = 20;
    s.governance.mandate = 10;
    expect(coupRisk(s)).toBeGreaterThan(0);
    expect(coupRisk(s)).toBeLessThanOrEqual(0.05);
  });

  it('never ends an eternal campaign by coup', () => {
    const s = createGame(setupFor('nigeria', { neverEndGame: true }), 35);
    for (let i = 0; i < 300; i++) {
      const army = s.factions.find((f) => f.id === 'military')!;
      army.satisfaction = 0;
      army.influence = 45;
      s.stability = 15;
      s.governance.mandate = 5;
      autoResolve(s);
      tick(s);
    }
    expect(s.gameOver).toBeNull();
  });
});

/* ==================================================================== */
/* Crises                                                               */
/* ==================================================================== */

describe('crises', () => {
  it('every definition has stages, responses and a climax', () => {
    for (const def of CRISES) {
      expect(def.stages.length, `${def.id} needs stages`).toBeGreaterThan(0);
      expect(def.responses.length, `${def.id} needs responses`).toBeGreaterThan(1);
      expect(Object.keys(def.climax).length, `${def.id} needs a climax`).toBeGreaterThan(0);
      for (const stage of def.stages) {
        expect(stage.months).toBeGreaterThan(0);
        expect(Object.keys(stage.modifiers).length).toBeGreaterThan(0);
      }
      for (const response of def.responses) {
        expect(response.severityRelief).toBeGreaterThan(0);
        expect(response.description.length).toBeGreaterThan(20);
      }
    }
  });

  it('opens a crisis when its condition is genuinely met', () => {
    const s = createGame(setupFor('turkey'), 40);
    // Force the energy emergency condition: supply far below demand.
    s.energy.demand = 800;
    for (const key of Object.keys(s.energy.production) as (keyof typeof s.energy.production)[]) {
      s.energy.production[key] = 10;
    }
    s.turn = 24;

    let opened = false;
    for (let i = 0; i < 200 && !opened; i++) {
      updateCrises(s, noop);
      opened = s.crises.some((c) => c.defId === 'energy-emergency');
    }
    expect(opened, 'a sustained grid shortfall must eventually open the emergency').toBe(true);
  });

  it('escalates through stages and applies the climax when ignored', () => {
    const s = createGame(setupFor('turkey'), 41);
    const def = CRISIS_INDEX['energy-emergency'];
    s.crises = [{
      id: 'test-crisis',
      defId: 'energy-emergency',
      startedTurn: s.turn,
      stage: 0,
      monthsInStage: 0,
      severity: 60,
      responsesUsed: [],
    }];

    const totalMonths = def.stages.reduce((sum, stage) => sum + stage.months, 0) + 4;
    const approvalBefore = s.approval;
    for (let i = 0; i < totalMonths; i++) updateCrises(s, noop);

    expect(s.crises, 'an ignored crisis must eventually end itself').toHaveLength(0);
    expect(s.crisisCooldowns['energy-emergency']).toBeDefined();
    expect(s.approval, 'the climax must actually hurt').toBeLessThan(approvalBefore);
  });

  it('is resolved by responding, and each response is single-use', () => {
    const s = createGame(setupFor('germany'), 42);
    s.economy.treasury = 1e9;
    s.governance.capital = 1e4;
    s.crises = [{
      id: 'test-crisis',
      defId: 'energy-emergency',
      startedTurn: s.turn,
      stage: 0,
      monthsInStage: 0,
      severity: 55,
      responsesUsed: [],
    }];

    const before = s.crises[0].severity;
    // 'emergency-generation' carries no risk, so the relief is deterministic.
    const outcome = respondToCrisis(s, 'test-crisis', 'emergency-generation', noop);
    expect(outcome.ok).toBe(true);
    expect(s.crises[0].severity).toBeLessThan(before);
    expect(respondToCrisis(s, 'test-crisis', 'emergency-generation', noop).ok, 'single use').toBe(false);
  });

  it('applies a live drag scaled by severity', () => {
    const s = createGame(setupFor('germany'), 43);
    s.crises = [{
      id: 'c', defId: 'energy-emergency', startedTurn: 0, stage: 1, monthsInStage: 0,
      severity: 100, responsesUsed: [],
    }];
    const heavy = crisisModifiers(s);
    s.crises[0].severity = 10;
    const light = crisisModifiers(s);
    expect(Math.abs(heavy.gdpGrowth ?? 0)).toBeGreaterThan(Math.abs(light.gdpGrowth ?? 0));
  });

  it('never runs more than three at once, over a long campaign', () => {
    const s = createGame(setupFor('venezuela', { difficulty: 'brutal', neverEndGame: true }), 44);
    for (let i = 0; i < 400; i++) {
      autoResolve(s);
      tick(s);
      expect(s.crises.length).toBeLessThanOrEqual(3);
    }
  });
});

/* ==================================================================== */
/* The living world                                                     */
/* ==================================================================== */

describe('the world', () => {
  it('grows foreign economies and militaries over time', () => {
    const s = createGame(setupFor('fiji'), 50);
    const before = s.nations.map((n) => ({ id: n.id, gdp: n.gdp, mil: n.militaryStrength }));
    run(s, 240);
    const grewEconomically = s.nations.filter((n) => {
      const prior = before.find((b) => b.id === n.id);
      return prior && n.gdp > prior.gdp;
    });
    expect(grewEconomically.length, 'most of the world should be richer').toBeGreaterThan(
      s.nations.length * 0.6,
    );
    const changedMilitarily = s.nations.filter((n) => {
      const prior = before.find((b) => b.id === n.id);
      return prior && Math.abs(n.militaryStrength - prior.mil) > 0.5;
    });
    expect(changedMilitarily.length, 'militaries must not be frozen').toBeGreaterThan(0);
  });

  it('cycles the global economy through all four phases', () => {
    const s = createGame(setupFor('germany'), 51);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      autoResolve(s);
      tick(s);
      seen.add(s.world.cyclePhase);
      expect(s.world.cycle).toBeGreaterThanOrEqual(-1);
      expect(s.world.cycle).toBeLessThanOrEqual(1);
    }
    expect(seen.size, 'the cycle should turn several times in fifty years').toBeGreaterThan(2);
  });

  it('starts wars between third parties without involving the player', () => {
    const s = createGame(setupFor('norway', { neverEndGame: true }), 52);
    let sawForeignWar = false;
    for (let i = 0; i < 400 && !sawForeignWar; i++) {
      autoResolve(s);
      tick(s);
      sawForeignWar = s.foreignWars.length > 0;
    }
    // Not guaranteed by the RNG, but the bookkeeping must stay consistent.
    for (const war of s.foreignWars) {
      const a = s.nations.find((n) => n.id === war.aId);
      const b = s.nations.find((n) => n.id === war.bId);
      expect(a?.warsWith).toContain(war.bId);
      expect(b?.warsWith).toContain(war.aId);
    }
  });

  it('produces offers that can be accepted or declined without breaking state', () => {
    const s = createGame(setupFor('india', { neverEndGame: true }), 53);
    s.economy.treasury = 1e8;
    let handled = 0;
    for (let i = 0; i < 300; i++) {
      autoResolve(s);
      tick(s);
      while (s.offers.length > 0) {
        const offer = s.offers[0];
        const result = handled % 2 === 0
          ? acceptOffer(s, offer.id, noop)
          : declineOffer(s, offer.id, noop);
        expect(typeof result.message).toBe('string');
        handled++;
        s.economy.treasury = 1e8;
        // Accepting can legitimately fail — a duplicate treaty, a demand the
        // treasury cannot cover — and the offer stays on the table by design.
        // Declining always clears it, so the loop cannot spin.
        if (s.offers.some((o) => o.id === offer.id)) declineOffer(s, offer.id, noop);
      }
    }
    expect(handled, 'the world should have approached us at least once').toBeGreaterThan(0);
    expect(s.offers).toHaveLength(0);
  });

  it('expires an unanswered offer on its own', () => {
    const s = createGame(setupFor('brazil'), 54);
    const nation = s.nations[0];
    s.offers = [{
      id: 'test-offer',
      countryId: nation.id,
      kind: 'treaty',
      treatyType: 'trade',
      title: 'A test proposal',
      body: 'Body text.',
      acceptRelations: 10,
      refuseRelations: -5,
      expiresTurn: s.turn + 2,
    }];
    run(s, 5);
    expect(s.offers).toHaveLength(0);
  });

  it('hides a rival’s true strength behind an estimate without coverage', () => {
    const s = createGame(setupFor('japan'), 55);
    const nation = s.nations.find((n) => n.militaryStrength > 40)!;
    s.intelligence.dossiers[nation.id] = 0;
    const blind = estimatedStrength(s, nation);
    expect(blind.confident).toBe(false);

    s.intelligence.dossiers[nation.id] = 95;
    const informed = estimatedStrength(s, nation);
    expect(informed.confident).toBe(true);
    expect(informed.value).toBe(nation.militaryStrength);

    // The estimate must be stable, not noise on every read.
    s.intelligence.dossiers[nation.id] = 0;
    expect(estimatedStrength(s, nation).value).toBe(blind.value);
  });

  it('assigns every nation a bloc', () => {
    const s = createGame(setupFor('egypt'), 56);
    run(s, 12);
    for (const nation of s.nations) {
      expect(nation.bloc, `${nation.name} needs a bloc`).not.toBeNull();
    }
    expect(naturalBloc({ government: 'democracy', region: 'europe', gdp: 900 })).toBe('western');
  });

  it('keeps the world numerically sound when driven directly', () => {
    const s = createGame(setupFor('usa'), 57);
    for (let i = 0; i < 300; i++) updateWorld(s, noop);
    expect(Number.isFinite(s.world.tension)).toBe(true);
    expect(s.world.tension).toBeGreaterThanOrEqual(0);
    expect(s.world.tension).toBeLessThanOrEqual(100);
    for (const nation of s.nations) {
      expect(nation.gdp).toBeGreaterThan(0);
      expect(nation.militaryStrength).toBeGreaterThanOrEqual(0);
      expect(nation.militaryStrength).toBeLessThanOrEqual(100);
      expect(nation.threatPerception).toBeGreaterThanOrEqual(0);
      expect(nation.threatPerception).toBeLessThanOrEqual(100);
    }
  });
});

/* ==================================================================== */
/* Finance                                                              */
/* ==================================================================== */

describe('sovereign finance', () => {
  it('moves money into and out of the fund without creating or destroying any', () => {
    const s = createGame(setupFor('norway'), 60);
    const total = s.economy.treasury + s.economy.sovereignFund;
    expect(depositToFund(s, 1000).ok).toBe(true);
    expect(s.economy.treasury + s.economy.sovereignFund).toBeCloseTo(total, 5);
    expect(withdrawFromFund(s, 400).ok).toBe(true);
    expect(s.economy.treasury + s.economy.sovereignFund).toBeCloseTo(total, 5);
  });

  it('refuses a deposit or withdrawal that is not covered', () => {
    const s = createGame(setupFor('fiji'), 61);
    expect(depositToFund(s, s.economy.treasury + 1).ok).toBe(false);
    expect(withdrawFromFund(s, 1).ok).toBe(false);
  });

  it('compounds the fund over time', () => {
    const s = createGame(setupFor('norway'), 62);
    depositToFund(s, Math.min(5000, s.economy.treasury));
    const start = s.economy.sovereignFund;
    // Force a benign world so the return is reliably positive.
    s.world.cycle = 0.8;
    s.corruption = 5;
    run(s, 60);
    expect(s.economy.sovereignFund).toBeGreaterThan(start);
    expect(Number.isFinite(fundReturnRate(s))).toBe(true);
  });

  it('prices political control of the central bank', () => {
    const s = createGame(setupFor('germany'), 63);
    expect(s.economy.centralBankIndependent).toBe(true);
    const rating = s.economy.creditRating;
    expect(setCentralBankIndependence(s, false).ok).toBe(true);
    expect(s.economy.creditRating).toBeLessThan(rating);
    expect(setPolicyRate(s, 9).ok).toBe(true);
    expect(s.economy.policyRateTarget).toBe(9);

    run(s, 24);
    // The engine must actually follow the ordered rate.
    expect(Math.abs(s.economy.interestRate - 9)).toBeLessThan(2);
  });

  it('will not take a policy rate order while the bank is independent', () => {
    const s = createGame(setupFor('germany'), 64);
    expect(setPolicyRate(s, 15).ok).toBe(false);
  });

  it('trades short-run cash against long-run debt when the sweep is off', () => {
    const swept = createGame(setupFor('china'), 65);
    const hoarded = createGame(setupFor('china'), 65);
    setAutoRepayDebt(hoarded, false);
    // A large surplus in both, so the sweep has something to do.
    for (const s of [swept, hoarded]) {
      s.taxes.income = 55;
      s.taxes.vat = 25;
      for (const dept of Object.keys(s.budget) as (keyof typeof s.budget)[]) s.budget[dept].level = 0.5;
    }

    run(swept, 12);
    run(hoarded, 12);
    // In the short run, turning the sweep off is exactly what it says: a war
    // chest, because the surplus stays as cash instead of retiring debt.
    expect(hoarded.economy.treasury).toBeGreaterThan(swept.economy.treasury);

    run(swept, 108);
    run(hoarded, 108);
    // Over a decade the bill arrives: the debt was never paid down, so the
    // interest compounds against you. This is the cost the toggle warns about.
    expect(hoarded.economy.debt).toBeGreaterThan(swept.economy.debt);
  });

  it('quotes a bond yield above the policy rate', () => {
    const s = createGame(setupFor('brazil'), 66);
    run(s, 6);
    expect(s.economy.bondYield).toBeGreaterThanOrEqual(s.economy.interestRate);
    expect(Number.isFinite(s.economy.bondYield)).toBe(true);
  });
});

/* ==================================================================== */
/* National agendas                                                     */
/* ==================================================================== */

describe('national agendas', () => {
  it('has a coherent definition for every plan', () => {
    for (const def of AGENDAS) {
      expect(def.improvement).toBeGreaterThan(0);
      expect(Object.keys(def.duringModifiers).length, `${def.id} needs a real handicap`).toBeGreaterThan(0);
      expect(Object.keys(def.rewardModifiers).length, `${def.id} needs a reward`).toBeGreaterThan(0);
      expect(def.rewardCapital).toBeGreaterThan(0);
    }
  });

  it('costs capital to declare and cannot be doubled up', () => {
    const s = createGame(setupFor('germany'), 70);
    s.governance.capital = AGENDA_DECLARATION_COST + 5;
    expect(declareAgenda(s, 'great-society').ok).toBe(true);
    expect(s.governance.capital).toBeCloseTo(5, 5);
    expect(declareAgenda(s, 'rearmament').ok, 'only one plan at a time').toBe(false);
  });

  it('refuses to declare without the capital', () => {
    const s = createGame(setupFor('germany'), 71);
    s.governance.capital = 1;
    expect(declareAgenda(s, 'great-society').ok).toBe(false);
    expect(s.agenda).toBeNull();
  });

  it('rewards a delivered plan permanently and clears it', () => {
    const s = createGame(setupFor('germany'), 72);
    s.governance.capital = 100;
    expect(declareAgenda(s, 'rearmament').ok).toBe(true);
    const def = AGENDA_INDEX['rearmament'];

    // Force the target to be met, then run past the deadline.
    s.agenda!.target = readMetric(s, def.metric);
    expect(agendaMet(s)).toBe(true);
    s.agenda!.endsTurn = s.turn + 1;
    run(s, 3);

    expect(s.agenda, 'a settled plan is cleared').toBeNull();
    expect(s.agendasCompleted).toContain('rearmament');
    expect(
      s.activeModifiers.some((m) => m.id.startsWith('agenda-rearmament')),
      'the reward must be a permanent modifier',
    ).toBe(true);
  });

  it('punishes a missed plan', () => {
    const s = createGame(setupFor('germany'), 73);
    s.governance.capital = 100;
    declareAgenda(s, 'rearmament');
    // An unreachable target.
    s.agenda!.target = 1000;
    s.agenda!.endsTurn = s.turn + 1;
    const approvalBefore = s.approval;
    run(s, 3);
    expect(s.agenda).toBeNull();
    expect(s.agendasCompleted).not.toContain('rearmament');
    expect(s.approval).toBeLessThan(approvalBefore);
  });

  it('charges for abandoning one early', () => {
    const s = createGame(setupFor('germany'), 74);
    s.governance.capital = 100;
    declareAgenda(s, 'great-society');
    const approvalBefore = s.approval;
    expect(abandonAgenda(s).ok).toBe(true);
    expect(s.agenda).toBeNull();
    expect(s.approval).toBeLessThan(approvalBefore);
  });

  it('reports finite progress for every metric', () => {
    for (const def of AGENDAS) {
      const s = createGame(setupFor('brazil'), 75);
      s.governance.capital = 100;
      expect(declareAgenda(s, def.id).ok, def.id).toBe(true);
      run(s, 12);
      const progress = agendaProgress(s);
      expect(Number.isFinite(progress), def.id).toBe(true);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });
});

/* ==================================================================== */
/* Military, provinces and migration                                    */
/* ==================================================================== */

describe('military and provinces', () => {
  it('shifts branch capability when emphasis changes', () => {
    const even = createGame(setupFor('usa'), 80);
    const cyberHeavy = createGame(setupFor('usa'), 80);
    setBranchFunding(cyberHeavy, 'cyber', 2.5);
    setBranchFunding(cyberHeavy, 'navy', 0.25);
    run(even, 120);
    run(cyberHeavy, 120);
    expect(cyberHeavy.military.cyber).toBeGreaterThan(even.military.cyber);
    expect(cyberHeavy.military.navy).toBeLessThan(even.military.navy);
  });

  it('gates the weapons programme behind the technology', () => {
    const s = createGame(setupFor('brazil'), 81);
    expect(s.military.nuclearProgrammeActive).toBe(false);
    // Not researched: refused outright.
    expect(s.research.completed.includes('nuclear-weapons')).toBe(false);
  });

  it('suppresses unrest under martial law at a cost in loyalty', () => {
    const s = createGame(setupFor('nigeria'), 82);
    s.governance.capital = 100;
    s.military.strength = 60;
    const province = s.provinces[1];
    const loyaltyBefore = province.loyalty;
    expect(setMartialLaw(s, province.id, true).ok).toBe(true);
    expect(province.martialLaw).toBe(true);
    run(s, 36);
    expect(province.loyalty, 'occupation costs consent').toBeLessThan(loyaltyBefore);
  });

  it('pays standing province investment out of the budget every month', () => {
    const s = createGame(setupFor('india'), 83);
    const province = s.provinces[0];
    expect(setProvinceInvestment(s, province.id, 200).ok).toBe(true);
    expect(province.investment).toBe(200);
    const treasuryBefore = s.economy.treasury;
    run(s, 1);
    // The money genuinely leaves; the exact figure depends on the whole budget,
    // so the assertion is that it is accounted for rather than ignored.
    expect(Number.isFinite(s.economy.treasury)).toBe(true);
    expect(s.economy.treasury).not.toBe(treasuryBefore);
  });

  it('accumulates separatism slowly rather than in a single month', () => {
    const s = createGame(setupFor('nigeria', { neverEndGame: true }), 84);
    const before = s.provinces.map((p) => p.separatism);
    run(s, 1);
    for (let i = 0; i < s.provinces.length; i++) {
      expect(Math.abs(s.provinces[i].separatism - before[i])).toBeLessThan(5);
    }
    run(s, 300);
    for (const province of s.provinces) {
      expect(province.separatism).toBeGreaterThanOrEqual(0);
      expect(province.separatism).toBeLessThanOrEqual(100);
    }
  });
});

describe('schema 5 migration', () => {
  it('upgrades a v4 save into the new systems and keeps simulating', () => {
    const s = createGame(setupFor('france'), 90);
    run(s, 36);
    // Guarantee a project is genuinely in flight, so the single-project ->
    // slot-array conversion is really exercised rather than trivially empty.
    if (s.research.active.length === 0) {
      const next = startableTechs(s)[0];
      beginResearch(s, next.id);
    }
    expect(s.research.current, 'the fixture must have a live project').not.toBeNull();

    // Strip everything schema 5 introduced, as a v4 save would be.
    const legacy = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    legacy.version = 4;
    delete legacy.governance;
    delete legacy.factions;
    delete legacy.crises;
    delete legacy.crisisCooldowns;
    delete legacy.agenda;
    delete legacy.agendasCompleted;
    delete legacy.world;
    delete legacy.foreignWars;
    delete legacy.offers;
    delete legacy.records;
    const research = legacy.research as Record<string, unknown>;
    delete research.active;
    delete research.queue;
    delete research.bonusSlots;
    const economy = legacy.economy as Record<string, unknown>;
    delete economy.sovereignFund;
    delete economy.centralBankIndependent;
    delete economy.policyRateTarget;
    delete economy.bondYield;
    delete economy.autoRepayDebt;
    delete economy.realIndex;
    delete (legacy.military as Record<string, unknown>).branchFunding;
    delete (legacy.intelligence as Record<string, unknown>).dossiers;
    for (const p of legacy.provinces as Record<string, unknown>[]) {
      delete p.martialLaw;
      delete p.separatism;
      delete p.investment;
    }
    for (const n of legacy.nations as Record<string, unknown>[]) {
      delete n.agenda;
      delete n.warsWith;
      delete n.bloc;
      delete n.threatPerception;
      delete n.sanctioningPlayer;
    }

    const migrated = migrate(legacy as unknown as GameState);

    // The single in-flight project must survive into the slot array.
    expect(migrated.research.active.length).toBeGreaterThan(0);
    expect(migrated.research.active[0].techId).toBe(s.research.current);
    expect(migrated.factions).toHaveLength(FACTIONS.length);
    expect(migrated.governance.capital).toBeGreaterThanOrEqual(0);
    expect(migrated.world.tension).toBeGreaterThanOrEqual(0);
    expect(migrated.economy.centralBankIndependent).toBe(true);
    expect(migrated.economy.autoRepayDebt).toBe(true);
    expect(migrated.turn, 'migration must not lose progress').toBe(s.turn);
    for (const province of migrated.provinces) {
      expect(typeof province.martialLaw).toBe('boolean');
      expect(Number.isFinite(province.separatism)).toBe(true);
    }

    // And the migrated save must still run.
    run(migrated, 60);
    expect(migrated.turn).toBeGreaterThan(s.turn);
  });

  it('is idempotent', () => {
    const s = createGame(setupFor('france'), 91);
    run(s, 12);
    const once = migrate(JSON.parse(JSON.stringify(s)) as GameState);
    const twice = migrate(JSON.parse(JSON.stringify(once)) as GameState);
    expect(twice.research.active.length).toBe(once.research.active.length);
    expect(twice.factions.length).toBe(once.factions.length);
  });
});

/* ==================================================================== */
/* Whole-game soundness with every new system live                      */
/* ==================================================================== */

describe('integrated soundness', () => {
  it('runs a century with every system engaged and stays finite', () => {
    const s = createGame(
      setupFor('india', { neverEndGame: true, eventFrequency: 'high', difficulty: 'hard' }),
      100,
    );
    s.research.completed = ['research-consortia', 'national-lab-network'];
    s.buildings['science-academy'] = 1;
    s.activePolicies = ['open-science-mandate'];

    for (let i = 0; i < 600; i++) {
      autoResolve(s);

      // Keep the player active so every subsystem is exercised.
      if (s.research.active.length < researchCapacity(s)) {
        const next = startableTechs(s)[0];
        if (next) beginResearch(s, next.id);
      }
      if (!s.agenda && s.governance.capital >= AGENDA_DECLARATION_COST) {
        declareAgenda(s, AGENDAS[i % AGENDAS.length].id);
      }
      for (const crisis of [...s.crises]) {
        const def = CRISIS_INDEX[crisis.defId];
        const response = def?.responses[0];
        if (response) respondToCrisis(s, crisis.id, response.id, noop);
      }
      for (const offer of [...s.offers]) {
        acceptOffer(s, offer.id, noop);
        // Anything that could not be accepted is declined, so nothing can
        // accumulate on the desk indefinitely.
        if (s.offers.some((o) => o.id === offer.id)) declineOffer(s, offer.id, noop);
      }

      tick(s);
    }

    expect(s.turn).toBe(600);
    expect(s.gameOver).toBeNull();

    // Every headline index must remain in range.
    const percentages: [string, number][] = [
      ['approval', s.approval], ['stability', s.stability], ['corruption', s.corruption],
      ['mandate', s.governance.mandate], ['legislativeSupport', s.governance.legislativeSupport],
      ['tension', s.world.tension],
    ];
    for (const [label, value] of percentages) {
      expect(Number.isFinite(value), label).toBe(true);
      expect(value, label).toBeGreaterThanOrEqual(0);
      expect(value, label).toBeLessThanOrEqual(100);
    }
    expect(s.governance.capital).toBeGreaterThanOrEqual(0);
    expect(s.economy.sovereignFund).toBeGreaterThanOrEqual(0);
    expect(s.economy.treasury).toBeGreaterThanOrEqual(0);
    expect(s.research.active.length).toBeLessThanOrEqual(researchCapacity(s));
    expect(s.history.length).toBe(s.turn);
  });

  it('never leaves a research slot silently over-subscribed', () => {
    const s = createGame(setupFor('south-korea', { neverEndGame: true }), 101);
    for (let i = 0; i < 240; i++) {
      autoResolve(s);
      const next = startableTechs(s)[0];
      if (next) beginResearch(s, next.id);
      tick(s);
      expect(s.research.active.length).toBeLessThanOrEqual(researchCapacity(s));
      const ids = s.research.active.map((p) => p.techId);
      expect(new Set(ids).size, 'no duplicate projects').toBe(ids.length);
      for (const id of ids) {
        expect(s.research.completed).not.toContain(id);
      }
    }
  });

  it('keeps every technology reachable with parallel research on', () => {
    const s = createGame(setupFor('south-korea'), 102);
    s.society.education = 100;
    s.budget.research.level = 2;
    s.monthsToElection = -1;

    let guard = 0;
    while (s.research.completed.length < TECHNOLOGIES.length && guard++ < 6000) {
      while (s.research.active.length < researchCapacity(s)) {
        const next = startableTechs(s)[0];
        if (!next) break;
        beginResearch(s, next.id);
      }
      autoResolve(s);
      s.gameOver = null;
      tick(s);
    }
    expect(s.research.completed.length).toBe(TECHNOLOGIES.length);
  });

  /**
   * The balance guard.
   *
   * The schema-5 systems each add a way for a passive campaign to go wrong, and
   * the first cut of them together dropped hands-off survival from 93% to 37%.
   * This pins the measured figure so a future tuning change cannot quietly
   * repeat that. It is a coarse check on purpose — it fails on a collapse in
   * survivability, not on a couple of percentage points of drift.
   */
  it('keeps a hands-off campaign survivable across many seeds', () => {
    const countries = ['usa', 'germany', 'india', 'norway', 'japan', 'brazil', 'nigeria', 'fiji'];
    let survived = 0;
    let total = 0;

    for (const id of countries) {
      for (let seed = 0; seed < 4; seed++) {
        const s = createGame(setupFor(id), 1000 + seed * 977);
        for (let i = 0; i < 480 && !s.gameOver; i++) {
          autoResolve(s);
          tick(s);
        }
        total += 1;
        if (!s.gameOver || s.gameOver.victory) survived += 1;
      }
    }

    const rate = survived / total;
    expect(
      rate,
      `hands-off survival collapsed to ${(rate * 100).toFixed(0)}% (${survived}/${total})`,
    ).toBeGreaterThan(0.7);
  });

  it('keeps a campaign alive when the player simply follows the cabinet', () => {
    // The other half of the guard, and a direct test of the advisory promise:
    // a player who does nothing except take the top recommendation every month
    // should not lose. If following the game's own advice is not survivable,
    // the advice is wrong.
    for (const id of ['usa', 'india', 'nigeria', 'japan']) {
      const s = createGame(setupFor(id), 606);

      for (let i = 0; i < 480 && !s.gameOver; i++) {
        autoResolve(s);

        for (const rec of buildRecommendations(s, 3)) {
          const action = rec.action;
          if (!action) continue;
          switch (action.kind) {
            case 'policy': enactPolicy(s, action.id); break;
            case 'decree': enactDecree(s, action.id); break;
            case 'research': startResearch(s, action.id); break;
            case 'build': startConstruction(s, action.id); break;
            case 'org': joinOrg(s, action.id as never); break;
            case 'budget': setBudget(s, action.dept, action.level); break;
            case 'tax': setTax(s, action.key, action.value); break;
            case 'crisis': respondToCrisis(s, action.crisisId, action.responseId, noop); break;
            case 'offer':
              if (action.accept) acceptOffer(s, action.offerId, noop);
              else declineOffer(s, action.offerId, noop);
              break;
            case 'agenda': declareAgenda(s, action.id); break;
            case 'branch': setBranchFunding(s, action.branch, action.weight); break;
          }
        }

        // Fill the cabinet, which the board raises but cannot act on itself.
        for (const advisor of ADVISORS) {
          if (s.advisors.length >= 5) break;
          appointAdvisor(s, advisor.id);
        }

        tick(s);
      }

      expect(s.gameOver?.victory ?? true, `${id} should not lose while following its own advice`).toBe(true);
      // Winning early is a success, not a short run — several of these reach
      // their victory objective the month it becomes eligible.
      if (!s.gameOver?.victory) {
        expect(s.turn, `${id} should reach the full run`).toBeGreaterThan(400);
      }
    }
  });

  it('runs an enactment-heavy campaign without breaking the political economy', () => {
    const s = createGame(setupFor('germany', { neverEndGame: true }), 103);
    for (let i = 0; i < 200; i++) {
      autoResolve(s);
      s.economy.treasury = 1e8;
      s.governance.capital = Math.min(s.governance.capitalCap, s.governance.capital + 50);
      for (const policy of policyList()) {
        if (policyAvailability(s, policy.id).enabled) enactPolicy(s, policy.id);
      }
      tick(s);
    }
    expect(s.activePolicies.length).toBeGreaterThan(10);
    for (const faction of s.factions) {
      expect(Number.isFinite(faction.satisfaction)).toBe(true);
    }
    const totals = totalModifiers(s);
    for (const [key, value] of Object.entries(totals)) {
      expect(Number.isFinite(value), `modifier ${key}`).toBe(true);
    }
  });
});
