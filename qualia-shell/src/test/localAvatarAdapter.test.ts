import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalPhotoAvatarAdapter } from '../components/AvatarHarness/LocalPhotoAvatarAdapter';
import type { AvatarProfile } from '../lib/avatarProfilesStore';

// ── Fake FaceLandmarker module (substituted for the real CDN ESM module via
// LocalPhotoAvatarAdapter's constructor-injectable `loadVisionModule` param
// — jsdom has no dynamic import() of remote URLs, and ESM live-bindings
// don't let external test code intercept a same-module function call, so
// constructor injection is the adapter's actual test seam). 478 fake
// landmarks (MediaPipe's face mesh point count) so every index this adapter
// reads (up to 477 for iris points) resolves to a real point instead of
// undefined. ─────────────────────────────────────────────────────────────
function buildFakeLandmarks(): Array<{ x: number; y: number; z: number }> {
    const points = [];
    for (let i = 0; i < 478; i++) {
        // Spread points around the unit square so ring-center math produces
        // distinct non-zero coordinates per region.
        points.push({ x: 0.3 + (i % 50) * 0.005, y: 0.3 + Math.floor(i / 50) * 0.02, z: 0 });
    }
    return points;
}

let fakeDetectShouldReturnFace = true;

/** Builds a fake CDN-module loader matching the shape `detectLandmarksOnce()` expects. */
function makeFakeVisionLoader(): (url: string) => Promise<any> {
    return vi.fn(async () => ({
        FaceLandmarker: {
            createFromOptions: vi.fn(async () => ({
                detect: vi.fn(() => ({
                    faceLandmarks: fakeDetectShouldReturnFace ? [buildFakeLandmarks()] : [],
                })),
                close: vi.fn(),
            })),
        },
        FilesetResolver: {
            forVisionTasks: vi.fn(async () => ({})),
        },
    }));
}

// ── Canvas 2D context stub — jsdom's HTMLCanvasElement.getContext('2d')
// returns null by default (no `canvas` npm package installed, and the plan
// forbids adding one). Stub every method/property the adapter calls. ──────
function makeFakeCtx(): CanvasRenderingContext2D {
    const ctx: any = {
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        clip: vi.fn(),
        arc: vi.fn(),
        fillRect: vi.fn(),
        filter: 'none',
    };
    return ctx as CanvasRenderingContext2D;
}

function makeFakeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = makeFakeCtx();
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as any);
    return canvas;
}

function makeProfile(overrides: Partial<AvatarProfile> = {}): AvatarProfile {
    return {
        avatarId: null,
        voiceId: null,
        systemPrompt: null,
        displayName: 'Test Agent',
        provider: 'local',
        photoDataUrl: 'data:image/jpeg;base64,AAAA',
        browserVoiceURI: null,
        updatedAt: Date.now(),
        ...overrides,
    };
}

