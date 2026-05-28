import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

// ── Anchored dropdown — portal-positioned, viewport-aware ─────────────────
//
// Session 7 fix #4. Replaces native <select> for cases where the macOS
// AppKit NSPopupButton convention (Chromium renders <select> popups with
// the currently-selected option positioned OVER the trigger so prior
// options appear ABOVE the trigger) reads to users as "the dropdown
// pops mid-screen / not anchored to its trigger."
//
// Two architectural choices:
//
//   1. **createPortal to `document.body`** — the popover renders OUTSIDE
//      every ancestor's transform / filter / contain context, so it isn't
//      pulled around by a parent `transform: translate(...)` or `filter:
//      blur(...)` somewhere up the tree. (CSS `position: absolute` on a
//      child becomes relative to the nearest transformed ancestor, NOT
//      the document, which is the standard "Session 1 Domains context
//      menu" bug — same fix here.)
//
//   2. **`getBoundingClientRect` on the trigger + flip-up when near
//      viewport bottom** — the popover lands directly under the trigger
//      by default; if rendering downward would clip below the viewport
//      AND the trigger has more space ABOVE it, flip the anchor to the
//      trigger's top edge so the popover opens upward.
//
// Generic over string-typed values so the same component serves any
// filter / picker that maps strings to labels. Callsites narrow the
// onChange type with an explicit cast when needed.

export interface AnchoredDropdownOption {
  value: string
  label: string
}

export interface AnchoredDropdownProps {
  value: string
  options: AnchoredDropdownOption[]
  onChange: (v: string) => void
  title?: string
  disabled?: boolean
  /** Hint for the trigger's min-width; popover always widens to ≥ trigger
   *  width regardless. Useful so the closed trigger doesn't shrink-fit
   *  the current label as the selected value changes. */
  minWidth?: number
  /** Rendered when the current value has no matching option. Defaults to
   *  the raw value (fine for ids that resolve as a list loads). */
  placeholder?: string
  /** Optional inline trigger style override. Caller's selectStyle layered
   *  on top of the component's own minimum styling. */
  triggerStyle?: React.CSSProperties
}

type AnchorPos = {
  top:      number   // viewport y where the popover top edge should land
  left:     number   // viewport x where the popover left edge should land
  minWidth: number   // popover min-width — at least the trigger's rendered width
  flipped:  boolean  // true = popover opens upward (top edge is trigger.top - popoverHeight)
}

/** Anchored, viewport-aware dropdown. Renders as a button trigger with a
 *  portal-mounted popover. Mirrors the API of the prior Wiki-local
 *  `OptionDropdown` so migrating a callsite is a near-mechanical swap. */
