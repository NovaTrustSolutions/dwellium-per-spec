/**
 * Wiki — Three-Tier Wiki Compilation widget (spec §7.2).
 *
 * Compiles auto-synthesis pages at Domain / Project / Thread tiers. Each page
 * has an overview, key concepts, open questions, and source citations.
 * Synthesis runs client-side through the user's configured LLM (`callLlm`),
 * grounded in real excerpts read from the node's source documents (not just
 * titles); with no LLM it still builds a structure-only page so the
 * three-tier model is usable offline. Pages persist per-user via `wikiStore`
 * and sync across tabs. Defaults to the globally-active thread when one is
 * set, but re-following the active thread never yanks a manual selection
 * away except when the thread itself changes.
 *
 * Hardening pass (plan wiki-widget-hardening §C): confirm before an outline
 * silently replaces an AI-written page, offline view of stored pages with
 * retry, stale badge, list filter + count, clickable sources, deep links.
 */
import { useState, useEffect, useContext, useSyncExternalStore, useCallback, useRef } from 'react';
import { Globe, FolderTree, MessageSquare, Folder, BookOpen, RefreshCw, FileText, TriangleAlert } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { TagInput } from '../Tags/TagInput';
import { useIntegrations } from '../../hooks/useIntegrations';
import { useAIAvailability } from '../../hooks/useAIAvailability';
import AIDegradedState from '../Shell/AIDegradedState';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { fetchTree, readFile } from '../FileExplorer/fileExplorerApi';
import { collectMoveTargets, type MoveTarget } from '../FileExplorer/moveTargets';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import { activeThreadStore, activeThreadUserIdHolder } from '../Workspace/activeThreadStore';
import { fetchSourceExcerpts, buildCompilePrompt, WIKI_SYSTEM_PROMPT } from './wikiSources';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import {
    wikiStore, getWikiPage, setWikiPage, isWikiPageStale, attachWikiCrossTabSync,
    parseWikiResponse, outlinePage, type WikiMap, type WikiPage,
} from './wikiStore';
import './Wiki.css';

const TIER_ICON: Record<string, typeof Globe> = { domain: Globe, project: FolderTree, thread: MessageSquare, folder: Folder };

const WIKI_OPEN_EVENT = 'dwellium:wiki-open-page';

interface ListNode { path: string; name: string; tier: string; depth: number }
interface SourceFile { path: string; modified?: string }

function findNode(list: FileEntry[], path: string): FileEntry | null {
    for (const e of list) {
        if (e.path === path) return e;
        if (e.children) { const r = findNode(e.children, path); if (r) return r; }
    }
    return null;
}

function collectFilesUnder(tree: FileEntry[], path: string): SourceFile[] {
    const node = findNode(tree, path);
    if (!node) return [];
    const out: SourceFile[] = [];
    const walk = (e: FileEntry) => { if (e.tier === 'file') out.push({ path: e.path, modified: e.modified }); e.children?.forEach(walk); };
    walk(node);
    return out;
}

