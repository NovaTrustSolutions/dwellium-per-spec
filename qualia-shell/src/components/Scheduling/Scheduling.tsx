/**
 * Scheduling — plan 047 phase 2 (zero-cost addendum 2026-08-20): hosted
 * cal.com free individual plan, no self-hosted cal.diy.
 *
 * Embeds Andy's cal.com booking page (VITE_CALCOM_URL) in a plain iframe —
 * cal.com booking pages ship no X-Frame-Options / frame-ancestors (verified
 * 2026-08-20 via curl), and the official embed.js is itself an iframe over the
 * same public page, so no new dependency is needed. Env unset → the ESign-style
 * needs-setup card; the Tools hub row flips `needs-setup` → `ready` off the
 * same env (data/toolsHub.ts::resolveToolStatus).
 */
import { CalendarDays, ExternalLink } from 'lucide-react';
import { openWidget } from '../../lib/dwelliumCommands';
import './Scheduling.css';

type Env = Record<string, string | undefined>;
const viteEnv = (): Env => (import.meta as unknown as { env?: Env }).env ?? {};

/** Booking-page URL from env (exported for tests; mirrors toolStatuses(env)). */
export function calcomUrl(env: Env = viteEnv()): string | undefined {
    const raw = env.VITE_CALCOM_URL?.trim();
    return raw ? raw : undefined;
}

export default function Scheduling({ env }: { env?: Env }) {
    const url = calcomUrl(env);

    if (!url) {
        return (
            <div className="scheduling">
                <div className="scheduling__head">
                    <h2 className="scheduling__title"><CalendarDays size={16} aria-hidden /> Scheduling</h2>
                </div>
                <div className="scheduling__empty" data-state="needs-setup">
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
            </div>
        );
    }

    return (
        <div className="scheduling">
            <div className="scheduling__head">
                <h2 className="scheduling__title"><CalendarDays size={16} aria-hidden /> Scheduling</h2>
                <a className="scheduling__link" href={url} target="_blank" rel="noreferrer">
                    Open ↗
                </a>
            </div>
            <iframe
                className="scheduling__frame"
                src={url}
                title="Scheduling booking page"
                allow="clipboard-read; clipboard-write"
            />
        </div>
    );
}
