import { useRef, useState } from 'react'

interface Props {
  onDrag: (delta: number) => void
  collapsed: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function PanelDivider({ onDrag, collapsed, onDragStart, onDragEnd }: Props): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const lastXRef = useRef(0)

  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    lastXRef.current = e.clientX
    onDragStart?.()
    const onMove = (ev: MouseEvent): void => {
      ev.preventDefault()
      const d = ev.clientX - lastXRef.current
      lastXRef.current = ev.clientX
      onDrag(d)
    }
    const onUp = (): void => {
      onDragEnd?.()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (collapsed) {
    return <div style={{ width: 0, flexShrink: 0 }} />
  }

  return (
    <div
      style={{
        position: 'relative',
        width: 0,
        flexShrink: 0,
        zIndex: 10,
        overflow: 'visible',
      }}
    >
      {/* 8px invisible drag handle centered on the boundary */}
      <div
        onMouseDown={startDrag}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '-4px',
          width: '8px',
          cursor: 'col-resize',
          userSelect: 'none',
          zIndex: 1,
        }}
      />

      {/* Single 1px line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '1px',
          transform: 'translateX(-50%)',
          background: hovered ? '#3a84ff' : 'var(--border-default)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    </div>
  )
}
