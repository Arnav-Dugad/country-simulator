import type {
  BudgetDept,
  CovertOp,
  GameState,
  LogEntry,
  MilitaryBranch,
  MilitaryState,
  OrgId,
  ResourceId,
  TaxKey,
  TradeAgreement,
  TreatyType,
  VictoryGoalId,
  WarGoal,
} from '../types';
import { BUILDING_INDEX } from '../data/buildings';
import { POLICY_INDEX } from '../data/policies';
import { TECH_INDEX } from '../data/technologies';
import { ADVISOR_INDEX, MAX_ADVISORS, ORG_INDEX } from '../data/institutions';
import { GOVERNMENT_INDEX, RESOURCE_INDEX, VICTORY_INDEX } from '../data/definitions';
import { DECREE_INDEX, decreeCooldownRemaining } from '../data/decrees';
import { clamp, costScale, gdpPerCapita } from '../selectors';
import { applyEventEffects } from './events';
import { nextRandom } from './rng';
import { quotedPrice, tradeEligibility, type TradeTerm } from './trade';
import { addTreasury, spendTreasury } from './treasury';
import {
  beginResearch,
  reorderQueue,
  rushResearch,
  setResearchPriority,
  stopResearch,
} from './research';
import { assessLegislation, basePoliticalCost, nudgeFactions, spendCapital } from './politics';
import { dissolveCoalition, formCoalition } from './coalition';
import { addGrievance, settleTradeDispute } from './tradewar';

export interface ActionResult {
  ok: boolean;
  message: string;
}

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

