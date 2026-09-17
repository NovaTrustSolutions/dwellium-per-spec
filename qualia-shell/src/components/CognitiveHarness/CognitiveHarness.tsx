import React, { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
    Cpu, Database, Network, GitFork,
    Wrench, Compass, BarChart2, ShieldAlert,
    Binary, Play, Pause, Zap, Activity
} from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { getCmn, type CmnMetrics, type CmnEvent } from '../../lib/memoryGraphRag/shared';
import './CognitiveHarness.css';

interface Subsystem {
    id: string;
    name: string;
    sub: string;
    icon: React.ReactNode;
    description: string;
    /** Placeholder labels shown (with '—' values) for subsystems with no backing code in this app. */
    metricLabels: [string, string, string];
}

/** Subsystems with a real engine behind them — everything else has no backing code in this app. */
const WIRED_IDS = new Set(['rag', 'graph-rag', 'vector-db', 'memory']);

const SUBSYSTEMS: Subsystem[] = [
    {
        id: 'rag',
        name: 'RAG SYSTEM',
        sub: 'RETRIEVAL-AUGMENTED GENERATION',
        icon: <Cpu size={18} />,
        description: 'Dynamically fetches context from external vector search stores and local databases, injecting relevant knowledge segments directly into the LLM context window to prevent hallucinations and assure factual grounding.',
        metricLabels: ['Queries', 'Last Latency', 'Passages'],
    },
    {
        id: 'graph-rag',
        name: 'GRAPH-RAG',
        sub: 'KNOWLEDGE GRAPH ENHANCED RETRIEVAL',
        icon: <Network size={18} />,
        description: 'Maps semantic connections and entity relationships across documents. Recursively traverses knowledge nodes to compile structured, multi-hop context for complex reasoning tasks.',
        metricLabels: ['Entities', 'Facts', 'Bridges'],
    },
    {
        id: 'vector-db',
        name: 'VECTOR DATABASE',
        sub: 'HIGH-DIMENSIONAL EMBEDDING SPACE',
        icon: <Database size={18} />,
        description: 'Index store for high-dimensional float arrays representing text embeddings. Utilizes cosine similarity search to perform semantic search operations.',
        metricLabels: ['Embedding', 'Vectors', 'Threshold'],
    },
    {
        id: 'memory',
        name: 'MEMORY SYSTEM',
        sub: 'SHORT | LONG-TERM | EPISODIC',
        icon: <Binary size={18} />,
        description: 'Implements dual-store cognitive architecture. Captures episodic conversation traces in short-term buffer, while consolidating long-term semantic precedents and user preferences in database storage.',
        metricLabels: ['Documents', 'Storage', 'Conflicts Resolved'],
    },
    {
        id: 'prompt-opt',
        name: 'PROMPT OPTIMIZATION',
        sub: 'DYNAMIC ENGINEERING & REFINEMENT',
        icon: <Compass size={18} />,
        description: 'Iteratively refines LLM inputs by applying system instructions, negative constraints, and few-shot examples customized for the target domain and model capability tier.',
        metricLabels: ['Optimizer Temp', 'Tokens Saved', 'Format Score'],
    },
    {
        id: 'tool-use',
        name: 'TOOL USE',
        sub: 'APIS | FUNCTIONS INTEGRATION',
        icon: <Wrench size={18} />,
        description: 'Enables autonomous operations by binding APIs, database wrappers, and OS terminals. Translates natural language intent into structured JSON payloads for tool execution.',
        metricLabels: ['Success Rate', 'Tools Configured', 'Sandbox Status'],
    },
    {
        id: 'planning',
        name: 'AGENT PLANNING',
        sub: 'REASONING & TASK DECOMPOSITION',
        icon: <GitFork size={18} />,
        description: 'Deconstructs complex goals into a dependency tree of sub-tasks. Dynamically evaluates task status and self-corrects execution paths using ReAct/CoT reasoning loops.',
        metricLabels: ['ReAct Cycles', 'Sub-tasks Active', 'Confidence'],
    },
    {
        id: 'semantic-routing',
        name: 'SEMANTIC ROUTING',
        sub: 'INTENT UNDERSTANDING & DISPATCH',
        icon: <Zap size={18} />,
        description: 'Super-fast semantic classifier acting as the front gate. Routes incoming requests to specialized agent experts or raw prompt templates based on semantic proximity.',
        metricLabels: ['Dispatch Delay', 'Classification', 'Active Routes'],
    },
    {
        id: 'evaluation',
        name: 'EVALUATION & MONITORING',
        sub: 'QUALITY | SAFETY | PERFORMANCE',
        icon: <BarChart2 size={18} />,
        description: 'Evaluates agent outputs in real-time. Checks for format constraints, safety policy compliance, and potential regression risks using automated evaluation heuristics.',
        metricLabels: ['Policy Flags', 'Correctness', 'Guardrails Hit'],
    },
    {
        id: 'ext-knowledge',
        name: 'EXTERNAL KNOWLEDGE',
        sub: 'SOURCES & INTEGRATIONS',
        icon: <ShieldAlert size={18} />,
        description: 'Bridges private data environments and public web scraping endpoints. Maintains secure, encrypted pipelines to retrieve real-time domain facts.',
        metricLabels: ['Sources Online', 'Sync Status', 'Bytes Pulled'],
    },
];

