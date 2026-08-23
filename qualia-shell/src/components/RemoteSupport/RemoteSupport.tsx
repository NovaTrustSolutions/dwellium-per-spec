/**
 * RemoteSupport — plan 047 phase 2 launcher, upgraded by plan 053 to a real
 * daily-workflow widget. Two tabs:
 *
 *   Connect — Andy's per-user RustDesk address book (remoteMachinesStore:
 *     name / ID / notes / tags, One Save synced) with one-click Connect via
 *     `rustdesk://connect/<ID>` deep links, Copy ID, import/export JSON, and
 *     a live Relay Up/Down pill from `GET /api/remote/relay-status` (backend
 *     TCP-probes hbbs 21115/21116 + hbbr 21117 on RUSTDESK_RELAY_HOST).
 *   Setup — stock client downloads (AGPL, unmodified — verified 2026-08-20
 *     against github.com/rustdesk/rustdesk v1.4.9, still latest 2026-08-23)
 *     + relay values from `VITE_RUSTDESK_RELAY` (`host:port,key`) with copy
 *     buttons; community-server note while unset.
 *
 * Why deep links and no in-window session (evidence, fetched 2026-08-23):
 *   - web.rustdesk.com does not resolve (curl exit 6 — host not found);
 *   - the hosted web client https://rustdesk.com/web/ answers with
 *     `x-frame-options: SAMEORIGIN`, so it cannot be iframed from Dwellium;
 *   - no self-hostable web-client artifact exists: v1.4.9's release assets
 *     (api.github.com/repos/rustdesk/rustdesk/releases/latest) contain no web
 *     build, the repo has no flutter/web dir, and doc.rustdesk.com has no
 *     web-client self-host page — the OSS install doc links "web client" only
 *     to the hosted rustdesk.com/web (WebSocket 21118/21119 behind a
 *     header-validating reverse proxy).
 *   The `rustdesk://` scheme is verified from source — see
 *   remoteMachinesStore.ts header (core_main.rs + flutter/lib/common.dart).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Copy, ExternalLink, Monitor, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { API_BASE } from '../../config';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import {
    MACHINE_TAGS,
    MachineTag,
    RemoteMachine,
    addMachine,
    buildRustdeskLink,
    exportMachinesJson,
    importMachinesJson,
    remoteMachinesStore,
    removeMachine,
    updateMachine,
} from './remoteMachinesStore';
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

// Verified 2026-08-20 (github.com/rustdesk/rustdesk releases/latest → 1.4.9; re-checked 2026-08-23,
// unchanged — Linux/Android asset names confirmed in the v1.4.9 release asset list). Asset filenames
// embed the version, so `releases/latest/download/…` can't be used; "All releases" covers drift.
const DOWNLOADS = [
    { label: 'macOS (Apple Silicon)', href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-aarch64.dmg' },
    { label: 'macOS (Intel)', href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-x86_64.dmg' },
    { label: 'Windows (64-bit)', href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-x86_64.exe' },
    { label: 'Linux (.deb, x86_64)', href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-x86_64.deb' },
    { label: 'Android (APK)', href: 'https://github.com/rustdesk/rustdesk/releases/download/1.4.9/rustdesk-1.4.9-universal-signed.apk' },
];
const ALL_RELEASES = 'https://github.com/rustdesk/rustdesk/releases/latest';

/* ─── Relay status pill ─── */

export type RelayPill =
    | { kind: 'checking' }
    | { kind: 'up'; ports: Record<string, boolean> }
    | { kind: 'down'; ports: Record<string, boolean> }
    | { kind: 'unconfigured' } // backend 503 needsSetup — RUSTDESK_RELAY_HOST unset
    | { kind: 'offline' };     // backend unreachable

const PILL_LABEL: Record<RelayPill['kind'], string> = {
    checking: 'Checking relay…',
    up: 'Relay up',
    down: 'Relay down',
    unconfigured: 'Relay not configured',
    offline: 'Backend offline',
};

