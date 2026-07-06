/**
 * PersonaFace — real-time talking-portrait renderer (the user's own face).
 *
 * v2 "fluidity arc": expanded 17-viseme library with digraph awareness and
 * co-articulation (lips pre-form the next sound), per-viseme attack rates
 * (plosives snap, vowels glide), upper-teeth highlights, and a
 * micro-expression layer — procedural brow flicks / gaze glances / squints /
 * smile pulses on a deterministic schedule, plus [performance cues] from the
 * LLM acted out on the face mid-utterance (smile on [smiles], nod on [nods]).
 *
 * Compositing layers per frame: base portrait → mouth cavity → teeth band →
 * feathered jaw cutout (viseme-driven drop/width/smile) → feathered brow
 * band (raise) → eyelids (blink/squint/wink) — all inside a swaying,
 * breathing head transform. Pure canvas, RAF-rate, zero network.
 *
 * SSR/test safe: all browser globals live inside effects, feature-detected.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
    VISEME_SHAPES,
    coarticulatedShapeAt,
    blendShapes,
    headPoseAt,
    blinkAmountAt,
    syntheticAmplitudeAt,
    microExpressionAt,
    combineExpressions,
    scaleExpression,
    cueExpression,
    pulseEnvelope,
    smileEnvelope,
    smileAsymmetry,
    SMILE_PULSE_MS,
    springStep,
    reactionForUserSpeech,
    backchannelNodAt,
    estimateSpeechMs,
    NEUTRAL_EXPRESSION,
    type Expression,
    type FaceRegions,
    type SpringState,
    type VisemeShape,
} from './personaFaceEngine';
import type { SpeechProgressRef, ListenStateRef } from './usePersonaCall';

export interface PersonaFaceProps {
    /** Portrait data-URL (user-owned image). */
    imageUrl: string;
    regions: FaceRegions;
    speaking: boolean;
    live: boolean;
    /** Live speech progress from usePersonaCall (char cursor + cues). */
    speechRef?: React.MutableRefObject<SpeechProgressRef>;
    /** Live user-speech state — drives the reactive listening face. */
    listenRef?: React.MutableRefObject<ListenStateRef>;
}

interface LoadedFace {
    img: HTMLImageElement;
    /** Feathered jaw-cutout layer (mouth + chin ellipse). */
    jaw: HTMLCanvasElement;
    /** Feathered brow-band cutout (both brows + lower forehead). */
    brow: HTMLCanvasElement;
    /** Sampled skin tone for procedural eyelids. */
    lidColor: string;
}

interface CuePulse {
    expr: Expression;
    at: number;
    /** Smile pulses use the long asymmetric-decay envelope. */
    smiley: boolean;
}

const REST: VisemeShape = VISEME_SHAPES.rest;

/** Build a feathered elliptical cutout of `img` centered at (cx,cy). */
function buildCutout(
    img: HTMLImageElement,
    iw: number,
    ih: number,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
): HTMLCanvasElement {
    const layer = document.createElement('canvas');
    layer.width = iw; layer.height = ih;
    const ctx = layer.getContext('2d');
    if (!ctx) return layer;
    const rMax = Math.max(rx, ry);
    const grad = ctx.createRadialGradient(cx, cy, rMax * 0.45, cx, cy, rMax);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.7, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / rMax, ry / rMax);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(img, 0, 0);
    return layer;
}

