import type { GameState } from '../types';
import { DIFFICULTY_INDEX } from '../data/definitions';
import { TECHNOLOGIES } from '../data/technologies';
import { ACHIEVEMENT_INDEX } from '../data/achievements';
import { averageRelations, clamp, debtToGdp, gdpPerCapita, hdi, renewableShare } from '../selectors';

const TIER5_IDS = TECHNOLOGIES.filter((t) => t.tier === 5).map((t) => t.id);

export interface ScoreBreakdown {
  prosperity: number;
  wellbeing: number;
  governance: number;
  power: number;
  sustainability: number;
  knowledge: number;
  achievements: number;
  longevity: number;
  total: number;
}

/**
 * Composite score, 0�?"10,000 before the difficulty multiplier. Each pillar is
 * capped so a player cannot win by maximising a single axis.
 */
export function computeScore(s: GameState): ScoreBreakdown {
  const perCapita = gdpPerCapita(s);
  const debt = debtToGdp(s);

  const prosperity = clamp(
    Math.log10(Math.max(1, s.economy.gdp)) * 190 +
      Math.min(520, perCapita / 160) +
      Math.max(-260, 190 - debt * 1.6) +
      s.economy.creditRating * 2.1,
    0,
    1700,
  );

  const wellbeing = clamp(
    s.society.happiness * 6.2 +
      s.society.health * 4.4 +
      s.society.lifeExpectancy * 5.2 +
      Math.max(0, 80 - s.economy.inequality) * 4.4 +
      Math.max(0, 22 - s.economy.unemployment) * 9,
    0,
    1700,
  );

  // Governance now includes how legitimate the government actually is and how
  // well it keeps its coalition together — a state held down by force scores
  // materially worse than one governed by consent.
  const factionAverage = s.factions.length
    ? s.factions.reduce((sum, f) => sum + f.satisfaction, 0) / s.factions.length
    : 50;
  const governance = clamp(
    s.stability * 4.4 +
      s.approval * 3.0 +
      Math.max(0, 100 - s.corruption) * 4.4 +
      s.society.civilLiberties * 2.8 +
      Math.max(0, 100 - s.society.crime) * 2.0 +
      s.governance.mandate * 2.6 +
      factionAverage * 2.2 -
      s.provinces.filter((p) => p.martialLaw).length * 40,
    0,
    1700,
  );

  const power = clamp(
    s.military.strength * 6.4 +
      s.society.softPower * 5.4 +
      (averageRelations(s) + 100) * 2.6 +
      s.orgs.length * 46 +
      s.treaties.length * 13 +
      s.wars.filter((w) => w.resolved === 'victory').length * 55,
    0,
    1500,
  );

  const sustainability = clamp(
    renewableShare(s) * 6.4 +
      Math.max(0, 100 - s.environment.pollution) * 3.4 +
      s.environment.forestCover * 2.4 +
      s.environment.biodiversity * 2.4 +
      Math.max(0, 900 - s.environment.emissions) * 0.34,
    0,
    1400,
  );

  const knowledge = clamp(
    s.research.completed.length * 26 +
      s.society.education * 5.4 +
      s.society.literacy * 3.4 +
      TIER5_IDS.filter((t) => s.research.completed.includes(t)).length * 78,
    0,
    1500,
  );

  const achievements = s.achievements.reduce(
    (sum, id) => sum + (ACHIEVEMENT_INDEX[id]?.points ?? 0) * 4,
    0,
  );

  // Longevity credits what the government actually delivered, not only how
  // long it lasted: a plan carried through and a crisis contained both count.
  const longevity = clamp(
    s.turn * 1.4 +
      s.termsServed * 34 +
      s.agendasCompleted.length * 55 +
      s.records.crisesResolved * 22,
    0,
    1000,
  );

  const raw =
    prosperity + wellbeing + governance + power + sustainability + knowledge + achievements + longevity;
  const total = Math.round(raw * DIFFICULTY_INDEX[s.settings.difficulty].scoreMultiplier);

  return {
    prosperity: Math.round(prosperity),
    wellbeing: Math.round(wellbeing),
    governance: Math.round(governance),
    power: Math.round(power),
    sustainability: Math.round(sustainability),
    knowledge: Math.round(knowledge),
    achievements: Math.round(achievements),
    longevity: Math.round(longevity),
    total,
  };
}

export interface VictoryProgress {
  label: string;
  current: number;
  target: number;
  met: boolean;
  display: string;
}

/**
 * Minimum tenure before any victory can be declared. Without it a country that
 * already meets its goal on day one �?" the United States pursuing "Superpower",
 * say �?" would win before governing anything.
 */
export const MINIMUM_VICTORY_MONTHS = 120;

