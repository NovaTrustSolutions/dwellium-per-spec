# Plan 037: Real, natural eye-contact correction (MediaPipe iris warp — no cartoon overlays)

> **Executor instructions**: Follow step by step; verify every step. On STOP
> conditions, stop and report. Commit in the worktree per the git workflow.
> SKIP updating `plans/README.md` — the reviewer maintains the index.
>
> **Repo**: FRONTEND `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`
> (planned at frontend `5fac7c8`, 2026-07-04).
>
> **Drift check (run first)**:
> `git diff --stat 5fac7c8..HEAD -- qualia-shell/public/__eye-contact/ qualia-shell/src/test/eyeContactStaticPage.test.ts`

## Status

- **Priority**: P2 (owner-requested feature quality)
- **Effort**: L (computer-vision + rendering; iterative visual tuning)
- **Risk**: MED (self-contained page; worst case = graceful passthrough)
- **Depends on**: none
- **Category**: direction
- **Planned at**: frontend `5fac7c8`, 2026-07-04

## Why this matters

Owner requirement (2026-07-04, verbatim intent): eye-contact correction "needs
to actually have a filter that makes it look like you're actually looking at
the camera naturally — not like you're a cartoon or an obvious filter." Today
`qualia-shell/public/__eye-contact/index.html` (opened from
`AraMeetingPanel.tsx:326` "Configure Eye-Correction Module") performs NO
correction: the "Corrected output" canvas just mirrors the raw camera and draws
a vertical guide line (`index.html:242-257`). After this plan, the corrected
pane subtly redirects the user's gaze toward the camera using their OWN eye
pixels, with strict naturalness clamps.

## Current state

- `qualia-shell/public/__eye-contact/index.html` (325 lines, fully
  self-contained static page: inline CSS + vanilla JS, no build step):
  - Two-pane UI: `#rawVideo` (left) / `#correctedCanvas` (right), Start/Reset,
    settings persisted via a small `cfg` object + Save (localStorage), status
    meters (`#correctedMeter`), engine dot toggle.
  - `getUserMedia` at :192/:291; render loop draws the mirrored video frame to
    the canvas (:242-248) and a center guide line (:253-257). That guide line
    is decoration, not correction.
- `qualia-shell/src/test/eyeContactStaticPage.test.ts` (vitest, string-level
  assertions on the HTML: 'Raw camera', 'Corrected output', 'correctedCanvas',
  'getUserMedia', and negative assertions about desktop-app blockers). These
  MUST keep passing.
- `AraMeetingPanel.tsx:326` opens the page in a popup — no change needed there.
- Conventions: the page is intentionally dependency-free/static; adding a CDN
  ES-module import is acceptable (matches netlify CSP report-only; script-src
  'self' is REPORT-ONLY, not enforced — do not let CSP reports block you, but
  note the CDN origin in your report for the future CSP allowlist).

## Approach (DECIDED — the naturalness rules are the point; do not redesign)

