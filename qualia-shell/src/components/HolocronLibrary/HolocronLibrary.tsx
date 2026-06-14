/**
 * Holocron Library — an animated archival gallery of the eight holocrons
 * (Halocron theme, 2026-06-12). Modeled on the Old Republic reference plate:
 * bronze line-art figures on a near-black warm void, each slowly rotating with
 * a breathing crimson aura. Click a holocron to ignite it and read its lore.
 *
 * Self-contained: React + lucide only, no backend. SVG line-art so it stays
 * crisp at 4K. All motion is CSS and pauses under .animations-off (global
 * reduced-motion toggle), so it inherits the app's accessibility setting.
 */
import { useState, type ReactElement } from 'react';
import { ShieldHalf, Sparkles } from 'lucide-react';
import './HolocronLibrary.css';

interface Holocron {
    fig: string;
    name: string;
    faction: 'Sith' | 'Jedi' | 'Lost';
    lore: string;
    svg: ReactElement;
}

/* Bronze archival line-art. Each draws on a 100×100 canvas; `currentColor`
   inherits the card's bronze stroke so the ignite state can shift it crimson. */
const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
};

const HOLOCRONS: Holocron[] = [
    {
        fig: 'fig. I', name: 'Lazarus', faction: 'Sith',
        lore: 'A cruciform reliquary said to store the engrams of a Dark Lord who refused death. Opening it is rumored to overwrite the reader.',
        svg: (
            <svg viewBox="0 0 100 100" {...stroke}>
                <path d="M42 12 h16 v22 h20 v16 h-20 v38 h-16 v-38 h-20 v-16 h20 z" />
                <path d="M42 34 h16 M50 12 v76 M30 50 h40" opacity="0.5" />
            </svg>
        ),
    },
    {
        fig: 'fig. II', name: 'the Pyramids', faction: 'Sith',
        lore: 'Twin interlocked tetrahedra — the classic Sith holocron form. Its gatekeeper answers only those who already know the question.',
        svg: (
            <svg viewBox="0 0 100 100" {...stroke}>
                <path d="M20 70 L52 24 L84 60 L50 84 Z" />
                <path d="M52 24 L50 84 M20 70 L84 60 M36 47 L68 42" opacity="0.55" />
                <path d="M40 38 L66 70" opacity="0.4" />
            </svg>
        ),
    },
    {
        fig: 'fig. III', name: 'the Star', faction: 'Sith',
        lore: 'A spiked stellated core. Each prong is a sealed lesson; pull the wrong one and the lattice collapses inward on the holder.',
        svg: (
            <svg viewBox="0 0 100 100" {...stroke}>
                <path d="M50 8 L58 40 L92 38 L64 56 L78 88 L50 66 L22 88 L36 56 L8 38 L42 40 Z" />
                <circle cx="50" cy="50" r="12" opacity="0.6" />
            </svg>
        ),
    },
    {
        fig: 'fig. IV', name: 'the Ceptre', faction: 'Jedi',
        lore: 'A geodesic sphere of woven facets — a Jedi memory-vault. It hums when truth is spoken near it and dims around deceit.',
        svg: (
            <svg viewBox="0 0 100 100" {...stroke}>
                <circle cx="50" cy="50" r="38" />
                <ellipse cx="50" cy="50" rx="38" ry="15" opacity="0.5" />
                <ellipse cx="50" cy="50" rx="15" ry="38" opacity="0.5" />
                <path d="M16 36 H84 M16 64 H84 M50 12 L72 30 L86 60 L66 84 L34 84 L14 60 L28 30 Z" opacity="0.4" />
            </svg>
        ),
    },
    {
        fig: 'fig. V', name: 'the Talon', faction: 'Lost',
        lore: 'A curved claw-shell with a single iris-stone. Half a holocron — its twin was never recovered. Reads as a question with no answer.',
        svg: (
            <svg viewBox="0 0 100 100" {...stroke}>
                <path d="M22 86 C18 40 40 14 80 12 C60 30 52 56 56 86 Z" />
                <circle cx="40" cy="70" r="9" opacity="0.7" />
                <path d="M34 40 C44 34 56 34 64 40" opacity="0.45" />
            </svg>
        ),
    },
    {
        fig: 'fig. VI', name: 'the Hourglass', faction: 'Sith',
        lore: 'A pinched dual-frustum that meters its own teaching — one secret per turning, and it decides when the sand has run.',
        svg: (
            <svg viewBox="0 0 100 100" {...stroke}>
                <path d="M26 14 H74 L50 50 L74 86 H26 L50 50 Z" />
                <path d="M26 14 L74 86 M74 14 L26 86" opacity="0.35" />
                <path d="M34 22 H66 M34 78 H66" opacity="0.5" />
            </svg>
        ),
    },
    {
        fig: 'fig. VII', name: 'the Cage', faction: 'Jedi',
        lore: 'An open wire-cube holding nothing visible — its archive is a bound Force-echo. Empty to the eye, deafening to the trained.',
        svg: (
            <svg viewBox="0 0 100 100" {...stroke}>
                <path d="M24 30 H70 V76 H24 Z" />
                <path d="M40 16 H86 V62 H70 M40 16 V30 M86 62 L70 76" />
                <path d="M24 30 L40 16 M70 30 L86 16" opacity="0.5" />
            </svg>
        ),
    },
    {
        fig: 'fig. IIX', name: 'Leviathan', faction: 'Sith',
        lore: 'A long bipyramid crystal, the largest in the index. Said to contain a fleet-doctrine — and the drowned voices of those who wrote it.',
        svg: (
            <svg viewBox="0 0 100 100" {...stroke}>
                <path d="M50 6 L70 40 L58 70 L50 94 L42 70 L30 40 Z" />
                <path d="M30 40 H70 M42 70 H58 M50 6 V94" opacity="0.5" />
            </svg>
        ),
    },
];

export default function HolocronLibrary() {
    const [active, setActive] = useState<number | null>(null);

    return (
        <div className="holocron-lib">
            <header className="holocron-lib__head">
                <div className="holocron-lib__title">
                    <Sparkles size={16} aria-hidden="true" />
                    <h1>Halocron Index</h1>
                </div>
                <p className="holocron-lib__sub">
                    The Old Republic archive — eight recovered holocrons. Select a figure to ignite it.
                </p>
            </header>

            <div className="holocron-lib__grid" role="list">
                {HOLOCRONS.map((h, i) => (
                    <button
                        key={h.name}
                        type="button"
                        role="listitem"
                        className={`holocron-card ${active === i ? 'is-ignited' : ''} faction-${h.faction.toLowerCase()}`}
                        onClick={() => setActive(active === i ? null : i)}
                        aria-pressed={active === i}
                        aria-label={`${h.name} — ${h.faction} holocron`}
                    >
                        <span className="holocron-card__aura" aria-hidden="true" />
                        <span className="holocron-card__art">{h.svg}</span>
                        <span className="holocron-card__cap">
                            <span className="holocron-card__fig">{h.fig}</span>
                            <span className="holocron-card__name">“{h.name}”</span>
                        </span>
                        <span className="holocron-card__faction" aria-hidden="true">
                            <ShieldHalf size={11} /> {h.faction}
                        </span>
                    </button>
                ))}
            </div>

            {active !== null && (
                <aside className="holocron-lib__lore" role="status">
                    <span className="holocron-lib__lore-fig">{HOLOCRONS[active].fig}</span>
                    <strong>“{HOLOCRONS[active].name}”</strong>
                    <p>{HOLOCRONS[active].lore}</p>
                </aside>
            )}
        </div>
    );
}
