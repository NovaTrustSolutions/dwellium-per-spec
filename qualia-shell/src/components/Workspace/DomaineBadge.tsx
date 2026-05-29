/**
 * DomaineBadge — compact pill showing which Domaine the current view belongs to.
 *
 * Dwellium port of Holocron's `components/DomaineBadge.tsx`. Holocron resolved a
 * Domaine three ways (by pre-resolved object, by id, or by project-name → namespace
 * lookup). Dwellium's Workspace derives its tree from the shared file-explorer
 * endpoint and has no namespace→domaine mapping, so this port is purely
 * PRESENTATIONAL: callers pass an already-resolved `DomaineMeta` (Workspace always
 * knows the active domaine from its drill-down state). Dropping the resolution hooks
 * keeps the component SSR-safe and dependency-free (decision C9-D2).
 *
 * Renders `null` when no domaine is supplied, so callers can place it unconditionally
 * without an empty-pill flicker.
 *
 * Two variants: `chip` (color-dot + name) and `dot` (color-dot only, for tight
 * breadcrumb space). Inline styles match the fey.com palette used across Workspace.
 */
import type { DomaineMeta } from './workspaceApi';

const ACCENT = '#D6FE51';

interface Props {
    domaine?: DomaineMeta | null;
    /** `chip` = full pill with name; `dot` = color-dot only. */
    variant?: 'chip' | 'dot';
    /** Optional className for layout overrides. */
    className?: string;
}

export function DomaineBadge({ domaine, variant = 'chip', className }: Props) {
    if (!domaine) return null;
    const tint = domaine.color || ACCENT;

    if (variant === 'dot') {
        return (
            <span
                className={className}
                title={`Domaine: ${domaine.name}`}
                aria-label={`Domaine ${domaine.name}`}
                style={{
                    display: 'inline-block',
                    width: 8, height: 8, borderRadius: 4,
                    background: tint, flexShrink: 0,
                }}
            />
        );
    }

    return (
        <span
            className={className}
            title={`Domaine: ${domaine.name}`}
            aria-label={`Domaine ${domaine.name}`}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 8px',
                background: '#141414',
                border: `1px solid ${tint}33`,   // tint at ~0.2 alpha
                borderRadius: 999,
                fontSize: 10, fontWeight: 600,
                color: '#bbb', letterSpacing: '0.02em',
                whiteSpace: 'nowrap', userSelect: 'none', flexShrink: 0,
                maxWidth: 160, overflow: 'hidden',
            }}
        >
            <span style={{ width: 6, height: 6, borderRadius: 3, background: tint, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{domaine.name}</span>
        </span>
    );
}
