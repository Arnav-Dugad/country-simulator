/**
 * Sovereign — core type system.
 *
 * The whole simulation is a pure function of `GameState`. Nothing in this file
 * imports React or Firebase: the engine must stay runnable in a plain Node test.
 */

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

export type RegionId =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'africa'
  | 'middle-east'
  | 'south-asia'
  | 'east-asia'
  | 'southeast-asia'
  | 'central-asia'
  | 'oceania';

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  /** Units of this currency per 1 USD at game start. */
  perUsd: number;
}

export type ResourceId =
  | 'oil'
  | 'gas'
  | 'coal'
  | 'uranium'
  | 'iron'
  | 'copper'
  | 'gold'
  | 'lithium'
  | 'rareEarths'
  | 'timber'
  | 'grain'
  | 'freshwater';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  icon: string;
  /** Base world price index at game start (arbitrary units per "unit"). */
  basePrice: number;
  category: 'energy' | 'metal' | 'strategic' | 'agricultural';
  description: string;
}

export interface CountryProfile {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2, lowercased — drives the flag CDN url. */
  iso2: string;
  capital: string;
  region: RegionId;
  currency: string;
  population: number;
  /** Nominal GDP in billions USD. */
  gdp: number;
  /** km² */
  area: number;
  government: GovernmentTypeId;
  /** 0–100 starting values for the headline indices. */
  stability: number;
  militaryStrength: number;
  techLevel: number;
  corruption: number;
  hdi: number;
  /** Rough per-resource endowment, 0–100. Missing = 0. */
  resources: Partial<Record<ResourceId, number>>;
  /** Flavour used by the setup screen. */
  blurb: string;
  nuclear?: boolean;
  unSecurityCouncil?: boolean;
}

/* ------------------------------------------------------------------ */
/* Government, ideology, traits                                        */
/* ------------------------------------------------------------------ */

export type GovernmentTypeId =
  | 'democracy'
  | 'republic'
  | 'federal-republic'
  | 'constitutional-monarchy'
  | 'absolute-monarchy'
  | 'single-party'
  | 'military-junta'
  | 'theocracy'
  | 'technocracy'
  | 'direct-democracy'
  | 'corporate-state'
  | 'anarcho-syndicalist';

export interface GovernmentType {
  id: GovernmentTypeId;
  name: string;
  icon: string;
  description: string;
  /** Multiplicative / additive modifiers applied every tick. */
  modifiers: Modifiers;
  /** Whether elections happen at all. */
  holdsElections: boolean;
  /** Months between elections when applicable. */
  termMonths: number;
}

export type IdeologyId =
  | 'social-democracy'
  | 'liberal'
  | 'conservative'
  | 'libertarian'
  | 'socialist'
  | 'nationalist'
  | 'green'
  | 'centrist'
  | 'progressive'
  | 'traditionalist';

export interface Ideology {
  id: IdeologyId;
  name: string;
  color: string;
  description: string;
  /** Position on the two classic axes, -100..100. */
  economicAxis: number; // negative = left / planned, positive = right / market
  socialAxis: number; // negative = libertarian, positive = authoritarian
  modifiers: Modifiers;
}

export type TraitId =
  | 'charismatic'
  | 'economist'
  | 'general'
  | 'diplomat'
  | 'reformer'
  | 'iron-fist'
  | 'visionary'
  | 'populist'
  | 'technocrat'
  | 'ascetic'
  | 'orator'
  | 'spymaster';

export interface Trait {
  id: TraitId;
  name: string;
  icon: string;
  description: string;
  modifiers: Modifiers;
}

export type DifficultyId = 'sandbox' | 'easy' | 'normal' | 'hard' | 'brutal';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  description: string;
  /** Multiplies incoming positive economics. */
  economyMultiplier: number;
  /** Multiplies unrest / crisis frequency. */
  crisisMultiplier: number;
  /** Multiplies score at game end. */
  scoreMultiplier: number;
  startingTreasuryMultiplier: number;
}

export type EraId = 'cold-war' | 'nineties' | 'modern' | 'near-future';

export interface Era {
  id: EraId;
  name: string;
  startYear: number;
  description: string;
  modifiers: Modifiers;
}

export type VictoryGoalId =
  | 'superpower'
  | 'utopia'
  | 'economic'
  | 'green'
  | 'scientific'
  | 'cultural'
  | 'survival';

export interface VictoryGoal {
  id: VictoryGoalId;
  name: string;
  icon: string;
  description: string;
  /** Human-readable conditions, evaluated by `checkVictory`. */
  conditions: string[];
}

/* ------------------------------------------------------------------ */
/* Modifier system                                                     */
/* ------------------------------------------------------------------ */

/**
 * Every modifier is an *additive percentage-point or flat* adjustment applied
 * by the engine at a well-defined place. Keys are deliberately explicit so a
 * reader can tell exactly what a policy does.
 */
