import { create } from 'zustand';
import type {
  BudgetDept,
  CovertOp,
  GameState,
  LogEntry,
  MilitaryBranch,
  MilitaryState,
  OrgId,
  ResourceId,
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
import type { TradeTerm } from '../game/engine/trade';
import type { ActionResult } from '../game/engine/actions';
import * as actions from '../game/engine/actions';
import { respondToCrisis } from '../game/engine/crises';
import { acceptOffer, declineOffer } from '../game/engine/world';
import {
  depositToFund,
  setAutoRepayDebt,
  setCentralBankIndependence,
  setPolicyRate,
  withdrawFromFund,
} from '../game/engine/finance';
import { abandonAgenda, declareAgenda } from '../game/engine/agenda';
import { clearAutosave, isPlayableSave, saveGameLocally, writeAutosave } from '../game/storage';
import { saveGameToCloud, submitScore } from '../firebase/saves';
import { isFirebaseReady } from '../firebase/config';
import { useUiStore } from './uiStore';

/**
 * How many months of history the rewind buffer holds.
 *
 * Kept in memory only and never persisted: it is an undo for a misclick, not
 * a save-scumming tool, which is why it is disabled entirely under ironman.
 */
const REWIND_DEPTH = 12;

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

  /** Months available to rewind. Zero under ironman. */
  rewindDepth: () => number;
  /** Steps the campaign back one month. */
  rewind: () => void;

  /** Runs an engine action against a cloned state and commits the result. */
  run: (mutator: Mutator) => ActionResult;

  enactPolicy: (id: string) => ActionResult;
  repealPolicy: (id: string) => ActionResult;
  startResearch: (id: string) => ActionResult;
  cancelResearch: (id?: string) => ActionResult;
  setResearchWeight: (id: string, priority: number) => ActionResult;
  moveResearchQueue: (id: string, delta: number) => ActionResult;
  rushResearch: (id: string) => ActionResult;
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
  proposeTradeAgreement: (
    countryId: string,
    resource: ResourceId,
    direction: 'import' | 'export',
    quantity: number,
    termMonths: TradeTerm,
  ) => ActionResult;
  cancelTradeAgreement: (agreementId: string) => ActionResult;

  /* New systems */
  setBranchFunding: (branch: MilitaryBranch, weight: number) => ActionResult;
  setNuclearProgramme: (active: boolean) => ActionResult;
  setMartialLaw: (provinceId: string, active: boolean) => ActionResult;
  setProvinceInvestment: (provinceId: string, amount: number) => ActionResult;
  respondToCrisis: (crisisId: string, responseId: string) => ActionResult;
  acceptOffer: (offerId: string) => ActionResult;
  declineOffer: (offerId: string) => ActionResult;
  depositToFund: (amount: number) => ActionResult;
  withdrawFromFund: (amount: number) => ActionResult;
  setCentralBankIndependence: (independent: boolean) => ActionResult;
  setPolicyRate: (rate: number) => ActionResult;
  setAutoRepayDebt: (enabled: boolean) => ActionResult;
  declareAgenda: (defId: string) => ActionResult;
  abandonAgenda: () => ActionResult;

  saveToCloud: (uid: string) => Promise<void>;
  publishScore: (uid: string, displayName: string) => Promise<void>;
}

