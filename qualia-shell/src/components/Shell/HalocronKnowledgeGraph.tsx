/**
 * HalocronKnowledgeGraph — the Knowledge Graph OS screen, shown inside
 * Holocron OS when "Knowledge Graph" is selected.
 *
 * Split (plan 072 phase 1) into a thin view-switching wrapper (default export,
 * below) over two tabs:
 *   • "My knowledge" — GraphifyView, the real graphify graph over the user's
 *     own One Save knowledge (memories, captures, notes, tasks).
 *   • "Code repos"   — RepoGraph, the reference-repo canvas this file
 *     originally was: project tabs + a live force-directed <canvas> + rail +
 *     "Ask the map" chat. Data is either a static per-repo import graph
 *     (public/data/kg/*.json, capped at 600 nodes) or a GitHub-file-tree
 *     structure graph for a pasted repo (links are directory hubs, not
 *     real imports) — the rail discloses which.
 *
 * Both tabs are keyed by the signed-in user's id: switching accounts remounts
 * them, so one user's chat/selection/viewer never leaks to the next, and a
 * reply that lands after the switch has nowhere to render into.
 */
import { useContext, useEffect, useId, useMemo, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm } from '../../lib/llmClient';
import { UserContext } from '../../context/UserContext';
import GraphifyView from '../KnowledgeGraph/GraphifyView';
import {
    DEFAULT_KG_PROJECTS,
    removeKgProject,
    setKgActiveProject,
    setKgView,
    upsertKgProject,
    useHalocronKnowledgeGraphState,
    type KgGraphData,
    type KgProject,
} from '../../lib/halocronKnowledgeGraphStore';
import { renderSafeMarkdown } from '../../utils/safeMarkdown';
import { captureOwner } from '../../lib/perUserIdentity';
import AgentEta from '../common/AgentEta';
import { KG_AGENTS, type KgAgent } from './HalocronKnowledgeGraph.agents';
import { buildGraph, centreOn, matchNodes, neighbours, pickNearest, rescale, seedFor, toExportJson, type KgNode } from './kgCanvas';
import './HalocronKnowledgeGraph.css';

// KG_AGENTS + KgAgent are now hoisted to the data-only
// `HalocronKnowledgeGraph.agents` module so HalocronOS can import the constant
// without statically pulling this heavy component (plan 008). Re-exported here
// for backward compatibility with existing importers of this file.
export { KG_AGENTS, type KgAgent };

// Cluster count (colour = cluster, as the reference legend says). Actual
// colours are theme tokens (--kg-c0..--kg-c7, plan 072 phase 2 B5) read at
// draw time, not hard-coded here — this constant is only "how many clusters".
const KG_CLUSTER_COUNT = 8;

const KG_CODE_EXT = /\.(ts|tsx|js|jsx|py|rs|go|java|rb|c|h|hpp|cpp|cc|cs|php|swift|kt|scala|vue|svelte|mjs|cjs|sql)$/i;

/**
 * Graph a public GitHub repo entirely client-side via the GitHub REST API — two
 * calls (repo metadata + recursive file tree). Builds a structure graph (files +
 * directory clusters + size-weighted importance + synthesized intra-cluster
 * links). It is NOT a deep import graph (the browser can't fetch every file's
 * contents within rate limits), but it graphs any public repo with no backend.
 */
