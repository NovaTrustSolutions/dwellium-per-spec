/**
 * SystemHealthBanner — the auto readiness check shown at login.
 *
 * Runs the AI health probes on mount; if anything is not connected, shows a
 * dismissible banner that opens the full System Health panel. Stays silent when
 * everything is ready.
 */
import { useState } from 'react';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import { useWindows } from '../../context/WindowContext';

export default function SystemHealthBanner() {
    const { summary, checking } = useSystemHealth();
    const { openWindow } = useWindows();
    const [dismissed, setDismissed] = useState(false);

    if (checking || dismissed || summary.total === 0 || summary.allReady) return null;

    return (
        <div className="sysh-banner" role="status">
            <span className="sysh-banner-dot">!</span>
            <span className="sysh-banner-text">
                {summary.down} AI service{summary.down !== 1 ? 's' : ''} need attention before everything's operational.
            </span>
            <button
                className="sysh-banner-open"
                onClick={() => { try { openWindow('system-health', 'System Health', 'layout-grid'); } catch { /* ignore */ } setDismissed(true); }}
            >
                Open System Health
            </button>
            <button className="sysh-banner-x" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
        </div>
    );
}
