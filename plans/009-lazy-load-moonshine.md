# Plan 009: Lazy-load the moonshine STT engine so it leaves the TranscriptionHub chunk

> **Executor instructions**: Follow step by step; run each verification. This touches
> the live recording path — the live smoke in Step 4 is mandatory. Obey STOP conditions.
> Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/components/TranscriptionHub/TranscriptionHub.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (recording path)
- **Depends on**: plan 005 (declare `@huggingface/transformers`) should land first, since moonshine pulls it transitively
- **Category**: perf
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

`TranscriptionHub.tsx` statically imports `MicrophoneTranscriber` from
`@moonshine-ai/moonshine-js` at module top level. That static import drags moonshine's
model glue + ONNX bindings into the TranscriptionHub chunk, which the last build emitted
at **2.37 MB** (the largest chunk in the app). Most users open the Transcription widget
without ever starting live recording, yet they pay the full 2.37 MB to mount it.
Converting the moonshine import to a dynamic `import()` inside the start-recording
handler means the heavy engine loads only when a user actually records — mirroring how
the same file already lazy-imports `@huggingface/transformers` in `speakerEmbedder.ts`
and `tesseract.js` in `ocr.ts`.

## Current state

- `qualia-shell/src/components/TranscriptionHub/TranscriptionHub.tsx:9`:
  ```ts
  import { MicrophoneTranscriber } from '@moonshine-ai/moonshine-js';
  ```
- The component already has moonshine loading state (search the file: `grep -n "moonshine\|Moonshine\|MicrophoneTranscriber" TranscriptionHub.tsx`) and a `moonshineRef` that is `.stop()`-ed in the unmount cleanup (`:2219-2221`). Find where `new MicrophoneTranscriber(...)` is constructed — that is the single place that needs the engine, and where the dynamic import belongs.
- Precedent in the SAME directory: `speakerEmbedder.ts:97` does `const tjs = await import('@huggingface/transformers')`; `ocr.ts` does `await import('tesseract.js')`. Match that pattern.
- Build evidence: `build/client/assets/TranscriptionHub-*.js` ≈ 2.37 MB at `a619279`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Find moonshine usage | `grep -n "moonshine\|MicrophoneTranscriber" qualia-shell/src/components/TranscriptionHub/TranscriptionHub.tsx` | the import + construction site(s) |
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run TranscriptionHub` | pass |
| Build + measure (Mac) | `cd qualia-shell && npm run build 2>&1 \| grep -i "TranscriptionHub-"` | the TranscriptionHub chunk should be much smaller; a separate moonshine/transformers chunk appears |

## Scope

**In scope**: `qualia-shell/src/components/TranscriptionHub/TranscriptionHub.tsx` only.

**Out of scope**:
- `speakerEmbedder.ts` / `ocr.ts` (already lazy).
- Removing or replacing moonshine (that's a separate *direction* spike — "consolidate the two ML stacks"; do not attempt here).
- Changing recording behavior/UX beyond adding an async load step.

## Git workflow

- Branch: `advisor/009-lazy-moonshine`
- Commit: `perf(transcription): dynamic-import moonshine so it leaves the 2.37MB main chunk`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Convert the static import to a type-only import

Change line 9 so the **type** is still available at compile time but the runtime module is not statically bundled:
```ts
import type { MicrophoneTranscriber as MicrophoneTranscriberType } from '@moonshine-ai/moonshine-js';
```
(Use the type only where annotations need it, e.g. `moonshineRef` typing.)

**Verify**: `grep -n "import type .*moonshine" TranscriptionHub.tsx` present; `grep -n "^import { MicrophoneTranscriber }" TranscriptionHub.tsx` gone.

### Step 2: Dynamically import at the construction site

At the place where `new MicrophoneTranscriber(...)` is called (inside the start-recording handler), load the module first:
```ts
const { MicrophoneTranscriber } = await import('@moonshine-ai/moonshine-js');
const transcriber = new MicrophoneTranscriber(/* …existing args… */);
```
Make the enclosing handler `async` if it isn't already, and gate the UI with the existing moonshine loading flag while the import resolves (set it true before `await`, false after). Keep all existing recorder wiring identical after construction.

**Verify**: `grep -n "await import('@moonshine-ai/moonshine-js')" TranscriptionHub.tsx` → present and inside the start path (not at module top).

### Step 3: Typecheck, tests, build-measure

**Verify (Mac)**: `npx tsc -b` exit 0; `npx vitest run TranscriptionHub` passes; `npm run build` shows the `TranscriptionHub-*.js` chunk dropping well below 2.37 MB with a separate moonshine/transformers chunk.

### Step 4: Live smoke (Mac, mandatory)

`npm run preview`, open the Transcription widget, start live recording, speak — confirm transcription still works (a brief load delay on first record is expected and acceptable), and stopping/closing still tears down cleanly (no console errors).

## Test plan

- `TranscriptionHub` tests are largely browser-API-guarded; ensure the existing suite (`src/test/` files referencing TranscriptionHub) still passes. If a test imported `MicrophoneTranscriber` directly, update it to the dynamic shape or mock `import('@moonshine-ai/moonshine-js')`.
- Verification: `npx vitest run TranscriptionHub` → all pass.

## Done criteria

- [ ] No static `import { MicrophoneTranscriber }` at module top; engine loaded via `await import()` in the record path; type-only import retained for annotations
- [ ] `npm run build`: `TranscriptionHub-*.js` is substantially smaller than 2.37 MB; a separate moonshine chunk exists
- [ ] `npx tsc -b` + `npx vitest run TranscriptionHub` green
- [ ] Live smoke: recording works after the deferred load; teardown clean
- [ ] Only `TranscriptionHub.tsx` changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `MicrophoneTranscriber` is referenced at module scope beyond a type annotation (e.g. a top-level `instanceof` or a default value) — STOP and report; the dynamic import won't be clean without refactoring that usage.
- Live recording fails to start after the change and a second fix attempt doesn't resolve it — STOP and report (revert; the recorder wiring is interdependent).
- Tests can't be made to pass without rewriting their intent — STOP and report.

## Maintenance notes

- Direction follow-up (separate, do not bundle): the app runs two browser ML/STT stacks (moonshine and `@huggingface/transformers`), both ONNX-on-WASM. A spike could determine whether one covers live STT, dropping a dependency + ~21 MB of duplicated WASM. Out of scope here.
- Reviewer: confirm the chunk shrank in the build output and that first-record still works.