function push(s: GameState, entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>): void {
  s.log.unshift({
    id: `log-act-${s.turn}-${s.log.length}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    turn: s.turn,
    year: s.year,
    month: s.month,
    ...entry,
  });
  if (s.log.length > 400) s.log.length = 400;
}

/* ------------------------------------------------------------------ */
/* Policies                                                            */
/* ------------------------------------------------------------------ */

export interface PolicyAvailability {
  enabled: boolean;
  reason: string | null;
  /** Up-front money, in millions USD. */
  cost: number;
  /** Political capital the legislature will charge for it. */
  politicalCost: number;
  /** Expected share of the house voting for it, 0–100. */
  support: number;
  /** One line explaining the political price. */
  note: string;
}

export function policyAvailability(s: GameState, policyId: string): PolicyAvailability {
  const p = POLICY_INDEX[policyId];
  const scale = costScale(s.economy.gdp);
  if (!p) {
    return { enabled: false, reason: 'Unknown policy', cost: 0, politicalCost: 0, support: 0, note: '' };
  }
  const cost = p.upfrontCost * scale;
  const assessment = assessLegislation(s, p);
  const base = {
    cost,
    politicalCost: assessment.cost,
    support: assessment.support,
    note: assessment.note,
  };

  if (s.activePolicies.includes(policyId)) {
    return { ...base, enabled: false, reason: 'Already enacted' };
  }
  const conflict = p.conflicts?.find((c) => s.activePolicies.includes(c));
  if (conflict) {
    return { ...base, enabled: false, reason: `Conflicts with ${POLICY_INDEX[conflict]?.name ?? conflict}` };
  }
  const r = p.requires;
  if (r?.tech) {
    const missing = r.tech.filter((t) => !s.research.completed.includes(t));
    if (missing.length > 0) {
      return { ...base, enabled: false, reason: `Requires ${missing.map((t) => TECH_INDEX[t]?.name ?? t).join(', ')}` };
    }
  }
  if (r?.policies) {
    const missing = r.policies.filter((t) => !s.activePolicies.includes(t));
    if (missing.length > 0) {
      return { ...base, enabled: false, reason: `Requires ${missing.map((t) => POLICY_INDEX[t]?.name ?? t).join(', ')}` };
    }
  }
  if (r?.government && !r.government.includes(s.identity.government)) {
    return { ...base, enabled: false, reason: 'Not available under this government' };
  }
  if (r?.minStability !== undefined && s.stability < r.minStability) {
    return { ...base, enabled: false, reason: `Requires ${r.minStability} stability` };
  }
  if (r?.minGdpPerCapita !== undefined && gdpPerCapita(s) < r.minGdpPerCapita) {
    return {
      ...base,
      enabled: false,
      reason: `Requires $${r.minGdpPerCapita.toLocaleString()} GDP per capita`,
    };
  }
  if (assessment.blocked) {
    return { ...base, enabled: false, reason: 'The legislature will not hear it' };
  }
  if (s.governance.capital < assessment.cost) {
    return {
      ...base,
      enabled: false,
      reason: `Needs ${assessment.cost} political capital (you have ${Math.floor(s.governance.capital)})`,
    };
  }
  if (s.economy.treasury < cost) {
    return { ...base, enabled: false, reason: 'Insufficient treasury' };
  }
  return { ...base, enabled: true, reason: null };
}

export function enactPolicy(s: GameState, policyId: string): ActionResult {
  const availability = policyAvailability(s, policyId);
  if (!availability.enabled) return fail(availability.reason ?? 'Cannot enact');
  const p = POLICY_INDEX[policyId];

  spendTreasury(s, availability.cost);
  spendCapital(s, availability.politicalCost);
  s.activePolicies.push(policyId);
  s.governance.billsPassed += 1;
  s.governance.momentum = clamp(s.governance.momentum + 5, -100, 100);

  // Parties react to the ideological content of the policy.
  if (p.ideologyAppeal) {
    for (const party of s.parties) {
      const delta = p.ideologyAppeal[party.ideology];
      if (delta) party.relation = clamp(party.relation + delta, -100, 100);
    }
    const own = p.ideologyAppeal[s.leader.ideology] ?? 0;
    s.approval = clamp(s.approval + own * 0.12, 0, 100);
  }
  // Interest groups react to what the policy actually does to them.
  nudgeFactions(s, p.factionAppeal);

  push(s, { text: `Policy enacted: ${p.name}.`, category: 'policy', tone: 'good', icon: p.icon });
  return ok(`${p.name} enacted.`);
}

export function repealPolicy(s: GameState, policyId: string): ActionResult {
  if (!s.activePolicies.includes(policyId)) return fail('Policy is not active');
  const p = POLICY_INDEX[policyId];
  s.activePolicies = s.activePolicies.filter((id) => id !== policyId);
  // Repealing costs political capital — reversals always do.
  s.approval = clamp(s.approval - 2.5, 0, 100);
  spendCapital(s, Math.min(s.governance.capital, p ? Math.round(basePoliticalCost(p) * 0.4) : 4));
  s.governance.momentum = clamp(s.governance.momentum - 6, -100, 100);
  // Whoever liked it now dislikes you, and vice versa.
  if (p?.factionAppeal) nudgeFactions(s, p.factionAppeal, -0.7);
  push(s, { text: `Policy repealed: ${p?.name ?? policyId}.`, category: 'policy', tone: 'neutral', icon: '↩️' });
  return ok(`${p?.name ?? 'Policy'} repealed.`);
}

/* ------------------------------------------------------------------ */
/* Research                                                            */
/* ------------------------------------------------------------------ */

/**
 * Starts a technology, or queues it when every laboratory is occupied.
 *
 * The queue is what makes parallel research worth unlocking: you plan a
 * programme once instead of returning to the panel every time a slot opens.
 */
export function startResearch(s: GameState, techId: string): ActionResult {
  const outcome = beginResearch(s, techId);
  if (!outcome.ok) return fail(outcome.message);
  const t = TECH_INDEX[techId];
  if (!outcome.queued && t) {
    push(s, { text: `Research begun: ${t.name}.`, category: 'research', tone: 'neutral', icon: t.icon });
  }
  return ok(outcome.message);
}

/** Cancels a specific project, or the first one when none is named. */
export function cancelResearch(s: GameState, techId?: string): ActionResult {
  const outcome = stopResearch(s, techId);
  return outcome.ok ? ok(outcome.message) : fail(outcome.message);
}

/** Sets how much of the monthly output a running project receives. */
export function setResearchWeight(s: GameState, techId: string, priority: number): ActionResult {
  const outcome = setResearchPriority(s, techId, priority);
  return outcome.ok ? ok(outcome.message) : fail(outcome.message);
}

/** Moves a queued technology earlier or later. */
export function moveResearchQueue(s: GameState, techId: string, delta: number): ActionResult {
  const outcome = reorderQueue(s, techId, delta);
  return outcome.ok ? ok(outcome.message) : fail(outcome.message);
}

/** Spends banked points to finish a project immediately, at a premium. */
export function rushResearchProject(s: GameState, techId: string): ActionResult {
  const outcome = rushResearch(s, techId);
  if (!outcome.ok) return fail(outcome.message);
  push(s, {
    text: outcome.message,
    category: 'research',
    tone: 'good',
    icon: TECH_INDEX[techId]?.icon ?? '⚡',
  });
  return ok(outcome.message);
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

export interface BuildAvailability {
  enabled: boolean;
  reason: string | null;
  cost: number;
  owned: number;
  queued: number;
}

export function buildAvailability(s: GameState, buildingId: string): BuildAvailability {
  const b = BUILDING_INDEX[buildingId];
  const scale = costScale(s.economy.gdp);
  const owned = s.buildings[buildingId] ?? 0;
  const queued = s.construction.filter((c) => c.buildingId === buildingId).length;
  if (!b) return { enabled: false, reason: 'Unknown project', cost: 0, owned, queued };
  const cost = b.cost * scale;

  if (owned + queued >= b.maxCount) {
    return { enabled: false, reason: `Limit reached (${b.maxCount})`, cost, owned, queued };
  }
  if (b.requires?.tech) {
    const missing = b.requires.tech.filter((t) => !s.research.completed.includes(t));
    if (missing.length > 0) {
      return {
        enabled: false,
        reason: `Requires ${missing.map((t) => TECH_INDEX[t]?.name ?? t).join(', ')}`,
        cost, owned, queued,
      };
    }
  }
  if (b.requires?.buildings) {
    const missing = b.requires.buildings.filter((id) => (s.buildings[id] ?? 0) === 0);
    if (missing.length > 0) {
      return {
        enabled: false,
        reason: `Requires ${missing.map((id) => BUILDING_INDEX[id]?.name ?? id).join(', ')}`,
        cost, owned, queued,
      };
    }
  }
  if (b.requires?.minGdp !== undefined && s.economy.gdp < b.requires.minGdp) {
    return { enabled: false, reason: `Requires $${b.requires.minGdp}B GDP`, cost, owned, queued };
  }
  if (s.economy.treasury < cost) {
    return { enabled: false, reason: 'Insufficient treasury', cost, owned, queued };
  }
  return { enabled: true, reason: null, cost, owned, queued };
}

export function startConstruction(s: GameState, buildingId: string): ActionResult {
  const availability = buildAvailability(s, buildingId);
  if (!availability.enabled) return fail(availability.reason ?? 'Cannot build');
  const b = BUILDING_INDEX[buildingId];

  spendTreasury(s, availability.cost);
  // Good infrastructure and low corruption shorten delivery.
  const speed = clamp(1 - (s.infrastructure - 50) / 400 + s.corruption / 500, 0.65, 1.5);
  const turns = Math.max(1, Math.round(b.buildTime * speed));
  s.construction.push({
    instanceId: `bld-${buildingId}-${s.turn}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    buildingId,
    turnsRemaining: turns,
    totalTurns: turns,
  });
  push(s, { text: `Construction started: ${b.name} (${turns} months).`, category: 'build', tone: 'neutral', icon: b.icon });
  return ok(`${b.name} under construction.`);
}

export function cancelConstruction(s: GameState, instanceId: string): ActionResult {
  const project = s.construction.find((c) => c.instanceId === instanceId);
  if (!project) return fail('Project not found');
  const b = BUILDING_INDEX[project.buildingId];
  // Half the remaining value is recovered; sunk costs stay sunk.
  const refund = b
    ? b.cost * costScale(s.economy.gdp) * (project.turnsRemaining / project.totalTurns) * 0.5
    : 0;
  addTreasury(s, refund);
  s.construction = s.construction.filter((c) => c.instanceId !== instanceId);
  push(s, { text: `Construction cancelled: ${b?.name ?? project.buildingId}.`, category: 'build', tone: 'neutral', icon: '🚫' });
  return ok('Project cancelled.');
}

