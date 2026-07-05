/**
 * LocalPhotoAvatarAdapter — keyless local photo-avatar provider (plan 042).
 *
 * Implements the shared `AvatarProviderAdapter` seam (`providerTypes.ts`)
 * with ZERO API keys: a canvas talking-head animated entirely in-browser
 * from a single uploaded photo. Brain = the user's existing `llmClient`
 * (whatever provider they already configured for Stella/ThoughtWeaver — no
 * NEW key). Voice = the browser's built-in `speechSynthesis`. Mic (optional)
 * = `SpeechRecognition` / `webkitSpeechRecognition` when available.
 *
 * Landmark technique: ONE MediaPipe FaceLandmarker IMAGE-mode pass on the
 * profile's photo at `connect()` time (cached — never re-run per frame).
 * Loaded via dynamic CDN ESM import (`@mediapipe/tasks-vision@0.10.35`),
 * mirroring `AnamAdapter`'s `import('@anam-ai/js-sdk')` dynamic-import
 * pattern — no new npm dependency, module resolution failures degrade to an
 * `'error'` state instead of throwing.
 *
 * Canvas warp technique (naturalness rule — warp the photo's OWN pixels,
 * never draw cartoon overlays): every frame, redraw the full source photo,
 * then for each active region (eyelids, mouth) `ctx.save()` → build a
 * feathered clip path from that region's landmark ring → apply a small
 * affine transform (translate/scale) confined to that clip → `ctx.restore()`.
 * "Feathered" here means the clip boundary is expanded slightly with a
 * blurred edge (via `ctx.filter = 'blur(Npx)'` applied only to the warped
 * patch composite) so the transformed patch blends into the surrounding
 * untouched photo instead of showing a hard edge — same naturalness
 * reasoning as the `eye-contact` prototype's eyelid-clip approach.
 *
 * Idle life (always running once connected, independent of speech):
 *   - Blink: every 2-6s (randomized), eyelid region vertical squash for
 *     ~120ms down + ~120ms up, feathered clip.
 *   - Head sway: whole-image ±0.6° rotation + 1-2px translate on a slow
 *     (~0.15Hz) sine — applied to the WHOLE canvas draw, not a region clip.
 *   - Gaze micro-shift: subtle iris-region nudge every 3-7s.
 *
 * Speaking (layered on top of idle life while an utterance is active):
 *   - Mouth-region warp driven by a viseme envelope in [0,1] — jaw-open
 *     vertical scale + slight width variation, feathered mouth clip.
 *   - Envelope source: `speechSynthesis` `boundary` events (per-word) drive
 *     open/close pulses; if boundary events don't fire within a grace
 *     window (some engines/voices never emit them — STOP condition #2 in
 *     the plan permits this fallback), a syllable-approximation oscillator
 *     (~9-12Hz) modulated by an amplitude envelope derived from utterance
 *     text length + elapsed time drives the mouth instead. Mouth returns to
 *     rest between utterances either way.
 *
 * Conversation loop: NOT implemented here — that's AvatarHarness's job (mic
 * -> transcript -> callLlm(profile.systemPrompt) -> adapter.talk(reply)).
 * This adapter only exposes `talk()`/`onStateChange()`/teardown, same seam
 * AnamAdapter exposes.
 *
 * Teardown: `disconnect()` cancels the rAF loop, cancels speechSynthesis,
 * releases the cached image + landmarks. Idempotent.
 */

import type { AvatarProviderAdapter, AvatarConnectionState } from './providerTypes';
import type { AvatarProfile } from '../../lib/avatarProfilesStore';

