import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase is optional at build time.
 *
 * If the environment variables are absent — a fresh clone, a preview deploy
 * before the keys are added — the app falls back to local-only play with
 * localStorage saves instead of crashing on boot. `isFirebaseConfigured` is
 * what the UI checks before offering accounts, cloud saves or leaderboards.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;

export const isFirebaseConfigured = REQUIRED_KEYS.every(
  (key) => typeof config[key] === 'string' && config[key]!.length > 0,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(config as Required<typeof config>);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
  } catch (error) {
    // A malformed key should degrade to offline play, not a white screen.
    console.error('[sovereign] Firebase failed to initialise; running offline.', error);
    app = null;
    authInstance = null;
    dbInstance = null;
  }
}

export const firebaseApp = app;
export const auth = authInstance;
export const db = dbInstance;

/** True when Firebase initialised successfully and is safe to call. */
export const isFirebaseReady = (): boolean => auth !== null && db !== null;
