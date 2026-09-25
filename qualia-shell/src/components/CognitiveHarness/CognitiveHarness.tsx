import React, { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    Cpu, Database, Network, GitFork,
    Wrench, Compass, BarChart2, ShieldAlert,
    Binary, Play, Pause, Zap, Activity
} from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { getCmn, type CmnEvent } from '../../lib/memoryGraphRag/shared';
import { hermesLearningStore } from '../HonchoHermesPanel/hermesLearningStore';
import { personaWorkStore } from '../../lib/agents/personaWorkStore';
import { allLocalDocuments } from '../../lib/memoryGraphRag/sources';
import { harnessCard } from './harnessMetrics';
import type { HarnessCardId } from './harnessTypes';
import { startHarnessCanvas, type HarnessCanvasHandle } from './harnessCanvas';
import './CognitiveHarness.css';

interface Subsystem {
    id: HarnessCardId;
    name: string;
    sub: string;
    icon: React.ReactNode;
    description: string;
}

const SUBSYSTEMS: Subsystem[] = [
    {
        id: 'rag',
        name: 'RAG SYSTEM',
        sub: 'RETRIEVAL-AUGMENTED GENERATION',
        icon: <Cpu size={18} />,
        description: 'Retrieves the most relevant passages from the local memory network and hands them to the LLM as context.',
    },
    {
        id: 'graph-rag',
        name: 'GRAPH-RAG',
        sub: 'KNOWLEDGE GRAPH ENHANCED RETRIEVAL',
        icon: <Network size={18} />,
        description: 'Extracts entities and facts from ingested text, and bridges entities that share a type or have similar names.',
    },
    {
        id: 'vector-db',
        name: 'VECTOR DATABASE',
        sub: 'HIGH-DIMENSIONAL EMBEDDING SPACE',
        icon: <Database size={18} />,
        description: 'Entity names are embedded with a local hashed-word + trigram scheme; passages themselves are matched by word overlap, not vectors.',
    },
    {
        id: 'memory',
        name: 'MEMORY SYSTEM',
        sub: 'SHORT | LONG-TERM | EPISODIC',
        icon: <Binary size={18} />,
        description: 'Ingested documents and extracted facts are kept in this browser tab and saved to localStorage.',
    },
    {
        id: 'prompt-opt',
        name: 'PROMPT OPTIMIZATION',
        sub: 'FEW-SHOT EXAMPLE SELECTION',
        icon: <Compass size={18} />,
        description: 'ARA Chat answers are logged locally; those not down-voted are reused as examples for similar future questions.',
    },
    {
        id: 'tool-use',
        name: 'TOOL USE',
        sub: 'HERMES RUN LOG',
        icon: <Wrench size={18} />,
        description: 'Every Hermes run that calls a tool other than the router or ara-chat is logged locally, with its outcome.',
    },
    {
        id: 'planning',
        name: 'AGENT PLANNING',
        sub: 'PERSONA TASK QUEUE',
        icon: <GitFork size={18} />,
        description: 'Persona tasks (queued, running, done, failed) tracked in the local per-user work store.',
    },
    {
        id: 'semantic-routing',
        name: 'SEMANTIC ROUTING',
        sub: 'INTENT UNDERSTANDING & DISPATCH',
        icon: <Zap size={18} />,
        description: 'Classifies what you type into an intent (spawn, chain, command, skill or chat); each decision is logged locally.',
    },
    {
        id: 'evaluation',
        name: 'EVALUATION & MONITORING',
        sub: 'RUN OUTCOMES & RATINGS',
        icon: <BarChart2 size={18} />,
        description: 'Every recorded Hermes run and any user rating it received, tallied from the local run log.',
    },
    {
        id: 'ext-knowledge',
        name: 'EXTERNAL KNOWLEDGE',
        sub: 'LOCAL DOCUMENT SOURCES',
        icon: <ShieldAlert size={18} />,
        description: 'Documents available locally that could be fed into the memory network, and how many already are.',
    },
];

function formatEvent(e: CmnEvent): string {
    const t = new Date(e.at);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    const ms = e.ms != null ? ` (${e.ms}ms)` : '';
    return `[${hh}:${mm}:${ss}] ${e.kind} · ${e.detail}${ms}`;
}

