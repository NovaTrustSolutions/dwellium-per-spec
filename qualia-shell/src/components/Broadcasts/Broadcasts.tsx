/**
 * Broadcasts — plan 047 phase 2: listmonk mailing-list widget.
 *
 * Lists (audiences) + recent campaigns via the backend proxy /api/broadcasts,
 * plus a "New notice" composer (template + audience picker) that creates a
 * DRAFT campaign — real sends stay in the listmonk admin. While the backend
 * has no LISTMONK_* env (503) it renders a "Connect listmonk" needs-setup
 * card: listmonk runs on the free e2-micro — see tools/listmonk/README.
 */
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Megaphone, RefreshCw } from 'lucide-react';
import {
    createCampaignDraft,
    listBroadcastCampaigns,
    listBroadcastLists,
    listBroadcastTemplates,
    type BroadcastCampaign,
    type BroadcastList,
    type BroadcastTemplate,
} from './broadcastsApi';
import { openWidget } from '../../lib/dwelliumCommands';
import './Broadcasts.css';

type ViewState =
    | { kind: 'loading' }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; lists: BroadcastList[]; campaigns: BroadcastCampaign[]; templates: BroadcastTemplate[] };

export default function Broadcasts() {
    const [state, setState] = useState<ViewState>({ kind: 'loading' });
    const [subject, setSubject] = useState('');
    const [listId, setListId] = useState('');
    const [templateId, setTemplateId] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

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

    const listmonkUrl = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_LISTMONK_URL;

    const createDraft = async () => {
        const list = Number.parseInt(listId, 10);
        if (!subject.trim() || !Number.isInteger(list)) return;
        setCreating(true);
        setNotice(null);
        const tpl = Number.parseInt(templateId, 10);
        const r = await createCampaignDraft({
            subject: subject.trim(),
            lists: [list],
            ...(Number.isInteger(tpl) ? { template_id: tpl } : {}),
        });
        setCreating(false);
        if (r.kind === 'ok') {
            setNotice('Draft created — review and start it from listmonk when ready.');
            setSubject('');
            void refresh();
        } else if (r.kind === 'needs-setup') {
            setState({ kind: 'needs-setup' });
        } else {
            setNotice(r.message);
        }
    };

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
                        {notice && <p className="broadcasts__notice">{notice}</p>}
                    </section>

                    <section aria-label="Campaigns">
                        <h3 className="broadcasts__section-title">Campaigns</h3>
                        {state.campaigns.length === 0
                            ? <p className="broadcasts__muted">No campaigns yet — create a draft notice above.</p>
                            : (
                                <table className="broadcasts__table">
                                    <thead>
                                        <tr><th>Name</th><th>Subject</th><th>Status</th><th>Created</th></tr>
                                    </thead>
                                    <tbody>
                                        {state.campaigns.map(c => (
                                            <tr key={c.id} data-campaign-status={c.status}>
                                                <td className="broadcasts__campaign-name">{c.name}</td>
                                                <td>{c.subject}</td>
                                                <td><span className={`broadcasts__status broadcasts__status--${c.status}`}>{c.status}</span></td>
                                                <td className="broadcasts__muted">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                    </section>
                </>
            )}
        </div>
    );
}
