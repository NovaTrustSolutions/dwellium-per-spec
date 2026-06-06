/**
 * Wiki — Three-Tier Wiki Compilation widget (spec §7.2).
 *
 * Compiles auto-synthesis pages at Domain / Project / Thread tiers. Each page
 * has an overview, key concepts, open questions, and source citations.
 * Synthesis runs client-side through the user's configured LLM (`callLlm`);
 * with no LLM it still builds a structure-only page (sources from the node's
 * documents) so the three-tier model is usable offline. Pages persist per-user
 * via `wikiStore`. Defaults to the globally-active thread when one is set.
 */
import { useState, useEffect, useContext, useSyncExternalStore, useCallback } from 'react';
import { Globe, FolderTree, MessageSquare, Folder, BookOpen, RefreshCw, FileText } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { TagInput } from '../Tags/TagInput';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { fetchTree } from '../FileExplorer/fileExplorerApi';
import { collectMoveTargets, type MoveTarget } from '../FileExplorer/moveTargets';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import { activeThreadStore, activeThreadUserIdHolder } from '../Workspace/activeThreadStore';
import {
    wikiStore, wikiUserIdHolder, getWikiPage, setWikiPage,
    parseWikiResponse, outlinePage, type WikiMap,
} from './wikiStore';

const TIER_ICON: Record<string, typeof Globe> = { domain: Globe, project: FolderTree, thread: MessageSquare, folder: Folder };
const ACCENT = '#D6FE51';

function findNode(list: FileEntry[], path: string): FileEntry | null {
    for (const e of list) {
        if (e.path === path) return e;
        if (e.children) { const r = findNode(e.children, path); if (r) return r; }
    }
    return null;
}
function collectFilesUnder(tree: FileEntry[], path: string): string[] {
    const node = findNode(tree, path);
    if (!node) return [];
    const out: string[] = [];
    const walk = (e: FileEntry) => { if (e.tier === 'file') out.push(e.path); e.children?.forEach(walk); };
    walk(node);
    return out;
}

