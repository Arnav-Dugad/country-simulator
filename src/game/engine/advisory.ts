import type { BudgetDept, GameState, PanelTarget, TaxKey } from '../types';
import { ADVISORS, ADVISOR_INDEX, ORGS } from '../data/institutions';
import { POLICIES, POLICY_INDEX } from '../data/policies';
import { TECHNOLOGIES } from '../data/technologies';
import { BUILDINGS, BUILDING_INDEX } from '../data/buildings';
import { DECREES, DECREE_INDEX } from '../data/decrees';
import {
  activeTradeVolume, averageRelations, computeBudget, debtToGdp, energyBalance, renewableShare,
} from '../selectors';
import { victoryProgress } from './scoring';
import {
  buildAvailability, decreeAvailability, orgEligibility, policyAvailability,
} from './actions';

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
  | { kind: 'tax'; key: TaxKey; value: number; label: string };

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
    // A large surplus with no debt is idle money.
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
        detail: `We are running a surplus of ${((budget.net / gdpMonthly) * 100).toFixed(1)}% of monthly output with no debt to service. Money in the treasury does nothing. ${underfunded} is our thinnest department — I would put it there.`,
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
      detail: `Interest is now ${((budget.expenditure.debtInterest / gdpMonthly) * 100).toFixed(1)}% of monthly output — money that buys nothing. At this level our credit rating drives the cost of everything else we do.`,
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
      detail: `Prices are rising far above target. The central bank will keep tightening on its own, which will cost us growth. Closing the deficit is the durable fix; a price freeze buys time but stores up distortion.`,
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
        s.research.completed.length < 12
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
      detail: `A shortfall does not just mean blackouts — it directly suppresses GDP growth and feeds inflation every single month it persists. This is the cheapest problem on this list to fix and the most expensive to ignore.`,
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
          : `The public has stopped listening. An address costs almost nothing and buys us a hearing; whether we deserve it depends on what we do next.`,
      panel: 'politics',
      action: ready ? { kind: 'decree', id: 'national-address', label: 'Address the nation' } : undefined,
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

  /* ------------------------------ Research ------------------------------ */

  if (!s.research.current) {
    const next = TECHNOLOGIES.filter(
      (t) => !s.research.completed.includes(t.id) && t.requires.every((r) => s.research.completed.includes(r)),
    ).sort((a, b) => a.cost - b.cost)[0];
    if (next) {
      push({
        from: 'adv-science',
        id: 'idle-research',
        urgency: 55,
        severity: 'warning',
        headline: 'No research programme is running',
        detail: `We are generating ${Math.round(s.research.perMonth)} research points a month and spending them on nothing. ${next.name} is the cheapest thing we can start today.`,
        panel: 'research',
        action: { kind: 'research', id: next.id, label: `Research ${next.name}` },
      });
    }
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
      detail: `We buy these on the open market at whatever it costs that month. Standing import agreements with friendly producers would fix the price and secure the supply.`,
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

  return out.sort((a, b) => b.urgency - a.urgency).slice(0, limit);
}

/** Everything the cabinet would raise, not just the top few. */
export function allRecommendations(s: GameState): Recommendation[] {
  return buildRecommendations(s, 99);
}
