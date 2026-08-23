/**
 * Broadcasts — plan 053: the full listmonk daily workflow, in-window.
 *
 * Four tabs over the backend proxy /api/broadcasts (the browser never sees a
 * listmonk credential):
 *   Campaigns — list w/ status + per-campaign stats (sent/views/clicks/
 *               bounces), create a draft with subject + body + template +
 *               audience, test-send to yourself, schedule, and SEND — sending
 *               opens a type-the-word confirm dialog and the backend
 *               additionally requires `confirm:true`, so a UI bug can never
 *               mass-email.
 *   Audiences — mailing lists w/ subscriber counts, create a list, browse
 *               subscribers, and "Import from Strata": residents / owners /
 *               vendors from the live Strata data with per-row consent
 *               checkboxes. Imports UPSERT (never delete) and default to
 *               unconfirmed — contact details on file are not marketing
 *               consent.
 *   Templates — notice templates + rendered HTML preview (sandboxed iframe).
 *   Admin     — the full listmonk admin embedded (VITE_LISTMONK_URL) behind
 *               the reachability pattern; the tools/listmonk Caddy sidecar
 *               sets `frame-ancestors` so the embed works.
 *
 * Backend 503 (LISTMONK_* env unset) → "Connect listmonk" needs-setup card;
 * network failure → error card with Retry. Never a blank, never a crash.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ExternalLink, Megaphone, RefreshCw } from 'lucide-react';
import {
    createBroadcastList,
    createCampaignDraft,
    getCampaignStats,
    getTemplatePreview,
    importSubscribers,
    listBroadcastCampaigns,
    listBroadcastLists,
    listBroadcastTemplates,
    listSubscribers,
    sendCampaignTest,
    setCampaignStatus,
    updateCampaign,
    type BroadcastCampaign,
    type BroadcastList,
    type BroadcastSubscriber,
    type BroadcastTemplate,
    type CampaignStats,
} from './broadcastsApi';
import { strataGet } from '../StrataDashboard/strataApi';
import { openWidget } from '../../lib/dwelliumCommands';
import './Broadcasts.css';

type ViewState =
    | { kind: 'loading' }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; lists: BroadcastList[]; campaigns: BroadcastCampaign[]; templates: BroadcastTemplate[] };

type Tab = 'campaigns' | 'audiences' | 'templates' | 'admin';

type ConfirmTarget =
    | { kind: 'send'; id: number; name: string }
    | { kind: 'schedule'; id: number; name: string; sendAt: string };

interface StrataEntity {
    id: string;
    name: string;
    email: string | null;
    propertyIds?: string[];
}

interface ImportRow extends StrataEntity {
    checked: boolean;
}

type ImportSource = 'residents' | 'owners' | 'vendors';

type Reach = 'checking' | 'up' | 'down';

/** Fetch import candidates from the live Strata data (LeasingModule fixtures:
 *  Woodland Parc Townhomes, Riverwood Club Apartments). Owners span the four
 *  ownership entity types the Owners module uses. */
async function fetchStrataEntities(source: ImportSource): Promise<StrataEntity[]> {
    if (source === 'residents') return strataGet<StrataEntity[]>('/entities', { type: 'tenant' });
    if (source === 'vendors') return strataGet<StrataEntity[]>('/entities', { type: 'vendor' });
    const groups = await Promise.all(
        ['owner', 'trust', 'llc', 'corporate'].map(type => strataGet<StrataEntity[]>('/entities', { type })),
    );
    return groups.flat();
}