/** SSR-safe `prefers-reduced-motion` read via useSyncExternalStore (no window access at init/render). */
function useReducedMotion(): boolean {
    return useSyncExternalStore(
        (cb) => {
            if (typeof window === 'undefined' || !window.matchMedia) return () => {};
            const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
            mql.addEventListener('change', cb);
            return () => mql.removeEventListener('change', cb);
        },
        () => (typeof window !== 'undefined' && window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false),
        () => false,
    );
}

export default function CognitiveHarness() {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    const { integrations } = useIntegrations();
    const cmn = getCmn(uid, integrations.llm);
    const version = useSyncExternalStore(cmn.subscribe, cmn.getVersion, cmn.getVersion);

    // metrics()/probe() are recomputed only when the engine version changes —
    // probe() runs a real retrieval, so it must not run on every render.
    const metrics = useMemo(() => cmn.metrics(), [cmn, version]);
    const probe = useMemo(() => cmn.probe(), [cmn, version]);

    const runs = useSyncExternalStore(
        hermesLearningStore.subscribe,
        hermesLearningStore.getSnapshot,
        hermesLearningStore.getServerSnapshot,
    );
    const work = useSyncExternalStore(
        personaWorkStore.subscribe,
        personaWorkStore.getSnapshot,
        personaWorkStore.getServerSnapshot,
    );
    const availableDocs = useMemo(() => {
        try { return allLocalDocuments(uid).length; } catch { return 0; }
    }, [uid, version]);

    const reducedMotion = useReducedMotion();

    const [activeIndex, setActiveIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const intervalRef = useRef<number | null>(null);
    const handleRef = useRef<HarnessCanvasHandle | null>(null);
    // Snapshot the mount-time values so the mount-only canvas effect below
    // never needs them in its dependency array.
    const initialMetricsRef = useRef(metrics);
    const initialReducedMotionRef = useRef(reducedMotion);
    const activeIndexRef = useRef(activeIndex);
    activeIndexRef.current = activeIndex;

    // Auto-progress subsystem tabs — pauses when the user interacts or reduced motion is on.
    useEffect(() => {
        if (isPlaying && !reducedMotion) {
            intervalRef.current = window.setInterval(() => {
                setActiveIndex((prev) => (prev + 1) % SUBSYSTEMS.length);
            }, 6000);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isPlaying, reducedMotion]);

    // Scroll active tab into view on the moving bar.
    useEffect(() => {
        if (listRef.current) {
            const activeChild = listRef.current.children[activeIndex] as HTMLElement | undefined;
            if (activeChild) {
                const containerWidth = listRef.current.offsetWidth;
                const childOffset = activeChild.offsetLeft;
                const childWidth = activeChild.offsetWidth;
                // jsdom (test env) has no scrollTo on Element.
                listRef.current.scrollTo?.({
                    left: childOffset - containerWidth / 2 + childWidth / 2,
                    behavior: reducedMotion ? 'auto' : 'smooth',
                });
            }
        }
    }, [activeIndex, reducedMotion]);

    // Canvas: start once on mount (StrictMode-safe — destroy() tears down every
    // observer/rAF so a double-mount leaves nothing dangling), then drive it via refs.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const handle = startHarnessCanvas(canvas, {
            seedCount: initialMetricsRef.current.counts.entities,
            slots: SUBSYSTEMS.length,
            activeIndex: activeIndexRef.current,
            reducedMotion: initialReducedMotionRef.current,
        });
        handleRef.current = handle;
        return () => {
            handle.destroy();
            handleRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; initial values read via refs, live updates via setActive/setReducedMotion below.
    }, []);

    useEffect(() => {
        handleRef.current?.setActive(activeIndex);
    }, [activeIndex]);

    useEffect(() => {
        handleRef.current?.setReducedMotion(reducedMotion);
    }, [reducedMotion]);

    const activeSystem = SUBSYSTEMS[activeIndex];
    const card = harnessCard(activeSystem.id, { cmn: metrics, probe, runs, work, availableDocs });
    const recentEvents = metrics.events.slice(0, 6);
    // isPlaying is the user's intent; reduced motion overrides it to a visible paused state.
    const effectivePlaying = isPlaying && !reducedMotion;

    const focusTab = (index: number) => {
        setActiveIndex(index);
        setIsPlaying(false);
        tabRefs.current[index]?.focus();
    };

    const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            focusTab((index + 1) % SUBSYSTEMS.length);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focusTab((index - 1 + SUBSYSTEMS.length) % SUBSYSTEMS.length);
        } else if (e.key === 'Home') {
            e.preventDefault();
            focusTab(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            focusTab(SUBSYSTEMS.length - 1);
        }
    };

    return (
        <div className="ch-container">
            <div className="cognitive-harness">
                <div className="ch-top-controls">
                    <div className="ch-title-area">
                        <Activity className="ch-pulse-icon" size={16} aria-hidden="true" />
                        <span>COGNITIVE HARNESS</span>
                    </div>
                    <button
                        type="button"
                        className="ch-play-btn"
                        aria-pressed={effectivePlaying}
                        aria-label={effectivePlaying ? 'Pause auto-cycle' : 'Start auto-cycle'}
                        onClick={() => setIsPlaying((p) => !p)}
                    >
                        {effectivePlaying ? <Pause size={12} /> : <Play size={12} />}
                        <span>{effectivePlaying ? 'AUTO-CYCLE ON' : 'AUTO-CYCLE PAUSED'}</span>
                    </button>
                </div>

                <div className="ch-bar-wrapper">
                    <button
                        type="button"
                        className="ch-scroll-left"
                        aria-label="Previous subsystem"
                        onClick={() => focusTab((activeIndex - 1 + SUBSYSTEMS.length) % SUBSYSTEMS.length)}
                    >
                        &lsaquo;
                    </button>
                    <div className="ch-bar-list" ref={listRef} role="tablist" aria-label="Harness subsystems" onFocus={() => setIsPlaying(false)}>
                        {SUBSYSTEMS.map((system, idx) => {
                            const isActive = idx === activeIndex;
                            return (
                                <button
                                    type="button"
                                    key={system.id}
                                    ref={(el) => { tabRefs.current[idx] = el; }}
                                    id={`ch-tab-${system.id}`}
                                    role="tab"
                                    aria-selected={isActive}
                                    aria-controls={isActive ? `ch-panel-${system.id}` : undefined}
                                    tabIndex={isActive ? 0 : -1}
                                    className={`ch-bar-item${isActive ? ' ch-bar-item--active' : ''}`}
                                    onClick={() => focusTab(idx)}
                                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                                >
                                    <span className="ch-item-icon">{system.icon}</span>
                                    <div className="ch-item-text">
                                        <div className="ch-item-name">{system.name}</div>
                                        <div className="ch-item-sub">{system.sub}</div>
                                    </div>
                                    {isActive && <div className="ch-item-highlight-bar" />}
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        className="ch-scroll-right"
                        aria-label="Next subsystem"
                        onClick={() => focusTab((activeIndex + 1) % SUBSYSTEMS.length)}
                    >
                        &rsaquo;
                    </button>
                </div>

                <div className="ch-visual-space">
                    <div className="ch-canvas-container">
                        <canvas ref={canvasRef} className="ch-canvas" aria-hidden="true" />
                        <div className="ch-glass-overlay-label">
                            HARNESS ORCHESTRATION VISUALIZATION
                        </div>
                    </div>

                    <div className="ch-details-panel" role="tabpanel" id={`ch-panel-${activeSystem.id}`} aria-labelledby={`ch-tab-${activeSystem.id}`}>
                        <div className="ch-panel-header">
                            <div className="ch-panel-icon-wrap">{activeSystem.icon}</div>
                            <div className="ch-panel-header-text">
                                <h3>{activeSystem.name}</h3>
                                <span className="ch-panel-subtitle">{activeSystem.sub}</span>
                            </div>
                            <div className={`ch-panel-status-indicator ch-panel-status-indicator--${card.status.state}`}>
                                <span className="ch-status-ping" aria-hidden="true" />
                                <span>{card.status.label}</span>
                            </div>
                        </div>

                        <p className="ch-panel-description">{activeSystem.description}</p>

                        <div className="ch-metrics-grid">
                            {card.metrics.map((met) => (
                                <div key={met.label} className="ch-metric-card">
                                    <span className="ch-metric-label">{met.label}</span>
                                    <span className="ch-metric-value">{met.value}</span>
                                </div>
                            ))}
                        </div>
                        <p className="ch-card-source">{card.source}</p>

                        <div className="ch-logs-container">
                            <div className="ch-logs-header">
                                <Zap size={11} className="ch-logs-flash" aria-hidden="true" />
                                <span>MEMORY NETWORK EVENTS</span>
                            </div>
                            <div className="ch-logs-list" role="log" aria-live="polite" aria-label="Memory network events">
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
        </div>
    );
}
