/**
 * hiddenWidgetsStore — hide / un-hide widgets from the sidebar (the data half of
 * add/remove widgets). The UI closes open windows on remove; this just tracks
 * the hidden set + persists it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { hiddenWidgetsStore, hideWidget, unhideWidget } from '../lib/hiddenWidgetsStore';

beforeEach(() => {
    hiddenWidgetsStore.reset();
    localStorage.clear();
});

describe('hiddenWidgetsStore', () => {
    it('starts empty (everything visible)', () => {
        expect(hiddenWidgetsStore.getSnapshot()).toEqual([]);
    });

    it('hides a widget and persists it', () => {
        hideWidget('terminal');
        expect(hiddenWidgetsStore.getSnapshot()).toContain('terminal');
        expect(JSON.parse(localStorage.getItem('dwellium-hidden-widgets') || '[]')).toContain('terminal');
    });

    it('does not duplicate a widget already hidden', () => {
        hideWidget('wiki');
        hideWidget('wiki');
        expect(hiddenWidgetsStore.getSnapshot().filter(c => c === 'wiki')).toHaveLength(1);
    });

    it('un-hides a widget (re-adds it)', () => {
        hideWidget('scribe');
        hideWidget('inbox');
        unhideWidget('scribe');
        const snap = hiddenWidgetsStore.getSnapshot();
        expect(snap).not.toContain('scribe');
        expect(snap).toContain('inbox');
    });

    it('notifies subscribers on change', () => {
        let hits = 0;
        const unsub = hiddenWidgetsStore.subscribe(() => { hits++; });
        hideWidget('hydra-ai');
        unhideWidget('hydra-ai');
        unsub();
        expect(hits).toBeGreaterThanOrEqual(2);
    });
});
