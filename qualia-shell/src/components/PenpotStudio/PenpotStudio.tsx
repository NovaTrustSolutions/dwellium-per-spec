/**
 * PenpotStudio — plan 047 phase 2 (zero-cost addendum 2026-08-20): Design
 * Studio launcher over Penpot's free cloud (design.penpot.app).
 *
 * Launcher-only on purpose: design.penpot.app sends `X-Frame-Options:
 * SAMEORIGIN` (verified 2026-08-20 via curl), so the cloud editor cannot be
 * iframed — an in-window embed needs the phase-3 self-host behind Caddy with
 * the header dropped. Env `VITE_PENPOT_URL` overrides the target (that future
 * self-host); with no env the widget is still `ready` — nothing to set up.
 */
import { ExternalLink, Palette } from 'lucide-react';
import './PenpotStudio.css';

type Env = Record<string, string | undefined>;
const viteEnv = (): Env => (import.meta as unknown as { env?: Env }).env ?? {};

export const PENPOT_DEFAULT_URL = 'https://design.penpot.app';

/** Penpot URL from env with the free-cloud default (exported for tests). */
export function penpotUrl(env: Env = viteEnv()): string {
    const raw = env.VITE_PENPOT_URL?.trim();
    return raw ? raw : PENPOT_DEFAULT_URL;
}

export default function PenpotStudio({ env }: { env?: Env }) {
    const url = penpotUrl(env);

    return (
        <div className="penpot-studio">
            <div className="penpot-studio__head">
                <h2 className="penpot-studio__title"><Palette size={16} aria-hidden /> Design Studio</h2>
            </div>
            <div className="penpot-studio__card">
                <Palette size={28} aria-hidden />
                <h3>Penpot — open-source design studio</h3>
                <p>
                    Figma-class boards for the paper Andy actually prints: listing flyers,
                    late-rent and inspection notices, move-in checklists and owner-report
                    covers — plus a shared &ldquo;Dwellium Brand&rdquo; library so every
                    property doc looks the same. Free cloud plan; sign in with Google.
                </p>
                <p className="penpot-studio__muted">
                    Penpot&rsquo;s cloud blocks embedding, so it opens in a new tab.
                    An in-window embed arrives with the phase-3 self-host.
                </p>
                <a className="penpot-studio__btn" href={url} target="_blank" rel="noreferrer">
                    Open Penpot <ExternalLink size={12} aria-hidden />
                </a>
            </div>
        </div>
    );
}
