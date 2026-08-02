import type { SaveMeta } from '../firebase/saves';
import { DIFFICULTY_INDEX, VICTORY_INDEX } from './data/definitions';
import { getCountry } from './data/countries';

/**
 * Career statistics aggregated across every campaign a player has.
 *
 * Derived entirely from save summaries rather than a separately maintained
 * counter, so there is exactly one source of truth and nothing can drift out
 * of sync. Fields added after launch are optional on `SaveMeta`, so every
 * accessor here tolerates an older save that simply lacks them.
 */
export interface CareerStats {
  campaigns: number;
  completed: number;
  victories: number;
  defeats: number;
  inProgress: number;
  winRate: number;

  bestScore: number;
  totalScore: number;
  averageScore: number;

  monthsGoverned: number;
  yearsGoverned: number;
  longestCampaignMonths: number;

  peakGdp: number;
  peakPopulation: number;
  peakHappiness: number;
  bestAchievementCount: number;
  totalTechnologies: number;
  totalWarsWon: number;
  totalTerms: number;
  eternalCampaigns: number;

  /** Most-played nation, by number of campaigns. */
  favouriteNation: { name: string; iso2: string; count: number } | null;
  /** Difficulty the player picks most often. */
  favouriteDifficulty: { id: string; name: string; count: number } | null;
  /** Objectives the player has actually achieved, deduplicated. */
  goalsAchieved: { id: string; name: string; icon: string }[];
  /** Highest-scoring single campaign. */
  bestCampaign: SaveMeta | null;
}

const EMPTY: CareerStats = {
  campaigns: 0, completed: 0, victories: 0, defeats: 0, inProgress: 0, winRate: 0,
  bestScore: 0, totalScore: 0, averageScore: 0,
  monthsGoverned: 0, yearsGoverned: 0, longestCampaignMonths: 0,
  peakGdp: 0, peakPopulation: 0, peakHappiness: 0, bestAchievementCount: 0,
  totalTechnologies: 0, totalWarsWon: 0, totalTerms: 0, eternalCampaigns: 0,
  favouriteNation: null, favouriteDifficulty: null, goalsAchieved: [], bestCampaign: null,
};

