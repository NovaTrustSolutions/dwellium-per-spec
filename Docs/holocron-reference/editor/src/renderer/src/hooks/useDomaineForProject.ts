import { useEffect } from 'react'
import { useDomainesStore } from '../store/domainesStore'
import type { DomaineInfo } from '../types/ipc'

/**
 * Resolve which Domaine a project belongs to. Returns null when the
 * project is unknown (no namespace row yet — fresh project before first
 * ingestion) or the Domaines list hasn't loaded.
 *
 * Triggers loadIfNeeded() on first use so the badge can be placed
 * anywhere in the app — even on surfaces that don't visit the Domaines
 * tab — without each component duplicating the fetch.
 */
export function useDomaineForProject(projectName: string | null | undefined): DomaineInfo | null {
  const domaines      = useDomainesStore((s) => s.domaines)
  const map           = useDomainesStore((s) => s.projectDomaineMap)
  const loadIfNeeded  = useDomainesStore((s) => s.loadIfNeeded)

  // Single shared load — loadIfNeeded is idempotent, so calling it from
  // many badge instances is cheap.
  useEffect(() => { void loadIfNeeded() }, [loadIfNeeded])

  if (!projectName) return null
  const id = map[projectName]
  if (!id) return null
  return domaines.find((d) => d.id === id) ?? null
}
