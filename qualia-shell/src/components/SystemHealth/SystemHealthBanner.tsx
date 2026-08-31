/**
 * SystemHealthBanner — the auto readiness check shown at login.
 *
 * Runs the AI health probes on mount; if anything is not connected, shows a
 * dismissible banner that opens the full System Health panel. Stays silent when
 * everything is ready.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import { useWindows } from '../../context/WindowContext';
import { useWalkthroughActive } from '../../lib/walkthroughStore';
// 2026-06-12 (Ilya: "AI services split screen"): the banner rendered UNSTYLED
// as a full-height flex column because this stylesheet was only imported by
// the SystemHealth WIDGET (lazy chunk) — never loaded until the widget was
// opened. Importing here keeps the banner the compact fixed toast it was
// designed to be: message + "Open System Health", nothing more.
import './SystemHealth.css';

/** Plan 045 B2 toast copy — "N connection(s) need(s) setup — open System Health". */
export function needSetupCopy(down: number): string {
    return down === 1
        ? '1 connection needs setup — open System Health'
        : `${down} connections need setup — open System Health`;
}

export default function SystemHealthBanner() {
    const { summary, checking } = useSystemHealth();
    const { openWindow } = useWindows();
    const [dismissed, setDismissed] = useState(false);
    // Hidden while the walkthrough runs (it crowds the spotlight); returns untouched after.
    const walkthrough = useWalkthroughActive();

    if (walkthrough.active) return null;
    if (checking || dismissed || summary.total === 0 || summary.allReady) return null;

    return (
        <div className="sysh-banner" role="status">
            <span className="sysh-banner-dot">!</span>
            <span className="sysh-banner-text">
                {needSetupCopy(summary.down)}
            </span>
            <button
                className="sysh-banner-open"
                onClick={() => { try { openWindow('system-health', 'System Health', 'layout-grid'); } catch { /* ignore */ } setDismissed(true); }}
            >
                Open System Health
            </button>
            <button className="sysh-banner-x" onClick={() => setDismissed(true)} aria-label="Dismiss"><X size={16} /></button>
        </div>
    );
}
