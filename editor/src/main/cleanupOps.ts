import fs from 'fs/promises'
import { ragQuery, withRagClient } from './ragDb'
import { wikiDiskPath, slugComponent } from './ragWiki'
import { loadConfig, getWikiCacheDir } from './config'

// ── Types ─────────────────────────────────────────────────────────────────

export interface DeadLink {
  id:          string
  source_path: string
  title:       string
}

export interface OrphanCounts {
  orphanTags:           number
  sourcelessWikiPages:  number
}

export interface HealthSnapshot {
  orphanTags:           number
  deadLinks:            number
  sourcelessWikiPages:  number
}

export interface DeleteDocumentResult {
  ok:              boolean
  deletedDocId:    string | null
  sweptTags:       number
  sweptWikiPages:  number
  error?:          string
}

export interface PurgeDeadLinksResult {
  ok:              boolean
  deleted:         number
  sweptTags:       number
  sweptWikiPages:  number
  error?:          string
}

export interface SweepOrphansResult {
  ok:              boolean
  sweptTags:       number
  sweptWikiPages:  number
  error?:          string
}

export interface ZombieWikiSweepResult {
  /** rag_documents rows of source_type='wiki' deleted because no live
   *  rag_wiki_pages row resolves to their source_path. */
  deletedRows:   number
  /** Disk files (inside _Codex/Wiki/) unlinked for those rows. */
  unlinkedFiles: number
  /** rag_tags rows removed because they were sole-sourced by the deleted
   *  zombie docs (their rag_document_tags links cascade away on doc delete,
   *  leaving the tag definition orphaned otherwise). */
  deletedTags:   number
}

// ── Internal helpers ──────────────────────────────────────────────────────

/** Best-effort unlink — swallows ENOENT so the chokidar-driven path (where
 *  the file is already gone) and the in-app path converge on the same call. */
async function tryUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[cleanupOps] unlink failed:', filePath, (err as Error).message)
    }
  }
}

/** Delete every rag_tags row that no longer has any document linked to it. */
async function deleteOrphanTags(): Promise<number> {
  const res = await ragQuery<{ id: string }>(`
    DELETE FROM rag_tags
    WHERE id NOT IN (SELECT DISTINCT tag_id FROM rag_document_tags WHERE tag_id IS NOT NULL)
    RETURNING id
  `)
  return res?.rowCount ?? 0
}

/** Three-tier orphan sweep across rag_wiki_pages. Bottom-up cascade:
 *    tier 'thread'  — sourceless iff rag_wiki_page_sources has zero rows
 *                     (the original "no source docs left" semantics).
 *    tier 'project' — sourceless iff no surviving tier='thread' row shares
 *                     the same (namespace, domaine_id). Tier-2 sources are
 *                     derivable from rag_wiki_pages — we don't persist
 *                     wiki_page_sources rows for them (see ragWiki.ts) so
 *                     the original "missing wiki_page_sources" check would
 *                     wrongly classify every tier-2 page as sourceless and
 *                     nuke it on first sweep. Same logic for tier-3.
 *    tier 'domaine' — sourceless iff no surviving tier='project' row shares
 *                     the same domaine_id.
 *
 *  For every deleted slug, the disk artifact under `_Codex/Wiki/` is
 *  unlinked AND the corresponding rag_documents row (created when the wiki
 *  was compiled-then-reingested via reingestAsWiki) is dropped. Skipping
 *  that doc cleanup is what produced the v007 "dead link to ai/_domaine.md"
 *  symptom: rag_wiki_pages was deleted, disk file unlinked, but the
 *  rag_documents row pointing at the now-missing file remained.
 */
