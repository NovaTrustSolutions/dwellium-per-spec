import fs from 'fs/promises'
import path from 'path'
import { ragQuery, withRagClient } from './ragDb'
import { withRenameLock } from './workspace'
import { loadConfig, saveConfig } from './config'
import { deleteSourcelessWikiPages } from './cleanupOps'
import {
  ActiveStateError,
  cascadeUpdateContinuedFrom,
} from './orgOps'

// ── Types ─────────────────────────────────────────────────────────────────

export interface DomaineRow {
  id:           string
  name:         string
  description:  string | null
  color:        string | null
  position:     number
  created_at:   string
  projectCount: number
}

export interface CreateDomaineArgs {
  name:         string
  description?: string
  color?:       string
}

export interface UpdateDomaineArgs {
  id:           string
  name?:        string
  description?: string | null
  color?:       string | null
  position?:    number
}

/** Options for the Domaine delete flow. Two explicit paths:
 *   - reassign: every project under this Domaine moves to `targetDomaineId`.
 *               Filesystem folders move accordingly.
 *   - purge:    irreversible. Every project + thread + document on disk and
 *               in DB is deleted. Requires the user to type the source
 *               Domaine name as confirmation.
 *  No fallback to General exists — General has been removed entirely.
 */
export type DeleteDomaineOptions =
  | { mode: 'reassign'; targetDomaineId: string }
  | { mode: 'purge';    confirmName:     string }

export interface DeleteDomaineResult {
  ok:          boolean
  reassigned?: number  // projects moved (reassign mode)
  purgedDocs?: number  // docs deleted (purge mode)
  error?:      string
}

export interface RenameSummary {
  documentCount: number
  projectCount:  number
}

// ── Internal helpers ─────────────────────────────────────────────────────

