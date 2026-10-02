/**
 * ShortLinks — "Links & QR" widget over the /api/links proxy (plan 047 phase 2,
 * rebuilt for plan 053 to cover the full daily workflow).
 *
 * The backend answers in one of two modes (`mode` on the list response). The
 * built-in Dwellium shortener is the default and stores only url + key, so in
 * that mode the domain, tag, expiry and key-edit controls and "Mint short
 * links" are hidden (the backend would silently drop them or answer 501) and
 * UTM params are folded into the destination URL client-side. In Dub mode
 * (DUB_API_KEY set) the full form shows: domain, tags, expiry, UTM fields, tag
 * filter, clicks sparkline, "Open in Dub ↗". Always: list with click counts,
 * inline edit that PATCHes only changed fields, confirm-gated archive, copy +
 * QR (client-side when the row has no hosted qrCode), link presets and a
 * printable per-unit QR door sheet (client-side, works with no shortener). A
 * 503 `needsSetup` (OLD backend only) renders a card pointing at the door sheet.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Copy, ExternalLink, Pencil, Printer, QrCode, RefreshCw, X } from 'lucide-react';
import {
    archiveShortLink,
    createLinkTag,
    createShortLink,
    getClicksTimeseries,
    listLinkDomains,
    listLinkTags,
    listShortLinks,
    updateShortLink,
    type ClicksPoint,
    type CreateShortLinkInput,
    type LinkDomain,
    type LinksMode,
    type LinkTag,
    type UpdateShortLinkInput,
    type ShortLink,
} from './shortLinksApi';
import { ANDY_LINK_PRESETS, ANDY_PROPERTIES, presetKey } from './andyLinkPresets';
import { qrDataUri } from '../Scheduling/qr'; // client-side QR — builtin-mode links carry no hosted qrCode URL
import QrDoorSheet from './QrDoorSheet';
import { openWidget } from '../../lib/dwelliumCommands';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { useWidgetMemory } from '../../lib/widgetMemory';
import './ShortLinks.css';

interface OkData {
    mode: LinksMode;
    links: ShortLink[];
    tags: LinkTag[];
    domains: LinkDomain[];
    defaultDomain: string | null;
}

type ViewState =
    | { kind: 'loading' }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; data: OkData };

const URL_RE = /^https?:\/\/\S+$/i;
/** How many rows get an eager sparkline fetch (one /analytics call each). */
const SPARKLINE_ROWS = 8;
const UNAVAILABLE = 'Short links are not available on this backend yet';

