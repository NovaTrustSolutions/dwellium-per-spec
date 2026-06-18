# Ponytail Audit — `NovaTrustSolutions/dwellium-per-spec`

> One-shot over-engineering audit. **Complexity only** — no correctness, security, or
> performance claims. Lists findings; applies nothing. All findings verified against the
> working tree (callers, imports, git-tracking) on the date below.

- **Date:** 2026-06-18
- **Scope:** repo root + `qualia-shell/` (124,184 lines across 441 non-test source files; 183 test files)
- **Method:** `ponytail-audit` tags — `delete:` `stdlib:` `native:` `yagni:` `shrink:`
- **Two false positives caught during verification (NOT cuttable):** `isbot` is used in `qualia-shell/app/entry.server.tsx` (React Router 7 default); Sentry is wired (`src/main.tsx` init + `Sentry.addBreadcrumb` in 3 Strata modules), so `VITE_SENTRY_DSN` is live.

---

## Findings (ranked — biggest cut first)

| # | Tag | What to cut | Replacement | Path(s) | Size |
|--:|-----|-------------|-------------|---------|------|
| 1 | `delete:` | ~10 stale root process docs (gap-analyses, handoffs, status, verification, "why green isn't working") | move to `Docs/archive/` or drop | `MANUAL_DWELLIUM_GAP_ANALYSIS.md`, `WHY_GREEN_IS_NOT_WORKING.md`, `*HANDOFF*.md`, `*STATUS*.md`, `*VERIFICATION*.md`, `ASTRA_AUDIT.md`, `DOCS_VS_SCRIBE_GAP.md` | ~7,528 lines |
| 2 | `delete:` | 8 superseded shell launchers | replaced by `Scripts/gate.sh` + scheduled tasks | `launch_*_autorun.sh` (6), `autobuild-dwellium.sh`, `launch-autobuild.sh` | ~1,048 lines |
| 3 | `delete:` | dead code, **0 callers** anywhere | nothing | `qualia-shell/src/lib/secretsAdapter.ts` (89), `qualia-shell/src/components/UniversalShell/adapterRegistry.ts` (48) | 137 lines |
| 4 | `delete:` | untracked local cruft — a 1.2 MB build log + throwaway push script | add to `.gitignore` | `autobuild-20260604-024151.log` (1.2 MB), `workspace_zen_gate_push.sh` | — |
| 5 | `yagni:` | `zustand` pulled in for just **2** stores while the repo already has `createLocalStorageStore` (59×) + react-query (64×) | fold both into the house store, drop the dep | `Workspace/workspaceStore.ts`, `Scribe/scribeStore.ts` | −1 dep |
| 6 | `delete:` | unused dependency `@lmstudio/sdk` — **0 imports** repo-wide (only the package.json line) | drop from `package.json` | `qualia-shell/package.json` | −1 dep |
| 7 | `yagni:` | a second API-base env var `VITE_API_BASE` duplicating `VITE_API_URL`, inlined past the central config helper | import `config.ts` / `config/api.ts` instead | `StrataDashboard/modules/TrelloCardModal.tsx`, `StrataDashboard/modules/StatusCheckModule.tsx` | −1 env var |
| 8 | `shrink:` | 3 copies of numeric `clamp(n, min, max)` | one shared util in `lib/` | `Shell/HalocronWorkspaces.tsx:25`, `Scribe/scribeLayoutStore.ts:63`, `ARAConsole/voiceVisualizerThemes.ts:39` | ~−8 lines |
| 9 | `stdlib:` | hand-rolled deepClone via `JSON.parse(JSON.stringify(...))` | `structuredClone()` (present in runtime) | `context/HierarchyContext.tsx:48`, `utils/integrationsCrypto.ts:159` | ~−2 lines |
| 10 | `stdlib:` | id generation via `Math.random().toString(36)` (~33 sites) while `crypto.randomUUID()` is already used in ~33 others | standardize on `crypto.randomUUID()` | repo-wide | consistency |

**net: −1,200 lines code/scripts, −7,500 lines stale docs, −1 dep firm (`@lmstudio/sdk`), −1 dep possible (`zustand`).**

---

## Not one-lineable — flagged, not faked

