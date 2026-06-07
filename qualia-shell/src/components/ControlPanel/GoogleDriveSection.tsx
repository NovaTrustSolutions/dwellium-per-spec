/**
 * GoogleDriveSection — the "Google Drive" storage box in Settings.
 *
 * Sits next to the local-disk storage box (DataFolderSection). Lets the user
 * back up / restore their local data (Wiki, Thought Weaver, File Explorer cache,
 * Honcho memory + dreams) to their own Google Drive — frontend-only, via Google
 * Identity Services + the Drive REST API (drive.file scope). The user pastes a
 * Google OAuth Client ID once (like an LLM API key); access tokens stay in memory.
 */
import { useContext, useState } from 'react';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import {
    connectDrive, ensureFolder, uploadSnapshot, downloadSnapshot,
    buildSnapshot, applySnapshot, DEFAULT_FOLDER,
} from '../../services/googleDriveStorage';
import type { GoogleDriveConfig } from '../../types/integrations';

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 4, fontSize: 12, marginBottom: 8,
    border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
};
const btn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
};
const btnPrimary: React.CSSProperties = { ...btn, background: '#D6FE51', color: '#0a0a0a', border: 'none' };

export default function GoogleDriveSection() {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    const { integrations, update } = useIntegrations();
    const cfg: GoogleDriveConfig = integrations.storage?.googleDrive ?? { clientId: '', enabled: false };

    const [token, setToken] = useState<string | null>(null);
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    const setCfg = (patch: Partial<GoogleDriveConfig>) =>
        update((b) => ({ ...b, storage: { ...b.storage, googleDrive: { ...cfg, ...patch } } }));

    const flash = (m: string) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 5000); };
    const fail = (e: unknown) => { setErr(e instanceof Error ? e.message : String(e)); setMsg(''); };

    const connect = async () => {
        setBusy('Connecting…'); setErr('');
        try {
            const t = await connectDrive(cfg.clientId.trim());
            setToken(t);
            setCfg({ enabled: true });
            flash('Connected to Google Drive.');
        } catch (e) { fail(e); } finally { setBusy(''); }
    };

    const backup = async () => {
        if (!token) { fail(new Error('Connect to Google Drive first')); return; }
        setBusy('Backing up…'); setErr('');
        try {
            const folderId = await ensureFolder(token, cfg.folderName || DEFAULT_FOLDER);
            const snap = buildSnapshot(localStorage, uid || '_anonymous');
            await uploadSnapshot(token, folderId, snap);
            setCfg({ folderId, lastSyncAt: Date.now() });
            flash(`Backed up ${Object.keys(snap.data).length} data set(s) to your Drive.`);
        } catch (e) { fail(e); } finally { setBusy(''); }
    };

    const restore = async () => {
        if (!token) { fail(new Error('Connect to Google Drive first')); return; }
        setBusy('Restoring…'); setErr('');
        try {
            const folderId = cfg.folderId || (await ensureFolder(token, cfg.folderName || DEFAULT_FOLDER));
            const snap = await downloadSnapshot(token, folderId);
            if (!snap) { flash('No backup found on Drive yet — back up first.'); return; }
            const n = applySnapshot(localStorage, snap);
            setCfg({ folderId, lastSyncAt: Date.now() });
            flash(`Restored ${n} data set(s). Reloading…`);
            setTimeout(() => { try { window.location.reload(); } catch { /* */ } }, 900);
        } catch (e) { fail(e); } finally { setBusy(''); }
    };

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">Storage — Google Drive</h3>
            <div className="cp-integration-card">
                <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 0 }}>
                    Back up your Wiki, Thought Weaver, File Explorer, and Honcho data to your own Google Drive
                    (a “{cfg.folderName || DEFAULT_FOLDER}” folder; <code>drive.file</code> scope, so the app only
                    ever touches files it creates). API keys are never backed up. Paste a Google OAuth Client ID
                    (Google Cloud Console → Credentials → OAuth client) to connect — like an LLM key.
                </p>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                    Google OAuth Client ID
                </label>
                <input
                    type="text"
                    value={cfg.clientId}
                    onChange={(e) => setCfg({ clientId: e.target.value })}
                    placeholder="xxxxxxxx.apps.googleusercontent.com"
                    style={inputStyle}
                    aria-label="Google OAuth Client ID"
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button style={btnPrimary} onClick={connect} disabled={!cfg.clientId.trim() || !!busy}>
                        {token ? 'Reconnect' : 'Connect Google Drive'}
                    </button>
                    <button style={btn} onClick={backup} disabled={!token || !!busy}>Back up now</button>
                    <button style={btn} onClick={restore} disabled={!token || !!busy}>Restore</button>
                    {busy && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>⏳ {busy}</span>}
                </div>
                {cfg.lastSyncAt ? (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                        Last sync: {new Date(cfg.lastSyncAt).toLocaleString()}
                    </div>
                ) : null}
                {msg && <div style={{ fontSize: 12, color: '#5ef0a0', marginTop: 8 }}>{msg}</div>}
                {err && <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8 }}>{err}</div>}
            </div>
        </section>
    );
}