**Engine**: MediaPipe Tasks Vision `FaceLandmarker` from CDN
(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest` — pin the exact
version you test), GPU delegate with CPU fallback, `outputFacialTransformationMatrixes: true`,
running in a rAF loop on the live video. Model asset from Google's hosted
`face_landmarker.task` URL. If the engine fails to load (offline/CSP): fall
back to today's passthrough and set the meter to "correction unavailable —
engine failed to load" (honest, never fake).

**Correction = texture WARP of the user's own eye pixels. Never draw irises,
never overlay shapes, never recolor** — synthetic pupils are exactly the
"cartoon" failure the owner rejects.

Per frame, per eye:
1. From the 478 landmarks: eyelid aperture polygon (eye contour points), iris
   center (mean of iris cluster 468-472 / 473-477), eye corners, eye width.
2. Gaze-offset estimate: iris center relative to aperture center, plus head
   pose from the facial transformation matrix (yaw/pitch).
3. Target: displace the eye texture so the iris moves toward the
   "looking-at-camera" position (aperture center corrected for head pose).
4. **Warp, clipped and feathered**: copy the eye region to an offscreen canvas,
   redraw it shifted by the displacement INSIDE a clip path of the eyelid
   aperture, with a feathered edge (radial alpha falloff, feather ≈ 18% of eye
   width) so no seam is visible. 2D-canvas implementation is the decided
   baseline (simplest robust); WebGL only if you find 2D quality insufficient
   AND explain why in the report.

**Naturalness clamps (hard requirements — these prevent the uncanny look):**
- Displacement clamp: ≤ 30% of eye width, and scale the correction by a user
  `strength` slider (0-100, default 55) added to the existing settings panel +
  persisted with the existing cfg/save mechanism.
- Dead zone: if estimated gaze is already within ~5° of camera, correction → 0.
- Blink guard: eye aspect ratio below threshold → correction eases to 0 (never
  warp closed eyes).
- Head-pose guard: |yaw| or |pitch| > ~22° → ease correction to 0 (warping at
  steep angles looks wrong; dropping out is more natural).
- Temporal smoothing: EMA (~0.25 alpha) on displacement AND on an overall
  strength envelope with ~150 ms ease-in/out — no per-frame popping or jitter.
- Symmetry: both eyes always use the same strength envelope.
- The rest of the face is NEVER touched.

**Demo/QA mode**: add a "Test with a photo" file input — user picks any local
portrait photo; the SAME pipeline runs on the still image and renders raw vs
corrected side by side. This is how the reviewer and the owner can SEE the
quality without a camera, and how you self-verify.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Focused test | `cd qualia-shell && npx vitest run src/test/eyeContactStaticPage.test.ts` | pass |
| Full suite | `cd qualia-shell && npx vitest run` | all pass |
| Local serve for manual check | `cd qualia-shell/public && python3 -m http.server 8123` then open `http://localhost:8123/__eye-contact/index.html` | page loads; engine loads |

## Scope

**In scope:**
- `qualia-shell/public/__eye-contact/index.html`
- `qualia-shell/src/test/eyeContactStaticPage.test.ts` (extend; existing assertions stay)

**Out of scope:** `AraMeetingPanel.tsx`; any `src/` runtime code; bundling model files into the repo (CDN-load only — no large binaries committed); committing any test photos.

## Git workflow

- Worktree: `git worktree add ".advisor-worktrees/037" -b advisor/037-eye-contact main` (quote paths — spaces). `npm ci` inside `<worktree>/qualia-shell` for vitest.
- Commits: `feat(eye-contact): real gaze correction via MediaPipe iris warp (clamped, feathered, blink/pose-guarded)`. Do NOT push.

## Steps

1. **Engine wiring**: load FaceLandmarker (pinned CDN version), detect on the
   video stream in the render loop; when unavailable → passthrough + honest
   meter text. Remove the guide line from the corrected pane (keep raw pane
   untouched). Meter shows "correcting" / "idle (looking at camera)" /
   "paused (blink)" / "paused (head turned)" states.
   Verify: page loads locally with no console errors when the engine loads AND
   when the CDN URL is deliberately broken (test both; restore before commit).
2. **Warp implementation** per Approach, including all clamps + slider +
   persistence.
   Verify: with the photo demo mode (Step 3 can be built first if easier), a
   portrait with averted gaze shows the iris plausibly re-centered with no
   visible seams, no eyelid distortion, no change outside the eye region —
   capture before/after screenshots to files and list their paths in your
   report (use any CC-licensed or generated portrait photo locally; do NOT
   commit it).
3. **Photo demo mode** ("Test with a photo" input) running the same pipeline.
4. **Tests**: extend `eyeContactStaticPage.test.ts` — keep every existing
   assertion; add: page references `FaceLandmarker`/tasks-vision; contains the
   strength slider control id; contains blink/pose guard identifiers; does NOT
   contain the old guide-line drawing (assert removal marker of your choice).
   Verify: focused test passes; full `npx vitest run` green.

## Done criteria

- [ ] Focused + full vitest green (Mac)
- [ ] Local manual check: engine loads, corrected pane differs from raw only in the eye region; before/after screenshots saved and listed
- [ ] CDN-failure path shows honest "unavailable" state (screenshot or console evidence)
- [ ] No new files besides the two in-scope; no binaries committed; committed on the branch
- [ ] Report lists: pinned CDN version + origins (for future CSP), screenshot paths, and any tuning constants you changed from the plan's defaults with one-line reasons

## STOP conditions

- MediaPipe tasks-vision cannot run from CDN in this page (module/CORS errors after a reasonable attempt) — report the exact errors; do not vendor large files as a workaround.
- The 2D-canvas warp fundamentally cannot avoid visible seams (explain what you tried) — propose the WebGL step, don't silently build it.
- Existing test assertions conflict with the new page — report rather than deleting assertions.

## Maintenance notes

- Final quality judgment is the OWNER's (aesthetic bar: "natural, not a filter"). Reviewer verifies mechanics + screenshots; Ilya does the live-camera pass and tunes the strength slider.
- If CSP is ever flipped to enforcing, add the pinned CDN + Google model-asset origins to `script-src`/`connect-src` in `netlify.toml`.
- Candidate follow-up: pipe the corrected canvas as a `MediaStream` (canvas.captureStream) into AraMeeting's actual call path — this plan only fixes the preview/settings page.
