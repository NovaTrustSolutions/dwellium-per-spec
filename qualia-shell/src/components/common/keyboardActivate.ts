import type { KeyboardEvent } from 'react';

/**
 * Keyboard twin for a clickable non-button element (list row, card, toggle header).
 *
 * Pair with `role="button" tabIndex={0}`: Enter or Space pressed on the element
 * itself re-dispatches its click, so the keyboard path can never drift from the
 * onClick handler — including when the handler lives on a `role="presentation"`
 * container above it (the click bubbles up exactly like a mouse click would).
 * Keys pressed on nested controls (buttons, inputs) are left to those controls.
 *
 *   <div role="button" tabIndex={0} onKeyDown={activateOnEnterOrSpace} onClick={open}>…</div>
 */
export function activateOnEnterOrSpace(e: KeyboardEvent<HTMLElement>): void {
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Space would otherwise scroll the page
    e.currentTarget.click();
}