export default function Wiki() {
    const { integrations } = useIntegrations();
    const ai = useAIAvailability();
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    usePerUserIdentity();
    activeThreadUserIdHolder.current = uid;

    const wikiMap: WikiMap = useSyncExternalStore(wikiStore.subscribe, wikiStore.getSnapshot, wikiStore.getServerSnapshot);
    const activeThread = useSyncExternalStore(activeThreadStore.subscribe, activeThreadStore.getSnapshot, activeThreadStore.getServerSnapshot);

    const [tree, setTree] = useState<FileEntry[]>([]);
    const [nodes, setNodes] = useState<MoveTarget[]>([]);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [backendOffline, setBackendOffline] = useState(false);
    const [compiling, setCompiling] = useState(false);
    const [err, setErr] = useState('');
    const [status, setStatus] = useState('');
    const [filter, setFilter] = useState('');
    const [focusTick, setFocusTick] = useState(0);

    const headingRef = useRef<HTMLHeadingElement>(null);
    const lastAppliedThreadRef = useRef<string | null>(null);

    // `focus` only for selections the user made in this widget (click, deep link) —
    // initial selection and following the active thread must not pull focus out of
    // whatever widget the user is working in.
    const selectPath = useCallback((path: string | null, focus = false) => {
        setSelectedPath(path);
        setErr('');
        setStatus('');
        if (focus) setFocusTick((t) => t + 1);
    }, []);

    // Cross-tab sync (plan §A): another tab's compile/edit merges straight into this store.
    useEffect(() => attachWikiCrossTabSync(), []);

    // Deep link: consume a not-yet-mounted pending path, then listen for the live event.
    useEffect(() => {
        const w = window as unknown as { __dwelliumWikiPendingPath?: string };
        if (w.__dwelliumWikiPendingPath) {
            selectPath(w.__dwelliumWikiPendingPath, true);
            delete w.__dwelliumWikiPendingPath;
        }
        const onOpen = (e: Event): void => {
            const path = (e as CustomEvent<{ path?: string }>).detail?.path;
            // Mounted already: the pending global the sender also set is ours to clear,
            // or a later mount would jump back to this stale path.
            delete (window as unknown as { __dwelliumWikiPendingPath?: string }).__dwelliumWikiPendingPath;
            if (path) selectPath(path, true);
        };
        window.addEventListener(WIKI_OPEN_EVENT, onOpen);
        return () => window.removeEventListener(WIKI_OPEN_EVENT, onOpen);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cancelLoadRef = useRef<(() => void) | null>(null);
    const loadTree = useCallback(() => {
        cancelLoadRef.current?.(); // a Retry while a fetch is in flight must not race it
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const t = await fetchTree();
                if (cancelled) return;
                setTree(t);
                setNodes(collectMoveTargets(t, ' __none__'));
                setBackendOffline(false);
            } catch {
                if (!cancelled) setBackendOffline(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        const cancel = () => { cancelled = true; };
        cancelLoadRef.current = cancel;
        return cancel;
    }, []);

    useEffect(() => loadTree(), [loadTree]);

    // Initial selection, once nodes are known: prefer the active thread if present in the tree.
    useEffect(() => {
        if (selectedPath !== null || nodes.length === 0) return;
        const tp = activeThread?.path ?? null;
        const initial = tp && nodes.some((n) => n.path === tp) ? tp : nodes[0]?.path ?? null;
        lastAppliedThreadRef.current = tp;
        if (initial) selectPath(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, selectedPath]);

    // Follow the active thread when IT changes — never yank a manual selection on unrelated refetches.
    useEffect(() => {
        const tp = activeThread?.path ?? null;
        if (tp && tp !== lastAppliedThreadRef.current) {
            lastAppliedThreadRef.current = tp;
            selectPath(tp);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeThread?.path]);

    useEffect(() => { if (focusTick > 0) headingRef.current?.focus(); }, [focusTick]);

    const filesFor = useCallback((path: string): SourceFile[] => (backendOffline ? [] : collectFilesUnder(tree, path)), [tree, backendOffline]);

    // Node list: normal tree nodes online; fall back to stored pages when the backend is offline
    // so already-compiled pages stay readable.
    const listItems: ListNode[] = backendOffline
        ? Object.values(wikiMap)
            .map((p): ListNode => ({ path: p.path, name: p.name, tier: p.tier, depth: 0 }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : nodes;

    const filteredItems = filter.trim()
        ? listItems.filter((n) => n.name.toLowerCase().includes(filter.trim().toLowerCase()))
        : listItems;
    const compiledCount = filteredItems.filter((n) => !!wikiMap[n.path]).length;

    const selectedNode = listItems.find((n) => n.path === selectedPath) ?? null;
    const currentSources = selectedNode ? filesFor(selectedNode.path) : [];
    const sourcePaths = currentSources.map((s) => s.path);
    const page: WikiPage | null = getWikiPage(wikiMap, selectedPath);
    const stale = !backendOffline && page ? isWikiPageStale(page, currentSources) : false;

    const compile = useCallback(async () => {
        if (!selectedNode || compiling || backendOffline) return;
        const node = { path: selectedNode.path, tier: selectedNode.tier, name: selectedNode.name };
        const llmActive = hasActiveLlm(integrations.llm);
        // Never silently overwrite an AI-written page with a structure-only outline.
        if (!llmActive && page && page.compiledBy === 'llm') {
            const ok = window.confirm(`Replace the AI-written page for "${node.name}" with a structure-only outline?`);
            if (!ok) return;
        }
        setCompiling(true);
        setErr('');
        setStatus('Compiling…');
        try {
            if (llmActive) {
                const excerpts = await fetchSourceExcerpts(sourcePaths, readFile).catch(() => []);
                const prompt = buildCompilePrompt(node, sourcePaths, excerpts);
                const res = await callLlm({
                    systemPrompt: WIKI_SYSTEM_PROMPT,
                    prompt,
                    responseFormat: 'json',
                    maxTokens: 1024,
                    temperature: 0.3,
                }, integrations.llm);
                const parsed = res ? parseWikiResponse(res.text, node, sourcePaths) : null;
                if (parsed) {
                    setWikiPage(parsed);
                    setStatus('Page compiled.');
                    setFocusTick((t) => t + 1);
                } else {
                    setErr('The LLM returned no usable page — try again.');
                    setStatus('');
                }
            } else {
                setWikiPage(outlinePage(node, sourcePaths));
                setStatus('Page compiled.');
                setFocusTick((t) => t + 1);
            }
        } catch (e: any) {
            setErr(e?.message || 'Compile failed.');
            setStatus('');
        } finally {
            setCompiling(false);
        }
    }, [selectedNode, compiling, backendOffline, integrations.llm, sourcePaths, page]);

    const copySource = useCallback(async (path: string) => {
        try {
            await navigator.clipboard.writeText(path);
            setStatus('Path copied');
        } catch {
            setStatus(`Couldn't copy — path: ${path}`);
        }
    }, []);

    return (
        <div className="wiki-host">
        <div className="wiki-root">
            {/* Left: tier tree */}
            <div className="wiki-sidebar">
                <div className="wiki-sidebar-head">
                    <BookOpen size={14} aria-hidden />
                    <span>Three-Tier Wiki</span>
                </div>

                {backendOffline && (
                    <div className="wiki-offline">
                        <TriangleAlert size={20} aria-hidden />
                        <p>File backend offline — showing saved pages.</p>
                        <button className="wiki-offline-retry" onClick={() => loadTree()}>Retry</button>
                    </div>
                )}

                <input
                    type="search"
                    className="wiki-filter"
                    aria-label="Filter pages"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter pages…"
                />
                <div className="wiki-count">{compiledCount} of {filteredItems.length} compiled</div>

                {loading ? (
                    <div role="status" className="wiki-empty">Loading…</div>
                ) : filteredItems.length === 0 ? (
                    <div className="wiki-empty">{listItems.length === 0 ? 'No domains/projects/threads yet. Create them in the File Explorer to compile wiki pages.' : 'No pages match.'}</div>
                ) : (
                    <ul className="wiki-list">
                        {filteredItems.map((n) => {
                            const Icon = TIER_ICON[n.tier] ?? Folder;
                            const isSel = n.path === selectedPath;
                            const p = wikiMap[n.path];
                            const compiledFlag = !!p;
                            const staleFlag = !backendOffline && p ? isWikiPageStale(p, filesFor(n.path)) : false;
                            return (
                                <li key={n.path}>
                                    <button
                                        className="wiki-list-item"
                                        style={{ paddingLeft: 10 + n.depth * 12 }}
                                        aria-current={isSel ? 'page' : undefined}
                                        aria-label={`${n.name}, ${n.tier}${compiledFlag ? ', compiled' : ''}${staleFlag ? ', out of date' : ''}`}
                                        onClick={() => selectPath(n.path, true)}
                                    >
                                        <Icon size={13} strokeWidth={1.75} aria-hidden />
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                                        {compiledFlag && <span className="wiki-dot" aria-hidden />}
                                        {staleFlag && <span className="wiki-badge--stale" aria-hidden>Out of date</span>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Right: page */}
            <div className="wiki-main">
                {!selectedNode ? (
                    <div className="wiki-empty" style={{ margin: 'auto', textAlign: 'center', padding: 24 }}>
                        {backendOffline ? 'File backend offline — connect it to load your domains, projects, and threads.' : 'Select a domain, project, or thread to view or compile its wiki page.'}
                    </div>
                ) : (
                    <>
                        <div className="wiki-header">
                            {(() => { const I = TIER_ICON[selectedNode.tier] ?? Folder; return <I size={18} aria-hidden />; })()}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h2 className="wiki-heading" tabIndex={-1} data-view-heading ref={headingRef}>{selectedNode.name}</h2>
                                <div className="wiki-meta">
                                    {selectedNode.tier} wiki · {sourcePaths.length} source{sourcePaths.length === 1 ? '' : 's'}
                                    {stale && <span className="wiki-badge--stale" style={{ marginLeft: 8 }}>Out of date</span>}
                                </div>
                            </div>
                            <button
                                className="wiki-compile-btn"
                                onClick={() => void compile()}
                                disabled={compiling || backendOffline}
                                aria-busy={compiling || undefined}
                                title={backendOffline ? 'Compile is unavailable while the file backend is offline — sources are unknown.' : undefined}
                            >
                                {compiling ? <RefreshCw size={13} className="wiki-spin" aria-hidden /> : <BookOpen size={13} aria-hidden />}
                                {compiling ? 'Compiling…' : page ? 'Recompile' : 'Compile'}
                            </button>
                        </div>

                        {/* Tags — links this node into projects / cross-app associations */}
                        <div className="wiki-tags">
                            <TagInput source="wiki" sourceId={selectedNode.path} title={selectedNode.name} />
                        </div>

                        <div className="wiki-body">
                            {err && <div className="wiki-error" role="alert"><TriangleAlert size={14} aria-hidden style={{ flexShrink: 0 }} /><span>{err}</span></div>}
                            {!err && status && <div className="wiki-status" role="status">{status}</div>}
                            <AIDegradedState availability={ai} needsKey ctaLabel="Add a key" reason="No LLM configured — “Compile” builds a structure-only page. Add a key for full synthesis." />

                            {!page ? (
                                <div className="wiki-empty">
                                    <p style={{ marginTop: 0 }}>No wiki page compiled for this {selectedNode.tier} yet.</p>
                                    {sourcePaths.length > 0 && (
                                        <div className="wiki-section">
                                            <h3 className="wiki-section-title">Source documents</h3>
                                            <SourceList sources={sourcePaths} onOpen={copySource} />
                                        </div>
                                    )}
                                    <p style={{ marginTop: 16 }}>Click <strong>Compile</strong> to synthesize this page.</p>
                                </div>
                            ) : (
                                <WikiPageView page={page} onOpenSource={copySource} />
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
        </div>
    );
}

function SourceList({ sources, onOpen }: { sources: string[]; onOpen: (path: string) => void }) {
    if (sources.length === 0) return <div className="wiki-empty">No source documents yet.</div>;
    return (
        <ul className="wiki-sources">
            {sources.map((s) => (
                <li key={s}>
                    <button className="wiki-source-btn" onClick={() => void onOpen(s)} title="Copy path">
                        <FileText size={13} aria-hidden />
                        <span>{s}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="wiki-section">
            <h3 className="wiki-section-title">{title}</h3>
            {children}
        </div>
    );
}

function WikiPageView({ page, onOpenSource }: { page: WikiPage; onOpenSource: (path: string) => void }) {
    return (
        <div>
            <div className="wiki-meta" style={{ marginBottom: 16 }}>
                Compiled {new Date(page.compiledAt).toLocaleString()} · {page.compiledBy === 'llm' ? 'AI synthesis' : 'structure only'}
            </div>
            {page.overview && (
                <Section title="Overview">
                    <p style={{ margin: 0 }}>{page.overview}</p>
                </Section>
            )}
            {page.concepts.length > 0 && (
                <Section title="Key concepts">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {page.concepts.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                </Section>
            )}
            {page.openQuestions.length > 0 && (
                <Section title="Open questions">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {page.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                </Section>
            )}
            <Section title={`Sources (${page.sources.length})`}>
                <SourceList sources={page.sources} onOpen={onOpenSource} />
            </Section>
        </div>
    );
}
