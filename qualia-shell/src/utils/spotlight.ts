/**
 * spotlight — global cursor-spotlight controller for bento cards (spec §3.3).
 *
 * Any element with the `.spotlight-card` class gets a soft radial glow that
 * follows the cursor. Implementation is the lightweight CSS-custom-property +
 * mouse-position trick the spec calls for (no animation library): a single
 * delegated `pointermove` listener writes `--mx`/`--my` (in px, relative to the
 * card) onto the hovered card; `spotlight.css` paints the gradient at those
 * coordinates. One listener handles every card on the page.
 *
 * SSR-safe: guarded by `typeof window`; the listener attaches once (idempotent)
 * on the client only. Imported for its side effect from `app/root.tsx`.
 */

function attachSpotlight(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const w = window as unknown as { __dwelliumSpotlightAttached?: boolean };
    if (w.__dwelliumSpotlightAttached) return;
    w.__dwelliumSpotlightAttached = true;

    document.addEventListener(
        'pointermove',
        (e) => {
            const target = e.target as Element | null;
            const card = target?.closest?.('.spotlight-card') as HTMLElement | null;
            if (!card) return;
            const r = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${e.clientX - r.left}px`);
            card.style.setProperty('--my', `${e.clientY - r.top}px`);
        },
        { passive: true },
    );
}

attachSpotlight();

export { attachSpotlight };
