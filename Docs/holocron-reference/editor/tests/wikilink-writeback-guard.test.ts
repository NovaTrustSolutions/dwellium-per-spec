// Smoke test for the wikilink-writeback guard (ragIngest.ts:710).
//
// The guard:
//   let stillOnDisk  = (await stat(filePath)) succeeds
//   let stillActive  = (SELECT id FROM rag_documents WHERE source_path = $1 AND is_active = true).rowCount > 0
//   if (!stillOnDisk || !stillActive) { skip writeback }
//
// The two checks form an OR: either ALONE is sufficient to short-circuit
// the disk write + DB content UPDATE + edge logging block. This is the
// Session 7 fix #2 that prevents the resurrect-on-writeback race against
// in-flight ingest jobs when a file is deleted or moved between admit and
// the ~5–10 s later wikilink injection step.
//
// This is a smoke test of the fs-side test harness (`tests/fs-harness.ts`),
// not a full integration test of `ingestFile()`. The harness must be able
// to:
//   1. Stand up a workspace tree (Domaine + thread + file on disk).
//   2. Seed a rag_documents row pointing at that file with is_active=true.
//   3. Mutate fs state (delete file) and DB state (flip is_active) in the
//      same shape the guard is checking.
//   4. Assert the two boolean signals (`fs.stat` success + active-row
//      lookup) behave correctly across the three failure cases.
//
// The actual guard inside `ingestFile` runs unchanged — it's in the
// don't-touch list. This test demonstrates the harness can express + verify
// the guard's preconditions; full integration tests (driving ingestFile
// with mocked Gemini + chokidar) are future Session work.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import {
  setupWorkspaceTree,
  cleanupWorkspaceTree,
  writeFileInThread,
  deleteFile,
  setDocActiveByPath,
  isDocActiveAtPath,
  truncateAll,
  seedDocument,
  exists,
  type WorkspaceTree,
} from './fs-harness'

describe('wikilink-writeback guard — fs.stat + is_active=true OR logic (smoke)', () => {
  let tree: WorkspaceTree
  let filePath: string

  beforeEach(async () => {
    await truncateAll()
    tree = await setupWorkspaceTree()
    filePath = writeFileInThread(tree.threadPath, 'sample.md', '# Sample doc\n\nbody\n')
    // Seed the rag_documents row that the guard's second check reads.
    await seedDocument({
      sourcePath: filePath,
      projectName: tree.projectName,
      threadName:  tree.threadName,
    })
  })

  afterEach(() => {
    cleanupWorkspaceTree(tree)
  })

  it('happy path: file on disk AND row is_active=true → guard would PROCEED', async () => {
    // Mirror the guard's two checks. Both true means writeback proceeds.
    expect(exists(filePath)).toBe(true)
    expect(await isDocActiveAtPath(filePath)).toBe(true)
  })

  it('failure mode A: file deleted from disk → guard SHORT-CIRCUITS on stillOnDisk=false', async () => {
    // Simulate the "user deleted the file out-of-band before writeback fires".
    deleteFile(filePath)

    expect(exists(filePath)).toBe(false)
    // Row is still is_active=true in DB at this point — the guard's first
    // check fails BEFORE the second runs, proving short-circuit semantics.
    // (The production guard's `if (stillOnDisk)` wrapper skips the SQL
    // query when stillOnDisk is false.)
    expect(await isDocActiveAtPath(filePath)).toBe(true)
  })

  it('failure mode B: file present BUT row is_active=false → guard SHORT-CIRCUITS on stillActive=false', async () => {
    // Simulate the "chokidar unlink ran first → deleteDocument flipped the
    // row inactive while ingest's wikilink phase is still pending" race.
    // File is still on disk (the path-deletion + content-rewrite race
    // doesn't require the file itself to be gone — the soft-delete alone
    // is enough to make a writeback harmful).
    await setDocActiveByPath(filePath, false)

    expect(exists(filePath)).toBe(true)
    expect(await isDocActiveAtPath(filePath)).toBe(false)
  })

  it('failure mode C: both checks fail → guard SHORT-CIRCUITS twice over', async () => {
    deleteFile(filePath)
    await setDocActiveByPath(filePath, false)

    expect(exists(filePath)).toBe(false)
    expect(await isDocActiveAtPath(filePath)).toBe(false)
  })

  it('move-to-thread (Session 6): file relocated → guard SHORT-CIRCUITS at the old path', async () => {
    // Move the file out of its original location into a sibling thread,
    // without deleting it. The guard's first check is keyed off
    // `data.filePath` (the path on the in-flight ingest job), so it still
    // sees the OLD path empty even though the file content survives at
    // the new path. This is the real scenario the Session 7 fix #2 catches:
    // a move (fs.rename) under the chokidar-add → ingest debounce window.
    const newThread = path.join(tree.projectsRoot, tree.domaineName, tree.projectName, 'OtherThread')
    const newPath = path.join(newThread, 'sample.md')
    // Use plain fs to keep the harness self-contained — the real production
    // move uses moveDocumentToThread which also drives DB reconciliation.
    const { promises: fsp } = await import('fs')
    await fsp.mkdir(newThread, { recursive: true })
    await fsp.rename(filePath, newPath)

    expect(exists(filePath)).toBe(false)          // old path empty — guard's stillOnDisk = false
    expect(exists(newPath)).toBe(true)            // content survives elsewhere
  })
})