export default function Broadcasts({
    env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env,
}: { env?: Record<string, string | undefined> } = {}) {
    const [state, setState] = useState<ViewState>({ kind: 'loading' });
    const [tab, setTab] = useState<Tab>('campaigns');
    const [notice, setNotice] = useState<string | null>(null);

    // Campaigns tab
    const [subject, setSubject] = useState('');
    const [bodyHtml, setBodyHtml] = useState('');
    const [listId, setListId] = useState('');
    const [templateId, setTemplateId] = useState('');
    const [creating, setCreating] = useState(false);
    const [rowAction, setRowAction] = useState<{ id: number; kind: 'test' | 'schedule' } | null>(null);
    const [testEmail, setTestEmail] = useState('');
    const [scheduleAt, setScheduleAt] = useState('');
    const [stats, setStats] = useState<Record<number, CampaignStats>>({});
    const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
    const [confirmWord, setConfirmWord] = useState('');
    const [acting, setActing] = useState(false);

    // Audiences tab
    const [newListName, setNewListName] = useState('');
    const [newListOptin, setNewListOptin] = useState<'single' | 'double'>('single');
    const [browseListId, setBrowseListId] = useState<number | null>(null);
    const [browse, setBrowse] = useState<{ subscribers: BroadcastSubscriber[]; total: number } | null>(null);
    const [importSource, setImportSource] = useState<ImportSource>('residents');
    const [importListId, setImportListId] = useState('');
    const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [addAsUnconfirmed, setAddAsUnconfirmed] = useState(true);

    // Templates tab
    const [preview, setPreview] = useState<{ id: number; html: string } | null>(null);

    // Admin tab
    const listmonkUrl = env?.VITE_LISTMONK_URL?.trim().replace(/\/$/, '') || undefined;
    const [adminReach, setAdminReach] = useState<Reach>('checking');
    const [adminKey, setAdminKey] = useState(0);

    const refresh = useCallback(async () => {
        setState({ kind: 'loading' });
        const [lists, campaigns, templates] = await Promise.all([
            listBroadcastLists(),
            listBroadcastCampaigns(),
            listBroadcastTemplates(),
        ]);
        if (lists.kind === 'needs-setup' || campaigns.kind === 'needs-setup' || templates.kind === 'needs-setup') {
            setState({ kind: 'needs-setup' });
            return;
        }
        if (lists.kind === 'error') { setState({ kind: 'error', message: lists.message }); return; }
        if (campaigns.kind === 'error') { setState({ kind: 'error', message: campaigns.message }); return; }
        if (templates.kind === 'error') { setState({ kind: 'error', message: templates.message }); return; }
        setState({ kind: 'ok', lists: lists.data, campaigns: campaigns.data, templates: templates.data });
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const checkAdminReach = useCallback(async (target: string) => {
        setAdminReach('checking');
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 4000);
            await fetch(target, { mode: 'no-cors', signal: ctrl.signal });
            clearTimeout(t);
            setAdminReach('up');
        } catch {
            setAdminReach('down');
        }
    }, []);

    useEffect(() => {
        if (tab === 'admin' && listmonkUrl) void checkAdminReach(listmonkUrl);
    }, [tab, listmonkUrl, adminKey, checkAdminReach]);

    const createDraft = async () => {
        const list = Number.parseInt(listId, 10);
        if (!subject.trim() || !Number.isInteger(list)) return;
        setCreating(true);
        setNotice(null);
        const tpl = Number.parseInt(templateId, 10);
        const r = await createCampaignDraft({
            subject: subject.trim(),
            lists: [list],
            ...(bodyHtml.trim() ? { body: bodyHtml, content_type: 'html' } : {}),
            ...(Number.isInteger(tpl) ? { template_id: tpl } : {}),
        });
        setCreating(false);
        if (r.kind === 'ok') {
            setNotice('Draft created — test-send it, then Schedule or Send from the row below.');
            setSubject('');
            setBodyHtml('');
            void refresh();
        } else if (r.kind === 'needs-setup') {
            setState({ kind: 'needs-setup' });
        } else {
            setNotice(r.message);
        }
    };

    const runTestSend = async (id: number) => {
        if (!testEmail.includes('@')) return;
        setActing(true);
        const r = await sendCampaignTest(id, [testEmail.trim()]);
        setActing(false);
        setNotice(r.kind === 'ok' ? `Test sent to ${testEmail.trim()}.` : r.kind === 'error' ? r.message : null);
        if (r.kind === 'ok') { setRowAction(null); setTestEmail(''); }
    };

    const loadStats = async (id: number) => {
        const r = await getCampaignStats(id);
        if (r.kind === 'ok') setStats(prev => ({ ...prev, [id]: r.data }));
        else if (r.kind === 'error') setNotice(r.message);
    };

    const runConfirmed = async () => {
        if (!confirmTarget || confirmWord !== 'SEND') return;
        setActing(true);
        setNotice(null);
        let message: string | null = null;
        if (confirmTarget.kind === 'send') {
            const r = await setCampaignStatus(confirmTarget.id, 'running', true);
            message = r.kind === 'ok' ? `Sending “${confirmTarget.name}” now.` : r.kind === 'error' ? r.message : null;
        } else {
            const iso = new Date(confirmTarget.sendAt).toISOString();
            const upd = await updateCampaign(confirmTarget.id, { send_at: iso });
            if (upd.kind === 'ok') {
                const r = await setCampaignStatus(confirmTarget.id, 'scheduled', true);
                message = r.kind === 'ok'
                    ? `“${confirmTarget.name}” scheduled for ${new Date(confirmTarget.sendAt).toLocaleString()}.`
                    : r.kind === 'error' ? r.message : null;
            } else {
                message = upd.kind === 'error' ? upd.message : null;
            }
        }
        setActing(false);
        setConfirmTarget(null);
        setConfirmWord('');
        setRowAction(null);
        setScheduleAt('');
        setNotice(message);
        void refresh();
    };

    const createAudience = async () => {
        if (!newListName.trim()) return;
        setActing(true);
        const r = await createBroadcastList({ name: newListName.trim(), optin: newListOptin });
        setActing(false);
        if (r.kind === 'ok') {
            setNotice(`Audience “${newListName.trim()}” created.`);
            setNewListName('');
            void refresh();
        } else if (r.kind === 'error') {
            setNotice(r.message);
        }
    };

    const browseAudience = async (id: number) => {
        setBrowseListId(id);
        setBrowse(null);
        const r = await listSubscribers({ listId: id, page: 1, perPage: 50 });
        if (r.kind === 'ok') setBrowse(r.data);
        else if (r.kind === 'error') setNotice(r.message);
    };

    const loadImportRows = async () => {
        setImportLoading(true);
        setImportRows(null);
        setNotice(null);
        try {
            const entities = await fetchStrataEntities(importSource);
            setImportRows(entities.map(e => ({ ...e, checked: Boolean(e.email) })));
        } catch {
            setNotice('Could not load Strata data — is the backend reachable?');
        }
        setImportLoading(false);
    };

    const runImport = async () => {
        const target = Number.parseInt(importListId, 10);
        const selected = (importRows || []).filter(r => r.checked && r.email);
        if (!Number.isInteger(target) || selected.length === 0) return;
        setActing(true);
        const r = await importSubscribers({
            subscribers: selected.map(row => ({
                email: row.email as string,
                name: row.name,
                attribs: {
                    source: `strata:${importSource}`,
                    strata_id: row.id,
                    ...(row.propertyIds?.length ? { strata_property_ids: row.propertyIds } : {}),
                },
            })),
            lists: [target],
            preconfirm: !addAsUnconfirmed,
        });
        setActing(false);
        if (r.kind === 'ok') {
            const failed = r.data.failed.length;
            setNotice(`Import done — ${r.data.created} added, ${r.data.updated} updated${failed ? `, ${failed} failed` : ''}. Nothing was deleted.`);
            setImportRows(null);
            void refresh();
        } else if (r.kind === 'error') {
            setNotice(r.message);
        }
    };

    const loadPreview = async (id: number) => {
        setPreview(null);
        const r = await getTemplatePreview(id);
        if (r.kind === 'ok') setPreview({ id, html: r.data });
        else if (r.kind === 'error') setNotice(r.message);
    };

    const canAct = (status: string) => status === 'draft' || status === 'paused' || status === 'scheduled';

    return (
        <div className="broadcasts">
            <div className="broadcasts__head">
                <h2 className="broadcasts__title"><Megaphone size={16} aria-hidden /> Broadcasts</h2>
                <div className="broadcasts__head-actions">
                    {listmonkUrl && (
                        <a className="broadcasts__link" href={listmonkUrl} target="_blank" rel="noreferrer">
                            Open listmonk <ExternalLink size={12} aria-hidden />
                        </a>
                    )}
                    <button className="broadcasts__btn broadcasts__btn--ghost" onClick={() => void refresh()} aria-label="Refresh broadcasts">
                        <RefreshCw size={14} aria-hidden />
                    </button>
                </div>
            </div>

            {state.kind === 'loading' && <p className="broadcasts__muted">Loading lists and campaigns…</p>}

            {state.kind === 'needs-setup' && (
                <div className="broadcasts__empty" data-state="needs-setup">
                    <Megaphone size={28} aria-hidden />
                    <h3>Connect listmonk</h3>
                    <p>
                        Broadcasts sends resident, owner and vendor notices through a self-hosted
                        listmonk. Runs on the free e2-micro — see tools/listmonk/README. Once the
                        backend&apos;s LISTMONK_* env is set this flips to Ready automatically.
                    </p>
                    <button className="broadcasts__btn" onClick={() => openWidget('tools-hub')}>Open Tools hub</button>
                </div>
            )}

            {state.kind === 'error' && (
                <div className="broadcasts__empty" data-state="error">
                    <h3>Backend unavailable</h3>
                    <p>{state.message}</p>
                    <button className="broadcasts__btn" onClick={() => void refresh()}>Retry</button>
                </div>
            )}

            {state.kind === 'ok' && (
                <>
                    <div className="broadcasts__tabs" role="tablist" aria-label="Broadcasts sections">
                        {(['campaigns', 'audiences', 'templates', 'admin'] as Tab[]).map(t => (
                            <button
                                key={t}
                                role="tab"
                                aria-selected={tab === t}
                                className={`broadcasts__tab${tab === t ? ' broadcasts__tab--active' : ''}`}
                                onClick={() => setTab(t)}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>

                    {notice && <p className="broadcasts__notice" role="status">{notice}</p>}

                    {tab === 'campaigns' && (
                        <>
                            <section className="broadcasts__composer" aria-label="New notice">
                                <h3 className="broadcasts__section-title">New notice</h3>
                                <div className="broadcasts__form">
                                    <input
                                        className="broadcasts__input"
                                        placeholder="Subject — e.g. Pool closed Friday"
                                        value={subject}
                                        onChange={e => setSubject(e.target.value)}
                                        aria-label="Notice subject"
                                    />
                                    <select className="broadcasts__input" value={listId} onChange={e => setListId(e.target.value)} aria-label="Audience">
                                        <option value="">Audience…</option>
                                        {state.lists.map(l => (
                                            <option key={l.id} value={l.id}>
                                                {l.name}{typeof l.subscriber_count === 'number' ? ` (${l.subscriber_count})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <select className="broadcasts__input" value={templateId} onChange={e => setTemplateId(e.target.value)} aria-label="Template">
                                        <option value="">Default template</option>
                                        {state.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <button
                                        className="broadcasts__btn"
                                        disabled={creating || !subject.trim() || !listId}
                                        onClick={() => void createDraft()}
                                    >
                                        {creating ? 'Creating…' : 'Create draft'}
                                    </button>
                                </div>
                                <textarea
                                    className="broadcasts__input broadcasts__body-editor"
                                    placeholder="Notice body (HTML or plain text). Merge tags like {{ .Subscriber.Name }} work here."
                                    value={bodyHtml}
                                    onChange={e => setBodyHtml(e.target.value)}
                                    aria-label="Notice body"
                                    rows={5}
                                />
                            </section>

                            <section aria-label="Campaigns">
                                <h3 className="broadcasts__section-title">Campaigns</h3>
                                {state.campaigns.length === 0
                                    ? <p className="broadcasts__muted">No campaigns yet — create a draft notice above.</p>
                                    : (
                                        <table className="broadcasts__table">
                                            <thead>
                                                <tr><th>Name</th><th>Subject</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                                            </thead>
                                            <tbody>
                                                {state.campaigns.map(c => (
                                                    <Fragment key={c.id}>
                                                        <tr key={c.id} data-campaign-status={c.status}>
                                                            <td className="broadcasts__campaign-name">{c.name}</td>
                                                            <td>{c.subject}</td>
                                                            <td><span className={`broadcasts__status broadcasts__status--${c.status}`}>{c.status}</span></td>
                                                            <td className="broadcasts__muted">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                                                            <td className="broadcasts__actions">
                                                                <button className="broadcasts__btn broadcasts__btn--sm" aria-label={`Stats for ${c.name}`} onClick={() => void loadStats(c.id)}>Stats</button>
                                                                {canAct(c.status) && (
                                                                    <>
                                                                        <button className="broadcasts__btn broadcasts__btn--sm" aria-label={`Test-send ${c.name}`} onClick={() => { setRowAction({ id: c.id, kind: 'test' }); setTestEmail(''); }}>Test</button>
                                                                        <button className="broadcasts__btn broadcasts__btn--sm" aria-label={`Schedule ${c.name}`} onClick={() => { setRowAction({ id: c.id, kind: 'schedule' }); setScheduleAt(''); }}>Schedule</button>
                                                                        <button className="broadcasts__btn broadcasts__btn--sm broadcasts__btn--danger" aria-label={`Send ${c.name}`} onClick={() => { setConfirmTarget({ kind: 'send', id: c.id, name: c.name }); setConfirmWord(''); }}>Send</button>
                                                                    </>
                                                                )}
                                                            </td>
                                                        </tr>
                                                        {stats[c.id] && (
                                                            <tr key={`${c.id}-stats`} className="broadcasts__stats-row">
                                                                <td colSpan={5} className="broadcasts__muted">
                                                                    sent {stats[c.id].sent}/{stats[c.id].to_send} · views {stats[c.id].views} · clicks {stats[c.id].clicks} · bounces {stats[c.id].bounces}
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {rowAction?.id === c.id && rowAction.kind === 'test' && (
                                                            <tr key={`${c.id}-test`} className="broadcasts__action-row">
                                                                <td colSpan={5}>
                                                                    <div className="broadcasts__inline-form">
                                                                        <input className="broadcasts__input" placeholder="you@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} aria-label="Test e-mail address" />
                                                                        <button className="broadcasts__btn broadcasts__btn--sm" disabled={acting || !testEmail.includes('@')} onClick={() => void runTestSend(c.id)}>Send test</button>
                                                                        <button className="broadcasts__btn broadcasts__btn--sm broadcasts__btn--ghost" onClick={() => setRowAction(null)}>Cancel</button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {rowAction?.id === c.id && rowAction.kind === 'schedule' && (
                                                            <tr key={`${c.id}-schedule`} className="broadcasts__action-row">
                                                                <td colSpan={5}>
                                                                    <div className="broadcasts__inline-form">
                                                                        <input type="datetime-local" className="broadcasts__input" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} aria-label="Schedule date and time" />
                                                                        <button className="broadcasts__btn broadcasts__btn--sm" disabled={acting || !scheduleAt} onClick={() => { setConfirmTarget({ kind: 'schedule', id: c.id, name: c.name, sendAt: scheduleAt }); setConfirmWord(''); }}>Schedule send</button>
                                                                        <button className="broadcasts__btn broadcasts__btn--sm broadcasts__btn--ghost" onClick={() => setRowAction(null)}>Cancel</button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                            </section>
                        </>
                    )}

                    {tab === 'audiences' && (
                        <>
                            <section className="broadcasts__composer" aria-label="New audience">
                                <h3 className="broadcasts__section-title">New audience</h3>
                                <div className="broadcasts__form">
                                    <input className="broadcasts__input" placeholder="e.g. Woodland Parc Townhomes — residents" value={newListName} onChange={e => setNewListName(e.target.value)} aria-label="Audience name" />
                                    <select className="broadcasts__input" value={newListOptin} onChange={e => setNewListOptin(e.target.value as 'single' | 'double')} aria-label="Opt-in type">
                                        <option value="single">Single opt-in</option>
                                        <option value="double">Double opt-in</option>
                                    </select>
                                    <button className="broadcasts__btn" disabled={acting || !newListName.trim()} onClick={() => void createAudience()}>Create audience</button>
                                </div>
                            </section>

                            <section aria-label="Audiences">
                                <h3 className="broadcasts__section-title">Audiences</h3>
                                {state.lists.length === 0
                                    ? <p className="broadcasts__muted">No audiences yet — create one above or run tools/listmonk/seed.sh.</p>
                                    : (
                                        <table className="broadcasts__table">
                                            <thead><tr><th>Name</th><th>Subscribers</th><th></th></tr></thead>
                                            <tbody>
                                                {state.lists.map(l => (
                                                    <tr key={l.id}>
                                                        <td>{l.name}</td>
                                                        <td>{typeof l.subscriber_count === 'number' ? l.subscriber_count : '—'}</td>
                                                        <td><button className="broadcasts__btn broadcasts__btn--sm" aria-label={`Browse ${l.name}`} onClick={() => void browseAudience(l.id)}>Browse</button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                {browseListId !== null && (
                                    <div className="broadcasts__browse" aria-label="Subscribers">
                                        {browse === null
                                            ? <p className="broadcasts__muted">Loading subscribers…</p>
                                            : (
                                                <>
                                                    <p className="broadcasts__muted">{browse.total} subscriber{browse.total === 1 ? '' : 's'} (first {browse.subscribers.length} shown)</p>
                                                    <ul className="broadcasts__sub-list">
                                                        {browse.subscribers.map(s => (
                                                            <li key={s.id}><strong>{s.name || s.email}</strong> <span className="broadcasts__muted">{s.email}</span></li>
                                                        ))}
                                                    </ul>
                                                </>
                                            )}
                                    </div>
                                )}
                            </section>

                            <section className="broadcasts__composer" aria-label="Import from Strata">
                                <h3 className="broadcasts__section-title">Import from Strata</h3>
                                <div className="broadcasts__form">
                                    <select className="broadcasts__input" value={importSource} onChange={e => { setImportSource(e.target.value as ImportSource); setImportRows(null); }} aria-label="Import source">
                                        <option value="residents">Residents</option>
                                        <option value="owners">Owners</option>
                                        <option value="vendors">Vendors</option>
                                    </select>
                                    <select className="broadcasts__input" value={importListId} onChange={e => setImportListId(e.target.value)} aria-label="Target audience">
                                        <option value="">Target audience…</option>
                                        {state.lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                    <button className="broadcasts__btn" disabled={importLoading} onClick={() => void loadImportRows()}>
                                        {importLoading ? 'Loading…' : 'Load contacts'}
                                    </button>
                                </div>
                                <label className="broadcasts__toggle">
                                    <input type="checkbox" checked={addAsUnconfirmed} onChange={e => setAddAsUnconfirmed(e.target.checked)} aria-label="Add as unconfirmed" />
                                    Add as unconfirmed (they confirm before double-opt-in lists deliver)
                                </label>
                                <p className="broadcasts__muted broadcasts__consent-note">
                                    Honesty note: having a contact on file is not marketing consent. Tick only
                                    people who agreed to receive notices; imports UPSERT and never delete.
                                </p>
                                {importRows && (
                                    <>
                                        <ul className="broadcasts__import-list" aria-label="Import candidates">
                                            {importRows.map((row, i) => (
                                                <li key={row.id}>
                                                    <label className={row.email ? '' : 'broadcasts__muted'}>
                                                        <input
                                                            type="checkbox"
                                                            checked={row.checked}
                                                            disabled={!row.email}
                                                            onChange={e => setImportRows(rows => (rows || []).map((r2, j) => (j === i ? { ...r2, checked: e.target.checked } : r2)))}
                                                            aria-label={`Include ${row.name}`}
                                                        />
                                                        {row.name} <span className="broadcasts__muted">{row.email || 'no e-mail on file'}</span>
                                                    </label>
                                                </li>
                                            ))}
                                        </ul>
                                        <button
                                            className="broadcasts__btn"
                                            disabled={acting || !importListId || !importRows.some(r => r.checked && r.email)}
                                            onClick={() => void runImport()}
                                        >
                                            Import {importRows.filter(r => r.checked && r.email).length} selected
                                        </button>
                                    </>
                                )}
                            </section>
                        </>
                    )}

                    {tab === 'templates' && (
                        <section aria-label="Templates">
                            <h3 className="broadcasts__section-title">Templates</h3>
                            {state.templates.length === 0
                                ? <p className="broadcasts__muted">No templates yet — run tools/listmonk/seed.sh for the four notice templates.</p>
                                : (
                                    <table className="broadcasts__table">
                                        <thead><tr><th>Name</th><th></th></tr></thead>
                                        <tbody>
                                            {state.templates.map(t => (
                                                <tr key={t.id}>
                                                    <td>{t.name}</td>
                                                    <td><button className="broadcasts__btn broadcasts__btn--sm" aria-label={`Preview ${t.name}`} onClick={() => void loadPreview(t.id)}>Preview</button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            {preview && (
                                <iframe
                                    className="broadcasts__preview"
                                    title="Template preview"
                                    sandbox=""
                                    srcDoc={preview.html}
                                />
                            )}
                        </section>
                    )}

                    {tab === 'admin' && (
                        !listmonkUrl ? (
                            <div className="broadcasts__empty" data-state="admin-needs-env">
                                <h3>Admin embed not configured</h3>
                                <p>
                                    Set <code>VITE_LISTMONK_URL</code> (e.g. https://lists.dwellium.com) to embed
                                    the full listmonk admin here. The tools/listmonk Caddy sidecar already sends
                                    the <code>frame-ancestors</code> header that allows this app to frame it.
                                </p>
                            </div>
                        ) : adminReach === 'down' ? (
                            <div className="broadcasts__empty" data-state="unreachable">
                                <h3>listmonk isn’t reachable</h3>
                                <p>The e2-micro may be down or DNS not set — tools/listmonk/README has the checks.</p>
                                <div className="broadcasts__inline-form">
                                    <button className="broadcasts__btn" onClick={() => setAdminKey(k => k + 1)}>Re-check</button>
                                    <a className="broadcasts__link" href={listmonkUrl} target="_blank" rel="noreferrer">Open ↗</a>
                                </div>
                            </div>
                        ) : (
                            <iframe
                                key={adminKey}
                                className="broadcasts__admin-frame"
                                src={listmonkUrl}
                                title="listmonk admin"
                                allow="clipboard-read; clipboard-write; fullscreen"
                            />
                        )
                    )}
                </>
            )}

            {confirmTarget && (
                <div className="broadcasts__dialog-backdrop">
                    <div className="broadcasts__dialog" role="dialog" aria-label="Confirm send">
                        <h3>{confirmTarget.kind === 'send' ? 'Send this campaign?' : 'Schedule this campaign?'}</h3>
                        <p>
                            {confirmTarget.kind === 'send'
                                ? <>“{confirmTarget.name}” will be e-mailed to the whole audience now.</>
                                : <>“{confirmTarget.name}” will be e-mailed to the whole audience at {new Date(confirmTarget.sendAt).toLocaleString()}.</>}
                            {' '}Type <strong>SEND</strong> to confirm.
                        </p>
                        <input
                            className="broadcasts__input"
                            value={confirmWord}
                            onChange={e => setConfirmWord(e.target.value)}
                            aria-label="Type SEND to confirm"
                            placeholder="SEND"
                        />
                        <div className="broadcasts__inline-form">
                            <button
                                className="broadcasts__btn broadcasts__btn--danger"
                                disabled={acting || confirmWord !== 'SEND'}
                                onClick={() => void runConfirmed()}
                            >
                                {confirmTarget.kind === 'send' ? 'Confirm send' : 'Confirm schedule'}
                            </button>
                            <button className="broadcasts__btn broadcasts__btn--ghost" onClick={() => { setConfirmTarget(null); setConfirmWord(''); }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
