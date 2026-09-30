/**
 * TrashPanel — lists trashed entries with Restore / Delete forever / Empty trash.
 * Plan 076 P4: confirmations, the restore-as name and errors go through the widget's in-app
 * dialogs (`dialogs`, from useFileDialogs) instead of window.confirm/prompt/alert.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { File, Folder, Trash2, X } from 'lucide-react';
import {
    listTrash, restoreFromTrash, deleteFromTrash, emptyTrash, isConflict, type TrashItem,
} from './fileExplorerApi';
import type { FileDialogApi } from './FileExplorerCell';
import { MUTED_TEXT, DANGER_TEXT, HIT } from './fileExplorerTheme';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function splitPath(p: string): { dir: string; base: string } {
    const i = p.lastIndexOf('/');
    return { dir: i < 0 ? '' : p.slice(0, i), base: i < 0 ? p : p.slice(i + 1) };
}

/** "a/notes.md" -> "a/notes (restored).md" (a file keeps its extension; folders have none). */
function restoredName(path: string, isDir: boolean): string {
    const { dir, base } = splitPath(path);
    const dot = isDir ? -1 : base.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ''];
    return `${dir ? `${dir}/` : ''}${stem} (restored)${ext}`;
}

// Latte: raw --danger (3.5:1) and --text-tertiary (4.3:1) fail on light surfaces; see
// fileExplorerTheme.ts (mix toward --text-primary; house pattern, Docs/code.md).

const btn = (danger = false): React.CSSProperties => ({
    background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6,
    color: danger ? DANGER_TEXT : 'var(--text-primary)', fontSize: 11, padding: '0 10px', minHeight: HIT, minWidth: HIT,
    cursor: 'pointer', fontFamily: 'inherit',
});

interface TrashPanelProps { onClose: () => void; onRestored: (path: string) => void; dialogs: FileDialogApi }

export function TrashPanel({ onClose, onRestored, dialogs }: TrashPanelProps) {
    const [items, setItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const seq = useRef(0);
    // A dialog can outlive this panel (account switch closes it); never act on an answer given after that.
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

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
            if (!isConflict(e)) { dialogs.notify(errMsg(e), 'error'); return; }
            if (retried) { dialogs.notify(`"${as}" already exists too. Nothing was restored.`, 'error'); return; }
            const name = await dialogs.prompt({
                title: 'Restore as', message: `"${it.path}" already exists. Restore as:`,
                defaultValue: restoredName(it.path, it.isDir), confirmLabel: 'Restore',
            });
            if (alive.current && name) await tryRestore(it, name, true);
        }
    };

    const onDelete = (it: TrashItem) => run(async () => {
        const ok = await dialogs.confirm({
            title: 'Delete forever', message: `Permanently delete "${it.name}"? This cannot be undone.`,
            confirmLabel: 'Delete forever', danger: true,
        });
        if (!ok || !alive.current) return;
        try { await deleteFromTrash(it.id); await load(); } catch (e) { dialogs.notify(errMsg(e), 'error'); }
    });

    const onEmpty = () => run(async () => {
        const ok = await dialogs.confirm({
            title: 'Empty trash', message: `Permanently delete ${items.length} item(s). This cannot be undone.`,
            confirmLabel: 'Empty trash', danger: true, requireText: 'EMPTY',
        });
        if (!ok || !alive.current) return;
        try { await emptyTrash(); await load(); } catch (e) { dialogs.notify(errMsg(e), 'error'); }
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
                    <div style={{ fontSize: 10, color: MUTED_TEXT }}>{dir} · {when}</div>
                </div>
                <button style={btn()} disabled={busy} aria-label={`Restore ${it.name}`} onClick={() => run(() => tryRestore(it))}>Restore</button>
                <button style={btn(true)} disabled={busy} aria-label={`Delete ${it.name} forever`} onClick={() => onDelete(it)}>Delete forever</button>
            </div>
        );
    };

    return (
        <div role="region" aria-label="Trash" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <Trash2 size={14} style={{ color: MUTED_TEXT }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Trash</span>
                <span style={{ fontSize: 11, color: MUTED_TEXT, flex: 1 }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
                <button style={btn(true)} disabled={busy || items.length === 0} onClick={onEmpty}>Empty trash</button>
                <button style={{ ...btn(), padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Close trash" onClick={onClose}><X size={14} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? <div style={{ padding: 12, fontSize: 12, color: MUTED_TEXT }}>Loading…</div>
                    : error ? <div role="alert" style={{ padding: 12, fontSize: 12, color: DANGER_TEXT }}>Could not load trash: {error}</div>
                    : items.length === 0 ? <div style={{ padding: 12, fontSize: 12, color: MUTED_TEXT }}>Trash is empty</div>
                    : items.map(row)}
            </div>
        </div>
    );
}
