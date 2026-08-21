/**
 * FluidLauncher — the droplet that reopens the Cockpit shell (2026-07-04;
 * copy updated for the plan-049 cockpit redesign). Sister of
 * HalocronLauncher.tsx.
 *
 * Visible only when the Cockpit (Fluid OS) layout is enabled AND the shell is
 * currently collapsed (the classic desktop is in use). Clicking it reopens
 * the cockpit. Renders nothing in Classic or Holocron layout, so it's
 * zero-footprint there.
 */
import { useSyncExternalStore } from 'react';
import { fluidOsStore } from '../../lib/fluidOsStore';
import './FluidOS.css';

export default function FluidLauncher() {
    const state = useSyncExternalStore(fluidOsStore.subscribe, fluidOsStore.getSnapshot, fluidOsStore.getServerSnapshot);
    if (!state.enabled || state.open) return null;
    return (
        <button type="button" className="fos-launcher" onClick={() => fluidOsStore.setOpen(true)}
            aria-label="Open Cockpit" title="Cockpit">
            <span className="fos-launcher__drop" aria-hidden="true" />
        </button>
    );
}
