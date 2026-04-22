/**
 * AdapterBoundary — RT-01 mitigation for the Universal Shell.
 *
 * Canary: [CT-3F-REDTEAM-J5N9]  (references Phase3F_Red_Team_Report.docx)
 *
 * Source of truth:
 *   [SOURCE: Phase3H_Engineer_Handoff.docx, §5 Table 5 R1 (RT-01)]
 *   "If a container adapter fails in the Universal Shell (F-1), the entire
 *    4-column layout could break. Mitigation: Implement adapter isolation
 *    with graceful degradation. Failed adapter shows error state in its
 *    column; other columns continue operating."
 *
 * Implementation: a standard React error boundary scoped to a single
 * column. When the wrapped tree throws during render, the boundary swaps
 * in a compact error pill so siblings keep rendering. No retries, no
 * silent swallow — the error surfaces to the user with enough context
 * for engineering to act.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import type { ShellColumnId } from './types';

interface AdapterBoundaryProps {
    containerId: string;
    columnId: ShellColumnId;
    columnLabel: string;
    children: ReactNode;
}

interface AdapterBoundaryState {
    error: Error | null;
}

export class AdapterBoundary extends Component<AdapterBoundaryProps, AdapterBoundaryState> {
    constructor(props: AdapterBoundaryProps) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error: Error): AdapterBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Per RT-01: fail loud in the owning column, not silently.
        // eslint-disable-next-line no-console
        console.error(
            `[UniversalShell] adapter "${this.props.containerId}" crashed in column "${this.props.columnId}"`,
            error,
            info.componentStack,
        );
    }

    private handleReset = () => {
        this.setState({ error: null });
    };

    render(): ReactNode {
        if (this.state.error) {
            return (
                <div className="us-column-error" role="alert" aria-live="polite">
                    <div className="us-column-error__title">
                        {this.props.columnLabel} unavailable
                    </div>
                    <div className="us-column-error__body">
                        <code>{this.props.containerId}</code> crashed while rendering.
                    </div>
                    <div className="us-column-error__message">
                        {this.state.error.message || 'Unknown error'}
                    </div>
                    <button
                        type="button"
                        className="us-column-error__retry"
                        onClick={this.handleReset}
                    >
                        Retry column
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
