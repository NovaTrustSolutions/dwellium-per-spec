# Handoff — Phase 3a Step 5 (Anthropic round-trip verification)

**To:** the next Claude session
**From:** prior session 2026-05-07 (shipped + verified step 1, step 4, step 4.5; pg/dotenv hotfix)
**You are starting:** Phase 3a Step 5 — only the **manual verification leg**. All wiring is in place and the foundation is confirmed working.

---

## Read order (5-10 min total)

1. **`docs/STATUS.md`** — current project state.
2. **`editor/src/main/llmClient.ts`** — the anthropic adapter is wired and unit-style verified for SQL/cost. Skim it, then go test.
3. **`editor/src/renderer/src/components/chat/ModelSelector.tsx`** — the chat-header dropdown that drives provider/model selection. Read it so you understand how the user switches providers.
4. **`docs/gotcha.md`** — debugging discipline.

You do not need to write code unless verification fails.

---

## What's already done

### Step 1 (commit `a0af8af`) — Postgres schema
`holocron_rag` database with 8 RAG tables, `pgcrypto` extension, idempotent migration via `npm run db:setup`. `HOLOCRON_DB_URI` is in `editor/.env`.

### Step 4 (commit `e067064`) — `llmClient.ts` + cost middleware
- Unified `chat()` entry. Three adapters: OpenAI-compatible (Gemini + LM Studio share) + native Anthropic.
- Streaming via `onToken` callback + `abortSignal`. Anthropic SSE (`content_block_delta` / `message_start` / `message_delta`) parsed.
- Cost middleware writes `rag_operations_log` rows for every cloud call. LM Studio bypasses (local = $0).
- `checkBudget()` reads `daily_budget_usd` ($5 default) + `budget_hard_stop` (false default) from `rag_config`.
- `lm:start` + `lm:complete` + `thread:reset-context` summarizer all delegate to `chat()`.

### Step 4.5 (commit `e7a5307`) — Provider routing fix + chat-header model dropdown
### pg/dotenv hotfix (commit `b067841`) — moved both packages from devDependencies to dependencies so `electron-vite` externalizes them; main bundle dropped 258 KB → 94 KB.

