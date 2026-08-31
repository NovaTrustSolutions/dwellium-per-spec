/**
 * 055-p5: shared predicate — is this drag/drop target inside a designated
 * file-drop zone? Used by the AdminShell window-level capture blocker (which
 * otherwise sets `effectAllowed = 'none'` on every dragover) and mirrored by
 * Desktop.tsx::isInsideOwnDropZone.
 *
 * Zones: `.cm-editor` (Scribe's CodeMirror — its dropHandler stamps
 * `data-dwellium-drop-zone` on the content element), any element marked
 * `[data-dwellium-drop-zone]` (Whiteboard root, IDoc chat panel, …), and the
 * two legacy class-based zones (TranscriptionHub upload area, File Manager).
 *
 * Before this predicate the blocker's allowlist was the two legacy classes
 * only, so a Finder drag onto Scribe or Whiteboard showed the "no drop"
 * cursor even though both widgets' drop plumbing was fully built.
 */
export const FILE_DROP_ZONE_SELECTOR =
    '.cm-editor, [data-dwellium-drop-zone], .th-mock-upload-area, .file-manager';

export function isFileDropTarget(target: HTMLElement | null): boolean {
    return !!target?.closest?.(FILE_DROP_ZONE_SELECTOR);
}
