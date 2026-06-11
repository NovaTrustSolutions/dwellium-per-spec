/**
 * SpacesSwitcher — the proposal's Way 2 surface. Renders the user's Spaces at
 * the top of the sidebar; one click swaps the whole canvas (via
 * dwelliumCommands.switchSpace → the WindowContext apply-space bus). Works in
 * both icon-rail (compact) and expanded modes.
 */
import { useSyncExternalStore } from 'react';
import { spacesStore } from '../../lib/spacesStore';
import { switchSpace } from '../../lib/dwelliumCommands';
import { getIcon } from './iconMap';
import './SpacesSwitcher.css';

export default function SpacesSwitcher({ compact = false }: { compact?: boolean }) {
    const spaces = useSyncExternalStore(
        spacesStore.subscribe,
        spacesStore.getSnapshot,
        spacesStore.getServerSnapshot,
    );
    if (!spaces.length) return null;

    return (
        <div className={`spaces-switcher ${compact ? 'spaces-switcher--compact' : ''}`} role="list" aria-label="Spaces">
            {!compact && <div className="spaces-switcher__label">SPACES</div>}
            <div className="spaces-switcher__row">
                {spaces.map((sp) => {
                    const Icon = getIcon(sp.icon);
                    return (
                        <button
                            key={sp.id}
                            className="spaces-switcher__btn"
                            role="listitem"
                            title={`Switch to ${sp.name}`}
                            aria-label={`Switch to ${sp.name} space`}
                            onClick={() => switchSpace(sp.id)}
                        >
                            <span className="spaces-switcher__icon">
                                {Icon ? <Icon size={compact ? 18 : 16} strokeWidth={1.75} /> : sp.name.charAt(0)}
                            </span>
                            {!compact && <span className="spaces-switcher__name">{sp.name}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
