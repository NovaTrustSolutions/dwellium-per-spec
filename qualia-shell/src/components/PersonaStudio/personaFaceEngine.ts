/**
 * personaFaceEngine — PURE viseme + micro-motion math for the PersonaFace
 * talking-portrait renderer.
 *
 * Built from the 2026-07-05 close-up study of the reference persona's live
 * stream (14 zoomed frames): ~6 recurring mouth shapes (rest, EE, AH, OH/OO,
 * MBP, smile), blinks every 2–6 s, constant subtle head sway + breathing,
 * and vowel-tracked lip motion. This module maps text position → viseme
 * class and provides the oscillator math; the canvas compositing lives in
 * PersonaFace.tsx.
 *
 * Everything is DOM-free and unit-testable.
 */

// ── Viseme classes (expanded 17-shape library, v2 fluidity arc) ───────
// v1 shipped the 8 shapes observed at conversation distance; v2 expands to
// the classic Preston-Blair-style inventory with digraph awareness and
// co-articulation so lips FLOW between shapes instead of snapping.

export type Viseme =
    | 'rest'   // closed, relaxed (soft smile)
    | 'MBP'    // pressed lips — m / b / p
    | 'FV'     // lower lip to teeth — f / v
    | 'TH'     // tongue between teeth — th
    | 'DD'     // tongue tap — d / t / n
    | 'KG'     // back of tongue — k / g / hard c
    | 'CH'     // ch / sh / j — slight round, mid-open
    | 'SS'     // s / z — teeth nearly closed, visible
    | 'LL'     // l — jaw mid, tongue up
    | 'EE'     // wide, teeth visible — long e
    | 'IH'     // short i — slightly narrower EE
    | 'EH'     // e / short a — mid-open neutral
    | 'AH'     // open jaw — a / open vowels
    | 'OH'     // rounded mid-open — o
    | 'OO'     // rounded narrow — long u
    | 'WQ'     // w / qu — tight rounded glide
    | 'CONS';  // generic consonant — slightly parted

/** Per-viseme mouth deformation parameters (fractions of the mouth box). */
export interface VisemeShape {
    /** Jaw-drop amount 0..1 (vertical stretch of the lower-face band). */
    open: number;
    /** Horizontal lip scale (1 = neutral; >1 wide EE, <1 rounded OO). */
    width: number;
    /** Inner-mouth darkness alpha 0..1 (mouth cavity hint). */
    cavity: number;
    /** Upper-teeth visibility 0..1 (light band under the upper lip). */
    teeth: number;
    /** Easing attack 0..1 per frame — plosives snap faster than vowels. */
    rate: number;
}

export const VISEME_SHAPES: Record<Viseme, VisemeShape> = {
    rest: { open: 0.00, width: 1.00, cavity: 0.00, teeth: 0.00, rate: 0.25 },
    MBP:  { open: 0.00, width: 0.97, cavity: 0.00, teeth: 0.00, rate: 0.60 },
    FV:   { open: 0.08, width: 1.02, cavity: 0.10, teeth: 0.35, rate: 0.50 },
    TH:   { open: 0.12, width: 1.00, cavity: 0.20, teeth: 0.30, rate: 0.45 },
    DD:   { open: 0.18, width: 1.02, cavity: 0.30, teeth: 0.40, rate: 0.55 },
    KG:   { open: 0.20, width: 0.98, cavity: 0.35, teeth: 0.15, rate: 0.55 },
    CH:   { open: 0.16, width: 0.94, cavity: 0.30, teeth: 0.25, rate: 0.50 },
    SS:   { open: 0.12, width: 1.06, cavity: 0.25, teeth: 0.55, rate: 0.45 },
    LL:   { open: 0.25, width: 1.00, cavity: 0.35, teeth: 0.30, rate: 0.40 },
    EE:   { open: 0.22, width: 1.12, cavity: 0.45, teeth: 0.60, rate: 0.35 },
    IH:   { open: 0.18, width: 1.06, cavity: 0.35, teeth: 0.45, rate: 0.35 },
    EH:   { open: 0.35, width: 1.04, cavity: 0.50, teeth: 0.40, rate: 0.35 },
    AH:   { open: 0.85, width: 1.02, cavity: 0.85, teeth: 0.20, rate: 0.32 },
    OH:   { open: 0.55, width: 0.92, cavity: 0.65, teeth: 0.10, rate: 0.32 },
    OO:   { open: 0.30, width: 0.80, cavity: 0.40, teeth: 0.00, rate: 0.32 },
    WQ:   { open: 0.22, width: 0.78, cavity: 0.30, teeth: 0.00, rate: 0.45 },
    CONS: { open: 0.15, width: 1.00, cavity: 0.25, teeth: 0.20, rate: 0.40 },
};

