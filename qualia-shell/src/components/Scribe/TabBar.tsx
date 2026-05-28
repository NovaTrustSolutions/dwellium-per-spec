import { useState, useCallback } from 'react';
import { useScribeStore, type OpenFile } from './scribeStore';

export function TabBar() {
    const openFiles = useScribeStore((s) => s.openFiles);
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const setActiveFile = useScribeStore((s) => s.setActiveFile);
    const closeFile = useScribeStore((s) => s.closeFile);
    const createFile = useScribeStore((s) => s.createFile);

    // 2026-05-27 fix: window.prompt() is silently blocked in many contexts.
    // Replace with inline input toggled via local state.
    const [creating, setCreating] = useState(false);
    const [draftName, setDraftName] = useState('');

    const startCreate = useCallback(() => {
        setDraftName('');
        setCreating(true);
    }, []);

    const confirmCreate = useCallback(() => {
        const name = draftName.trim();
        if (!name) { setCreating(false); return; }
        const filepath = name.endsWith('.md') ? name : `${name}.md`;
        void createFile(filepath);
        setCreating(false);
        setDraftName('');
    }, [draftName, createFile]);

    const cancelCreate = useCallback(() => {
        setCreating(false);
        setDraftName('');
    }, []);

    if (openFiles.length === 0) return <></>;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            flexShrink: 0,
            overflowX: 'auto',
            padding: '6px 8px 0',
            gap: 2,
            height: 38,
            background: '#0a0a0a',
            borderBottom: '1px solid #222',
        }}>
            {openFiles.map((file) => (
                <Tab
                    key={file.filepath}
                    file={file}
                    isActive={file.filepath === activeFilepath}
                    onActivate={() => setActiveFile(file.filepath)}
                    onClose={() => {
                        if (file.dirty && !confirm(`"${file.filepath}" has unsaved changes. Close anyway?`)) return;
                        closeFile(file.filepath);
                    }}
                />
            ))}
            {creating ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                    <input
                        type="text"
                        autoFocus
                        placeholder="filename.md"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmCreate();
                            else if (e.key === 'Escape') cancelCreate();
                        }}
                        onBlur={cancelCreate}
                        style={{
                            height: 28,
                            padding: '0 8px',
                            background: '#000',
                            border: '1px solid #D6FE51',
                            borderRadius: 4,
                            color: '#fff',
                            fontSize: 12,
                            fontFamily: 'inherit',
                            outline: 'none',
                            width: 160,
                        }}
                    />
                </div>
            ) : (
                <button
                    onClick={startCreate}
                    title="Create new file"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, marginLeft: 4,
                        background: 'transparent', border: '1px solid #333',
                        borderRadius: 4, color: '#808080', cursor: 'pointer',
                        fontSize: 16, lineHeight: 1, fontFamily: 'inherit',
                        flexShrink: 0, transition: 'color 100ms, border-color 100ms',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#D6FE51'; e.currentTarget.style.borderColor = '#D6FE51'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#808080'; e.currentTarget.style.borderColor = '#333'; }}
                >
                    +
                </button>
            )}
        </div>
    );
}

function Tab({ file, isActive, onActivate, onClose }: {
    file: OpenFile;
    isActive: boolean;
    onActivate: () => void;
    onClose: () => void;
}) {
    const [hovered, setHovered] = useState(false);
    const [closeHovered, setCloseHovered] = useState(false);
    const name = file.filepath.split('/').pop() ?? file.filepath;

    return (
        <div
            onClick={onActivate}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title={file.filepath}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: '6px 6px 0 0',
                fontSize: 12,
                fontFamily: 'inherit',
                flexShrink: 0,
                maxWidth: 180,
                cursor: 'pointer',
                userSelect: 'none',
                marginBottom: -1,
                background: isActive ? '#000' : hovered ? '#111' : 'transparent',
                color: isActive ? '#D6FE51' : '#ccc',
                borderBottom: isActive ? '2px solid #D6FE51' : '2px solid transparent',
                transition: 'background 150ms, color 150ms',
            }}
        >
            <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                {file.dirty ? `${name} •` : name}
            </span>
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                onMouseEnter={() => setCloseHovered(true)}
                onMouseLeave={() => setCloseHovered(false)}
                style={{
                    flexShrink: 0, width: 14, height: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 3, border: 'none', background: 'transparent',
                    color: closeHovered ? '#fff' : 'rgba(255,255,255,0.25)',
                    cursor: 'pointer', fontSize: 13, lineHeight: 1,
                    opacity: isActive || hovered ? 1 : 0,
                    transition: 'opacity 150ms, color 150ms',
                }}
                title="Close"
            >
                &times;
            </button>
        </div>
    );
}
