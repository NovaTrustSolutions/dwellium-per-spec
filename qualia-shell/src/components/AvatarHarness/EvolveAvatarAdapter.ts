/**
 * EvolveAvatarAdapter — maximum-realism local avatar ("Evolve Avatar").
 *
 * Builds on LocalPhotoAvatarAdapter's FaceMesh landmark detection and
 * feathered-warp machinery, and evolves the three things that most decide
 * whether a talking photo reads as ALIVE:
 *
 * 1. TRUE lipsync. talk() synthesizes real neural speech (OpenAI tts-1,
 *    browser-direct with the user's own key — same pattern as ARA/Persona)
 *    and drives the mouth from a live WebAudio AnalyserNode on the actual
 *    playing audio. The mouth moves exactly when sound happens — including
 *    mid-word pauses — instead of following a synthetic oscillator.
 *    No key / fetch failure → falls back to the base speechSynthesis path.
 *
 * 2. Viseme SHAPING, not just jaw-open. A char-position estimate over the
 *    utterance selects the 17-viseme coarticulated mouth shape (Persona
 *    Studio's engine): EE spreads wide, OO rounds narrow, MBP closes.
 *    The live amplitude GATES the text-derived shape — silence closes the
 *    mouth even mid-word — and the shape's per-viseme attack rate smooths
 *    frame-to-frame so plosives snap while vowels glide. Cavity darkening
 *    and an upper-teeth hint band are composited inside the mouth clip.
 *
 * 3. Energy-driven head life. Head pose comes from layered incommensurate
 *    sines (never visibly loops) scaled by smoothed speech energy — the
 *    head is livelier while talking, calm while idle — plus a breathing
 *    scale. Blinks and gaze micro-shifts inherit from the base adapter.
 */
import {
    LocalPhotoAvatarAdapter,
    ringCenter,
    tracePath,
    FEATHER_BLUR_PX,
} from './LocalPhotoAvatarAdapter';
import {
    coarticulatedShapeAt,
    headPoseAt,
    VISEME_SHAPES,
    type VisemeShape,
} from '../PersonaStudio/personaFaceEngine';

const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

export class EvolveAvatarAdapter extends LocalPhotoAvatarAdapter {
    /** Set by AvatarHarness before talk() — user's own key from the integrations vault. */
    openaiApiKey: string | null = null;
    /** OpenAI TTS voice. 'nova' is the warmest of the six for a face. */
    openaiVoice = 'nova';

    private audioCtx: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private amplitudeBuf: Uint8Array | null = null;
    private currentAudio: HTMLAudioElement | null = null;
    private currentObjectUrl: string | null = null;

    // Current-utterance alignment state for viseme selection.
    private evolveText = '';
    private evolveStartedAt = 0;
    private evolveDurationMs = 0;

    // Frame-smoothed animation state.
    private smoothedShape: VisemeShape = { ...VISEME_SHAPES.rest };
    private smoothedEnergy = 0;

