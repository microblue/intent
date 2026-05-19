import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserMemoryFact = {
  id: string;
  intentId: string;
  intentTitle: string;
  text: string;
  /** Bullets that made up the reflection card (for re-display). */
  reflection?: string[];
  createdAt: string;
};

export type RailSectionKey =
  | 'thread_outline'
  | 'outline'
  | 'files'
  | 'team'
  | 'memory'
  | 'schedule'
  | 'engine';

/**
 * Default order — thread_outline first so users land on the bird's-eye
 * navigation; the Plan (per-phase 计划) sits beneath it. Memory/schedule/
 * engine collapse by default (DEFAULT_MINIMIZED).
 */
export const ALL_RAIL_SECTIONS: RailSectionKey[] = [
  'thread_outline',
  'outline',
  'files',
  'team',
  'memory',
  'schedule',
  'engine',
];

type UIState = {
  // Transient
  launcherOpen: boolean;
  setLauncherOpen: (v: boolean) => void;
  toggleLauncher: () => void;

  userMenuOpen: boolean;
  setUserMenuOpen: (v: boolean) => void;

  // Persisted preferences
  devMode: boolean;
  setDevMode: (v: boolean) => void;
  toggleDevMode: () => void;

  intentRailOpen: boolean;
  setIntentRailOpen: (v: boolean) => void;
  toggleIntentRail: () => void;

  /** Left sidebar collapsed to a narrow icon-only rail (not fully hidden). */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;

  /**
   * Right-rail "windows": each section can be ordered, minimized (collapse
   * to title bar only), or dismissed. Persisted so the layout sticks across
   * sessions — the rail is a workspace, not throwaway chrome.
   */
  railOrder: RailSectionKey[];
  railMinimized: Record<RailSectionKey, boolean>;
  railHidden: Record<RailSectionKey, boolean>;
  toggleRailMinimized: (key: RailSectionKey) => void;
  hideRailSection: (key: RailSectionKey) => void;
  showRailSection: (key: RailSectionKey) => void;
  moveRailSection: (key: RailSectionKey, dir: 'up' | 'down') => void;
  /** Move `source` to the slot currently held by `target` (drag-drop). */
  reorderRailSection: (source: RailSectionKey, target: RailSectionKey) => void;
  resetRail: () => void;

  /** User-added memory facts (e.g., 复盘 / reflection summaries). */
  userMemoryFacts: UserMemoryFact[];
  addUserMemoryFact: (fact: UserMemoryFact) => void;
  removeUserMemoryFact: (id: string) => void;

  /**
   * Onboarding welcome card has been dismissed. Per-device (localStorage)
   * not per-user; if the same person signs in on a new device they see
   * the welcome again, which is fine — the card is helpful, not noisy.
   */
  onboardingDismissed: boolean;
  dismissOnboarding: () => void;
  resetOnboarding: () => void;
};

const DEFAULT_MINIMIZED: Record<RailSectionKey, boolean> = {
  thread_outline: false,
  outline: false,
  files: false,
  team: false,
  memory: true,
  schedule: true,
  engine: true,
};

const DEFAULT_HIDDEN: Record<RailSectionKey, boolean> = {
  thread_outline: false,
  outline: false,
  files: false,
  team: false,
  memory: false,
  schedule: false,
  engine: false,
};

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      launcherOpen: false,
      setLauncherOpen: (v) => set({ launcherOpen: v }),
      toggleLauncher: () => set((s) => ({ launcherOpen: !s.launcherOpen })),

      userMenuOpen: false,
      setUserMenuOpen: (v) => set({ userMenuOpen: v }),

      devMode: false,
      setDevMode: (v) => set({ devMode: v }),
      toggleDevMode: () => set((s) => ({ devMode: !s.devMode })),

      intentRailOpen: true,
      setIntentRailOpen: (v) => set({ intentRailOpen: v }),
      toggleIntentRail: () => set((s) => ({ intentRailOpen: !s.intentRailOpen })),

      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      railOrder: [...ALL_RAIL_SECTIONS],
      railMinimized: { ...DEFAULT_MINIMIZED },
      railHidden: { ...DEFAULT_HIDDEN },
      toggleRailMinimized: (key) =>
        set((s) => ({
          railMinimized: { ...s.railMinimized, [key]: !s.railMinimized[key] },
        })),
      hideRailSection: (key) =>
        set((s) => ({ railHidden: { ...s.railHidden, [key]: true } })),
      showRailSection: (key) =>
        set((s) => ({ railHidden: { ...s.railHidden, [key]: false } })),
      moveRailSection: (key, dir) =>
        set((s) => {
          const order = [...s.railOrder];
          const i = order.indexOf(key);
          if (i === -1) return {};
          const j = dir === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= order.length) return {};
          [order[i], order[j]] = [order[j], order[i]];
          return { railOrder: order };
        }),
      reorderRailSection: (source, target) =>
        set((s) => {
          if (source === target) return {};
          const order = [...s.railOrder];
          const from = order.indexOf(source);
          const to = order.indexOf(target);
          if (from === -1 || to === -1) return {};
          const [moved] = order.splice(from, 1);
          order.splice(to, 0, moved);
          return { railOrder: order };
        }),
      resetRail: () =>
        set({
          railOrder: [...ALL_RAIL_SECTIONS],
          railMinimized: { ...DEFAULT_MINIMIZED },
          railHidden: { ...DEFAULT_HIDDEN },
        }),

      userMemoryFacts: [],
      addUserMemoryFact: (fact) =>
        set((s) => ({ userMemoryFacts: [fact, ...s.userMemoryFacts] })),
      removeUserMemoryFact: (id) =>
        set((s) => ({
          userMemoryFacts: s.userMemoryFacts.filter((f) => f.id !== id),
        })),

      onboardingDismissed: false,
      dismissOnboarding: () => set({ onboardingDismissed: true }),
      resetOnboarding: () => set({ onboardingDismissed: false }),
    }),
    {
      name: 'myclaw-ui-v2',
      partialize: (s) => ({
        devMode: s.devMode,
        intentRailOpen: s.intentRailOpen,
        sidebarCollapsed: s.sidebarCollapsed,
        railOrder: s.railOrder,
        railMinimized: s.railMinimized,
        railHidden: s.railHidden,
        userMemoryFacts: s.userMemoryFacts,
        onboardingDismissed: s.onboardingDismissed,
      }),
    },
  ),
);
