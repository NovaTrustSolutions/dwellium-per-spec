import { useRef, useState } from 'react'

interface Props { onDrag: (delta: number) => void }

export function ResizeHandle({ onDrag }: Props): JSX.Element {
  const [active, setActive] = useState(false)
  const lastXRef = useRef(0)

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    lastXRef.current = e.clientX
    setActive(true)
    const onMove = (ev: MouseEvent): void => {
      const d = ev.clientX - lastXRef.current
      lastXRef.current = ev.clientX
      onDrag(d)
    }
    const onUp = (): void => {
      setActive(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#3a3a3c' }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#2c2c2e' }}
      style={{
        flexShrink: 0,
        width: 1,
        cursor: 'col-resize',
        userSelect: 'none',
        backgroundColor: '#2c2c2e',
        transition: 'background-color 150ms ease',
      }}
    />
  )
}