describe('LocalPhotoAvatarAdapter (plan 042 — keyless local photo-avatar provider)', () => {
    let rafCallbacks: Array<(t: number) => void> = [];
    let rafHandle = 0;
    let originalImage: typeof Image;

    beforeEach(() => {
        fakeDetectShouldReturnFace = true;
        rafCallbacks = [];
        rafHandle = 0;

        vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
            rafCallbacks.push(cb);
            return ++rafHandle;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        // Fake Image — resolves onload on the next microtask so `connect()`'s
        // `await loadImageElement(...)` settles deterministically.
        originalImage = globalThis.Image;
        class FakeImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            naturalWidth = 400;
            naturalHeight = 400;
            width = 400;
            height = 400;
            private _src = '';
            get src() { return this._src; }
            set src(value: string) {
                this._src = value;
                queueMicrotask(() => this.onload?.());
            }
        }
        // @ts-expect-error — test double, not a full HTMLImageElement.
        globalThis.Image = FakeImage;

        // Fake speechSynthesis + SpeechSynthesisUtterance.
        class FakeSpeechSynthesisUtterance {
            text: string;
            rate = 1;
            voice: any = null;
            onboundary: (() => void) | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            constructor(text: string) {
                this.text = text;
            }
        }
        // @ts-expect-error — test double.
        globalThis.SpeechSynthesisUtterance = FakeSpeechSynthesisUtterance;

        const speak = vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
            // Simulate one boundary event then completion, on microtask
            // ticks so talk()'s promise resolves asynchronously like the
            // real Web Speech API.
            queueMicrotask(() => {
                utterance.onboundary?.();
                queueMicrotask(() => utterance.onend?.());
            });
        });
        const cancel = vi.fn();
        const getVoices = vi.fn(() => []);
        Object.defineProperty(globalThis, 'speechSynthesis', {
            configurable: true,
            value: { speak, cancel, getVoices, addEventListener: vi.fn(), removeEventListener: vi.fn() },
        });
    });

    afterEach(() => {
        globalThis.Image = originalImage;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('connect() resolves with cached landmarks and starts the rAF loop', async () => {
        const adapter = new LocalPhotoAvatarAdapter(makeFakeVisionLoader());
        const canvas = makeFakeCanvas();
        const states: string[] = [];
        adapter.onStateChange((s) => states.push(s));

        await adapter.connect(makeProfile(), canvas);

        expect(states).toContain('connecting');
        expect(states).toContain('connected');
        expect(rafCallbacks.length).toBeGreaterThan(0);

        await adapter.disconnect();
    });

    it('emits an error (never a degraded no-landmark blob) when FaceLandmarker detects no face', async () => {
        fakeDetectShouldReturnFace = false;
        const adapter = new LocalPhotoAvatarAdapter(makeFakeVisionLoader());
        const canvas = makeFakeCanvas();
        const states: Array<{ s: string; d?: string }> = [];
        adapter.onStateChange((s, d) => states.push({ s, d }));

        await adapter.connect(makeProfile(), canvas);

        expect(states.some((e) => e.s === 'error')).toBe(true);
        // No rAF loop should have started for a failed landmark detection.
        expect(rafCallbacks.length).toBe(0);

        await adapter.disconnect();
    });

    it('emits an error (rather than throwing) when the CDN module loader itself fails', async () => {
        const failingLoader = vi.fn(async () => {
            throw new Error('network error');
        });
        const adapter = new LocalPhotoAvatarAdapter(failingLoader);
        const canvas = makeFakeCanvas();
        const states: Array<{ s: string; d?: string }> = [];
        adapter.onStateChange((s, d) => states.push({ s, d }));

        await expect(adapter.connect(makeProfile(), canvas)).resolves.toBeUndefined();
        expect(states.some((e) => e.s === 'error')).toBe(true);

        await adapter.disconnect();
    });

    it('emits an error when the profile has no photoDataUrl', async () => {
        const adapter = new LocalPhotoAvatarAdapter(makeFakeVisionLoader());
        const canvas = makeFakeCanvas();
        const states: Array<{ s: string; d?: string }> = [];
        adapter.onStateChange((s, d) => states.push({ s, d }));

        await adapter.connect(makeProfile({ photoDataUrl: null }), canvas);

        expect(states.some((e) => e.s === 'error')).toBe(true);
    });

    it('talk() speaks via mocked speechSynthesis and drives the envelope above 0 during the utterance', async () => {
        const adapter = new LocalPhotoAvatarAdapter(makeFakeVisionLoader());
        const canvas = makeFakeCanvas();
        await adapter.connect(makeProfile(), canvas);

        const talkPromise = adapter.talk('hello world');

        // Drain the rAF queue to render at least one frame while speaking —
        // envelope math runs inside the private renderFrame(), so we assert
        // indirectly via the mocked ctx.drawImage call count growing (idle-
        // life frames always draw once for the base image; a speaking frame
        // draws an EXTRA pass for the mouth-warp clip).
        const ctx = canvas.getContext('2d') as any;
        rafCallbacks.slice().forEach((cb) => cb(performance.now()));
        const drawCallsBeforeBoundary = ctx.drawImage.mock.calls.length;
        // Let the queued microtasks (onboundary) run before rendering again.
        await Promise.resolve();
        await Promise.resolve();
        rafCallbacks.slice().forEach((cb) => cb(performance.now() + 16));

        expect(ctx.drawImage.mock.calls.length).toBeGreaterThan(drawCallsBeforeBoundary);

        await talkPromise;
        await adapter.disconnect();
    });

    it('disconnect() cancels rAF, cancels speech, and stops recognition (teardown spies)', async () => {
        const cancelAnimationFrameSpy = vi.fn();
        vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);

        const adapter = new LocalPhotoAvatarAdapter(makeFakeVisionLoader());
        const canvas = makeFakeCanvas();
        await adapter.connect(makeProfile(), canvas);

        const recognitionStop = vi.fn();
        class FakeRecognition {
            continuous = false;
            interimResults = false;
            start = vi.fn();
            stop = recognitionStop;
        }
        vi.stubGlobal('SpeechRecognition', FakeRecognition);
        adapter.startListening(() => {});

        await adapter.disconnect();

        expect(cancelAnimationFrameSpy).toHaveBeenCalled();
        expect((globalThis as any).speechSynthesis.cancel).toHaveBeenCalled();
        expect(recognitionStop).toHaveBeenCalled();
    });

    it('speaks the caller-provided text through the oscillator fallback when speechSynthesis is entirely unavailable', async () => {
        const originalSpeechSynthesis = (globalThis as any).speechSynthesis;
        const originalUtteranceCtor = globalThis.SpeechSynthesisUtterance;
        // Simulate a browser with no Web Speech API at all.
        delete (globalThis as any).speechSynthesis;
        // @ts-expect-error — test-only teardown of a browser global.
        delete globalThis.SpeechSynthesisUtterance;

        const adapter = new LocalPhotoAvatarAdapter(makeFakeVisionLoader());
        const canvas = makeFakeCanvas();
        await adapter.connect(makeProfile(), canvas);

        const talkPromise = adapter.talk('hi');
        await talkPromise; // resolves via the setTimeout fallback path — proves talk() doesn't hang/throw.

        await adapter.disconnect();

        (globalThis as any).speechSynthesis = originalSpeechSynthesis;
        globalThis.SpeechSynthesisUtterance = originalUtteranceCtor;
    });

    it('profile round-trip with photoDataUrl — connect() reads photoDataUrl straight from the passed profile', async () => {
        const adapter = new LocalPhotoAvatarAdapter(makeFakeVisionLoader());
        const canvas = makeFakeCanvas();
        const profile = makeProfile({ photoDataUrl: 'data:image/jpeg;base64,ZZZZ', browserVoiceURI: 'voice-x' });
        adapter.selectedVoiceURI = profile.browserVoiceURI;

        const states: string[] = [];
        adapter.onStateChange((s) => states.push(s));
        await adapter.connect(profile, canvas);

        expect(states).toContain('connected');
        expect(adapter.selectedVoiceURI).toBe('voice-x');

        await adapter.disconnect();
    });
});
