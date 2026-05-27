// Shared test fixtures.
//
// Use `makeProjectsRoot()` once per test (cleaned by `cleanupProjectsRoot`)
// for the fs side. Use `truncateAll()` once per test (or via the exported
// `beforeEachIsolated` helper) for the DB side. Domaine + project + thread
// + doc seeding is exposed as small functions so each test file declares its
// own shape inline.

import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { ragQuery } from '../src/main/ragDb'
import { saveConfig, loadConfig, DEFAULT_CONFIG, type HolocronConfig } from '../src/main/config'

let projectsRootCounter = 0

/** Returns a fresh empty directory under tmp. Each call yields a unique path. */
export function makeProjectsRoot(): string {
  projectsRootCounter++
  const dir = path.join(tmpdir(), `holocron-test-projects-${process.pid}-${Date.now()}-${projectsRootCounter}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function cleanupProjectsRoot(root: string): void {
  try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
}

/** Writes a config snapshot to the stub userData dir. */
export function setConfig(partial: Partial<HolocronConfig>): HolocronConfig {
  const merged: HolocronConfig = { ...DEFAULT_CONFIG, ...partial }
  saveConfig(merged)
  return merged
}

/** Reads the current saved config (or DEFAULT_CONFIG if missing). */
export function readConfig(): HolocronConfig {
  return loadConfig()
}

/** Wipes the saved config file so loadConfig() returns DEFAULT_CONFIG. */
export function clearConfig(): void {
  const stubDir = path.join(tmpdir(), 'holocron-test-userdata')
  const cfgPath = path.join(stubDir, 'holocron-config.json')
  try { fs.rmSync(cfgPath) } catch { /* missing is fine */ }
}

/** TRUNCATE every table that tests mutate. Preserves the schema + bridge
 *  namespaces (we re-seed them right after). Run in beforeEach. */
export async function truncateAll(): Promise<void> {
  await ragQuery(`
    TRUNCATE TABLE
      rag_documents,
      rag_tags,
      rag_document_tags,
      rag_relationships,
      rag_wiki_pages,
      rag_wiki_page_sources,
      rag_syntheses,
      rag_operations_log,
      rag_namespaces,
      rag_domaines
    RESTART IDENTITY CASCADE
  `)
  // Bridges are seeded by migration 002 but TRUNCATE wiped them. Re-seed so
  // tests verifying "bridges preserved" have rows to assert against. After
  // migration 006 the PK is `id` and uniqueness lives on the composite
  // (name, domaine_id) constraint, so we target that explicitly.
  await ragQuery(
    `INSERT INTO rag_namespaces (name, is_bridge_namespace, domaine_id)
     VALUES ('__library__', TRUE, NULL), ('__inbox__', TRUE, NULL)
     ON CONFLICT ON CONSTRAINT rag_namespaces_name_domaine_unique DO NOTHING`,
  )
}

// ── Seed helpers ────────────────────────────────────────────────────────────

export async function seedDomaine(name: string): Promise<string> {
  const res = await ragQuery<{ id: string }>(
    `INSERT INTO rag_domaines (name) VALUES ($1) RETURNING id::text`,
    [name],
  )
  const id = res?.rows[0]?.id
  if (!id) throw new Error(`seedDomaine: insert failed for ${name}`)
  return id
}

export async function seedNamespace(name: string, domaineId: string | null): Promise<void> {
  await ragQuery(
    `INSERT INTO rag_namespaces (name, domaine_id) VALUES ($1, $2)
     ON CONFLICT ON CONSTRAINT rag_namespaces_name_domaine_unique DO NOTHING`,
    [name, domaineId],
  )
}

export interface SeedDocArgs {
  sourcePath: string
  projectName?: string | null
  threadName?: string | null
  sourceRoot?: string  // 'projects' | 'library' | 'inbox'
  sourceType?: string  // 'reference' | 'wiki' | 'note' | ...
  title?: string
  content?: string
}

export async function seedDocument(args: SeedDocArgs): Promise<string> {
  const res = await ragQuery<{ id: string }>(
    `INSERT INTO rag_documents
       (source_path, source_root, source_type, project_name, thread_name, title, content, word_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text`,
    [
      args.sourcePath,
      args.sourceRoot ?? 'projects',
      args.sourceType ?? 'reference',
      args.projectName ?? null,
      args.threadName ?? null,
      args.title ?? path.basename(args.sourcePath),
      args.content ?? 'seed content',
      (args.content ?? 'seed content').split(/\s+/).length,
    ],
  )
  const id = res?.rows[0]?.id
  if (!id) throw new Error(`seedDocument: insert failed for ${args.sourcePath}`)
  return id
}

export async function seedTag(name: string): Promise<string> {
  const res = await ragQuery<{ id: string }>(
    `INSERT INTO rag_tags (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id::text`,
    [name],
  )
  const id = res?.rows[0]?.id
  if (!id) throw new Error(`seedTag: insert failed for ${name}`)
  return id
}

export async function attachTagToDoc(documentId: string, tagId: string): Promise<void> {
  await ragQuery(
    `INSERT INTO rag_document_tags (document_id, tag_id) VALUES ($1, $2)
     ON CONFLICT (document_id, tag_id) DO NOTHING`,
    [documentId, tagId],
  )
}

export interface SeedWikiArgs {
  slug: string
  title?: string
  /** Domaine the page belongs to. Required for tier='thread' / 'project'
   *  / 'domaine' — only NUCLEAR-tested "tag-anchored legacy" path leaves
   *  it null, and migration 007 already removed that path. */
  domaineId?: string | null
  /** project_name for tier 'thread' + 'project'. NULL for tier 'domaine'. */
  namespace?: string | null
  tier?: 'thread' | 'project' | 'domaine'
}

export async function seedWikiPage(args: SeedWikiArgs): Promise<string> {
  const res = await ragQuery<{ id: string }>(
    `INSERT INTO rag_wiki_pages (slug, title, content, domaine_id, namespace, tier)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id::text`,
    [
      args.slug,
      args.title ?? args.slug,
      'seed content',
      args.domaineId ?? null,
      args.namespace ?? null,
      args.tier ?? 'thread',
    ],
  )
  const id = res?.rows[0]?.id
  if (!id) throw new Error(`seedWikiPage: insert failed for ${args.slug}`)
  return id
}

// ── Filesystem helpers ─────────────────────────────────────────────────────

/** Recursively makes <projectsRoot>/<domaineName>/<projectName>/<threadName>/
 *  and writes a minimal thread.json. Returns the thread path. */
export function makeThreadFolder(
  projectsRoot: string,
  domaineName: string,
  projectName: string,
  threadName: string,
): string {
  const threadPath = path.join(projectsRoot, domaineName, projectName, threadName)
  fs.mkdirSync(threadPath, { recursive: true })
  const meta = {
    name: threadName,
    projectName,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(threadPath, 'thread.json'), JSON.stringify(meta, null, 2))
  return threadPath
}

export function writeFile(threadPath: string, name: string, content = '# Test doc\n'): string {
  const p = path.join(threadPath, name)
  fs.writeFileSync(p, content)
  return p
}

export function exists(p: string): boolean {
  try { fs.accessSync(p); return true } catch { return false }
}
