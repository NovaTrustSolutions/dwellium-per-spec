# Plan 042: Keyless local photo-avatar provider (default) — no Anam key required

> **Executor instructions**: Follow step by step; verify every step. On STOP
> conditions, stop and report. Commit in the worktree per the git workflow.
> SKIP updating `plans/README.md` — the reviewer maintains the index.
>
> **Repo**: FRONTEND only. Base branch `advisor/040-avatar-harness-fe` @ `fed620a`
> (worktree `.advisor-worktrees/040-fe` — reuse it). Commit ON TOP. Planned 2026-07-04.
>
> **Drift check**: `git log --oneline -2` in the worktree must show `fed620a` then `5efd17c`.

## Status

- Priority P1 (owner directive: "I don't want to have an Anam key")
- Effort: L · Risk: MED (novel canvas animation; mitigated: additive provider behind the existing adapter seam)
- Depends on: plan-041 state (the current branch HEAD)
- Planned at: `fed620a`, 2026-07-04

## Why this matters

The owner wants interactive photo avatars with ZERO API-key requirement. The
harness (plans 040/041) already defines an `AvatarProviderAdapter` seam with
`AnamAdapter` as sole implementation — Anam requires a key by nature. This plan
adds `LocalPhotoAvatarAdapter`: upload a photo → an animated talking head
rendered entirely in-browser (canvas warping + built-in browser speech), brain =
the user's EXISTING per-user LLM keys via `llmClient` (already in the vault for
Stella/ThoughtWeaver — no NEW key), voice = the browser's built-in
`speechSynthesis` (keyless). Local becomes the DEFAULT provider; Anam stays as
an optional upgrade only if a key happens to exist. Honest framing: local mode
is an expressive animated portrait (blinks, head sway, lip motion synced to
speech), not Anam-grade neural video — the UI must not pretend otherwise.

## Current state (read all first — on the branch)

- `src/components/AvatarHarness/AvatarHarness.tsx` — states incl. `unconfigured`
  (vault CTA) — this state DISAPPEARS for local mode (local always works).
- `src/components/AvatarHarness/AnamAdapter.ts` — the adapter interface lives
  here (connect/disconnect/mute/talk + events). Extract the interface to
  `providerTypes.ts` if not already separate.
- `src/components/AvatarHarness/AvatarSetupPanel.tsx` — photo upload + consent
  checkbox (KEEP), Anam voice picker, profile save to `avatarProfilesStore`.
- `src/lib/avatarProfilesStore.ts` — per-user profiles; add `provider:
  'local' | 'anam'` (default 'local') and `photoDataUrl?: string` (the local
  provider's source image, ≤2MB downscaled client-side before store — One Save
  payload discipline) + `browserVoiceURI?: string`.
- `src/lib/llmClient.ts` — `callLlm(req, bundle.llm)` routing to the user's
  active provider; consumers: ThoughtWeaver/FactCheck/Stella. The local avatar
  brain uses THIS (system prompt from the profile).
- MediaPipe precedent: `public/__eye-contact/index.html` pins
  `@mediapipe/tasks-vision@0.10.35` (CDN ESM + Google-hosted
  face_landmarker.task) with IMAGE-mode landmarking AND feathered clipped
  region-warp code — the exact warp technique to reuse (in-app this time).
  CSP is report-only; note origins in the report.
- Repo teardown discipline: unmount must cancel rAF, close AudioContexts, stop
  recognition/synthesis.

## Approach (decided)

**`LocalPhotoAvatarAdapter.ts`** implementing the same adapter interface:
- `connect(profile, videoOrCanvasHost)`: one-time FaceLandmarker IMAGE pass on
  `photoDataUrl` → cache landmarks (mouth ring, eye rings, face oval). Start a
  rAF loop rendering to a `<canvas>` (the harness renders canvas for local,
  video element for Anam):
  - Idle life: blink every 2–6 s (eyelid-region vertical squash, feathered
    clip — reuse the eye-contact warp approach), breathing/head sway (whole
    image ±0.6° rotation + 1–2 px translate on slow sine), occasional gaze
    micro-shift (iris warp, subtle).
  - Speaking: mouth-region warp driven by a viseme envelope — jaw-open scale +
    slight width variation inside a feathered mouth clip. Envelope source:
    `speechSynthesis` boundary events (per word/char) + syllable-approximation
    oscillator (~9–12 Hz modulated), eased; mouth returns to rest between
    utterances. No overlays, no drawn cartoon mouth — warp the photo's own
    pixels only (the naturalness rule from the eye-contact work).
- `talk(text)`: enqueue → `SpeechSynthesisUtterance` (voice = profile's
  `browserVoiceURI` or default; expose rate ~1.0) synced with the envelope.
- Conversation loop in the harness for local mode: text input always; mic
  button uses `webkitSpeechRecognition`/`SpeechRecognition` when available
  (keyless) → transcript → `callLlm` with profile systemPrompt (+ short
  rolling history, last ~10 turns) → `talk(reply)`. If no LLM key configured,
  fall back to a fixed friendly line telling the user to add one in Settings —
  but AVATAR STILL ANIMATES (speech works regardless).