/* ------------------------------------------------------------------ */
/* Fiscal controls                                                     */
/* ------------------------------------------------------------------ */

export const TAX_LIMITS: Record<TaxKey, { min: number; max: number; label: string; hint: string }> = {
  income: { min: 0, max: 75, label: 'Income Tax', hint: 'Broadest base. Raising it hurts approval fastest.' },
  corporate: { min: 0, max: 60, label: 'Corporate Tax', hint: 'High rates push profits and firms offshore.' },
  vat: { min: 0, max: 35, label: 'Value Added Tax', hint: 'Efficient to collect and quietly regressive.' },
  capitalGains: { min: 0, max: 60, label: 'Capital Gains', hint: 'Hits investment and the investor class.' },
  tariff: { min: 0, max: 45, label: 'Tariffs', hint: 'Raises consumer prices and invites retaliation.' },
  wealth: { min: 0, max: 8, label: 'Wealth Tax', hint: 'Powerful against inequality, hard to enforce.' },
  carbon: { min: 0, max: 100, label: 'Carbon Price', hint: 'The single strongest lever on emissions.' },
  property: { min: 0, max: 12, label: 'Property Tax', hint: 'Stable, local and impossible to hide.' },
};

export function setTax(s: GameState, key: TaxKey, value: number): ActionResult {
  const limits = TAX_LIMITS[key];
  const next = clamp(Math.round(value * 10) / 10, limits.min, limits.max);
  const delta = next - s.taxes[key];
  s.taxes[key] = next;
  // Every tax rise costs approval; cuts buy a little of it back.
  if (Math.abs(delta) > 0.05) {
    const weight = key === 'income' ? 0.7 : key === 'vat' ? 0.5 : key === 'wealth' ? 1.6 : 0.35;
    s.approval = clamp(s.approval - delta * weight, 0, 100);
  }
  return ok(`${limits.label} set to ${next}%.`);
}

/**
 * Maximum funding level per department.
 *
 * Defence gets a wider range than the rest because the real spread is wider:
 * Israel and Russia spend several times the world-average share of GDP on it,
 * while most of Europe spends a fraction. Health and education vary far less.
 */
export const BUDGET_MAX: Record<BudgetDept, number> = {
  healthcare: 2,
  education: 2,
  military: 3.5,
  infrastructure: 2,
  welfare: 2,
  research: 2,
  police: 2,
  environment: 2,
  culture: 2,
  intelligence: 2,
};

export function setBudget(s: GameState, dept: BudgetDept, level: number): ActionResult {
  const next = clamp(Math.round(level * 20) / 20, 0, BUDGET_MAX[dept]);
  const delta = next - s.budget[dept].level;
  s.budget[dept].level = next;
  if (delta < -0.05) s.approval = clamp(s.approval + delta * 3, 0, 100);
  return ok(`${dept} funding set to ${(next * 100).toFixed(0)}%.`);
}

export function issueBonds(s: GameState, amountBillions: number): ActionResult {
  const amount = Math.max(0, amountBillions);
  if (amount <= 0) return fail('Enter an amount');
  const debtRatio = (s.economy.debt / Math.max(1, s.economy.gdp)) * 100;
  if (debtRatio > 260) return fail('No market appetite at this debt level');
  // Poor credit means a haircut on what you actually raise.
  const haircut = clamp(s.economy.creditRating / 100, 0.35, 1);
  addTreasury(s, amount * 1000 * haircut);
  s.economy.debt += amount;
  s.economy.creditRating = clamp(s.economy.creditRating - amount / Math.max(1, s.economy.gdp) * 90, 1, 100);
  push(s, {
    text: `Issued $${amount.toFixed(0)}B in sovereign bonds at ${(haircut * 100).toFixed(0)}¢ on the dollar.`,
    category: 'economy',
    tone: 'neutral',
    icon: '📜',
  });
  return ok(`Raised $${(amount * haircut).toFixed(1)}B.`);
}

export function repayDebt(s: GameState, amountBillions: number): ActionResult {
  const amount = clamp(amountBillions, 0, Math.min(s.economy.debt, s.economy.treasury / 1000));
  if (amount <= 0) return fail('Nothing available to repay');
  s.economy.debt -= amount;
  spendTreasury(s, amount * 1000);
  s.economy.creditRating = clamp(s.economy.creditRating + amount / Math.max(1, s.economy.gdp) * 60, 1, 100);
  return ok(`Repaid $${amount.toFixed(1)}B of principal.`);
}

/* ------------------------------------------------------------------ */
/* Cabinet                                                             */
/* ------------------------------------------------------------------ */

export function appointAdvisor(s: GameState, advisorId: string): ActionResult {
  if (s.advisors.includes(advisorId)) return fail('Already appointed');
  if (s.advisors.length >= MAX_ADVISORS) return fail(`Cabinet is full (${MAX_ADVISORS} seats)`);
  const a = ADVISOR_INDEX[advisorId];
  if (!a) return fail('Unknown advisor');
  s.advisors.push(advisorId);
  push(s, { text: `${a.name} appointed ${a.role}.`, category: 'system', tone: 'good', icon: a.icon });
  return ok(`${a.name} appointed.`);
}

export function dismissAdvisor(s: GameState, advisorId: string): ActionResult {
  if (!s.advisors.includes(advisorId)) return fail('Not in cabinet');
  const a = ADVISOR_INDEX[advisorId];
  s.advisors = s.advisors.filter((id) => id !== advisorId);
  s.approval = clamp(s.approval - 1, 0, 100);
  push(s, { text: `${a?.name ?? 'Advisor'} dismissed from cabinet.`, category: 'system', tone: 'neutral', icon: '📤' });
  return ok('Advisor dismissed.');
}

export function setDoctrine(s: GameState, doctrine: MilitaryState['doctrine']): ActionResult {
  if (s.military.doctrine === doctrine) return fail('Already the standing doctrine');
  s.military.doctrine = doctrine;
  // Re-roling the force costs readiness while everyone retrains.
  s.military.readiness = clamp(s.military.readiness - 6, 0, 100);
  return ok(`Doctrine set to ${doctrine}.`);
}

/**
 * Shifts emphasis between the service branches.
 *
 * These are weights on the same budget, not new money — raising one branch
 * genuinely takes capability out of the others.
 */
