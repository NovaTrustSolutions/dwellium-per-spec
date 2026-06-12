/**
 * KnowledgeGraph — force-directed knowledge graph (spec §7.5).
 *
 * Nodes are documents; edges are tag-overlap (shared Domain+Project derived from
 * the file path). Domain filter, community coloring (connected components as a
 * lightweight Louvain stand-in), structural-gap detection (isolated nodes), and
 * double-click to open a document in Scribe. Uses a self-contained force layout
 * (no d3 dependency).
 */
import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { Share2, AlertTriangle } from 'lucide-react';
import { fetchTree } from '../FileExplorer/fileExplorerApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import { useScribeStore } from '../Scribe/scribeStore';
import { buildGraph, communities, isolatedNodes, simulate, type GraphNode } from './forceLayout';
import GraphifyView from './GraphifyView';

const W = 760, H = 470;
const PALETTE = ['#D6FE51', '#74c4ff', '#ff7a93', '#ffce3a', '#a78bfa', '#22c55e', '#f59e0b', '#22d3ee'];

function allFiles(tree: FileEntry[]): string[] {
    const out: string[] = [];
    const walk = (e: FileEntry) => { if (e.tier === 'file') out.push(e.path); e.children?.forEach(walk); };
    tree.forEach(walk);
    return out;
}

function FilesGraphView() {
    const [tree, setTree] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [offline, setOffline] = useState(false);
    const [domain, setDomain] = useState<string>('all');
    const [hover, setHover] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try { const t = await fetchTree(); if (!cancelled) { setTree(t); setOffline(false); } }
            catch { if (!cancelled) setOffline(true); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    const files = useMemo(() => allFiles(tree), [tree]);
    const domains = useMemo(() => Array.from(new Set(files.map((f) => f.split('/')[0]))).sort(), [files]);

    const { nodes, links, isoCount, colorOf } = useMemo(() => {
        const filtered = domain === 'all' ? files : files.filter((f) => f.split('/')[0] === domain);
        const g = buildGraph(filtered);
        simulate(g.nodes, g.links, { width: W, height: H, iterations: 320 });
        const comp = communities(g.nodes, g.links);
        const colorOf = (n: GraphNode) => PALETTE[(comp.get(n.id) ?? 0) % PALETTE.length];
        return { nodes: g.nodes, links: g.links, isoCount: isolatedNodes(g.nodes).length, colorOf };
    }, [files, domain]);

    const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

    const openInScribe = (path: string) => {
        try { void useScribeStore.getState().openFile(path); } catch { /* */ }
        window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: 'scribe' }));
        window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Opening ${path.split('/').pop()} in Scribe` }));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--bg-desktop)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <Share2 size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Knowledge Graph</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: '#666' }}>{nodes.length} nodes · {links.length} edges</span>
                {isoCount > 0 && (
                    <span title="Structural gaps — documents with no tag-overlap connections" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#ffce3a' }}>
                        <AlertTriangle size={12} /> {isoCount} gap{isoCount === 1 ? '' : 's'}
                    </span>
                )}
                <select value={domain} onChange={(e) => setDomain(e.target.value)} title="Filter by domain"
                    style={{ background: 'var(--bg-desktop)', color: 'var(--text-secondary)', border: '1px solid #333', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}>
                    <option value="all">All domains</option>
                    {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
            </div>

            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                {loading && <Center text="Loading graph…" />}
                {!loading && offline && <Center text="File backend offline — connect it to map your documents." />}
                {!loading && !offline && nodes.length === 0 && <Center text="No documents yet. Create files in the File Explorer to build the graph." />}
                {!loading && nodes.length > 0 && (
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
                        {links.map((l, i) => {
                            const a = byId.get(l.source), b = byId.get(l.target);
                            if (!a || !b) return null;
                            const hot = hover === l.source || hover === l.target;
                            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? '#D6FE51' : '#2c2c2c'} strokeWidth={hot ? 1.5 : 1} />;
                        })}
                        {nodes.map((n) => {
                            const r = Math.max(6, Math.min(13, 6 + n.degree * 1.5));
                            const iso = n.degree === 0;
                            return (
                                <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                                    onDoubleClick={() => openInScribe(n.id)}>
                                    <title>{n.id}{iso ? '  (structural gap — no connections)' : ''}</title>
                                    <circle r={r} fill={iso ? '#0a0a0a' : colorOf(n)} stroke={iso ? '#ffce3a' : (hover === n.id ? '#fff' : 'rgba(0,0,0,0.4)')} strokeWidth={iso ? 1.5 : 1} strokeDasharray={iso ? '3 2' : undefined} />
                                    {(hover === n.id || n.degree >= 2) && (
                                        <text x={r + 4} y={4} fontSize={10} fill={hover === n.id ? '#fff' : '#999'} style={{ pointerEvents: 'none' }}>{n.label}</text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                )}
                <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 10, color: 'var(--text-tertiary)' }}>
                    Double-click a node to open it in Scribe · edges = shared domain + project
                </div>
            </div>
        </div>
    );
}

function Center({ text }: { text: string }) {
    return <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: 24, textAlign: 'center' }}>{text}</div>;
}

/**
 * KG arc 2026-06-12 (Ilya): the widget now hosts TWO graphs behind tabs —
 * "Memories & Knowledge" (graphify over One Save knowledge: Honcho,
 * ThoughtWeaver, Hermes, CoPaw, wiki, tasks…; DEFAULT) and the original
 * spec-§7.5 "Workspace Files" tag-overlap graph.
 */
export default function KnowledgeGraph() {
    const [tab, setTab] = useState<'knowledge' | 'files'>('knowledge');
    const tabBtn = (active: boolean): CSSProperties => ({
        background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit',
        fontSize: 12, padding: '8px 12px', color: active ? 'var(--accent)' : 'var(--text-tertiary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    });
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg-desktop)' }}>
            <div role="tablist" aria-label="Knowledge graph views" style={{ display: 'flex', gap: 4, padding: '0 10px', borderBottom: '1px solid var(--border-color, #222)', flexShrink: 0 }}>
                <button role="tab" aria-selected={tab === 'knowledge'} style={tabBtn(tab === 'knowledge')} onClick={() => setTab('knowledge')}>Memories &amp; Knowledge</button>
                <button role="tab" aria-selected={tab === 'files'} style={tabBtn(tab === 'files')} onClick={() => setTab('files')}>Workspace Files</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                {tab === 'knowledge' ? <GraphifyView /> : <FilesGraphView />}
            </div>
        </div>
    );
}
