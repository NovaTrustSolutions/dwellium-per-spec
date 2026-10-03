import { describe, expect, it } from 'vitest';
import {
    TRELLO_LABEL_COLORS, contrastRatio, labelDisplayName, labelStyle, labelTextColor,
} from '../components/TrelloBoard/trelloLabelColors';

describe('TRELLO_LABEL_COLORS', () => {
    it('covers 10 base colours x (base, _dark, _light)', () => {
        expect(Object.keys(TRELLO_LABEL_COLORS)).toHaveLength(30);
    });

    it.each(Object.entries(TRELLO_LABEL_COLORS))('%s (%s) text meets WCAG AA 4.5:1', (_name, hex) => {
        expect(contrastRatio(labelTextColor(hex), hex)).toBeGreaterThanOrEqual(4.5);
    });
});

describe('contrastRatio', () => {
    it('matches known values', () => {
        expect(contrastRatio('#ffffff', '#D6FE51')).toBeCloseTo(1.16, 1);
        expect(Math.abs(contrastRatio('#ffffff', '#0079bf') - 4.68)).toBeLessThanOrEqual(0.02);
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
        expect(contrastRatio('#abcdef', '#abcdef')).toBe(1);
    });
});

describe('labelStyle', () => {
    it('known colour -> its hex and a computed text colour', () => {
        expect(labelStyle('yellow')).toEqual({ background: '#f2d600', color: '#111111' });
        expect(labelStyle('blue_dark')).toEqual({ background: '#005b8f', color: '#ffffff' });
    });

    it.each([null, undefined, '', 'chartreuse'])('%s -> neutral theme tokens', (c) => {
        expect(labelStyle(c)).toEqual({ background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' });
    });
});

describe('labelDisplayName', () => {
    it.each([
        [{ name: 'Urgent', color: 'red' }, 'Urgent'],
        [{ name: '  ', color: 'green_dark' }, 'Green (dark)'],
        [{ name: '', color: 'sky_light' }, 'Sky (light)'],
        [{ name: null, color: 'blue' }, 'Blue'],
        [{ name: null, color: null }, 'Label'],
        [{}, 'Label'],
    ])('%j -> %s', (label, expected) => {
        expect(labelDisplayName(label)).toBe(expected);
    });
});
