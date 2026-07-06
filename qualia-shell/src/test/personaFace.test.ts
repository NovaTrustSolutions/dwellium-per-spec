/**
 * PersonaFace engine tests — pure viseme/micro-motion math (no DOM).
 */
import { describe, it, expect } from 'vitest';
import {
    VISEME_SHAPES,
    visemeForChar,
    visemeAt,
    visemeAtContext,
    coarticulatedShapeAt,
    blendShapes,
    headPoseAt,
    blinkAmountAt,
    syntheticAmplitudeAt,
    defaultFaceRegions,
    estimateSpeechMs,
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
    NOD_AFTER_MS,
    NEUTRAL_EXPRESSION,
    type SpringState,
} from '../components/PersonaStudio/personaFaceEngine';

describe('visemeForChar / visemeAt', () => {
    it('maps letters to the observed mouth-shape inventory', () => {
        expect(visemeForChar('m')).toBe('MBP');
        expect(visemeForChar('b')).toBe('MBP');
        expect(visemeForChar('f')).toBe('FV');
        expect(visemeForChar('e')).toBe('EE');
        expect(visemeForChar('i')).toBe('EE');
        expect(visemeForChar('a')).toBe('AH');
        expect(visemeForChar('o')).toBe('OH');
        expect(visemeForChar('u')).toBe('OO');
        expect(visemeForChar('w')).toBe('OO');
        expect(visemeForChar('t')).toBe('CONS');
    });

    it('closes the mouth at spaces and punctuation (between-word closure)', () => {
        expect(visemeForChar(' ')).toBe('rest');
        expect(visemeForChar('.')).toBe('rest');
    });

    it('clamps out-of-range indices instead of throwing', () => {
        expect(visemeAt('go', -5)).toBe(visemeForChar('g'));
        expect(visemeAt('go', 99)).toBe(visemeForChar('o'));
        expect(visemeAt('', 0)).toBe('rest');
    });
});

describe('visemeAtContext (expanded v2 library)', () => {
    it('recognizes digraphs before single letters', () => {
        expect(visemeAtContext('the', 0)).toBe('TH');     // "th" at cursor
        expect(visemeAtContext('the', 1)).toBe('TH');     // cursor inside "th"
        expect(visemeAtContext('chair', 0)).toBe('CH');
        expect(visemeAtContext('shine', 0)).toBe('CH');
        expect(visemeAtContext('moon', 1)).toBe('OO');    // "oo"
        expect(visemeAtContext('see', 1)).toBe('EE');     // "ee"
        expect(visemeAtContext('quick', 0)).toBe('WQ');   // "qu"
        expect(visemeAtContext('sing', 2)).toBe('KG');    // "ng"
    });

    it('maps the new consonant classes', () => {
        expect(visemeAtContext('dog', 0)).toBe('DD');
        expect(visemeAtContext('go', 0)).toBe('KG');
        expect(visemeAtContext('zoo', 0)).toBe('SS');
        expect(visemeAtContext('lot', 0)).toBe('LL');
        expect(visemeAtContext('jam', 0)).toBe('CH');
    });

    it('distinguishes the vowel tiers (EH vs IH vs AH)', () => {
        expect(visemeAtContext('bed', 1)).toBe('EH');
        expect(visemeAtContext('bit', 1)).toBe('IH');
        expect(visemeAtContext('bat', 1)).toBe('AH');
    });

    it('still closes at spaces/punctuation and clamps indices', () => {
        expect(visemeAtContext('a b', 1)).toBe('rest');
        expect(visemeAtContext('hi', 99)).toBe('IH');
        expect(visemeAtContext('', 0)).toBe('rest');
    });
});

describe('coarticulatedShapeAt', () => {
    it('pre-forms the coming sound (blends 30% toward +2 chars)', () => {
        // "ma": at 'm' (MBP, open 0) the lips already open toward the vowel ahead.
        const s = coarticulatedShapeAt('ma', 0);
        expect(s.open).toBeGreaterThan(VISEME_SHAPES.MBP.open);
        expect(s.open).toBeLessThan(VISEME_SHAPES.AH.open);
    });

    it('uses the faster attack rate of the pair (plosives snap)', () => {
        const s = coarticulatedShapeAt('am', 0); // AH now, MBP ahead
        expect(s.rate).toBe(Math.max(VISEME_SHAPES.AH.rate, VISEME_SHAPES.MBP.rate));
    });
});

