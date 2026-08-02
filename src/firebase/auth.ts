import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseReady } from './config';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

/** Turns a Firebase error code into something a player can act on. */
export function describeAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address does not look valid.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists with that email.';
    case 'auth/weak-password':
      return 'Choose a password of at least six characters.';
    case 'auth/popup-closed-by-user':
      return 'The sign-in window was closed before finishing.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup.';
    case 'auth/account-exists-with-different-credential':
      return 'That email is already registered with a different sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled for this project.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in the Firebase console.';
    default:
      return error instanceof Error && error.message
        ? error.message.replace(/^Firebase:\s*/, '')
        : 'Something went wrong. Please try again.';
  }
}

function requireAuth(): NonNullable<typeof auth> {
  if (!isFirebaseReady() || !auth) {
    throw new Error('Accounts are unavailable: this deployment has no Firebase configuration.');
  }
  return auth;
}

export async function signUp(email: string, password: string, displayName: string): Promise<AuthUser> {
  const instance = requireAuth();
  const credential = await createUserWithEmailAndPassword(instance, email.trim(), password);
  const name = displayName.trim();
  if (name) await updateProfile(credential.user, { displayName: name });
  return { ...toAuthUser(credential.user), displayName: name || credential.user.displayName };
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const instance = requireAuth();
  const credential = await signInWithEmailAndPassword(instance, email.trim(), password);
  return toAuthUser(credential.user);
}

export async function signInWithGoogle(): Promise<AuthUser> {
  const instance = requireAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(instance, provider);
  return toAuthUser(credential.user);
}

export async function resetPassword(email: string): Promise<void> {
  const instance = requireAuth();
  await sendPasswordResetEmail(instance, email.trim());
}

export async function logOut(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

/** Renames the signed-in user. Their leaderboard entries keep the old name. */
export async function updateDisplayName(displayName: string): Promise<void> {
  const instance = requireAuth();
  const current = instance.currentUser;
  if (!current) throw new Error('You are not signed in.');
  await updateProfile(current, { displayName: displayName.trim().slice(0, 32) });
}

/** Subscribes to auth changes. Returns a no-op unsubscribe when offline. */
export function watchAuth(callback: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseReady() || !auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => callback(user ? toAuthUser(user) : null));
}