export interface Modifiers {
  gdpGrowth?: number; // +pp on annualised real growth
  taxEfficiency?: number; // +% multiplier on gross tax take
  spendingEfficiency?: number; // +% value obtained per unit spent
  inflation?: number; // +pp
  unemployment?: number; // +pp
  approval?: number; // +points per year, smoothed
  stability?: number; // +points per year, smoothed
  corruption?: number; // +points per year, smoothed
  research?: number; // +% research output
  militaryPower?: number; // +% effective military strength
  diplomacy?: number; // +% relation drift toward positive
  birthRate?: number; // +pp
  migration?: number; // +% net migration
  health?: number; // + points per year
  education?: number; // + points per year
  happiness?: number; // + points per year
  emissions?: number; // +% CO2 output
  crime?: number; // + points per year
  tradeIncome?: number; // +% on trade balance income
  energyOutput?: number; // +% energy production
  softPower?: number; // + points per year
  civilLiberties?: number; // + points per year
  inequality?: number; // + points per year (Gini-ish)
  infrastructure?: number; // + points per year
  intelligence?: number; // +% intel capability
}

export const MODIFIER_LABELS: Record<keyof Modifiers, string> = {
  gdpGrowth: 'GDP Growth',
  taxEfficiency: 'Tax Efficiency',
  spendingEfficiency: 'Spending Efficiency',
  inflation: 'Inflation',
  unemployment: 'Unemployment',
  approval: 'Approval',
  stability: 'Stability',
  corruption: 'Corruption',
  research: 'Research',
  militaryPower: 'Military Power',
  diplomacy: 'Diplomacy',
  birthRate: 'Birth Rate',
  migration: 'Migration',
  health: 'Healthcare',
  education: 'Education',
  happiness: 'Happiness',
  emissions: 'Emissions',
  crime: 'Crime',
  tradeIncome: 'Trade Income',
  energyOutput: 'Energy Output',
  softPower: 'Soft Power',
  civilLiberties: 'Civil Liberties',
  inequality: 'Inequality',
  infrastructure: 'Infrastructure',
  intelligence: 'Intelligence',
};

/** Modifier keys where a higher number is bad for the player. */
export const INVERTED_MODIFIERS: ReadonlySet<keyof Modifiers> = new Set([
  'inflation',
  'unemployment',
  'corruption',
  'emissions',
  'crime',
  'inequality',
]);

/* ------------------------------------------------------------------ */
/* Policies, tech, buildings                                           */
/* ------------------------------------------------------------------ */

export type PolicyCategory =
  | 'economy'
  | 'social'
  | 'labour'
  | 'environment'
  | 'security'
  | 'justice'
  | 'education'
  | 'healthcare'
  | 'immigration'
  | 'technology'
  | 'culture'
  | 'governance';

export interface Policy {
  id: string;
  name: string;
  category: PolicyCategory;
  icon: string;
  description: string;
  /** One-off cost in millions of local currency-equivalent USD. */
  upfrontCost: number;
  /** Recurring monthly cost in millions USD. Can be negative (revenue). */
  monthlyCost: number;
  modifiers: Modifiers;
  /** Immediate one-shot effects on approval etc. */
  instant?: Partial<Record<keyof Modifiers, number>>;
  requires?: {
    tech?: string[];
    policies?: string[];
    government?: GovernmentTypeId[];
    minStability?: number;
    minGdpPerCapita?: number;
  };
  /** Policies that cannot be active at the same time. */
  conflicts?: string[];
  /** Ideologies that gain/lose approval when this is enacted. */
  ideologyAppeal?: Partial<Record<IdeologyId, number>>;
  /**
   * Political capital required to pass it, before legislative friction.
   * Derived from the policy's reach when not stated explicitly.
   */
  politicalCost?: number;
  /** How each interest group reacts to it, -20..20. */
  factionAppeal?: Partial<Record<FactionId, number>>;
}

export type TechBranch =
  | 'economy'
  | 'military'
  | 'science'
  | 'society'
  | 'energy'
  | 'space';

export interface Technology {
  id: string;
  name: string;
  branch: TechBranch;
  tier: number;
  icon: string;
  description: string;
  /** Research points required. */
  cost: number;
  requires: string[];
  modifiers: Modifiers;
  /** Unlocks referenced by id. */
  unlocksPolicies?: string[];
  unlocksBuildings?: string[];
  era?: EraId;
}

export type BuildingCategory =
  | 'industry'
  | 'energy'
  | 'infrastructure'
  | 'science'
  | 'military'
  | 'civic'
  | 'wonder';

export interface Building {
  id: string;
  name: string;
  category: BuildingCategory;
  icon: string;
  description: string;
  /** Capital cost in millions USD. */
  cost: number;
  /** Months to complete. */
  buildTime: number;
  /** Recurring monthly upkeep in millions USD. */
  upkeep: number;
  modifiers: Modifiers;
  /** Max copies. Wonders are 1. */
  maxCount: number;
  requires?: { tech?: string[]; buildings?: string[]; minGdp?: number };
  /** Jobs created, in thousands. */
  jobs?: number;
  /** Electricity produced in TWh/year (negative = consumer). */
  energy?: number;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export type EventCategory =
  | 'economy'
  | 'politics'
  | 'disaster'
  | 'diplomacy'
  | 'military'
  | 'science'
  | 'society'
  | 'crime'
  | 'health'
  | 'environment'
  | 'opportunity';

export type EventSeverity = 'trivial' | 'minor' | 'major' | 'critical';

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  /** Immediate treasury change in millions USD. */
  cost?: number;
  /** Applied once, directly to state indices. */
  effects: EventEffects;
  /** Temporary modifiers with a duration. */
  temporaryModifiers?: { modifiers: Modifiers; months: number; label: string };
  /** Only selectable when this predicate passes. */
  requires?: { minTreasury?: number; minStability?: number; minMilitary?: number; tech?: string[] };
  /** 0–1 chance the choice's `effects` are replaced by `failureEffects`. */
  riskChance?: number;
  failureEffects?: EventEffects;
}

