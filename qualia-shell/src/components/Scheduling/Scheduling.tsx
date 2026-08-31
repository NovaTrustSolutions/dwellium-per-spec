/**
 * Scheduling — plan 047 phase 2 + plan 053 (hosted cal.com free individual plan).
 *
 * Three tabs, TWO INDEPENDENT setup gates — never conflated:
 *   Book     — the booking page in a plain iframe. Gate: VITE_CALCOM_URL
 *              (cal.com booking pages ship no X-Frame-Options / frame-ancestors,
 *              and the official embed.js is itself an iframe over the same page,
 *              so no new dependency is needed).
 *   Upcoming — real bookings from the backend proxy, with cancel.
 *              Gate: CALCOM_API_KEY on the backend (503 → needsSetup).
 *   Links    — Andy's four event types per property, prefilled + copy + QR.
 *              Gate: VITE_CALCOM_URL only (pure URL building, no API key).
 *
 * The embed gate and the API gate are reported separately: the iframe can work
 * while the API does not, and the Links tab works with neither key.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Copy, ExternalLink, QrCode, RefreshCw, X } from 'lucide-react';
import { openWidget } from '../../lib/dwelliumCommands';
import {
    ANDY_EVENT_TYPES, ANDY_PROPERTIES, buildBookingLink, calcomBase, calcomUrl,
} from './calcomLinks';
import { cancelBooking, listUpcomingBookings, type CalBooking } from './schedulingApi';
import { qrDataUri } from './qr';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { useWidgetMemory } from '../../lib/widgetMemory';
import './Scheduling.css';

type Env = Record<string, string | undefined>;

/** Re-exported for the plan-047 widget test and the Tools hub status mirror. */
export { calcomUrl };

type Tab = 'book' | 'upcoming' | 'links';

type BookingsState =
    | { kind: 'loading' }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; bookings: CalBooking[] };

const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'book', label: 'Book' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'links', label: 'Links' },
];

