import type { GameState } from '../types';
import { clamp } from '../selectors';

/**
 * Spends from the treasury, borrowing whatever it cannot cover.
 *
 * Every outflow in the engine goes through this so the treasury can never go
 * negative — a shortfall becomes sovereign debt and dents the credit rating,
 * which is what actually happens.
 */
export function spendTreasury(s: GameState, amountMillions: number): void {
  if (amountMillions <= 0) {
    s.economy.treasury -= amountMillions; // a negative "spend" is income
    return;
  }
  const fromCash = Math.min(s.economy.treasury, amountMillions);
  s.economy.treasury -= fromCash;

  const shortfall = amountMillions - fromCash;
  if (shortfall <= 0) return;

  s.economy.debt += shortfall / 1000;
  s.economy.creditRating = clamp(
    s.economy.creditRating - (shortfall / (s.economy.gdp * 1000 + 1)) * 22,
    1,
    100,
  );
}

/** Adds income to the treasury, never allowing a negative balance. */
export function addTreasury(s: GameState, amountMillions: number): void {
  if (amountMillions < 0) {
    spendTreasury(s, -amountMillions);
    return;
  }
  s.economy.treasury += amountMillions;
}
