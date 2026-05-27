import { useState, useEffect, useRef, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useCodexStore, type SourceRootFilter, type SearchResult } from '../../store/codexStore'
import { useDomainesStore } from '../../store/domainesStore'
import { classifyFileRelationship, type FileRelationship } from '../../hooks/useFileRelationship'
import { CodexPreview, type PreviewMode } from './CodexPreview'
import { DomaineBadge } from '../DomaineBadge'

const SOURCE_ROOTS: Array<{ key: SourceRootFilter; label: string }> = [
  { key: 'all',      label: 'All'      },
  { key: 'projects', label: 'Projects' },
  { key: 'library',  label: 'Codex'    },
  { key: 'inbox',    label: 'Inbox'    },
]

const SOURCE_TYPES: Array<{ key: string; label: string }> = [
  { key: 'all',        label: 'All'        },
  { key: 'brain_dump', label: 'Brain dump' },
  { key: 'note',       label: 'Note'       },
  { key: 'report',     label: 'Report'     },
  { key: 'reference',  label: 'Reference'  },
  { key: 'inbox',      label: 'Inbox'      },
]

function filtersKey(sourceRoot: string, sourceType: string, crossDomaine: boolean, domaineId: string): string {
  return `${sourceRoot}|${sourceType}|${crossDomaine}|${domaineId}`
}