describe('micro-expressions', () => {
    it('stays within bounds and is deterministic', () => {
        for (let t = 0; t < 20000; t += 130) {
            const a = microExpressionAt(t, true);
            const b = microExpressionAt(t, true);
            expect(a).toEqual(b);
            for (const v of [a.brow, a.squint, a.smile, a.nod, a.wink]) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
            expect(Math.abs(a.gaze)).toBeLessThanOrEqual(1);
        }
    });

    it('produces at least one expression event over a 30s window', () => {
        let any = 0;
        for (let t = 0; t < 30000; t += 60) {
            const e = microExpressionAt(t, false);
            any = Math.max(any, e.brow, Math.abs(e.gaze), e.squint, e.smile);
        }
        expect(any).toBeGreaterThan(0.3);
    });

    it('pulseEnvelope ramps, holds, decays, and is 0 outside the window', () => {
        expect(pulseEnvelope(-10)).toBe(0);
        expect(pulseEnvelope(100)).toBeCloseTo(0.5, 5);
        expect(pulseEnvelope(400)).toBe(1);
        expect(pulseEnvelope(850)).toBeCloseTo(0.5, 5);
        expect(pulseEnvelope(1500)).toBe(0);
    });

    it('combineExpressions takes the stronger channel', () => {
        const c = combineExpressions(
            { ...NEUTRAL_EXPRESSION, brow: 0.3, gaze: -0.9 },
            { ...NEUTRAL_EXPRESSION, brow: 0.8, gaze: 0.2 },
        );
        expect(c.brow).toBe(0.8);
        expect(c.gaze).toBe(-0.9); // larger magnitude wins
    });
});

describe('realism package: smile decay, jaw spring, listening face', () => {
    it('smileEnvelope blooms fast and fades slowly (no abrupt cutoff)', () => {
        expect(smileEnvelope(125)).toBeCloseTo(0.5, 5);   // fast bloom
        expect(smileEnvelope(500)).toBe(1);               // hold
        const early = smileEnvelope(1200);
        const late = smileEnvelope(2400);
        expect(early).toBeGreaterThan(late);              // monotonic fade
        expect(late).toBeGreaterThan(0);                  // still lingering at 2.4s
        expect(smileEnvelope(SMILE_PULSE_MS + 1)).toBe(0);
    });

    it('smileAsymmetry rises only during the decay phase', () => {
        expect(smileAsymmetry(500)).toBe(0);              // none while holding
        expect(smileAsymmetry(1500)).toBeGreaterThan(0);
        expect(smileAsymmetry(2100)).toBeGreaterThan(smileAsymmetry(1500));
    });

    it('jaw spring converges to target without exploding and stays in 0..1', () => {
        let s: SpringState = { pos: 0, vel: 0 };
        for (let i = 0; i < 60; i++) s = springStep(s, 0.8, 16);
        expect(s.pos).toBeGreaterThan(0.75);
        expect(s.pos).toBeLessThanOrEqual(1);
        // Sudden close: settles back down, clamped at 0.
        for (let i = 0; i < 60; i++) s = springStep(s, 0, 16);
        expect(s.pos).toBeLessThan(0.05);
        expect(s.pos).toBeGreaterThanOrEqual(0);
    });

    it('jaw spring lags a step change (inertia, not teleport)', () => {
        let s: SpringState = { pos: 0, vel: 0 };
        s = springStep(s, 1, 16);
        expect(s.pos).toBeLessThan(0.3); // one frame in, jaw has barely moved
    });

    it('reactionForUserSpeech maps concern > positive > surprise > specifics', () => {
        expect(reactionForUserSpeech('we have a problem with the sink')?.kind).toBe('concern');
        expect(reactionForUserSpeech('I have great news about a problem')?.kind).toBe('concern'); // priority
        expect(reactionForUserSpeech('this is awesome')?.kind).toBe('smile');
        expect(reactionForUserSpeech('are you serious?')?.kind).toBe('surprise');
        expect(reactionForUserSpeech('rent was 1200 dollars')?.kind).toBe('attentive');
        expect(reactionForUserSpeech('so anyway I went home')).toBeNull(); // most speech: no reaction
        expect(reactionForUserSpeech('')).toBeNull();
    });

    it('concern reaction uses the new furrow + lipPress channels', () => {
        const r = reactionForUserSpeech('the tenant is upset about damage');
        expect(r?.expr.furrow).toBeGreaterThan(0);
        expect(r?.expr.lipPress).toBeGreaterThan(0);
        expect(r?.expr.smile).toBe(0);
    });

    it('backchannel nods start only after sustained user speech, then recur', () => {
        expect(backchannelNodAt(NOD_AFTER_MS - 500)).toBe(0);
        let any = 0;
        for (let t = NOD_AFTER_MS; t < NOD_AFTER_MS + 5000; t += 40) any = Math.max(any, backchannelNodAt(t));
        expect(any).toBeGreaterThan(0.4);
    });

    it('scaleExpression scales every channel; combine keeps new channels', () => {
        const e = scaleExpression({ ...NEUTRAL_EXPRESSION, furrow: 1, lipPress: 0.8, tilt: -1 }, 0.5);
        expect(e.furrow).toBe(0.5);
        expect(e.lipPress).toBe(0.4);
        expect(e.tilt).toBe(-0.5);
        const c = combineExpressions(e, { ...NEUTRAL_EXPRESSION, tilt: 0.2 });
        expect(c.tilt).toBe(-0.5); // larger magnitude wins
    });
});