export function setBranchFunding(s: GameState, branch: MilitaryBranch, weight: number): ActionResult {
  const next = clamp(Math.round(weight * 20) / 20, 0.25, 2.5);
  s.military.branchFunding[branch] = next;
  s.military.readiness = clamp(s.military.readiness - 1.5, 0, 100);
  return ok(`${branch} emphasis set to ${(next * 100).toFixed(0)}%.`);
}

/**
 * Starts or stops an indigenous nuclear weapons programme.
 *
 * Requires the physics package, costs a slice of the defence budget every
 * month it runs, and the first device costs relations with everyone.
 */
export function setNuclearProgramme(s: GameState, active: boolean): ActionResult {
  if (active && !s.research.completed.includes('nuclear-weapons')) {
    return fail('Requires Nuclear Weapons research');
  }
  if (s.military.nuclearProgrammeActive === active) {
    return fail(active ? 'The programme is already running' : 'The programme is already halted');
  }
  s.military.nuclearProgrammeActive = active;
  if (active) {
    push(s, {
      text: 'A weapons programme has been authorised. It will not stay secret.',
      category: 'military',
      tone: 'neutral',
      icon: '☢️',
    });
    return ok('Weapons programme under way.');
  }
  return ok('Weapons programme halted. Progress is retained.');
}

/* ------------------------------------------------------------------ */
/* Diplomacy                                                           */
/* ------------------------------------------------------------------ */

const TREATY_TERMS: Record<TreatyType, { minRelations: number; label: string; monthlyValue: number; relationBonus: number }> = {
  trade: { minRelations: 10, label: 'Trade Agreement', monthlyValue: 240, relationBonus: 8 },
  'non-aggression': { minRelations: -10, label: 'Non-Aggression Pact', monthlyValue: -20, relationBonus: 10 },
  research: { minRelations: 30, label: 'Research Pact', monthlyValue: -110, relationBonus: 8 },
  'open-borders': { minRelations: 35, label: 'Open Borders', monthlyValue: 90, relationBonus: 10 },
  defense: { minRelations: 50, label: 'Defence Pact', monthlyValue: -180, relationBonus: 14 },
  alliance: { minRelations: 65, label: 'Full Alliance', monthlyValue: -260, relationBonus: 18 },
};

export function proposeTreaty(s: GameState, countryId: string, type: TreatyType): ActionResult {
  const nation = s.nations.find((n) => n.id === countryId);
  if (!nation) return fail('Unknown nation');
  if (nation.atWarWithPlayer) return fail('You are at war with this nation');
  if (s.treaties.some((t) => t.countryId === countryId && t.type === type)) {
    return fail('This treaty already exists');
  }
  const terms = TREATY_TERMS[type];
  if (nation.relations < terms.minRelations) {
    return fail(`Requires relations of at least ${terms.minRelations}`);
  }

  // Acceptance blends relations, trust and your diplomatic standing.
  const chance = clamp(
    0.25 + (nation.relations - terms.minRelations) / 130 + nation.trust / 260 + s.society.softPower / 340,
    0.05,
    0.96,
  );
  if (nextRandom(s) > chance) {
    nation.relations = clamp(nation.relations - 3, -100, 100);
    return fail(`${nation.name} declined the proposal.`);
  }

  s.treaties.push({
    id: `treaty-${countryId}-${type}-${s.turn}`,
    type,
    countryId,
    signedTurn: s.turn,
    monthlyValue: terms.monthlyValue,
  });
  nation.relations = clamp(nation.relations + terms.relationBonus, -100, 100);
  nation.trust = clamp(nation.trust + 6, 0, 100);
  push(s, { text: `${terms.label} signed with ${nation.name}.`, category: 'diplomacy', tone: 'good', icon: '🤝' });
  return ok(`${terms.label} signed with ${nation.name}.`);
}

export function cancelTreaty(s: GameState, treatyId: string): ActionResult {
  const treaty = s.treaties.find((t) => t.id === treatyId);
  if (!treaty) return fail('Treaty not found');
  const nation = s.nations.find((n) => n.id === treaty.countryId);
  s.treaties = s.treaties.filter((t) => t.id !== treatyId);
  if (nation) {
    nation.relations = clamp(nation.relations - 18, -100, 100);
    nation.trust = clamp(nation.trust - 20, 0, 100);
  }
  push(s, { text: `Withdrew from the ${treaty.type} treaty with ${nation?.name ?? treaty.countryId}.`, category: 'diplomacy', tone: 'bad', icon: '📄' });
  return ok('Treaty withdrawn.');
}

export function sendAid(s: GameState, countryId: string, amountMillions: number): ActionResult {
  const nation = s.nations.find((n) => n.id === countryId);
  if (!nation) return fail('Unknown nation');
  const amount = Math.max(0, amountMillions);
  if (s.economy.treasury < amount) return fail('Insufficient treasury');
  spendTreasury(s, amount);
  const impact = clamp(Math.sqrt(amount / Math.max(1, nation.gdp)) * 26, 0.5, 25);
  nation.relations = clamp(nation.relations + impact, -100, 100);
  nation.trust = clamp(nation.trust + impact * 0.5, 0, 100);
  s.society.softPower = clamp(s.society.softPower + impact * 0.1, 0, 100);
  push(s, { text: `Sent aid to ${nation.name}. Relations +${impact.toFixed(1)}.`, category: 'diplomacy', tone: 'good', icon: '💐' });
  return ok(`Relations with ${nation.name} improved by ${impact.toFixed(1)}.`);
}

export function toggleSanctions(s: GameState, countryId: string): ActionResult {
  const nation = s.nations.find((n) => n.id === countryId);
  if (!nation) return fail('Unknown nation');
  nation.sanctioned = !nation.sanctioned;
  if (nation.sanctioned) {
    nation.relations = clamp(nation.relations - 30, -100, 100);
    nation.trust = clamp(nation.trust - 25, 0, 100);
    // Sanctions are a commercial injury as well as a diplomatic one, and the
    // grievance outlives the sanction — which is why lifting them is not a
    // reset button.
    addGrievance(s, countryId, 40);
    push(s, { text: `Sanctions imposed on ${nation.name}.`, category: 'diplomacy', tone: 'bad', icon: '🚫' });
    return ok(`Sanctions imposed on ${nation.name}.`);
  }
  nation.relations = clamp(nation.relations + 12, -100, 100);
  push(s, { text: `Sanctions on ${nation.name} lifted.`, category: 'diplomacy', tone: 'good', icon: '✅' });
  return ok(`Sanctions on ${nation.name} lifted.`);
}

