import type { GameState } from './types';
import { SCHEMA_VERSION } from './engine/createGame';
import type { SaveMeta } from '../firebase/saves';
import { deserialiseSave, serialiseSave } from '../firebase/saves';

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

function metaOf(state: GameState): SaveMeta {
  return {
    id: state.id,
    nationName: state.identity.name,
    leaderName: `${state.leader.title} ${state.leader.name}`.trim(),
    iso2: state.identity.iso2,
    flagColors: state.identity.customFlag?.colors ?? null,
    turn: state.turn,
    year: state.year,
    month: state.month,
    score: state.score,
    difficulty: state.settings.difficulty,
    victoryGoal: state.settings.victoryGoal,
    gdp: state.economy.gdp,
    approval: state.approval,
    updatedAt: state.updatedAt,
    gameOver: state.gameOver !== null,
    victory: state.gameOver?.victory ?? false,
  };
}

export function saveGameLocally(state: GameState): void {
  const saves = readSaves().filter((s) => s.meta.id !== state.id);
  saves.unshift({ meta: metaOf(state), payload: serialiseSave(state) });
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
}

const DEFAULT_PREFS: Preferences = {
  reduceMotion: false,
  showTutorial: true,
  autosaveToCloud: true,
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
 * Brings an older save up to the current schema. Returning the state unchanged
 * is correct while there is only one version; the guard exists so a future
 * schema change cannot silently load a state with missing fields.
 */
export function migrate(state: GameState): GameState {
  if (typeof state.version !== 'number' || state.version > SCHEMA_VERSION) {
    throw new Error('This save was made by a newer version of the game.');
  }
  return state;
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