function persistText(m: CmnMetrics): string {
    switch (m.persist) {
        case 'ok': return `saved · ${Math.round(m.persistedBytes / 1024)} KB`;
        case 'full': return 'NOT SAVED — full';
        case 'unavailable': return 'NOT SAVED';
        case 'empty': return 'nothing saved';
    }
}

/** Real per-card metrics for the 4 subsystems backed by the shared engine; '—' for everything else. */
function metricsFor(system: Subsystem, m: CmnMetrics): { label: string; value: string }[] {
    switch (system.id) {
        case 'rag':
            return [
                { label: 'Queries', value: String(m.queries) },
                { label: 'Last Latency', value: `${m.lastQueryMs ?? '—'} ms` },
                { label: 'Passages', value: String(m.counts.passages) },
            ];
        case 'graph-rag':
            return [
                { label: 'Entities', value: String(m.counts.entities) },
                { label: 'Facts', value: String(m.counts.facts) },
                { label: 'Bridges', value: String(m.bridges) },
            ];
        case 'vector-db':
            return [
                { label: 'Embedding', value: 'local hashed trigram' },
                { label: 'Vectors', value: String(m.counts.entities) },
                { label: 'Threshold', value: '0.6' },
            ];
        case 'memory':
            return [
                { label: 'Documents', value: String(m.documents) },
                { label: 'Storage', value: persistText(m) },
                { label: 'Conflicts Resolved', value: String(m.conflictsResolved) },
            ];
        default:
            return system.metricLabels.map((label) => ({ label, value: '—' }));
    }
}

