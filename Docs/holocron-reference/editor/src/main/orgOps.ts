import path from 'path'
import fs from 'fs/promises'
import type { Dirent } from 'fs'
import { loadConfig, saveConfig } from './config'
import { THREAD_META_FILENAME, type ContinuedFrom, type ThreadMeta } from './projectFs'

/**
 * Tagged error class so IPC handlers can map active-state failures to a
 * specific user-facing error string without losing other validation paths.
 */
export class ActiveStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActiveStateError'
  }
}

// ── Active-state guards ───────────────────────────────────────────────────

/**
 * Throw if the currently active thread (per holocronConfig.activeThreadPath)
 * lives inside the given project. Used by rename/move flows to refuse
 * destructive operations on a project the user is working in.
 *
 * For PURGE flows we use `clearActiveIfUnderProject` instead — the user has
 * already typed-confirmed the destruction, so we clear the active config
 * rather than refusing (Bug 5 fix).
 */
export async function assertNotActiveProject(projectPath: string): Promise<void> {
  const cfg = loadConfig()
  if (!cfg.activeThreadPath) return
  const prefix = projectPath + path.sep
  if (cfg.activeThreadPath === projectPath || cfg.activeThreadPath.startsWith(prefix)) {
    throw new ActiveStateError(
      `Cannot modify project "${path.basename(projectPath)}" while a thread inside it is active. Close the active thread first.`,
    )
  }
}

export async function assertNotActiveThread(threadPath: string): Promise<void> {
  const cfg = loadConfig()
  if (cfg.activeThreadPath && cfg.activeThreadPath === threadPath) {
    throw new ActiveStateError(
      `Cannot modify a thread while it's active. Close the active thread first.`,
    )
  }
}

// ── Active-state escape hatches (used by PURGE flows) ────────────────────
//
// Purging is a typed-confirmation flow — the user has already committed to
// destruction, so we clear matching active config keys rather than refusing
// with ActiveStateError. Bug 5 fix.

/** Clear activeProject* / activeThread* if either points at or inside the
 *  given project path. Returns true if any keys were cleared. */
export function clearActiveIfUnderProject(projectPath: string): boolean {
  const cfg = loadConfig()
  const prefix = projectPath + path.sep
  let dirty = false
  if (cfg.activeProjectPath && (cfg.activeProjectPath === projectPath || cfg.activeProjectPath.startsWith(prefix))) {
    cfg.activeProjectName = ''
    cfg.activeProjectPath = ''
    dirty = true
  }
  if (cfg.activeThreadPath && (cfg.activeThreadPath === projectPath || cfg.activeThreadPath.startsWith(prefix))) {
    cfg.activeThreadName = ''
    cfg.activeThreadPath = ''
    dirty = true
  }
  if (dirty) saveConfig(cfg)
  return dirty
}

/** Clear activeThread* if it matches the given thread path. Returns true if
 *  any keys were cleared. */
export function clearActiveIfMatchesThread(threadPath: string): boolean {
  const cfg = loadConfig()
  if (cfg.activeThreadPath !== threadPath) return false
  cfg.activeThreadName = ''
  cfg.activeThreadPath = ''
  saveConfig(cfg)
  return true
}

// ── Branch chain cascade ──────────────────────────────────────────────────

/**
 * Walk every thread.json under `projectsRoot`. For each thread whose meta
 * carries a non-null `continuedFrom`, apply the rewriter; if the rewriter
 * returns a structurally different value, write the updated meta back.
 * Returns the count of thread.jsons updated.
 *
 * Used by rename/move ops to rewrite descendant `continuedFrom.threadPath`
 * (and `.threadName`) when an ancestor's path changes. Synchronous walk —
 * acceptable at current scale (<100 threads, <100ms total).
 */
export async function cascadeUpdateContinuedFrom(
  projectsRoot: string,
  rewriter: (cf: ContinuedFrom) => ContinuedFrom,
): Promise<number> {
  let projects: Dirent[]
  try {
    projects = await fs.readdir(projectsRoot, { withFileTypes: true })
  } catch {
    return 0
  }
  let updated = 0
  for (const p of projects) {
    if (!p.isDirectory() || p.name.startsWith('.')) continue
    const projectPath = path.join(projectsRoot, p.name)
    let threads: Dirent[]
    try {
      threads = await fs.readdir(projectPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const t of threads) {
      if (!t.isDirectory() || t.name.startsWith('.')) continue
      const metaPath = path.join(projectPath, t.name, THREAD_META_FILENAME)
      let raw: string
      try {
        raw = await fs.readFile(metaPath, 'utf-8')
      } catch {
        continue
      }
      let meta: ThreadMeta
      try {
        meta = JSON.parse(raw) as ThreadMeta
      } catch {
        continue
      }
      if (!meta.continuedFrom) continue
      const next = rewriter(meta.continuedFrom)
      const same =
        next.threadName === meta.continuedFrom.threadName &&
        next.threadPath === meta.continuedFrom.threadPath &&
        next.honchoSessionId === meta.continuedFrom.honchoSessionId &&
        next.branchedAt === meta.continuedFrom.branchedAt &&
        next.compressionCountAtBranch === meta.continuedFrom.compressionCountAtBranch
      if (same) continue
      meta.continuedFrom = next
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      updated++
    }
  }
  return updated
}

// ── Boot-time config validation ───────────────────────────────────────────

/**
 * Validate active project/thread config keys against the filesystem on boot.
 * If either path no longer resolves (project renamed/purged from another
 * machine via shared DB, or via out-of-band fs activity, or because of a
 * crash mid-rename), clear the stale keys so the renderer starts fresh.
 *
 * Domaine id validation is deferred to the renderer — the existing restore
 * flow in `Domaines.tsx` already guards against ids that don't appear in
 * the loaded list.
 */
export async function validateActiveConfigPaths(): Promise<{ changed: boolean; cleared: string[] }> {
  // CRITICAL: saveConfig writes the FULL config object via JSON.stringify
  // (config.ts:110) — it does NOT merge with what's on disk. Mutate the
  // loaded full config in place and pass the whole thing back. Earlier
  // versions of this function passed a Partial<HolocronConfig>, which
  // clobbered every other config key on first boot — see HANDOFF_v11.
  const cfg = loadConfig()
  const cleared: string[] = []
  let dirty = false

  if (cfg.activeProjectPath) {
    try {
      const st = await fs.stat(cfg.activeProjectPath)
      if (!st.isDirectory()) throw new Error('not a directory')
    } catch {
      cfg.activeProjectName = ''
      cfg.activeProjectPath = ''
      cleared.push('activeProject')
      dirty = true
    }
  }

  if (cfg.activeThreadPath) {
    try {
      const st = await fs.stat(cfg.activeThreadPath)
      if (!st.isDirectory()) throw new Error('not a directory')
    } catch {
      cfg.activeThreadName = ''
      cfg.activeThreadPath = ''
      cleared.push('activeThread')
      dirty = true
    }
  }

  if (!dirty) return { changed: false, cleared: [] }
  saveConfig(cfg)
  return { changed: true, cleared }
}
