/**
 * Hive — launcher and status console for the 7 built-in AI agents: run or
 * focus any of them, see at a glance which are open and when they last ran
 * (with error state + response snippet), their 7-day call/cost tally, and
 * browse or prune the CoPaw auto-captured memory feed. Cost is per-source
 * from llmUsageStore's bySource rollup — see the AI Spend widget for full
 * per-provider/per-model totals.
 */
import { useState, useSyncExternalStore } from 'react';
import { Brain, Bot, Cpu, MessageSquare, Network, Layers, Sparkles, Play, Trash2, Eye, X } from 'lucide-react';
import { useWindows } from '../../context/WindowContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { hasActiveLlm } from '../../lib/llmClient';
import { copawStore, clearMemory, deleteFact, isSensitiveFact, type MemoryFact } from './copawStore';
import { useAgentActivity, type AgentActivity } from '../../lib/agentActivityStore';
import { useLlmUsage, lastNDays, type DailyRollup } from '../../lib/llmUsageStore';
import './Hive.css';

const ACCENT = '#D6FE51';
// D6: ACCENT as text measures ~1.03:1 in the latte theme — text/icons use the
// theme's own accent-text token; ACCENT itself stays only for decorative
// fills/borders (dots, glows, button outlines) where contrast doesn't apply.
const ACCENT_TEXT = 'var(--accent-text)';
// Small secondary/tertiary text: --text-tertiary alone measures too low in
// both cosmos and latte at these sizes (audited 2026-09-27). Repo precedent
// (BudgetBar.css) mixes the muted token toward --text-primary for a readable
// result on any surface.
const MUTED = 'color-mix(in srgb, var(--text-tertiary) 55%, var(--text-primary))';
// Same danger-text formula already used for the sensitive-fact badge below —
// theme-safe against both cosmos and latte surfaces.
const DANGER_TEXT = 'color-mix(in srgb, var(--danger) 60%, var(--text-primary))';
const MEMORY_PAGE = 100;

interface AgentDef { id: string; name: string; icon: typeof Brain; blurb: string; sources: string[] }
const AGENTS: AgentDef[] = [
    { id: 'ara-console', name: 'ARA', icon: Bot, blurb: 'Autonomous research assistant', sources: ['ara', 'team-run'] },
    { id: 'stella-agent', name: 'Stella', icon: Sparkles, blurb: 'Conversational ops agent', sources: ['stella'] },
    { id: 'hydra-ai', name: 'Hydra', icon: Network, blurb: 'Multi-LLM orchestrator', sources: ['hydra'] },
    { id: 'honcho', name: 'Honcho', icon: Brain, blurb: 'Memory + Dreams', sources: ['honcho'] },
    { id: 'two-brains', name: 'Two Brains', icon: MessageSquare, blurb: 'Pair / screen-share agent', sources: [] },
    { id: 'synthesis', name: 'Synthesis Lab', icon: Layers, blurb: 'Compounding synthesis', sources: ['synthesis'] },
    { id: 'builder-agents', name: 'Builder Agents', icon: Cpu, blurb: 'Schema / PRD / Gap analysis', sources: ['builder-agents'] },
];

/** "just now" / "N min ago" / "N h ago" / "N d ago" — no date lib, this is the whole scale we need. */
function relativeTime(ts: number, now: number): string {
    const sec = Math.max(0, Math.floor((now - ts) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} h ago`;
    return `${Math.floor(hr / 24)} d ago`;
}

/** Newest activity among `sources`, optionally restricted to successful runs. */
function newestActivity(sources: string[], map: Record<string, AgentActivity>, onlyOk = false): AgentActivity | null {
    let best: AgentActivity | null = null;
    for (const src of sources) {
        const a = map[src];
        if (!a || (onlyOk && !a.ok)) continue;
        if (!best || a.lastRunAt > best.lastRunAt) best = a;
    }
    return best;
}

/** Sums bySource calls/cost across `days` for `sources`. */
function sumSources(days: DailyRollup[], sources: string[]): { calls: number; cost: number } {
    let calls = 0, cost = 0;
    for (const day of days) {
        for (const src of sources) {
            const s = day.bySource?.[src];
            if (s) { calls += s.calls; cost += s.estCost; }
        }
    }
    return { calls, cost };
}

/** Sums bySource calls/cost across `days` for every source key NOT in `known` (includes untagged 'other' calls). */
function sumOtherSources(days: DailyRollup[], known: Set<string>): { calls: number; cost: number } {
    let calls = 0, cost = 0;
    for (const day of days) {
        for (const [src, v] of Object.entries(day.bySource ?? {})) {
            if (!known.has(src)) { calls += v.calls; cost += v.estCost; }
        }
    }
    return { calls, cost };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function fmtCost(cost: number): string {
    if (cost > 0 && cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(2)}`;
}

const AGENT_SOURCES = new Set(AGENTS.flatMap((a) => a.sources));

function toastCantOpen(name: string) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Couldn't open ${name}.` }));
}

