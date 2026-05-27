# Handoff v05 — Phase 3a Step 6 (Dashboard tab + widgets)

**To:** the next Claude session
**From:** prior session 2026-05-07 (shipped step 7 Library/Search, all 6 UI test items verified by Andy)
**You are starting:** **Step 6 — Dashboard tab.** It's the Phase 3a ship-gate step. After it lands, 3a is done and you can move on to Phase 3b (wiki + connections) or take the optional steps 2 / 8.

**Naming convention:** handoffs live in `docs/` as `HANDOFF_vNN_step-X.md`, monotonic counter. Predecessors: `v01_step-4.md`, `v02_step-5.md`, `v03_step-3.md`, `v04_step-7.md`. When you finish, write `HANDOFF_v06_step-X.md` for whatever comes next.

---

## Read order (10-15 min total)

1. **`docs/STATUS.md`** — current project state, what's shipped.
2. **`docs/architecture-v3.md` §"Dashboard tab — landing page"** — the v1 layout and widget definitions. Read carefully; Andy locked the layout (no widget reordering, no charts in v1).
3. **`docs/architecture-v3.md` §"Cost Tracking & Dashboard"** — has the exact SQL queries for daily/monthly spend aggregations. Copy them verbatim into IPC handlers.
4. **`docs/phase-3a-execution.md` §"Step 6"** — IPC contract sketch.
5. **`docs/gotcha.md`** — debugging discipline + the chokidar fsevents quirk noted at the bottom (relevant if you smoke-test by dropping new project dirs).
6. **`editor/src/renderer/src/components/library/`** — the step-7 tree. Mirror this structure for `dashboard/`.

---

## What's already done

| Step | Commit(s) | Status |
|---|---|---|
| **1** Postgres schema | `a0af8af` | ✓ Verified |
| **4** `llmClient.ts` + cost middleware | `e067064` | ✓ Verified |
| **4.5** Provider routing + chat-header dropdown | `e7a5307`, `b067841`, `2555232` | ✓ Verified |
| **5** Anthropic activation | `7d9e974`, `4495266` | ✓ Verified |
| **3** Ingestion pipeline | `13ae9a1`, `1a4019b`, `d1f02d5`, `c16a862`, `9c7a980` | ✓ Verified end-to-end |
| Migration 002 (namespace gate) | `7a80828` | ✓ Verified via live SQL (TS wrapper deferred, see notes) |
| **7** Library tab + Search sub-tab | `085764c` | ✓ Verified — all 6 UI test items pass (Andy 2026-05-07) |

The Library tab structure (`src/renderer/src/components/library/`) is the template for your Dashboard work. It has a `LibraryTab.tsx` with a sub-tab strip and a `Search.tsx` body. Dashboard will be simpler — single page, no sub-tabs, just widgets stacked vertically.

---

## Your job: Step 6 — Dashboard tab + widgets

Per `docs/phase-3a-execution.md` §"Step 6" and `architecture-v3.md` §"Dashboard tab — landing page" — those are your spec. Don't relitigate the layout.

### Files to add / modify

**Backend (3):**
- `editor/src/main/dashboard.ts` *(new)* — three exported functions matching the IPC contract below.
- `editor/src/main/ipc.ts` — register `dashboard:status`, `dashboard:stats`, `dashboard:recent-activity` handlers.
- `editor/src/preload/index.ts` — expose `dashboardStatus`, `dashboardStats`, `dashboardRecentActivity` on `window.electronAPI`. Add types in `renderer/src/types/ipc.ts`.

**Frontend (3 + edits):**
- `editor/src/renderer/src/components/dashboard/Dashboard.tsx` *(new)* — top-level component, fixed v1 layout, polls every 30s.
- `editor/src/renderer/src/components/dashboard/widgets/` — small components: `StatusStrip.tsx`, `StatsGrid.tsx`, `RecentActivity.tsx`, `PendingActions.tsx`, `RecentInsight.tsx` (last is a placeholder for v1; pulls from Honcho in Phase 3c).
- `editor/src/renderer/src/components/dashboard/index.ts` — barrel export.
- `editor/src/renderer/src/components/Icons.tsx` — `IconDashboard` (e.g. a 4-cell grid glyph).
- `editor/src/renderer/src/store/sessionStore.ts` — extend `AppTab` with `'dashboard'`.
- `editor/src/renderer/src/components/layout/Shell.tsx` — fourth tab, full-width content branch like Library.

### IPC contract

**`dashboard:status` → `{ postgres: bool, honcho: bool, redis: bool, geminiKey: bool, anthropicKey: bool, spendToday: number, dailyBudget: number, hardStop: bool }`**

Probe each:
- Postgres: `SELECT 1` via `ragQuery`. If null/throws → false.
- Honcho: `fetch('http://localhost:8000/health')` with 2s timeout. If 200 → true.
- Redis: `new Queue(...).waitUntilReady()` with timeout, OR a quick `ioredis` ping. The bullmq Queue from ragIngest already proves Redis if it's connected; you can re-use a small shared probe.
- API keys: read from `loadConfig()` — `cfg.gemini?.apiKey?.trim()` and `cfg.anthropic?.apiKey?.trim()`.
- Spend today: see `checkBudget()` in `llmClient.ts` — it already does this. Reuse it.

