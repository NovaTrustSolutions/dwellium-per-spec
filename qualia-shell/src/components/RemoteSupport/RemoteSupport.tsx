/**
 * RemoteSupport — plan 047 phase 2 (zero-cost addendum 2026-08-20): RustDesk
 * launcher. No in-window session (OSS RustDesk has no embeddable web client —
 * phase-3 spike); this card gets a machine connected:
 *
 *   1. install the stock RustDesk client (AGPL, unmodified — download links
 *      verified 2026-08-20 against github.com/rustdesk/rustdesk v1.4.9);
 *   2. point it at our relay — env `VITE_RUSTDESK_RELAY` in the form
 *      `host:port,key` (hbbs/hbbr on the free e2-micro; compose + gcloud
 *      commands in tools/rustdesk/README.md at the repo root). Env unset →
 *      RustDesk's built-in community servers work out of the box (rendezvous
 *      only, no key) and the Tools hub row shows `needs-setup`.
 */
import { useState } from 'react';
import { Copy, ExternalLink, Monitor } from 'lucide-react';
import './RemoteSupport.css';

type Env = Record<string, string | undefined>;
const viteEnv = (): Env => (import.meta as unknown as { env?: Env }).env ?? {};

export interface RustdeskRelay {
    /** ID/relay server, e.g. `remote.example.com:21116`. */
    server: string;
    /** hbbs public key (data/id_ed25519.pub) — optional while testing. */
    key?: string;
}

/** Parse `VITE_RUSTDESK_RELAY` = `host:port,key` (key optional). Exported for tests. */
export function parseRustdeskRelay(raw: string | undefined): RustdeskRelay | null {
    const trimmed = raw?.trim();
    if (!trimmed) return null;
    const [server, key] = trimmed.split(',').map(s => s.trim());
    if (!server) return null;
    return key ? { server, key } : { server };
}

// Verified 2026-08-20 (github.com/rustdesk/rustdesk releases/latest → 1.4.9).
const DOWNLOADS = [
    { label: 'macOS (Apple Silicon)', href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-aarch64.dmg' },
    { label: 'macOS (Intel)', href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-x86_64.dmg' },
    { label: 'Windows (64-bit)', href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-x86_64.exe' },
];
const ALL_RELEASES = 'https://github.com/rustdesk/rustdesk/releases/latest';

export default function RemoteSupport({ env }: { env?: Env }) {
    const relay = parseRustdeskRelay((env ?? viteEnv()).VITE_RUSTDESK_RELAY);
    const [copied, setCopied] = useState('');

    const copy = async (tag: string, text: string) => {
        try {
            await navigator.clipboard?.writeText(text);
            setCopied(tag);
            setTimeout(() => setCopied(''), 2500);
        } catch { /* ignore — clipboard unavailable */ }
    };

    return (
        <div className="remote-support">
            <div className="remote-support__head">
                <h2 className="remote-support__title"><Monitor size={16} aria-hidden /> Remote Support</h2>
                <a className="remote-support__link" href={ALL_RELEASES} target="_blank" rel="noreferrer">
                    All releases <ExternalLink size={12} aria-hidden />
                </a>
            </div>

            <section className="remote-support__panel">
                <h3>1 · Install RustDesk on the machine</h3>
                <p>Stock client (open source, TeamViewer-style). Install it on the office PC, kiosk, or the resident&rsquo;s computer.</p>
                <ul className="remote-support__downloads">
                    {DOWNLOADS.map(d => (
                        <li key={d.label}>
                            <a className="remote-support__link" href={d.href} target="_blank" rel="noreferrer">
                                {d.label} <ExternalLink size={12} aria-hidden />
                            </a>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="remote-support__panel">
                <h3>2 · Point it at your relay</h3>
                {relay ? (
                    <>
                        <p>In RustDesk: Settings → Network → ID/Relay server. Paste these values, then read the machine&rsquo;s ID over the phone and connect from your own RustDesk.</p>
                        <dl className="remote-support__config">
                            <div className="remote-support__row">
                                <dt>ID / Relay server</dt>
                                <dd><code>{relay.server}</code></dd>
                                <button className="remote-support__btn" onClick={() => void copy('server', relay.server)} aria-label="Copy server address">
                                    <Copy size={12} aria-hidden /> {copied === 'server' ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            {relay.key && (
                                <div className="remote-support__row">
                                    <dt>Key</dt>
                                    <dd><code>{relay.key}</code></dd>
                                    <button className="remote-support__btn" onClick={() => void copy('key', relay.key!)} aria-label="Copy relay key">
                                        <Copy size={12} aria-hidden /> {copied === 'key' ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                            )}
                        </dl>
                    </>
                ) : (
                    <p className="remote-support__muted" data-state="community-relay">
                        No private relay is configured yet — RustDesk&rsquo;s free community
                        servers are used by default, which is fine for a first test but slower
                        and shared. To run our own on the free e2-micro, follow{' '}
                        <code>tools/rustdesk/README.md</code> in the repo, then set{' '}
                        <code>VITE_RUSTDESK_RELAY=host:port,key</code> in the Netlify env —
                        this panel and the Tools hub flip to Ready automatically.
                    </p>
                )}
            </section>

            <p className="remote-support__muted">
                Never share the machine&rsquo;s permanent password by chat — read the one-time
                ID/confirmation over the phone instead.
            </p>
        </div>
    );
}