export interface EventEffects {
  treasury?: number;
  approval?: number;
  stability?: number;
  gdpShock?: number; // % one-off change to GDP
  population?: number; // absolute change
  inflation?: number;
  unemployment?: number;
  corruption?: number;
  militaryStrength?: number;
  research?: number; // flat research points
  health?: number;
  education?: number;
  happiness?: number;
  crime?: number;
  emissions?: number;
  softPower?: number;
  civilLiberties?: number;
  infrastructure?: number;
  inequality?: number;
  /** One-off change to intelligence capability. */
  intelligence?: number;
  /** Relation change with every nation. */
  globalRelations?: number;
  /** Relation change with a specific country id. */
  relations?: { countryId: string; amount: number }[];
}

export interface GameEventDef {
  id: string;
  title: string;
  category: EventCategory;
  severity: EventSeverity;
  icon: string;
  description: string;
  /** Relative weight in the random pool. */
  weight: number;
  /** Minimum months between repeats of the same event. */
  cooldown: number;
  /** Gate: event only fires when all conditions hold. */
  conditions?: EventCondition;
  choices: EventChoice[];
  /** Event ids that become eligible right after this resolves. */
  chains?: string[];
  /** If true the event can only ever fire once per campaign. */
  once?: boolean;
}

export interface EventCondition {
  minYear?: number;
  maxYear?: number;
  minStability?: number;
  maxStability?: number;
  minApproval?: number;
  maxApproval?: number;
  minGdpPerCapita?: number;
  maxGdpPerCapita?: number;
  minUnemployment?: number;
  maxCorruption?: number;
  minCorruption?: number;
  minPopulation?: number;
  minEmissions?: number;
  atWar?: boolean;
  government?: GovernmentTypeId[];
  era?: EraId[];
  requiresTech?: string[];
  minMilitary?: number;
}

/* ------------------------------------------------------------------ */
/* Diplomacy & war                                                     */
/* ------------------------------------------------------------------ */

export type TreatyType =
  | 'trade'
  | 'defense'
  | 'non-aggression'
  | 'research'
  | 'open-borders'
  | 'alliance';

export interface Treaty {
  id: string;
  type: TreatyType;
  countryId: string;
  signedTurn: number;
  /** Monthly treasury effect in millions USD. */
  monthlyValue: number;
  expiresTurn?: number;
}

/**
 * A standing agreement to buy or sell a fixed quantity of one commodity with
 * one nation, at a price locked in when it was signed.
 *
 * This is what turns resources from an automatic market balance into a
 * diplomatic instrument: a long contract insulates you from world prices, but
 * it binds you to a counterparty who can be sanctioned, go to war, or simply
 * run out of the thing.
 */
export interface TradeAgreement {
  id: string;
  countryId: string;
  resource: ResourceId;
  /** From the player's perspective. */
  direction: 'import' | 'export';
  /** Units per month. */
  quantity: number;
  /** Price multiplier locked at signing, against the resource's base price. */
  lockedPrice: number;
  signedTurn: number;
  /** Contract length in months; the agreement lapses when it runs out. */
  termMonths: number;
  /** Set when the counterparty can no longer deliver or take delivery. */
  suspended: boolean;
}

export type WarGoal = 'conquest' | 'punitive' | 'liberation' | 'resources' | 'defensive';

export interface War {
  id: string;
  attackerId: string; // 'player' or country id
  defenderId: string;
  startTurn: number;
  goal: WarGoal;
  /** -100 (losing badly) .. 100 (winning) from the player's perspective. */
  warScore: number;
  playerCasualties: number;
  enemyCasualties: number;
  /** Monthly cost to the player in millions USD. */
  monthlyCost: number;
  /** Set when the war resolves. */
  resolved?: 'victory' | 'defeat' | 'white-peace';
}

export interface ForeignNation {
  id: string;
  name: string;
  iso2: string;
  region: RegionId;
  /** -100 hostile .. 100 allied. */
  relations: number;
  gdp: number;
  population: number;
  militaryStrength: number;
  techLevel: number;
  stability: number;
  government: GovernmentTypeId;
  nuclear: boolean;
  /** Active trade volume with the player in millions USD/month. */
  tradeVolume: number;
  atWarWithPlayer: boolean;
  sanctioned: boolean;
  embassy: boolean;
  /** AI personality drives how relations drift. */
  personality: 'pragmatic' | 'aggressive' | 'isolationist' | 'mercantile' | 'idealist';
  /** Memory of player actions, decays over time. */
  trust: number;
  /**
   * Resource endowment, 0–100, copied from the country profile. Determines
   * what this nation can plausibly sell you and what it needs to buy.
   */
  resources: Partial<Record<ResourceId, number>>;

