/**
 * HalocronBoot — a one-shot ignite overlay for the Halocron theme (2026-06-12).
 *
 * When the desktop first paints under theme-halocron, a Sith holocron unfolds
 * and ignites with a crimson burst, then the overlay fades to reveal the
 * desktop. Plays ONCE per browser session (sessionStorage-gated) so it's a
 * boot moment, not a nag. Renders nothing for any other theme, and nothing
 * once it has played — zero cost when inactive.
 *
 * Mounted inside Desktop (the authenticated shell), deliberately NOT in the
 * auth/login flow — keeps it clear of the session-clearing code (F-009).
 * Honors reduced-motion: under .animations-off it skips straight to dismissed.
 */
import { useEffect, useState } from 'react';
import './HalocronBoot.css';

const PLAYED_KEY = 'halocron-boot-played';

function isHalocron(): boolean {
    try { return document.documentElement.getAttribute('data-theme') === 'halocron'; }
    catch { return false; }
}
function reducedMotion(): boolean {
    try {
        return document.body.classList.contains('animations-off')
            || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { return false; }
}

function shouldIgnite(): boolean {
    try {
        if (!isHalocron()) return false;
        if (sessionStorage.getItem(PLAYED_KEY) === '1') return false;
        if (reducedMotion()) return false;
        return true;
    } catch { return false; }
}

export default function HalocronBoot() {
    // 🔴 Decide in the INITIALIZER, not an effect — the old pattern wrote the
    // played flag inside the effect and StrictMode's second pass then read it
    // and skipped, so the ignite never rendered. Initializer runs before any
    // write; the flag + auto-dismiss timer live in an effect.
    const [phase, setPhase] = useState<'igniting' | 'done'>(() => shouldIgnite() ? 'igniting' : 'done');

    useEffect(() => {
        if (phase !== 'igniting') return;
        try { sessionStorage.setItem(PLAYED_KEY, '1'); } catch { /* sandboxed */ }
        const t = setTimeout(() => setPhase('done'), 2600);
        return () => clearTimeout(t);
    }, [phase]);

    if (phase !== 'igniting') return null;

    return (
        <div className="halocron-boot" aria-hidden="true">
            <div className="halocron-boot__core">
                <svg viewBox="0 0 100 100" className="halocron-boot__glyph">
                    <path d="M50 4 L70 40 L58 70 L50 96 L42 70 L30 40 Z"
                        fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="M30 40 H70 M42 70 H58 M50 4 V96" stroke="currentColor"
                        strokeWidth="1" opacity="0.5" />
                </svg>
                <span className="halocron-boot__burst" />
                <span className="halocron-boot__ring" />
            </div>
            <div className="halocron-boot__word">HALOCRON</div>
        </div>
    );
}
