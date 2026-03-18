import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reportError } from '../../services/errorReporter';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * ErrorBoundary — Catches uncaught React rendering errors.
 * Shows a recoverable fallback UI instead of a white screen.
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
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', padding: 40, gap: 16,
                    background: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: 12, margin: 8, minHeight: 120,
                    color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                    <span style={{ fontSize: 28 }}>⚠️</span>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#ef4444' }}>
                        Something went wrong
                    </h3>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', maxWidth: 400, textAlign: 'center' }}>
                        {this.state.error?.message || 'An unexpected error occurred in this component.'}
                    </p>
                    <button
                        onClick={this.handleReset}
                        style={{
                            padding: '6px 16px', borderRadius: 6, border: 'none',
                            background: '#ef4444', color: '#fff', fontSize: 13,
                            fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