export async function graphGithubRepo(rawUrl: string): Promise<{ project: KgProject; gdata: KgGraphData }> {
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
    const clusterOf = new Map(dirs.map((d, i) => [d, i % KG_CLUSTER_COUNT] as const));

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
        source: 'github-tree',
        totalFiles: pool.length,
    };
    const id = `gh-${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-');
    const project: KgProject = {
        id,
        name: repo,
        lang,
        files: blobs.length,
        clusters: Math.min(dirs.length, KG_CLUSTER_COUNT),
        blurb: `${owner}/${repo} — graphed from the GitHub file tree${treeJson.truncated ? ' (GitHub listed only part of this repo)' : ''}.`,
    };
    return { project, gdata };
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

function RepoGraph() {
    const kgState = useHalocronKnowledgeGraphState();
    const [selected, setSelected] = useState<KgNode | null>(null);
    const [paused, setPaused] = useState(false);
    const [gdata, setGdata] = useState<KgGraphData | null>(null);
    const [loadState, setLoadState] = useState<'loading' | 'error' | 'loaded'>('loading');
    const [retryCount, setRetryCount] = useState(0);
    // The graph "owns" wheel zoom only while focused (clicked) or hovered, so the
    // gesture never bubbles up and scrolls the page. Refs mirror the state so the
    // native (non-passive) wheel listener reads the latest value without re-binding.
    const [focused, setFocused] = useState(false);
    const [panning, setPanning] = useState(false);
    const focusedRef = useRef(false);
    const hoverRef = useRef(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const nodesRef = useRef<KgNode[]>([]);
    const linksRef = useRef<[number, number][]>([]);
    const rafRef = useRef<number>(0);
    const sizeRef = useRef({ w: 800, h: 520 });
    const viewRef = useRef({ zoom: 1, ox: 0, oy: 0 });   // scroll-wheel zoom + pan
    const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number; moved: boolean } | null>(null);
    const suppressNextClickRef = useRef(false);
    // Draw-on-demand plumbing (B4): `pausedRef`/`selectedRef` let the rAF loop
    // effect (mount-once, below) read the latest paused/selected state without
    // being torn down and rebuilt on every change. `drawRef`/`ensureLoopRef` are
    // filled in by that effect and called by every OTHER effect/handler that
    // changes what should be on screen (resize, rebuild, zoom/pan, selection).
    const pausedRef = useRef(false);
    const selectedRef = useRef<KgNode | null>(null);
    const drawRef = useRef<(drift: boolean) => void>(() => {});
    const ensureLoopRef = useRef<() => void>(() => {});

    // Search (C2): matches recomputed on every keystroke and on rebuild; drawn
    // via matchSetRef (dims non-matches) and cycled via activeMatchRef (Enter).
    const [query, setQuery] = useState('');
    const [matches, setMatches] = useState<number[]>([]);
    const [nodesVersion, setNodesVersion] = useState(0);
    const queryRef = useRef('');
    const matchSetRef = useRef<Set<number>>(new Set());
    const activeMatchRef = useRef(-1);
    const [showList, setShowList] = useState(false);
    const nodeListId = `kg-nodelist${useId().replace(/:/g, "")}`; // unique per mounted instance (OS tab + desktop window)

    const projects = useMemo(() => {
        const defaultIds = new Set(DEFAULT_KG_PROJECTS.map((p) => p.id));
        const extras = kgState.extras.filter((p) => !defaultIds.has(p.id));
        return [...DEFAULT_KG_PROJECTS, ...extras];
    }, [kgState.extras]);
    const activeId = projects.some((p) => p.id === kgState.activeId)
        ? kgState.activeId
        : DEFAULT_KG_PROJECTS[0].id;
    const project = useMemo(() => projects.find((p) => p.id === activeId) ?? projects[0], [projects, activeId]);
    // Layout depends only on project.id + gdata identity (B3) — but buildGraph's
    // fallback path also reads project.files/clusters, so keep the latest full
    // object in a ref rather than widening the rebuild dependency array.
    const projectRef = useRef(project);
    projectRef.current = project;

    useEffect(() => {
        pausedRef.current = paused;
        if (paused) drawRef.current(false); else ensureLoopRef.current();
    }, [paused]);

    useEffect(() => {
        selectedRef.current = selected;
        drawRef.current(false);
    }, [selected]);

    // Load the REAL per-repo graph JSON (public/data/kg/<id>.json) on selection.
    // Tracks loadState so a fetch failure shows "couldn't load" + Retry instead
    // of "loading…" forever (E3) — bumping retryCount re-runs this effect.
    // Depends on the ACTIVE project's cached graph identity (not the whole
    // `graphs` map, B3) — an unrelated store write (e.g. a different tab's
    // upsert) leaves this key's reference untouched, so this never refetches.
    const cachedGraph = kgState.graphs[activeId];
    useEffect(() => {
        let cancelled = false;
        setGdata(null);
        setLoadState('loading');
        if (cachedGraph) {
            setGdata(cachedGraph);
            setLoadState('loaded');
            return;
        }
        fetch(`/data/kg/${activeId}.json`)
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then((j) => { if (!cancelled) { setGdata(j as KgGraphData); setLoadState('loaded'); } })
            .catch(() => { if (!cancelled) setLoadState('error'); });
        return () => { cancelled = true; };
    }, [activeId, cachedGraph, retryCount]);

    // (Re)build the render graph — ONLY when the project or its graph data
    // actually changes (B3), never on an unrelated resize (B2) or store write.
    const rebuild = useCallback(() => {
        const { w, h } = sizeRef.current;
        const { nodes, links } = buildGraph(projectRef.current, w, h, gdata, KG_AGENTS, seedFor(project.id));
        nodesRef.current = nodes;
        linksRef.current = links;
        viewRef.current = { zoom: 1, ox: 0, oy: 0 };   // reset zoom/pan on (re)build
        setSelected(null);
        // A new node array invalidates match indices from the previous graph.
        setQuery(''); queryRef.current = ''; matchSetRef.current = new Set(); setMatches([]);
        activeMatchRef.current = -1;
        setNodesVersion((v) => v + 1);
        drawRef.current(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id, gdata]);

    useEffect(() => { rebuild(); }, [rebuild]);

    // Resize (B2): debounced 150 ms, and RESCALES existing positions instead of
    // re-laying-out (no re-seeding, no scramble while dragging a window edge).
    useEffect(() => {
        const wrap = wrapRef.current, canvas = canvasRef.current;
        if (!wrap || !canvas) return;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const applyResize = () => {
            debounceTimer = null;
            const r = wrap.getBoundingClientRect();
            const nextW = Math.max(320, r.width), nextH = Math.max(280, r.height);
            const prev = sizeRef.current;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = nextW * dpr; canvas.height = nextH * dpr;
            canvas.style.width = nextW + 'px'; canvas.style.height = nextH + 'px';
            const ctx = canvas.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (prev.w !== nextW || prev.h !== nextH) {
                rescale(nodesRef.current, prev.w, prev.h, nextW, nextH);
                sizeRef.current = { w: nextW, h: nextH };
            }
            drawRef.current(false);
        };
        const ro = new ResizeObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(applyResize, 150);
        });
        ro.observe(wrap);
        return () => { ro.disconnect(); if (debounceTimer) clearTimeout(debounceTimer); };
    }, []);

    // Canvas draw machinery (B4/B5) — set up ONCE. The rAF loop only runs while
    // drifting is actually wanted (not paused, no reduced-motion, tab visible,
    // canvas on-screen); otherwise a single static frame is drawn on demand by
    // every other effect/handler via `drawRef.current(false)`. Colours are read
    // from theme tokens on the canvas element and re-read whenever <html>'s
    // class changes (theme switch), never hard-coded.
    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;

        const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        let visible = true;
        let docVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
        let t = 0;
        let palette = {
            edge: '#4d8aff', sel: '#fff',
            clusters: ['#4d8aff', '#34d399', '#e7c879', '#ff5a8a', '#a855f7', '#22d3ee', '#f97316', '#e01e2b'],
        };
        const readPalette = () => {
            const cs = getComputedStyle(canvas);
            const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
            palette = {
                edge: get('--accent', palette.edge),
                sel: get('--kg-sel', palette.sel),
                clusters: palette.clusters.map((c, i) => get(`--kg-c${i}`, c)),
            };
        };
        readPalette();

        const draw = (drift: boolean) => {
            const { w, h } = sizeRef.current;
            const nodes = nodesRef.current;
            ctx.clearRect(0, 0, w, h);
            if (drift) t += 0.016;
            // Apply scroll-wheel zoom + pan (drawn in world coords inside save/restore).
            const v = viewRef.current;
            ctx.save();
            ctx.translate(v.ox, v.oy);
            ctx.scale(v.zoom, v.zoom);
            // REAL edges: every import relationship found in the repo.
            const links = linksRef.current;
            ctx.globalAlpha = 0.14; ctx.strokeStyle = palette.edge; ctx.lineWidth = 0.5;
            ctx.beginPath();
            for (let i = 0; i < links.length; i++) {
                const a = nodes[links[i][0]], b = nodes[links[i][1]];
                if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            const searching = !!queryRef.current;
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (drift) {
                    // drift around home
                    n.x += Math.sin(t + n.hx * 0.01) * 0.12;
                    n.y += Math.cos(t + n.hy * 0.01) * 0.12;
                }
                const isSel = selectedRef.current === n;
                const dimmed = searching && !n.god && !matchSetRef.current.has(i);
                const color = n.god ? n.god.color : palette.clusters[((n.cluster % 8) + 8) % 8];
                if (n.god) {
                    // glowing god node
                    const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.6);
                    grd.addColorStop(0, color); grd.addColorStop(1, 'transparent');
                    ctx.globalAlpha = 0.55; ctx.fillStyle = grd;
                    ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 2.6, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.globalAlpha = dimmed ? 0.15 : 1;
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.arc(n.x, n.y, isSel ? n.r * 1.8 : n.r, 0, Math.PI * 2); ctx.fill();
                if (isSel) { ctx.strokeStyle = palette.sel; ctx.lineWidth = 1.4; ctx.stroke(); }
                ctx.globalAlpha = 1;
            }
            ctx.restore();
        };
        drawRef.current = draw;

        const shouldRun = () => !pausedRef.current && !reducedMotion && docVisible && visible;
        const loop = () => {
            draw(true);
            rafRef.current = shouldRun() ? requestAnimationFrame(loop) : 0;
        };
        const stopLoop = () => {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
        };
        const ensureLoop = () => {
            if (rafRef.current) return;
            if (shouldRun()) rafRef.current = requestAnimationFrame(loop);
            else draw(false);
        };
        ensureLoopRef.current = ensureLoop;

        let intersectionObserver: IntersectionObserver | null = null;
        if (typeof IntersectionObserver !== 'undefined') {
            intersectionObserver = new IntersectionObserver((entries) => {
                const entry = entries[entries.length - 1];
                visible = entry ? entry.isIntersecting : true;
                if (shouldRun()) ensureLoop(); else { stopLoop(); draw(false); }
            });
            intersectionObserver.observe(canvas);
        }

        const onVisibilityChange = () => {
            docVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
            if (shouldRun()) ensureLoop(); else { stopLoop(); draw(false); }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        let mutationObserver: MutationObserver | null = null;
        if (typeof MutationObserver !== 'undefined') {
            mutationObserver = new MutationObserver(() => { readPalette(); draw(false); });
            mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        }

        if (shouldRun()) rafRef.current = requestAnimationFrame(loop); else draw(false);

        return () => {
            stopLoop();
            intersectionObserver?.disconnect();
            mutationObserver?.disconnect();
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    const selectByIndex = useCallback((idx: number) => {
        setSelected(idx >= 0 ? nodesRef.current[idx] ?? null : null);
    }, []);

    // Select + centre the view on it (keeping zoom) + repaint — used by the
    // search "Enter to cycle" flow and by the accessible node list (C1/C2),
    // which both need the node to be visibly brought into view.
    const selectAndCentre = useCallback((idx: number) => {
        const node = nodesRef.current[idx];
        if (!node) return;
        selectByIndex(idx);
        const { w, h } = sizeRef.current;
        viewRef.current = centreOn(viewRef.current, node, w, h);
        drawRef.current(false);
    }, [selectByIndex]);

    const runSearch = useCallback((q: string) => {
        setQuery(q);
        queryRef.current = q;
        const m = matchNodes(nodesRef.current, q);
        matchSetRef.current = new Set(m);
        setMatches(m);
        activeMatchRef.current = -1;
        drawRef.current(false);
    }, []);

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') { e.preventDefault(); runSearch(''); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!matches.length) return;
        const dir = e.shiftKey ? -1 : 1;
        activeMatchRef.current = ((activeMatchRef.current + dir) % matches.length + matches.length) % matches.length;
        selectAndCentre(matches[activeMatchRef.current]);
    };

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
        // B1: nearest node within range, not the last one examined.
        selectByIndex(pickNearest(nodesRef.current, mx, my, v.zoom));
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
        drawRef.current(false);
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
            drawRef.current(false);
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
            // B6: cap to the last 8 messages — an unbounded history was sent every turn.
            const history = chat.slice(-8).map((m) => `${m.role === 'user' ? 'User' : agent.name}: ${m.text}`).join('\n');
            const res = await callLlm({
                prompt: `${history ? history + '\n' : ''}User: ${q}\n${agent.name}:`,
                systemPrompt: `${seedPrompt()}\nYou are ${agent.name}, the project's ${agent.god}. Be concise and specific.`,
            }, bundle.llm);
            setChat((c) => [...c, { role: 'assistant', text: res?.text ?? '(No LLM configured — add a key in Control Panel → API Keys to talk to the map.)' }]);
        } catch (e) {
            setChat((c) => [...c, { role: 'assistant', text: `Error: ${(e as Error).message}` }]);
        } finally { setChatBusy(false); }
    }, [chatInput, chatBusy, chat, agent, seedPrompt, bundle.llm]);

    // B7: inline form in the tab strip instead of window.prompt/alert.
    const [adding, setAdding] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [addUrl, setAddUrl] = useState('');
    const [addError, setAddError] = useState<string | null>(null);
    const closeAddForm = () => { setAddOpen(false); setAddUrl(''); setAddError(null); };
    const addProject = async () => {
        const url = addUrl.trim();
        if (!url || adding) return;
        setAdding(true);
        setAddError(null);
        const stillOwner = captureOwner();
        try {
            // Graph the repo CLIENT-SIDE via the GitHub API (no backend needed) — two
            // calls (repo + recursive file tree). Save the result to the account
            // resume store so it renders on every machine after login.
            const { project: newProject, gdata: newGdata } = await graphGithubRepo(url);
            if (stillOwner()) { upsertKgProject(newProject, newGdata); closeAddForm(); } // account switched mid-fetch — drop, never redirect
        } catch (e) {
            if (stillOwner()) setAddError((e as Error).message);
        } finally {
            setAdding(false);
        }
    };

    const source = gdata?.source ?? 'static-import-graph';
    // GitHub tabs saved before plan 072 have no `source`; their ids are always gh-*.
    const isGithub = source === 'github-tree' || project.id.startsWith('gh-');
    const totalFiles = gdata?.totalFiles ?? gdata?.files;
    const shownCount = gdata?.nodes.length ?? 0;
    const showCap = !!gdata && !!totalFiles && totalFiles > shownCount;
    const builtDate = gdata?.builtAt ? new Date(gdata.builtAt) : null;
    const ageDays = builtDate ? Math.max(0, Math.floor((Date.now() - builtDate.getTime()) / 86_400_000)) : null;
    const defaultTabIds = useMemo(() => new Set(DEFAULT_KG_PROJECTS.map((p) => p.id)), []);
    const selectedIndex = selected ? nodesRef.current.indexOf(selected) : -1;
    const selectedNeighbourIndices = selectedIndex >= 0 ? neighbours(linksRef.current, selectedIndex) : [];
    const selectedDegree = selectedNeighbourIndices.length;
    const rankedFiles = gdata?.importantFiles ?? IMPORTANT_FILES;
    const canvasLabel = loadState !== 'loaded'
        ? `${project.name} code map — ${loadState === 'error' ? "couldn't load this project's graph" : 'loading'}; a placeholder layout is drawn.`
        : `${project.name} code map: ${shownCount.toLocaleString()} of `
        + `${(totalFiles ?? shownCount).toLocaleString()} files, ${(gdata?.edges ?? 0).toLocaleString()} links, `
        + `${gdata?.clusters ?? project.clusters} clusters. ${isGithub ? 'Largest' : 'Most imported'}: `
        + `${rankedFiles.slice(0, 3).map((f) => f.name).join(', ')}. Use the node list for keyboard access.`;
    const selectedNeighbours = selectedNeighbourIndices.slice(0, 8)
        .map((i) => ({ i, node: nodesRef.current[i] }))
        .filter((n): n is { i: number; node: KgNode } => !!n.node);

    // Accessible node list (C1): file nodes only, sorted by importance desc,
    // filtered by the active search, capped at 200 rows. `nodesVersion` is the
    // reactive trigger — `nodesRef`/`linksRef` are plain refs rebuild() mutates.
    const NODE_LIST_CAP = 200;
    const listAll = useMemo(() => {
        const active = query ? matchSetRef.current : null;
        return nodesRef.current
            .map((n, i) => ({ i, n }))
            .filter(({ i, n }) => !n.god && (!active || active.has(i)))
            .sort((a, b) => b.n.importance - a.n.importance);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodesVersion, query, matches]);
    const listShown = listAll.slice(0, NODE_LIST_CAP);
    const moveRowFocus = (e: React.KeyboardEvent<HTMLButtonElement>, dir: 1 | -1) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const row = e.currentTarget;
        const siblings = Array.from(row.parentElement?.querySelectorAll('button') ?? []);
        siblings[siblings.indexOf(row) + dir]?.focus();
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke AFTER the click has been dispatched — revoking synchronously
        // can cancel the download in some browsers.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    };
    const exportPng = () => {
        canvasRef.current?.toBlob((blob) => { if (blob) downloadBlob(blob, `${project.id}-map.png`); });
    };
    const exportJson = () => {
        if (!gdata) return;
        const json = toExportJson(project, gdata, linksRef.current);
        downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), `${project.id}-map.json`);
    };

    return (
        <div className="kg">
            {/* ── top: project tabs ── */}
            <div className="kg-tabs">
                {projects.map((p) => (
                    <div key={p.id} role="button" tabIndex={0} aria-pressed={p.id === activeId}
                        className={`kg-tab ${p.id === activeId ? 'on' : ''}`}
                        onClick={() => setKgActiveProject(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKgActiveProject(p.id); } }}>
                        {!defaultTabIds.has(p.id) && (
                            <button type="button" className="kg-tab__remove" aria-label={`Remove ${p.name}`}
                                onClick={(e) => { e.stopPropagation(); removeKgProject(p.id); }}>×</button>
                        )}
                        <div className="kg-tab__top"><span className="kg-tab__name">{p.name}</span><span className="kg-tab__lang">{p.lang}</span></div>
                        <div className="kg-tab__blurb">{p.blurb}</div>
                        <div className="kg-tab__meta">{p.files.toLocaleString()} files · {p.clusters} clusters</div>
                    </div>
                ))}
                {addOpen ? (
                    <div className="kg-addform">
                        <input
                            className="kg-addform__input" autoFocus disabled={adding}
                            value={addUrl} onChange={(e) => setAddUrl(e.target.value)}
                            placeholder="https://github.com/owner/repo"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') addProject();
                                else if (e.key === 'Escape') closeAddForm();
                            }}
                        />
                        <div className="kg-addform__row">
                            <button type="button" onClick={addProject} disabled={adding || !addUrl.trim()}>{adding ? 'Graphing…' : 'Graph'}</button>
                            <button type="button" onClick={closeAddForm} disabled={adding}>Cancel</button>
                        </div>
                        {addError && <p className="kg-addform__err" role="alert">{addError}</p>}
                    </div>
                ) : (
                    <button type="button" className="kg-tab kg-tab--add" onClick={() => setAddOpen(true)}>
                        <span className="kg-add__plus">+</span>
                        <span className="kg-add__label">Add a project</span>
                        <span className="kg-add__sub">graph a repo · $0</span>
                    </button>
                )}
            </div>

            <div className="kg-body">
                {/* ── center: live graph ── */}
                <div className="kg-stage">
                    <div className="kg-stage__hdr">
                        <div>
                            <div className="kg-stage__proj">
                                ● {project.name}
                                {loadState === 'error'
                                    ? <span className="kg-err">Couldn't load</span>
                                    : loadState === 'loaded' && builtDate
                                        ? <span className="kg-live" title={`${ageDays} day${ageDays === 1 ? '' : 's'} ago`}>Graphed {builtDate.toLocaleDateString()}</span>
                                        : <span className="kg-rep">loading…</span>}
                            </div>
                            <div className="kg-stage__sub">
                                {loadState === 'error'
                                    ? "Couldn't load this project's graph."
                                    : gdata
                                        ? <>{gdata.files.toLocaleString()} files · {gdata.edges.toLocaleString()} edges · {gdata.clusters} clusters{!showCap && <> · {gdata.nodes.length} rendered</>}
                                            {showCap && <> · {shownCount} of {totalFiles!.toLocaleString()} files shown ({isGithub ? 'the largest' : 'the most imported'})</>}
                                        </>
                                        : <>{project.files.toLocaleString()} files · {project.clusters} clusters</>}
                            </div>
                        </div>
                        <div className="kg-seg">
                            {loadState === 'error' && (
                                <button type="button" onClick={() => setRetryCount((c) => c + 1)}>Retry</button>
                            )}
                            <button type="button" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button>
                        </div>
                    </div>
                    <div className="kg-search">
                        <input
                            type="search" className="kg-search__input" aria-label="Search files in this map"
                            value={query} onChange={(e) => runSearch(e.target.value)} onKeyDown={onSearchKeyDown}
                            placeholder="Search files… (Enter to jump, Esc to clear)"
                        />
                        <span className="kg-search__status" aria-live="polite">
                            {query ? (matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'No matches') : ''}
                        </span>
                    </div>
                    <div
                        className={`kg-canvaswrap ${focused ? 'is-focused' : ''} ${panning ? 'is-panning' : ''}`}
                        ref={wrapRef}
                        onMouseEnter={() => { hoverRef.current = true; }}
                        onMouseLeave={() => { hoverRef.current = false; }}
                    >
                        <canvas
                            ref={canvasRef} className="kg-canvas" onClick={onCanvasClick}
                            role="img" aria-label={canvasLabel}
                        />
                        <div className="kg-legend">size = importance · glow = agent · colour = cluster · scroll to zoom</div>
                    </div>
                </div>

                {/* ── right: intelligence rail ── */}
                <aside className="kg-rail">
                    <section className="kg-card">
                        <div className="kg-card__cap">HOW THIS MAP WAS MADE</div>
                        <p className="kg-card__note">
                            {isGithub
                                ? "Structure only — links join files to their folder's largest file, not real imports."
                                : 'Links are imports found by scanning the code.'}
                        </p>
                    </section>

                    <section className="kg-card">
                        <div className="kg-card__cap"><Sparkles size={12} aria-hidden /> MOST IMPORTANT FILES</div>
                        <p className="kg-card__note">The files everything else relies on — ranked by {isGithub ? 'size' : 'how many other files import them'}.</p>
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
                        <p className="kg-card__note">
                            {loadState === 'error'
                                ? "Couldn't load this project's graph."
                                : gdata
                                    ? `${(gdata.tokens / 1000).toFixed(0)}k tokens to re-read ${project.name} each session (≈ $3/MTok) — answered from the map instead.`
                                    : 'Graph loading…'}
                        </p>
                    </section>

                    <section className="kg-card">
                        <div className="kg-card__cap">SELECTED</div>
                        {selected ? (
                            <div className="kg-sel">
                                <div className="kg-sel__name">{selected.god ? `${selected.god.name} · ${selected.god.god}` : selected.label}</div>
                                <div className="kg-sel__row">{selected.god ? 'Agent (god node)' : `Cluster ${selected.cluster + 1}`}</div>
                                <div className="kg-sel__row">importance {selected.importance}</div>
                                <div className="kg-sel__row">degree {selectedDegree}</div>
                                {selectedNeighbours.length > 0 && (
                                    <div className="kg-sel__neighbours">
                                        {selectedNeighbours.map(({ i, node }) => (
                                            <button key={i} type="button" className="kg-sel__neighbour"
                                                onClick={() => selectByIndex(i)}>
                                                {node.god ? node.god.name : node.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="kg-card__note">Click a node (or a god node) to inspect it.</p>
                        )}
                    </section>

                    <section className="kg-card">
                        <button
                            type="button" className="kg-card__toggle"
                            aria-expanded={showList} aria-controls={nodeListId}
                            onClick={() => setShowList((v) => !v)}
                        >
                            {showList ? 'Hide node list' : 'Show node list'}
                        </button>
                        {showList && (
                            <div id={nodeListId} className="kg-nodelist" role="group" aria-label="Files, most important first">
                                <p className="kg-card__note">Showing {listShown.length.toLocaleString()} of {listAll.length.toLocaleString()}</p>
                                {listShown.map(({ i, n }) => (
                                    <button
                                        key={i} type="button" className="kg-nodelist__row"
                                        aria-current={selected === n ? 'true' : undefined}
                                        onClick={() => selectAndCentre(i)}
                                        onKeyDown={(e) => moveRowFocus(e, e.key === 'ArrowDown' ? 1 : -1)}
                                    >
                                        <span className="kg-nodelist__name">{n.label}</span>
                                        <span className="kg-nodelist__meta">cluster {n.cluster + 1} · deg {neighbours(linksRef.current, i).length}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="kg-card">
                        <div className="kg-card__cap">EXPORT</div>
                        <div className="kg-export">
                            <button type="button" disabled={!gdata} onClick={exportPng}>Export PNG</button>
                            <button type="button" disabled={!gdata} onClick={exportJson}>Export JSON</button>
                        </div>
                    </section>
                </aside>
            </div>

            {/* ── "Ask the map" — full-width bottom dock, same width as the graph ── */}
            <section className="kg-chatdock">
                <div className="kg-chatdock__hdr">
                    <span className="kg-card__cap"><MessageSquare size={12} aria-hidden /> ASK THE MAP</span>
                    <div className="kg-chat__agent">
                        <span>Agent</span>
                        <select aria-label="Agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
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

/**
 * Default export — a thin view switch over the two "knowledge graph" tabs
 * (plan 072 phase 1, fixes A1-A3: the registry/Connections/ARA all promised
 * the user's OWN graph but opened the code-repo canvas; this mounts the real
 * one). Reads the signed-in user's id via a raw `useContext(UserContext)`
 * (not `useUser()`) per the house test-resilience convention — widget tests
 * render with no provider and must not throw.
 */
export default function HalocronKnowledgeGraph() {
    // Raw context read (not useUser()) per test-resilience convention.
    const uid = useContext(UserContext)?.user?.id ?? '_anonymous';
    const kgState = useHalocronKnowledgeGraphState();
    const idBase = `kg${useId().replace(/:/g, '')}`; // unique per mounted instance
    const tabs = [{ view: 'knowledge', label: 'My knowledge' }, { view: 'repos', label: 'Code repos' }] as const;
    // WAI-ARIA tabs: roving tabindex; Left/Right/Home/End move and select.
    const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
        const i = tabs.findIndex((t) => t.view === kgState.view);
        const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length
            : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
            : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault();
        setKgView(tabs[next].view);
        document.getElementById(`${idBase}-tab-${tabs[next].view}`)?.focus();
    };
    return (
        <div className="kg-shell">
            <div className="kg-viewtabs" role="tablist" aria-label="Knowledge graph view">
                {tabs.map((t) => (
                    <button
                        key={t.view} id={`${idBase}-tab-${t.view}`} type="button" role="tab"
                        aria-selected={kgState.view === t.view} aria-controls={`${idBase}-panel-${t.view}`}
                        tabIndex={kgState.view === t.view ? 0 : -1}
                        className={`kg-viewtab ${kgState.view === t.view ? 'on' : ''}`}
                        onClick={() => setKgView(t.view)} onKeyDown={onTabKey}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="kg-panel" role="tabpanel" id={`${idBase}-panel-${kgState.view}`} aria-labelledby={`${idBase}-tab-${kgState.view}`}>
                {kgState.view === 'knowledge' ? <GraphifyView key={uid} /> : <RepoGraph key={uid} />}
            </div>
        </div>
    );
}
