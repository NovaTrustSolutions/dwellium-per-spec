/**
 * ShortcutSheet — global "?" keyboard-shortcut sheet (plan 046 S2-8b).
 *
 * Opens on a bare `?` when focus is NOT in an input/textarea/select/
 * contenteditable (and the event was not already handled — IDocEditor keeps
 * its own capture-phase `?` sheet), on the `dwellium:open-shortcuts`
 * CustomEvent (CommandPill "?" button, ⌘K "shortcuts" command), and closes on
 * Escape (capture-phase + stopPropagation so Desktop's Esc→close-front-window
 * does not also fire) or scrim click.
 *
 * Rows list only shortcuts with live handlers in the admin shell — keep in
 * sync when a global hotkey is added/removed.
 */
import { useEffect, useState } from 'react';
import { openWidget } from '../../lib/dwelliumCommands';
import { replayFirstRun } from '../../lib/firstRunStore';
import './ShortcutSheet.css';

// Same one-liner as IDocEditor.tsx `isField`.
const isField = (t: EventTarget | null): boolean => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); };

const ROWS: Array<{ keys: string[]; label: string }> = [
    { keys: ['⌘K'], label: 'Search or open anything' },
    { keys: ['?'], label: 'This sheet' },
    { keys: ['⌘W'], label: 'Close the front window' },
    { keys: ['Esc'], label: 'Close the front window (when not typing)' },
    { keys: ['⌘T'], label: 'Tag the selected text' },
    { keys: ['⌘⇧2'], label: 'Open Two Brains' },
    { keys: ['⌘⇧F'], label: 'Search Strata — when Strata is open' },
    { keys: ['⌘Tab', '⌘⇧Tab'], label: 'Cycle Holocron OS tabs — when Holocron is open' },
    { keys: ['↑', '↓', 'Enter', 'Esc'], label: 'Navigate / open / close inside ⌘K' },
];

export default function ShortcutSheet() {
    const [open, setOpen] = useState(false);

    // Bubble-phase toggle on `?` + CustomEvent opener.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.defaultPrevented && !isField(e.target)) {
                e.preventDefault();
                setOpen(o => !o);
            }
        };
        const onOpen = () => setOpen(true);
        window.addEventListener('keydown', onKey);
        window.addEventListener('dwellium:open-shortcuts', onOpen);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('dwellium:open-shortcuts', onOpen);
        };
    }, []);

    // Capture-phase Escape while open — swallow it so Desktop does not close a window too.
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        };
        window.addEventListener('keydown', onEsc, true);
        return () => window.removeEventListener('keydown', onEsc, true);
    }, [open]);

    if (!open) return null;

    // Scrim click closes (keyboard path = the Escape listener above); clicks inside the card are ignored.
    return (
        <div className="shortcut-sheet__scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div
                className="shortcut-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Keyboard shortcuts"
            >
                <div className="shortcut-sheet__head">
                    <h2 className="shortcut-sheet__h">Keyboard shortcuts</h2>
                    <button type="button" className="shortcut-sheet__close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
                </div>
                <ul className="shortcut-sheet__list">
                    {ROWS.map(r => (
                        <li key={r.label} className="shortcut-sheet__row">
                            <span className="shortcut-sheet__keys">
                                {r.keys.map(k => <kbd key={k}>{k}</kbd>)}
                            </span>
                            <span className="shortcut-sheet__label">{r.label}</span>
                        </li>
                    ))}
                </ul>
                {/* Plan 047 §6 — Guides: the Guide widget, the Tools hub, and "Replay first-run". */}
                <div className="shortcut-sheet__guides">
                    <span className="shortcut-sheet__guides-label">Guides</span>
                    <button type="button" className="shortcut-sheet__link" onClick={() => { openWidget('guide'); setOpen(false); }}>Getting started</button>
                    <button type="button" className="shortcut-sheet__link" onClick={() => { openWidget('tools-hub'); setOpen(false); }}>Tools hub</button>
                    <button type="button" className="shortcut-sheet__link" onClick={() => { replayFirstRun(); setOpen(false); }}>Replay first-run</button>
                </div>
                <div className="shortcut-sheet__foot">⌘ is Ctrl on Windows/Linux · press <kbd>?</kbd> or <kbd>Esc</kbd> to close</div>
            </div>
        </div>
    );
}