export async function deleteSourcelessWikiPages(): Promise<number> {
  let total = 0

  // ── tier 1: thread ──
  const t1 = await ragQuery<{ slug: string }>(`
    DELETE FROM rag_wiki_pages
    WHERE tier = 'thread'
      AND id NOT IN (
        SELECT DISTINCT wiki_page_id FROM rag_wiki_page_sources WHERE wiki_page_id IS NOT NULL
      )
    RETURNING slug
  `)
  for (const { slug } of t1?.rows ?? []) {
    await cleanupWikiDiskAndDoc(slug)
    total++
  }

  // ── tier 2: project (after tier-1 sweep so cascading parents catch the
  //    case where a project's last thread wiki just got removed).
  const t2 = await ragQuery<{ slug: string }>(`
    DELETE FROM rag_wiki_pages w2
    WHERE w2.tier = 'project'
      AND NOT EXISTS (
        SELECT 1 FROM rag_wiki_pages w1
        WHERE w1.tier = 'thread'
          AND w1.namespace  = w2.namespace
          AND w1.domaine_id = w2.domaine_id
      )
    RETURNING slug
  `)
  for (const { slug } of t2?.rows ?? []) {
    await cleanupWikiDiskAndDoc(slug)
    total++
  }

  // ── tier 3: domaine ──
  const t3 = await ragQuery<{ slug: string }>(`
    DELETE FROM rag_wiki_pages w3
    WHERE w3.tier = 'domaine'
      AND NOT EXISTS (
        SELECT 1 FROM rag_wiki_pages w2
        WHERE w2.tier = 'project'
          AND w2.domaine_id = w3.domaine_id
      )
    RETURNING slug
  `)
  for (const { slug } of t3?.rows ?? []) {
    await cleanupWikiDiskAndDoc(slug)
    total++
  }

  // Belt-and-suspenders: drop any wiki rag_documents row no longer backed by
  // a live rag_wiki_pages row. Catches slug-rename drift and the migration-007
  // residue (007 wiped rag_wiki_pages but left behind the rag_documents rows
  // that reingestAsWiki had created for the old tag-anchored pages). Best
  // effort — never blocks the page sweep, and the count it returns is logged
  // rather than folded into `total` (different kind of cleanup).
  try {
    const swept = await deleteZombieWikiDocs()
    if (swept.deletedRows > 0) {
      console.log(
        `[cleanupOps] zombie wiki sweep: deleted ${swept.deletedRows} row(s), ${swept.deletedTags} orphan tag(s); unlinked ${swept.unlinkedFiles} file(s)`,
      )
    }
  } catch (err) {
    console.warn('[cleanupOps] zombie wiki sweep failed:', (err as Error).message)
  }

  return total
}

/**
 * Delete every `rag_documents` row with `source_type='wiki'` whose
 * `source_path` does not resolve to a live `rag_wiki_pages` row, and unlink
 * the corresponding disk file under `_Codex/Wiki/`.
 *
 * The set of legitimate wiki-doc paths is `wikiDiskPath(slug)` for each slug
 * in `rag_wiki_pages`. A wiki-typed document outside that set is a zombie:
 * either residue of migration 007 (which cleared `rag_wiki_pages` but not the
 * `rag_documents` rows `reingestAsWiki` had created for the old tag-anchored
 * pages) or drift from a slug rename. Such rows pollute the Codex Graph and
 * the Ingest list with nodes the wiki compiler no longer manages — and after
 * any future migration that touches `rag_wiki_pages` they'd otherwise need
 * manual cleanup. Run on boot (after `bootstrapMissingPages`) and at the tail
 * of `deleteSourcelessWikiPages`.
 *
 * Also cascade-cleans orphan tags: deleting a `rag_documents` row cascades its
 * `rag_document_tags` links away, but the `rag_tags` definition rows survive —
 * so any tag sole-sourced by the deleted zombie docs is left orphaned. Those
 * are swept here (the boot zombie sweep used to leave ≈2 orphan tags per wiki
 * doc — ~314 after the 143-row sweep). To bound the blast radius (and dodge a
 * race with an in-flight `reingestAsWiki`'s tag attach), only tags that were
 * referenced by the deleted docs and now have zero remaining links are removed.
 *
 * Idempotent — a no-op once the workspace is clean. If `holocronRoot` isn't
 * configured the disk paths can't be resolved, so it bails returning zeros
 * (better to leave the rows alone than guess).
 */
