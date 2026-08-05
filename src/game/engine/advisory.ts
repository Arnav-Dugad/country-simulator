import type { BudgetDept, GameState, MilitaryBranch, PanelTarget, TaxKey } from '../types';
import { ADVISORS, ADVISOR_INDEX, ORGS } from '../data/institutions';
import { POLICIES, POLICY_INDEX } from '../data/policies';
import { TECHNOLOGIES, TECH_INDEX } from '../data/technologies';
import { BUILDINGS, BUILDING_INDEX } from '../data/buildings';
import { DECREES, DECREE_INDEX } from '../data/decrees';
import { CRISIS_INDEX } from '../data/crises';
import { FACTION_INDEX } from '../data/factions';
import { AGENDAS, AGENDA_DECLARATION_COST, AGENDA_INDEX } from '../data/agendas';
import {
  activeTradeVolume, averageRelations, computeBudget, debtToGdp, energyBalance, renewableShare,
} from '../selectors';
import { victoryProgress } from './scoring';
import {
  buildAvailability, decreeAvailability, orgEligibility, policyAvailability,
} from './actions';
import { researchCapacity, lockedSlotSources, startableTechs } from './research';
import { responseAvailability } from './crises';
import { hostileFactions } from './politics';
import { assessPact, coalitionShare, hasMajority } from './coalition';
import { assessSettlement, retaliatingNations, averageForeignTariff } from './tradewar';

/**
 * A single piece of advice from the cabinet.
 *
 * Every recommendation names the problem, the number behind it, and one
 * concrete thing the player can do about it — never "growth is low, consider
 * improving growth". `action` carries enough for the UI to offer a one-click
 * fix where one exists.
 */
export interface Recommendation {
  id: string;
  /** Advisor who raises it; falls back to a generic aide when unappointed. */
  advisorId: string;
  advisorName: string;
  advisorRole: string;
  advisorIcon: string;
  /** Higher is more pressing. Used for ordering and the severity colour. */
  urgency: number;
  severity: 'critical' | 'warning' | 'opportunity';
  /** One-line summary of what is wrong or available. */
  headline: string;
  /** The advisor's actual advice, in their voice. */
  detail: string;
  /** Where the player goes to act on it. */
  panel: PanelTarget;
  /** Optional one-click action the UI can execute directly. */
  action?: RecommendationAction;
}

export type RecommendationAction =
  | { kind: 'policy'; id: string; label: string }
  | { kind: 'decree'; id: string; label: string }
  | { kind: 'research'; id: string; label: string }
  | { kind: 'build'; id: string; label: string }
  | { kind: 'org'; id: string; label: string }
  | { kind: 'budget'; dept: BudgetDept; level: number; label: string }
  | { kind: 'tax'; key: TaxKey; value: number; label: string }
  | { kind: 'crisis'; crisisId: string; responseId: string; label: string }
  | { kind: 'offer'; offerId: string; accept: boolean; label: string }
  | { kind: 'agenda'; id: string; label: string }
  | { kind: 'branch'; branch: MilitaryBranch; weight: number; label: string }
  | { kind: 'coalition'; partyId: string; label: string }
  | { kind: 'settle-trade'; countryId: string; label: string };

/** Generic aide used when the relevant portfolio has nobody in it. */
const VACANT = {
  advisorId: '',
  advisorName: 'Permanent Secretary',
  advisorRole: 'Acting — portfolio vacant',
  advisorIcon: '🗒️',
};

function speaker(s: GameState, advisorId: string) {
  if (!s.advisors.includes(advisorId)) return VACANT;
  const advisor = ADVISOR_INDEX[advisorId];
  if (!advisor) return VACANT;
  return {
    advisorId: advisor.id,
    advisorName: advisor.name,
    advisorRole: advisor.role,
    advisorIcon: advisor.icon,
  };
}

/** Cheapest enactable policy whose modifiers move `key` in the right direction. */
function bestPolicyFor(
  s: GameState,
  key: keyof (typeof POLICIES)[number]['modifiers'],
  want: 'up' | 'down',
): string | null {
  const candidates = POLICIES.filter((p) => {
    const value = p.modifiers[key];
    if (typeof value !== 'number' || value === 0) return false;
    if (want === 'up' ? value <= 0 : value >= 0) return false;
    return policyAvailability(s, p.id).enabled;
  }).sort((a, b) => a.upfrontCost - b.upfrontCost);

  return candidates[0]?.id ?? null;
}

/**
 * Builds the cabinet's advice for the current month.
 *
 * Pure and side-effect free — it reads the state and returns a list, so it can
 * be called from React render without cloning anything.
 *
 * The ordering rule is deliberate: the board should never be silent. Emergencies
 * come first, then things going wrong, then the best available opportunity —
 * and if a country is running perfectly there is always a next thing to build,
 * research, join or commit to, because there always is in reality.
 */
