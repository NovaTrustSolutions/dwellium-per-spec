# Plan 006: Stop the 71 MB login video from loading before the user interacts

> **Executor instructions**: Follow step by step; run each verification. Obey STOP
> conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/components/Auth/LoginScreen.tsx`
> If `LoginScreen.tsx` changed, re-read it; compare the "Current state" excerpt; on mismatch STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

`LoginScreen.tsx` autoplays and loops `nebula-bg.mp4` — a **74,409,677-byte (71 MB)**
file — as a background on the very first screen every unauthenticated visitor sees.
Because it's `autoPlay loop`, the browser fetches it immediately and re-buffers it,
dominating first-load time and burning Netlify bandwidth on the most-hit route. The
fix: don't fetch the video until the user actually interacts (the screen already has a
"Click to Login" overlay), and show a lightweight poster image until then. (The
`BACKLOG.md` "accepts" `nebula-bg.mp4` for *git size* reasons only — that acceptance
does not cover shipping it as an autoplay asset on the entry route. Different problem.)

## Current state

- `qualia-shell/src/components/Auth/LoginScreen.tsx:95-97`:
  ```tsx
  <video className="login-video-bg" autoPlay muted loop playsInline>
      <source src="/assets/nebula-bg.mp4" type="video/mp4" />
  </video>
  ```
- `LoginScreen.tsx:99-103` — a click overlay already exists and sets `hasClicked`:
  ```tsx
  <div className={`login-start-overlay ${hasClicked ? 'is-hidden' : ''}`} onClick={() => setHasClicked(true)}>
      <div className="login-start-text">Click to Login</div>
  ```
  So `hasClicked` (React state) is already available to gate the video.
- A static poster image exists: `qualia-shell/public/assets/hero-bg.png` (~779 KB). Confirm with `ls -la qualia-shell/public/assets/hero-bg.png`.
- File size proof: `ls -la qualia-shell/public/assets/nebula-bg.mp4` → ~74 MB.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Confirm sizes | `ls -la qualia-shell/public/assets/nebula-bg.mp4 qualia-shell/public/assets/hero-bg.png` | ~74 MB video, ~779 KB png |
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run LoginScreen` | pass |
| Build (Mac) | `cd qualia-shell && npm run build` | exit 0 |

## Scope

**In scope**: `qualia-shell/src/components/Auth/LoginScreen.tsx` (the video element + its gating), and `qualia-shell/src/components/Auth/LoginScreen.css` only if a poster background rule is needed.

**Out of scope**:
- Deleting or git-LFS-migrating `nebula-bg.mp4` (the file stays; this is about *when* it loads).
- Re-encoding the video (optional follow-up — see Maintenance; needs ffmpeg the executor may not have).
- Any other component.

## Git workflow

- Branch: `advisor/006-defer-login-video`
- Commit: `perf(login): defer 71MB nebula video until first interaction; poster until then`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Gate the video mount on `hasClicked` and add a poster

Replace the always-on `<video>` so that before interaction the browser shows the poster and does NOT fetch the video; only mount/play it after `hasClicked` is true. Target shape:
```tsx
<video
  className="login-video-bg"
  poster="/assets/hero-bg.png"
  muted loop playsInline
  preload="none"
  autoPlay={hasClicked}
  key={hasClicked ? 'play' : 'idle'}
>
  {hasClicked && <source src="/assets/nebula-bg.mp4" type="video/mp4" />}
</video>
```
The `{hasClicked && <source>}` is the load-gate: with no `<source>` and `preload="none"`, the 71 MB is not requested until the user clicks. (If `LoginScreen` already renders nothing before click, simpler: render the `<video>` only when `hasClicked`. Either approach is fine as long as the network request for `nebula-bg.mp4` does not fire on initial load.)

**Verify**: `grep -n "preload=\"none\"\|poster=" qualia-shell/src/components/Auth/LoginScreen.tsx` → both present; `grep -n "autoPlay muted loop" LoginScreen.tsx` → the old unconditional form is gone.

### Step 2: Confirm no eager fetch (manual, on the Mac)

Run `npm run dev`, open the login screen with the Network tab filtered to `nebula`, and confirm **no request** for `nebula-bg.mp4` before clicking; after clicking "Click to Login", the request fires and the video plays.

**Verify**: pre-click network shows 0 requests for `nebula-bg.mp4`; post-click shows 1.

### Step 3: Typecheck, test, build

**Verify (Mac)**: `npx tsc -b` exit 0; `npx vitest run LoginScreen` passes; `npm run build` exit 0.

## Test plan

- If `LoginScreen.test.tsx` exists, add/extend a test asserting that the `<video>`'s `<source>` is not rendered before the start overlay is clicked (query the DOM for `source[src*="nebula"]` → absent initially), and present after a simulated click. Model after the existing `LoginScreen.test.tsx` structure.
- Verification: `npx vitest run LoginScreen` → all pass including the new assertion.

## Done criteria

- [ ] Initial render does not request `nebula-bg.mp4` (verified in Network tab; and/or the new unit test asserts the `<source>` is absent pre-click)
- [ ] `poster="/assets/hero-bg.png"` shows before interaction
- [ ] `npx tsc -b`, `npx vitest run LoginScreen`, `npm run build` all green
- [ ] Only `LoginScreen.tsx` (+ optional `.css`) changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `hero-bg.png` does not exist at the stated path — STOP and report (pick a different poster with the user rather than guessing).
- The `<video>` is structurally required to be present pre-click for layout reasons and removing the eager `<source>` breaks the layout — STOP and report; a CSS poster background may be needed instead.

## Maintenance notes

- Optional follow-up (needs ffmpeg): transcode `nebula-bg.mp4` to ~2–5 MB (1080p, H.264 CRF ~28) and point the post-click `<source>` at it — that shrinks even the post-click cost. Out of scope here because it requires media tooling.
- Reviewer: the key acceptance is "no `nebula-bg.mp4` request on first paint." Confirm in the Network panel.