export function establishEmbassy(s: GameState, countryId: string): ActionResult {
  const nation = s.nations.find((n) => n.id === countryId);
  if (!nation) return fail('Unknown nation');
  if (nation.embassy) return fail('Embassy already established');
  const cost = 400 * costScale(s.economy.gdp);
  if (s.economy.treasury < cost) return fail('Insufficient treasury');
  spendTreasury(s, cost);
  nation.embassy = true;
  nation.relations = clamp(nation.relations + 8, -100, 100);
  return ok(`Embassy opened in ${nation.name}.`);
}

/* ------------------------------------------------------------------ */
/* Commodity trade                                                     */
/* ------------------------------------------------------------------ */

export function proposeTradeAgreement(
  s: GameState,
  countryId: string,
  resource: ResourceId,
  direction: TradeAgreement['direction'],
  quantity: number,
  termMonths: TradeTerm,
): ActionResult {
  const nation = s.nations.find((n) => n.id === countryId);
  if (!nation) return fail('Unknown nation');

  const rounded = Math.round(quantity * 10) / 10;
  const eligibility = tradeEligibility(s, nation, resource, direction, rounded);
  if (!eligibility.ok) return fail(eligibility.reason ?? 'They will not agree to that');

  const price = quotedPrice(s, nation, resource, direction, termMonths);
  const def = RESOURCE_INDEX[resource];

  // Acceptance blends relations, trust and how badly they want the deal.
  const goodwill = (nation.relations + 100) / 200;
  const chance = clamp(0.3 + goodwill * 0.55 + nation.trust / 400, 0.1, 0.97);
  if (nextRandom(s) > chance) {
    nation.relations = clamp(nation.relations - 2, -100, 100);
    return fail(`${nation.name} declined the proposal.`);
  }

  s.tradeAgreements.push({
    id: `trade-${countryId}-${resource}-${direction}-${s.turn}-${Math.floor(Math.random() * 1e5).toString(36)}`,
    countryId,
    resource,
    direction,
    quantity: rounded,
    lockedPrice: price,
    signedTurn: s.turn,
    termMonths,
    suspended: false,
  });

  // Trade builds relations: a signed contract is a shared interest.
  nation.relations = clamp(nation.relations + 4, -100, 100);
  nation.trust = clamp(nation.trust + 3, 0, 100);

  push(s, {
    text: `Signed a ${termMonths / 12}-year agreement to ${direction} ${rounded} units of ${def.name} ${
      direction === 'import' ? 'from' : 'to'
    } ${nation.name}.`,
    category: 'diplomacy',
    tone: 'good',
    icon: def.icon,
  });
  return ok(`${def.name} agreement signed with ${nation.name}.`);
}

export function cancelTradeAgreement(s: GameState, agreementId: string): ActionResult {
  const agreement = s.tradeAgreements.find((a) => a.id === agreementId);
  if (!agreement) return fail('Agreement not found');

  const nation = s.nations.find((n) => n.id === agreement.countryId);
  const def = RESOURCE_INDEX[agreement.resource];
  s.tradeAgreements = s.tradeAgreements.filter((a) => a.id !== agreementId);

  // Breaking a contract early is a diplomatic cost, not a free exit.
  if (nation) {
    nation.relations = clamp(nation.relations - 12, -100, 100);
    nation.trust = clamp(nation.trust - 15, 0, 100);
    addGrievance(s, nation.id, 18);
  }

  push(s, {
    text: `Withdrew from the ${def.name} agreement with ${nation?.name ?? agreement.countryId}.`,
    category: 'diplomacy',
    tone: 'bad',
    icon: '📄',
  });
  return ok('Agreement terminated.');
}

/* ------------------------------------------------------------------ */
/* Organisations                                                       */
/* ------------------------------------------------------------------ */

export function orgEligibility(s: GameState, orgId: OrgId): { enabled: boolean; reason: string | null } {
  const org = ORG_INDEX[orgId];
  if (!org) return { enabled: false, reason: 'Unknown organisation' };
  if (s.orgs.includes(orgId)) return { enabled: false, reason: 'Already a member' };
  const r = org.requires;

  if (r.minGdp !== undefined && s.economy.gdp < r.minGdp) {
    return { enabled: false, reason: `Requires $${r.minGdp}B GDP` };
  }
  if (r.minStability !== undefined && s.stability < r.minStability) {
    return { enabled: false, reason: `Requires ${r.minStability} stability` };
  }
  if (r.minCivilLiberties !== undefined && s.society.civilLiberties < r.minCivilLiberties) {
    return { enabled: false, reason: `Requires ${r.minCivilLiberties} civil liberties` };
  }
  if (r.government && !r.government.includes(s.identity.government)) {
    return { enabled: false, reason: 'Government type is ineligible' };
  }
  if (r.region && !r.region.includes(s.identity.region)) {
    return { enabled: false, reason: 'Outside the eligible region' };
  }
  if (r.requiresOil && s.resources.oil.production < 3) {
    return { enabled: false, reason: 'Requires meaningful oil production' };
  }
  if (r.minEmissionsPolicy && s.taxes.carbon <= 0 && !s.activePolicies.includes('carbon-tax')) {
    return { enabled: false, reason: 'Requires a carbon price' };
  }
  const avgRelations = s.nations.reduce((sum, n) => sum + n.relations, 0) / Math.max(1, s.nations.length);
  if (r.minRelationsAvg !== undefined && avgRelations < r.minRelationsAvg) {
    return { enabled: false, reason: 'Insufficient international standing' };
  }
  return { enabled: true, reason: null };
}

export function joinOrg(s: GameState, orgId: OrgId): ActionResult {
  const eligibility = orgEligibility(s, orgId);
  if (!eligibility.enabled) return fail(eligibility.reason ?? 'Not eligible');
  const org = ORG_INDEX[orgId];
  s.orgs.push(orgId);
  for (const n of s.nations) n.relations = clamp(n.relations + 3, -100, 100);
  push(s, { text: `Acceded to the ${org.name}.`, category: 'diplomacy', tone: 'good', icon: org.icon });
  return ok(`Joined the ${org.name}.`);
}

