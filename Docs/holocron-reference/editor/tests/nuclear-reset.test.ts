// V4 — Nuclear Reset.
//
// `nuclearReset()` wipes content tables + non-bridge namespaces + domaines,
// preserves __library__ / __inbox__, clears active config keys, and removes
// every subdir of projectsRoot. The returned summary must reflect what was
// deleted.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { ragQuery } from '../src/main/ragDb'
import { nuclearReset } from '../src/main/maintenance'
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
  seedWikiPage,
  makeThreadFolder,
  writeFile,
  exists,
} from './helpers'

describe('V4: Nuclear Reset', () => {
  let projectsRoot: string

  beforeEach(async () => {
    await truncateAll()
    projectsRoot = makeProjectsRoot()
    setConfig({ projectsRoot, holocronRoot: projectsRoot, workspace: { path: projectsRoot } })
  })

  afterEach(() => {
    cleanupProjectsRoot(projectsRoot)
  })

  it('zeros every content table and reports accurate per-table counts', async () => {
    // Seed: 2 domaines × 1 namespace each, 3 docs total, 2 tags, 1 wiki page.
    const d1 = await seedDomaine('Astra')
    const d2 = await seedDomaine('Other')
    await seedNamespace('proj-a', d1)
    await seedNamespace('proj-b', d2)
    const t1 = makeThreadFolder(projectsRoot, 'Astra', 'proj-a', 'thr-1')
    const t2 = makeThreadFolder(projectsRoot, 'Other', 'proj-b', 'thr-1')
    const docA = await seedDocument({
      sourcePath: writeFile(t1, 'a.md'),
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    const docB = await seedDocument({
      sourcePath: writeFile(t1, 'b.md'),
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    await seedDocument({
      sourcePath: writeFile(t2, 'c.md'),
      projectName: 'proj-b',
      threadName: 'thr-1',
    })
    const tagAlpha = await seedTag('alpha')
    const tagBeta  = await seedTag('beta')
    await attachTagToDoc(docA, tagAlpha)
    await attachTagToDoc(docB, tagBeta)
    await seedWikiPage({ slug: 'alpha-slug', title: 'Alpha' })

    const result = await nuclearReset()

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.summary.documents).toBe(3)
    expect(result.summary.tags).toBe(2)
    expect(result.summary.wikiPages).toBe(1)
    expect(result.summary.domaines).toBe(2)
    // namespaces count excludes bridges
    expect(result.summary.namespaces).toBe(2)
    // foldersRemoved counts top-level dirs under projectsRoot (Astra, Other)
    expect(result.summary.foldersRemoved).toBe(2)

    // Tables empty
    for (const tbl of ['rag_documents', 'rag_tags', 'rag_wiki_pages', 'rag_domaines']) {
      const r = await ragQuery<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM ${tbl}`,
      )
      expect(Number(r?.rows[0]?.cnt), `${tbl} should be empty`).toBe(0)
    }
  })

  it('preserves __library__ and __inbox__ bridge namespaces', async () => {
    await seedDomaine('Astra')
    await seedNamespace('proj-a', null)  // a non-bridge namespace

    const result = await nuclearReset()
    expect(result.ok).toBe(true)

    const ns = await ragQuery<{ name: string; is_bridge_namespace: boolean }>(
      `SELECT name, is_bridge_namespace FROM rag_namespaces ORDER BY name`,
    )
    expect(ns?.rows.map((r) => r.name)).toEqual(['__inbox__', '__library__'])
    expect(ns?.rows.every((r) => r.is_bridge_namespace)).toBe(true)
  })

  it('clears active config keys but preserves API keys + workspace path', async () => {
    setConfig({
      projectsRoot,
      holocronRoot: projectsRoot,
      workspace: { path: projectsRoot },
      activeProjectName: 'proj-a',
      activeProjectPath: path.join(projectsRoot, 'Astra', 'proj-a'),
      activeThreadName: 'thr-1',
      activeThreadPath: path.join(projectsRoot, 'Astra', 'proj-a', 'thr-1'),
      ai: {
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-opus-4-7',
        apiKey: 'sk-ant-fake',
        temperature: 0.7,
        maxTokens: 1024,
        contextWindow: 8192,
      },
    })

    const result = await nuclearReset()
    expect(result.ok).toBe(true)

    const cfg = readConfig()
    expect(cfg.activeProjectName).toBe('')
    expect(cfg.activeProjectPath).toBe('')
    expect(cfg.activeThreadName).toBe('')
    expect(cfg.activeThreadPath).toBe('')
    // Preserved
    expect(cfg.projectsRoot).toBe(projectsRoot)
    expect(cfg.ai.apiKey).toBe('sk-ant-fake')
    expect(cfg.ai.model).toBe('claude-opus-4-7')
  })

  it('removes every subdir of projectsRoot but keeps dotfiles and the root itself', async () => {
    fs.mkdirSync(path.join(projectsRoot, 'Astra'), { recursive: true })
    fs.mkdirSync(path.join(projectsRoot, 'Other'), { recursive: true })
    fs.mkdirSync(path.join(projectsRoot, '.DS_Store_dir'), { recursive: true })
    fs.writeFileSync(path.join(projectsRoot, '.DS_Store'), 'fake')

    const result = await nuclearReset()
    expect(result.ok).toBe(true)
    expect(result.summary.foldersRemoved).toBe(2)

    // Root still exists
    expect(exists(projectsRoot)).toBe(true)
    // Non-dotfile subdirs gone
    expect(exists(path.join(projectsRoot, 'Astra'))).toBe(false)
    expect(exists(path.join(projectsRoot, 'Other'))).toBe(false)
    // Dotfile/dot-folder preserved
    expect(exists(path.join(projectsRoot, '.DS_Store_dir'))).toBe(true)
    expect(exists(path.join(projectsRoot, '.DS_Store'))).toBe(true)
  })

  it('returns empty summary cleanly when DB is already empty', async () => {
    // Bridges still exist (re-seeded by truncateAll) but no domaines or docs.
    const result = await nuclearReset()
    expect(result.ok).toBe(true)
    expect(result.summary.documents).toBe(0)
    expect(result.summary.tags).toBe(0)
    expect(result.summary.domaines).toBe(0)
    expect(result.summary.namespaces).toBe(0)
    expect(result.summary.foldersRemoved).toBe(0)
  })
})
