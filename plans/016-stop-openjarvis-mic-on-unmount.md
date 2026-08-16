# Plan 016: Stop the OpenJarvis microphone when the panel unmounts

> **Executor instructions**: Follow step by step; run each verification. Obey STOP
> conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/components/OpenJarvis/OpenJarvis.tsx`
> If it changed, re-read and compare the excerpts; on mismatch STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (correctness / privacy)
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

OpenJarvis (the floating assistant) holds an active microphone `MediaStream` in
`streamRef`. The only place the tracks are stopped is inside the recorder's `onstop`
handler — i.e. only when the user explicitly stops recording. If the panel unmounts (a
route/layout change, or the component being torn down) while `speechState === 'recording'`,
the mic track stays live: the OS microphone indicator stays on and the device is held
until garbage collection. That's a privacy-visible leak. The fix is a one-line unmount
cleanup effect.

## Current state

- `qualia-shell/src/components/OpenJarvis/OpenJarvis.tsx:590`: `const streamRef = useRef<MediaStream | null>(null);`
- `OpenJarvis.tsx:883` (inside `handleMicClick`'s `recorder.onstop`, the stop-recording branch):
  ```ts
  streamRef.current?.getTracks().forEach((t) => t.stop());
  ```
  This is the ONLY track-stop. It runs only when the user taps the mic to stop.
- The lifecycle effects at `:606`, `:617` (health check — has its own cleanup), `:632`, `:638`, `:646`, `:651` (keydown — has cleanup) contain **no** unmount cleanup that stops `streamRef`. There is no dedicated unmount effect for the mic.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run OpenJarvis` | pass |
| Grep guard | `grep -n "getTracks().forEach" qualia-shell/src/components/OpenJarvis/OpenJarvis.tsx` | now appears in BOTH onstop and an unmount effect |

## Scope

**In scope**: `qualia-shell/src/components/OpenJarvis/OpenJarvis.tsx` (add one unmount effect).

**Out of scope**:
- The recording flow itself (`handleMicClick`) — leave its behavior unchanged.
- Other widgets' mic/stream handling (TranscriptionHub has its own unmount cleanup; not this plan).

## Git workflow

- Branch: `advisor/016-openjarvis-mic-cleanup`
- Commit: `fix(openjarvis): stop microphone tracks on unmount (privacy leak)`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Add an unmount cleanup that stops the mic

In the "Lifecycle" effects block (near `:604-661`), add a mount-once effect whose cleanup stops any live tracks:
```ts
// Release the mic if the panel unmounts mid-recording.
useEffect(() => () => {
  streamRef.current?.getTracks().forEach((t) => t.stop());
  streamRef.current = null;
}, []);
```
Place it alongside the other lifecycle effects. Do not remove the existing `onstop` stop at `:883` (that still handles the normal stop path).

**Verify**: `grep -n "panel unmounts mid-recording\|streamRef.current = null" qualia-shell/src/components/OpenJarvis/OpenJarvis.tsx` → present; `npx tsc -b` exit 0.

### Step 2: Tests

**Verify (Mac)**: `npx vitest run OpenJarvis` → existing tests pass.

## Test plan

- If feasible in the existing `OpenJarvis` test setup, add a test that mounts the component, assigns a fake `MediaStream` (an object with a `getTracks()` returning a track with a `stop` spy) to the streamRef path, unmounts, and asserts `stop` was called. Mic acquisition is browser-only, so if the test harness can't reach `streamRef` cleanly, rely on read-verification + the manual smoke below and note it.
- Manual smoke (Mac): open OpenJarvis, start mic recording, then close/unmount the panel without stopping — confirm the OS mic indicator turns off.
- Verification: `npx vitest run OpenJarvis` → pass.

## Done criteria

- [ ] An unmount effect stops `streamRef` tracks and nulls the ref
- [ ] `npx tsc -b` exit 0; `npx vitest run OpenJarvis` green
- [ ] The existing `onstop` track-stop at `:883` is unchanged
- [ ] Only `OpenJarvis.tsx` changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `streamRef` is reassigned/owned somewhere unexpected such that nulling it on unmount breaks an active flow — STOP and report (it shouldn't: it's a component-scoped ref).

## Maintenance notes

- Pattern to reuse: any component that acquires `getUserMedia` must stop its tracks in an unmount cleanup, not only on the explicit stop path.
- Reviewer: confirm the cleanup is mount-once (`[]` deps) so it fires on unmount, and that normal stop-recording still works.