export function leaveOrg(s: GameState, orgId: OrgId): ActionResult {
  if (!s.orgs.includes(orgId)) return fail('Not a member');
  const org = ORG_INDEX[orgId];
  s.orgs = s.orgs.filter((id) => id !== orgId);
  for (const n of s.nations) n.relations = clamp(n.relations - 6, -100, 100);
  s.approval = clamp(s.approval - 3, 0, 100);
  push(s, { text: `Withdrew from the ${org?.name ?? orgId}.`, category: 'diplomacy', tone: 'bad', icon: '🚪' });
  return ok(`Withdrew from the ${org?.name ?? orgId}.`);
}

/* ------------------------------------------------------------------ */
/* Intelligence                                                        */
/* ------------------------------------------------------------------ */

export const COVERT_OPS: Record<CovertOp['type'], { label: string; cost: number; turns: number; baseChance: number; description: string }> = {
  espionage: { label: 'Industrial Espionage', cost: 900, turns: 4, baseChance: 0.62,
    description: 'Steal research from a more advanced economy.' },
  propaganda: { label: 'Influence Campaign', cost: 700, turns: 5, baseChance: 0.58,
    description: 'Shift opinion in a target country toward you.' },
  sabotage: { label: 'Sabotage', cost: 1400, turns: 6, baseChance: 0.44,
    description: 'Degrade a rival’s military capability.' },
  cyberattack: { label: 'Cyber Operation', cost: 1100, turns: 3, baseChance: 0.5,
    description: 'Disrupt a rival’s economy through their networks.' },
  coup: { label: 'Destabilisation', cost: 3200, turns: 9, baseChance: 0.26,
    description: 'Undermine a hostile government from within. Extremely high risk.' },
  assassination: { label: 'Decapitation', cost: 2600, turns: 7, baseChance: 0.22,
    description: 'Remove a hostile head of state. The consequences are unpredictable.' },
};

export function launchCovertOp(s: GameState, type: CovertOp['type'], targetId: string): ActionResult {
  const spec = COVERT_OPS[type];
  const nation = s.nations.find((n) => n.id === targetId);
  if (!nation) return fail('Unknown target');
  if (s.intelligence.activeOps.some((o) => o.targetId === targetId && o.type === type)) {
    return fail('That operation is already running');
  }
  const cost = spec.cost * costScale(s.economy.gdp);
  if (s.economy.treasury < cost) return fail('Insufficient treasury');
  if (s.intelligence.activeOps.length >= 4) return fail('Too many operations in progress');

  spendTreasury(s, cost);
  const successChance = clamp(
    spec.baseChance + (s.intelligence.capability - 50) / 160 - (nation.stability - 50) / 260,
    0.05,
    0.94,
  );
  s.intelligence.activeOps.push({
    id: `op-${type}-${targetId}-${s.turn}`,
    type,
    targetId,
    turnsRemaining: spec.turns,
    successChance,
    cost,
    label: `${spec.label} — ${nation.name}`,
  });
  push(s, { text: `${spec.label} authorised against ${nation.name}.`, category: 'diplomacy', tone: 'neutral', icon: '🕵️' });
  return ok(`${spec.label} under way (${(successChance * 100).toFixed(0)}% estimated success).`);
}

export function abortCovertOp(s: GameState, opId: string): ActionResult {
  const op = s.intelligence.activeOps.find((o) => o.id === opId);
  if (!op) return fail('Operation not found');
  s.intelligence.activeOps = s.intelligence.activeOps.filter((o) => o.id !== opId);
  addTreasury(s, op.cost * 0.35);
  return ok('Operation aborted.');
}

/* ------------------------------------------------------------------ */
/* War                                                                 */
/* ------------------------------------------------------------------ */

export function declareWar(s: GameState, countryId: string, goal: WarGoal): ActionResult {
  if (!s.settings.enableWars) return fail('Warfare is disabled in this campaign');
  const nation = s.nations.find((n) => n.id === countryId);
  if (!nation) return fail('Unknown nation');
  if (nation.atWarWithPlayer) return fail('Already at war');
  if (s.wars.filter((w) => !w.resolved).length >= 3) return fail('Already fighting on three fronts');

  nation.atWarWithPlayer = true;
  nation.relations = -100;
  nation.trust = 0;
  s.wars.push({
    id: `war-${countryId}-${s.turn}`,
    attackerId: 'player',
    defenderId: countryId,
    startTurn: s.turn,
    goal,
    warScore: 0,
    playerCasualties: 0,
    enemyCasualties: 0,
    monthlyCost: ((s.economy.gdp * 1000) / 12) * 0.04,
  });

  // Declaring war is unpopular abroad and briefly popular at home.
  for (const n of s.nations) {
    if (n.id === countryId) continue;
    n.relations = clamp(n.relations - (n.region === nation.region ? 14 : 7), -100, 100);
  }
  s.approval = clamp(s.approval + 4, 0, 100);
  s.stability = clamp(s.stability - 4, 0, 100);
  s.society.softPower = clamp(s.society.softPower - 8, 0, 100);
  push(s, { text: `War declared on ${nation.name}.`, category: 'military', tone: 'critical', icon: '⚔️' });
  return ok(`War declared on ${nation.name}.`);
}

export function sueForPeace(s: GameState, warId: string): ActionResult {
  const war = s.wars.find((w) => w.id === warId && !w.resolved);
  if (!war) return fail('War not found');
  const enemyId = war.attackerId === 'player' ? war.defenderId : war.attackerId;
  const nation = s.nations.find((n) => n.id === enemyId);

  // The enemy only accepts if they are not clearly winning.
  const accepts = war.warScore > -35 || nextRandom(s) < 0.3;
  if (!accepts) return fail('Your terms were rejected. The fighting continues.');

  war.resolved = war.warScore > 35 ? 'victory' : 'white-peace';
  if (nation) {
    nation.atWarWithPlayer = false;
    nation.relations = clamp(-40 + war.warScore * 0.2, -100, 100);
  }
  s.approval = clamp(s.approval + (war.warScore > 0 ? 6 : -8), 0, 100);
  push(s, {
    text: `Peace concluded with ${nation?.name ?? enemyId}.`,
    category: 'military',
    tone: war.warScore > 0 ? 'good' : 'neutral',
    icon: '🕊️',
  });
  return ok('Peace concluded.');
}

