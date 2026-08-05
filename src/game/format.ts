/**
 * Display formatting.
 *
 * Deliberately separate from `selectors`, and the one place in the game with
 * mutable module state. Every number the player sees runs through here, and a
 * player who wants to read exact figures rather than "1.24T" should not have to
 * have that preference threaded through forty component signatures to get it.
 *
 * The rule that keeps this honest: nothing here is ever read by the simulation.
 * These functions only produce strings, they are called only from React, and
 * changing the setting cannot alter a single number in a save.
 */

let compact = true;

/** Called by the UI store whenever the preference changes. */
export function setCompactNumbers(value: boolean): void {
  compact = value;
}

export function compactNumbers(): boolean {
  return compact;
}

/** Full figure with thousands separators — `$1,240,000M`. */
function full(value: number, symbol: string, suffix = ''): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}${suffix}`;
}

/** Millions USD in, a readable string out. */
export function formatMoney(millions: number, currencySymbol = '$'): string {
  if (!compact) return full(millions, currencySymbol, 'M');
  const abs = Math.abs(millions);
  const sign = millions < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${currencySymbol}${(abs / 1e6).toFixed(2)}T`;
  if (abs >= 1e3) return `${sign}${currencySymbol}${(abs / 1e3).toFixed(1)}B`;
  return `${sign}${currencySymbol}${abs.toFixed(0)}M`;
}

/** Billions USD in, a readable string out. */
export function formatBillions(billions: number, currencySymbol = '$'): string {
  if (!compact) return full(billions * 1000, currencySymbol, 'M');
  const abs = Math.abs(billions);
  const sign = billions < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currencySymbol}${(abs / 1000).toFixed(2)}T`;
  return `${sign}${currencySymbol}${abs.toFixed(1)}B`;
}

export function formatPopulation(n: number): string {
  if (!compact) return Math.round(n).toLocaleString('en-US');
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function formatSigned(n: number, digits = 1, suffix = ''): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}${suffix}`;
}
