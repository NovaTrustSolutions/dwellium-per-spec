/**
 * WidgetErrorBoundary — functional improvement #1/#4/#5 of the Widget
 * Enhancement Layer (assessment sweep 2026-06-12, weakness #2 "green ≠
 * working"). A widget that throws during render no longer blanks the desktop
 * or strands the shell; it shows an inline recover card scoped to that one
 * window, with a Retry that cleanly remounts the subtree.
 *
 * One boundary per widget, installed in Window.tsx's content slot, so all 48
 * registered widgets inherit it. Gated by widgetEnhancementsStore.errorBoundary
 * (default ON) — when OFF the boundary passes children through untouched.
 */

import { Component, Fragment, type ReactNode, type ErrorInfo } from 'react';
import './WidgetErrorBoundary.css';

interface Props {
    /** Widget label for the recover card + telemetry. */
    widgetLabel: string;
    /** When false, render children with no boundary (reversibility). */
    enabled: boolean;
    /** When false, hide the error detail line (surfaceErrors flag). */
    surfaceErrors: boolean;
    children: ReactNode;
}

interface State {
    error: Error | null;
    /** Bumped on Retry → forces a fresh subtree (crash-recovery remount). */
    resetKey: number;
}

export default class WidgetErrorBoundary extends Component<Props, State> {
    state: State = { error: null, resetKey: 0 };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // Never throws; the desktop must survive a widget crash.
        try {
            // eslint-disable-next-line no-console
            console.error(`[widget:${this.props.widgetLabel}] crashed`, error, info?.componentStack);
        } catch { /* logging must not re-throw */ }
    }

    private retry = (): void => {
        this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
    };

    render(): ReactNode {
        if (!this.props.enabled) return this.props.children;
        if (this.state.error) {
            return (
                <div className="widget-error" role="alert">
                    <div className="widget-error__title">
                        {this.props.widgetLabel} hit an error
                    </div>
                    {this.props.surfaceErrors && this.state.error.message && (
                        <div className="widget-error__detail">{this.state.error.message}</div>
                    )}
                    <button type="button" className="widget-error__retry" onClick={this.retry}>
                        Retry
                    </button>
                </div>
            );
        }
        // resetKey forces React to discard the crashed subtree on retry.
        // 🔴 ZERO-DOM CONTRACT: the healthy path MUST NOT add an element —
        // a wrapper div here broke every `.window__content > X` direct-child
        // CSS selector (widget roots collapsed to 0 height). Keyed Fragment
        // gives the same remount-on-retry semantics with no DOM box.
        return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
    }
}
