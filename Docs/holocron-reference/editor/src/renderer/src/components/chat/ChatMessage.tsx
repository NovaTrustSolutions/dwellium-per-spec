import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage as Message } from '../../store/scribeStore'
import { useScribeStore } from '../../store/scribeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { triggerSidebarRefresh } from '../../utils/sidebarEvents'
import { IconChevronDown, IconChevronUp } from '../Icons'

interface Props { message: Message }

// Session 8 Part C revision 2 — user message as full-width sticky band.
// COLLAPSED_HEIGHT (~8 lines including padding) is the default state; click
// expands to EXPANDED_MAX_HEIGHT (~50vh) with internal scroll. The band
// pins to the top of the chat scroll container via position:sticky so the
// user always knows which prompt generated the visible reply.
const USER_MESSAGE_COLLAPSED_HEIGHT = 128
const USER_MESSAGE_EXPANDED_MAX_HEIGHT = '50vh'

// Theme-aware lifted-surface color. `color-mix(in srgb, var(--bg-2) 92%,
// var(--text-1) 8%)` produces an opaque color that contrasts with the chat
// pane's var(--bg-2) bg in the correct direction for every theme:
//   - Dark themes (text-1 = white-ish): 8% white blended into dark bg = a
//     noticeably lighter "lifted" band.
//   - Light theme  (text-1 = #111111):  8% dark blended into light bg = a
//     noticeably darker band — still reads as elevation contrast (the
//     "lifted card" pattern on light surfaces is darker, not lighter).
// Equivalent CSS variable would need to be added to every theme block in
// themes.ts (do-not-touch list), so the color-mix expression lives inline.
// Chromium 111+ supports color-mix; modern Electron builds qualify.
const USER_BAND_BG = 'color-mix(in srgb, var(--bg-2) 92%, var(--text-1) 8%)'

const mdStyles: React.CSSProperties = {
  margin: 0,
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: 1.65,
}

