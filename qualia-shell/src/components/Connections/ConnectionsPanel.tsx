/**
 * ConnectionsPanel — P12-7 (gap items 8+9, 2026-06-12): the video's
 * "connections panel + memory stack overview" in one pane.
 *
 *   §A Connections — every integration with a live status chip + deep-link
 *      (LLM providers, search keys, Supabase, Postgres, Google, backend,
 *      knowledge graph).
 *   §B Memory stack — every knowledge store with live counts ("what's
 *      plugged into your stack"), one-click open of the owning widget.
 *   §C Agent context — review + amend the standing context ARA applies
 *      silently to every chat (the video's "amend your agent memory file").
 */
import { useCallback, useEffect, useState } from 'react';
import { Cable, Database, BrainCircuit } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { useWindows } from '../../context/WindowContext';
import { getAuthHeaders } from '../../context/UserContext';
import { API_BASE } from '../../config';
import { useAgentContext } from '../../lib/agentContextStore';
import { backendStatusStore, type BackendStatusSnapshot } from '../../lib/backendStatusStore';
import { useSyncExternalStore } from 'react';
import { memoryStore } from '../HonchoHermesPanel/honchoMemoryStore';
import { dreamStore } from '../StellaAgent/honchoDreamStore';
import { hermesLearningStore } from '../HonchoHermesPanel/hermesLearningStore';
import { thoughtWeaverStore } from '../ThoughtWeaver/thoughtWeaverStore';
import { goalsStore } from '../../lib/goalsStore';
import { artifactStore } from '../../lib/artifactStore';
import { tagStore } from '../../lib/tagStore';
import { morningBriefStore } from '../../lib/morningBriefStore';
import './ConnectionsPanel.css';

type Chip = 'on' | 'off' | 'partial';

interface ConnRow { name: string; chip: Chip; detail: string; widget?: string }

export function buildMemoryRows(): Array<{ name: string; count: number; widget: string }> {
    const safe = (fn: () => number): number => { try { return fn(); } catch { return 0; } };
    return [
        { name: 'Honcho memories', count: safe(() => memoryStore.getSnapshot().length), widget: 'honcho' },
        { name: 'Dreams', count: safe(() => dreamStore.getSnapshot().length), widget: 'honcho' },
        { name: 'Agent exchanges (Hermes learning)', count: safe(() => hermesLearningStore.getSnapshot().length), widget: 'ara-console' },
        { name: 'ThoughtWeaver captures', count: safe(() => thoughtWeaverStore.getSnapshot().length), widget: 'thought-weaver' },
        { name: 'Goals (Mission Control)', count: safe(() => goalsStore.getSnapshot().length), widget: 'mission-control' },
        { name: 'Artifacts', count: safe(() => artifactStore.getSnapshot().length), widget: 'artifact-gallery' },
        { name: 'Tags', count: safe(() => tagStore.getSnapshot().length), widget: 'task-board' },
        { name: 'Morning briefs', count: safe(() => morningBriefStore.getSnapshot().length), widget: 'ara-console' },
    ];
}