// ── Tuning constants (documented in the plan-042 completion report) ───────
const BLINK_MIN_INTERVAL_MS = 2000;
const BLINK_MAX_INTERVAL_MS = 6000;
const BLINK_CLOSE_MS = 120;
const BLINK_OPEN_MS = 120;
const SWAY_PERIOD_MS = 1000 / 0.15; // ~0.15Hz
const SWAY_ROTATION_DEG = 0.6;
const SWAY_TRANSLATE_PX = 1.5;
const GAZE_MIN_INTERVAL_MS = 3000;
const GAZE_MAX_INTERVAL_MS = 7000;
const GAZE_SHIFT_PX = 1.2;
const FEATHER_BLUR_PX = 3;
const MOUTH_OSCILLATOR_HZ = 10.5; // midpoint of the 9-12Hz syllable-approximation range
const BOUNDARY_EVENT_GRACE_MS = 600; // if no 'boundary' event fires within this window, fall back to the oscillator
const ENVELOPE_ATTACK_MS = 60;
const ENVELOPE_RELEASE_MS = 90;

// MediaPipe FaceLandmarker's 478-point face mesh — the subset of indices this
// adapter needs. Same topology the eye-contact prototype's legacy FaceMesh
// build uses for eyes; mouth ring + face-oval indices are FaceMesh-standard.
const LEFT_EYE_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_RING = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const MOUTH_RING = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

interface Point { x: number; y: number }
type LandmarkList = Array<{ x: number; y: number; z?: number }>;

interface CachedLandmarks {
    all: LandmarkList;
    leftEye: Point[];
    rightEye: Point[];
    mouth: Point[];
    faceOval: Point[];
    leftIris: Point;
    rightIris: Point;
}

/** Convert normalized [0,1] MediaPipe landmarks to pixel-space points for a given image size. */
function toPixelRing(landmarks: LandmarkList, indices: number[], width: number, height: number): Point[] {
    return indices.map((i) => {
        const lm = landmarks[i];
        return { x: (lm?.x ?? 0) * width, y: (lm?.y ?? 0) * height };
    });
}

function ringCenter(ring: Point[]): Point {
    const n = ring.length || 1;
    const sum = ring.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / n, y: sum.y / n };
}