function useRelayStatus(): { pill: RelayPill; refresh: () => void } {
    const [pill, setPill] = useState<RelayPill>({ kind: 'checking' });
    const refresh = useCallback(() => {
        setPill({ kind: 'checking' });
        void (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/remote/relay-status`);
                if (res.status === 503) { setPill({ kind: 'unconfigured' }); return; }
                if (!res.ok) { setPill({ kind: 'offline' }); return; }
                const body = await res.json() as { up?: boolean; ports?: Record<string, boolean> };
                setPill(body.up ? { kind: 'up', ports: body.ports ?? {} } : { kind: 'down', ports: body.ports ?? {} });
            } catch {
                setPill({ kind: 'offline' });
            }
        })();
    }, []);
    useEffect(() => { refresh(); }, [refresh]);
    return { pill, refresh };
}

/* ─── Machine add/edit form ─── */

interface MachineDraft { name: string; rustdeskId: string; notes: string; tags: MachineTag[] }
const emptyDraft = (): MachineDraft => ({ name: '', rustdeskId: '', notes: '', tags: [] });

function MachineForm({ initial, onSave, onCancel }: {
    initial: MachineDraft;
    onSave: (d: MachineDraft) => void;
    onCancel?: () => void;
}) {
    const [draft, setDraft] = useState<MachineDraft>(initial);
    const toggleTag = (t: MachineTag) => setDraft(d => ({
        ...d, tags: d.tags.includes(t) ? d.tags.filter(x => x !== t) : [...d.tags, t],
    }));
    return (
        <div className="remote-support__form">
            <input
                className="remote-support__input" placeholder="Machine name (e.g. Woodland Parc office PC)"
                aria-label="Machine name" value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            />
            <input
                className="remote-support__input" placeholder="RustDesk ID (shown on the machine's home screen)"
                aria-label="RustDesk ID" value={draft.rustdeskId}
                onChange={e => setDraft(d => ({ ...d, rustdeskId: e.target.value }))}
            />
            <input
                className="remote-support__input" placeholder="Location / notes"
                aria-label="Location or notes" value={draft.notes}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            />
            <div className="remote-support__tags">
                {MACHINE_TAGS.map(t => (
                    <label key={t} className="remote-support__tag-pick">
                        <input type="checkbox" checked={draft.tags.includes(t)} onChange={() => toggleTag(t)} /> {t}
                    </label>
                ))}
            </div>
            <div className="remote-support__form-actions">
                <button className="remote-support__btn" disabled={!draft.name.trim()} onClick={() => onSave(draft)}>
                    Save machine
                </button>
                {onCancel && <button className="remote-support__btn" onClick={onCancel}>Cancel</button>}
            </div>
        </div>
    );
}

/* ─── Widget ─── */

export default function RemoteSupport({ env }: { env?: Env }) {
    usePerUserIdentity(); // single writer — must run before the store's useSyncExternalStore
    const relay = parseRustdeskRelay((env ?? viteEnv()).VITE_RUSTDESK_RELAY);
    const machines = useSyncExternalStore(
        remoteMachinesStore.subscribe,
        remoteMachinesStore.getSnapshot,
        remoteMachinesStore.getServerSnapshot,
    );
    const { pill, refresh } = useRelayStatus();
    const [tab, setTab] = useState<'connect' | 'setup'>('connect');
    const [copied, setCopied] = useState('');
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [ioMessage, setIoMessage] = useState('');

    const copy = async (tag: string, text: string) => {
        try {
            await navigator.clipboard?.writeText(text);
            setCopied(tag);
            setTimeout(() => setCopied(''), 2500);
        } catch { /* ignore — clipboard unavailable */ }
    };

    const onExport = () => {
        const json = exportMachinesJson();
        try {
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'rustdesk-machines.json';
            a.click();
            URL.revokeObjectURL(url);
            setIoMessage(`Exported ${machines.length} machine${machines.length === 1 ? '' : 's'}.`);
        } catch {
            void copy('export', json);
            setIoMessage('Download unavailable — JSON copied to clipboard instead.');
        }
    };

    const onImportFile = async (file: File | undefined) => {
        if (!file) return;
        try {
            const n = importMachinesJson(await file.text());
            setIoMessage(`Imported ${n} machine${n === 1 ? '' : 's'} (merged by id — nothing removed).`);
        } catch (e) {
            setIoMessage(`Import failed: ${e instanceof Error ? e.message : 'invalid JSON'}`);
        }
    };

    const renderMachine = (m: RemoteMachine) => {
        if (editingId === m.id) {
            return (
                <li key={m.id} className="remote-support__machine">
                    <MachineForm
                        initial={{ name: m.name, rustdeskId: m.rustdeskId, notes: m.notes, tags: m.tags }}
                        onSave={d => { updateMachine(m.id, { name: d.name.trim(), rustdeskId: d.rustdeskId.trim(), notes: d.notes.trim(), tags: d.tags }); setEditingId(null); }}
                        onCancel={() => setEditingId(null)}
                    />
                </li>
            );
        }
        const link = buildRustdeskLink(m.rustdeskId, 'connect');
        const ftLink = buildRustdeskLink(m.rustdeskId, 'file-transfer');
        return (
            <li key={m.id} className="remote-support__machine" data-example={m.example ? 'true' : undefined}>
                <div className="remote-support__machine-main">
                    <span className="remote-support__machine-name">{m.name}</span>
                    {m.example && <span className="remote-support__badge">example — replace with your machines</span>}
                    {m.tags.map(t => <span key={t} className="remote-support__chip">{t}</span>)}
                </div>
                {m.notes && <p className="remote-support__machine-notes">{m.notes}</p>}
                <div className="remote-support__machine-actions">
                    {m.rustdeskId
                        ? <code className="remote-support__id">{m.rustdeskId}</code>
                        : <span className="remote-support__muted">no ID yet</span>}
                    {link ? (
                        <a className="remote-support__btn remote-support__btn--primary" href={link} title="Opens the installed RustDesk app">
                            Connect
                        </a>
                    ) : (
                        <button className="remote-support__btn" disabled title="Add the machine's RustDesk ID first">Connect</button>
                    )}
                    {ftLink && (
                        <a className="remote-support__btn" href={ftLink} title="Open a file-transfer session in RustDesk">Files</a>
                    )}
                    <button
                        className="remote-support__btn" disabled={!m.rustdeskId}
                        onClick={() => void copy(`id-${m.id}`, m.rustdeskId)} aria-label={`Copy ID for ${m.name}`}
                    >
                        <Copy size={12} aria-hidden /> {copied === `id-${m.id}` ? 'Copied' : 'Copy ID'}
                    </button>
                    <button className="remote-support__btn" onClick={() => setEditingId(m.id)} aria-label={`Edit ${m.name}`}>
                        <Pencil size={12} aria-hidden /> Edit
                    </button>
                    <button className="remote-support__btn" onClick={() => removeMachine(m.id)} aria-label={`Remove ${m.name}`}>
                        <Trash2 size={12} aria-hidden /> Remove
                    </button>
                </div>
            </li>
        );
    };

    return (
        <div className="remote-support">
            <div className="remote-support__head">
                <h2 className="remote-support__title"><Monitor size={16} aria-hidden /> Remote Support</h2>
                <span className={`remote-support__pill remote-support__pill--${pill.kind}`}
                    title={'ports' in pill ? Object.entries(pill.ports).map(([p, ok]) => `${p}: ${ok ? 'open' : 'closed'}`).join(' · ') : undefined}
                >
                    {PILL_LABEL[pill.kind]}
                </span>
                <button className="remote-support__btn" onClick={refresh} aria-label="Re-check relay status">
                    <RefreshCw size={12} aria-hidden />
                </button>
            </div>

            <div className="remote-support__tabs" role="tablist" aria-label="Remote Support sections">
                <button role="tab" aria-selected={tab === 'connect'} className="remote-support__tab" onClick={() => setTab('connect')}>Connect</button>
                <button role="tab" aria-selected={tab === 'setup'} className="remote-support__tab" onClick={() => setTab('setup')}>Setup</button>
            </div>

            {tab === 'connect' && (
                <section className="remote-support__panel" data-tab="connect">
                    {pill.kind === 'unconfigured' && (
                        <p className="remote-support__muted" data-state="relay-unconfigured">
                            The backend has no relay configured — set <code>RUSTDESK_RELAY_HOST</code> on
                            Cloud Run after deploying the e2-micro relay (<code>tools/rustdesk/README.md</code>).
                            Connections still work over RustDesk&rsquo;s community servers meanwhile.
                        </p>
                    )}
                    {pill.kind === 'offline' && (
                        <p className="remote-support__muted" data-state="backend-offline">
                            Couldn&rsquo;t reach the Dwellium backend to check the relay — connections via
                            the RustDesk app are unaffected.
                        </p>
                    )}
                    <p className="remote-support__muted">
                        One click opens the installed RustDesk app (<code>rustdesk://</code> link). No app
                        yet? Grab it in the Setup tab.
                    </p>
                    <ul className="remote-support__machines">
                        {machines.map(renderMachine)}
                    </ul>
                    {machines.length === 0 && (
                        <p className="remote-support__muted" data-state="no-machines">
                            No machines saved yet — add the office PC or a resident&rsquo;s computer below.
                        </p>
                    )}
                    {adding ? (
                        <MachineForm
                            initial={emptyDraft()}
                            onSave={d => { addMachine({ name: d.name, rustdeskId: d.rustdeskId, notes: d.notes, tags: d.tags }); setAdding(false); }}
                            onCancel={() => setAdding(false)}
                        />
                    ) : (
                        <button className="remote-support__btn" onClick={() => setAdding(true)}>
                            <Plus size={12} aria-hidden /> Add machine
                        </button>
                    )}
                    <div className="remote-support__io">
                        <button className="remote-support__btn" onClick={onExport}>Export JSON</button>
                        <label className="remote-support__btn remote-support__file">
                            Import JSON
                            <input
                                type="file" accept="application/json,.json" aria-label="Import machines JSON"
                                onChange={e => { void onImportFile(e.target.files?.[0]); e.target.value = ''; }}
                            />
                        </label>
                        {ioMessage && <span className="remote-support__muted" data-state="io-message">{ioMessage}</span>}
                    </div>
                </section>
            )}

            {tab === 'setup' && (
                <>
                    <section className="remote-support__panel" data-tab="setup">
                        <div className="remote-support__setup-head">
                            <h3>1 · Install RustDesk on the machine</h3>
                            <a className="remote-support__link" href={ALL_RELEASES} target="_blank" rel="noreferrer">
                                All releases <ExternalLink size={12} aria-hidden />
                            </a>
                        </div>
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
                </>
            )}
        </div>
    );
}