/** Local wall-clock `YYYY-MM-DDTHH:mm` (datetime-local value) for an ISO instant. */
export function isoToLocalInput(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Fold utm_* params into the destination URL (built-in mode stores only the URL). */
function withUtm(url: string, utm: Record<string, string>): string {
    const u = new URL(url);
    for (const [k, v] of Object.entries(utm)) u.searchParams.set(k, v);
    return u.toString();
}

function dubDashboardUrl(): string {
    // Direct import.meta.env access on purpose — Vite inlines it at build time
    // and vi.stubEnv only patches that form.
    const ws = import.meta.env.VITE_DUB_WORKSPACE;
    return ws ? `https://app.dub.co/${ws}` : 'https://app.dub.co';
}

function Sparkline({ points }: { points: ClicksPoint[] }) {
    if (points.length < 2) return null;
    const w = 72;
    const h = 18;
    const max = Math.max(...points.map(p => p.clicks), 1);
    const step = w / (points.length - 1);
    const d = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 2 - (p.clicks / max) * (h - 4)).toFixed(1)}`)
        .join(' ');
    return (
        <svg
            className="short-links__spark"
            viewBox={`0 0 ${w} ${h}`}
            width={w}
            height={h}
            role="img"
            aria-label={`Clicks sparkline: ${points.map(p => p.clicks).join(', ')}`}
        >
            <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    );
}

interface EditDraft { url: string; key: string; expiresAt: string; tagNames: string[]; }

/** Only the fields that differ from the link as loaded (an untouched field is never re-sent). */
function editPatch(draft: EditDraft, l: ShortLink): UpdateShortLinkInput {
    const patch: UpdateShortLinkInput = {};
    const key = draft.key.trim();
    const had = (l.tags ?? []).map(t => t.name);
    const was = l.expiresAt ? isoToLocalInput(l.expiresAt) : '';
    if (draft.url.trim() !== l.url) patch.url = draft.url.trim();
    if (key && key !== l.key) patch.key = key;
    if (draft.tagNames.length !== had.length || draft.tagNames.some(n => !had.includes(n))) patch.tagNames = draft.tagNames;
    if (draft.expiresAt !== was) patch.expiresAt = draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null;
    return patch;
}

export default function ShortLinks() {
    usePerUserIdentity();
    const [state, setState] = useState<ViewState>({ kind: 'loading' });
    // Plan 055 phase 2 — the active mode reopens where it was left.
    const [mem, patchMem] = useWidgetMemory('short-links', { mode: 'links' });
    const mode: 'links' | 'sheet' = mem.mode === 'sheet' ? 'sheet' : 'links';
    const setMode = (m: 'links' | 'sheet'): void => patchMem({ mode: m });
    const [showArchived, setShowArchived] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [series, setSeries] = useState<Record<string, ClicksPoint[]>>({});

    // Composer
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const [domain, setDomain] = useState('');
    const [pickedTags, setPickedTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');
    const [expiry, setExpiry] = useState('');
    const [utm, setUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '' });
    const [creating, setCreating] = useState(false);

    // Presets
    const [presetProperty, setPresetProperty] = useState(ANDY_PROPERTIES[0].id);

    // Row state
    const [qrFor, setQrFor] = useState<string | null>(null);
    const [filterTag, setFilterTag] = useState('');
    const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<EditDraft>({ url: '', key: '', expiresAt: '', tagNames: [] });
    const [saving, setSaving] = useState(false);
    // Built-in mode stores only url + key; the Dub-only controls render when this is true.
    const dub = state.kind === 'ok' && state.data.mode === 'dub';

    // Latest-wins guard: an older refresh response must never overwrite a newer one.
    const refreshSeq = useRef(0);
    const refresh = useCallback(async (archived = showArchived) => {
        const seq = ++refreshSeq.current;
        // Keep an already-rendered list (and the composer / open edit form) mounted while re-fetching.
        setState(s => (s.kind === 'ok' ? s : { kind: 'loading' }));
        setConfirmArchiveId(null);
        const r = await listShortLinks(archived);
        if (seq !== refreshSeq.current) return;
        if (r.kind !== 'ok') {
            setState(r.kind === 'needs-setup' ? { kind: 'needs-setup' } : { kind: 'error', message: r.message });
            return;
        }
        const { links, mode } = r.data;
        // Tags + domains are Dub-only and best-effort — the link list must render without them.
        const [tagsR, domainsR] = mode === 'dub' ? await Promise.all([listLinkTags(), listLinkDomains()]) : [null, null];
        if (seq !== refreshSeq.current) return;
        setEditingId(cur => (cur && links.some(l => l.id === cur) ? cur : null));
        setState({
            kind: 'ok',
            data: {
                mode,
                links,
                tags: tagsR?.kind === 'ok' ? tagsR.data : [],
                domains: domainsR?.kind === 'ok' ? domainsR.data.domains : [],
                defaultDomain: domainsR?.kind === 'ok' ? domainsR.data.defaultDomain : null,
            },
        });
    }, [showArchived]);

    useEffect(() => { void refresh(); }, [refresh]);

    // Eager sparkline fetch for the first clicked links (one analytics call per row).
    useEffect(() => {
        // ponytail: Dub only — the built-in timeseries is always [] until plan 077 step 3.2 adds a click log.
        if (state.kind !== 'ok' || state.data.mode !== 'dub') return;
        const wanted = state.data.links.filter(l => l.clicks > 0 && !(l.id in series)).slice(0, SPARKLINE_ROWS);
        if (wanted.length === 0) return;
        let cancelled = false;
        void Promise.all(wanted.map(async l => [l.id, await getClicksTimeseries(l.id)] as const)).then(results => {
            if (cancelled) return;
            setSeries(prev => {
                const next = { ...prev };
                for (const [id, r] of results) next[id] = r.kind === 'ok' ? r.data : [];
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [state, series]);

    /** Resolves true when the link was created (callers reset their own draft on success). */
    const create = async (input: CreateShortLinkInput, label?: string): Promise<boolean> => {
        setCreating(true);
        setNotice(null);
        const r = await createShortLink(input);
        setCreating(false);
        if (r.kind === 'ok') {
            setNotice(`Created ${r.data?.shortLink ?? label ?? 'link'}`);
            void refresh();
            return true;
        }
        if (r.kind === 'needs-setup') setState({ kind: 'needs-setup' });
        else setNotice(r.message);
        return false;
    };

    const submitComposer = async () => {
        if (!URL_RE.test(url.trim())) return;
        const utmSet = Object.fromEntries(Object.entries(utm).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
        let input: CreateShortLinkInput;
        if (dub) {
            input = {
                url: url.trim(),
                ...(key.trim() ? { key: key.trim() } : {}),
                ...(domain ? { domain } : {}),
                ...(pickedTags.length ? { tagNames: pickedTags } : {}),
                ...(expiry ? { expiresAt: new Date(expiry).toISOString() } : {}),
                ...utmSet,
            };
        } else {
            // Built-in stores only url + key — carry the UTM params inside the destination itself.
            try {
                input = { url: Object.keys(utmSet).length ? withUtm(url.trim(), utmSet) : url.trim(), ...(key.trim() ? { key: key.trim() } : {}) };
            } catch {
                setNotice('A valid http(s) url is required');
                return;
            }
        }
        if (await create(input)) {
            setUrl(''); setKey(''); setExpiry('');
            setUtm({ utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '' });
        }
    };

    const applyPreset = (presetId: string) => {
        const property = ANDY_PROPERTIES.find(p => p.id === presetProperty) ?? ANDY_PROPERTIES[0];
        const preset = ANDY_LINK_PRESETS.find(p => p.id === presetId);
        if (!preset) return;
        void create(
            { url: preset.url, key: presetKey(property, preset), ...(dub ? { tagNames: [property.tag, preset.kindTag] } : {}) },
            preset.label,
        );
    };

    const addTag = async () => {
        const name = newTag.trim();
        if (!name) return;
        const r = await createLinkTag(name);
        if (r.kind === 'ok') {
            setNewTag('');
            setPickedTags(t => (t.includes(name) ? t : [...t, name]));
            void refresh();
        } else {
            setNotice(r.kind === 'needs-setup' ? UNAVAILABLE : r.message);
        }
    };

    const startEdit = (l: ShortLink) => {
        setConfirmArchiveId(null);
        setEditingId(l.id);
        setDraft({
            url: l.url,
            key: l.key,
            expiresAt: l.expiresAt ? isoToLocalInput(l.expiresAt) : '',
            tagNames: (l.tags ?? []).map(t => t.name),
        });
    };

    const saveEdit = async (l: ShortLink) => {
        if (!URL_RE.test(draft.url.trim())) { setNotice('A valid http(s) url is required'); return; }
        const patch = editPatch(draft, l);
        if (Object.keys(patch).length === 0) { setEditingId(null); return; }
        setSaving(true);
        setNotice(null);
        const r = await updateShortLink(l.id, patch);
        setSaving(false);
        if (r.kind === 'ok') {
            setNotice(`Updated ${r.data?.shortLink ?? l.shortLink}`);
            setEditingId(null);
            void refresh();
        } else {
            setNotice(r.kind === 'needs-setup' ? UNAVAILABLE : r.message);
        }
    };

    const archive = async (l: ShortLink, archived: boolean) => {
        setNotice(null);
        const r = await archiveShortLink(l.id, archived);
        if (r.kind === 'ok') {
            setNotice(`${archived ? 'Archived' : 'Unarchived'} ${l.shortLink}`);
            void refresh();
        } else {
            setNotice(r.kind === 'needs-setup' ? UNAVAILABLE : r.message);
        }
        setConfirmArchiveId(null);
    };

    const copy = (text: string) => {
        void navigator.clipboard?.writeText(text);
        setNotice(`Copied ${text}`);
    };

    if (mode === 'sheet') {
        return (
            <div className="short-links">
                <QrDoorSheet configured={dub} onBack={() => setMode('links')} />
            </div>
        );
    }

    const visibleLinks = state.kind === 'ok'
        ? state.data.links.filter(l => !filterTag || (l.tags ?? []).some(t => t.name === filterTag))
        : [];

    return (
        <div className="short-links">
            <div className="short-links__head">
                <h2 className="short-links__title"><QrCode size={16} aria-hidden /> Links &amp; QR</h2>
                <div className="short-links__head-actions">
                    <button className="short-links__btn short-links__btn--ghost" onClick={() => setMode('sheet')} aria-label="QR door sheet">
                        <Printer size={14} aria-hidden /> Door sheet
                    </button>
                    {dub && (
                        <a
                            className="short-links__btn short-links__btn--ghost"
                            href={dubDashboardUrl()}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open in Dub"
                        >
                            Open in Dub <ExternalLink size={12} aria-hidden />
                        </a>
                    )}
                    <button className="short-links__btn short-links__btn--ghost" onClick={() => void refresh()} aria-label="Refresh short links">
                        <RefreshCw size={14} aria-hidden />
                    </button>
                </div>
            </div>

            {state.kind === 'loading' && <p className="short-links__muted">Loading links…</p>}

            {state.kind === 'needs-setup' && (
                <div className="short-links__empty" data-state="needs-setup">
                    <QrCode size={28} aria-hidden />
                    <h3>QR codes work now — no account needed</h3>
                    <p>
                        Short links need a backend update before they work here. The <b>QR door
                        sheet</b> works now: it prints per-unit QR codes for any destination with
                        no setup, right here.
                    </p>
                    <div className="short-links__head-actions">
                        <button className="short-links__btn" onClick={() => setMode('sheet')}>Open the QR door sheet</button>
                        <button className="short-links__btn short-links__btn--ghost" onClick={() => openWidget('tools-hub')}>Tools hub</button>
                    </div>
                </div>
            )}

            {state.kind === 'error' && (
                <div className="short-links__empty" data-state="error">
                    <h3>Backend unavailable</h3>
                    <p>{state.message}</p>
                    <button className="short-links__btn" onClick={() => void refresh()}>Retry</button>
                </div>
            )}

            {state.kind === 'ok' && (
                <>
                    <section className="short-links__presets" aria-label="Link presets">
                        <select
                            className="short-links__input short-links__input--key"
                            value={presetProperty}
                            onChange={e => setPresetProperty(e.target.value)}
                            aria-label="Preset property"
                        >
                            {ANDY_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {ANDY_LINK_PRESETS.map(p => (
                            <button
                                key={p.id}
                                className="short-links__btn short-links__btn--ghost"
                                disabled={creating}
                                onClick={() => applyPreset(p.id)}
                            >
                                + {p.label}
                            </button>
                        ))}
                    </section>

                    <section className="short-links__composer" aria-label="New link">
                        <div className="short-links__form">
                            <input
                                className="short-links__input"
                                placeholder="https:// destination URL"
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                aria-label="Destination URL"
                            />
                            <input
                                className="short-links__input short-links__input--key"
                                placeholder="custom key (optional)"
                                value={key}
                                onChange={e => setKey(e.target.value)}
                                aria-label="Custom key"
                            />
                            {dub && state.data.domains.length > 0 && (
                                <select
                                    className="short-links__input short-links__input--key"
                                    value={domain}
                                    onChange={e => setDomain(e.target.value)}
                                    aria-label="Domain"
                                >
                                    <option value="">
                                        {state.data.defaultDomain ? `${state.data.defaultDomain} (default)` : 'workspace default domain'}
                                    </option>
                                    {state.data.domains.filter(d => !d.archived).map(d => (
                                        <option key={d.slug} value={d.slug}>{d.slug}{d.primary ? ' (primary)' : ''}</option>
                                    ))}
                                </select>
                            )}
                            {dub && (
                                <input
                                    className="short-links__input short-links__input--key"
                                    type="datetime-local"
                                    value={expiry}
                                    onChange={e => setExpiry(e.target.value)}
                                    aria-label="Expires at"
                                    title="Link expiry (optional)"
                                />
                            )}
                            <button
                                className="short-links__btn"
                                disabled={creating || !URL_RE.test(url.trim())}
                                onClick={() => void submitComposer()}
                            >
                                {creating ? 'Creating…' : 'Create link'}
                            </button>
                        </div>
                        <div className="short-links__form short-links__form--extras">
                            {dub && (
                                <details className="short-links__details">
                                    <summary>Tags{pickedTags.length ? ` (${pickedTags.length})` : ''}</summary>
                                    <div className="short-links__tag-picker">
                                        {state.data.tags.map(t => (
                                            <label key={t.id} className="short-links__tag-option">
                                                <input
                                                    type="checkbox"
                                                    checked={pickedTags.includes(t.name)}
                                                    onChange={e => setPickedTags(cur => e.target.checked
                                                        ? [...cur, t.name]
                                                        : cur.filter(n => n !== t.name))}
                                                />
                                                {t.name}
                                            </label>
                                        ))}
                                        <span className="short-links__tag-new">
                                            <input
                                                className="short-links__input short-links__input--key"
                                                placeholder="new tag"
                                                value={newTag}
                                                onChange={e => setNewTag(e.target.value)}
                                                aria-label="New tag name"
                                            />
                                            <button className="short-links__btn short-links__btn--ghost" disabled={!newTag.trim()} onClick={() => void addTag()}>
                                                Add tag
                                            </button>
                                        </span>
                                    </div>
                                </details>
                            )}
                            <details className="short-links__details">
                                <summary>UTM builder</summary>
                                <div className="short-links__tag-picker">
                                    {(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const).map(f => (
                                        <input
                                            key={f}
                                            className="short-links__input short-links__input--key"
                                            placeholder={f}
                                            value={utm[f]}
                                            onChange={e => setUtm(u => ({ ...u, [f]: e.target.value }))}
                                            aria-label={f}
                                        />
                                    ))}
                                </div>
                            </details>
                        </div>
                        {notice && <p className="short-links__notice">{notice}</p>}
                    </section>

                    <div className="short-links__filters">
                        {dub && (
                            <select
                                className="short-links__input short-links__input--key"
                                value={filterTag}
                                onChange={e => setFilterTag(e.target.value)}
                                aria-label="Filter by tag"
                            >
                                <option value="">All tags</option>
                                {state.data.tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                        )}
                        <label className="short-links__tag-option">
                            <input
                                type="checkbox"
                                checked={showArchived}
                                onChange={e => { setShowArchived(e.target.checked); }}
                            />
                            Show archived
                        </label>
                    </div>

                    {visibleLinks.length === 0
                        ? (
                            <div className="short-links__empty" data-state="none-yet">
                                <h3>No links{filterTag ? ` tagged ${filterTag}` : ' yet'}</h3>
                                <p>Shorten a Tenant Portal or published-doc URL above, then print its QR.</p>
                            </div>
                        )
                        : (
                            <table className="short-links__table">
                                <thead>
                                    <tr><th>Short link</th><th>Destination</th>{dub && <th>Tags</th>}<th>Clicks</th><th aria-label="Actions" /></tr>
                                </thead>
                                <tbody>
                                    {visibleLinks.map(l => (
                                        <tr key={l.id} data-archived={l.archived || undefined}>
                                            <td className="short-links__short">{l.shortLink}{l.archived ? ' (archived)' : ''}</td>
                                            <td className="short-links__dest" title={l.url}>{l.url}</td>
                                            {dub && (
                                                <td>
                                                    {(l.tags ?? []).map(t => (
                                                        <span key={t.id} className="short-links__chip">{t.name}</span>
                                                    ))}
                                                </td>
                                            )}
                                            <td className="short-links__clicks">
                                                {l.clicks}
                                                {series[l.id] && <Sparkline points={series[l.id]} />}
                                            </td>
                                            <td className="short-links__actions">
                                                <button className="short-links__btn short-links__btn--ghost" onClick={() => copy(l.shortLink)} aria-label={`Copy ${l.shortLink}`}>
                                                    <Copy size={13} aria-hidden />
                                                </button>
                                                <button
                                                    className="short-links__btn short-links__btn--ghost"
                                                    onClick={() => setQrFor(qrFor === l.id ? null : l.id)}
                                                    aria-label={`Show QR for ${l.shortLink}`}
                                                >
                                                    <QrCode size={13} aria-hidden />
                                                </button>
                                                <button
                                                    className="short-links__btn short-links__btn--ghost"
                                                    onClick={() => (editingId === l.id ? setEditingId(null) : startEdit(l))}
                                                    aria-label={`Edit ${l.shortLink}`}
                                                >
                                                    <Pencil size={13} aria-hidden />
                                                </button>
                                                {l.archived
                                                    ? (
                                                        <button
                                                            className="short-links__btn short-links__btn--ghost"
                                                            onClick={() => void archive(l, false)}
                                                            aria-label={`Unarchive ${l.shortLink}`}
                                                        >
                                                            <ArchiveRestore size={13} aria-hidden />
                                                        </button>
                                                    )
                                                    : confirmArchiveId === l.id
                                                        ? (
                                                            <span className="short-links__confirm">
                                                                <button className="short-links__btn" onClick={() => void archive(l, true)}>
                                                                    Confirm archive
                                                                </button>
                                                                <button className="short-links__btn short-links__btn--ghost" onClick={() => setConfirmArchiveId(null)} aria-label="Cancel archive">
                                                                    <X size={13} aria-hidden />
                                                                </button>
                                                            </span>
                                                        )
                                                        : (
                                                            <button
                                                                className="short-links__btn short-links__btn--ghost"
                                                                onClick={() => { setConfirmArchiveId(l.id); setEditingId(null); }}
                                                                aria-label={`Archive ${l.shortLink}`}
                                                            >
                                                                <Archive size={13} aria-hidden />
                                                            </button>
                                                        )}
                                                {qrFor === l.id && (
                                                    // Builtin-mode rows carry no hosted qrCode URL — render the same client-side QR the door sheet uses.
                                                    <img className="short-links__qr" src={l.qrCode || qrDataUri(l.shortLink) || undefined} alt={`QR code for ${l.shortLink}`} width={120} height={120} />
                                                )}
                                                {editingId === l.id && (
                                                    <div className="short-links__edit" aria-label={`Edit form for ${l.shortLink}`}>
                                                        <input
                                                            className="short-links__input"
                                                            value={draft.url}
                                                            onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                                                            aria-label="Edit destination URL"
                                                        />
                                                        {dub && (
                                                            <>
                                                                <input
                                                                    className="short-links__input short-links__input--key"
                                                                    value={draft.key}
                                                                    onChange={e => setDraft(d => ({ ...d, key: e.target.value }))}
                                                                    aria-label="Edit key"
                                                                />
                                                                <input
                                                                    className="short-links__input short-links__input--key"
                                                                    type="datetime-local"
                                                                    value={draft.expiresAt}
                                                                    onChange={e => setDraft(d => ({ ...d, expiresAt: e.target.value }))}
                                                                    aria-label="Edit expiry"
                                                                />
                                                                <div className="short-links__tag-picker">
                                                                    {state.data.tags.map(t => (
                                                                        <label key={t.id} className="short-links__tag-option">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={draft.tagNames.includes(t.name)}
                                                                                onChange={e => setDraft(d => ({
                                                                                    ...d,
                                                                                    tagNames: e.target.checked
                                                                                        ? [...d.tagNames, t.name]
                                                                                        : d.tagNames.filter(n => n !== t.name),
                                                                                }))}
                                                                            />
                                                                            {t.name}
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        )}
                                                        <button className="short-links__btn" disabled={saving} onClick={() => void saveEdit(l)}>
                                                            {saving ? 'Saving…' : 'Save'}
                                                        </button>
                                                        <button className="short-links__btn short-links__btn--ghost" onClick={() => setEditingId(null)}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                </>
            )}
        </div>
    );
}