export async function deleteZombieWikiDocs(): Promise<ZombieWikiSweepResult> {
  const pagesRes = await ragQuery<{ slug: string }>(`SELECT slug FROM rag_wiki_pages`)
  const slugs = (pagesRes?.rows ?? []).map((r) => r.slug)

  let validPaths: Set<string>
  try {
    validPaths = new Set(slugs.map((s) => wikiDiskPath(s)))
  } catch (err) {
    // holocronRoot not configured — can't decide what's stale. Leave it.
    console.warn('[cleanupOps] deleteZombieWikiDocs: wiki dir unresolved, skipping:', (err as Error).message)
    return { deletedRows: 0, unlinkedFiles: 0, deletedTags: 0 }
  }

  const docsRes = await ragQuery<{ id: string; source_path: string }>(
    `SELECT id::text, source_path FROM rag_documents WHERE source_type = 'wiki'`,
  )
  const stale = (docsRes?.rows ?? []).filter((d) => !validPaths.has(d.source_path))
  if (stale.length === 0) return { deletedRows: 0, unlinkedFiles: 0, deletedTags: 0 }

  const ids = stale.map((d) => d.id)
  // Gather the tags those zombie docs reference BEFORE the delete — the
  // rag_document_tags links cascade away with the doc rows.
  const tagsRes = await ragQuery<{ tag_id: string }>(
    `SELECT DISTINCT tag_id FROM rag_document_tags WHERE document_id = ANY($1::uuid[])`,
    [ids],
  )
  const candidateTagIds = (tagsRes?.rows ?? []).map((r) => r.tag_id)

  const del = await ragQuery(`DELETE FROM rag_documents WHERE id = ANY($1::uuid[])`, [ids])

  // Of the tags those docs touched, drop any now left with zero links.
  let deletedTags = 0
  if (candidateTagIds.length > 0) {
    const tagDel = await ragQuery(
      `DELETE FROM rag_tags t
        WHERE t.id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM rag_document_tags dt WHERE dt.tag_id = t.id)`,
      [candidateTagIds],
    )
    deletedTags = tagDel?.rowCount ?? 0
  }

  // Guard: only unlink files that live under the configured wiki cache
  // dir. Previously this was a hardcoded `/_Codex/Wiki/` substring
  // match, which silently stopped unlinking the moment Andy reconfigured
  // libraryPath (e.g. an iCloud Drive folder whose path doesn't contain
  // `_Codex`). Route through getWikiCacheDir so a user-configured
  // libraryPath is honored. The `_Library/Wiki/` substring is a
  // transitional v14→v15 fallback for any rows still carrying pre-rename
  // paths — safe to drop once we're confident none remain.
  const wikiDir = getWikiCacheDir(loadConfig())
  const wikiPrefix = wikiDir ? wikiDir + '/' : '/_Codex/Wiki/'
  let unlinkedFiles = 0
  for (const d of stale) {
    if (d.source_path.startsWith(wikiPrefix)
      || d.source_path.includes('/_Codex/Wiki/')
      || d.source_path.includes('/_Library/Wiki/')) {
      await tryUnlink(d.source_path)
      unlinkedFiles++
    }
  }
  return { deletedRows: del?.rowCount ?? stale.length, unlinkedFiles, deletedTags }
}

/** v15 one-shot purge of the pre-v15 sentinel-slug wiki pages.
 *
 *  Pre-v15, tier-2 slugs ended in `_project` (e.g. `aidev/astrastrata/_project`)
 *  and tier-3 in `_domaine` (e.g. `aidev/_domaine`). v15 dropped the sentinels:
 *  tier-2 is now `<dn>/<pn>` and tier-3 is now `<dn>`. Existing rows from the
 *  pre-v15 compile path become orphaned because `compileProjectWiki` /
 *  `compileDomaineWiki` look up by the NEW slug and miss them — so they just
 *  sit in `rag_wiki_pages` polluting the Wiki list, and their loop-back
 *  `rag_documents` rows polluting the Graph with "_project" / "_domaine"
 *  node labels.
 *
 *  Sweeps the bad rows + their disk files + their `rag_documents` rows + the
 *  orphan tags those docs sole-sourced. Idempotent — no-op once the corpus is
 *  clean. Designed to run on boot before `bootstrapMissingPages` so the next
 *  bootstrap pass fills in the corrected slugs/titles.
 *
 *  Match rule: slug ENDS IN `_project` or `_domaine` AND slug is at least one
 *  segment long with the sentinel as its LAST segment. A user-named page
 *  that legitimately contains `_project` mid-slug wouldn't match (unrealistic
 *  edge case — slugComponent strips leading-underscore identifiers anyway). */