  /**
   * What this nation is currently trying to achieve. Drives whether it courts
   * you, sanctions you, arms itself against you, or ignores you entirely.
   */
  agenda: NationAgenda;
  /** Country ids this nation is at war with, excluding the player. */
  warsWith: string[];
  /** Bloc alignment, or null for non-aligned. */
  bloc: BlocId | null;
  /** How threatened this nation feels by the player, 0–100. */
  threatPerception: number;
  /** Whether they are currently sanctioning the player. */
  sanctioningPlayer: boolean;
}

export type NationAgenda =
  | 'expansion'
  | 'trade'
  | 'isolation'
  | 'rearmament'
  | 'influence'
  | 'development';

export type BlocId = 'western' | 'eastern' | 'non-aligned' | 'southern';

/**
 * An unsolicited proposal from a foreign government.
 *
 * These are what make the world feel like it has its own intentions: nations
 * come to you with offers, demands and ultimatums that expire whether or not
 * you look at them.
 */
export interface DiplomaticOffer {
  id: string;
  countryId: string;
  kind: 'treaty' | 'trade' | 'aid-request' | 'demand' | 'ultimatum' | 'join-war';
  /** Set for treaty offers. */
  treatyType?: TreatyType;
  /** Set for commodity offers. */
  resource?: ResourceId;
  direction?: 'import' | 'export';
  quantity?: number;
  price?: number;
  termMonths?: number;
  /** Millions USD, for aid requests and demands. */
  amount?: number;
  /** Third party, for join-war offers. */
  targetId?: string;
  /** Player-facing text. */
  title: string;
  body: string;
  /** Relations swing on acceptance and on refusal. */
  acceptRelations: number;
  refuseRelations: number;
  /** Turn after which the offer lapses on its own. */
  expiresTurn: number;
}

/** A war between two AI nations, which the player can be dragged into. */
export interface ForeignWar {
  id: string;
  aId: string;
  bId: string;
  startTurn: number;
  /** Positive means `aId` is winning. */
  score: number;
}

/* ------------------------------------------------------------------ */
/* Interest groups                                                     */
/* ------------------------------------------------------------------ */

export type FactionId =
  | 'business'
  | 'labour'
  | 'military'
  | 'clergy'
  | 'intelligentsia'
  | 'regions';

export interface FactionDef {
  id: FactionId;
  name: string;
  icon: string;
  description: string;
  /** What pleases them. Compared against the live state each month. */
  blurb: string;
  /** Modifiers applied at full satisfaction, scaled linearly from 50. */
  pleasedModifiers: Modifiers;
  /** Modifiers applied at zero satisfaction, scaled linearly from 50. */
  angeredModifiers: Modifiers;
}

export interface FactionState {
  id: FactionId;
  /** 0–100. Below 30 they actively work against you. */
  satisfaction: number;
  /** 0–100 share of national influence. Scales how much their mood matters. */
  influence: number;
}

/* ------------------------------------------------------------------ */
/* Crises                                                              */
/* ------------------------------------------------------------------ */

export type CrisisCategory =
  | 'economic'
  | 'political'
  | 'security'
  | 'health'
  | 'environmental'
  | 'social';

export interface CrisisStageDef {
  label: string;
  /** Months this stage lasts before escalating. */
  months: number;
  /** Per-month modifiers while the crisis sits in this stage. */
  modifiers: Modifiers;
  /** Narrative shown while the crisis is at this stage. */
  description: string;
}

export interface CrisisResponseDef {
  id: string;
  label: string;
  description: string;
  /** Millions USD at the reference economy size. */
  cost: number;
  /** Political capital spent. */
  politicalCost: number;
  /** Reduction in crisis severity, 0–100. */
  severityRelief: number;
  effects?: EventEffects;
  requires?: { tech?: string[]; minStability?: number; minMilitary?: number };
  /** 0–1 chance the response achieves nothing. */
  riskChance?: number;
}

export interface CrisisDef {
  id: string;
  name: string;
  icon: string;
  category: CrisisCategory;
  summary: string;
  /** Gate: the crisis can only begin when this holds. */
  trigger: (s: GameState) => boolean;
  /** Relative weight once eligible. */
  weight: number;
  /** Months before the same crisis can recur. */
  cooldown: number;
  stages: CrisisStageDef[];
  responses: CrisisResponseDef[];
  /** Applied once when the crisis reaches its final stage unresolved. */
  climax: EventEffects;
}

export interface ActiveCrisis {
  /** Unique per occurrence. */
  id: string;
  defId: string;
  startedTurn: number;
  /** Index into the definition's `stages`. */
  stage: number;
  /** Months spent in the current stage. */
  monthsInStage: number;
  /** 0–100. Falls when you respond, climbs when you do not. */
  severity: number;
  /** Response ids already used, so each is only available once. */
  responsesUsed: string[];
}