/** Two-character sequences with their own mouth shapes (checked first). */
const DIGRAPH_VISEMES: Record<string, Viseme> = {
    th: 'TH', ch: 'CH', sh: 'CH', ng: 'KG', ph: 'FV',
    ee: 'EE', ea: 'EE', oo: 'OO', ou: 'OO', ow: 'OH',
    ai: 'EH', ay: 'EH', qu: 'WQ',
};

/**
 * Context-aware viseme lookup: inspects the digraph starting at (or covering)
 * `index` before falling back to the single-letter map. This is what makes
 * "the", "chair", "moon" read with their true mouth shapes.
 */
export function visemeAtContext(text: string, index: number): Viseme {
    if (!text) return 'rest';
    const i = Math.max(0, Math.min(text.length - 1, Math.floor(index)));
    const lower = text.toLowerCase();
    const pairAt = lower.slice(i, i + 2);
    if (DIGRAPH_VISEMES[pairAt]) return DIGRAPH_VISEMES[pairAt];
    const pairBefore = i > 0 ? lower.slice(i - 1, i + 1) : '';
    if (DIGRAPH_VISEMES[pairBefore]) return DIGRAPH_VISEMES[pairBefore];
    const c = lower[i];
    if ('mbp'.includes(c)) return 'MBP';
    if ('fv'.includes(c)) return 'FV';
    if ('dtn'.includes(c)) return 'DD';
    if ('kgc'.includes(c)) return 'KG';
    if ('j'.includes(c)) return 'CH';
    if ('szx'.includes(c)) return 'SS';
    if ('l'.includes(c)) return 'LL';
    if ('e'.includes(c)) return 'EH';
    if ('i'.includes(c)) return 'IH';
    if ('y'.includes(c)) return 'EE';
    if ('a'.includes(c)) return 'AH';
    if ('o'.includes(c)) return 'OH';
    if ('u'.includes(c)) return 'OO';
    if ('wq'.includes(c)) return 'WQ';
    if (c >= 'a' && c <= 'z') return 'CONS';
    return 'rest';
}

/**
 * Co-articulated target shape at a text position: the current viseme blended
 * 30% toward the next one (2 chars ahead), the way real lips pre-form the
 * coming sound. Returns the shape + the faster of the two attack rates.
 */
export function coarticulatedShapeAt(text: string, index: number): VisemeShape {
    const cur = VISEME_SHAPES[visemeAtContext(text, index)];
    const next = VISEME_SHAPES[visemeAtContext(text, index + 2)];
    const blended = blendShapes(cur, next, 0.3);
    return { ...blended, teeth: cur.teeth + (next.teeth - cur.teeth) * 0.3, rate: Math.max(cur.rate, next.rate) };
}

/** Map a character to its viseme class (English-centric approximation). */
export function visemeForChar(ch: string): Viseme {
    const c = (ch || '').toLowerCase();
    if ('mbp'.includes(c)) return 'MBP';
    if ('fv'.includes(c)) return 'FV';
    if ('eiy'.includes(c)) return 'EE';
    if ('a'.includes(c)) return 'AH';
    if ('o'.includes(c)) return 'OH';
    if ('uw'.includes(c)) return 'OO';
    if (c >= 'a' && c <= 'z') return 'CONS';
    return 'rest'; // spaces, punctuation → mouth closes between words
}

