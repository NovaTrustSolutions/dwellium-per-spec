/**
 * FluidLauncher — the droplet that reopens the Fluid OS shell (2026-07-04).
 * Sister of HalocronLauncher.tsx.
 *
 * Visible only when the Fluid OS layout is enabled AND the shell is currently
 * collapsed (a widget is in use). Clicking it reopens the shell. Renders
 * nothing in Classic or Holocron layout, so it's zero-footprint there.
 */
import { useSyncExternalStore } from 'react';
import { fluidOsStore } from '../../lib/fluidOsStore';
import './FluidOS.css';

export default function FluidLauncher() {
    const state = useSyncExternalStore(fluidOsStore.subscribe, fluidOsStore.getSnapshot, fluidOsStore.getServerSnapshot);
    if (!state.enabled || state.open) return null;
    return (
        <button type="button" className="fos-launcher" onClick={() => fluidOsStore.setOpen(true)}
            aria-label="Open Fluid OS" title="Fluid OS">
            <span className="fos-launcher__drop" aria-hidden="true" />
        </button>
    );
}
