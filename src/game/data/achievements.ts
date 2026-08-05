import type { Achievement } from '../types';
import { averageRelations, debtToGdp, gdpPerCapita, renewableShare, totalEnergyProduction } from '../selectors';
import { TECHNOLOGIES } from './technologies';


const TIER5 = TECHNOLOGIES.filter((t) => t.tier === 5).map((t) => t.id);

export const ACHIEVEMENTS: Achievement[] = [
  /* ------------------------------- Bronze -------------------------------- */
  { id: 'first-term', name: 'First Term', icon: '🎗️', tier: 'bronze', points: 10,
    description: 'Survive your first four years in office.',
    check: (s) => s.turn >= 48 },
  { id: 'balanced-books', name: 'Balanced Books', icon: '⚖️', tier: 'bronze', points: 15,
    description: 'Hold public debt below 40% of GDP.',
    check: (s) => s.turn > 12 && debtToGdp(s) < 40 },
  { id: 'first-policy', name: 'Order of Business', icon: '📜', tier: 'bronze', points: 5,
    description: 'Enact five policies.',
    check: (s) => s.activePolicies.length >= 5 },
  { id: 'first-building', name: 'Groundbreaking', icon: '🏗️', tier: 'bronze', points: 5,
    description: 'Complete your first construction project.',
    check: (s) => Object.values(s.buildings).some((v) => v > 0) },
  { id: 'popular-mandate', name: 'Popular Mandate', icon: '📈', tier: 'bronze', points: 15,
    description: 'Reach 75% approval.',
    check: (s) => s.approval >= 75 },
  { id: 'literate-nation', name: 'Every Child Reading', icon: '📚', tier: 'bronze', points: 15,
    description: 'Reach 95% literacy.',
    check: (s) => s.society.literacy >= 95 },
  { id: 'lights-on', name: 'Lights On', icon: '💡', tier: 'bronze', points: 10,
    description: 'Produce 20% more electricity than you consume.',
    check: (s) => totalEnergyProduction(s) > s.energy.demand * 1.2 },
  { id: 'diplomatic-opening', name: 'Diplomatic Opening', icon: '🤝', tier: 'bronze', points: 10,
    description: 'Sign five treaties.',
    check: (s) => s.treaties.length >= 5 },

  /* ------------------------------- Silver -------------------------------- */
  { id: 'full-employment', name: 'Full Employment', icon: '👷', tier: 'silver', points: 25,
    description: 'Drive unemployment below 3%.',
    check: (s) => s.economy.unemployment < 3 && s.turn > 24 },
  { id: 'clean-hands', name: 'Clean Hands', icon: '🧼', tier: 'silver', points: 30,
    description: 'Reduce corruption below 12.',
    check: (s) => s.corruption < 12 },
  { id: 'trillion-club', name: 'Trillion Dollar Club', icon: '💵', tier: 'silver', points: 25,
    description: 'Grow GDP past $1 trillion.',
    check: (s) => s.economy.gdp >= 1000 },
  { id: 'tech-power', name: 'Research Powerhouse', icon: '🔬', tier: 'silver', points: 30,
    description: 'Complete 20 technologies.',
    check: (s) => s.research.completed.length >= 20 },
  { id: 'green-majority', name: 'Green Majority', icon: '🌿', tier: 'silver', points: 30,
    description: 'Get more than half of your electricity from zero-carbon sources.',
    check: (s) => renewableShare(s) >= 50 },
  { id: 'well-liked', name: 'Well Liked', icon: '🌍', tier: 'silver', points: 25,
    description: 'Reach an average relations score above 40.',
    check: (s) => averageRelations(s) >= 40 },
  { id: 'healthy-nation', name: 'Healthy Nation', icon: '🩺', tier: 'silver', points: 25,
    description: 'Push life expectancy past 82 years.',
    check: (s) => s.society.lifeExpectancy >= 82 },
  { id: 'two-terms', name: 'Re-elected', icon: '🗳️', tier: 'silver', points: 30,
    description: 'Win a second term in office.',
    check: (s) => s.termsServed >= 2 },
  { id: 'club-member', name: 'Multilateralist', icon: '🏛️', tier: 'silver', points: 20,
    description: 'Join four international organisations.',
    check: (s) => s.orgs.length >= 4 },
  { id: 'safe-streets', name: 'Safe Streets', icon: '🛟', tier: 'silver', points: 25,
    description: 'Reduce the crime index below 10.',
    check: (s) => s.society.crime < 10 },

  /* -------------------------------- Gold --------------------------------- */
  { id: 'superpower-status', name: 'Superpower', icon: '⭐', tier: 'gold', points: 60,
    description: 'Reach military strength 90 with GDP above $8 trillion.',
    check: (s) => s.military.strength >= 90 && s.economy.gdp >= 8000 },
  { id: 'rich-nation', name: 'Gilded Age', icon: '👑', tier: 'gold', points: 55,
    description: 'Reach $85,000 GDP per capita.',
    check: (s) => gdpPerCapita(s) >= 85000 },
  { id: 'utopian', name: 'The Good Place', icon: '🌈', tier: 'gold', points: 65,
    description: 'Reach 90 happiness with inequality below 25.',
    check: (s) => s.society.happiness >= 90 && s.economy.inequality <= 25 },
  { id: 'carbon-neutral', name: 'Carbon Neutral', icon: '🍃', tier: 'gold', points: 60,
    description: 'Cut emissions below 50 megatonnes a year.',
    check: (s) => s.environment.emissions < 50 },
  { id: 'debt-free', name: 'Debt Free', icon: '🪙', tier: 'gold', points: 55,
    description: 'Eliminate public debt entirely.',
    check: (s) => s.economy.debt <= 0 },
  { id: 'space-power', name: 'Spacefaring Nation', icon: '🚀', tier: 'gold', points: 50,
    description: 'Complete the crewed space programme.',
    check: (s) => s.research.completed.includes('space-programme') },
  { id: 'cultural-icon', name: 'Cultural Icon', icon: '🎭', tier: 'gold', points: 50,
    description: 'Reach 90 soft power.',
    check: (s) => s.society.softPower >= 90 },
  { id: 'wonder-builder', name: 'Monument Builder', icon: '🗿', tier: 'gold', points: 55,
    description: 'Complete two wonders.',
    check: (s) =>
      ['wonder-arcology', 'wonder-genome-vault', 'wonder-solar-belt', 'wonder-peace-forum', 'wonder-orbital-ring']
        .filter((id) => (s.buildings[id] ?? 0) > 0).length >= 2 },
  { id: 'undefeated', name: 'Undefeated', icon: '🛡️', tier: 'gold', points: 50,
    description: 'Win three wars without ever losing one.',
    check: (s) =>
      s.wars.filter((w) => w.resolved === 'victory').length >= 3 &&
      !s.wars.some((w) => w.resolved === 'defeat') },
  { id: 'billion-strong', name: 'Billion Strong', icon: '👥', tier: 'gold', points: 45,
    description: 'Govern a population of more than one billion.',
    check: (s) => s.society.population >= 1e9 },

  /* ------------------------------ Platinum ------------------------------- */
  { id: 'singularity', name: 'Singularity', icon: '🧬', tier: 'platinum', points: 100,
    description: 'Research every tier-5 technology.',
    check: (s) => TIER5.every((id) => s.research.completed.includes(id)) },
  { id: 'half-century', name: 'Half a Century', icon: '🕰️', tier: 'platinum', points: 90,
    description: 'Govern continuously for fifty years.',
    check: (s) => s.turn >= 600 },
  { id: 'perfect-state', name: 'The Perfect State', icon: '💎', tier: 'platinum', points: 120,
    description: 'Hold stability, approval, happiness, health and education all above 90 at once.',
    check: (s) =>
      s.stability >= 90 && s.approval >= 90 && s.society.happiness >= 90 &&
      s.society.health >= 90 && s.society.education >= 90 },
  { id: 'world-leader', name: 'Leader of the Free World', icon: '🌐', tier: 'platinum', points: 100,
    description: 'Reach average relations above 60 while holding military strength above 80.',
    check: (s) => averageRelations(s) >= 60 && s.military.strength >= 80 },
  { id: 'against-all-odds', name: 'Against All Odds', icon: '🔥', tier: 'platinum', points: 150, hidden: true,
    description: 'Win on Doomsday Clock difficulty.',
    check: (s) => s.settings.difficulty === 'brutal' && s.gameOver?.victory === true },
  { id: 'phoenix', name: 'Phoenix', icon: '🐦‍🔥', tier: 'platinum', points: 110, hidden: true,
    description: 'Recover from below 15 stability to above 75.',
    check: (s) => s.stability >= 75 && s.history.some((h) => h.stability < 15) },

  /* -------------------------- Second wave ------------------------------- */
  { id: 'executive-hand', name: 'A Firm Hand', icon: '⚖️', tier: 'bronze', points: 15,
    description: 'Use five different executive actions.',
    check: (s) => Object.keys(s.decreeCooldowns).length >= 5 },
  { id: 'decree-master', name: 'Every Lever Pulled', icon: '🎚️', tier: 'gold', points: 55,
    description: 'Use twelve different executive actions in one campaign.',
    check: (s) => Object.keys(s.decreeCooldowns).length >= 12 },
  { id: 'pacifist', name: 'Not One Shot', icon: '🕊️', tier: 'gold', points: 60,
    description: 'Govern for forty years without ever going to war.',
    check: (s) => s.turn >= 480 && s.wars.length === 0 },
  { id: 'great-leveller', name: 'The Great Leveller', icon: '⚖️', tier: 'gold', points: 55,
    description: 'Reduce inequality below 20 while keeping GDP per capita above $30,000.',
    check: (s) => s.economy.inequality < 20 && gdpPerCapita(s) > 30000 },
  { id: 'open-society', name: 'Open Society', icon: '🔓', tier: 'silver', points: 30,
    description: 'Reach 95 civil liberties.',
    check: (s) => s.society.civilLiberties >= 95 },
  { id: 'fully-renewable', name: 'Nothing Burned', icon: '☀️', tier: 'platinum', points: 95,
    description: 'Run the grid entirely on zero-carbon sources.',
    check: (s) => renewableShare(s) >= 99 },
  { id: 'polymath-state', name: 'Polymath State', icon: '🧠', tier: 'gold', points: 50,
    description: 'Complete at least six technologies in every branch.',
    check: (s) => {
      const counts = new Map<string, number>();
      for (const id of s.research.completed) {
        const branch = TECHNOLOGIES.find((t) => t.id === id)?.branch;
        if (branch) counts.set(branch, (counts.get(branch) ?? 0) + 1);
      }
      const branches = new Set(TECHNOLOGIES.map((t) => t.branch));
      return [...branches].every((b) => (counts.get(b) ?? 0) >= 6);
    } },
  { id: 'diplomatic-corps', name: 'Diplomatic Corps', icon: '🤝', tier: 'silver', points: 30,
    description: 'Sign fifteen treaties.',
    check: (s) => s.treaties.length >= 15 },
  { id: 'no-enemies', name: 'Not a Single Enemy', icon: '🌍', tier: 'platinum', points: 90,
    description: 'Have positive relations with every nation on earth at once.',
    check: (s) => s.nations.length > 0 && s.nations.every((n) => n.relations > 0) },
  { id: 'eternal-steward', name: 'The Long Watch', icon: '♾️', tier: 'platinum', points: 100,
    description: 'Govern for a full century in eternal mode.',
    check: (s) => s.settings.neverEndGame && s.turn >= 1200 },
  { id: 'polymath-victor', name: 'Many Roads', icon: '🗺️', tier: 'platinum', points: 130, hidden: true,
    description: 'Achieve three different victory objectives in a single campaign.',
    check: (s) => s.victoriesAchieved.length >= 3 },
  { id: 'debt-free-superpower', name: 'Rich and Armed', icon: '💰', tier: 'gold', points: 60,
    description: 'Hold military strength above 85 with no public debt at all.',
    check: (s) => s.military.strength > 85 && s.economy.debt <= 0 },
  { id: 'centenarian-state', name: 'Long Lives', icon: '🧬', tier: 'gold', points: 55,
    description: 'Push life expectancy past 90 years.',
    check: (s) => s.society.lifeExpectancy >= 90 },
  { id: 'builder', name: 'Master Builder', icon: '🏗️', tier: 'silver', points: 30,
    description: 'Complete fifty construction projects.',
    check: (s) => Object.values(s.buildings).reduce((a, b) => a + b, 0) >= 50 },

  /* ------------------------- New systems (v5) ---------------------------- */
  { id: 'parallel-labs', name: 'Two Fronts of Knowledge', icon: '🔗', tier: 'silver', points: 25,
    description: 'Run two research programmes at the same time.',
    check: (s) => s.research.active.length >= 2 },
  { id: 'full-laboratories', name: 'The Whole Academy', icon: '🏛️', tier: 'gold', points: 65,
    description: 'Unlock every research slot and keep all five occupied.',
    check: (s) => s.research.active.length >= 5 },
  { id: 'coalition-builder', name: 'Coalition Builder', icon: '⚖️', tier: 'gold', points: 60,
    description: 'Hold every interest group above 65 satisfaction at once.',
    check: (s) => s.factions.length > 0 && s.factions.every((f) => f.satisfaction >= 65) },
  { id: 'crisis-manager', name: 'Crisis Manager', icon: '🧯', tier: 'gold', points: 55,
    description: 'Resolve five crises before they reach their final stage.',
    check: (s) => s.records.crisesResolved >= 5 },
  { id: 'unshakeable', name: 'Unshakeable', icon: '🛡️', tier: 'platinum', points: 90, hidden: true,
    description: 'Reach fifty years in office having never let a crisis run its full course.',
    check: (s) => s.turn >= 600 && s.records.crisesResolved >= 3 && s.crises.length === 0 },
  { id: 'planner', name: 'The Planner', icon: '🗓️', tier: 'gold', points: 60,
    description: 'Deliver three five-year plans.',
    check: (s) => s.agendasCompleted.length >= 3 },
  { id: 'total-mandate', name: 'Total Mandate', icon: '🗳️', tier: 'gold', points: 55,
    description: 'Hold a mandate above 85 with legislative support above 70%.',
    check: (s) => s.governance.mandate >= 85 && s.governance.legislativeSupport >= 70 },
  { id: 'endowed', name: 'The Endowment', icon: '🏦', tier: 'gold', points: 50,
    description: 'Build a sovereign wealth fund worth more than a year of output.',
    check: (s) => s.economy.sovereignFund >= s.economy.gdp * 1000 },
  { id: 'legislator', name: 'Legislator', icon: '📜', tier: 'silver', points: 35,
    description: 'Pass thirty bills through the legislature.',
    check: (s) => s.governance.billsPassed >= 30 },
  { id: 'kingmaker', name: 'Kingmaker', icon: '🤝', tier: 'silver', points: 30,
    description: 'Accept ten proposals brought to you by foreign governments.',
    check: (s) => s.treaties.length + s.tradeAgreements.length >= 10 },
  { id: 'unbowed', name: 'Unbowed', icon: '✋', tier: 'gold', points: 50, hidden: true,
    description: 'Refuse an ultimatum from a stronger power and never lose the war that follows.',
    check: (s) =>
      s.turn > 60 &&
      s.records.warsLost === 0 &&
      s.nations.some((n) => n.threatPerception > 70 && n.militaryStrength > s.military.strength) },
  { id: 'no-martial-law', name: 'Governed by Consent', icon: '🕊️', tier: 'platinum', points: 85,
    description: 'Pass fifty years with high stability and never once declare martial law.',
    check: (s) =>
      s.turn >= 600 && s.stability >= 65 && s.provinces.every((p) => !p.martialLaw && p.separatism < 40) },
];

export const ACHIEVEMENT_INDEX = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
) as Record<string, Achievement>;

export const TOTAL_ACHIEVEMENT_POINTS = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);

export const TIER_COLORS: Record<Achievement['tier'], string> = {
  bronze: '#c98b5a',
  silver: '#b8c0cc',
  gold: '#e5b447',
  platinum: '#7fdbff',
};
