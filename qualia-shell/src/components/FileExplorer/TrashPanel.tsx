/**
 * TrashPanel — lists trashed entries with Restore / Delete forever / Empty trash.
 * Native confirm/prompt/alert are kept on purpose (replaced in Phase 4).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { File, Folder, Trash2, X } from 'lucide-react';
import {
    listTrash, restoreFromTrash, deleteFromTrash, emptyTrash, isConflict, type TrashItem,
} from './fileExplorerApi';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function splitPath(p: string): { dir: string; base: string } {
    const i = p.lastIndexOf('/');
    return { dir: i < 0 ? '' : p.slice(0, i), base: i < 0 ? p : p.slice(i + 1) };
}

/** "a/notes.md" -> "a/notes (restored).md" (extension kept). */
function restoredName(path: string): string {
    const { dir, base } = splitPath(path);
    const dot = base.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ''];
    return `${dir ? `${dir}/` : ''}${stem} (restored)${ext}`;
}

const btn = (danger = false): React.CSSProperties => ({
    background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6,
    color: danger ? 'var(--danger)' : 'var(--text-primary)', fontSize: 11, padding: '3px 8px',
    cursor: 'pointer', fontFamily: 'inherit',
});

export function TrashPanel({ onClose, onRestored }: { onClose: () => void; onRestored: (path: string) => void }) {
    const [items, setItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const seq = useRef(0);

    const load = useCallback(async () => {
        const mine = ++seq.current;
        try {
            const list = await listTrash();
            if (mine !== seq.current) return;
            setItems(list); setError(null);
        } catch (e) {
            if (mine === seq.current) setError(errMsg(e));
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    /** Run one action at a time; a second click while in flight is ignored. */
    const run = async (fn: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true);
        try { await fn(); } finally { busyRef.current = false; setBusy(false); }
    };

    const tryRestore = async (it: TrashItem, as?: string, retried = false): Promise<void> => {
        try {
            const r = await restoreFromTrash(it.id, as);
            onRestored(r.path);
            await load();
        } catch (e) {
            if (!isConflict(e)) { alert(errMsg(e)); return; }
            if (retried) { alert(`"${as}" already exists too. Nothing was restored.`); return; }
            const name = window.prompt(`"${it.path}" already exists. Restore as:`, restoredName(it.path));
            if (name && name.trim()) await tryRestore(it, name.trim(), true);
        }
    };

    const onDelete = (it: TrashItem) => run(async () => {
        if (!window.confirm(`Permanently delete "${it.name}"? This cannot be undone.`)) return;
        try { await deleteFromTrash(it.id); await load(); } catch (e) { alert(errMsg(e)); }
    });

    const onEmpty = () => run(async () => {
        const answer = window.prompt(`Type EMPTY to permanently delete ${items.length} item(s). This cannot be undone.`);
        if (answer === null || answer.trim() !== 'EMPTY') return;
        try { await emptyTrash(); await load(); } catch (e) { alert(errMsg(e)); }
    });

    const row = (it: TrashItem) => {
        const Icon = it.isDir ? Folder : File;
        const dir = splitPath(it.path).dir || 'root';
        const when = it.deletedAt ? new Date(it.deletedAt).toLocaleString() : 'unknown';
        return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <Icon size={14} strokeWidth={1.75} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{dir} · {when}</div>
                </div>
                <button style={btn()} disabled={busy} aria-label={`Restore ${it.name}`} onClick={() => run(() => tryRestore(it))}>Restore</button>
                <button style={btn(true)} disabled={busy} aria-label={`Delete ${it.name} forever`} onClick={() => onDelete(it)}>Delete forever</button>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <Trash2 size={14} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Trash</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
                <button style={btn(true)} disabled={busy || items.length === 0} onClick={onEmpty}>Empty trash</button>
                <button style={{ ...btn(), padding: 3 }} aria-label="Close trash" onClick={onClose}><X size={14} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</div>
                    : error ? <div role="alert" style={{ padding: 12, fontSize: 12, color: 'var(--danger)' }}>Could not load trash: {error}</div>
                    : items.length === 0 ? <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>Trash is empty</div>
                    : items.map(row)}
            </div>
        </div>
    );
}
