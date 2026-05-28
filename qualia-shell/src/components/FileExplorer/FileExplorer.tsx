/**
 * FileExplorer — Holocron-style tree-view file browser (Dwellium port).
 *
 * Cycle 2 (this file): scaffold UI + lock/dual-mode toggles + empty state.
 *   Per-user state via fileExplorerStore (sister to scribeLayoutStore).
 *   No data fetching yet — empty tree placeholder.
 * Cycle 3: data fetching from /api/files/tree, populate entries.
 * Cycle 4: inline rename + create file/folder.
 * Cycle 5: drag-from (sets application/x-dwellium-path + text/uri-list).
 * Cycle 6: drag-into (move/copy between folders).
 * Cycle 7: cross-widget DnD wiring with Scribe.
 * Cycle 8: screenshot-paste via Cmd+V.
 * Cycle 9-10: hierarchy lock + dual-mode polish.
 * Cycle 11: multi-select.
 * Cycle 12: closure + acceptance walk.
 *
 * See Scripts/autorun/FILE_EXPLORER_PORTING_PLAN.md for full breakdown.
 */
import { Lock, Unlock, List, ListTree } from 'lucide-react';
import { FileExplorerCell, type FileEntry } from './FileExplorerCell';
import { useFileExplorer } from './useFileExplorer';

// Cycle 2 placeholder — Cycle 3 will replace with /api/files/tree fetch
const PLACEHOLDER_ENTRIES: FileEntry[] = [];

export default function FileExplorer() {
    const { locked, viewMode, setLocked, setViewMode } = useFileExplorer();

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: '100%', width: '100%',
            background: '#000', color: '#ccc',
            fontFamily: 'inherit', fontSize: 12,
            overflow: 'hidden',
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', height: 36, flexShrink: 0,
                background: '#0a0a0a', borderBottom: '1px solid #222',
            }}>
                <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: '#808080',
                    flex: 1,
                }}>Files</span>

                {/* Dual-mode toggle: tree ↔ flat */}
                <button
                    onClick={() => setViewMode(viewMode === 'tree' ? 'flat' : 'tree')}
                    title={viewMode === 'tree' ? 'Switch to flat view' : 'Switch to tree view'}
                    style={iconBtn(viewMode === 'flat')}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#D6FE51'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = viewMode === 'flat' ? '#D6FE51' : '#666'; }}
                >
                    {viewMode === 'tree' ? <ListTree size={14} strokeWidth={1.75} /> : <List size={14} strokeWidth={1.75} />}
                </button>

                {/* Hierarchy lock (UI-only per Cycle 2 design lock) */}
                <button
                    onClick={() => setLocked(!locked)}
                    title={locked ? 'Unlock hierarchy (allow drag/rename/move)' : 'Lock hierarchy (prevent accidental restructuring)'}
                    style={iconBtn(locked)}
                    onMouseEnter={(e) => { e.currentTarget.style.color = locked ? '#ff4d6d' : '#D6FE51'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = locked ? '#ff4d6d' : '#666'; }}
                >
                    {locked ? <Lock size={14} strokeWidth={1.75} /> : <Unlock size={14} strokeWidth={1.75} />}
                </button>
            </div>

            {/* Tree body */}
            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                padding: '4px 0',
            }} role="tree" aria-label="File explorer">
                {PLACEHOLDER_ENTRIES.length === 0 ? (
                    <div style={{
                        padding: '24px 16px', textAlign: 'center',
                        color: '#555', fontSize: 11, lineHeight: 1.6,
                    }}>
                        <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>📁</div>
                        <div style={{ color: '#888', marginBottom: 4 }}>No files yet</div>
                        <div style={{ fontSize: 10 }}>
                            Cycle 3 will wire <code style={{ color: '#aaa' }}>/api/files/tree</code> here.
                            <br />
                            Drag files in (Cycle 6) or create new (Cycle 4).
                        </div>
                    </div>
                ) : (
                    PLACEHOLDER_ENTRIES.map((entry) => (
                        <FileExplorerCell key={entry.path} entry={entry} />
                    ))
                )}
            </div>

            {/* Status footer */}
            <div style={{
                padding: '4px 10px', flexShrink: 0,
                background: '#0a0a0a', borderTop: '1px solid #222',
                fontSize: 10, color: '#555',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <span>{viewMode === 'tree' ? 'Tree view' : 'Flat view'}</span>
                <span>{locked ? '🔒 Locked' : '0 items'}</span>
            </div>
        </div>
    );
}

function iconBtn(active: boolean): React.CSSProperties {
    return {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, padding: 0,
        background: active ? 'rgba(214,254,81,0.08)' : 'transparent',
        border: '1px solid ' + (active ? 'rgba(214,254,81,0.4)' : '#222'),
        borderRadius: 4,
        color: active ? '#D6FE51' : '#666',
        cursor: 'pointer',
        transition: 'background 100ms, color 100ms, border-color 100ms',
    };
}