Cache results for 5s so a 30s renderer poll doesn't hammer the probes.

**`dashboard:stats` → `{ documents: number, tags: number, relationships: number, wikiPages: number, syntheses: number, notesThisWeek: number }`**

Single query joining counts:
```sql
SELECT
  (SELECT COUNT(*) FROM rag_documents WHERE is_active) AS documents,
  (SELECT COUNT(*) FROM rag_tags) AS tags,
  (SELECT COUNT(*) FROM rag_relationships) AS relationships,
  (SELECT COUNT(*) FROM rag_wiki_pages) AS wiki_pages,
  (SELECT COUNT(*) FROM rag_syntheses) AS syntheses,
  (SELECT COUNT(*) FROM rag_documents
     WHERE source_type = 'note' AND ingested_at >= NOW() - INTERVAL '7 days') AS notes_this_week;
```

**`dashboard:recent-activity` → `Array<{ id, operation, target_type, source_path?, source_type?, tag_count?, skipped?, cost_usd?, provider?, model?, created_at }>`**

Last 10 rows from `rag_operations_log`:
```sql
SELECT id, operation, target_type,
       details->>'source_path' AS source_path,
       details->>'source_type' AS source_type,
       (details->>'tag_count')::int AS tag_count,
       (details->>'skipped')::bool AS skipped,
       cost_usd, provider, details->>'model' AS model,
       created_at
FROM rag_operations_log
ORDER BY created_at DESC LIMIT 10;
```

### v1 layout (fixed, no widget reordering)

```
┌──────────────────────────────────────────────────────────────────┐
│ STATUS STRIP                                                      │
│ ● Postgres │ ● Honcho │ ● Redis │ API: Gemini ✓ Anthropic ✓ │     │
│                                  Today: $0.47 / $5.00             │
├──────────────────────────────────────────────────────────────────┤
│ RECENT INSIGHT (Honcho)              v1 placeholder text — will   │
│                                      surface dreams in Phase 3c   │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ Documents   │ Wiki Pages  │ Connections │ Notes(week) │ Tags    │
│   247       │   14        │   312       │   23        │   7     │
├─────────────┴─────────────┴─────────────┴─────────────┴─────────┤
│ PENDING ACTIONS                                                   │
│ • (empty for v1; populates when ingest queue grows)               │
├──────────────────────────────────────────────────────────────────┤
│ RECENT ACTIVITY                                                   │
│ 09:42 • Ingested BD_AstraStrata_PRD03.md (4 tags, 2 rels)         │
│ 09:38 • tag-extract via gemini-2.5-flash · $0.000010 · 1693ms     │
│ 09:15 • Search "case-management" · 2 results                      │
│ ...                                                                │
└──────────────────────────────────────────────────────────────────┘
```

**Numbers and dots only.** No charts in v1 — that's locked. Trendlines come in v1.5 only if a number turns out to want one (per arch-v2 §"Dashboard tab").

### Polling

`useEffect` in `Dashboard.tsx`:
```ts
useEffect(() => {
  const tick = () => {
    void window.electronAPI.dashboardStatus().then(setStatus)
    void window.electronAPI.dashboardStats().then(setStats)
    void window.electronAPI.dashboardRecentActivity().then(setActivity)
  }
  tick()
  const id = setInterval(tick, 30000)
  return () => clearInterval(id)
}, [])
```

Stop polling when `activeTab !== 'dashboard'` to save cycles. Resume on tab activation.

### Definition of done

- Dashboard renders all five widget areas with real numbers from the DB.
- Status dots reflect service health: kill Postgres container → dot turns red on the next poll (within 30s).
- Document count increments after ingesting a new file (manual touch + 30s wait, or refresh).
- API-key indicators: remove Gemini key in Settings → indicator goes red.
- Recent activity list updates after a new ingest completes.
- Cost-today figure matches `SELECT SUM(cost_usd) FROM rag_operations_log WHERE created_at >= date_trunc('day', NOW())`.
- `tsc --noEmit` clean.
- `npm run build` clean.

### Phase 3a ship-gate verification (after step 6 lands)

Step 6 + step 7 + step 3 together close Phase 3a's ship gate from `architecture-v3.md`:

> **Ship gate:** can drop a markdown file into `_Library/`, see it appear in Search results within 30 seconds, click through to read it. Dashboard shows the document count incrementing.

Run that. If it works, Phase 3a is done — write a short post-3a summary in STATUS.md and start thinking about Phase 3b (wiki compilation).

---

## Things settled — DO NOT re-design these

