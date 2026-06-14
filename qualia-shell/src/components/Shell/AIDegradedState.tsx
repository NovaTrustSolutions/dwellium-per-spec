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
import './AIDegradedState.css';

export interface AIDegradedStateProps {
    availability: AiAvailability;
    /** Optional cached output the widget can still show. */
    lastKnownLabel?: string;
    /** Override the configure CTA label (default "Open Settings"). */
    ctaLabel?: string;
}

const STATUS_ICON: Record<string, string> = {
    'backend-only': '☁️',
    'rate-limited': '⏳',
    'erroring': '⚠️',
    'unavailable': '🔌',
};

export default function AIDegradedState({ availability, lastKnownLabel, ctaLabel }: AIDegradedStateProps) {
    if (availability.status === 'ready') return null;
    return (
        <div className={`ai-degraded ai-degraded--${availability.status}`} role="status">
            <span className="ai-degraded__icon" aria-hidden="true">
                {STATUS_ICON[availability.status] ?? '⚠️'}
            </span>
            <span className="ai-degraded__text">
                {availability.reason}
                {lastKnownLabel ? (
                    <span className="ai-degraded__cached"> Showing last known: {lastKnownLabel}.</span>
                ) : null}
            </span>
            {availability.status !== 'backend-only' && (
                <button type="button" className="ai-degraded__cta" onClick={availability.configure}>
                    {ctaLabel ?? 'Open Settings'}
                </button>
            )}
        </div>
    );
}