**Verified end-to-end** (Andy's test 2026-05-07): all three providers route correctly. Cost log confirmed via `rag_operations_log`: `gemini-2.5-flash` and `gemini-2.5-pro` both logged on Gemini test sends; LM Studio sends produce no rows (correct — LM Studio bypasses cost logging). The earlier "LM Studio response looks like Gemini" symptom turned out to be Gemma confabulating about its deployment — see gotchas below.


**Bug fixed:** Switching to LM Studio in Settings used to keep streaming from Gemini because the renderer's `inferProvider(baseUrl)` heuristic couldn't always disambiguate. The renderer now passes `provider: activeProvider` and `task: 'chat'` explicitly through the IPC payload; the main process trusts the field. Heuristic fallback remains as defense in depth but never fires in normal flow.

**New chat-header dropdown** (`ModelSelector.tsx`) replaces the static "Agent" label. Options:
- ⚡ LM Studio (local) — always enabled
- ✦ Gemini Flash (`gemini-2.5-flash`) — gated on `config.gemini.apiKey`
- ✦ Gemini Pro (`gemini-2.5-pro`) — gated on `config.gemini.apiKey`
- 🔒 Claude Sonnet (`claude-sonnet-4-5`) — gated on `config.anthropic.apiKey`

Selection writes `activeProvider` and (for cloud providers) the per-provider `model` field. Disabled options show a 🔒 with a "Add API key in Settings → Connections" tooltip.

**Type extensions:**
- `ActiveProvider` is now `'lmstudio' | 'gemini' | 'anthropic'`.
- `ANTHROPIC_BASE_URL` constant exported from `settingsStore.ts`.
- `lm:start`, `lm:complete`, and `thread:reset-context` IPC payloads accept optional `provider` + `task`.

**API-key audit** (still true after this commit):
- `editor/.env` has only `DB_CONNECTION_URI` + `HOLOCRON_DB_URI`. **No keys.**
- All API keys (`gemini.apiKey`, `anthropic.apiKey`, `firecrawl.apiKey`, `honcho.token`) live in electron-store via `configSave` → never on disk in plaintext, never in git.
- The defunct `ai.apiKey` field (LM Studio is local — no auth) is removed. `connection:test-ai` and `report:generate` callsites pass `''`.

The Settings → Connections "Active Provider" toggle was extended to a 3-way (LM Studio / Gemini / Claude) so it stays in sync with the dropdown — the dropdown is the canonical UX, the Settings toggle is a redundant convenience.

---

## Your job: Step 5 — Anthropic round-trip verification

**Goal:** confirm the wiring works end-to-end with a real API key.

### Prerequisites
- Andy has pasted his Anthropic API key into Settings → Connections → Anthropic Claude → API Key. If still blank, prompt him.
- App is running (`npm run dev` from `editor/`).

### Test plan
1. Open Settings → Connections, confirm Anthropic API Key field is populated.
2. Close Settings. In the chat panel header, click the model dropdown.
3. **Verify** the Claude Sonnet option is now enabled (no 🔒 icon). If still locked: the dropdown reads `config.anthropic.apiKey.trim()` — log `useSettingsStore.getState().config.anthropic` in DevTools to see if the key actually persisted.
4. Select **Claude Sonnet**. The dropdown label updates.
5. Send a chat message. Expected: streamed Sonnet response in the chat bubble.
6. Verify the cost log row landed:
   ```
   docker exec holocron_link-database-1 psql -U postgres -d holocron_rag \
     -c "SELECT operation, provider, cost_usd, details, created_at FROM rag_operations_log ORDER BY created_at DESC LIMIT 5"
   ```
   The newest row should have `provider='anthropic'`, `cost_usd > 0` (around $0.005-0.02 for a short turn), and `details->>'task' = 'chat'`.
7. Switch back to Gemini Flash via the dropdown. Send another message. Verify a `provider='gemini'` row appears.
8. Switch to LM Studio. Send a message. Verify NO new row appears (LM Studio bypasses cost logging).

### Definition of done
- All eight checks above pass.
- `npm run typecheck` is clean (already true at handoff).
- Andy approves the dropdown UX (placement, labels, disabled state).

**If verification fails, debug per `gotcha.md`. Common failure modes are listed in §"Open questions" below.**

**Stop after verification.** Do not start step 3 (ingestion) or any other step in the same session — that's the meaty backend step and warrants a fresh agent.

---

## Things settled — DO NOT re-design these

1. **Single Postgres instance, two databases.** RAG = `holocron_rag`. Honcho = `postgres`.
2. **No pgvector.** Level 4 only.
3. **No OpenAI provider.** Three providers: gemini, anthropic, lmstudio.
4. **Anthropic uses native REST API directly**, not the SDK npm package.
5. **bullmq + in-process worker** for ingestion (step 3).
6. **2-second idle gate** on file changes (step 3).
7. **`llmClient.chat()` is the unified entry point.** All cloud calls go through it.
8. **Renderer threads `provider` + `task` explicitly through IPC.** No URL inference in the chat path. Heuristic remains as a defensive fallback only.
9. **The chat-header dropdown is the canonical provider switcher.** Settings → Active Provider toggle is a redundant convenience.

---

## Gotchas accumulated so far

- **`process.cwd()` in dev vs prod.** `npm run dev` sets cwd to `editor/`, so `dotenv.config()` (no args) finds `editor/.env`. The fallback `loadDotenv({ path: __dirname/../../.env })` covers the built-output case.
- **Native CJS deps must live in `dependencies`, not `devDependencies`.** `electron-vite`'s `externalizeDepsPlugin` only externalizes packages from `dependencies`; anything in `devDependencies` gets bundled inline. Bundling complex CJS packages like `pg` causes `ReferenceError: Cannot access 'X' before initialization` because pg has internal forward references that trip Vite's CJS-to-ESM bridge. Symptom: app fails to launch with that error pointing at `out/main/index.js`. Fix: move the package to `dependencies`. Future native deps (e.g. when ingestion needs `bullmq`) — put them in `dependencies` from day one.
- **Gemini SSE usage** requires `stream_options.include_usage: true`. Only requested for `provider !== 'lmstudio'`.
- **Anthropic SSE event names differ from OpenAI.** Don't try to share parser code — adapters are split for that reason.
- **`activeStreamController.abort()` propagates through `chat()`** via `signal: req.abortSignal`. Adapter returns `{ error: '__aborted__', content: <partial> }`.
- **`rag_config` budget defaults are inserted lazily** by `ensureBudgetDefaults()` on first `checkBudget()` call. Not in any migration.
- **The dropdown is gated by `apiKey.trim()` length.** Whitespace-only keys are treated as missing.
- **Local models confabulate about their deployment.** Gemma 4 in LM Studio will say things like "I am a cloud-based AI assistant trained by Google" because Gemma IS a Google model and small models don't actually know if they're running locally. Don't trust the model's self-report to debug routing — query `rag_operations_log` instead. If a chat send produced no row in that table, it never went to a cloud provider, period. (This false-positive consumed ~30 minutes during step 4.5 verification — see commit history if relevant.)

---

## Confirmed running infrastructure

```
Postgres   localhost:5432   pgvector/pgvector:pg15   container holocron_link-database-1
Redis      localhost:6379   redis:8.2                container holocron_link-redis-1
Honcho     localhost:8000   custom build             containers holocron_link-api-1 + deriver-1
```

Up since 2026-05-01. Don't waste time verifying unless something fails.

---

## Open questions you might hit (and the right answer)

- **"Claude option is still 🔒 even after I pasted the key."** The dropdown trims and tests `config.anthropic.apiKey`. Either the key didn't save (check DevTools: `useSettingsStore.getState().config.anthropic.apiKey`) or there's a re-render miss (the selector subscribes via `useSettingsStore((s) => s.config)` — should always update).
- **"Anthropic returns 401."** Bad key. Surface clearly to Andy; don't silently fall back.
- **"Anthropic streams correctly but cost_usd is $0."** Token usage parsing bug. Anthropic puts `usage.input_tokens` in `message_start` and the *cumulative final* `usage.output_tokens` in `message_delta`. If both are 0 in the log row's `details`, neither event was parsed. Add a `console.log(parsed.type)` in `anthropicAdapter`'s SSE loop to confirm event names.
- **"Anthropic returns 'messages: roles must alternate'."** Two consecutive `user` or `assistant` messages somewhere in `useLMStream.ts`'s history. The system-prompt extraction is fine; the issue is upstream.
- **"Should I switch the dropdown to a single combo of provider + model?"** It already is. Each option is a (provider, model) tuple. Don't split them.

---

## What's next after step 5

The dependency graph from `phase-3a-execution.md`:

- **Step 3 — Ingestion pipeline** (the meaty backend step). bullmq + chokidar subscriber + tag extraction. Most architectural design happens here.
- **Step 7 — Library tab + Search sub-tab** (UI on top of the data step 3 produces).
- **Step 6 — Dashboard tab + widgets** (UI showing stats from `rag_operations_log` etc).
- **Step 8 — Hot-swap pill polish.** ✓ Mostly absorbed by step 4.5's dropdown. May not be a separate step anymore — Andy's call.

Andy should pick the next step after step 5 verifies. Step 3 is the riskiest and most context-heavy.

---

**Current branch:** `main`. **Latest commit:** the step-4.5 commit (check `git log -3`).

**You're cleared to begin step 5 verification.** Good luck.
