import { describe, it, expect, beforeEach } from 'vitest';
import { parseCommand, resolveWidget, findSpace } from '../lib/dwelliumCommands';
import { spacesStore } from '../lib/spacesStore';

beforeEach(() => {
    spacesStore.reset();
    localStorage.clear();
});

describe('parseCommand (talk-to-customize)', () => {
    it('parses theme commands', () => {
        expect(parseCommand('theme tokyo night')?.label).toMatch(/Theme/);
        expect(parseCommand('dark mode')?.label).toMatch(/dark/i);
        expect(parseCommand('switch theme to nord')?.label).toMatch(/nord/);
    });
    it('parses accent commands', () => {
        expect(parseCommand('make accent teal')?.label).toMatch(/Accent/);
        expect(parseCommand('set the accent color to #ff0000')?.label).toMatch(/Accent/);
    });
    it('parses animation toggles', () => {
        expect(parseCommand('turn animations off')?.label).toMatch(/Animations off/);
        expect(parseCommand('animations on')?.label).toMatch(/Animations on/);
    });
    it('parses save space', () => {
        expect(parseCommand('save space Morning')?.label).toMatch(/Save Space/);
    });
    it('parses switch-space for a known Space only', () => {
        expect(parseCommand('switch to research')?.label).toMatch(/Switch to research/);
        expect(parseCommand('go to comms')?.label).toMatch(/Switch to comms/);
        expect(parseCommand('switch to nonexistent')).toBeNull();
    });
    it('parses open-widget for known aliases', () => {
        expect(parseCommand('open strata')?.label).toMatch(/Open/);
        expect(parseCommand('show inbox')?.label).toMatch(/Open/);
    });
    it('parses natural navigation phrasings (ARA "open up transcription")', () => {
        expect(parseCommand('open up transcription')?.label).toMatch(/Open transcription/i);
        expect(parseCommand('go to terminal')?.label).toMatch(/Open terminal/i);
        expect(parseCommand('pull up scribe')?.label).toMatch(/Open scribe/i);
        expect(parseCommand('show me the inbox')?.label).toMatch(/Open inbox/i);
        expect(parseCommand('navigate to files')?.label).toMatch(/Open files/i);
    });
    it('parses arrange/tile', () => {
        expect(parseCommand('tile')?.label).toMatch(/Arrange/);
        expect(parseCommand('arrange windows')?.label).toMatch(/Arrange/);
    });
    it('parses remember', () => {
        expect(parseCommand('remember that the gate code is 4821')?.label).toMatch(/Remember/);
    });
    it('returns null for non-commands', () => {
        expect(parseCommand('what is the weather today')).toBeNull();
        expect(parseCommand('')).toBeNull();
    });
});

describe('parseCommand — Conductor (placement / compound / group / window ops)', () => {
    function captureEvents(run: () => void): Array<{ name: string; detail: any }> {
        const seen: Array<{ name: string; detail: any }> = [];
        const names = ['dwellium:place-widget', 'dwellium:open-widget', 'dwellium:apply-space', 'dwellium:close-widget', 'dwellium:minimize-widget', 'dwellium:maximize-widget'];
        const handler = (e: Event) => seen.push({ name: e.type, detail: (e as CustomEvent).detail });
        names.forEach(n => window.addEventListener(n, handler));
        run();
        names.forEach(n => window.removeEventListener(n, handler));
        return seen;
    }

    it('places a single widget into a named region', () => {
        const cmd = parseCommand('put strata on the left');
        expect(cmd?.label).toMatch(/Place/);
        const ev = captureEvents(() => cmd!.run());
        expect(ev).toContainEqual({ name: 'dwellium:place-widget', detail: { widgetId: 'strata-dashboard', regionId: 'left', layout: 'halves-h' } });
    });

    it('places MULTIPLE widgets in one sentence (the marquee example)', () => {
        const cmd = parseCommand('put strata on the left and scribe on the right');
        expect(cmd).not.toBeNull();
        const ev = captureEvents(() => cmd!.run());
        const places = ev.filter(e => e.name === 'dwellium:place-widget');
        expect(places).toHaveLength(2);
        expect(places[0].detail).toEqual({ widgetId: 'strata-dashboard', regionId: 'left', layout: 'halves-h' });
        expect(places[1].detail).toEqual({ widgetId: 'scribe', regionId: 'right', layout: 'halves-h' });
    });

    it('places into quadrants by spoken region', () => {
        const ev = captureEvents(() => parseCommand('place inbox in the bottom right')!.run());
        expect(ev[0].detail).toEqual({ widgetId: 'inbox', regionId: 'br', layout: 'quadrants' });
    });

    it('chains compound commands and does NOT mis-parse accent greedily', () => {
        const cmd = parseCommand('make accent teal and switch to research');
        expect(cmd?.label).toContain('Accent → teal');     // accent captured "teal" only
        expect(cmd?.label).toContain('Switch to research'); // second clause survived
    });

    it('groups widgets into browser-style tabs', () => {
        const cmd = parseCommand('group strata and scribe into tabs');
        expect(cmd?.label).toMatch(/Group 2/);
        const ev = captureEvents(() => cmd!.run());
        expect(ev).toContainEqual({ name: 'dwellium:apply-space', detail: { widgets: ['strata-dashboard', 'scribe'], mode: 'tabbed' } });
    });

    it('parses close / minimize / maximize a widget', () => {
        expect(parseCommand('close inbox')?.label).toMatch(/Close/);
        expect(parseCommand('minimize scribe')?.label).toMatch(/Minimize/);
        expect(parseCommand('maximize strata')?.label).toMatch(/Maximize/);
        const ev = captureEvents(() => parseCommand('close inbox')!.run());
        expect(ev).toContainEqual({ name: 'dwellium:close-widget', detail: { widgetId: 'inbox' } });
    });

    it('still parses simple single commands unchanged', () => {
        expect(parseCommand('open strata')?.label).toMatch(/Open/);
        expect(parseCommand('dark mode')?.label).toMatch(/dark/i);
    });

    it('opens the Agent Lab for spawn-team / agents commands', () => {
        const ev = captureEvents(() => parseCommand('spawn a research team')!.run());
        expect(ev).toContainEqual({ name: 'dwellium:open-widget', detail: { widgetId: 'agent-lab' } });
        expect(parseCommand('assemble a crew of agents')?.label).toMatch(/Agent Lab/);
        expect(parseCommand('open agent lab')?.label).toMatch(/Open/);
    });
});

describe('resolveWidget', () => {
    it('maps aliases to component ids', () => {
        expect(resolveWidget('strata')).toBe('strata-dashboard');
        expect(resolveWidget('the scribe')).toBe('scribe');
        expect(resolveWidget('inbox zero')).toBe('inbox');
        expect(resolveWidget('gibberish')).toBeNull();
    });
});

describe('findSpace', () => {
    it('finds by id or name (case-insensitive)', () => {
        expect(findSpace('research')?.id).toBe('research');
        expect(findSpace('Build')?.id).toBe('build');
        expect(findSpace('nope')).toBeNull();
    });
});