/* ------------------------------------------------------------------ */
/* National agenda                                                     */
/* ------------------------------------------------------------------ */

export type AgendaMetric =
  | 'gdpPerCapita'
  | 'happiness'
  | 'militaryStrength'
  | 'renewableShare'
  | 'researchCompleted'
  | 'approval'
  | 'corruption'
  | 'unemployment'
  | 'softPower'
  | 'infrastructure';

export interface AgendaDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  metric: AgendaMetric;
  /** Improvement required over the value when the plan was declared. */
  improvement: number;
  /** True when the metric should go *down* to succeed. */
  lower?: boolean;
  /** Modifiers granted while the plan runs — the cost of committing. */
  duringModifiers: Modifiers;
  /** Permanent modifiers granted on success. */
  rewardModifiers: Modifiers;
  /** Political capital granted on success. */
  rewardCapital: number;
}

export interface ActiveAgenda {
  defId: string;
  startedTurn: number;
  endsTurn: number;
  /** Metric value when the plan was declared. */
  baseline: number;
  target: number;
}

/* ------------------------------------------------------------------ */
/* Governance & political capital                                      */
/* ------------------------------------------------------------------ */

export interface GovernanceState {
  /**
   * Political capital. The second currency: money buys things, capital buys
   * permission. Earned from approval, mandate and legislative goodwill; spent
   * on policies, decrees and anything that overrides an institution.
   */
  capital: number;
  /** Produced per month. Recomputed each tick. */
  capitalPerMonth: number;
  /** Ceiling on banked capital. Raised by government type and legitimacy. */
  capitalCap: number;
  /** How legitimate your government is considered to be, 0–100. */
  mandate: number;
  /** Share of the legislature that will vote with you, 0–100. */
  legislativeSupport: number;
  /** Recent wins and losses, -100..100. Feeds capital income. */
  momentum: number;
  /** Bills passed and blocked, for the chronicle. */
  billsPassed: number;
  billsBlocked: number;
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

export interface WorldState {
  /** Global geopolitical tension, 0–100. Drives war and crisis frequency. */
  tension: number;
  /** Global business cycle, -1 (deep recession) .. 1 (boom). */
  cycle: number;
  /** Trend the cycle is currently moving in. */
  cyclePhase: 'expansion' | 'peak' | 'contraction' | 'trough';
  /** World real growth this month, annualised %. */
  globalGrowth: number;
  /** Aggregate world GDP in billions, including the player. */
  globalGdp: number;
  /** Months until the cycle next turns. */
  monthsToPhaseShift: number;
}

export type OrgId = 'un' | 'nato' | 'eu' | 'wto' | 'brics' | 'opec' | 'g20' | 'asean' | 'au' | 'paris-accord';

export interface InternationalOrg {
  id: OrgId;
  name: string;
  icon: string;
  description: string;
  /** Requirements to join. */
  requires: {
    minGdp?: number;
    minStability?: number;
    minRelationsAvg?: number;
    government?: GovernmentTypeId[];
    region?: RegionId[];
    minCivilLiberties?: number;
    requiresOil?: boolean;
    minEmissionsPolicy?: boolean;
  };
  monthlyDues: number;
  modifiers: Modifiers;
}

/* ------------------------------------------------------------------ */
/* Politics                                                            */
/* ------------------------------------------------------------------ */

export interface PoliticalParty {
  id: string;
  name: string;
  ideology: IdeologyId;
  color: string;
  /** 0–100 share of the popular vote. */
  support: number;
  seats: number;
  /** How much they like the player's government, -100..100. */
  relation: number;
}

export interface Province {
  id: string;
  name: string;
  population: number; // in millions
  /** Share of national GDP, 0–1. Normalised across provinces. */
  gdpShare: number;
  development: number; // 0–100
  unrest: number; // 0–100
  /** Dominant local industry. */
  specialty: 'agriculture' | 'industry' | 'services' | 'tech' | 'mining' | 'tourism' | 'energy';
  autonomy: number; // 0-100, high values raise secession risk
  loyalty: number; // 0-100
  /** Troops deployed to hold the province down. Costs money and liberties. */
  martialLaw: boolean;
  /**
   * Secession pressure, 0–100. Built from unrest, autonomy and disloyalty over
   * time rather than from any one month — a province leaves after years of
   * neglect, not after one bad quarter.
   */
  separatism: number;
  /** Standing monthly development spend directed here, in millions USD. */
  investment: number;
}

/* ------------------------------------------------------------------ */
/* Achievements & advisors                                             */
/* ------------------------------------------------------------------ */

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  points: number;
  /** Evaluated against a live state each tick. */
  check: (s: GameState) => boolean;
  hidden?: boolean;
}

export interface Advisor {
  id: string;
  name: string;
  role: string;
  icon: string;
  bio: string;
  /** Passive modifiers while appointed. */
  modifiers: Modifiers;
  salary: number; // millions USD/month
  /** Which stat this advisor comments on. */
  domain: keyof Modifiers | 'general';
}

