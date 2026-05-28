// V2 — Project rename (path-based signature).
//
// `renameProject(projectPath, newName)` must:
//   - rename the folder atomically
//   - update each thread.json's `projectName`
//   - rewrite the namespace row scoped by (oldName, domaineId) — NOT all rows
//     with that name (v13 bug-4 collateral-damage fix)
//   - update rag_documents.project_name + source_path for every doc at or
//     under the old path
//   - rewrite activeProject / activeThread config keys when they pointed in

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { ragQuery } from '../src/main/ragDb'
import { renameProject } from '../src/main/projectFs'
import {
  truncateAll,
  setConfig,
  makeProjectsRoot,
  cleanupProjectsRoot,
  seedDomaine,
  seedNamespace,
  seedDocument,
  makeThreadFolder,
  writeFile,
  exists,
} from './helpers'

describe('V2: Project rename', () => {
  let projectsRoot: string

  beforeEach(async () => {
    await truncateAll()
    projectsRoot = makeProjectsRoot()
    setConfig({ projectsRoot, holocronRoot: projectsRoot, workspace: { path: projectsRoot } })
  })

  afterEach(() => {
    cleanupProjectsRoot(projectsRoot)
  })

  it('renames folder, updates thread.json, namespace row, and doc rows', async () => {
    // Seed: domaine + project + thread + two docs
    const domaineId = await seedDomaine('Astra')
    await seedNamespace('proj-orig', domaineId)
    const threadPath = makeThreadFolder(projectsRoot, 'Astra', 'proj-orig', 'thr-1')
    const file1 = writeFile(threadPath, 'a.md')
    const file2 = writeFile(threadPath, 'b.md')
    await seedDocument({
      sourcePath: file1,
      projectName: 'proj-orig',
      threadName: 'thr-1',
    })
    await seedDocument({
      sourcePath: file2,
      projectName: 'proj-orig',
      threadName: 'thr-1',
    })

    const oldProjectPath = path.join(projectsRoot, 'Astra', 'proj-orig')
    const newProjectPath = path.join(projectsRoot, 'Astra', 'proj-renamed')

    // — Call under test
    const result = await renameProject(oldProjectPath, 'proj-renamed')

    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()

    // Folder atomically moved
    expect(exists(oldProjectPath)).toBe(false)
    expect(exists(newProjectPath)).toBe(true)

    // thread.json's projectName cascaded
    const meta = JSON.parse(
      fs.readFileSync(path.join(newProjectPath, 'thr-1', 'thread.json'), 'utf-8'),
    ) as { projectName: string }
    expect(meta.projectName).toBe('proj-renamed')

    // Namespace row name updated for THIS (name, domaine_id) only
    const ns = await ragQuery<{ name: string }>(
      `SELECT name FROM rag_namespaces WHERE domaine_id = $1`,
      [domaineId],
    )
    expect(ns?.rows.map((r) => r.name)).toEqual(['proj-renamed'])

    // No leftover namespace with old name in this Domaine
    const oldNs = await ragQuery<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rag_namespaces
        WHERE name = $1 AND domaine_id = $2`,
      ['proj-orig', domaineId],
    )
    expect(Number(oldNs?.rows[0]?.cnt)).toBe(0)

    // Documents: project_name + source_path updated atomically
    const docs = await ragQuery<{ project_name: string; source_path: string }>(
      `SELECT project_name, source_path FROM rag_documents ORDER BY source_path`,
    )
    expect(docs?.rows).toHaveLength(2)
    for (const row of docs?.rows ?? []) {
      expect(row.project_name).toBe('proj-renamed')
      expect(row.source_path).toContain('/proj-renamed/')
      expect(row.source_path).not.toContain('/proj-orig/')
    }
  })

  it('does NOT touch same-named project in a different Domaine (v13 bug-4 fix)', async () => {
    // Two Domaines each with a 'proj-shared' namespace. Renaming only the
    // first should leave the second's row intact.
    const astraId = await seedDomaine('Astra')
    const otherId = await seedDomaine('Other')
    await seedNamespace('proj-shared', astraId)
    await seedNamespace('proj-shared', otherId)
    makeThreadFolder(projectsRoot, 'Astra', 'proj-shared', 'thr-1')
    makeThreadFolder(projectsRoot, 'Other', 'proj-shared', 'thr-1')
    // Doc in the Other Domaine — must remain attributed to 'proj-shared'
    const otherFile = writeFile(
      path.join(projectsRoot, 'Other', 'proj-shared', 'thr-1'),
      'other.md',
    )
    await seedDocument({
      sourcePath: otherFile,
      projectName: 'proj-shared',
      threadName: 'thr-1',
    })

    const result = await renameProject(
      path.join(projectsRoot, 'Astra', 'proj-shared'),
      'proj-renamed',
    )
    expect(result.ok).toBe(true)

    // Astra's row is renamed
    const astraNs = await ragQuery<{ name: string }>(
      `SELECT name FROM rag_namespaces WHERE domaine_id = $1`,
      [astraId],
    )
    expect(astraNs?.rows.map((r) => r.name)).toEqual(['proj-renamed'])

    // Other's row is untouched
    const otherNs = await ragQuery<{ name: string }>(
      `SELECT name FROM rag_namespaces WHERE domaine_id = $1`,
      [otherId],
    )
    expect(otherNs?.rows.map((r) => r.name)).toEqual(['proj-shared'])

    // Other's doc still says proj-shared and its source_path is unchanged
    const otherDoc = await ragQuery<{ project_name: string; source_path: string }>(
      `SELECT project_name, source_path FROM rag_documents
        WHERE source_path LIKE $1`,
      [path.join(projectsRoot, 'Other') + '%'],
    )
    expect(otherDoc?.rows).toHaveLength(1)
    expect(otherDoc?.rows[0]?.project_name).toBe('proj-shared')
  })

  it('refuses when active thread lives inside the project being renamed', async () => {
    const domaineId = await seedDomaine('Astra')
    await seedNamespace('proj-orig', domaineId)
    const threadPath = makeThreadFolder(projectsRoot, 'Astra', 'proj-orig', 'thr-1')
    const oldProjectPath = path.join(projectsRoot, 'Astra', 'proj-orig')

    // assertNotActiveProject throws when activeThreadPath is inside the target.
    // Rename refuses; folder + DB row stay intact.
    setConfig({
      projectsRoot,
      holocronRoot: projectsRoot,
      workspace: { path: projectsRoot },
      activeThreadName: 'thr-1',
      activeThreadPath: threadPath,
    })

    const result = await renameProject(oldProjectPath, 'proj-renamed')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/active/i)
    expect(exists(oldProjectPath)).toBe(true)
  })

  it('rejects new name that collides with sibling project in same Domaine', async () => {
    const domaineId = await seedDomaine('Astra')
    await seedNamespace('proj-a', domaineId)
    await seedNamespace('proj-b', domaineId)
    makeThreadFolder(projectsRoot, 'Astra', 'proj-a', 'thr-1')
    makeThreadFolder(projectsRoot, 'Astra', 'proj-b', 'thr-1')

    const result = await renameProject(
      path.join(projectsRoot, 'Astra', 'proj-a'),
      'proj-b',
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already exists/i)
  })
})
