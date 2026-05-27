import { create } from 'zustand'

export type AppTab = 'scribe' | 'domaines' | 'codex' | 'foundry' | 'hive' | 'hud'

interface PendingIntake {
  projectName: string
  threadName: string
  threadPath: string
}

interface SessionStore {
  activeTab: AppTab
  showStartupModal: boolean
  pendingIntakeForThread: PendingIntake | null
  /**
   * Session 8 Part B — Vertical sidebar nav collapse state.
   * `false` = expanded (160 px, icons + labels);
   * `true`  = collapsed (48 px, icons only with hover tooltips).
   * Persists for the session; survives across active-tab switches but resets
   * on app reload (no localStorage rehydration today — could be added if
   * Andy wants it sticky across launches).
   */
  navSidebarCollapsed: boolean
  setActiveTab: (tab: AppTab) => void
  setShowStartupModal: (show: boolean) => void
  setPendingIntakeForThread: (intake: PendingIntake | null) => void
  setNavSidebarCollapsed: (collapsed: boolean) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  activeTab: 'hud',
  showStartupModal: false,
  pendingIntakeForThread: null,
  navSidebarCollapsed: false,
  setActiveTab: (activeTab) => set({ activeTab }),
  setShowStartupModal: (showStartupModal) => set({ showStartupModal }),
  setPendingIntakeForThread: (pendingIntakeForThread) => set({ pendingIntakeForThread }),
  setNavSidebarCollapsed: (navSidebarCollapsed) => set({ navSidebarCollapsed }),
}))
