/**
 * ShortLinks — plan 047 phase 2: "Links & QR" widget over the Dub proxy.
 *
 * Create-link form (URL + optional custom key), list with click counts, and a
 * QR image per link (Dub serves the PNG from its unauthenticated /qr
 * endpoint via the link's `qrCode` URL). While the backend has no DUB_API_KEY
 * (503) it renders a "Connect Dub" needs-setup card — the dub.co free plan
 * (~25 links/mo) covers notices, signage and QR trials.
 */
import { useCallback, useEffect, useState } from 'react';
import { Copy, QrCode, RefreshCw } from 'lucide-react';
import { createShortLink, listShortLinks, type ShortLink } from './shortLinksApi';
import { openWidget } from '../../lib/dwelliumCommands';
import './ShortLinks.css';

type ViewState =
    | { kind: 'loading' }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; links: ShortLink[] };

export default function ShortLinks() {
    const [state, setState] = useState<ViewState>({ kind: 'loading' });
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [qrFor, setQrFor] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setState({ kind: 'loading' });
        const r = await listShortLinks();
        setState(
            r.kind === 'ok'
                ? { kind: 'ok', links: r.data }
                : r.kind === 'needs-setup'
                    ? { kind: 'needs-setup' }
                    : { kind: 'error', message: r.message },
        );
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const create = async () => {
        if (!/^https?:\/\/\S+$/i.test(url.trim())) return;
        setCreating(true);
        setNotice(null);
        const r = await createShortLink({ url: url.trim(), ...(key.trim() ? { key: key.trim() } : {}) });
        setCreating(false);
        if (r.kind === 'ok') {
            setNotice(`Created ${r.data?.shortLink ?? 'link'}`);
            setUrl('');
            setKey('');
            void refresh();
        } else if (r.kind === 'needs-setup') {
            setState({ kind: 'needs-setup' });
        } else {
            setNotice(r.message);
        }
    };

    const copy = (text: string) => {
        void navigator.clipboard?.writeText(text);
        setNotice(`Copied ${text}`);
    };

    return (
        <div className="short-links">
            <div className="short-links__head">
                <h2 className="short-links__title"><QrCode size={16} aria-hidden /> Links &amp; QR</h2>
                <button className="short-links__btn short-links__btn--ghost" onClick={() => void refresh()} aria-label="Refresh short links">
                    <RefreshCw size={14} aria-hidden />
                </button>
            </div>

            {state.kind === 'loading' && <p className="short-links__muted">Loading links…</p>}

            {state.kind === 'needs-setup' && (
                <div className="short-links__empty" data-state="needs-setup">
                    <QrCode size={28} aria-hidden />
                    <h3>Connect Dub</h3>
                    <p>
                        Links &amp; QR mints branded short links and QR codes through the Dub API.
                        Set DUB_API_KEY on the backend — the dub.co free plan (~25 links/mo, QR
                        included) covers notices, unit signage and work-order trials.
                    </p>
                    <button className="short-links__btn" onClick={() => openWidget('tools-hub')}>Open Tools hub</button>
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
                            <button
                                className="short-links__btn"
                                disabled={creating || !/^https?:\/\/\S+$/i.test(url.trim())}
                                onClick={() => void create()}
                            >
                                {creating ? 'Creating…' : 'Create link'}
                            </button>
                        </div>
                        {notice && <p className="short-links__notice">{notice}</p>}
                    </section>

                    {state.links.length === 0
                        ? (
                            <div className="short-links__empty" data-state="none-yet">
                                <h3>No links yet</h3>
                                <p>Shorten a Tenant Portal or published-doc URL above, then print its QR.</p>
                            </div>
                        )
                        : (
                            <table className="short-links__table">
                                <thead>
                                    <tr><th>Short link</th><th>Destination</th><th>Clicks</th><th aria-label="Actions" /></tr>
                                </thead>
                                <tbody>
                                    {state.links.map(l => (
                                        <tr key={l.id}>
                                            <td className="short-links__short">{l.shortLink}</td>
                                            <td className="short-links__dest" title={l.url}>{l.url}</td>
                                            <td>{l.clicks}</td>
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
                                                {qrFor === l.id && (
                                                    <img className="short-links__qr" src={l.qrCode} alt={`QR code for ${l.shortLink}`} width={120} height={120} />
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
