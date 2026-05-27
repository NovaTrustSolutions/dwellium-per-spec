# Handoff v17 — Architecture-v4 Session 5 (Hermes foundation + PDF/DOCX warm-up)

**To:** the next Claude session
**From:** Session 5, 2026-05-14. Four parts in one session, plus a sixth Hive card and one architectural cleanup:
  - **Part A** — PDF/DOCX extraction warm-up: rewrote `convert.ts`'s `pdfToMarkdown` for `pdf-parse@2`'s new `PDFParse` class API (the previous code was v1 and silently broken after the dep bump); added typed plain-text wrappers (`pdfToText`, `docxToText`); added `captureFileBinary` in `foundry.ts` that decodes bytes by extension and reuses the existing `captureFile` text path; new `foundry:capture-file-binary` IPC; `IntakePanel.tsx` now reads `.pdf`/`.docx` via `file.arrayBuffer()` — the "coming soon" copy is gone. **Eliminated two pre-existing tsc errors** (`convert.ts:20` mammoth + `convert.ts:29` pdf-parse) as a side effect of fixing the very functions Session 5 was shipping; node-side tsc count drops from 6 → 4.
  - **Part B** — Hermes Telegram bot: new `src/main/hermes.ts` (~430 lines) with `startHermesBot` / `stopHermesBot`, abort-aware long-poll loop (5 s → 60 s exponential backoff), 30 s Telegram timeout, 60 s fetch ceiling, 4096-char chunked send. Five commands wired (`/dream`, `/status`, `/note <text>`, `/ingest <URL>`, `/help`) plus the plain-text path that routes through the active thread's Honcho session → Claude Sonnet → reply back to Telegram. **Config-only auth** (architecture-v4 §13 Q5 decided): `cfg.telegram = { botToken, allowedUserId }` nested under HolocronConfig; non-allowed senders are rejected *silently* (logging the rejection in the terminal — never telling an attacker the bot exists).
  - **Part C** — iCloud Drive watcher: folded into `hermes.ts` as `startIcloudWatcher` / `stopIcloudWatcher`. **Dedicated chokidar instance** (NOT routed through `workspace.ts:startWatcher` — that function kills its previous watcher per `gotcha.md` line 41, so calling it would silently disable Codex ingestion). Same `usePolling: true` config as the workspace watcher (gotcha.md line 39 — fsevents is forbidden in this repo, especially for iCloud paths). On `add` → routes `.txt/.md` through `captureFile` and `.pdf/.docx` through `captureFileBinary` → optional Telegram heads-up ("New file in iCloud inbox: ... — triage queued"). Default `icloudInboxPath` is the **empty string** (post-sign-off cleanup) — the user explicitly configures their path in Settings → Connections; no folder gets auto-created on fresh installs. Andy's actual path lives at `_Agenteryx/Inbox/` alongside `_Domaines/` and `_Codex/`.
  - **Part D** — `/status` reply: `handleStatus` pulls `getDashboardStatus` (spend / budget / services / API keys), `getDashboardStats` (docs / wiki / syntheses / tags / edges / notes), `gatherFoundryStats` (pending / admitted / rejected / lastCapture). **No new DB queries** — entirely composed from existing surfaces. Reply tags lines per-section, surfaces missing services + missing API keys with ⚠, and ends with "✅ All systems nominal" only when everything's actually green.
  - **Hive Hermes card** — sixth card in the dashboard, cyan accent. ON/OFF primary metric. Last-message timestamp (8 s self-poll while mounted, independent of `refreshAll`). iCloud watch indicator. Start/Stop toggle (disabled with "Configure Telegram in Settings first" when neither side is configured). Configure deep-link via `openSettingsAt('connections')`.

**You are starting:** the MVP + v13 + v14 + Session 2 + Session 3 + Session 4 + Session 5 baseline is intact. **Architecture-v4 Session 5 is complete.** Andy can text his bot from his phone (plain message → Honcho session → Sonnet reply), drop a file into iCloud Drive (auto-routes to Foundry), or drop a PDF / DOCX into the Foundry's file drop zone (main-side decodes via pdf-parse + mammoth, identical triage / approve flow as text). **Session 6 (Graph visual overhaul + "Move document to thread" warm-up)** is the next planned chapter — see `architecture-v4.md` §12.

---

## 🛑 READ FIRST — verification rules (unchanged)

`npx tsc --noEmit -p tsconfig.web.json` for renderer changes. `npm run typecheck`'s `&&` still short-circuits on the node-side pre-existing errors; check the renderer alone with the explicit per-project invocation. Main-process changes need a full `npm run dev` cycle; renderer hot-reloads. `npm run test` = 28 vitest tests against the real test Postgres. **Still 28/28 at session end.** Zero new tsc errors introduced; **two pre-existing tsc errors eliminated** (the convert.ts pair).

