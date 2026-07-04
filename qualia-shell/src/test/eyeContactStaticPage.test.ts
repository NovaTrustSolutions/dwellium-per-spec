import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('eye-contact correction static page', () => {
    const html = () => readFileSync(resolve(process.cwd(), 'public/__eye-contact/index.html'), 'utf8');

    it('ships a browser-native two-pane preview instead of a desktop-app blocker', () => {
        const page = html();

        expect(page).toContain('Raw camera');
        expect(page).toContain('Corrected output');
        expect(page).toContain('correctedCanvas');
        expect(page).toContain('navigator.mediaDevices.getUserMedia');
        expect(page).not.toMatch(/download a desktop app/i);
        expect(page).not.toMatch(/requires the Dwellium desktop app/i);
        expect(page).not.toMatch(/engine ships with the <b>Dwellium desktop app<\/b>/i);
    });

    it('drives real gaze correction via MediaPipe Tasks Vision FaceLandmarker, not a decorative overlay', () => {
        const page = html();

        // Real engine, not a fake/mirror-only "correction".
        expect(page).toContain('FaceLandmarker');
        expect(page).toContain('FilesetResolver');
        expect(page).toMatch(/@mediapipe\/tasks-vision/);
        expect(page).toContain('outputFacialTransformationMatrixes: true');

        // User-tunable strength control (plan-mandated 0-100 slider, default 55).
        expect(page).toContain('id="strength"');
        expect(page).toContain('id="strengthVal"');
        expect(page).toMatch(/strength:\s*55/);

        // Naturalness guards must be present as identifiable clamps, not silently dropped.
        expect(page).toMatch(/BLINK_EAR_THRESHOLD/); // blink guard
        expect(page).toMatch(/POSE_GUARD_DEG/);      // head-pose guard
        expect(page).toMatch(/DEAD_ZONE_DEG/);        // dead zone
        expect(page).toMatch(/MAX_DISPLACEMENT_FRAC/); // displacement ceiling
        expect(page).toMatch(/FEATHER_FRAC/);          // feathered aperture edge
        expect(page).toMatch(/EMA_ALPHA/);              // temporal smoothing

        // Meter states must be exactly the plan-mandated set.
        expect(page).toMatch(/paused \(blink\)/);
        expect(page).toMatch(/paused \(head turned\)/);
        expect(page).toMatch(/idle \(looking at camera\)/);
        expect(page).toMatch(/correction unavailable — engine failed to load/);

        // Never draw synthetic irises/pupils — texture warp only.
        expect(page).not.toMatch(/drawSyntheticIris/i);
        expect(page).not.toMatch(/fake iris/i);

        // The old fake "correction" (a decorative guide line with no real gaze redirection)
        // must be gone — this page must not ship the previous placeholder implementation.
        expect(page).not.toMatch(/guide-line/i);
        expect(page).not.toMatch(/guideLine/);
    });

    it('ships a no-camera photo demo mode for QA/reviewer verification', () => {
        const page = html();

        expect(page).toContain('id="photoInput"');
        expect(page).toContain('type="file"');
        expect(page).toContain('runPhotoPipeline');
        expect(page).toMatch(/debugOffset/);
    });
});
