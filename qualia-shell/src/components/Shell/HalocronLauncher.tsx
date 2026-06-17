/**
 * HalocronLauncher — the rune that opens the Holocron OS shell (2026-06-12).
 *
 * Visible only when the Holocron OS layout is enabled AND the shell is
 * currently collapsed (a widget is in use). Clicking it reopens the OS.
 * Renders nothing in Classic layout, so it's zero-footprint there.
 */
import { useSyncExternalStore } from 'react';
import { halocronOsStore } from '../../lib/halocronOsStore';
import './HalocronOS.css';

export default function HalocronLauncher() {
    const state = useSyncExternalStore(halocronOsStore.subscribe, halocronOsStore.getSnapshot, halocronOsStore.getServerSnapshot);
    if (!state.enabled || state.open) return null;
    return (
        <button type="button" className="hos-launcher" onClick={() => halocronOsStore.setOpen(true)}
            aria-label="Open Holocron OS" title="Holocron OS">
            ◈
        </button>
    );
}