### Pre-existing tsc errors after Session 5

Node-side: **4 errors** (was 6 at end of Session 4 — the two convert.ts errors are gone):

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/main/cleanupOps.ts` | 517 | TS2322 | `withRagClient` returns `number\|null` |
| `src/main/dashboard.ts` | 54 | TS18047 | `res.rowCount` nullable |
| `src/main/ipc.ts` | 527 | TS2345 | `path.basename` in `.map(...)` — drifted 519 → 527 with the Hermes IPCs |
| `src/main/ragIngest.ts` | 234 | TS2339 | `config.gemini` not on `HolocronConfig` — also hits `foundry.ts:480`, `hermes.ts` (anthropic block), `ipc.ts:1478` via the same workaround pattern |

Web-side: **6 errors** (unchanged):

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/renderer/src/components/chat/ChatMessage.tsx` | 67 | TS2353 + TS7031 | react-markdown component override |
| `src/renderer/src/components/codex/CodexPreview.tsx` | 1419, 1518 | TS2345 + TS2352 | ScribeColorTheme + ReactPortal |
| `src/renderer/src/components/hud/HUD.tsx` | 50 | TS2367 | `'dashboard'` literal vs `AppTab` |
| `src/renderer/src/components/scribe/selectionObserver.ts` | 14 | TS2344 | PluginValue |

Total **10 errors remaining** (was 11 pre-Session-5, was 13 pre-Session-4). Filter typecheck output for files YOU touch. Don't fix the above unless explicitly tasked — Session 8 in `architecture-v4.md` §12 is the dedicated triage pass.

---

## Read order (~25 min)

1. **`docs/STATUS.md`** — refreshed at Session 5 end (points at Session 6 next).
2. **This file** (HANDOFF_v17) — the Session 5 chapter.
3. **`docs/architecture-v4.md`** §12 — Session 6 (Graph visual overhaul) is what's next; §8 is the spec. The "Move document to thread" warm-up isn't in the architecture doc yet — see `gotcha.md` Session 6 priors block + the "Known limits" §10 below.
4. **`docs/gotcha.md`** — Session 5 priors block at the bottom has five new entries; Session 6 priors has one pre-emptive entry about moving documents between threads.
5. **`docs/HANDOFF_v16.md`** Session 4 chapter — context for the Foundry that Session 5 extended (PDF/DOCX path).

---

## Decisions locked at session start (do not relitigate)

- **`cfg.telegram = { botToken, allowedUserId }` nested object** (not flat top-level fields) — matches the namespacing of `cfg.firecrawl`, `cfg.gemini`, `cfg.anthropic`. Single Settings → Connections card titled "Hermes — Telegram + iCloud" with two inputs inside; future fields (e.g. `cfg.telegram.notifyOnIcloudDrop`) fit cleanly under the same key without flattening growing.
- **`allowedUserId` stored as a string**, not a number. Telegram IDs comfortably fit in `Number.MAX_SAFE_INTEGER` today, but JSON `int53` issues are a notorious foot-gun; stringifying dodges them at zero cost.
- **Pre-existing `convert.ts:20/29` errors fixed as part of Part A**, not deferred to Session 8. The Andy decision recap: "those two errors are blocking the very feature Session 5 is shipping. Fixing them is the cleanest path and the Session 8 tsc-triage list shrinks by 2." Net Session 8 work drops by two errors with no relitigation risk.
- **Config-only auth model** for Telegram (architecture-v4 §13 Q5). No `/auth <pin>` handshake. The user-ID gate is the security boundary; a PIN is belt-and-suspenders that single-user personal tools never need.
- **iCloud watcher is a dedicated chokidar instance.** Per gotcha.md line 41 — the workspace `startWatcher` kills its previous watcher on every call; reusing it would silently disable Codex ingestion. Independent watcher + identical polling config (gotcha.md line 39) is the only safe shape.

---

## Chapter 1 — Part A: PDF/DOCX extraction warm-up

### 1.1 `convert.ts` — fixed mammoth + pdf-parse type holes

**Mammoth.** The pre-existing TS2339 at line 20 was a real typing gap, not a runtime bug — `mammoth.convertToMarkdown` exists at runtime but the package's `index.d.ts` only declares `convertToHtml` + `extractRawText` + `embedStyleMap` + `images`. The fix is a typed local cast:

