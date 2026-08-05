import type { AgendaDef, GameState, LogEntry, Modifiers } from '../types';
import {
  AGENDA_DECLARATION_COST,
  AGENDA_INDEX,
  AGENDA_METRIC_LABELS,
  AGENDA_MONTHS,
  readMetric,
  targetFor,
} from '../data/agendas';
import { clamp } from '../selectors';
import { addCapital, spendCapital } from './politics';

type Logger = (entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>) => void;

export interface AgendaResult {
  ok: boolean;
  message: string;
}

/** Modifiers the current plan imposes while it runs. */
export function agendaModifiers(s: GameState): Modifiers {
  if (!s.agenda) return {};
  return AGENDA_INDEX[s.agenda.defId]?.duringModifiers ?? {};
}

/** Live progress toward the declared target, 0–1. */
export function agendaProgress(s: GameState): number {
  if (!s.agenda) return 0;
  const def = AGENDA_INDEX[s.agenda.defId];
  if (!def) return 0;
  const current = readMetric(s, def.metric);
  const span = s.agenda.target - s.agenda.baseline;
  if (Math.abs(span) < 1e-9) return 1;
  return clamp((current - s.agenda.baseline) / span, 0, 1);
}

/** True when the plan's target is currently satisfied. */
export function agendaMet(s: GameState): boolean {
  if (!s.agenda) return false;
  const def = AGENDA_INDEX[s.agenda.defId];
  if (!def) return false;
  const current = readMetric(s, def.metric);
  return def.lower ? current <= s.agenda.target : current >= s.agenda.target;
}

/** Declares a five-year plan, spending the political capital it takes. */
export function declareAgenda(s: GameState, defId: string): AgendaResult {
  if (s.agenda) return { ok: false, message: 'A plan is already running' };
  const def = AGENDA_INDEX[defId];
  if (!def) return { ok: false, message: 'Unknown plan' };
  if (s.governance.capital < AGENDA_DECLARATION_COST) {
    return {
      ok: false,
      message: `Declaring a plan costs ${AGENDA_DECLARATION_COST} political capital; you have ${Math.floor(s.governance.capital)}.`,
    };
  }
  spendCapital(s, AGENDA_DECLARATION_COST);

  const baseline = readMetric(s, def.metric);
  s.agenda = {
    defId,
    startedTurn: s.turn,
    endsTurn: s.turn + AGENDA_MONTHS,
    baseline,
    target: targetFor(def, baseline),
  };
  // Declaring a plan is itself an act of leadership; it buys a hearing.
  s.approval = clamp(s.approval + 3, 0, 100);
  s.governance.momentum = clamp(s.governance.momentum + 12, -100, 100);
  return { ok: true, message: `${def.name} declared. Five years to deliver it.` };
}

/**
 * Abandons a plan early.
 *
 * Deliberately punitive: the whole value of the mechanic is that the
 * commitment is real, and an escape hatch with no cost would remove it.
 */
export function abandonAgenda(s: GameState): AgendaResult {
  if (!s.agenda) return { ok: false, message: 'No plan is running' };
  const def = AGENDA_INDEX[s.agenda.defId];
  s.agenda = null;
  s.approval = clamp(s.approval - 8, 0, 100);
  s.governance.momentum = clamp(s.governance.momentum - 25, -100, 100);
  s.governance.mandate = clamp(s.governance.mandate - 6, 0, 100);
  return { ok: true, message: `${def?.name ?? 'The plan'} abandoned. It will be remembered.` };
}

/** Ticks the plan, settling it when its term expires. */
export function updateAgenda(s: GameState, log: Logger): void {
  if (!s.agenda) return;
  const def: AgendaDef | undefined = AGENDA_INDEX[s.agenda.defId];
  if (!def) {
    s.agenda = null;
    return;
  }
  if (s.turn < s.agenda.endsTurn) return;

  const met = agendaMet(s);
  if (met) {
    s.agendasCompleted.push(def.id);
    s.activeModifiers.push({
      id: `agenda-${def.id}-${s.turn}`,
      label: `${def.name} — delivered`,
      source: 'National plan',
      modifiers: def.rewardModifiers,
      // Permanent: the country genuinely changed shape.
      monthsRemaining: Infinity,
      icon: def.icon,
    });
    addCapital(s, def.rewardCapital);
    s.approval = clamp(s.approval + 9, 0, 100);
    s.governance.mandate = clamp(s.governance.mandate + 10, 0, 100);
    s.governance.momentum = clamp(s.governance.momentum + 35, -100, 100);
    log({
      text: `${def.name} delivered. ${AGENDA_METRIC_LABELS[def.metric]} target met — the gains are permanent.`,
      category: 'system',
      tone: 'good',
      icon: def.icon,
    });
  } else {
    s.approval = clamp(s.approval - 10, 0, 100);
    s.governance.mandate = clamp(s.governance.mandate - 10, 0, 100);
    s.governance.momentum = clamp(s.governance.momentum - 30, -100, 100);
    log({
      text: `${def.name} has failed. The targets were published and they were missed.`,
      category: 'system',
      tone: 'bad',
      icon: '📉',
    });
  }
  s.agenda = null;
}
