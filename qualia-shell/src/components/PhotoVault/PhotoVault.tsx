/**
 * PhotoVault — plan 047 phase 2: Immich photo/video vault widget.
 *
 * Zero-cost addendum (2026-08-20): Immich runs unmodified on the always-on
 * office Mac (Docker Desktop) and is reachable ONLY from inside the Tailscale
 * tailnet at `https://<mac-name>.<tailnet>.ts.net` (env `VITE_IMMICH_URL`).
 *
 * States (LangFlowPanel reachability pattern — never a blank iframe, gate G2):
 *   - env unset      → "Connect Immich" needs-setup card → tools/immich/README.md;
 *   - ping succeeds  → iframe of the Immich web UI (+ "Open ↗" in the toolbar);
 *   - ping fails     → offline card: the Mac only answers inside the tailnet,
 *                      so "Connect to Tailscale to view photos" + Open ↗.
 */
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { openWidget } from '../../lib/dwelliumCommands';
import './PhotoVault.css';

type Reach = 'checking' | 'up' | 'down';

// Injectable env with an import.meta.env default — same pattern as
// ToolsHub::toolStatuses, so tests pass env as a prop instead of stubbing.
export default function PhotoVault({
    env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env,
}: { env?: Record<string, string | undefined> } = {}) {
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
            <div className="pv">
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
            </div>
        );
    }

    const dotColor = reach === 'up' ? '#22c55e' : reach === 'down' ? '#ff6b6b' : '#888';
    const dotLabel = reach === 'up' ? 'Reachable' : reach === 'down' ? 'Not reachable' : 'Checking…';

    return (
        <div className="pv">
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
        </div>
    );
}
