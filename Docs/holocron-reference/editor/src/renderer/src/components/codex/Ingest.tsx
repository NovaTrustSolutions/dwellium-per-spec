import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useScribeStore } from '../../store/scribeStore'
import { useDomainesStore } from '../../store/domainesStore'
import {
  useIngestStore,
  type IngestedDoc,
  type ActivityEvent,
  type HealthSnapshot,
  type IngestSortKey,
  type IngestSortDir,
} from '../../store/ingestStore'
import { classifyFileRelationship } from '../../hooks/useFileRelationship'
import { DomaineBadge } from '../DomaineBadge'
import { IconTrash } from '../Icons'
import { AnchoredDropdown, type AnchoredDropdownOption } from '../AnchoredDropdown'
import { CodexPreview, type PreviewMode } from './CodexPreview'

const PAGE_SIZE = 200

// Session 7 fix #4 — moved from native <select> to AnchoredDropdown so the
// popup anchors below the trigger via getBoundingClientRect + createPortal
// (matches the Wiki tab's filter row). Native <select> on macOS centers the
// menu on the current value, which reads as "popping mid-screen."
const SOURCE_TYPE_OPTIONS: AnchoredDropdownOption[] = [
  { value: 'all',        label: 'All Types'  },
  { value: 'brain_dump', label: 'Brain Dump' },
  { value: 'note',       label: 'Note'       },
  { value: 'report',     label: 'Report'     },
  { value: 'reference',  label: 'Reference'  },
  { value: 'wiki',       label: 'Wiki'       },
  { value: 'synthesis',  label: 'Synthesis'  },
  { value: 'inbox',      label: 'Inbox'      },
]

const TIER_FILTER_OPTIONS: AnchoredDropdownOption[] = [
  { value: 'all',     label: 'All Tiers' },
  { value: 'thread',  label: 'Thread'    },
  { value: 'project', label: 'Project'   },
  { value: 'domaine', label: 'Overview'  },
]