/** Appends an entry to the campaign log from a store-level action. */
function pushLog(s: GameState, entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>): void {
  s.log.unshift({
    id: `log-store-${s.turn}-${s.log.length}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    turn: s.turn,
    year: s.year,
    month: s.month,
    ...entry,
  });
  if (s.log.length > 400) s.log.length = 400;
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
  /**
   * Snapshots taken before each advanced month, newest last.
   *
   * Deliberately module-local rather than store state: it must never be
   * serialised into a save, and nothing should re-render when it changes.
   */
  let rewindStack: GameState[] = [];

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
      rewindStack = [];
      const game = createGame(config);
      set({ game, playing: false, lastSyncedTurn: -1, lastEventOutcome: null });
      writeAutosave(game);
      saveGameLocally(game);
    },

    load: (state) => {
      if (!isPlayableSave(state)) return false;
      stopTimer();
      rewindStack = [];
      set({ game: state, playing: false, lastSyncedTurn: state.turn, lastEventOutcome: null });
      writeAutosave(state);
      return true;
    },

    quit: () => {
      stopTimer();
      const game = get().game;
      if (game) saveGameLocally(game);
      clearAutosave();
      rewindStack = [];
      set({ game: null, playing: false, lastEventOutcome: null });
    },

    rewindDepth: () => {
      const game = get().game;
      if (!game || game.settings.ironman) return 0;
      return rewindStack.length;
    },

    rewind: () => {
      const game = get().game;
      if (!game) return;
      if (game.settings.ironman) {
        useUiStore.getState().notify('info', 'Ironman', 'Decisions are final in an ironman campaign.');
        return;
      }
      const previous = rewindStack.pop();
      if (!previous) {
        useUiStore.getState().notify('info', 'Nothing to rewind', 'No earlier month is held in memory.');
        return;
      }
      stopTimer();
      set({ game: previous, playing: false, lastEventOutcome: null });
      writeAutosave(previous);
      useUiStore
        .getState()
        .notify('success', 'Rewound', `Back to month ${previous.turn}. ${rewindStack.length} step(s) remain.`);
    },

    advance: (months = 1) => {
      const current = get().game;
      if (!current || current.gameOver) return;
      const beforeVictories = current.victoriesAchieved.length;

      // Snapshot before time moves, so a bad month can be taken back.
      if (!current.settings.ironman) {
        rewindStack.push(clone(current));
        if (rewindStack.length > REWIND_DEPTH) rewindStack.shift();
      }

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
    cancelResearch: (id) => get().run((s) => actions.cancelResearch(s, id)),
    setResearchWeight: (id, priority) => get().run((s) => actions.setResearchWeight(s, id, priority)),
    moveResearchQueue: (id, delta) => get().run((s) => actions.moveResearchQueue(s, id, delta)),
    rushResearch: (id) => get().run((s) => actions.rushResearchProject(s, id)),
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
    proposeTradeAgreement: (countryId, resource, direction, quantity, termMonths) =>
      get().run((s) => actions.proposeTradeAgreement(s, countryId, resource, direction, quantity, termMonths)),
    cancelTradeAgreement: (agreementId) => get().run((s) => actions.cancelTradeAgreement(s, agreementId)),

    setBranchFunding: (branch, weight) => get().run((s) => actions.setBranchFunding(s, branch, weight)),
    setNuclearProgramme: (active) => get().run((s) => actions.setNuclearProgramme(s, active)),
    setMartialLaw: (provinceId, active) => get().run((s) => actions.setMartialLaw(s, provinceId, active)),
    setProvinceInvestment: (provinceId, amount) =>
      get().run((s) => actions.setProvinceInvestment(s, provinceId, amount)),

    respondToCrisis: (crisisId, responseId) =>
      get().run((s) => {
        const outcome = respondToCrisis(s, crisisId, responseId, (entry) => pushLog(s, entry));
        return { ok: outcome.ok, message: outcome.message };
      }),

    acceptOffer: (offerId) =>
      get().run((s) => acceptOffer(s, offerId, (entry) => pushLog(s, entry))),
    declineOffer: (offerId) =>
      get().run((s) => declineOffer(s, offerId, (entry) => pushLog(s, entry))),

    depositToFund: (amount) => get().run((s) => depositToFund(s, amount)),
    withdrawFromFund: (amount) => get().run((s) => withdrawFromFund(s, amount)),
    setCentralBankIndependence: (independent) =>
      get().run((s) => setCentralBankIndependence(s, independent)),
    setPolicyRate: (rate) => get().run((s) => setPolicyRate(s, rate)),
    setAutoRepayDebt: (enabled) => get().run((s) => setAutoRepayDebt(s, enabled)),

    declareAgenda: (defId) => get().run((s) => declareAgenda(s, defId)),
    abandonAgenda: () => get().run((s) => abandonAgenda(s)),

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