/* ------------------------------------------------------------------ */
/* Runtime state                                                       */
/* ------------------------------------------------------------------ */

export interface Leader {
  name: string;
  title: string;
  age: number;
  portrait: string; // emoji or seed
  traits: TraitId[];
  ideology: IdeologyId;
  /** Rises with successful terms. */
  legacy: number;
}

export interface NationIdentity {
  name: string;
  adjective: string;
  /** Real country id when playing a real nation, else null. */
  baseCountryId: string | null;
  /** ISO2 for the flag CDN, or '' when using a custom flag. */
  iso2: string;
  /** Custom flag definition when iso2 is ''. */
  customFlag: CustomFlag | null;
  capital: string;
  motto: string;
  region: RegionId;
  currency: Currency;
  government: GovernmentTypeId;
  primaryColor: string;
  secondaryColor: string;
}

export interface CustomFlag {
  pattern: 'horizontal' | 'vertical' | 'cross' | 'diagonal' | 'canton' | 'sun' | 'triband-v' | 'triband-h';
  colors: [string, string, string];
  emblem: string;
}

export interface BudgetLine {
  /** Fraction of the recommended baseline, 0–2. 1 = fully funded. */
  level: number;
}

export type BudgetDept =
  | 'healthcare'
  | 'education'
  | 'military'
  | 'infrastructure'
  | 'welfare'
  | 'research'
  | 'police'
  | 'environment'
  | 'culture'
  | 'intelligence';

export type TaxKey =
  | 'income'
  | 'corporate'
  | 'vat'
  | 'capitalGains'
  | 'tariff'
  | 'wealth'
  | 'carbon'
  | 'property';

export interface EconomyState {
  /** Nominal GDP in billions USD. */
  gdp: number;
  /** Annualised real growth, in %. */
  growth: number;
  inflation: number;
  unemployment: number;
  /** Central bank policy rate, %. */
  interestRate: number;
  /** Public debt in billions USD. */
  debt: number;
  /** Treasury cash in millions USD. */
  treasury: number;
  /** Sector shares of GDP, sum to 1. */
  sectors: Record<SectorId, number>;
  /** 0–100. Drives borrowing costs. */
  creditRating: number;
  /** Consumer/business sentiment 0–100. */
  confidence: number;
  /** Trade balance in millions USD/month. */
  tradeBalance: number;
  /** Foreign exchange reserves, millions USD. */
  reserves: number;
  /** Gini-like inequality index 0–100. */
  inequality: number;
  /** Productivity index, 100 = baseline. */
  productivity: number;
  /** Local currency units per USD; drifts with inflation and confidence. */
  exchangeRate: number;

  /**
   * Sovereign wealth fund, in millions USD.
   *
   * Money moved here leaves the treasury and compounds at a market return
   * instead of sitting idle. It cannot be spent directly — it has to be
   * withdrawn first, which is the whole trade-off.
   */
  sovereignFund: number;
  /** Annualised return the fund earned last month, in %. */
  fundReturn: number;
  /**
   * Whether the central bank sets the policy rate itself.
   *
   * Independent banks follow a Taylor rule and are trusted by markets;
   * a captured bank does what you tell it and is not.
   */
  centralBankIndependent: boolean;
  /** Rate the player has ordered, used only when the bank is not independent. */
  policyRateTarget: number;
  /** Market yield on new sovereign debt, in %. Drives the interest bill. */
  bondYield: number;
  /**
   * Whether surplus cash is swept into debt repayment automatically.
   * On by default; turning it off lets the treasury build a war chest.
   */
  autoRepayDebt: boolean;
  /** Cumulative real GDP index, 100 at the start. Immune to price effects. */
  realIndex: number;
}

export type SectorId =
  | 'agriculture'
  | 'industry'
  | 'services'
  | 'technology'
  | 'energy'
  | 'tourism'
  | 'finance';

export interface SocietyState {
  population: number; // absolute persons
  birthRate: number; // per 1000/yr
  deathRate: number; // per 1000/yr
  netMigration: number; // per 1000/yr
  lifeExpectancy: number;
  literacy: number;
  urbanisation: number;
  medianAge: number;
  happiness: number; // 0-100
  health: number; // 0-100
  education: number; // 0-100
  crime: number; // 0-100
  civilLiberties: number; // 0-100
  softPower: number; // 0-100
  /** Age brackets as shares of population. */
  ageStructure: { young: number; working: number; elderly: number };
}

export interface EnvironmentState {
  /** Annual CO2 in megatonnes. */
  emissions: number;
  /** Global temperature anomaly in °C — shared world stat. */
  globalTemp: number;
  pollution: number; // 0-100
  renewableShare: number; // 0-100
  forestCover: number; // 0-100
  /** Rises with emissions; drives disaster frequency. */
  disasterRisk: number;
  waterStress: number; // 0-100
  biodiversity: number; // 0-100
}

export interface EnergyState {
  /** TWh/year produced by source. */
  production: Record<EnergySource, number>;
  /** TWh/year demanded. */
  demand: number;
}

export type EnergySource = 'coal' | 'gas' | 'oil' | 'nuclear' | 'hydro' | 'solar' | 'wind' | 'other';

