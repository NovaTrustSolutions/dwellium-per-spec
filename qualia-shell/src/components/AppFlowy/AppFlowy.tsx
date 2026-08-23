/**
 * AppFlowy — plan 047 phase 3 / plan 053: AppFlowy Workspace widget.
 *
 * Hosting reality (verified 2026-08-23 via curl):
 *   - The hosted web client `https://appflowy.com/app` answers 200 with NO
 *     X-Frame-Options and no CSP `frame-ancestors` — it embeds.
 *   - The marketing site root `https://appflowy.com` (appflowy.io redirects
 *     there) sends `X-Frame-Options: SAMEORIGIN` — launcher only.
 *   - A self-host (tools/appflowy — unmodified AppFlowy-Cloud stack) embeds
 *     because our nginx.conf adds `frame-ancestors` for the Dwellium origins.
 *
 * States (PhotoVault reachability pattern — never a blank iframe, gate G2):
 *   - env unset            → "Connect AppFlowy" card: hosted free plan
 *                            (1 workspace, 2 members) or self-host, then
 *                            VITE_APPFLOWY_URL;
 *   - env set, not embeddable → launcher card with "Open AppFlowy ↗";
 *   - env set + ping ok    → iframe of AppFlowy Web (+ "Open ↗" toolbar);
 *   - env set + ping fails → retry card with Re-check + Open ↗.
 */
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { openWidget } from '../../lib/dwelliumCommands';
import './AppFlowy.css';

type Reach = 'checking' | 'up' | 'down';

/** The hosted AppFlowy Web client (free plan) — the value most users set. */
export const APPFLOWY_HOSTED_APP = 'https://appflowy.com/app';

/**
 * Can this URL be iframed? A no-cors fetch can't read response headers
 * (same limitation as FluidOS's host list), so this encodes what curl
 * verified 2026-08-23: on appflowy.com/appflowy.io only the `/app` web
 * client omits X-Frame-Options — the marketing pages send SAMEORIGIN.
 * Any other host is assumed self-hosted behind tools/appflowy's nginx,
 * which sets `frame-ancestors` for the Dwellium origins.
 */
export function appflowyEmbeddable(url: string): boolean {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        if (host === 'appflowy.com' || host === 'appflowy.io') {
            return u.pathname === '/app' || u.pathname.startsWith('/app/');
        }
        return true;
    } catch {
        return false; // unparseable env value → launcher, never a broken iframe
    }
}

// Injectable env with an import.meta.env default — same pattern as PhotoVault,
// so tests pass env as a prop instead of stubbing.
export default function AppFlowy({
    env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env,
}: { env?: Record<string, string | undefined> } = {}) {
    const url = env?.VITE_APPFLOWY_URL?.trim().replace(/\/$/, '') || undefined;
    const embeddable = url ? appflowyEmbeddable(url) : false;

    const [reach, setReach] = useState<Reach>('checking');
    const [iframeKey, setIframeKey] = useState(0);

    // Best-effort reachability: a no-cors fetch resolves if the server answers,
    // rejects on a connection error (self-host down, DNS gone, offline).
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
        if (url && embeddable) void checkReach(url);
    }, [url, embeddable, iframeKey, checkReach]);

    if (!url) {
        return (
            <div className="af">
                <div className="af__empty" data-state="needs-setup">
                    <BookOpen size={28} aria-hidden />
                    <h3>Connect AppFlowy</h3>
                    <p>
                        Notion-style docs, grids and kanban for the property desk — lease
                        tracker, vendor board and SOPs ship ready to import from
                        <code> tools/appflowy/templates/</code> (see IMPORT.md there).
                    </p>
                    <p>
                        <strong>Hosted (free):</strong> sign up at appflowy.com — the free
                        plan gives 1 collaborative workspace with up to 2 members — then set{' '}
                        <code>VITE_APPFLOWY_URL={APPFLOWY_HOSTED_APP}</code>.
                        <br />
                        <strong>Self-host:</strong> run the unmodified AppFlowy-Cloud stack
                        per <code>tools/appflowy/README.md</code> (~10 containers — read the
                        RAM caveats first), then set <code>VITE_APPFLOWY_URL</code> to it.
                        This card flips to the live workspace automatically.
                    </p>
                    <button className="af__btn" onClick={() => openWidget('tools-hub')}>Open Tools hub</button>
                </div>
            </div>
        );
    }

    if (!embeddable) {
        return (
            <div className="af">
                <div className="af__empty" data-state="launcher">
                    <BookOpen size={28} aria-hidden />
                    <h3>AppFlowy opens in a new tab</h3>
                    <p>
                        This address refuses framing (its <code>X-Frame-Options</code> is on
                        their side, not a Dwellium bug), so it can&rsquo;t appear in-window.
                        Point <code>VITE_APPFLOWY_URL</code> at <code>{APPFLOWY_HOSTED_APP}</code>{' '}
                        or your self-host to embed it here instead.
                    </p>
                    <a className="af__btn" href={url} target="_blank" rel="noreferrer">
                        Open AppFlowy ↗ <ExternalLink size={12} aria-hidden />
                    </a>
                </div>
            </div>
        );
    }

    const dotColor = reach === 'up' ? '#22c55e' : reach === 'down' ? '#ff6b6b' : '#888';
    const dotLabel = reach === 'up' ? 'Reachable' : reach === 'down' ? 'Not reachable' : 'Checking…';

    return (
        <div className="af">
            <div className="af__toolbar">
                <span className="af__dot" style={{ background: dotColor }} title={dotLabel} />
                <span className="af__url" title={url}>{url}</span>
                <button className="af__btn af__btn--ghost" onClick={() => setIframeKey(k => k + 1)} title="Re-check and reload" aria-label="Re-check and reload AppFlowy">
                    <RefreshCw size={14} aria-hidden />
                </button>
                <a className="af__link" href={url} target="_blank" rel="noreferrer">
                    Open ↗ <ExternalLink size={12} aria-hidden />
                </a>
            </div>

            <div className="af__frame-wrap">
                {reach === 'down' ? (
                    <div className="af__empty" data-state="unreachable">
                        <BookOpen size={28} aria-hidden />
                        <h3>AppFlowy isn&rsquo;t reachable</h3>
                        <p>
                            The workspace at this address didn&rsquo;t answer. If it&rsquo;s
                            the self-host, the stack may be down —{' '}
                            <code>tools/appflowy/README.md</code> has the fixes
                            (<code>docker compose ps</code> first). Otherwise check your
                            connection and re-check.
                        </p>
                        <div className="af__actions">
                            <button className="af__btn" onClick={() => checkReach(url)}>Re-check</button>
                            <button className="af__btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open ↗</button>
                        </div>
                    </div>
                ) : (
                    <iframe
                        key={iframeKey}
                        className="af__frame"
                        src={url}
                        title="AppFlowy Workspace"
                        allow="clipboard-read; clipboard-write; fullscreen"
                    />
                )}
            </div>
        </div>
    );
}