export default function Wiki() {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    wikiUserIdHolder.current = uid;
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

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const t = await fetchTree();
                if (cancelled) return;
                setTree(t);
                const folderLikes = collectMoveTargets(t, ' __none__');
                setNodes(folderLikes);
                setSelectedPath((prev) => prev ?? activeThread?.path ?? folderLikes[0]?.path ?? null);
                setBackendOffline(false);
            } catch {
                if (!cancelled) setBackendOffline(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeThread?.path]);

    const selected = nodes.find((n) => n.path === selectedPath) ?? null;
    const sources = selected ? collectFilesUnder(tree, selected.path) : [];
    const page = getWikiPage(wikiMap, selectedPath);

    const compile = useCallback(async () => {
        if (!selected || compiling) return;
        setCompiling(true);
        setErr('');
        const node = { path: selected.path, tier: selected.tier, name: selected.name };
        try {
            if (hasActiveLlm(integrations.llm)) {
                const res = await callLlm({
                    systemPrompt: 'You compile a knowledge-base wiki page for a node in a Domain→Project→Thread hierarchy. Respond with JSON only: {"overview": string (2-4 sentences), "concepts": string[] (key concepts), "openQuestions": string[], "sources": string[]}. Base it on the node name and its source document titles. Do not invent specific facts you cannot infer.',
                    prompt: `Tier: ${node.tier}\nNode: ${node.name}\nSource documents (titles):\n${sources.length ? sources.join('\n') : '(none yet)'}`,
                    responseFormat: 'json',
                    maxTokens: 1024,
                    temperature: 0.3,
                }, integrations.llm);
                const parsed = res ? parseWikiResponse(res.text, node, sources) : null;
                if (parsed) setWikiPage(parsed);
                else { setErr('The LLM returned no usable page — try again.'); }
            } else {
                // No LLM: build a structure-only page from the node's documents.
                setWikiPage(outlinePage(node, sources));
            }
        } catch (e: any) {
            setErr(e?.message || 'Compile failed.');
        } finally {
            setCompiling(false);
        }
    }, [selected, compiling, integrations.llm, sources]);

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', background: '#000', color: '#ccc', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            {/* Left: tier tree */}
            <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', background: '#070707' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #222' }}>
                    <BookOpen size={14} style={{ color: ACCENT }} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888' }}>Three-Tier Wiki</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                    {loading && <div style={{ padding: 16, color: '#555', fontSize: 11 }}>Loading…</div>}
                    {!loading && nodes.length === 0 && (
                        <div style={{ padding: 16, color: '#555', fontSize: 11, lineHeight: 1.6 }}>
                            No domains/projects/threads yet. Create them in the File Explorer to compile wiki pages.
                        </div>
                    )}
                    {nodes.map((n) => {
                        const Icon = TIER_ICON[n.tier] ?? Folder;
                        const isSel = n.path === selectedPath;
                        const has = !!wikiMap[n.path];
                        return (
                            <button key={n.path} onClick={() => setSelectedPath(n.path)}
                                style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', padding: '5px 10px', paddingLeft: 10 + n.depth * 12, background: isSel ? 'rgba(214,254,81,0.08)' : 'transparent', border: 'none', borderLeft: isSel ? `2px solid ${ACCENT}` : '2px solid transparent', color: isSel ? ACCENT : '#bbb', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                                <Icon size={13} strokeWidth={1.75} style={{ flexShrink: 0, opacity: isSel ? 1 : 0.7 }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                                {has && <span title="Compiled" style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Right: page */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {!selected ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13, padding: 24, textAlign: 'center' }}>
                        {backendOffline ? 'File backend offline — connect it to load your domains, projects, and threads.' : 'Select a domain, project, or thread to view or compile its wiki page.'}
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #222' }}>
                            {(() => { const I = TIER_ICON[selected.tier] ?? Folder; return <I size={18} style={{ color: ACCENT, flexShrink: 0 }} />; })()}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</div>
                                <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{selected.tier} wiki · {sources.length} source{sources.length === 1 ? '' : 's'}</div>
                            </div>
                            <button onClick={() => void compile()} disabled={compiling}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', background: ACCENT, color: '#000', fontSize: 12, fontWeight: 700, cursor: compiling ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: compiling ? 0.7 : 1 }}>
                                {compiling ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <BookOpen size={13} />}
                                {compiling ? 'Compiling…' : page ? 'Recompile' : 'Compile'}
                            </button>
                        </div>

                        {/* Tags — links this node into projects / cross-app associations */}
                        <div style={{ padding: '8px 18px', borderBottom: '1px solid #222' }}>
                            <TagInput source="wiki" sourceId={selected.path} title={selected.name} />
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
                            {err && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)', color: '#ff8da5', fontSize: 12 }}>⚠ {err}</div>}
                            {!llmReady && (
                                <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid #222', color: '#888', fontSize: 11 }}>
                                    No LLM configured — “Compile” builds a structure-only page (sources). Add a provider in Settings → API Keys for full synthesis (overview, concepts, open questions).
                                </div>
                            )}

                            {!page ? (
                                <div style={{ color: '#777', fontSize: 13, lineHeight: 1.7 }}>
                                    <p style={{ marginTop: 0 }}>No wiki page compiled for this {selected.tier} yet.</p>
                                    {sources.length > 0 && (
                                        <>
                                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT, margin: '16px 0 8px' }}>Source documents</div>
                                            {sources.map((s) => (
                                                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', color: '#bbb', fontSize: 12 }}>
                                                    <FileText size={13} style={{ color: '#666', flexShrink: 0 }} />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    <p style={{ marginTop: 16 }}>Click <strong style={{ color: ACCENT }}>Compile</strong> to synthesize this page.</p>
                                </div>
                            ) : (
                                <WikiPageView page={page} />
                            )}
                        </div>
                    </>
                )}
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT, marginBottom: 8 }}>{title}</div>
            {children}
        </div>
    );
}

function WikiPageView({ page }: { page: import('./wikiStore').WikiPage }) {
    return (
        <div>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 16 }}>
                Compiled {new Date(page.compiledAt).toLocaleString()} · {page.compiledBy === 'llm' ? 'AI synthesis' : 'structure only'}
            </div>
            {page.overview && (
                <Section title="Overview">
                    <p style={{ margin: 0, color: '#ddd', fontSize: 13, lineHeight: 1.7 }}>{page.overview}</p>
                </Section>
            )}
            {page.concepts.length > 0 && (
                <Section title="Key concepts">
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#ccc', fontSize: 13, lineHeight: 1.7 }}>
                        {page.concepts.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                </Section>
            )}
            {page.openQuestions.length > 0 && (
                <Section title="Open questions">
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#ccc', fontSize: 13, lineHeight: 1.7 }}>
                        {page.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                </Section>
            )}
            <Section title={`Sources (${page.sources.length})`}>
                {page.sources.length === 0 ? (
                    <div style={{ color: '#666', fontSize: 12 }}>No source documents yet.</div>
                ) : page.sources.map((s) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', color: '#bbb', fontSize: 12 }}>
                        <FileText size={13} style={{ color: '#666', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                    </div>
                ))}
            </Section>
        </div>
    );
}
