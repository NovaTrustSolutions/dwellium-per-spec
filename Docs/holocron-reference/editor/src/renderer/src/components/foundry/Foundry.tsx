/**
 * Foundry — architecture-v4 Part 6, Session 4.
 *
 * The intake pipeline (Capture → Triage → Review → Admit). Nothing
 * enters the Codex except through here (or the legacy direct-drop into
 * a thread folder, which still works per Part 13 §6 "coexist"
 * recommendation).
 *
 * Layout:
 *   1. Header — title + description.
 *   2. IntakePanel — paste-a-URL (Firecrawl) and paste-text.
 *   3. ReviewQueue — Pending Review (expanded), Admitted + Rejected
 *      (both collapsible). Auto-polls while items are still triaging.
 */
import { useState } from 'react'
import { IntakePanel } from './IntakePanel'
import { ReviewQueue } from './ReviewQueue'

export function Foundry(): JSX.Element {
  // captureNonce bumps every time a capture lands so the Review queue
  // refreshes (vs. waiting for the 3s poll). Cleaner than a refresh ref
  // since it survives re-mounts and never goes stale.
  const [captureNonce, setCaptureNonce] = useState(0)

  return (
    <div
      className="flex flex-col w-full h-full"
      style={{ backgroundColor: 'var(--bg-base)', overflow: 'auto' }}
    >
      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Foundry</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '6px 0 0', maxWidth: 720 }}>
            The intake pipeline. Capture external content (web pages, pasted notes), let the Triage Agent
            propose tags + a Domain, then Approve / Edit / Reject. Approved items flow into the Codex
            through the standard ingestion pipeline.
          </p>
        </div>

        <IntakePanel onCaptured={() => setCaptureNonce((n) => n + 1)} />

        <ReviewQueue captureNonce={captureNonce} />
      </div>
    </div>
  )
}
