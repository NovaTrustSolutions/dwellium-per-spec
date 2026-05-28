import { useEffect, useMemo, useCallback, useState } from 'react'
import {
  useSynthesesStore,
  type AnalyticsCommunity,
  type AnalyticsInfluentialDoc,
  type AnalyticsGap,
  type AnalyticsDiversity,
  type SynthesisDraft,
} from '../../store/synthesesStore'
import { useDomainesStore } from '../../store/domainesStore'
import { useScribeStore } from '../../store/scribeStore'
import { useSessionStore } from '../../store/sessionStore'
import { loadThreadForPath } from '../../utils/threadActions'
import { DomaineBadge } from '../DomaineBadge'
import { IconChevronDown, IconChevronRight } from '../Icons'

// Codex → Syntheses sub-tab. The cross-domain intelligence readout:
// Louvain communities, betweenness centrality, structural gaps, topical
// diversity. Computed on demand via window.electronAPI.graphAnalytics —
// see src/main/graphAnalytics.ts for the algorithms.
//
// Session 3+: synthesis-document generation is live. The "Write synthesis"
// button on each gap calls Sonnet 4.6 via synthesisGenerateGapBridge, which
// writes a markdown bridge document to _Codex/Syntheses/<gap-slug>.md and
// inserts a rag_syntheses row. Once a draft exists for a gap, the button
// flips to "Draft exists · Regenerate" with muted styling — structural
// gaps are analytical facts, not a to-do list, so the gap stays visible
// even after a draft exists. The Recent Drafts section at the bottom of
// this tab is the catalogue (Open in Scribe / Show in Finder per row);
// the Hive → Synthesis card is a slim status indicator that links here.