export function Ingest(): JSX.Element {
  const { config } = useSettingsStore()
  const activeProjectName = config.activeProjectName
  const activeThreadPath  = config.activeThreadPath

  // Domaine list for the selector + auto-load.
  const domaines     = useDomainesStore((s) => s.domaines)
  const loadDomainesIfNeeded = useDomainesStore((s) => s.loadIfNeeded)
  useEffect(() => { void loadDomainesIfNeeded() }, [loadDomainesIfNeeded])

  // AnchoredDropdown options — memoized so the popover's option binding is
  // stable across re-renders. Re-derives when the Domaines list changes.
  const domaineOptions = useMemo<AnchoredDropdownOption[]>(() => [
    { value: '', label: '(All Domaines)' },
    ...domaines.map((d) => ({ value: d.id, label: d.name })),
  ], [domaines])

  // Persistent state
  const documents          = useIngestStore((s) => s.documents)
  const totalDocuments     = useIngestStore((s) => s.totalDocuments)
  const activity           = useIngestStore((s) => s.activity)
  const counts             = useIngestStore((s) => s.counts)
  const loadedOnce         = useIngestStore((s) => s.loadedOnce)
  const loading            = useIngestStore((s) => s.loading)
  const error              = useIngestStore((s) => s.error)
  const filter             = useIngestStore((s) => s.filter)
  const sourceType         = useIngestStore((s) => s.sourceType)
  const tierFilter         = useIngestStore((s) => s.tierFilter)
  const selectorDomaineId  = useIngestStore((s) => s.selectorDomaineId)
  const sortKey            = useIngestStore((s) => s.sortKey)
  const sortDir            = useIngestStore((s) => s.sortDir)
  const crossDomaine       = useIngestStore((s) => s.crossDomaine)
  const activityExpanded   = useIngestStore((s) => s.activityExpanded)
  // Session 9 audit: `offset` is set (line 189) but never read here — the
  // setter keeps the store in sync; the local read was dead, removed.
  const previewDoc         = useIngestStore((s) => s.previewDoc)
  const previewMode        = useIngestStore((s) => s.previewMode)
  const setDocuments       = useIngestStore((s) => s.setDocuments)
  const appendDocuments    = useIngestStore((s) => s.appendDocuments)
  const setActivity        = useIngestStore((s) => s.setActivity)
  const setCounts          = useIngestStore((s) => s.setCounts)
  const setLoadedOnce      = useIngestStore((s) => s.setLoadedOnce)
  const setLoading         = useIngestStore((s) => s.setLoading)
  const setError           = useIngestStore((s) => s.setError)
  const setFilter          = useIngestStore((s) => s.setFilter)
  const setSourceType      = useIngestStore((s) => s.setSourceType)
  const setTierFilter      = useIngestStore((s) => s.setTierFilter)
  const setSelectorDomaineId = useIngestStore((s) => s.setSelectorDomaineId)
  const setSort            = useIngestStore((s) => s.setSort)
  const setCrossDomaine    = useIngestStore((s) => s.setCrossDomaine)
  const setActivityExpanded = useIngestStore((s) => s.setActivityExpanded)
  const setOffset          = useIngestStore((s) => s.setOffset)
  const setPreviewDoc      = useIngestStore((s) => s.setPreviewDoc)
  const health             = useIngestStore((s) => s.health)
  const healthLoading      = useIngestStore((s) => s.healthLoading)
  const setHealth          = useIngestStore((s) => s.setHealth)
  const setHealthLoading   = useIngestStore((s) => s.setHealthLoading)

  // Re-ingest tracking — per-row "in flight" set so the button can show
  // a spinner without blocking the whole table.
  const [reingestingPaths, setReingestingPaths] = useState<Set<string>>(new Set())
  const [deletingPaths, setDeletingPaths] = useState<Set<string>>(new Set())
  const [picking, setPicking] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)

  // Resizable split between document list (left) and preview (right). px-
  // based so the user's drag delta maps 1:1 to width. Persists in component
  // state only — not in domainesStore — since the value is tightly coupled
  // to the current viewport width.
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(480)
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState<boolean>(false)
  const splitRef = useRef<HTMLDivElement>(null)
  const startSplitDrag = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = leftPaneWidth
    const containerW = splitRef.current?.getBoundingClientRect().width ?? 1200
    const minW = 240
    const maxW = Math.max(minW + 1, containerW - 280)
    const onMove = (ev: MouseEvent): void => {
      ev.preventDefault()
      const next = Math.min(maxW, Math.max(minW, startWidth + (ev.clientX - startX)))
      setLeftPaneWidth(next)
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [leftPaneWidth])

  // Split-mode detection — at ≥1200px viewport, the preview sits next to
  // the list instead of covering it. Subscribes to a media-query so the
  // layout swaps live as the user resizes the window.
  const [wideViewport, setWideViewport] = useState<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1200px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1200px)')
    const onChange = (e: MediaQueryListEvent): void => setWideViewport(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ── Fetch helpers ───────────────────────────────────────────────────────

  const buildArgs = useCallback(() => ({
    domaineId: crossDomaine ? null : (selectorDomaineId || null),
    crossDomaine,
    sourceType: sourceType === 'all' ? null : sourceType,
    tier: tierFilter === 'all' ? null : tierFilter,
    search: filter.trim() || null,
    limit: PAGE_SIZE,
  }), [crossDomaine, selectorDomaineId, sourceType, tierFilter, filter])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true); setError(null); setOffset(0)
    try {
      const [docs, acts, cnts] = await Promise.all([
        window.electronAPI.ingestListDocuments({ ...buildArgs(), offset: 0 }),
        window.electronAPI.ingestListActivity(100),
        window.electronAPI.ingestCounts(),
      ])
      if (!docs.ok) setError(docs.error ?? 'Failed to load documents')
      else setDocuments(docs.data ?? [], docs.total ?? 0)
      if (acts.ok) setActivity(acts.data ?? [])
      if (cnts.ok && cnts.data) setCounts(cnts.data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false); setLoadedOnce(true)
    }
  }, [buildArgs, setDocuments, setActivity, setCounts, setLoading, setError, setLoadedOnce, setOffset])

  const loadMore = useCallback(async (): Promise<void> => {
    if (loading || documents.length >= totalDocuments) return
    const nextOffset = documents.length
    setLoading(true)
    try {
      const docs = await window.electronAPI.ingestListDocuments({ ...buildArgs(), offset: nextOffset })
      if (docs.ok) {
        appendDocuments(docs.data ?? [], docs.total ?? 0)
        setOffset(nextOffset)
      } else {
        setError(docs.error ?? 'Failed to load more')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [loading, documents.length, totalDocuments, buildArgs, appendDocuments, setOffset, setLoading, setError])

  // Initial load + re-fetch on filter change.
  useEffect(() => { void refresh() }, [refresh])

  // ── Health scan — runs after every destructive op so the badge stays
  //    in sync. Initial load happens once on mount via the same callback. ──
  const refreshHealth = useCallback(async (): Promise<void> => {
    setHealthLoading(true)
    try {
      const res = await window.electronAPI.ingestHealthScan()
      if (res.ok) {
        setHealth({
          orphanTags:          res.orphanTags,
          deadLinks:           res.deadLinks,
          sourcelessWikiPages: res.sourcelessWikiPages,
        })
      }
    } catch (err) {
      console.warn('[Ingest] health scan failed:', (err as Error).message)
    } finally {
      setHealthLoading(false)
    }
  }, [setHealth, setHealthLoading])

  useEffect(() => { void refreshHealth() }, [refreshHealth])

  // ── Re-ingest + manual ingest handlers ─────────────────────────────────

  const handleReingest = useCallback(async (doc: IngestedDoc): Promise<void> => {
    console.log('[Ingest] Re-ingest clicked', { source_path: doc.source_path, title: doc.title, tagCount: doc.tag_count, relationshipCount: doc.relationship_count, lastError: doc.last_error })
    setReingestingPaths((s) => new Set(s).add(doc.source_path))
    try {
      const res = await window.electronAPI.ragIngestManual(doc.source_path)
      console.log('[Ingest] Re-ingest result', { source_path: doc.source_path, res })
      if (!res.ok) alert(`Re-ingest failed: ${res.error ?? 'unknown error'}`)
    } catch (err) {
      console.error('[Ingest] Re-ingest threw:', err)
      alert(`Re-ingest failed: ${(err as Error).message}`)
    } finally {
      setReingestingPaths((s) => { const n = new Set(s); n.delete(doc.source_path); return n })
      void refresh()
    }
  }, [refresh])

  const handleManualIngest = useCallback(async (): Promise<void> => {
    setPicking(true)
    try {
      const res = await window.electronAPI.ingestPickAndIngest()
      if (!res.ok && res.errors.length > 0) {
        const msg = res.errors.map((e) => `${e.filePath || '(unknown)'}: ${e.error}`).join('\n')
        alert(`Ingest issues:\n${msg}`)
      } else if (res.errors.length > 0) {
        const msg = res.errors.map((e) => `${e.filePath}: ${e.error}`).join('\n')
        alert(`Ingested ${res.ingested}, skipped ${res.skipped}, with errors:\n${msg}`)
      } else if (res.ingested === 0 && res.skipped === 0) {
        // User canceled the dialog; silent.
      } else {
        alert(`Ingested ${res.ingested} file${res.ingested === 1 ? '' : 's'}, skipped ${res.skipped}.`)
      }
    } catch (err) {
      alert(`Manual ingest failed: ${(err as Error).message}`)
    } finally {
      setPicking(false)
      void refresh()
    }
  }, [refresh])

  const [syncing, setSyncing] = useState(false)
  const handleSyncWorkspace = useCallback(async (): Promise<void> => {
    setSyncing(true)
    try {
      const res = await window.electronAPI.ingestSyncWorkspace()
      if (!res.ok) {
        const msg = res.errors.map((e) => `${e.filePath || '(unknown)'}: ${e.error}`).join('\n')
        alert(`Sync failed:\n${msg || 'unknown error'}`)
        return
      }
      // Show a brief summary. The first ~8 errors get inlined; anything
      // beyond that is rolled into a count so the alert doesn't grow huge.
      const head = `Scanned ${res.scanned} markdown file${res.scanned === 1 ? '' : 's'}. ` +
                   `Ingested ${res.ingested}, skipped ${res.skipped}.`
      if (res.errors.length === 0) {
        alert(head)
        return
      }
      const sampled = res.errors.slice(0, 8)
      const more = res.errors.length - sampled.length
      const errLines = sampled.map((e) => `• ${e.filePath.split('/').pop() ?? e.filePath}: ${e.error}`).join('\n')
      const tail = more > 0 ? `\n…and ${more} more` : ''
      alert(`${head}\n\n${res.errors.length} error${res.errors.length === 1 ? '' : 's'}:\n${errLines}${tail}`)
    } catch (err) {
      alert(`Sync failed: ${(err as Error).message}`)
    } finally {
      setSyncing(false)
      void refresh()
    }
  }, [refresh])

  const [retrying, setRetrying] = useState(false)
  // Docs currently showing the red-X badge. The row renders the X badge
  // when doc.last_error is truthy (see DocRow → StatusGlyph), so that's the
  // signal we match here. tag_count = 0 is implicit for the common Gemini
  // 503 case but isn't required — any error-tagged doc is fair game.
  const failedDocs = documents.filter((d) => d.last_error !== null)
  const handleRetryFailed = useCallback(async (): Promise<void> => {
    if (failedDocs.length === 0 || retrying) return
    setRetrying(true)
    let ok = 0
    let skipped = 0
    const errors: Array<{ name: string; error: string }> = []
    try {
      for (const doc of failedDocs) {
        // Run sequentially. ingestManual already forces tag re-extraction
        // (force=true on this IPC path) so a stale 0-tag row gets a fresh
        // Gemini call. Spacing one-at-a-time avoids re-triggering whatever
        // 503 storm caused the original failure.
        try {
          const r = await window.electronAPI.ragIngestManual(doc.source_path)
          if (r.ok && r.ingested) ok++
          else if (r.ok && !r.ingested) skipped++
          else errors.push({ name: doc.title || doc.source_path.split('/').pop() || '(unknown)', error: r.error ?? 'unknown error' })
        } catch (err) {
          errors.push({ name: doc.title || doc.source_path, error: (err as Error).message })
        }
      }
      const head = `Retry complete: ${ok} re-ingested, ${skipped} skipped, ${errors.length} still failing (of ${failedDocs.length} total).`
      if (errors.length === 0) {
        alert(head)
      } else {
        const sampled = errors.slice(0, 8)
        const more = errors.length - sampled.length
        const lines = sampled.map((e) => `• ${e.name}: ${e.error}`).join('\n')
        const tail = more > 0 ? `\n…and ${more} more` : ''
        alert(`${head}\n\nStill failing:\n${lines}${tail}`)
      }
    } finally {
      setRetrying(false)
      void refresh()
    }
  }, [failedDocs, retrying, refresh])

  // ── Delete + cleanup handlers ───────────────────────────────────────────

  const handleDelete = useCallback(async (doc: IngestedDoc): Promise<void> => {
    const fileName = doc.source_path.split('/').pop() ?? doc.title
    const ok = window.confirm(
      `Delete "${fileName}"?\n\n` +
      `This removes the file from disk and purges all related tags, ` +
      `relationships, and any wiki pages this document was sole-source for. ` +
      `This cannot be undone.`,
    )
    if (!ok) return
    setDeletingPaths((s) => new Set(s).add(doc.source_path))
    try {
      const res = await window.electronAPI.ingestDeleteDocument(doc.source_path)
      if (!res.ok) {
        alert(`Delete failed: ${res.error ?? 'unknown error'}`)
        return
      }
      const swept: string[] = []
      if (res.sweptTags > 0)      swept.push(`${res.sweptTags} orphan tag${res.sweptTags === 1 ? '' : 's'}`)
      if (res.sweptWikiPages > 0) swept.push(`${res.sweptWikiPages} sourceless wiki page${res.sweptWikiPages === 1 ? '' : 's'}`)
      if (swept.length > 0) {
        console.log(`[Ingest] deleted ${fileName} — also swept ${swept.join(' and ')}`)
      }
      // Close any open Scribe tab pointing at the now-deleted file so the
      // user doesn't end up with a stale buffer that silently fails on save.
      useScribeStore.getState().closeFile(doc.source_path)
      // If this delete came from inside the preview overlay, close the
      // overlay too — there's nothing left to preview.
      if (previewDoc?.source_path === doc.source_path) {
        setPreviewDoc(null, null)
      }
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`)
    } finally {
      setDeletingPaths((s) => { const n = new Set(s); n.delete(doc.source_path); return n })
      void refresh()
      void refreshHealth()
    }
  }, [refresh, refreshHealth, previewDoc, setPreviewDoc])

  const handlePurgeDeadLinks = useCallback(async (): Promise<void> => {
    if (!health || health.deadLinks === 0) return
    const ok = window.confirm(
      `Purge ${health.deadLinks} dead link${health.deadLinks === 1 ? '' : 's'}?\n\n` +
      `These are rag_documents rows whose source file no longer exists on disk. ` +
      `Their tags, relationships, and any sole-source wiki pages will also be cleaned up. ` +
      `This cannot be undone.`,
    )
    if (!ok) return
    setCleanupBusy(true)
    try {
      const res = await window.electronAPI.ingestPurgeDeadLinks()
      if (!res.ok) {
        alert(`Purge failed: ${res.error ?? 'unknown error'}`)
      } else {
        alert(`Purged ${res.deleted} dead link${res.deleted === 1 ? '' : 's'}, swept ${res.sweptTags} orphan tag${res.sweptTags === 1 ? '' : 's'} and ${res.sweptWikiPages} sourceless wiki page${res.sweptWikiPages === 1 ? '' : 's'}.`)
      }
    } catch (err) {
      alert(`Purge failed: ${(err as Error).message}`)
    } finally {
      setCleanupBusy(false)
      void refresh()
      void refreshHealth()
    }
  }, [health, refresh, refreshHealth])

  const handleSweepOrphans = useCallback(async (): Promise<void> => {
    if (!health) return
    const total = health.orphanTags + health.sourcelessWikiPages
    if (total === 0) return
    const ok = window.confirm(
      `Sweep ${health.orphanTags} orphan tag${health.orphanTags === 1 ? '' : 's'} and ` +
      `${health.sourcelessWikiPages} sourceless wiki page${health.sourcelessWikiPages === 1 ? '' : 's'}?\n\n` +
      `This cannot be undone.`,
    )
    if (!ok) return
    setCleanupBusy(true)
    try {
      const res = await window.electronAPI.ingestSweepOrphans()
      if (!res.ok) {
        alert(`Sweep failed: ${res.error ?? 'unknown error'}`)
      } else {
        alert(`Swept ${res.sweptTags} orphan tag${res.sweptTags === 1 ? '' : 's'} and ${res.sweptWikiPages} sourceless wiki page${res.sweptWikiPages === 1 ? '' : 's'}.`)
      }
    } catch (err) {
      alert(`Sweep failed: ${(err as Error).message}`)
    } finally {
      setCleanupBusy(false)
      void refresh()
      void refreshHealth()
    }
  }, [health, refresh, refreshHealth])

  // ── Doc-row click → always preview in-tab (never jump to Scribe) ───────
  //
  // Mirrors classifyFileRelationship so the preview renders in the correct
  // mode (wiki / synthesis / cross-thread / active-thread / inbox), but
  // never switches tabs — the user stays in Ingest while inspecting any
  // document. To actually open in Scribe the user uses the "Open in Scribe"
  // button inside the preview toolbar.

  const handleDocClick = useCallback((doc: IngestedDoc): void => {
    const rel = classifyFileRelationship({
      source_path: doc.source_path,
      source_type: doc.source_type,
      source_root: doc.source_root,
      project_name: doc.project_name,
    }, activeProjectName, activeThreadPath)
    const previewMode: PreviewMode =
      rel === 'active' ? 'active-thread' : (rel as PreviewMode)
    setPreviewDoc({
      title:        doc.title,
      source_path:  doc.source_path,
      source_type:  doc.source_type,
      project_name: doc.project_name,
    }, previewMode)
  }, [activeProjectName, activeThreadPath, setPreviewDoc])

  // ── Preview rendering — overlay (narrow viewport) vs split (≥1200px) ───
  //
  // Overlay mode: when previewDoc is set, the entire Ingest body is replaced
  // with the preview — Summary + Filter + Activity stay above/below as global
  // context, but the docs table is hidden.
  //
  // Split mode: at ≥1200px the preview sits as a 60% right panel beside the
  // table (40% left). The user always sees the list with row numbers and can
  // jump between documents without closing the preview.

  // Position of the previewed doc within the loaded list (1-indexed) — used
  // for the "Document N of M" header indicator. M is the full filter total
  // (totalDocuments), not the loaded subset, so the indicator stays stable
  // across Load more clicks.
  const previewPosition = (() => {
    if (!previewDoc) return undefined
    const idx = documents.findIndex((d) => d.source_path === previewDoc.source_path)
    if (idx === -1) return undefined
    return { current: idx + 1, total: totalDocuments }
  })()

  const previewDocForDelete = previewDoc
    ? documents.find((d) => d.source_path === previewDoc.source_path) ?? null
    : null

  const previewElement = previewDoc && previewMode ? (
    <CodexPreview
      document={previewDoc}
      mode={previewMode}
      onClose={() => setPreviewDoc(null, null)}
      onDelete={previewDocForDelete ? () => void handleDelete(previewDocForDelete) : undefined}
      position={previewPosition}
      nav={{
        canBack: false,
        canForward: false,
        onBack: () => setPreviewDoc(null, null),
        onForward: () => {},
        onNavigate: (target, mode) => setPreviewDoc(target, mode),
      }}
    />
  ) : null

  // Narrow viewport + previewDoc → entire body replaced by preview (old
  // behavior). Summary + Filter + Activity still render outside; this short-
  // circuit only replaces the docs-table block.
  const overlayMode = !!previewDoc && !wideViewport

  // ── Render ──────────────────────────────────────────────────────────────

  const hasMore = documents.length < totalDocuments

  // Client-side sort of the already-fetched documents page. Default
  // `ingested` / `desc` mirrors the DB query's ORDER BY, so the first render
  // is identical to the unsorted version. Re-runs only when documents OR the
  // sort state changes — filter changes refetch and replace `documents`,
  // which then re-sorts under whatever sort key is active.
  const sortedDocs = useMemo(() => sortIngestedDocs(documents, sortKey, sortDir), [documents, sortKey, sortDir])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Combined header row — corpus stats on the left as compact muted
          chips, filter + action controls on the right. Previously this was
          two stacked rows (a tall "Documents · Tags · Relationships · Last
          Ingest · Health" stats bar followed by the filter bar) which ate
          ~80px of vertical space before the document list. Merging keeps
          the same data visible but in roughly half the height. */}
      <div
        style={{
          padding: '10px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <StatsChips
          counts={counts}
          scopedDocCount={totalDocuments}
          loading={loading && !loadedOnce}
          health={health}
          healthLoading={healthLoading}
        />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search title or path…"
          style={{
            flex: '1 1 220px', minWidth: 0, height: 28,
            padding: '0 10px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 12, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <AnchoredDropdown
          value={sourceType}
          options={SOURCE_TYPE_OPTIONS}
          onChange={setSourceType}
          title="Filter by source type"
        />
        {/* Wiki-tier filter (b5033d5 three-tier model). Narrows to rows
            joined to a rag_wiki_pages of the chosen tier — non-wiki docs
            and other-tier wiki docs drop out. "Overview" is the display
            label for the `domaine` tier value, matching the Wiki tab. */}
        <AnchoredDropdown
          value={tierFilter}
          options={TIER_FILTER_OPTIONS}
          onChange={(v) => setTierFilter(v as 'all' | 'thread' | 'project' | 'domaine')}
          title="Filter by wiki tier"
        />
        <AnchoredDropdown
          value={selectorDomaineId}
          options={domaineOptions}
          onChange={setSelectorDomaineId}
          disabled={crossDomaine}
          title={crossDomaine ? 'Disabled while "Across all Domains" is checked' : 'Filter by Domain'}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={crossDomaine}
            onChange={(e) => setCrossDomaine(e.target.checked)}
          />
          Across all
        </label>
        <div style={{ flex: '0 0 auto', fontSize: 11, color: 'var(--text-dim)' }}>
          {loading
            ? 'Loading…'
            : `${documents.length} of ${totalDocuments} doc${totalDocuments === 1 ? '' : 's'}`}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {health && health.deadLinks > 0 && (
            <button
              onClick={() => void handlePurgeDeadLinks()}
              disabled={cleanupBusy}
              style={warnPillButton}
              title="Delete rag_documents rows whose source file is no longer on disk"
            >
              Purge {health.deadLinks} dead link{health.deadLinks === 1 ? '' : 's'}
            </button>
          )}
          {health && (health.orphanTags + health.sourcelessWikiPages) > 0 && (
            <button
              onClick={() => void handleSweepOrphans()}
              disabled={cleanupBusy}
              style={warnPillButton}
              title="Remove tags and wiki pages with no remaining source document"
            >
              Sweep {health.orphanTags + health.sourcelessWikiPages} orphan{(health.orphanTags + health.sourcelessWikiPages) === 1 ? '' : 's'}
            </button>
          )}
          <button
            onClick={() => void refresh()}
            disabled={loading}
            style={pillButton(false)}
          >
            Refresh
          </button>
          <button
            onClick={() => void handleSyncWorkspace()}
            disabled={syncing}
            title="Walk the projects root and ingest every .md file under each Domain"
            style={pillButton(false)}
          >
            {syncing ? 'Syncing…' : 'Sync workspace'}
          </button>
          {failedDocs.length > 0 && (
            <button
              onClick={() => void handleRetryFailed()}
              disabled={retrying}
              title={`Re-ingest the ${failedDocs.length} document${failedDocs.length === 1 ? '' : 's'} currently showing an error badge (forces tag re-extraction)`}
              style={pillButton(false)}
            >
              {retrying ? `Retrying ${failedDocs.length}…` : `Retry failed (${failedDocs.length})`}
            </button>
          )}
          <button
            onClick={() => void handleManualIngest()}
            disabled={picking}
            style={pillButton(true)}
          >
            {picking ? 'Picking…' : '+ Ingest file…'}
          </button>
        </div>
      </div>

      {/* Body — overlay or split depending on viewport + previewDoc */}
      {overlayMode && previewElement ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {previewElement}
        </div>
      ) : (
        <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* Left pane: document list. Width: collapsed → 0, otherwise the
              user-dragged px width when a preview is alongside, or full
              flex:1 when there's no preview to share with.
              No top padding — DocsHeaderRow is position:sticky and needs to
              pin flush against the filter row above. Any top padding here
              creates a gap where rows scroll under and become visible above
              the sticky header. */}
          <div
            style={{
              flex: wideViewport && previewElement
                ? (leftPaneCollapsed ? '0 0 0' : `0 0 ${leftPaneWidth}px`)
                : '1',
              minWidth: 0,
              minHeight: 0,
              overflow: leftPaneCollapsed ? 'hidden' : 'auto',
              padding: leftPaneCollapsed ? 0 : '0 24px 24px',
              transition: 'flex-basis 120ms ease',
            }}
          >
            {!leftPaneCollapsed && (
              <>
                {error && (
                  <div style={{ color: '#ff2d78', fontSize: 13, marginBottom: 12 }}>{error}</div>
                )}
                {!loading && loadedOnce && documents.length === 0 && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>
                    No ingested documents match your filters.
                  </div>
                )}
                {documents.length > 0 && (
                  <DocumentsTable
                    docs={sortedDocs}
                    activePath={previewDoc?.source_path ?? null}
                    reingestingPaths={reingestingPaths}
                    deletingPaths={deletingPaths}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={setSort}
                    onReingest={(d) => void handleReingest(d)}
                    onDelete={(d) => void handleDelete(d)}
                    onClick={handleDocClick}
                  />
                )}
                {hasMore && !loading && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                    <button onClick={() => void loadMore()} style={pillButton(false)}>
                      Load more ({totalDocuments - documents.length} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Divider + collapse toggle — only visible when there's a preview
              alongside. Drag the spine to resize; click the chevron to
              fully collapse the left pane. */}
          {wideViewport && previewElement && (
            <div
              style={{
                width: 6, flexShrink: 0,
                background: 'var(--border-subtle)',
                position: 'relative',
                cursor: leftPaneCollapsed ? 'default' : 'col-resize',
                userSelect: 'none',
              }}
              onMouseDown={(e) => { if (!leftPaneCollapsed) startSplitDrag(e) }}
              title={leftPaneCollapsed ? 'Click chevron to expand list' : 'Drag to resize · click chevron to collapse list'}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setLeftPaneCollapsed((v) => !v) }}
                title={leftPaneCollapsed ? 'Expand document list' : 'Collapse document list (full-width preview)'}
                style={{
                  // Centered vertically on the divider rather than pinned
                  // to the top — matches the Graph rail spine and reads
                  // as the natural grab point regardless of panel height.
                  position: 'absolute',
                  top: '50%',
                  left: -10,
                  transform: 'translateY(-50%)',
                  width: 26, height: 26,
                  borderRadius: 13,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontFamily: 'monospace',
                  zIndex: 4,
                  padding: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--neon-blue)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                {leftPaneCollapsed ? '▶' : '◀'}
              </button>
            </div>
          )}

          {/* Right pane: preview. Takes all remaining space. */}
          {wideViewport && previewElement && (
            <div
              style={{
                flex: 1, minWidth: 0, minHeight: 0,
                display: 'flex',
              }}
            >
              {previewElement}
            </div>
          )}
        </div>
      )}

      {/* Activity log — collapsed by default */}
      <ActivitySection
        activity={activity}
        expanded={activityExpanded}
        onToggle={() => setActivityExpanded(!activityExpanded)}
      />
    </div>
  )
}

// ── Summary chips ────────────────────────────────────────────────────────
//
// Compact replacement for the old SummaryRow + SummaryStat + HealthBadge
// trio. Renders the corpus stats as a single flat run of muted text
// ("42 docs · 208 tags · 267 rel · 52m ago") followed by a colored health
// dot + label ("● Clean" / "● 3 issues"). Designed to sit inline as the
// first child of the filter row so we get one header instead of two.
//
// No labels above numbers, no `fontSize: 16/700` headline numbers — just
// muted secondary text. Hover tooltips preserve the prior detail
// (Domaine-filter mismatch on Documents; orphan/dead-link breakdown on
// Health) so nothing was lost in the compression.

function StatsChips({ counts, scopedDocCount, loading, health, healthLoading }: {
  counts: { documents: number; tags: number; relationships: number; lastIngestAt: string | null } | null
  /** Count of documents currently in scope (matches the list below).
   *  Comes from the listIngestedDocuments window function — already
   *  filtered by Domaine + bridge predicate. counts.documents is the
   *  unscoped global total, kept available in the tooltip below. */
  scopedDocCount: number
  loading: boolean
  health: HealthSnapshot | null
  healthLoading: boolean
}): JSX.Element {
  const docValue   = counts ? scopedDocCount : (loading ? '—' : 0)
  const tagValue   = counts?.tags          ?? (loading ? '—' : 0)
  const relValue   = counts?.relationships ?? (loading ? '—' : 0)
  const lastValue  = counts?.lastIngestAt ? humanizeShort(counts.lastIngestAt) : (loading ? '—' : 'never')
  const docTooltip = counts && counts.documents !== scopedDocCount
    ? `${scopedDocCount} in scope · ${counts.documents} total across all Domaines`
    : undefined

  const issues = health ? (health.orphanTags + health.deadLinks + health.sourcelessWikiPages) : 0
  const clean  = health !== null && issues === 0
  const healthColor = healthLoading || !health
    ? 'var(--text-dim)'
    : clean
      ? '#00ff88'
      : '#ffd60a'
  const healthLabel = healthLoading || !health
    ? 'scanning…'
    : clean
      ? 'Clean'
      : `${issues} issue${issues === 1 ? '' : 's'}`
  const healthTooltip = health
    ? `Orphan tags: ${health.orphanTags}\nDead links: ${health.deadLinks}\nSourceless wiki pages: ${health.sourcelessWikiPages}`
    : 'Running health scan…'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        flexShrink: 0, flexWrap: 'wrap',
        fontSize: 11, color: 'var(--text-secondary)',
        // Right-edge separator from the search input so the eye groups the
        // chips together as a unit. Padding-right matches the row's gap.
        paddingRight: 4,
        borderRight: '1px solid var(--border-subtle)',
        marginRight: 4,
      }}
    >
      <Chip value={docValue}  unit="docs" title={docTooltip} />
      <Sep />
      <Chip value={tagValue}  unit="tags" />
      <Sep />
      <Chip value={relValue}  unit="rel"  title="Tag-overlap + wikilink edges between documents" />
      <Sep />
      <Chip value={lastValue} unit="ago"  title={counts?.lastIngestAt ?? undefined} suppressUnitWhen={['never', '—']} />
      <Sep />
      <span
        title={healthTooltip}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          color: healthColor, fontWeight: 600,
        }}
      >
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: healthColor, opacity: healthLoading ? 0.4 : 1,
        }} />
        {healthLabel}
      </span>
    </div>
  )
}

/** Single "value unit" pair (e.g. "42 docs"). Value is bumped slightly in
 *  weight + contrast so the number reads first; unit stays muted. When the
 *  value is one of the placeholder strings (e.g. "never"), the unit is
 *  suppressed so "never" reads as a sentence on its own. */
function Chip({ value, unit, title, suppressUnitWhen = [] }: {
  value: string | number
  unit: string
  title?: string
  suppressUnitWhen?: string[]
}): JSX.Element {
  const valueStr = String(value)
  const showUnit = !suppressUnitWhen.includes(valueStr)
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{valueStr}</span>
      {showUnit && <span style={{ color: 'var(--text-dim)' }}>{unit}</span>}
    </span>
  )
}

function Sep(): JSX.Element {
  return <span style={{ color: 'var(--text-dim)' }}>·</span>
}

// ── Documents table ──────────────────────────────────────────────────────

function DocumentsTable({
  docs,
  activePath,
  reingestingPaths,
  deletingPaths,
  sortKey,
  sortDir,
  onSort,
  onReingest,
  onDelete,
  onClick,
}: {
  docs: IngestedDoc[]
  /** source_path of the doc currently in the preview pane — highlighted in
   *  the table so split-mode users can see where they are at a glance. */
  activePath: string | null
  reingestingPaths: Set<string>
  deletingPaths: Set<string>
  sortKey: IngestSortKey
  sortDir: IngestSortDir
  onSort: (key: IngestSortKey) => void
  onReingest: (d: IngestedDoc) => void
  onDelete: (d: IngestedDoc) => void
  onClick: (d: IngestedDoc) => void
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <DocsHeaderRow sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      {docs.map((d, idx) => (
        <DocRow
          key={d.id}
          doc={d}
          rowNumber={idx + 1}
          active={d.source_path === activePath}
          reingesting={reingestingPaths.has(d.source_path)}
          deleting={deletingPaths.has(d.source_path)}
          onReingest={() => onReingest(d)}
          onDelete={() => onDelete(d)}
          onClick={() => onClick(d)}
        />
      ))}
    </div>
  )
}

/** Client-side sort over a documents page. Stable per the sort spec. The
 *  default sort (`ingested` / `desc`) matches the DB query's ORDER BY, so
 *  passing through the unsorted list under the default state is a no-op
 *  reordering. Returns a NEW array — never mutates the input. */
function sortIngestedDocs(docs: IngestedDoc[], key: IngestSortKey, dir: IngestSortDir): IngestedDoc[] {
  const out = docs.slice()
  out.sort((a, b) => {
    let c = 0
    switch (key) {
      case 'title':           c = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }); break
      case 'type':            c = a.source_type.localeCompare(b.source_type, undefined, { sensitivity: 'base' }); break
      case 'project_domaine': c = (a.project_name ?? '').localeCompare(b.project_name ?? '', undefined, { sensitivity: 'base' }); break
      case 'tags':            c = a.tag_count - b.tag_count; break
      case 'edges':           c = a.relationship_count - b.relationship_count; break
      case 'ingested':        c = a.ingested_at.localeCompare(b.ingested_at); break
    }
    return dir === 'asc' ? c : -c
  })
  return out
}

const DOC_GRID_COLUMNS = '40px 24px minmax(0, 2.5fr) 80px minmax(0, 1fr) 64px 64px 130px 32px 32px'

function DocsHeaderRow({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: IngestSortKey
  sortDir: IngestSortDir
  onSort: (key: IngestSortKey) => void
}): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: DOC_GRID_COLUMNS,
        gap: 10,
        padding: '4px 10px',
        fontSize: 10, color: 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: 0.4,
        borderBottom: '1px solid var(--border-subtle)',
        // Sticky to the top of the surrounding scroll container so the
        // column labels stay visible as the doc list scrolls. Background
        // matches the panel so rows scrolling underneath don't show
        // through. z-index sits above the row hover affordances (which
        // don't set z-index themselves).
        position: 'sticky',
        top: 0,
        zIndex: 2,
        background: 'var(--bg-base)',
      }}
    >
      <span style={{ textAlign: 'right' }}>#</span>
      <span />
      <SortableHeader label="Title"             col="title"            sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <SortableHeader label="Type"              col="type"             sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <SortableHeader label="Project · Domain" col="project_domaine"  sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <SortableHeader label="Tags"              col="tags"     align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <SortableHeader label="Edges"             col="edges"    align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <SortableHeader label="Ingested"          col="ingested"         sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <span />
      <span />
    </div>
  )
}

/** Clickable column header with a sort-direction indicator. Inactive →
 *  faint `↕`; active asc → `↑`; active desc → `↓`. Click cycles via
 *  `onSort` (see ingestStore.setSort). */
function SortableHeader({
  label, col, align = 'left', sortKey, sortDir, onSort,
}: {
  label:   string
  col:     IngestSortKey
  align?:  'left' | 'right'
  sortKey: IngestSortKey
  sortDir: IngestSortDir
  onSort:  (key: IngestSortKey) => void
}): JSX.Element {
  const active = sortKey === col
  const arrow  = active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      title={`Sort by ${label}`}
      style={{
        // Match the surrounding header's typography exactly so the
        // sortable headers don't visually drift from the static `#` column.
        font: 'inherit', textTransform: 'uppercase', letterSpacing: 0.4,
        background: 'none', border: 'none', padding: 0, margin: 0,
        color: active ? 'var(--text-secondary)' : 'var(--text-dim)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 4, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: 9, opacity: active ? 1 : 0.45 }}>{arrow}</span>
    </button>
  )
}

function DocRow({
  doc, rowNumber, active, reingesting, deleting, onReingest, onDelete, onClick,
}: {
  doc: IngestedDoc
  rowNumber: number
  active: boolean
  reingesting: boolean
  deleting: boolean
  onReingest: () => void
  onDelete: () => void
  onClick: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const status = doc.last_error ? 'error' : 'ok'
  const fileName = doc.source_path.split('/').pop() ?? doc.title

  // Active row (the one being previewed) gets a left-border accent + bg
  // tint so split-mode users see at a glance which row maps to the preview.
  const bg = active
    ? 'var(--bg-selected)'
    : hovered
      ? 'var(--bg-subtle)'
      : 'transparent'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: DOC_GRID_COLUMNS,
        gap: 10,
        padding: '8px 10px',
        background: bg,
        borderLeft: active ? '2px solid var(--neon-blue)' : '2px solid transparent',
        borderRadius: 4,
        cursor: 'pointer',
        alignItems: 'center',
        fontSize: 12,
        opacity: deleting ? 0.4 : 1,
      }}
    >
      <span
        style={{
          textAlign: 'right',
          color: active ? 'var(--neon-blue)' : 'var(--text-dim)',
          fontFamily: 'monospace',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 11,
          fontWeight: active ? 600 : 400,
        }}
      >
        {rowNumber}
      </span>
      <StatusGlyph status={status} title={doc.last_error ?? 'Active'} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.title || fileName}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{doc.source_type}</span>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
          {doc.project_name ?? '—'}
        </span>
        <DomaineBadge domaineId={doc.domaine_id} />
      </div>
      <span style={{ textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{doc.tag_count}</span>
      <span style={{ textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{doc.relationship_count}</span>
      <span
        title={`Ingested ${doc.ingested_at}\nLast modified ${doc.last_modified}`}
        style={{ fontSize: 11, color: 'var(--text-dim)' }}
      >
        {humanizeShort(doc.ingested_at)}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onReingest() }}
        disabled={reingesting || deleting}
        title="Re-ingest"
        style={{
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          width: 24, height: 24,
          color: reingesting ? 'var(--text-dim)' : 'var(--text-secondary)',
          cursor: reingesting ? 'wait' : 'pointer',
          fontSize: 13, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {reingesting ? '…' : '⟳'}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        disabled={deleting || reingesting}
        title="Delete from disk + database"
        style={{
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          width: 24, height: 24,
          color: deleting ? 'var(--text-dim)' : '#ff2d78',
          cursor: deleting ? 'wait' : 'pointer',
          padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <IconTrash size={12} />
      </button>
    </div>
  )
}

function StatusGlyph({ status, title }: { status: 'ok' | 'error'; title: string }): JSX.Element {
  if (status === 'error') {
    return (
      <span title={title} style={{ color: '#ff2d78', fontSize: 14, lineHeight: 1, textAlign: 'center' }}>✗</span>
    )
  }
  return (
    <span title={title} style={{ color: '#00ff88', fontSize: 12, lineHeight: 1, textAlign: 'center' }}>✓</span>
  )
}

// ── Activity log ─────────────────────────────────────────────────────────

function ActivitySection({
  activity, expanded, onToggle,
}: { activity: ActivityEvent[]; expanded: boolean; onToggle: () => void }): JSX.Element {
  return (
    <div
      style={{
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
        maxHeight: expanded ? '40%' : 'auto',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          background: 'var(--bg-subtle)',
          border: 'none',
          padding: '8px 24px',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: 0.6,
          fontFamily: 'inherit',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-block', width: 10, color: 'var(--text-dim)' }}>{expanded ? '▼' : '▶'}</span>
        Activity log
        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>
          {activity.length} recent event{activity.length === 1 ? '' : 's'}
        </span>
      </button>
      {expanded && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px' }}>
          {activity.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No recent activity.</div>
          ) : (
            activity.map((e) => <ActivityRow key={e.id} event={e} />)
          )}
        </div>
      )}
    </div>
  )
}

function ActivityRow({ event }: { event: ActivityEvent }): JSX.Element {
  const isError = !!event.error
  const isSkip  = !isError && !!event.skipped
  const glyph   = isError ? '✗' : isSkip ? '◌' : '✓'
  const color   = isError ? '#ff2d78' : isSkip ? 'var(--text-dim)' : '#00ff88'
  const path    = event.source_path?.split('/').pop() ?? '(unknown)'
  const detail  = isError
    ? event.error
    : isSkip
    ? 'unchanged — skipped'
    : `${event.tag_count ?? 0} tag${event.tag_count === 1 ? '' : 's'}`

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 120px 1fr 80px',
        gap: 10,
        padding: '4px 0',
        fontSize: 11, color: 'var(--text-secondary)',
        alignItems: 'center',
      }}
      title={event.source_path ?? ''}
    >
      <span style={{ color, textAlign: 'center', lineHeight: 1 }}>{glyph}</span>
      <span style={{ color: 'var(--text-dim)', fontFamily: 'monospace' }}>{humanizeShort(event.created_at)}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{path}</span>
        <span style={{ color: 'var(--text-dim)' }}> · {detail}</span>
      </span>
      <span style={{ color: 'var(--text-dim)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {event.duration_ms != null ? `${event.duration_ms}ms` : ''}
      </span>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function humanizeShort(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Session 9 audit: `selectStyle` was the native-<select> styling kept after
// Session 7's AnchoredDropdown migration; no callers remained. Removed.

function pillButton(primary: boolean): React.CSSProperties {
  return {
    height: 28, padding: '0 12px',
    background: primary ? 'var(--neon-blue)' : 'var(--bg-subtle)',
    border: '1px solid ' + (primary ? 'var(--neon-blue)' : 'var(--border-subtle)'),
    borderRadius: 4,
    color: primary ? 'var(--bg-base)' : 'var(--text-secondary)',
    fontSize: 12, fontFamily: 'inherit',
    fontWeight: primary ? 600 : 400,
    cursor: 'pointer',
  }
}

const warnPillButton: React.CSSProperties = {
  height: 28, padding: '0 12px',
  background: 'transparent',
  border: '1px solid #ffd60a',
  borderRadius: 4,
  color: '#ffd60a',
  fontSize: 12, fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
}
