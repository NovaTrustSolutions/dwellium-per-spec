import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { useSettingsStore } from '../../store/settingsStore'
import { useSessionStore } from '../../store/sessionStore'
import { useScribeStore } from '../../store/scribeStore'
import { loadThreadForPath } from '../../utils/threadActions'
import {
  holocronTheme,
  markdownHighlightStyle,
  makeEditorThemeExtension,
  resolveTheme,
  type ScribeColorTheme,
} from '../scribe/markdownConfig'
import { syntaxHighlighting } from '@codemirror/language'
import { DomaineBadge } from '../DomaineBadge'
import { IconEdit, IconImport, IconTrash, IconChevronDown, IconChevronUp } from '../Icons'

// ── Types ───────────────────────────────────────────────────────────────────

export type PreviewMode =
  | 'wiki'
  | 'cross-thread'
  | 'active-thread'
  | 'synthesis'
  | 'inbox'

export interface PreviewDoc {
  // For wiki/synthesis: the slug; for filesystem-backed docs: the file path.
  // The mode determines which.
  slug?: string
  title: string
  source_path: string
  source_type: string
  project_name: string | null
  /** Best-effort thread name (parsed from path or DB column). May be null. */
  thread_name?: string | null
  /** Initial content if caller already has it (skips refetch). */
  content?: string
  source_count?: number
  updated_at?: string
}

/** Navigation callbacks driven by the parent (Wiki / Search). CodexPreview
 *  itself stays stateless — when the user clicks a [[wikilink]] or [N]
 *  citation, it resolves the target and calls onNavigate. The parent owns
 *  the history stack (so Wiki and Search histories don't collide). Toolbar
 *  Back/Forward/Index buttons surface only when nav is provided. */
export interface NavCallbacks {
  /** Called when user clicks a [[wikilink]] or [N] citation inside the
   *  rendered markdown. Resolution to PreviewDoc happens inside
   *  CodexPreview using fetched wiki list + current-page sources. */
  onNavigate: (target: PreviewDoc, mode: PreviewMode) => void
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  /** Optional shortcut to skip past nav history straight back to the
   *  parent index (e.g. Wiki sub-tab grid). Not surfaced in Search context. */
  onIndex?: () => void
}

interface Props {
  document: PreviewDoc
  mode: PreviewMode
  onClose?: () => void
  /** Called after Import-to-Thread / Use-as-Report-Draft so the parent (Search,
   *  Wiki) can show a confirmation if it wants to. */
  onAction?: (kind: 'import' | 'reportDraft' | 'regenerate', detail: string) => void
  /** Navigation history surface — see NavCallbacks. When omitted, the preview
   *  renders without back/forward/index buttons (legacy single-doc mode). */
  nav?: NavCallbacks
  /** When provided, renders a danger-pill Delete button in the toolbar.
   *  Caller owns the confirmation + the actual destructive call (and any
   *  parent-side cleanup like closing the overlay). Used by Ingest so the
   *  user can delete a document straight from its preview. */
  onDelete?: () => void
  /** Position-in-list indicator surfaced as "Document N of M" in the
   *  header subtitle. Optional — only callers that show docs as part of
   *  an ordered, navigable list (currently: Ingest) pass it. */
  position?: { current: number; total: number }
}

interface WikiSourceListItem {
  id: string
  title: string
  source_path: string
  source_type: string
  source_root: string
  project_name: string | null
}

// ── Component ───────────────────────────────────────────────────────────────

