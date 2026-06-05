/**
 * Hive — Agent Management console (spec §8.1). Composes the existing agents into
 * one surface: agent cards with status (idle/open) + last action, a manual
 * trigger for any agent (§8.3), cost attribution by provider (§8.2 — backend
 * observability fed where available), and the CoPaw memory feed (§8.5) + a Dreams
 * shortcut (§8.4).
 */
import { useContext, useSyncExternalStore } from 'react';
import { Brain, Bot, Cpu, MessageSquare, Network, Layers, Sparkles, Play, Trash2, Eye } from 'lucide-react';
import { useWindows } from '../../context/WindowContext';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { hasActiveLlm } from '../../lib/llmClient';
import { copawStore, copawUserIdHolder, clearMemory, type MemoryFact } from './copawStore';

const ACCENT = '#D6FE51';

interface AgentDef { id: string; name: string; icon: typeof Brain; blurb: string }
const AGENTS: AgentDef[] = [
    { id: 'ara-console', name: 'ARA', icon: Bot, blurb: 'Autonomous research assistant' },
    { id: 'stella-agent', name: 'Stella', icon: Sparkles, blurb: 'Conversational ops agent' },
    { id: 'hydra-ai', name: 'Hydra', icon: Network, blurb: 'Multi-LLM orchestrator' },
    { id: 'honcho', name: 'Honcho', icon: Brain, blurb: 'Memory + Dreams' },
    { id: 'two-brains', name: 'Two Brains', icon: MessageSquare, blurb: 'Pair / screen-share agent' },
    { id: 'synthesis', name: 'Synthesis Lab', icon: Layers, blurb: 'Compounding synthesis (§7.3)' },
    { id: 'builder-agents', name: 'Builder Agents', icon: Cpu, blurb: 'Schema / PRD / Gap (§8.6–8.8)' },
];

export default function Hive() {
    const { windows, openWindow } = useWindows();
    const { integrations } = useIntegrations();
    const provider = integrations.llm.active || 'none';
    const llmReady = hasActiveLlm(integrations.llm);
    const userCtx = useContext(UserContext);
    copawUserIdHolder.current = userCtx?.user?.id ?? null;
    const memory: MemoryFact[] = useSyncExternalStore(copawStore.subscribe, copawStore.getSnapshot, copawStore.getServerSnapshot);

    const openIds = new Set(windows.filter((w) => !w.minimized).map((w) => w.component));
    const trigger = (a: AgentDef) => openWindow(a.id, a.name, '');

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', background: '#000', color: '#ccc', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            {/* Agents */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid #222' }}>
                    <Network size={15} style={{ color: ACCENT }} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', flex: 1 }}>The Hive · Agents</span>
                    <span style={{ fontSize: 11, color: '#666' }}>{openIds.size} running · {AGENTS.length} total</span>
                </div>

                {/* Cost attribution (§8.2) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #161616', background: '#070707', fontSize: 11, color: '#888' }}>
                    <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 700 }}>Cost</span>
                    <span>Active provider: <span style={{ color: llmReady ? ACCENT : '#ff8da5' }}>{provider}</span></span>
                    <span style={{ color: '#555' }}>· per-agent / per-domain attribution streams from backend observability when connected</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, alignContent: 'start' }}>
                    {AGENTS.map((a) => {
                        const open = openIds.has(a.id);
                        const Icon = a.icon;
                        return (
                            <div key={a.id} className="spotlight-card" style={{ borderRadius: 10, padding: 12, background: '#0c0c0c', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Icon size={18} style={{ color: ACCENT, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 700, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                                    <span title={open ? 'Running' : 'Idle'} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: open ? ACCENT : '#666' }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: open ? ACCENT : '#444', boxShadow: open ? `0 0 6px ${ACCENT}` : 'none' }} />
                                        {open ? 'running' : 'idle'}
                                    </span>
                                </div>
                                <div style={{ fontSize: 11, color: '#888', minHeight: 28 }}>{a.blurb}</div>
                                <button onClick={() => trigger(a)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', borderRadius: 6, border: `1px solid ${ACCENT}`, background: open ? 'transparent' : `${ACCENT}14`, color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <Play size={12} /> {open ? 'Focus' : 'Run'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* CoPaw memory (§8.5) + Dreams (§8.4) */}
            <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid #222', background: '#070707', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid #222' }}>
                    <Brain size={14} style={{ color: ACCENT }} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', flex: 1 }}>CoPaw memory ({memory.length})</span>
                    {memory.length > 0 && <button onClick={() => clearMemory()} title="Clear memory" style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', display: 'flex' }}><Trash2 size={12} /></button>}
                </div>
                <div style={{ padding: '6px 12px', borderBottom: '1px solid #161616', fontSize: 10, color: '#666' }}>
                    Auto-captured key facts from agent responses — compounds continuously.
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                    {memory.length === 0 ? (
                        <div style={{ padding: 12, color: '#555', fontSize: 11, lineHeight: 1.6 }}>No facts yet. Run an agent (Synthesis, Builder Agents) and key facts are captured here automatically.</div>
                    ) : memory.map((f) => (
                        <div key={f.id} style={{ padding: '7px 9px', marginBottom: 5, border: '1px solid #1c1c1c', borderRadius: 6, background: '#0a0a0a' }}>
                            <div style={{ fontSize: 11.5, color: '#ddd', lineHeight: 1.5 }}>{f.text}</div>
                            <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>{f.source} · {new Date(f.createdAt).toLocaleDateString()}</div>
                        </div>
                    ))}
                </div>
                <button onClick={() => openWindow('honcho', 'Honcho', '')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 10, padding: '8px 0', borderRadius: 7, border: '1px solid #333', background: 'transparent', color: '#ccc', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Eye size={13} /> Open Dreams (Honcho)
                </button>
            </div>
        </div>
    );
}
