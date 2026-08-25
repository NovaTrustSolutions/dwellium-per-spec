/**
 * AdvisoryBoardDiagram — the clickable 5 Persona Advisory Board diagram shown
 * on the Holocron OS Home page (and as the widget's header).
 *
 * Phases into existence: hexagon first, then the connectors draw, then the five
 * persona cards fade + rise in. `prefers-reduced-motion: reduce` switches the
 * whole thing to `data-motion="off"` and everything renders immediately.
 *
 * 🔴 Every card carries BOTH the display shorthand ("Jobs · Clarity", matching
 * the upstream artwork) and the canonical lens name in its `aria-label`, and
 * the non-affiliation disclaimer sits under the diagram.
 */
import { useEffect, useState } from 'react';
import { LENSES, NON_AFFILIATION_DISCLAIMER, type LensId } from '../../lib/advisoryBoard/lenses';
import { HexRune, LENS_GLYPH } from './lensIcons';
import './AdvisoryBoardDiagram.css';

/** Grid slot per lens — mirrors the reference artwork's 2-2-1 layout. */
const SLOT: Record<LensId, string> = {
    'clarity': 'tl',
    'risk': 'tr',
    'offer': 'bl',
    'scale': 'br',
    'future-self': 'bc',
};

/** CRIT labels around the hexagon (SKILL.md §"CRIT Workflow"). */
const CRIT_LABELS = [
    { key: 'context', label: 'Context' },
    { key: 'task', label: 'Task' },
    { key: 'role', label: 'Role' },
    { key: 'interview', label: 'Interview' },
];

/** Connector endpoints in the overlay's nominal 0–100 coordinate space. */
const CONNECTORS: { id: LensId; x1: number; y1: number; x2: number; y2: number }[] = [
    { id: 'clarity', x1: 39, y1: 25, x2: 33, y2: 17 },
    { id: 'risk', x1: 61, y1: 25, x2: 67, y2: 17 },
    { id: 'offer', x1: 39, y1: 47, x2: 33, y2: 55 },
    { id: 'scale', x1: 61, y1: 47, x2: 67, y2: 55 },
    { id: 'future-self', x1: 50, y1: 57.5, x2: 50, y2: 76 },
];

/** True when the user asked for reduced motion. Effect-time only (SSR-safe). */
function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);
    return reduced;
}

export interface AdvisoryBoardDiagramProps {
    /** Clicking a persona card. Receives the lens id. */
    onSelectLens: (lensId: LensId) => void;
    /** Rendered under the subtitle — e.g. an "Open the board" button. */
    action?: React.ReactNode;
}

export default function AdvisoryBoardDiagram({ onSelectLens, action }: AdvisoryBoardDiagramProps) {
    const reduced = useReducedMotion();
    return (
        <section className="abd" data-motion={reduced ? 'off' : 'on'} data-testid="advisory-board-diagram"
            aria-labelledby="abd-title">
            <h2 className="abd__title" id="abd-title">5 Persona Advisory Board</h2>
            <p className="abd__sub">
                Interview first. Stress-test with five strategic lenses. Decide with <span className="abd__accent">clarity.</span>
            </p>
            {action && <div className="abd__action">{action}</div>}

            <div className="abd__grid">
                {/* Connector layer — decorative; hidden when the cards stack. */}
                <svg className="abd__wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    {CONNECTORS.map((c, i) => (
                        <line key={c.id} className="abd__wire" x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
                            vectorEffect="non-scaling-stroke" style={{ animationDelay: `${260 + i * 60}ms` }} />
                    ))}
                </svg>
                {CONNECTORS.map((c, i) => (
                    <span key={c.id} className="abd__dot" aria-hidden="true"
                        style={{ left: `${c.x2}%`, top: `${c.y2}%`, animationDelay: `${420 + i * 60}ms` }} />
                ))}

                <div className="abd__hex" data-testid="advisory-board-crit">
                    <svg className="abd__hex-shape" viewBox="0 0 100 116" aria-hidden="true" focusable="false">
                        <polygon points="50,2 97,30 97,86 50,114 3,86 3,30" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <span className="abd__hex-rune" aria-hidden="true"><HexRune /></span>
                    <span className="abd__hex-word">CRIT</span>
                    {CRIT_LABELS.map((l) => (
                        <span key={l.key} className={`abd__crit abd__crit--${l.key}`}>
                            <i className="abd__crit-dot" aria-hidden="true" />
                            {l.label}
                        </span>
                    ))}
                </div>

                {LENSES.map((lens, i) => {
                    const Glyph = LENS_GLYPH[lens.id];
                    return (
                        <button
                            key={lens.id}
                            type="button"
                            className={`abd__card abd__card--${SLOT[lens.id]}`}
                            style={{ animationDelay: `${520 + i * 90}ms` }}
                            onClick={() => onSelectLens(lens.id)}
                            aria-label={`Open the ${lens.name} (${lens.shorthand} · ${lens.role})`}
                            title={lens.keyQuestion}
                        >
                            <span className="abd__card-icon" aria-hidden="true"><Glyph /></span>
                            <span className="abd__card-rule" aria-hidden="true" />
                            <span className="abd__card-text">
                                <span className="abd__card-name">{lens.shorthand}</span>
                                <span className="abd__card-role">{lens.role}</span>
                                <span className="abd__card-lens">{lens.name}</span>
                            </span>
                        </button>
                    );
                })}
            </div>

            <p className="abd__disclaimer">
                Interpretive strategic lenses, not impersonations. {NON_AFFILIATION_DISCLAIMER}
            </p>
        </section>
    );
}
