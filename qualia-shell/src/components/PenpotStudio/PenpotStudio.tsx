/**
 * PenpotStudio — Design Studio (plan 053: Penpot to 100%).
 *
 * Three tabs:
 *   Studio    — the editor. Penpot's CLOUD (design.penpot.app) sends
 *               `X-Frame-Options: SAMEORIGIN` (re-verified 2026-08-23), so a
 *               cloud URL renders a launcher (Open ↗ in a new tab, with the
 *               one-line why). A SELF-HOST URL (`VITE_PENPOT_URL` → our Caddy
 *               in tools/penpot/ strips the header and sets frame-ancestors)
 *               renders the editor in-window behind the PhotoVault
 *               reachability pattern — never a blank iframe.
 *   Templates — Andy's brand-kit SVG starters (public/design-templates/) with
 *               previews, downloads and Penpot import steps.
 *   Files     — Penpot projects/files via the backend proxy (/api/design,
 *               Penpot's documented RPC API) with `.penpot` export. 503 from
 *               the proxy → the exact setup step, never a crash.
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Palette, RefreshCw } from 'lucide-react';
import { PENPOT_IMPORT_STEPS, PENPOT_TEMPLATES } from './penpotTemplates';
import { designApi as realDesignApi, type DesignApi, type DesignFile, type DesignProject } from './designApi';
import './PenpotStudio.css';

type Env = Record<string, string | undefined>;
const viteEnv = (): Env => (import.meta as unknown as { env?: Env }).env ?? {};

export const PENPOT_DEFAULT_URL = 'https://design.penpot.app';

/** Penpot URL from env with the free-cloud default (exported for tests). */
export function penpotUrl(env: Env = viteEnv()): string {
    const raw = env.VITE_PENPOT_URL?.trim();
    return raw ? raw.replace(/\/+$/, '') : PENPOT_DEFAULT_URL;
}

/**
 * Embeddable? Penpot's cloud (penpot.app and subdomains) sends
 * `X-Frame-Options: SAMEORIGIN` → launcher. Anything else is our own
 * self-host behind the tools/penpot/ Caddy, which strips that header →
 * in-window iframe. Unparseable URLs are treated as non-embeddable (launcher
 * never breaks; a broken iframe would).
 */
export function isEmbeddablePenpotUrl(url: string): boolean {
    try {
        const host = new URL(url).hostname;
        return !(host === 'penpot.app' || host.endsWith('.penpot.app'));
    } catch {
        return false;
    }
}

type Tab = 'studio' | 'templates' | 'files';
type Reach = 'checking' | 'up' | 'down';

type FilesState =
    | { kind: 'loading' }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; projects: DesignProject[] };

