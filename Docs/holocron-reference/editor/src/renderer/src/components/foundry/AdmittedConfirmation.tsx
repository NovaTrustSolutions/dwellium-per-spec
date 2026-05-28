/**
 * Success card shown in place of a regular item card immediately after
 * a successful Approve. Replaces the queue item for ~10 seconds (or
 * until manual dismiss), then the row drops to the Admitted section
 * naturally on the next refresh tick.
 *
 * "Open in Codex" deep-link:
 *   1. Sets the Ingest filter text to the filename slug
 *   2. Switches Codex's sub-tab to 'ingest'
 *   3. Activates the Codex top-level tab
 * Result: Andy lands on Codex → Ingest with the new document at the top
 * of the filtered list.
 */
import { useSessionStore } from '../../store/sessionStore'
import { useCodexStore } from '../../store/codexStore'
import { useIngestStore } from '../../store/ingestStore'
import { useFoundryStore, type AdmissionSnapshot } from '../../store/foundryStore'

interface AdmittedConfirmationProps {
  itemId: string
  snapshot: AdmissionSnapshot
}

export function AdmittedConfirmation({ itemId, snapshot }: AdmittedConfirmationProps): JSX.Element {
  const dismiss = useFoundryStore((s) => s.dismissAdmission)

  const destinationLabel = snapshot.targetThreadName
    ? `thread: ${snapshot.targetThreadName}`
    : '_Codex/References/'

  const openInCodex = (): void => {
    // Filename without .md is the most useful filter string — matches
    // the rag_documents.title that the Ingest tab indexes. The actual
    // filter implementation is a substring search.
    const filterSlug = snapshot.filename.replace(/\.md$/i, '')
    useIngestStore.getState().setFilter(filterSlug)
    useCodexStore.getState().setActiveSubTab('ingest')
    useSessionStore.getState().setActiveTab('codex')
    // Leaving the snapshot in place so re-clicking the foundry tab still
    // shows the confirmation — the 10s timer in ReviewQueue handles
    // the eventual cleanup.
  }

  return (
    <article
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--accent-green)',
        borderLeft: '4px solid var(--accent-green)',
        borderRadius: 8,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontSize: 16,
            color: 'var(--accent-green)',
            lineHeight: 1,
          }}
          aria-hidden
        >
          ✓
        </span>
        <div style={{ flex: '1 1 auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            Admitted → {destinationLabel}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, fontFamily: 'inherit' }}>
            {snapshot.filename}
          </div>
        </div>
        <button
          onClick={() => dismiss(itemId)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-4)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 8px',
            fontFamily: 'inherit',
          }}
          title="Dismiss"
        >
          ✕
        </button>
      </header>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={openInCodex}
          style={{
            background: 'var(--accent-green)',
            border: 'none',
            color: 'var(--bg-base)',
            padding: '6px 14px',
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          → Open in Codex
        </button>
        <button
          onClick={() => dismiss(itemId)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-1)',
            color: 'var(--text-3)',
            padding: '6px 12px',
            borderRadius: 5,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Dismiss
        </button>
      </div>
    </article>
  )
}
