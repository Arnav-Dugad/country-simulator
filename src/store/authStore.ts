import { create } from 'zustand';
import type { AuthUser } from '../firebase/auth';
import { describeAuthError, logOut, signIn, signInWithGoogle, signUp, watchAuth } from '../firebase/auth';
import { isFirebaseConfigured } from '../firebase/config';

interface AuthState {
  user: AuthUser | null;
  /** True until the first auth state resolution arrives. */
  loading: boolean;
  busy: boolean;
  error: string | null;
  available: boolean;
  init: () => () => void;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: isFirebaseConfigured,
  busy: false,
  error: null,
  available: isFirebaseConfigured,

  init: () =>
    watchAuth((user) => {
      set({ user, loading: false });
    }),

  register: async (email, password, name) => {
    set({ busy: true, error: null });
    try {
      const user = await signUp(email, password, name);
      set({ user, busy: false });
      return true;
    } catch (error) {
      set({ error: describeAuthError(error), busy: false });
      return false;
    }
  },

  login: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const user = await signIn(email, password);
      set({ user, busy: false });
      return true;
    } catch (error) {
      set({ error: describeAuthError(error), busy: false });
      return false;
    }
  },

  loginWithGoogle: async () => {
    set({ busy: true, error: null });
    try {
      const user = await signInWithGoogle();
      set({ user, busy: false });
      return true;
    } catch (error) {
      set({ error: describeAuthError(error), busy: false });
      return false;
    }
  },

  logout: async () => {
    await logOut();
    set({ user: null });
  },

  clearError: () => set({ error: null }),
}));