export default function ConnectionsPanel() {
    const { integrations } = useIntegrations();
    const { openWindow } = useWindows();
    const { ctx, saveAgentContext } = useAgentContext();
    const backendSnap = useSyncExternalStore<BackendStatusSnapshot>(
        backendStatusStore.subscribe,
        backendStatusStore.getSnapshot,
        backendStatusStore.getSnapshot,
    );
    const backend = backendSnap.state;
    const [draft, setDraft] = useState<string | null>(null);
    const [kg, setKg] = useState<{ built: boolean; nodes: number } | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/knowledge-graph/status`, { headers: { ...getAuthHeaders() } });
                const json = await res.json();
                if (!cancelled && json?.success) setKg({ built: !!json.data.built, nodes: json.data.nodes ?? 0 });
            } catch { /* backend down — row shows off */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const llm = integrations.llm;
    const llmRows: ConnRow[] = (['anthropic', 'openai', 'gemini', 'local', 'custom'] as const).map(p => {
        const cfg = llm[p] as { enabled?: boolean; apiKey?: string; model?: string } | undefined;
        const configured = !!cfg?.apiKey || (p === 'local' && !!cfg?.enabled);
        return {
            name: `LLM · ${p}`,
            chip: configured ? (llm.active === p ? 'on' : 'partial') : 'off',
            detail: configured ? `${llm.active === p ? 'ACTIVE · ' : ''}${cfg?.model ?? 'default model'}` : 'no key',
            widget: 'control-panel',
        };
    });

    const rows: ConnRow[] = [
        ...llmRows,
        { name: 'Live search (Tavily/Brave)', chip: integrations.search?.tavily?.apiKey || integrations.search?.brave?.apiKey ? 'on' : 'off', detail: integrations.search?.tavily?.apiKey ? 'Tavily' : integrations.search?.brave?.apiKey ? 'Brave' : 'no key', widget: 'control-panel' },
        { name: 'Supabase', chip: integrations.supabase?.url ? (integrations.supabase.enabled ? 'on' : 'partial') : 'off', detail: integrations.supabase?.url ? new URL(integrations.supabase.url).host : 'not linked', widget: 'control-panel' },
        { name: 'Postgres', chip: integrations.postgres ? 'partial' : 'off', detail: integrations.postgres ? 'configured (backend route pending)' : 'not configured', widget: 'control-panel' },
        { name: 'Google (Gmail/Calendar)', chip: integrations.google?.accounts?.length ? 'on' : 'off', detail: integrations.google?.accounts?.length ? `${integrations.google.accounts.length} account(s)` : 'awaiting client JSON', widget: 'control-panel' },
        { name: 'Dwellium backend', chip: backend === 'online' ? 'on' : backend === 'checking' ? 'partial' : 'off', detail: String(backend), widget: 'system-health' },
        { name: 'Knowledge graph (graphify)', chip: kg?.built ? 'on' : 'off', detail: kg?.built ? `${kg.nodes} nodes` : 'not built', widget: 'knowledge-graph' },
    ];

    const memoryRows = buildMemoryRows();

    const openTarget = useCallback((widget?: string) => {
        if (!widget) return;
        try { openWindow(widget, widget, 'settings'); } catch { /* ignore */ }
    }, [openWindow]);

    return (
        <div className="connpane">
            <section aria-label="Connections">
                <h3 className="connpane__h"><Cable size={14} aria-hidden /> Connections</h3>
                <ul className="connpane__list">
                    {rows.map(r => (
                        <li key={r.name} className="connpane__row">
                            <span className={`connpane__chip connpane__chip--${r.chip}`} aria-label={r.chip === 'on' ? 'connected' : r.chip === 'partial' ? 'partially configured' : 'not connected'} />
                            <span className="connpane__name">{r.name}</span>
                            <span className="connpane__detail">{r.detail}</span>
                            {r.widget && <button className="connpane__open" onClick={() => openTarget(r.widget)}>Open</button>}
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-label="Memory stack">
                <h3 className="connpane__h"><Database size={14} aria-hidden /> Memory stack</h3>
                <ul className="connpane__list">
                    {memoryRows.map(r => (
                        <li key={r.name} className="connpane__row">
                            <span className="connpane__count">{r.count}</span>
                            <span className="connpane__name">{r.name}</span>
                            <button className="connpane__open" onClick={() => openTarget(r.widget)}>Open</button>
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-label="Agent context">
                <h3 className="connpane__h"><BrainCircuit size={14} aria-hidden /> Agent context</h3>
                <p className="connpane__hint">
                    Standing notes ARA applies silently to every conversation — who you are, preferences,
                    do/don't rules. Edit and it takes effect on the next message.
                </p>
                <textarea
                    className="connpane__context"
                    value={draft ?? ctx.text}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => { if (draft !== null && draft !== ctx.text) { saveAgentContext(draft); setDraft(null); } }}
                    placeholder="e.g. I manage 12 properties in Atlanta. Keep replies short. Never schedule anything on Fridays."
                    rows={6}
                    aria-label="Agent standing context"
                />
                {ctx.updatedAt && <small className="connpane__stamp">Saved {new Date(ctx.updatedAt).toLocaleString()}</small>}
            </section>
        </div>
    );
}
