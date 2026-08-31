/**
 * CommandPill — persistent "Search or ask… ⌘K" pill, top-centre of the shell
 * (plan 046 S2-8a). Opens the CommandPalette via the `dwellium:open-palette`
 * CustomEvent; the trailing "?" ghost button opens the ShortcutSheet via
 * `dwellium:open-shortcuts`. Hidden ≤600px (CommandPill.css — not responsive.css)
 * and while the Cockpit layout is open (it would overlap the cockpit header).
 */
import { useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import { fluidOsStore } from '../../lib/fluidOsStore';
import './CommandPill.css';

export default function CommandPill() {
    // Hidden while the Cockpit overlay is up: the pill is position:fixed at
    // z 4900 and would float over the cockpit's header (2026-08-22). ⌘K and
    // the cockpit's own "New" button still open the palette.
    const fos = useSyncExternalStore(fluidOsStore.subscribe, fluidOsStore.getSnapshot, fluidOsStore.getServerSnapshot);
    if (fos.enabled && fos.open) return null;
    return (
        <div className="cmd-pill-wrap" data-tour="command-bar">
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