/** Live progress toward the chosen victory goal, for the objectives panel. */
export function victoryProgress(s: GameState): VictoryProgress[] {
  const p = (label: string, current: number, target: number, display: string): VictoryProgress => ({
    label,
    current,
    target,
    met: current >= target,
    display,
  });

  const tenure = p(
    'Time in office',
    s.turn,
    MINIMUM_VICTORY_MONTHS,
    `${Math.floor(s.turn / 12)}y ${s.turn % 12}m / ${MINIMUM_VICTORY_MONTHS / 12}y`,
  );

  switch (s.settings.victoryGoal) {
    case 'superpower': {
      // Measured against the actual world, so the bar rises as rivals grow —
      // and so an already-dominant nation has to *extend* its lead rather than
      // win on day one for doing nothing.
      const rivalGdp = s.nations.reduce((max, n) => Math.max(max, n.gdp), 1);
      const rivalMilitary = s.nations.reduce((max, n) => Math.max(max, n.militaryStrength), 0);
      const gdpLead = s.economy.gdp / rivalGdp;
      return [
        tenure,
        p('Military strength', s.military.strength, 90, `${s.military.strength.toFixed(0)} / 90`),
        p(
          'Strongest military on earth',
          s.military.strength > rivalMilitary ? 1 : 0,
          1,
          `${s.military.strength.toFixed(0)} vs best rival ${rivalMilitary.toFixed(0)}`,
        ),
        p('Economic lead', gdpLead, 1.5, `${gdpLead.toFixed(2)}× / 1.50× largest rival`),
        p('Average relations', averageRelations(s) + 100, 125, `${averageRelations(s).toFixed(0)} / 25`),
        p('Soft power', s.society.softPower, 60, `${s.society.softPower.toFixed(0)} / 60`),
        p('Stability', s.stability, 65, `${s.stability.toFixed(0)} / 65`),
      ];
    }
    case 'utopia':
      return [
        tenure,
        p('Happiness', s.society.happiness, 90, `${s.society.happiness.toFixed(0)} / 90`),
        p('Equality', 100 - s.economy.inequality, 75, `Gini ${s.economy.inequality.toFixed(0)} / 25`),
        p('Unemployment', 100 - s.economy.unemployment, 96, `${s.economy.unemployment.toFixed(1)}% / 4%`),
        p('Healthcare', s.society.health, 85, `${s.society.health.toFixed(0)} / 85`),
        p('Education', s.society.education, 85, `${s.society.education.toFixed(0)} / 85`),
      ];
    case 'economic':
      return [
        tenure,
        p('GDP per capita', gdpPerCapita(s), 85000, `$${Math.round(gdpPerCapita(s)).toLocaleString()} / $85,000`),
        p('Debt ratio', 100 - debtToGdp(s), 60, `${debtToGdp(s).toFixed(0)}% / 40%`),
        p('Credit rating', s.economy.creditRating, 90, `${s.economy.creditRating.toFixed(0)} / 90`),
        p('Treasury', s.economy.treasury, 500000, `$${(s.economy.treasury / 1000).toFixed(0)}B / $500B`),
      ];
    case 'green': {
      const startEmissions = s.history[0]?.emissions ?? s.environment.emissions;
      const startGdp = s.history[0]?.gdp ?? s.economy.gdp;
      return [
        tenure,
        p('Renewable share', renewableShare(s), 90, `${renewableShare(s).toFixed(0)}% / 90%`),
        p('Emissions cut', 100 - (s.environment.emissions / Math.max(1, startEmissions)) * 100, 80,
          `${((s.environment.emissions / Math.max(1, startEmissions)) * 100).toFixed(0)}% of start / 20%`),
        p('GDP maintained', s.economy.gdp, startGdp, `$${(s.economy.gdp / 1000).toFixed(2)}T / $${(startGdp / 1000).toFixed(2)}T`),
        p('Happiness', s.society.happiness, 65, `${s.society.happiness.toFixed(0)} / 65`),
      ];
    }
    case 'scientific': {
      const done = TIER5_IDS.filter((t) => s.research.completed.includes(t)).length;
      return [
        tenure,
        p('Tier-5 technologies', done, TIER5_IDS.length, `${done} / ${TIER5_IDS.length}`),
        p('Research output', s.research.perMonth, 4000, `${Math.round(s.research.perMonth)} / 4,000 per month`),
        p('Education', s.society.education, 90, `${s.society.education.toFixed(0)} / 90`),
      ];
    }
    case 'cultural':
      return [
        tenure,
        p('Soft power', s.society.softPower, 95, `${s.society.softPower.toFixed(0)} / 95`),
        p('Average relations', averageRelations(s) + 100, 150, `${averageRelations(s).toFixed(0)} / 50`),
        p('Organisations', s.orgs.length, 5, `${s.orgs.length} / 5`),
        p('Happiness', s.society.happiness, 75, `${s.society.happiness.toFixed(0)} / 75`),
      ];
    case 'survival':
    default:
      return [
        p('Months in office', s.turn, 600, `${s.turn} / 600`),
        p('Stability', s.stability, 50, `${s.stability.toFixed(0)} / 50`),
        p('Wars lost', s.wars.filter((w) => w.resolved === 'defeat').length === 0 ? 1 : 0, 1,
          `${s.wars.filter((w) => w.resolved === 'defeat').length} lost`),
      ];
  }
}

export function checkVictory(s: GameState): boolean {
  return victoryProgress(s).every((v) => v.met);
}

/** Rank title shown on the results screen. */
export function scoreTitle(score: number): string {
  if (score >= 20000) return 'Architect of the Age';
  if (score >= 15000) return 'Colossus';
  if (score >= 11000) return 'Great Power';
  if (score >= 8000) return 'Statesperson of the Century';
  if (score >= 5500) return 'Respected Leader';
  if (score >= 3500) return 'Competent Administrator';
  if (score >= 2000) return 'Caretaker';
  if (score >= 800) return 'Footnote';
  return 'Cautionary Tale';
}

/** Composite national development index shown on the dashboard. */
export function nationalIndex(s: GameState): number {
  return clamp(
    hdi(s) * 0.35 +
      s.stability * 0.15 +
      (100 - s.corruption) * 0.12 +
      s.society.happiness * 0.18 +
      s.economy.creditRating * 0.1 +
      renewableShare(s) * 0.1,
    0,
    100,
  );
}
