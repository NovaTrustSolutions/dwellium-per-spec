// Filesystem-side test harness (Session 9).
//
// The existing `tests/helpers.ts` covers the DB-side pipeline (seedDomaine /
// seedDocument / truncateAll) and shallow fs setup (`makeProjectsRoot` /
// `makeThreadFolder` / `writeFile`). This file adds the fs-side surface that
// Sessions 6–8 main-process work needs in order to test:
//
//   - Move-to-thread (atomic fs.rename + EXDEV fallback + collision avoidance)
//   - Wikilink-writeback guards (`fs.stat` + `is_active=true` OR logic in
//     ragIngest.ts:710 — the Session 7 fix #2 that prevents the resurrect-
//     on-writeback race against in-flight ingest jobs)
//   - References-folder removal (Foundry approve, IntakeModal first-load drop,
//     wiki-to-thread copy — all writing to the thread root post-Session-7)
//   - iCloud-inbox auto-delete (Foundry approve happy-path unlinks the
//     source file from `cfg.icloudInboxPath`)
//
// None of those have direct vitest coverage today; this harness is the
// scaffolding so future fs-side test suites have a stable foundation.
//
// Design notes:
//   - `chokidar` is NOT invoked. Tests that need a chokidar-driven flow drive
//     the handler functions directly (workspace.onFileEvent or the Foundry
//     admit path) and emit synthetic events via `simulateFsEvent()` below.
//     Reasons: (1) chokidar's polling adds 1–2 s minimum to each test, (2)
//     the polling watcher in workspace.ts is module-scoped (one watcher,
//     mutated by every startWatcher() — see gotcha.md line 41) and would
//     bleed across test files, (3) the macOS-fsevents constraint
//     (gotcha.md line 39) is irrelevant under vitest.
//   - The DB side already isolates via `holocron_rag_test` (separate from
//     dev `holocron_rag`) and TRUNCATEs each test. This harness mirrors
//     that pattern for the fs side: each test gets its own `makeProjectsRoot()`,
//     fully cleaned up by `cleanupProjectsRoot()`.

import fs from 'fs'
import path from 'path'
import { promises as fsp } from 'fs'
import { ragQuery } from '../src/main/ragDb'
import {
  makeProjectsRoot,
  cleanupProjectsRoot,
  setConfig,
  truncateAll,
  seedDomaine,
  seedNamespace,
  seedDocument,
  makeThreadFolder,
  writeFile as writeThreadFile,
  exists,
} from './helpers'

// ── Workspace tree (Domaine → Project → Thread → file) ─────────────────────

export interface WorkspaceTree {
  projectsRoot: string
  domaineId:    string
  domaineName:  string
  projectName:  string
  threadName:   string
  threadPath:   string
}

/** Sets up a tmp projectsRoot, seeds a Domaine + namespace + thread folder,
 *  syncs config so any main-side code that reads `cfg.projectsRoot` sees
 *  this tree. Returns the resolved paths + ids. Pair with the matching
 *  `cleanupWorkspaceTree()` to fully tear down (fs side; DB side is handled
 *  by the test's `beforeEach(truncateAll)`). */
export async function setupWorkspaceTree(opts?: {
  domaineName?: string
  projectName?: string
  threadName?:  string
}): Promise<WorkspaceTree> {
  const projectsRoot = makeProjectsRoot()
  const domaineName  = opts?.domaineName ?? 'TestDomaine'
  const projectName  = opts?.projectName ?? 'TestProject'
  const threadName   = opts?.threadName  ?? 'TestThread'

  setConfig({
    projectsRoot,
    holocronRoot: projectsRoot,
    workspace: { path: projectsRoot },
  })

  const domaineId = await seedDomaine(domaineName)
  await seedNamespace(projectName, domaineId)
  const threadPath = makeThreadFolder(projectsRoot, domaineName, projectName, threadName)

  return { projectsRoot, domaineId, domaineName, projectName, threadName, threadPath }
}

export function cleanupWorkspaceTree(tree: WorkspaceTree): void {
  cleanupProjectsRoot(tree.projectsRoot)
}

// ── File operations (sync convenience wrappers) ────────────────────────────

/** Writes a file at <threadPath>/<name> with content; returns the absolute
 *  path. Re-exported from helpers.ts as a stable alias so future fs-side
 *  tests don't import both files. */
export const writeFileInThread = writeThreadFile

/** Deletes a file at the given absolute path. No-op if missing. */
export function deleteFile(p: string): void {
  try { fs.rmSync(p) } catch { /* missing is fine */ }
}

/** Moves a file from src → dest atomically (single-volume only — the Session
 *  6 move-to-thread path adds EXDEV→copy+unlink fallback for cross-device.
 *  Tests stay single-volume under tmp so the simple form is sufficient). */
export async function moveFile(src: string, dest: string): Promise<void> {
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await fsp.rename(src, dest)
}

/** Re-exported for callsite ergonomics — `exists` is the same predicate
 *  used by every fs-side test. */
export { exists }

// ── DB-state utilities scoped to the fs layer ──────────────────────────────

/** Flips `rag_documents.is_active` for a row by source_path. Tests use this
 *  to simulate the `chokidar unlink → deleteDocument` soft-delete that
 *  happens between an `add` event being enqueued and the ingest job finally
 *  reaching the wikilink-writeback step. */
export async function setDocActiveByPath(
  sourcePath: string,
  active: boolean,
): Promise<void> {
  await ragQuery(
    `UPDATE rag_documents SET is_active = $1 WHERE source_path = $2`,
    [active, sourcePath],
  )
}

/** Returns true iff a row exists in `rag_documents` for the given
 *  source_path AND is_active = TRUE. Mirrors the exact SQL shape used by
 *  the wikilink-writeback guard at ragIngest.ts:732. Tests assert against
 *  this to prove guard preconditions hold/fail as expected. */
export async function isDocActiveAtPath(sourcePath: string): Promise<boolean> {
  const res = await ragQuery<{ id: string }>(
    `SELECT id::text FROM rag_documents WHERE source_path = $1 AND is_active = true LIMIT 1`,
    [sourcePath],
  )
  return (res?.rowCount ?? 0) > 0
}

// ── Chokidar-event simulation (no real watcher) ────────────────────────────

/** Fake chokidar event shape — narrow enough for tests that drive the
 *  workspace-onFileEvent handler directly without instantiating a watcher.
 *  Real chokidar emits the same string event names ('add' / 'change' /
 *  'unlink') with the same string-path payload. */
export type FsEvent =
  | { type: 'add';    path: string }
  | { type: 'change'; path: string }
  | { type: 'unlink'; path: string }

/** Sleep helper for tests that need to defer past a debounce window. Use
 *  sparingly — most fs-side tests should drive handlers synchronously
 *  rather than wait on real timing. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Re-exports — one-stop import for fs-side test suites ───────────────────

export { truncateAll, seedDomaine, seedNamespace, seedDocument }
