import type { GameState } from '../types';
import { clamp, debtToGdp } from '../selectors';
import { noise } from './rng';

/**
 * Sovereign finance beyond the monthly budget line.
 *
 * Three levers live here, and each one is a genuine trade-off rather than a
 * bonus: a wealth fund earns a return but the money stops being spendable, a
 * captured central bank does what it is told but is not believed, and turning
 * off the automatic debt sweep builds a war chest at the cost of the interest
 * bill compounding against you.
 */

/* ------------------------------------------------------------------ */
/* Sovereign wealth fund                                               */
/* ------------------------------------------------------------------ */

/**
 * Annualised return the fund earns, in %.
 *
 * Tracks the world cycle, so the fund is worth most exactly when the domestic
 * economy is doing worst — which is the argument for having one.
 */
export function fundReturnRate(s: GameState): number {
  const institutional = (s.buildings['sovereign-fund-office'] ?? 0) > 0 ? 1.4 : 0;
  const competence = (100 - s.corruption) / 100;
  return clamp(
    (3.4 + s.world.cycle * 4.2 + institutional) * competence + noise(s) * 0.6,
    -14,
    16,
  );
}

export interface FinanceResult {
  ok: boolean;
  message: string;
}

/** Moves treasury cash into the fund. */
export function depositToFund(s: GameState, amountMillions: number): FinanceResult {
  const amount = Math.max(0, amountMillions);
  if (amount <= 0) return { ok: false, message: 'Enter an amount' };
  if (s.economy.treasury < amount) return { ok: false, message: 'Insufficient treasury' };
  s.economy.treasury -= amount;
  s.economy.sovereignFund += amount;
  return { ok: true, message: `Transferred to the sovereign fund.` };
}

/**
 * Takes money back out.
 *
 * Withdrawals are taxed politically rather than financially: raiding the
 * endowment is what governments do when they have run out of other options,
 * and the markets and the public both read it that way.
 */
export function withdrawFromFund(s: GameState, amountMillions: number): FinanceResult {
  const amount = Math.max(0, amountMillions);
  if (amount <= 0) return { ok: false, message: 'Enter an amount' };
  if (s.economy.sovereignFund < amount) return { ok: false, message: 'The fund does not hold that much' };
  s.economy.sovereignFund -= amount;
  s.economy.treasury += amount;

  // Raiding more than a fifth of the fund at once is a visible act of distress.
  const share = amount / Math.max(1, s.economy.sovereignFund + amount);
  if (share > 0.2) {
    s.economy.confidence = clamp(s.economy.confidence - share * 12, 0, 100);
    s.approval = clamp(s.approval - share * 5, 0, 100);
  }
  return { ok: true, message: 'Withdrawn from the sovereign fund.' };
}

/* ------------------------------------------------------------------ */
/* Central bank                                                        */
/* ------------------------------------------------------------------ */

/** Hands rate-setting to the bank, or takes it back. */
export function setCentralBankIndependence(s: GameState, independent: boolean): FinanceResult {
  if (s.economy.centralBankIndependent === independent) {
    return { ok: false, message: independent ? 'The bank is already independent' : 'You already set the rate' };
  }
  s.economy.centralBankIndependent = independent;
  if (independent) {
    s.economy.creditRating = clamp(s.economy.creditRating + 4, 1, 100);
    s.economy.confidence = clamp(s.economy.confidence + 3, 0, 100);
    return { ok: true, message: 'The central bank now sets the policy rate independently.' };
  }
  // Markets price political control immediately and permanently.
  s.economy.creditRating = clamp(s.economy.creditRating - 12, 1, 100);
  s.economy.confidence = clamp(s.economy.confidence - 8, 0, 100);
  s.society.civilLiberties = clamp(s.society.civilLiberties - 2, 0, 100);
  return { ok: true, message: 'You have taken direct control of monetary policy. Markets have noticed.' };
}

/** Orders a policy rate. Only has effect while the bank is not independent. */
export function setPolicyRate(s: GameState, rate: number): FinanceResult {
  if (s.economy.centralBankIndependent) {
    return { ok: false, message: 'The central bank sets the rate. Take control first.' };
  }
  s.economy.policyRateTarget = clamp(Math.round(rate * 4) / 4, 0, 30);
  return { ok: true, message: `Policy rate directed to ${s.economy.policyRateTarget.toFixed(2)}%.` };
}

/** Turns the automatic surplus-to-debt sweep on or off. */
export function setAutoRepayDebt(s: GameState, enabled: boolean): FinanceResult {
  s.economy.autoRepayDebt = enabled;
  return {
    ok: true,
    message: enabled
      ? 'Surplus cash will be swept into debt repayment automatically.'
      : 'Surplus cash will now accumulate in the treasury.',
  };
}

/* ------------------------------------------------------------------ */
/* Monthly update                                                      */
/* ------------------------------------------------------------------ */

/**
 * The bond yield markets charge on new debt.
 *
 * Kept separate from the policy rate because they are separate things: a
 * central bank can cut to zero and still watch the sovereign pay 14% if the
 * debt trajectory is not believed.
 */
export function bondYieldFor(s: GameState): number {
  const ratio = debtToGdp(s);
  const creditSpread = ((100 - s.economy.creditRating) / 100) * 7.5;
  const debtSpread = clamp((ratio - 60) / 100, 0, 3.2);
  const politicsSpread = s.economy.centralBankIndependent ? 0 : 1.8;
  const inflationSpread = Math.max(0, s.economy.inflation - 3) * 0.22;
  return clamp(
    s.economy.interestRate + creditSpread + debtSpread + politicsSpread + inflationSpread,
    0.05,
    45,
  );
}

/** Advances fund returns and the bond market. Called from `tick`. */
export function updateFinance(s: GameState): void {
  s.economy.fundReturn = fundReturnRate(s);
  if (s.economy.sovereignFund > 0) {
    s.economy.sovereignFund = Math.max(
      0,
      s.economy.sovereignFund * (1 + s.economy.fundReturn / 100 / 12),
    );
  }
  s.economy.bondYield = bondYieldFor(s);
}
