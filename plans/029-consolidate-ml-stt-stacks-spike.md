# Plan 029 (SPIKE): Consolidate the two in-browser ML/STT stacks (moonshine vs transformers)

> **Executor instructions**: This is a **measurement spike** — the deliverable is a decision
> doc backed by measured numbers, NOT a dependency removal. Do not delete any dependency in
> this plan. Honor STOP conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" && git diff --stat 730c82a..HEAD -- qualia-shell/package.json qualia-shell/src/components/TranscriptionHub`

## Status

- **Priority**: P3 (direction)
- **Effort**: S (spike)
- **Risk**: LOW (measurement only; no removal)
- **Depends on**: none
- **Category**: direction / perf
- **Planned at**: `730c82a`, 2026-07-02

## Why this matters

The app ships two ONNX-on-WASM ML stacks — `moonshine` and `@huggingface/transformers` —
which together add ~21 MB of duplicated WASM (grounded in `plans/README.md`'s direction note
and plans 005 + 009, which lazy-load them separately). If one library can cover live
transcription as well as the other, the app can drop a dependency and ~21 MB of download. But
this is only worth doing if the surviving library genuinely matches on latency and accuracy —
so this spike **measures** before anyone removes anything.

## Current state

- `qualia-shell/package.json` — depends on both `moonshine` and `@huggingface/transformers`
  (confirm exact names/versions:
  `grep -n "moonshine\|transformers" qualia-shell/package.json`).
- `qualia-shell/src/components/TranscriptionHub/` — the live-transcription widget; it uses
  one of the two stacks (confirm which:
  `grep -rn "moonshine\|transformers\|pipeline\|onnx" src/components/TranscriptionHub`).
- Lazy-load wiring: plans 008/009 moved these off the main chunk; they load on demand.
- `plans/README.md` direction note describing the consolidation idea and the ~21 MB estimate.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Find usages | `grep -rn "moonshine\|@huggingface/transformers" src` | lists the call sites |
| Bundle sizes | `ls -la qualia-shell/node_modules/moonshine qualia-shell/node_modules/@huggingface/transformers 2>/dev/null` and inspect built chunk sizes under `build/client/assets` after a build | sizes for the delta estimate |

## Scope

**In scope:**
- `Docs/ML_STT_Consolidation_Spike.md` (create) — the decision doc with measured numbers.
- A throwaway measurement harness (a scratch script or a temporary test) that runs both
  libraries on the same audio sample — NOT committed to the app runtime.

**Out of scope:**
- Removing either dependency, editing `package.json`, or repointing `TranscriptionHub`. Those
  belong to a follow-up build plan IF this spike concludes one library dominates.
- Any change to the live widget behavior.

## Steps

### Step 1: Inventory

Record in `Docs/ML_STT_Consolidation_Spike.md`: which library each feature uses today
(TranscriptionHub live STT, and any other consumer), the installed versions, and the
measured on-disk + built-chunk size of each (from the commands above). Confirm the ~21 MB
figure or correct it.

**Verify**: the doc lists both libraries, their consumers, and real byte sizes.

### Step 2: Capability comparison on one sample

Run both libraries on the SAME short audio sample and record: does each support the
real-time/streaming STT mode TranscriptionHub needs? latency to first token; rough accuracy
on the sample; WASM download size. Keep the harness out of the app runtime (scratch script).

**Verify**: the doc has a side-by-side table (streaming support / latency / accuracy / size)
with actual measured values, not estimates.

### Step 3: Recommendation

Conclude one of: (a) library X strictly covers Y's use → recommend a follow-up build plan to
drop Y and repoint (name the files); (b) neither dominates → recommend keeping both and record
why (the tradeoff), so nobody re-audits this; (c) inconclusive → list what additional
measurement is needed.

**Verify**: the doc ends with an explicit (a)/(b)/(c) recommendation and, for (a), the exact
follow-up steps + files.

## Done criteria

- [ ] `Docs/ML_STT_Consolidation_Spike.md` exists with measured sizes + a capability table
      (streaming, latency, accuracy, WASM size) from a real run on one sample
- [ ] An explicit keep-both / drop-one / need-more-data recommendation is recorded
- [ ] No dependency removed; `package.json` unchanged (`git diff qualia-shell/package.json`
      empty)
- [ ] `plans/README.md` updated (and, if recommendation is "keep both", added to the
      "considered and rejected" section so it isn't re-audited)

## STOP conditions

- Both libraries turn out to serve genuinely different needs (e.g. one is STT, the other is
  embeddings/NLP, not interchangeable) — record that in the doc as recommendation (b) and
  STOP; do not force a consolidation.
- The measurement harness would require adding a dependency or changing the app runtime —
  keep it as an isolated scratch script; do not modify the app to measure it.

## Maintenance notes

- If the follow-up build plan drops one library, the lazy-load wiring from plans 008/009 and
  the `TranscriptionHub` import must be repointed together, and the bundle delta re-measured
  to confirm the ~21 MB saving materialized.
- Record the decision in `plans/README.md` so this isn't re-investigated next audit.