- **Shrink targets needing their own pass** (size alone ≠ over-engineering, but this is where speculative abstraction hides):
  `TranscriptionHub.tsx` 3,274 · `ARAConsole.tsx` 2,930 · `StellaAgent.tsx` 2,916 · `StrataDashboard/modules/PropertiesModule.tsx` 2,584 · `InboxZero.tsx` 2,441. Run a focused `ponytail-audit` on one to get specific cuts.
- **`Docs/` is 203 files / 5.5 MB.** Archivable, but parts are referenced by `CLAUDE.md` — a judgment call, not a blind delete.

## Distinct-but-related (NOT counted above — different `clamp`s, kept on purpose)
`CommandPalette.tsx:146` `clamp(text, max)` (string truncate), `PDFGear/coords.ts:109` `clampRectToPage(...)`, `costKpiStore.ts:31` `clampKpi(...)` — same name, different jobs. Leave them.

---

## Verification evidence (greps run on 2026-06-18)

- `@lmstudio/sdk`: `grep -rl "@lmstudio"` repo-wide (excl `node_modules/.git/build/dist/electron`) → only `qualia-shell/package.json`. Confirmed unused.
- `isbot`: used in `qualia-shell/app/entry.server.tsx` → **kept**.
- `adapterRegistry.ts` / `secretsAdapter.ts`: caller count 0 (grep of basename across `src`, excl self + tests).
- `zustand`: `from 'zustand'` in exactly 2 source files; `react-query` hooks in 64 sites; `createLocalStorageStore` in 59 files.
- `VITE_API_BASE` vs `VITE_API_URL`: both present; `VITE_API_BASE` only in the 2 Strata modules listed (each `|| 'http://localhost:3000'`), bypassing `config.ts`.
- dead scripts / scratch docs: `git ls-files` confirmed tracked; `wc -l` totals 1,048 and 7,528 respectively.
- `structuredClone`: `typeof structuredClone === 'function'` in the build runtime.

## Scope caveat
`ponytail-audit` is complexity-only and one-shot. These are **candidates** — verify references before cutting. Correctness bugs, security holes, and performance belong to a separate review pass.

---

## Deep-dive: `TranscriptionHub.tsx` (3,274 lines)

One component doing ~6 jobs (live recording, file upload, speaker library, fact-check, legal shield, meeting coaching, post-meeting AI) with **43 `useState` + 30 `useCallback` + 15 `useEffect` + 13 `useRef`**. Findings ranked:

```
shrink: 9 near-identical fetch fns — every one is setLoading(true) → reset → fetch POST `${API_TRANSCRIBE}/<path>` (+headers, optional JSON body) → if(json.success) setX(json.data…) → catch console.error → setLoading(false). collapse to one postAi(path, {body, set, setLoading, pick}). [TranscriptionHub.tsx:2086-2223] ~-95 lines
yagni: the post-meeting AI cluster (9 result states + 9 *Loading flags + the 9 fns + openPostMeetingPanel reset) is a self-contained machine living inside a 3,274-line file. extract to a usePostMeetingAi(logId) hook in its own file. [TranscriptionHub.tsx:378-390 + 2137-2233] ~250 lines out of the file
shrink: 25 hand-written `method:'POST'` blocks repeat the same headers + JSON.stringify + json.success unwrap. one postJson(path, body) helper. [TranscriptionHub.tsx, file-wide] ~-60 lines
shrink: 3 time formatters where formatTimestamp == formatTime minus the hours branch, and formatSrtTimestamp == same + milliseconds. one hms(seconds, {ms?}). [TranscriptionHub.tsx:818-838] ~-15 lines
delete: ~30 lines of commented-out code + debug console.log (57 block-comment markers, ~75 commented lines, 33 console.* in the file). keep the console.error in catches. [TranscriptionHub.tsx, file-wide]
net: ~-180 lines in place + ~250 extractable to a hook; 0 deps.
```

**Not dead (checked, kept):** both `SpeakerLibraryPanel` (in-file, ~100 lines) and the imported `LocalVoiceLibrary` are each rendered once — two speaker-library UIs coexisting. Not a blind cut, but worth a human dedupe decision.

**Caveat for the `postAi` collapse:** the 9 fns differ in small ways the helper must preserve — reset value (`null` vs `[]`), body shape (none / `{mode}` / `{tone}` / `{documentType}` / `{meetingTitle}`), and result path (`json.data` vs `json.data.summary` vs `json.data.content` vs `{content,title}`). Pass a per-call `pick` selector; don't flatten blindly.