export function CodexPreview({ document: doc, mode, onClose, onAction, nav, onDelete, position }: Props): JSX.Element {
  const [content, setContent] = useState<string>(doc.content ?? '')
  const [loading, setLoading] = useState<boolean>(!doc.content)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'regenerate' | 'import' | 'reportDraft' | 'save' | null>(null)
  const [editing, setEditing] = useState(false)
  const [editorContent, setEditorContent] = useState<string>('')
  const [savedTick, setSavedTick] = useState(0)

  // Header collapse state. Defaults to collapsed when a doc is first opened
  // so the body has maximum vertical room — previously the full metadata +
  // breadcrumb + Contents + labeled toolbar ate ~40% of the viewport on
  // every preview, even for one-screen documents. Click the title bar or
  // the chevron to expand for breadcrumb/metadata/Contents and labeled
  // toolbar buttons. Reset to collapsed whenever the doc changes (a new
  // doc opens via wikilink or grid click). Andy's session 1 ask.
  const [headerCollapsed, setHeaderCollapsed] = useState<boolean>(true)
  useEffect(() => { setHeaderCollapsed(true) }, [doc.source_path, doc.slug])

  // Wiki page index (title→slug) — fetched lazily, cached for the lifetime
  // of the preview. Used to resolve [[wikilink]] click targets. Both modes
  // benefit (Search-side previews can also navigate via wikilinks).
  const [wikiPageIndex, setWikiPageIndex] = useState<Array<{ title: string; slug: string }> | null>(null)

  // Sources for the current wiki page (citation order = ingested_at ASC).
  // [N] click → sources[N-1]. Refetched when slug changes.
  const [wikiSources, setWikiSources] = useState<WikiSourceListItem[] | null>(null)

  const { config } = useSettingsStore()
  const setActiveTab = useSessionStore((s) => s.setActiveTab)

  // ── Load content on mount / when doc changes ────────────────────────────
  useEffect(() => {
    let alive = true
    if (doc.content) {
      setContent(doc.content)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const load = async (): Promise<void> => {
      try {
        if (mode === 'wiki' && doc.slug) {
          const res = await window.electronAPI.wikiGet(doc.slug)
          if (!alive) return
          if (!res.ok || !res.data) {
            setError(res.error ?? 'Failed to load wiki page')
            setContent('')
          } else {
            setContent(res.data.content)
          }
        } else {
          const res = await window.electronAPI.readFile(doc.source_path)
          if (!alive) return
          setContent(res.content)
        }
      } catch (err) {
        if (alive) setError((err as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.slug, doc.source_path, mode])

  // ── Fetch wiki source list (citation resolution) ─────────────────────────
  // Triggers for ANY wiki-typed doc — not just docs opened with mode='wiki'.
  // The Ingest tab classifies wiki rows by location (under projectsRoot or
  // a sibling bridge), so opening a wiki row from Ingest yields mode like
  // 'cross-thread'; the citation handler still needs the wiki page's
  // sources to resolve `[N]` clicks. Detect "this is a wiki doc" via
  // source_type === 'wiki' OR an explicit doc.slug; derive the slug from
  // source_path when it isn't passed (Ingest's setPreviewDoc only carries
  // title / source_path / source_type / project_name).
  //
  // For non-wiki docs we set wikiSources = [] (rather than null) so the
  // citation handler's diagnostic reads sourcesLoaded:true, sourcesCount:0
  // instead of the misleading sourcesLoaded:false; clicks still bail at
  // the `!src` guard.
  useEffect(() => {
    let alive = true
    const isWikiDoc = mode === 'wiki' || doc.source_type === 'wiki' || !!doc.slug
    if (!isWikiDoc) {
      setWikiSources([])
      return
    }
    // Slug priority: explicit doc.slug → derived from source_path. The
    // `_Library/Wiki/` branch is the same transitional v14→v15 fallback
    // used elsewhere (openDocByName, cleanupOps).
    const slug = doc.slug ?? doc.source_path
      .replace(/^.*\/_Codex\/Wiki\//, '')
      .replace(/^.*\/_Library\/Wiki\//, '')
      .replace(/^wiki:\/\//i, '')
      .replace(/\.md$/i, '')
    if (!slug) {
      setWikiSources([])
      return
    }
    void window.electronAPI.wikiGetSources(slug)
      .then((res) => {
        if (!alive) return
        if (res.ok) setWikiSources(res.data ?? [])
        else setWikiSources([])
      })
      .catch(() => { if (alive) setWikiSources([]) })
    return () => { alive = false }
  }, [doc.slug, doc.source_path, doc.source_type, mode])

  // ── Lazy-fetch wiki page index for [[wikilink]] resolution (one-time) ────
  useEffect(() => {
    if (wikiPageIndex !== null) return
    let alive = true
    void window.electronAPI.wikiList()
      .then((res) => {
        if (!alive) return
        if (res.ok && res.data) {
          setWikiPageIndex(res.data.map((p) => ({ title: p.title, slug: p.slug })))
        } else {
          setWikiPageIndex([])
        }
      })
      .catch(() => { if (alive) setWikiPageIndex([]) })
    return () => { alive = false }
  }, [wikiPageIndex])

  // ── Action handlers ─────────────────────────────────────────────────────

  const activeProject = config.activeProjectName
  const activeThread  = config.activeThreadName
  const hasActiveThread = !!activeProject && !!activeThread

  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!doc.slug || mode !== 'wiki') return
    setBusy('regenerate')
    setError(null)
    try {
      const res = await window.electronAPI.wikiRegenerate(doc.slug)
      if (!res.ok) {
        setError(res.error ?? 'Regenerate failed')
      } else if (res.content) {
        setContent(res.content)
        onAction?.('regenerate', doc.slug)
      } else {
        // Re-fetch in case the IPC didn't echo content back.
        const fresh = await window.electronAPI.wikiGet(doc.slug)
        if (fresh.ok && fresh.data) setContent(fresh.data.content)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }, [doc.slug, mode, onAction])

  const handleImport = useCallback(async (): Promise<void> => {
    if (!doc.slug || !hasActiveThread) return
    setBusy('import')
    try {
      let res = await window.electronAPI.wikiImportToThread(doc.slug, activeProject, activeThread)
      if (!res.ok && res.alreadyExists) {
        const proceed = confirm(
          `A file already exists at ${res.destPath}.\n\nOverwrite with the latest wiki content?`,
        )
        if (!proceed) {
          setBusy(null)
          return
        }
        res = await window.electronAPI.wikiImportToThread(doc.slug, activeProject, activeThread, true)
      }
      if (!res.ok) {
        alert(`Import failed: ${res.error ?? 'unknown error'}`)
      } else {
        const dest = res.destPath ?? '(unknown)'
        alert(`Imported to ${dest}`)
        onAction?.('import', dest)
      }
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }, [doc.slug, hasActiveThread, activeProject, activeThread, onAction])

  const handleReportDraft = useCallback(async (): Promise<void> => {
    if (!doc.slug || !hasActiveThread) return
    setBusy('reportDraft')
    try {
      const res = await window.electronAPI.wikiUseAsReportDraft(doc.slug, activeProject, activeThread)
      if (!res.ok) {
        alert(`Report draft failed: ${res.error ?? 'unknown error'}`)
      } else {
        const dest = res.destPath ?? '(unknown)'
        alert(`Report draft created: ${dest}`)
        onAction?.('reportDraft', dest)
      }
    } catch (err) {
      alert(`Report draft failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }, [doc.slug, hasActiveThread, activeProject, activeThread, onAction])

  const handleOpenInEditor = useCallback((): void => {
    const name = doc.source_path.split('/').pop() ?? doc.title
    useScribeStore.getState().openFileWithContent({ path: doc.source_path, name }, content)
    // Pull the active Domaine/Project/Thread to wherever this doc lives so
    // the sidebar + breadcrumb + chat session line up with what just opened
    // in Scribe. Wiki / library / inbox docs sit outside projectsRoot and
    // get a no-op (loadThreadForPath returns false silently). Fire-and-
    // forget — the file is already open by the time loadThread finishes.
    void loadThreadForPath(doc.source_path)
    setActiveTab('scribe')
  }, [doc.source_path, doc.title, content, setActiveTab])

  // ── In-document link navigation ──────────────────────────────────────────
  // Every clickable target inside a previewed doc resolves through one of:
  //  • openWikiSlug      — a `wiki://<slug>` ref or a wiki-page slug.
  //  • openDocByName     — a name ([[Obsidian wikilink]] / a title-as-link) —
  //                        resolves against wiki pages first, then ingested
  //                        documents (matched by filename, then title).
  //  • handleInternalLinkClick — a plain markdown link href: `wiki://…`, a
  //                        relative/absolute path, or (fallback) a name.
  //  • handleCitationClick — a `[N]` marker → wikiSources[N-1].
  // Nothing here ever silently no-ops on a *missing* target without logging.

  //  wiki://<slug> / a bare wiki slug → open that wiki page (uses wikiGet, not
  //  file:read — the old resolver treated `wiki://…` as a path → ENOENT).
  const openWikiSlug = useCallback((rawSlug: string): void => {
    if (!nav) return
    const slug = rawSlug.replace(/^wiki:\/\//i, '').replace(/^\/+/, '').replace(/\.md$/i, '').trim()
    if (!slug) return
    const hit = wikiPageIndex?.find((p) => p.slug === slug) ?? null
    const title = hit?.title ?? (slug.split('/').pop() || slug).replace(/[-_]+/g, ' ')
    nav.onNavigate({
      slug,
      title,
      source_path: `_Codex/Wiki/${slug}.md`,
      source_type: 'wiki',
      project_name: null,
    }, 'wiki')
  }, [nav, wikiPageIndex])

  //  A document NAME — an Obsidian `[[wikilink]]` or a title used as a link.
  //  Resolution order: (1) a wiki page with that exact title; (2) an ingested
  //  document whose FILENAME matches (Obsidian `[[name]]` ≡ `name.md`); (3) an
  //  ingested document whose DB title matches; (4) a substring match. Opens it
  //  in the preview pane with a mode derived from source_type. Logs + bails if
  //  nothing matches (so the link isn't a silent dead end like before).
  const openDocByName = useCallback(async (rawName: string): Promise<void> => {
    if (!nav) return
    const name = rawName.trim().replace(/\.md$/i, '')
    if (!name) return
    const lc = name.toLowerCase()

    // (1) wiki page by exact title
    const wikiHit = wikiPageIndex?.find((p) => p.title.toLowerCase() === lc) ?? null
    if (wikiHit) { openWikiSlug(wikiHit.slug); return }

    // (2)-(4) ingested document — ILIKE-substring search, then narrow.
    let docs: Array<{ source_path: string; source_type: string; title: string; project_name: string | null }> = []
    try {
      const res = await window.electronAPI.ingestListDocuments({ search: name, crossDomaine: true, limit: 100 })
      if (res.ok && res.data) docs = res.data
    } catch (err) {
      console.error('[CodexPreview] doc-by-name lookup failed:', err)
      return
    }
    const base = (p: string): string => (p.split('/').pop() || p).replace(/\.md$/i, '')
    const hit =
      docs.find((d) => base(d.source_path).toLowerCase() === lc) ??
      docs.find((d) => (d.title || '').toLowerCase() === lc) ??
      docs.find((d) => base(d.source_path).toLowerCase().includes(lc)) ??
      docs.find((d) => (d.title || '').toLowerCase().includes(lc)) ??
      null
    if (!hit) {
      console.warn(`[CodexPreview] no wiki page or document matched link "${rawName}" — dangling reference`)
      setError(`No document or wiki page matches "${rawName.trim()}".`)
      return
    }
    if (hit.source_type === 'wiki') {
      // Strip either prefix — `_Library/Wiki/` retained as transitional
      // v14→v15 fallback for any rows with pre-rename source_paths.
      const slug = hit.source_path
        .replace(/^.*\/_Codex\/Wiki\//, '')
        .replace(/^.*\/_Library\/Wiki\//, '')
        .replace(/^wiki:\/\//i, '')
        .replace(/\.md$/i, '')
      openWikiSlug(slug)
      return
    }
    const mode: PreviewMode =
      hit.source_type === 'synthesis' ? 'synthesis' :
      hit.source_type === 'inbox'     ? 'inbox' :
                                        'cross-thread'
    nav.onNavigate({
      title: hit.title || base(hit.source_path),
      source_path: hit.source_path,
      source_type: hit.source_type,
      project_name: hit.project_name,
    }, mode)
  }, [nav, wikiPageIndex, openWikiSlug])

  //  [[Title]] / title-as-link (rewritten to `holocron-wiki:…` by
  //  preprocessForLinks) → resolve as a doc name. Works for wiki pages AND
  //  raw documents (the prior version only knew wiki pages, so an Obsidian
  //  link to a reference doc was a silent no-op).
  const handleWikilinkClick = useCallback((title: string): void => {
    console.log('[CodexPreview] wikilink click — title:', title, 'currentDoc:', doc.source_path)
    void openDocByName(title)
  }, [openDocByName, doc.source_path])

  const handleCitationClick = useCallback((n: number): void => {
    const src = wikiSources?.[n - 1] ?? null
    console.log('[WikiNavDiag] citation click:', {
      n,
      hasNav: !!nav,
      sourcesLoaded: wikiSources !== null,
      sourcesCount: wikiSources?.length ?? 0,
      resolved: src ? { title: src.title, source_path: src.source_path } : null,
    })
    if (!nav || !wikiSources || !src) return
    // A wiki-type source's source_path is `wiki://<slug>` (its `id` is the
    // bare slug) — route through the slug opener so the preview uses wikiGet,
    // not file:read on a path that doesn't exist on disk.
    if (src.source_type === 'wiki') {
      openWikiSlug(src.id || src.source_path)
      return
    }
    // Mode dispatch for the source doc — keep things in CodexPreview
    // regardless of active-thread membership (user is browsing, not editing).
    const targetMode: PreviewMode =
      src.source_type === 'synthesis' ? 'synthesis' :
      src.source_type === 'inbox'     ? 'inbox' :
                                        'cross-thread'
    nav.onNavigate({
      title: src.title,
      source_path: src.source_path,
      source_type: src.source_type,
      project_name: src.project_name,
    }, targetMode)
  }, [nav, wikiSources, openWikiSlug])

  //  A plain markdown link href ([text](…)). Routes by shape:
  //   • wiki://<slug>            → openWikiSlug (never file:read it).
  //   • looks like a path (has a `/` or a file extension) → resolve it
  //     against the current doc's directory and open the file in-pane.
  //   • otherwise (a bare name)  → openDocByName (covers `[text](Some Doc Title)`
  //     and Obsidian-ish bare-name links that didn't go through the `[[…]]`
  //     preprocessor).
  const handleInternalLinkClick = useCallback((href: string): void => {
    console.log('[CodexPreview] internal link click — href:', href, 'currentDoc:', doc.source_path)
    if (!nav || !href) return
    if (/^wiki:\/\//i.test(href)) { openWikiSlug(href); return }
    const looksLikePath = href.includes('/') || /\.[a-z0-9]{1,5}([?#].*)?$/i.test(href)
    if (looksLikePath) {
      const resolved = resolveRelativePath(doc.source_path, href)
      const name = resolved.split('/').pop() || resolved
      nav.onNavigate({
        title: name.replace(/\.md$/i, ''),
        source_path: resolved,
        source_type: 'note',
        project_name: null,
      }, 'cross-thread')
      return
    }
    void openDocByName(href)
  }, [nav, doc.source_path, openWikiSlug, openDocByName])

  const handleSaveCrossThread = useCallback(async (): Promise<void> => {
    if (!editing) return
    setBusy('save')
    try {
      const res = await window.electronAPI.writeFile(doc.source_path, editorContent)
      if (res.ok) {
        setContent(editorContent)
        setSavedTick((t) => t + 1)
      } else {
        alert('Save failed')
      }
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }, [editing, doc.source_path, editorContent])

  // ── Render: header, toolbar, body ───────────────────────────────────────

  const updatedHuman = humanizeUpdatedAt(doc.updated_at)

  // Wiki article framing: extract H2 headings for the section navigation
  // bar. Headings get matching `id` attributes via the MarkdownReader so
  // anchor jumps work. Only meaningful for wiki/synthesis content.
  const sectionHeadings = useMemo(() => {
    if (mode !== 'wiki' && mode !== 'synthesis') return [] as Array<{ text: string; slug: string }>
    return extractSectionHeadings(content)
  }, [content, mode])

  const scrollToHeading = useCallback((slug: string): void => {
    const el = document.getElementById(slug)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const isArticle = mode === 'wiki' || mode === 'synthesis'

  // Icon-only primary actions for the collapsed bar. Mirrors the labeled
  // buttons in the expanded toolbar but compresses them into a ~24x24
  // glyph + title tooltip so the slim bar still gives the user direct
  // access to Open in Scribe / Import / Delete without expanding the
  // header. The full-label versions stay in the expanded toolbar.
  const navBack = (): void => { nav?.canBack ? nav.onBack() : onClose?.() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header — collapsed (slim ~40px bar) or expanded (full metadata +
          Contents + labeled toolbar). Defaults to collapsed on every new
          doc so the body has maximum room. Click the title or the chevron
          to flip. */}
      {headerCollapsed ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 24px',
            height: 40, flexShrink: 0,
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-base)',
          }}
        >
          {(nav || onClose) && (
            <NavButton
              onClick={navBack}
              disabled={!nav?.canBack && !onClose}
              title={nav?.canBack ? 'Back' : 'Back to index'}
              ariaLabel="Back"
            >
              ←
            </NavButton>
          )}
          {nav?.canForward && (
            <NavButton onClick={() => nav.onForward()} disabled={false} title="Forward" ariaLabel="Forward">
              →
            </NavButton>
          )}
          <button
            onClick={() => setHeaderCollapsed(false)}
            title="Expand header — show metadata, Contents, and labeled actions"
            style={{
              flex: 1, minWidth: 0, textAlign: 'left',
              background: 'transparent', border: 'none',
              padding: '0 4px',
              fontSize: 14, fontWeight: 600,
              color: 'var(--text-primary)', fontFamily: 'inherit',
              cursor: 'pointer',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {doc.title}
          </button>
          {/* Icon-only primary actions — SVG glyphs from Icons.tsx
              (project-wide Lucide-style set). Keep this short — the goal
              of the slim bar is "doc content immediately visible," not a
              second toolbar. */}
          <IconAction
            onClick={handleOpenInEditor}
            title="Open in Scribe"
            ariaLabel="Open in Scribe"
          ><IconEdit size={15} /></IconAction>
          {(mode === 'wiki' || mode === 'synthesis') && hasActiveThread && (
            <IconAction
              onClick={() => void handleImport()}
              disabled={busy !== null}
              title="Import to active thread folder"
              ariaLabel="Import to thread"
            ><IconImport size={15} /></IconAction>
          )}
          {onDelete && (
            <IconAction
              onClick={onDelete}
              title="Delete from disk + database"
              ariaLabel="Delete"
              danger
            ><IconTrash size={15} /></IconAction>
          )}
          {/* Expand-header chevron — bigger + higher-contrast than the
              other icon actions so the affordance is obvious. Previously
              this was a small `▾` glyph that disappeared into the bar. */}
          <button
            onClick={() => setHeaderCollapsed(false)}
            title="Expand header — show metadata, Contents, and labeled actions"
            aria-label="Expand header"
            style={{
              width: 32, height: 28,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-default, var(--border-subtle))',
              borderRadius: 4,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <IconChevronDown size={18} />
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: '14px 24px 10px',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
            background: 'var(--bg-base)',
            position: 'relative',
          }}
        >
          {/* Collapse handle — top right, mirrors the expand chevron in the
              slim bar so the affordance is symmetric. Bordered + filled so
              it's discoverable; previously a near-invisible `▴` in
              text-dim color. */}
          <button
            onClick={() => setHeaderCollapsed(true)}
            title="Collapse header — slim bar with icon-only actions"
            aria-label="Collapse header"
            style={{
              position: 'absolute', top: 8, right: 12,
              width: 32, height: 28,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-default, var(--border-subtle))',
              borderRadius: 4,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <IconChevronUp size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {/* Navigation cluster: Back / Forward / Index. Back falls through
                to onClose when there's no history — preserves the original
                "← Back to grid" affordance for the very first viewed page. */}
            {(nav || onClose) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <NavButton
                  onClick={navBack}
                  disabled={!nav?.canBack && !onClose}
                  title={nav?.canBack ? 'Back' : 'Back to index'}
                  ariaLabel="Back"
                >
                  ←
                </NavButton>
                {nav && (
                  <NavButton
                    onClick={() => nav.onForward()}
                    disabled={!nav.canForward}
                    title="Forward"
                    ariaLabel="Forward"
                  >
                    →
                  </NavButton>
                )}
                {nav?.onIndex && (
                  <NavButton
                    onClick={() => nav.onIndex?.()}
                    title="All wiki pages"
                    ariaLabel="All wiki pages"
                    textual
                  >
                    Index
                  </NavButton>
                )}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                onClick={() => setHeaderCollapsed(true)}
                title="Collapse header"
                style={{
                  background: 'transparent', border: 'none', padding: 0, textAlign: 'left',
                  fontSize: isArticle ? 22 : 16,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: isArticle ? 8 : 4,
                  lineHeight: 1.2,
                  cursor: 'pointer', fontFamily: 'inherit',
                  width: '100%',
                }}
              >
                {doc.title}
              </button>
              <MetaLine
                mode={mode}
                doc={doc}
                updatedHuman={updatedHuman}
                position={position}
              />
              {isArticle && sectionHeadings.length > 1 && (
                <SectionNav headings={sectionHeadings} onJump={scrollToHeading} />
              )}
            </div>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {(mode === 'wiki' || mode === 'synthesis') && (
              <>
                <ToolbarButton
                  onClick={() => void handleImport()}
                  disabled={!hasActiveThread || busy !== null}
                  title={hasActiveThread ? 'Copy to active thread folder' : 'No active thread'}
                >
                  {busy === 'import' ? 'Importing…' : 'Import to Thread'}
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => void handleReportDraft()}
                  disabled={!hasActiveThread || busy !== null}
                  title={hasActiveThread ? 'Create a versioned report from this content' : 'No active thread'}
                >
                  {busy === 'reportDraft' ? 'Creating…' : 'Use as Report Draft'}
                </ToolbarButton>
                {mode === 'wiki' && (
                  <ToolbarButton
                    onClick={() => void handleRegenerate()}
                    disabled={busy !== null}
                    title="Recompile this wiki page from its source documents"
                  >
                    {busy === 'regenerate' ? 'Regenerating…' : 'Regenerate'}
                  </ToolbarButton>
                )}
              </>
            )}

            {mode === 'cross-thread' && (
              <>
                <ToolbarButton
                  onClick={() => {
                    if (editing) {
                      setEditing(false)
                    } else {
                      setEditorContent(content)
                      setEditing(true)
                    }
                  }}
                  active={editing}
                >
                  {editing ? 'Read' : 'Edit'}
                </ToolbarButton>
                {editing && (
                  <ToolbarButton
                    onClick={() => void handleSaveCrossThread()}
                    disabled={busy === 'save' || editorContent === content}
                  >
                    {busy === 'save' ? 'Saving…' : 'Save'}
                  </ToolbarButton>
                )}
                {savedTick > 0 && !editing && (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Saved.</span>
                )}
              </>
            )}

            {/* Always offer the "promote to Scribe" path. Search results no
                longer jump to Scribe on click — the user has to explicitly
                ask via this button. For wiki/synthesis docs the disk file is
                auto-rewritten on next compile, so edits are ephemeral; the
                button still works, just don't expect persistence. */}
            <ToolbarButton onClick={handleOpenInEditor}>
              Open in Scribe
            </ToolbarButton>

            {onDelete && (
              <ToolbarButton onClick={onDelete} danger title="Delete from disk + database">
                Delete
              </ToolbarButton>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 8, color: 'var(--neon-red, #f55)', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Surface the error in collapsed mode too — otherwise a failure
          (e.g. delete) goes silent. Render as a thin strip under the bar. */}
      {headerCollapsed && error && (
        <div style={{ padding: '4px 24px', color: 'var(--neon-red, #f55)', fontSize: 11, borderBottom: '1px solid var(--border-subtle)' }}>
          {error}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {loading ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : editing && mode === 'cross-thread' ? (
          <CodeMirrorWriter
            initial={editorContent}
            onChange={setEditorContent}
          />
        ) : (
          <MarkdownReader
            content={content}
            onWikilinkClick={nav ? handleWikilinkClick : undefined}
            onCitationClick={nav && mode === 'wiki' ? handleCitationClick : undefined}
            onInternalLinkClick={nav ? handleInternalLinkClick : undefined}
          />
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Icon-only square button for the collapsed header bar. ~28x28, glyph in
 *  the middle, tooltip on hover. Mirrors a ToolbarButton's role minus the
 *  label so the slim bar stays slim. */
function IconAction({
  onClick,
  disabled,
  danger,
  title,
  ariaLabel,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  title: string
  ariaLabel: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{
        width: 28, height: 28,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
        background: 'transparent',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        color: danger ? '#ff2d78' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: 13, fontFamily: 'inherit',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function ToolbarButton({
  onClick,
  disabled,
  active,
  danger,
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  danger?: boolean
  title?: string
  children: React.ReactNode
}): JSX.Element {
  const palette = danger
    ? { bg: 'transparent', border: '#ff2d78', color: '#ff2d78' }
    : active
      ? { bg: 'var(--neon-blue)', border: 'var(--neon-blue)', color: 'var(--bg-base)' }
      : { bg: 'var(--bg-subtle)', border: 'var(--border-subtle)', color: 'var(--text-primary)' }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: 28,
        padding: '0 12px',
        background: palette.bg,
        color: palette.color,
        border: '1px solid ' + palette.border,
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontSize: 12,
        fontFamily: 'inherit',
        fontWeight: active || danger ? 600 : 500,
      }}
    >
      {children}
    </button>
  )
}

function MetaLine({
  mode,
  doc,
  updatedHuman,
  position,
}: {
  mode: PreviewMode
  doc: PreviewDoc
  updatedHuman: string | null
  position?: { current: number; total: number }
}): JSX.Element {
  // Article modes (wiki / synthesis) get a Wikipedia-style subtitle that
  // makes it clear this is an agent-compiled, non-editable surface — plus
  // source count and an absolute updated date (with relative on hover).
  if (mode === 'wiki' || mode === 'synthesis') {
    const updatedFull = formatFullTimestamp(doc.updated_at)
    return (
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          fontStyle: 'italic',
        }}
      >
        {position && (
          <>
            <span style={{ fontFamily: 'monospace', fontStyle: 'normal', fontVariantNumeric: 'tabular-nums' }}>
              Document {position.current} of {position.total}
            </span>
            {' · '}
          </>
        )}
        {mode === 'wiki' ? 'Wiki article' : 'Synthesis'} · agent-written, read-only
        {typeof doc.source_count === 'number' && (
          <> · compiled from {doc.source_count} source{doc.source_count === 1 ? '' : 's'}</>
        )}
        {updatedFull && (
          <> · last updated <span title={updatedHuman ?? undefined}>{updatedFull}</span></>
        )}
      </div>
    )
  }

  // Non-article modes: keep the badge-style metadata that makes
  // cross-thread disclosure prominent. Domaine badge sits up front so the
  // organizational home is always visible alongside the project disclosure.
  const parts: Array<JSX.Element | string> = []
  if (position) {
    parts.push(
      <span
        key="position"
        style={{
          fontSize: 11,
          color: 'var(--text-dim)',
          fontFamily: 'monospace',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        Document {position.current} of {position.total}
      </span>
    )
  }
  if (doc.project_name) {
    parts.push(<DomaineBadge key="domaine" projectName={doc.project_name} />)
  }
  if (mode === 'cross-thread') {
    const projectThread = `${doc.project_name ?? '?'}${doc.thread_name ? ' / ' + doc.thread_name : ''}`
    parts.push(
      <span
        key="disclosure"
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          background: 'var(--bg-subtle)',
          padding: '2px 8px',
          borderRadius: 10,
          border: '1px solid var(--border-subtle)',
        }}
      >
        ↗ From {projectThread}
      </span>
    )
  }
  if (updatedHuman) {
    parts.push(<span key="upd" style={{ fontSize: 11, color: 'var(--text-dim)' }}>Updated {updatedHuman}</span>)
  }
  parts.push(
    <span
      key="path"
      title={doc.source_path}
      style={{
        fontSize: 11,
        color: 'var(--text-dim)',
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 480,
      }}
    >
      {shortenPath(doc.source_path)}
    </span>
  )
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {i > 0 && <span style={{ color: 'var(--text-dim)', marginRight: 10 }}>·</span>}
          {p}
        </span>
      ))}
    </div>
  )
}

/** Wikipedia-style "Contents" jump bar — inline, lightweight. Shows the
 *  H2 section titles in document order; clicking scrolls to the heading
 *  via its `id`. Only rendered when there are at least 2 sections. */
function SectionNav({
  headings,
  onJump,
}: {
  headings: Array<{ text: string; slug: string }>
  onJump: (slug: string) => void
}): JSX.Element {
  return (
    <div
      style={{
        marginTop: 6,
        fontSize: 11,
        color: 'var(--text-dim)',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 0,
      }}
    >
      <span style={{ marginRight: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Contents
      </span>
      {headings.map((h, i) => (
        <span key={h.slug} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {i > 0 && <span style={{ margin: '0 8px', opacity: 0.6 }}>·</span>}
          <a
            href={`#${h.slug}`}
            onClick={(e) => { e.preventDefault(); onJump(h.slug) }}
            style={{
              color: 'var(--neon-blue)',
              textDecoration: 'none',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {h.text}
          </a>
        </span>
      ))}
    </div>
  )
}

/**
 * Pre-render fix: the wiki compile prompt emits Sources entries as
 * `[1] title (type)\n[2] title (type)` with single newlines between
 * items, so markdown renders them all as one squished paragraph. Walk
 * the Sources section and insert a paragraph break before each [N]
 * marker so each source lands on its own line. Bounded to the Sources
 * section only — other [N] usages in body text are untouched.
 */
function preprocessSourcesSection(content: string): string {
  const idx = content.search(/^##\s+Sources\s*$/m)
  if (idx === -1) return content
  const headingMatch = content.slice(idx).match(/^##\s+Sources\s*\n?/)
  if (!headingMatch) return content
  const headingEnd = idx + headingMatch[0].length
  const before = content.slice(0, headingEnd)
  const tail = content.slice(headingEnd)
  // Stop at the next ## heading (defensive — Sources is normally last,
  // but don't mangle anything that follows if a future format adds more).
  const nextHeading = tail.match(/^##\s+/m)
  const sectionEnd = nextHeading?.index ?? tail.length
  const sourcesBody = tail.slice(0, sectionEnd)
  const after = tail.slice(sectionEnd)
  const reformatted = sourcesBody.replace(/\s*(\[\d+\])/g, '\n\n$1').trimStart()
  return before + reformatted + (after ? '\n\n' + after : '')
}

/**
 * Wrap [[Title]] and [N] markers as markdown links with custom protocols
 * so the components.a override can render them as clickable spans.
 *   [[Title]]              → holocron-wiki:<encoded title>
 *   Body  [N]              → holocron-cite:<N>     (small superscript)
 *   Sources entry [N] X..  → holocron-source:<N>   (full-line link)
 * Sources are split into one paragraph per entry by preprocessSourcesSection
 * before this runs, so each `[N] title (type)` line is its own paragraph and
 * the whole-line wrap renders as a single clickable line.
 */
function preprocessForLinks(content: string): string {
  // [[Title]] → [Title](holocron-wiki:<encoded>)
  let out = content.replace(/\[\[([^\]\n]+?)\]\]/g, (_, title: string) => {
    const safe = encodeURIComponent(title.trim())
    return `[${title}](holocron-wiki:${safe})`
  })

  const sourcesIdx = out.search(/^##\s+Sources\s*$/m)
  // Body citations: handle both single ([1]) and grouped ([1, 2, 3]) forms.
  // For groups, emit one separate markdown link per number so each is
  // independently clickable (Wikipedia-style adjacent superscripts).
  // Link text is just the digit — react-markdown's parser bails on the
  // escaped-bracket form when the text is too short, so we add the visual
  // brackets back in the components.a renderer below.
  const wrapBodyCitations = (s: string): string =>
    s.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (_, group: string) => {
      const nums = group.split(/\s*,\s*/)
      return nums.map((n) => `[${n}](holocron-cite:${n})`).join('')
    })
  // Wrap each Sources entry as a full-line clickable link. Format produced
  // by preprocessSourcesSection: "\n\n[N] {title} ({source_type})\n\n…".
  // Match \[N\] followed by everything up to the next blank line and wrap
  // the whole run as a markdown link to holocron-source:N.
  const wrapSourceEntries = (s: string): string =>
    s.replace(/(\[(\d+)\][^\n]*)/g, (_, line: string, n: string) => {
      const escaped = line.replace(/^\[(\d+)\]/, '\\[$1\\]')
      return `[${escaped}](holocron-source:${n})`
    })

  if (sourcesIdx === -1) return wrapBodyCitations(out)
  const body = out.slice(0, sourcesIdx)
  const sourcesPart = out.slice(sourcesIdx)
  return wrapBodyCitations(body) + wrapSourceEntries(sourcesPart)
}

function MarkdownReader({
  content,
  onWikilinkClick,
  onCitationClick,
  onInternalLinkClick,
}: {
  content: string
  onWikilinkClick?: (title: string) => void
  onCitationClick?: (n: number) => void
  /** Click handler for a plain markdown link to another document (a relative
   *  or absolute path, not an http/mailto/# link and not a [[wikilink]]). */
  onInternalLinkClick?: (href: string) => void
}): JSX.Element {
  // First apply Sources line-break fix, THEN link wrapping. Order matters
  // because Sources preprocessing operates on plain `[N]` markers and would
  // double-process if the wrapping ran first.
  const prepared = preprocessForLinks(preprocessSourcesSection(content))
  // Safety-net delegation: catch any `<a>` click inside the rendered
  // markdown and route it through onInternalLinkClick if the click made it
  // here unhandled. Belt-and-suspenders for the gotcha rule
  // "no a: branch may render a click-does-nothing <a>" — the per-branch
  // overrides below already attach handlers, but if Andy's content has
  // edge-case link syntax (empty hrefs, raw HTML anchors via
  // unsafe-allowDangerousHtml, etc.) that bypasses a specific branch, the
  // delegation here ensures the link still navigates. preventDefault
  // stops Electron's will-navigate from reloading the renderer when the
  // anchor was rendered with an href.
  const handleDelegatedAnchorClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement | null
    const anchor = target?.closest('a') as HTMLAnchorElement | null
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    // The per-branch onClick handlers already preventDefault and route
    // appropriately. Skip when defaultPrevented (a branch handled it).
    if (e.defaultPrevented) return
    // External / mailto / tel — let the per-branch external handler manage
    // window.open. Don't double-handle here.
    if (/^(https?:|mailto:|tel:)/i.test(href)) return
    // In-page anchor — let the per-branch # handler scroll. Don't
    // double-handle here.
    if (href.startsWith('#')) return
    // Custom protocol — per-branch handler took care of it (or will).
    if (/^holocron-(wiki|cite|source):/i.test(href)) return
    // Anything else with an href: route through onInternalLinkClick so the
    // catch-all branch's behavior holds even if rendering produced a
    // sub-element (e.g. <code> inside <a>) that captured the click first.
    if (href && onInternalLinkClick) {
      e.preventDefault()
      console.log('[CodexPreview] delegated link click — href:', href)
      onInternalLinkClick(href)
    }
  }
  return (
    <div
      style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--text-primary)',
        maxWidth: 760,
      }}
      className="codex-preview-md"
      onClick={handleDelegatedAnchorClick}
    >
      <ReactMarkdown
        // react-markdown 8.x sanitizes link URLs by default — anything
        // outside http/https/mailto/etc. gets rewritten to "javascript:
        // void(0)" before reaching components.a. That stripped our
        // holocron-wiki: / holocron-cite: / holocron-source: protocols,
        // so the custom-protocol branches never matched and clicks fell
        // through to inert <a> tags. Identity transform lets them through.
        // Markdown content here is either compiled by us (the Gemini wiki
        // prompt) or wrapped by preprocessForLinks above — never raw user
        // HTML — so this is safe.
        transformLinkUri={(uri) => uri}
        components={{
          // Add stable IDs to H1-H3 so the section nav (above the body)
          // can scrollIntoView to them. Slug is derived from heading text.
          h1: ({ children, ...rest }) => (
            <h1 id={headingSlug(extractText(children))} {...rest}>{children}</h1>
          ),
          h2: ({ children, ...rest }) => (
            <h2 id={headingSlug(extractText(children))} {...rest}>{children}</h2>
          ),
          h3: ({ children, ...rest }) => (
            <h3 id={headingSlug(extractText(children))} {...rest}>{children}</h3>
          ),
          a: ({ href, children }) => {
            // Wikilink: holocron-wiki:<encoded-title>
            if (href && href.startsWith('holocron-wiki:')) {
              const title = decodeURIComponent(href.slice('holocron-wiki:'.length))
              return (
                <span
                  className="lp-wikilink"
                  onClick={(e) => {
                    e.preventDefault()
                    onWikilinkClick?.(title)
                  }}
                  style={{
                    color: 'var(--neon-blue)',
                    cursor: onWikilinkClick ? 'pointer' : 'default',
                    borderBottom: '1px dashed var(--neon-blue)',
                  }}
                >
                  {children}
                </span>
              )
            }
            // Body citation: small superscript number with visual brackets
            // added by the renderer (link text contains just the digits so
            // the markdown parser reliably recognizes it as a link).
            if (href && href.startsWith('holocron-cite:')) {
              const n = parseInt(href.slice('holocron-cite:'.length), 10)
              return (
                <sup>
                  <span
                    className="lp-citation"
                    onClick={(e) => {
                      e.preventDefault()
                      if (Number.isFinite(n)) onCitationClick?.(n)
                    }}
                    style={{
                      color: 'var(--neon-blue)',
                      cursor: onCitationClick ? 'pointer' : 'default',
                      fontSize: '0.85em',
                      padding: '0 2px',
                    }}
                  >
                    [{children}]
                  </span>
                </sup>
              )
            }
            // Sources-section entry: full-line clickable link, normal size.
            if (href && href.startsWith('holocron-source:')) {
              const n = parseInt(href.slice('holocron-source:'.length), 10)
              return (
                <span
                  className="lp-source-cite"
                  onClick={(e) => {
                    e.preventDefault()
                    if (Number.isFinite(n)) onCitationClick?.(n)
                  }}
                  style={{
                    color: 'var(--neon-blue)',
                    cursor: onCitationClick ? 'pointer' : 'default',
                    textDecoration: 'none',
                    borderBottom: '1px dotted var(--border-default)',
                  }}
                >
                  {children}
                </span>
              )
            }
            // Empty href — inert (don't let it reload the renderer window).
            if (!href) {
              return <a onClick={(e) => e.preventDefault()} style={{ cursor: 'text' }}>{children}</a>
            }
            // In-page anchor — scroll to the matching element ourselves.
            // Electron's native hash navigation is flaky inside a scroll
            // container; don't rely on it (and never let an unmatched `#foo`
            // reload the window).
            if (href.startsWith('#')) {
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault()
                    const id = decodeURIComponent(href.slice(1))
                    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {children}
                </a>
              )
            }
            // External link (http(s) / mailto / tel). The renderer's
            // will-navigate handler blocks in-window navigation, so a bare
            // <a href> does nothing — route through window.open, which the
            // main process's setWindowOpenHandler hands to shell.openExternal
            // (system browser / mail client). target+rel are a fallback.
            if (/^(https?:|mailto:|tel:)/i.test(href)) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer') }}
                  style={{ cursor: 'pointer' }}
                >
                  {children}
                </a>
              )
            }
            // Everything else — `wiki://<slug>`, a relative/absolute path, or
            // a bare document name. ALWAYS route through onInternalLinkClick
            // (the parent resolves it); never fall through to a bare <a href>
            // that would just try (and fail) to navigate the renderer window.
            return (
              <a
                href={href}
                onClick={(e) => {
                  e.preventDefault()
                  console.log('[CodexPreview] in-doc link clicked — href:', href)
                  onInternalLinkClick?.(href)
                }}
                style={{ cursor: 'pointer' }}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function NavButton({
  onClick,
  disabled,
  title,
  ariaLabel,
  textual,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  ariaLabel: string
  textual?: boolean
  children: React.ReactNode
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && !disabled ? 'var(--bg-subtle)' : 'transparent',
        border: '1px solid var(--border-subtle)',
        color: disabled ? 'var(--text-dim)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: textual ? 11 : 13,
        fontWeight: textual ? 600 : 400,
        padding: textual ? '3px 10px' : '3px 9px',
        borderRadius: 4,
        opacity: disabled ? 0.5 : 1,
        lineHeight: 1.2,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

function CodeMirrorWriter({
  initial,
  onChange,
}: {
  initial: string
  onChange: (next: string) => void
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Track theme name for re-mounting if it changes — same pattern Editor uses.
  const editorThemeName = useSettingsStore((s) => s.config.editorTheme.activeName)
  const customThemes = useSettingsStore((s) => s.config.editorTheme.customs)

  useEffect(() => {
    if (!hostRef.current) return
    // The settings store types `customs.tokens` loosely as
    // Record<string, string>; the canonical ScribeColorTheme uses the
    // typed token-key map. App.tsx and ScribeTab.tsx already cast the
    // same way — see Part C of Session 9 for the consolidation pass.
    const theme = resolveTheme(editorThemeName, customThemes as Record<string, ScribeColorTheme>)
    const state = EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        holocronTheme,
        syntaxHighlighting(markdownHighlightStyle),
        makeEditorThemeExtension(theme),
        EditorView.lineWrapping,
        EditorView.updateListener.of((v) => {
          if (v.docChanged) onChange(v.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorThemeName])

  return (
    <div
      ref={hostRef}
      style={{
        height: '100%',
        minHeight: 300,
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    />
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function humanizeUpdatedAt(iso: string | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  const date = new Date(t)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function shortenPath(p: string): string {
  // Keep last 3 segments for context.
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 3) return p
  return '…/' + parts.slice(-3).join('/')
}

/** Resolve a markdown link href (relative like `foo.md` / `../a/b.md`, or
 *  absolute `/...`) against the directory of the current doc's path. POSIX
 *  paths only — the codebase uses `/` separators throughout. Strips any
 *  `#fragment` / `?query`. */
function resolveRelativePath(basePath: string, href: string): string {
  const clean = href.split('#')[0].split('?')[0].trim()
  if (!clean) return basePath
  if (clean.startsWith('/')) return clean
  const baseDir = basePath.slice(0, basePath.lastIndexOf('/'))
  const out: string[] = []
  for (const part of (baseDir + '/' + clean).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') { out.pop(); continue }
    out.push(part)
  }
  return '/' + out.join('/')
}

/** Stable slug derived from heading text. Lowercase, alphanumeric +
 *  hyphens. Used for both the rendered <h2 id> and the SectionNav anchor
 *  href so they line up. */
function headingSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Recursively flatten react-markdown's children into a plain string —
 *  needed because heading children may include nested markdown nodes
 *  (links, emphasis) when generating an id. */
function extractText(children: React.ReactNode): string {
  if (children === null || children === undefined) return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(extractText).join('')
  if (typeof children === 'object' && 'props' in (children as unknown as Record<string, unknown>)) {
    const c = children as { props?: { children?: React.ReactNode } }
    return extractText(c.props?.children)
  }
  return ''
}

/** Walk the raw markdown content and collect all H2 headings in order.
 *  Used by the SectionNav at the top of the article to populate jump
 *  links. We don't include H1 (it's the title, already shown above). */
function extractSectionHeadings(content: string): Array<{ text: string; slug: string }> {
  const out: Array<{ text: string; slug: string }> = []
  const re = /^##\s+(.+?)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const text = m[1].trim()
    out.push({ text, slug: headingSlug(text) })
  }
  return out
}

function formatFullTimestamp(iso: string | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
