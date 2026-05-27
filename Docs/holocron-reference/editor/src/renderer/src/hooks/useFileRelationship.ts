import { useSettingsStore } from '../store/settingsStore'

export type FileRelationship =
  | 'active'        // file in the active thread → opens in Scribe
  | 'cross-thread'  // user-owned file in a different thread → preview, Edit toggle
  | 'wiki'          // agent-compiled wiki page → preview, never editable in place
  | 'synthesis'     // agent-written synthesis → preview, never editable in place
  | 'inbox'         // _Inbox/Inbox.md or other source_root='inbox' docs → opens in Scribe

export interface FileRelationshipInput {
  source_path: string
  source_type: string
  source_root: string
  project_name: string | null
}

/**
 * Canonical Editor-vs-Library dispatch. See architecture-v2.md §"Read/Write
 * Surface Split". Single source of truth — every component that decides
 * "preview vs open in Scribe" for a RAG document MUST go through this.
 */
export function classifyFileRelationship(
  doc: FileRelationshipInput,
  activeProjectName: string,
  activeThreadPath: string,
): FileRelationship {
  if (doc.source_type === 'wiki') return 'wiki'
  if (doc.source_type === 'synthesis') return 'synthesis'
  if (doc.source_type === 'inbox' || doc.source_root === 'inbox') return 'inbox'

  const inActiveThread =
    !!activeProjectName &&
    !!activeThreadPath &&
    doc.project_name === activeProjectName &&
    (doc.source_path === activeThreadPath ||
      doc.source_path.startsWith(activeThreadPath + '/'))

  return inActiveThread ? 'active' : 'cross-thread'
}

export function useFileRelationship(doc: FileRelationshipInput): FileRelationship {
  const activeProjectName = useSettingsStore((s) => s.config.activeProjectName)
  const activeThreadPath  = useSettingsStore((s) => s.config.activeThreadPath)
  return classifyFileRelationship(doc, activeProjectName, activeThreadPath)
}