/**
 * Viseme at a character position within spoken text. Looks at the char at
 * `index` (clamped); non-letters read as 'rest' so the mouth closes at word
 * gaps — matching the reference persona's between-word lip closures.
 */
export function visemeAt(text: string, index: number): Viseme {
    if (!text) return 'rest';
    const i = Math.max(0, Math.min(text.length - 1, Math.floor(index)));
    return visemeForChar(text[i]);
}

/**
 * Interpolate between two viseme shapes (t 0..1) — the renderer eases
 * between targets so lips never snap.
 */
export function blendShapes(a: VisemeShape, b: VisemeShape, t: number): VisemeShape {
    const k = Math.max(0, Math.min(1, t));
    return {
        open: a.open + (b.open - a.open) * k,
        width: a.width + (b.width - a.width) * k,
        cavity: a.cavity + (b.cavity - a.cavity) * k,
        teeth: a.teeth + (b.teeth - a.teeth) * k,
        rate: b.rate,
    };
}

// ── Idle micro-motion (head sway + breathing + gaze) ─────────────────

export interface HeadPose {
    /** Rotation in radians (±~0.01 rad ≈ ±0.6°). */
    rot: number;
    /** Translation in fractions of canvas size. */
    dx: number;
    dy: number;
    /** Breathing scale around 1. */
    scale: number;
}

/**
 * Head pose at time t (ms). Layered slow sines at incommensurate
 * frequencies so the motion never visibly loops. `energy` 0..1 scales the
 * motion up slightly while speaking (observed: livelier head when talking).
 */
export function headPoseAt(tMs: number, energy: number): HeadPose {
    const t = tMs / 1000;
    const e = 1 + energy * 0.8;
    return {
        rot: (Math.sin(t * 0.31) * 0.008 + Math.sin(t * 0.73 + 1.3) * 0.004) * e,
        dx: (Math.sin(t * 0.42 + 0.7) * 0.004 + Math.sin(t * 1.1) * 0.0015) * e,
        dy: (Math.sin(t * 0.27 + 2.1) * 0.003 + Math.sin(t * 0.9 + 0.4) * 0.0012) * e,
        scale: 1 + Math.sin(t * 0.23) * 0.004,
    };
}

// ── Blinks ────────────────────────────────────────────────────────────

/**
 * Deterministic blink schedule: given time, returns eyelid closure 0..1.
 * Blinks last ~140 ms and recur every 2.4–5.8 s (pseudo-random via hash of
 * the blink slot index — stable, no state needed).
 */
export function blinkAmountAt(tMs: number): number {
    // Partition time into variable-length slots; hash slot index → interval.
    let slotStart = 0;
    let slot = 0;
    for (; slot < 10000; slot++) {
        const h = Math.abs(Math.sin(slot * 12.9898) * 43758.5453) % 1;
        const interval = 2400 + h * 3400; // 2.4–5.8 s
        if (tMs < slotStart + interval) break;
        slotStart += interval;
    }
    const inSlot = tMs - slotStart;
    const h2 = Math.abs(Math.sin(slot * 78.233) * 12543.123) % 1;
    const blinkAt = 600 + h2 * 900; // blink somewhere early in the slot
    const dt = inSlot - blinkAt;
    if (dt < 0 || dt > 140) return 0;
    // Triangular close/open profile, full closure at the midpoint.
    return dt < 70 ? dt / 70 : 1 - (dt - 70) / 70;
}

// ── Speaking envelope (synthetic, for browser TTS with no audio tap) ──

/** Amplitude 0..1 at time t while speaking — same double-sine envelope as the visualizer. */
export function syntheticAmplitudeAt(tMs: number): number {
    const t = tMs / 1000;
    return Math.max(0, Math.min(1, 0.35 + 0.3 * Math.abs(Math.sin(t * 3.1)) + 0.15 * Math.abs(Math.sin(t * 7.7))));
}

// ── Face regions (user-placed on their portrait) ──────────────────────

