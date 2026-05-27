import { useEffect } from 'react'
import type { DomaineInfo } from '../types/ipc'
import { useDomaineForProject } from '../hooks/useDomaineForProject'
import { useDomainesStore } from '../store/domainesStore'

/**
 * Compact pill showing which Domaine a document/thread/project belongs to.
 * Render in three ways:
 *   <DomaineBadge projectName={r.project_name} />  — auto-resolves via namespace
 *   <DomaineBadge domaineId={page.domaine_id} />   — direct id lookup
 *   <DomaineBadge domaine={d} />                   — pre-resolved
 *
 * Hidden (renders null) when the Domaine can't be resolved, so callers can
 * place it unconditionally without empty-pill flicker.
 *
 * `overflow` (chip variant only) appends a "+N" indicator when a wiki page
 * was compiled from sources spanning multiple Domaines — the dominant
 * Domaine is shown, and "+N" tells the user N other Domaines contributed.
 */
interface Props {
  projectName?: string | null
  domaineId?:   string | null
  domaine?:     DomaineInfo | null
  /** Visual variant. `chip` = full pill with name; `dot` = color-dot only
   *  (used when space is tight, e.g. inside a TitleBar breadcrumb). */
  variant?: 'chip' | 'dot'
  /** When > 0 and variant === 'chip', appends "+N" to the label. */
  overflow?: number
  /** Optional className for layout overrides. */
  className?: string
}

function useDomaineById(id: string | null | undefined): DomaineInfo | null {
  const domaines     = useDomainesStore((s) => s.domaines)
  const loadIfNeeded = useDomainesStore((s) => s.loadIfNeeded)
  useEffect(() => { void loadIfNeeded() }, [loadIfNeeded])
  if (!id) return null
  return domaines.find((d) => d.id === id) ?? null
}

export function DomaineBadge({
  projectName,
  domaineId,
  domaine: passedDomaine,
  variant = 'chip',
  overflow = 0,
  className,
}: Props): JSX.Element | null {
  // Pick a single resolution path — direct id beats project name beats null.
  const byProject = useDomaineForProject(passedDomaine || domaineId ? null : projectName ?? null)
  const byId      = useDomaineById(passedDomaine ? null : domaineId ?? null)
  const domaine   = passedDomaine ?? byId ?? byProject
  if (!domaine) return null

  const tint = domaine.color || 'var(--neon-blue)'

  if (variant === 'dot') {
    return (
      <span
        className={className}
        title={`Domain: ${domaine.name}`}
        aria-label={`Domain ${domaine.name}`}
        style={{
          display: 'inline-block',
          width: 8, height: 8, borderRadius: 4,
          background: tint,
          flexShrink: 0,
        }}
      />
    )
  }

  const hasOverflow = overflow > 0
  const title = hasOverflow
    ? `Domaine: ${domaine.name} (compiled from sources spanning ${overflow + 1} Domaines)`
    : `Domaine: ${domaine.name}`

  return (
    <span
      className={className}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        background: 'var(--bg-subtle)',
        border: `1px solid ${tint}33`,         // tint at 0.2 alpha
        borderRadius: 'var(--radius-pill)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: 3,
        background: tint,
        flexShrink: 0,
      }} />
      {domaine.name}
      {hasOverflow && (
        <span style={{
          marginLeft: 2,
          padding: '0 4px',
          borderLeft: `1px solid ${tint}44`,
          color: 'var(--text-dim)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          +{overflow}
        </span>
      )}
    </span>
  )
}
