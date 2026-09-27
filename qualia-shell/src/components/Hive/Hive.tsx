/**
 * Hive — launcher and status console for the 7 built-in AI agents: run or
 * focus any of them, see at a glance which are open, and browse or prune the
 * CoPaw auto-captured memory feed. Per-agent cost isn't tracked yet (see the
 * AI Spend widget for totals by provider).
 */
import { useContext, useState, useSyncExternalStore } from 'react';
import { Brain, Bot, Cpu, MessageSquare, Network, Layers, Sparkles, Play, Trash2, Eye, X } from 'lucide-react';
import { useWindows } from '../../context/WindowContext';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { hasActiveLlm } from '../../lib/llmClient';
import { copawStore, copawUserIdHolder, clearMemory, deleteFact, type MemoryFact } from './copawStore';
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
const MEMORY_PAGE = 100;

interface AgentDef { id: string; name: string; icon: typeof Brain; blurb: string }
const AGENTS: AgentDef[] = [
    { id: 'ara-console', name: 'ARA', icon: Bot, blurb: 'Autonomous research assistant' },
    { id: 'stella-agent', name: 'Stella', icon: Sparkles, blurb: 'Conversational ops agent' },
    { id: 'hydra-ai', name: 'Hydra', icon: Network, blurb: 'Multi-LLM orchestrator' },
    { id: 'honcho', name: 'Honcho', icon: Brain, blurb: 'Memory + Dreams' },
    { id: 'two-brains', name: 'Two Brains', icon: MessageSquare, blurb: 'Pair / screen-share agent' },
    { id: 'synthesis', name: 'Synthesis Lab', icon: Layers, blurb: 'Compounding synthesis' },
    { id: 'builder-agents', name: 'Builder Agents', icon: Cpu, blurb: 'Schema / PRD / Gap analysis' },
];

function toastCantOpen(name: string) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Couldn't open ${name}.` }));
}

export default function Hive() {
    const { windows, openWindow } = useWindows();
    const { integrations } = useIntegrations();
    const provider = integrations.llm.active || 'none';
    const llmReady = hasActiveLlm(integrations.llm);
    const userCtx = useContext(UserContext);
    copawUserIdHolder.current = userCtx?.user?.id ?? null;
    const memory: MemoryFact[] = useSyncExternalStore(copawStore.subscribe, copawStore.getSnapshot, copawStore.getServerSnapshot);
    const [filter, setFilter] = useState('');
    const [showAllMemory, setShowAllMemory] = useState(false);

    const openIds = new Set(windows.filter((w) => !w.minimized).map((w) => w.component));
    const openAgentCount = AGENTS.filter((a) => openIds.has(a.id)).length;

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)', fontSize: 11, color: MUTED }}>
                    <span style={{ color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 700 }}>Cost</span>
                    <span>Active provider: <span style={{ color: llmReady ? ACCENT_TEXT : 'color-mix(in srgb, var(--danger) 60%, var(--text-primary))' }}>{provider}</span></span>
                    <span style={{ color: MUTED }}>· Per-agent cost isn't tracked yet — see AI Spend for totals by provider.</span>
                    <button onClick={() => openOrToast('ai-spend', 'AI Spend')}
                        style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border-default)', borderRadius: 5, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Open AI Spend
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, alignContent: 'start' }}>
                    {AGENTS.map((a) => {
                        const open = openIds.has(a.id);
                        const Icon = a.icon;
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
                            {visibleMemory.map((f) => (
                                <div key={f.id} style={{ padding: '7px 9px', marginBottom: 5, border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--bg-desktop)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>{f.text}</div>
                                        <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>{f.source} · {new Date(f.createdAt).toLocaleDateString()}</div>
                                    </div>
                                    <button
                                        onClick={() => deleteFact(f.id)}
                                        aria-label={`Delete fact: ${f.text.slice(0, 40)}`}
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
