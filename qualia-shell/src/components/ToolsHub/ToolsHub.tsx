/**
 * ToolsHub — plan 047 §5. One table over `data/toolsHub.ts`: name · license
 * · status pill · blurb · phase · Open. `ready` → open the widget;
 * `needs-setup` → open the Guide (setup notes); `coming-soon` → disabled.
 * Plus the two help rows (Keyboard shortcuts → ShortcutSheet, Guide → Guide
 * widget). First open unlocks the `tools` tier (expansion/toast only — `can()`
 * stays authoritative). Clicks log `tools-hub:open {toolId,status}` to the
 * activity log (plan 047 §7 metric: % users opening ≥1 tool within 14 days).
 */
import { useEffect } from 'react';
import { TOOLS, HELP_ENTRIES, resolveToolStatus, type ToolEntry, type ToolStatus } from '../../data/toolsHub';
import { WIDGET_REGISTRY } from '../../registry/widgetRegistry';
import { openWidget } from '../../lib/dwelliumCommands';
import { logActivity } from '../../lib/activityLogStore';
import { unlockTier } from '../../lib/onboardingStore';
import { useFluidVoiceStatus } from '../../lib/fluidVoiceLocalApi';
import './ToolsHub.css';

const STATUS_LABEL: Record<ToolStatus, string> = { ready: 'Ready', 'needs-setup': 'Needs setup', 'coming-soon': 'Coming soon' };

/** Status for every tool, resolved against the live registry + Vite env (exported for tests). */
export function toolStatuses(env: Record<string, string | undefined> = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}): Array<{ tool: ToolEntry; status: ToolStatus }> {
    return TOOLS.map(tool => ({ tool, status: resolveToolStatus(tool, id => !!WIDGET_REGISTRY[id], env) }));
}

export default function ToolsHub() {
    useEffect(() => { unlockTier('tools'); }, []);
    const rows = toolStatuses();
    // Plan 053 (Dictation): live FluidVoice detection for the companion row — macOS only; 'unknown' elsewhere.
    const { state: fluidVoiceState } = useFluidVoiceStatus();

    const open = (tool: ToolEntry, status: ToolStatus) => {
        logActivity('tools-hub', 'Tools hub', 'tools-hub:open', { toolId: tool.id, status });
        if (status === 'ready' && tool.widgetId) openWidget(tool.widgetId);
        else if (status === 'ready' && tool.companion) openWidget('control-panel'); // companion setup card lives there
        else openWidget('guide');
    };

    return (
        <div className="tools-hub">
            <div className="tools-hub__head">
                <h2 className="tools-hub__h">Tools hub</h2>
                <p className="tools-hub__sub">Ten open-source tools planned for Dwellium. Statuses flip here as each one lands — nothing opens a blank screen.</p>
            </div>
            <div className="tools-hub__scroll">
                <table className="tools-hub__table">
                    <thead>
                        <tr><th>Tool</th><th>What it does</th><th>License</th><th>Phase</th><th>Status</th><th aria-label="Action" /></tr>
                    </thead>
                    <tbody>
                        {rows.map(({ tool, status }) => (
                            <tr key={tool.id} data-tool={tool.id} data-status={status}>
                                <td className="tools-hub__name">{tool.label}</td>
                                <td className="tools-hub__blurb">{tool.blurb}</td>
                                <td className="tools-hub__license">{tool.license}</td>
                                <td>{tool.phase}</td>
                                <td>
                                    <span className={`tools-hub__pill tools-hub__pill--${status}`}>{STATUS_LABEL[status]}</span>
                                    {tool.id === 'dictation' && (fluidVoiceState === 'running' || fluidVoiceState === 'not-detected') && (
                                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                            FluidVoice: {fluidVoiceState === 'running' ? 'Running' : 'Not detected'}
                                        </span>
                                    )}
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="tools-hub__btn"
                                        disabled={status === 'coming-soon'}
                                        title={status === 'coming-soon' ? `Coming soon (phase ${tool.phase})` : status === 'needs-setup' ? 'Open setup notes in the Guide' : `Open ${tool.label}`}
                                        onClick={() => open(tool, status)}
                                    >
                                        {status === 'coming-soon' ? 'Coming soon' : status === 'needs-setup' ? 'Set up' : 'Open'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="tools-hub__help">
                <h3 className="tools-hub__h3">Help</h3>
                <ul className="tools-hub__help-list">
                    {HELP_ENTRIES.map(h => (
                        <li key={h.id}>
                            <button
                                type="button"
                                className="tools-hub__btn"
                                onClick={() => h.action === 'shortcuts' ? window.dispatchEvent(new CustomEvent('dwellium:open-shortcuts')) : openWidget('guide')}
                            >{h.label}</button>
                            <span className="tools-hub__blurb">{h.blurb}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