export async function purgeLegacySentinelWikiPages(): Promise<{
  deletedPages: number
  deletedDocs:  number
  deletedTags:  number
}> {
  const res = await ragQuery<{ slug: string }>(`
    DELETE FROM rag_wiki_pages
    WHERE slug LIKE '%/_project' OR slug LIKE '%/_domaine' OR slug = '_domaine'
    RETURNING slug
  `)
  const slugs = (res?.rows ?? []).map((r) => r.slug)
  if (slugs.length === 0) {
    return { deletedPages: 0, deletedDocs: 0, deletedTags: 0 }
  }

  // For each purged slug, clean up the matching rag_documents row + disk
  // file. cleanupWikiDiskAndDoc uses wikiDiskPath(slug) which resolves to
  // the OLD sentinel-named file path (e.g. `_project.md`), matching what
  // the pre-v15 compile actually wrote. After the rag_documents deletes,
  // sweep orphan tags they sole-sourced.
  let deletedDocs = 0
  for (const slug of slugs) {
    const before = await ragQuery<{ id: string }>(
      `SELECT id::text FROM rag_documents WHERE source_path = $1 OR source_path LIKE $2`,
      [tryWikiDiskPath(slug), `%${slug}.md`],
    )
    deletedDocs += (before?.rows ?? []).length
    await cleanupWikiDiskAndDoc(slug)
  }
  const deletedTags = await deleteOrphanTags()
  return { deletedPages: slugs.length, deletedDocs, deletedTags }
}

/** wikiDiskPath but returns '' instead of throwing when the workspace
 *  root is unconfigured. Lets the legacy purge gracefully handle the
 *  "no workspace root" boot edge case. */
function tryWikiDiskPath(slug: string): string {
  try { return wikiDiskPath(slug) } catch { return '' }
}

/** Public single-slug invalidator. Drops the rag_wiki_pages row, unlinks
 *  the disk artifact under `_Codex/Wiki/`, deletes the loop-back
 *  rag_documents row, and sweeps any orphan tags the deleted doc was
 *  sole-sourcing. Used by the rename handlers — after a project / thread
 *  rename the wiki page's slug becomes invalid (slugs encode the folder
 *  path) and we want it recompiled fresh by bootstrapMissingPages on the
 *  next pass. Best-effort: missing row / missing file are not errors. */
export async function deleteWikiPageBySlug(slug: string): Promise<void> {
  await ragQuery(`DELETE FROM rag_wiki_pages WHERE slug = $1`, [slug])
  await cleanupWikiDiskAndDoc(slug)
  await deleteOrphanTags()
}

/** Boot-time reconciliation for wiki pages whose slug no longer points at
 *  a live (Domaine, Project, Thread) triple. Catches the case where a
 *  rename happened BEFORE the v15 rename → recompile wiring landed:
 *  rag_documents got its project_name / thread_name / source_path updated
 *  by the rename's SQL, but rag_wiki_pages.slug still references the old
 *  folder name. Deletes the orphans so bootstrapMissingPages can
 *  recompile under the corrected slug.
 *
 *  Strategy: derive the SET of currently-valid (dn_slug, pn_slug, tn_slug)
 *  tuples from active rag_documents JOIN rag_namespaces JOIN rag_domaines.
 *  For each tier-1 wiki page, parse its slug into the same three
 *  components; if the tuple isn't in the live set, the page is orphaned.
 *  Tier-2 + tier-3 follow the same idea (parse to 2- or 1-segment, check
 *  against the projected set). Bootstrap fills the gap on next pass.
 *
 *  Idempotent — no-op once corpus is clean. */
export async function reconcileWikiSlugs(): Promise<{ deletedPages: number }> {
  // Live slug tuples from rag_documents — anything that would currently
  // compile a wiki page. We slugComponent each segment here (in JS) so the
  // comparison matches what threadSlugFor / projectSlugFor / domaineSlugFor
  // would emit at compile time.
  const liveRes = await ragQuery<{
    domaine_name: string | null
    project_name: string | null
    thread_name:  string | null
  }>(`
    SELECT DISTINCT dm.name AS domaine_name, d.project_name, d.thread_name
      FROM rag_documents d
      JOIN rag_namespaces n
        ON n.name = COALESCE(d.project_name, '__' || d.source_root || '__')
      LEFT JOIN rag_domaines dm ON dm.id = n.domaine_id
     WHERE d.is_active = TRUE
       AND d.source_type <> 'wiki'
  `)
  const live = liveRes?.rows ?? []

  const validThreadSlugs   = new Set<string>()
  const validProjectSlugs  = new Set<string>()
  const validDomaineSlugs  = new Set<string>()
  for (const row of live) {
    if (!row.domaine_name) continue
    const dn = slugComponent(row.domaine_name)
    if (!dn) continue
    validDomaineSlugs.add(dn)
    if (!row.project_name) continue
    const pn = slugComponent(row.project_name)
    if (!pn) continue
    validProjectSlugs.add(`${dn}/${pn}`)
    if (!row.thread_name) continue
    const tn = slugComponent(row.thread_name)
    if (!tn) continue
    validThreadSlugs.add(`${dn}/${pn}/${tn}`)
  }

  // Compare every wiki page slug to the live sets per tier. Anything not
  // matched is rename residue; delete it (page row + disk + rag_documents
  // loop-back row + orphan tags via cascade at end).
  const pagesRes = await ragQuery<{ slug: string; tier: string | null }>(
    `SELECT slug, tier FROM rag_wiki_pages`,
  )
  const orphanSlugs: string[] = []
  for (const row of pagesRes?.rows ?? []) {
    if (!row.tier) continue
    if (row.tier === 'thread'  && !validThreadSlugs.has(row.slug))  orphanSlugs.push(row.slug)
    if (row.tier === 'project' && !validProjectSlugs.has(row.slug)) orphanSlugs.push(row.slug)
    if (row.tier === 'domaine' && !validDomaineSlugs.has(row.slug)) orphanSlugs.push(row.slug)
  }
  if (orphanSlugs.length === 0) return { deletedPages: 0 }

  for (const slug of orphanSlugs) {
    await ragQuery(`DELETE FROM rag_wiki_pages WHERE slug = $1`, [slug])
    await cleanupWikiDiskAndDoc(slug)
  }
  await deleteOrphanTags()
  return { deletedPages: orphanSlugs.length }
}

