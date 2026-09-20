# 062 — Research Lab hardening (run loop, honest surfaces, model pickers)

> **Status (2026-09-19): all 7 phases DONE** on `feat/062-research-lab-hardening` (`ba73f30`…`0e2e46d`,
> 16 files, +1183/−96). Gates G1 → dropdown with free-text fallback, G2 → (a). Research suites 42 → 79 tests;
> strict gate green (tsc · vitest 350 files · builds ×2 · PII · SSR smoke). Executed as ruflo swarm
> `swarm-1789868308259-hhqj8p` (3 lanes). A live standalone render caught a StrictMode `unmountedRef` bug the
> suites missed (fixed + pinned in `0e2e46d`). Live finding: Pollinations answers `403 Missing Turnstile token`
> to browser calls from this Mac while curl gets 200 — see `~/Desktop/Research-Lab-Report/REPORT.md` §4.
> Branch local, ready to push + draft PR; `main` untouched.

Context: the 2026-09-19 read of the Research Lab widget found the security architecture
sound — the structural import firewall (`researchLabImportGuard.test.ts`) and the
checksum-validated outbound scan (`researchLlm/guard.ts`) are both real, and the full
suite is green (42 tests / 6 files at `e0cf535`). Every finding below is in the **run loop
and the result surface**, not the firewall. This plan covers all eleven.

Repo: frontend `~/Downloads/Dwellium -Per Spec` (app in `qualia-shell/`). No backend work —
the research proxy stays out of scope (see Appendix A).

**Standing constraint, every phase.** Anything newly imported by `src/lib/researchLlm/**`
or `src/components/ResearchLab/**` must keep `researchLabImportGuard.test.ts` green. Three
modules are pinned trusted-transit with *exact* import surfaces (`perUserIdentity.ts`,
`oneSaveStore.ts`, `widgetMemory.ts`) — adding an import to any of them fails the firewall
test by design. Prefer reusing `useWidgetMemory` (already pinned) over any new store.

Each phase is independently shippable; order is by user-visible value per line of code.
Every phase ends green on `Scripts/gate.sh`.

---

## Phase 1 — The widget can hang forever: timeout, independent results, cancel

**Problem.** Three defects compound into one stuck UI:
- `fetch` in `qualia-shell/src/lib/researchLlm/client.ts` has **no timeout at all**.
- `execute()` at `qualia-shell/src/components/ResearchLab/ResearchLab.tsx:87` uses
  `Promise.all`, so nothing renders until the slowest of 4 free providers answers.
- `ResearchRunRequest.signal` exists (`client.ts:47`) and the client already returns
  `'Cancelled.'` on `AbortError` — **the widget passes no signal and has no Cancel button.**

One hanging free provider therefore leaves the Run button on "Running…" with zero results
and no way out but a reload, which also loses the session CORS verdicts (Phase 2).

**Change.**
- `client.ts` — default timeout. `runResearchChat` composes the caller's signal with
  `AbortSignal.timeout(RESEARCH_TIMEOUT_MS)` (export the const; 60_000). Use
  `AbortSignal.any([req.signal, AbortSignal.timeout(...)].filter(Boolean))` — both are
  baseline in the app's browser targets and Node 22, so no polyfill, no new dep. Distinguish
  the outcomes: a timeout must read `Timed out after 60s.`, not `Cancelled.` (check
  `AbortSignal.timeout`'s `TimeoutError` name before falling through to the AbortError
  branch at `client.ts:117`).
- `ResearchLab.tsx` `execute()` — results land as they finish. Replace the `Promise.all`
  with a seeded array (`entries.map(...)` → pending placeholders) plus one `.then` per run
  that patches its own slot via functional `setResults`. Keep `running` true until all
  settle. Render a per-card "waiting…" state for slots not yet filled.
- `ResearchLab.tsx` — Cancel. One `AbortController` per run held in a `useRef`; pass
  `controller.signal` into every `runResearchChat`; swap the Run button for Cancel while
  `running`; abort on unmount alongside the existing `flushWidgetMemory` effect
  (`ResearchLab.tsx:60`).
