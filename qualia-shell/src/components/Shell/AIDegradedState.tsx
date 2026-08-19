/**
 * AIDegradedState — THE standard degraded-AI banner (assessment sweep
 * 2026-06-12, weakness #8). Pairs with useAIAvailability(): widgets render
 * this for any non-'ready' status instead of inventing their own banner.
 *
 * Honest-offline contract:
 *   - says exactly what's wrong (no key / backend-only / 429 / erroring)
 *   - shows the last known result when the caller has one ("cached" chip)
 *   - one-click deep-link to Control Panel → API Keys
 *
 * Renders nothing when status === 'ready' — safe to leave mounted.
 */

import type { AiAvailability } from '../../hooks/useAIAvailability';
import { AlertTriangle, Cloud, Hourglass, Unplug, type LucideIcon } from 'lucide-react';
import './AIDegradedState.css';

export interface AIDegradedStateProps {
    availability: AiAvailability;
    /** Optional cached output the widget can still show. */
    lastKnownLabel?: string;
    /** Override the configure CTA label (default "Open API Keys"). */
    ctaLabel?: string;
    /**
     * This surface calls `callLlm` directly (no backend fallback), so
     * 'backend-only' must be treated as degraded — plan 046 S1a.
     */
    needsKey?: boolean;
    /** Override the banner text. */
    reason?: string;
}

const STATUS_ICON: Record<string, LucideIcon> = {
    'backend-only': Cloud,
    'rate-limited': Hourglass,
    'erroring': AlertTriangle,
    'unavailable': Unplug,
};

export default function AIDegradedState({ availability, lastKnownLabel, ctaLabel, needsKey, reason }: AIDegradedStateProps) {
    if (availability.status === 'ready' || (availability.status === 'backend-only' && !needsKey)) return null;
    return (
        <div className={`ai-degraded ai-degraded--${availability.status}`} role="status">
            <span className="ai-degraded__icon" aria-hidden="true">
                {(() => { const Icon = STATUS_ICON[availability.status] ?? AlertTriangle; return <Icon size={14} />; })()}
            </span>
            <span className="ai-degraded__text">
                {reason ?? (needsKey && availability.status === 'backend-only'
                    ? 'Needs your own AI key — add one to run this.'
                    : availability.reason)}
                {lastKnownLabel ? (
                    <span className="ai-degraded__cached"> Showing last known: {lastKnownLabel}.</span>
                ) : null}
            </span>
            {(availability.status !== 'backend-only' || needsKey) && (
                <button type="button" className="ai-degraded__cta" onClick={availability.configure}>
                    {ctaLabel ?? 'Open API Keys'}
                </button>
            )}
        </div>
    );
}
