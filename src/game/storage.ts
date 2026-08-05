import type { GameState } from './types';
import { getCountry } from './data/countries';
import { SCHEMA_VERSION } from './engine/createGame';
import { initialFactions } from './engine/politics';
import type { SaveMeta } from '../firebase/saves';
import { deserialiseSave, serialiseSave, summariseSave } from '../firebase/saves';

const SAVES_KEY = 'sovereign:saves';
const AUTOSAVE_KEY = 'sovereign:autosave';
const SETTINGS_KEY = 'sovereign:prefs';

interface LocalSave {
  meta: SaveMeta;
  payload: string;
}

function readSaves(): LocalSave[] {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    return raw ? (JSON.parse(raw) as LocalSave[]) : [];
  } catch {
    return [];
  }
}

function writeSaves(saves: LocalSave[]): void {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
  } catch (error) {
    // Quota exceeded: drop the oldest campaigns and retry once.
    console.warn('[sovereign] Local save store full, pruning oldest.', error);
    try {
      localStorage.setItem(SAVES_KEY, JSON.stringify(saves.slice(0, 4)));
    } catch {
      /* nothing more we can do — the player still has cloud saves */
    }
  }
}

export function saveGameLocally(state: GameState): void {
  const saves = readSaves().filter((s) => s.meta.id !== state.id);
  // Same summary as the cloud path, so a local and a synced save describe a
  // campaign identically and the career profile can merge them.
  saves.unshift({ meta: summariseSave(state), payload: serialiseSave(state) });
  writeSaves(saves.slice(0, 12));
}

export function listLocalSaves(): SaveMeta[] {
  return readSaves()
    .map((s) => s.meta)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadLocalSave(id: string): GameState | null {
  const save = readSaves().find((s) => s.meta.id === id);
  if (!save) return null;
  try {
    return migrate(deserialiseSave(save.payload));
  } catch {
    return null;
  }
}

export function deleteLocalSave(id: string): void {
  writeSaves(readSaves().filter((s) => s.meta.id !== id));
}

export function writeAutosave(state: GameState): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serialiseSave(state));
  } catch {
    /* autosave is best-effort */
  }
}

export function readAutosave(): GameState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? migrate(deserialiseSave(raw)) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

export interface Preferences {
  reduceMotion: boolean;
  showTutorial: boolean;
  autosaveToCloud: boolean;
  /** Panels pinned to the top of the navigation, in the player's order. */
  pinnedPanels: string[];
  /** Show the persistent "next move" strip under the top bar. */
  showNextMove: boolean;
  /** Confirm before irreversible actions (war, repeal, breaking a contract). */
  confirmRisky: boolean;
  /** Compact number formatting (1.2T) rather than full figures. */
  compactNumbers: boolean;
}

const DEFAULT_PREFS: Preferences = {
  reduceMotion: false,
  showTutorial: true,
  autosaveToCloud: true,
  pinnedPanels: [],
  showNextMove: true,
  confirmRisky: true,
  compactNumbers: true,
};

export function readPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/**
 * Brings an older save up to the current schema.
 *
 * Migrations are additive and idempotent: each one fills in fields the engine
 * now expects but an older save never wrote. A save from a *newer* build is
 * rejected outright rather than loaded with fields we cannot interpret.
 */
