import { useEffect, useRef, useState, useMemo } from 'react'
import { EditorView } from '@codemirror/view'
import { useScribeStore } from '../../store/scribeStore'

const WIDTH = 64
const TOP_PAD = 4
const BASE_LINE_HEIGHT = 4   // px per minimap line at scale 1
const BASE_FONT_SIZE = 3     // px

interface Props {
  getView: () => EditorView | null
}

interface ColoredRun {
  text: string
  color: string
}

/**
 * Build colored runs from markdown text. Adjacent same-color lines merge
 * into one block (one run = one DOM node).
 *
 * Color discipline: only HEADINGS get a distinct color, because heading
 * text in the actual editor IS that color (orange / green / pink). Body
 * text, lists, blockquotes, and code blocks all stay white in the minimap
 * because their text is white in the editor — only the leading marker
 * (e.g. `-`, `>`, fence ```) is colored, and a per-line coloring scheme
 * can't represent that without misrepresenting the line as a whole.
 */
function buildRuns(text: string): ColoredRun[] {
  const BODY = 'rgba(255,255,255,0.88)'
  const lines = text.split('\n')
  const runs: ColoredRun[] = []
  let current: ColoredRun | null = null

  const push = (line: string, color: string): void => {
    if (current && current.color === color) {
      current.text += '\n' + line
    } else {
      if (current) runs.push(current)
      current = { text: line, color }
    }
  }

  for (const line of lines) {
    const t = line.trimStart()
    let color: string
    if (t.startsWith('# ')) {
      color = '#ff9f0a'
    } else if (t.startsWith('## ')) {
      color = '#30d158'
    } else if (t.startsWith('### ') || t.startsWith('#### ') || t.startsWith('##### ') || t.startsWith('###### ')) {
      color = '#ff2d78'
    } else {
      color = BODY
    }
    push(line, color)
  }
  if (current) runs.push(current)
  return runs
}

/**
 * Right-edge minimap strip — gives at-a-glance document length, comment
 * cluster visualization, and click-to-scroll navigation.
 *
 * All vertical positioning uses ONE coordinate system: lines × effective
 * line-height. So markers, viewport indicator, click-to-scroll, and the
 * rendered text all align exactly. For docs longer than the strip can
 * fit at the natural line-height, a CSS scaleY transform compresses the
 * whole content uniformly; the same scale is applied to marker math.
 */
