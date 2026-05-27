// Shared event bus so all SidebarCell instances refresh together after any mutation.
type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeSidebarRefresh(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function triggerSidebarRefresh(): void {
  listeners.forEach((fn) => fn())
}