export function migrate(state: GameState): GameState {
  if (typeof state.version !== 'number' || state.version > SCHEMA_VERSION) {
    throw new Error('This save was made by a newer version of the game.');
  }

  // v1 -> v2: eternal mode and the record of achieved victory goals.
  if (state.version < 2) {
    state.settings = { ...state.settings, neverEndGame: state.settings?.neverEndGame ?? false };
    state.victoriesAchieved = state.victoriesAchieved ?? [];
  }

  // v2 -> v3: executive action cooldowns.
  if (state.version < 3) {
    state.decreeCooldowns = state.decreeCooldowns ?? {};
  }

  // v3 -> v4: commodity trade agreements, and resource endowments on the
  // simulated nations so they can be plausible trading partners.
  if (state.version < 4) {
    state.tradeAgreements = state.tradeAgreements ?? [];
    for (const nation of state.nations ?? []) {
      if (!nation.resources) {
        nation.resources = getCountry(nation.id)?.resources ?? {};
      }
    }
  }

  // v4 -> v5: parallel research, political capital, interest groups, crises,
  // national agendas, the living world, and the sovereign wealth fund. Every
  // field is filled in from what the save already knows, so a campaign carries
  // its own history into the new systems rather than being reset by them.
  if (state.version < 5) {
    upgradeToV5(state);
  }

  // Defensive: a save hand-edited or truncated in transit should still load.
  if (!Array.isArray(state.victoriesAchieved)) state.victoriesAchieved = [];
  if (typeof state.settings.neverEndGame !== 'boolean') state.settings.neverEndGame = false;
  if (typeof state.decreeCooldowns !== 'object' || state.decreeCooldowns === null) {
    state.decreeCooldowns = {};
  }
  if (!Array.isArray(state.tradeAgreements)) state.tradeAgreements = [];
  // Run the v5 backfill unconditionally too: it is idempotent, and it repairs
  // a save that was written by this build but truncated or partially merged.
  upgradeToV5(state);

  state.version = SCHEMA_VERSION;
  return state;
}

/**
 * Fills in everything schema 5 added.
 *
 * Written to be safe to run twice: each block checks whether the field is
 * already the right shape before touching it, so it doubles as a repair pass
 * for a save that arrived damaged.
 */