    /** Live RMS amplitude [0,1] from the playing TTS audio; 0 when silent. */
    private liveAmplitude(): number {
        const analyser = this.analyser;
        const buf = this.amplitudeBuf;
        if (!analyser || !buf) return 0;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
        }
        // RMS of speech sits well under full scale — ×4.5 spreads normal
        // speech across [0,1] without clipping shouts.
        return Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
    }

    /** Override: real TTS + analyser when a key exists; base path otherwise. */
    protected override async speakOne(text: string): Promise<void> {
        if (!this.openaiApiKey) return super.speakOne(text);
        try {
            const res = await fetch(OPENAI_TTS_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text.slice(0, 4000),
                    voice: this.openaiVoice,
                    response_format: 'mp3',
                }),
            });
            if (!res.ok || this.cancelled) {
                if (this.cancelled) return;
                return super.speakOne(text);
            }
            const blob = await res.blob();
            if (this.cancelled) return;
            await this.playWithAnalyser(blob, text);
        } catch {
            if (!this.cancelled) return super.speakOne(text);
        }
    }

    private playWithAnalyser(blob: Blob, text: string): Promise<void> {
        return new Promise<void>((resolve) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            this.currentAudio = audio;
            this.currentObjectUrl = url;

            try {
                // One AudioContext for the adapter's lifetime; a fresh source
                // node per audio element (an element can only be tapped once).
                if (!this.audioCtx) {
                    const Ctor: typeof AudioContext | undefined =
                        window.AudioContext || (window as any).webkitAudioContext;
                    if (Ctor) this.audioCtx = new Ctor();
                }
                if (this.audioCtx) {
                    const source = this.audioCtx.createMediaElementSource(audio);
                    const analyser = this.audioCtx.createAnalyser();
                    analyser.fftSize = 512; // small window → responsive mouth
                    source.connect(analyser);
                    analyser.connect(this.audioCtx.destination);
                    this.analyser = analyser;
                    this.amplitudeBuf = new Uint8Array(analyser.fftSize);
                    void this.audioCtx.resume().catch(() => { /* autoplay policy — resume on next gesture */ });
                }
            } catch {
                // Analyser wiring failed — audio still plays; the viseme
                // envelope falls back to the time-position estimate alone.
                this.analyser = null;
                this.amplitudeBuf = null;
            }

            this.evolveText = text;
            this.evolveDurationMs = Math.max(600, text.length * 55); // refined below
            this.speaking = true;

            const cleanup = () => {
                this.speaking = false;
                this.currentAudio = null;
                if (this.currentObjectUrl) {
                    URL.revokeObjectURL(this.currentObjectUrl);
                    this.currentObjectUrl = null;
                }
                resolve();
            };
            audio.onloadedmetadata = () => {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    this.evolveDurationMs = audio.duration * 1000;
                }
            };
            audio.onplay = () => { this.evolveStartedAt = performance.now(); };
            audio.onended = cleanup;
            audio.onerror = cleanup;
            // interrupt()/disconnect() pause the element; without this the
            // in-flight talk() promise never settles and the queue jams.
            audio.onpause = () => { if (!audio.ended) cleanup(); };
            this.evolveStartedAt = performance.now();
            audio.play().catch(cleanup);
        });
    }

    /** Override: viseme-shaped mouth + energy-driven head pose. */
    protected override renderFrame(now: number): void {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const img = this.image;
        const landmarks = this.landmarks;
        if (!ctx || !canvas || !img || !landmarks) return;

        const w = canvas.width;
        const h = canvas.height;

        const blinkAmount = this.computeBlinkAmount(now);
        const gaze = this.computeGazeShift(now);

        // ── Energy + target mouth shape for this frame ──
        const usingRealAudio = this.speaking && this.currentAudio !== null;
        const amp = usingRealAudio ? this.liveAmplitude() : 0;
        // Fast attack, slower release — mouths open quicker than they settle.
        const energyRate = amp > this.smoothedEnergy ? 0.55 : 0.18;
        this.smoothedEnergy += (amp - this.smoothedEnergy) * energyRate;

        let target: VisemeShape = VISEME_SHAPES.rest;
        if (usingRealAudio && this.evolveText) {
            const elapsed = now - this.evolveStartedAt;
            const progress = Math.max(0, Math.min(0.999, elapsed / this.evolveDurationMs));
            const charIdx = Math.floor(progress * this.evolveText.length);
            const shape = coarticulatedShapeAt(this.evolveText, charIdx);
            // Amplitude gates the text-derived shape: floor keeps consonant
            // detail visible, silence still closes the mouth.
            const gate = 0.25 + 0.75 * this.smoothedEnergy;
            target = {
                open: shape.open * gate,
                width: 1 + (shape.width - 1) * gate,
                cavity: shape.cavity * gate,
                teeth: shape.teeth * gate,
                rate: shape.rate,
            };
        } else if (this.speaking) {
            // Base speechSynthesis path (no analyser): reuse the base
            // envelope oscillator, mapped onto a generic vowel shape.
            this.envelope = this.computeEnvelope(now);
            target = {
                open: this.envelope * 0.7,
                width: 1,
                cavity: this.envelope * 0.6,
                teeth: this.envelope * 0.2,
                rate: 0.35,
            };
        }

        // Per-viseme attack rate smooths the shape frame-to-frame.
        const k = Math.min(1, target.rate * 1.6);
        const sm = this.smoothedShape;
        sm.open += (target.open - sm.open) * k;
        sm.width += (target.width - sm.width) * k;
        sm.cavity += (target.cavity - sm.cavity) * k;
        sm.teeth += (target.teeth - sm.teeth) * k;

        // ── Head pose: layered sines scaled by speech energy + breathing ──
        const pose = headPoseAt(now, this.smoothedEnergy);

        ctx.save();
        ctx.clearRect(0, 0, w, h);

        const center = ringCenter(landmarks.faceOval.length ? landmarks.faceOval : [{ x: w / 2, y: h / 2 }]);
        ctx.translate(center.x + pose.dx * w, center.y + pose.dy * h);
        ctx.rotate(pose.rot);
        ctx.scale(pose.scale, pose.scale);
        ctx.translate(-center.x, -center.y);
        ctx.drawImage(img, 0, 0, w, h);

        if (blinkAmount > 0.01) {
            this.warpRegionVerticalSquash(ctx, img, landmarks.leftEye, blinkAmount, w, h);
            this.warpRegionVerticalSquash(ctx, img, landmarks.rightEye, blinkAmount, w, h);
        }
        if (Math.abs(gaze.dx) > 0.01 || Math.abs(gaze.dy) > 0.01) {
            this.warpIrisShift(ctx, img, landmarks.leftIris, gaze.dx, gaze.dy, w, h);
            this.warpIrisShift(ctx, img, landmarks.rightIris, gaze.dx, gaze.dy, w, h);
        }
        if (sm.open > 0.015 || Math.abs(sm.width - 1) > 0.015) {
            this.warpMouthViseme(ctx, img, landmarks.mouth, sm, w, h);
        }

        ctx.restore();
    }

    /** Viseme-shaped mouth warp: open + width + cavity shading + teeth hint. */
    private warpMouthViseme(
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        ring: { x: number; y: number }[],
        shape: VisemeShape,
        w: number,
        h: number,
    ): void {
        if (ring.length === 0) return;
        const center = ringCenter(ring);
        const mouthW = Math.max(...ring.map(p => p.x)) - Math.min(...ring.map(p => p.x));
        const mouthH = Math.max(...ring.map(p => p.y)) - Math.min(...ring.map(p => p.y));

        ctx.save();
        ctx.filter = `blur(${FEATHER_BLUR_PX}px)`;
        tracePath(ctx, ring);
        ctx.clip();

        // Geometry: jaw-open vertical stretch anchored at the UPPER lip (the
        // jaw drops; the upper lip barely moves), viseme width horizontally.
        const anchorY = center.y - mouthH * 0.35;
        ctx.translate(center.x, anchorY);
        ctx.scale(shape.width, 1 + shape.open * 0.6);
        ctx.translate(-center.x, -anchorY);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // overlays draw in screen space (still clipped)

        // Inner-mouth cavity: soft dark ellipse where the aperture opens.
        if (shape.cavity > 0.03 && shape.open > 0.05) {
            ctx.fillStyle = `rgba(20, 8, 10, ${(shape.cavity * 0.55).toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(
                center.x,
                center.y + mouthH * shape.open * 0.35,
                (mouthW * 0.32) * shape.width,
                Math.max(1.5, mouthH * 0.42 * shape.open),
                0, 0, Math.PI * 2,
            );
            ctx.fill();
        }
        // Upper-teeth hint: faint light band just under the upper lip.
        if (shape.teeth > 0.05 && shape.open > 0.08) {
            ctx.fillStyle = `rgba(238, 232, 224, ${(shape.teeth * 0.30).toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(
                center.x,
                center.y - mouthH * 0.12,
                mouthW * 0.26 * shape.width,
                Math.max(1, mouthH * 0.10),
                0, 0, Math.PI * 2,
            );
            ctx.fill();
        }
        ctx.restore();
    }

    override interrupt(): void {
        if (this.currentAudio) {
            try { this.currentAudio.pause(); } catch { /* non-fatal */ }
            this.currentAudio = null;
        }
        super.interrupt();
    }

    override async disconnect(): Promise<void> {
        if (this.currentAudio) {
            try { this.currentAudio.pause(); } catch { /* non-fatal */ }
            this.currentAudio = null;
        }
        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
            this.currentObjectUrl = null;
        }
        this.analyser = null;
        this.amplitudeBuf = null;
        if (this.audioCtx) {
            try { await this.audioCtx.close(); } catch { /* already closed */ }
            this.audioCtx = null;
        }
        await super.disconnect();
    }
}

export default EvolveAvatarAdapter;