export interface FaceRegions {
    /** Eye centers, as fractions of image width/height. */
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    /** Mouth center + half-extents, as fractions of image size. */
    mouth: { x: number; y: number; w: number; h: number };
}

export function defaultFaceRegions(): FaceRegions {
    // Sensible defaults for a centered head-and-shoulders portrait.
    return {
        leftEye: { x: 0.40, y: 0.40 },
        rightEye: { x: 0.60, y: 0.40 },
        mouth: { x: 0.50, y: 0.62, w: 0.10, h: 0.045 },
    };
}

// ── Micro-expressions (v2 fluidity arc) ──────────────────────────────
// Observed on the reference persona: brow flicks, gaze glances, soft
// squints, smile pulses, and emphasis nods — small, brief, and constant.
// Two sources drive them here: (1) a deterministic procedural schedule
// (below), and (2) explicit [performance cues] from the LLM when "Add cues"
// is on — the script literally directs the face.

export interface Expression {
    /** Brow raise 0..1 (feathered brow band shifts up). */
    brow: number;
    /** Brow furrow 0..1 (band shifts down — concentration / concern). */
    furrow: number;
    /** Soft squint 0..1 (partial eyelid). */
    squint: number;
    /** Gaze glance -1..1 (subtle head-turn feel). */
    gaze: number;
    /** Smile pulse 0..1 (mouth corners up + slight widen). */
    smile: number;
    /** Lip press 0..1 (lips tighten — attentive / holding back). */
    lipPress: number;
    /** Emphasis nod 0..1 (brief downward head bob). */
    nod: number;
    /** Head tilt -1..1 (curiosity / engagement lean). */
    tilt: number;
    /** Wink 0..1 (right eyelid only). */
    wink: number;
}

export const NEUTRAL_EXPRESSION: Expression = {
    brow: 0, furrow: 0, squint: 0, gaze: 0, smile: 0, lipPress: 0, nod: 0, tilt: 0, wink: 0,
};

/** Per-channel max combine (procedural schedule ∨ cue pulses ∨ listening reactions). */
export function combineExpressions(a: Expression, b: Expression): Expression {
    return {
        brow: Math.max(a.brow, b.brow),
        furrow: Math.max(a.furrow, b.furrow),
        squint: Math.max(a.squint, b.squint),
        gaze: Math.abs(a.gaze) > Math.abs(b.gaze) ? a.gaze : b.gaze,
        smile: Math.max(a.smile, b.smile),
        lipPress: Math.max(a.lipPress, b.lipPress),
        nod: Math.max(a.nod, b.nod),
        tilt: Math.abs(a.tilt) > Math.abs(b.tilt) ? a.tilt : b.tilt,
        wink: Math.max(a.wink, b.wink),
    };
}

/** Scale every channel of an expression by k (envelope application). */
export function scaleExpression(e: Expression, k: number): Expression {
    return {
        brow: e.brow * k, furrow: e.furrow * k, squint: e.squint * k, gaze: e.gaze * k,
        smile: e.smile * k, lipPress: e.lipPress * k, nod: e.nod * k, tilt: e.tilt * k, wink: e.wink * k,
    };
}

/** Ramp 200 ms → hold 500 ms → decay 300 ms. 0 outside [0, 1000 ms]. */
export function pulseEnvelope(elapsedMs: number): number {
    if (elapsedMs < 0 || elapsedMs > 1000) return 0;
    if (elapsedMs < 200) return elapsedMs / 200;
    if (elapsedMs < 700) return 1;
    return 1 - (elapsedMs - 700) / 300;
}

/**
 * Smile-specific envelope: real smiles bloom fast and FADE SLOWLY (an
 * abrupt smile cutoff is a classic uncanny tell). Ramp 250 ms → hold
 * 700 ms → long 1,800 ms decay. Use `smileAsymmetry` during the decay to
 * rotate the mouth corner slightly (real smiles fade unevenly).
 */