- Log once, after all settle (keeps Phase 3's rule in one place).

**Tests** (`src/test/researchLab.test.tsx`, `src/test/researchClient.test.ts`; vitest fake
timers): a provider that never resolves ⇒ its card shows the timeout error at 60 s while the
*other* provider's answer is already on screen; Cancel mid-run ⇒ `Cancelled.` and `running`
false; unmount mid-run ⇒ controller aborted, no state-update-after-unmount warning.

**Size.** ~70 lines across 2 files. Skips: streaming (`stream: false` stays — v1 decision),
per-provider configurable timeouts (one constant until a provider proves it needs more).

---

## Phase 2 — Stop lying on three surfaces (shortest diff, highest truth-per-line)

**Problem.** Three small dishonesty bugs, all user-visible:
1. `qualia-shell/src/registry/widgetRegistry.ts:788` advertises **"Try 31 free LLM APIs"**.
   **22 ship** (21 keyed + 1 keyless). The tab label is computed, so the user reads
   "Providers (22)" directly under a description promising 31. The stale `31` also sits in
   the header comments of `client.ts`, `researchProviders.ts`, `ResearchLab.tsx`, and
   `researchLabImportGuard.test.ts`.
2. The CORS blocklist is `useState` (`ResearchLab.tsx:66`) — a reload re-enables a provider
   that has stopped allowing browser calls, so the user rediscovers it by burning a run.
3. Clicking a 5th provider chip does nothing, silently (`ResearchLab.tsx:76`).

**Change.**
- Registry description → `'Try 22 free LLM APIs side-by-side in a sandbox that never touches
  property data.'`; fix the four `31` comments in the same commit. Grep gate:
  `grep -rn "31 free" qualia-shell/src` returns nothing.
- Persist the CORS verdicts in the **existing** `useWidgetMemory('research-lab', …)` slice
  (`ResearchLab.tsx:44`) — add `cors: {} as Record<string, CorsStatus>` to the defaults and
  drop the `useState`. Zero new imports, so the firewall test is untouched, and the verdicts
  ride One Save like the rest of the slice. Add a per-entry `checkedAt` epoch and treat a
  verdict older than 7 days as `'unknown'` so a provider that fixes its CORS headers is
  retried instead of blocklisted forever.
- 5th chip ⇒ `setNotice(\`Pick at most ${MAX_SELECTED} providers — deselect one first.\`)`.

**Tests.** `src/test/researchProviders.test.ts`: assert the registry description states the
same count as `RESEARCH_PROVIDERS.length` (a computed assertion, so it can never go stale
again). `src/test/researchLab.test.tsx`: a blocked verdict survives unmount+remount; a
verdict stamped 8 days ago is re-offered; the 5th chip raises the notice.

**Size.** ~35 lines across 3 files. Skips: a background CORS re-probe job (the 7-day expiry
covers it for free).

---

## Phase 3 — History keeps the answers it already stores

**Problem.** `researchLogStore` persists full `responses[]` with text, latency, usage, and
errors — and the History tab renders only the timestamp, provider names, and the prompt
(`ResearchLab.tsx:282`). For a model-*comparison* tool, the past comparisons are the entire
point; the data is on disk and simply never drawn. Separately, `addLogEntry` is called
unconditionally (`ResearchLab.tsx:96`), so an all-errors run burns a slot in the 50-entry cap.

**Change.**
- History entries become expandable: a chevron per entry toggles the stored `responses[]`
  rendered with the *same* markup the Playground results use — extract the result card from
  `ResearchLab.tsx:214-223` into a local `<ResultCard result={…} />` in the same file and use
  it in both places (one component, two call sites; no new file).
- Add a copy-to-clipboard button per response (`navigator.clipboard.writeText`, wrapped in
  try/catch — it throws in a non-secure context) and a "Re-run this prompt" button that loads
  the entry's `prompt` + `systemPreset` back into the Playground slice and switches tabs.
- Skip logging when every response has an `error` and no `text`.

**Tests.** `src/test/researchLab.test.tsx`: a logged entry expands to show the stored answer
text and latency; re-run repopulates the prompt and flips to the Playground tab.
`src/test/researchKeysStore.test.ts` (holds the log tests): an all-error run adds no entry;
a mixed run does.

**Size.** ~90 lines in 2 files. Skips: search/filter over history (50 entries, capped),
export to file (copy button covers the real use).

---

## Phase 4 — Real model pickers instead of typing ids from memory

**Problem.** 21 of 22 providers show a free-text `model id` box whose entire affordance is
the placeholder `llama-3.3-70b-versatile` (`ResearchLab.tsx:187`). No list, no validation —
the user is expected to remember provider-specific model slugs. This is the widget's biggest
usability cliff. Every provider here is OpenAI-compatible, so `GET {baseUrl}/models` answers
it, and the CORS preflight they already pass covers that endpoint too.

**Change.**
- `client.ts` — add `listModels(providerId, apiKey, signal)`: `GET chatCompletionsUrl`-sibling
  `{base}/models`, same keyless/Authorization branching as `runResearchChat`, same
  never-throws contract (`{ models: string[] } | { error, corsBlocked? }`). Reuse the Phase 1
  timeout.
- `ResearchLab.tsx` — on provider select, fetch its model list once per session (cache in a
  `useRef` map, not widgetMemory — model catalogs change server-side and must not sync).
  Render a `<select>` when the list arrives; **fall back to the existing free-text input**
  when the fetch fails, returns nothing, or the provider is keyless with a fixed menu. The
  free-text path stays reachable via a "type a model id instead" toggle — some providers list
  embeddings/rerank models that will not serve chat completions.
- Sort the list, and remember the last-used model per provider in the widgetMemory slice so
  reopening lands on the same pick.

> **Ilya gate G1.** Dropdown-with-free-text-fallback vs leaving free text alone.
> Default if silent: build the dropdown with the fallback (above).

**Tests.** `src/test/researchClient.test.ts`: `listModels` hits `{base}/models`, sends the
Bearer header for keyed providers and none for keyless, and returns `corsBlocked` on a
TypeError. `src/test/researchLab.test.tsx`: a provider whose `/models` returns 3 ids renders
a 3-option select; a provider whose `/models` 404s still renders the free-text input.

**Size.** ~120 lines across 2 files. Skips: model metadata (context window, modality) in the
option labels — ids only until someone asks; persisting catalogs across sessions.

---

## Phase 5 — The housing warning must not decay to zero

**Problem.** `warnShownThisSession` is a module-level latch
(`qualia-shell/src/lib/researchLlm/guard.ts:43`). It is documented as deliberate, but the
consequence is that after the **first** confirm, every subsequent rent-roll paste that page
load goes through **silently**. In a long session the protection is effectively off, and this
is the one guard standing between a free provider and a resident record.

**Change.** Warn once per *distinct prompt* rather than once per page load. Replace the
boolean with a `Set<string>` of hashed prompt texts (a cheap non-crypto hash of the trimmed,
lowercased prompt is enough — this is a UX latch, not a security boundary); a prompt already
confirmed this session stays quiet, a *new* prompt containing housing vocabulary warns again.
`resetGuardSession()` clears the set (existing test escape hatch, unchanged signature).

> **Behavior change, flagged.** `src/test/researchGuard.test.ts:44` currently *pins* the
> old semantics ("warns once …, then stays quiet for the session"). That test is rewritten,
> not deleted — the new pin is "quiet for the same prompt, warns again for a different one."
> Note the change in the commit message; it is a deliberate tightening, not a regression.

**Tests.** Rewrite `researchGuard.test.ts:44`: same prompt twice ⇒ one warning; a *different*
housing-vocabulary prompt ⇒ warns again; confirm still sends the first hit through; a block
still never yields to confirm.

**Size.** ~20 lines in 1 file + 1 test file. Skips: persisting confirmations across reloads
(a reload re-arming the warning is the correct floor).

---

## Phase 6 — Make the catalog regenerable, or stop promising it

**Problem.** `researchProviders.ts:6-11` says "GENERATED-BUT-COMMITTED … the README refreshes
daily; regenerate against it instead" — and **there is no generator anywhere**
(`ls scripts/ | grep -i provider` is empty). The catalog was hand-parsed on 2026-08-28 against
`github.com/NovaTrustSolutions/awesome-freellm-apis` and will drift silently and invisibly.

**Change.** Write the small generator the comment already promises:
`qualia-shell/scripts/regen-research-providers.mjs` — fetch the upstream README, parse the
PERMANENT_FREE + RENEWABLE tables and the Quick Reference base-URL table, and emit a **diff
report to stdout only** (added / removed / changed providers vs the committed file). It must
**not** write the file: the committed set is the CORS-verified subset, and every addition
needs a live preflight probe before it can ship. Add `npm run research:providers:check`.
Keep the verified-subset rule and the exclusion list in the emitted report so the operator
sees why an upstream provider is absent.

**Tests.** `src/test/researchProviders.test.ts`: the script exists and is wired in
`package.json` (cheap existence pin — no network in tests). Parser unit test against a small
committed README fixture.

**Size.** ~110 lines (1 script + 1 fixture + 1 test). Skips: CI scheduling, auto-PRs, and
auto-writing the data file — all three would ship unprobed providers.

---

## Phase 7 — Decide, explicitly, how research keys sit at rest

**Problem.** Research keys are plaintext in `localStorage` under `researchKeys:<uid>`
(`researchKeysStore.ts`). One Save transports ciphertext, so the *sync* path is fine — at rest
locally they are readable by any XSS in the app. These are free-tier sandbox keys, so this may
well be an acceptable trade; right now it is an **implicit** one.

> **Ilya gate G2.** (a) Accept and document — one paragraph in the store header plus a line
> in the Keys tab hint stating keys are stored locally in plaintext and are free-tier only.
> (b) Reuse the app's existing at-rest secret encryption (plan 013's mechanism, whatever
> shipped) for this store too.
> **Default if silent: (a).** It is a two-line change, it is honest, and (b) buys little
> against an attacker who already has script execution in the page.

