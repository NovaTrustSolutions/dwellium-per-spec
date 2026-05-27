// V3 — Active-thread purge escape hatch.
//
// `purgeThread(threadPath, confirmName)` must NOT throw ActiveStateError when
// the thread is the active one — typed confirmation has already committed
// the user to destruction. Instead the active config keys are cleared via
// `clearActiveIfMatchesThread` BEFORE the destructive ops.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import { ragQuery } from '../src/main/ragDb'
import { purgeThread } from '../src/main/projectFs'
import {
  truncateAll,
  setConfig,
  readConfig,
  makeProjectsRoot,
  cleanupProjectsRoot,
  seedDomaine,
  seedNamespace,
  seedDocument,
  makeThreadFolder,
  writeFile,
  exists,
} from './helpers'

describe('V3: Thread purge', () => {
  let projectsRoot: string

  beforeEach(async () => {
    await truncateAll()
    projectsRoot = makeProjectsRoot()
    setConfig({ projectsRoot, holocronRoot: projectsRoot, workspace: { path: projectsRoot } })
  })

  afterEach(() => {
    cleanupProjectsRoot(projectsRoot)
  })

  it('purges a non-active thread: folder gone, docs gone', async () => {
    const domaineId = await seedDomaine('Astra')
    await seedNamespace('proj-a', domaineId)
    const threadPath = makeThreadFolder(projectsRoot, 'Astra', 'proj-a', 'thr-1')
    const file = writeFile(threadPath, 'a.md')
    await seedDocument({
      sourcePath: file,
      projectName: 'proj-a',
      threadName: 'thr-1',
    })

    const result = await purgeThread(threadPath, 'thr-1')

    expect(result.ok).toBe(true)
    expect(result.deletedDocs).toBe(1)
    expect(exists(threadPath)).toBe(false)

    const docs = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_documents WHERE source_path LIKE $1`,
      [threadPath + '%'],
    )
    expect(Number(docs?.rows[0]?.cnt)).toBe(0)
  })

  it('escape hatch: purges the active thread without ActiveStateError, clears config', async () => {
    const domaineId = await seedDomaine('Astra')
    await seedNamespace('proj-a', domaineId)
    const threadPath = makeThreadFolder(projectsRoot, 'Astra', 'proj-a', 'thr-1')

    setConfig({
      projectsRoot,
      holocronRoot: projectsRoot,
      workspace: { path: projectsRoot },
      activeProjectName: 'proj-a',
      activeProjectPath: path.join(projectsRoot, 'Astra', 'proj-a'),
      activeThreadName: 'thr-1',
      activeThreadPath: threadPath,
    })

    const result = await purgeThread(threadPath, 'thr-1')

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
    expect(exists(threadPath)).toBe(false)

    const cfg = readConfig()
    expect(cfg.activeThreadName).toBe('')
    expect(cfg.activeThreadPath).toBe('')
    // activeProject keys are intentionally NOT touched by clearActiveIfMatchesThread;
    // the user can still be "in" the project after a thread purge.
    expect(cfg.activeProjectName).toBe('proj-a')
  })

  it('does NOT clear active config when purging a DIFFERENT thread', async () => {
    const domaineId = await seedDomaine('Astra')
    await seedNamespace('proj-a', domaineId)
    const activeThread = makeThreadFolder(projectsRoot, 'Astra', 'proj-a', 'thr-active')
    const purgeMe      = makeThreadFolder(projectsRoot, 'Astra', 'proj-a', 'thr-purge')

    setConfig({
      projectsRoot,
      holocronRoot: projectsRoot,
      workspace: { path: projectsRoot },
      activeThreadName: 'thr-active',
      activeThreadPath: activeThread,
    })

    const result = await purgeThread(purgeMe, 'thr-purge')
    expect(result.ok).toBe(true)

    const cfg = readConfig()
    expect(cfg.activeThreadName).toBe('thr-active')
    expect(cfg.activeThreadPath).toBe(activeThread)
  })

  it('rejects when confirmName does not match', async () => {
    const domaineId = await seedDomaine('Astra')
    await seedNamespace('proj-a', domaineId)
    const threadPath = makeThreadFolder(projectsRoot, 'Astra', 'proj-a', 'thr-1')

    const result = await purgeThread(threadPath, 'wrong-name')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/confirmation/i)
    expect(exists(threadPath)).toBe(true)
  })
})