export default function Hive() {
    const { windows, openWindow } = useWindows();
    const { integrations } = useIntegrations();
    const provider = integrations.llm.active || 'none';
    const llmReady = hasActiveLlm(integrations.llm);
    const memory: MemoryFact[] = useSyncExternalStore(copawStore.subscribe, copawStore.getSnapshot, copawStore.getServerSnapshot);
    const activityMap = useAgentActivity();
    const usageLedger = useLlmUsage();
    const [filter, setFilter] = useState('');
    const [showAllMemory, setShowAllMemory] = useState(false);

    const openIds = new Set(windows.filter((w) => !w.minimized).map((w) => w.component));
    const openAgentCount = AGENTS.filter((a) => openIds.has(a.id)).length;
    const now = Date.now();
    const week = lastNDays(7, usageLedger);
    const agentsWeek = sumSources(week, [...AGENT_SOURCES]);
    const otherWeek = sumOtherSources(week, AGENT_SOURCES);
    // Unpriced calls (unknown model price) are counted per day, not per source — disclose them instead of showing a false $0.
    const unpricedWeek = week.reduce((n, d) => n + (d.unpriced ?? 0), 0);

    const openOrToast = (id: string, name: string) => {
        const opened = openWindow(id, name, '');
        if (!opened) toastCantOpen(name);
    };
    const trigger = (a: AgentDef) => openOrToast(a.id, a.name);

    const handleClearAll = () => {
        const ok = typeof window !== 'undefined' && window.confirm(
            `Delete all ${memory.length} CoPaw facts? This also removes them on your other devices.`
        );
        if (ok) clearMemory();
    };

    const q = filter.trim().toLowerCase();
    const filteredMemory = q
        ? memory.filter((f) => f.text.toLowerCase().includes(q) || f.source.toLowerCase().includes(q))
        : memory;
    const visibleMemory = showAllMemory ? filteredMemory : filteredMemory.slice(0, MEMORY_PAGE);

    return (
        <div className="hive-root" style={{ display: 'flex', height: '100%', width: '100%', background: 'var(--bg-desktop)', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            {/* Agents */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border-default)' }}>
                    <Network size={15} style={{ color: ACCENT_TEXT }} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, flex: 1 }}>The Hive · Agents</span>
                    <span style={{ fontSize: 11, color: MUTED }}>{openAgentCount} open · {AGENTS.length} agents</span>
                </div>

                {/* Cost */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)', fontSize: 11, color: MUTED }}>
                    <span style={{ color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 700 }}>Cost</span>
                    <span>Active provider: <span style={{ color: llmReady ? ACCENT_TEXT : DANGER_TEXT }}>{provider}</span></span>
                    <span style={{ color: MUTED }}>· 7 d agents: {plural(agentsWeek.calls, 'call')} · {fmtCost(agentsWeek.cost)}</span>
                    <span style={{ color: MUTED }}>· Other features: {fmtCost(otherWeek.cost)}</span>
                    {unpricedWeek > 0 && <span style={{ color: MUTED }}>· {plural(unpricedWeek, 'call')} with an unknown model price (not in totals)</span>}
                    <span style={{ color: MUTED }}>· By Domain isn't tracked.</span>
                    <button onClick={() => openOrToast('ai-spend', 'AI Spend')}
                        style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border-default)', borderRadius: 5, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Open AI Spend
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, alignContent: 'start' }}>
                    {AGENTS.map((a) => {
                        const open = openIds.has(a.id);
                        const Icon = a.icon;
                        const isTwoBrains = a.sources.length === 0;
                        const latest = newestActivity(a.sources, activityMap);
                        const latestOk = newestActivity(a.sources, activityMap, true);
                        const lastRunLabel = isTwoBrains
                            ? 'Not an AI-model agent'
                            : latest
                                ? relativeTime(latest.lastRunAt, now)
                                : 'No runs recorded yet';
                        const { calls: weekCalls, cost: weekCost } = sumSources(week, a.sources);
                        return (
                            <div key={a.id} className="spotlight-card" style={{ borderRadius: 10, padding: 12, background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Icon size={18} style={{ color: ACCENT_TEXT, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                                    <span title={open ? 'Open' : 'Closed'} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: open ? ACCENT_TEXT : MUTED }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: open ? ACCENT : 'var(--border-strong)', boxShadow: open ? `0 0 6px ${ACCENT}` : 'none' }} />
                                        {open ? 'open' : 'closed'}
                                    </span>
                                </div>
                                <div style={{ fontSize: 11, color: MUTED, minHeight: 28 }}>{a.blurb}</div>
                                <div style={{ fontSize: 10, color: MUTED }}>{lastRunLabel}</div>
                                {latest && !latest.ok && (
                                    <div
                                        title={latest.error ?? 'error'}
                                        style={{ fontSize: 10, fontWeight: 700, color: DANGER_TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                        error{latest.error ? `: ${latest.error}` : ''}
                                    </div>
                                )}
                                {latestOk?.snippet && (
                                    <div title={latestOk.snippet} style={{ fontSize: 10, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {latestOk.snippet}
                                    </div>
                                )}
                                {!isTwoBrains && (
                                    <div style={{ fontSize: 10, color: MUTED }}>7 d: {plural(weekCalls, 'call')} · {fmtCost(weekCost)}</div>
                                )}
                                <button onClick={() => trigger(a)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', borderRadius: 6, border: `1px solid ${ACCENT}`, background: open ? 'transparent' : `${ACCENT}14`, color: ACCENT_TEXT, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <Play size={12} /> {open ? 'Focus' : 'Run'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* CoPaw memory + Dreams shortcut */}
            <div className="hive-rail" style={{ flexShrink: 0, borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface-elevated)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border-default)' }}>
                    <Brain size={14} style={{ color: ACCENT_TEXT }} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, flex: 1 }}>CoPaw memory ({memory.length})</span>
                    {memory.length > 0 && (
                        <button onClick={handleClearAll} aria-label="Clear CoPaw memory" title="Clear memory"
                            style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', display: 'flex' }}>
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
                <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter memory…"
                        aria-label="Filter CoPaw memory"
                        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 5, padding: '5px 7px', fontSize: 11, color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    />
                </div>
                <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 10, color: MUTED }}>
                    Auto-captured key facts from agent responses — compounds continuously.
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                    {filteredMemory.length === 0 ? (
                        <div style={{ padding: 12, color: MUTED, fontSize: 11, lineHeight: 1.6 }}>
                            {memory.length === 0
                                ? 'No facts yet. Run an agent (Synthesis, Builder Agents) and key facts are captured here automatically.'
                                : 'No facts match that filter.'}
                        </div>
                    ) : (
                        <>
                            {visibleMemory.map((f, i) => (
                                <div key={f.id} style={{ padding: '7px 9px', marginBottom: 5, border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--bg-desktop)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>{f.text}</div>
                                        {isSensitiveFact(f.text) && (
                                            <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, color: DANGER_TEXT }}>
                                                Looks like a secret or personal data — hidden from agents. Delete it?
                                            </div>
                                        )}
                                        <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>{f.source} · {new Date(f.createdAt).toLocaleDateString()}</div>
                                    </div>
                                    <button
                                        onClick={() => deleteFact(f.id)}
                                        aria-label={`Delete fact ${i + 1}: ${f.text.slice(0, 40)}`}
                                        style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', display: 'flex', flexShrink: 0, padding: 2 }}>
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            {!showAllMemory && filteredMemory.length > MEMORY_PAGE && (
                                <button onClick={() => setShowAllMemory(true)}
                                    style={{ width: '100%', background: 'none', border: '1px solid var(--border-default)', borderRadius: 6, padding: '6px 0', color: 'var(--text-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Show all {filteredMemory.length}
                                </button>
                            )}
                        </>
                    )}
                </div>
                <button onClick={() => openOrToast('honcho', 'Honcho')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 10, padding: '8px 0', borderRadius: 7, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Eye size={13} /> Open Dreams (Honcho)
                </button>
            </div>
        </div>
    );
}
