import fs from 'fs/promises'
import path from 'path'
import { withRagClient } from './ragDb'
import { loadConfig, saveConfig, syncWorkspaceRoots } from './config'

/**
 * Per-table delete counts + folder count returned by `nuclearReset`. Shape
 * mirrors the user-facing summary line shown in the Maintenance tab.
 */
export interface NuclearResetSummary {
  documents:      number
  tags:           number
  wikiPages:      number
  syntheses:      number
  operations:     number
  domaines:       number
  namespaces:     number
  foldersRemoved: number
}

/** Empty summary used for the early-bail no-pool case. */
const EMPTY_SUMMARY: NuclearResetSummary = {
  documents:      0,
  tags:           0,
  wikiPages:      0,
  syntheses:      0,
  operations:     0,
  domaines:       0,
  namespaces:     0,
  foldersRemoved: 0,
}

/**
 * Wipe back to the clean-slate state captured at the end of HANDOFF_v12:
 *   - TRUNCATE the five content tables (CASCADE clears document_tags,
 *     relationships, wiki_page_sources, etc.).
 *   - DELETE every row from rag_domaines.
 *   - DELETE every namespace EXCEPT the bridges (__library__, __inbox__) so
 *     ingestion of Library / Inbox docs still has a row to attach to.
 *   - Clear activeProject and activeThread config keys (preserves API keys,
 *     workspace path, appearance, agent config, etc.).
 *   - Recursively remove every subdir under projectsRoot, keeping the root
 *     directory itself. We only scrub direct subdirs of projectsRoot; the
 *     Wiki cache under _Codex/Wiki/ sits outside projectsRoot and is left
 *     alone here.
 *
 * Returns per-table delete counts + the number of top-level project folders
 * removed. SQL runs in a single transaction; fs scrub runs after — if SQL
 * fails the disk is untouched. If fs scrub fails halfway, the DB is already
 * empty, the caller should still report the partial summary and the user
 * can re-run the action.
 */
export async function nuclearReset(): Promise<{ ok: boolean; summary: NuclearResetSummary; error?: string }> {
  const cfg = loadConfig()

  // Heal any drift across holocronRoot / projectsRoot / workspace.path
  // BEFORE the fs scrub, so we wipe the folder Andy actually thinks of as
  // "the workspace" — not a stale `projectsRoot` left behind by migration.
  // We don't persist this yet; we save it together with the active-key
  // clear once SQL succeeds.
  const synced = syncWorkspaceRoots(cfg)
  const projectsRoot = synced.config.projectsRoot
  if (synced.changed) {
    console.log('[nuclearReset] Workspace roots out of sync at entry; using', projectsRoot)
  }

  // ── 1. SQL wipe in a single transaction ──────────────────────────────
  const dbResult = await withRagClient(async (client) => {
    await client.query('BEGIN')
    try {
      // Count rows up-front so the summary reflects what was deleted.
      // (TRUNCATE doesn't return a count; pre-count is the simplest path.)
      const counts = await Promise.all([
        client.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM rag_documents`),
        client.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM rag_tags`),
        client.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM rag_wiki_pages`),
        client.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM rag_syntheses`),
        client.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM rag_operations_log`),
        client.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM rag_domaines`),
        client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM rag_namespaces
            WHERE name NOT IN ('__library__', '__inbox__')`,
        ),
      ])

      await client.query(`
        TRUNCATE TABLE rag_documents, rag_tags, rag_wiki_pages, rag_syntheses, rag_operations_log
        RESTART IDENTITY CASCADE
      `)
      // rag_namespaces.domaine_id → rag_domaines(id) has ON DELETE NO ACTION
      // (migration 004 declared REFERENCES without an action). Drop user
      // namespaces BEFORE the Domaine rows they point at, or the second
      // DELETE fails with a FK violation as soon as the workspace has any
      // user project. Bridges (NULL domaine_id) survive both deletes.
      await client.query(
        `DELETE FROM rag_namespaces WHERE name NOT IN ('__library__', '__inbox__')`,
      )
      await client.query(`DELETE FROM rag_domaines`)
      await client.query('COMMIT')

      const n = (i: number): number => Number(counts[i]?.rows[0]?.cnt ?? '0')
      return {
        documents:  n(0),
        tags:       n(1),
        wikiPages:  n(2),
        syntheses:  n(3),
        operations: n(4),
        domaines:   n(5),
        namespaces: n(6),
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => { /* swallow */ })
      throw err
    }
  })

  if (!dbResult) {
    // ragDb pool isn't initialized (no DB URI configured). Surface that
    // clearly — partial reset is worse than no reset, so don't scrub fs.
    return { ok: false, summary: EMPTY_SUMMARY, error: 'Database pool not initialized' }
  }

  // ── 2. Config: clear active-state keys (preserve everything else) ────
  // Mutate the already-synced cfg so the saved snapshot has both the cleared
  // active keys AND the normalized workspace-root trio.
  const outCfg = { ...synced.config }
  outCfg.activeProjectName = ''
  outCfg.activeProjectPath = ''
  outCfg.activeThreadName  = ''
  outCfg.activeThreadPath  = ''
  saveConfig(outCfg)

  // ── 3. Filesystem: rm every subdir under projectsRoot ────────────────
  let foldersRemoved = 0
  if (projectsRoot) {
    try {
      const entries = await fs.readdir(projectsRoot, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isDirectory()) continue
        if (e.name.startsWith('.')) continue  // preserve .DS_Store-style hidden bookkeeping
        const full = path.join(projectsRoot, e.name)
        try {
          await fs.rm(full, { recursive: true, force: true })
          foldersRemoved++
        } catch (err) {
          console.warn('[nuclearReset] rm failed for', full, (err as Error).message)
        }
      }
    } catch (err) {
      console.warn('[nuclearReset] readdir failed for', projectsRoot, (err as Error).message)
    }
  }

  return {
    ok: true,
    summary: { ...dbResult, foldersRemoved },
  }
}
