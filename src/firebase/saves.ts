import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import type { GameState, HistoryPoint } from '../game/types';
import { db, isFirebaseReady } from './config';

export interface SaveMeta {
  id: string;
  nationName: string;
  leaderName: string;
  iso2: string;
  flagColors: string[] | null;
  turn: number;
  year: number;
  month: number;
  score: number;
  difficulty: string;
  victoryGoal: string;
  gdp: number;
  approval: number;
  updatedAt: number;
  gameOver: boolean;
  victory: boolean;
}

export interface LeaderboardEntry {
  id: string;
  uid: string;
  displayName: string;
  nationName: string;
  iso2: string;
  score: number;
  turn: number;
  difficulty: string;
  victoryGoal: string;
  victory: boolean;
  title: string;
  createdAt: number;
}

/** Firestore documents cap at 1 MiB; stay comfortably under it. */
const MAX_SAVE_BYTES = 700_000;

function summarise(state: GameState): SaveMeta {
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

/**
 * Thins a long history to at most `max` points, always keeping the first and
 * last. Fifty years of monthly data is 600 points; charts cannot show that
 * detail anyway, and it keeps cloud saves well inside the document limit.
 */
function thinHistory(history: HistoryPoint[], max = 400): HistoryPoint[] {
  if (history.length <= max) return history;
  const step = history.length / max;
  const out: HistoryPoint[] = [];
  for (let i = 0; i < max; i++) out.push(history[Math.floor(i * step)]);
  const last = history[history.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Prepares a state for storage: JSON, with the bulky tails trimmed. */
export function serialiseSave(state: GameState): string {
  return JSON.stringify({
    ...state,
    history: thinHistory(state.history),
    log: state.log.slice(0, 120),
  });
}

export function deserialiseSave(payload: string): GameState {
  return JSON.parse(payload) as GameState;
}

function requireDb(): NonNullable<typeof db> {
  if (!isFirebaseReady() || !db) {
    throw new Error('Cloud saves are unavailable: this deployment has no Firebase configuration.');
  }
  return db;
}

/* ------------------------------------------------------------------ */
/* Cloud saves                                                         */
/* ------------------------------------------------------------------ */

export async function saveGameToCloud(uid: string, state: GameState): Promise<void> {
  const database = requireDb();
  const payload = serialiseSave(state);

  if (payload.length > MAX_SAVE_BYTES) {
    throw new Error('This campaign has grown too large to store in the cloud.');
  }

  await setDoc(doc(database, 'users', uid, 'saves', state.id), {
    payload,
    meta: summarise(state),
    updatedAt: serverTimestamp(),
  });
}

export async function listCloudSaves(uid: string): Promise<SaveMeta[]> {
  const database = requireDb();
  const snapshot = await getDocs(
    query(collection(database, 'users', uid, 'saves'), fsLimit(50)),
  );
  return snapshot.docs
    .map((d) => d.data().meta as SaveMeta)
    .filter((meta): meta is SaveMeta => Boolean(meta))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadCloudSave(uid: string, saveId: string): Promise<GameState | null> {
  const database = requireDb();
  const snapshot = await getDoc(doc(database, 'users', uid, 'saves', saveId));
  if (!snapshot.exists()) return null;
  const payload = snapshot.data().payload as string | undefined;
  return payload ? deserialiseSave(payload) : null;
}

export async function deleteCloudSave(uid: string, saveId: string): Promise<void> {
  const database = requireDb();
  await deleteDoc(doc(database, 'users', uid, 'saves', saveId));
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

export async function submitScore(
  uid: string,
  displayName: string,
  state: GameState,
): Promise<void> {
  const database = requireDb();
  const entry: Omit<LeaderboardEntry, 'id'> = {
    uid,
    displayName: displayName || 'Anonymous Leader',
    nationName: state.identity.name,
    iso2: state.identity.iso2,
    score: state.score,
    turn: state.turn,
    difficulty: state.settings.difficulty,
    victoryGoal: state.settings.victoryGoal,
    victory: state.gameOver?.victory ?? false,
    title: state.gameOver?.title ?? 'In Office',
    createdAt: Date.now(),
  };
  // One entry per campaign: re-submitting the same run overwrites it.
  await setDoc(doc(database, 'leaderboard', `${uid}_${state.id}`), entry);
}

export async function fetchLeaderboard(max = 50): Promise<LeaderboardEntry[]> {
  const database = requireDb();
  const snapshot = await getDocs(
    query(collection(database, 'leaderboard'), orderBy('score', 'desc'), fsLimit(max)),
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaderboardEntry, 'id'>) }));
}

export async function fetchMyBest(uid: string): Promise<LeaderboardEntry | null> {
  const database = requireDb();
  const snapshot = await getDocs(
    query(
      collection(database, 'leaderboard'),
      where('uid', '==', uid),
      orderBy('score', 'desc'),
      fsLimit(1),
    ),
  );
  const first = snapshot.docs[0];
  return first ? { id: first.id, ...(first.data() as Omit<LeaderboardEntry, 'id'>) } : null;
}