const CopyIcon = (): JSX.Element => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export function ChatMessage({ message }: Props): JSX.Element {
  const isUser = message.role === 'user'
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [noted, setNoted] = useState(false)

  const handleCopy = (): void => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const handleApply = (): void => {
    window.electronAPI.scribeInsertAtCursor(message.content)
  }

  const handleNote = (): void => {
    const { activeProjectName, activeThreadName, activeThreadPath } = useSettingsStore.getState().config
    if (!activeThreadPath || !activeProjectName || !activeThreadName) {
      console.warn('[Notes] no active thread — cannot save')
      return
    }
    void window.electronAPI.noteAppend(activeThreadPath, activeProjectName, activeThreadName, message.content)
      .then((res) => {
        if (res.ok) {
          setNoted(true)
          setTimeout(() => setNoted(false), 1500)
          if (res.createdFile) triggerSidebarRefresh()
        } else {
          console.error('[Notes] save failed:', res.error)
        }
      })
      .catch((err) => console.error('[Notes] save failed:', err))
  }

  // Session 8 Part C — markdown component handlers unified across user +
  // assistant. Previously several handlers branched on `isUser` to recolor
  // for the blue-bubble background; with both sides now bubble-less and
  // sitting on the same dark chat surface, the assistant-side colors are
  // correct for both. Session 9 cleanup: the dead `p_last` slot was
  // removed — react-markdown silently ignored it (no such component key)
  // and it produced two pre-existing tsc errors.
  const markdownContent = (
    <>
      {message.content ? (
        <div style={mdStyles}>
          <ReactMarkdown
            components={{
              p: ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.65 }}>{children}</p>,
              code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) =>
                inline ? (
                  <code
                    style={{
                      // Theme-aware: 12% text-color overlay reads as a subtle
                      // highlight in either direction (light tint on dark,
                      // dark tint on light). Replaces hardcoded
                      // rgba(255,255,255,0.08) which was invisible on light.
                      background: 'color-mix(in srgb, transparent 88%, var(--text-1) 12%)',
                      borderRadius: 4,
                      padding: '1px 5px',
                      fontSize: 12,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                ) : (
                  <code
                    style={{
                      display: 'block',
                      // Theme-aware code-block surface — stronger version of
                      // the band's color-mix recipe. On dark theme: opaque
                      // lifted ~#44; on light theme: opaque pressed ~#c6.
                      // Either direction gives contrast against the band so
                      // the block reads as distinct + inherited text stays
                      // legible. Replaces hardcoded #1c1c1e which produced
                      // dark-text-on-dark-block in light mode.
                      background: 'color-mix(in srgb, var(--bg-2) 80%, var(--text-1) 20%)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      fontSize: 12,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      overflowX: 'auto',
                      marginTop: 6,
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                ),
              pre: ({ children }) => <pre style={{ margin: '6px 0', background: 'transparent' }}>{children}</pre>,
              ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
              // `color` dropped — was hardcoded '#ffffff' which is invisible
              // on light theme. <strong> inherits text-1 by default; the
              // bold weight provides the visual emphasis.
              strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
              em: ({ children }) => <em style={{ fontStyle: 'italic', opacity: 0.85 }}>{children}</em>,
              blockquote: ({ children }) => (
                <blockquote
                  style={{
                    // Theme-aware muted border — replaces hardcoded #3a3a3c
                    // which read OK on dark themes but felt off-theme on
                    // light. `--text-4` is the muted text token, defined
                    // per theme (#636366 dark, #999999 light).
                    borderLeft: '3px solid var(--text-4)',
                    margin: '6px 0',
                    paddingLeft: 12,
                    opacity: 0.75,
                  }}
                >
                  {children}
                </blockquote>
              ),
              h1: ({ children }) => <h1 style={{ fontSize: '1.2em', fontWeight: 700, margin: '4px 0' }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: '1.1em', fontWeight: 700, margin: '4px 0' }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '4px 0' }}>{children}</h3>,
              a: ({ href, children }) => {
                const isHolocronBd = href?.startsWith('holocron-bd://')
                const handleClick = (e: React.MouseEvent): void => {
                  if (!isHolocronBd || !href) return
                  e.preventDefault()
                  // holocron-bd://<promptNumber>?path=<encoded-bd-file-path>
                  try {
                    const url = new URL(href)
                    const promptNumber = url.host || url.pathname.replace(/^\/+/, '')
                    const filePath = url.searchParams.get('path')
                    if (!filePath) return
                    void window.electronAPI.readFile(filePath).then((r) => {
                      const name = filePath.split('/').pop() ?? filePath
                      useScribeStore.getState().openFileWithContent({ path: filePath, name }, r.content)
                      useScribeStore.getState().setPendingScrollTarget({
                        filePath,
                        headingText: `# Prompt ${promptNumber}`,
                      })
                    })
                  } catch { /* malformed href — ignore */ }
                }
                return (
                  <a
                    href={href}
                    onClick={handleClick}
                    style={{
                      // Both branches now use the theme-aware --neon-blue
                      // token. Previously the non-holocron-bd case was a
                      // hardcoded '#0a84ff' which happened to be the same
                      // as --neon-blue on the default theme but ignored the
                      // per-theme accent.
                      color: 'var(--neon-blue)',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontFamily: isHolocronBd ? 'monospace' : 'inherit',
                    }}
                  >
                    {children}
                  </a>
                )
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      ) : (
        <span style={{ color: 'var(--text-4)', fontStyle: 'italic', fontSize: 13 }}>thinking…</span>
      )}
    </>
  )

  if (isUser) {
    return <UserMessage
      content={message.content}
      hovered={hovered}
      copied={copied}
      onHover={setHovered}
      onCopy={handleCopy}
      markdownContent={markdownContent}
    />
  }

  // Session 8 Part C — assistant message redesign:
  //   - Full-width (no maxWidth), no bubble, no border-radius.
  //   - Hover-revealed action buttons (Copy / Apply / Note) unchanged from
  //     prior implementation — they sit below the message block.
  //   - Padding nudged to align with the user-message text (no padding-
  //     left needed since there's no border-left).
  return (
    <div
      style={{ marginBottom: 14, padding: '4px 2px' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.65,
          color: 'var(--text-1)',
          userSelect: 'text',
        }}
      >
        {markdownContent}
      </div>

      {hovered && message.content && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, paddingLeft: 2 }}>
          <button
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy'}
            style={{
              background: copied ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 4,
              padding: '2px 7px',
              cursor: 'pointer',
              color: copied ? '#30d158' : 'rgba(235,235,245,0.5)',
              fontSize: 11,
              lineHeight: 1.6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {copied ? 'Copied!' : <><CopyIcon /> Copy</>}
          </button>
          <button
            onClick={handleApply}
            style={{
              background: '#30d158',
              border: 'none',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
              color: '#000000',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.6,
              marginLeft: 8,
            }}
          >
            Apply to Doc
          </button>
          <button
            onClick={handleNote}
            title={noted ? 'Saved to Notes' : 'Save to Notes file'}
            style={{
              background: noted ? 'rgba(48,209,88,0.15)' : 'rgba(10,132,255,0.15)',
              border: '1px solid rgba(10,132,255,0.45)',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
              color: noted ? '#30d158' : '#4ea8ff',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.6,
            }}
          >
            {noted ? 'Saved!' : 'Note'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── User message sub-component ────────────────────────────────────────────────
// Session 8 Part C (revision 2, post-Andy-feedback round 2) — user message
// as a full-width STICKY BAND that reads as a section header for the
// exchange beneath it. Replaces the prior right-aligned 70 %-width card.
//
//   - Full-width band — bleeds to the chat panel edges via negative margins
//     to escape the chat scroll container's px-3 padding. The cyan left
//     border sits flush at the chat panel's left edge so the "this is me"
//     signal reads as a left-edge accent stripe across the band.
//   - Default state: clipped to USER_MESSAGE_COLLAPSED_HEIGHT (~128 px,
//     roughly 8 lines including padding). Text flows from the top; content
//     beyond the height is hidden via overflow:hidden.
//   - Click ANYWHERE on the band (or the chevron in the top-right) →
//     expand. Expanded state caps at 50 vh with internal overflow-y:auto
//     so it scrolls within itself without consuming the chat viewport.
//   - Click outside (mousedown on document outside the wrapper) → collapse
//     back to the default state. Text-selection clicks DO NOT toggle —
//     `window.getSelection()` is checked first.
//   - position:sticky; top:0; z-index:10 — pins to the top of the chat
//     scroll container as the user scrolls through the reply. The next
//     user message (in document order below) takes over the sticky slot
//     when it arrives via natural CSS stacking. Chat scroll container
//     (`chatScrollRef` in ChatPane.tsx) has overflow-y:auto so it's the
//     sticky positioning ancestor (no IntersectionObserver needed).
//   - Visual treatment: var(--bg-1) opaque background, 2 px cyan left
//     border, 1 px border-bottom + soft drop shadow to separate from
//     scrolling content beneath. No border-radius (it's a band, not a card).
//   - Chevron in top-right: IconChevronDown when collapsed, IconChevronUp
//     when expanded. Always visible (always the click affordance is the
//     whole band, but the chevron is the obvious target).
//   - Copy button: hover-revealed, positioned to the left of the chevron.
//     Both buttons use e.stopPropagation() so clicking them doesn't also
//     trigger the band's expand/collapse handler.

function UserMessage({
  content, hovered, copied, onHover, onCopy, markdownContent,
}: {
  content: string
  hovered: boolean
  copied: boolean
  onHover: (h: boolean) => void
  onCopy: () => void
  markdownContent: React.ReactNode
}): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  // Overflow detection — drives the bottom fade-out cue on the COLLAPSED
  // state only. In expanded mode the internal scroll handles it. Measure
  // against the COLLAPSED height to know whether expanding would surface
  // anything new (so the chevron is still useful for short messages).
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    setIsOverflowing(el.scrollHeight > USER_MESSAGE_COLLAPSED_HEIGHT + 1)
  }, [content])

  // Re-measure if the chat panel resizes — content reflows so the
  // overflow boundary may shift.
  useEffect(() => {
    const el = innerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setIsOverflowing(el.scrollHeight > USER_MESSAGE_COLLAPSED_HEIGHT + 1)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Click-outside-to-collapse — only active when expanded. mousedown
  // captures the gesture early so the collapse fires before any inner
  // click handler in the chat reply below picks it up.
  useEffect(() => {
    if (!isExpanded) return
    const handler = (e: MouseEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsExpanded(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isExpanded])

  const toggleExpand = (): void => {
    // If the user just performed a text selection, don't also toggle —
    // selecting text inside the band shouldn't accidentally collapse it.
    const sel = window.getSelection()?.toString()
    if (sel && sel.length > 0) return
    setIsExpanded((v) => !v)
  }

  return (
    <div
      ref={wrapperRef}
      onClick={toggleExpand}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        // Bleed to chat panel edges (escape ChatPane's px-3 scroll padding)
        marginLeft: -12,
        marginRight: -12,
        marginBottom: 10,
        background: USER_BAND_BG,
        borderLeft: '2px solid var(--accent-cyan)',
        borderBottom: '1px solid var(--border-1)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        cursor: 'pointer',
        userSelect: 'text',
      }}
    >
      <div
        ref={innerRef}
        style={{
          position: 'relative',
          maxHeight: isExpanded ? USER_MESSAGE_EXPANDED_MAX_HEIGHT : USER_MESSAGE_COLLAPSED_HEIGHT,
          overflow: isExpanded ? 'auto' : 'hidden',
          // Padding-right leaves room for the chevron + copy button cluster
          // in the top-right corner without text colliding with them.
          padding: '10px 76px 12px 14px',
          color: 'var(--text-1)',
          transition: 'max-height 200ms ease',
        }}
      >
        {markdownContent}

        {/* Bottom fade — only when collapsed AND content overflows. Soft
         *  fade from transparent to var(--bg-1) so a clipped line doesn't
         *  read as a hard horizontal cut. Non-interactive. */}
        {!isExpanded && isOverflowing && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0, right: 0, bottom: 0,
              height: 28,
              // Fade target matches the band's color-mix bg so the gradient
              // dissolves into the same surface (no hard color seam at the
              // bottom edge). Transparent start uses the same color-mix
              // expression with 0% alpha — color-mix accepts alpha 0 by
              // wrapping it in a transparent overlay.
              background: `linear-gradient(to bottom, transparent 0%, ${USER_BAND_BG} 80%)`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* Chevron — always visible, top-right. Click stops propagation so
       *  it doesn't double-fire with the band's onClick handler. */}
      <button
        onClick={(e) => { e.stopPropagation(); setIsExpanded((v) => !v) }}
        title={isExpanded ? 'Collapse message' : 'Expand message'}
        style={{
          position: 'absolute',
          top: 6, right: 6,
          width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          color: 'var(--text-3)',
          zIndex: 11,
          transition: 'background 100ms, color 100ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
      >
        {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
      </button>

      {/* Copy — hover-revealed, positioned to the left of the chevron.
       *  Same e.stopPropagation() guard so clicking Copy doesn't also
       *  toggle the band. */}
      {hovered && content && (
        <button
          onClick={(e) => { e.stopPropagation(); onCopy() }}
          title={copied ? 'Copied!' : 'Copy'}
          style={{
            position: 'absolute',
            top: 6, right: 34,
            background: copied ? 'rgba(48,209,88,0.18)' : 'rgba(255,255,255,0.06)',
            border: 'none',
            borderRadius: 4,
            padding: '3px 6px',
            cursor: 'pointer',
            color: copied ? '#30d158' : 'rgba(235,235,245,0.8)',
            fontSize: 11,
            lineHeight: 1.6,
            whiteSpace: 'nowrap',
            zIndex: 11,
          }}
        >
          {copied ? 'Copied!' : <CopyIcon />}
        </button>
      )}
    </div>
  )
}
