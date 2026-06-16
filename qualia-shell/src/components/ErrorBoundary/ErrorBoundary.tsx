import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportError } from '../../services/errorReporter';
import { Sentry, isEnabled as isSentryEnabled } from '../../services/sentry';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/** Shared fallback UI for both Sentry and custom error boundaries */
function DefaultFallback({ error, onReset }: { error?: Error | null; onReset?: () => void }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 40, gap: 16,
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 12, margin: 8, minHeight: 120,
            color: 'var(--text-primary)', fontFamily: 'Inter, system-ui, sans-serif',
        }}>
            <span style={{ fontSize: 28 }}><AlertTriangle size={14} /></span>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#ef4444' }}>
                Something went wrong
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, textAlign: 'center' }}>
                {error?.message || 'An unexpected error occurred in this component.'}
            </p>
            {onReset && (
                <button
                    onClick={onReset}
                    style={{
                        padding: '6px 16px', borderRadius: 6, border: 'none',
                        background: '#ef4444', color: 'var(--text-primary)', fontSize: 13,
                        fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    Try Again
                </button>
            )}
        </div>
    );
}

/**
 * ErrorBoundary — Uses Sentry.ErrorBoundary when DSN is configured,
 * falls back to a custom class component when Sentry is disabled.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
        reportError(error, 'ErrorBoundary', { componentStack: errorInfo.componentStack });
        this.props.onError?.(error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        // When Sentry is enabled, delegate to Sentry.ErrorBoundary for richer telemetry
        if (isSentryEnabled()) {
            return (
                <Sentry.ErrorBoundary
                    fallback={(errorData: { error: unknown; componentStack?: string; eventId?: string; resetError: () => void }): React.ReactElement => (
                        <>{this.props.fallback || <DefaultFallback error={errorData.error as Error} onReset={errorData.resetError} />}</>
                    )}
                    onError={(error: unknown, componentStack: string) => {
                        const err = error instanceof Error ? error : new Error(String(error));
                        reportError(err, 'ErrorBoundary', { componentStack });
                        this.props.onError?.(err, { componentStack } as ErrorInfo);
                    }}
                >
                    {this.props.children}
                </Sentry.ErrorBoundary>
            );
        }

        // Fallback: custom error boundary when Sentry is not configured
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return <DefaultFallback error={this.state.error} onReset={this.handleReset} />;
        }

        return this.props.children;
    }
}
