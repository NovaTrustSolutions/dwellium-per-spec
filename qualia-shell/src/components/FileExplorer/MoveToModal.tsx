/**
 * MoveToModal — destination picker for the File Explorer "Move to…" action
 * (spec §4.3, Move-to-Thread). Lists folder-like destinations (domain / project
 * / thread / folder) plus Root, with a filter box. Picking one moves the entry.
 */
import { useState, useMemo } from 'react';
import { Globe, FolderTree, MessageSquare, Folder, CornerDownRight, X } from 'lucide-react';
import type { FileEntry } from './FileExplorerCell';
import { collectMoveTargets, parentOf, type MoveTarget } from './moveTargets';

const TIER_ICON: Record<string, typeof Globe> = {
    domain: Globe,
    project: FolderTree,
    thread: MessageSquare,
    folder: Folder,
};

export function MoveToModal({ entry, entries, onPick, onClose }: {
    entry: FileEntry;
    entries: FileEntry[];
    onPick: (destPath: string) => void;
    onClose: () => void;
}) {
    const [filter, setFilter] = useState('');
    const targets = useMemo(() => collectMoveTargets(entries, entry.path), [entries, entry.path]);
    const currentParent = parentOf(entry.path);
    const q = filter.trim().toLowerCase();
    const shown = q ? targets.filter((t) => t.path.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)) : targets;

    const row = (label: string, sub: string, destPath: string, Icon: typeof Globe, depth: number, isCurrent: boolean) => (
        <button
            key={destPath || '__root__'}
            onClick={() => !isCurrent && onPick(destPath)}
            disabled={isCurrent}
            title={isCurrent ? 'Already here' : `Move into ${label}`}
            style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '7px 10px', paddingLeft: 10 + depth * 14,
                background: 'transparent', border: 'none', borderRadius: 6,
                color: isCurrent ? '#555' : '#ddd', cursor: isCurrent ? 'not-allowed' : 'pointer',
                fontSize: 12, fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = '#222'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
            <Icon size={14} strokeWidth={1.75} style={{ color: isCurrent ? '#444' : '#D6FE51', flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            {sub && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sub}</span>}
            {isCurrent && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>current</span>}
        </button>
    );

    return (
        <div
            onMouseDown={onClose}
            style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{ width: 360, maxWidth: '100%', maxHeight: '80%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid #333', borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.7)', overflow: 'hidden' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #222' }}>
                    <CornerDownRight size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Move "{entry.name}" to…
                    </span>
                    <button onClick={onClose} title="Cancel" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
                </div>
                <input
                    autoFocus
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter destinations…"
                    style={{ margin: 10, padding: '7px 10px', background: 'var(--bg-desktop)', border: '1px solid #333', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 8px' }}>
                    {/* Root is always a valid destination (unless already at root). */}
                    {(!q || 'root'.includes(q)) && row('Root', '', '', Folder, 0, currentParent === '')}
                    {shown.map((t: MoveTarget) => row(t.name, t.tier, t.path, TIER_ICON[t.tier] ?? Folder, t.depth, t.path === currentParent))}
                    {shown.length === 0 && (!q ? false : true) && (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>No matching destinations.</div>
                    )}
                    {targets.length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
                            No folders or threads yet — create a domain/project/thread to move into.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
