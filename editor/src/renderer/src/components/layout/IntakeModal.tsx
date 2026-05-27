import { useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { triggerSidebarRefresh } from '../../utils/sidebarEvents'

/**
 * Intake prompt (P3-C). Asks the user — once per thread — whether to drop
 * reference documents into a `References/` folder. Triggered by loadThread()
 * when ThreadMeta.intakePromptShown is false and the user hasn't disabled
 * the prompt in Settings → General.
 */
export function IntakeModal(): JSX.Element | null {
  const { pendingIntakeForThread, setPendingIntakeForThread } = useSessionStore()
  const [busy, setBusy] = useState(false)

  if (!pendingIntakeForThread) return null
  const { projectName, threadName, threadPath } = pendingIntakeForThread

  const dismiss = (): void => {
    void window.electronAPI.threadMarkIntakeShown(threadPath)
    setPendingIntakeForThread(null)
  }

  const handleAddNow = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const picked = await window.electronAPI.intakePickReferences()
      if (picked.canceled || picked.filePaths.length === 0) {
        // User cancelled the file picker — leave the modal open so they can
        // re-pick or skip explicitly. Don't mark as shown yet.
        return
      }
      const result = await window.electronAPI.intakeAddReferences(threadPath, picked.filePaths)
      if (result.ok && result.copied.length > 0) triggerSidebarRefresh()
      await window.electronAPI.threadMarkIntakeShown(threadPath)
      setPendingIntakeForThread(null)
    } finally {
      setBusy(false)
    }
  }

  const handleSkip = (): void => {
    dismiss()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) handleSkip() }}
    >
      <div
        style={{ width: 440, backgroundColor: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--font-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
          Add reference documents to this thread?
        </h2>
        <p style={{ margin: '0 0 var(--space-5)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 'var(--leading-normal)' }}>
          Reference documents are copied into the thread folder
          <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}> {projectName} / {threadName}</span>.
          They become part of this thread&rsquo;s context.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSkip}
            disabled={busy}
            style={{
              background: 'none',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 14px',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-secondary)',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: busy ? 0.5 : 1,
            }}
          >
            Skip
          </button>
          <button
            onClick={() => void handleAddNow()}
            disabled={busy}
            style={{
              background: 'var(--neon-blue)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '7px 16px',
              fontSize: 'var(--font-sm)',
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Working…' : 'Add Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
