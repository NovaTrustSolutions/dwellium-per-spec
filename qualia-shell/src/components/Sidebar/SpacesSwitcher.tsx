/**
 * SpacesSwitcher — the proposal's Way 2 surface. Renders the user's Spaces at
 * the top of the sidebar; one click swaps the whole canvas (via
 * dwelliumCommands.switchSpace → the WindowContext apply-space bus). Works in
 * both icon-rail (compact) and expanded modes.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { spacesStore } from '../../lib/spacesStore';
import { switchSpace } from '../../lib/dwelliumCommands';
import { getIcon } from './iconMap';
import './SpacesSwitcher.css';

/** `trailing` renders at the right end of the SPACES row (the ⌘K search trigger); it stays even when no Space exists yet. */
export default function SpacesSwitcher({ compact = false, trailing }: { compact?: boolean; trailing?: ReactNode }) {
    const spaces = useSyncExternalStore(
        spacesStore.subscribe,
        spacesStore.getSnapshot,
        spacesStore.getServerSnapshot,
    );
    if (!spaces.length && !trailing) return null;

    return (
        <div className={`spaces-switcher ${compact ? 'spaces-switcher--compact' : ''}`}>
            {!compact && (
                <div className="spaces-switcher__label">
                    {spaces.length > 0 && <span>SPACES</span>}
                    {trailing && <span className="spaces-switcher__trailing">{trailing}</span>}
                </div>
            )}
            {compact && trailing && <div className="spaces-switcher__trailing spaces-switcher__trailing--compact">{trailing}</div>}
            <div className="spaces-switcher__row" role="list" aria-label="Spaces">
                {spaces.map((sp) => {
                    const Icon = getIcon(sp.icon);
                    return (
                        <div key={sp.id} role="listitem" className="spaces-switcher__item">
                            <button
                                className="spaces-switcher__btn"
                                title={`Switch to ${sp.name}`}
                                aria-label={`Switch to ${sp.name} space`}
                                onClick={() => switchSpace(sp.id)}
                            >
                                <span className="spaces-switcher__icon">
                                    {Icon ? <Icon size={compact ? 18 : 16} strokeWidth={1.75} /> : sp.name.charAt(0)}
                                </span>
                                {!compact && <span className="spaces-switcher__name">{sp.name}</span>}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
