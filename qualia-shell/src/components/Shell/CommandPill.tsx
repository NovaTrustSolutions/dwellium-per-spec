/**
 * CommandPill — persistent "Search or ask… ⌘K" pill, top-centre of the shell
 * (plan 046 S2-8a). Opens the CommandPalette via the `dwellium:open-palette`
 * CustomEvent; the trailing "?" ghost button opens the ShortcutSheet via
 * `dwellium:open-shortcuts`. Hidden ≤600px (CommandPill.css — not responsive.css).
 */
import { Search } from 'lucide-react';
import './CommandPill.css';

export default function CommandPill() {
    return (
        <div className="cmd-pill-wrap">
            <button
                type="button"
                className="cmd-pill"
                aria-label="Search or ask anything (⌘K)"
                onClick={() => window.dispatchEvent(new CustomEvent('dwellium:open-palette'))}
            >
                <Search size={13} aria-hidden />
                <span>Search or ask…</span>
                <kbd>⌘K</kbd>
            </button>
            <button
                type="button"
                className="cmd-pill__help"
                aria-label="Keyboard shortcuts (?)"
                onClick={() => window.dispatchEvent(new CustomEvent('dwellium:open-shortcuts'))}
            >
                ?
            </button>
        </div>
    );
}