export const SMILE_PULSE_MS = 2750;
export function smileEnvelope(elapsedMs: number): number {
    if (elapsedMs < 0 || elapsedMs > SMILE_PULSE_MS) return 0;
    if (elapsedMs < 250) return elapsedMs / 250;
    if (elapsedMs < 950) return 1;
    const d = (elapsedMs - 950) / 1800;
    return (1 - d) * (1 - d); // ease-out — lingers, then lets go
}

/** Asymmetry factor 0..1 — rises through the decay phase of a smile. */
export function smileAsymmetry(elapsedMs: number): number {
    if (elapsedMs < 950 || elapsedMs > SMILE_PULSE_MS) return 0;
    return Math.min(1, (elapsedMs - 950) / 1200);
}

// ── Jaw inertia (critically-damped spring) ────────────────────────────
// The jaw has mass: it lags the lips slightly and settles without ringing.
// One spring step per frame for the `open` channel; lips (width/teeth)
// stay on fast exponential easing.

export interface SpringState { pos: number; vel: number }

export function springStep(
    s: SpringState,
    target: number,
    dtMs: number,
    stiffness = 180,
    damping = 27, // ≈ 2·√stiffness → critically damped, no bounce
): SpringState {
    const dt = Math.min(0.064, Math.max(0.001, dtMs / 1000));
    const accel = stiffness * (target - s.pos) - damping * s.vel;
    const vel = s.vel + accel * dt;
    const pos = s.pos + vel * dt;
    return { pos: Math.max(0, Math.min(1, pos)), vel };
}

function hash01(n: number, salt: number): number {
    return Math.abs(Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453) % 1;
}

/**
 * Deterministic micro-expression schedule: time partitions into 3–7 s slots;
 * each slot rolls one expression (or none) with a 200/500/300 ms envelope.
 * Speaking biases toward brow raises + smiles (livelier); idle biases toward
 * gaze glances (the "thinking eyes" the reference persona shows between turns).
 */
export function microExpressionAt(tMs: number, speaking: boolean): Expression {
    let slotStart = 0;
    let slot = 0;
    for (; slot < 10000; slot++) {
        const interval = 3000 + hash01(slot, 1) * 4000; // 3–7 s
        if (tMs < slotStart + interval) break;
        slotStart += interval;
    }
    const inSlot = tMs - slotStart;
    const startAt = 400 + hash01(slot, 2) * 1500;
    const env = pulseEnvelope(inSlot - startAt);
    if (env <= 0) return { ...NEUTRAL_EXPRESSION };

    const roll = hash01(slot, 3);
    const strength = (0.4 + hash01(slot, 4) * 0.6) * env;
    const out: Expression = { ...NEUTRAL_EXPRESSION };
    if (roll < 0.28) {
        // nothing this slot — stillness is part of realism
    } else if (roll < (speaking ? 0.55 : 0.42)) {
        out.brow = strength;
    } else if (roll < (speaking ? 0.72 : 0.62)) {
        out.gaze = (hash01(slot, 5) < 0.5 ? -1 : 1) * strength;
    } else if (roll < 0.80) {
        out.squint = strength * 0.6;
    } else if (roll < 0.88) {
        out.tilt = (hash01(slot, 6) < 0.5 ? -1 : 1) * strength * 0.7;
    } else if (roll < 0.94) {
        out.lipPress = strength * 0.7;
    } else {
        out.smile = strength * 0.8;
    }
    return out;
}

// ── Reactive listening face (the "feels like a real person" layer) ────
// While the USER talks, a real listener performs: nods on sustained speech,
// brow raise at questions/surprise, smile at good news, furrow at problems,
// attentive squint at specifics. This scans the live interim transcript.

export type ListenReactionKind = 'smile' | 'concern' | 'surprise' | 'attentive' | 'nod';

export interface ListenReaction {
    kind: ListenReactionKind;
    expr: Expression;
}

