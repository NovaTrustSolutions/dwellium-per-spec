/**
 * Persistent per-document toolbar — sits below TabBar and above the
 * editor. Hosts: ☰ Contents toggle, 🕒 Version, 🗑 Delete.
 *
 * Ported from Holocron's DocumentToolbar.tsx (Cycle 8). Adapted:
 * version logic uses scribeStore.createVersion instead of Electron IPC,
 * delete uses scribeStore.deleteFile. Styling matches Dwellium fey dark.
 */
import { useState } from 'react';
import { useScribeStore } from './scribeStore';

export function DocumentToolbar() {
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const tocVisible = useScribeStore((s) => s.tocVisible);
    const setTocVisible = useScribeStore((s) => s.setTocVisible);
    const minimapVisible = useScribeStore((s) => s.minimapVisible);
    const setMinimapVisible = useScribeStore((s) => s.setMinimapVisible);
    const createVersion = useScribeStore((s) => s.createVersion);
    const deleteFile = useScribeStore((s) => s.deleteFile);
    const closeFile = useScribeStore((s) => s.closeFile);

    const [versioning, setVersioning] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState('');

    if (!activeFilepath) return null;

    const handleVersion = async () => {
        if (versioning) return;
        setVersioning(true);
        try {
            const newPath = await createVersion(activeFilepath);
            if (newPath) {
                const name = newPath.split('/').pop() ?? newPath;
                setToast(`✓ Saved as ${name}`);
                setTimeout(() => setToast(''), 2500);
            }
        } finally {
            setVersioning(false);
        }
    };

    const handleDelete = async () => {
        if (deleting) return;
        const name = activeFilepath.split('/').pop() ?? activeFilepath;
        if (!confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;
        setDeleting(true);
        try {
            closeFile(activeFilepath);
            await deleteFile(activeFilepath);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="scribe__toolbar">
            <ToolbarBtn
                label="☰ Contents"
                title={tocVisible ? 'Hide table of contents' : 'Show table of contents'}
                active={tocVisible}
                onClick={() => setTocVisible(!tocVisible)}
            />
            <ToolbarBtn
                label="🗺 Minimap"
                title={minimapVisible ? 'Hide minimap' : 'Show minimap'}
                active={minimapVisible}
                onClick={() => setMinimapVisible(!minimapVisible)}
            />
            <ToolbarBtn
                label={versioning ? '...' : '🕒 Version'}
                title="Save a snapshot of current content"
                disabled={versioning}
                onClick={() => void handleVersion()}
            />
            {toast && <span className="scribe__toolbar-toast">{toast}</span>}
            <span style={{ flex: 1 }} />
            <ToolbarBtn
                label={deleting ? '...' : '🗑 Delete'}
                title="Delete this file"
                danger
                disabled={deleting}
                onClick={() => void handleDelete()}
            />
        </div>
    );
}

function ToolbarBtn({ label, title, onClick, disabled, active, danger }: {
    label: string; title: string; onClick: () => void;
    disabled?: boolean; active?: boolean; danger?: boolean;
}) {
    const bg = active ? '#D6FE51' : 'transparent';
    const color = active ? '#000' : danger ? '#ff4d6d' : '#808080';
    const hoverBg = active ? '#e0ff6e' : danger ? 'rgba(255,77,109,0.12)' : 'rgba(255,255,255,0.06)';
    const hoverColor = active ? '#000' : danger ? '#ff6b85' : '#fff';
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                borderRadius: 4, border: 'none', cursor: disabled ? 'wait' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: bg, color,
                transition: 'background 120ms, color 120ms',
                opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
                if (disabled) return;
                e.currentTarget.style.background = hoverBg;
                e.currentTarget.style.color = hoverColor;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = bg;
                e.currentTarget.style.color = color;
            }}
        >
            {label}
        </button>
    );
}
