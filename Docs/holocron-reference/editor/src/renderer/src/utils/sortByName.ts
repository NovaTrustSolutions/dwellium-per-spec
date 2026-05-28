/**
 * Case-insensitive, accent-insensitive A→Z sort by a `name` field.
 *
 * Used everywhere the renderer surfaces a list of projects / threads in a
 * dropdown or sidebar — the underlying IPCs (`projectsList`, `threadsList`)
 * return rows in filesystem (creation) order, which is confusing once a
 * Domaine accumulates more than a few items. Wrapping every list-set with
 * `sortByName(list)` keeps the order predictable without touching the
 * main-process query layer.
 *
 * Domaines have their own intentional ordering (the `position` column from
 * migration 004, surfaced via the Domaines tab drag-to-reorder); do NOT
 * apply this sort to the Domaines list.
 *
 * `sensitivity: 'base'` treats "Astra" and "astra" as equal, and "café" and
 * "cafe" as equal, so the sort is stable across casing/diacritic noise.
 */
export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}
