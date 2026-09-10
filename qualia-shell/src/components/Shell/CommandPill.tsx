/**
 * CommandPill — the "Search ⌘K" trigger. It sits in the sidebar's SPACES row
 * (SpacesSwitcher `trailing`), not over the desktop: the fixed top-centre pill
 * of plan 046 S2-8a floated above window title bars and the cockpit header and
 * hid whatever was under it (2026-09-10). Opens the CommandPalette via the
 * `dwellium:open-palette` CustomEvent; the trailing "?" ghost button opens the
 * ShortcutSheet via `dwellium:open-shortcuts`. `compact` (icon rail) keeps only
 * the search icon — the "?" key still opens the sheet.
 */
import { Search } from 'lucide-react';
import './CommandPill.css';

export default function CommandPill({ compact = false }: { compact?: boolean }) {
    return (
        <div className={`cmd-pill-wrap${compact ? ' cmd-pill-wrap--compact' : ''}`} data-tour="command-bar">
            <button
                type="button"
                className="cmd-pill"
                title="Search or ask anything (⌘K)"
                aria-label="Search or ask anything (⌘K)"
                onClick={() => window.dispatchEvent(new CustomEvent('dwellium:open-palette'))}
            >
                <Search size={13} aria-hidden />
                {!compact && <span>Search</span>}
                {!compact && <kbd>⌘K</kbd>}
            </button>
            {!compact && (
                <button
                    type="button"
                    className="cmd-pill__help"
                    title="Keyboard shortcuts (?)"
                    aria-label="Keyboard shortcuts (?)"
                    onClick={() => window.dispatchEvent(new CustomEvent('dwellium:open-shortcuts'))}
                >
                    ?
                </button>
            )}
        </div>
    );
}