export function Search(): JSX.Element {
  const { config } = useSettingsStore()
  const activeProjectName = config.activeProjectName
  const activeThreadPath  = config.activeThreadPath
  const activeDomaineId   = config.activeDomaineId

  // Domaine list for the selector. loadIfNeeded() runs on first mount of
  // the badge/hook elsewhere, but Search may be the first surface to need
  // it on a fresh launch — call it here too. Idempotent.
  const domaines     = useDomainesStore((s) => s.domaines)
  const loadIfNeeded = useDomainesStore((s) => s.loadIfNeeded)
  useEffect(() => { void loadIfNeeded() }, [loadIfNeeded])

  // Domaine the user has selected for filtering. Defaults to the active
  // Domaine when set; otherwise empty (= all Domaines). Local state so a
  // user override here doesn't bleed into the Domaines tab's drill-down.
  const [selectorDomaineId, setSelectorDomaineId] = useState<string>(activeDomaineId)
  useEffect(() => {
    // If the user changes the active Domaine elsewhere (Domaines tab),
    // sync the selector default — but only when the user hasn't manually
    // overridden it. We don't have a "dirty" flag; simplest behavior is
    // to mirror activeDomaineId whenever it changes.
    setSelectorDomaineId(activeDomaineId)
  }, [activeDomaineId])

  // Persistent state — survives tab switches.
  const query              = useCodexStore((s) => s.query)
  const sourceRoot         = useCodexStore((s) => s.sourceRoot)
  const sourceType         = useCodexStore((s) => s.sourceType)
  const crossDomaine     = useCodexStore((s) => s.crossDomaine)
  const results            = useCodexStore((s) => s.results)
  const hasSearched        = useCodexStore((s) => s.hasSearched)
  const error              = useCodexStore((s) => s.error)
  const lastSearchedQuery  = useCodexStore((s) => s.lastSearchedQuery)
  const lastSearchedFilters = useCodexStore((s) => s.lastSearchedFilters)
  const previewDoc         = useCodexStore((s) => s.previewDoc)
  const previewMode        = useCodexStore((s) => s.previewMode)
  const setPreviewDoc      = useCodexStore((s) => s.setPreviewDoc)
  const setQuery           = useCodexStore((s) => s.setQuery)
  const setSourceRoot      = useCodexStore((s) => s.setSourceRoot)
  const setSourceType      = useCodexStore((s) => s.setSourceType)
  const setCrossDomaine  = useCodexStore((s) => s.setCrossDomaine)
  const recordSuccess      = useCodexStore((s) => s.recordSearchSuccess)
  const recordError        = useCodexStore((s) => s.recordSearchError)
  const clearSearch        = useCodexStore((s) => s.clearSearch)

  // Loading is transient — don't persist; reset to false on each mount.
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string): Promise<void> => {
    const fk = filtersKey(sourceRoot, sourceType, crossDomaine, selectorDomaineId)
    if (!q.trim()) {
      clearSearch(fk)
      return
    }
    setLoading(true)
    try {
      const res = await window.electronAPI.ragSearch({
        query: q,
        domaineId: crossDomaine ? null : (selectorDomaineId || null),
        crossDomaine,
        sourceRoot: sourceRoot === 'all' ? null : sourceRoot,
        sourceType: sourceType === 'all' ? null : sourceType,
      })
      if (!res.ok) {
        recordError(res.error ?? 'Search failed', q, fk)
      } else {
        recordSuccess(res.results, q, fk)
      }
    } catch (err) {
      recordError((err as Error).message, q, fk)
    } finally {
      setLoading(false)
    }
  }, [selectorDomaineId, crossDomaine, sourceRoot, sourceType, clearSearch, recordError, recordSuccess])

  // Debounce 250ms after the user stops typing or changes a filter.
  // SKIP firing when the current query+filters already match what was
  // last searched — that's the tab-return case where the cached results
  // in the store are already correct.
  useEffect(() => {
    const fk = filtersKey(sourceRoot, sourceType, crossDomaine, selectorDomaineId)
    if (query === lastSearchedQuery && fk === lastSearchedFilters) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runSearch(query)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, sourceRoot, sourceType, crossDomaine, selectorDomaineId, lastSearchedQuery, lastSearchedFilters, runSearch])

  const openResult = (r: SearchResult): void => {
    // All result clicks land in the in-Codex preview — no surprise jumps to
    // Scribe based on which Domaine/thread happens to be active. The user
    // promotes to editing via the "Open in Scribe" button inside the
    // preview itself.
    const relationship = classifyFileRelationship(r, activeProjectName, activeThreadPath)
    // PreviewMode uses 'active-thread' where FileRelationship uses 'active';
    // map the one mismatched value through.
    const mode: PreviewMode = relationship === 'active' ? 'active-thread' : relationship
    setPreviewDoc({
      slug:         r.source_type === 'wiki' ? deriveSlugFromPath(r.source_path) : undefined,
      title:        r.title,
      source_path:  r.source_path,
      source_type:  r.source_type,
      project_name: r.project_name,
      thread_name:  parseThreadName(r.source_path, r.project_name),
    }, mode)
  }

  // Clear preview when query changes — user has moved on from the
  // previewed result.
  useEffect(() => {
    if (previewDoc && query !== lastSearchedQuery) {
      setPreviewDoc(null, null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // ── Preview overlay short-circuits the result list ──────────────────────
  // Wikilink/citation clicks navigate IN PLACE — back arrow returns to the
  // search results (single-level history). Full back/forward/index history
  // is reserved for the Wiki sub-tab where it's the natural mode of use.
  if (previewDoc && previewMode) {
    return (
      <CodexPreview
        document={previewDoc}
        mode={previewMode}
        onClose={() => setPreviewDoc(null, null)}
        nav={{
          canBack: false,     // Back falls through to onClose → results
          canForward: false,
          onBack: () => setPreviewDoc(null, null),
          onForward: () => {},
          onNavigate: (target, mode) => setPreviewDoc(target, mode),
        }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Query input */}
      <div style={{ padding: '16px 24px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ingested documents…"
          autoFocus
          style={{
            width: '100%',
            height: 36,
            padding: '0 12px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />

        {/* Filter row */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <ChipGroup
            label="Source"
            options={SOURCE_ROOTS}
            value={sourceRoot}
            onChange={(v) => setSourceRoot(v as SourceRootFilter)}
          />
          <ChipGroup
            label="Type"
            options={SOURCE_TYPES}
            value={sourceType}
            onChange={setSourceType}
          />
          {/* Domaine scope — selector disabled when "Across all" is checked.
              The bridge namespaces (Library / Inbox) are always included
              regardless of which Domaine is selected, by design. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Domaine
            </span>
            <select
              value={selectorDomaineId}
              onChange={(e) => setSelectorDomaineId(e.target.value)}
              disabled={crossDomaine}
              title={crossDomaine ? 'Disabled while "Across all Domains" is checked' : 'Filter by Domain'}
              style={{
                height: 24,
                background: crossDomaine ? 'transparent' : 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                color: crossDomaine ? 'var(--text-dim)' : 'var(--text-secondary)',
                fontSize: 12, fontFamily: 'inherit',
                padding: '0 8px',
                cursor: crossDomaine ? 'not-allowed' : 'pointer',
                outline: 'none',
                opacity: crossDomaine ? 0.5 : 1,
              }}
            >
              <option value="">(none)</option>
              {domaines.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={crossDomaine}
              onChange={(e) => setCrossDomaine(e.target.checked)}
            />
            Across all Domaines
          </label>
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 24px' }}>
        {error && (
          <div style={{ color: 'var(--neon-red, #f55)', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}
        {loading && (
          <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 8 }}>Searching…</div>
        )}
        {!loading && hasSearched && results.length === 0 && !error && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>
            No results. Try a different query or check &ldquo;Across all Domaines&rdquo; to widen the scope.
          </div>
        )}
        {!loading && !hasSearched && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>
            Type to search across ingested documents. Default scope is the active Domaine; bridge namespaces (Codex, Inbox) are always included.
          </div>
        )}
        {results.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
            {results.length} result{results.length === 1 ? '' : 's'}
          </div>
        )}
        {results.map((r) => {
          const relationship = classifyFileRelationship(r, activeProjectName, activeThreadPath)
          return (
            <ResultCard
              key={r.id}
              result={r}
              relationship={relationship}
              onOpen={() => void openResult(r)}
            />
          )
        })}
      </div>
    </div>
  )
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ key: T; label: string }>
  value: T
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map((opt) => {
          const active = opt.key === value
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              style={{
                padding: '3px 9px',
                fontSize: 12,
                fontFamily: 'inherit',
                background: active ? 'var(--neon-blue)' : 'var(--bg-subtle)',
                color: active ? 'var(--bg-base)' : 'var(--text-secondary)',
                border: '1px solid ' + (active ? 'var(--neon-blue)' : 'var(--border-subtle)'),
                borderRadius: 12,
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ResultCard({
  result,
  relationship,
  onOpen,
}: {
  result: SearchResult
  relationship: FileRelationship
  onOpen: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const fileName = result.source_path.split('/').pop() ?? result.title
  const badge = badgeForRelationship(relationship)
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: 12,
        marginBottom: 8,
        background: hovered ? 'var(--bg-subtle)' : 'transparent',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          title={badge.tooltip}
          style={{
            fontSize: 10,
            padding: '1px 7px',
            background: badge.bg,
            color: badge.fg,
            border: `1px solid ${badge.border}`,
            borderRadius: 10,
            fontWeight: 600,
            letterSpacing: 0.2,
            whiteSpace: 'nowrap',
          }}
        >
          {badge.glyph} {badge.label}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{fileName}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>•</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{result.source_type}</span>
        {result.project_name && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>•</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{result.project_name}</span>
            <DomaineBadge projectName={result.project_name} />
          </>
        )}
      </div>
      <Snippet text={result.snippet} />
      {result.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {result.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: 'var(--bg-subtle)',
                color: 'var(--text-dim)',
                borderRadius: 3,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

// Map relationship → result-card badge. The badge previews the click outcome
// so users aren't surprised when an active-thread click jumps to Editor and
// a wiki click stays in Library.
interface BadgeSpec {
  glyph: string
  label: string
  tooltip: string
  bg: string
  fg: string
  border: string
}

function badgeForRelationship(rel: FileRelationship): BadgeSpec {
  // Every click lands in the in-Codex preview — the badge surfaces what
  // KIND of document the user is about to read, not whether the click will
  // open vs preview. "Open in Scribe" lives inside the preview toolbar.
  const base = { label: 'Preview', bg: 'var(--bg-subtle)', fg: 'var(--text-secondary)', border: 'var(--border-subtle)' }
  switch (rel) {
    case 'active':       return { ...base, glyph: '✎', tooltip: 'Preview (active thread document)' }
    case 'inbox':        return { ...base, glyph: '✎', tooltip: 'Preview (Inbox document)' }
    case 'cross-thread': return { ...base, glyph: '↗', tooltip: 'Preview (other thread)' }
    case 'wiki':         return { ...base, glyph: '📖', tooltip: 'Preview wiki page' }
    case 'synthesis':    return { ...base, glyph: '📖', tooltip: 'Preview synthesis' }
  }
}

function deriveSlugFromPath(p: string): string {
  const file = p.split('/').pop() ?? ''
  return file.replace(/\.md$/i, '')
}

/** Best-effort thread-name extraction. RAG search results don't carry the
 *  thread column, so we walk the path and pull the segment after the project
 *  name. Returns null if the project_name doesn't appear in the path. */
function parseThreadName(sourcePath: string, projectName: string | null): string | null {
  if (!projectName) return null
  const parts = sourcePath.split('/').filter(Boolean)
  const idx = parts.indexOf(projectName)
  if (idx < 0 || idx + 1 >= parts.length) return null
  return parts[idx + 1]
}

// Snippet has <<...>> markers around matches (set in ts_headline StartSel/StopSel).
// Render those as bold spans without dangerously injecting HTML.
function Snippet({ text }: { text: string }): JSX.Element {
  const parts: Array<{ s: string; bold: boolean }> = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('<<', i)
    if (start === -1) {
      parts.push({ s: text.slice(i), bold: false })
      break
    }
    if (start > i) parts.push({ s: text.slice(i, start), bold: false })
    const end = text.indexOf('>>', start + 2)
    if (end === -1) {
      parts.push({ s: text.slice(start), bold: false })
      break
    }
    parts.push({ s: text.slice(start + 2, end), bold: true })
    i = end + 2
  }
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
      {parts.map((p, idx) => (
        p.bold
          ? <strong key={idx} style={{ color: 'var(--neon-blue)', fontWeight: 600 }}>{p.s}</strong>
          : <span key={idx}>{p.s}</span>
      ))}
    </div>
  )
}
