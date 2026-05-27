import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  useCodexWikiStore,
  type WikiPageListItem,
  type WikiNavEntry,
  type WikiSortKey,
  type WikiTier,
  type WikiTierFilter,
} from '../../store/codexWikiStore'
import { useDomainesStore } from '../../store/domainesStore'
import { DomaineBadge } from '../DomaineBadge'
import { AnchoredDropdown, type AnchoredDropdownOption } from '../AnchoredDropdown'
import { CodexPreview, type PreviewDoc, type PreviewMode } from './CodexPreview'

export function Wiki(): JSX.Element {
  const pages         = useCodexWikiStore((s) => s.pages)
  const loadedOnce    = useCodexWikiStore((s) => s.loadedOnce)
  const loading       = useCodexWikiStore((s) => s.loading)
  const error         = useCodexWikiStore((s) => s.error)
  const filter        = useCodexWikiStore((s) => s.filter)
  const sortKey       = useCodexWikiStore((s) => s.sortKey)
  const sortDir       = useCodexWikiStore((s) => s.sortDir)
  const historyStack  = useCodexWikiStore((s) => s.historyStack)
  const historyCursor = useCodexWikiStore((s) => s.historyCursor)
  const setPages      = useCodexWikiStore((s) => s.setPages)
  const setLoading    = useCodexWikiStore((s) => s.setLoading)
  const setError      = useCodexWikiStore((s) => s.setError)
  const setLoadedOnce = useCodexWikiStore((s) => s.setLoadedOnce)
  const tierFilter    = useCodexWikiStore((s) => s.tierFilter)
  const selectorDomaineId    = useCodexWikiStore((s) => s.selectorDomaineId)
  const setSelectorDomaineId = useCodexWikiStore((s) => s.setSelectorDomaineId)
  const setFilter     = useCodexWikiStore((s) => s.setFilter)
  const setSortKey    = useCodexWikiStore((s) => s.setSortKey)
  const setSortDir    = useCodexWikiStore((s) => s.setSortDir)
  const setTierFilter = useCodexWikiStore((s) => s.setTierFilter)
  const navigateTo    = useCodexWikiStore((s) => s.navigateTo)
  const resetTo       = useCodexWikiStore((s) => s.resetTo)
  const goBack        = useCodexWikiStore((s) => s.goBack)
  const goForward     = useCodexWikiStore((s) => s.goForward)
  const backToGrid    = useCodexWikiStore((s) => s.backToGrid)

  const [compiling, setCompiling] = useState(false)

  // Domaine filter — selector value persists in codexWikiStore (defaults to
  // "(All Domaines)", survives tab switches). crossDomaine bypass disables
  // the selector; it stays component-local (resets to off on remount).
  const domaines        = useDomainesStore((s) => s.domaines)
  const loadDomainesIfNeeded = useDomainesStore((s) => s.loadIfNeeded)
  useEffect(() => { void loadDomainesIfNeeded() }, [loadDomainesIfNeeded])

  const [crossDomaine, setCrossDomaine] = useState<boolean>(false)

  // Domaine selector options — "(All Domaines)" sentinel at top, then one
  // row per Domaine in the store. Memoized so the AnchoredDropdown doesn't
  // see a new array reference on every parent render.
  const domaineOptions = useMemo<AnchoredDropdownOption[]>(() => [
    { value: '', label: '(All Domains)' },
    ...domaines.map((d) => ({ value: d.id, label: d.name })),
  ], [domaines])

  const refreshList = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.electronAPI.wikiList({
        domaineId: crossDomaine ? null : (selectorDomaineId || null),
        crossDomaine,
        tier: tierFilter === 'all' ? undefined : tierFilter,
      })
      if (!res.ok) {
        setError(res.error ?? 'Failed to load wiki pages')
      } else {
        setPages(res.data ?? [])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }, [setPages, setLoading, setError, setLoadedOnce, selectorDomaineId, crossDomaine, tierFilter])

  // Refetch whenever the Domaine filter or tier filter changes (after first mount).
  useEffect(() => {
    if (loadedOnce) void refreshList()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectorDomaineId, crossDomaine, tierFilter])

  // Load on first mount only — return-to-tab does not re-fetch.
  useEffect(() => {
    if (!loadedOnce) {
      void refreshList()
    }
  }, [loadedOnce, refreshList])

  const openPage = useCallback((slug: string, title: string): void => {
    // Card click from grid — start a fresh navigation session by resetting
    // history. (Not navigateTo: we don't want forward arrows from a prior
    // session to reappear when the user picks a different page.)
    const entry: WikiNavEntry = {
      doc: {
        slug,
        title,
        source_path: `_Codex/Wiki/${slug}.md`,
        source_type: 'wiki',
        project_name: null,
      },
      mode: 'wiki',
    }
    resetTo(entry)
  }, [resetTo])

  const handleCompileNow = useCallback(async (): Promise<void> => {
    setCompiling(true)
    try {
      const res = await window.electronAPI.wikiCompileNow()
      if (!res.ok) {
        alert(`Compile failed: ${res.error ?? 'unknown error'}`)
      } else {
        const compiled = res.data?.compiled.length ?? 0
        const skipped  = res.data?.skipped.length  ?? 0
        if (compiled === 0 && skipped === 0) {
          alert('No new pages to compile. Need ≥3 documents sharing a tag for cold start.')
        } else {
          alert(`Compiled ${compiled} page${compiled === 1 ? '' : 's'}, skipped ${skipped}.`)
        }
        await refreshList()
      }
    } catch (err) {
      alert(`Compile failed: ${(err as Error).message}`)
    } finally {
      setCompiling(false)
    }
  }, [refreshList])

  // ── Computed grid state (must live ABOVE the early-return below so the
  //    hook count stays stable across grid and reading-mode renders — see
  //    Rules of Hooks). Cheap when in reading mode since pages is rarely
  //    large; React skips re-execution when deps haven't changed. ──────
  const visiblePages = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let list = pages
    if (q) {
      list = list.filter((p) => {
        const title = p.title.toLowerCase()
        const desc  = extractDescription(p.content_head).toLowerCase()
        return title.includes(q) || desc.includes(q)
      })
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title':   cmp = a.title.localeCompare(b.title); break
        case 'created': cmp = Date.parse(a.created_at) - Date.parse(b.created_at); break
        case 'updated': cmp = Date.parse(a.updated_at) - Date.parse(b.updated_at); break
        case 'sources': cmp = a.source_count - b.source_count; break
        case 'tier':    cmp = tierRank(a.tier) - tierRank(b.tier); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [pages, filter, sortKey, sortDir])

  // ── Reading mode: delegate to CodexPreview ────────────────────────────
  // historyCursor >= 0 means we're inside a navigation session. The current
  // entry drives what's rendered. Wikilink/citation clicks inside the preview
  // route through nav.onNavigate → navigateTo, advancing the stack. Back /
  // Forward / Index buttons in the preview's toolbar are wired via the nav
  // prop. Index = backToGrid (clears stack, returns here).
  if (historyCursor >= 0) {
    const entry = historyStack[historyCursor]
    return (
      <CodexPreview
        document={entry.doc}
        mode={entry.mode}
        onClose={backToGrid}
        onAction={(kind) => {
          if (kind === 'regenerate') {
            void refreshList()
          }
        }}
        nav={{
          canBack:    historyCursor > 0,
          canForward: historyCursor < historyStack.length - 1,
          onBack:     goBack,
          onForward:  goForward,
          onIndex:    backToGrid,
          onNavigate: (target: PreviewDoc, mode: PreviewMode) => {
            navigateTo({ doc: target, mode })
          },
        }}
      />
    )
  }

  // ── Grid mode ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter wiki pages…"
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            height: 28,
            padding: '0 10px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <AnchoredDropdown
          value={sortKey}
          options={SORT_OPTIONS}
          onChange={(v) => setSortKey(v as WikiSortKey)}
          title="Sort by"
          minWidth={100}
        />
        <button
          onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
          title={sortDir === 'asc' ? 'Ascending — click to flip' : 'Descending — click to flip'}
          style={{
            height: 28, width: 28,
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            fontSize: 12, fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>

        {/* Tier filter. Stacks with the Domaine filter — you can scope by
            both at once (e.g. "Project wikis in Astra"). */}
        <AnchoredDropdown
          value={tierFilter}
          options={TIER_FILTER_OPTIONS}
          onChange={(v) => setTierFilter(v as WikiTierFilter)}
          title="Filter by tier"
        />

        {/* Domaine filter — selector + explicit Across-all toggle.
            Built from the domainesStore list at render time. */}
        <AnchoredDropdown
          value={selectorDomaineId}
          options={domaineOptions}
          onChange={setSelectorDomaineId}
          title={crossDomaine ? 'Disabled while "Across all Domains" is checked' : 'Filter by Domain'}
          disabled={crossDomaine}
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
            : `${visiblePages.length} of ${pages.length} page${pages.length === 1 ? '' : 's'}`}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button
            onClick={() => void refreshList()}
            disabled={loading}
            style={{
              height: 28, padding: '0 10px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              color: 'var(--text-secondary)',
              fontSize: 12, fontFamily: 'inherit',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            Refresh
          </button>
          <button
            onClick={() => void handleCompileNow()}
            disabled={compiling}
            style={{
              height: 28, padding: '0 12px',
              background: 'var(--neon-blue)',
              border: '1px solid var(--neon-blue)',
              borderRadius: 4,
              color: 'var(--bg-base)',
              fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
              cursor: compiling ? 'wait' : 'pointer',
              opacity: compiling ? 0.6 : 1,
            }}
          >
            {compiling ? 'Compiling…' : 'Compile now'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 24px' }}>
        {error && (
          <div style={{ color: 'var(--neon-red, #f55)', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}
        {!loading && loadedOnce && pages.length === 0 && (
          <EmptyState onCompile={() => void handleCompileNow()} compiling={compiling} />
        )}
        {!loading && pages.length > 0 && visiblePages.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>
            No wiki pages match "{filter}".
          </div>
        )}
        {visiblePages.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {visiblePages.map((p) => (
              <PageCard key={p.slug} page={p} onOpen={() => openPage(p.slug, p.title)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Session 9 audit: `selectStyle` was the native-<select> styling kept after
// Session 7's AnchoredDropdown migration; no callers remained. Removed.

function EmptyState({ onCompile, compiling }: { onCompile: () => void; compiling: boolean }): JSX.Element {
  return (
    <div
      style={{
        padding: '40px 16px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        maxWidth: 540,
        margin: '0 auto',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
        No wiki pages compiled yet
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
        Pages auto-compile in the background after every 5 ingests. Or click{' '}
        <strong>Compile now</strong> to bootstrap from existing tags shared by ≥3 documents.
      </div>
      <button
        onClick={onCompile}
        disabled={compiling}
        style={{
          height: 32, padding: '0 16px',
          background: 'var(--neon-blue)',
          border: '1px solid var(--neon-blue)',
          borderRadius: 4,
          color: 'var(--bg-base)',
          fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
          cursor: compiling ? 'wait' : 'pointer',
        }}
      >
        {compiling ? 'Compiling…' : 'Compile now'}
      </button>
    </div>
  )
}

function PageCard({ page, onOpen }: { page: WikiPageListItem; onOpen: () => void }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const description = extractDescription(page.content_head)
  const updatedFull = formatFullDate(page.updated_at)
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        textAlign: 'left',
        padding: 14,
        background: hovered ? 'var(--bg-subtle)' : 'transparent',
        border: '1px solid ' + (hovered ? 'var(--neon-blue)' : 'var(--border-subtle)'),
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: 'var(--text-primary)',
        minHeight: 132,
        transition: 'border-color 80ms ease, background 80ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          {page.title}
        </span>
        {/* Dominant Domaine for this wiki page. "+N" appears when sources
            span multiple Domaines. Renders null pre-assignment (legacy
            pages with domaine_id NULL) — backfill at boot resolves those. */}
        <DomaineBadge
          domaineId={page.domaine_id}
          overflow={page.domaine_overflow_count}
        />
      </div>
      {description && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: 8,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {description}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-dim)',
          marginTop: 'auto',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
        title={`Created ${formatFullDate(page.created_at)}\nUpdated ${updatedFull}`}
      >
        <span>{page.source_count} source{page.source_count === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>Updated {humanizeShort(page.updated_at)}</span>
        {page.tier && (
          <>
            <span style={{ marginLeft: 'auto' }} />
            <TierBadge tier={page.tier} />
          </>
        )}
      </div>
    </button>
  )
}

// ── Toolbar dropdown options (sort key, tier filter) ──────────────────────
// The dropdown component itself lives in `../AnchoredDropdown` — Session 7
// fix #4 extracted it so Codex Ingest, Wiki, and future callsites share
// one portal-anchored implementation.

const SORT_OPTIONS: AnchoredDropdownOption[] = [
  { value: 'updated', label: 'Updated' },
  { value: 'created', label: 'Created' },
  { value: 'title',   label: 'Title'   },
  { value: 'sources', label: 'Sources' },
  { value: 'tier',    label: 'Tier'    },
]

const TIER_FILTER_OPTIONS: AnchoredDropdownOption[] = [
  { value: 'all',     label: 'All tiers' },
  { value: 'thread',  label: 'Thread'    },
  { value: 'project', label: 'Project'   },
  // "Domaine" as a tier name collides visually with the Domaine selector
  // beside it — surface as "Overview" while keeping the DB value 'domaine'.
  { value: 'domaine', label: 'Overview'  },
]

/** Tier rank for sort. Larger = higher in the hierarchy, so sortDir='desc'
 *  groups the Overview tier (domaine wikis) first. */
function tierRank(tier: WikiTier | null): number {
  switch (tier) {
    case 'domaine': return 3
    case 'project': return 2
    case 'thread':  return 1
    default:        return 0
  }
}

/** Subtle tier pill rendered at the bottom of each wiki card.
 *  Color-coded: Thread = cyan, Project = amber, Overview (domaine tier)
 *  = violet. Display label for the domaine tier is "Overview" — the
 *  underlying DB value stays `'domaine'` so backend filters / sorts /
 *  joins keep working. */
function TierBadge({ tier }: { tier: WikiTier }): JSX.Element {
  const STYLES: Record<WikiTier, { bg: string; fg: string; border: string; label: string }> = {
    thread:  { bg: 'rgba(0,212,255,0.12)',   fg: '#7fd9ff', border: 'rgba(0,212,255,0.40)', label: 'Thread'   },
    project: { bg: 'rgba(255,170,0,0.12)',   fg: '#ffce7a', border: 'rgba(255,170,0,0.40)', label: 'Project'  },
    domaine: { bg: 'rgba(170,100,255,0.14)', fg: '#cfa3ff', border: 'rgba(170,100,255,0.45)', label: 'Overview' },
  }
  const s = STYLES[tier]
  return (
    <span
      style={{
        padding: '1px 7px',
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: 'monospace',
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  )
}

/** Extract a one-paragraph description from the page's content_head.
 *  Prefers the Overview section's first paragraph; falls back to first
 *  paragraph after the title heading. Caps at 240 chars. */
function extractDescription(contentHead: string): string {
  if (!contentHead) return ''
  const trimmedHead = contentHead.trim()
  // Try the Overview section first.
  const overviewMatch = trimmedHead.match(/##\s+Overview\s*\n+([^\n]+(?:\n(?!##|\n)[^\n]+)*)/m)
  if (overviewMatch) {
    return shorten(overviewMatch[1].trim(), 240)
  }
  // Fall back: first paragraph after the # title (or first non-empty line).
  const afterTitle = trimmedHead.replace(/^#[^\n]*\n+/, '')
  const firstPara = afterTitle.split(/\n\n+/)[0]
  return shorten(firstPara.trim(), 240)
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).replace(/\s\S*$/, '') + '…'
}

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

function formatFullDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const d = new Date(t)
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
