import { useEffect, useState } from 'react';
import { Folder, FolderUp, X, Check } from 'lucide-react';

export default function FolderPickerModal({ initialPath, onSelect, onClose }: {
    initialPath: string;
    onSelect: (folderPath: string) => void;
    onClose: () => void;
}) {
    const [currentPath, setCurrentPath] = useState(initialPath || '');
    const [parentPath, setParentPath] = useState<string | null>(null);
    const [subdirs, setSubdirs] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const loadPath = async (target: string) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/__kb/list-directories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: target })
            });
            const data = await res.json();
            if (data.success) {
                setCurrentPath(data.current);
                setParentPath(data.parent);
                setSubdirs(data.subdirs || []);
            } else {
                setError(data.error || 'Failed to list directory');
            }
        } catch (err) {
            setError('Server connection failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPath(initialPath);
    }, [initialPath]);

    const handleSubdirClick = (sub: string) => {
        const divider = currentPath.endsWith('/') ? '' : '/';
        loadPath(`${currentPath}${divider}${sub}`);
    };

    const handleParentClick = () => {
        if (parentPath) {
            loadPath(parentPath);
        }
    };

    return (
        <div 
            onMouseDown={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
            <div 
                onMouseDown={(e) => e.stopPropagation()}
                style={{ width: 440, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface, #151515)', border: '1px solid var(--border-default, #333)', borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.7)', overflow: 'hidden' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-default, #222)' }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #fff)' }}>Select Local Folder</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary, #888)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
                </div>
                
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input
                            value={currentPath}
                            onChange={(e) => setCurrentPath(e.target.value)}
                            onBlur={() => loadPath(currentPath)}
                            style={{ flex: 1, fontSize: 12, padding: '6px 10px', background: 'var(--bg-desktop, #0a0a0a)', border: '1px solid var(--border-default, #333)', borderRadius: 6, color: 'var(--text-primary, #fff)', fontFamily: 'monospace', outline: 'none' }}
                        />
                        {parentPath && (
                            <button
                                onClick={handleParentClick}
                                title="Go up to parent folder"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-default, #333)', background: 'var(--bg-surface, #222)', color: 'var(--text-secondary, #aaa)', cursor: 'pointer' }}
                            >
                                <FolderUp size={14} />
                            </button>
                        )}
                    </div>

                    {error && <div style={{ fontSize: 12, color: '#ef6a6a', padding: '4px 8px' }}>{error}</div>}

                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-default, #222)', borderRadius: 8, background: 'rgba(0,0,0,0.15)', padding: 6, maxHeight: '35vh' }}>
                        {loading ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary, #888)', fontSize: 12 }}>Loading folders…</div>
                        ) : subdirs.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary, #888)', fontSize: 12 }}>No subdirectories found</div>
                        ) : (
                            subdirs.map((sub) => (
                                <button
                                    key={sub}
                                    onClick={() => handleSubdirClick(sub)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', background: 'transparent', border: 'none', borderRadius: 6, color: 'var(--text-secondary, #ccc)', cursor: 'pointer', fontSize: 12, textAlign: 'left', transition: 'background 0.1s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Folder size={13} style={{ color: 'var(--accent, #D6FE51)' }} />
                                    <span>{sub}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border-default, #222)', background: 'rgba(0,0,0,0.1)' }}>
                    <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-default, #333)', background: 'transparent', color: 'var(--text-secondary, #ccc)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                    <button
                        onClick={() => onSelect(currentPath)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--accent, #D6FE51)', color: 'var(--text-inverse, #000)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                    >
                        <Check size={13} />
                        Select Folder
                    </button>
                </div>
            </div>
        </div>
    );
}