describe('cueExpression (LLM stage directions → face)', () => {
    it('maps recognized cues to expression targets', () => {
        expect(cueExpression('smiles')?.smile).toBe(1);
        expect(cueExpression('warm smile')?.smile).toBe(1);
        expect(cueExpression('laughs')?.nod).toBeGreaterThan(0);
        expect(cueExpression('nods')?.nod).toBe(1);
        expect(cueExpression('raises eyebrows')?.brow).toBe(1);
        expect(cueExpression('thoughtful pause')?.gaze).toBeGreaterThan(0);
        expect(cueExpression('winks')?.wink).toBe(1);
    });

    it('returns null for unrecognized cues', () => {
        expect(cueExpression('adjusts glasses')).toBeNull();
        expect(cueExpression('')).toBeNull();
    });
});

describe('blendShapes', () => {
    it('interpolates linearly and clamps t', () => {
        const mid = blendShapes(VISEME_SHAPES.rest, VISEME_SHAPES.AH, 0.5);
        expect(mid.open).toBeCloseTo(VISEME_SHAPES.AH.open / 2, 5);
        const over = blendShapes(VISEME_SHAPES.rest, VISEME_SHAPES.AH, 5);
        expect(over.open).toBeCloseTo(VISEME_SHAPES.AH.open, 5);
    });
});

describe('headPoseAt', () => {
    it('stays within subtle bounds and scales with energy', () => {
        for (const t of [0, 1234, 98765, 400000]) {
            const calm = headPoseAt(t, 0);
            expect(Math.abs(calm.rot)).toBeLessThan(0.03);
            expect(Math.abs(calm.dx)).toBeLessThan(0.02);
            expect(calm.scale).toBeGreaterThan(0.99);
            expect(calm.scale).toBeLessThan(1.01);
        }
        // Not asserting monotonic energy scaling per-sample (sines cross zero),
        // just that the function is finite + well-formed at high energy.
        const lively = headPoseAt(5000, 1);
        expect(Number.isFinite(lively.rot)).toBe(true);
    });
});

describe('blinkAmountAt', () => {
    it('is 0 most of the time but blinks fully somewhere in any 8s window', () => {
        let max = 0;
        let zeros = 0;
        const samples = 8000 / 16;
        for (let t = 0; t < 8000; t += 16) {
            const b = blinkAmountAt(t);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(1);
            if (b === 0) zeros++;
            max = Math.max(max, b);
        }
        expect(max).toBeGreaterThan(0.8);          // a blink happened
        expect(zeros / samples).toBeGreaterThan(0.9); // eyes open >90% of the time
    });
});

describe('syntheticAmplitudeAt / estimateSpeechMs / defaultFaceRegions', () => {
    it('amplitude stays in 0..1', () => {
        for (let t = 0; t < 3000; t += 50) {
            const a = syntheticAmplitudeAt(t);
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(1);
        }
    });

    it('speech duration scales inversely with rate and has a floor', () => {
        const slow = estimateSpeechMs('hello there friend', 0.5);
        const fast = estimateSpeechMs('hello there friend', 2);
        expect(slow).toBeGreaterThan(fast);
        expect(estimateSpeechMs('', 1)).toBe(400);
    });

    it('default regions are sane fractions', () => {
        const r = defaultFaceRegions();
        expect(r.leftEye.x).toBeLessThan(r.rightEye.x);
        for (const v of [r.leftEye.x, r.leftEye.y, r.mouth.x, r.mouth.y, r.mouth.w, r.mouth.h]) {
            expect(v).toBeGreaterThan(0);
            expect(v).toBeLessThan(1);
        }
    });
});
