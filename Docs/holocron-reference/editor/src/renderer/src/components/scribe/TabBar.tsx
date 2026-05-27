import { useState } from 'react'
import { useScribeStore } from '../../store/scribeStore'
import { IconBrain } from '../Icons'

export function TabBar(): JSX.Element {
  const {
    openFiles, activeFilePath, previewFilePath,
    setActiveFile, closeFile, fileContents,
    editorMode, setEditorMode,
  } = useScribeStore()

  return (
    <div
      className="flex items-end flex-shrink-0 overflow-x-auto px-2 pt-1.5 gap-0.5"
      style={{ height: 40, backgroundColor: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' }}
    >
      {/* Pinned Dump tab — always visible, never closeable */}
      <DumpTab
        isActive={editorMode === 'dump'}
        onActivate={() => setEditorMode('dump')}
      />

      {openFiles.map((file) => {
        const isActive = editorMode === 'document' && file.path === activeFilePath
        const isPreview = file.path === previewFilePath
        const hasContent = fileContents[file.path] !== undefined
        return (
          <Tab
            key={file.path}
            name={file.name}
            isActive={isActive}
            isPreview={isPreview}
            onActivate={() => {
              if (!hasContent) {
                window.electronAPI.readFile(file.path).then((r) =>
                  useScribeStore.getState().openFileWithContent(file, r.content)
                )
              } else {
                setActiveFile(file.path)
              }
            }}
            onDoublePromote={() => useScribeStore.getState().promoteToPermanent(file.path)}
            onClose={(e) => { e.stopPropagation(); closeFile(file.path) }}
          />
        )
      })}
    </div>
  )
}

function DumpTab({ isActive, onActivate }: { isActive: boolean; onActivate: () => void }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Brain Dump (always pinned)"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: '6px 6px 0 0',
        fontSize: 12,
        fontFamily: 'inherit',
        flexShrink: 0,
        cursor: 'pointer',
        userSelect: 'none',
        marginBottom: -1,
        backgroundColor: isActive ? 'var(--bg-base)' : hovered ? 'var(--bg-card-hover)' : 'transparent',
        color: isActive ? 'var(--neon-blue)' : 'var(--text-secondary)',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: isActive ? '2px solid var(--neon-blue)' : '2px solid transparent',
        transition: 'background-color 150ms ease, color 150ms ease',
        fontWeight: 600,
        letterSpacing: '0.04em',
      }}
    >
      <IconBrain size={13} />
      <span>Dump</span>
    </div>
  )
}

function Tab({ name, isActive, isPreview, onActivate, onDoublePromote, onClose }: {
  name: string
  isActive: boolean
  isPreview: boolean
  onActivate: () => void
  onDoublePromote: () => void
  onClose: (e: React.MouseEvent) => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const [closeHovered, setCloseHovered] = useState(false)

  return (
    <div
      onClick={onActivate}
      onDoubleClick={onDoublePromote}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isPreview ? `${name} (preview — double-click to keep open)` : name}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: '6px 6px 0 0',
        fontSize: 12,
        fontFamily: 'inherit',
        flexShrink: 0,
        maxWidth: 180,
        cursor: 'pointer',
        userSelect: 'none',
        marginBottom: -1,
        backgroundColor: isActive ? 'var(--bg-base)' : hovered ? 'var(--bg-card-hover)' : 'transparent',
        color: isActive ? '#ffd60a' : 'var(--text-primary)',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: isActive ? '2px solid #0a84ff' : '2px solid transparent',
        transition: 'background-color 150ms ease, color 150ms ease',
      }}
    >
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        // Italic + slightly dimmer when previewing — matches the VS Code
        // convention. Active state still wins on color.
        fontStyle: isPreview ? 'italic' : 'normal',
        opacity: isPreview && !isActive ? 0.75 : 1,
      }}>
        {name}
      </span>
      <button
        onClick={onClose}
        onMouseEnter={() => setCloseHovered(true)}
        onMouseLeave={() => setCloseHovered(false)}
        style={{
          flexShrink: 0,
          width: 14,
          height: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 3,
          border: 'none',
          background: 'transparent',
          color: closeHovered ? '#ffffff' : 'rgba(235,235,245,0.3)',
          cursor: 'pointer',
          fontSize: 13,
          lineHeight: 1,
          opacity: isActive || hovered ? 1 : 0,
          transition: 'opacity 150ms ease, color 150ms ease',
        }}
        title="Close"
      >
        ×
      </button>
    </div>
  )
}
