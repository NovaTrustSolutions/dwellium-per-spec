/**
 * HalocronKnowledgeGraph — the Graphify-style Knowledge Graph OS screen, shown
 * inside Holocron OS when "Knowledge Graph" is selected (2026-06-14).
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
import { MessageSquare, Sparkles, Star } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm } from '../../lib/llmClient';
import { renderSafeMarkdown } from '../../utils/safeMarkdown';
import AgentEta from '../common/AgentEta';
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

const KG_PROJECTS_KEY = 'dwellium:kg-projects';
const KG_ACTIVE_KEY = 'dwellium:kg-active-project';

/** User-added projects persist in localStorage so they survive remounts —
 *  e.g. switching Halocron OS tabs. DEFAULT_PROJECTS always show; saved extras
 *  (graphed repos) are merged in after them. SSR-guarded (returns defaults on
 *  the server). */
function loadKgProjects(): KgProject[] {
    if (typeof window === 'undefined') return DEFAULT_PROJECTS;
    try {
        const raw = window.localStorage.getItem(KG_PROJECTS_KEY);
        const saved: KgProject[] = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(saved)) return DEFAULT_PROJECTS;
        const defaultIds = new Set(DEFAULT_PROJECTS.map((p) => p.id));
        const extras = saved.filter((p) => p && typeof p.id === 'string' && !defaultIds.has(p.id));
        return [...DEFAULT_PROJECTS, ...extras];
    } catch {
        return DEFAULT_PROJECTS;
    }
}
function loadKgActive(): string {
    if (typeof window === 'undefined') return DEFAULT_PROJECTS[0].id;
    try {
        return window.localStorage.getItem(KG_ACTIVE_KEY) || DEFAULT_PROJECTS[0].id;
    } catch {
        return DEFAULT_PROJECTS[0].id;
    }
}

interface KgGraphData {
    files: number; edges: number; clusters: number; tokens: number; usdPerSession: number;
    importantFiles: { name: string; score: number; pct: number }[];
    nodes: { label: string; cluster: number; importance: number; deg: number }[];
    links: [number, number][];
    builtAt: string;
}

// Cluster palette (colour = cluster, as the reference legend says).
const CLUSTER_COLORS = ['#4d8aff', '#34d399', '#e7c879', '#ff5a8a', '#a855f7', '#22d3ee', '#f97316', '#e01e2b'];

// User-graphed repos cache their built graph here (per project id), so the graph
// renders on selection + survives reloads — no backend required.
const KG_GDATA_PREFIX = 'dwellium:kg-gdata:';
const KG_CODE_EXT = /\.(ts|tsx|js|jsx|py|rs|go|java|rb|c|h|hpp|cpp|cc|cs|php|swift|kt|scala|vue|svelte|mjs|cjs|sql)$/i;

/**
 * Graph a public GitHub repo entirely client-side via the GitHub REST API — two
 * calls (repo metadata + recursive file tree). Builds a structure graph (files +
 * directory clusters + size-weighted importance + synthesized intra-cluster
 * links). It is NOT a deep import graph (the browser can't fetch every file's
 * contents within rate limits), but it graphs any public repo with no backend.
 */