export interface MilitaryState {
  /** 0–100 composite. */
  strength: number;
  manpower: number; // active personnel
  reserves: number;
  army: number; // 0-100 branch quality
  navy: number;
  airForce: number;
  cyber: number;
  space: number;
  nuclearWarheads: number;
  morale: number; // 0-100
  readiness: number; // 0-100
  /** Doctrine chosen at setup or later. */
  doctrine: 'defensive' | 'offensive' | 'deterrence' | 'expeditionary' | 'asymmetric';
  veterancy: number; // 0-100
  /**
   * How the defence budget is split between branches, 0–2 each.
   *
   * These are weights, not extra money: raising one branch's share pulls
   * capability out of the others unless the whole budget goes up too.
   */
  branchFunding: Record<MilitaryBranch, number>;
  /** Progress toward an indigenous warhead, 0–100. Only runs when funded. */
  nuclearProgramme: number;
  /** Whether the weapons programme is currently funded. */
  nuclearProgrammeActive: boolean;
}

export type MilitaryBranch = 'army' | 'navy' | 'airForce' | 'cyber' | 'space';

/** One technology being worked on in a research slot. */
export interface ResearchProject {
  techId: string;
  /** Points accumulated toward this technology's cost. */
  progress: number;
  /** Share of monthly output directed here. Normalised across active slots. */
  priority: number;
}

export interface ResearchState {
  /** Banked points. Output with nowhere to go accrues here and can be spent. */
  points: number;
  /** Points produced per month. */
  perMonth: number;
  completed: string[];
  /**
   * Mirror of `active[0]`, maintained by the engine.
   *
   * Kept because a great deal of the game reads "what are we researching" as a
   * single value, and because it lets a save written before parallel research
   * existed load without a special case.
   */
  current: string | null;
  /** Progress toward `current`. Mirror of `active[0].progress`. */
  progress: number;
  /** Every project currently under way, one per occupied slot. */
  active: ResearchProject[];
  /** Technologies queued to start automatically as slots free up. */
  queue: string[];
  /**
   * Concurrent research slots unlocked beyond the first. Raised by technology,
   * policy and buildings — see `researchCapacity`.
   */
  bonusSlots: number;
}

export interface IntelligenceState {
  capability: number; // 0-100
  /** Ongoing covert ops. */
  activeOps: CovertOp[];
  /** Counter-intelligence rating. */
  counterIntel: number;
  networkCountries: string[];
  /**
   * How much you know about each nation, 0–100, keyed by country id.
   *
   * Low coverage hides a rival's true military strength and intentions behind
   * an estimate; high coverage shows you the real numbers and warns you before
   * they move against you.
   */
  dossiers: Record<string, number>;
}

export interface CovertOp {
  id: string;
  type: 'espionage' | 'sabotage' | 'propaganda' | 'coup' | 'cyberattack' | 'assassination';
  targetId: string;
  turnsRemaining: number;
  successChance: number;
  cost: number;
  label: string;
}

export interface ConstructionProject {
  instanceId: string;
  buildingId: string;
  turnsRemaining: number;
  totalTurns: number;
}

export interface ActiveModifier {
  id: string;
  label: string;
  source: string;
  modifiers: Modifiers;
  /** Remaining months; Infinity for permanent. */
  monthsRemaining: number;
  icon?: string;
}

export interface HistoryPoint {
  turn: number;
  year: number;
  month: number;
  gdp: number;
  gdpPerCapita: number;
  population: number;
  approval: number;
  stability: number;
  treasury: number;
  debt: number;
  unemployment: number;
  inflation: number;
  happiness: number;
  emissions: number;
  militaryStrength: number;
  score: number;
  /** Banked political capital, so the chronicle can chart it. */
  politicalCapital: number;
  /** Research output per month at this point. */
  research: number;
}

export interface LogEntry {
  id: string;
  turn: number;
  year: number;
  month: number;
  text: string;
  category:
    | EventCategory
    | 'system'
    | 'policy'
    | 'build'
    | 'research'
    | 'election'
    | 'crisis'
    | 'faction'
    | 'world';
  tone: 'good' | 'bad' | 'neutral' | 'critical';
  icon?: string;
}

export interface PendingEvent {
  defId: string;
  turn: number;
}

/**
 * The panels a recommendation can point at.
 *
 * Declared here rather than in the UI store so the engine can reference a
 * destination without importing anything from React — the store's `PanelId`
 * is derived from this, so the two can never drift apart.
 */
export type PanelTarget =
  | 'dashboard'
  | 'economy'
  | 'budget'
  | 'policies'
  | 'decrees'
  | 'research'
  | 'construction'
  | 'society'
  | 'environment'
  | 'military'
  | 'diplomacy'
  | 'trade'
  | 'intelligence'
  | 'provinces'
  | 'politics'
  | 'cabinet'
  | 'objectives'
  | 'achievements'
  | 'history'
  | 'crises'
  | 'factions'
  | 'world';