export function Syntheses(): JSX.Element {
  const analytics    = useSynthesesStore((s) => s.analytics)
  const loadedOnce   = useSynthesesStore((s) => s.loadedOnce)
  const loading      = useSynthesesStore((s) => s.loading)
  const error        = useSynthesesStore((s) => s.error)
  const selectorDomaineId    = useSynthesesStore((s) => s.selectorDomaineId)
  const setAnalytics         = useSynthesesStore((s) => s.setAnalytics)
  const setLoadedOnce        = useSynthesesStore((s) => s.setLoadedOnce)
  const setLoading           = useSynthesesStore((s) => s.setLoading)
  const setError             = useSynthesesStore((s) => s.setError)
  const setSelectorDomaineId = useSynthesesStore((s) => s.setSelectorDomaineId)
  const drafts               = useSynthesesStore((s) => s.drafts)
  const draftsLoaded         = useSynthesesStore((s) => s.draftsLoaded)
  const setDrafts            = useSynthesesStore((s) => s.setDrafts)
  const setDraftsLoaded      = useSynthesesStore((s) => s.setDraftsLoaded)
  const communitiesCollapsed = useSynthesesStore((s) => s.communitiesCollapsed)
  const influentialCollapsed = useSynthesesStore((s) => s.influentialCollapsed)
  const toggleCommunities    = useSynthesesStore((s) => s.toggleCommunities)
  const toggleInfluential    = useSynthesesStore((s) => s.toggleInfluential)

  const [crossDomaine, setCrossDomaine] = useState(true)

  const domaines     = useDomainesStore((s) => s.domaines)
  const loadDomaines = useDomainesStore((s) => s.loadIfNeeded)
  useEffect(() => { void loadDomaines() }, [loadDomaines])

  // Load recent drafts on tab mount + after every successful generate.
  // Shared cache (synthesesStore.drafts) so the Hive SynthesisCard's
  // status readout reads the same source.
  const refreshDrafts = useCallback(async (): Promise<void> => {
    try {
      const res = await window.electronAPI.hiveListSyntheses(20)
      if (res.ok) setDrafts(res.drafts)
    } finally {
      setDraftsLoaded(true)
    }
  }, [setDrafts, setDraftsLoaded])
  useEffect(() => { void refreshDrafts() }, [refreshDrafts])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true); setError(null)
    try {
      const res = await window.electronAPI.graphAnalytics({
        domaineId:    crossDomaine ? null : (selectorDomaineId || null),
        crossDomaine,
        topInfluential: 10,
        topGaps:        5,
      })
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Failed to compute analytics')
        setAnalytics(null)
      } else {
        setAnalytics(res.data)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false); setLoadedOnce(true)
    }
  }, [crossDomaine, selectorDomaineId, setAnalytics, setLoading, setError, setLoadedOnce])

  // Refetch when scope changes.
  useEffect(() => { void refresh() }, [refresh])

  const domaineOptions = useMemo(
    () => [{ id: '', name: '(All Domains)' }, ...domaines.map((d) => ({ id: d.id, name: d.name }))],
    [domaines],
  )

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, minHeight: 0, minWidth: 0,
        padding: '12px 24px',
        gap: 12,
        overflow: 'auto',
      }}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={selectorDomaineId}
          onChange={(e) => setSelectorDomaineId(e.target.value)}
          disabled={crossDomaine}
          title={crossDomaine ? 'Disabled while "Across all" is checked' : 'Filter by Domain'}
          style={selectStyle}
        >
          {domaineOptions.map((d) => (
            <option key={d.id || '__all__'} value={d.id}>{d.name}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={crossDomaine}
            onChange={(e) => setCrossDomaine(e.target.checked)}
          />
          Across all
        </label>
        {analytics && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {analytics.metrics.nodeCount} docs · {analytics.metrics.edgeCount} edges
            {analytics.metrics.computedAt && (
              <> · computed {new Date(analytics.metrics.computedAt).toLocaleTimeString()}</>
            )}
          </div>
        )}
        <button
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            height: 28, padding: '0 12px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            fontSize: 12, fontFamily: 'inherit',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Computing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--bg-subtle)', border: '1px solid var(--neon-red, #f43f5e)', borderRadius: 4, color: 'var(--neon-red, #f43f5e)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {!loadedOnce && loading && (
        <EmptyState>Computing analytics over the corpus…</EmptyState>
      )}

      {loadedOnce && analytics?.metrics.degenerate && (
        <EmptyState>
          Not enough connectivity yet — the analytics layer needs at least 2 ingested documents with 1 tag-overlap or wikilink edge between them. Ingest a few more documents and refresh.
        </EmptyState>
      )}

      {analytics && !analytics.metrics.degenerate && (
        <>
          {/* Always visible — high-value summary + action items. */}
          <DiversityCard diversity={analytics.topicalDiversity} />
          {/* Collapsed by default — informational, not actionable. */}
          <CommunitiesCard
            communities={analytics.communities}
            collapsed={communitiesCollapsed}
            onToggle={toggleCommunities}
          />
          <InfluentialCard
            docs={analytics.topByBetweenness}
            collapsed={influentialCollapsed}
            onToggle={toggleInfluential}
          />
          {/* Always visible — Andy's action surface. */}
          <GapsCard
            gaps={analytics.structuralGaps}
            communities={analytics.communities}
            drafts={drafts}
            onDraftWritten={refreshDrafts}
          />
          {/* Recent Drafts — moved here from Hive in Session 3+ consolidation. */}
          <DraftsCard drafts={drafts} loaded={draftsLoaded} onRefresh={refreshDrafts} />
        </>
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function DiversityCard({ diversity }: { diversity: AnalyticsDiversity | null }): JSX.Element | null {
  if (!diversity) return null
  const bandColor = diversity.band === 'focused'
    ? '#fbbf24'
    : diversity.band === 'balanced'
      ? '#34d399'
      : '#a78bfa'
  return (
    <Card title="Topical diversity">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: bandColor, fontFamily: 'monospace' }}>
          {Math.round(diversity.score * 100)}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: bandColor, textTransform: 'capitalize' }}>
            {diversity.band}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {diversity.communityCount} communit{diversity.communityCount === 1 ? 'y' : 'ies'} · modularity {diversity.modularity.toFixed(2)} · largest cluster {Math.round(diversity.largestShare * 100)}%
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {diversity.recommendation}
      </div>
    </Card>
  )
}

