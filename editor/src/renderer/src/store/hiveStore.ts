import { create } from 'zustand'

/**
 * Hive store — caches the per-card stats so the dashboard doesn't re-fetch
 * on every render, and tracks Dreams panel action state (approved / rejected
 * / deferred) by dream id. Action state is in-memory only for Session 3
 * — when the user "Approves" a dream we kick the synthesis pipeline and
 * remove the dream from the visible list; "Reject" / "Defer" hide it for
 * this session. Cross-session persistence is a future enhancement (would
 * land as a `hive_dream_actions` table or as a `dismissedAt` flag inside
 * the Memory file's dreamInsights entry).
 */

export interface HiveDream {
  id: string
  threadPath: string
  threadName: string
  projectName: string
  queriedAt: string
  trigger: string
  insight: string
}

export interface HiveHonchoData {
  activeSessionsCount: number
  totalThreadCount: number
  synthesisReadyCount: number
  conclusionsCount: number | null
  dreams: HiveDream[]
}

export interface HiveValidationData {
  lastSweepAt: string | null
  orphanTagCount: number | null
  zombieWikiDocCount: number | null
  deadLinkCount: number | null
  recentSweeps: Array<{ at: string; kind: string; payload: string | null }>
}

export interface HiveSynthesisDraft {
  id: string
  title: string
  synthesisType: string | null
  diskPath: string | null
  createdAt: string
  gapId: string | null
  dreamId: string | null
}

export interface HiveFoundryData {
  pendingCount: number
  admittedCount: number
  rejectedCount: number
  totalCount: number
  lastCapturedAt: string | null
}

/** Hermes status snapshot (architecture-v4 §4.5 — Session 5). Mirrors
 *  main-side `HermesStatus` shape. */
export interface HiveHermesData {
  running: boolean
  configured: boolean
  lastMessageAt: string | null
  lastError: string | null
  icloudWatching: string | null
}

interface HiveState {
  honcho: HiveHonchoData | null
  honchoLoading: boolean
  validation: HiveValidationData | null
  validationLoading: boolean
  drafts: HiveSynthesisDraft[]
  draftsLoading: boolean
  foundry: HiveFoundryData | null
  foundryLoading: boolean
  hermes: HiveHermesData | null
  hermesLoading: boolean

  /** Dream ids the user has rejected this session — hidden from the panel. */
  rejectedDreamIds: Set<string>
  /** Dream ids the user has deferred this session — hidden, no further action. */
  deferredDreamIds: Set<string>
  /** Dream ids whose Approve flow is in flight (so the row stays disabled). */
  approvingDreamIds: Set<string>

  refreshHoncho: () => Promise<void>
  refreshValidation: () => Promise<void>
  refreshDrafts: () => Promise<void>
  refreshFoundry: () => Promise<void>
  refreshHermes: () => Promise<void>
  refreshAll: () => Promise<void>

  /** Manual Hermes start/stop — wires through to main-side `hermes:start` /
   *  `hermes:stop` and refreshes the cached status afterwards. Returns
   *  whether the action succeeded; the card surfaces the error inline if
   *  not (e.g. "telegram token + user-ID must both be configured"). */
  startHermes: () => Promise<{ ok: boolean; error?: string }>
  stopHermes:  () => Promise<{ ok: boolean; error?: string }>

  markDreamRejected: (id: string) => void
  markDreamDeferred: (id: string) => void
  markDreamApproving: (id: string, on: boolean) => void
}

export const useHiveStore = create<HiveState>((set) => ({
  honcho: null,
  honchoLoading: false,
  validation: null,
  validationLoading: false,
  drafts: [],
  draftsLoading: false,
  foundry: null,
  foundryLoading: false,
  hermes: null,
  hermesLoading: false,
  rejectedDreamIds: new Set(),
  deferredDreamIds: new Set(),
  approvingDreamIds: new Set(),

  refreshHoncho: async () => {
    set({ honchoLoading: true })
    try {
      const res = await window.electronAPI.hiveHonchoStats()
      if (res.ok && res.data) set({ honcho: res.data })
    } finally {
      set({ honchoLoading: false })
    }
  },

  refreshValidation: async () => {
    set({ validationLoading: true })
    try {
      const res = await window.electronAPI.hiveValidationStats()
      if (res.ok && res.data) set({ validation: res.data })
    } finally {
      set({ validationLoading: false })
    }
  },

  refreshDrafts: async () => {
    set({ draftsLoading: true })
    try {
      const res = await window.electronAPI.hiveListSyntheses(10)
      if (res.ok) set({ drafts: res.drafts })
    } finally {
      set({ draftsLoading: false })
    }
  },

  refreshFoundry: async () => {
    set({ foundryLoading: true })
    try {
      const res = await window.electronAPI.hiveFoundryStats()
      if (res.ok && res.data) set({ foundry: res.data })
    } finally {
      set({ foundryLoading: false })
    }
  },

  refreshHermes: async () => {
    set({ hermesLoading: true })
    try {
      const res = await window.electronAPI.hermesStatus()
      if (res.ok && res.data) set({ hermes: res.data })
    } finally {
      set({ hermesLoading: false })
    }
  },

  startHermes: async () => {
    const res = await window.electronAPI.hermesStart()
    if (res.data) set({ hermes: res.data })
    // Build a useful error message — prefer telegram-side error then iCloud
    // (matches the order in the card UI). When neither failed, return ok.
    if (res.ok) return { ok: true }
    const err = res.telegram?.error ?? res.icloud?.error ?? res.error ?? 'start failed'
    return { ok: false, error: err }
  },

  stopHermes: async () => {
    const res = await window.electronAPI.hermesStop()
    if (res.data) set({ hermes: res.data })
    return { ok: res.ok, error: res.error }
  },

  refreshAll: async () => {
    // Fire all in parallel — they hit different subsystems and shouldn't serialize.
    await Promise.all([
      useHiveStore.getState().refreshHoncho(),
      useHiveStore.getState().refreshValidation(),
      useHiveStore.getState().refreshDrafts(),
      useHiveStore.getState().refreshFoundry(),
      useHiveStore.getState().refreshHermes(),
    ])
  },

  markDreamRejected: (id) =>
    set((s) => ({ rejectedDreamIds: new Set([...s.rejectedDreamIds, id]) })),
  markDreamDeferred: (id) =>
    set((s) => ({ deferredDreamIds: new Set([...s.deferredDreamIds, id]) })),
  markDreamApproving: (id, on) =>
    set((s) => {
      const next = new Set(s.approvingDreamIds)
      if (on) next.add(id); else next.delete(id)
      return { approvingDreamIds: next }
    }),
}))
