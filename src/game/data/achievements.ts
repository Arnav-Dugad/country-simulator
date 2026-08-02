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
