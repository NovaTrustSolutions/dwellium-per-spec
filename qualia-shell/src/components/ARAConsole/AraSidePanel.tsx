import { useState } from 'react';
import { X, Brain, Zap, Wrench, Settings, type LucideIcon } from 'lucide-react';
import HonchoHermesPanel from '../HonchoHermesPanel/HonchoHermesPanel';
import { STELLA_TOOL_CATALOG, CATEGORY_ORDER, type StellaTool } from '../StellaAgent/stellaToolCatalog';
import { openWidget } from '../../lib/dwelliumCommands';
import { ARA_SKIP_INTRO_KEY } from './AraIntroVideo';

/**
 * ARA's docked tools panel — the same surfaces Stella exposes, brought into ARA:
 *   • Honcho  — memory / collections / peers (HonchoHermesPanel @ memory)
 *   • Hermes  — the ReAct self-improving agent (HonchoHermesPanel @ hermes)
 *   • Tools   — the catalog of tools ARA can use (click to run, or ask in chat)
 *   • Settings— ARA preferences (intro toggle, …)
 * Rendered in a resizable right-side drawer next to the chat.
 */
export type AraSidePanelView = 'honcho' | 'hermes' | 'tools' | 'settings';

const VIEW_TABS: { id: AraSidePanelView; label: string; Icon: LucideIcon }[] = [
    { id: 'honcho', label: 'Honcho', Icon: Brain },
    { id: 'hermes', label: 'Hermes', Icon: Zap },
    { id: 'tools', label: 'Tools', Icon: Wrench },
    { id: 'settings', label: 'Settings', Icon: Settings },
];

export default function AraSidePanel({
    view,
    onSelectView,
    onClose,
    onPrefill,
}: {
    view: AraSidePanelView;
    onSelectView: (v: AraSidePanelView) => void;
    onClose: () => void;
    onPrefill: (text: string) => void;
}) {
    return (
        <aside className="ara-side" aria-label="ARA tools panel">
            <div className="ara-side__tabs">
                {VIEW_TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        className={`ara-side__tab ${view === t.id ? 'ara-side__tab--active' : ''}`}
                        onClick={() => onSelectView(t.id)}
                    >
                        <t.Icon size={14} aria-hidden /> {t.label}
                    </button>
                ))}
                <button type="button" className="ara-side__close" onClick={onClose} aria-label="Close panel"><X size={16} /></button>
            </div>
            <div className="ara-side__body">
                {view === 'honcho' && <HonchoHermesPanel initialTab="memory" />}
                {view === 'hermes' && <HonchoHermesPanel initialTab="hermes" />}
                {view === 'tools' && <AraToolsView onPrefill={onPrefill} onClose={onClose} />}
                {view === 'settings' && <AraSettingsView />}
            </div>
        </aside>
    );
}

function AraToolsView({ onPrefill, onClose }: { onPrefill: (t: string) => void; onClose: () => void }) {
    const runTool = (tool: StellaTool) => {
        const a = tool.action;
        if (a.kind === 'open-widget' && a.widgetId) { openWidget(a.widgetId); onClose(); }
        else if (a.kind === 'chat-command' && a.command) { onPrefill(a.command); onClose(); }
        else if (a.kind === 'info') { onPrefill(`Tell me about the ${tool.name} tool and when to use it`); onClose(); }
    };

    const groups = CATEGORY_ORDER
        .map(cat => ({ cat, tools: STELLA_TOOL_CATALOG.filter(t => t.category === cat) }))
        .filter(g => g.tools.length > 0);
    const known = new Set(CATEGORY_ORDER);
    const extra = STELLA_TOOL_CATALOG.filter(t => !known.has(t.category));
    if (extra.length) groups.push({ cat: 'Other', tools: extra });

    return (
        <div className="ara-tools">
            <p className="ara-tools__hint">Tools ARA can use — click to run one, or just ask ARA in chat.</p>
            {groups.map(group => (
                <div key={group.cat} className="ara-tools__group">
                    <div className="ara-tools__cat">{group.cat}</div>
                    {group.tools.map(tool => {
                        const ToolIcon = tool.icon;
                        return (
                            <button
                                key={tool.id}
                                type="button"
                                className="ara-tools__tool"
                                onClick={() => runTool(tool)}
                                title={tool.description}
                            >
                                <span className="ara-tools__icon" aria-hidden><ToolIcon size={16} /></span>
                                <span className="ara-tools__meta">
                                    <span className="ara-tools__name">{tool.name}</span>
                                    <span className="ara-tools__desc">{tool.description}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function AraSettingsView() {
    const [playIntro, setPlayIntro] = useState(() => {
        try { return localStorage.getItem(ARA_SKIP_INTRO_KEY) !== 'true'; } catch { return true; }
    });
    const toggleIntro = (next: boolean) => {
        setPlayIntro(next);
        try { localStorage.setItem(ARA_SKIP_INTRO_KEY, next ? 'false' : 'true'); } catch { /* sandboxed */ }
    };
    return (
        <div className="ara-settings-panel">
            <div className="ara-settings-row">
                <div className="ara-settings-label">
                    <span className="ara-settings-name">Play intro video on startup</span>
                    <span className="ara-settings-sub">Plays the ARA intro each time the console opens.</span>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={playIntro}
                    aria-label="Play intro video on startup"
                    className={`ara-switch ${playIntro ? 'ara-switch--on' : ''}`}
                    onClick={() => toggleIntro(!playIntro)}
                >
                    <span className="ara-switch__knob" />
                </button>
            </div>
        </div>
    );
}