function isValidDomaineName(name: string): { ok: boolean; error?: string } {
  if (!name || name.trim() !== name) return { ok: false, error: 'Name cannot be empty or have leading/trailing whitespace' }
  if (name.startsWith('.')) return { ok: false, error: 'Name cannot start with a dot' }
  if (/[/\\:*?"<>|]/.test(name)) return { ok: false, error: 'Name contains invalid characters' }
  if (name === '.' || name === '..') return { ok: false, error: 'Reserved name' }
  if (name.length > 100) return { ok: false, error: 'Name too long (>100 chars)' }
  // Reserve the legacy default — even though General is gone, a user
  // creating one would be confusing during the transition window.
  if (name === 'General') return { ok: false, error: '"General" is a reserved legacy name; pick a different name' }
  return { ok: true }
}

// ── List / read ───────────────────────────────────────────────────────────

/**
 * Returns the project-name → domaine_id mapping for every namespace row.
 * Used by the renderer to resolve which Domaine any given document belongs
 * to without a per-document round-trip. Rows with NULL domaine_id (bridges)
 * are excluded — the renderer's bridge logic doesn't need them.
 */
export async function listProjectDomaineMap(): Promise<Array<{ name: string; domaine_id: string }>> {
  const res = await ragQuery<{ name: string; domaine_id: string }>(
    `SELECT name, domaine_id::text FROM rag_namespaces WHERE domaine_id IS NOT NULL`,
  )
  return res?.rows ?? []
}

/**
 * List Domaines. If `projectsRoot` is provided, rows whose folder does not
 * exist on disk are dropped (zombie rows from interrupted creates or
 * out-of-band fs deletes). If `projectsRoot` is empty the disk filter is
 * skipped — the UI then shows what's in the DB so the user has something to
 * act on (rename / delete) when the workspace is unset.
 */
export async function listDomaines(projectsRoot?: string): Promise<DomaineRow[]> {
  const res = await ragQuery<DomaineRow>(`
    SELECT d.id::text,
           d.name,
           d.description,
           d.color,
           d.position,
           d.created_at::text,
           COALESCE(n.cnt, 0)::int AS "projectCount"
    FROM rag_domaines d
    LEFT JOIN (
      SELECT domaine_id, COUNT(*) AS cnt
      FROM rag_namespaces
      WHERE domaine_id IS NOT NULL
        AND name NOT IN ('__library__', '__inbox__')
      GROUP BY domaine_id
    ) n ON n.domaine_id = d.id
    ORDER BY d.position ASC, d.name ASC
  `)
  const rows = res?.rows ?? []
  if (!projectsRoot) return rows
  const out: DomaineRow[] = []
  for (const r of rows) {
    try {
      const st = await fs.stat(path.join(projectsRoot, r.name))
      if (st.isDirectory()) out.push(r)
    } catch { /* missing folder — drop the zombie row */ }
  }
  return out
}

export async function getDomaineById(id: string): Promise<DomaineRow | null> {
  const res = await ragQuery<DomaineRow>(`
    SELECT d.id::text,
           d.name,
           d.description,
           d.color,
           d.position,
           d.created_at::text,
           COALESCE(n.cnt, 0)::int AS "projectCount"
    FROM rag_domaines d
    LEFT JOIN (
      SELECT domaine_id, COUNT(*) AS cnt
      FROM rag_namespaces
      WHERE domaine_id IS NOT NULL
        AND name NOT IN ('__library__', '__inbox__')
      GROUP BY domaine_id
    ) n ON n.domaine_id = d.id
    WHERE d.id = $1
    LIMIT 1
  `, [id])
  return res?.rows[0] ?? null
}

/** Cheap pre-fetch for the rename modal. Counts the documents that would
 *  have their source_path rewritten if this Domaine's folder is renamed. */
export async function getRenameSummary(domaineId: string, projectsRoot: string): Promise<RenameSummary> {
  const dom = await getDomaineById(domaineId)
  if (!dom || !projectsRoot) return { documentCount: 0, projectCount: 0 }
  const prefix = path.join(projectsRoot, dom.name) + path.sep
  const docs = await ragQuery<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM rag_documents WHERE source_path LIKE $1`,
    [prefix + '%'],
  )
  return {
    documentCount: Number(docs?.rows[0]?.cnt ?? '0'),
    projectCount:  dom.projectCount,
  }
}

// ── Create / update ───────────────────────────────────────────────────────

/** Create a Domaine: filesystem folder + DB row. Atomic-ish: fs first, DB
 *  second — if DB insert fails, the folder is rmdir'd.
 *
 *  Heavily traced (`[createDomaine]` prefix) because Bug 1 keeps recurring
 *  in stress tests with no obvious root cause. Every branch logs so the
 *  next failure produces a stack we can act on. */
export async function createDomaine(
  args: CreateDomaineArgs,
  projectsRoot: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  console.log('[createDomaine] called', { name: args.name, projectsRoot, hasDesc: !!args.description, hasColor: !!args.color })

  if (!projectsRoot) {
    console.warn('[createDomaine] refused: projectsRoot is empty')
    return { ok: false, error: 'Workspace folder not set' }
  }
  const valid = isValidDomaineName(args.name)
  if (!valid.ok) {
    console.warn('[createDomaine] refused: invalid name', { name: args.name, error: valid.error })
    return { ok: false, error: valid.error }
  }

  // Verify the workspace root itself exists — fs.mkdir with `recursive: false`
  // throws ENOENT if any parent is missing, and the existing rollback can't
  // distinguish that case from a true conflict.
  try {
    const st = await fs.stat(projectsRoot)
    if (!st.isDirectory()) {
      console.warn('[createDomaine] refused: projectsRoot is not a directory', { projectsRoot })
      return { ok: false, error: `Workspace path is not a directory: ${projectsRoot}` }
    }
  } catch (err) {
    console.warn('[createDomaine] refused: projectsRoot does not exist', { projectsRoot, error: (err as Error).message })
    return { ok: false, error: `Workspace folder does not exist on disk: ${projectsRoot}` }
  }

  const folderPath = path.join(projectsRoot, args.name)
  console.log('[createDomaine] target folderPath:', folderPath)

  // Refuse if a folder already exists at this path
  try {
    await fs.access(folderPath)
    console.warn('[createDomaine] refused: folder already exists', { folderPath })
    return { ok: false, error: `A folder named "${args.name}" already exists in the workspace` }
  } catch { /* good — target is free */ }

  // Refuse if a Domaine with this name already exists in DB (will also be
  // caught by INSERT UNIQUE, but earlier feedback is cleaner)
  const dupe = await ragQuery<{ id: string }>(
    `SELECT id FROM rag_domaines WHERE name = $1 LIMIT 1`,
    [args.name],
  )
  if (dupe?.rows[0]) {
    console.warn('[createDomaine] refused: DB row already exists', { name: args.name, existingId: dupe.rows[0].id })
    return { ok: false, error: `A Domaine named "${args.name}" already exists` }
  }

  let folderCreated = false
  try {
    console.log('[createDomaine] mkdir →', folderPath)
    await fs.mkdir(folderPath, { recursive: false })
    folderCreated = true
    console.log('[createDomaine] mkdir OK')

    // Verify the folder actually landed on disk before writing the DB row.
    // Defends against weird fs racy conditions where mkdir resolves but
    // chokidar / iCloud / antivirus removes the dir before we can use it.
    try {
      const st = await fs.stat(folderPath)
      if (!st.isDirectory()) throw new Error('Created folder is not a directory')
      console.log('[createDomaine] post-mkdir stat OK', { folderPath })
    } catch (err) {
      console.error('[createDomaine] post-mkdir stat FAILED', { folderPath, error: (err as Error).message })
      throw err
    }

    console.log('[createDomaine] INSERT rag_domaines', { name: args.name })
    const res = await ragQuery<{ id: string }>(
      `INSERT INTO rag_domaines (name, description, color)
       VALUES ($1, $2, $3)
       RETURNING id::text`,
      [args.name, args.description ?? null, args.color ?? null],
    )
    const id = res?.rows[0]?.id
    if (!id) {
      console.error('[createDomaine] INSERT returned no id', { res })
      throw new Error('Insert returned no id')
    }
    console.log('[createDomaine] OK', { id, folderPath })
    return { ok: true, id }
  } catch (err) {
    console.error('[createDomaine] FAILED', { name: args.name, folderCreated, error: (err as Error).message })
    if (folderCreated) {
      await fs.rmdir(folderPath).catch((e) => console.warn('[createDomaine] rollback rmdir failed:', (e as Error).message))
    }
    return { ok: false, error: (err as Error).message }
  }
}

/** Update a Domaine. Renaming triggers a full filesystem rename + cascade:
 *  source_path REPLACE for every doc under the Domaine, continuedFrom
 *  threadPath cascade for descendants, and an active-config rewrite if
 *  needed. Description / color updates are simple SQL. */
export async function updateDomaine(
  args: UpdateDomaineArgs,
  projectsRoot: string,
): Promise<{ ok: boolean; error?: string }> {
  // Description / color / position only — no folder ops needed.
  const noFsChange = args.name === undefined
  if (noFsChange) {
    const sets: string[] = []
    const vals: unknown[] = []
    let n = 1
    if (args.description !== undefined) { sets.push(`description = $${n++}`); vals.push(args.description) }
    if (args.color       !== undefined) { sets.push(`color = $${n++}`);       vals.push(args.color) }
    if (args.position    !== undefined) { sets.push(`position = $${n++}`);    vals.push(args.position) }
    if (sets.length === 0) return { ok: true }
    vals.push(args.id)
    try {
      await ragQuery(`UPDATE rag_domaines SET ${sets.join(', ')} WHERE id = $${n}`, vals)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  // Name change — full rename flow.
  const newName = args.name!.trim()
  const valid = isValidDomaineName(newName)
  if (!valid.ok) return { ok: false, error: valid.error }
  if (!projectsRoot) return { ok: false, error: 'Workspace folder not set' }

  const current = await getDomaineById(args.id)
  if (!current) return { ok: false, error: 'Domaine not found' }
  if (current.name === newName) {
    // Just description/color/position via the same call
    const sets: string[] = []
    const vals: unknown[] = []
    let n = 1
    if (args.description !== undefined) { sets.push(`description = $${n++}`); vals.push(args.description) }
    if (args.color       !== undefined) { sets.push(`color = $${n++}`);       vals.push(args.color) }
    if (args.position    !== undefined) { sets.push(`position = $${n++}`);    vals.push(args.position) }
    if (sets.length === 0) return { ok: true }
    vals.push(args.id)
    await ragQuery(`UPDATE rag_domaines SET ${sets.join(', ')} WHERE id = $${n}`, vals)
    return { ok: true }
  }

  // Conflict check
  const dupe = await ragQuery<{ id: string }>(
    `SELECT id FROM rag_domaines WHERE name = $1 AND id <> $2 LIMIT 1`,
    [newName, args.id],
  )
  if (dupe?.rows[0]) return { ok: false, error: `A Domaine named "${newName}" already exists` }

  const oldFolder = path.join(projectsRoot, current.name)
  const newFolder = path.join(projectsRoot, newName)
  let oldFolderExists = false
  try { await fs.access(oldFolder); oldFolderExists = true } catch { /* folder may not exist if no projects yet */ }
  let newFolderExists = false
  try { await fs.access(newFolder); newFolderExists = true } catch { /* good */ }
  if (newFolderExists) return { ok: false, error: `A folder named "${newName}" already exists in the workspace` }

  return await withRenameLock(async () => {
    try {
      // 1. Filesystem rename (only if folder exists — Domaines without
      //    projects don't have folders on disk yet).
      if (oldFolderExists) {
        await fs.rename(oldFolder, newFolder)
      }

      // 2. Cascade descendants' continuedFrom.threadPath
      if (oldFolderExists) {
        const oldPrefix = oldFolder + path.sep
        const newPrefix = newFolder + path.sep
        await cascadeUpdateContinuedFrom(projectsRoot, (cf) => {
          if (cf.threadPath === oldFolder) return { ...cf, threadPath: newFolder }
          if (cf.threadPath.startsWith(oldPrefix)) {
            return { ...cf, threadPath: newPrefix + cf.threadPath.slice(oldPrefix.length) }
          }
          return cf
        })
      }

      // 3. SQL — update Domaine name + every doc's source_path under it
      await withRagClient(async (client) => {
        await client.query('BEGIN')
        try {
          await client.query(`UPDATE rag_domaines SET name = $1 WHERE id = $2`, [newName, args.id])
          if (oldFolderExists) {
            const oldPrefix = oldFolder + path.sep
            const newPrefix = newFolder + path.sep
            await client.query(
              `UPDATE rag_documents
                 SET source_path = REPLACE(source_path, $1, $2)
               WHERE source_path LIKE $3`,
              [oldPrefix, newPrefix, oldPrefix + '%'],
            )
          }
          // Description / color / position
          if (args.description !== undefined) await client.query(`UPDATE rag_domaines SET description = $1 WHERE id = $2`, [args.description, args.id])
          if (args.color       !== undefined) await client.query(`UPDATE rag_domaines SET color = $1 WHERE id = $2`, [args.color, args.id])
          if (args.position    !== undefined) await client.query(`UPDATE rag_domaines SET position = $1 WHERE id = $2`, [args.position, args.id])
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK').catch(() => { /* swallow */ })
          throw err
        }
      })

      // 4. Active config rewrite if needed
      if (oldFolderExists) {
        const cfg = loadConfig()
        const oldPrefix = oldFolder + path.sep
        const newPrefix = newFolder + path.sep
        let dirty = false
        if (cfg.activeProjectPath === oldFolder) { cfg.activeProjectPath = newFolder; dirty = true }
        else if (cfg.activeProjectPath && cfg.activeProjectPath.startsWith(oldPrefix)) {
          cfg.activeProjectPath = newPrefix + cfg.activeProjectPath.slice(oldPrefix.length); dirty = true
        }
        if (cfg.activeThreadPath === oldFolder) { cfg.activeThreadPath = newFolder; dirty = true }
        else if (cfg.activeThreadPath && cfg.activeThreadPath.startsWith(oldPrefix)) {
          cfg.activeThreadPath = newPrefix + cfg.activeThreadPath.slice(oldPrefix.length); dirty = true
        }
        if (dirty) saveConfig(cfg)
      }

      return { ok: true }
    } catch (err) {
      if (err instanceof ActiveStateError) return { ok: false, error: err.message }
      return { ok: false, error: (err as Error).message }
    }
  })
}

// ── Delete ────────────────────────────────────────────────────────────────
// Two explicit modes — no fallback exists.
//   reassign: move every project to a target Domaine. Folders are moved.
//   purge:    delete everything (folders + DB rows + orphan sweep).
// ─────────────────────────────────────────────────────────────────────────

export async function deleteDomaine(
  id: string,
  options: DeleteDomaineOptions,
  projectsRoot: string,
): Promise<DeleteDomaineResult> {
  if (!projectsRoot) return { ok: false, error: 'Workspace folder not set' }
  const source = await getDomaineById(id)
  if (!source) return { ok: false, error: 'Domaine not found' }

  if (options.mode === 'reassign') {
    return await deleteDomaineReassign(source, options.targetDomaineId, projectsRoot)
  }
  return await deleteDomainePurge(source, options.confirmName, projectsRoot)
}

async function deleteDomaineReassign(
  source: DomaineRow,
  targetDomaineId: string,
  projectsRoot: string,
): Promise<DeleteDomaineResult> {
  if (targetDomaineId === source.id) return { ok: false, error: 'Cannot reassign to the same Domaine' }

  const target = await getDomaineById(targetDomaineId)
  if (!target) return { ok: false, error: 'Target Domaine not found' }

  const sourceFolder = path.join(projectsRoot, source.name)
  const targetFolder = path.join(projectsRoot, target.name)

  return await withRenameLock(async () => {
    try {
      // Make sure the target Domaine folder exists (Domaine folders are
      // created on demand — target may not have a folder yet).
      await fs.mkdir(targetFolder, { recursive: true })

      // Move each project folder from source/ to target/ (atomic per project).
      let reassigned = 0
      let projectsToMove: string[] = []
      try {
        const entries = await fs.readdir(sourceFolder, { withFileTypes: true })
        projectsToMove = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
      } catch { /* source folder may not exist; nothing to move */ }

      for (const projectName of projectsToMove) {
        const oldProjectPath = path.join(sourceFolder, projectName)
        const newProjectPath = path.join(targetFolder, projectName)
        // Refuse this project if target collides
        try {
          await fs.access(newProjectPath)
          return { ok: false, error: `Target Domaine already has a project named "${projectName}"; resolve the conflict first` }
        } catch { /* good */ }

        await fs.rename(oldProjectPath, newProjectPath)
        reassigned++

        // Cascade descendants
        const oldPrefix = oldProjectPath + path.sep
        const newPrefix = newProjectPath + path.sep
        await cascadeUpdateContinuedFrom(projectsRoot, (cf) => {
          if (cf.threadPath === oldProjectPath) return { ...cf, threadPath: newProjectPath }
          if (cf.threadPath.startsWith(oldPrefix)) {
            return { ...cf, threadPath: newPrefix + cf.threadPath.slice(oldPrefix.length) }
          }
          return cf
        })

        // Update doc source_paths
        await ragQuery(
          `UPDATE rag_documents
              SET source_path = REPLACE(source_path, $1, $2)
            WHERE source_path LIKE $3`,
          [oldPrefix, newPrefix, oldPrefix + '%'],
        )
      }

      // Reassign namespace rows + drop the source Domaine row
      await withRagClient(async (client) => {
        await client.query('BEGIN')
        try {
          await client.query(
            `UPDATE rag_namespaces SET domaine_id = $1 WHERE domaine_id = $2`,
            [targetDomaineId, source.id],
          )
          await client.query(`DELETE FROM rag_domaines WHERE id = $1`, [source.id])
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK').catch(() => { /* swallow */ })
          throw err
        }
      })

      // Source Domaine folder should now be empty — rmdir best-effort
      try { await fs.rmdir(sourceFolder) } catch { /* might still have hidden files; leave as-is */ }

      // Active config rewrite if needed
      const cfg = loadConfig()
      const oldDomPrefix = sourceFolder + path.sep
      const newDomPrefix = targetFolder + path.sep
      let dirty = false
      if (cfg.activeProjectPath && cfg.activeProjectPath.startsWith(oldDomPrefix)) {
        cfg.activeProjectPath = newDomPrefix + cfg.activeProjectPath.slice(oldDomPrefix.length); dirty = true
      }
      if (cfg.activeThreadPath && cfg.activeThreadPath.startsWith(oldDomPrefix)) {
        cfg.activeThreadPath = newDomPrefix + cfg.activeThreadPath.slice(oldDomPrefix.length); dirty = true
      }
      if (dirty) saveConfig(cfg)

      return { ok: true, reassigned }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

async function deleteDomainePurge(
  source: DomaineRow,
  confirmName: string,
  projectsRoot: string,
): Promise<DeleteDomaineResult> {
  if (confirmName !== source.name) return { ok: false, error: 'Confirmation name does not match' }

  const sourceFolder = path.join(projectsRoot, source.name)
  const sourcePrefix = sourceFolder + path.sep

  return await withRenameLock(async () => {
    try {
      // Wipe filesystem (irreversible). recursive + force tolerates missing.
      await fs.rm(sourceFolder, { recursive: true, force: true })

      // SQL: delete every doc under this Domaine path + every namespace row
      // assigned to this Domaine + the Domaine row itself + orphan sweep.
      const purgedDocs = await withRagClient(async (client) => {
        await client.query('BEGIN')
        try {
          const docRes = await client.query(
            `DELETE FROM rag_documents WHERE source_path LIKE $1`,
            [sourcePrefix + '%'],
          )
          await client.query(`DELETE FROM rag_namespaces WHERE domaine_id = $1`, [source.id])
          await client.query(`DELETE FROM rag_domaines WHERE id = $1`, [source.id])
          await client.query('COMMIT')
          return docRes.rowCount ?? 0
        } catch (err) {
          await client.query('ROLLBACK').catch(() => { /* swallow */ })
          throw err
        }
      })

      // Orphan sweep — tags + tier-aware wiki sweep via cleanupOps. The
      // wiki sweep handles all three tiers + unlinks disk files + drops
      // corresponding rag_documents rows.
      await ragQuery(`
        DELETE FROM rag_tags
         WHERE id NOT IN (SELECT DISTINCT tag_id FROM rag_document_tags WHERE tag_id IS NOT NULL)
      `).catch((err) => console.warn('[purgeDomaine] orphan-tag sweep failed:', (err as Error).message))
      await deleteSourcelessWikiPages()
        .catch((err) => console.warn('[purgeDomaine] orphan-wiki sweep failed:', (err as Error).message))

      // Active config: clear if it pointed into the purged Domaine
      const cfg = loadConfig()
      let dirty = false
      if (cfg.activeProjectPath && (cfg.activeProjectPath === sourceFolder || cfg.activeProjectPath.startsWith(sourcePrefix))) {
        cfg.activeProjectName = ''; cfg.activeProjectPath = ''; dirty = true
      }
      if (cfg.activeThreadPath && (cfg.activeThreadPath === sourceFolder || cfg.activeThreadPath.startsWith(sourcePrefix))) {
        cfg.activeThreadName = ''; cfg.activeThreadPath = ''; dirty = true
      }
      if (dirty) saveConfig(cfg)

      return { ok: true, purgedDocs: purgedDocs ?? 0 }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
