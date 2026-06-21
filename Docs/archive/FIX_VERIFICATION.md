# Fix + Verification Log — ThoughtWeaver "doesn't send"

**Session:** Claude (Opus), 2026-05-30. Companion to `WHY_GREEN_IS_NOT_WORKING.md`.
**Rule I held myself to:** no claim without the command output that proves it, pasted inline.

---

## What I changed (5 files; source diff is clean and isolated)

```
 M qualia-shell/src/config.ts                                   (+27/-2)
 M qualia-shell/src/components/ThoughtWeaver/ThoughtWeaver.tsx  (+28/-7)
 ?? qualia-shell/src/components/ThoughtWeaver/localCategorizer.ts        (new)
 ?? qualia-shell/src/test/localCategorizer.test.ts                      (new test)
 ?? qualia-shell/src/test/thoughtWeaverCapture.offline.test.tsx         (new test)
```

1. **`localCategorizer.ts`** — a real, deterministic, dependency-free classifier. Sorts a thought into People / Projects / Ideas / Tasks (or honestly `needs_review`) with a confidence and a label, using zero network. This replaces the old "give up" path.
2. **`ThoughtWeaver.tsx`** — the offline tier of `handleCapture` now calls `localCategorize()` instead of filing everything as `needs_review, confidence 0`. Each capture also records **how** it was sorted (`llm` / `backend` / `local`) and the toast shows it ("✨ via your LLM", "🛰 via backend", "💾 sorted locally · offline") — so a failure is visible, not silently swallowed.
3. **`config.ts`** — `API_BASE` no longer hard-defaults to `http://localhost:3000`. In a browser on a non-localhost origin with no `VITE_API_URL`, it now uses the **same origin** (so a deployed build calls its own `/api/*` instead of a localhost it can never reach). SSR-safe via a `typeof window` guard; localhost dev and explicit `VITE_API_URL` are unchanged.

---

## Verification — every step run this session, real output

### 1. Type check (whole project, incl. SSR entry) — PASS
```
$ npx tsc -b
tsc exit: 0
```

### 2. New classifier unit tests — 10/10 PASS
Real inputs land in the right bucket; ambiguous text is kept (never the old dead `0`); empty input is `needs_review/0`; output is deterministic.
```
$ npx vitest run src/test/localCategorizer.test.ts
 ✓ files action-first sentences as admin/tasks
 ✓ files "need to ... by Friday" as admin/tasks
 ✓ files a person interaction as people, with the name as the label
 ✓ captures a two-word name from "Lunch with Mark Chen"
 ✓ files project/delivery language as projects
 ✓ files speculative "what if" thoughts as ideas
 ✓ files an explicit "Idea:" as ideas
 ✓ keeps ambiguous text as needs_review but still labels it (never confidence 0)
 ✓ returns needs_review/0 for empty input
 ✓ is deterministic — identical input yields identical output
 Test Files  1 passed (1)      Tests  10 passed (10)
```

### 3. Real-component offline test — 1/1 PASS (this is the user's exact scenario)
Renders the **actual** ThoughtWeaver, stubs `fetch` to **reject every call** (no LLM key, backend unreachable), types a thought, clicks the **real Capture button**, and asserts the thought was sorted and the honest badge shown. This test *can fail* if the wiring regresses — unlike the old gate.
```
$ npx vitest run src/test/thoughtWeaverCapture.offline.test.tsx
 ✓ still sorts the thought into a real bucket and shows it was sorted locally
 Test Files  1 passed (1)      Tests  1 passed (1)
```

### 4. Full test suite — 655 passed, 0 failed (4 shards; no regression)
The suite needs >45s; the sandbox caps bash at 45s, so I ran it in 4 shards. Every shard exit 0.
```
$ npx vitest run --shard=1/4   → Test Files 19 passed   Tests 136 passed   exit 0
$ npx vitest run --shard=2/4   → Test Files 19 passed   Tests 161 passed   exit 0
$ npx vitest run --shard=3/4   → Test Files 18 passed   Tests 162 passed   exit 0
$ npx vitest run --shard=4/4   → Test Files 18 passed   Tests 196 passed   exit 0
                                  ── total: 655 passed, 0 failed ──
```

### 5. Production build with my code — RC=0, and my code is IN the shipped bundle
The in-repo build can't run in this sandbox (the mounted filesystem forbids `unlink()`, which react-router's bundle step needs — an artifact of *this* sandbox mount, not the code; it builds fine on macOS/CI, as the historical gate shows). So I built the same source on the sandbox's native filesystem:
```
$ (native-fs copy) npx react-router build
✓ 1 asset moved from React Router server build to client assets.
✓ built in 2.73s
RC=0
```
Then grepped the built production JS to prove the fix actually shipped:
```
$ grep -rl "local-heuristic" build/client/assets/   → ThoughtWeaver-DRs_priY.js
$ grep -rl "sorted locally" build/client/assets/    → ThoughtWeaver-DRs_priY.js
```

---

## Honest limits of this verification

- **True end-to-end against the real Dwellium backend was not possible here** — that backend is a *separate repo* and is not in this workspace. I did not, and will not, claim "it works against the real backend." What I proved is that the **frontend now functions with no backend at all**, and that the previously-silent failure path is gone.
- **The in-repo `react-router build` and the SSR smoke test (gate stages 3–6) could not run in-sandbox** because the mounted filesystem blocks `unlink()`. I substituted a native-filesystem build of the identical source (RC=0, my code present). On your Mac / CI these stages run normally.
- The mount also blocks deleting files, so several throwaway `build.stale.* / build.partial.* / build.frozen.*` dirs are left in `qualia-shell/` (all gitignored — they won't touch git). On your Mac: `cd qualia-shell && rm -rf build.*` (if one resists, `chflags -R nouchg build.* && rm -rf build.*`).

---

## Reproduce on your machine (the full gate, unmodified)

```
cd qualia-shell \
 && npx tsc -b \
 && npx vitest run \
 && npx react-router build \
 && VITE_APPFOLIO_SEEDS=false npx react-router build \
 && cd .. \
 && node Scripts/verify_no_pii_leak.mjs \
 && SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```

And to *see* the offline fix in the running app: open ThoughtWeaver with no API key set, type a thought, hit Capture — it now sorts into a bucket and the toast reads "💾 sorted locally · offline" instead of silently doing nothing.
```
```
