/**
 * PhotoVault — plan 047 phase 2 + plan 053 (100 %): Immich photo/video vault.
 *
 * Zero-cost addendum (2026-08-20): Immich runs unmodified on the always-on
 * office Mac (Docker Desktop), tailnet URL in `VITE_IMMICH_URL`.
 *
 * Plan 053: four tabs —
 *   - Immich  : the full Immich web UI in an iframe (LangFlowPanel reachability
 *               pattern — never a blank iframe, gate G2; states: env unset →
 *               "Connect Immich" card / ping fails → Tailscale card / up → iframe).
 *   - Albums  : native album browser via the backend proxy (/api/photos/*),
 *               grouped by property per the "<Property> — <Unit>" naming
 *               convention, thumbnails through the proxy, plus smart/metadata
 *               search. Backend keeps the Immich API key server-side.
 *   - Upload  : drag-drop → pick property/unit → creates/reuses the unit album,
 *               per-file progress and errors.
 *   - Share   : create an album shared link with expiry + copy; honest note
 *               that off-tailnet the link needs Tailscale Funnel on the Mac.
 *
 * Native tabs have their own honest states: backend env unset → needs-setup
 * card (IMMICH_URL + IMMICH_API_KEY); Immich unreachable → retry; ready →
 * the real thing. Strata Maintenance/Inspections deep-link here through
 * photoVaultBridge (preset bus: tab + property + unit).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, FolderOpen, Image as ImageIcon, Link2, RefreshCw, Search, Upload as UploadIcon } from 'lucide-react';
import { openWidget } from '../../lib/dwelliumCommands';
import {
    albumNameFor, createSharedLink, ensureAlbum, fetchThumbnail, getAlbum, getPhotosStatus,
    listAlbums, listSharedLinks, parseAlbumName, searchPhotos, uploadAsset,
    type PhotoAlbum, type PhotoAlbumDetail, type PhotoAsset, type PhotoSharedLink, type ProxyStatus,
} from './photoVaultApi';
import { photoVaultPresetBus, type PhotoVaultPreset } from './photoVaultBridge';
import './PhotoVault.css';

type Reach = 'checking' | 'up' | 'down';
type Tab = 'immich' | 'albums' | 'upload' | 'share';

/** Andy's Georgia multifamily portfolio — seeds the property pickers even before the first album exists. */
export const ANDY_PROPERTIES = ['Woodland Parc Townhomes', 'Riverwood Club Apartments'] as const;

const EXPIRY_CHOICES = [
    { label: 'Never expires', days: 0 },
    { label: '1 day', days: 1 },
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
] as const;

// ── Shared bits ─────────────────────────────────────────────────────────────

