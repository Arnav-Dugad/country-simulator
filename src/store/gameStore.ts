import { create } from 'zustand';
import type {
  BudgetDept,
  CovertOp,
  GameState,
  MilitaryState,
  OrgId,
  SetupConfig,
  TaxKey,
  TreatyType,
  VictoryGoalId,
  WarGoal,
} from '../game/types';
import { createGame } from '../game/engine/createGame';
import { VICTORY_INDEX } from '../game/data/definitions';
import { tick } from '../game/engine/tick';
import { resolveEvent } from '../game/engine/events';
import type { ActionResult } from '../game/engine/actions';
import * as actions from '../game/engine/actions';
import { clearAutosave, isPlayableSave, saveGameLocally, writeAutosave } from '../game/storage';
import { saveGameToCloud, submitScore } from '../firebase/saves';
import { isFirebaseReady } from '../firebase/config';
import { useUiStore } from './uiStore';

/** Real milliseconds between auto-played months, by speed setting. */
const SPEED_MS: Record<1 | 2 | 3, number> = { 1: 2200, 2: 1100, 3: 480 };

type Mutator = (state: GameState) => ActionResult | void;

interface GameStore {
  game: GameState | null;
  playing: boolean;
  /** Set while a cloud write is in flight. */
  syncing: boolean;
  lastSyncedTurn: number;
  /** Outcome of the most recently resolved event, for the result flash. */
  lastEventOutcome: { failed: boolean; headline: string } | null;

  start: (config: SetupConfig) => void;
  load: (state: GameState) => boolean;
  quit: () => void;

  advance: (months?: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: 1 | 2 | 3) => void;

  chooseEventOption: (choiceId: string) => void;
  dismissEventOutcome: () => void;

  /** Runs an engine action against a cloned state and commits the result. */
  run: (mutator: Mutator) => ActionResult;

  enactPolicy: (id: string) => ActionResult;
  repealPolicy: (id: string) => ActionResult;
  startResearch: (id: string) => ActionResult;
  cancelResearch: () => ActionResult;
  build: (id: string) => ActionResult;
  cancelBuild: (instanceId: string) => ActionResult;
  setTax: (key: TaxKey, value: number) => ActionResult;
  setBudget: (dept: BudgetDept, level: number) => ActionResult;
  issueBonds: (amount: number) => ActionResult;
  repayDebt: (amount: number) => ActionResult;
  appointAdvisor: (id: string) => ActionResult;
  dismissAdvisor: (id: string) => ActionResult;
  setDoctrine: (doctrine: MilitaryState['doctrine']) => ActionResult;
  proposeTreaty: (countryId: string, type: TreatyType) => ActionResult;
  cancelTreaty: (treatyId: string) => ActionResult;
  sendAid: (countryId: string, amount: number) => ActionResult;
  toggleSanctions: (countryId: string) => ActionResult;
  establishEmbassy: (countryId: string) => ActionResult;
  joinOrg: (id: OrgId) => ActionResult;
  leaveOrg: (id: OrgId) => ActionResult;
  launchOp: (type: CovertOp['type'], targetId: string) => ActionResult;
  abortOp: (opId: string) => ActionResult;
  declareWar: (countryId: string, goal: WarGoal) => ActionResult;
  sueForPeace: (warId: string) => ActionResult;
  investInProvince: (provinceId: string, amount: number) => ActionResult;
  grantAutonomy: (provinceId: string) => ActionResult;
  setVictoryGoal: (goal: VictoryGoalId) => ActionResult;
  enactDecree: (decreeId: string) => ActionResult;

  saveToCloud: (uid: string) => Promise<void>;
  publishScore: (uid: string, displayName: string) => Promise<void>;
}

/**
 * The engine mutates its argument, so every store transition works on a fresh
 * structural clone. That keeps React's reference equality meaningful and the
 * engine free of defensive copying.
 */
function clone(state: GameState): GameState {
  return structuredClone(state);
}

