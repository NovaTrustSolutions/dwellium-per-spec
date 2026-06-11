/**
 * terminalLaunch — open the Terminal widget and run (or pre-fill) a command in
 * it from anywhere (System Health, LangFlow/Paperclip/Open Notebook panels).
 *
 * The Terminal consumes the pending command both on mount (for the just-opened
 * case) and via the `dwellium:terminal-run` event (for the already-open case);
 * `consumePendingTerminalRun` is single-shot so the command never double-runs.
 */

export type TerminalTab = 'terminal' | 'paperclip' | 'langflow' | 'crewai';

export interface TerminalRunDetail {
    command: string;
    tab?: TerminalTab;
    /** false = pre-fill the input only, don't execute. Default true. */
    run?: boolean;
}

let pending: TerminalRunDetail | null = null;

/** Open the Terminal widget and queue a command to run / pre-fill in it. */
export function launchInTerminal(detail: TerminalRunDetail): void {
    pending = detail;
    try {
        window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: 'terminal' } }));
    } catch { /* SSR / sandbox */ }
    // Re-emit so an ALREADY-open Terminal (whose mount won't refire) still
    // receives it once. The just-opened case is covered by the Terminal's
    // on-mount consume.
    const fire = () => { try { window.dispatchEvent(new CustomEvent('dwellium:terminal-run')); } catch { /* */ } };
    fire();
    setTimeout(fire, 250);
}

/** Single-shot read of the queued command (returns null after the first call). */
export function consumePendingTerminalRun(): TerminalRunDetail | null {
    const p = pending;
    pending = null;
    return p;
}
