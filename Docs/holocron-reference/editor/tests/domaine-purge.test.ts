// V1 — Domaine purge end-to-end.
//
// `deleteDomaine(id, {mode:'purge', confirmName}, projectsRoot)` must wipe
// the folder, delete every doc under that path, drop the namespace + domaine
// rows, run the orphan-tag sweep, clear active config keys if they point in,
// and leave the __library__ / __inbox__ bridges alone.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { ragQuery } from '../src/main/ragDb'
import { deleteDomaine } from '../src/main/domaineFs'
import {
  truncateAll,
  setConfig,
  readConfig,
  makeProjectsRoot,
  cleanupProjectsRoot,
  seedDomaine,
  seedNamespace,
  seedDocument,
  seedTag,
  attachTagToDoc,
  makeThreadFolder,
  writeFile,
  exists,
} from './helpers'

describe('V1: Domaine purge', () => {
  let projectsRoot: string

  beforeEach(async () => {
    await truncateAll()
    projectsRoot = makeProjectsRoot()
    setConfig({ projectsRoot, holocronRoot: projectsRoot, workspace: { path: projectsRoot } })
  })

  afterEach(() => {
    cleanupProjectsRoot(projectsRoot)
  })

  it('removes folder, all docs, namespace + domaine rows, and runs orphan sweep', async () => {
    // — Seed: one Domaine with one project + one thread + two docs + one tag.
    const domaineId = await seedDomaine('Astra')
    await seedNamespace('proj-a', domaineId)
    const threadPath = makeThreadFolder(projectsRoot, 'Astra', 'proj-a', 'thr-1')
    fs.mkdirSync(path.join(projectsRoot, 'Astra'), { recursive: true })
    const file1 = writeFile(threadPath, 'a.md')
    const file2 = writeFile(threadPath, 'b.md')

    const docA = await seedDocument({
      sourcePath: file1,
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    const docB = await seedDocument({
      sourcePath: file2,
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    const tagId = await seedTag('shared-tag')
    await attachTagToDoc(docA, tagId)
    await attachTagToDoc(docB, tagId)

    // — Call under test
    const result = await deleteDomaine(
      domaineId,
      { mode: 'purge', confirmName: 'Astra' },
      projectsRoot,
    )

    // — Assertions
    expect(result.ok).toBe(true)
    expect(result.purgedDocs).toBe(2)

    // Folder removed
    expect(exists(path.join(projectsRoot, 'Astra'))).toBe(false)

    // No docs under that path remain
    const docsRes = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_documents WHERE source_path LIKE $1`,
      [path.join(projectsRoot, 'Astra') + '%'],
    )
    expect(Number(docsRes?.rows[0]?.cnt)).toBe(0)

    // Namespace row gone
    const nsRes = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_namespaces WHERE name = $1`,
      ['proj-a'],
    )
    expect(Number(nsRes?.rows[0]?.cnt)).toBe(0)

    // Domaine row gone
    const domRes = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_domaines WHERE id = $1`,
      [domaineId],
    )
    expect(Number(domRes?.rows[0]?.cnt)).toBe(0)

    // Orphan-tag sweep: shared-tag has no remaining document_tags rows so it
    // should be deleted.
    const tagRes = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_tags WHERE id = $1`,
      [tagId],
    )
    expect(Number(tagRes?.rows[0]?.cnt)).toBe(0)
  })

  it('rejects when confirmName does not match', async () => {
    const domaineId = await seedDomaine('Astra')
    fs.mkdirSync(path.join(projectsRoot, 'Astra'), { recursive: true })

    const result = await deleteDomaine(
      domaineId,
      { mode: 'purge', confirmName: 'wrong-name' },
      projectsRoot,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/confirmation/i)

    // Side-effect-free: folder + DB row still there
    expect(exists(path.join(projectsRoot, 'Astra'))).toBe(true)
    const domRes = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_domaines WHERE id = $1`,
      [domaineId],
    )
    expect(Number(domRes?.rows[0]?.cnt)).toBe(1)
  })

  it('preserves __library__ and __inbox__ bridge namespaces', async () => {
    const domaineId = await seedDomaine('Astra')
    fs.mkdirSync(path.join(projectsRoot, 'Astra'), { recursive: true })

    await deleteDomaine(
      domaineId,
      { mode: 'purge', confirmName: 'Astra' },
      projectsRoot,
    )

    const bridges = await ragQuery<{ name: string; is_bridge_namespace: boolean }>(
      `SELECT name, is_bridge_namespace FROM rag_namespaces
        WHERE name IN ('__library__', '__inbox__')
        ORDER BY name`,
    )
    expect(bridges?.rows).toHaveLength(2)
    expect(bridges?.rows.every((r) => r.is_bridge_namespace)).toBe(true)
  })

  it('clears activeProject / activeThread when they point into purged Domaine', async () => {
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

    const result = await deleteDomaine(
      domaineId,
      { mode: 'purge', confirmName: 'Astra' },
      projectsRoot,
    )
    expect(result.ok).toBe(true)

    const cfg = readConfig()
    expect(cfg.activeProjectName).toBe('')
    expect(cfg.activeProjectPath).toBe('')
    expect(cfg.activeThreadName).toBe('')
    expect(cfg.activeThreadPath).toBe('')
  })

  it('leaves activeProject untouched when it points to a DIFFERENT Domaine', async () => {
    const purgedId = await seedDomaine('Astra')
    const otherId  = await seedDomaine('Other')
    await seedNamespace('proj-other', otherId)
    const otherThread = makeThreadFolder(projectsRoot, 'Other', 'proj-other', 'thr-1')
    fs.mkdirSync(path.join(projectsRoot, 'Astra'), { recursive: true })

    setConfig({
      projectsRoot,
      holocronRoot: projectsRoot,
      workspace: { path: projectsRoot },
      activeProjectName: 'proj-other',
      activeProjectPath: path.join(projectsRoot, 'Other', 'proj-other'),
      activeThreadName: 'thr-1',
      activeThreadPath: otherThread,
    })

    await deleteDomaine(
      purgedId,
      { mode: 'purge', confirmName: 'Astra' },
      projectsRoot,
    )

    const cfg = readConfig()
    expect(cfg.activeProjectName).toBe('proj-other')
    expect(cfg.activeThreadPath).toBe(otherThread)
  })

  it('returns error when projectsRoot is empty', async () => {
    const domaineId = await seedDomaine('Astra')
    const result = await deleteDomaine(
      domaineId,
      { mode: 'purge', confirmName: 'Astra' },
      '',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/workspace/i)
  })
})