export function AnchoredDropdown({
  value, options, onChange, title, disabled, minWidth, placeholder, triggerStyle,
}: AnchoredDropdownProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [anchor, setAnchor] = useState<AnchorPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const currentOpt = options.find((o) => o.value === value)
  const currentLabel = currentOpt?.label ?? placeholder ?? value

  /** Recompute popover position from the trigger's current viewport rect.
   *  Defaults to "drop below the trigger"; flips upward if the natural
   *  drop would clip the bottom of the viewport AND the trigger has more
   *  room above it. Popover height is estimated from option count (each
   *  row ~28 px) up to a 280 px cap; matches the popover's `maxHeight`. */
  const computeAnchor = (): AnchorPos | null => {
    const t = triggerRef.current
    if (!t) return null
    const r = t.getBoundingClientRect()
    const POPOVER_GAP = 2
    const ROW_HEIGHT = 28
    const MAX_POPOVER_HEIGHT = 280
    const estPopHeight = Math.min(MAX_POPOVER_HEIGHT, options.length * ROW_HEIGHT + 8)
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const flip = spaceBelow < estPopHeight + POPOVER_GAP && spaceAbove > spaceBelow
    return {
      top:      flip ? Math.max(8, r.top - estPopHeight - POPOVER_GAP) : r.bottom + POPOVER_GAP,
      left:     r.left,
      minWidth: r.width,
      flipped:  flip,
    }
  }

  // Open lifecycle — set initial anchor, listen for outside-clicks + Esc,
  // reset focused option to current value.
  useEffect(() => {
    if (!open) { setAnchor(null); return }
    setFocusedIdx(Math.max(0, options.findIndex((o) => o.value === value)))
    setAnchor(computeAnchor())
    // Focus the popover after it mounts so ArrowDown / Enter work.
    requestAnimationFrame(() => popoverRef.current?.focus())

    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node | null
      if (!t) return
      if (popoverRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value, options])

  // Reposition on window resize / scroll while open. Cheap — single rect read.
  useEffect(() => {
    if (!open) return
    const onChange = (): void => setAnchor(computeAnchor())
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)  // capture — scrolls in any ancestor
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close if the trigger becomes disabled mid-flight (e.g. "Across all
  // Domaines" toggled while the Domaine dropdown is open).
  useEffect(() => {
    if (disabled && open) setOpen(false)
  }, [disabled, open])

  // Refine the anchor once the popover has actually mounted — we estimated
  // its height from option count, but the real measured height may differ
  // (long labels wrap, etc.). Re-flip if needed.
  useLayoutEffect(() => {
    if (!open || !anchor || !popoverRef.current) return
    const popH = popoverRef.current.getBoundingClientRect().height
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const POPOVER_GAP = 2
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const shouldFlip = spaceBelow < popH + POPOVER_GAP && spaceAbove > spaceBelow
    if (shouldFlip !== anchor.flipped) {
      setAnchor({
        ...anchor,
        top:     shouldFlip ? Math.max(8, r.top - popH - POPOVER_GAP) : r.bottom + POPOVER_GAP,
        flipped: shouldFlip,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor?.flipped, options.length])

  const commit = (v: string): void => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onPopoverKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault(); setOpen(false); triggerRef.current?.focus(); return
    }
    if (options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((i) => (i - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = options[focusedIdx]
      if (opt) commit(opt.value)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => { if (!disabled) setOpen((v) => !v) }}
        onKeyDown={(e) => {
          if (disabled) return
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault(); setOpen(true)
          }
        }}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          height: 28, padding: '0 8px',
          background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
          borderRadius: 4, color: 'var(--text-secondary)', fontSize: 12,
          fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          display: 'flex', alignItems: 'center', gap: 6,
          minWidth: minWidth ?? undefined,
          opacity: disabled ? 0.5 : 1,
          ...triggerStyle,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentLabel}
        </span>
        <span style={{ fontSize: 9, opacity: 0.7, flexShrink: 0 }}>▾</span>
      </button>
      {open && !disabled && anchor && createPortal(
        <div
          ref={popoverRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onPopoverKey}
          style={{
            position: 'fixed',
            top:      anchor.top,
            left:     anchor.left,
            minWidth: anchor.minWidth,
            maxHeight: 280,
            overflowY: 'auto',
            zIndex: 99999,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            outline: 'none',
          }}
        >
          {options.map((opt, i) => {
            const isFocused = i === focusedIdx
            const isSelected = opt.value === value
            return (
              <div
                key={opt.value || `__empty_${i}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocusedIdx(i)}
                onClick={() => commit(opt.value)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  background: isFocused ? 'var(--bg-card-hover)' : 'transparent',
                  color: isSelected ? 'var(--neon-blue)' : 'var(--text-primary)',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                {opt.label}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Anchored multi-select — portal-positioned checkbox list ───────────────
//
// Session 7 second-pass Item 3. Same portal + getBoundingClientRect +
// flip-up anchoring as `AnchoredDropdown` above, but the popover holds a
// checkbox list and stays open across selections (the user is building a
// multi-Domain filter — closing on every click would be hostile). The
// trigger label is computed by the caller because the natural format
// depends on the domain (e.g. "All Domains" / "2 Domains" / "AI Dev,
// Business" for Graph filtering; might be "All Threads" / N elsewhere).
//
// API kept generic over string-typed values; the optional `allLabel` prop
// surfaces a top-of-popover toggle-all checkbox that the consumer can use
// to express "no filter == include everything" with one click.
//
// The anchoring infrastructure is ~80% duplicated from AnchoredDropdown.
// Future cleanup can extract `useAnchoredPopover(triggerRef, open)` into
// a shared hook; for now the duplication is mechanical and stable.

export interface AnchoredMultiSelectProps {
  /** Current selection. Empty array = "nothing selected" (caller decides
   *  whether to treat that as "show all" or "show nothing" — the component
   *  doesn't interpret semantically). */
  values: string[]
  options: AnchoredDropdownOption[]
  onChange: (values: string[]) => void
  /** The text shown on the trigger button — caller computes (e.g. "All
   *  Domains" when values is empty, the single name when length 1, "N
   *  Domains" for larger sets, etc). */
  triggerLabel: string
  title?: string
  disabled?: boolean
  minWidth?: number
  /** When set, renders a top-of-popover "All" toggle row. Clicking it
   *  empties the selection when at least one is selected, OR selects
   *  every option when none are. Pass undefined to suppress. */
  allLabel?: string
  triggerStyle?: React.CSSProperties
}

export function AnchoredMultiSelect({
  values, options, onChange, triggerLabel, title, disabled, minWidth, allLabel, triggerStyle,
}: AnchoredMultiSelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<AnchorPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const selected = new Set(values)
  const allSelected = options.length > 0 && options.every((o) => selected.has(o.value))
  // "All" is interpreted as the EMPTY array (caller-side convention: empty
  // = no filter = show everything). So clicking "All" while at least one
  // is selected → empty. Clicking "All" while none selected → check every
  // option (rare but supported in case the caller treats empty differently).
  const allRowChecked = values.length === 0 || allSelected

  // Account for the All row in the height estimate when computing anchor.
  const computeAnchor = (): AnchorPos | null => {
    const t = triggerRef.current
    if (!t) return null
    const r = t.getBoundingClientRect()
    const POPOVER_GAP = 2
    const ROW_HEIGHT = 28
    const MAX_POPOVER_HEIGHT = 320
    const rowCount = options.length + (allLabel ? 1 : 0)
    const estPopHeight = Math.min(MAX_POPOVER_HEIGHT, rowCount * ROW_HEIGHT + 12)
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const flip = spaceBelow < estPopHeight + POPOVER_GAP && spaceAbove > spaceBelow
    return {
      top:      flip ? Math.max(8, r.top - estPopHeight - POPOVER_GAP) : r.bottom + POPOVER_GAP,
      left:     r.left,
      minWidth: r.width,
      flipped:  flip,
    }
  }

  useEffect(() => {
    if (!open) { setAnchor(null); return }
    setAnchor(computeAnchor())
    requestAnimationFrame(() => popoverRef.current?.focus())

    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node | null
      if (!t) return
      if (popoverRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options, allLabel])

  useEffect(() => {
    if (!open) return
    const onChange = (): void => setAnchor(computeAnchor())
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (disabled && open) setOpen(false)
  }, [disabled, open])

  useLayoutEffect(() => {
    if (!open || !anchor || !popoverRef.current) return
    const popH = popoverRef.current.getBoundingClientRect().height
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const POPOVER_GAP = 2
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const shouldFlip = spaceBelow < popH + POPOVER_GAP && spaceAbove > spaceBelow
    if (shouldFlip !== anchor.flipped) {
      setAnchor({
        ...anchor,
        top:     shouldFlip ? Math.max(8, r.top - popH - POPOVER_GAP) : r.bottom + POPOVER_GAP,
        flipped: shouldFlip,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor?.flipped, options.length])

  const toggleValue = (v: string): void => {
    const next = new Set(values)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(Array.from(next))
  }

  const toggleAll = (): void => {
    if (values.length === 0) {
      // None selected → check every option. (Caller can choose to interpret
      // a full selection as equivalent to empty if they want — this just
      // gives them a deterministic "select all" affordance.)
      onChange(options.map((o) => o.value))
    } else {
      // At least one selected → empty (caller's "all" sentinel).
      onChange([])
    }
  }

  const onPopoverKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault(); setOpen(false); triggerRef.current?.focus()
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => { if (!disabled) setOpen((v) => !v) }}
        onKeyDown={(e) => {
          if (disabled) return
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault(); setOpen(true)
          }
        }}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-multiselectable="true"
        style={{
          height: 28, padding: '0 8px',
          background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
          borderRadius: 4, color: 'var(--text-secondary)', fontSize: 12,
          fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          display: 'flex', alignItems: 'center', gap: 6,
          minWidth: minWidth ?? undefined,
          opacity: disabled ? 0.5 : 1,
          ...triggerStyle,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {triggerLabel}
        </span>
        <span style={{ fontSize: 9, opacity: 0.7, flexShrink: 0 }}>▾</span>
      </button>
      {open && !disabled && anchor && createPortal(
        <div
          ref={popoverRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onPopoverKey}
          style={{
            position: 'fixed',
            top:      anchor.top,
            left:     anchor.left,
            minWidth: anchor.minWidth,
            maxHeight: 320,
            overflowY: 'auto',
            zIndex: 99999,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            outline: 'none',
            padding: '4px 0',
          }}
        >
          {allLabel && (
            <>
              <div
                role="option"
                aria-selected={allRowChecked}
                onClick={toggleAll}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <input
                  type="checkbox"
                  checked={allRowChecked}
                  onChange={() => { /* div onClick handles it */ }}
                  style={{ cursor: 'pointer', pointerEvents: 'none' }}
                />
                <span>{allLabel}</span>
              </div>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />
            </>
          )}
          {options.map((opt) => {
            const isSelected = selected.has(opt.value)
            return (
              <div
                key={opt.value || '__empty__'}
                role="option"
                aria-selected={isSelected}
                onClick={() => toggleValue(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: isSelected ? 'var(--neon-blue)' : 'var(--text-primary)',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => { /* div onClick handles it */ }}
                  style={{ cursor: 'pointer', pointerEvents: 'none' }}
                />
                <span>{opt.label}</span>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