/** Deterministic PRNG (xorshift32) for the decorative particle visualization — no engine-native randomness. */
function makePrng(seed: number): () => number {
    let s = (seed >>> 0) || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

function formatEvent(e: CmnEvent): string {
    const t = new Date(e.at);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    const ms = e.ms != null ? ` (${e.ms}ms)` : '';
    return `[${hh}:${mm}:${ss}] ${e.kind} · ${e.detail}${ms}`;
}

export default function CognitiveHarness() {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    const { integrations } = useIntegrations();
    const cmn = getCmn(uid, integrations.llm);
    useSyncExternalStore(cmn.subscribe, cmn.getVersion, cmn.getVersion);
    const m = cmn.metrics();
    const probe = cmn.probe();

    const [activeIndex, setActiveIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const intervalRef = useRef<number | null>(null);

    // Auto-progress subsystem tabs (UI-only; not tied to data)
    useEffect(() => {
        if (isPlaying) {
            intervalRef.current = window.setInterval(() => {
                setActiveIndex((prev) => (prev + 1) % SUBSYSTEMS.length);
            }, 6000); // Shift every 6s
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isPlaying]);

    // Scroll active item into view on the moving bar
    useEffect(() => {
        if (listRef.current) {
            const activeChild = listRef.current.children[activeIndex] as HTMLElement;
            if (activeChild) {
                const containerWidth = listRef.current.offsetWidth;
                const childOffset = activeChild.offsetLeft;
                const childWidth = activeChild.offsetWidth;

                listRef.current.scrollTo({
                    left: childOffset - containerWidth / 2 + childWidth / 2,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeIndex]);

    // Futuristic Particle Space Visualizer (Canvas) — decoration only, seeded from real counts
    const entityCount = m.counts.entities;
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let width = (canvas.width = canvas.offsetWidth);
        let height = (canvas.height = canvas.offsetHeight);

        const handleResize = () => {
            if (canvas) {
                width = canvas.width = canvas.offsetWidth;
                height = canvas.height = canvas.offsetHeight;
            }
        };
        window.addEventListener('resize', handleResize);

        // Particle System variables
        const rng = makePrng(entityCount * 7919 + 104729);
        const particles: { x: number; y: number; z: number; px: number; py: number; speed: number; color: string }[] = [];
        const maxParticles = Math.min(200, 20 + entityCount);

        // Generate parameter space coordinates
        for (let i = 0; i < maxParticles; i++) {
            particles.push({
                x: rng() * width - width / 2,
                y: rng() * height - height / 2,
                z: rng() * width,
                px: 0,
                py: 0,
                speed: 0.5 + rng() * 1.5,
                color: rng() > 0.6 ? 'rgba(0, 136, 204, 0.8)' : 'rgba(129, 140, 248, 0.7)'
            });
        }

        // Target rotation parameters based on active index
        let rotY = 0;
        let rotX = 0;

        const render = () => {
            ctx.fillStyle = 'rgba(10, 14, 26, 0.15)';
            ctx.fillRect(0, 0, width, height);

            // Subtle background grid
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.lineWidth = 1;
            const gridSpacing = 40;
            for (let x = 0; x < width; x += gridSpacing) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = 0; y < height; y += gridSpacing) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // Draw Orchestration Rings (visual orbits)
            ctx.strokeStyle = 'rgba(0, 136, 204, 0.15)';
            ctx.beginPath();
            ctx.ellipse(width / 2, height / 2, width * 0.35, height * 0.15, 0.2, 0, 2 * Math.PI);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(129, 140, 248, 0.1)';
            ctx.beginPath();
            ctx.ellipse(width / 2, height / 2, width * 0.25, height * 0.22, -0.4, 0, 2 * Math.PI);
            ctx.stroke();

            // Center glow (LLM Core)
            const radGlow = ctx.createRadialGradient(width / 2, height / 2, 5, width / 2, height / 2, 80);
            radGlow.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
            radGlow.addColorStop(0.5, 'rgba(99, 102, 241, 0.1)');
            radGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = radGlow;
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, 80, 0, 2 * Math.PI);
            ctx.fill();

            // Label text inside LLM core
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = 'bold 12px Montserrat, Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('LLM CORE', width / 2, height / 2 - 4);
            ctx.fillStyle = 'rgba(0, 136, 204, 0.8)';
            ctx.font = '9px monospace';
            ctx.fillText('PARAMETER SPACE', width / 2, height / 2 + 10);

            // Update rotation
            rotY += 0.003;
            rotX = Math.sin(rotY * 0.5) * 0.1;

            // Render particles
            particles.forEach((p, idx) => {
                // Apply rotation
                let x1 = p.x;
                let y1 = p.y;
                let z1 = p.z;

                // Rotate around Y
                const cosY = Math.cos(rotY);
                const sinY = Math.sin(rotY);
                const rx = x1 * cosY - z1 * sinY;
                const rz = x1 * sinY + z1 * cosY;

                // Perspective projection
                const fov = 350;
                const scale = fov / (fov + rz);
                const projX = rx * scale + width / 2;
                const projY = y1 * scale + height / 2;

                // Reset on boundary exit
                p.z -= p.speed;
                if (p.z <= 0) {
                    p.z = width;
                    p.x = rng() * width - width / 2;
                    p.y = rng() * height - height / 2;
                }

                // Draw if inside bounds
                if (projX >= 0 && projX <= width && projY >= 0 && projY <= height) {
                    const radius = Math.max(0.5, scale * 2.2);

                    // Highlight active system interaction nodes
                    const isActiveNode = idx % SUBSYSTEMS.length === activeIndex;

                    ctx.fillStyle = isActiveNode ? '#22c55e' : p.color;
                    ctx.beginPath();
                    ctx.arc(projX, projY, isActiveNode ? radius * 2.5 : radius, 0, 2 * Math.PI);
                    ctx.fill();

                    // Active node connections (network web)
                    if (isActiveNode) {
                        ctx.shadowColor = '#22c55e';
                        ctx.shadowBlur = 10;

                        ctx.beginPath();
                        ctx.arc(projX, projY, radius * 3, 0, 2 * Math.PI);
                        ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
                        ctx.stroke();

                        ctx.shadowBlur = 0; // Reset shadow

                        // Line to center core
                        ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(projX, projY);
                        ctx.lineTo(width / 2, height / 2);
                        ctx.stroke();
                    }
                }
            });

            // Active Subsystem overlay data ring
            ctx.strokeStyle = 'rgba(0, 136, 204, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, 110 + Math.sin(rotY * 4) * 5, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.setLineDash([]); // Reset dash

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
        };
    }, [activeIndex, entityCount]);

    const activeSystem = SUBSYSTEMS[activeIndex];
    const activeWired = WIRED_IDS.has(activeSystem.id);
    const statusLabel = !activeWired ? 'Not connected' : probe.ok ? 'CONNECTED' : `DEGRADED — ${probe.detail}`;
    const statusOk = activeWired && probe.ok;
    const recentEvents = m.events.slice(0, 6);

    return (
        <div className="cognitive-harness">
            {/* Topbar Controls */}
            <div className="ch-top-controls">
                <div className="ch-title-area">
                    <Activity className="ch-pulse-icon" size={16} />
                    <span>COGNITIVE HARNESS ORCHESTRATION</span>
                </div>
                <button
                    className="ch-play-btn"
                    onClick={() => setIsPlaying(!isPlaying)}
                    title={isPlaying ? 'Pause Auto-Cycle' : 'Start Auto-Cycle'}
                >
                    {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                    <span>{isPlaying ? 'ACTIVE SWEEPING' : 'SWEEP PAUSED'}</span>
                </button>
            </div>

            {/* Rotating Moving Highlight Bar */}
            <div className="ch-bar-wrapper">
                <div className="ch-scroll-left" onClick={() => setActiveIndex(prev => (prev - 1 + SUBSYSTEMS.length) % SUBSYSTEMS.length)}>‹</div>
                <div className="ch-bar-list" ref={listRef}>
                    {SUBSYSTEMS.map((system, idx) => {
                        const isActive = idx === activeIndex;
                        return (
                            <div
                                key={system.id}
                                className={`ch-bar-item ${isActive ? 'ch-bar-item--active' : ''}`}
                                onClick={() => {
                                    setActiveIndex(idx);
                                    setIsPlaying(false); // Pause auto-rotation when user clicks
                                }}
                            >
                                <span className="ch-item-icon">{system.icon}</span>
                                <div className="ch-item-text">
                                    <div className="ch-item-name">{system.name}</div>
                                    <div className="ch-item-sub">{system.sub.slice(0, 26)}...</div>
                                </div>
                                {isActive && <div className="ch-item-highlight-bar" />}
                            </div>
                        );
                    })}
                </div>
                <div className="ch-scroll-right" onClick={() => setActiveIndex(prev => (prev + 1) % SUBSYSTEMS.length)}>›</div>
            </div>

            {/* Interactive parameter space canvas & central harness visualization */}
            <div className="ch-visual-space">
                <div className="ch-canvas-container">
                    <canvas ref={canvasRef} className="ch-canvas" />
                    <div className="ch-glass-overlay-label">
                        HARNESS ORCHESTRATION VISUALIZATION
                    </div>
                </div>

                {/* Subsystem Details & Metrics */}
                <div className="ch-details-panel">
                    <div className="ch-panel-header">
                        <div className="ch-panel-icon-wrap">{activeSystem.icon}</div>
                        <div className="ch-panel-header-text">
                            <h3>{activeSystem.name}</h3>
                            <span className="ch-panel-subtitle">{activeSystem.sub}</span>
                        </div>
                        <div className={`ch-panel-status-indicator ${statusOk ? '' : 'ch-panel-status-indicator--off'}`}>
                            <span className="ch-status-ping" />
                            <span>{statusLabel}</span>
                        </div>
                    </div>

                    <p className="ch-panel-description">{activeSystem.description}</p>

                    {/* Metrics Grid */}
                    <div className="ch-metrics-grid">
                        {metricsFor(activeSystem, m).map((met) => (
                            <div key={met.label} className="ch-metric-card">
                                <span className="ch-metric-label">{met.label}</span>
                                <span className="ch-metric-value">{met.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Dynamic Log Feed */}
                    <div className="ch-logs-container">
                        <div className="ch-logs-header">
                            <Zap size={11} className="ch-logs-flash" />
                            <span>COGNITIVE MEMORY NETWORK EVENT LOG</span>
                        </div>
                        <div className="ch-logs-list">
                            {recentEvents.length === 0 && (
                                <div className="ch-log-row">
                                    <span className="ch-log-bullet">&gt;</span>
                                    <span className="ch-log-content">No events yet</span>
                                </div>
                            )}
                            {recentEvents.map((e, i) => (
                                <div key={`${e.at}-${i}`} className="ch-log-row">
                                    <span className="ch-log-bullet">&gt;</span>
                                    <span className="ch-log-content">{formatEvent(e)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
