/**
 * SystemHealth — pre-launch AI readiness check.
 *
 * Lists every AI widget with a live status (✓ ready / ⚠ limited / ✗ not connected)
 * and a "Connect" button that opens the right Settings/widget to fix it.
 */
import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { useWindows } from '../../context/WindowContext';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import type { HealthStatus } from '../../lib/systemHealth';
import { launchBackend, launchService, type ServiceId } from '../../lib/serviceLaunch';
import './SystemHealth.css';

const SERVICE_IDS: ServiceId[] = ['langflow', 'paperclip', 'open-notebook'];
const isService = (id: string): id is ServiceId => (SERVICE_IDS as string[]).includes(id);
const toast = (msg: string) => { try { window.dispatchEvent(new CustomEvent('qualia-toast', { detail: msg })); } catch { /* */ } };

// Where "Connect" sends you (= open the right settings / widget).
const OPEN: Record<string, [string, string]> = {
    'control-panel': ['Settings', 'settings'],
    'terminal': ['Terminal', 'terminal'],
    'notebooklm-context': ['NotebookLM', 'notebook'],
};
const GLYPH: Record<HealthStatus, ReactNode> = { ok: <Check size={14} aria-hidden />, degraded: '!', down: <X size={14} aria-hidden />, checking: '…' };

function detailFor(status: HealthStatus, okText?: string, downText?: string): string {
    if (status === 'ok') return okText || 'Ready';
    if (status === 'checking') return 'Checking…';
    if (status === 'degraded') return 'Backend offline — running on your personal LLM key.';
    return downText || 'Not connected.';
}

export default function SystemHealth() {
    const { results, summary, checking, recheck } = useSystemHealth();
    const { openWindow } = useWindows();

    const connect = (widget?: string) => {
        if (!widget) return;
        const [title, icon] = OPEN[widget] || [widget, ''];
        try { openWindow(widget, title, icon); } catch { /* ignore */ }
    };

    const launchBackendNow = async () => {
        const r = await launchBackend();
        toast(r.message);
        // Give the backend a moment to come up, then re-probe.
        setTimeout(() => recheck(), 2500);
    };
    const launchServiceNow = (id: ServiceId) => {
        launchService(id);
        toast(`Launching ${id} in the Terminal…`);
        setTimeout(() => recheck(), 3000);
    };

    return (
        <div className="sysh">
            <div className="sysh-head">
                <div className="sysh-head-text">
                    <h2 className="sysh-title">System Health</h2>
                    <p className={`sysh-sub ${summary.allReady ? 'sysh-sub--ok' : 'sysh-sub--warn'}`}>
                        {checking
                            ? 'Checking AI services…'
                            : summary.allReady
                                ? `All ${summary.total} AI services ready`
                                : `${summary.ok + summary.degraded} of ${summary.total} ready · ${summary.down} need attention`}
                    </p>
                </div>
                <button className="sysh-recheck" onClick={() => recheck()} disabled={checking}>
                    {checking ? 'Checking…' : 'Re-check all'}
                </button>
            </div>

            <div className="sysh-list">
                {results.map(({ item, status }) => (
                    <div key={item.id} className={`sysh-item sysh-item--${status}`}>
                        <span className={`sysh-dot sysh-dot--${status}`}>{GLYPH[status]}</span>
                        <div className="sysh-info">
                            <div className="sysh-label">{item.label}</div>
                            <div className="sysh-detail">{detailFor(status, item.okText, item.downText)}</div>
                        </div>
                        {(status === 'down' || status === 'degraded') && (
                            <div className="sysh-actions">
                                {item.id === 'backend' && (
                                    <button className="sysh-launch" onClick={() => void launchBackendNow()}>
                                        Launch backend
                                    </button>
                                )}
                                {isService(item.id) && (
                                    <button className="sysh-launch" onClick={() => launchServiceNow(item.id as ServiceId)}>
                                        Launch
                                    </button>
                                )}
                                {item.connectWidget && (
                                    <button className="sysh-connect" onClick={() => connect(item.connectWidget)}>
                                        {item.connectLabel || 'Connect'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
