import { useState } from 'react'
import { EditorView } from '@codemirror/view'
import { useScribeStore } from '../../store/scribeStore'
import { triggerSidebarRefresh } from '../../utils/sidebarEvents'
import { IconTrash } from '../Icons'
import { TableOfContents } from './TableOfContents'

/**
 * Persistent per-document toolbar — sits below TabBar and above the editor
 * content. Always visible regardless of how many tabs are open (unlike the
 * old +Version button that lived inside TabBar and got pushed off-screen).
 *
 * Hosts per-document actions: Version, Table of Contents, and any future
 * actions that operate on the active document. Visible only when the active
 * file is markdown.
 */
export function DocumentToolbar({ getView }: { getView: () => EditorView | null }): JSX.Element | null {
  const activeFilePath = useScribeStore((s) => s.activeFilePath)
  const editorMode = useScribeStore((s) => s.editorMode)
  const openFileWithContent = useScribeStore((s) => s.openFileWithContent)
  const renameOpenFile = useScribeStore((s) => s.renameOpenFile)
  const closeFile = useScribeStore((s) => s.closeFile)

  const [versioning, setVersioning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)

  const isMarkdown =
    editorMode === 'document' &&
    !!activeFilePath &&
    /\.md$/i.test(activeFilePath)

  if (!isMarkdown || !activeFilePath) return null

  const handleVersion = async (): Promise<void> => {
    if (versioning) return
    setVersioning(true)
    try {
      const result = await window.electronAPI.versionCreate(activeFilePath)
      if (!result.ok) return
      // First-time versioning renames the source on disk to `_v1.md`. Update
      // any open tab pointing at the old path so it doesn't break.
      if (result.renamedOriginal) {
        renameOpenFile(result.renamedOriginal.from, result.renamedOriginal.to)
      }
      const content = await window.electronAPI.readFile(result.filePath).catch(() => null)
      if (!content) return
      const name = result.filePath.split('/').pop() ?? result.filePath
      openFileWithContent({ path: result.filePath, name }, content.content)
      triggerSidebarRefresh()
    } finally {
      setVersioning(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (deleting) return
    const fileName = activeFilePath.split('/').pop() ?? activeFilePath
    const ok = window.confirm(
      `Delete "${fileName}"?\n\n` +
      `Removes the file from disk and purges all related tags, ` +
      `relationships, and any wiki pages it was sole-source for. ` +
      `Cannot be undone.`,
    )
    if (!ok) return
    setDeleting(true)
    try {
      const res = await window.electronAPI.ingestDeleteDocument(activeFilePath)
      if (!res.ok) {
        alert(`Delete failed: ${res.error ?? 'unknown error'}`)
        return
      }
      closeFile(activeFilePath)
      triggerSidebarRefresh()
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div
        style={{
          height: 32,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          backgroundColor: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: 12,
        }}
      >
        <ToolbarButton
          label={versioning ? '…' : '+ Version'}
          title="Save current as new version (preserves original)"
          onClick={() => void handleVersion()}
          disabled={versioning}
        />
        <ToolbarButton
          label="☰ Contents"
          title="Open table of contents"
          onClick={() => setTocOpen((v) => !v)}
          active={tocOpen}
        />
        {/* Spacer pushes Delete to the far right (above the minimap) so it
            can't be hit while reaching for + Version or ☰ Contents on the
            left cluster. */}
        <div style={{ marginLeft: 'auto' }}>
          <ToolbarButton
            label={
              deleting
                ? '…'
                : <><IconTrash size={11} /> Delete</>
            }
            title="Delete from disk + database (purges tags, relationships, sole-source wiki)"
            onClick={() => void handleDelete()}
            disabled={deleting}
            danger
          />
        </div>
      </div>

      <TableOfContents
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        getView={getView}
      />
    </>
  )
}

function ToolbarButton({
  label, title, onClick, disabled, active, danger,
}: {
  label: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  danger?: boolean
}): JSX.Element {
  // Idle state: subtle blue tint + soft glow so the button reads as "live
  // action" against the dark toolbar background. Hover deepens both.
  // Active (e.g. TOC open) flips to a solid Apple-blue chip for unambiguous
  // "this panel is open" feedback. Danger gets a matching pink tint —
  // visually loud enough that destructive ops never blend into the row.
  const idleStyle = {
    background: 'rgba(10,132,255,0.10)',
    border: '1px solid rgba(10,132,255,0.45)',
    color: '#4ea8ff',
    boxShadow: '0 0 8px rgba(10,132,255,0.25)',
  }
  const activeStyle = {
    background: '#0a84ff',
    border: '1px solid #0a84ff',
    color: '#ffffff',
    boxShadow: '0 0 12px rgba(10,132,255,0.55)',
  }
  const dangerStyle = {
    background: 'rgba(255,45,120,0.10)',
    border: '1px solid rgba(255,45,120,0.55)',
    color: '#ff2d78',
    boxShadow: '0 0 8px rgba(255,45,120,0.25)',
  }
  const base = danger ? dangerStyle : active ? activeStyle : idleStyle
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 12px',
        fontSize: 11, fontWeight: 700,
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        transition: 'color 150ms, border-color 150ms, background 150ms, box-shadow 150ms',
        ...base,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        if (danger) {
          e.currentTarget.style.background = 'rgba(255,45,120,0.20)'
          e.currentTarget.style.borderColor = '#ff2d78'
          e.currentTarget.style.boxShadow = '0 0 12px rgba(255,45,120,0.45)'
        } else if (active) {
          e.currentTarget.style.background = '#3399ff'
          e.currentTarget.style.boxShadow = '0 0 16px rgba(10,132,255,0.7)'
        } else {
          e.currentTarget.style.background = 'rgba(10,132,255,0.20)'
          e.currentTarget.style.borderColor = '#0a84ff'
          e.currentTarget.style.color = '#7ec0ff'
          e.currentTarget.style.boxShadow = '0 0 12px rgba(10,132,255,0.45)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = base.background
        e.currentTarget.style.borderColor = base.border.split(' ')[2]
        e.currentTarget.style.color = base.color
        e.currentTarget.style.boxShadow = base.boxShadow
      }}
    >
      {label}
    </button>
  )
}