export default function PersonaFace({ imageUrl, regions, speaking, live, speechRef, listenRef }: PersonaFaceProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const faceRef = useRef<LoadedFace | null>(null);
    const shapeRef = useRef<VisemeShape>({ ...REST });
    const speakingRef = useRef(speaking);
    speakingRef.current = speaking;
    const regionsRef = useRef(regions);
    regionsRef.current = regions;

    // Cue-pulse bookkeeping (reset per utterance).
    const lastSpeechTextRef = useRef('');
    const firedCuesRef = useRef<boolean[]>([]);
    const pulsesRef = useRef<CuePulse[]>([]);
    const speechStartedAtRef = useRef(0);
    // Listening-face bookkeeping.
    const lastFragmentAtRef = useRef(0);
    const lastReactionAtRef = useRef<Record<string, number>>({});
    // Jaw inertia spring + frame clock.
    const jawRef = useRef<SpringState>({ pos: 0, vel: 0 });
    const lastFrameAtRef = useRef(0);

    const regionsKey = useMemo(() => JSON.stringify(regions), [regions]);

    // Build compositing layers when the image or regions change.
    useEffect(() => {
        if (typeof window === 'undefined' || !imageUrl) { faceRef.current = null; return; }
        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            try {
                const r = regionsRef.current;
                const iw = img.naturalWidth;
                const ih = img.naturalHeight;

                const jaw = buildCutout(
                    img, iw, ih,
                    r.mouth.x * iw,
                    (r.mouth.y + r.mouth.h * 1.2) * ih,
                    r.mouth.w * iw * 2.6,
                    r.mouth.h * ih * 4.2,
                );

                const eyeDistPx = Math.abs(r.rightEye.x - r.leftEye.x) * iw;
                const browCy = ((r.leftEye.y + r.rightEye.y) / 2 - 0.06) * ih;
                const brow = buildCutout(
                    img, iw, ih,
                    ((r.leftEye.x + r.rightEye.x) / 2) * iw,
                    browCy,
                    eyeDistPx * 1.15,
                    eyeDistPx * 0.38,
                );

                let lidColor = 'rgb(190,150,130)';
                const probe = document.createElement('canvas');
                probe.width = iw; probe.height = ih;
                const pctx = probe.getContext('2d', { willReadFrequently: true });
                if (pctx) {
                    pctx.drawImage(img, 0, 0);
                    const px = Math.round(r.leftEye.x * iw);
                    const py = Math.round(Math.min(ih - 1, (r.leftEye.y + 0.06) * ih));
                    const d = pctx.getImageData(px, py, 1, 1).data;
                    lidColor = `rgb(${d[0]},${d[1]},${d[2]})`;
                }

                faceRef.current = { img, jaw, brow, lidColor };
            } catch {
                // Canvas tainting / sandbox — fall back to plain image draw.
                const empty = document.createElement('canvas');
                faceRef.current = { img, jaw: empty, brow: empty, lidColor: 'rgb(190,150,130)' };
            }
        };
        img.src = imageUrl;
        return () => { cancelled = true; };
    }, [imageUrl, regionsKey]);

    // Render loop.
    useEffect(() => {
        if (!live || typeof requestAnimationFrame === 'undefined') return;
        let raf: number | null = null;

        const render = () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext?.('2d');
            const face = faceRef.current;
            if (canvas && ctx && face) {
                const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
                const cssW = canvas.clientWidth || 320;
                const cssH = canvas.clientHeight || 240;
                const needW = Math.round(cssW * dpr);
                const needH = Math.round(cssH * dpr);
                if (canvas.width !== needW || canvas.height !== needH) {
                    canvas.width = needW; canvas.height = needH;
                }
                const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                const dtMs = lastFrameAtRef.current > 0 ? now - lastFrameAtRef.current : 16;
                lastFrameAtRef.current = now;
                const sp = speechRef?.current;

                // ── Viseme target (co-articulated, per-viseme attack) ────
                let target: VisemeShape = REST;
                if (speakingRef.current) {
                    if (sp && sp.active && sp.charIndex >= 0 && sp.text) {
                        const drift = (Date.now() - sp.boundaryAt) / 70;
                        target = coarticulatedShapeAt(sp.text, sp.charIndex + drift);
                    } else {
                        const amp = syntheticAmplitudeAt(now);
                        target = { open: amp * 0.8, width: 1, cavity: amp * 0.7, teeth: 0.3, rate: 0.35 };
                    }
                }
                // Lips (width/cavity/teeth) ease fast; the JAW has mass —
                // a critically-damped spring lags and settles, no ringing.
                shapeRef.current = blendShapes(shapeRef.current, target, target.rate);
                jawRef.current = springStep(jawRef.current, target.open, dtMs);
                const shape = { ...shapeRef.current, open: jawRef.current.pos };

                // ── Cue pulses (the LLM's stage directions, acted out) ───
                if (sp && sp.active && sp.text) {
                    if (sp.text !== lastSpeechTextRef.current) {
                        lastSpeechTextRef.current = sp.text;
                        firedCuesRef.current = new Array(sp.cues.length).fill(false);
                        speechStartedAtRef.current = Date.now();
                    }
                    if (sp.cues.length > 0) {
                        const progress = sp.charIndex >= 0
                            ? Math.min(1, sp.charIndex / Math.max(1, sp.text.length))
                            : Math.min(1, (Date.now() - speechStartedAtRef.current) / estimateSpeechMs(sp.text, 1));
                        sp.cues.forEach((cue, k) => {
                            if (firedCuesRef.current[k]) return;
                            if (progress >= (k + 1) / (sp.cues.length + 1) - 0.001) {
                                firedCuesRef.current[k] = true;
                                const expr = cueExpression(cue);
                                if (expr) pulsesRef.current.push({ expr, at: now, smiley: expr.smile > 0.5 });
                            }
                        });
                    }
                } else if (!sp?.active) {
                    lastSpeechTextRef.current = '';
                }

                // ── Reactive listening face (user is talking RIGHT NOW) ──
                const listen = listenRef?.current;
                let backchannelNod = 0;
                if (listen?.active && !speakingRef.current) {
                    if (listen.fragmentAt !== lastFragmentAtRef.current) {
                        lastFragmentAtRef.current = listen.fragmentAt;
                        const reaction = reactionForUserSpeech(listen.fragment);
                        if (reaction) {
                            const lastAt = lastReactionAtRef.current[reaction.kind] ?? -Infinity;
                            if (now - lastAt > 2500) { // per-kind cooldown — listeners don't spam
                                lastReactionAtRef.current[reaction.kind] = now;
                                pulsesRef.current.push({ expr: reaction.expr, at: now, smiley: reaction.kind === 'smile' });
                            }
                        }
                    }
                    backchannelNod = backchannelNodAt(Date.now() - listen.speakingSince);
                }

                pulsesRef.current = pulsesRef.current.filter(p => now - p.at <= (p.smiley ? SMILE_PULSE_MS : 1000));

                // ── Expression = procedural ∨ cue pulses ∨ listening ─────
                let expr: Expression = microExpressionAt(now, speakingRef.current);
                let smileDecayAsym = 0;
                for (const p of pulsesRef.current) {
                    const env = p.smiley ? smileEnvelope(now - p.at) : pulseEnvelope(now - p.at);
                    if (env <= 0) continue;
                    expr = combineExpressions(expr, scaleExpression(p.expr, env));
                    if (p.smiley) smileDecayAsym = Math.max(smileDecayAsym, smileAsymmetry(now - p.at));
                }
                if (backchannelNod > 0) {
                    expr = combineExpressions(expr, { ...NEUTRAL_EXPRESSION, nod: backchannelNod });
                }

                const energy = speakingRef.current ? 0.9 : 0.15;
                const pose = headPoseAt(now, energy);
                const blink = blinkAmountAt(now);
                const r = regionsRef.current;

                const iw = face.img.naturalWidth;
                const ih = face.img.naturalHeight;
                const scale = Math.max(needW / iw, needH / ih);
                const dx = (needW - iw * scale) / 2;
                const dy = (needH - ih * scale) / 2;
                const fx = (x: number) => dx + x * iw * scale;
                const fy = (y: number) => dy + y * ih * scale;

                ctx.clearRect(0, 0, needW, needH);
                ctx.save();
                // Head sway + gaze glance + emphasis nod.
                ctx.translate(
                    needW / 2 + (pose.dx + expr.gaze * 0.004) * needW,
                    needH / 2 + (pose.dy + expr.nod * 0.010) * needH,
                );
                ctx.rotate(pose.rot + expr.gaze * 0.004 + expr.tilt * 0.02);
                ctx.scale(pose.scale, pose.scale);
                ctx.translate(-needW / 2, -needH / 2);

                // 1. Base portrait.
                ctx.drawImage(face.img, dx, dy, iw * scale, ih * scale);

                const mouthCx = fx(r.mouth.x);
                const mouthCy = fy(r.mouth.y);
                const mouthW = r.mouth.w * iw * scale;
                const mouthH = r.mouth.h * ih * scale;
                const smileWidth = 1 + expr.smile * 0.05;
                const lipWidth = shape.width * smileWidth;

                if (face.jaw.width > 0 && shape.open > 0.02) {
                    // 2. Mouth cavity.
                    ctx.save();
                    ctx.globalAlpha = Math.min(1, shape.cavity + 0.15);
                    ctx.fillStyle = '#160b0b';
                    ctx.beginPath();
                    ctx.ellipse(
                        mouthCx,
                        mouthCy + mouthH * shape.open * 0.9,
                        mouthW * lipWidth,
                        mouthH * (0.4 + shape.open * 1.6),
                        0, 0, Math.PI * 2,
                    );
                    ctx.fill();
                    ctx.restore();

                    // 3. Upper-teeth band (EE / SS / DD shapes show teeth).
                    if (shape.teeth > 0.05) {
                        ctx.save();
                        ctx.globalAlpha = shape.teeth * 0.8 * Math.min(1, shape.open * 3);
                        ctx.fillStyle = '#e9e2d8';
                        ctx.beginPath();
                        ctx.ellipse(
                            mouthCx,
                            mouthCy + mouthH * 0.15,
                            mouthW * lipWidth * 0.72,
                            mouthH * 0.32,
                            0, 0, Math.PI * 2,
                        );
                        ctx.fill();
                        ctx.restore();
                    }

                    // 4. Jaw cutout — dropped, width-scaled, smile-lifted.
                    // A fading smile rotates the mouth slightly (real smiles
                    // decay asymmetrically — one corner lets go first).
                    const drop = mouthH * shape.open * 1.8 - expr.smile * mouthH * 0.2;
                    ctx.save();
                    ctx.translate(mouthCx, mouthCy);
                    ctx.rotate(smileDecayAsym * expr.smile * 0.02);
                    ctx.scale(lipWidth, 1);
                    ctx.translate(-mouthCx, -mouthCy);
                    ctx.drawImage(face.jaw, dx, dy + drop, iw * scale, ih * scale);
                    ctx.restore();
                } else if (face.jaw.width > 0 && (expr.smile > 0.05 || expr.lipPress > 0.05)) {
                    // Closed mouth: smile pulse (corners up + widen) and/or
                    // lip press (tighten — attentive listening).
                    const lift = expr.smile * mouthH * 0.35 + expr.lipPress * mouthH * 0.12;
                    ctx.save();
                    ctx.translate(mouthCx, mouthCy);
                    ctx.rotate(smileDecayAsym * expr.smile * 0.02);
                    ctx.scale(1 + expr.smile * 0.06 - expr.lipPress * 0.03, 1);
                    ctx.translate(-mouthCx, -mouthCy);
                    ctx.drawImage(face.jaw, dx, dy - lift, iw * scale, ih * scale);
                    ctx.restore();
                }

                // 5. Brow band — raise shifts up, furrow pulls down/in.
                const browNet = expr.brow * 0.06 - expr.furrow * 0.045;
                if (face.brow.width > 0 && Math.abs(browNet) > 0.002) {
                    const eyeDx = Math.abs(fx(r.rightEye.x) - fx(r.leftEye.x));
                    ctx.save();
                    if (expr.furrow > 0.05) {
                        // Furrow also narrows the band slightly (brows knit inward).
                        const browCx = (fx(r.leftEye.x) + fx(r.rightEye.x)) / 2;
                        ctx.translate(browCx, 0);
                        ctx.scale(1 - expr.furrow * 0.02, 1);
                        ctx.translate(-browCx, 0);
                    }
                    ctx.drawImage(face.brow, dx, dy - browNet * eyeDx, iw * scale, ih * scale);
                    ctx.restore();
                }

                // 6. Eyelids — blink ∨ squint ∨ wink (right eye).
                const closeL = Math.max(blink, expr.squint * 0.45);
                const closeR = Math.max(blink, expr.squint * 0.45, expr.wink);
                if (closeL > 0.02 || closeR > 0.02) {
                    const eyeDx = Math.abs(fx(r.rightEye.x) - fx(r.leftEye.x));
                    const rxE = Math.max(6, eyeDx * 0.30);
                    ctx.save();
                    ctx.fillStyle = face.lidColor;
                    for (const [eye, amount] of [[r.leftEye, closeL], [r.rightEye, closeR]] as const) {
                        if (amount <= 0.02) continue;
                        ctx.globalAlpha = Math.min(1, amount * 1.2);
                        ctx.beginPath();
                        ctx.ellipse(fx(eye.x), fy(eye.y), rxE, Math.max(1, rxE * 0.55 * amount), 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                }

                ctx.restore();
            }
            raf = requestAnimationFrame(render);
        };
        raf = requestAnimationFrame(render);
        return () => {
            if (raf != null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
        };
    }, [live, speechRef]);

    return (
        <div className="pstudio__face-wrap" aria-hidden="true">
            {!live && <img className="pstudio__face-still" src={imageUrl} alt="" />}
            {live && <canvas ref={canvasRef} className="pstudio__avatar-canvas" />}
        </div>
    );
}