- `disconnect()`: cancel rAF, cancel speech, stop recognition, release image.

**Provider selection**: profile.provider defaults 'local'. SetupPanel gains a
provider segment ONLY when an Anam key exists in the vault (`Local (built-in)`
| `Anam (your key)`); with no key, no mention of Anam anywhere in the flow.
Voice picker: browser voices (`speechSynthesis.getVoices()`, async-safe) for
local; Anam voices only in anam mode. Consent checkbox stays for BOTH.

**Harness states for local**: `no-photo` (CTA → setup panel) → `live`
(canvas animating immediately — idle life even before any speech) → error.
The vault-CTA `unconfigured` state applies ONLY when provider==='anam'.

## Commands

| Purpose | Command (in `qualia-shell/`) | Expected |
|---|---|---|
| Typecheck | `npx tsc -b` | 0 |
| Focused | `npx vitest run src/test/avatarHarness.test.tsx src/test/localAvatarAdapter.test.ts` | pass |
| Full | `npx vitest run` | green |
| Gate | repo root `SMOKE_TEST_PORT=3210 bash Scripts/gate.sh` | GREEN |

## Scope

**IN**: `src/components/AvatarHarness/*` (LocalPhotoAvatarAdapter.ts new;
providerTypes.ts extraction; Harness + SetupPanel updates), `src/lib/avatarProfilesStore.ts`
(fields), `src/test/localAvatarAdapter.test.ts` (new), `src/test/avatarHarness.test.tsx`
(update), `src/test/avatarProfilesStore.test.ts` (update if shape changed).
**OUT**: llmClient.ts internals; integrationsStore/ApiKeysPanel (the Anam card
STAYS as optional — untouched); ARAConsole/StellaAgent wiring (already mount
the harness — they inherit local mode); any new npm dependency; backend.

## Git workflow

Same branch `advisor/040-avatar-harness-fe`, worktree `.advisor-worktrees/040-fe`.
Commit: `feat(avatar): keyless local photo-avatar provider (default) — canvas talking head, browser TTS/STT, llmClient brain`. Do NOT push. Edit ONLY worktree paths.

## Steps

1. Extract `providerTypes.ts` (interface + events) — AnamAdapter conforms unchanged. Verify: tsc 0.
2. Profiles store fields (`provider` default 'local', `photoDataUrl`, `browserVoiceURI`) + client-side downscale util (longest edge 768px, JPEG ~0.85) used by SetupPanel. Verify: tsc 0 + store tests updated/passing.
3. `LocalPhotoAvatarAdapter.ts` per Approach (landmark once, rAF life, viseme envelope, talk queue, full teardown). Verify: tsc 0.
4. Harness + SetupPanel integration per Approach (provider default local; no Anam mention without a key; canvas host; states). Verify: tsc 0; focused avatarHarness tests updated/passing.
5. Tests — `localAvatarAdapter.test.ts` (jsdom; mock FaceLandmarker module + speechSynthesis + rAF): connect resolves with cached landmarks and starts loop; talk() speaks via mocked synthesis and drives envelope >0 during utterance; disconnect cancels rAF + speech (spies); no-LLM-key fallback line spoken; profile round-trip with photoDataUrl. avatarHarness.test.tsx: local provider live WITHOUT any vault key (explicitly empty vault); anam path unchanged when key present. Verify: focused → full → gate GREEN.
6. Visual sanity (best-effort, like 037): serve the built app or a minimal harness page if feasible; else rely on jsdom + owner live pass — say which.

## Done criteria

- [ ] tsc/full vitest/gate GREEN
- [ ] Harness reaches `live` with an EMPTY vault (test-pinned) — the "no key" requirement
- [ ] No Anam mention in the default (keyless) setup flow (assert on rendered text)
- [ ] Teardown spies pass (rAF + speech + recognition)
- [ ] Scope-clean diff vs `fed620a`; committed
- [ ] Report: tuning constants (blink interval, sway amplitude, envelope Hz), CSP origins, deviations

## STOP conditions

- MediaPipe IMAGE-mode landmarking cannot run in the app context (module/CSP/worker errors after reasonable attempts) — report exact errors; do NOT ship a degraded no-landmark blob.
- speechSynthesis boundary events prove unusable for the envelope in Chromium — fall back to time-based syllable estimation from text length (documented), which is acceptable; STOP only if NO envelope source works.
- Full-suite failures outside touched files.

## Maintenance notes

- Local mode = expressive animated portrait; Anam = neural video upgrade. Keep the copy honest.
- Reviewer: teardown, empty-vault live test, and that the photo downscale keeps One Save payloads sane.
- Follow-ups: WebGL warp quality pass; ElevenLabs-style TTS as a third voice option via existing vault keys; wiring more agents.
