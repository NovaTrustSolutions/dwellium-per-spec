/**
 * EntityLink — universal clickable entity name for StrataDashboard.
 *
 * Wraps any property / tenant / unit / vendor / owner / workitem name so
 * clicking it jumps to that entity's full detail view, via the same
 * StrataNavContext + searchNavTarget path the ⌘K global search uses — the
 * target modules already know how to open a detail from a nav target.
 *
 * Renders a real <button> (axe button-name satisfied by the visible name)
 * styled as an inline link (`.s-entity-link` in StrataDashboard.css).
 * Falls back to a plain <span> when there is no id to link to (stub rows).
 * Clicks stop propagating by default: linked names usually sit inside rows
 * that have their own onClick, and the inner link must win.
 */
import React from 'react';
import { useStrataNav, type EntityLinkType } from './StrataNavContext';

interface EntityLinkProps {
    type: EntityLinkType;
    id: string | null | undefined;
    /** Needed only for type="unit" (unit detail lives under its property). */
    parentId?: string;
    children: React.ReactNode;
    className?: string;
}

export default function EntityLink({ type, id, parentId, children, className }: EntityLinkProps) {
    const { navigateToEntity } = useStrataNav();

    if (!id) return <span className={className}>{children}</span>;

    return (
        <button
            type="button"
            className={`s-entity-link${className ? ` ${className}` : ''}`}
            title={`View ${type} details`}
            onClick={(e) => {
                e.stopPropagation();
                navigateToEntity(type, id, parentId);
            }}
        >
            {children}
        </button>
    );
}