/** Trace a closed path through a ring of points on the given context (caller does fill/clip/stroke). */
function tracePath(ctx: CanvasRenderingContext2D, ring: Point[]): void {
    if (ring.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
    ctx.closePath();
}

/** Ease-in-out cubic — used for blink + envelope attack/release curves (no linear snapping). */
function easeInOutCubic(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * Dynamically imports an ESM module from an arbitrary URL string (CDN, in
 * this adapter's case). Plain `import(someUrlVariable)` still gets
 * statically analyzed by both `tsc` (module-resolution error on a URL
 * specifier — there's no `.d.ts` for a CDN URL) and Vite (attempts to
 * pre-bundle it). Routing the specifier through `new Function` fully defers
 * resolution to the browser's native dynamic `import()` at runtime, which is
 * exactly what we want for a CDN ESM module — same reasoning `AnamAdapter`
 * documents for its own dynamic `import('@anam-ai/js-sdk')` (there it's a
 * real npm specifier so plain `import()` resolves fine; here it's a URL, so
 * this indirection is the URL-specific variant of the same "tolerate a
 * missing/unloadable module" shape).
 *
 * Exported as a plain named function so `localAvatarAdapter.test.ts` can
 * partially-mock this module with Vitest's `vi.mock(..., async (importOriginal) => ...)`
 * (spies on this export while keeping the real `LocalPhotoAvatarAdapter`
 * class) — jsdom has no native dynamic `import()` of remote URLs, and there
 * is nothing meaningful to statically mock for a bare CDN URL specifier.
 */
export function importFromUrl(url: string): Promise<any> {
    // eslint-disable-next-line no-new-func
    return new Function('u', 'return import(u)')(url);
}

/** Loads the source photo (data URL or http(s) URL) into an HTMLImageElement. */
function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load avatar photo'));
        img.src = src;
    });
}

/**
 * Talk-queue entry — utterances enqueue and play back-to-back so a rapid
 * sequence of talk() calls (e.g. streamed LLM replies split into sentences)
 * doesn't clobber the in-flight utterance.
 */
interface QueuedUtterance {
    text: string;
    resolve: () => void;
}

export class LocalPhotoAvatarAdapter implements AvatarProviderAdapter {
    private listeners: Array<(state: AvatarConnectionState, detail?: string) => void> = [];
    private cancelled = false;

    /**
     * The CDN module loader, injectable via the constructor — defaults to
     * the real `importFromUrl` (browser dynamic `import()` of the pinned
     * `@mediapipe/tasks-vision` CDN URL). `localAvatarAdapter.test.ts`
     * passes a fake loader here instead of trying to mock a same-module
     * function call, which ESM's live-binding semantics don't let external
     * test code intercept reliably.
     */
    private readonly loadVisionModule: (url: string) => Promise<any>;

    constructor(loadVisionModule: (url: string) => Promise<any> = importFromUrl) {
        this.loadVisionModule = loadVisionModule;
    }

    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private image: HTMLImageElement | null = null;
    private landmarks: CachedLandmarks | null = null;
    private rafHandle: number | null = null;

    // Idle-life schedule state (re-randomized each cycle).
    private nextBlinkAt = 0;
    private blinkStartedAt: number | null = null;
    private nextGazeAt = 0;
    private gazeStartedAt: number | null = null;
    private gazeDx = 0;
    private gazeDy = 0;

    // Speaking-envelope state.
    private speaking = false;
    private envelope = 0; // [0,1] mouth-open amount, current frame
    private utteranceStartedAt = 0;
    private lastBoundaryAt = 0;
    private boundaryEventSeen = false;
    private utteranceTextLength = 1;
    private currentUtterance: SpeechSynthesisUtterance | null = null;
    private talkQueue: QueuedUtterance[] = [];
    private processingQueue = false;

    // Optional mic (SpeechRecognition) — exposed via startListening/stopListening
    // for AvatarHarness's conversation loop; NOT auto-started by connect().
    private recognition: any = null;
    private recognitionActive = false;

    private emit(state: AvatarConnectionState, detail?: string): void {
        for (const cb of this.listeners) {
            try { cb(state, detail); } catch { /* listener error must not break the adapter */ }
        }
    }

    onStateChange(cb: (state: AvatarConnectionState, detail?: string) => void): () => void {
        this.listeners.push(cb);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== cb);
        };
    }

    /**
     * connect(profile, canvasHost) — one-time FaceLandmarker IMAGE pass on
     * `profile.photoDataUrl`, then starts the rAF idle-life loop. Narrows the
     * shared `AvatarProviderAdapter.connect(arg1: unknown, arg2: unknown)`
     * signature — see providerTypes.ts header for why the interface itself
     * stays loosely typed.
     */
    async connect(profile: AvatarProfile | null, canvasHost: HTMLCanvasElement): Promise<void> {
        this.cancelled = false;
        this.emit('connecting');

        const photoDataUrl = profile?.photoDataUrl;
        if (!photoDataUrl) {
            this.emit('error', 'No photo uploaded yet — add one in Avatar setup.');
            return;
        }

        this.canvas = canvasHost;
        this.ctx = canvasHost.getContext('2d');
        if (!this.ctx) {
            this.emit('error', 'Canvas 2D context unavailable in this browser.');
            return;
        }

        let img: HTMLImageElement;
        try {
            img = await loadImageElement(photoDataUrl);
        } catch (err: any) {
            if (!this.cancelled) this.emit('error', err?.message || 'Failed to load avatar photo.');
            return;
        }
        if (this.cancelled) return;
        this.image = img;

        canvasHost.width = img.naturalWidth || img.width;
        canvasHost.height = img.naturalHeight || img.height;

        const landmarks = await this.detectLandmarksOnce(img);
        if (this.cancelled) return;
        if (!landmarks) {
            // Per plan STOP condition #1: do NOT ship a degraded no-landmark
            // blob. If FaceLandmarker genuinely cannot run, surface an error
            // rather than silently rendering a static/unwarped photo as if
            // it were the live avatar.
            this.emit('error', 'Could not detect a face in the uploaded photo. Try a clearer, front-facing photo.');
            return;
        }
        this.landmarks = landmarks;

        this.scheduleNextBlink();
        this.scheduleNextGaze();
        this.startRafLoop();
        this.emit('connected');
    }

    /**
     * Loads `@mediapipe/tasks-vision@0.10.35` via CDN ESM dynamic import
     * (same "dynamic import, tolerate failure" shape as AnamAdapter's
     * `import('@anam-ai/js-sdk')`) and runs ONE IMAGE-mode FaceLandmarker
     * detection pass on the given image. Returns null (never throws) on any
     * failure so the caller can emit a clean 'error' state.
     */
    private async detectLandmarksOnce(img: HTMLImageElement): Promise<CachedLandmarks | null> {
        try {
            const visionModule: any = await this.loadVisionModule(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs',
            );
            const { FaceLandmarker, FilesetResolver } = visionModule;
            if (!FaceLandmarker || !FilesetResolver) return null;

            const fileset = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
            );
            const landmarker = await FaceLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                },
                runningMode: 'IMAGE',
                numFaces: 1,
            });

            const result = landmarker.detect(img);
            const faceLandmarks: LandmarkList | undefined = result?.faceLandmarks?.[0];
            landmarker.close?.();
            if (!faceLandmarks || faceLandmarks.length === 0) return null;

            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            const leftIrisRing = toPixelRing(faceLandmarks, LEFT_IRIS, width, height);
            const rightIrisRing = toPixelRing(faceLandmarks, RIGHT_IRIS, width, height);

            return {
                all: faceLandmarks,
                leftEye: toPixelRing(faceLandmarks, LEFT_EYE_RING, width, height),
                rightEye: toPixelRing(faceLandmarks, RIGHT_EYE_RING, width, height),
                mouth: toPixelRing(faceLandmarks, MOUTH_RING, width, height),
                faceOval: toPixelRing(faceLandmarks, FACE_OVAL, width, height),
                leftIris: leftIrisRing.length ? ringCenter(leftIrisRing) : { x: 0, y: 0 },
                rightIris: rightIrisRing.length ? ringCenter(rightIrisRing) : { x: 0, y: 0 },
            };
        } catch {
            return null;
        }
    }

    // ── Idle-life scheduling ──────────────────────────────────────────────

    private scheduleNextBlink(now = performance.now()): void {
        const delay = BLINK_MIN_INTERVAL_MS + Math.random() * (BLINK_MAX_INTERVAL_MS - BLINK_MIN_INTERVAL_MS);
        this.nextBlinkAt = now + delay;
    }

    private scheduleNextGaze(now = performance.now()): void {
        const delay = GAZE_MIN_INTERVAL_MS + Math.random() * (GAZE_MAX_INTERVAL_MS - GAZE_MIN_INTERVAL_MS);
        this.nextGazeAt = now + delay;
    }

    /** Returns [0,1] eyelid-closed amount for the current frame (0 = fully open). */
    private computeBlinkAmount(now: number): number {
        if (this.blinkStartedAt === null) {
            if (now >= this.nextBlinkAt) this.blinkStartedAt = now;
            return 0;
        }
        const elapsed = now - this.blinkStartedAt;
        if (elapsed < BLINK_CLOSE_MS) {
            return easeInOutCubic(elapsed / BLINK_CLOSE_MS);
        }
        if (elapsed < BLINK_CLOSE_MS + BLINK_OPEN_MS) {
            return easeInOutCubic(1 - (elapsed - BLINK_CLOSE_MS) / BLINK_OPEN_MS);
        }
        // Blink cycle finished — schedule the next one.
        this.blinkStartedAt = null;
        this.scheduleNextBlink(now);
        return 0;
    }

    /** Updates (and returns) the current gaze micro-shift offset in pixels. */
    private computeGazeShift(now: number): { dx: number; dy: number } {
        if (this.gazeStartedAt === null) {
            if (now >= this.nextGazeAt) {
                this.gazeStartedAt = now;
                const angle = Math.random() * Math.PI * 2;
                this.gazeDx = Math.cos(angle) * GAZE_SHIFT_PX;
                this.gazeDy = Math.sin(angle) * GAZE_SHIFT_PX * 0.6; // eyes shift less vertically
            }
            return { dx: 0, dy: 0 };
        }
        const elapsed = now - this.gazeStartedAt;
        const holdMs = 900;
        if (elapsed >= holdMs) {
            this.gazeStartedAt = null;
            this.scheduleNextGaze(now);
            return { dx: 0, dy: 0 };
        }
        const amt = Math.sin((elapsed / holdMs) * Math.PI); // ramps in and out smoothly
        return { dx: this.gazeDx * amt, dy: this.gazeDy * amt };
    }

    // ── Speaking envelope ───────────────────────────────────────────────────

    /** Updates `this.envelope` for the current frame based on active speech state. */
    private computeEnvelope(now: number): number {
        if (!this.speaking) return 0;

        const elapsedSinceBoundary = now - this.lastBoundaryAt;
        const elapsedSinceStart = now - this.utteranceStartedAt;
        const useBoundaryDriven = this.boundaryEventSeen && elapsedSinceBoundary < 400;

        if (useBoundaryDriven) {
            // Pulse: attack right after a boundary event, release afterward.
            const t = elapsedSinceBoundary;
            if (t < ENVELOPE_ATTACK_MS) return easeInOutCubic(t / ENVELOPE_ATTACK_MS);
            const releaseT = (t - ENVELOPE_ATTACK_MS) / ENVELOPE_RELEASE_MS;
            return Math.max(0, 1 - easeInOutCubic(releaseT));
        }

        if (!this.boundaryEventSeen && elapsedSinceStart < BOUNDARY_EVENT_GRACE_MS) {
            // Still within the grace window — no boundary event yet, but it
            // might still arrive. Stay quiet rather than guessing.
            return 0;
        }

        // Fallback: syllable-approximation oscillator, amplitude-shaped by an
        // estimated utterance duration from text length (documented fallback
        // per plan STOP condition #2).
        const estimatedDurationMs = Math.max(600, this.utteranceTextLength * 60);
        if (elapsedSinceStart > estimatedDurationMs) return 0;
        const oscillator = (Math.sin(2 * Math.PI * MOUTH_OSCILLATOR_HZ * (elapsedSinceStart / 1000)) + 1) / 2;
        // Fade the oscillator in/out over the estimated duration so the mouth
        // doesn't snap open/closed at utterance boundaries.
        const fadeIn = Math.min(1, elapsedSinceStart / ENVELOPE_ATTACK_MS);
        const fadeOut = Math.min(1, (estimatedDurationMs - elapsedSinceStart) / ENVELOPE_RELEASE_MS);
        return oscillator * Math.min(fadeIn, fadeOut);
    }

    // ── rAF render loop ──────────────────────────────────────────────────

    private startRafLoop(): void {
        const frame = (now: number) => {
            if (this.cancelled) return;
            this.renderFrame(now);
            this.rafHandle = requestAnimationFrame(frame);
        };
        this.rafHandle = requestAnimationFrame(frame);
    }

    private renderFrame(now: number): void {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const img = this.image;
        const landmarks = this.landmarks;
        if (!ctx || !canvas || !img || !landmarks) return;

        const w = canvas.width;
        const h = canvas.height;

        const blinkAmount = this.computeBlinkAmount(now);
        const gaze = this.computeGazeShift(now);
        this.envelope = this.computeEnvelope(now);

        const swayAngleRad = (SWAY_ROTATION_DEG * Math.PI / 180) * Math.sin((now / SWAY_PERIOD_MS) * 2 * Math.PI);
        const swayX = SWAY_TRANSLATE_PX * Math.sin((now / SWAY_PERIOD_MS) * 2 * Math.PI + 1.0);
        const swayY = SWAY_TRANSLATE_PX * 0.5 * Math.cos((now / SWAY_PERIOD_MS) * 2 * Math.PI);

        ctx.save();
        ctx.clearRect(0, 0, w, h);

        // Whole-image breathing/head-sway transform — rotate/translate around
        // the face-oval center so the sway reads as a head movement, not a
        // frame pan.
        const center = ringCenter(landmarks.faceOval.length ? landmarks.faceOval : [{ x: w / 2, y: h / 2 }]);
        ctx.translate(center.x + swayX, center.y + swayY);
        ctx.rotate(swayAngleRad);
        ctx.translate(-center.x, -center.y);
        ctx.drawImage(img, 0, 0, w, h);

        // Eyelid warp (blink) — feathered clip, vertical squash toward the
        // eye's own vertical center so it reads as an eyelid closing, not a
        // stretch.
        if (blinkAmount > 0.01) {
            this.warpRegionVerticalSquash(ctx, img, landmarks.leftEye, blinkAmount, w, h);
            this.warpRegionVerticalSquash(ctx, img, landmarks.rightEye, blinkAmount, w, h);
        }

        // Gaze micro-shift — nudge the iris regions only.
        if (Math.abs(gaze.dx) > 0.01 || Math.abs(gaze.dy) > 0.01) {
            this.warpIrisShift(ctx, img, landmarks.leftIris, gaze.dx, gaze.dy, w, h);
            this.warpIrisShift(ctx, img, landmarks.rightIris, gaze.dx, gaze.dy, w, h);
        }

        // Mouth warp — jaw-open scale driven by the speaking envelope.
        if (this.envelope > 0.01) {
            this.warpMouth(ctx, img, landmarks.mouth, this.envelope, w, h);
        }

        ctx.restore();
    }

    /** Feathered-clip vertical squash of a region (used for eyelid blinks). */
    private warpRegionVerticalSquash(
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        ring: Point[],
        amount: number,
        w: number,
        h: number,
    ): void {
        if (ring.length === 0) return;
        const center = ringCenter(ring);
        ctx.save();
        ctx.filter = `blur(${FEATHER_BLUR_PX}px)`;
        tracePath(ctx, ring);
        ctx.clip();
        ctx.translate(center.x, center.y);
        // Squash toward the horizontal midline of the eye — closing the lid,
        // not shrinking the whole eye region.
        ctx.scale(1, 1 - amount * 0.85);
        ctx.translate(-center.x, -center.y);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
    }

    /** Subtle iris-region translate (gaze micro-shift). */
    private warpIrisShift(
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        irisCenter: Point,
        dx: number,
        dy: number,
        w: number,
        h: number,
    ): void {
        if (!irisCenter) return;
        const radius = Math.max(4, w * 0.02);
        ctx.save();
        ctx.filter = `blur(${FEATHER_BLUR_PX}px)`;
        ctx.beginPath();
        ctx.arc(irisCenter.x, irisCenter.y, radius * 1.4, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.translate(dx, dy);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
    }

    /** Feathered-clip jaw-open warp of the mouth region, driven by the envelope. */
    private warpMouth(
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        ring: Point[],
        envelope: number,
        w: number,
        h: number,
    ): void {
        if (ring.length === 0) return;
        const center = ringCenter(ring);
        ctx.save();
        ctx.filter = `blur(${FEATHER_BLUR_PX}px)`;
        tracePath(ctx, ring);
        ctx.clip();
        ctx.translate(center.x, center.y);
        // Jaw-open = vertical stretch; slight width narrowing reads as a
        // natural mouth-open motion rather than a pure vertical smear.
        const verticalScale = 1 + envelope * 0.55;
        const horizontalScale = 1 - envelope * 0.08;
        ctx.scale(horizontalScale, verticalScale);
        ctx.translate(-center.x, -center.y);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
    }

    // ── Speech (talk queue) ────────────────────────────────────────────────

    async talk(content: string): Promise<void> {
        if (!content || this.cancelled) return;
        return new Promise<void>((resolve) => {
            this.talkQueue.push({ text: content, resolve });
            void this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.processingQueue) return;
        this.processingQueue = true;
        try {
            while (this.talkQueue.length > 0 && !this.cancelled) {
                const next = this.talkQueue.shift()!;
                await this.speakOne(next.text);
                next.resolve();
            }
        } finally {
            this.processingQueue = false;
        }
    }

    private speakOne(text: string): Promise<void> {
        return new Promise<void>((resolve) => {
            if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
                // No speechSynthesis available — still animate via the
                // oscillator fallback for an estimated duration so the
                // avatar doesn't sit frozen.
                this.speaking = true;
                this.utteranceStartedAt = performance.now();
                this.lastBoundaryAt = 0;
                this.boundaryEventSeen = false;
                this.utteranceTextLength = text.length;
                const estimatedMs = Math.max(600, text.length * 60);
                setTimeout(() => {
                    this.speaking = false;
                    resolve();
                }, estimatedMs);
                return;
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            const profileVoiceURI = this.selectedVoiceURI;
            if (profileVoiceURI) {
                const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === profileVoiceURI);
                if (voice) utterance.voice = voice;
            }

            this.currentUtterance = utterance;
            this.speaking = true;
            this.utteranceStartedAt = performance.now();
            this.lastBoundaryAt = 0;
            this.boundaryEventSeen = false;
            this.utteranceTextLength = text.length;

            utterance.onboundary = () => {
                this.boundaryEventSeen = true;
                this.lastBoundaryAt = performance.now();
            };
            const finish = () => {
                this.speaking = false;
                this.currentUtterance = null;
                resolve();
            };
            utterance.onend = finish;
            utterance.onerror = finish;

            window.speechSynthesis.speak(utterance);
        });
    }

    /** Set by AvatarHarness/SetupPanel before talk() calls; profile-driven voice selection. */
    selectedVoiceURI: string | null = null;

    // ── Mute / interrupt (mic + speech barge-in) ──────────────────────────

    mute(muted: boolean): void {
        if (muted) {
            this.stopListening();
        }
    }

    interrupt(): void {
        try { window.speechSynthesis?.cancel(); } catch { /* non-fatal */ }
        this.talkQueue = [];
        this.speaking = false;
        this.currentUtterance = null;
    }

    // ── Optional mic (SpeechRecognition) — used by AvatarHarness's conversation loop ──

    startListening(onResult: (transcript: string) => void): boolean {
        if (this.recognitionActive) return true;
        const SpeechRecognitionCtor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) return false;

        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event: any) => {
            const transcript = event?.results?.[0]?.[0]?.transcript;
            if (typeof transcript === 'string' && transcript.trim()) onResult(transcript.trim());
        };
        recognition.onend = () => {
            this.recognitionActive = false;
        };
        recognition.onerror = () => {
            this.recognitionActive = false;
        };
        try {
            recognition.start();
            this.recognition = recognition;
            this.recognitionActive = true;
            return true;
        } catch {
            return false;
        }
    }

    stopListening(): void {
        if (this.recognition) {
            try { this.recognition.stop?.(); } catch { /* non-fatal */ }
        }
        this.recognition = null;
        this.recognitionActive = false;
    }

    // ── Teardown ────────────────────────────────────────────────────────

    async disconnect(): Promise<void> {
        this.cancelled = true;
        if (this.rafHandle !== null) {
            cancelAnimationFrame(this.rafHandle);
            this.rafHandle = null;
        }
        try { window.speechSynthesis?.cancel(); } catch { /* non-fatal */ }
        this.talkQueue = [];
        this.speaking = false;
        this.currentUtterance = null;
        this.stopListening();
        this.image = null;
        this.landmarks = null;
        this.canvas = null;
        this.ctx = null;
        this.emit('idle');
    }
}
