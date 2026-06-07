/**
 * googleDriveStorage — frontend-only Google Drive "storage box".
 *
 * Backs up / restores the user's local data (Wiki, Thought Weaver, File Explorer
 * cache, Honcho memory + dreams) to a "Dwellium" folder on their own Google Drive.
 * No backend required: it uses Google Identity Services for OAuth in the browser
 * and the Drive REST API with the narrow `drive.file` scope (the app can only
 * touch files IT created — it can't read the user's other Drive files). The user
 * supplies a Google OAuth Client ID once (Google Cloud Console → Credentials),
 * exactly like an LLM API key. Access tokens are session-only and never persisted.
 *
 * API keys / integration secrets are deliberately NOT backed up.
 *
 * 2026-06-07 — the "Google Drive storage box" ask.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BACKUP_FILENAME = 'dwellium-backup.json';
export const DEFAULT_FOLDER = 'Dwellium';

// ── Pure snapshot logic (unit-tested; no network / no DOM) ────────────

export interface DwelliumSnapshot {
    version: 1;
    uid: string;
    savedAt: string;
    data: Record<string, string>; // localStorage key → raw stored value
}

/** The localStorage keys backed up for a user — their widget DATA, never secrets. */
export function backupKeys(uid: string): string[] {
    return [
        `dwellium:wiki:${uid}`,
        `thought-weaver:captures:${uid}`,
        `dwellium:workspace:cache:${uid}`,
        `honcho:memories:${uid}`,
        `honcho:dreams:${uid}`,
    ];
}

/** Build a snapshot from a localStorage-like map (pure → testable). */
export function buildSnapshot(store: Pick<Storage, 'getItem'>, uid: string): DwelliumSnapshot {
    const data: Record<string, string> = {};
    for (const key of backupKeys(uid)) {
        const v = store.getItem(key);
        if (v != null) data[key] = v;
    }
    return { version: 1, uid, savedAt: new Date().toISOString(), data };
}

/** Apply a snapshot into a localStorage-like map (pure → testable). Returns # keys restored. */
export function applySnapshot(store: Pick<Storage, 'setItem'>, snap: DwelliumSnapshot | null): number {
    if (!snap || snap.version !== 1 || !snap.data || typeof snap.data !== 'object') return 0;
    let n = 0;
    for (const [key, value] of Object.entries(snap.data)) {
        if (typeof value === 'string') {
            try { store.setItem(key, value); n++; } catch { /* quota — skip */ }
        }
    }
    return n;
}

// ── Google Identity Services + Drive REST (browser, user-credentialed) ─

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
    if (typeof document === 'undefined') return Promise.reject(new Error('No DOM'));
    if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = GIS_SRC; s.async = true; s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(s);
    });
    return gisPromise;
}

/** Pop the Google consent screen; resolves an access token (kept in memory only). */
export async function connectDrive(clientId: string): Promise<string> {
    if (!clientId) throw new Error('Add your Google OAuth Client ID first');
    await loadGis();
    const google = (window as any).google;
    return new Promise<string>((resolve, reject) => {
        try {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: DRIVE_SCOPE,
                callback: (resp: any) => {
                    if (resp?.access_token) resolve(resp.access_token);
                    else reject(new Error(resp?.error_description || resp?.error || 'Authorization failed'));
                },
            });
            client.requestAccessToken({ prompt: '' });
        } catch (e: any) {
            reject(new Error(e?.message || 'Google sign-in failed'));
        }
    });
}

async function driveJson(token: string, path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`https://www.googleapis.com/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text().catch(() => '')) || res.statusText}`);
    return res.json();
}

/** Find (or create) the Dwellium folder; returns its id. */
export async function ensureFolder(token: string, name = DEFAULT_FOLDER): Promise<string> {
    const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`);
    const found = await driveJson(token, `drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`);
    if (found.files?.length) return found.files[0].id as string;
    const created = await driveJson(token, 'drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
    });
    return created.id as string;
}

async function findBackupFile(token: string, folderId: string): Promise<string | null> {
    const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and '${folderId}' in parents and trashed=false`);
    const found = await driveJson(token, `drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
    return found.files?.[0]?.id ?? null;
}

/** Upload (create or overwrite) the backup file. Returns the file id. */
export async function uploadSnapshot(token: string, folderId: string, snap: DwelliumSnapshot): Promise<string> {
    const existing = await findBackupFile(token, folderId);
    const meta = existing ? {} : { name: BACKUP_FILENAME, parents: [folderId] };
    const boundary = 'dwellium-' + Math.random().toString(36).slice(2);
    const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(snap)}\r\n--${boundary}--`;
    const path = existing
        ? `upload/drive/v3/files/${existing}?uploadType=multipart&fields=id`
        : 'upload/drive/v3/files?uploadType=multipart&fields=id';
    const res = await driveJson(token, path, {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
    });
    return res.id as string;
}

/** Download + parse the backup file; null if none exists yet. */
export async function downloadSnapshot(token: string, folderId: string): Promise<DwelliumSnapshot | null> {
    const fileId = await findBackupFile(token, folderId);
    if (!fileId) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Drive download ${res.status}`);
    return res.json() as Promise<DwelliumSnapshot>;
}
