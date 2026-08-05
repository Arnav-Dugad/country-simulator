import type { CrisisDef } from '../types';
import { debtToGdp, energyBalance, gdpPerCapita } from '../math';

/**
 * Crises.
 *
 * Events are a decision in a single month. A crisis is a *condition*: it opens
 * because the state genuinely reached the situation described, sits on the
 * country applying real monthly modifiers, escalates through stages if it is
 * ignored, and only goes away when the player spends money, political capital
 * or both on it.
 *
 * Every trigger below reads state the player can see somewhere else, so a
 * crisis is never a surprise — it is the bill for something that was already
 * visible on a dashboard.
 */
export const CRISES: CrisisDef[] = [
  /* ------------------------------- Economic ------------------------------- */
  {
    id: 'banking-crisis',
    name: 'Banking Crisis',
    icon: '🏦',
    category: 'economic',
    summary: 'Confidence in the banking system is going, and deposits are moving.',
    weight: 10,
    cooldown: 96,
    trigger: (s) =>
      s.turn > 18 &&
      s.economy.creditRating < 45 &&
      (s.economy.confidence < 34 || debtToGdp(s) > 130) &&
      s.economy.growth < 1.2,
    stages: [
      {
        label: 'Liquidity squeeze',
        months: 4,
        description:
          'Interbank lending has frozen. The banks are solvent on paper and cannot fund themselves in practice.',
        modifiers: { gdpGrowth: -0.63, taxEfficiency: -3, spendingEfficiency: -1.8 },
      },
      {
        label: 'Deposit flight',
        months: 5,
        description:
          'Queues outside branches. Every hour the state does not speak, another billion leaves the system.',
        modifiers: { gdpGrowth: -1.68, unemployment: 0.96, approval: -2.5, taxEfficiency: -7.2 },
      },
      {
        label: 'Systemic failure',
        months: 6,
        description:
          'Two major institutions have failed. Credit to the real economy has stopped entirely.',
        modifiers: { gdpGrowth: -3.15, unemployment: 2.04, approval: -5, stability: -2.7, taxEfficiency: -12 },
      },
    ],
    responses: [
      {
        id: 'deposit-guarantee',
        label: 'Guarantee all deposits',
        description:
          'A blanket state guarantee stops the run immediately and puts the whole banking system on the sovereign balance sheet.',
        cost: 32000,
        politicalCost: 18,
        severityRelief: 55,
        effects: { stability: 4, approval: 3 },
      },
      {
        id: 'recapitalise',
        label: 'Recapitalise the banks',
        description:
          'Take equity stakes in exchange for the money. Expensive, effective, and politically radioactive.',
        cost: 46000,
        politicalCost: 26,
        severityRelief: 75,
        effects: { approval: -6, inequality: 3 },
      },
      {
        id: 'let-them-fail',
        label: 'Let the weakest fail',
        description:
          'Resolve the insolvent institutions and protect only insured depositors. Cheap, principled, and a gamble on contagion.',
        cost: 4000,
        politicalCost: 12,
        severityRelief: 40,
        riskChance: 0.42,
        effects: { approval: -3, unemployment: 0.8 },
      },
    ],
    climax: { gdpShock: -4.2, approval: -7.2, stability: -5.5, unemployment: 1.8 },
    chains: [
      {
        crisisId: 'debt-crisis',
        chance: 0.45,
        because: 'The rescue was paid for with borrowed money, and the market has noticed.',
      },
      {
        crisisId: 'legitimacy-crisis',
        chance: 0.3,
        because: 'Nobody has been prosecuted, and everybody knows who was made whole.',
      },
    ],
  },
  {
    id: 'inflation-spiral',
    name: 'Inflation Spiral',
    icon: '📈',
    category: 'economic',
    summary: 'Prices and wages have started chasing each other and expectations have come unmoored.',
    weight: 11,
    cooldown: 84,
    trigger: (s) => s.turn > 12 && s.economy.inflation > 13,
    stages: [
      {
        label: 'Expectations slipping',
        months: 5,
        description: 'Wage settlements are being written on the assumption that this continues.',
        modifiers: { inflation: 0.84, happiness: -2.2, approval: -1.5 },
      },
      {
        label: 'Wage-price spiral',
        months: 6,
        description: 'Indexation is spreading through contracts. Each round validates the next.',
        modifiers: { inflation: 1.92, gdpGrowth: -0.84, happiness: -4.4, approval: -3, stability: -1.35 },
      },
      {
        label: 'Currency crisis',
        months: 6,
        description: 'Savings are moving into anything that is not the national currency.',
        modifiers: { inflation: 3.6, gdpGrowth: -1.96, approval: -5, stability: -3.15, tradeIncome: -9.8 },
      },
    ],
    responses: [
      {
        id: 'shock-tightening',
        label: 'Shock monetary tightening',
        description:
          'Order the policy rate far above inflation and hold it there. It works. It also causes a recession.',
        cost: 1200,
        politicalCost: 22,
        severityRelief: 65,
        effects: { unemployment: 2.2, approval: -8, inflation: -6 },
      },
      {
        id: 'incomes-accord',
        label: 'Negotiate an incomes accord',
        description:
          'Bring unions and employers into a public agreement to break indexation together.',
        cost: 6800,
        politicalCost: 30,
        severityRelief: 60,
        riskChance: 0.3,
        effects: { inflation: -4, happiness: 3, stability: 3 },
      },
      {
        id: 'fx-intervention',
        label: 'Defend the currency with reserves',
        description: 'Sell reserves into the market to hold the rate. Buys weeks, not years.',
        cost: 24000,
        politicalCost: 8,
        severityRelief: 32,
        effects: { inflation: -2 },
      },
    ],
    climax: { inflation: 11, gdpShock: -3.6, approval: -8.4, stability: -4.95 },
    chains: [
      {
        crisisId: 'legitimacy-crisis',
        chance: 0.35,
        because: 'Wages have not moved in two years. The street has drawn its own conclusion.',
      },
    ],
  },
  {
    id: 'debt-crisis',
    name: 'Sovereign Debt Crisis',
    icon: '📉',
    category: 'economic',
    summary: 'The market has stopped believing the debt can be serviced at any price you can pay.',
    weight: 9,
    cooldown: 120,
    trigger: (s) => debtToGdp(s) > 160 && s.economy.creditRating < 38,
    stages: [
      {
        label: 'Spreads widening',
        months: 5,
        description: 'Each auction clears at a worse yield than the last.',
        modifiers: { spendingEfficiency: -3, gdpGrowth: -0.42 },
      },
      {
        label: 'Failed auction',
        months: 5,
        description: 'A scheduled issuance did not find buyers. The ministry is now funding week to week.',
        modifiers: { spendingEfficiency: -7.2, gdpGrowth: -1.26, approval: -3, stability: -1.8 },
      },
      {
        label: 'Market closure',
        months: 6,
        description: 'No one will lend at any rate. Everything now depends on what can be raised domestically.',
        modifiers: { spendingEfficiency: -13.2, gdpGrowth: -2.38, approval: -5, stability: -4.05 },
      },
    ],
    responses: [
      {
        id: 'fiscal-consolidation',
        label: 'Announce a credible consolidation',
        description: 'A multi-year plan with numbers in it. The market wants a schedule, not a speech.',
        cost: 2000,
        politicalCost: 34,
        severityRelief: 58,
        effects: { approval: -9, happiness: -5, unemployment: 1.2 },
      },
      {
        id: 'imf-programme',
        label: 'Request an assistance programme',
        description:
          'Funding arrives quickly and so do the conditions, which you will not get to negotiate.',
        cost: 0,
        politicalCost: 26,
        severityRelief: 72,
        effects: { approval: -12, stability: -3, softPower: -8 },
      },
      {
        id: 'domestic-issuance',
        label: 'Force domestic institutions to buy',
        description:
          'Direct the pension funds and banks to hold sovereign paper. Solves this month, deepens the next crisis.',
        cost: 0,
        politicalCost: 16,
        severityRelief: 36,
        effects: { corruption: 3, inequality: 2 },
      },
    ],
    climax: { gdpShock: -5.4, approval: -9.6, stability: -6.6 },
    chains: [
      {
        crisisId: 'banking-crisis',
        chance: 0.4,
        because: 'The banks were holding the paper. The write-down went straight through their capital.',
      },
    ],
  },

  /* ------------------------------- Political ------------------------------ */
  {
    id: 'legitimacy-crisis',
    name: 'Legitimacy Crisis',
    icon: '🪧',
    category: 'political',
    summary: 'Sustained mass protest. The question has stopped being policy and started being you.',
    weight: 12,
    cooldown: 72,
    trigger: (s) => s.turn > 12 && s.approval < 26 && s.stability < 46,
    stages: [
      {
        label: 'Mass demonstrations',
        months: 4,
        description: 'Weekly marches in every major city, and they are growing.',
        modifiers: { stability: -2.25, approval: -1.5, gdpGrowth: -0.28 },
      },
      {
        label: 'General strike',
        months: 5,
        description: 'The unions have joined. Transport, ports and schools are shut.',
        modifiers: { stability: -4.95, gdpGrowth: -1.54, approval: -3, taxEfficiency: -6 },
      },
      {
        label: 'Institutional breakdown',
        months: 5,
        description: 'The provinces have stopped taking calls from the capital.',
        modifiers: { stability: -9, gdpGrowth: -2.52, approval: -5, corruption: 3, spendingEfficiency: -8.4 },
      },
    ],
    responses: [
      {
        id: 'concessions',
        label: 'Concede on the central demand',
        description: 'Give them the thing they are actually asking for. It costs you, and it works.',
        cost: 14000,
        politicalCost: 30,
        severityRelief: 68,
        effects: { approval: 8, stability: 6, happiness: 5 },
      },
      {
        id: 'national-dialogue',
        label: 'Convene a national dialogue',
        description:
          'A televised, open-ended process with the opposition at the table. Slow, and it defuses things.',
        cost: 3400,
        politicalCost: 20,
        severityRelief: 50,
        riskChance: 0.25,
        effects: { approval: 4, civilLiberties: 4, stability: 4 },
      },
      {
        id: 'restore-order',
        label: 'Restore order by force',
        description:
          'Clear the squares. It ends the demonstrations and it is remembered for a generation.',
        cost: 5200,
        politicalCost: 14,
        severityRelief: 62,
        requires: { minMilitary: 25 },
        effects: { stability: 8, civilLiberties: -14, approval: -9, softPower: -12, crime: 4 },
      },
    ],
    climax: { approval: -10.8, stability: -12.1, civilLiberties: -5.6, gdpShock: -2.4 },
    chains: [
      {
        crisisId: 'insurgency',
        chance: 0.28,
        because: 'The people who stopped believing in the ballot did not all go home.',
      },
      {
        crisisId: 'secession-movement',
        chance: 0.24,
        because: 'If the centre has no claim to govern, the provinces will make their own.',
      },
    ],
  },
  {
    id: 'corruption-scandal',
    name: 'Corruption Scandal',
    icon: '🗞️',
    category: 'political',
    summary: 'Documents are in the press and they lead into the building you work in.',
    weight: 11,
    cooldown: 60,
    trigger: (s) => s.turn > 10 && s.corruption > 58 && s.society.civilLiberties > 30,
    stages: [
      {
        label: 'The first story',
        months: 3,
        description: 'One ministry, one contract, one journalist who has more.',
        modifiers: { approval: -2, corruption: 0.5 },
      },
      {
        label: 'It reaches the cabinet',
        months: 4,
        description: 'A minister has resigned and named two more on the way out.',
        modifiers: { approval: -4.5, stability: -2.25, taxEfficiency: -3.6, corruption: 1 },
      },
      {
        label: 'Systemic exposure',
        months: 4,
        description: 'The procurement system itself is now the story. Nothing the state buys is trusted.',
        modifiers: { approval: -7, stability: -4.05, spendingEfficiency: -7.2, softPower: -8 },
      },
    ],
    responses: [
      {
        id: 'independent-inquiry',
        label: 'Establish an independent inquiry',
        description: 'Judicial, published, and genuinely outside your control. That is the whole point.',
        cost: 2200,
        politicalCost: 22,
        severityRelief: 66,
        effects: { corruption: -8, approval: 3, civilLiberties: 4 },
      },
      {
        id: 'sack-the-minister',
        label: 'Sack those named and move on',
        description: 'Fast, cheap, and it works exactly as long as no one has the next document.',
        cost: 400,
        politicalCost: 8,
        severityRelief: 34,
        riskChance: 0.4,
        effects: { approval: 2 },
      },
      {
        id: 'suppress-story',
        label: 'Lean on the outlets',
        description:
          'Regulatory pressure and quiet calls. It ends the coverage and everyone knows why it ended.',
        cost: 1800,
        politicalCost: 18,
        severityRelief: 48,
        effects: { civilLiberties: -10, softPower: -8, corruption: 4 },
      },
    ],
    climax: { approval: -8.4, corruption: 4.8, stability: -4.4, softPower: -7 },
    chains: [
      {
        crisisId: 'legitimacy-crisis',
        chance: 0.42,
        because: 'It was never about the one minister, and the cover-up proved it.',
      },
    ],
  },
  {
    id: 'secession-movement',
    name: 'Secession Movement',
    icon: '🗺️',
    category: 'political',
    summary: 'A province has begun the machinery of leaving.',
    weight: 8,
    cooldown: 120,
    trigger: (s) => s.provinces.some((p) => p.separatism > 62),
    stages: [
      {
        label: 'Referendum called',
        months: 6,
        description: 'The provincial assembly has voted to hold one. The capital says it is not lawful.',
        modifiers: { stability: -2.7, gdpGrowth: -0.35, approval: -1 },
      },
      {
        label: 'Parallel administration',
        months: 6,
        description: 'They are collecting their own taxes and appointing their own officials.',
        modifiers: { stability: -5.85, taxEfficiency: -6, gdpGrowth: -1.12, approval: -2.5 },
      },
      {
        label: 'Declaration',
        months: 6,
        description: 'Independence has been declared. What happens next is a decision, not a process.',
        modifiers: { stability: -9.9, taxEfficiency: -10.8, gdpGrowth: -2.24, approval: -4.5, softPower: -6 },
      },
    ],
    responses: [
      {
        id: 'devolution-settlement',
        label: 'Offer a devolution settlement',
        description: 'Real powers, real money, in exchange for staying. The expensive answer that lasts.',
        cost: 18000,
        politicalCost: 32,
        severityRelief: 72,
        effects: { stability: 5, approval: -4, happiness: 3 },
      },
      {
        id: 'legal-challenge',
        label: 'Take it to the constitutional court',
        description: 'Fight it on the law. Slow, legitimate, and it does not address the grievance.',
        cost: 1600,
        politicalCost: 12,
        severityRelief: 38,
        riskChance: 0.35,
        effects: { stability: 2 },
      },
      {
        id: 'direct-rule',
        label: 'Impose direct rule',
        description: 'Suspend the provincial assembly and govern it from the capital.',
        cost: 7400,
        politicalCost: 26,
        severityRelief: 58,
        requires: { minMilitary: 30 },
        effects: { stability: 4, civilLiberties: -12, softPower: -10, approval: -5 },
      },
    ],
    climax: { stability: -11, gdpShock: -3.6, approval: -6, softPower: -8.4 },
    chains: [
      {
        crisisId: 'insurgency',
        chance: 0.3,
        because: 'A political movement denied a political route acquires an armed wing.',
      },
    ],
  },

  /* -------------------------------- Health -------------------------------- */
  {
    id: 'epidemic',
    name: 'Epidemic',
    icon: '🦠',
    category: 'health',
    summary: 'A novel pathogen is spreading faster than the health system can trace it.',
    weight: 10,
    cooldown: 96,
    trigger: (s) => s.turn > 8 && s.society.health < 58 && s.society.urbanisation > 40,
    stages: [
      {
        label: 'Local outbreak',
        months: 3,
        description: 'Contained to two cities, and the contact tracing is already behind.',
        modifiers: { health: -2.2, happiness: -1.65, gdpGrowth: -0.28 },
      },
      {
        label: 'National spread',
        months: 5,
        description: 'Every province is reporting. Hospitals are cancelling everything else.',
        modifiers: { health: -6.6, happiness: -4.95, gdpGrowth: -1.68, approval: -3, unemployment: 0.84 },
      },
      {
        label: 'Health system overwhelmed',
        months: 5,
        description: 'Triage has become explicit policy. Excess mortality is the only honest measure left.',
        modifiers: { health: -12.1, happiness: -8.8, gdpGrowth: -2.8, approval: -6, stability: -2.7 },
      },
    ],
    responses: [
      {
        id: 'surge-capacity',
        label: 'Fund emergency health capacity',
        description: 'Field hospitals, imported staff, and whatever the supply chain will sell you.',
        cost: 26000,
        politicalCost: 10,
        severityRelief: 62,
        effects: { health: 8, approval: 4 },
      },
      {
        id: 'lockdown',
        label: 'Impose movement restrictions',
        description: 'It works on transmission and it takes the economy with it.',
        cost: 6000,
        politicalCost: 24,
        severityRelief: 70,
        effects: { gdpShock: -2.5, civilLiberties: -8, happiness: -6, unemployment: 1.5 },
      },
      {
        id: 'vaccine-programme',
        label: 'Crash vaccine programme',
        description: 'Buy the platform, build the fill-finish, and hope the biology cooperates.',
        cost: 34000,
        politicalCost: 14,
        severityRelief: 88,
        requires: { tech: ['biotechnology'] },
        effects: { health: 12, softPower: 6, approval: 6 },
      },
    ],
    climax: { population: -540000, health: -8.4, happiness: -7.2, gdpShock: -3, approval: -6 },
    chains: [
      {
        crisisId: 'debt-crisis',
        chance: 0.32,
        because: 'The emergency was financed at any price. The bill has now arrived.',
      },
    ],
  },

  /* ----------------------------- Environmental ---------------------------- */
  {
    id: 'water-crisis',
    name: 'Water Crisis',
    icon: '🚱',
    category: 'environmental',
    summary: 'The reservoirs are below the level at which rationing stops being optional.',
    weight: 9,
    cooldown: 84,
    trigger: (s) => s.environment.waterStress > 74 && s.society.population > 3_000_000,
    stages: [
      {
        label: 'Rationing begins',
        months: 5,
        description: 'Supply is on a timetable in the major cities.',
        modifiers: { happiness: -2.75, health: -1.65, gdpGrowth: -0.35 },
      },
      {
        label: 'Agricultural failure',
        months: 6,
        description: 'The irrigated belt has been abandoned for the season. Food prices are following.',
        modifiers: { happiness: -5.5, health: -3.85, inflation: 1.32, gdpGrowth: -1.26, stability: -2.25 },
      },
      {
        label: 'Day zero',
        months: 5,
        description: 'The mains will be shut off in the capital. There is no scenario in which this is fine.',
        modifiers: { happiness: -9.9, health: -7.7, stability: -6.3, gdpGrowth: -2.38, crime: 4 },
      },
    ],
    responses: [
      {
        id: 'emergency-desalination',
        label: 'Emergency desalination and transfer',
        description: 'Barge-mounted plants and a pipeline built at wartime speed.',
        cost: 28000,
        politicalCost: 8,
        severityRelief: 70,
        requires: { tech: ['desalination'] },
        effects: { health: 5, happiness: 4 },
      },
      {
        id: 'water-rationing',
        label: 'Enforce strict allocation',
        description: 'Industry and agriculture cut first, households last. Unpopular with everyone.',
        cost: 2400,
        politicalCost: 18,
        severityRelief: 52,
        effects: { gdpShock: -1.6, happiness: -4, stability: 3 },
      },
      {
        id: 'aquifer-drilling',
        label: 'Drill the deep aquifers',
        description: 'Fast, cheap, and it borrows the water from a generation that cannot object.',
        cost: 9000,
        politicalCost: 6,
        severityRelief: 46,
        riskChance: 0.3,
        effects: { happiness: 3 },
      },
    ],
    climax: { happiness: -9.6, health: -7.2, stability: -7.7, population: -144000 },
    chains: [
      {
        crisisId: 'epidemic',
        chance: 0.34,
        because: 'Untreated water and displaced people are how a waterborne outbreak begins.',
      },
      {
        crisisId: 'insurgency',
        chance: 0.2,
        because: 'Where the wells fail, whoever controls the water controls the district.',
      },
    ],
  },
  {
    id: 'energy-emergency',
    name: 'Energy Emergency',
    icon: '🔌',
    category: 'environmental',
    summary: 'The grid cannot meet demand and load-shedding has become routine.',
    weight: 12,
    cooldown: 60,
    trigger: (s) => energyBalance(s) < 0.9 && s.turn > 6,
    stages: [
      {
        label: 'Rolling blackouts',
        months: 4,
        description: 'Scheduled outages by district. Industry is running on generators.',
        modifiers: { gdpGrowth: -0.98, happiness: -2.75, approval: -2 },
      },
      {
        label: 'Industrial curtailment',
        months: 5,
        description: 'Heavy users have been ordered off the grid to keep the hospitals lit.',
        modifiers: { gdpGrowth: -2.24, unemployment: 1.08, happiness: -4.95, approval: -3.5, inflation: 0.96 },
      },
      {
        label: 'Grid collapse risk',
        months: 5,
        description: 'Frequency excursions are now a daily event. A black start would take weeks.',
        modifiers: { gdpGrowth: -3.5, unemployment: 1.8, happiness: -7.7, approval: -5.5, stability: -3.6 },
      },
    ],
    responses: [
      {
        id: 'emergency-generation',
        label: 'Lease emergency generation',
        description: 'Powership contracts and open-cycle turbines. Instant, filthy and expensive.',
        cost: 16000,
        politicalCost: 6,
        severityRelief: 58,
        effects: { emissions: 8 },
      },
      {
        id: 'import-power',
        label: 'Buy power from neighbours',
        description: 'Interconnector capacity at whatever the neighbours decide it is worth today.',
        cost: 11000,
        politicalCost: 12,
        severityRelief: 46,
        effects: { globalRelations: 2 },
      },
      {
        id: 'demand-management',
        label: 'Mandate demand reduction',
        description: 'Statutory efficiency orders and industrial interruptibility contracts.',
        cost: 3800,
        politicalCost: 16,
        severityRelief: 40,
        effects: { gdpShock: -1, happiness: -4 },
      },
    ],
    climax: { gdpShock: -3.6, approval: -7.2, stability: -5.5, happiness: -6 },
    chains: [
      {
        crisisId: 'inflation-spiral',
        chance: 0.4,
        because: 'Energy is an input to everything, and everything has repriced.',
      },
    ],
  },

  /* ------------------------------- Security ------------------------------- */
  {
    id: 'insurgency',
    name: 'Armed Insurgency',
    icon: '💥',
    category: 'security',
    summary: 'An organised armed group is contesting control of territory.',
    weight: 8,
    cooldown: 108,
    trigger: (s) =>
      s.turn > 18 &&
      s.stability < 38 &&
      s.provinces.some((p) => p.unrest > 68) &&
      s.society.crime > 50,
    stages: [
      {
        label: 'Rural attacks',
        months: 5,
        description: 'Police posts and infrastructure, in the districts furthest from the capital.',
        modifiers: { stability: -2.7, gdpGrowth: -0.56, crime: 2.5 },
      },
      {
        label: 'Territorial control',
        months: 6,
        description: 'They administer two districts. The state visits by helicopter or not at all.',
        modifiers: { stability: -6.3, gdpGrowth: -1.68, crime: 5, taxEfficiency: -7.2, approval: -3 },
      },
      {
        label: 'Civil conflict',
        months: 6,
        description: 'The fighting has reached provincial capitals and the army is fully committed.',
        modifiers: { stability: -10.8, gdpGrowth: -3.08, crime: 8, approval: -6, militaryPower: -4.8 },
      },
    ],
    responses: [
      {
        id: 'counter-insurgency',
        label: 'Full counter-insurgency campaign',
        description: 'Clear, hold, build — and accept that the holding is the part that takes years.',
        cost: 22000,
        politicalCost: 20,
        severityRelief: 62,
        requires: { minMilitary: 35 },
        effects: { stability: 5, civilLiberties: -8, crime: -6 },
      },
      {
        id: 'negotiated-settlement',
        label: 'Negotiate a settlement',
        description: 'Amnesty, political representation and a disarmament timetable. Bitterly unpopular.',
        cost: 9000,
        politicalCost: 34,
        severityRelief: 74,
        riskChance: 0.28,
        effects: { stability: 8, approval: -8, crime: -4 },
      },
      {
        id: 'development-surge',
        label: 'Flood the region with development',
        description: 'Roads, clinics, jobs. It addresses the cause and it is slow.',
        cost: 20000,
        politicalCost: 12,
        severityRelief: 48,
        effects: { infrastructure: 4, happiness: 4, stability: 3 },
      },
    ],
    climax: { stability: -12.1, approval: -7.2, population: -192000, gdpShock: -4.2 },
    chains: [
      {
        crisisId: 'secession-movement',
        chance: 0.3,
        because: 'Territory held for three years starts calling itself a country.',
      },
    ],
  },

  /* -------------------------------- Social -------------------------------- */
  {
    id: 'brain-drain',
    name: 'Brain Drain',
    icon: '✈️',
    category: 'social',
    summary: 'The people you educated are leaving, and the ones leaving are the best of them.',
    weight: 9,
    cooldown: 72,
    trigger: (s) =>
      s.turn > 24 &&
      s.society.netMigration < -3 &&
      s.society.education > 45 &&
      gdpPerCapita(s) < 30000,
    stages: [
      {
        label: 'Graduate outflow',
        months: 6,
        description: 'Two thirds of this year’s medical cohort have already accepted posts abroad.',
        modifiers: { research: -4.8, health: -1.65, gdpGrowth: -0.28 },
      },
      {
        label: 'Professional exodus',
        months: 7,
        description: 'The teaching hospitals and the engineering firms cannot fill vacancies at any salary.',
        modifiers: { research: -10.8, health: -4.4, education: -3.3, gdpGrowth: -0.98, happiness: -2.75 },
      },
      {
        label: 'Institutional hollowing',
        months: 8,
        description: 'The institutions still exist. The people who made them work do not.',
        modifiers: { research: -18, health: -7.7, education: -6.6, gdpGrowth: -1.82, corruption: 2.5 },
      },
    ],
    responses: [
      {
        id: 'retention-package',
        label: 'Fund a national retention package',
        description: 'Competitive public salaries, research grants and housing for the professions.',
        cost: 19000,
        politicalCost: 16,
        severityRelief: 64,
        effects: { education: 4, health: 4, happiness: 3 },
      },
      {
        id: 'diaspora-programme',
        label: 'Court the diaspora home',
        description: 'Tax holidays, recognition of foreign credentials, and a serious embassy effort.',
        cost: 7600,
        politicalCost: 10,
        severityRelief: 44,
        riskChance: 0.3,
        effects: { softPower: 4, research: 5 },
      },
      {
        id: 'exit-restrictions',
        label: 'Restrict professional emigration',
        description: 'Bonding, exit permits and licence conditions. It works, at a price.',
        cost: 1400,
        politicalCost: 26,
        severityRelief: 56,
        effects: { civilLiberties: -14, happiness: -8, softPower: -10 },
      },
    ],
    climax: { research: -12, education: -6, health: -6, gdpShock: -2.4 },
    chains: [
      {
        crisisId: 'legitimacy-crisis',
        chance: 0.18,
        because: 'A country whose professionals have left is not governed by consent so much as by inertia.',
      },
    ],
  },
];

export const CRISIS_INDEX = Object.fromEntries(CRISES.map((c) => [c.id, c])) as Record<
  string,
  CrisisDef
>;

export const CRISIS_CATEGORY_LABELS: Record<CrisisDef['category'], string> = {
  economic: 'Economic',
  political: 'Political',
  security: 'Security',
  health: 'Public Health',
  environmental: 'Environmental',
  social: 'Social',
};