export default function PenpotStudio({
    env,
    api = realDesignApi,
}: { env?: Env; api?: DesignApi } = {}) {
    const url = penpotUrl(env);
    const embeddable = isEmbeddablePenpotUrl(url);
    const [tab, setTab] = useState<Tab>('studio');

    // ── Studio: reachability for the self-host iframe (PhotoVault pattern) ──
    const [reach, setReach] = useState<Reach>('checking');
    const [iframeKey, setIframeKey] = useState(0);
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
        if (embeddable) void checkReach(url);
    }, [embeddable, url, iframeKey, checkReach]);

    // ── Files: backend proxy state ──────────────────────────────────────────
    const [filesState, setFilesState] = useState<FilesState>({ kind: 'loading' });
    const [openProject, setOpenProject] = useState<string | null>(null);
    const [projectFiles, setProjectFiles] = useState<Record<string, DesignFile[] | 'loading' | 'error'>>({});
    const [exportNote, setExportNote] = useState<string | null>(null);

    const loadProjects = useCallback(async () => {
        setFilesState({ kind: 'loading' });
        const r = await api.listDesignProjects();
        if (r.kind === 'ok') setFilesState({ kind: 'ok', projects: r.data });
        else if (r.kind === 'needs-setup') setFilesState({ kind: 'needs-setup' });
        else setFilesState({ kind: 'error', message: r.message });
    }, [api]);
    useEffect(() => {
        if (tab === 'files') void loadProjects();
    }, [tab, loadProjects]);

    const toggleProject = useCallback(async (projectId: string) => {
        setOpenProject(prev => (prev === projectId ? null : projectId));
        if (Array.isArray(projectFiles[projectId])) return;
        setProjectFiles(s => ({ ...s, [projectId]: 'loading' }));
        const r = await api.listDesignFiles(projectId);
        setProjectFiles(s => ({ ...s, [projectId]: r.kind === 'ok' ? r.data : 'error' }));
    }, [api, projectFiles]);

    const downloadPenpotFile = useCallback(async (file: DesignFile) => {
        setExportNote(`Exporting “${file.name}”…`);
        const r = await api.exportDesignFile(file.id);
        if (r.kind !== 'ok') {
            setExportNote(r.kind === 'needs-setup' ? 'Export needs the backend token — see the setup card.' : `Export failed: ${r.message}`);
            return;
        }
        if (typeof URL.createObjectURL === 'function') {
            const objectUrl = URL.createObjectURL(r.data);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = `${file.name || file.id}.penpot`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
        }
        setExportNote(`Downloaded “${file.name}.penpot” — import it into any Penpot via drag-and-drop.`);
    }, [api]);

    const dotColor = reach === 'up' ? '#22c55e' : reach === 'down' ? '#ff6b6b' : '#888';
    const dotLabel = reach === 'up' ? 'Reachable' : reach === 'down' ? 'Not reachable' : 'Checking…';

    return (
        <div className="penpot-studio">
            <div className="penpot-studio__head">
                <h2 className="penpot-studio__title"><Palette size={16} aria-hidden /> Design Studio</h2>
                <div className="penpot-studio__tabs" role="tablist" aria-label="Design Studio sections">
                    {(['studio', 'templates', 'files'] as const).map(t => (
                        <button
                            key={t}
                            role="tab"
                            aria-selected={tab === t}
                            className={`penpot-studio__tab${tab === t ? ' penpot-studio__tab--active' : ''}`}
                            onClick={() => setTab(t)}
                        >
                            {t === 'studio' ? 'Studio' : t === 'templates' ? 'Templates' : 'Files'}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'studio' && !embeddable && (
                <div className="penpot-studio__card" data-state="launcher">
                    <Palette size={28} aria-hidden />
                    <h3>Penpot — open-source design studio</h3>
                    <p>
                        Figma-class boards for the paper Andy actually prints: listing flyers,
                        late-rent and inspection notices, move-in checklists and owner-report
                        covers — plus a shared &ldquo;Dwellium Brand&rdquo; library so every
                        property doc looks the same. Free cloud plan; sign in with Google.
                    </p>
                    <p className="penpot-studio__muted">
                        Penpot&rsquo;s cloud blocks embedding (it sends X-Frame-Options: SAMEORIGIN),
                        so it opens in a new tab — self-host it per <code>tools/penpot/README.md</code> and
                        set <code>VITE_PENPOT_URL</code> to get the editor inside this window.
                    </p>
                    <a className="penpot-studio__btn" href={url} target="_blank" rel="noreferrer">
                        Open Penpot <ExternalLink size={12} aria-hidden />
                    </a>
                </div>
            )}

            {tab === 'studio' && embeddable && (
                <div className="penpot-studio__embed">
                    <div className="penpot-studio__toolbar">
                        <span className="penpot-studio__dot" style={{ background: dotColor }} title={dotLabel} />
                        <span className="penpot-studio__url" title={url}>{url}</span>
                        <button
                            className="penpot-studio__btn penpot-studio__btn--ghost"
                            onClick={() => setIframeKey(k => k + 1)}
                            title="Re-check and reload"
                            aria-label="Re-check and reload Design Studio"
                        >
                            <RefreshCw size={14} aria-hidden />
                        </button>
                        <a className="penpot-studio__link" href={url} target="_blank" rel="noreferrer">
                            Open ↗ <ExternalLink size={12} aria-hidden />
                        </a>
                    </div>
                    {reach === 'down' ? (
                        <div className="penpot-studio__card" data-state="unreachable">
                            <Palette size={28} aria-hidden />
                            <h3>Design Studio isn&rsquo;t reachable</h3>
                            <p>
                                The self-hosted Penpot at <code>{url}</code> didn&rsquo;t answer. The VM (or the
                                office Mac) may be down, or Docker stopped — <code>tools/penpot/README.md</code>
                                has the bring-up and fixes.
                            </p>
                            <div className="penpot-studio__actions">
                                <button className="penpot-studio__btn" onClick={() => checkReach(url)}>Re-check</button>
                                <button className="penpot-studio__btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open ↗</button>
                            </div>
                        </div>
                    ) : (
                        <iframe
                            key={iframeKey}
                            className="penpot-studio__frame"
                            src={url}
                            title="Design Studio"
                            allow="clipboard-read; clipboard-write; fullscreen"
                        />
                    )}
                </div>
            )}

            {tab === 'templates' && (
                <div className="penpot-studio__templates">
                    <p className="penpot-studio__muted penpot-studio__templates-intro">
                        Andy&rsquo;s brand kit — Dwellium-styled starters for the paper the properties
                        actually use. Property names and numbers inside are example text marked
                        &ldquo;example — replace&rdquo;.
                    </p>
                    <div className="penpot-studio__grid">
                        {PENPOT_TEMPLATES.map(t => (
                            <div key={t.id} className="penpot-studio__tpl" data-template={t.id}>
                                <img className="penpot-studio__tpl-preview" src={t.file} alt={`${t.name} template preview`} loading="lazy" />
                                <h4>{t.name}</h4>
                                <p className="penpot-studio__tpl-size">{t.size}</p>
                                <p className="penpot-studio__tpl-use">{t.use}</p>
                                <a className="penpot-studio__btn" href={t.file} download={`${t.id}.svg`}>
                                    <Download size={12} aria-hidden /> Download SVG
                                </a>
                            </div>
                        ))}
                    </div>
                    <div className="penpot-studio__import">
                        <h4>Import into Penpot</h4>
                        <ol>
                            {PENPOT_IMPORT_STEPS.map(step => <li key={step}>{step}</li>)}
                        </ol>
                    </div>
                </div>
            )}

            {tab === 'files' && (
                <div className="penpot-studio__files">
                    {filesState.kind === 'loading' && (
                        <div className="penpot-studio__card" data-state="loading"><p>Loading Penpot projects…</p></div>
                    )}
                    {filesState.kind === 'needs-setup' && (
                        <div className="penpot-studio__card" data-state="needs-setup">
                            <Palette size={28} aria-hidden />
                            <h3>Connect the Penpot API</h3>
                            <p>
                                The Files tab lists your Penpot projects and exports <code>.penpot</code> backups
                                through the Dwellium backend. To turn it on: in Penpot go to
                                <strong> Your account → Access tokens → Generate new token</strong>, then set
                                <code> PENPOT_ACCESS_TOKEN</code> on the backend (and <code>PENPOT_API_URL</code> if
                                you self-host — it defaults to the free cloud). This card flips to the live
                                list automatically.
                            </p>
                        </div>
                    )}
                    {filesState.kind === 'error' && (
                        <div className="penpot-studio__card" data-state="error">
                            <h3>Couldn&rsquo;t reach the backend</h3>
                            <p>{filesState.message}</p>
                            <button className="penpot-studio__btn" onClick={() => void loadProjects()}>Retry</button>
                        </div>
                    )}
                    {filesState.kind === 'ok' && filesState.projects.length === 0 && (
                        <div className="penpot-studio__card" data-state="empty">
                            <h3>No projects yet</h3>
                            <p>Create a project in Penpot (Studio tab) and it will show up here.</p>
                            <button className="penpot-studio__btn" onClick={() => void loadProjects()}>Refresh</button>
                        </div>
                    )}
                    {filesState.kind === 'ok' && filesState.projects.length > 0 && (
                        <ul className="penpot-studio__projects">
                            {filesState.projects.map(p => (
                                <li key={p.id} className="penpot-studio__project">
                                    <button className="penpot-studio__project-row" onClick={() => void toggleProject(p.id)} aria-expanded={openProject === p.id}>
                                        <span className="penpot-studio__project-name">{p.name}</span>
                                        <span className="penpot-studio__project-team">{p.teamName}</span>
                                    </button>
                                    {openProject === p.id && (
                                        <div className="penpot-studio__file-list">
                                            {projectFiles[p.id] === 'loading' && <p className="penpot-studio__muted">Loading files…</p>}
                                            {projectFiles[p.id] === 'error' && <p className="penpot-studio__muted">Couldn&rsquo;t load files for this project.</p>}
                                            {Array.isArray(projectFiles[p.id]) && (projectFiles[p.id] as DesignFile[]).length === 0 && (
                                                <p className="penpot-studio__muted">No files in this project.</p>
                                            )}
                                            {Array.isArray(projectFiles[p.id]) && (projectFiles[p.id] as DesignFile[]).map(f => (
                                                <div key={f.id} className="penpot-studio__file">
                                                    <span className="penpot-studio__file-name">{f.name}</span>
                                                    <button className="penpot-studio__btn penpot-studio__btn--ghost" onClick={() => void downloadPenpotFile(f)}>
                                                        <Download size={12} aria-hidden /> Export .penpot
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {exportNote && <p className="penpot-studio__muted penpot-studio__export-note" role="status">{exportNote}</p>}
                </div>
            )}
        </div>
    );
}
