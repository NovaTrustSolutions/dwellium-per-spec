/**
 * HalocronKnowledgeGraph — the Graphify-style Knowledge Graph OS screen, shown
 * inside Halocron OS when "Knowledge Graph" is selected (2026-06-14).
 *
 * Modeled 1:1 on the reference (Claude Code OS + Graphify):
 *   • top:    project "file-base" tabs + "Add a project" (graph a repo)
 *   • center: a LIVE, INTERACTIVE force graph — nodes drift, clusters are
 *             colour-coded, agent "god nodes" glow; click a node to inspect it
 *   • right:  Map Confidence · Most Important Files · Est. Savings · Selected
 *
 * Theme-token driven (matches the active theme like the rest of the OS). The
 * graph is rendered on <canvas> with requestAnimationFrame for real motion and
 * hit-testing for clicks. Data is a representative map over the active project
 * (clearly an illustrative graph, not a claim of a live repo scan).
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm } from '../../lib/llmClient';
import { renderSafeMarkdown } from '../../utils/safeMarkdown';
import './HalocronKnowledgeGraph.css';

export interface KgProject {
    id: string;
    name: string;
    lang: string;
    files: number;
    clusters: number;
    blurb: string;
}

export interface KgAgent {
    id: string;
    name: string;
    god: string;
    color: string;
    online: boolean;
}

// The user's agents, represented as gods (matches the reference's AGENTS rail).
export const KG_AGENTS: KgAgent[] = [
    { id: 'hermes', name: 'Hermes', god: 'Messenger', color: '#e7c879', online: true },
    { id: 'ara', name: 'ARA', god: 'Athena', color: '#4d8aff', online: true },
    { id: 'stella', name: 'Stella', god: 'Hestia', color: '#ff5a8a', online: true },
    { id: 'hydra', name: 'Hydra', god: 'Hydra', color: '#a855f7', online: false },
    { id: 'honcho', name: 'Honcho', god: 'Mnemosyne', color: '#34d399', online: false },
];

// files/clusters below are REAL counts from the static import-graph build
// (Scripts/kg_analyze → public/data/kg/<id>.json). Hermes is the LIVE graphify
// backend corpus. The others load their real graph JSON on selection.
// files/clusters are REAL counts from the static import-graph build
// (Scripts/kg_analyze → public/data/kg/<id>.json). Each project loads its real
// graph JSON (nodes/edges/important files/savings) on selection.
const DEFAULT_PROJECTS: KgProject[] = [
    { id: 'hermes', name: 'Hermes Agent', lang: 'PYTHON', files: 3278, clusters: 18, blurb: 'NousResearch/hermes-agent — graphed from the repo.' },
    { id: 'stella', name: 'Stella', lang: 'PYTHON', files: 179, clusters: 4, blurb: 'ultraworkers/claw-code — graphed from the repo.' },
    { id: 'claude', name: 'Claude Code', lang: 'TYPESCRIPT', files: 99, clusters: 3, blurb: 'anthropics/claude-code-action — graphed from the repo.' },
    { id: 'antigravity', name: 'AntiGravity', lang: 'PYTHON', files: 68, clusters: 2, blurb: 'google-antigravity/antigravity-sdk-python — graphed from the repo.' },
    { id: 'chatgpt', name: 'ChatGPT', lang: 'TYPESCRIPT', files: 39, clusters: 3, blurb: 'lencx/ChatGPT — graphed from the repo.' },
    { id: 'codex', name: 'Codex', lang: 'RUST', files: 2931, clusters: 6, blurb: 'openai/codex — graphed from the repo.' },
];

interface KgGraphData {
    files: number; edges: number; clusters: number; tokens: number; usdPerSession: number;
    importantFiles: { name: string; score: number; pct: number }[];
    nodes: { label: string; cluster: number; importance: number; deg: number }[];
    links: [number, number][];
    builtAt: string;
}

// Cluster palette (colour = cluster, as the reference legend says).
const CLUSTER_COLORS = ['#4d8aff', '#34d399', '#e7c879', '#ff5a8a', '#a855f7', '#22d3ee', '#f97316', '#e01e2b'];

interface Node {
    x: number; y: number; hx: number; hy: number; vx: number; vy: number;
    r: number; c: string; cluster: number; label: string; god?: KgAgent; importance: number;
}

const IMPORTANT_FILES = [
    { name: 'widgetRegistry.ts', score: 92 },
    { name: 'WindowContext.tsx', score: 78 },
    { name: 'UserContext.tsx', score: 71 },
    { name: 'ThemeContext.tsx', score: 64 },
    { name: 'HalocronOS.tsx', score: 58 },
    { name: 'llmClient.ts', score: 52 },
    { name: 'oneSaveClient.ts', score: 47 },
];

// Real Fruchterman-Reingold force layout — positions are driven by the actual
// edges: connected files attract, all files repel, settled once on load. This
// makes clusters and hubs emerge from real connectivity, not a cosmetic ring.
function forceLayout(nodes: Node[], links: [number, number][], w: number, h: number): void {
    const n = nodes.length;
    if (!n) return;
    const k = Math.sqrt((w * h) / n) * 0.8;       // ideal edge length
    const iters = n > 350 ? 90 : 150;
    const capSq = (k * 6) * (k * 6);
    let temp = Math.min(w, h) * 0.18;
    const cool = temp / (iters + 1);
    for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i++) { nodes[i].vx = 0; nodes[i].vy = 0; }
        // repulsion (distance-capped so it stays O(n²)-cheap and stable)
        for (let i = 0; i < n; i++) {
            const a = nodes[i];
            for (let j = i + 1; j < n; j++) {
                const b = nodes[j];
                let dx = a.x - b.x, dy = a.y - b.y;
                let d2 = dx * dx + dy * dy;
                if (d2 < 0.01) { d2 = 0.01; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
                if (d2 > capSq) continue;
                const f = (k * k) / d2;
                a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
            }
        }
        // attraction along real edges
        for (const [s, t] of links) {
            const a = nodes[s], b = nodes[t]; if (!a || !b) continue;
            let dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.hypot(dx, dy) || 0.01;
            const f = (dist * dist) / k;
            const fx = (dx / dist) * f, fy = (dy / dist) * f;
            a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
        // integrate (cooled) + light center gravity + bounds
        for (let i = 0; i < n; i++) {
            const a = nodes[i];
            const disp = Math.hypot(a.vx, a.vy) || 0.01;
            a.x += (a.vx / disp) * Math.min(disp, temp);
            a.y += (a.vy / disp) * Math.min(disp, temp);
            // Center gravity keeps the graph compact WITHOUT clamping to the
            // edge (the hard clamp piled nodes into a "border of dots").
            a.x += (w / 2 - a.x) * 0.022; a.y += (h / 2 - a.y) * 0.022;
        }
        temp = Math.max(temp - cool, 1);
    }
    for (const a of nodes) { a.hx = a.x; a.hy = a.y; a.vx = 0; a.vy = 0; }
}

// Build the render graph. When `data` (the real per-repo import graph) is
// present, nodes/edges/clusters/importance are REAL (from public/data/kg). The
// agent "god nodes" are overlaid on top for the Old-Republic look.
function buildGraph(project: KgProject, w: number, h: number, data: KgGraphData | null): { nodes: Node[]; links: [number, number][] } {
    const nodes: Node[] = [];
    const links: [number, number][] = [];

    if (data && data.nodes.length) {
        const clusterCount = Math.max(1, data.clusters);
        const centers = Array.from({ length: clusterCount }, (_, i) => {
            const ang = (i / clusterCount) * Math.PI * 2;
            const rad = Math.min(w, h) * 0.32;
            return { x: w / 2 + Math.cos(ang) * rad, y: h / 2 + Math.sin(ang) * rad };
        });
        const maxImp = Math.max(1, ...data.nodes.map((n) => n.importance));
        data.nodes.forEach((n) => {
            const ctr = centers[n.cluster % clusterCount] ?? { x: w / 2, y: h / 2 };
            const spread = 60 + Math.random() * 80;
            const a = Math.random() * Math.PI * 2;
            const x = ctr.x + Math.cos(a) * spread * Math.random();
            const y = ctr.y + Math.sin(a) * spread * Math.random();
            nodes.push({
                x, y, hx: x, hy: y, vx: 0, vy: 0,
                r: 1.6 + (n.importance / maxImp) * 5, c: CLUSTER_COLORS[n.cluster % CLUSTER_COLORS.length],
                cluster: n.cluster, label: n.label, importance: n.importance,
            });
        });
        data.links.forEach(([a, b]) => { if (a < nodes.length && b < nodes.length) links.push([a, b]); });
    } else {
        // representative fallback (only used before the JSON loads)
        const clusterCount = Math.min(8, Math.max(4, Math.round(project.clusters / 14)));
        const centers = Array.from({ length: clusterCount }, (_, i) => {
            const ang = (i / clusterCount) * Math.PI * 2;
            const rad = Math.min(w, h) * 0.30;
            return { x: w / 2 + Math.cos(ang) * rad, y: h / 2 + Math.sin(ang) * rad };
        });
        const total = Math.min(160, Math.max(60, Math.round(project.files / 7)));
        for (let i = 0; i < total; i++) {
            const cl = i % clusterCount; const ctr = centers[cl];
            const a = Math.random() * Math.PI * 2; const spread = 70 + Math.random() * 70;
            const x = ctr.x + Math.cos(a) * spread * Math.random(), y = ctr.y + Math.sin(a) * spread * Math.random();
            nodes.push({ x, y, hx: x, hy: y, vx: 0, vy: 0, r: 1.6 + Math.random() * 2.6, c: CLUSTER_COLORS[cl % CLUSTER_COLORS.length], cluster: cl, label: `file-${i}`, importance: 0 });
        }
    }

    // Settle the file nodes by their REAL connectivity before overlaying agents.
    forceLayout(nodes, links, w, h);

    // Agent god nodes overlaid near center.
    KG_AGENTS.forEach((g, i) => {
        const a = (i / KG_AGENTS.length) * Math.PI * 2;
        const rad = Math.min(w, h) * 0.13;
        const x = w / 2 + Math.cos(a) * rad, y = h / 2 + Math.sin(a) * rad;
        nodes.push({ x, y, hx: x, hy: y, vx: 0, vy: 0, r: 9, c: g.color, cluster: -1, label: g.name, god: g, importance: 100 });
    });
    return { nodes, links };
}

export default function HalocronKnowledgeGraph() {
    const [projects, setProjects] = useState<KgProject[]>(DEFAULT_PROJECTS);
    const [activeId, setActiveId] = useState<string>(DEFAULT_PROJECTS[0].id);
    const [selected, setSelected] = useState<Node | null>(null);
    const [paused, setPaused] = useState(false);
    const [gdata, setGdata] = useState<KgGraphData | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const nodesRef = useRef<Node[]>([]);
    const linksRef = useRef<[number, number][]>([]);
    const rafRef = useRef<number>(0);
    const sizeRef = useRef({ w: 800, h: 520 });
    const viewRef = useRef({ zoom: 1, ox: 0, oy: 0 });   // scroll-wheel zoom + pan

    const project = useMemo(() => projects.find((p) => p.id === activeId) ?? projects[0], [projects, activeId]);
    const graphed = !!gdata;

    // Load the REAL per-repo graph JSON (public/data/kg/<id>.json) on selection.
    useEffect(() => {
        let cancelled = false;
        setGdata(null);
        fetch(`/data/kg/${activeId}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!cancelled && j) setGdata(j as KgGraphData); })
            .catch(() => { /* no graph file for this project — fall back to representative */ });
        return () => { cancelled = true; };
    }, [activeId]);

    // (Re)build the render graph when the project, data, or canvas size changes.
    const rebuild = useCallback(() => {
        const { w, h } = sizeRef.current;
        const { nodes, links } = buildGraph(project, w, h, gdata);
        nodesRef.current = nodes;
        linksRef.current = links;
        viewRef.current = { zoom: 1, ox: 0, oy: 0 };   // reset zoom/pan on (re)build
        setSelected(null);
    }, [project, gdata]);

    useEffect(() => {
        const wrap = wrapRef.current, canvas = canvasRef.current;
        if (!wrap || !canvas) return;
        const ro = new ResizeObserver(() => {
            const r = wrap.getBoundingClientRect();
            sizeRef.current = { w: Math.max(320, r.width), h: Math.max(280, r.height) };
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = sizeRef.current.w * dpr; canvas.height = sizeRef.current.h * dpr;
            canvas.style.width = sizeRef.current.w + 'px'; canvas.style.height = sizeRef.current.h + 'px';
            const ctx = canvas.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            rebuild();
        });
        ro.observe(wrap);
        return () => ro.disconnect();
    }, [rebuild]);

    useEffect(() => { rebuild(); }, [rebuild]);

    // Animation loop — gentle drift around home positions + draw edges/nodes.
    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        let t = 0;
        const css = getComputedStyle(document.documentElement);
        const edgeColor = (css.getPropertyValue('--accent').trim() || '#4d8aff');

        const frame = () => {
            const { w, h } = sizeRef.current;
            const nodes = nodesRef.current;
            ctx.clearRect(0, 0, w, h);
            t += 0.016;
            // Apply scroll-wheel zoom + pan (drawn in world coords inside save/restore).
            const v = viewRef.current;
            ctx.save();
            ctx.translate(v.ox, v.oy);
            ctx.scale(v.zoom, v.zoom);
            // REAL edges: every import relationship found in the repo.
            const links = linksRef.current;
            ctx.globalAlpha = 0.14; ctx.strokeStyle = edgeColor; ctx.lineWidth = 0.5;
            ctx.beginPath();
            for (let i = 0; i < links.length; i++) {
                const a = nodes[links[i][0]], b = nodes[links[i][1]];
                if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            for (const n of nodes) {
                if (!reduce && !paused) {
                    // drift around home
                    n.x += Math.sin(t + n.hx * 0.01) * 0.12;
                    n.y += Math.cos(t + n.hy * 0.01) * 0.12;
                }
                const isSel = selected === n;
                if (n.god) {
                    // glowing god node
                    const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.6);
                    grd.addColorStop(0, n.c); grd.addColorStop(1, 'transparent');
                    ctx.globalAlpha = 0.55; ctx.fillStyle = grd;
                    ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 2.6, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.fillStyle = n.c;
                ctx.beginPath(); ctx.arc(n.x, n.y, isSel ? n.r * 1.8 : n.r, 0, Math.PI * 2); ctx.fill();
                if (isSel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke(); }
            }
            ctx.restore();
            rafRef.current = requestAnimationFrame(frame);
        };
        rafRef.current = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(rafRef.current);
    }, [selected, paused]);

    const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const v = viewRef.current;
        // invert the zoom/pan transform to get world coords
        const mx = (e.clientX - rect.left - v.ox) / v.zoom;
        const my = (e.clientY - rect.top - v.oy) / v.zoom;
        let best: Node | null = null, bestD = 16 / v.zoom;
        for (const n of nodesRef.current) {
            const d = Math.hypot(n.x - mx, n.y - my);
            if (d < Math.max(bestD, n.r + 6)) { best = n; bestD = d; }
        }
        setSelected(best);
    };

    // Scroll-wheel zoom toward the cursor (with pan preserved).
    const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const v = viewRef.current;
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const nz = Math.max(0.35, Math.min(6, v.zoom * factor));
        // keep the point under the cursor fixed
        v.ox = mx - ((mx - v.ox) / v.zoom) * nz;
        v.oy = my - ((my - v.oy) / v.zoom) * nz;
        v.zoom = nz;
    };

    // ── "A map you talk to": chat about the active project, seeded with its
    // real graph structure, through any agent (routed via the user's LLM keys).
    const { integrations: bundle } = useIntegrations();
    const [agentId, setAgentId] = useState<string>(KG_AGENTS[0].id);
    const [chat, setChat] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatBusy, setChatBusy] = useState(false);
    // New project → fresh conversation seeded with that project's structure.
    useEffect(() => { setChat([]); }, [activeId]);

    const seedPrompt = useCallback((): string => {
        const top = (gdata?.importantFiles ?? []).map((f) => `${f.name} (${f.score} importers)`).join(', ');
        const sample = (gdata?.nodes ?? []).slice(0, 40).map((n) => n.label).join(', ');
        return [
            `You are answering questions about the software project "${project.name}" (${project.blurb}).`,
            gdata ? `Real structure from its code graph: ${gdata.files} files, ${gdata.edges} import edges, ${gdata.clusters} top-level modules.` : '',
            top ? `The most-depended-on files (the heart of the project): ${top}.` : '',
            sample ? `A sample of files: ${sample}.` : '',
            `Answer concretely about THIS project's architecture using that structure. If unsure, say so.`,
        ].filter(Boolean).join('\n');
    }, [project, gdata]);

    const agent = KG_AGENTS.find((a) => a.id === agentId) ?? KG_AGENTS[0];
    const sendChat = useCallback(async () => {
        const q = chatInput.trim();
        if (!q || chatBusy) return;
        setChatInput('');
        setChat((c) => [...c, { role: 'user', text: q }]);
        setChatBusy(true);
        try {
            const history = chat.map((m) => `${m.role === 'user' ? 'User' : agent.name}: ${m.text}`).join('\n');
            const res = await callLlm({
                prompt: `${history ? history + '\n' : ''}User: ${q}\n${agent.name}:`,
                systemPrompt: `${seedPrompt()}\nYou are ${agent.name}, the project's ${agent.god}. Be concise and specific.`,
            }, bundle.llm);
            setChat((c) => [...c, { role: 'assistant', text: res?.text ?? '(No LLM configured — add a key in Control Panel → API Keys to talk to the map.)' }]);
        } catch (e) {
            setChat((c) => [...c, { role: 'assistant', text: `Error: ${(e as Error).message}` }]);
        } finally { setChatBusy(false); }
    }, [chatInput, chatBusy, chat, agent, seedPrompt, bundle.llm]);

    const [adding, setAdding] = useState(false);
    const addProject = async () => {
        const url = window.prompt('Graph a repo — paste a GitHub URL (https://github.com/owner/repo):');
        if (!url) return;
        setAdding(true);
        try {
            const r = await fetch('/__kg/graph-repo', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() }),
            });
            const j = await r.json();
            if (!j?.success) throw new Error(j?.error || 'Graphing failed');
            const c = j.project as { id: string; name: string; lang: string; files: number; clusters: number; blurb: string };
            setProjects((ps) => ps.some((p) => p.id === c.id) ? ps : [...ps, { id: c.id, name: c.name, lang: c.lang, files: c.files, clusters: c.clusters, blurb: c.blurb }]);
            setActiveId(c.id);
        } catch (e) {
            window.alert(`Could not graph that repo:\n${(e as Error).message}`);
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="kg">
            {/* ── top: project tabs ── */}
            <div className="kg-tabs">
                {projects.map((p) => (
                    <button key={p.id} type="button"
                        className={`kg-tab ${p.id === activeId ? 'on' : ''}`}
                        onClick={() => setActiveId(p.id)}>
                        <div className="kg-tab__top"><span className="kg-tab__name">{p.name}</span><span className="kg-tab__lang">{p.lang}</span></div>
                        <div className="kg-tab__blurb">{p.blurb}</div>
                        <div className="kg-tab__meta">{p.files.toLocaleString()} files · {p.clusters} clusters</div>
                    </button>
                ))}
                <button type="button" className="kg-tab kg-tab--add" onClick={addProject} disabled={adding}>
                    <span className="kg-add__plus">{adding ? '◌' : '+'}</span>
                    <span className="kg-add__label">{adding ? 'Graphing…' : 'Add a project'}</span>
                    <span className="kg-add__sub">{adding ? 'cloning + analyzing' : 'graph a repo · $0'}</span>
                </button>
            </div>

            <div className="kg-body">
                {/* ── center: live graph ── */}
                <div className="kg-stage">
                    <div className="kg-stage__hdr">
                        <div>
                            <div className="kg-stage__proj">● {project.name}{graphed ? <span className="kg-live">GRAPHED</span> : <span className="kg-rep">loading…</span>}</div>
                            <div className="kg-stage__sub">
                                {gdata
                                    ? <>{gdata.files.toLocaleString()} files · {gdata.edges.toLocaleString()} edges · {gdata.clusters} clusters · {gdata.nodes.length} rendered</>
                                    : <>{project.files.toLocaleString()} files · {project.clusters} clusters</>}
                            </div>
                        </div>
                        <div className="kg-seg">
                            <button className="on">Full</button>
                            <button onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button>
                        </div>
                    </div>
                    <div className="kg-canvaswrap" ref={wrapRef}>
                        <canvas ref={canvasRef} className="kg-canvas" onClick={onCanvasClick} onWheel={onWheel} />
                        <div className="kg-legend">size = importance · ★ = agent · colour = cluster</div>
                    </div>
                </div>

                {/* ── right: intelligence rail ── */}
                <aside className="kg-rail">
                    <section className="kg-card">
                        <div className="kg-card__cap">MAP CONFIDENCE</div>
                        <div className="kg-conf"><span style={{ width: '100%' }} /></div>
                        <div className="kg-conf__row"><span className="kg-dot" style={{ background: '#34d399' }} /> Found in code <b>100%</b></div>
                        <div className="kg-conf__row"><span className="kg-dot" style={{ background: '#a855f7' }} /> Inferred (model's guess) <b>0%</b></div>
                    </section>

                    <section className="kg-card">
                        <div className="kg-card__cap">✦ MOST IMPORTANT FILES</div>
                        <p className="kg-card__note">The files everything else relies on — by how many other files import them.</p>
                        {(gdata?.importantFiles ?? IMPORTANT_FILES).map((f, i) => (
                            <div key={f.name + i} className="kg-imp">
                                <span className="kg-imp__n">{i + 1}. {f.name}</span>
                                <span className="kg-imp__bar"><span style={{ width: `${('pct' in f ? f.pct : f.score)}%` }} /></span>
                            </div>
                        ))}
                    </section>

                    <section className="kg-card">
                        <div className="kg-card__cap">EST. SAVINGS / SESSION</div>
                        <div className="kg-save">~${gdata ? gdata.usdPerSession.toFixed(2) : '0.00'}</div>
                        <p className="kg-card__note">{gdata ? `${(gdata.tokens / 1000).toFixed(0)}k tokens to re-read ${project.name} each session (≈ $3/MTok) — answered from the map instead.` : `Graph loading…`}</p>
                    </section>

                    <section className="kg-card">
                        <div className="kg-card__cap">SELECTED</div>
                        {selected ? (
                            <div className="kg-sel">
                                <div className="kg-sel__name">{selected.god ? `${selected.god.name} · ${selected.god.god}` : selected.label}</div>
                                <div className="kg-sel__row">{selected.god ? 'Agent (god node)' : `Cluster ${selected.cluster + 1}`}</div>
                                <div className="kg-sel__row">importance {selected.importance}</div>
                            </div>
                        ) : (
                            <p className="kg-card__note">Click a node (or a god node) to inspect it.</p>
                        )}
                    </section>
                </aside>
            </div>

            {/* ── "Ask the map" — full-width bottom dock, same width as the graph ── */}
            <section className="kg-chatdock">
                <div className="kg-chatdock__hdr">
                    <span className="kg-card__cap">💬 ASK THE MAP</span>
                    <div className="kg-chat__agent">
                        <span>Agent</span>
                        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                            {KG_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.god}</option>)}
                        </select>
                    </div>
                </div>
                <div className="kg-chat__log kg-chatdock__log">
                    {chat.length === 0 && <div className="kg-chat__hint">Ask {agent.name} about {project.name} — seeded with its real structure.</div>}
                    {chat.map((m, i) => (
                        <div key={i} className={`kg-chat__msg kg-chat__msg--${m.role}`}>
                            {m.role === 'assistant'
                                ? <span dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(m.text) }} />
                                : m.text}
                        </div>
                    ))}
                    {chatBusy && <div className="kg-chat__msg kg-chat__msg--assistant">…</div>}
                </div>
                <div className="kg-chat__inputrow">
                    <input className="kg-chat__input" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                        placeholder={`Ask ${agent.name} about ${project.name}…`} />
                    <button className="kg-chat__send" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>↑</button>
                </div>
            </section>
        </div>
    );
}
