import type { GameState } from './types';
import { SCHEMA_VERSION } from './engine/createGame';
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

  // Defensive: a save hand-edited or truncated in transit should still load.
  if (!Array.isArray(state.victoriesAchieved)) state.victoriesAchieved = [];
  if (typeof state.settings.neverEndGame !== 'boolean') state.settings.neverEndGame = false;
  if (typeof state.decreeCooldowns !== 'object' || state.decreeCooldowns === null) {
    state.decreeCooldowns = {};
  }

  state.version = SCHEMA_VERSION;
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