function formatWhen(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? iso
        : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The embed gate — VITE_CALCOM_URL is unset. */
function EmbedNeedsSetup() {
    return (
        <div className="scheduling__empty" data-state="needs-setup-embed">
            <CalendarDays size={28} aria-hidden />
            <h3>Connect Cal.com</h3>
            <p>
                Showings, maintenance windows and vendor visits book themselves through a
                cal.com page. Create a free cal.com account (free forever, 1 user, unlimited
                event types), then paste your booking URL — e.g.{' '}
                <code>https://cal.com/andy/unit-showing</code> — into the Netlify env as{' '}
                <code>VITE_CALCOM_URL</code>. This widget and the Tools hub flip to Ready
                automatically.
            </p>
            <div className="scheduling__actions">
                <a className="scheduling__link" href="https://cal.com/signup" target="_blank" rel="noreferrer">
                    Create a free cal.com account <ExternalLink size={12} aria-hidden />
                </a>
                <button className="scheduling__btn" onClick={() => openWidget('tools-hub')}>Open Tools hub</button>
            </div>
        </div>
    );
}

/** The API gate — the backend has no CALCOM_API_KEY. Distinct from the embed gate. */
function ApiNeedsSetup() {
    return (
        <div className="scheduling__empty" data-state="needs-setup-api">
            <CalendarDays size={28} aria-hidden />
            <h3>Cal.com API key not set</h3>
            <p>
                The booking page works without this. To list and cancel bookings inside
                Dwellium, create an API key in cal.com under{' '}
                <strong>Settings → Security → API keys</strong> and set{' '}
                <code>CALCOM_API_KEY</code> on the backend. Booking links and QR codes on the{' '}
                <strong>Links</strong> tab work without a key.
            </p>
            <div className="scheduling__actions">
                <a className="scheduling__link" href="https://app.cal.com/settings/developer/api-keys" target="_blank" rel="noreferrer">
                    Open cal.com API keys <ExternalLink size={12} aria-hidden />
                </a>
            </div>
        </div>
    );
}

function UpcomingTab() {
    const [state, setState] = useState<BookingsState>({ kind: 'loading' });
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setState({ kind: 'loading' });
        const r = await listUpcomingBookings();
        setState(
            r.kind === 'ok'
                ? { kind: 'ok', bookings: r.data }
                : r.kind === 'needs-setup'
                    ? { kind: 'needs-setup' }
                    : { kind: 'error', message: r.message },
        );
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const cancel = async (booking: CalBooking) => {
        const reason = window.prompt(`Cancel "${booking.title}"? Reason (optional):`);
        if (reason === null) return;
        setBusy(booking.uid);
        const r = await cancelBooking(booking.uid, reason || 'Cancelled from Dwellium');
        setBusy(null);
        if (r.kind === 'ok') { setNotice(`Cancelled ${booking.title}`); void refresh(); }
        else if (r.kind === 'needs-setup') setState({ kind: 'needs-setup' });
        else setNotice(r.message);
    };

    if (state.kind === 'needs-setup') return <ApiNeedsSetup />;
    if (state.kind === 'loading') return <p className="scheduling__note">Loading bookings…</p>;
    if (state.kind === 'error') {
        return (
            <div className="scheduling__empty" data-state="error">
                <h3>Could not reach the booking API</h3>
                <p>{state.message}</p>
                <button className="scheduling__btn" onClick={() => void refresh()}>
                    <RefreshCw size={12} aria-hidden /> Retry
                </button>
            </div>
        );
    }

    return (
        <div className="scheduling__list">
            <div className="scheduling__listhead">
                <span>{state.bookings.length} upcoming</span>
                <button className="scheduling__btn" onClick={() => void refresh()} aria-label="Refresh bookings">
                    <RefreshCw size={12} aria-hidden /> Refresh
                </button>
            </div>
            {notice && <p className="scheduling__note">{notice}</p>}
            {state.bookings.length === 0 ? (
                <p className="scheduling__note">No upcoming bookings. Share a link from the Links tab.</p>
            ) : state.bookings.map(b => (
                <div className="scheduling__row" key={b.uid}>
                    <div>
                        <div className="scheduling__rowtitle">{b.title}</div>
                        <div className="scheduling__rowmeta">
                            {formatWhen(b.start)}
                            {b.attendees?.[0]?.name ? ` · ${b.attendees[0].name}` : ''}
                            {b.status ? ` · ${b.status}` : ''}
                        </div>
                    </div>
                    <button
                        className="scheduling__btn"
                        disabled={busy === b.uid}
                        onClick={() => void cancel(b)}
                        aria-label={`Cancel ${b.title}`}
                    >
                        <X size={12} aria-hidden /> {busy === b.uid ? 'Cancelling…' : 'Cancel'}
                    </button>
                </div>
            ))}
        </div>
    );
}

function LinksTab({ base }: { base: string }) {
    const [property, setProperty] = useState(ANDY_PROPERTIES[0]);
    const [qrFor, setQrFor] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    const copy = (link: string, slug: string) => {
        void navigator.clipboard?.writeText(link);
        setCopied(slug);
    };

    return (
        <div className="scheduling__list">
            <label className="scheduling__listhead">
                Property
                <select value={property} onChange={e => { setProperty(e.target.value); setQrFor(null); setCopied(null); }}>
                    {ANDY_PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </label>
            {ANDY_EVENT_TYPES.map(ev => {
                const link = buildBookingLink(base, ev.slug, { notes: property });
                const qr = qrDataUri(link);
                return (
                    <div className="scheduling__row scheduling__row--stack" key={ev.slug}>
                        <div>
                            <div className="scheduling__rowtitle">{ev.label} · {ev.minutes} min</div>
                            <div className="scheduling__rowmeta">{ev.purpose}</div>
                            <code className="scheduling__url">{link}</code>
                        </div>
                        <div className="scheduling__actions">
                            <button className="scheduling__btn" onClick={() => copy(link, ev.slug)} aria-label={`Copy ${ev.label} link`}>
                                <Copy size={12} aria-hidden /> {copied === ev.slug ? 'Copied' : 'Copy'}
                            </button>
                            <button
                                className="scheduling__btn"
                                onClick={() => setQrFor(qrFor === ev.slug ? null : ev.slug)}
                                aria-label={`Show QR for ${ev.label}`}
                            >
                                <QrCode size={12} aria-hidden /> QR
                            </button>
                            <a className="scheduling__link" href={link} target="_blank" rel="noreferrer">
                                Open ↗
                            </a>
                        </div>
                        {qrFor === ev.slug && (
                            qr
                                ? <img className="scheduling__qr" src={qr} alt={`QR code for the ${ev.label} booking link`} width={140} height={140} />
                                : <p className="scheduling__note">Link is too long to encode as a QR — use Copy.</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function Scheduling({ env }: { env?: Env }) {
    usePerUserIdentity();
    // Plan 055 phase 2 — the active tab reopens where it was left.
    const [mem, patchMem] = useWidgetMemory('scheduling', { tab: 'book' });
    const tab: Tab = (['book', 'upcoming', 'links'] as const).includes(mem.tab as Tab) ? (mem.tab as Tab) : 'book';
    const setTab = (t: Tab): void => patchMem({ tab: t });
    const url = calcomUrl(env);
    const base = calcomBase(env);

    return (
        <div className="scheduling">
            <div className="scheduling__head">
                <h2 className="scheduling__title"><CalendarDays size={16} aria-hidden /> Scheduling</h2>
                {url && (
                    <a className="scheduling__link" href={url} target="_blank" rel="noreferrer">
                        Open ↗
                    </a>
                )}
            </div>

            <div className="scheduling__tabs" role="tablist">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        className={`scheduling__tab${tab === t.id ? ' is-active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'book' && (url
                ? <iframe
                    className="scheduling__frame"
                    src={url}
                    title="Scheduling booking page"
                    allow="clipboard-read; clipboard-write"
                />
                : <EmbedNeedsSetup />)}

            {tab === 'upcoming' && <UpcomingTab />}

            {tab === 'links' && (base ? <LinksTab base={base} /> : <EmbedNeedsSetup />)}
        </div>
    );
}