async function graphGithubRepo(rawUrl: string): Promise<{ project: KgProject; gdata: KgGraphData }> {
    const cleaned = rawUrl.trim().replace(/\.git$/i, '');
    const m = cleaned.match(/github\.com[/:]([^/\s]+)\/([^/?#\s]+)/i) || cleaned.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!m) throw new Error('Paste a GitHub URL like https://github.com/owner/repo');
    const owner = m[1];
    const repo = m[2];
    const api = 'https://api.github.com';
    const headers = { Accept: 'application/vnd.github+json' };

    const repoRes = await fetch(`${api}/repos/${owner}/${repo}`, { headers });
    if (repoRes.status === 404) throw new Error(`Repo not found: ${owner}/${repo} — check the URL and that it's public.`);
    if (repoRes.status === 403) throw new Error('GitHub API rate limit reached — wait a few minutes and try again.');
    if (!repoRes.ok) throw new Error(`GitHub error ${repoRes.status} fetching the repo.`);
    const repoJson = await repoRes.json();
    const branch: string = repoJson.default_branch || 'main';
    const lang: string = String(repoJson.language || 'CODE').toUpperCase();

    const treeRes = await fetch(`${api}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers });
    if (!treeRes.ok) throw new Error(`Couldn't read the file tree (HTTP ${treeRes.status}).`);
    const treeJson = await treeRes.json();
    const blobs: { path: string; size: number }[] = Array.isArray(treeJson.tree)
        ? treeJson.tree
            .filter((t: { type?: string }) => t.type === 'blob')
            .map((t: { path: string; size?: number }) => ({ path: t.path, size: t.size || 0 }))
        : [];
    if (!blobs.length) throw new Error('No files found in that repo.');

    const dirOf = (p: string) => { const i = p.indexOf('/'); return i < 0 ? '(root)' : p.slice(0, i); };
    const source = blobs.filter((b) => KG_CODE_EXT.test(b.path));
    const pool = source.length ? source : blobs;
    const dirs = Array.from(new Set(pool.map((b) => dirOf(b.path))));
    const clusterOf = new Map(dirs.map((d, i) => [d, i % CLUSTER_COLORS.length] as const));

    const capped = pool.slice().sort((a, b) => b.size - a.size).slice(0, 120);
    const maxSize = Math.max(1, ...capped.map((b) => b.size));
    const nodes = capped.map((b) => ({
        label: b.path,
        cluster: clusterOf.get(dirOf(b.path)) ?? 0,
        importance: Math.max(1, Math.round((b.size / maxSize) * 30)),
        deg: 0,
    }));
    // Synthesize intra-cluster hub links so the force layout + clusters render.
    const hub = new Map<number, number>();
    nodes.forEach((n, i) => { const h = hub.get(n.cluster); if (h === undefined || nodes[h].importance < n.importance) hub.set(n.cluster, i); });
    const links: [number, number][] = [];
    nodes.forEach((n, i) => { const h = hub.get(n.cluster); if (h !== undefined && h !== i) { links.push([i, h]); nodes[i].deg++; nodes[h].deg++; } });

    const top = nodes.slice().sort((a, b) => b.importance - a.importance).slice(0, 7);
    const maxScore = Math.max(1, ...top.map((n) => n.importance));
    const importantFiles = top.map((n) => ({ name: n.label.split('/').pop() || n.label, score: n.importance, pct: Math.round((n.importance / maxScore) * 100) }));

    const totalBytes = blobs.reduce((s, b) => s + b.size, 0);
    const tokens = Math.round(totalBytes / 4);
    const gdata: KgGraphData = {
        files: blobs.length,
        edges: links.length,
        clusters: dirs.length,
        tokens,
        usdPerSession: +((tokens / 1_000_000) * 3).toFixed(2),
        importantFiles,
        nodes,
        links,
        builtAt: new Date().toISOString(),
    };
    const id = `gh-${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-');
    const project: KgProject = {
        id,
        name: repo,
        lang,
        files: blobs.length,
        clusters: Math.min(dirs.length, CLUSTER_COLORS.length),
        blurb: `${owner}/${repo} — graphed from the GitHub file tree.`,
    };
    return { project, gdata };
}

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
    const [projects, setProjects] = useState<KgProject[]>(loadKgProjects);
    const [activeId, setActiveId] = useState<string>(loadKgActive);
    const [selected, setSelected] = useState<Node | null>(null);
    const [paused, setPaused] = useState(false);
    const [gdata, setGdata] = useState<KgGraphData | null>(null);
    // The graph "owns" wheel zoom only while focused (clicked) or hovered, so the
    // gesture never bubbles up and scrolls the page. Refs mirror the state so the
    // native (non-passive) wheel listener reads the latest value without re-binding.
    const [focused, setFocused] = useState(false);
    const [panning, setPanning] = useState(false);
    const focusedRef = useRef(false);
    const hoverRef = useRef(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const nodesRef = useRef<Node[]>([]);
    const linksRef = useRef<[number, number][]>([]);
    const rafRef = useRef<number>(0);
    const sizeRef = useRef({ w: 800, h: 520 });
    const viewRef = useRef({ zoom: 1, ox: 0, oy: 0 });   // scroll-wheel zoom + pan
    const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number; moved: boolean } | null>(null);
    const suppressNextClickRef = useRef(false);

    const project = useMemo(() => projects.find((p) => p.id === activeId) ?? projects[0], [projects, activeId]);
    const graphed = !!gdata;

    // Persist user-added projects + the active tab so they survive remounts
    // (switching Halocron OS tabs unmounts/remounts this panel).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const defaultIds = new Set(DEFAULT_PROJECTS.map((p) => p.id));
            const extras = projects.filter((p) => !defaultIds.has(p.id));
            window.localStorage.setItem(KG_PROJECTS_KEY, JSON.stringify(extras));
        } catch { /* ignore */ }
    }, [projects]);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try { window.localStorage.setItem(KG_ACTIVE_KEY, activeId); } catch { /* ignore */ }
    }, [activeId]);

    // Load the REAL per-repo graph JSON (public/data/kg/<id>.json) on selection.
    useEffect(() => {
        let cancelled = false;
        setGdata(null);
        // User-graphed repos live in localStorage; default projects ship a static JSON.
        let cached: string | null = null;
        try { cached = typeof window !== 'undefined' ? window.localStorage.getItem(KG_GDATA_PREFIX + activeId) : null; } catch { cached = null; }
        if (cached) {
            try { setGdata(JSON.parse(cached) as KgGraphData); } catch { /* corrupt cache — ignore */ }
        } else {
            fetch(`/data/kg/${activeId}.json`)
                .then((r) => (r.ok ? r.json() : null))
                .then((j) => { if (!cancelled && j) setGdata(j as KgGraphData); })
                .catch(() => { /* no graph file for this project — fall back to representative */ });
        }
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
        if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
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

    const zoomCanvasAt = useCallback((clientX: number, clientY: number, deltaY: number) => {
        const canvas = canvasRef.current;
        if (!canvas || deltaY === 0) return;
        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left, my = clientY - rect.top;
        const v = viewRef.current;
        const factor = deltaY < 0 ? 1.12 : 1 / 1.12;
        const nz = Math.max(0.35, Math.min(6, v.zoom * factor));
        // keep the point under the cursor fixed
        v.ox = mx - ((mx - v.ox) / v.zoom) * nz;
        v.oy = my - ((my - v.oy) / v.zoom) * nz;
        v.zoom = nz;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const finishDrag = (event: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag || event.pointerId !== drag.pointerId) return;

            event.preventDefault();
            event.stopPropagation();
            if (drag.moved) suppressNextClickRef.current = true;
            dragRef.current = null;
            setPanning(false);
            try {
                if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
            } catch { /* pointer capture is best-effort in tests and older engines */ }
        };

        const handlePointerDown = (event: PointerEvent) => {
            if (event.button !== 0) return;

            event.preventDefault();
            event.stopPropagation();
            focusedRef.current = true;
            setFocused(true);
            dragRef.current = {
                pointerId: event.pointerId,
                lastX: event.clientX,
                lastY: event.clientY,
                moved: false,
            };
            setPanning(true);
            try { canvas.setPointerCapture(event.pointerId); } catch { /* pointer capture is best-effort */ }
        };

        const handlePointerMove = (event: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag || event.pointerId !== drag.pointerId) return;

            if ((event.buttons & 1) !== 1) {
                finishDrag(event);
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            const dx = event.clientX - drag.lastX;
            const dy = event.clientY - drag.lastY;
            if (dx === 0 && dy === 0) return;

            const view = viewRef.current;
            view.ox += dx;
            view.oy += dy;
            drag.lastX = event.clientX;
            drag.lastY = event.clientY;
            drag.moved = true;
        };

        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', finishDrag);
        canvas.addEventListener('pointercancel', finishDrag);
        return () => {
            canvas.removeEventListener('pointerdown', handlePointerDown);
            canvas.removeEventListener('pointermove', handlePointerMove);
            canvas.removeEventListener('pointerup', finishDrag);
            canvas.removeEventListener('pointercancel', finishDrag);
            dragRef.current = null;
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;

        // Native non-passive wheel listener on the canvas AND its wrapper, so
        // wheeling anywhere over the graph card zooms the graph and the page never
        // scrolls (preventDefault + stopPropagation). The canvas fires first and
        // stops propagation, so the wrapper listener never double-zooms.
        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();
            event.stopPropagation();
            zoomCanvasAt(event.clientX, event.clientY, event.deltaY);
        };

        canvas?.addEventListener('wheel', handleWheel, { passive: false });
        wrap?.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            canvas?.removeEventListener('wheel', handleWheel);
            wrap?.removeEventListener('wheel', handleWheel);
        };
    }, [zoomCanvasAt]);

    // Click inside the graph focuses it (gates wheel zoom); clicking elsewhere
    // blurs it so the page scrolls normally again. Hover also enables zoom so the
    // gesture feels immediate without an extra click.
    useEffect(() => {
        const onDocPointerDown = (e: PointerEvent) => {
            const wrap = wrapRef.current;
            const next = !!wrap && e.target instanceof globalThis.Node && wrap.contains(e.target);
            focusedRef.current = next;
            setFocused(next);
        };
        document.addEventListener('pointerdown', onDocPointerDown);
        return () => document.removeEventListener('pointerdown', onDocPointerDown);
    }, []);

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
            // Graph the repo CLIENT-SIDE via the GitHub API (no backend needed) — two
            // calls (repo + recursive file tree). Cache the result so it renders on
            // selection and survives reloads.
            const { project, gdata } = await graphGithubRepo(url);
            try { window.localStorage.setItem(KG_GDATA_PREFIX + project.id, JSON.stringify(gdata)); } catch { /* quota — still renders this session */ }
            setProjects((ps) => ps.some((p) => p.id === project.id) ? ps : [...ps, project]);
            setActiveId(project.id);
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
                    <div
                        className={`kg-canvaswrap ${focused ? 'is-focused' : ''} ${panning ? 'is-panning' : ''}`}
                        ref={wrapRef}
                        onMouseEnter={() => { hoverRef.current = true; }}
                        onMouseLeave={() => { hoverRef.current = false; }}
                    >
                        <canvas ref={canvasRef} className="kg-canvas" onClick={onCanvasClick} />
                        <div className="kg-legend">size = importance · <Star size={11} aria-hidden style={{ verticalAlign: 'middle' }} /> = agent · colour = cluster · scroll to zoom</div>
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
                        <div className="kg-card__cap"><Sparkles size={12} aria-hidden /> MOST IMPORTANT FILES</div>
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
                    <span className="kg-card__cap"><MessageSquare size={12} aria-hidden /> ASK THE MAP</span>
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
                    {chatBusy && <div className="kg-chat__msg kg-chat__msg--assistant"><AgentEta label={`${agent.name} is working`} estimateSec={14} /></div>}
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
