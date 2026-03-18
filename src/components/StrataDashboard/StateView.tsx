/**
 * StateView — Shared loading, empty, error, and retry state components.
 *
 * Usage:
 *   <LoadingState message="Loading properties…" />
 *   <EmptyState icon={Building2} message="No properties found" />
 *   <ErrorState message="Failed to load" onRetry={fetchData} />
 */
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, RefreshCw, Inbox } from 'lucide-react';

/* ── Loading ── */
interface LoadingProps {
    message?: string;
}

export function LoadingState({ message = 'Loading…' }: LoadingProps) {
    return (
        <div className="s-state-container">
            <div className="s-state-spinner" />
            <p className="s-state-message">{message}</p>
        </div>
    );
}

/* ── Empty ── */
interface EmptyProps {
    icon?: LucideIcon;
    message?: string;
    sub?: string;
    action?: React.ReactNode;
}

export function EmptyState({
    icon: Icon = Inbox,
    message = 'Nothing here yet',
    sub,
    action,
}: EmptyProps) {
    return (
        <div className="s-state-container">
            <Icon size={40} strokeWidth={1.2} className="s-state-icon" />
            <p className="s-state-message">{message}</p>
            {sub && <p className="s-state-sub">{sub}</p>}
            {action && <div className="s-state-action">{action}</div>}
        </div>
    );
}

/* ── Error ── */
interface ErrorProps {
    message?: string;
    onRetry?: () => void;
}

export function ErrorState({
    message = 'Something went wrong',
    onRetry,
}: ErrorProps) {
    return (
        <div className="s-state-container s-state-error">
            <AlertTriangle size={36} strokeWidth={1.4} className="s-state-icon" />
            <p className="s-state-message">{message}</p>
            <p className="s-state-sub">Check your connection or try again</p>
            {onRetry && (
                <button className="s-state-retry" onClick={onRetry}>
                    <RefreshCw size={13} /> Try again
                </button>
            )}
        </div>
    );
}