let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export const useGameStore = create<GameStore>((set, get) => {
  /** Persists locally on every commit; cloud sync is throttled separately. */
  const commit = (next: GameState): void => {
    set({ game: next });
    writeAutosave(next);
  };

  const startTimer = (): void => {
    stopTimer();
    const game = get().game;
    if (!game) return;
    timer = setInterval(() => {
      const current = get();
      if (!current.game || current.game.gameOver || current.game.eventQueue.length > 0) {
        // Pause automatically when an event needs a decision or the run ends.
        set({ playing: false });
        stopTimer();
        return;
      }
      current.advance(1);
    }, SPEED_MS[game.settings.autoSpeed]);
  };

  return {
    game: null,
    playing: false,
    syncing: false,
    lastSyncedTurn: -1,
    lastEventOutcome: null,

    start: (config) => {
      stopTimer();
      const game = createGame(config);
      set({ game, playing: false, lastSyncedTurn: -1, lastEventOutcome: null });
      writeAutosave(game);
      saveGameLocally(game);
    },

    load: (state) => {
      if (!isPlayableSave(state)) return false;
      stopTimer();
      set({ game: state, playing: false, lastSyncedTurn: state.turn, lastEventOutcome: null });
      writeAutosave(state);
      return true;
    },

    quit: () => {
      stopTimer();
      const game = get().game;
      if (game) saveGameLocally(game);
      clearAutosave();
      set({ game: null, playing: false, lastEventOutcome: null });
    },

    advance: (months = 1) => {
      const current = get().game;
      if (!current || current.gameOver) return;
      const beforeVictories = current.victoriesAchieved.length;
      const next = clone(current);
      for (let i = 0; i < months; i++) {
        if (next.gameOver || next.eventQueue.length > 0) break;
        tick(next);
      }
      commit(next);

      // In eternal mode an objective is recorded rather than ending the run,
      // so it needs its own moment — otherwise reaching it is invisible.
      if (next.victoriesAchieved.length > beforeVictories && !next.gameOver) {
        const achieved = next.victoriesAchieved[next.victoriesAchieved.length - 1];
        const goal = VICTORY_INDEX[achieved];
        useUiStore.getState().notify(
          'success',
          `${goal?.icon ?? '🏆'} Objective achieved`,
          `${goal?.name ?? achieved} complete. The campaign continues — pick a new objective whenever you like.`,
        );
      }

      if (next.gameOver) {
        set({ playing: false });
        stopTimer();
        saveGameLocally(next);
        useUiStore.getState().notify(
          next.gameOver.victory ? 'success' : 'danger',
          next.gameOver.victory ? 'Victory' : 'Campaign over',
          next.gameOver.reason,
        );
      }
      // Keep a durable local snapshot roughly once a year.
      if (next.turn % 12 === 0) saveGameLocally(next);
    },

    setPlaying: (playing) => {
      const game = get().game;
      if (!game || game.gameOver) return;
      if (playing && game.eventQueue.length > 0) {
        useUiStore.getState().notify('info', 'Decision required', 'Resolve the situation on your desk first.');
        return;
      }
      set({ playing });
      if (playing) startTimer();
      else stopTimer();
    },

    setSpeed: (speed) => {
      const current = get().game;
      if (!current) return;
      const next = clone(current);
      next.settings.autoSpeed = speed;
      commit(next);
      if (get().playing) startTimer();
    },

    chooseEventOption: (choiceId) => {
      const current = get().game;
      if (!current || current.eventQueue.length === 0) return;
      const next = clone(current);
      const outcome = resolveEvent(next, choiceId);
      commit(next);
      set({ lastEventOutcome: outcome });
      if (outcome) {
        useUiStore.getState().notify(
          outcome.failed ? 'danger' : 'success',
          outcome.failed ? 'It went badly' : 'Decision made',
          outcome.headline,
        );
      }
    },

    dismissEventOutcome: () => set({ lastEventOutcome: null }),

    run: (mutator) => {
      const current = get().game;
      if (!current) return { ok: false, message: 'No campaign in progress' };
      if (current.gameOver) return { ok: false, message: 'This campaign has ended' };
      const next = clone(current);
      const result = mutator(next) ?? { ok: true, message: '' };
      if (result.ok) commit(next);
      if (result.message) {
        useUiStore.getState().notify(result.ok ? 'success' : 'warning', result.ok ? 'Done' : 'Not possible', result.message);
      }
      return result;
    },

    enactPolicy: (id) => get().run((s) => actions.enactPolicy(s, id)),
    repealPolicy: (id) => get().run((s) => actions.repealPolicy(s, id)),
    startResearch: (id) => get().run((s) => actions.startResearch(s, id)),
    cancelResearch: () => get().run((s) => actions.cancelResearch(s)),
    build: (id) => get().run((s) => actions.startConstruction(s, id)),
    cancelBuild: (instanceId) => get().run((s) => actions.cancelConstruction(s, instanceId)),
    setTax: (key, value) => get().run((s) => actions.setTax(s, key, value)),
    setBudget: (dept, level) => get().run((s) => actions.setBudget(s, dept, level)),
    issueBonds: (amount) => get().run((s) => actions.issueBonds(s, amount)),
    repayDebt: (amount) => get().run((s) => actions.repayDebt(s, amount)),
    appointAdvisor: (id) => get().run((s) => actions.appointAdvisor(s, id)),
    dismissAdvisor: (id) => get().run((s) => actions.dismissAdvisor(s, id)),
    setDoctrine: (doctrine) => get().run((s) => actions.setDoctrine(s, doctrine)),
    proposeTreaty: (countryId, type) => get().run((s) => actions.proposeTreaty(s, countryId, type)),
    cancelTreaty: (treatyId) => get().run((s) => actions.cancelTreaty(s, treatyId)),
    sendAid: (countryId, amount) => get().run((s) => actions.sendAid(s, countryId, amount)),
    toggleSanctions: (countryId) => get().run((s) => actions.toggleSanctions(s, countryId)),
    establishEmbassy: (countryId) => get().run((s) => actions.establishEmbassy(s, countryId)),
    joinOrg: (id) => get().run((s) => actions.joinOrg(s, id)),
    leaveOrg: (id) => get().run((s) => actions.leaveOrg(s, id)),
    launchOp: (type, targetId) => get().run((s) => actions.launchCovertOp(s, type, targetId)),
    abortOp: (opId) => get().run((s) => actions.abortCovertOp(s, opId)),
    declareWar: (countryId, goal) => get().run((s) => actions.declareWar(s, countryId, goal)),
    sueForPeace: (warId) => get().run((s) => actions.sueForPeace(s, warId)),
    investInProvince: (provinceId, amount) => get().run((s) => actions.investInProvince(s, provinceId, amount)),
    grantAutonomy: (provinceId) => get().run((s) => actions.grantAutonomy(s, provinceId)),
    setVictoryGoal: (goal) => get().run((s) => actions.setVictoryGoal(s, goal)),
    enactDecree: (decreeId) => get().run((s) => actions.enactDecree(s, decreeId)),

    saveToCloud: async (uid) => {
      const game = get().game;
      if (!game || !isFirebaseReady()) return;
      set({ syncing: true });
      try {
        await saveGameToCloud(uid, game);
        set({ lastSyncedTurn: game.turn });
      } catch (error) {
        useUiStore.getState().notify(
          'warning',
          'Cloud save failed',
          error instanceof Error ? error.message : 'Could not reach the server.',
        );
      } finally {
        set({ syncing: false });
      }
    },

    publishScore: async (uid, displayName) => {
      const game = get().game;
      if (!game || !isFirebaseReady()) return;
      try {
        await submitScore(uid, displayName, game);
        useUiStore.getState().notify('success', 'Score submitted', 'Your run is on the global leaderboard.');
      } catch (error) {
        useUiStore.getState().notify(
          'warning',
          'Could not submit score',
          error instanceof Error ? error.message : 'Please try again later.',
        );
      }
    },
  };
});
