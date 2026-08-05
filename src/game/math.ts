import type { EnergySource, GameState } from './types';

/**
 * Primitive derived quantities.
 *
 * These live below both `selectors` and the content files so that a crisis
 * trigger or an agenda metric can read "what is debt to GDP" without creating
 * an import cycle back through the selector layer. `selectors` re-exports
 * everything here, so callers never need to know the split exists.
 */

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Nominal GDP per capita in USD. */
export function gdpPerCapita(s: GameState): number {
  if (s.society.population <= 0) return 0;
  return (s.economy.gdp * 1e9) / s.society.population;
}

/** Public debt as a percentage of GDP. */
export function debtToGdp(s: GameState): number {
  if (s.economy.gdp <= 0) return 0;
  return (s.economy.debt / s.economy.gdp) * 100;
}

/** Total electricity produced, TWh/yr. */
export function totalEnergyProduction(s: GameState): number {
  return (Object.values(s.energy.production) as number[]).reduce((a, b) => a + b, 0);
}

/** Ratio of supply to demand. 1 = balanced, <1 = shortfall. */
export function energyBalance(s: GameState): number {
  const demand = Math.max(1, s.energy.demand);
  return totalEnergyProduction(s) / demand;
}

/** Share of electricity from zero-carbon sources, 0–100. */
export function renewableShare(s: GameState): number {
  const total = totalEnergyProduction(s);
  if (total <= 0) return 0;
  const clean: EnergySource[] = ['nuclear', 'hydro', 'solar', 'wind'];
  const cleanTotal = clean.reduce((sum, k) => sum + s.energy.production[k], 0);
  return (cleanTotal / total) * 100;
}

/** Mean relations across every simulated nation, -100..100. */
export function averageRelations(s: GameState): number {
  if (s.nations.length === 0) return 0;
  return s.nations.reduce((sum, n) => sum + n.relations, 0) / s.nations.length;
}
