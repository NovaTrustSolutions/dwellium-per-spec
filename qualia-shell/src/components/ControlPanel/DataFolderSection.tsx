/**
 * DataFolderSection — choose where Dwellium's files/notes live (spec §4.1 path).
 *
 * In the Electron desktop build this exposes the native folder picker
 * (`electronAPI.chooseDataRoot` → `setDataRoot`), so the user can point the data
 * root at a passport-drive or iCloud Drive folder and make their data portable
 * between Macs. In the web build it shows the current root read-only with a note.
 */
import { useState, useEffect } from 'react';

interface ElectronAPI {
    isElectron?: boolean;
    dataRoot?: () => Promise<string>;
    chooseDataRoot?: () => Promise<string | null>;
    setDataRoot?: (p: string) => Promise<boolean>;
    relaunch?: () => Promise<void>;
}

export default function DataFolderSection() {
    const api = (typeof window !== 'undefined' ? (window as unknown as { electronAPI?: ElectronAPI }).electronAPI : undefined);
    const isElectron = !!api?.isElectron;
    const [root, setRoot] = useState<string>('');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        let cancelled = false;
        if (api?.dataRoot) {
            api.dataRoot().then((r) => { if (!cancelled) setRoot(r || ''); }).catch(() => { /* */ });
        } else {
            try { setRoot((window as unknown as { __dwelliumWorkspaceRoot?: string }).__dwelliumWorkspaceRoot || ''); } catch { /* */ }
        }
        return () => { cancelled = true; };
    }, [api]);

    const choose = async () => {
        if (!api?.chooseDataRoot) return;
        const p = await api.chooseDataRoot();
        if (p) {
            await api.setDataRoot?.(p);
            setRoot(p);
            setMsg('Saved. Relaunch Dwellium to use the new data folder.');
        }
    };

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">Data Folder</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 0, lineHeight: 1.6 }}>
                Where your files, notes, and knowledge are stored. Point this at a folder on a passport
                drive or in iCloud Drive to make your data travel with you between Macs.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current</span>
                <code style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--accent)', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border, #333)', borderRadius: 6, padding: '6px 10px', fontFamily: "'JetBrains Mono','Fira Code',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {root || '~/.dwellium'}
                </code>
            </div>

            {isElectron ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                        onClick={() => void choose()}
                        style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                        Change data folder…
                    </button>
                    {msg && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            {msg}
                            {api?.relaunch && (
                                <button onClick={() => void api.relaunch?.()} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Relaunch now
                                </button>
                            )}
                        </span>
                    )}
                </div>
            ) : (
                <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>
                    Folder selection is available in the Dwellium desktop app. (Web shows the default location.)
                </p>
            )}
        </section>
    );
}