```ts
type MammothMarkdown = typeof mammoth & {
  convertToMarkdown: (input: { path: string } | { buffer: Buffer } | { arrayBuffer: ArrayBuffer })
    => Promise<{ value: string; messages: unknown[] }>
}
const result = await (mammoth as MammothMarkdown).convertToMarkdown({ path: filePath })
```

Plus the new typed `docxToText(buf: Buffer)` wrapper around `mammoth.extractRawText` (which IS in the types — no cast needed).

**pdf-parse@2.4.5 rewrite.** The TS2339 at line 29 was a real bug — `pdf-parse` was bumped from v1 to v2, but the call site (`(pdfParseMod.default ?? pdfParseMod) as (b: Buffer) => Promise<...>`) was written for v1's default-function shape. v2 is a class-based API: `new PDFParse({ data })` → `.getText()`. Both `pdfToMarkdown` and the new `pdfToText` use the new shape with explicit `destroy()` in a `finally` block (the new parser holds worker resources):

```ts
const parser = new PDFParse({ data: new Uint8Array(buf) })
try {
  const result = await parser.getText()
  // result.text concatenates all pages with the default `-- N of M --` page-joiner;
  // we strip those for plain-text output and replace with double-newlines.
  return result.text.replace(/\n-- \d+ of \d+ --\n?/g, '\n\n').replace(/\f/g, '\n\n').trim()
} finally {
  await parser.destroy()
}
```

### 1.2 `captureFileBinary` in `foundry.ts`

New function. Renderer ships an `ArrayBuffer`; structured-clone-over-IPC turns it into either a Buffer or a Uint8Array (Electron-version-dependent), so the IPC handler defensively wraps:

```ts
ipcMain.handle('foundry:capture-file-binary', async (_, args: {
  bytes: ArrayBuffer | Uint8Array | Buffer
  filename: string
  triageMode?: FoundryTriageMode
}) => {
  const buf = args.bytes instanceof Uint8Array ? args.bytes : new Uint8Array(args.bytes as ArrayBuffer)
  return await foundryCaptureFileBinary(buf, args.filename, args.triageMode ?? 'extract')
})
```