**Size.** (a) ~5 lines. (b) scoped only if chosen.

---

## Execution notes

- **Order.** 1 → 2 → 3 → 4 → 5 → 6 → 7. Phases 1–3 are the ones worth doing even if the rest
  never ships; together they are roughly 200 lines. Phase 2 is the shortest diff in the plan
  and can go first if someone wants a same-day win.
- **Branch per phase**, `feat/062-research-lab-pN`. Per repo policy the gate must be green
  before commit, and **no push or PR without Ilya's explicit go**.
- **Verify line, every phase:**
  ```
  cd "qualia-shell" && npx vitest run src/test/research*.ts src/test/research*.tsx && Scripts/gate.sh
  ```
  Baseline to beat: 42 tests / 6 files green at `e0cf535`.
- **Firewall check is non-negotiable:** `researchLabImportGuard.test.ts` must stay green in
  every phase. If a phase makes it fail, the change is wrong — not the test.
- **No new dependencies** in any phase. `AbortSignal.any` / `AbortSignal.timeout` (Phase 1),
  `navigator.clipboard` (Phase 3), and `fetch` (Phase 4) are all platform.

## Appendix A — the backend research proxy (NOT in this plan)

`client.ts:14` and `ResearchLab.tsx:16` both name a backend research proxy as the follow-up
that would unlock the 8 excluded providers (nvidia-nim, sambanova, kilo-code, ollama-cloud,
opencode-zen, github-models, glhf-chat, cloudflare-workers-ai) and enable streaming. It exists
**only as code comments — there is no plan file for it** (`grep -rln "research proxy" plans/`
is empty). Backend deploys are blocked, so it stays out of scope here. If it is wanted, it
needs its own plan, and that plan must answer the hard question this widget currently answers
structurally: a proxy puts Dwellium's own backend between the user and providers that may
train on input, which is exactly the coupling `researchLabImportGuard.test.ts` was built to
prevent. Do not fold it into a phase above.
