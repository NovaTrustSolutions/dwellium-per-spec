// Ingest list filter — wiki domain-leak fix.
//
// `listIngestedDocuments({ domaineId, crossDomaine })` previously let any
// document under a bridge namespace (__library__, __inbox__) flow through
// every Domaine's filter view. Wiki pages compile into __library__ with
// rag_wiki_pages.domaine_id = NULL, so they appeared everywhere — noise.
// Fix: bridge content is still cross-Domaine, but rows with source_type
// 'wiki' only appear when crossDomaine = true.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import { listIngestedDocuments } from '../src/main/ingestQueries'
import {
  truncateAll,
  setConfig,
  makeProjectsRoot,
  cleanupProjectsRoot,
  seedDomaine,
  seedNamespace,
  seedDocument,
} from './helpers'

describe('Ingest filter: wiki vs Domaine scope', () => {
  let projectsRoot: string

  beforeEach(async () => {
    await truncateAll()
    projectsRoot = makeProjectsRoot()
    setConfig({ projectsRoot, holocronRoot: projectsRoot, workspace: { path: projectsRoot } })
  })

  afterEach(() => {
    cleanupProjectsRoot(projectsRoot)
  })

  it('Domaine-scoped view EXCLUDES wiki rows from __library__', async () => {
    const d1 = await seedDomaine('Astra')
    const d2 = await seedDomaine('Other')
    await seedNamespace('proj-a', d1)
    await seedNamespace('proj-b', d2)

    // Astra-domaine doc, Other-domaine doc, and a wiki page in __library__
    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Astra/proj-a/a.md'),
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Other/proj-b/b.md'),
      projectName: 'proj-b',
      threadName: 'thr-1',
    })
    await seedDocument({
      sourcePath: path.join(projectsRoot, '_Codex/Wiki/some-tag.md'),
      projectName: null,
      sourceRoot: 'library',
      sourceType: 'wiki',
      title: 'Some Tag',
    })

    const res = await listIngestedDocuments({ domaineId: d1, crossDomaine: false })
    const titles = res.rows.map((r) => r.title)
    // Astra's doc visible; Other's doc + wiki page filtered out
    expect(titles).toContain('a.md')
    expect(titles).not.toContain('b.md')
    expect(titles).not.toContain('Some Tag')
    // Verify by source_type explicitly
    expect(res.rows.find((r) => r.source_type === 'wiki')).toBeUndefined()
  })

  it('Domaine-scoped view KEEPS non-wiki bridge content (library references, inbox items)', async () => {
    const d1 = await seedDomaine('Astra')
    await seedNamespace('proj-a', d1)

    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Astra/proj-a/a.md'),
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    // Library reference — bridge namespace, NOT wiki
    await seedDocument({
      sourcePath: path.join(projectsRoot, '_Codex/References/ref.md'),
      projectName: null,
      sourceRoot: 'library',
      sourceType: 'reference',
      title: 'Library Ref',
    })
    // Inbox item — bridge namespace, NOT wiki
    await seedDocument({
      sourcePath: path.join(projectsRoot, '_Inbox/note.md'),
      projectName: null,
      sourceRoot: 'inbox',
      sourceType: 'inbox',
      title: 'Inbox Note',
    })

    const res = await listIngestedDocuments({ domaineId: d1, crossDomaine: false })
    const titles = res.rows.map((r) => r.title)
    expect(titles).toContain('a.md')
    expect(titles).toContain('Library Ref')
    expect(titles).toContain('Inbox Note')
  })

  it('crossDomaine view INCLUDES wiki rows', async () => {
    const d1 = await seedDomaine('Astra')
    await seedNamespace('proj-a', d1)

    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Astra/proj-a/a.md'),
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    await seedDocument({
      sourcePath: path.join(projectsRoot, '_Codex/Wiki/some-tag.md'),
      projectName: null,
      sourceRoot: 'library',
      sourceType: 'wiki',
      title: 'Some Tag',
    })

    const res = await listIngestedDocuments({ domaineId: d1, crossDomaine: true })
    const titles = res.rows.map((r) => r.title)
    expect(titles).toContain('a.md')
    expect(titles).toContain('Some Tag')
  })

  it('no domaine scoping at all returns every doc', async () => {
    const d1 = await seedDomaine('Astra')
    const d2 = await seedDomaine('Other')
    await seedNamespace('proj-a', d1)
    await seedNamespace('proj-b', d2)

    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Astra/proj-a/a.md'),
      projectName: 'proj-a',
      threadName: 'thr-1',
    })
    await seedDocument({
      sourcePath: path.join(projectsRoot, 'Other/proj-b/b.md'),
      projectName: 'proj-b',
      threadName: 'thr-1',
    })
    await seedDocument({
      sourcePath: path.join(projectsRoot, '_Codex/Wiki/x.md'),
      projectName: null,
      sourceRoot: 'library',
      sourceType: 'wiki',
      title: 'Wiki X',
    })

    const res = await listIngestedDocuments({})  // no domaineId, no crossDomaine
    expect(res.rows).toHaveLength(3)
  })
})