`captureFileBinary` itself dispatches by extension (`.pdf` → `pdfToText`, `.docx` → `docxToText`), refuses anything else (belt-and-braces if the renderer's gating ever slips), and then **reuses the existing `captureFile` text path** so the triage / approve / disk pipeline stays identical. Failure paths surface verbatim ("PDF contained no extractable text (image-only PDF or scanned doc?)", "Extraction failed: ...") so Andy sees the actual cause inline on the drop zone.

### 1.3 `IntakePanel.tsx` — drop zone accepts `.pdf` + `.docx`

`ACCEPTED_BINARY_EXTS = ['.pdf', '.docx']` joins the existing `ACCEPTED_TEXT_EXTS`. The handler branches: text exts → `file.text()` → `foundryCaptureFile`; binary exts → `file.arrayBuffer()` → `foundryCaptureFileBinary`. Both honor the same `fileMode` toggle (Extract vs Convert). Footer copy changed from "TXT + MD work today · PDF/DOCX coming soon" → "TXT · MD · PDF · DOCX". The "PDF and DOCX support coming soon. Copy the text and use Paste text instead." inline error is gone.

### 1.4 5 MB cap still applies

`FILE_MAX_BYTES = 5 * 1024 * 1024` is the same gate for both text and binary — large enough for any reasonable note/article, prevents accidental multi-hundred-MB drops from blowing main-process memory before the extension is even checked.

---

## Chapter 2 — Part B: Hermes Telegram bot

### 2.1 `src/main/hermes.ts` — the plumbing module

~430 lines. Exports `startHermesBot`, `stopHermesBot`, `startIcloudWatcher`, `stopIcloudWatcher`, `getHermesStatus`. Module-level state: `pollingActive`, `pollAbortController`, `lastUpdateId`, `lastMessageAt`, `lastError`, `icloudWatcher`, `icloudWatchPath`. The flat shape is intentional — `getHermesStatus()` serializes it cheaply for the Hive card's 8 s self-poll.

### 2.2 Long-poll loop

`GET /bot<token>/getUpdates?offset=<N+1>&timeout=30` per Telegram's long-poll convention. The fetch has its own 60 s `AbortSignal.timeout` as belt-and-suspenders for a Cloudflare-proxy-hung connection. On 5xx / network error: exponential backoff (5 s → 60 s ceiling), reset to 0 on the next successful poll. **Offset advances BEFORE dispatch** so a hang in a handler doesn't cause Telegram to redeliver the same update on the next poll:

```ts
for (const update of data.result ?? []) {
  if (update.update_id >= lastUpdateId) lastUpdateId = update.update_id
  void handleUpdate(token, allowedUserId, update).catch(...)
}
```

`sleep(ms, signal)` respects the bot's abort signal — `stopHermesBot()` aborts mid-backoff cleanly instead of waiting out the delay.

### 2.3 Sender gating + silent reject

Every inbound message is filtered: `if (senderId !== allowedUserId) return`. The reject is **silent** by design — no "this bot is private" message back, no rate-limit reply, nothing that signals to an unauthorized sender that the bot is alive. Just a terminal log `[Hermes] ignored message from unauthorized sender <id>`. Same security pattern Telegram bots typically use for personal tools.

### 2.4 Command routing

```
/dream                     → handleDream
/status                    → handleStatus  (Part D)
/note <text>               → handleNote
/ingest <URL>              → handleIngest
/help                      → command listing
/start                     → command listing  (Telegram convention)
/<anything else>           → "Unknown command. Try /help."
<plain text>               → handlePlainMessage
```

`/note` and `/ingest` require an argument and reply with the usage hint when called bare. Plain text WITHOUT arguments returns "Send text, or use /dream, /status, /note <text>, /ingest <URL>." — the bot is never silent.

### 2.5 Plain-message handler — the complex one

The full round-trip mirrors the desktop chat path:

1. **Active thread resolution** from `cfg.activeThreadPath` / `activeProjectName` / `activeThreadName`. If unset → "No active thread on desktop. Switch to a thread first, or use /note for a quick capture." Read fresh per command so Andy can switch threads on desktop between Telegram messages and the next reply follows the new thread.
2. **Anthropic credential check.** `cfg.anthropic.apiKey` via the local-assertion workaround pattern (same as `ipc.ts:1478`, `ragIngest.ts:234`, `foundry.ts:480` — Session 8 type-triage). Missing key → "Anthropic API key not configured. Set it in Settings → Connections on the desktop."
3. **Honcho session bind** — `bindThreadHoncho(threadPath, threadName, projectName, createSessionCb)`. The thread.json gets a `honchoSessionId` (created on first contact, reused thereafter). Phone replies attach to the SAME session as the desktop chat — a single conversation across surfaces.
4. **`addMessage(workspace='holocron', session, 'andy', text)`** — save user message FIRST so the context fetch below includes it.
5. **`getSessionContext(session, tokens=6000)`** — Honcho's server-side compression hands back `{ messages, summary }`. Matches the renderer's Reset-Context call shape. 6000 is enough headroom for Sonnet's 200K context without dragging full multi-megabyte transcripts.
6. **System message** is a one-paragraph hook: "You are Holocron, Andy's local-first AI research partner. This message is coming from Telegram on his phone; the desktop's active thread is `<project> / <thread>`. Reply concisely — Telegram message length matters. Keep markdown light (Telegram doesn't render headings). [Prior-session summary block if present]"
7. **`chat({ provider: 'anthropic', model: <cfg.anthropic.model || 'claude-sonnet-4-6'>, messages: [system, ...history, user], temperature: 0.7, maxTokens: 1024, task: 'hermes-chat' })`** — non-streaming. `task: 'hermes-chat'` differentiates the spend logging from the Scribe chat path.
8. **`addMessage(session, 'holocron', reply.content)`** — save assistant reply back so the next Telegram turn (and the desktop chat, when Andy switches back) both see it.
9. **`sendTelegram(token, chatId, reply.content)`** with 4096-char chunking.

The `chat` call uses the existing `llmClient.ts:chat` adapter — no new HTTP layer for Anthropic. Cost logging flows through the existing `rag_operations_log` table with `task='hermes-chat'`.

### 2.6 Sender / send helpers

`sendTelegram(token, chatId, text)` chunks at 4000 chars (Telegram's hard cap is 4096; 4000 leaves room for chunk markers if we ever add them) and sends each chunk sequentially. 60 s fetch timeout. Non-2xx responses log a terminal warning but don't throw — better to send half the reply than to lose the whole thing on a transient API hiccup.

`notifyTelegram(text)` is the fire-and-forget version for the iCloud watcher — reads the current cfg, no-ops if Telegram isn't configured. Used by `handleIcloudFile` to surface "new file in inbox" without the user prompting.

### 2.7 IPC + boot wiring

```
IPCs (3):
  hermes:status              → polled by Hive card every 8s
  hermes:start               → flips Telegram poll loop + iCloud watcher on
  hermes:stop                → flips both off

Boot (src/main/index.ts, after sweepOrphans):
  void startHermesBot()
    .then((r) => console.log(r.ok ? '[Boot] Hermes Telegram bot started'
                                  : `[Boot] Hermes Telegram bot not started: ${r.error}`))
  void startIcloudWatcher()
    .then((r) => console.log(r.ok ? `[Boot] iCloud watcher started: ${r.path}`
                                  : `[Boot] iCloud watcher not started: ${r.error}`))

before-quit (graceful shutdown so dev HMR doesn't leak loops):
  try { stopHermesBot() } catch {}
  try { stopIcloudWatcher() } catch {}
```

Both start surfaces are no-ops when their respective config fields are empty — they return `{ ok: false, error: "..." }` with a friendly reason that lands in the boot log. The Hive card's Start button is disabled in that state with a "Configure Telegram in Settings first" tooltip.

### 2.8 Settings → Connections section

New "Hermes — Telegram + iCloud (Session 5)" section. Three inputs:
- **Telegram Bot Token** — masked password input. Placeholder: `123456789:ABCdef…`
- **Allowed Telegram User ID** — text input. `onChange` filters non-digits (`v.replace(/\D+/g, '')`) so accidental whitespace/letters don't break the comparison. Placeholder: `123456789`
- **iCloud Drive Inbox Path** — text input. Default empty string (post-sign-off cleanup); placeholder shows `e.g. /Users/you/Library/Mobile Documents/com~apple~CloudDocs/_Agenteryx/Inbox`.

Helper copy below each pair points at @BotFather (token), @userinfobot (user ID), and the example iCloud path.

---

## Chapter 3 — Part C: iCloud Drive watcher

### 3.1 Dedicated chokidar instance

Lives in `hermes.ts`. Same polling config as the workspace watcher per gotcha.md line 39:

```ts
icloudWatcher = chokidar.watch(expanded, {
  ignoreInitial: true,
  depth: 1,                                              // top-level only — no recursion
  usePolling: true,                                      // gotcha line 39 — never fsevents on macOS
  interval: 1000,
  awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
})
```

**Not** routed through `workspace.ts:startWatcher` — gotcha.md line 41 ("There is exactly ONE workspace watcher") means calling it would kill the Codex root watcher and silently disable ingestion. Hermes's iCloud watcher is independent.

### 3.2 `~/` expansion

chokidar doesn't expand `~`. `expandHome(p)` handles the three cases:

```ts
if (p === '~')           return process.env.HOME ?? p
if (p.startsWith('~/'))  return path.join(process.env.HOME ?? '', p.slice(2))
return p
```

Andy's actual configured path is absolute (`/Users/anzo/Library/Mobile Documents/com~apple~CloudDocs/_Agenteryx/Inbox`) so the expansion is a no-op for his case — but the helper handles the placeholder example correctly when users paste with `~/` from a terminal.

### 3.3 File dispatch + Telegram heads-up

```
.txt / .md  → fs.readFile(utf-8)  → captureFile(content, basename, 'extract')
.pdf / .docx → fs.readFile(bytes) → captureFileBinary(bytes, basename, 'extract')
hidden      → skipped (handles iCloud's `.icloud` placeholders + .DS_Store)
other       → skipped with terminal log
```

Success → `notifyTelegram(`📥 New file in iCloud inbox: ${basename} — triage queued`)`. Capture failures log the error AND send a Telegram warning (`⚠ iCloud capture failed for ${basename}: ${res.error}`) so Andy isn't blind to a silently-failing inbox. Empty TXT/MD skip without a notification.

### 3.4 Default path cleared to empty string (post-sign-off)

After the initial Session 5 build, the iCloud inbox default was set to `'~/Library/Mobile Documents/com~apple~CloudDocs/Agenteryx Inbox'`. **Reverted to `''` (empty string) on both surfaces** (`src/main/config.ts:DEFAULT_CONFIG` + `src/renderer/src/store/settingsStore.ts:DEFAULT_CONFIG`) so fresh installs don't auto-create an `Agenteryx Inbox` folder the user never asked for. Andy's saved config (with his custom path) is untouched by the change.

Andy's path convention: `_Agenteryx/Inbox/` lives **alongside** `_Domaines/` and `_Codex/` under his iCloud Drive root:

```
~/Library/Mobile Documents/com~apple~CloudDocs/
  _Agenteryx/
    Inbox/        ← Hermes iCloud watcher target
  _Codex/         ← Wiki + Syntheses cache (referenced everywhere)
  _Domaines/      ← Source-of-truth knowledge base
```

The leading underscore convention sorts iCloud sync folders together at the top of Finder. Whether to formalize `_Agenteryx/` as the canonical naming for any future "drop in here, the agent handles it" inbox sub-folders is a Session 6+ decision — flagged in known limits §6 below.

---

## Chapter 4 — Part D: `/status` command

### 4.1 Data sources (no new DB queries)

`handleStatus` does three parallel fetches against existing main-side functions:

```ts
const [status, stats, foundry] = await Promise.all([
  getDashboardStatus().catch(() => null),    // dashboard.ts — spend, services, API keys
  getDashboardStats().catch(() => null),     // dashboard.ts — doc / wiki / synthesis counts
  gatherFoundryStats().catch(() => null),    // hive.ts — pending / admitted / rejected
])
```

`getDashboardStatus` has a 5-second cache (`STATUS_TTL_MS`) so back-to-back `/status` calls don't re-probe Postgres / Honcho / Redis on every press. `getDashboardStats` is uncached but uses a single SQL with five subqueries — fast enough.

### 4.2 Reply shape

```
🛰  HOLOCRON STATUS
Spend today: $0.42 / $5.00
[⚠ Services down: redis]   ← only if any
[⚠ API keys missing: Gemini]   ← only if any
Docs 1,247 · Wiki 89 · Syntheses 12
Tags 312 · Edges 1,830 · Notes/wk 8
Foundry pending 3 · admitted 47 · rejected 5
Last capture: 4 min ago
✅ All systems nominal.   ← only if everything green AND foundry pending is 0
```

The "All systems nominal" line is honest about pending Foundry items — if Andy has stuff waiting in the queue, the bot doesn't claim everything is nominal. The relative-time formatter is inline (`formatRelative`) rather than pulling in date-fns for one usage; kept under 15 lines, the only tradeoff is no localization (Telegram replies are English-only anyway).

### 4.3 What `/status` does NOT include

- **Active Honcho session count.** `gatherHiveHonchoStats` reads it but requires `projectsRoot` + walks every thread.json — too heavy for an on-demand Telegram reply. Skipped on principle; the Hive Honcho card surfaces it in the desktop UI where the cost is amortized.
- **Per-agent health.** The arch §10.3 spec mentions "which agents are healthy/warning/error" — but no per-agent health metric is computed today (the Hive cards show per-card state, not a unified roll-up). Either compute a roll-up here or defer; deferred for Session 6+.
- **Recent activity tail.** `getRecentActivity(10)` is available but burns reply space; Andy can check the Hive's Ingestion card or `npm run dev` terminal for the granular tail.

---

## Chapter 5 — Hive Hermes card

### 5.1 Sixth card, cyan accent

`HermesCard.tsx` lives next to the other five Hive cards. Grid order (in `Hive.tsx`):

```
HonchoCard → SynthesisCard → FoundryCard → ValidationCard → IngestionCard → HermesCard
```

Auto-fit grid (`repeat(auto-fit, minmax(360px, 1fr))`) means at desktop widths the row wraps to 3 + 3 or 2 + 2 + 2 depending on viewport. Cyan accent (`var(--accent-cyan)`) distinguishes it from Foundry's orange (which it sits next to in the cardinality) and the other neutral / green cards.

### 5.2 Status logic

```
lastError                       → error  (red dot)
running && configured           → healthy  (green dot)
running && !configured          → warning  (orange — defensive, shouldn't happen)
!running                        → idle  (grey)
```

Status messages: `not configured` / `stopped` / `listening` / `error: <short>`. The full `lastError` shows on hover.

### 5.3 Start/Stop toggle + Configure deep link

Toggle button text flips between **Start** (cyan) and **Stop** (red `#ff2d78`). Disabled when neither Telegram nor iCloud is configured AND not currently running (so you can't "start" nothing) — with a "Configure Telegram in Settings first" tooltip. Configure button is always enabled; routes through `useSettingsStore.openSettingsAt('connections')`.

### 5.4 Self-polling

`useEffect` schedules `setInterval(refreshHermes, 8000)` while mounted. 8 s is the sweet spot — fresh enough that "Last message: just now" actually says "just now" after a phone exchange, light enough that the request rate is negligible on a single-user dashboard. Separate from `refreshAll` so navigating away and back doesn't reset the timer.

---

## Verification at Session 5 end

```
npm run db:setup                        → migrations 009 + 010 + 011 applied (unchanged from Session 4)
npm run test                            → 6 files / 28 tests passed (~2.0 s)
npx tsc --noEmit -p tsconfig.web.json   → 6 pre-existing errors, 0 new
npx tsc --noEmit -p tsconfig.node.json  → 4 pre-existing errors, 0 new (convert.ts:20+29 ELIMINATED)
```

Net delta in pre-existing tsc errors: **-2** (both from convert.ts, fixed as part of Part A's legitimate scope).

---

## Files touched in Session 5

### Main process (restart required)

- `src/main/config.ts` — `cfg.telegram = { botToken, allowedUserId }` + `cfg.icloudInboxPath` added to `HolocronConfig` interface and `DEFAULT_CONFIG`. iCloud default cleared to `''` post-sign-off.
- `src/main/convert.ts` — fixed `convertToMarkdown` typing via `MammothMarkdown` local cast; rewrote `pdfToMarkdown` for `pdf-parse@2`'s `PDFParse` class API; added new `pdfToText` / `docxToText` plain-text wrappers used by `captureFileBinary`.
- `src/main/foundry.ts` — new `captureFileBinary(bytes, filename, triageMode)` function; `captureFile` docstring updated to remove the "PDF/DOCX out of scope" note. Imports `pdfToText` + `docxToText` from `./convert`.
- `src/main/hermes.ts` (new, ~430 lines) — full Hermes module: Telegram poll loop, command dispatch, all five command handlers, iCloud chokidar watcher, status getter, send helpers.
- `src/main/ipc.ts` — `foundryCaptureFileBinary` + Hermes import block + 4 new handlers (`foundry:capture-file-binary`, `hermes:status`, `hermes:start`, `hermes:stop`).
- `src/main/index.ts` — `startHermesBot` / `startIcloudWatcher` fired on boot after `sweepOrphans`; `stopHermesBot` / `stopIcloudWatcher` on `before-quit` for clean dev HMR.

### Preload + types (restart + Cmd+Shift+R required)

- `src/preload/index.ts` — `foundryCaptureFileBinary` + 3 Hermes bindings (`hermesStatus`, `hermesStart`, `hermesStop`).
- `src/renderer/src/types/ipc.ts` — `foundryCaptureFileBinary` signature + 3 Hermes electronAPI types.

### Renderer (hot-reloads)

- `src/renderer/src/store/settingsStore.ts` — `cfg.telegram` + `cfg.icloudInboxPath` added to `HolocronConfig` interface + `DEFAULT_CONFIG` (both `''` post-sign-off) + telegram-nested deep-merge entry in `loadConfig`.
- `src/renderer/src/store/hiveStore.ts` — `HiveHermesData` interface; `hermes` + `hermesLoading` state; `refreshHermes` + `startHermes` + `stopHermes` actions; folded into `refreshAll`.
- `src/renderer/src/components/settings/ConnectionsTab.tsx` — new "Hermes — Telegram + iCloud" section. Three inputs (token / userID / iCloud path) with example placeholders.
- `src/renderer/src/components/hive/HermesCard.tsx` (new) — sixth Hive card.
- `src/renderer/src/components/hive/Hive.tsx` — `HermesCard` added to the grid; header comment updated to "six cards".
- `src/renderer/src/components/foundry/IntakePanel.tsx` — drop zone accepts `.pdf` / `.docx` via `file.arrayBuffer()` + `foundryCaptureFileBinary`; "PDF/DOCX coming soon" copy gone; footer reads "TXT · MD · PDF · DOCX".

---

## What Session 5 did NOT touch (per scope)

- `themes.ts` / Fey design work — untouched.
- The 11 (now 9 after the convert.ts pair) pre-existing tsc errors — Session 8 still owns the rest.
- `tsconfig.web.tsbuildinfo` — perpetually-dirty autogen, ignored.
- Migrations 001–011 — no new migrations needed.
- Graph visual overhaul — Session 6.
- Working Memory panel — Session 7.
- "Move document to thread" feature — flagged in `gotcha.md` Session 6 priors; Session 6 warm-up.
- Telegram-side file uploads (`msg.document` / `msg.photo`) — see known limits §1.

---

## Known limits carried into Session 6+

1. **Telegram file uploads (`msg.document` / `msg.photo`) are NOT routed.** Sending a PDF *to the bot* doesn't capture it; the bot replies "Send text, or use /dream, /status, /note <text>, /ingest <URL>." Architecture-v4 §10.3 mentions this ("a file sent to the bot does the same"); pencilled in but not wired. Inbound iCloud handles the file path today — the Telegram document upload is a nice-to-have not a critical-path gap. Wiring it: `getFile` → `file_path` → download → `captureFileBinary`. Maybe ~30 lines.

2. **`/dream` returns 204 — no synchronous insight to surface back via Telegram.** The reply is honest: "🌀 Dream scheduled. Honcho is synthesizing in the background — check the Hive Dreams panel later." Per gotcha.md Session 3 priors block. Don't add code that expects a synchronous insight in the scheduled branch — there isn't one to read.

3. **No tests for `hermes.ts`.** The 28-test vitest suite covers DB-side flows; it doesn't mock fetch / Telegram's getUpdates HTTP. A meaningful test would need a mock-server harness (msw or similar). Punt to whichever session does test-coverage triage — almost certainly Session 8 alongside the tsc-error pass, or whenever Andy decides he wants regression coverage on the relay paths.

4. **Dream-fired-this-launch dedup may have regressed in dev.** Session 4 added the `window.__holocronDreamFired__` singleton to dedupe dream fires across Vite HMR. With Session 5's main-process boot triggers and the new Hive HermesCard's 8 s self-poll, there's a chance a dream fires twice if the user (a) opens Hive, (b) waits for the card to poll, (c) clicks ✦ Schedule Dream on the Honcho card. Hasn't been observed; flagging for diagnostic if a "two dreams scheduled close together" report comes in. Mitigation if it surfaces: the same singleton pattern applied to a hermes-dream-fired-recently flag.

5. **Active-thread reads happen per-Telegram-command.** `cfg.activeThreadPath` etc. is read fresh per dispatch — Andy can switch threads on desktop and the next plain message follows the new thread. **But** `cfg.activeThreadPath` only updates when the desktop renderer saves config; if the renderer is closed or unresponsive, Hermes will see a stale thread. Not a bug — the alternative (Telegram-driven thread selection) is a feature for later. Use `/note` for cross-thread captures when desktop is closed.

6. **iCloud path naming convention `_Agenteryx/Inbox/`** is now in use but not formalized in any architecture doc. Should the inbox sit at `_Agenteryx/Inbox/` (current — alongside `_Codex/`, `_Domaines/`) or `_Codex/Inbox/` (under the cache)? Andy's current setup is `_Agenteryx/Inbox/`; STATUS.md Session 5 entry documents this; an architecture decision is overdue if more `_Agenteryx/*` subfolders accumulate (e.g. `_Agenteryx/Outbox/` for outgoing relays).

7. **`recentlyAdmitted` + dream-action state in-memory only** — unchanged from Session 4 known-limits; carried forward.

8. **`admitted_doc_id` linking still NULL** — chokidar's debounced 2s ingest runs after the renderer has moved on; the column doesn't get populated synchronously. Unchanged from Session 4. Periodic backfill sweep is still the right shape if Andy ever asks for the closed loop.

9. **`config.anthropic` / `config.gemini` not on `HolocronConfig` type** — pre-existing tsc error (ragIngest.ts:234) still present. The local-assertion workaround is now in FOUR places (ragIngest.ts:234, foundry.ts:480, ipc.ts:1478, hermes.ts:plain-message-handler). Worth fixing all four at once in Session 8.

10. **`/status` doesn't include active Honcho session count or per-agent health roll-up.** Both are mentioned in architecture-v4 §10.3's reply spec but are heavier than a Telegram round-trip warrants. Deferred — the Hive desktop UI is the right surface for the granular health view.

---

## Hand-off (Session 5 final)

1. **Read `STATUS.md` first** (refreshed at Session 5 end), then `architecture-v4.md` §12 Session 6 (Graph visual overhaul: color-by-community, size-by-betweenness, sharpened brightness, selected-node spotlight, zoom-behavior fix, structural-gap dashed lines, graph-theme selector). Also §8 for the spec details, and the Session 6 prior in `gotcha.md` about the "Move document to thread" warm-up.
2. **`gotcha.md` has five new Session 5 priors at the bottom** under `## Session 5 priors`, plus one Session 6 prior (pre-emptive) about the move-document feature. Read those before debugging anything Hermes-related or contemplating cross-thread document moves.
3. **Don't add UI for CoPaw** — still silent by design (Session 3 prior carries forward).
4. **Don't add more controls to the chat header** — still two-button only (⟲ Reset + Memory ▸).
5. **Don't bypass the Foundry for external content** — direct-drop into a thread folder still works for "I trust this, skip triage" per Part 13 §6, but external/uncertain content (web scrapes, iCloud drops, Telegram drops via `/ingest`) flows through Foundry by design.
6. **Don't merge the iCloud watcher with `workspace.ts:startWatcher`** — gotcha line 41 lesson. They MUST stay separate chokidar instances.
7. **Don't rename the Honcho workspace.** Bot display name is "Hermes" but the internal workspace id stays `holocron` (hardcoded at `honcho.ts:1`); renaming it would orphan every existing session.
8. **`npm run dev` restart required after any `src/main/` change** — Hermes's main-process surface (`hermes.ts`, `ipc.ts`, `index.ts` boot wiring, `preload/index.ts`) means restart + Cmd+Shift+R for any preload binding change.

🍣
