/**
 * Renders a single row in the FileExplorer tree (file or folder).
 *
 * Cycle 2 scaffold: shape + visual only. Cycle 5 will add drag-from
 * (dataTransfer.setData application/x-dwellium-path + text/uri-list).
 * Cycle 6 will add drag-into (drop handler with move/copy logic).
 * Cycle 11 will add multi-select via Cmd+click + ghost element on drag.
 */
import { useFileExplorer } from './useFileExplorer';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Globe, FolderTree, MessageSquare } from 'lucide-react';

/**
 * 3-tier Holocron hierarchy model (per Ilya 2026-05-28 lock):
 *   domain  → top-tier organizational container (already in Dwellium's flat DOMAINS)
 *   project → nested under a domain
 *   thread  → nested under a project (chat thread / workstream)
 *   folder  → regular filesystem folder under any tier
 *   file    → leaf node
 *
 * Disk layout: ~/.dwellium/files/<userId>/<domain>/<project>/<thread>/...
 */
export type EntryTier = 'domain' | 'project' | 'thread' | 'folder' | 'file';

export interface FileEntry {
    name: string;
    path: string;
    tier: EntryTier;
    children?: FileEntry[];
    size?: number;
    modified?: string;
}

interface Props {
    entry: FileEntry;
    depth?: number;
}

export function FileExplorerCell({ entry, depth = 0 }: Props) {
    const { expanded, selectedPath, setSelectedPath, toggleFolder } = useFileExplorer();
    const isExpanded = !!expanded[entry.path];
    const isSelected = selectedPath === entry.path;
    // 'folder', 'domain', 'project', 'thread' all expand to children; 'file' is a leaf
    const isFolder = entry.tier !== 'file';

    const handleClick = () => {
        setSelectedPath(entry.path);
        if (isFolder) toggleFolder(entry.path);
    };

    // Icon resolves by tier (domain/project/thread get distinct icons per Holocron design)
    const IconForTier = entry.tier === 'domain' ? Globe
        : entry.tier === 'project' ? FolderTree
        : entry.tier === 'thread' ? MessageSquare
        : entry.tier === 'folder' ? (isExpanded ? FolderOpen : Folder)
        : FileText;

    return (
        <>
            <div
                onClick={handleClick}
                role="treeitem"
                aria-selected={isSelected}
                aria-expanded={isFolder ? isExpanded : undefined}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    paddingLeft: 8 + depth * 14,
                    fontSize: 12,
                    color: isSelected ? '#D6FE51' : '#ccc',
                    background: isSelected ? 'rgba(214,254,81,0.08)' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderRadius: 4,
                }}
                onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = '#1a1a1a';
                }}
                onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
            >
                {isFolder ? (
                    isExpanded ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />
                ) : <span style={{ width: 12 }} />}
                <IconForTier size={14} strokeWidth={1.75} />
                <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>{entry.name}</span>
                {entry.tier !== 'file' && entry.tier !== 'folder' && (
                    <span style={{
                        fontSize: 9, color: '#555', textTransform: 'uppercase',
                        letterSpacing: '0.06em', flexShrink: 0,
                    }}>{entry.tier}</span>
                )}
            </div>
            {isFolder && isExpanded && entry.children?.map((child) => (
                <FileExplorerCell key={child.path} entry={child} depth={depth + 1} />
            ))}
        </>
    );
}
