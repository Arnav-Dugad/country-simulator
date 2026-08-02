import { create } from 'zustand';
import type { Preferences } from '../game/storage';
import { readPreferences, writePreferences } from '../game/storage';

export type ToastKind = 'success' | 'warning' | 'danger' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body: string;
}

export type PanelId =
  | 'dashboard'
  | 'economy'
  | 'budget'
  | 'policies'
  | 'research'
  | 'construction'
  | 'society'
  | 'environment'
  | 'military'
  | 'diplomacy'
  | 'intelligence'
  | 'provinces'
  | 'politics'
  | 'cabinet'
  | 'objectives'
  | 'achievements'
  | 'history';

interface UiState {
  panel: PanelId;
  toasts: Toast[];
  prefs: Preferences;
  sidebarOpen: boolean;
  /** Country id shown in the diplomacy detail pane. */
  selectedNation: string | null;

  setPanel: (panel: PanelId) => void;
  notify: (kind: ToastKind, title: string, body: string) => void;
  dismiss: (id: string) => void;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  selectNation: (id: string | null) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set, get) => ({
  panel: 'dashboard',
  toasts: [],
  prefs: readPreferences(),
  sidebarOpen: false,
  selectedNation: null,

  setPanel: (panel) => set({ panel, sidebarOpen: false }),

  notify: (kind, title, body) => {
    const id = `toast-${++toastSeq}`;
    // Cap the stack so a burst of engine messages cannot bury the screen.
    set({ toasts: [...get().toasts.slice(-4), { id, kind, title, body }] });
    setTimeout(() => get().dismiss(id), kind === 'danger' ? 7000 : 4200);
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  setPref: (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    writePreferences(prefs);
    set({ prefs });
  },

  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  setSidebar: (open) => set({ sidebarOpen: open }),
  selectNation: (id) => set({ selectedNation: id }),
}));
