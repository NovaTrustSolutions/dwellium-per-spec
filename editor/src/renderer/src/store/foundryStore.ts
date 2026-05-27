/**
 * Foundry store — architecture-v4 Part 6, Session 4 (Part E).
 *
 * Holds the Review queue items (across all statuses), the available
 * thread targets for the Approve dropdown, and per-action in-flight
 * state (so the per-row buttons can show "Approving…" without blocking
 * the rest of the queue).
 *
 * Auto-refresh: the Foundry tab kicks `refresh()` on mount + after
 * every action + after every IntakePanel capture. A 3s polling timer
 * runs while any item has `triageStatus === 'pending'` so triage
 * completion surfaces without a manual refresh. The poll stops once
 * no pending items remain — no idle hot-loop.
 *
 * In-memory only; nothing persists across renderer reloads. The DB is
 * the source of truth.
 */
import { create } from 'zustand'

export type FoundrySourceType = 'url' | 'paste' | 'file' | 'telegram' | 'icloud'
export type FoundryTriageStatus = 'pending' | 'triaged' | 'approved' | 'rejected'
/** 'extract' = clean + tags + score; cleanedContent populated.
 *  'convert' = tags + score only; rawContent preserved verbatim. */
export type FoundryTriageMode = 'extract' | 'convert'

export interface FoundryItem {
  id: string
  createdAt: string
  updatedAt: string
  sourceType: FoundrySourceType
  sourceUrl: string | null
  sourceFilename: string | null
  rawContent: string
  /** Triage Agent's cleaned version (boilerplate stripped). NULL until
   *  triage completes, when Gemini omitted the field, OR when
   *  triageMode === 'convert' (cleaning skipped by design). The Review
   *  preview + Approve flow default to this when present, falling back
   *  to rawContent. */
  cleanedContent: string | null
  triageMode: FoundryTriageMode
  triageStatus: FoundryTriageStatus
  proposedTags: string[] | null
  proposedDomain: string | null
  qualityScore: number | null
  signalAssessment: string | null
  proposedConnections: string[] | null
  triageCompletedAt: string | null
  reviewedAt: string | null
  reviewerNotes: string | null
  admittedAt: string | null
  admittedDocId: string | null
  targetThread: string | null
}

export interface FoundryThreadTarget {
  projectName: string
  threadName: string
  threadPath: string
  lastModified: number
}

/** Per-item "just admitted" snapshot — drives the success card shown
 *  in place of the regular item card for ~10s after a successful Approve.
 *  Keyed by item id; populated by `approve` on success, cleared by
 *  `dismissAdmission` (manual close) or by the auto-hide timer in the
 *  queue component. */
export interface AdmissionSnapshot {
  filePath: string
  filename: string
  targetThreadName: string | null
  admittedAtMs: number
}

interface FoundryState {
  items: FoundryItem[]
  threads: FoundryThreadTarget[]
  loading: boolean
  threadsLoaded: boolean
  error: string | null

  // Per-item in-flight flags so individual buttons can disable + show
  // "Approving…" / "Rejecting…" while not blocking the rest of the queue.
  approvingIds: Set<string>
  rejectingIds: Set<string>
  restoringIds: Set<string>
  deletingIds: Set<string>

  // Currently-open item in the full-width Review panel. Null when the
  // queue is showing instead. Cleared on successful approve/reject + on
  // explicit "← Back to queue" click.
  reviewingId: string | null

  // Just-admitted snapshots — drives the success card (Part 4 of the
  // redesign). Map<itemId, snapshot>. Entries auto-expire after 10s via
  // a timer in ReviewQueue; manual dismiss removes immediately.
  recentlyAdmitted: Map<string, AdmissionSnapshot>

  // Last-action note (cleared on next action). Used for the inline
  // "approve failed" / "delete-all done" surface above the queue.
  lastActionNote: { ok: boolean; message: string } | null

  refresh: () => Promise<void>
  refreshThreads: () => Promise<void>
  approve: (args: {
    id: string
    content: string
    filename: string
    targetThreadPath?: string | null
    targetThreadName?: string | null     // display-only, surfaced in the success card
  }) => Promise<{ ok: boolean; filePath?: string; error?: string }>
  reject: (id: string) => Promise<{ ok: boolean; error?: string }>
  restore: (id: string) => Promise<{ ok: boolean; error?: string }>
  deleteRejected: (id: string) => Promise<{ ok: boolean; error?: string }>
  deleteAllRejected: () => Promise<{ ok: boolean; deleted: number; error?: string }>
  deleteAllAdmitted: () => Promise<{ ok: boolean; deleted: number; error?: string }>
  setReviewingId: (id: string | null) => void
  dismissAdmission: (id: string) => void
  clearActionNote: () => void
}

const setHas = <T>(s: Set<T>, v: T): Set<T> => new Set(s).add(v)
const setDel = <T>(s: Set<T>, v: T): Set<T> => { const n = new Set(s); n.delete(v); return n }

