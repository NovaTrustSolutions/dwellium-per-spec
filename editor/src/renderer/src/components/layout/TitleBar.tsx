import { useState, useRef, useEffect } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useScribeStore } from '../../store/scribeStore'
import { IconSettings, IconUpload } from '../Icons'

// Session 8 Part B — `MODE_CONFIG` + `AppMode` import moved out of TitleBar.
// The MAIN indicator (mode pill) relocated to VerticalNav's footer per
// architecture-v4 Part 14 / HANDOFF_v20 §2.1. TitleBar now hosts only the
// Agenteryx wordmark + Export + Settings.

type ExportStatus = 'idle' | 'busy' | 'done' | 'error'

const EXPORT_OPTIONS = [
  { key: 'pdf',  label: 'Export as PDF' },
  { key: 'docx', label: 'Export as Word (.docx)' },
  { key: 'html', label: 'Export as HTML' },
  { key: 'txt',  label: 'Export as Plain Text' },
] as const

type ExportKey = typeof EXPORT_OPTIONS[number]['key']

export function TitleBar(): JSX.Element {
  const { loaded, setSettingsOpen } = useSettingsStore()
  const { activeFilePath, fileContents } = useScribeStore()

  const [exportOpen, setExportOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeExt = activeFilePath ? activeFilePath.slice(activeFilePath.lastIndexOf('.')).toLowerCase() : ''
  const isPdf = activeExt === '.pdf'
  const hasContent = !!activeFilePath && !isPdf
  const content = activeFilePath ? (fileContents[activeFilePath] ?? '') : ''
  const fileName = activeFilePath ? (activeFilePath.split('/').pop() ?? 'document') : 'document'

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleExport = async (type: ExportKey): Promise<void> => {
    setExportOpen(false)
    setExportStatus('busy')
    try {
      const fn = {
        pdf:  () => window.electronAPI.exportPdf(content, fileName),
        docx: () => window.electronAPI.exportDocx(content, fileName),
        html: () => window.electronAPI.exportHtml(content, fileName),
        txt:  () => window.electronAPI.exportText(content, fileName),
      }[type]
      const result = await fn()
      setExportStatus(result.ok ? 'done' : result.canceled ? 'idle' : 'error')
    } catch {
      setExportStatus('error')
    }
    setTimeout(() => setExportStatus('idle'), 2000)
  }

  const exportIconColor = exportStatus === 'done' ? 'var(--neon-green)'
    : exportStatus === 'error' ? 'var(--neon-pink)'
    : hasContent ? 'var(--text-secondary)' : 'var(--text-dim)'

  return (
    <div
      className="flex items-center flex-shrink-0 relative select-none"
      style={{
        // Session 8 Part A — title-bar height reduced 38 → 28 to reclaim
        // vertical real estate. macOS traffic lights are overlaid on the
        // window (titleBarStyle: 'hiddenInset' verified in main/index.ts:30)
        // so this in-app div can shrink without displacing them; the lights
        // sit at trafficLightPosition.y = 10 and remain inside the 28-px bar.
        // Mode indicator + git controls relocate to the vertical sidebar
        // footer in Part B; left in place here as a transitional state.
        height: 28,
        backgroundColor: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div className="w-[72px] flex-shrink-0" />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-secondary)', textTransform: 'uppercase', fontFamily: 'monospace' }}>
          Agenteryx
        </span>
      </div>

      {loaded && (
        <div
          className="flex items-center gap-2 ml-auto"
          style={{ paddingRight: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >

          {/* Mode indicator removed in Session 8 Part B — now lives in
           *  VerticalNav's footer per architecture-v4 Part 14 §2.1. */}

          {/* Export button + dropdown */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => hasContent && setExportOpen((v) => !v)}
              disabled={!hasContent || exportStatus === 'busy'}
              title={hasContent ? 'Export document' : 'Open a document to export'}
              style={{
                width: 22, height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: exportOpen ? 'var(--bg-card)' : 'transparent',
                border: 'none', borderRadius: 5,
                cursor: hasContent ? 'pointer' : 'not-allowed',
                color: exportIconColor,
                transition: 'color 150ms, background 150ms',
                opacity: hasContent ? 1 : 0.4,
              }}
              onMouseEnter={(e) => { if (hasContent) { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
              onMouseLeave={(e) => { if (!exportOpen) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = exportIconColor }}
            >
              <IconUpload size={13} />
            </button>

            {exportOpen && (
              <div
                style={{
                  position: 'absolute', top: 26, right: 0, zIndex: 9999,
                  background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                  borderRadius: 8, padding: '4px 0', minWidth: 200,
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                {EXPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => void handleExport(opt.key)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 12, fontFamily: 'inherit', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            style={{
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: 5,
              cursor: 'pointer', color: 'var(--text-secondary)',
              transition: 'color 150ms, background 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-card)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
          >
            <IconSettings size={13} />
          </button>
        </div>
      )}

    </div>
  )
}