export function Minimap({ getView }: Props): JSX.Element | null {
  const activeFilePath = useScribeStore((s) => s.activeFilePath)
  const editorMode = useScribeStore((s) => s.editorMode)
  const commentsByFile = useScribeStore((s) => s.commentsByFile)

  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollHeight: 1, clientHeight: 1, totalLines: 1 })
  const [docText, setDocText] = useState('')
  const [containerHeight, setContainerHeight] = useState(0)

  const isMarkdown =
    editorMode === 'document' &&
    !!activeFilePath &&
    /\.md$/i.test(activeFilePath)

  // Scroll position — rAF for smooth viewport indicator. Cheap (4 numbers).
  useEffect(() => {
    if (!isMarkdown) return
    let raf = 0
    const tick = (): void => {
      const view = getView()
      if (view) {
        const sd = view.scrollDOM
        const next = {
          scrollTop: sd.scrollTop,
          scrollHeight: Math.max(sd.scrollHeight, 1),
          clientHeight: Math.max(sd.clientHeight, 1),
          totalLines: view.state.doc.lines,
        }
        setScrollState((prev) =>
          (prev.scrollTop !== next.scrollTop ||
           prev.scrollHeight !== next.scrollHeight ||
           prev.clientHeight !== next.clientHeight ||
           prev.totalLines !== next.totalLines)
            ? next : prev
        )
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [isMarkdown, getView])

  // Doc text — slow poll. Cheap length-compare to skip toString when stable.
  useEffect(() => {
    if (!isMarkdown) return
    let lastLength = -1
    const tick = (): void => {
      const view = getView()
      if (!view) return
      const len = view.state.doc.length
      if (len !== lastLength) {
        lastLength = len
        setDocText(view.state.doc.toString())
      }
    }
    tick()
    const interval = window.setInterval(tick, 500)
    return () => window.clearInterval(interval)
  }, [isMarkdown, getView])

  // Container height — drives scaleY computation.
  useEffect(() => {
    if (!isMarkdown) return
    const el = containerRef.current
    if (!el) return
    const update = (): void => setContainerHeight(el.getBoundingClientRect().height)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isMarkdown])

  const runs = useMemo(() => buildRuns(docText), [docText])

  if (!isMarkdown || !activeFilePath) return null

  const comments = (commentsByFile[activeFilePath] ?? []).filter((c) => !c.resolved)
  const { scrollTop, scrollHeight, clientHeight, totalLines } = scrollState

  // Natural total height of the rendered text at base size. If it exceeds
  // the strip, scale uniformly down. Never scale up — short docs sit at
  // the top of the strip with empty space below.
  const naturalHeight = totalLines * BASE_LINE_HEIGHT + TOP_PAD * 2
  const scale = naturalHeight > containerHeight && containerHeight > 0
    ? containerHeight / naturalHeight
    : 1
  const effectiveLineHeight = BASE_LINE_HEIGHT * scale

  // Approximate the visible line range from the editor's scroll position.
  const ratioTop = scrollHeight > clientHeight ? scrollTop / scrollHeight : 0
  const ratioVisible = scrollHeight > clientHeight ? clientHeight / scrollHeight : 1
  const visibleFirstLine = ratioTop * totalLines
  const visibleSpanLines = Math.max(1, ratioVisible * totalLines)

  // Convert a line number (1-indexed) into a Y pixel inside the minimap,
  // including the top padding and the active scale.
  const lineToY = (line: number): number => TOP_PAD + (line - 1) * effectiveLineHeight

  // Scrub the editor scroll position to the line under `clientY`. Direct
  // scrollDOM manipulation is synchronous; using EditorView.scrollIntoView
  // here would queue an effect through CodeMirror's layout pass, which
  // makes rapid clicks/drags feel laggy and "stuck."
  const scrubToClientY = (clientY: number, rect: DOMRect): void => {
    const view = getView()
    if (!view) return
    const localY = clientY - rect.top
    const targetLine = Math.max(1, Math.min(
      totalLines,
      Math.round((localY - TOP_PAD) / Math.max(0.001, effectiveLineHeight)) + 1,
    ))
    const pos = view.state.doc.line(targetLine).from
    const block = view.lineBlockAt(pos)
    const sd = view.scrollDOM
    const center = block.top - (sd.clientHeight - block.height) / 2
    const max = Math.max(0, sd.scrollHeight - sd.clientHeight)
    sd.scrollTop = Math.max(0, Math.min(max, center))
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Stop the browser from starting any drag/text-selection behavior on
    // mousedown — that's the most likely cause of "click gets stuck."
    e.preventDefault()
    const target = e.currentTarget as HTMLDivElement
    const rect = target.getBoundingClientRect()
    scrubToClientY(e.clientY, rect)
    // Drag-to-scrub: continue scrolling as the cursor moves while held,
    // even if the cursor leaves the minimap. Document-level handlers so
    // off-strip drags still track. Released on mouseup anywhere.
    const onMove = (ev: MouseEvent): void => scrubToClientY(ev.clientY, rect)
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      title="Click or drag to scroll"
      style={{
        position: 'absolute',
        top: 0, right: 0, bottom: 0,
        width: WIDTH,
        zIndex: 5,
        background: 'rgba(20,20,20,0.55)',
        borderLeft: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Scaled text — runs colored by markdown role. Wrapper applies the
       *  vertical scale; runs render at base font/line-height. The same
       *  effectiveLineHeight is used by markers and viewport for alignment. */}
      <div
        style={{
          position: 'absolute',
          top: TOP_PAD,
          left: 4,
          right: 0,
          transform: `scaleY(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", monospace',
          fontSize: BASE_FONT_SIZE,
          lineHeight: `${BASE_LINE_HEIGHT}px`,
          whiteSpace: 'pre',
        }}
      >
        {runs.map((r, i) => (
          <div key={i} style={{ color: r.color, fontWeight: r.color === '#ff9f0a' ? 700 : 400 }}>
            {r.text}
          </div>
        ))}
      </div>

      {/* Comment markers — same coordinate system as the text above. */}
      {comments.map((c) => {
        const top = lineToY(c.fromLine)
        const height = Math.max(2, (c.toLine - c.fromLine + 1) * effectiveLineHeight)
        return (
          <div
            key={c.id}
            title={c.comment || c.originalText.slice(0, 80)}
            onMouseDown={(e) => {
              e.stopPropagation()
              const view = getView()
              if (!view) return
              const fromLineSafe = Math.max(1, Math.min(c.fromLine, view.state.doc.lines))
              const pos = view.state.doc.line(fromLineSafe).from
              view.dispatch({
                effects: EditorView.scrollIntoView(pos, { y: 'center' }),
              })
            }}
            style={{
              position: 'absolute',
              left: 0, right: 0,
              top, height,
              background: '#ffd60a',
              opacity: 0.85,
              borderRadius: 1,
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
          />
        )
      })}

      {/* Viewport indicator — line-based math so it tracks the visible
       *  range against the same coordinate system as the markers. */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0,
          top: lineToY(visibleFirstLine + 1),
          height: Math.max(2, visibleSpanLines * effectiveLineHeight),
          background: 'rgba(255,255,255,0.10)',
          borderTop: '1px solid rgba(255,255,255,0.22)',
          borderBottom: '1px solid rgba(255,255,255,0.22)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

export const MINIMAP_WIDTH = WIDTH