export const useFoundryStore = create<FoundryState>((set, get) => ({
  items: [],
  threads: [],
  loading: false,
  threadsLoaded: false,
  error: null,
  approvingIds: new Set(),
  rejectingIds: new Set(),
  restoringIds: new Set(),
  deletingIds: new Set(),
  reviewingId: null,
  recentlyAdmitted: new Map(),
  lastActionNote: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const res = await window.electronAPI.foundryList()
      if (res.ok) {
        set({ items: res.items as FoundryItem[], loading: false })
      } else {
        set({ error: res.error ?? 'Failed to load items', loading: false })
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  refreshThreads: async () => {
    try {
      const res = await window.electronAPI.foundryListTargetThreads()
      if (res.ok) {
        set({ threads: res.threads, threadsLoaded: true })
      }
    } catch (err) {
      // Thread list failure is non-fatal — the dropdown just stays empty
      // (the user can still pick "no thread / general reference").
      console.warn('[FoundryStore] refreshThreads failed:', (err as Error).message)
    }
  },

  approve: async (args) => {
    set((s) => ({ approvingIds: setHas(s.approvingIds, args.id), lastActionNote: null }))
    try {
      const res = await window.electronAPI.foundryApprove({
        id: args.id,
        content: args.content,
        filename: args.filename,
        targetThreadPath: args.targetThreadPath ?? null,
      })
      if (res.ok && res.filePath) {
        // Capture the success snapshot for the inline confirmation card
        // (Part 4 of the redesign). The Map gets a 10s auto-hide timer
        // applied by the ReviewQueue effect; entries removed early by
        // dismissAdmission stop the timer's no-op delete from racing.
        set((s) => {
          const next = new Map(s.recentlyAdmitted)
          next.set(args.id, {
            filePath: res.filePath ?? '',
            filename: args.filename,
            targetThreadName: args.targetThreadName ?? null,
            admittedAtMs: Date.now(),
          })
          return {
            recentlyAdmitted: next,
            // Close the Review panel if it was open on this item.
            reviewingId: s.reviewingId === args.id ? null : s.reviewingId,
          }
        })
        // Refresh after approval so the item moves to the Admitted section
        // in the underlying queue data (the success card overlays for 10s).
        await get().refresh()
      } else if (res.ok) {
        // Approved but no filePath — rare degraded path (file saved, DB
        // update failed). Surface as an action note, no success card.
        set({ lastActionNote: { ok: true, message: 'Approved (with warnings — check terminal).' } })
        await get().refresh()
      } else {
        set({ lastActionNote: { ok: false, message: res.error ?? 'Approve failed' } })
      }
      return res
    } catch (err) {
      const msg = (err as Error).message
      set({ lastActionNote: { ok: false, message: msg } })
      return { ok: false, error: msg }
    } finally {
      set((s) => ({ approvingIds: setDel(s.approvingIds, args.id) }))
    }
  },

  reject: async (id) => {
    set((s) => ({ rejectingIds: setHas(s.rejectingIds, id), lastActionNote: null }))
    try {
      const res = await window.electronAPI.foundryReject({ id })
      if (res.ok) {
        set((s) => ({
          // Close the Review panel if it was open on this item.
          reviewingId: s.reviewingId === id ? null : s.reviewingId,
        }))
        await get().refresh()
      } else {
        set({ lastActionNote: { ok: false, message: res.error ?? 'Reject failed' } })
      }
      return res
    } catch (err) {
      const msg = (err as Error).message
      set({ lastActionNote: { ok: false, message: msg } })
      return { ok: false, error: msg }
    } finally {
      set((s) => ({ rejectingIds: setDel(s.rejectingIds, id) }))
    }
  },

  restore: async (id) => {
    set((s) => ({ restoringIds: setHas(s.restoringIds, id) }))
    try {
      const res = await window.electronAPI.foundryRestore(id)
      if (res.ok) await get().refresh()
      else set({ lastActionNote: { ok: false, message: res.error ?? 'Restore failed' } })
      return res
    } catch (err) {
      const msg = (err as Error).message
      set({ lastActionNote: { ok: false, message: msg } })
      return { ok: false, error: msg }
    } finally {
      set((s) => ({ restoringIds: setDel(s.restoringIds, id) }))
    }
  },

  deleteRejected: async (id) => {
    set((s) => ({ deletingIds: setHas(s.deletingIds, id) }))
    try {
      const res = await window.electronAPI.foundryDeleteRejected(id)
      if (res.ok) await get().refresh()
      else set({ lastActionNote: { ok: false, message: res.error ?? 'Delete failed' } })
      return res
    } catch (err) {
      const msg = (err as Error).message
      set({ lastActionNote: { ok: false, message: msg } })
      return { ok: false, error: msg }
    } finally {
      set((s) => ({ deletingIds: setDel(s.deletingIds, id) }))
    }
  },

  deleteAllRejected: async () => {
    try {
      const res = await window.electronAPI.foundryDeleteAllRejected()
      if (res.ok) {
        set({ lastActionNote: { ok: true, message: `Cleared ${res.deleted} rejected item(s).` } })
        await get().refresh()
      } else {
        set({ lastActionNote: { ok: false, message: res.error ?? 'Clear failed' } })
      }
      return res
    } catch (err) {
      const msg = (err as Error).message
      set({ lastActionNote: { ok: false, message: msg } })
      return { ok: false, deleted: 0, error: msg }
    }
  },

  deleteAllAdmitted: async () => {
    try {
      const res = await window.electronAPI.foundryDeleteAllAdmitted()
      if (res.ok) {
        set({
          lastActionNote: {
            ok: true,
            message: `Cleared ${res.deleted} admitted item(s) from this list. The Codex documents they created are unaffected.`,
          },
        })
        await get().refresh()
      } else {
        set({ lastActionNote: { ok: false, message: res.error ?? 'Clear failed' } })
      }
      return res
    } catch (err) {
      const msg = (err as Error).message
      set({ lastActionNote: { ok: false, message: msg } })
      return { ok: false, deleted: 0, error: msg }
    }
  },

  setReviewingId: (id) => set({ reviewingId: id }),

  dismissAdmission: (id) => set((s) => {
    if (!s.recentlyAdmitted.has(id)) return s
    const next = new Map(s.recentlyAdmitted)
    next.delete(id)
    return { recentlyAdmitted: next }
  }),

  clearActionNote: () => set({ lastActionNote: null }),
}))
