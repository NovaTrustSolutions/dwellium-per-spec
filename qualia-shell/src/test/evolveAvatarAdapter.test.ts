/**
 * EvolveAvatarAdapter — realism tier over LocalPhotoAvatarAdapter.
 * Covers the seams that fail silently if broken: the TTS path choice
 * (real neural audio vs base speechSynthesis fallback), playback-state
 * lifecycle around the analyser-driven mouth, and the viseme render loop.
 * Fake-double pattern mirrors localAvatarAdapter.test.ts (constructor-
 * injected vision loader; jsdom has no canvas 2D, no Audio playback).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvolveAvatarAdapter } from '../components/AvatarHarness/EvolveAvatarAdapter';
import type { AvatarProfile } from '../lib/avatarProfilesStore';

function buildFakeLandmarks(): Array<{ x: number; y: number; z: number }> {
    const points = [];
    for (let i = 0; i < 478; i++) {
        points.push({ x: 0.3 + (i % 50) * 0.005, y: 0.3 + Math.floor(i / 50) * 0.02, z: 0 });
    }
    return points;
}

function makeFakeVisionLoader(): (url: string) => Promise<any> {
    return vi.fn(async () => ({
        FaceLandmarker: {
            createFromOptions: vi.fn(async () => ({
                detect: vi.fn(() => ({ faceLandmarks: [buildFakeLandmarks()] })),
                close: vi.fn(),
            })),
        },
        FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
    }));
}

function makeFakeCtx(): CanvasRenderingContext2D {
    const ctx: any = {
        save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(),
        translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), beginPath: vi.fn(),
        moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(),
        arc: vi.fn(), ellipse: vi.fn(), fill: vi.fn(), fillRect: vi.fn(),
        setTransform: vi.fn(), filter: 'none', fillStyle: '',
    };
    return ctx as CanvasRenderingContext2D;
}

function makeFakeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(makeFakeCtx() as any);
    return canvas;
}

function makeProfile(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
    return {
        avatarId: null, voiceId: null, systemPrompt: null, displayName: 'Evolve Test',
        provider: 'evolve', photoDataUrl: 'data:image/jpeg;base64,AAAA',
        browserVoiceURI: null, updatedAt: Date.now(), ...overrides,
    };
}

/** Fake Audio element: play() resolves; test fires ended via instance list. */
class FakeAudio {
    static instances: FakeAudio[] = [];
    src: string;
    duration = 2.5;
    ended = false;
    onloadedmetadata: (() => void) | null = null;
    onplay: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onpause: (() => void) | null = null;
    constructor(src: string) {
        this.src = src;
        FakeAudio.instances.push(this);
    }
    play(): Promise<void> {
        queueMicrotask(() => { this.onloadedmetadata?.(); this.onplay?.(); });
        return Promise.resolve();
    }
    pause(): void { this.onpause?.(); }
    finish(): void { this.ended = true; this.onended?.(); }
}

describe('EvolveAvatarAdapter (realism tier: neural TTS + analyser lipsync + visemes)', () => {
    let rafCallbacks: Array<(t: number) => void> = [];
    let originalImage: typeof Image;
    let originalAudio: typeof Audio;
    let speakSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        rafCallbacks = [];
        FakeAudio.instances = [];
        vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { rafCallbacks.push(cb); return rafCallbacks.length; });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        originalImage = globalThis.Image;
        class FakeImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            naturalWidth = 400; naturalHeight = 400; width = 400; height = 400;
            private _src = '';
            get src() { return this._src; }
            set src(v: string) { this._src = v; queueMicrotask(() => this.onload?.()); }
        }
        // @ts-expect-error test double
        globalThis.Image = FakeImage;

        originalAudio = globalThis.Audio;
        // @ts-expect-error test double
        globalThis.Audio = FakeAudio;

        class FakeUtterance {
            text: string; rate = 1; voice: any = null;
            onboundary: (() => void) | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            constructor(text: string) { this.text = text; }
        }
        // @ts-expect-error test double
        globalThis.SpeechSynthesisUtterance = FakeUtterance;
        speakSpy = vi.fn((u: any) => { queueMicrotask(() => u.onend?.()); });
        vi.stubGlobal('speechSynthesis', { speak: speakSpy, cancel: vi.fn(), getVoices: vi.fn(() => []) });

        vi.stubGlobal('URL', Object.assign(Object.create(URL), {
            createObjectURL: vi.fn(() => 'blob:fake'),
            revokeObjectURL: vi.fn(),
        }));
    });

    afterEach(() => {
        globalThis.Image = originalImage;
        globalThis.Audio = originalAudio;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function connectAdapter(): Promise<EvolveAvatarAdapter> {
        const adapter = new EvolveAvatarAdapter(makeFakeVisionLoader());
        await adapter.connect(makeProfile(), makeFakeCanvas());
        return adapter;
    }

    it('falls back to the base speechSynthesis path when no OpenAI key is set', async () => {
        const adapter = await connectAdapter();
        adapter.openaiApiKey = null;
        await adapter.talk('Hello there.');
        expect(speakSpy).toHaveBeenCalledTimes(1);
    });

    it('falls back to speechSynthesis when the TTS fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
        const adapter = await connectAdapter();
        adapter.openaiApiKey = 'sk-test';
        await adapter.talk('Fallback please.');
        expect(speakSpy).toHaveBeenCalledTimes(1);
    });

    it('plays real neural audio (no speechSynthesis) when the key works, and clears speaking on end', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            blob: async () => new Blob(['x'], { type: 'audio/mpeg' }),
        })));
        const adapter = await connectAdapter();
        adapter.openaiApiKey = 'sk-test';

        const talkDone = adapter.talk('Real voice line.');
        // Let play() microtasks run, then finish playback.
        await new Promise(r => setTimeout(r, 0));
        expect(FakeAudio.instances).toHaveLength(1);
        expect((adapter as any).speaking).toBe(true);
        FakeAudio.instances[0].finish();
        await talkDone;
        expect((adapter as any).speaking).toBe(false);
        expect(speakSpy).not.toHaveBeenCalled();
        // Metadata refined the utterance duration from the real audio.
        expect((adapter as any).evolveDurationMs).toBe(2500);
    });

    it('renders viseme-shaped frames without throwing while speaking', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            blob: async () => new Blob(['x'], { type: 'audio/mpeg' }),
        })));
        const adapter = await connectAdapter();
        adapter.openaiApiKey = 'sk-test';
        void adapter.talk('Watch my mouth move.');
        await new Promise(r => setTimeout(r, 0));

        // Pump several rAF frames — must not throw; draws the base image.
        const ctx = (adapter as any).ctx;
        expect(rafCallbacks.length).toBeGreaterThan(0);
        for (let t = 0; t < 5; t++) rafCallbacks[rafCallbacks.length - 1](performance.now() + t * 16);
        expect(ctx.drawImage).toHaveBeenCalled();
        FakeAudio.instances[0]?.finish();
    });

    it('interrupt() pauses live audio and flushes the queue', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            blob: async () => new Blob(['x'], { type: 'audio/mpeg' }),
        })));
        const adapter = await connectAdapter();
        adapter.openaiApiKey = 'sk-test';
        const talkDone = adapter.talk('Long speech to interrupt.');
        await new Promise(r => setTimeout(r, 0));
        const audio = FakeAudio.instances[0];
        const pauseSpy = vi.spyOn(audio, 'pause');
        adapter.interrupt();
        expect(pauseSpy).toHaveBeenCalled();
        // pause → onpause → cleanup resolves the in-flight talk()
        await talkDone;
        expect((adapter as any).speaking).toBe(false);
    });
});