1. **No charts in v1.** Numbers and dots only. Period.
2. **Fixed v1 layout.** No widget reordering. No drag-drop. Locked in arch-v2.
3. **Polling, not push.** 30s interval. Acceptable for v1; push from main is a Phase 3c thing.
4. **`rag_operations_log` is the cost source of truth.** Don't roll your own counter.
5. **Recent Insight is a placeholder.** Honcho dream surfacing is Phase 3c's job. For v1, render static helper copy.
6. **5-tab eventual layout** is Dashboard / Editor / Projects / Library / Mind. After step 6 lands you'll have 4 of 5 (Mind is Phase 3c). Default activeTab on launch should be `'dashboard'` once step 6 is shipped — flip the default in `sessionStore.ts`.
7. **Single Postgres instance, two databases.** RAG = `holocron_rag`.
8. **Three providers: gemini, anthropic, lmstudio.** No OpenAI.
9. **Background tasks (tag-extract) hardcode Gemini Flash.** They never read the user's UI provider selection.
10. **`_Library` and `_Inbox` are implicit bridge namespaces.**

---

## Gotchas accumulated so far

- **`process.cwd()` in dev vs prod.** `npm run dev` sets cwd to `editor/`; `dotenv.config()` (no args) finds `editor/.env`.
- **Native CJS deps must live in `dependencies`.** `pg`, `dotenv`, `bullmq` all there — keep new deps there too.
- **Gemini SSE usage** requires `stream_options.include_usage: true`. Only requested for `provider !== 'lmstudio'`.
- **Anthropic SSE event names differ from OpenAI.** Adapters split.
- **Gemini 2.5 Flash thinking-mode tokens count against `max_tokens`.** Bug fixed during step 3 smoke (`c16a862`). Budget at least 1024 for any Flash call expected to emit a small JSON output. See `docs/code.md` for the incident.
- **`rag_config` budget defaults are inserted lazily** by `ensureBudgetDefaults()` on first `checkBudget()` call. Not in any migration.
- **The chat-header dropdown is gated by `apiKey.trim()` length.** Whitespace-only keys treated as missing.
- **Local models confabulate about their deployment.** Verify routing via `rag_operations_log`, never the model's self-report.
- **Claude models misidentify their own version.** Same fix: query the cost log.
- **Stale preload after preload changes.** Cmd+Shift+R the renderer + restart `npm run dev` after editing `src/preload/index.ts`. Step 7 hit this; you'll hit it too if you add new IPC bindings.
- **Chokidar misses brand-new subdirectories on macOS.** Pre-existing dirs fire correctly; new project dirs created at runtime are silently ignored despite recursive watch. Workaround: restart `npm run dev`. Real fix deferred — known limitation, acceptable for v1. See `gotcha.md`.

---

## Confirmed running infrastructure

```
Postgres   localhost:5432   pgvector/pgvector:pg15   container holocron_link-database-1
Redis      localhost:6379   redis:8.2                container holocron_link-redis-1
Honcho     localhost:8000   custom build             containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` is in `editor/.env`. `npm run db:setup` is idempotent and applies `001_rag_schema.sql` + `002_namespaces.sql` via the migrations runner shipped in `7a80828`.

---

## Open questions you might hit (and the right answer)

- **"Should the Dashboard show a sparkline next to each stat?"** No. Numbers only in v1. Promote to v1.5 only if a number turns out to want one.
- **"Should I show per-thread or per-project breakdowns?"** No — a single global view in v1. Filtering by project namespace lives in step 7 (Search), and the future Settings UI for the bridge toggle.
- **"What goes in PENDING ACTIONS?"** For v1: `(empty)` is acceptable. The card exists for `re-ingest queued: N` and `wiki recompile pending: N` once those features land in Phase 3b. Don't synthesize counts; render an empty state until there's real data.
- **"Default tab on launch — Editor or Dashboard?"** Switch the default to `'dashboard'` in `sessionStore.ts` initial state. The Dashboard is the documented landing page in arch-v2.
- **"Should I add a 'cost today' progress bar with the budget?"** Yes — the layout shows `Today: $0.47 / $5.00`. Render as a thin filled bar. If `hardStop && spendToday >= dailyBudget`, color it red and show a "Cloud calls paused" badge.
- **"What if Honcho or Redis is down at app start?"** Status dots go red. Don't crash. The app is usable without Honcho (chat works against direct LLM) but Redis-down means ingestion is offline — flag prominently in the strip.

---

## What's next after step 6

Phase 3a ship gate verified → Phase 3b (wiki compilation + wikilink-as-edge + Cmd+K wikilink picker). Per `architecture-v3.md` §"Implementation phases — Phase 3b." Spec there is detailed; start with step 10 (wiki compilation pipeline using Gemini Flash).

Optional steps 2 (iCloud helper) and 8 (hot-swap pill) remain in 3a but can be done any time. Step 8 is small — single chat-header dropdown extension to handle Anthropic alongside Gemini/LM Studio. Step 2 needs Andy's input on whether his current root setup works.

---

**Current branch:** `main`. **Latest commit:** `085764c` (step 7 — Library tab + Search). Check `git log -10` for the full Phase 3a trail.

**You're cleared to begin step 6 immediately.** Good luck.
