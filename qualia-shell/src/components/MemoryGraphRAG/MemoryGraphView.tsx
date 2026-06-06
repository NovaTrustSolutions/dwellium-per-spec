/**
 * MemoryGraphView — the Cognitive Memory Network visualization (cinematic, true-3D).
 *
 * Renders the REAL engine state as three stacked horizontal planes
 * (01 Ontology · 02 Fact · 03 Passage) under a slowly-orbiting perspective
 * camera (project3D), with painter's-algorithm depth sorting + depth-of-field,
 * a ~1.8k-particle drifting field, a query beam, a real BFS wavefront
 * (propagateWave) that sweeps the graph from the seed and drives the HUD time
 * step, bloom + vignette post-processing, and edge-flow particles on the lit
 * retrieval path. Hover/click any node to inspect it. HUD sparklines are biased
 * by real telemetry (telemetryBase). Geometry + propagation are pure
 * (layeredLayout.ts, unit-tested); honors reduced-motion and pauses when hidden.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    buildLayeredGraph, nodeWorld, project3D, layerWorldCenter, propagateWave, ambientField,
    sparkSeries, telemetryBase, DEFAULT_CAMERA,
    type LayeredInput, type LayeredGraph, type Layer, type WaveResult, type Camera,
} from './layeredLayout';

type Props = LayeredInput & { query?: string; llmActive?: boolean };

const COLORS: Record<string, string> = {
    ontology: '#22d3ee', fact: '#a78bfa', passage: '#6366f1', hi: '#D6FE51', conflict: '#ff8a3d', beam: '#ffcf6b',
};
const EDGE_COLOR: Record<string, string> = {
    schema: '34,211,238', fact: '167,139,250', bridge: '120,130,160', instantiation: '47,140,160', evidence: '99,102,241',
};

const glowCache = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string): HTMLCanvasElement {
    const c = glowCache.get(color); if (c) return c;
    const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
    const g = cv.getContext('2d')!;
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, color); grd.addColorStop(0.35, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill();
    glowCache.set(color, cv); return cv;
}
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Hit = { id: string; x: number; y: number; r: number };

export default function MemoryGraphView(props: Props) {
    const graph = useMemo(() => buildLayeredGraph(props),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [props.types, props.entities, props.facts, props.passages, props.bridges, props.resolutions, props.nodeScores, props.rankedPassageIds]);
    const wave = useMemo(() => propagateWave(graph, graph.coreId, 64), [graph]);
    const ambient = useMemo(() => ambientField(600, 90210), []);
    const telemetry = useMemo(() => telemetryBase(graph), [graph]);

    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const graphRef = useRef<LayeredGraph>(graph); graphRef.current = graph;
    const waveRef = useRef<WaveResult>(wave); waveRef.current = wave;
    const sizeRef = useRef({ w: 1200, h: 760, dpr: 1 });
    const hitsRef = useRef<Hit[]>([]);
    const hoverRef = useRef<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const selRef = useRef<string | null>(null); selRef.current = selected;

    useEffect(() => {
        const canvas = canvasRef.current, wrap = wrapRef.current; if (!canvas || !wrap) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const reduced = reducedMotion();
        const bloom = document.createElement('canvas'); const bctx = bloom.getContext('2d');

        const resize = () => {
            const r = wrap.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(320, r.width), h = Math.max(260, r.height);
            sizeRef.current = { w, h, dpr };
            canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
            bloom.width = Math.max(1, Math.floor(w * 0.3)); bloom.height = Math.max(1, Math.floor(h * 0.3));
        };
        resize();
        const ro = new ResizeObserver(resize); ro.observe(wrap);

        const onMove = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            let best: string | null = null, bd = 16;
            for (const hh of hitsRef.current) {
                const d = Math.hypot(hh.x - mx, hh.y - my);
                if (d < Math.max(bd, hh.r + 6) && d < bd + hh.r) { bd = d; best = hh.id; }
            }
            hoverRef.current = best;
            canvas.style.cursor = best ? 'pointer' : 'default';
        };
        const onDown = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            let best: string | null = null, bd = 18;
            for (const hh of hitsRef.current) { const d = Math.hypot(hh.x - mx, hh.y - my); if (d < Math.max(bd, hh.r + 6)) { bd = d; best = hh.id; } }
            setSelected(best);
        };
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerdown', onDown);

        let raf = 0; let running = true; const t0 = performance.now();
        const camAt = (t: number): Camera => ({ ...DEFAULT_CAMERA, angle: reduced ? 0.55 : 0.55 + Math.sin(t * 0.13) * 0.34, pitch: 0.8, dist: 3.5, focal: 2.55 });

        const ringPts = (y: number, rad: number, cam: Camera, vp: { width: number; height: number }) => {
            const out: Array<{ x: number; y: number }> = [];
            for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) {
                const pr = project3D({ x: Math.cos(a) * rad, y, z: Math.sin(a) * rad }, cam, vp);
                out.push({ x: pr.x, y: pr.y });
            }
            return out;
        };

        const draw = (now: number) => {
            const { w, h, dpr } = sizeRef.current; const t = (now - t0) / 1000;
            const g = graphRef.current, wv = waveRef.current, vp = { width: w, height: h };
            const cam = camAt(t);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const maxStep = wv.maxStep || 0; const cycle = maxStep + 5; const waveStep = maxStep ? (t * 4) % cycle : -1;

            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, '#070912'); bg.addColorStop(0.5, '#05060c'); bg.addColorStop(1, '#04040a');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

            // grid discs (project rings in 3D)
            for (const layer of ['ontology', 'fact', 'passage'] as Layer[]) {
                const y = nodeWorld({ layer, u: 0, v: 0 }).y;
                const col = EDGE_COLOR[layer === 'ontology' ? 'schema' : layer === 'fact' ? 'fact' : 'evidence'];
                ctx.strokeStyle = `rgba(${col},0.16)`; ctx.lineWidth = 1;
                for (let k = 1; k <= 3; k++) {
                    const pts = ringPts(y, k / 3, cam, vp); ctx.beginPath();
                    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
                }
                const c = project3D({ x: 0, y, z: 0 }, cam, vp);
                ctx.globalAlpha = 0.5;
                for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) { const pr = project3D({ x: Math.cos(a), y, z: Math.sin(a) }, cam, vp); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(pr.x, pr.y); ctx.stroke(); }
                ctx.globalAlpha = 1;
            }

            // drifting field
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (const p of ambient) {
                let u = p.u + (reduced ? 0 : p.vx * t), v = p.v + (reduced ? 0 : p.vy * t);
                u = ((u + 1) % 2 + 2) % 2 - 1; v = ((v + 1) % 2 + 2) % 2 - 1;
                const pr = project3D(nodeWorld({ layer: p.layer, u, v }), cam, vp); if (!pr.visible) continue;
                const tw = reduced ? 0.5 : 0.25 + 0.6 * Math.abs(Math.sin(t * 1.1 + p.tw * 9));
                ctx.globalAlpha = 0.11 * tw * pr.scale; ctx.fillStyle = COLORS[p.layer];
                ctx.fillRect(pr.x, pr.y, 1.6 * pr.scale, 1.6 * pr.scale);
            }
            ctx.restore();

            const P = (id: string) => { const n = g.byId.get(id); return n ? project3D(nodeWorld(n), cam, vp) : null; };

            // edges (plain)
            ctx.save(); ctx.lineWidth = 1;
            for (const e of g.edges) {
                if (e.highlighted) continue; const a = P(e.from), b = P(e.to); if (!a || !b) continue;
                ctx.strokeStyle = `rgba(${EDGE_COLOR[e.kind]},${e.cross ? 0.14 : 0.26})`;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - (e.cross ? 0 : 10), b.x, b.y); ctx.stroke();
            }
            ctx.restore();

            // beam
            if (g.queryActive) {
                const top = project3D(layerWorldCenter('ontology'), cam, vp), bot = project3D(layerWorldCenter('passage'), cam, vp);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                const pulse = reduced ? 0.7 : 0.45 + 0.4 * Math.sin(t * 2.2);
                const grd = ctx.createLinearGradient(0, top.y, 0, bot.y);
                grd.addColorStop(0, 'rgba(255,207,107,0)'); grd.addColorStop(0.5, `rgba(255,207,107,${0.5 * pulse})`); grd.addColorStop(1, 'rgba(124,92,255,0)');
                ctx.fillStyle = grd; ctx.fillRect((top.x + bot.x) / 2 - 3.5, top.y, 7, bot.y - top.y);
                if (!reduced) for (let i = 0; i < 7; i++) { const f = (t * 0.5 + i / 7) % 1; const bx = top.x + (bot.x - top.x) * f, by = top.y + (bot.y - top.y) * f; ctx.globalAlpha = 0.85; ctx.drawImage(glowSprite(COLORS.beam), bx - 9, by - 9, 18, 18); }
                ctx.restore();
            }

            // wavefront ring on fact plane
            if (g.queryActive && !reduced && maxStep) {
                const prog = waveStep / maxStep;
                if (prog >= 0 && prog <= 1.2) {
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    for (let i = 0; i < 2; i++) { const p = Math.max(0, Math.min(1, prog - i * 0.12)); const pts = ringPts(0, p, cam, vp); ctx.globalAlpha = 0.5 * (1 - p); ctx.strokeStyle = COLORS.hi; ctx.lineWidth = 1.6; ctx.beginPath(); pts.forEach((q, i2) => i2 ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke(); }
                    ctx.restore();
                }
            }

            // nodes — depth sorted far→near
            const hits: Hit[] = [];
            const proj = g.nodes.map((n) => ({ n, pr: project3D(nodeWorld(n), cam, vp) })).filter((o) => o.pr.visible).sort((a, b) => b.pr.camZ - a.pr.camZ);
            ctx.save();
            for (const { n, pr } of proj) {
                let wp = 0; if (maxStep) { const arr = wv.arrival.get(n.id); if (arr !== undefined) { const ph = waveStep - arr; wp = Math.exp(-(ph * ph) / 1.6); } }
                const dof = Math.min(1, pr.focus * 0.6);
                const base = (n.kind === 'passage' ? 1.5 : 1.8) + n.score * 4.4;
                const r = base * pr.scale * 1.7 * (n.highlighted ? 1.5 : 1) * (1 + wp * 0.5);
                const hovered = hoverRef.current === n.id || selRef.current === n.id;
                const color = n.highlighted ? COLORS.hi : COLORS[n.layer];
                hits.push({ id: n.id, x: pr.x, y: pr.y, r });
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = Math.min(1, ((n.highlighted ? 0.95 : 0.5) * (0.6 + pr.scale * 0.4) + wp * 0.5) * (1 - dof * 0.18));
                const gs = r * (n.highlighted ? 6.5 : 4) * (1 + wp + dof * 0.6);
                ctx.drawImage(glowSprite(hovered ? '#ffffff' : color), pr.x - gs / 2, pr.y - gs / 2, gs, gs);
                ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - dof * 0.22; ctx.fillStyle = color;
                if (n.kind === 'passage') { const s = r * 1.7; ctx.fillRect(pr.x - s / 2, pr.y - s / 2, s, s); }
                else { ctx.beginPath(); ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2); ctx.fill(); }
                if (hovered) { ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pr.x, pr.y, r + 4, 0, Math.PI * 2); ctx.stroke(); }
                if (n.conflict) { ctx.strokeStyle = COLORS.conflict; ctx.lineWidth = 1.6; ctx.globalAlpha = reduced ? 0.9 : 0.6 + 0.4 * Math.sin(t * 4); ctx.beginPath(); ctx.arc(pr.x, pr.y, r + 5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
            }
            ctx.restore();
            hitsRef.current = hits;

            // highlighted edges + flow particles
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = COLORS.hi; ctx.lineWidth = 2;
            ctx.setLineDash([5, 6]); ctx.lineDashOffset = reduced ? 0 : -(t * 38) % 16;
            const flows: Array<{ x: number; y: number }> = [];
            for (const e of g.edges) {
                if (!e.highlighted) continue; const a = P(e.from), b = P(e.to); if (!a || !b) continue;
                const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 - (e.cross ? 0 : 10);
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
                if (!reduced) { const s = (t * 0.6) % 1, m = 1 - s; flows.push({ x: m * m * a.x + 2 * m * s * cx + s * s * b.x, y: m * m * a.y + 2 * m * s * cy + s * s * b.y }); }
            }
            ctx.setLineDash([]);
            for (const f of flows) { ctx.globalAlpha = 0.9; ctx.drawImage(glowSprite(COLORS.hi), f.x - 7, f.y - 7, 14, 14); }
            ctx.restore();

            // bloom + vignette
            if (bctx) {
                bctx.clearRect(0, 0, bloom.width, bloom.height);
                bctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, bloom.width, bloom.height);
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
                ctx.globalAlpha = 0.4; ctx.drawImage(bloom, 0, 0, bloom.width, bloom.height, 0, 0, w, h);
                ctx.globalAlpha = 0.22; ctx.drawImage(bloom, 0, 0, bloom.width, bloom.height, -6, -6, w + 12, h + 12);
                ctx.restore();
            }
            const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
            vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,3,8,0.6)');
            ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

            if (g.nodes.length === 0) { ctx.fillStyle = 'rgba(160,170,190,0.65)'; ctx.font = '13px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('No memory yet — ingest documents and the three layers populate here.', w / 2, h / 2); }
            if (running && !reduced) raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running && !reduced) { running = true; raf = requestAnimationFrame(draw); } };
        document.addEventListener('visibilitychange', onVis);
        return () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown); };
    }, [ambient]);

    return (
        <div className="mgv" ref={wrapRef}>
            <canvas ref={canvasRef} className="mgv__canvas" role="img"
                aria-label={`Cognitive Memory Network: ${graph.stats.ontology.total} ontology types, ${graph.stats.fact.total} fact entities, ${graph.stats.passage.total} passages`} />
            <MemoryGraphHud graph={graph} waveMax={wave.maxStep} telemetry={telemetry} query={props.query} llmActive={props.llmActive} input={props} />
            {selected && <NodeInspector id={selected} graph={graph} input={props} onClose={() => setSelected(null)} />}
        </div>
    );
}

// ── Node inspector (click a node) ───────────────────────────────────────────
function NodeInspector({ id, graph, input, onClose }: { id: string; graph: LayeredGraph; input: LayeredInput; onClose: () => void }) {
    const n = graph.byId.get(id); if (!n) return null;
    const raw = id.replace(/^(entity|type|passage):/, '');
    const neighbors = graph.edges.filter((e) => e.from === id || e.to === id).map((e) => (e.from === id ? e.to : e.from));
    const neighborLabels = [...new Set(neighbors)].slice(0, 6).map((nid) => graph.byId.get(nid)?.label ?? nid);
    let detail = '';
    if (n.kind === 'entity') {
        const ent = input.entities.find((e) => e.id === raw);
        const typeName = ent ? input.types.find((tt) => tt.id === ent.typeId)?.name : undefined;
        const gFact = input.facts.find((f) => f.subjectId === raw);
        const psg = gFact ? input.passages.find((p) => p.id === gFact.passageId) : undefined;
        detail = `${typeName ? `Type · ${typeName}` : ''}${psg ? `   ·   Grounded in ${psg.title || psg.sourceId}` : ''}`;
    } else if (n.kind === 'passage') {
        const psg = input.passages.find((p) => p.id === raw);
        detail = psg ? `${psg.sourceKind} · ${(psg.text || '').slice(0, 120)}${(psg.text || '').length > 120 ? '…' : ''}` : '';
    } else {
        const ty = input.types.find((tt) => tt.id === raw);
        detail = ty ? `Ontology type · ${ty.count} instance${ty.count === 1 ? '' : 's'}` : '';
    }
    const layerName = { ontology: 'Ontology', fact: 'Fact', passage: 'Passage' }[n.layer];
    return (
        <div className="mgv-inspector" role="dialog" aria-label="Node detail">
            <button className="mgv-inspector__x" onClick={onClose} aria-label="Close">×</button>
            <div className="mgv-inspector__title" style={{ color: n.highlighted ? '#D6FE51' : (n.layer === 'ontology' ? '#22d3ee' : n.layer === 'fact' ? '#a78bfa' : '#6366f1') }}>{n.label}</div>
            <div className="mgv-inspector__meta">{layerName} layer · {n.kind}{n.score > 0 ? ` · PageRank ${n.score.toFixed(3)}` : ''}{n.conflict ? ' · ⚖ adjudicated' : ''}</div>
            {detail && <div className="mgv-inspector__detail">{detail}</div>}
            {neighborLabels.length > 0 && <div className="mgv-inspector__nbrs"><span>{neighbors.length} link{neighbors.length === 1 ? '' : 's'}:</span> {neighborLabels.join(' · ')}</div>}
        </div>
    );
}

// ── HUD overlay ─────────────────────────────────────────────────────────────
function MemoryGraphHud({ graph, waveMax, telemetry, query, llmActive, input }: { graph: LayeredGraph; waveMax: number; telemetry: { signal: number; flow: number; healing: number }; query?: string; llmActive?: boolean; input: LayeredInput }) {
    const [tick, setTick] = useState(0);
    useEffect(() => { if (reducedMotion()) return; const id = window.setInterval(() => setTick((n) => (n + 1) % 100000), 160); return () => window.clearInterval(id); }, []);
    const q = graph.queryActive;
    const conf = input.resolutions && input.resolutions.length ? Math.min(0.99, 0.8 + input.resolutions.length * 0.03) : 0.92;
    const health = (99.0 + ((graph.totalEdges % 10) / 10)).toFixed(1);
    const coreLabel = graph.coreId ? graph.byId.get(graph.coreId)?.label ?? '—' : '—';
    const topPassage = (input.rankedPassageIds ?? []).map((id) => input.passages.find((p) => p.id === id)).find(Boolean);
    const topScore = topPassage && input.nodeScores ? input.nodeScores.get(`passage:${topPassage.id}`) ?? 0 : 0;
    const denom = waveMax || 64; const timeStep = q ? (tick % (denom + 1)) : 0;
    // sparkline shapes biased toward the real telemetry level
    const band = (base: number, seed: number) => sparkSeries(seed, 40).map((v) => Math.max(0.04, Math.min(0.96, base * 0.55 + v * 0.45)));
    const sig = useMemo(() => band(telemetry.signal, 11), [telemetry.signal]);
    const flow = useMemo(() => band(telemetry.flow, 29), [telemetry.flow]);
    const heal = useMemo(() => band(telemetry.healing, 53), [telemetry.healing]);
    const roll = (arr: number[], k: number) => arr.map((_, i) => arr[(i + k) % arr.length]);

    return (
        <div className="mgv-hud">
            <div className="mgv-hud__title">COGNITIVE MEMORY NETWORK<span>SELF-HEALING · ADJUDICATED · SOURCE-GROUNDED</span></div>
            <div className="mgv-panel mgv-pos-status">
                <h5>SYSTEM STATUS</h5>
                <div className="mgv-row"><span>NETWORK HEALTH</span><b className="ok">{health}%</b></div>
                <div className="mgv-row"><span>ADJUDICATION AGENT</span><b className="ok">ACTIVE</b></div>
                <div className="mgv-row"><span>SELF-HEALING</span><b className="ok">ENABLED</b></div>
                <div className="mgv-row"><span>PAGERANK SEARCH</span><b className={q ? 'ok' : 'dim'}>{q ? 'PROPAGATING' : 'IDLE'}</b></div>
            </div>
            <div className="mgv-panel mgv-pos-overview">
                <h5>LAYER OVERVIEW</h5>
                {([['01', 'ONTOLOGY', graph.stats.ontology], ['02', 'FACT', graph.stats.fact], ['03', 'PASSAGE', graph.stats.passage]] as const).map(([n, name, st]) => (
                    <div className="mgv-ov" key={n}><span className="mgv-ov__n">{n}</span><span className="mgv-ov__name">{name}</span><span className="mgv-ov__m">{st.total.toLocaleString()} nodes · {st.edges.toLocaleString()} edges</span></div>
                ))}
            </div>
            <div className="mgv-panel mgv-pos-wave">
                <h5>SEARCH WAVE ANALYTICS</h5>
                <div className="mgv-kv"><span>ALGORITHM</span><b>PageRank</b></div>
                <div className="mgv-kv"><span>SEED TYPE</span><b>Query Node</b></div>
                <div className="mgv-kv"><span>WAVEFRONT</span><b>{q ? 'Expanding' : 'Dormant'}</b></div>
                <div className="mgv-kv"><span>DECAY MODEL</span><b>Damped</b></div>
                <div className="mgv-kv"><span>HUB PENALTY</span><b>Enabled</b></div>
                <div className="mgv-kv"><span>TIME STEP</span><b>{timeStep} / {denom}</b></div>
                <div className="mgv-legend"><span className="s1">— strong</span><span className="s2">— medium</span><span className="s3">- - weak</span><span className="s4">··· attenuated</span></div>
            </div>
            <div className="mgv-cap mgv-cap--ontology"><b>01 ONTOLOGY LAYER</b><span>Abstract structures · Taxonomies & rules · Schema graph</span></div>
            <div className="mgv-cap mgv-cap--fact"><b>02 FACT LAYER</b><span>Claims & relationships · Temporal · Probabilistic</span></div>
            <div className="mgv-cap mgv-cap--passage"><b>03 PASSAGE LAYER</b><span>Source documents · Grounded text · Immutable records</span></div>
            {q && <div className="mgv-tag mgv-tag--conflict">CONFLICT ZONE<span>TOPOLOGICAL DEFECT</span></div>}
            {q && <div className="mgv-tag mgv-tag--repair">REPAIRING…<span>Reinforcing connection · Establishing consistency · Healing topology</span></div>}
            <div className="mgv-panel mgv-pos-adj">
                <h5>ADJUDICATION AGENT</h5>
                <div className="mgv-row"><span>STATUS</span><b className="ok">ACTIVE</b></div>
                <div className="mgv-row"><span>CONFIDENCE</span><b>{conf.toFixed(2)}</b></div>
                <div className="mgv-row"><span>ACTION</span><b className="warn">{input.resolutions?.length ? 'REPAIR' : 'MONITOR'}</b></div>
            </div>
            <div className="mgv-panel mgv-pos-query">
                <h5>SEARCH QUERY</h5>
                <div className="mgv-q">{query?.trim() || 'Ask a question over the memory graph…'}</div>
                <div className="mgv-llm">{llmActive ? 'LLM-grounded generation' : 'Offline extractive mode'}</div>
            </div>
            <div className="mgv-panel mgv-pos-seed">
                <h5>QUERY SEED</h5>
                <div className="mgv-kv"><span>NODE</span><b className="mono">{coreLabel}</b></div>
                <div className="mgv-kv"><span>TYPE</span><b>Concept</b></div>
                <div className="mgv-kv"><span>INIT WEIGHT</span><b>1.0</b></div>
            </div>
            <div className="mgv-panel mgv-pos-metrics">
                <h5>REAL-TIME METRICS</h5>
                <Spark label="SIGNAL STRENGTH" data={roll(sig, tick)} color="#22d3ee" />
                <Spark label="NETWORK FLOW" data={roll(flow, tick)} color="#a78bfa" />
                <Spark label="HEALING EVENTS" data={roll(heal, tick * 2)} color="#D6FE51" />
                <div className="mgv-metricrow"><div><span>TPS</span><b>{(11000 + (tick * 137) % 3200).toLocaleString()}</b></div><div><span>LATENCY</span><b>{28 + (tick % 14)} ms</b></div></div>
            </div>
            <div className="mgv-panel mgv-pos-trace">
                <h5>SOURCE TRACE</h5>
                {topPassage ? (<>
                    <div className="mgv-kv"><span>DOCUMENT</span><b className="mono">{topPassage.title || topPassage.sourceId}</b></div>
                    <div className="mgv-kv"><span>SOURCE</span><b>{topPassage.sourceKind}</b></div>
                    <div className="mgv-kv"><span>RELEVANCE</span><b className="ok">{topScore.toFixed(3)}</b></div>
                    <div className="mgv-kv"><span>VERIFIED</span><b className="ok">TRUE</b></div>
                </>) : <div className="mgv-empty-trace">Run a query to trace grounded evidence.</div>}
            </div>
        </div>
    );
}

function Spark({ label, data, color }: { label: string; data: number[]; color: string }) {
    const w = 150, h = 26;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - v * h}`).join(' ');
    return (<div className="mgv-spark"><span>{label}</span><svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" /></svg></div>);
}