/** Merges cloud and local saves, preferring whichever copy is more advanced. */
export function mergeSaves(...lists: SaveMeta[][]): SaveMeta[] {
  const byId = new Map<string, SaveMeta>();
  for (const list of lists) {
    for (const save of list) {
      const existing = byId.get(save.id);
      // The further-along copy wins; on a tie, the more recently written one.
      if (!existing || save.turn > existing.turn || save.updatedAt > existing.updatedAt) {
        byId.set(save.id, save);
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function computeCareerStats(saves: SaveMeta[]): CareerStats {
  if (saves.length === 0) return EMPTY;

  const nationCounts = new Map<string, { name: string; iso2: string; count: number }>();
  const difficultyCounts = new Map<string, number>();
  const goals = new Set<string>();

  let completed = 0;
  let victories = 0;
  let totalScore = 0;
  let monthsGoverned = 0;
  let longest = 0;
  let peakGdp = 0;
  let peakPopulation = 0;
  let peakHappiness = 0;
  let bestAchievementCount = 0;
  let totalTechnologies = 0;
  let totalWarsWon = 0;
  let totalTerms = 0;
  let eternalCampaigns = 0;
  let bestCampaign: SaveMeta | null = null;

  for (const save of saves) {
    if (save.gameOver) {
      completed += 1;
      if (save.victory) victories += 1;
    }

    totalScore += save.score;
    monthsGoverned += save.turn;
    longest = Math.max(longest, save.turn);
    peakGdp = Math.max(peakGdp, save.gdp);
    peakPopulation = Math.max(peakPopulation, save.population ?? 0);
    peakHappiness = Math.max(peakHappiness, save.happiness ?? 0);
    bestAchievementCount = Math.max(bestAchievementCount, save.achievements ?? 0);
    totalTechnologies += save.technologies ?? 0;
    totalWarsWon += save.warsWon ?? 0;
    totalTerms += save.termsServed ?? 0;
    if (save.eternal) eternalCampaigns += 1;
    if (!bestCampaign || save.score > bestCampaign.score) bestCampaign = save;

    // Only count a goal as achieved when the campaign actually reached it.
    if ((save.victoriesAchieved ?? 0) > 0 || (save.gameOver && save.victory)) {
      goals.add(save.victoryGoal);
    }

    const key = save.countryId ?? save.nationName;
    const entry = nationCounts.get(key);
    if (entry) entry.count += 1;
    else nationCounts.set(key, { name: save.nationName, iso2: save.iso2, count: 1 });

    difficultyCounts.set(save.difficulty, (difficultyCounts.get(save.difficulty) ?? 0) + 1);
  }

  const favouriteNation =
    [...nationCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  const topDifficulty = [...difficultyCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const favouriteDifficulty = topDifficulty
    ? {
        id: topDifficulty[0],
        name: DIFFICULTY_INDEX[topDifficulty[0] as keyof typeof DIFFICULTY_INDEX]?.name ?? topDifficulty[0],
        count: topDifficulty[1],
      }
    : null;

  return {
    campaigns: saves.length,
    completed,
    victories,
    defeats: completed - victories,
    inProgress: saves.length - completed,
    winRate: completed > 0 ? (victories / completed) * 100 : 0,

    bestScore: saves.reduce((max, s) => Math.max(max, s.score), 0),
    totalScore,
    averageScore: totalScore / saves.length,

    monthsGoverned,
    yearsGoverned: monthsGoverned / 12,
    longestCampaignMonths: longest,

    peakGdp,
    peakPopulation,
    peakHappiness,
    bestAchievementCount,
    totalTechnologies,
    totalWarsWon,
    totalTerms,
    eternalCampaigns,

    favouriteNation,
    favouriteDifficulty,
    goalsAchieved: [...goals]
      .map((id) => VICTORY_INDEX[id as keyof typeof VICTORY_INDEX])
      .filter((g): g is NonNullable<typeof g> => Boolean(g))
      .map((g) => ({ id: g.id, name: g.name, icon: g.icon })),
    bestCampaign,
  };
}

/* ------------------------------------------------------------------ */
/* Career rank                                                         */
/* ------------------------------------------------------------------ */

export interface CareerRank {
  title: string;
  icon: string;
  color: string;
  /** Total career points, the sum of every campaign score. */
  points: number;
  /** Points needed for the next rank; null at the top. */
  nextAt: number | null;
  nextTitle: string | null;
  progress: number;
}

const RANKS: { at: number; title: string; icon: string; color: string }[] = [
  { at: 0, title: 'Backbencher', icon: '🪑', color: '#8b93a7' },
  { at: 3_000, title: 'Junior Minister', icon: '📋', color: '#a8b4c8' },
  { at: 10_000, title: 'Cabinet Secretary', icon: '🗂️', color: '#c98b5a' },
  { at: 25_000, title: 'Head of Government', icon: '🏛️', color: '#b8c0cc' },
  { at: 50_000, title: 'Elder Statesperson', icon: '🎖️', color: '#e5b447' },
  { at: 100_000, title: 'Architect of Nations', icon: '👑', color: '#f5d073' },
  { at: 200_000, title: 'Legend of the Age', icon: '🌟', color: '#7fdbff' },
];

export function careerRank(totalScore: number): CareerRank {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (totalScore >= RANKS[i].at) index = i;

  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const span = next ? next.at - current.at : 1;
  const into = totalScore - current.at;

  return {
    title: current.title,
    icon: current.icon,
    color: current.color,
    points: totalScore,
    nextAt: next?.at ?? null,
    nextTitle: next?.title ?? null,
    progress: next ? Math.min(100, (into / span) * 100) : 100,
  };
}

/** Human label for a save's nation, falling back to the stored name. */
export function nationLabel(save: SaveMeta): string {
  return save.countryId ? getCountry(save.countryId)?.name ?? save.nationName : save.nationName;
}
