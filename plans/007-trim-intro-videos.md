# Plan 007: Stop eager-loading intro videos; delete the dead v1

> **Executor instructions**: Follow step by step; run each verification. The
> "unreferenced" check before deleting is mandatory. Obey STOP conditions. Update
> this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/components/HydraAI/HydraIntro.tsx qualia-shell/src/components/Shell/HalocronOsIntro.tsx qualia-shell/public/assets`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

Beyond the login video (plan 006), the deploy ships ~21 MB of additional intro videos,
some fetched before the user opts in: `hydra-intro.mp4` (6.2 MB) uses `preload="auto"`
so it pre-fetches whenever the Hydra widget mounts; `halocron-intro.mp4` (3.1 MB) looks
like a stale **v1** that nothing references (only `halocron-intro-v2.mp4` is used);
`ara-intro.mp4` (21 MB) is large and recent. Switching `preload` to `none` + a poster and
deleting the dead v1 trims pre-fetched weight at near-zero risk.

## Current state

- `qualia-shell/src/components/HydraAI/HydraIntro.tsx:56`:
  ```tsx
  <video ref={videoRef} className="hydra-intro__video" autoPlay playsInline preload="auto">
      <source src="/assets/hydra-intro.mp4" type="video/mp4" />
  ```
- `qualia-shell/src/components/Shell/HalocronOsIntro.tsx:20`: `const VIDEO_SRC = '/assets/halocron-intro-v2.mp4';` — **v2** is the one used. `halocron-intro.mp4` (v1) is suspected dead.
- Large media (confirm with `find qualia-shell/public -size +1M -name '*.mp4' -exec ls -lh {} +`):
  `ara-intro.mp4` ~21 MB, `hydra-intro.mp4` ~6.2 MB, `halocron-intro-v2.mp4` ~3.5 MB, `halocron-intro.mp4` ~3.1 MB.
- `ara-intro.mp4` is rendered by an `AraIntroVideo` component (find it with `grep -rn "ara-intro.mp4" qualia-shell/src`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| List big videos | `find qualia-shell/public -size +1M -name '*.mp4' -exec ls -lh {} +` | the four files above |
| Check v1 referenced | `grep -rn "halocron-intro.mp4" qualia-shell/src qualia-shell/app qualia-shell/index.html` | should be ZERO hits (v2 has its own name) |
| Find ara-intro usage | `grep -rn "ara-intro.mp4" qualia-shell/src` | the AraIntroVideo source line |
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Build (Mac) | `cd qualia-shell && npm run build` | exit 0 |

## Scope

**In scope**:
- `qualia-shell/src/components/HydraAI/HydraIntro.tsx` (preload + poster)
- the `AraIntroVideo` component file that renders `ara-intro.mp4` (preload + poster) — found via grep
- delete `qualia-shell/public/assets/halocron-intro.mp4` ONLY if the reference check is zero

**Out of scope**:
- `nebula-bg.mp4` (plan 006).
- `halocron-intro-v2.mp4` (in use — leave it).
- Re-encoding any video (optional follow-up; needs ffmpeg).

## Git workflow

- Branch: `advisor/007-trim-intro-videos`
- Commit: `perf(media): preload=none on intro videos + remove dead halocron-intro v1`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Switch `hydra-intro` to lazy preload + poster

In `HydraIntro.tsx:56`, change `preload="auto"` → `preload="none"` and add a `poster` (use an existing image asset, or omit if none fits — the key change is `preload`). Keep `autoPlay playsInline` (it autoplays when the intro actually shows; the component already gates rendering with `if (!show) return null`).

**Verify**: `grep -n 'preload="none"' qualia-shell/src/components/HydraAI/HydraIntro.tsx` → present; no `preload="auto"` remains there.

### Step 2: Same treatment for `ara-intro`

In the `AraIntroVideo` file from the grep, set `preload="none"` (+ poster if an asset fits). Do not change its show/skip logic.

**Verify**: `grep -rn 'preload="auto"' qualia-shell/src` → no hits for the ara/hydra intros.

### Step 3: Delete the dead v1 (only if unreferenced)

Run the v1 reference check. If it returns ZERO hits, `git rm qualia-shell/public/assets/halocron-intro.mp4`. If it returns ANY hit, do NOT delete — report it (STOP condition).

**Verify**: `git status --short` shows the deletion (`D`); `grep -rn "halocron-intro.mp4" qualia-shell` (excluding `-v2`) → zero.

### Step 4: Build

**Verify (Mac)**: `npx tsc -b` exit 0; `npm run build` exit 0; the build no longer copies `halocron-intro.mp4` into `build/client/assets`.

## Test plan

No unit tests required (preload + asset deletion). If `HydraIntro` has a test, ensure it still passes. Verification = greps + build green.

## Done criteria

- [ ] No `preload="auto"` on the hydra/ara intro videos
- [ ] `halocron-intro.mp4` (v1) deleted IF and only if unreferenced; otherwise left and reported
- [ ] `grep -rn "halocron-intro.mp4" qualia-shell/src` (excluding `-v2`) → zero
- [ ] `npx tsc -b` + `npm run build` green
- [ ] Only the intro component files (+ the deleted v1) changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `halocron-intro.mp4` (v1) HAS a reference somewhere — do not delete; report where.
- The `AraIntroVideo` file can't be located from the grep — report; don't guess a file to edit.

## Maintenance notes

- Optional follow-up (ffmpeg): transcode `ara-intro.mp4` (21 MB) and `hydra-intro.mp4` to small teaser loops.
- Reviewer: confirm the intros still play when actually triggered (Hydra widget open; OS entry) — `preload="none"` only defers the fetch, it shouldn't stop playback.
