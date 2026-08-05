import { create } from 'zustand';
import type { PanelTarget } from '../game/types';
import type { Preferences } from '../game/storage';
import { readPreferences, writePreferences } from '../game/storage';
import { setCompactNumbers } from '../game/format';

export type ToastKind = 'success' | 'warning' | 'danger' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body: string;
}

/**
 * Panels the shell can show. Derived from the engine's `PanelTarget` so a
 * recommendation can never point at a panel that does not exist.
 */
export type PanelId = PanelTarget;

interface UiState {
  panel: PanelId;
  /** Panels visited, newest first — powers "recent" in the command palette. */
  recentPanels: PanelId[];
  toasts: Toast[];
  prefs: Preferences;
  sidebarOpen: boolean;
  /** Country id shown in the diplomacy detail pane. */
  selectedNation: string | null;
  /** Whether the command palette is open. */
  paletteOpen: boolean;
  /** Whether the keyboard-shortcut sheet is open. */
  helpOpen: boolean;

  setPanel: (panel: PanelId) => void;
  notify: (kind: ToastKind, title: string, body: string) => void;
  dismiss: (id: string) => void;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  togglePinned: (panel: PanelId) => void;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  selectNation: (id: string | null) => void;
  setPalette: (open: boolean) => void;
  setHelp: (open: boolean) => void;
}

let toastSeq = 0;

const initialPrefs = readPreferences();
// The formatting layer keeps its own copy so every `formatMoney` call site
// picks the preference up without threading it through their signatures.
setCompactNumbers(initialPrefs.compactNumbers);

export const useUiStore = create<UiState>((set, get) => ({
  panel: 'dashboard',
  recentPanels: [],
  toasts: [],
  prefs: initialPrefs,
  sidebarOpen: false,
  selectedNation: null,
  paletteOpen: false,
  helpOpen: false,

  setPanel: (panel) => {
    const recent = [panel, ...get().recentPanels.filter((p) => p !== panel)].slice(0, 6);
    set({ panel, recentPanels: recent, sidebarOpen: false, paletteOpen: false });
  },

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
    if (key === 'compactNumbers') setCompactNumbers(Boolean(value));
    set({ prefs });
  },

  /** Pins or unpins a panel at the top of the navigation. */
  togglePinned: (panel) => {
    const current = get().prefs.pinnedPanels ?? [];
    const next = current.includes(panel)
      ? current.filter((p) => p !== panel)
      : [...current, panel].slice(0, 8);
    const prefs = { ...get().prefs, pinnedPanels: next };
    writePreferences(prefs);
    set({ prefs });
  },

  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  setSidebar: (open) => set({ sidebarOpen: open }),
  selectNation: (id) => set({ selectedNation: id }),
  setPalette: (open) => set({ paletteOpen: open }),
  setHelp: (open) => set({ helpOpen: open }),
}));