function Thumb({ assetId, alt }: { assetId?: string | null; alt: string }) {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        let on = true;
        setSrc(null);
        if (assetId) void fetchThumbnail(assetId).then(u => { if (on) setSrc(u); });
        return () => { on = false; };
    }, [assetId]);
    return src
        ? <img className="pv__thumb-img" src={src} alt={alt} loading="lazy" />
        : <div className="pv__thumb-ph" role="img" aria-label={alt}><ImageIcon size={18} aria-hidden /></div>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            className="pv__btn pv__btn--ghost"
            aria-label={label}
            onClick={() => {
                void navigator.clipboard?.writeText(value);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
        >
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

/** Gate for the native tabs: needs-setup / unreachable / ready — never blank. */
function ProxyGate({ status, onRetry, children }: { status: 'checking' | ProxyStatus; onRetry: () => void; children: React.ReactNode }) {
    if (status === 'checking') {
        return <div className="pv__empty" data-state="checking"><RefreshCw size={20} aria-hidden /><p>Checking Photo Vault…</p></div>;
    }
    if (status === 'needs-setup') {
        return (
            <div className="pv__empty" data-state="proxy-needs-setup">
                <ImageIcon size={28} aria-hidden />
                <h3>Connect the Photo Vault backend</h3>
                <p>
                    Albums, uploads and shared links go through the Dwellium backend so the
                    Immich API key never reaches the browser. Create an API key in Immich
                    (Account settings → API Keys, <code>tools/immich/README.md</code> step 5),
                    then set <code>IMMICH_URL</code> and <code>IMMICH_API_KEY</code> on the
                    backend — this tab flips to the live library automatically.
                </p>
                <button className="pv__btn" onClick={() => openWidget('tools-hub')}>Open Tools hub</button>
            </div>
        );
    }
    if (status === 'unreachable') {
        return (
            <div className="pv__empty" data-state="proxy-unreachable">
                <ImageIcon size={28} aria-hidden />
                <h3>Photo Vault isn’t reachable</h3>
                <p>
                    The backend couldn’t reach Immich on the office Mac. The Mac may be
                    asleep, Docker stopped, or the URL not publicly reachable yet
                    (<code>tools/immich/README.md</code> has the fixes, incl. Tailscale Funnel).
                </p>
                <button className="pv__btn" onClick={onRetry}>Retry</button>
            </div>
        );
    }
    return <>{children}</>;
}

// ── Albums tab ──────────────────────────────────────────────────────────────

function AlbumsTab({ preset }: { preset: PhotoVaultPreset | null }) {
    const [albums, setAlbums] = useState<PhotoAlbum[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<PhotoAlbumDetail | null>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<{ mode: string; assets: PhotoAsset[] } | null>(null);
    const [searching, setSearching] = useState(false);
    const autoOpened = useRef(false);

    const load = useCallback(async () => {
        setError(null);
        const r = await listAlbums();
        if (r.kind === 'ok') setAlbums(r.data);
        else setError(r.kind === 'needs-setup' ? 'Backend not configured' : r.message);
    }, []);
    useEffect(() => { void load(); }, [load]);

    const openAlbum = useCallback(async (id: string) => {
        const r = await getAlbum(id);
        if (r.kind === 'ok') setOpen(r.data);
        else setError(r.kind === 'needs-setup' ? 'Backend not configured' : r.message);
    }, []);

    // Strata bridge: auto-open the preset unit's album once the list is in.
    useEffect(() => {
        if (!albums || !preset?.property || autoOpened.current) return;
        autoOpened.current = true;
        // Exact match only — auto-opening a SIBLING unit's album would be misleading.
        const wanted = albumNameFor(preset.property, preset.unit);
        const hit = albums.find(a => a.albumName === wanted) || null;
        if (hit) void openAlbum(hit.id);
    }, [albums, preset, openAlbum]);

    const groups = useMemo(() => {
        const map = new Map<string, PhotoAlbum[]>();
        for (const a of albums ?? []) {
            const { property } = parseAlbumName(a.albumName);
            const key = property || 'Other albums';
            map.set(key, [...(map.get(key) ?? []), a]);
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [albums]);

    const runSearch = async () => {
        const q = query.trim();
        if (!q) { setResults(null); return; }
        setSearching(true);
        const r = await searchPhotos(q);
        setSearching(false);
        if (r.kind === 'ok') setResults(r.data);
        else setError(r.kind === 'needs-setup' ? 'Backend not configured' : r.message);
    };

    if (error) {
        return (
            <div className="pv__empty" data-state="albums-error">
                <ImageIcon size={24} aria-hidden />
                <p>{error}</p>
                <button className="pv__btn" onClick={() => { setError(null); void load(); }}>Retry</button>
            </div>
        );
    }
    if (!albums) return <div className="pv__empty" data-state="albums-loading"><p>Loading albums…</p></div>;

    if (open) {
        return (
            <div className="pv__pane" data-state="album-open">
                <div className="pv__pane-head">
                    <button className="pv__btn pv__btn--ghost" onClick={() => setOpen(null)}>← Albums</button>
                    <h4>{open.albumName}</h4>
                    <span className="pv__muted">{open.assets?.length ?? open.assetCount ?? 0} photos</span>
                </div>
                {(open.assets?.length ?? 0) === 0 ? (
                    <div className="pv__empty" data-state="album-empty"><p>No photos in this album yet — use the Upload tab.</p></div>
                ) : (
                    <div className="pv__grid">
                        {open.assets!.map(a => (
                            <figure key={a.id} className="pv__cell">
                                <Thumb assetId={a.id} alt={a.originalFileName || 'photo'} />
                                <figcaption title={a.originalFileName}>{a.originalFileName || a.id.slice(0, 8)}</figcaption>
                            </figure>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="pv__pane" data-state="albums">
            <div className="pv__search-row">
                <Search size={14} aria-hidden />
                <input
                    className="pv__input"
                    placeholder="Search photos (e.g. “water damage”)"
                    aria-label="Search photos"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void runSearch(); }}
                />
                <button className="pv__btn" onClick={() => void runSearch()} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
            </div>
            {results && (
                <div className="pv__pane-section" data-state="search-results">
                    <div className="pv__pane-head">
                        <h4>Results</h4>
                        <span className="pv__muted">
                            {results.assets.length} match{results.assets.length === 1 ? '' : 'es'} · {results.mode === 'smart' ? 'smart search' : 'filename search (enable ML for smart search — tools/immich/README.md)'}
                        </span>
                        <button className="pv__btn pv__btn--ghost" onClick={() => { setResults(null); setQuery(''); }}>Clear</button>
                    </div>
                    <div className="pv__grid">
                        {results.assets.map(a => (
                            <figure key={a.id} className="pv__cell">
                                <Thumb assetId={a.id} alt={a.originalFileName || 'photo'} />
                                <figcaption title={a.originalFileName}>{a.originalFileName || a.id.slice(0, 8)}</figcaption>
                            </figure>
                        ))}
                    </div>
                </div>
            )}
            {preset?.property && albums.every(a => a.albumName !== albumNameFor(preset.property!, preset.unit)) && (
                <p className="pv__hint" data-state="preset-no-album">
                    No album yet for <strong>{albumNameFor(preset.property, preset.unit)}</strong> — the Upload tab creates it with the first photo.
                </p>
            )}
            {groups.length === 0 && !results && (
                <div className="pv__empty" data-state="albums-empty">
                    <FolderOpen size={24} aria-hidden />
                    <p>No albums yet. Upload the first inspection or before/after photos — albums are created per unit as “Property — Unit”.</p>
                </div>
            )}
            {groups.map(([property, list]) => (
                <div key={property} className="pv__pane-section" data-property={property}>
                    <h4 className="pv__group-title">{property}</h4>
                    <div className="pv__album-row">
                        {list.map(a => (
                            <button key={a.id} className="pv__album-card" onClick={() => void openAlbum(a.id)}>
                                <Thumb assetId={a.albumThumbnailAssetId} alt={a.albumName} />
                                <span className="pv__album-name">{parseAlbumName(a.albumName).unit || a.albumName}</span>
                                <span className="pv__muted">{a.assetCount ?? 0} photos</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Upload tab ──────────────────────────────────────────────────────────────

interface UploadItem { file: File; state: 'pending' | 'uploading' | 'done' | 'error'; message?: string }

function UploadTab({ preset, knownProperties }: { preset: PhotoVaultPreset | null; knownProperties: string[] }) {
    const [property, setProperty] = useState(preset?.property ?? '');
    const [unit, setUnit] = useState(preset?.unit ?? '');
    const [items, setItems] = useState<UploadItem[]>([]);
    const [busy, setBusy] = useState(false);
    const [banner, setBanner] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (preset?.property) setProperty(preset.property);
        if (preset?.unit) setUnit(preset.unit);
    }, [preset]);

    const addFiles = (files: FileList | File[] | null) => {
        if (!files) return;
        const next = [...files].map(file => ({ file, state: 'pending' as const }));
        if (next.length) setItems(prev => [...prev, ...next]);
    };

    const start = async () => {
        if (!property.trim() || items.length === 0 || busy) return;
        setBusy(true);
        setBanner(null);
        const album = await ensureAlbum(property.trim(), unit.trim() || undefined);
        if (album.kind !== 'ok') {
            setBanner(album.kind === 'needs-setup' ? 'Backend not configured — set IMMICH_URL + IMMICH_API_KEY.' : album.message);
            setBusy(false);
            return;
        }
        for (let i = 0; i < items.length; i += 1) {
            if (items[i].state === 'done') continue;
            setItems(prev => prev.map((it, j) => (j === i ? { ...it, state: 'uploading' } : it)));
            // Sequential on purpose: the office Mac's disk + a phone-grade tailnet
            // link do better with one stream than six. ponytail: parallelize if slow.
            const r = await uploadAsset(items[i].file, album.data.id);
            setItems(prev => prev.map((it, j) => (
                j === i ? (r.kind === 'ok' ? { ...it, state: 'done' } : { ...it, state: 'error', message: r.kind === 'needs-setup' ? 'Backend not configured' : r.message }) : it
            )));
        }
        setBusy(false);
    };

    const done = items.filter(i => i.state === 'done').length;
    const albumName = property.trim() ? albumNameFor(property.trim(), unit.trim() || undefined) : null;

    return (
        <div className="pv__pane" data-state="upload">
            <div className="pv__form-row">
                <label className="pv__label">
                    Property
                    <input
                        className="pv__input" list="pv-properties" value={property} aria-label="Property"
                        placeholder="Woodland Parc Townhomes" onChange={e => setProperty(e.target.value)}
                    />
                    <datalist id="pv-properties">
                        {knownProperties.map(p => <option key={p} value={p} />)}
                    </datalist>
                </label>
                <label className="pv__label">
                    Unit
                    <input className="pv__input" value={unit} aria-label="Unit" placeholder="12B" onChange={e => setUnit(e.target.value)} />
                </label>
            </div>
            {albumName && <p className="pv__hint">Photos land in the album <strong>{albumName}</strong> (created if missing).</p>}
            <div
                className={`pv__dropzone${dragOver ? ' pv__dropzone--over' : ''}`}
                data-testid="pv-dropzone"
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer?.files ?? null); }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
            >
                <UploadIcon size={22} aria-hidden />
                <p>Drag photos or videos here, or click to browse</p>
                <input
                    ref={inputRef} type="file" multiple accept="image/*,video/*" hidden
                    aria-label="Choose photos" onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                />
            </div>
            {banner && <p className="pv__error" role="alert">{banner}</p>}
            {items.length > 0 && (
                <>
                    <ul className="pv__upload-list">
                        {items.map((it, i) => (
                            <li key={`${it.file.name}-${i}`} data-state={it.state}>
                                <span className="pv__upload-name" title={it.file.name}>{it.file.name}</span>
                                <span className="pv__upload-state">
                                    {it.state === 'pending' && 'Queued'}
                                    {it.state === 'uploading' && 'Uploading…'}
                                    {it.state === 'done' && '✓ Uploaded'}
                                    {it.state === 'error' && `Failed — ${it.message || 'unknown error'}`}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <div className="pv__actions">
                        <span className="pv__muted" data-testid="pv-upload-progress">{done}/{items.length} uploaded</span>
                        <button className="pv__btn" onClick={() => void start()} disabled={busy || !property.trim()}>
                            {busy ? 'Uploading…' : `Upload ${items.length - done} file${items.length - done === 1 ? '' : 's'}`}
                        </button>
                        <button className="pv__btn pv__btn--ghost" onClick={() => setItems([])} disabled={busy}>Clear</button>
                    </div>
                </>
            )}
        </div>
    );
}

// ── Share tab ───────────────────────────────────────────────────────────────

function ShareTab() {
    const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
    const [links, setLinks] = useState<PhotoSharedLink[] | null>(null);
    const [albumId, setAlbumId] = useState('');
    const [days, setDays] = useState(7);
    const [created, setCreated] = useState<PhotoSharedLink | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const [al, li] = await Promise.all([listAlbums(), listSharedLinks()]);
        if (al.kind === 'ok') setAlbums(al.data);
        if (li.kind === 'ok') setLinks(li.data);
        else if (li.kind === 'error') setError(li.message);
    }, []);
    useEffect(() => { void load(); }, [load]);

    const create = async () => {
        if (!albumId || busy) return;
        setBusy(true);
        setError(null);
        const expiresAt = days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null;
        const r = await createSharedLink(albumId, expiresAt);
        setBusy(false);
        if (r.kind === 'ok') { setCreated(r.data); void load(); }
        else setError(r.kind === 'needs-setup' ? 'Backend not configured — set IMMICH_URL + IMMICH_API_KEY.' : r.message);
    };

    return (
        <div className="pv__pane" data-state="share">
            <div className="pv__form-row">
                <label className="pv__label">
                    Album
                    <select className="pv__input" value={albumId} aria-label="Album to share" onChange={e => setAlbumId(e.target.value)}>
                        <option value="">Choose an album…</option>
                        {albums.map(a => <option key={a.id} value={a.id}>{a.albumName}</option>)}
                    </select>
                </label>
                <label className="pv__label">
                    Expires
                    <select className="pv__input" value={days} aria-label="Link expiry" onChange={e => setDays(Number(e.target.value))}>
                        {EXPIRY_CHOICES.map(c => <option key={c.days} value={c.days}>{c.label}</option>)}
                    </select>
                </label>
                <button className="pv__btn" onClick={() => void create()} disabled={!albumId || busy}>
                    <Link2 size={13} aria-hidden /> {busy ? 'Creating…' : 'Create link'}
                </button>
            </div>
            {error && <p className="pv__error" role="alert">{error}</p>}
            {created?.shareUrl && (
                <div className="pv__share-created" data-testid="pv-share-created">
                    <code className="pv__share-url" title={created.shareUrl}>{created.shareUrl}</code>
                    <CopyButton value={created.shareUrl} label="Copy shared link" />
                </div>
            )}
            <p className="pv__hint">
                Residents and vendors off the tailnet can open these links only once
                <strong> Tailscale Funnel</strong> is enabled on the office Mac
                (<code>tools/immich/README.md</code> §Funnel) — until then they work
                for tailnet devices only.
            </p>
            <div className="pv__pane-section">
                <h4 className="pv__group-title">Existing links</h4>
                {!links && <p className="pv__muted">Loading…</p>}
                {links && links.length === 0 && <p className="pv__muted" data-state="no-links">No shared links yet.</p>}
                {links && links.length > 0 && (
                    <ul className="pv__link-list">
                        {links.map(l => (
                            <li key={l.id}>
                                <span className="pv__upload-name">{l.album?.albumName || l.slug || l.key || l.id}</span>
                                <span className="pv__muted">{l.expiresAt ? `expires ${new Date(l.expiresAt).toLocaleDateString()}` : 'never expires'}</span>
                                {l.shareUrl && <CopyButton value={l.shareUrl} label={`Copy link for ${l.album?.albumName || l.id}`} />}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ── Immich tab (iframe — original widget behavior, unchanged states) ────────

function ImmichFrameTab({ env }: { env?: Record<string, string | undefined> }) {
    const url = env?.VITE_IMMICH_URL?.trim().replace(/\/$/, '') || undefined;
    const [reach, setReach] = useState<Reach>('checking');
    const [iframeKey, setIframeKey] = useState(0);

    // Best-effort reachability: a no-cors fetch resolves if the server answers,
    // rejects on a connection error (off-tailnet, Mac asleep, Docker down).
    const checkReach = useCallback(async (target: string) => {
        setReach('checking');
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 4000);
            await fetch(target, { mode: 'no-cors', signal: ctrl.signal });
            clearTimeout(t);
            setReach('up');
        } catch {
            setReach('down');
        }
    }, []);

    useEffect(() => {
        if (url) void checkReach(url);
    }, [url, iframeKey, checkReach]);

    if (!url) {
        return (
            <div className="pv__empty" data-state="needs-setup">
                <ImageIcon size={28} aria-hidden />
                <h3>Connect Immich</h3>
                <p>
                    Photo Vault stores inspection, move-in/move-out and before/after
                    maintenance photos in a self-hosted Immich on the office Mac.
                    Follow the setup guide in <code>tools/immich/README.md</code>
                    (Docker Desktop + Tailscale), then set <code>VITE_IMMICH_URL</code> —
                    this card flips to the live photo library automatically.
                </p>
                <button className="pv__btn" onClick={() => openWidget('tools-hub')}>Open Tools hub</button>
            </div>
        );
    }

    const dotColor = reach === 'up' ? '#22c55e' : reach === 'down' ? '#ff6b6b' : '#888';
    const dotLabel = reach === 'up' ? 'Reachable' : reach === 'down' ? 'Not reachable' : 'Checking…';

    return (
        <>
            <div className="pv__toolbar">
                <span className="pv__dot" style={{ background: dotColor }} title={dotLabel} />
                <span className="pv__url" title={url}>{url}</span>
                <button className="pv__btn pv__btn--ghost" onClick={() => setIframeKey(k => k + 1)} title="Re-check and reload" aria-label="Re-check and reload Photo Vault">
                    <RefreshCw size={14} aria-hidden />
                </button>
                <a className="pv__link" href={url} target="_blank" rel="noreferrer">
                    Open ↗ <ExternalLink size={12} aria-hidden />
                </a>
            </div>

            <div className="pv__frame-wrap">
                {reach === 'down' ? (
                    <div className="pv__empty" data-state="unreachable">
                        <ImageIcon size={28} aria-hidden />
                        <h3>Photo Vault isn’t reachable</h3>
                        <p>
                            The photo library lives on the office Mac, which only answers from
                            inside the tailnet — <strong>connect to Tailscale to view photos</strong>.
                            Already on it? The Mac may be asleep or Docker stopped
                            (<code>tools/immich/README.md</code> has the fixes).
                        </p>
                        <div className="pv__actions">
                            <button className="pv__btn" onClick={() => checkReach(url)}>Re-check</button>
                            <button className="pv__btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open ↗</button>
                        </div>
                    </div>
                ) : (
                    <iframe
                        key={iframeKey}
                        className="pv__frame"
                        src={url}
                        title="Photo Vault"
                        allow="clipboard-read; clipboard-write; fullscreen"
                    />
                )}
            </div>
        </>
    );
}

// ── Widget shell ────────────────────────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'immich', label: 'Immich' },
    { id: 'albums', label: 'Albums' },
    { id: 'upload', label: 'Upload' },
    { id: 'share', label: 'Share' },
];

// Injectable env with an import.meta.env default — same pattern as
// ToolsHub::toolStatuses, so tests pass env as a prop instead of stubbing.
export default function PhotoVault({
    env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env,
}: { env?: Record<string, string | undefined> } = {}) {
    const [tab, setTab] = useState<Tab>('immich');
    const [preset, setPreset] = useState<PhotoVaultPreset | null>(null);
    const [proxyStatus, setProxyStatus] = useState<'checking' | ProxyStatus>('checking');
    const proxyChecked = useRef(false);
    const [knownProperties, setKnownProperties] = useState<string[]>([...ANDY_PROPERTIES]);

    // Strata bridge: consume a pending preset (emitted before mount) + live ones.
    useEffect(() => {
        const apply = (p: PhotoVaultPreset) => {
            setPreset(p);
            setTab(p.tab);
        };
        const pending = photoVaultPresetBus.consume();
        if (pending) apply(pending);
        return photoVaultPresetBus.on(apply);
    }, []);

    const checkProxy = useCallback(async () => {
        setProxyStatus('checking');
        const status = await getPhotosStatus();
        setProxyStatus(status);
        if (status === 'ready') {
            const r = await listAlbums();
            if (r.kind === 'ok') {
                const props = new Set<string>(ANDY_PROPERTIES);
                for (const a of r.data) props.add(parseAlbumName(a.albumName).property);
                setKnownProperties([...props].sort());
            }
        }
    }, []);

    // Native tabs only hit the backend once one of them is active (keeps the
    // iframe tab's behavior byte-identical to the plan-047 widget).
    useEffect(() => {
        if (tab !== 'immich' && !proxyChecked.current) {
            proxyChecked.current = true;
            void checkProxy();
        }
    }, [tab, checkProxy]);

    return (
        <div className="pv">
            <div className="pv__tabs" role="tablist" aria-label="Photo Vault views">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        className={`pv__tab${tab === t.id ? ' pv__tab--active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            {tab === 'immich' && <ImmichFrameTab env={env} />}
            {tab !== 'immich' && (
                <ProxyGate status={proxyStatus} onRetry={() => void checkProxy()}>
                    {tab === 'albums' && <AlbumsTab preset={preset} />}
                    {tab === 'upload' && <UploadTab preset={preset} knownProperties={knownProperties} />}
                    {tab === 'share' && <ShareTab />}
                </ProxyGate>
            )}
        </div>
    );
}