/* ------------------------------------------------------------------ */
/* Provinces                                                           */
/* ------------------------------------------------------------------ */

export function investInProvince(s: GameState, provinceId: string, amountMillions: number): ActionResult {
  const province = s.provinces.find((p) => p.id === provinceId);
  if (!province) return fail('Unknown province');
  const amount = Math.max(0, amountMillions);
  if (s.economy.treasury < amount) return fail('Insufficient treasury');
  spendTreasury(s, amount);
  const impact = clamp(Math.sqrt(amount / Math.max(1, s.economy.gdp * 2)) * 12, 0.2, 18);
  province.development = clamp(province.development + impact, 0, 100);
  province.unrest = clamp(province.unrest - impact * 0.6, 0, 100);
  province.loyalty = clamp(province.loyalty + impact * 0.5, 0, 100);
  return ok(`${province.name} development +${impact.toFixed(1)}.`);
}

export function grantAutonomy(s: GameState, provinceId: string): ActionResult {
  const province = s.provinces.find((p) => p.id === provinceId);
  if (!province) return fail('Unknown province');
  if (province.autonomy >= 100) return fail('This province is already fully devolved');
  const cost = 6;
  if (s.governance.capital < cost) return fail(`Devolution costs ${cost} political capital`);
  spendCapital(s, cost);
  province.autonomy = clamp(province.autonomy + 15, 0, 100);
  province.unrest = clamp(province.unrest - 18, 0, 100);
  province.loyalty = clamp(province.loyalty + 8, 0, 100);
  // Devolution is the durable answer to separatism, which is the whole point
  // of it costing capital rather than money.
  province.separatism = clamp(province.separatism - 22, 0, 100);
  s.stability = clamp(s.stability - 1.5, 0, 100);
  nudgeFactions(s, { regions: 8, military: -3 });
  return ok(`Autonomy extended to ${province.name}.`);
}

/**
 * Puts a province under military administration.
 *
 * Buys immediate quiet at the cost of loyalty, liberties and the standing of
 * the government — and it does nothing about why the province is angry.
 */
export function setMartialLaw(s: GameState, provinceId: string, active: boolean): ActionResult {
  const province = s.provinces.find((p) => p.id === provinceId);
  if (!province) return fail('Unknown province');
  if (province.martialLaw === active) {
    return fail(active ? 'Already under martial law' : 'Not under martial law');
  }
  if (active) {
    const cost = 10;
    if (s.governance.capital < cost) return fail(`Declaring martial law costs ${cost} political capital`);
    if (s.military.strength < 15) return fail('The armed forces are not capable of it');
    spendCapital(s, cost);
    province.martialLaw = true;
    province.unrest = clamp(province.unrest - 20, 0, 100);
    s.society.civilLiberties = clamp(s.society.civilLiberties - 5, 0, 100);
    s.society.softPower = clamp(s.society.softPower - 3, 0, 100);
    nudgeFactions(s, { military: 6, regions: -12, intelligentsia: -10 });
    push(s, {
      text: `Martial law declared in ${province.name}.`,
      category: 'politics',
      tone: 'bad',
      icon: '🪖',
    });
    return ok(`${province.name} is under military administration.`);
  }
  province.martialLaw = false;
  province.loyalty = clamp(province.loyalty + 6, 0, 100);
  nudgeFactions(s, { regions: 8, intelligentsia: 5, military: -3 });
  push(s, {
    text: `Martial law lifted in ${province.name}.`,
    category: 'politics',
    tone: 'good',
    icon: '🕊️',
  });
  return ok(`Civil administration restored in ${province.name}.`);
}

/**
 * Sets a standing monthly development budget for a province.
 *
 * Unlike a one-off injection this keeps paying out every month, which is what
 * actually moves separatism — and it shows up in the budget as a real line.
 */
export function setProvinceInvestment(s: GameState, provinceId: string, amountMillions: number): ActionResult {
  const province = s.provinces.find((p) => p.id === provinceId);
  if (!province) return fail('Unknown province');
  const cap = ((s.economy.gdp * 1000) / 12) * 0.05;
  province.investment = clamp(Math.round(amountMillions), 0, Math.max(1, Math.round(cap)));
  return ok(
    province.investment > 0
      ? `${province.name} now receives a standing development budget.`
      : `Standing investment in ${province.name} ended.`,
  );
}

/* ------------------------------------------------------------------ */
/* Executive actions                                                   */
/* ------------------------------------------------------------------ */

export interface DecreeAvailability {
  enabled: boolean;
  reason: string | null;
  cost: number;
  /** Political capital an executive action burns. */
  politicalCost: number;
  cooldownRemaining: number;
}

/**
 * What an executive action costs in authority.
 *
 * Acting by decree rather than by legislation is fast and it spends standing;
 * the cost scales with how far the action reaches, and it is higher under a
 * government that is supposed to consult a parliament first.
 */
export function decreePoliticalCost(s: GameState, decreeId: string): number {
  const decree = DECREE_INDEX[decreeId];
  if (!decree) return 0;
  const stated = (decree as { politicalCost?: number }).politicalCost;
  if (typeof stated === 'number') return stated;
  const reach = Object.values(decree.effects).reduce(
    (sum, v) => sum + Math.abs(typeof v === 'number' ? v : 0),
    0,
  );
  const emergency = decree.category === 'emergency' ? 1.35 : 1;
  const consultative = GOVERNMENT_INDEX[s.identity.government]?.holdsElections ? 1.25 : 1;
  return Math.round(clamp((3 + reach * 0.22) * emergency * consultative, 2, 40));
}

