/**
 * ShortLinks — "Links & QR" widget over the /api/links proxy (plan 047 phase 2,
 * rebuilt for plan 053 to cover the full daily workflow).
 *
 * The backend answers in one of two modes (`mode` on the list response). The
 * built-in Dwellium shortener is the default; UTM params are folded into the
 * destination URL client-side there. Expiry, tags (picker, filter, Tags column)
 * and the clicks sparkline are gated on the list response's `features` (plan 077
 * phase 3), NOT on the mode: the widget deploys separately from the backend, so
 * an OLDER built-in backend (no `features`) still hides them. Only the domain
 * picker, the key edit and "Open in Dub ↗" stay Dub-only. Always: list with
 * click counts, client-side search (short link, destination, title, tags),
 * inline edit that PATCHes only changed fields, confirm-gated archive, copy +
 * QR (client-side when the row has no hosted qrCode), link presets and a
 * printable per-unit QR door sheet (mints short links, the codes encode them).
 * A failed BACKGROUND refresh keeps the list and shows a notice; only the
 * initial load failure shows the error card. Focus follows the user: Archive
 * moves it to Confirm, Confirm/Cancel hand it back to the row (or the search
 * box if the row is gone), opening the edit form focuses its URL input.
 * Presets and the door sheet point at per-property destinations the user enters
 * (widget memory) — nothing links to the app itself; a preset stays disabled
 * until its destination is set. A 503 `needsSetup` (OLD backend only) renders a card pointing at the door sheet.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
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
    type LinkFeature,
    type LinksMode,
    type LinkTag,
    type UpdateShortLinkInput,
    type ShortLink,
} from './shortLinksApi';
import {
    ANDY_LINK_PRESETS,
    ANDY_PROPERTIES,
    HTTP_URL_RE,
    destinationValue,
    presetKey,
    presetUrl,
    type DestinationsMemory,
    type PresetId,
} from './andyLinkPresets';
import { qrDataUri } from '../Scribe/idocs/blocks/qr'; // client-side QR — builtin-mode links carry no hosted qrCode URL
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
    features: Set<LinkFeature>;
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

/** Append utm_* params to the destination (built-in mode stores only the URL). Appends as text so the URL the user typed is never re-serialised. */
function withUtm(url: string, utm: Record<string, string>): string {
    const qs = Object.entries(utm).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    if (!qs) return url;
    const at = url.indexOf('#');
    const [base, hash] = at < 0 ? [url, ''] : [url.slice(0, at), url.slice(at)];
    return `${base}${base.includes('?') ? '&' : '?'}${qs}${hash}`;
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
    const [mem, patchMem] = useWidgetMemory('short-links', { mode: 'links', destinations: {} as DestinationsMemory });
    const mode: 'links' | 'sheet' = mem.mode === 'sheet' ? 'sheet' : 'links';
    // A corrupt (non-object) slice reads as "nothing entered".
    const destinations: DestinationsMemory = typeof mem.destinations === 'object' && mem.destinations && !Array.isArray(mem.destinations) ? mem.destinations : {};
    const setDestination = (propertyId: string, presetId: PresetId, value: string): void =>
        patchMem({ destinations: { ...destinations, [propertyId]: { ...destinations[propertyId], [presetId]: value } } });
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
    // The row as it was when the edit opened: a refresh behind an open form must not turn untouched fields into "changes".
    const [editBase, setEditBase] = useState<ShortLink | null>(null);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    // Dub-only: domain picker, key edit, "Open in Dub". Everything else is gated on `can(feature)`.
    const dub = state.kind === 'ok' && state.data.mode === 'dub';
    const can = (f: LinkFeature): boolean => state.kind === 'ok' && state.data.features.has(f);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; });

    // Focus management. `refocus` = a row to hand focus back to; `wait` holds it until the refresh that follows an archive lands.
    const rootRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const editUrlRef = useRef<HTMLInputElement>(null);
    const [refocus, setRefocus] = useState<{ id: string; wait: boolean } | null>(null);

    // Latest-wins guard: an older refresh response must never overwrite a newer one.
    const refreshSeq = useRef(0);
    const refresh = useCallback(async () => {
        const seq = ++refreshSeq.current;
        // Keep an already-rendered list (and the composer / open edit form) mounted while re-fetching.
        setState(s => (s.kind === 'ok' ? s : { kind: 'loading' }));
        setConfirmArchiveId(null);
        const r = await listShortLinks(showArchived);
        // Tags (when the backend supports them) and domains (Dub only) are best-effort — the link list must render without them.
        const [tagsR, domainsR] = r.kind === 'ok'
            ? await Promise.all([r.data.features.has('tags') ? listLinkTags() : null, r.data.mode === 'dub' ? listLinkDomains() : null])
            : [null, null];
        if (seq !== refreshSeq.current) return;
        setRefocus(f => (f ? { ...f, wait: false } : f));
        if (r.kind !== 'ok') {
            // A list already on screen survives a failed re-fetch (nothing typed or shown is lost); only the first load shows the card.
            if (r.kind === 'error' && stateRef.current.kind === 'ok') { setNotice(`Could not refresh — ${r.message}`); return; }
            setState(r.kind === 'needs-setup' ? { kind: 'needs-setup' } : { kind: 'error', message: r.message });
            return;
        }
        const { links, mode, features } = r.data;
        setEditingId(cur => (cur && links.some(l => l.id === cur) ? cur : null));
        setState({
            kind: 'ok',
            data: {
                mode,
                links,
                tags: tagsR?.kind === 'ok' ? tagsR.data : [],
                domains: domainsR?.kind === 'ok' ? domainsR.data.domains : [],
                defaultDomain: domainsR?.kind === 'ok' ? domainsR.data.defaultDomain : null,
                features,
            },
        });
    }, [showArchived]);

    // Handlers ask for a reload by bumping this — never by calling `refresh` themselves: a create or
    // save still in flight holds an OLDER render's refresh (stale "Show archived"), the effect never does.
    const [reloadTick, setReloadTick] = useState(0);
    const reload = (): void => setReloadTick(t => t + 1);
    useEffect(() => { void refresh(); }, [refresh, reloadTick]);

    // Eager sparkline fetch for the first clicked links (one analytics call per row).
    useEffect(() => {
        if (state.kind !== 'ok' || !state.data.features.has('timeseries')) return;
        // Only the first SPARKLINE_ROWS clicked links ever get a fetch (a hard cap, not a batch size).
        const wanted = state.data.links.filter(l => l.clicks > 0).slice(0, SPARKLINE_ROWS).filter(l => !(l.id in series));
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

    useEffect(() => { if (confirmArchiveId) confirmRef.current?.focus(); }, [confirmArchiveId]);
    useEffect(() => { if (editingId) editUrlRef.current?.focus(); }, [editingId]);
    useEffect(() => {
        if (!refocus || refocus.wait) return;
        const copy = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-copy-for]') ?? []).find(b => b.dataset.copyFor === refocus.id);
        (copy ?? searchRef.current)?.focus();
        setRefocus(null);
    }, [refocus, state]);

    /** Resolves true when the link was created (callers reset their own draft on success). `archivedHint`: a taken key may belong to an archived link. */
    const create = async (input: CreateShortLinkInput, label?: string, archivedHint = false): Promise<boolean> => {
        setCreating(true);
        setNotice(null);
        const r = await createShortLink(input);
        setCreating(false);
        if (r.kind === 'ok') {
            setNotice(`Created ${r.data?.shortLink ?? label ?? 'link'}`);
            reload();
            return true;
        }
        if (r.kind === 'needs-setup') setState({ kind: 'needs-setup' });
        else if (archivedHint && input.key && /is taken/i.test(r.message)) setNotice(`Key ${input.key} already exists — it may be archived; tick Show archived to find it`);
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
            // Built-in has no utm fields — carry them inside the destination itself; tags and expiry only when the backend lists them.
            input = {
                url: withUtm(url.trim(), utmSet),
                ...(key.trim() ? { key: key.trim() } : {}),
                ...(can('tags') && pickedTags.length ? { tagNames: pickedTags } : {}),
                ...(can('expiry') && expiry ? { expiresAt: new Date(expiry).toISOString() } : {}),
            };
        }
        if (await create(input)) {
            setUrl(''); setKey(''); setExpiry(''); setPickedTags([]);
            setUtm({ utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '' });
        }
    };

    const applyPreset = (presetId: string) => {
        const property = ANDY_PROPERTIES.find(p => p.id === presetProperty) ?? ANDY_PROPERTIES[0];
        const preset = ANDY_LINK_PRESETS.find(p => p.id === presetId);
        const dest = preset && presetUrl(destinations, property.id, preset.id);
        if (!preset || !dest || dest.includes('{unit}')) return;
        void create(
            { url: dest, key: presetKey(property, preset), ...(can('tags') ? { tagNames: [property.tag, preset.kindTag] } : {}) },
            preset.label,
            true,
        );
    };

    const addTag = async () => {
        const name = newTag.trim();
        if (!name) return;
        const r = await createLinkTag(name);
        if (r.kind === 'ok') {
            setNewTag('');
            setPickedTags(t => (t.includes(name) ? t : [...t, name]));
            // Built-in lists only tags some link uses — the picker shows picked-but-unused ones too (see pickerTags).
        } else {
            setNotice(r.kind === 'needs-setup' ? UNAVAILABLE : r.message);
        }
    };

    const startEdit = (l: ShortLink) => {
        setConfirmArchiveId(null);
        setEditingId(l.id);
        setEditBase(l);
        setDraft({
            url: l.url,
            key: l.key,
            expiresAt: l.expiresAt ? isoToLocalInput(l.expiresAt) : '',
            tagNames: (l.tags ?? []).map(t => t.name),
        });
    };

    const saveEdit = async (l: ShortLink) => {
        if (!URL_RE.test(draft.url.trim())) { setNotice('A valid http(s) url is required'); return; }
        const patch = editPatch(draft, editBase ?? l);
        if (Object.keys(patch).length === 0) { setEditingId(null); return; }
        setSaving(true);
        setNotice(null);
        const r = await updateShortLink(l.id, patch);
        setSaving(false);
        if (r.kind === 'ok') {
            setNotice(`Updated ${r.data?.shortLink ?? l.shortLink}`);
            setEditingId(null);
            reload();
        } else {
            setNotice(r.kind === 'needs-setup' ? UNAVAILABLE : r.message);
        }
    };

    const archive = async (l: ShortLink, archived: boolean) => {
        setNotice(null);
        const r = await archiveShortLink(l.id, archived);
        if (r.kind === 'ok') {
            setNotice(`${archived ? 'Archived' : 'Unarchived'} ${l.shortLink}`);
            setRefocus({ id: l.id, wait: true }); // the refresh below settles first; the row may be gone by then
            reload();
        } else {
            setNotice(r.kind === 'needs-setup' ? UNAVAILABLE : r.message);
            setRefocus({ id: l.id, wait: false });
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
                <QrDoorSheet destinations={destinations} links={state.kind === 'ok' ? state.data.mode : 'unavailable'} onBack={() => setMode('links')} />
            </div>
        );
    }

    // Derived so a tag that vanished from the list (last link untagged, or a backend without tags) cannot strand the filter.
    const tagList = state.kind === 'ok' && can('tags') ? state.data.tags : [];
    const activeTag = tagList.some(t => t.name === filterTag) ? filterTag : '';
    const pickerTags = [...tagList, ...pickedTags.filter(n => !tagList.some(t => t.name === n)).map(n => ({ id: n, name: n, color: '' }))];
    const needle = search.trim().toLowerCase();
    const matches = (l: ShortLink): boolean =>
        [l.shortLink, l.url, l.comments ?? '', ...(l.tags ?? []).map(t => t.name)].some(v => v.toLowerCase().includes(needle));
    const visibleLinks = state.kind === 'ok'
        ? state.data.links.filter(l => (!activeTag || (l.tags ?? []).some(t => t.name === activeTag)) && (!needle || matches(l)))
        : [];

    return (
        <div className="short-links" ref={rootRef}>
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
                    <button className="short-links__btn short-links__btn--ghost" onClick={reload} aria-label="Refresh short links">
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
                    <button className="short-links__btn" onClick={reload}>Retry</button>
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
                        {ANDY_LINK_PRESETS.map(p => {
                            const dest = presetUrl(destinations, presetProperty, p.id);
                            // A per-unit destination ({unit}) is for the door sheet; a preset is one link per property.
                            const perUnit = !!dest && dest.includes('{unit}');
                            const unset = dest === null || perUnit;
                            return (
                                <button
                                    key={p.id}
                                    className={`short-links__btn short-links__btn--ghost${unset ? ' short-links__btn--disabled-hint' : ''}`}
                                    disabled={creating || unset}
                                    title={perUnit ? `This destination is per unit ({unit}) — print it from the door sheet` : unset ? `Set the ${p.label} destination for this property first` : undefined}
                                    onClick={() => applyPreset(p.id)}
                                >
                                    + {p.label}
                                </button>
                            );
                        })}
                    </section>
                    <details className="short-links__destinations">
                        <summary>Destinations — {ANDY_PROPERTIES.find(p => p.id === presetProperty)?.name}</summary>
                        <div className="short-links__destinations-grid">
                            {ANDY_LINK_PRESETS.map(p => {
                                const value = destinationValue(destinations, presetProperty, p.id);
                                return (
                                    <label key={p.id}>
                                        {p.label}
                                        <input
                                            className="short-links__input"
                                            placeholder="https://…"
                                            value={value}
                                            onChange={e => setDestination(presetProperty, p.id, e.target.value)}
                                            aria-label={`${p.label} destination`}
                                        />
                                        {value.trim() && !HTTP_URL_RE.test(value.trim()) && (
                                            <span className="short-links__muted">must start with http:// or https://</span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    </details>

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
                            {can('expiry') && (
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
                            {can('tags') && (
                                <details className="short-links__details">
                                    <summary>Tags{pickedTags.length ? ` (${pickedTags.length})` : ''}</summary>
                                    <div className="short-links__tag-picker">
                                        {pickerTags.map(t => (
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
                        {/* Always mounted so the live region exists before the first message arrives. */}
                        <p className="short-links__notice" role="status">{notice}</p>
                    </section>

                    <input
                        ref={searchRef}
                        className="short-links__input short-links__search"
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search short link, destination, tag…"
                        aria-label="Search links"
                    />
                    <div className="short-links__filters">
                        {can('tags') && (
                            <select
                                className="short-links__input short-links__input--key"
                                value={activeTag}
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
                                <h3>{needle ? 'No links match' : `No links${activeTag ? ` tagged ${activeTag}` : ' yet'}`}</h3>
                                <p>{needle ? 'Clear the search or the tag filter to see more.' : 'Shorten a Tenant Portal or published-doc URL above, then print its QR.'}</p>
                            </div>
                        )
                        : (
                            <table className="short-links__table">
                                <thead>
                                    <tr><th>Short link</th><th>Destination</th><th>Clicks</th><th aria-label="Actions" /></tr>
                                </thead>
                                <tbody>
                                    {visibleLinks.map(l => (
                                    <Fragment key={l.id}>
                                        <tr data-archived={l.archived || undefined}>
                                            <td className="short-links__short">
                                                {l.shortLink}{l.archived ? ' (archived)' : ''}
                                                {/* Tags and the expiry state sit under the link: a fifth column does not fit the 520px minimum. */}
                                                {(l.tags ?? []).length > 0 && (
                                                    <div className="short-links__meta">{(l.tags ?? []).map(t => <span key={t.id} className="short-links__chip">{t.name}</span>)}</div>
                                                )}
                                                {l.expiresAt && (
                                                    <div className={`short-links__meta short-links__row-hint${Date.parse(l.expiresAt) <= Date.now() ? ' short-links__expired' : ''}`}>
                                                        {Date.parse(l.expiresAt) <= Date.now() ? 'expired ' : 'expires '}{new Date(l.expiresAt).toLocaleString()}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="short-links__dest" title={l.url}>{l.url}</td>
                                            <td className="short-links__clicks">
                                                {l.clicks}
                                                {series[l.id] && <Sparkline points={series[l.id]} />}
                                            </td>
                                            <td className="short-links__actions">
                                                <button className="short-links__btn short-links__btn--ghost" onClick={() => copy(l.shortLink)} aria-label={`Copy ${l.shortLink}`} data-copy-for={l.id}>
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
                                                                <button ref={confirmRef} className="short-links__btn" onClick={() => void archive(l, true)}>
                                                                    Confirm archive
                                                                </button>
                                                                <button className="short-links__btn short-links__btn--ghost" onClick={() => { setConfirmArchiveId(null); setRefocus({ id: l.id, wait: false }); }} aria-label="Cancel archive">
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
                                            </td>
                                        </tr>
                                        {(qrFor === l.id || editingId === l.id) && (
                                            <tr>
                                                <td colSpan={4}>
                                                    <div className="short-links__detail">
                                                    {qrFor === l.id && (
                                                        // Builtin-mode rows carry no hosted qrCode URL — render the same client-side QR the door sheet uses.
                                                        <>
                                                            <img className="short-links__qr" src={l.qrCode || qrDataUri(l.shortLink) || undefined} alt={`QR code for ${l.shortLink}`} width={120} height={120} />
                                                            {qrDataUri(l.shortLink) && (
                                                                // Always the client-side SVG (vector, print-ready), even in Dub mode.
                                                                <a className="short-links__btn short-links__btn--ghost" href={qrDataUri(l.shortLink) ?? undefined} download={`${l.key}.svg`}>
                                                                    Download SVG
                                                                </a>
                                                            )}
                                                        </>
                                                    )}
                                                    {editingId === l.id && (
                                                        <div className="short-links__edit" role="group" aria-label={`Edit form for ${l.shortLink}`}>
                                                            <input
                                                                ref={editUrlRef}
                                                                className="short-links__input"
                                                                value={draft.url}
                                                                onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                                                                aria-label="Edit destination URL"
                                                            />
                                                            {dub && (
                                                                <input
                                                                    className="short-links__input short-links__input--key"
                                                                    value={draft.key}
                                                                    onChange={e => setDraft(d => ({ ...d, key: e.target.value }))}
                                                                    aria-label="Edit key"
                                                                />
                                                            )}
                                                            {can('expiry') && (
                                                                <input
                                                                    className="short-links__input short-links__input--key"
                                                                    type="datetime-local"
                                                                    value={draft.expiresAt}
                                                                    onChange={e => setDraft(d => ({ ...d, expiresAt: e.target.value }))}
                                                                    aria-label="Edit expiry"
                                                                />
                                                            )}
                                                            {can('tags') && (
                                                                <>
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
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        )}
                </>
            )}
        </div>
    );
}
