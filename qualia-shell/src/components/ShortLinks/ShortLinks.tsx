/**
 * ShortLinks — "Links & QR" widget over the Dub proxy (plan 047 phase 2,
 * rebuilt for plan 053 to cover the full daily workflow).
 *
 * Create (url + key + domain + tags + UTM + expiry), list with per-link click
 * counts and a clicks sparkline (Dub /analytics timeseries), inline edit,
 * confirm-gated archive, tag filter, copy + QR, Andy's one-click presets
 * (andyLinkPresets.ts), a printable per-unit QR door sheet (client-side, works
 * without Dub) and an "Open in Dub ↗" deep link. While the backend has no
 * DUB_API_KEY (503) it renders an honest "Connect Dub" card — NOTE: Dub's
 * pricing page currently lists no free plan; check current pricing first.
 */
import { useCallback, useEffect, useState } from 'react';
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
    type LinkTag,
    type ShortLink,
} from './shortLinksApi';
import { ANDY_LINK_PRESETS, ANDY_PROPERTIES, presetKey } from './andyLinkPresets';
import QrDoorSheet from './QrDoorSheet';
import { openWidget } from '../../lib/dwelliumCommands';
import './ShortLinks.css';

interface OkData {
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

export default function ShortLinks() {
    const [state, setState] = useState<ViewState>({ kind: 'loading' });
    const [mode, setMode] = useState<'links' | 'sheet'>('links');
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

    const refresh = useCallback(async (archived = showArchived) => {
        setState({ kind: 'loading' });
        setConfirmArchiveId(null);
        setEditingId(null);
        const r = await listShortLinks(archived);
        if (r.kind !== 'ok') {
            setState(r.kind === 'needs-setup' ? { kind: 'needs-setup' } : { kind: 'error', message: r.message });
            return;
        }
        // Tags + domains are best-effort — the link list must render without them.
        const [tagsR, domainsR] = await Promise.all([listLinkTags(), listLinkDomains()]);
        setState({
            kind: 'ok',
            data: {
                links: r.data,
                tags: tagsR.kind === 'ok' ? tagsR.data : [],
                domains: domainsR.kind === 'ok' ? domainsR.data.domains : [],
                defaultDomain: domainsR.kind === 'ok' ? domainsR.data.defaultDomain : null,
            },
        });
    }, [showArchived]);

    useEffect(() => { void refresh(); }, [refresh]);

    // Eager sparkline fetch for the first clicked links (one analytics call per row).
    useEffect(() => {
        if (state.kind !== 'ok') return;
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

    const create = async (input: CreateShortLinkInput, label?: string) => {
        setCreating(true);
        setNotice(null);
        const r = await createShortLink(input);
        setCreating(false);
        if (r.kind === 'ok') {
            setNotice(`Created ${r.data?.shortLink ?? label ?? 'link'}`);
            setUrl(''); setKey(''); setExpiry('');
            setUtm({ utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '' });
            void refresh();
        } else if (r.kind === 'needs-setup') {
            setState({ kind: 'needs-setup' });
        } else {
            setNotice(r.message);
        }
    };

    const submitComposer = () => {
        if (!URL_RE.test(url.trim())) return;
        void create({
            url: url.trim(),
            ...(key.trim() ? { key: key.trim() } : {}),
            ...(domain ? { domain } : {}),
            ...(pickedTags.length ? { tagNames: pickedTags } : {}),
            ...(expiry ? { expiresAt: new Date(expiry).toISOString() } : {}),
            ...Object.fromEntries(Object.entries(utm).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])),
        });
    };

    const applyPreset = (presetId: string) => {
        const property = ANDY_PROPERTIES.find(p => p.id === presetProperty) ?? ANDY_PROPERTIES[0];
        const preset = ANDY_LINK_PRESETS.find(p => p.id === presetId);
        if (!preset) return;
        void create(
            { url: preset.url, key: presetKey(property, preset), tagNames: [property.tag, preset.kindTag] },
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
            setNotice(r.kind === 'needs-setup' ? 'Dub is not configured' : r.message);
        }
    };

    const startEdit = (l: ShortLink) => {
        setConfirmArchiveId(null);
        setEditingId(l.id);
        setDraft({
            url: l.url,
            key: l.key,
            expiresAt: l.expiresAt ? l.expiresAt.slice(0, 16) : '',
            tagNames: (l.tags ?? []).map(t => t.name),
        });
    };

    const saveEdit = async (l: ShortLink) => {
        if (!URL_RE.test(draft.url.trim())) { setNotice('A valid http(s) url is required'); return; }
        setSaving(true);
        setNotice(null);
        const r = await updateShortLink(l.id, {
            url: draft.url.trim(),
            ...(draft.key.trim() && draft.key.trim() !== l.key ? { key: draft.key.trim() } : {}),
            tagNames: draft.tagNames,
            expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
        });
        setSaving(false);
        if (r.kind === 'ok') {
            setNotice(`Updated ${r.data?.shortLink ?? l.shortLink}`);
            void refresh();
        } else {
            setNotice(r.kind === 'needs-setup' ? 'Dub is not configured' : r.message);
        }
    };

    const archive = async (l: ShortLink, archived: boolean) => {
        setNotice(null);
        const r = await archiveShortLink(l.id, archived);
        if (r.kind === 'ok') {
            setNotice(`${archived ? 'Archived' : 'Unarchived'} ${l.shortLink}`);
            void refresh();
        } else {
            setNotice(r.kind === 'needs-setup' ? 'Dub is not configured' : r.message);
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
                <QrDoorSheet configured={state.kind === 'ok'} onBack={() => setMode('links')} />
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
                    <a
                        className="short-links__btn short-links__btn--ghost"
                        href={dubDashboardUrl()}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Dub"
                    >
                        Open in Dub <ExternalLink size={12} aria-hidden />
                    </a>
                    <button className="short-links__btn short-links__btn--ghost" onClick={() => void refresh()} aria-label="Refresh short links">
                        <RefreshCw size={14} aria-hidden />
                    </button>
                </div>
            </div>

            {state.kind === 'loading' && <p className="short-links__muted">Loading links…</p>}

            {state.kind === 'needs-setup' && (
                <div className="short-links__empty" data-state="needs-setup">
                    <QrCode size={28} aria-hidden />
                    <h3>Connect Dub</h3>
                    <p>
                        Links &amp; QR mints branded short links and QR codes through the Dub API.
                        Set DUB_API_KEY on the backend (see tools/dub/README.md). Heads-up: Dub&apos;s
                        pricing page currently lists no free plan — check current pricing at
                        dub.co/pricing before creating a workspace.
                    </p>
                    <div className="short-links__head-actions">
                        <button className="short-links__btn" onClick={() => openWidget('tools-hub')}>Open Tools hub</button>
                        <button className="short-links__btn" onClick={() => setMode('sheet')}>QR door sheet (works without Dub)</button>
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
                    <section className="short-links__presets" aria-label="Andy presets">
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
                            {state.data.domains.length > 0 && (
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
                            <input
                                className="short-links__input short-links__input--key"
                                type="datetime-local"
                                value={expiry}
                                onChange={e => setExpiry(e.target.value)}
                                aria-label="Expires at"
                                title="Link expiry (optional)"
                            />
                            <button
                                className="short-links__btn"
                                disabled={creating || !URL_RE.test(url.trim())}
                                onClick={submitComposer}
                            >
                                {creating ? 'Creating…' : 'Create link'}
                            </button>
                        </div>
                        <div className="short-links__form short-links__form--extras">
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
                        <select
                            className="short-links__input short-links__input--key"
                            value={filterTag}
                            onChange={e => setFilterTag(e.target.value)}
                            aria-label="Filter by tag"
                        >
                            <option value="">All tags</option>
                            {state.data.tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
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
                                    <tr><th>Short link</th><th>Destination</th><th>Tags</th><th>Clicks</th><th aria-label="Actions" /></tr>
                                </thead>
                                <tbody>
                                    {visibleLinks.map(l => (
                                        <tr key={l.id} data-archived={l.archived || undefined}>
                                            <td className="short-links__short">{l.shortLink}{l.archived ? ' (archived)' : ''}</td>
                                            <td className="short-links__dest" title={l.url}>{l.url}</td>
                                            <td>
                                                {(l.tags ?? []).map(t => (
                                                    <span key={t.id} className="short-links__chip">{t.name}</span>
                                                ))}
                                            </td>
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
                                                    <img className="short-links__qr" src={l.qrCode} alt={`QR code for ${l.shortLink}`} width={120} height={120} />
                                                )}
                                                {editingId === l.id && (
                                                    <div className="short-links__edit" aria-label={`Edit form for ${l.shortLink}`}>
                                                        <input
                                                            className="short-links__input"
                                                            value={draft.url}
                                                            onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                                                            aria-label="Edit destination URL"
                                                        />
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