/** Unlinks `_Codex/Wiki/<slug>.md` and drops the rag_documents row that
 *  references that path. Both steps are best-effort; missing file / missing
 *  row are not errors — they just mean the prior cleanup already ran. */
async function cleanupWikiDiskAndDoc(slug: string): Promise<void> {
  let filePath: string
  try {
    filePath = wikiDiskPath(slug)
  } catch (err) {
    console.warn('[cleanupOps] wiki disk path resolution failed for slug', slug, (err as Error).message)
    return
  }
  await tryUnlink(filePath)
  try {
    await ragQuery(`DELETE FROM rag_documents WHERE source_path = $1`, [filePath])
  } catch (err) {
    console.warn('[cleanupOps] wiki rag_documents cleanup failed for', filePath, (err as Error).message)
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Hard-delete a single document: file from disk, rag_documents row (cascades
 * tag-links, relationships, wiki sources), then full orphan sweep so any
 * tags or wiki pages this doc was sole-source for go too.
 *
 * Idempotent — safe to call when the file is already gone (chokidar unlink
 * path) or when the row has already been deleted (race with another call).
 */
export async function deleteDocument(sourcePath: string): Promise<DeleteDocumentResult> {
  try {
    await tryUnlink(sourcePath)
    const deletedId = await withRagClient(async (client) => {
      const res = await client.query<{ id: string }>(
        'DELETE FROM rag_documents WHERE source_path = $1 RETURNING id',
        [sourcePath],
      )
      return res.rows[0]?.id ?? null
    })
    const sweptTags      = await deleteOrphanTags()
    const sweptWikiPages = await deleteSourcelessWikiPages()
    return { ok: true, deletedDocId: deletedId, sweptTags, sweptWikiPages }
  } catch (err) {
    return {
      ok: false,
      deletedDocId: null,
      sweptTags: 0,
      sweptWikiPages: 0,
      error: (err as Error).message,
    }
  }
}

/**
 * Read-only scan for active documents whose source_path no longer exists on
 * disk. These are the residue of out-of-band deletes (Finder, `rm`) from
 * before the chokidar-unlink wiring landed, or any future fs race.
 */
export async function scanDeadLinks(): Promise<DeadLink[]> {
  const res = await ragQuery<DeadLink>(`
    SELECT id::text, source_path, title
    FROM rag_documents
    WHERE is_active = TRUE
    ORDER BY ingested_at DESC
  `)
  const rows = res?.rows ?? []
  const checks = await Promise.all(rows.map(async (r) => {
    try {
      await fs.access(r.source_path)
      return null
    } catch {
      return r
    }
  }))
  return checks.filter((r): r is DeadLink => r !== null)
}

/**
 * Hard-delete the given documents (or every detected dead link if `ids` is
 * omitted) and run the orphan sweep. Disk files are not touched — they're
 * already gone by definition.
 */
export async function purgeDeadLinks(ids?: string[]): Promise<PurgeDeadLinksResult> {
  try {
    let targetIds = ids ?? null
    if (!targetIds) {
      const dead = await scanDeadLinks()
      targetIds = dead.map((d) => d.id)
    }
    if (targetIds.length === 0) {
      return { ok: true, deleted: 0, sweptTags: 0, sweptWikiPages: 0 }
    }
    // withRagClient returns Promise<T | null> (null when the pool can't
    // open a client), so coalesce here — the surface return type of
    // PurgeDeadLinksResult.deleted is number.
    const deleted = (await withRagClient(async (client) => {
      const res = await client.query<{ id: string }>(
        'DELETE FROM rag_documents WHERE id = ANY($1::uuid[]) RETURNING id',
        [targetIds],
      )
      return res.rowCount ?? 0
    })) ?? 0
    const sweptTags      = await deleteOrphanTags()
    const sweptWikiPages = await deleteSourcelessWikiPages()
    return { ok: true, deleted, sweptTags, sweptWikiPages }
  } catch (err) {
    return {
      ok: false,
      deleted: 0,
      sweptTags: 0,
      sweptWikiPages: 0,
      error: (err as Error).message,
    }
  }
}

/** Read-only count of orphan-tag and sourceless-wiki rows. Cheap — used by
 *  the cleanup-button visibility logic.
 *
 *  Sourceless-wiki count MUST mirror the three-tier cascade in
 *  deleteSourcelessWikiPages, or the badge says "N sourceless wiki pages"
 *  and the sweep deletes 0. Tier-2/3 rows don't write rag_wiki_page_sources
 *  by design (their sources are derivable from rag_wiki_pages itself), so
 *  the old "no wiki_page_sources entries = sourceless" rule counted every
 *  healthy tier-2/3 page as sourceless even when its descendants were
 *  alive. */
export async function scanOrphans(): Promise<OrphanCounts> {
  const res = await ragQuery<{ orphan_tags: string; sourceless_wiki_pages: string }>(`
    SELECT
      (SELECT COUNT(*) FROM rag_tags t
        WHERE NOT EXISTS (SELECT 1 FROM rag_document_tags dt WHERE dt.tag_id = t.id))::text
        AS orphan_tags,
      (
        -- tier 'thread' with no rag_wiki_page_sources entries
        (SELECT COUNT(*) FROM rag_wiki_pages w1
          WHERE w1.tier = 'thread'
            AND NOT EXISTS (SELECT 1 FROM rag_wiki_page_sources s WHERE s.wiki_page_id = w1.id))
        +
        -- tier 'project' with no surviving tier='thread' child in same (namespace, domaine_id)
        (SELECT COUNT(*) FROM rag_wiki_pages w2
          WHERE w2.tier = 'project'
            AND NOT EXISTS (
              SELECT 1 FROM rag_wiki_pages c
              WHERE c.tier = 'thread'
                AND c.namespace  = w2.namespace
                AND c.domaine_id = w2.domaine_id
            ))
        +
        -- tier 'domaine' with no surviving tier='project' child in same domaine_id
        (SELECT COUNT(*) FROM rag_wiki_pages w3
          WHERE w3.tier = 'domaine'
            AND NOT EXISTS (
              SELECT 1 FROM rag_wiki_pages c
              WHERE c.tier = 'project'
                AND c.domaine_id = w3.domaine_id
            ))
      )::text AS sourceless_wiki_pages
  `)
  const row = res?.rows[0]
  return {
    orphanTags:          Number(row?.orphan_tags          ?? 0),
    sourcelessWikiPages: Number(row?.sourceless_wiki_pages ?? 0),
  }
}

/** One-shot orphan cleanup. Returns the actual rows removed. */
export async function sweepOrphans(): Promise<SweepOrphansResult> {
  try {
    const sweptTags      = await deleteOrphanTags()
    const sweptWikiPages = await deleteSourcelessWikiPages()
    return { ok: true, sweptTags, sweptWikiPages }
  } catch (err) {
    return {
      ok: false,
      sweptTags: 0,
      sweptWikiPages: 0,
      error: (err as Error).message,
    }
  }
}

/** Combined health probe for the summary-row badge. Read-only. */
export async function runHealthScan(): Promise<HealthSnapshot> {
  const [orphans, deadLinks] = await Promise.all([
    scanOrphans(),
    scanDeadLinks(),
  ])
  return {
    orphanTags:          orphans.orphanTags,
    deadLinks:           deadLinks.length,
    sourcelessWikiPages: orphans.sourcelessWikiPages,
  }
}
