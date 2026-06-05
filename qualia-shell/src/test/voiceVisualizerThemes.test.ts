import { describe, it, expect } from 'vitest';
import {
    VISUALIZER_THEMES,
    getTheme,
    nextThemeId,
    withAlpha,
    binMagnitude,
    type VisualizerFrame,
    type VisualizerThemeId,
} from '../components/ARAConsole/voiceVisualizerThemes';

/** Minimal CanvasRenderingContext2D mock — records calls, never throws. */
function mockCtx() {
    const calls: string[] = [];
    const grad = { addColorStop: () => { calls.push('addColorStop'); } };
    const ctx: any = {
        _calls: calls,
        clearRect: () => calls.push('clearRect'),
        fillRect: () => calls.push('fillRect'),
        beginPath: () => calls.push('beginPath'),
        arc: () => calls.push('arc'),
        fill: () => calls.push('fill'),
        stroke: () => calls.push('stroke'),
        moveTo: () => calls.push('moveTo'),
        lineTo: () => calls.push('lineTo'),
        createRadialGradient: () => { calls.push('radial'); return grad; },
        createLinearGradient: () => { calls.push('linear'); return grad; },
        fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
    };
    return ctx;
}

const frame = (over: Partial<VisualizerFrame> = {}): VisualizerFrame => ({
    width: 320, height: 120, amplitude: 0.6, freq: null, time: 1000, ...over,
});

describe('voiceVisualizerThemes', () => {
    it('exposes exactly the 4 advertised templates', () => {
        const ids = VISUALIZER_THEMES.map(t => t.id);
        expect(ids).toEqual(['galaxy', 'orb', 'bars', 'waveform']);
    });

    it('getTheme falls back to the default for unknown/empty ids', () => {
        expect(getTheme('nope').id).toBe('galaxy');
        expect(getTheme(null).id).toBe('galaxy');
        expect(getTheme('orb').id).toBe('orb');
    });

    it('nextThemeId cycles through all themes and wraps', () => {
        const seen: VisualizerThemeId[] = ['galaxy'];
        let cur: VisualizerThemeId = 'galaxy';
        for (let i = 0; i < 4; i++) { cur = nextThemeId(cur); seen.push(cur); }
        expect(seen).toEqual(['galaxy', 'orb', 'bars', 'waveform', 'galaxy']);
    });

    it('withAlpha converts hex to rgba and clamps alpha', () => {
        expect(withAlpha('#D6FE51', 0.5)).toBe('rgba(214,254,81,0.5)');
        expect(withAlpha('#000000', 5)).toBe('rgba(0,0,0,1)');
        expect(withAlpha('rgba(1,2,3,0.4)', 0.5)).toBe('rgba(1,2,3,0.4)'); // pass-through
    });

    it('binMagnitude uses real freq when present, synthesizes otherwise — always 0..1', () => {
        const real = new Uint8Array([255, 128, 0, 64]);
        const m = binMagnitude(frame({ freq: real }), 0, 4);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(1);
        const synth = binMagnitude(frame({ freq: null, amplitude: 0.8 }), 14, 28);
        expect(synth).toBeGreaterThanOrEqual(0);
        expect(synth).toBeLessThanOrEqual(1);
    });

    it('every theme draws without throwing — with AND without real freq data', () => {
        const withFreq = frame({ freq: new Uint8Array(128).fill(200) });
        const noFreq = frame({ freq: null });
        for (const theme of VISUALIZER_THEMES) {
            const c1 = mockCtx();
            expect(() => theme.draw(c1 as any, withFreq)).not.toThrow();
            expect(c1._calls).toContain('clearRect');
            const c2 = mockCtx();
            expect(() => theme.draw(c2 as any, noFreq)).not.toThrow();
            expect(c2._calls).toContain('clearRect');
        }
    });
});