function upgradeToV5(state: GameState): void {
  const anyState = state as unknown as Record<string, unknown>;

  /* --- Research: single project becomes a slot array --------------------- */
  const research = state.research ?? ({} as GameState['research']);
  if (!Array.isArray(research.active)) {
    research.active = research.current
      ? [{ techId: research.current, progress: research.progress ?? 0, priority: 1 }]
      : [];
  }
  if (!Array.isArray(research.queue)) research.queue = [];
  if (typeof research.bonusSlots !== 'number') research.bonusSlots = 0;
  if (!Array.isArray(research.completed)) research.completed = [];
  state.research = research;

  /* --- Economy: fund, bank and bond market ------------------------------ */
  const eco = state.economy;
  if (typeof eco.sovereignFund !== 'number') eco.sovereignFund = 0;
  if (typeof eco.fundReturn !== 'number') eco.fundReturn = 0;
  if (typeof eco.centralBankIndependent !== 'boolean') eco.centralBankIndependent = true;
  if (typeof eco.policyRateTarget !== 'number') eco.policyRateTarget = eco.interestRate ?? 2.5;
  if (typeof eco.bondYield !== 'number') eco.bondYield = (eco.interestRate ?? 2.5) + 2;
  if (typeof eco.autoRepayDebt !== 'boolean') eco.autoRepayDebt = true;
  if (typeof eco.realIndex !== 'number') eco.realIndex = 100;

  /* --- Military: branch funding and the weapons programme --------------- */
  const mil = state.military;
  if (!mil.branchFunding || typeof mil.branchFunding !== 'object') {
    mil.branchFunding = { army: 1, navy: 1, airForce: 1, cyber: 1, space: 1 };
  } else {
    for (const branch of ['army', 'navy', 'airForce', 'cyber', 'space'] as const) {
      if (typeof mil.branchFunding[branch] !== 'number') mil.branchFunding[branch] = 1;
    }
  }
  if (typeof mil.nuclearProgramme !== 'number') mil.nuclearProgramme = 0;
  if (typeof mil.nuclearProgrammeActive !== 'boolean') mil.nuclearProgrammeActive = false;

  /* --- Intelligence dossiers -------------------------------------------- */
  if (!state.intelligence.dossiers || typeof state.intelligence.dossiers !== 'object') {
    state.intelligence.dossiers = {};
  }

  /* --- Provinces --------------------------------------------------------- */
  for (const p of state.provinces ?? []) {
    if (typeof p.martialLaw !== 'boolean') p.martialLaw = false;
    if (typeof p.separatism !== 'number') {
      // Derive a plausible starting value from what the save already records.
      p.separatism = Math.max(0, Math.min(100, p.unrest * 0.4 + p.autonomy * 0.25 - p.loyalty * 0.15));
    }
    if (typeof p.investment !== 'number') p.investment = 0;
  }

  /* --- Nations: agendas, blocs, threat ----------------------------------- */
  for (const n of state.nations ?? []) {
    if (!n.agenda) n.agenda = 'development';
    if (!Array.isArray(n.warsWith)) n.warsWith = [];
    if (n.bloc === undefined) n.bloc = null;
    if (typeof n.threatPerception !== 'number') n.threatPerception = 20;
    if (typeof n.sanctioningPlayer !== 'boolean') n.sanctioningPlayer = false;
    if (!n.resources) n.resources = {};
  }

  /* --- New collections --------------------------------------------------- */
  if (!Array.isArray(state.foreignWars)) state.foreignWars = [];
  if (!Array.isArray(state.offers)) state.offers = [];
  if (!Array.isArray(state.crises)) state.crises = [];
  if (!state.crisisCooldowns || typeof state.crisisCooldowns !== 'object') state.crisisCooldowns = {};
  if (state.agenda === undefined) state.agenda = null;
  if (!Array.isArray(state.agendasCompleted)) state.agendasCompleted = [];

  /* --- Governance -------------------------------------------------------- */
  if (!state.governance || typeof state.governance !== 'object') {
    state.governance = {
      capital: 20,
      capitalPerMonth: 0,
      capitalCap: 100,
      mandate: Math.max(10, Math.min(92, (state.stability ?? 50) * 0.5 + (state.approval ?? 50) * 0.4)),
      legislativeSupport: 50,
      momentum: 0,
      billsPassed: 0,
      billsBlocked: 0,
    };
  }

  /* --- Factions ---------------------------------------------------------- */
  if (!Array.isArray(state.factions) || state.factions.length === 0) {
    state.factions = initialFactions(state);
  }

  /* --- World ------------------------------------------------------------- */
  if (!state.world || typeof state.world !== 'object') {
    state.world = {
      tension: 25,
      cycle: 0.1,
      cyclePhase: 'expansion',
      globalGrowth: 3,
      globalGdp: (state.nations ?? []).reduce((sum, n) => sum + n.gdp, state.economy?.gdp ?? 0),
      monthsToPhaseShift: 36,
    };
  }

  /* --- Records ----------------------------------------------------------- */
  if (!state.records || typeof state.records !== 'object') {
    state.records = {
      peakGdp: state.economy?.gdp ?? 0,
      peakScore: state.score ?? 0,
      peakApproval: state.approval ?? 0,
      peakPopulation: state.society?.population ?? 0,
      lowestCorruption: state.corruption ?? 100,
      warsWon: (state.wars ?? []).filter((w) => w.resolved === 'victory').length,
      warsLost: (state.wars ?? []).filter((w) => w.resolved === 'defeat').length,
      crisesResolved: 0,
      eventsResolved: 0,
    };
  }

  /* --- History gains two series ------------------------------------------ */
  for (const point of state.history ?? []) {
    const h = point as unknown as Record<string, unknown>;
    if (typeof h.politicalCapital !== 'number') h.politicalCapital = 0;
    if (typeof h.research !== 'number') h.research = 0;
  }

  void anyState;
}

/** Cheap sanity check before a loaded save is handed to the engine. */
export function isPlayableSave(state: unknown): state is GameState {
  if (typeof state !== 'object' || state === null) return false;
  const s = state as Partial<GameState>;
  return (
    typeof s.turn === 'number' &&
    typeof s.identity === 'object' &&
    typeof s.economy === 'object' &&
    typeof s.society === 'object' &&
    Array.isArray(s.nations)
  );
}