export function buildRecommendations(s: GameState, limit = 3): Recommendation[] {
  const out: Recommendation[] = [];
  const budget = computeBudget(s);
  const gdpMonthly = (s.economy.gdp * 1000) / 12;
  const deficitShare = gdpMonthly > 0 ? -budget.net / gdpMonthly : 0;
  const debt = debtToGdp(s);

  const push = (r: Omit<Recommendation, 'advisorId' | 'advisorName' | 'advisorRole' | 'advisorIcon'> & { from: string }) => {
    const { from, ...rest } = r;
    out.push({ ...rest, ...speaker(s, from) });
  };

  /* ------------------------------ Crises -------------------------------- */
  // A live crisis outranks everything: it is already costing the country every
  // month, and unlike most problems it escalates on a timer.
  for (const crisis of s.crises) {
    const def = CRISIS_INDEX[crisis.defId];
    if (!def) continue;
    const stage = def.stages[crisis.stage];
    const affordable = def.responses.find((r) => responseAvailability(s, crisis.id, r.id).enabled);
    const stagesLeft = def.stages.length - 1 - crisis.stage;
    push({
      from: crisis.defId.includes('bank') || crisis.defId.includes('debt') || crisis.defId.includes('inflation')
        ? 'adv-finance'
        : def.category === 'health' ? 'adv-health'
          : def.category === 'security' ? 'adv-defence'
            : def.category === 'environmental' ? 'adv-environment'
              : 'adv-interior',
      id: `crisis-${crisis.id}`,
      urgency: 150 + crisis.severity + crisis.stage * 20,
      severity: 'critical',
      headline: `${def.name}: ${stage?.label ?? 'ongoing'} (severity ${crisis.severity.toFixed(0)})`,
      detail: `${stage?.description ?? def.summary} ${
        stagesLeft > 0
          ? `It escalates again in ${Math.max(1, (stage?.months ?? 4) - crisis.monthsInStage)} month${
              (stage?.months ?? 4) - crisis.monthsInStage === 1 ? '' : 's'
            } if we do nothing.`
          : 'This is the final stage. If it runs out unresolved the damage is permanent.'
      }`,
      panel: 'crises',
      action: affordable
        ? { kind: 'crisis', crisisId: crisis.id, responseId: affordable.id, label: affordable.label }
        : undefined,
    });
  }

  /* ------------------------- Diplomatic offers --------------------------- */
  for (const offer of s.offers) {
    const nation = s.nations.find((n) => n.id === offer.countryId);
    const hostile = offer.kind === 'demand' || offer.kind === 'ultimatum';
    const monthsLeft = Math.max(0, offer.expiresTurn - s.turn);
    push({
      from: 'adv-foreign',
      id: `offer-${offer.id}`,
      urgency: hostile ? 92 : 46,
      severity: hostile ? 'warning' : 'opportunity',
      headline: `${offer.title} — ${monthsLeft} month${monthsLeft === 1 ? '' : 's'} to answer`,
      detail: offer.body,
      panel: 'diplomacy',
      action:
        hostile || (nation && nation.relations < 0)
          ? { kind: 'offer', offerId: offer.id, accept: false, label: 'Decline' }
          : { kind: 'offer', offerId: offer.id, accept: true, label: 'Accept' },
    });
  }

  /* ------------------------------ Fiscal -------------------------------- */

  if (deficitShare > 0.03) {
    const raiseTo = Math.min(75, Math.round((s.taxes.income + 3) * 2) / 2);
    push({
      from: 'adv-finance',
      id: 'deficit',
      urgency: 70 + deficitShare * 200,
      severity: deficitShare > 0.08 ? 'critical' : 'warning',
      headline: `The budget is ${(deficitShare * 100).toFixed(1)}% of GDP in deficit`,
      detail:
        debt > 90
          ? `We are borrowing ${(deficitShare * 100).toFixed(1)}% of monthly output with debt already at ${debt.toFixed(0)}% of GDP. Interest is compounding faster than growth. Either income tax goes up or a department comes down — I would rather you chose than the bond market did.`
          : `We are spending more than we collect. It is manageable today, but every month it continues adds to the interest bill. Raising income tax to ${raiseTo}% would close most of the gap.`,
      panel: 'budget',
      action: { kind: 'tax', key: 'income', value: raiseTo, label: `Raise income tax to ${raiseTo}%` },
    });
  } else if (budget.net > gdpMonthly * 0.04 && s.economy.debt <= 0) {
    // A large surplus with no debt is idle money — put it somewhere.
    const underfunded = (Object.keys(s.budget) as BudgetDept[])
      .filter((d) => s.budget[d].level < 1.2)
      .sort((a, b) => s.budget[a].level - s.budget[b].level)[0];
    if (underfunded) {
      const level = Math.round((s.budget[underfunded].level + 0.2) * 20) / 20;
      push({
        from: 'adv-finance',
        id: 'surplus',
        urgency: 30,
        severity: 'opportunity',
        headline: 'A large surplus is sitting idle',
        detail: `We are running a surplus of ${((budget.net / gdpMonthly) * 100).toFixed(1)}% of monthly output with no debt to service. Money in the treasury does nothing — it does not even earn a return unless we put it in the sovereign fund. ${underfunded} is our thinnest department; I would put it there.`,
        panel: 'budget',
        action: { kind: 'budget', dept: underfunded, level, label: `Raise ${underfunded} to ${(level * 100).toFixed(0)}%` },
      });
    }
  }

  if (debt > 130) {
    push({
      from: 'adv-finance',
      id: 'debt-load',
      urgency: 60 + debt / 4,
      severity: debt > 220 ? 'critical' : 'warning',
      headline: `Public debt is ${debt.toFixed(0)}% of GDP`,
      detail: `Interest is now ${((budget.expenditure.debtInterest / gdpMonthly) * 100).toFixed(1)}% of monthly output — money that buys nothing. We are borrowing new money at ${s.economy.bondYield.toFixed(1)}%, and at this level our credit rating drives the cost of everything else we do.`,
      panel: 'budget',
      action:
        decreeAvailability(s, 'debt-restructuring').enabled && debt > 200
          ? { kind: 'decree', id: 'debt-restructuring', label: 'Restructure sovereign debt' }
          : undefined,
    });
  }

  /* ---------------------------- Macroeconomy ---------------------------- */

  if (s.economy.inflation > 6) {
    const ready = decreeAvailability(s, 'price-freeze').enabled;
    push({
      from: 'adv-finance',
      id: 'inflation',
      urgency: 55 + s.economy.inflation * 3,
      severity: s.economy.inflation > 12 ? 'critical' : 'warning',
      headline: `Inflation is running at ${s.economy.inflation.toFixed(1)}%`,
      detail: `Prices are rising far above target. ${
        s.economy.centralBankIndependent
          ? 'The central bank will keep tightening on its own, which will cost us growth.'
          : `You control the rate and you have it at ${s.economy.policyRateTarget.toFixed(2)}%. Nothing will improve until that goes above inflation.`
      } Closing the deficit is the durable fix; a price freeze buys time but stores up distortion.`,
      panel: 'economy',
      action: ready ? { kind: 'decree', id: 'price-freeze', label: 'Freeze essential prices' } : undefined,
    });
  }

  if (s.economy.unemployment > 9) {
    const policy = bestPolicyFor(s, 'unemployment', 'down');
    push({
      from: 'adv-labour',
      id: 'unemployment',
      urgency: 50 + s.economy.unemployment * 2,
      severity: s.economy.unemployment > 14 ? 'critical' : 'warning',
      headline: `Unemployment is ${s.economy.unemployment.toFixed(1)}%`,
      detail: `That is a lot of people out of work, and it shows up in crime, happiness and your approval before it shows up anywhere else. Training and job-creation programmes are the cheapest route back.`,
      panel: 'policies',
      action: policy
        ? { kind: 'policy', id: policy, label: `Enact ${POLICY_INDEX[policy].name}` }
        : decreeAvailability(s, 'emergency-stimulus').enabled
          ? { kind: 'decree', id: 'emergency-stimulus', label: 'Emergency stimulus' }
          : undefined,
    });
  }

  if (s.economy.growth < 0.5 && s.turn > 12) {
    push({
      from: 'adv-growth',
      id: 'stagnation',
      urgency: 45 + Math.abs(Math.min(0, s.economy.growth)) * 6,
      severity: s.economy.growth < -1.5 ? 'critical' : 'warning',
      headline: `Growth has fallen to ${s.economy.growth.toFixed(2)}%`,
      detail:
        s.world.cycle < -0.35
          ? `Part of this is not ours: the world economy is in a ${s.world.cyclePhase} and external demand is falling with it. What we control is whether we come out of it with more capacity than we went in with.`
          : s.research.completed.length < 12
            ? `The economy has caught up with what its institutions and technology can support. More spending will not fix that — research raises the ceiling, and so do education, infrastructure and lower corruption.`
            : `Output is barely moving. Look at what is capping us: energy, corruption, education, or simply the interest rate.`,
      panel: 'economy',
    });
  }

  /* ------------------------------ Energy -------------------------------- */

  const balance = energyBalance(s);
  if (balance < 0.99) {
    const plant = ['solar-farm', 'wind-farm', 'power-plant-gas', 'nuclear-plant']
      .find((id) => buildAvailability(s, id).enabled);
    push({
      from: 'adv-energy',
      id: 'energy-gap',
      urgency: 75 + (1 - balance) * 120,
      severity: balance < 0.92 ? 'critical' : 'warning',
      headline: `The grid is ${((1 - balance) * 100).toFixed(1)}% short of demand`,
      detail: `A shortfall does not just mean blackouts — it directly suppresses GDP growth and feeds inflation every single month it persists. Below 90% it opens an energy emergency that escalates on its own. This is the cheapest problem on this list to fix and the most expensive to ignore.`,
      panel: 'construction',
      action: plant
        ? { kind: 'build', id: plant, label: `Build ${BUILDING_INDEX[plant].name}` }
        : undefined,
    });
  }

  /* ------------------------------ Politics ------------------------------ */

  if (s.approval < 35) {
    const ready = decreeAvailability(s, 'national-address').enabled;
    push({
      from: 'adv-comms',
      id: 'approval',
      urgency: 60 + (35 - s.approval) * 2,
      severity: s.approval < 20 ? 'critical' : 'warning',
      headline: `Approval has fallen to ${s.approval.toFixed(0)}%`,
      detail:
        s.monthsToElection > 0 && s.monthsToElection < 24
          ? `We are ${s.monthsToElection} months from an election polling at ${s.approval.toFixed(0)}%. We need something visible and we need it now.`
          : `The public has stopped listening, and political capital income falls with approval — which means everything you want to do next gets more expensive too. An address costs almost nothing and buys us a hearing.`,
      panel: 'politics',
      action: ready ? { kind: 'decree', id: 'national-address', label: 'Address the nation' } : undefined,
    });
  }

  if (s.governance.capital < 8 && s.turn > 6) {
    push({
      from: 'adv-comms',
      id: 'no-capital',
      urgency: 58,
      severity: 'warning',
      headline: `Only ${Math.floor(s.governance.capital)} political capital left`,
      detail: `Without capital you cannot pass legislation, issue decrees or declare a plan — the government still exists but it cannot do anything. Income is ${s.governance.capitalPerMonth.toFixed(1)} a month and it rises with approval, mandate and the legislature's goodwill. Fixing those is the only way back.`,
      panel: 'politics',
    });
  }

  if (s.stability < 40) {
    push({
      from: 'adv-interior',
      id: 'stability',
      urgency: 80 + (40 - s.stability) * 2.5,
      severity: s.stability < 25 ? 'critical' : 'warning',
      headline: `Stability is down to ${s.stability.toFixed(0)}`,
      detail: `Provincial unrest is climbing and the machinery of government is getting harder to operate. Policing helps at the margin, but unrest is usually a symptom — unemployment, inequality or a public that has stopped believing us.`,
      panel: 'provinces',
      action: decreeAvailability(s, 'security-crackdown').enabled
        ? { kind: 'decree', id: 'security-crackdown', label: 'Nationwide security operation' }
        : undefined,
    });
  }

  if (s.corruption > 55) {
    push({
      from: 'adv-justice',
      id: 'corruption',
      urgency: 45 + s.corruption / 2,
      severity: s.corruption > 75 ? 'critical' : 'warning',
      headline: `Corruption is at ${s.corruption.toFixed(0)}`,
      detail: `We collect a fraction of what we levy and we pay well above the odds for everything we buy. It is a tax on every other thing on this list — nothing else you do reaches full effect until it comes down.`,
      panel: 'decrees',
      action: decreeAvailability(s, 'anti-corruption-purge').enabled
        ? { kind: 'decree', id: 'anti-corruption-purge', label: 'Anti-corruption purge' }
        : policyAvailability(s, 'anti-corruption-agency').enabled
          ? { kind: 'policy', id: 'anti-corruption-agency', label: 'Establish an anti-corruption agency' }
          : policyAvailability(s, 'civil-service-reform').enabled
            ? { kind: 'policy', id: 'civil-service-reform', label: 'Reform the civil service' }
            : undefined,
    });
  }

  if (s.monthsToElection > 0 && s.monthsToElection <= 8 && s.approval < 55) {
    push({
      from: 'adv-comms',
      id: 'election-warning',
      urgency: 85,
      severity: 'warning',
      headline: `Election in ${s.monthsToElection} month${s.monthsToElection === 1 ? '' : 's'}`,
      detail: `We are polling at ${s.approval.toFixed(0)}%. ${
        s.settings.neverEndGame
          ? 'Losing will not end your government, but it will cost you a great deal of authority.'
          : 'If we lose, the campaign ends here.'
      }`,
      panel: 'politics',
    });
  }

  /* ------------------------------ Factions ------------------------------ */

  const hostile = hostileFactions(s);
  const army = s.factions.find((f) => f.id === 'military');
  if (army && army.satisfaction < 28 && army.influence > 12) {
    push({
      from: 'adv-defence',
      id: 'army-hostile',
      urgency: 105,
      severity: 'critical',
      headline: `The armed forces are at ${army.satisfaction.toFixed(0)} satisfaction`,
      detail: `The officer corps has stopped regarding this government as theirs. With ${army.influence.toFixed(0)}% of national influence behind them, that is not a morale problem — it is the precondition for a coup. Defence funding is the fastest thing that moves it.`,
      panel: 'factions',
      action: {
        kind: 'budget',
        dept: 'military',
        level: Math.min(3.5, Math.round((s.budget.military.level + 0.25) * 20) / 20),
        label: `Raise defence funding to ${((s.budget.military.level + 0.25) * 100).toFixed(0)}%`,
      },
    });
  } else if (hostile.length > 0) {
    const worst = hostile[0];
    const def = FACTION_INDEX[worst.id];
    push({
      from: 'adv-interior',
      id: `faction-${worst.id}`,
      urgency: 52 + worst.influence,
      severity: worst.satisfaction < 18 ? 'warning' : 'opportunity',
      headline: `${def?.name ?? worst.id} are hostile (${worst.satisfaction.toFixed(0)} / 100)`,
      detail: `They hold ${worst.influence.toFixed(0)}% of national influence and they are actively working against us — that shows up as a permanent negative modifier on everything they touch. What they want: ${def?.blurb ?? 'to be taken seriously'}.`,
      panel: 'factions',
    });
  }

  /* ------------------------------ Research ------------------------------ */

  const capacity = researchCapacity(s);
  const idleSlots = capacity - s.research.active.length;
  if (idleSlots > 0) {
    const next = startableTechs(s).sort((a, b) => a.cost - b.cost)[0];
    if (next) {
      push({
        from: 'adv-science',
        id: 'idle-research',
        urgency: 55 + idleSlots * 6,
        severity: 'warning',
        headline:
          idleSlots === capacity
            ? 'No research programme is running'
            : `${idleSlots} of ${capacity} laboratories are idle`,
        detail: `We are generating ${Math.round(s.research.perMonth)} research points a month${
          idleSlots === capacity ? ' and spending them on nothing' : ' and only part of it is being used'
        }. ${next.name} is the cheapest thing we can start today${
          s.research.points > 200 ? `, and we have ${Math.floor(s.research.points).toLocaleString()} banked points that go straight into it.` : '.'
        }`,
        panel: 'research',
        action: { kind: 'research', id: next.id, label: `Research ${next.name}` },
      });
    }
  }

  // The parallelism unlock itself — the single highest-leverage thing a
  // science-minded campaign can do, and easy to miss.
  //
  // Anything already being pursued is filtered out: advising the player to
  // start something that is already running or queued is worse than silence.
  const startableIds = new Set(startableTechs(s).map((t) => t.id));
  const locked = lockedSlotSources(s).filter((source) => {
    if (source.kind === 'tech') {
      return !s.research.active.some((p) => p.techId === source.id) && !s.research.queue.includes(source.id);
    }
    if (source.kind === 'building') {
      return !s.construction.some((c) => c.buildingId === source.id);
    }
    return true;
  });

  if (locked.length > 0 && capacity < 3 && s.turn > 12) {
    const nextSlot = locked[0];
    const canResearch = nextSlot.kind === 'tech' && startableIds.has(nextSlot.id);
    const canBuild = nextSlot.kind === 'building' && buildAvailability(s, nextSlot.id).enabled;
    const canEnact = nextSlot.kind === 'policy' && policyAvailability(s, nextSlot.id).enabled;
    push({
      from: 'adv-science',
      id: 'unlock-parallel-research',
      urgency: 44,
      severity: 'opportunity',
      headline: `We can only run ${capacity} research programme${capacity === 1 ? '' : 's'} at a time`,
      detail: `${nextSlot.label} would let us run one more in parallel. It does not make research faster in total — it lets us keep two branches of the tree moving instead of finishing one before we can touch the other, and it stops output being stranded whenever a project completes mid-month.`,
      panel: nextSlot.kind === 'building' ? 'construction' : nextSlot.kind === 'policy' ? 'policies' : 'research',
      action: canResearch
        ? { kind: 'research', id: nextSlot.id, label: `Research ${TECH_INDEX[nextSlot.id].name}` }
        : canBuild
          ? { kind: 'build', id: nextSlot.id, label: `Build ${BUILDING_INDEX[nextSlot.id].name}` }
          : canEnact
            ? { kind: 'policy', id: nextSlot.id, label: `Enact ${POLICY_INDEX[nextSlot.id].name}` }
            : undefined,
    });
  }

  /* ------------------------------- Cabinet ------------------------------ */

  if (s.advisors.length < 5) {
    const vacancy = ADVISORS.find((a) => !s.advisors.includes(a.id));
    push({
      from: '',
      id: 'cabinet-vacancy',
      urgency: 40 + (5 - s.advisors.length) * 6,
      severity: s.advisors.length === 0 ? 'warning' : 'opportunity',
      headline: `${5 - s.advisors.length} cabinet seat${5 - s.advisors.length === 1 ? '' : 's'} unfilled`,
      detail: `An empty portfolio is a permanent modifier you are not collecting, and advice you are not getting. ${vacancy ? `${vacancy.name} is available for the ${vacancy.role} brief.` : ''}`,
      panel: 'cabinet',
    });
  }

  /* ----------------------------- Environment ---------------------------- */

  if (s.environment.emissions > 400 && renewableShare(s) < 45) {
    push({
      from: 'adv-environment',
      id: 'emissions',
      urgency: 35 + s.environment.emissions / 40,
      severity: 'warning',
      headline: `Emissions at ${s.environment.emissions.toFixed(0)} Mt with only ${renewableShare(s).toFixed(0)}% clean power`,
      detail: `Warming raises disaster frequency and water stress every year, and those bills land on us. A carbon price is the single strongest lever we have, and it raises revenue rather than costing it.`,
      panel: 'policies',
      action: policyAvailability(s, 'carbon-tax').enabled
        ? { kind: 'policy', id: 'carbon-tax', label: 'Introduce carbon pricing' }
        : policyAvailability(s, 'renewable-subsidies').enabled
          ? { kind: 'policy', id: 'renewable-subsidies', label: 'Subsidise renewables' }
          : undefined,
    });
  }

  if (s.environment.waterStress > 68) {
    push({
      from: 'adv-environment',
      id: 'water-stress',
      urgency: 40 + (s.environment.waterStress - 68),
      severity: s.environment.waterStress > 80 ? 'warning' : 'opportunity',
      headline: `Water stress is at ${s.environment.waterStress.toFixed(0)}`,
      detail: `Above 74 this opens a water crisis that escalates through rationing to agricultural failure. Desalination and environmental funding both push it back down, and both are far cheaper before the crisis than during it.`,
      panel: 'environment',
      action: buildAvailability(s, 'desalination-plant').enabled
        ? { kind: 'build', id: 'desalination-plant', label: 'Build a desalination plant' }
        : undefined,
    });
  }

  /* ------------------------------ Diplomacy ----------------------------- */

  const relations = averageRelations(s);
  if (relations < 5 && s.nations.length > 0) {
    push({
      from: 'adv-foreign',
      id: 'isolation',
      urgency: 35 + (5 - relations),
      severity: relations < -15 ? 'warning' : 'opportunity',
      headline: `Average relations are ${relations.toFixed(0)}`,
      detail: `We are diplomatically isolated. That costs us trade volume, closes off treaties and organisations, and leaves us without friends the day we need one. Aid is crude but it works.`,
      panel: 'diplomacy',
    });
  }

  const sanctioning = s.nations.filter((n) => n.sanctioningPlayer);
  if (sanctioning.length >= 2) {
    push({
      from: 'adv-foreign',
      id: 'sanctioned',
      urgency: 62,
      severity: 'warning',
      headline: `${sanctioning.length} nations are sanctioning us`,
      detail: `${sanctioning.slice(0, 3).map((n) => n.name).join(', ')}${sanctioning.length > 3 ? ' and others' : ''} have closed trade with us. That is real money out of the budget every month and it compounds: sanctions raise their threat perception, which makes more of them likely.`,
      panel: 'diplomacy',
    });
  }

  const threat = s.nations
    .filter((n) => !n.atWarWithPlayer && n.relations < -45 && n.militaryStrength > s.military.strength * 1.05)
    .sort((a, b) => a.relations - b.relations)[0];
  if (threat && s.settings.enableWars) {
    push({
      from: 'adv-defence',
      id: 'invasion-risk',
      urgency: 88,
      severity: 'warning',
      headline: `${threat.name} is hostile and stronger than us`,
      detail: `Relations are at ${threat.relations.toFixed(0)} and their forces outmatch ours. A defence pact with anyone credible, a non-aggression pact with them, or simply closing the capability gap all reduce the chance they act. Doing none of those is a decision too.`,
      panel: 'military',
      action: decreeAvailability(s, 'mobilise-reserves').enabled
        ? { kind: 'decree', id: 'mobilise-reserves', label: 'Mobilise the reserves' }
        : undefined,
    });
  }

  const joinable = ORGS.find((o) => !s.orgs.includes(o.id) && orgEligibility(s, o.id).enabled);
  if (joinable && s.orgs.length < 4) {
    push({
      from: 'adv-foreign',
      id: 'org-available',
      urgency: 25,
      severity: 'opportunity',
      headline: `We qualify to join the ${joinable.name}`,
      detail: `Membership is available to us now and we are not taking it. The dues are modest against what accession is worth in trade and standing.`,
      panel: 'diplomacy',
      action: { kind: 'org', id: joinable.id, label: `Accede to the ${joinable.name}` },
    });
  }

  /* -------------------------------- Trade ------------------------------- */

  const shortages = Object.entries(s.resources)
    .filter(([, holding]) => holding.production < holding.consumption * 0.7)
    .sort((a, b) => a[1].production - a[1].consumption - (b[1].production - b[1].consumption));
  if (shortages.length >= 3 && activeTradeVolume(s) > 0) {
    push({
      from: 'adv-foreign',
      id: 'resource-gap',
      urgency: 30,
      severity: 'opportunity',
      headline: `We are short of ${shortages.length} commodities`,
      detail: `We buy these on the open market at whatever it costs that month. Standing import agreements with friendly producers would fix the price and secure the supply — and world prices climb with global tension, which is currently ${s.world.tension.toFixed(0)}.`,
      panel: 'trade',
    });
  }

  /* ------------------------------ Military ------------------------------ */

  const losing = s.wars.find((w) => !w.resolved && w.warScore < -25);
  if (losing) {
    push({
      from: 'adv-defence',
      id: 'losing-war',
      urgency: 95,
      severity: 'critical',
      headline: 'We are losing a war',
      detail: `The war score is ${losing.warScore.toFixed(0)} and moving the wrong way. We can mobilise and try to turn it, or we can sue for peace now while the terms are still ours to negotiate.`,
      panel: 'military',
      action: decreeAvailability(s, 'mobilise-reserves').enabled
        ? { kind: 'decree', id: 'mobilise-reserves', label: 'Mobilise the reserves' }
        : undefined,
    });
  }

  /* ----------------------------- Coalition ------------------------------ */

  // A government that cannot pass anything has a route out of it that most
  // players never think to look for, so the board has to name it explicitly.
  const inCoalition = s.governance.coalition.length > 0;
  const breached = s.governance.coalition.filter((p) => p.breached);

  if (breached.length > 0) {
    const pact = breached[0];
    const party = s.parties.find((p) => p.id === pact.partyId);
    const grace = Math.max(0, 4 - pact.breachMonths);
    push({
      from: '',
      id: 'coalition-breach',
      urgency: 150 + (4 - grace) * 20,
      severity: 'critical',
      headline: `${party?.name ?? 'A coalition partner'} is about to walk out`,
      detail: `The agreement was: ${pact.demand.label.toLowerCase()}. It is not being honoured, and they have given us ${grace} month${grace === 1 ? '' : 's'}. If they leave, we lose their votes and take a mandate and stability hit far larger than the concession would have cost.`,
      panel: 'politics',
      action:
        pact.demand.kind === 'policy' && policyAvailability(s, pact.demand.key).enabled
          ? { kind: 'policy', id: pact.demand.key, label: `Enact ${POLICY_INDEX[pact.demand.key]?.name ?? 'it'}` }
          : pact.demand.kind === 'budget'
            ? {
                kind: 'budget',
                dept: pact.demand.key as BudgetDept,
                level: pact.demand.value ?? 1.3,
                label: `Fund it at ${((pact.demand.value ?? 1.3) * 100).toFixed(0)}%`,
              }
            : pact.demand.kind === 'tax'
              ? {
                  kind: 'tax',
                  key: pact.demand.key as TaxKey,
                  value: pact.demand.value ?? 0,
                  label: `Set it to ${pact.demand.value ?? 0}%`,
                }
              : undefined,
    });
  }

  if (!inCoalition && s.governance.legislativeSupport < 48 && s.turn > 12) {
    // The cheapest partner that would actually give us a working chamber.
    const candidates = s.parties
      .filter((p) => p.id !== `party-${s.leader.ideology}`)
      .map((p) => ({ party: p, assessment: assessPact(s, p.id) }))
      .filter((c) => c.assessment.enabled)
      .sort((a, b) => b.assessment.supportGain / Math.max(1, b.assessment.cost) - a.assessment.supportGain / Math.max(1, a.assessment.cost));

    const best = candidates[0];
    if (best) {
      push({
        from: '',
        id: 'form-coalition',
        urgency: 84 + (48 - s.governance.legislativeSupport),
        severity: 'warning',
        headline: `The house is at ${s.governance.legislativeSupport.toFixed(0)}% — every bill is costing double`,
        detail: `We are buying votes we do not have, one bill at a time. ${best.party.name} would sit with us for ${best.assessment.cost} political capital, and their price is: ${best.assessment.demand.label.toLowerCase()}. That is worth about ${best.assessment.supportGain.toFixed(0)} points of support and takes the price off every bill after it.`,
        panel: 'politics',
        action: { kind: 'coalition', partyId: best.party.id, label: `Bring in ${best.party.name}` },
      });
    }
  } else if (inCoalition && !hasMajority(s) && s.governance.coalition.length < 3) {
    const candidates = s.parties
      .filter((p) => p.id !== `party-${s.leader.ideology}`)
      .map((p) => ({ party: p, assessment: assessPact(s, p.id) }))
      .filter((c) => c.assessment.enabled)
      .sort((a, b) => b.party.support - a.party.support);
    const best = candidates[0];
    if (best) {
      push({
        from: '',
        id: 'extend-coalition',
        urgency: 42,
        severity: 'opportunity',
        headline: `The coalition holds ${coalitionShare(s).toFixed(0)}% — short of a majority`,
        detail: `One more partner would put the government over 50% and take a further quarter off the price of legislation. ${best.party.name} would come in for ${best.assessment.cost} capital: ${best.assessment.demand.label.toLowerCase()}.`,
        panel: 'politics',
        action: { kind: 'coalition', partyId: best.party.id, label: `Bring in ${best.party.name}` },
      });
    }
  }

  /* ---------------------------- Trade war ------------------------------- */

  const retaliators = retaliatingNations(s);
  if (retaliators.length > 0) {
    const worst = retaliators[0];
    const settlement = assessSettlement(s, worst.id);
    const avg = averageForeignTariff(s);
    push({
      from: 'adv-foreign',
      id: 'trade-war',
      urgency: 96 + avg * 2,
      severity: retaliators.length > 2 ? 'critical' : 'warning',
      headline: `${retaliators.length} nation${retaliators.length === 1 ? '' : 's'} now tariff our exports`,
      detail: `Our own rate is ${s.taxes.tariff.toFixed(0)}%, and the answer is an average ${avg.toFixed(1)}% wall on the way out — which comes straight off the trade balance and off volumes with the partners who impose it. ${worst.name} is the worst at ${worst.tariffOnPlayer.toFixed(0)}%. Cutting our own tariff bleeds the grievance away over a year or two; a settlement buys their tariff off at once and does nothing about the cause.`,
      panel: 'trade',
      action: settlement.enabled
        ? { kind: 'settle-trade', countryId: worst.id, label: `Settle with ${worst.name}` }
        : s.taxes.tariff > 6
          ? { kind: 'tax', key: 'tariff', value: Math.max(0, s.taxes.tariff - 6), label: `Cut tariffs to ${Math.max(0, s.taxes.tariff - 6).toFixed(0)}%` }
          : undefined,
    });
  } else if (s.taxes.tariff > 16) {
    const angriest = [...s.nations]
      .filter((n) => !n.atWarWithPlayer)
      .sort((a, b) => (b.tradeGrievance ?? 0) - (a.tradeGrievance ?? 0))[0];
    if (angriest && (angriest.tradeGrievance ?? 0) > 28) {
      push({
        from: 'adv-growth',
        id: 'trade-grievance',
        urgency: 62,
        severity: 'warning',
        headline: `Our tariffs are ${s.taxes.tariff.toFixed(0)}% and patience is running out`,
        detail: `${angriest.name} is at ${angriest.tradeGrievance.toFixed(0)} on a scale where 45 is where governments start retaliating. Their exporters are ${((angriest.tradeVolume / Math.max(1, (angriest.gdp * 1000) / 12)) * 100).toFixed(0)}% exposed to us, which is why they are the one who will move first. This is far cheaper to head off than to settle.`,
        panel: 'trade',
        action: { kind: 'tax', key: 'tariff', value: Math.max(6, s.taxes.tariff - 5), label: `Cut tariffs to ${Math.max(6, s.taxes.tariff - 5).toFixed(0)}%` },
      });
    }
  }

  /* ----------------------------- Provinces ------------------------------ */

  const separatist = [...s.provinces].sort((a, b) => b.separatism - a.separatism)[0];
  if (separatist && separatist.separatism > 45) {
    push({
      from: 'adv-interior',
      id: 'separatism',
      urgency: 50 + separatist.separatism,
      severity: separatist.separatism > 60 ? 'warning' : 'opportunity',
      headline: `${separatist.name} is at ${separatist.separatism.toFixed(0)} separatism`,
      detail: `Above 62 a secession movement opens and it is very expensive to close. Devolution is the durable answer and it costs political capital rather than money; standing investment works more slowly but does not weaken the centre.`,
      panel: 'provinces',
    });
  }

  /* ------------------------------- Agenda ------------------------------- */

  if (!s.agenda && s.governance.capital >= AGENDA_DECLARATION_COST && s.turn > 18) {
    // Recommend the plan the country is already closest to delivering — a
    // committed target should be a stretch, not a fantasy.
    const candidate = AGENDAS.find((a) => {
      if (s.agendasCompleted.includes(a.id)) return false;
      if (a.metric === 'militaryStrength' && s.military.strength > 85) return false;
      if (a.metric === 'corruption' && s.corruption < 20) return false;
      if (a.metric === 'unemployment' && s.economy.unemployment < 4) return false;
      return true;
    });
    if (candidate) {
      push({
        from: '',
        id: 'declare-agenda',
        urgency: 34,
        severity: 'opportunity',
        headline: 'No five-year plan is running',
        detail: `We have ${Math.floor(s.governance.capital)} political capital and nothing staked on a public target. A plan costs ${AGENDA_DECLARATION_COST} capital, imposes a real handicap while it runs, and pays a permanent bonus if we deliver it. ${candidate.name} fits where the country is now.`,
        panel: 'objectives',
        action: { kind: 'agenda', id: candidate.id, label: `Declare ${candidate.name}` },
      });
    }
  } else if (s.agenda) {
    const def = AGENDA_INDEX[s.agenda.defId];
    const monthsLeft = s.agenda.endsTurn - s.turn;
    if (def && monthsLeft <= 18 && monthsLeft > 0) {
      push({
        from: '',
        id: 'agenda-deadline',
        urgency: 58,
        severity: 'warning',
        headline: `${def.name}: ${monthsLeft} months left`,
        detail: `The target was published and it will be judged. Missing it costs approval, mandate and momentum; hitting it is a permanent gain. Everything that moves ${def.metric} is worth doing now, not later.`,
        panel: 'objectives',
      });
    }
  }

  /* ----------------------------- Objectives ----------------------------- */

  const progress = victoryProgress(s);
  const outstanding = progress.filter((p) => !p.met);
  if (outstanding.length === 1 && s.turn > 24) {
    push({
      from: '',
      id: 'one-from-victory',
      urgency: 50,
      severity: 'opportunity',
      headline: `One condition from your objective`,
      detail: `Everything is in place except ${outstanding[0].label.toLowerCase()} — currently ${outstanding[0].display}.`,
      panel: 'objectives',
    });
  }

  /* -------------------------- Idle opportunity -------------------------- */
  // The board must never be empty. If nothing is wrong, there is always
  // something worth building, joining or committing to next.

  if (out.length < limit && s.economy.treasury > gdpMonthly * 0.8) {
    const wonder = BUILDINGS.filter((b) => b.category === 'wonder' && buildAvailability(s, b.id).enabled)[0];
    const decree = DECREES.find((d) => d.category !== 'emergency' && decreeAvailability(s, d.id).enabled);
    if (wonder) {
      push({
        from: 'adv-infra',
        id: 'wonder-available',
        urgency: 20,
        severity: 'opportunity',
        headline: `We can afford ${wonder.name}`,
        detail: `The treasury is deep enough to commission it. Projects of this scale pay back in prestige and capability for decades.`,
        panel: 'construction',
        action: { kind: 'build', id: wonder.id, label: `Commission ${wonder.name}` },
      });
    } else if (decree) {
      push({
        from: '',
        id: 'decree-available',
        urgency: 15,
        severity: 'opportunity',
        headline: `${decree.name} is available`,
        detail: decree.description,
        panel: 'decrees',
        action: { kind: 'decree', id: decree.id, label: DECREE_INDEX[decree.id].name },
      });
    }
  }

  if (out.length < limit && s.economy.sovereignFund <= 0 && s.economy.treasury > gdpMonthly * 1.2) {
    push({
      from: 'adv-finance',
      id: 'start-fund',
      urgency: 18,
      severity: 'opportunity',
      headline: 'The sovereign wealth fund is empty',
      detail: `Cash in the treasury earns nothing. The fund compounds at roughly ${s.economy.fundReturn.toFixed(1)}% a year and, because it tracks the world cycle rather than ours, it is worth most exactly when the domestic economy is worst. The catch is that money in it is not spendable until you withdraw it.`,
      panel: 'budget',
    });
  }

  if (out.length < limit) {
    // Absolute fallback: the next cheapest technology that is genuinely new.
    // The board is never allowed to be empty — there is always a next thing.
    const startable = startableTechs(s).sort((a, b) => a.cost - b.cost)[0];
    const next =
      startable ??
      TECHNOLOGIES.filter(
        (t) =>
          !s.research.completed.includes(t.id) &&
          !s.research.active.some((p) => p.techId === t.id) &&
          !s.research.queue.includes(t.id),
      ).sort((a, b) => a.cost - b.cost)[0];
    if (next) {
      push({
        from: 'adv-science',
        id: 'next-tech',
        urgency: 10,
        severity: 'opportunity',
        headline: `${next.name} is the natural next step`,
        detail: `Nothing is going wrong, which is the best time to raise the ceiling rather than the floor. ${next.description}`,
        panel: 'research',
        action: startable && startable.id === next.id
          ? { kind: 'research', id: next.id, label: `Research ${next.name}` }
          : undefined,
      });
    }
  }

  return out.sort((a, b) => b.urgency - a.urgency).slice(0, limit);
}

/** Everything the cabinet would raise, not just the top few. */
export function allRecommendations(s: GameState): Recommendation[] {
  return buildRecommendations(s, 99);
}

/**
 * The single most valuable thing to do right now.
 *
 * Used by the persistent "next move" strip so there is always one clear
 * answer to "what should I do?" without opening a panel.
 */
export function nextBestAction(s: GameState): Recommendation | null {
  return buildRecommendations(s, 1)[0] ?? null;
}