function CommunitiesCard({ communities, collapsed, onToggle }: { communities: AnalyticsCommunity[]; collapsed: boolean; onToggle: () => void }): JSX.Element {
  if (communities.length === 0) {
    return <Card title="Community clusters" collapsed={collapsed} onToggle={onToggle}><div style={emptyHint}>No clusters detected.</div></Card>
  }
  return (
    <Card
      title="Community clusters"
      collapsed={collapsed}
      onToggle={onToggle}
      headerHint={<span style={countChipStyle}>{communities.length} cluster{communities.length === 1 ? '' : 's'}</span>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {communities.map((c) => (
          <div
            key={c.id}
            style={{
              padding: '8px 10px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.memberCount} doc{c.memberCount === 1 ? '' : 's'}</span>
              {c.domaineIds.length > 1 && (
                <span style={{ fontSize: 10, color: 'var(--neon-blue, #22d3ee)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  spans {c.domaineIds.length} domains
                </span>
              )}
            </div>
            {c.domaineNames.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {c.domaineIds.map((id, i) => (
                  <DomaineBadge key={id} domaineId={id} variant="chip" projectName={c.domaineNames[i]} />
                ))}
              </div>
            )}
            {c.topTags.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                Top tags: {c.topTags.slice(0, 3).map((t) => `${t.tag} (${Math.round(t.share * 100)}%)`).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function InfluentialCard({ docs, collapsed, onToggle }: { docs: AnalyticsInfluentialDoc[]; collapsed: boolean; onToggle: () => void }): JSX.Element {
  if (docs.length === 0) {
    return <Card title="Most influential documents" collapsed={collapsed} onToggle={onToggle}><div style={emptyHint}>Betweenness centrality is zero for every node — not enough cross-cluster paths yet.</div></Card>
  }
  // The list is already truncated server-side. Highest BC first.
  const maxBC = docs.reduce((m, d) => (d.betweenness > m ? d.betweenness : m), 0)
  return (
    <Card
      title="Most influential documents"
      collapsed={collapsed}
      onToggle={onToggle}
      headerHint={<span style={countChipStyle}>{docs.length} doc{docs.length === 1 ? '' : 's'}</span>}
    >
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
        Documents that sit on the most shortest-paths between other documents — the structural bridges.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {docs.map((d) => {
          const widthPct = maxBC > 0 ? Math.max(2, (d.betweenness / maxBC) * 100) : 0
          return (
            <div key={d.docId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div style={{ width: 80, height: 4, background: 'var(--bg-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${widthPct}%`, height: '100%', background: 'var(--neon-blue, #22d3ee)' }} />
              </div>
              <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.title}>
                {d.title}
              </span>
              {d.domaineId && (
                <DomaineBadge domaineId={d.domaineId} variant="chip" projectName={d.domaineName ?? null} />
              )}
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace', minWidth: 50, textAlign: 'right' }}>
                {d.betweenness.toFixed(3)}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function GapsCard({ gaps, communities, drafts, onDraftWritten }: {
  gaps: AnalyticsGap[]
  communities: AnalyticsCommunity[]
  drafts: SynthesisDraft[]
  onDraftWritten: () => Promise<void>
}): JSX.Element {
  // Per-gap "generating" state — keyed by gap id. Each click hits the
  // Synthesis Agent (Sonnet) which drafts a bridge document to disk + a
  // rag_syntheses row. The Recent Drafts section below this one is the
  // catalogue; the Hive → Synthesis card is a slim status indicator.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { ok: boolean; filePath?: string; error?: string }>>({})

  // Map gap.id → most recent matching draft. A draft "matches" by exact
  // gap_id (the primary path — the IPC writes the gap id into the
  // rag_syntheses row). Newest-first; the drafts list comes pre-sorted
  // newest-first from the IPC.
  const draftsByGapId = useMemo(() => {
    const m = new Map<string, SynthesisDraft>()
    for (const d of drafts) {
      if (d.gapId && !m.has(d.gapId)) m.set(d.gapId, d)
    }
    return m
  }, [drafts])

  const handleGenerate = async (g: AnalyticsGap): Promise<void> => {
    if (busyId) return
    setBusyId(g.id)
    setResults((r) => ({ ...r, [g.id]: { ok: false, error: 'generating…' } }))
    try {
      const a = communities.find((c) => c.id === g.communityA.id)
      const b = communities.find((c) => c.id === g.communityB.id)
      // Flatten community topTags ({tag, share}[]) into plain strings for
      // the Synthesis Agent's prompt. The analytics layer doesn't currently
      // surface per-cluster doc lists; pass empty topDocs — the Synthesis
      // prompt gracefully handles "no specific documents" by drawing on the
      // tags alone.
      const flatTagsA = (a?.topTags ?? []).map((t) => t.tag)
      const flatTagsB = (b?.topTags ?? []).map((t) => t.tag)
      const res = await window.electronAPI.synthesisGenerateGapBridge({
        gapId: g.id,
        clusterA: { id: g.communityA.id, name: g.communityA.name, topTags: flatTagsA },
        clusterB: { id: g.communityB.id, name: g.communityB.name, topTags: flatTagsB },
        topDocs: [],
        domaineId: null,
      })
      setResults((r) => ({ ...r, [g.id]: res }))
      if (res.ok) {
        // Refresh the shared drafts list so this gap's button flips to
        // "Draft exists" and the Recent Drafts section picks up the new row.
        await onDraftWritten()
      }
    } catch (err) {
      setResults((r) => ({ ...r, [g.id]: { ok: false, error: (err as Error).message } }))
    } finally {
      setBusyId(null)
    }
  }

  if (gaps.length === 0) {
    return <Card title="Structural gaps"><div style={emptyHint}>Every pair of clusters has at least one bridging edge. Nothing obvious to bridge.</div></Card>
  }
  return (
    <Card title={`Structural gaps (${gaps.length})`}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
        Cluster pairs with low inter-cluster connectivity. Click "Write synthesis" → Sonnet drafts a 400-600 word bridge document to <code style={{ fontFamily: 'monospace' }}>_Codex/Syntheses/</code> and inserts a <code style={{ fontFamily: 'monospace' }}>rag_syntheses</code> row. Drafts are listed in the <strong>Recent Drafts</strong> section below.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {gaps.map((g) => {
          const a = communities.find((c) => c.id === g.communityA.id)
          const b = communities.find((c) => c.id === g.communityB.id)
          const isBusy = busyId === g.id
          const result = results[g.id]
          const existingDraft = draftsByGapId.get(g.id)
          const hasDraft = !!existingDraft
          // Disable only while generating; "Draft exists" is a click-to-
          // regenerate state, not a lock. Gaps stay visible (analytical
          // facts, not a to-do list) even after a draft exists.
          const armed = !isBusy
          // Visual style toggles on hasDraft — muted when draft already exists.
          const buttonLabel = isBusy
            ? 'Generating…'
            : hasDraft ? 'Draft exists · Regenerate' : 'Write synthesis'
          return (
            <div
              key={g.id}
              style={{
                padding: '8px 10px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, fontSize: 12, minWidth: 200 }}>
                <div style={{ color: 'var(--text-primary)' }}>
                  <span style={{ fontWeight: 500 }}>{g.communityA.name}</span>
                  <span style={{ color: 'var(--text-dim)', margin: '0 8px' }}>↔</span>
                  <span style={{ fontWeight: 500 }}>{g.communityB.name}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                  {g.interEdgeCount === 0
                    ? 'No bridging edges'
                    : `${g.interEdgeCount} bridging edge${g.interEdgeCount === 1 ? '' : 's'}`}
                  {' · '}
                  {a && b && (
                    <>{a.memberCount} × {b.memberCount} docs · gap size {g.gapSize.toFixed(1)}</>
                  )}
                </div>
                {hasDraft && existingDraft && !result && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, fontStyle: 'italic' }}>
                    Draft from {new Date(existingDraft.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. See Recent Drafts below.
                  </div>
                )}
                {result && result.ok && (
                  <div style={{ fontSize: 10, color: 'var(--accent-green)', marginTop: 4, fontStyle: 'italic' }}>
                    Draft written. See Recent Drafts below{result.filePath ? ` (${result.filePath.split('/').slice(-2).join('/')})` : ''}.
                  </div>
                )}
                {result && !result.ok && result.error && result.error !== 'generating…' && (
                  <div style={{ fontSize: 10, color: 'var(--accent-pink)', marginTop: 4, fontStyle: 'italic' }}>
                    {result.error}
                  </div>
                )}
              </div>
              <button
                title={hasDraft
                  ? 'Regenerate the bridge document. The previous draft on disk + its rag_syntheses row are kept (chokidar will ingest the new file alongside).'
                  : 'Synthesis Agent (Claude Sonnet) — drafts a 400-600 word bridge document. Writes to disk + rag_syntheses row.'}
                onClick={() => void handleGenerate(g)}
                disabled={!armed}
                style={{
                  height: 24, padding: '0 10px',
                  // Muted styling when a draft already exists; primary
                  // (purple-tinted) when no draft yet — same color as before.
                  background: hasDraft
                    ? 'var(--bg-subtle)'
                    : (armed ? 'rgba(167,139,250,0.10)' : 'var(--bg-subtle)'),
                  border: hasDraft
                    ? '1px solid var(--border-subtle)'
                    : '1px solid rgba(167,139,250,0.45)',
                  borderRadius: 4,
                  color: hasDraft
                    ? 'var(--text-dim)'
                    : (armed ? '#a78bfa' : 'var(--text-dim)'),
                  fontSize: 10, fontFamily: 'inherit', fontWeight: hasDraft ? 500 : 600,
                  cursor: isBusy ? 'wait' : armed ? 'pointer' : 'not-allowed',
                }}
              >
                {buttonLabel}
              </button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ── DraftsCard ────────────────────────────────────────────────────────────
// Recent synthesis drafts catalogue. Always visible. Open-in-Scribe +
// Show-in-Finder per row. Moved here from the Hive in the consolidation
// pass so everything synthesis-related happens in Codex → Syntheses.

function DraftsCard({ drafts, loaded, onRefresh }: {
  drafts: SynthesisDraft[]
  loaded: boolean
  onRefresh: () => Promise<void>
}): JSX.Element {
  const setActiveTab = useSessionStore((s) => s.setActiveTab)
  const [openError, setOpenError] = useState<string | null>(null)

  /** Open the synthesis file directly in Scribe. Mirrors the Graph tab's
   *  editInScribe recipe: reuse the existing tab if already open, else
   *  readFile + openFileWithContent. loadThreadForPath returns false
   *  silently for paths outside projectsRoot (synthesis files live under
   *  `_Codex/Syntheses/`), so no active-context switch happens but the
   *  file still opens in Scribe as a tab. */
  const handleOpenInScribe = async (filePath: string | null): Promise<void> => {
    setOpenError(null)
    if (!filePath) {
      setOpenError('No file path recorded for this draft.')
      return
    }
    const scribeState = useScribeStore.getState()
    const name = filePath.split('/').pop() ?? 'synthesis.md'
    if (scribeState.openFiles.some((f) => f.path === filePath)) {
      scribeState.setActiveFile(filePath)
      void loadThreadForPath(filePath)
      setActiveTab('scribe')
      return
    }
    try {
      const result = await window.electronAPI.readFile(filePath)
      const content = (result as { content?: string })?.content ?? ''
      scribeState.openFileWithContent({ path: filePath, name }, content)
      void loadThreadForPath(filePath)
      setActiveTab('scribe')
    } catch (err) {
      setOpenError(`Open failed: ${(err as Error).message}`)
      setTimeout(() => setOpenError(null), 8000)
    }
  }

  const handleShowInFinder = (filePath: string | null): void => {
    if (!filePath) return
    void window.electronAPI.revealInFinder(filePath)
  }

  return (
    <Card
      title="Recent drafts"
      headerHint={
        <button
          onClick={() => void onRefresh()}
          title="Refresh draft list"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11, padding: 0 }}
        >
          ⟳
        </button>
      }
    >
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
        Sonnet-written bridge documents. Generated on demand from Structural Gaps above and (when wired) from approved Honcho dreams.
      </div>
      {openError && (
        <div style={{ fontSize: 10, color: 'var(--accent-pink)', marginBottom: 6, fontStyle: 'italic' }}>
          {openError}
        </div>
      )}
      {!loaded ? (
        <div style={emptyHint}>Loading drafts…</div>
      ) : drafts.length === 0 ? (
        <div style={emptyHint}>No drafts yet. Click "Write synthesis" on a structural gap above to draft one.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {drafts.map((d) => (
            <div
              key={d.id}
              style={{
                padding: '8px 10px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, fontSize: 12, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {d.synthesisType ?? 'synthesis'}
                  </span>
                  {d.gapId && (
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      gap: {d.gapId}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                    {new Date(d.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>{d.title}</div>
                {d.diskPath && (
                  <div
                    style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--text-dim)', marginTop: 2, wordBreak: 'break-all' }}
                    title={d.diskPath}
                  >
                    {d.diskPath}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => void handleOpenInScribe(d.diskPath)}
                  disabled={!d.diskPath}
                  title={d.diskPath ? `Open ${d.diskPath} in Scribe` : 'No file path recorded'}
                  style={{
                    height: 24, padding: '0 10px',
                    background: 'transparent',
                    border: '1px solid rgba(167,139,250,0.45)',
                    borderRadius: 4,
                    color: d.diskPath ? '#a78bfa' : 'var(--text-dim)',
                    fontSize: 10, fontFamily: 'inherit', fontWeight: 600,
                    cursor: d.diskPath ? 'pointer' : 'not-allowed',
                  }}
                >
                  Open in Scribe
                </button>
                <button
                  onClick={() => handleShowInFinder(d.diskPath)}
                  disabled={!d.diskPath}
                  title={d.diskPath ? 'Reveal the file in Finder' : 'No file path recorded'}
                  style={{
                    height: 24, padding: '0 10px',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 4,
                    color: d.diskPath ? 'var(--text-secondary)' : 'var(--text-dim)',
                    fontSize: 10, fontFamily: 'inherit',
                    cursor: d.diskPath ? 'pointer' : 'not-allowed',
                  }}
                >
                  Show in Finder
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Plain UI atoms ────────────────────────────────────────────────────────

interface CardProps {
  title:        string
  /** When provided, the card renders a chevron in the header and the body
   *  is hidden when `collapsed` is true. Caller owns the state — keeps the
   *  persistence layer (synthesesStore vs. local component state) up to
   *  the caller without forcing a particular choice. */
  collapsed?:   boolean
  onToggle?:    () => void
  /** Optional right-aligned hint (count chip, etc.) in the header row. */
  headerHint?:  React.ReactNode
  children:     React.ReactNode
}

function Card({ title, collapsed, onToggle, headerHint, children }: CardProps): JSX.Element {
  const isCollapsible = onToggle !== undefined
  const isCollapsed = collapsed === true
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--bg-elevated, var(--bg-base))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
      }}
    >
      <div
        onClick={isCollapsible ? onToggle : undefined}
        style={{
          fontSize: 11, fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: 0.5,
          marginBottom: isCollapsed ? 0 : 8,
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: isCollapsible ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {isCollapsible && (
          isCollapsed
            ? <IconChevronRight size={11} />
            : <IconChevronDown size={11} />
        )}
        <span>{title}</span>
        {headerHint && <span style={{ marginLeft: 'auto' }}>{headerHint}</span>}
      </div>
      {!isCollapsed && children}
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        fontSize: 12, color: 'var(--text-dim)',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

const emptyHint: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic',
}

const countChipStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600,
  color: 'var(--text-dim)',
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 999,
  padding: '1px 8px',
  letterSpacing: 0,
  textTransform: 'none',
}

const selectStyle: React.CSSProperties = {
  height: 28, padding: '0 8px',
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 12, fontFamily: 'inherit',
}