export interface GameSettings {
  difficulty: DifficultyId;
  era: EraId;
  victoryGoal: VictoryGoalId;
  /** Months per real-time tick when auto-playing. */
  autoSpeed: 1 | 2 | 3;
  eventFrequency: 'low' | 'normal' | 'high' | 'chaos';
  enableWars: boolean;
  enableDisasters: boolean;
  ironman: boolean;
  /**
   * Eternal mode: disables every loss condition (bankruptcy, collapse, forced
   * removal, depopulation) and the 100-year cap. Victory goals still register
   * as achieved — logged and celebrated — but never end the campaign, so play
   * can continue indefinitely.
   */
  neverEndGame: boolean;
  startYear: number;
  mapSeed: number;
}

export interface GameState {
  /** Schema version — used to reject/migrate stale cloud saves. */
  version: number;
  id: string;
  createdAt: number;
  updatedAt: number;

  turn: number; // months elapsed since start
  year: number;
  month: number; // 1-12

  identity: NationIdentity;
  leader: Leader;
  settings: GameSettings;

  economy: EconomyState;
  society: SocietyState;
  environment: EnvironmentState;
  energy: EnergyState;
  military: MilitaryState;
  research: ResearchState;
  intelligence: IntelligenceState;

  /** 0–100 headline governance indices. */
  approval: number;
  stability: number;
  corruption: number;
  infrastructure: number;

  taxes: Record<TaxKey, number>;
  budget: Record<BudgetDept, BudgetLine>;

  activePolicies: string[];
  buildings: Record<string, number>;
  construction: ConstructionProject[];
  provinces: Province[];
  parties: PoliticalParty[];
  /** Months until the next election; -1 when none scheduled. */
  monthsToElection: number;
  termsServed: number;

  nations: ForeignNation[];
  treaties: Treaty[];
  tradeAgreements: TradeAgreement[];
  wars: War[];
  orgs: OrgId[];
  /** Wars between AI nations that the player is not (yet) part of. */
  foreignWars: ForeignWar[];
  /** Unsolicited proposals awaiting the player's answer. */
  offers: DiplomaticOffer[];

  governance: GovernanceState;
  factions: FactionState[];
  crises: ActiveCrisis[];
  /** crisisId -> turn it last ended, for cooldowns. */
  crisisCooldowns: Record<string, number>;
  agenda: ActiveAgenda | null;
  /** Agenda ids completed successfully, for the record. */
  agendasCompleted: string[];
  world: WorldState;

  advisors: string[];
  resources: Record<ResourceId, ResourceHolding>;
  /** World commodity prices as a multiplier on base price. */
  worldPrices: Record<ResourceId, number>;

  activeModifiers: ActiveModifier[];
  achievements: string[];
  /** defId -> turn it last fired. */
  eventCooldowns: Record<string, number>;
  /** decreeId -> turn it was last enacted. */
  decreeCooldowns: Record<string, number>;
  /** Events queued to be shown to the player. */
  eventQueue: PendingEvent[];
  /** Ids unlocked by a previous event's chain. */
  chainedEvents: string[];

  history: HistoryPoint[];
  log: LogEntry[];

  score: number;
  /** Best-ever values, for the chronicle and the results screen. */
  records: {
    peakGdp: number;
    peakScore: number;
    peakApproval: number;
    peakPopulation: number;
    lowestCorruption: number;
    warsWon: number;
    warsLost: number;
    crisesResolved: number;
    eventsResolved: number;
  };
  /**
   * Victory goals already satisfied. In eternal mode a campaign can rack up
   * several; in normal mode the first one ends the run.
   */
  victoriesAchieved: VictoryGoalId[];
  gameOver: null | { reason: string; victory: boolean; turn: number; title: string };
  /** Random seed, advanced deterministically each tick. */
  rngSeed: number;
}

export interface ResourceHolding {
  /** Extraction capacity, arbitrary units/month. */
  production: number;
  /** Domestic consumption units/month. */
  consumption: number;
  /** Stockpile in units. */
  stockpile: number;
  /** 0–100 known reserves remaining. */
  reserves: number;
}

/* ------------------------------------------------------------------ */
/* Setup payload                                                       */
/* ------------------------------------------------------------------ */

export interface SetupConfig {
  mode: 'real' | 'custom';
  countryId: string | null;
  nationName: string;
  adjective: string;
  capital: string;
  motto: string;
  region: RegionId;
  iso2: string;
  customFlag: CustomFlag | null;
  currencyCode: string;
  government: GovernmentTypeId;
  ideology: IdeologyId;
  leaderName: string;
  leaderTitle: string;
  leaderAge: number;
  portrait: string;
  traits: TraitId[];
  difficulty: DifficultyId;
  era: EraId;
  victoryGoal: VictoryGoalId;
  doctrine: MilitaryState['doctrine'];
  eventFrequency: GameSettings['eventFrequency'];
  enableWars: boolean;
  enableDisasters: boolean;
  ironman: boolean;
  neverEndGame: boolean;
  primaryColor: string;
  secondaryColor: string;
  /** Custom-nation slider allocation. */
  startingFocus: Record<'economy' | 'military' | 'science' | 'welfare' | 'diplomacy', number>;
}
