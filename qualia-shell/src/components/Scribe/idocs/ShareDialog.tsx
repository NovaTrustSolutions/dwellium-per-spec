/**
 * ShareDialog — wave 3B: share a doc with workspace members (view / comment /
 * edit). First share pushes the doc (`putSharedDoc`), then `setMembers`
 * replaces the member list; "Stop sharing" → `unshare`. `doc.shared`
 * ({ version, updatedAt, role: 'owner' }) is persisted through the store so
 * the editor's live-lite sync (useSharedDocSync) starts polling.
 */
import { useEffect, useState } from 'react';
import { IdocsApiError, getSharedDoc, putSharedDoc, setMembers, unshare, type IdocsApiDeps, type ShareRole, type SharedMember } from './idocsApi';
import { updateDoc } from './idocsStore';
import { toRemoteDoc } from './useSharedDocSync';
import type { IDoc } from './idocTypes';
import './PublishDialog.css';

export interface ShareDialogProps { doc: IDoc; onClose: () => void; api?: IdocsApiDeps; onToast?: (m: string) => void }
type Row = { email: string; role: ShareRole; name?: string };
const ROLES: ShareRole[] = ['view', 'comment', 'edit'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ShareDialog({ doc, onClose, api, onToast }: ShareDialogProps) {
    const isShared = !!doc.shared;
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(isShared);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<ShareRole>('view');
    const [busy, setBusy] = useState<'save' | 'stop' | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Existing share → load the current member list.
    useEffect(() => {
        if (!isShared) return;
        let on = true;
        getSharedDoc(doc.id, api).then((r) => { if (on) setRows((r.members ?? []).map((m: SharedMember) => ({ email: m.email, role: m.role, name: m.name }))); })
            .catch((e: Error) => { if (on) setError(`Couldn't load members: ${e.message}`); })
            .finally(() => { if (on) setLoading(false); });
        return () => { on = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per dialog open
    }, [doc.id, isShared]);

    const add = () => {
        const e = email.trim().toLowerCase();
        if (!EMAIL_RE.test(e)) { setError('Enter a valid email'); return; }
        setError(null);
        setRows((r) => (r.some((x) => x.email === e) ? r.map((x) => (x.email === e ? { ...x, role } : x)) : [...r, { email: e, role }]));
        setEmail('');
    };
    const save = async () => {
        setBusy('save'); setError(null);
        try {
            let shared = doc.shared;
            if (!shared) {
                const r = await putSharedDoc(doc.id, { doc: toRemoteDoc(doc) }, api);
                shared = { version: r.version, updatedAt: r.updatedAt, role: 'owner' };
                updateDoc(doc.id, { shared });
            }
            const members = await setMembers(doc.id, rows.map(({ email, role }) => ({ email, role })), api);
            setRows(members.map((m) => ({ email: m.email, role: m.role, name: m.name })));
            onToast?.(members.length ? `Shared with ${members.length} ${members.length === 1 ? 'person' : 'people'}` : 'Member list saved');
        } catch (e) {
            if (e instanceof IdocsApiError && e.code === 'unknown-users') setError(`No workspace account for: ${(e.emails ?? []).join(', ') || 'some emails'}`);
            else if (e instanceof IdocsApiError && e.status === 0) setError('Backend unreachable — try again when connected.');
            else setError(`Share failed: ${(e as Error).message}`);
        } finally { setBusy(null); }
    };
    const stop = async () => {
        setBusy('stop'); setError(null);
        try { await unshare(doc.id, api); updateDoc(doc.id, { shared: undefined }); setRows([]); onToast?.('Stopped sharing'); }
        catch (e) { setError(`Stop sharing failed: ${(e as Error).message}`); }
        finally { setBusy(null); }
    };

    return (
        <div className="scribe-idocs-ed__sheet-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="scribe-idocs-ed__sheet scribe-idocs-pub" role="dialog" aria-label="Share" data-testid="idoc-share">
                <h3>Share “{doc.title || 'Untitled'}”</h3>
                <small className="scribe-idocs__hint">{isShared ? `Shared · version ${doc.shared!.version}. Members see live changes (polled every 5 s).` : 'Add workspace members by email. Saving pushes this doc to the server and starts live-lite sync.'}</small>
                <form className="scribe-idocs-pub__member-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-label="Member email" />
                    <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)} aria-label="Role for new member">{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                    <button type="submit" className="scribe-idocs__btn" disabled={!email.trim()}>Add</button>
                </form>
                {loading ? <small className="scribe-idocs__hint">Loading members…</small> : rows.length === 0 ? <small className="scribe-idocs__hint">No members yet.</small> : (
                    <table aria-label="Members">
                        <thead><tr><th>Member</th><th>Role</th><th aria-label="Remove" /></tr></thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.email}>
                                    <td>{r.name ? <><strong>{r.name}</strong> <small>{r.email}</small></> : r.email}</td>
                                    <td><select value={r.role} onChange={(e) => setRows((rs) => rs.map((x) => (x.email === r.email ? { ...x, role: e.target.value as ShareRole } : x)))} aria-label={`Role for ${r.email}`}>{ROLES.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                                    <td><button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={() => setRows((rs) => rs.filter((x) => x.email !== r.email))} aria-label={`Remove ${r.email}`}>✕</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {error && <p className="scribe-idocs__warn" role="alert">{error}</p>}
                <div className="scribe-idocs-pub__foot">
                    <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void save()} disabled={!!busy || loading}>{busy === 'save' ? 'Saving…' : isShared ? 'Save members' : 'Share'}</button>
                    {isShared && <button type="button" className="scribe-idocs__btn" onClick={() => void stop()} disabled={!!busy}>{busy === 'stop' ? 'Stopping…' : 'Stop sharing'}</button>}
                    <span className="scribe-idocs__spacer" />
                    <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