export function decreeAvailability(s: GameState, decreeId: string): DecreeAvailability {
  const decree = DECREE_INDEX[decreeId];
  const scale = costScale(s.economy.gdp);
  if (!decree) {
    return { enabled: false, reason: 'Unknown action', cost: 0, politicalCost: 0, cooldownRemaining: 0 };
  }

  const cost = decree.cost * scale;
  const politicalCost = decreePoliticalCost(s, decreeId);
  const cooldownRemaining = decreeCooldownRemaining(s, decree);
  const base = { cost, politicalCost, cooldownRemaining };

  if (cooldownRemaining > 0) {
    return {
      ...base,
      enabled: false,
      reason: `Available in ${cooldownRemaining} month${cooldownRemaining === 1 ? '' : 's'}`,
    };
  }
  if (s.economy.treasury < cost) {
    return { ...base, enabled: false, reason: 'Insufficient treasury' };
  }
  if (s.governance.capital < politicalCost) {
    return {
      ...base,
      enabled: false,
      reason: `Needs ${politicalCost} political capital (you have ${Math.floor(s.governance.capital)})`,
    };
  }

  const r = decree.requires;
  if (r?.minStability !== undefined && s.stability < r.minStability) {
    return { ...base, enabled: false, reason: `Requires ${r.minStability} stability` };
  }
  if (r?.minApproval !== undefined && s.approval < r.minApproval) {
    return { ...base, enabled: false, reason: `Requires ${r.minApproval}% approval` };
  }
  if (r?.maxApproval !== undefined && s.approval > r.maxApproval) {
    return { ...base, enabled: false, reason: `Only when approval is below ${r.maxApproval}%` };
  }
  if (r?.government && !r.government.includes(s.identity.government)) {
    return { ...base, enabled: false, reason: 'Not available under this government' };
  }
  if (r?.tech && !r.tech.every((t) => s.research.completed.includes(t))) {
    return { ...base, enabled: false, reason: 'Missing required technology' };
  }
  if (r?.atWar !== undefined && s.wars.some((w) => !w.resolved) !== r.atWar) {
    return {
      ...base,
      enabled: false,
      reason: r.atWar ? 'Only available during a war' : 'Not available during a war',
    };
  }

  return { ...base, enabled: true, reason: null };
}

export function enactDecree(s: GameState, decreeId: string): ActionResult {
  const availability = decreeAvailability(s, decreeId);
  if (!availability.enabled) return fail(availability.reason ?? 'Cannot enact');

  const decree = DECREE_INDEX[decreeId];
  spendTreasury(s, availability.cost);
  spendCapital(s, availability.politicalCost);
  applyEventEffects(s, decree.effects);

  if (decree.temporary) {
    s.activeModifiers.push({
      id: `decree-${decree.id}-${s.turn}`,
      label: decree.temporary.label,
      source: decree.name,
      modifiers: decree.temporary.modifiers,
      monthsRemaining: decree.temporary.months,
      icon: decree.icon,
    });
  }

  // A few actions do something the generic effects block cannot express.
  switch (decree.id) {
    case 'debt-restructuring':
      // Creditors take a haircut; the rating takes the hit.
      s.economy.debt = Math.max(0, s.economy.debt * 0.8);
      s.economy.creditRating = clamp(s.economy.creditRating - 22, 1, 100);
      break;
    case 'privatisation-drive':
      // Selling the assets permanently shrinks what the state can earn from them.
      s.economy.reserves = Math.max(0, s.economy.reserves * 0.85);
      break;
    case 'sovereign-fund-injection':
      s.economy.reserves = Math.max(0, s.economy.reserves * 0.55);
      break;
    case 'mobilise-reserves':
      s.military.readiness = clamp(s.military.readiness + 22, 0, 100);
      s.military.morale = clamp(s.military.morale + 8, 0, 100);
      break;
    case 'international-appeal':
      // Support comes with conditions the player does not get to negotiate.
      s.economy.debt += (s.economy.gdp * 0.04);
      break;
  }

  s.decreeCooldowns[decree.id] = s.turn;
  push(s, {
    text: `${decree.name}: ${decree.outcome}`,
    category: 'policy',
    tone: 'neutral',
    icon: decree.icon,
  });
  return ok(decree.outcome);
}

/* ------------------------------------------------------------------ */
/* Coalitions                                                          */
/* ------------------------------------------------------------------ */

/**
 * Brings a rival party into government in exchange for a concession.
 *
 * The concession does not have to be in place yet — the deal is that you will
 * deliver it, and the partner gives you a grace period to do so. That is what
 * makes political capital a bargaining chip rather than only a cost.
 */
export function openCoalition(s: GameState, partyId: string): ActionResult {
  const outcome = formCoalition(s, partyId, (entry) => push(s, entry));
  return outcome.ok ? ok(outcome.message) : fail(outcome.message);
}

/** Ends a coalition from your side, at a real cost to standing. */
export function endCoalition(s: GameState, partyId: string): ActionResult {
  const outcome = dissolveCoalition(s, partyId, (entry) => push(s, entry));
  return outcome.ok ? ok(outcome.message) : fail(outcome.message);
}

/* ------------------------------------------------------------------ */
/* Trade disputes                                                      */
/* ------------------------------------------------------------------ */

/** Negotiates away a counter-tariff. Does nothing about what caused it. */
export function settleTrade(s: GameState, countryId: string): ActionResult {
  const outcome = settleTradeDispute(s, countryId, (entry) => push(s, entry));
  return outcome.ok ? ok(outcome.message) : fail(outcome.message);
}

/* ------------------------------------------------------------------ */
/* Objectives                                                          */
/* ------------------------------------------------------------------ */

/**
 * Redirects the campaign at a new victory goal.
 *
 * Only permitted in eternal mode: in a normal campaign the objective is the
 * terms you accepted at the start, and swapping it mid-run would let a player
 * pick whichever goal they happened to be closest to.
 */
export function setVictoryGoal(s: GameState, goal: VictoryGoalId): ActionResult {
  if (!s.settings.neverEndGame) {
    return fail('The objective can only be changed in eternal mode');
  }
  if (s.settings.victoryGoal === goal) return fail('Already pursuing that objective');

  const previous = VICTORY_INDEX[s.settings.victoryGoal];
  const next = VICTORY_INDEX[goal];
  s.settings.victoryGoal = goal;

  push(s, {
    text: `National objective changed from ${previous?.name ?? 'the previous goal'} to ${next?.name ?? goal}.`,
    category: 'system',
    tone: 'neutral',
    icon: next?.icon ?? '🎯',
  });
  return ok(`Now pursuing ${next?.name ?? goal}.`);
}