const POSITIVE_RE = /\b(great|good news|awesome|amazing|perfect|love|excellent|fantastic|happy|excited|wonderful|thank)\b/i;
const CONCERN_RE = /\b(problem|issue|broken|late|overdue|worried|bad|wrong|fail|leak|complain|damage|emergency|angry|upset)\b/i;
const SURPRISE_RE = /\b(really|wow|no way|seriously|can'?t believe|guess what)\b|\?/i;
const SPECIFICS_RE = /\d|\b(exactly|specifically|the number|address|deadline|by friday|by monday)\b/i;

/**
 * Map a fragment of the user's live speech to a listening reaction.
 * Priority: concern > positive > surprise > specifics. Null = no reaction
 * (most fragments — a listener who reacts to everything feels manic).
 */
export function reactionForUserSpeech(fragment: string): ListenReaction | null {
    const f = (fragment || '').trim();
    if (f.length < 3) return null;
    if (CONCERN_RE.test(f)) {
        return { kind: 'concern', expr: { ...NEUTRAL_EXPRESSION, furrow: 0.9, squint: 0.35, lipPress: 0.4 } };
    }
    if (POSITIVE_RE.test(f)) {
        return { kind: 'smile', expr: { ...NEUTRAL_EXPRESSION, smile: 0.9, brow: 0.25 } };
    }
    if (SURPRISE_RE.test(f)) {
        return { kind: 'surprise', expr: { ...NEUTRAL_EXPRESSION, brow: 0.9, tilt: 0.4 } };
    }
    if (SPECIFICS_RE.test(f)) {
        return { kind: 'attentive', expr: { ...NEUTRAL_EXPRESSION, squint: 0.5, lipPress: 0.5, tilt: -0.3 } };
    }
    return null;
}

/**
 * Backchannel nod schedule: while the user has been speaking for more than
 * `NOD_AFTER_MS`, emit a soft nod roughly every 4 s (deterministic slots).
 */
export const NOD_AFTER_MS = 3000;
export function backchannelNodAt(userSpeakingForMs: number): number {
    if (userSpeakingForMs < NOD_AFTER_MS) return 0;
    const t = userSpeakingForMs - NOD_AFTER_MS;
    const slot = Math.floor(t / 4000);
    const inSlot = t - slot * 4000;
    const startAt = 200 + hash01(slot, 7) * 800;
    return pulseEnvelope(inSlot - startAt) * 0.6;
}

/**
 * Map an LLM [performance cue] to expression targets. Returns null for
 * unrecognized cues (they stay display-only).
 */
export function cueExpression(cue: string): Expression | null {
    const c = (cue || '').toLowerCase();
    const hit = (...words: string[]) => words.some(w => c.includes(w));
    if (hit('laugh', 'chuckle', 'giggle')) return { ...NEUTRAL_EXPRESSION, smile: 1, nod: 0.5, squint: 0.4 };
    if (hit('smile', 'grin', 'beam', 'warm')) return { ...NEUTRAL_EXPRESSION, smile: 1 };
    if (hit('wink')) return { ...NEUTRAL_EXPRESSION, wink: 1, smile: 0.5 };
    if (hit('nod')) return { ...NEUTRAL_EXPRESSION, nod: 1 };
    if (hit('eyebrow', 'brow', 'surpris', 'excit')) return { ...NEUTRAL_EXPRESSION, brow: 1, smile: 0.4 };
    if (hit('thought', 'pause', 'hmm', 'ponder', 'consider')) return { ...NEUTRAL_EXPRESSION, gaze: 0.8, squint: 0.5, tilt: 0.5 };
    if (hit('serious', 'concern', 'frown', 'worried')) return { ...NEUTRAL_EXPRESSION, furrow: 0.9, squint: 0.4, lipPress: 0.5 };
    if (hit('tilt', 'curious', 'intrigu')) return { ...NEUTRAL_EXPRESSION, tilt: 0.8, brow: 0.3 };
    return null;
}

/** Estimate speech duration for viseme-timeline pacing (chars/sec ≈ 14 at 1×). */
export function estimateSpeechMs(text: string, rate: number): number {
    const cps = 14 * Math.max(0.5, Math.min(2, rate));
    return Math.max(400, (text.length / cps) * 1000);
}
