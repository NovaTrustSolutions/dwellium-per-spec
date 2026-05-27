// V5 — Wiki bootstrap (three-tier).
//
// Migration 007 replaced tag-anchored wiki pages with a three-tier
// namespace-anchored model: `thread`, `project`, `domaine`. The bootstrap
// iterates each tier in order and compiles any missing pages. These tests
// exercise the alreadyExists path — every expected page is pre-seeded so
// the compile branch (which calls Gemini) never fires.
//
// Compile-success paths aren't covered here; they'd require either a live
// Gemini key or stubbing chat(), and neither fits the no-mocks DB+fs
// directive.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import { tmpdir } from 'os'
import fs from 'fs'
import { bootstrapMissingPages } from '../src/main/ragWiki'
import {
  truncateAll,
  setConfig,
  makeProjectsRoot,
  cleanupProjectsRoot,
  seedDomaine,
  seedNamespace,
  seedDocument,
  seedWikiPage,
} from './helpers'

describe('V5: Wiki bootstrap (three-tier namespace model)', () => {
  let projectsRoot: string
  let wikiCacheDir: string

  beforeEach(async () => {
    await truncateAll()
    projectsRoot = makeProjectsRoot()
    // wikiDirPath() resolves to `<dirname(holocronRoot)>/_Codex/Wiki`.
    // bootstrap only reads/writes disk in the compile branch — but be
    // defensive in case the future test extends to compile.
    wikiCacheDir = path.join(tmpdir(), `holocron-test-wiki-${Date.now()}`)
    fs.mkdirSync(path.join(wikiCacheDir, '_Codex', 'Wiki'), { recursive: true })
    const holocronRoot = path.join(wikiCacheDir, 'projects')
    fs.mkdirSync(holocronRoot, { recursive: true })
    setConfig({
      projectsRoot,
      holocronRoot,
      workspace: { path: holocronRoot },
    })
  })

  afterEach(() => {
    cleanupProjectsRoot(projectsRoot)
    try { fs.rmSync(wikiCacheDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('returns alreadyExists=3 when every tier is pre-seeded', async () => {
    // Domaine "Astra" with a single project "proj-a" containing one thread "thr-1"
    // and one active doc. Pre-seed all three wiki tiers so bootstrap finds
    // each one already present.
    const d1 = await seedDomaine('Astra')
    await seedNamespace('proj-a', d1)
    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Astra/proj-a/thr-1/file.md'),
      projectName: 'proj-a',
      threadName: 'thr-1',
    })

    // v15: tier-2/3 slugs dropped their `_project`/`_domaine` sentinels;
    // tier-2 = `<dn>/<pn>`, tier-3 = `<dn>` (segment count = tier).
    await seedWikiPage({ slug: 'astra/proj-a/thr-1', namespace: 'proj-a', domaineId: d1, tier: 'thread'  })
    await seedWikiPage({ slug: 'astra/proj-a',       namespace: 'proj-a', domaineId: d1, tier: 'project' })
    await seedWikiPage({ slug: 'astra',              namespace: null,    domaineId: d1, tier: 'domaine' })

    const result = await bootstrapMissingPages()

    expect(result.alreadyExists).toBe(3)
    expect(result.compiled).toEqual([])
    expect(result.skipped).toEqual([])
  })

  it('returns 0/0/0 when there are no docs in any thread', async () => {
    const result = await bootstrapMissingPages()
    expect(result.alreadyExists).toBe(0)
    expect(result.compiled).toEqual([])
    expect(result.skipped).toEqual([])
  })

  it('ignores docs with source_type=wiki when iterating tier-1', async () => {
    const d1 = await seedDomaine('Astra')
    await seedNamespace('proj-a', d1)
    // A wiki-typed doc with project/thread names should NOT trigger
    // bootstrap to attempt a thread wiki compile for that thread.
    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Astra/proj-a/thr-wiki/page.md'),
      projectName: 'proj-a',
      threadName: 'thr-wiki',
      sourceType: 'wiki',
    })

    const result = await bootstrapMissingPages()
    expect(result.alreadyExists).toBe(0)
    expect(result.compiled).toEqual([])
    expect(result.skipped).toEqual([])
  })

  it('skips threads whose docs live outside projectsRoot (bridge namespaces)', async () => {
    // Bridge docs (library/inbox) have no Domaine, so no thread wiki
    // should be attempted. Their project/thread name columns may be NULL
    // anyway — the tier-1 query filters those out via IS NOT NULL.
    await seedDocument({
      sourcePath: path.join(projectsRoot, '_Codex/Wiki/floating.md'),
      sourceRoot: 'library',
      sourceType: 'wiki',
    })

    const result = await bootstrapMissingPages()
    expect(result.alreadyExists).toBe(0)
    expect(result.compiled).toEqual([])
    expect(result.skipped).toEqual([])
  })

  it('two threads in the same project: alreadyExists counts both when seeded', async () => {
    const d1 = await seedDomaine('Astra')
    await seedNamespace('proj-a', d1)
    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Astra/proj-a/thr-1/a.md'),
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Astra/proj-a/thr-2/b.md'),
      projectName: 'proj-a',
      threadName: 'thr-2',
    })

    await seedWikiPage({ slug: 'astra/proj-a/thr-1', namespace: 'proj-a', domaineId: d1, tier: 'thread'  })
    await seedWikiPage({ slug: 'astra/proj-a/thr-2', namespace: 'proj-a', domaineId: d1, tier: 'thread'  })
    await seedWikiPage({ slug: 'astra/proj-a',       namespace: 'proj-a', domaineId: d1, tier: 'project' })
    await seedWikiPage({ slug: 'astra',              namespace: null,    domaineId: d1, tier: 'domaine' })

    const result = await bootstrapMissingPages()
    expect(result.alreadyExists).toBe(4)  // 2 thread + 1 project + 1 domaine
    expect(result.compiled).toEqual([])
    expect(result.skipped).toEqual([])
  })
})
