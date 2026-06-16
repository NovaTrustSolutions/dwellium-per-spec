# Code memory — fixes and prevention

Per AGENTS.md: any non-trivial fix gets an entry here so the same bug doesn't repeat.
Format: Error → Root cause → Fix → Prevention. Keep entries short.

---

## Fresh checkout could not install or verify cleanly (2026-05-27)

**Error:** `npm ci` failed on a clean checkout because `package-lock.json` was out of sync; `npm test` also assumed a pre-existing Postgres server on `localhost:5432`.

**Root cause:** Dependency updates landed without regenerating the lockfile, and the test database bootstrap lived in Vitest setup rather than in a reproducible infrastructure command.

**Fix:** Regenerated the lockfile, added `editor/docker-compose.test.yml`, and changed `npm test` to start an isolated pgvector Postgres container on port `5433` before running Vitest.

**Prevention:** CI now runs `npm ci`, `npm audit`, `typecheck`, `test`, and `build` on every branch/PR so install drift and missing test infra are caught before handoff.

## Sensitive config values were stored as plaintext JSON (2026-05-27)

**Error:** API keys and relay tokens were persisted directly in Electron's `holocron-config.json`.

**Root cause:** `saveConfig()` serialized the renderer config object as-is, and `loadConfig()` had no secure-storage migration layer.

**Fix:** Added transparent encryption/decryption for sensitive config paths using Electron `safeStorage` when available; plaintext legacy values are migrated on load.

**Prevention:** Keep all future credential-like fields in `SENSITIVE_CONFIG_PATHS` in `src/main/config.ts` so the renderer can keep its plain config shape without leaking secrets to disk.

## ragIngest tag-extract returned empty tags despite Gemini call succeeding (2026-05-07)

**Error:** `rag_tags` and `rag_document_tags` always empty (0 rows). Cost log showed gemini `tag-extract` calls firing at $0.00001 each. Diagnostic log captured raw response truncated mid-array, e.g. `["case-management",` — JSON.parse failed silently, `parseTagsFromResponse` returned `[]`.

**Root cause:** `maxTokens: 200` in `extractTags()` (ragIngest.ts). Gemini 2.5 Flash has thinking mode enabled by default; thinking tokens count against `max_output_tokens`, so the visible JSON output was cut off before the array could close.

**Fix:** Bumped `maxTokens` from 200 → 1024 in `extractTags()`. Inline comment explains the thinking-mode token-budget interaction.

**Prevention:** When using Gemini 2.5 Flash for any structured-output task, budget for thinking tokens. Treat `max_tokens` as "thinking + output combined", not "output only". A 7-tag array needs ≤ 256 output tokens but the budget should be 1024+ to leave thinking headroom. If thinking is genuinely unwanted for a transformation task, future work could pass `reasoning_effort: "none"` (or the Gemini-specific equivalent) through `chat()` instead of just inflating the cap.

## Launchpad lacked separate window/popout support (2026-06-15)

**Error:** Launchpad cards only supported opening tools inline inside the Halocron OS layout, blocking external web access or popped-out CLI tools.

**Root cause:** The outer launch card container was a single `<button>` with a single `onClick` handler, making it impossible to add secondary buttons/links without invalid HTML nested interactions.

**Fix:** Changed launcher card container from `<button>` to `<div>` with `onClick` set to inline OS launch. Integrated an action bar on the right featuring "Open" (OS tab) and "Popout ↗" (separate window). Added `openCliToolExternal` using the `/?popup=terminal` route for CLI tools (Claude, Codex) and `window.open` for Web tools (AntiGravity, ChatGPT).

**Prevention:** Always structure composite cards containing multiple action targets as a container `<div>` with individual `<button>` controls, rather than nested elements inside a single `<button>`. Use `event.stopPropagation()` on secondary buttons to prevent parent click trigger.

## Drag and drop card jitter and snapping back in TrelloBoard and TaskBoard (2026-06-16)

**Error:** Cards in TrelloBoard and TaskBoard widgets would snap back instead of dropping when dragged to another column.

**Root cause:** 
1. Updating React hover state (`dragOverCol` / `dragOverListId`) on every tick of `onDragOver` triggered high-frequency re-renders. Dragging over child card elements triggered parent `onDragLeave` events, clearing hover state and thrashing the drop target DOM properties, which blocked native drop events.
2. HTML5 drag-and-drop mouse movements were hijacked/blocked by native `<button>` focus/click handlers when clicking and dragging the card title.
3. React `dragId` state updates are asynchronous. If `onDragEnd` sets `dragId` to `null` synchronously on drag release, the target column's `onDrop` handler evaluates a null `dragId`, causing the drop action to return early.

**Fix:** 
1. Changed `onDragOver` to only run `e.preventDefault()`. Implemented a `dragCounter` ref mapping associated with `onDragEnter`, `onDragLeave`, and `onDragEnd` events to reliably track enters/leaves across nested children, setting the column hover states only when the net entry counter is greater than zero.
2. Converted the card title button element to a non-button element (e.g. `span`) to prevent focus collision.
3. Passed `React.DragEvent` to `onDrop` and read the target ID via `e.dataTransfer.getData('text/plain')` with React state `dragId` as a fallback, eliminating the async state race condition.

**Prevention:** 
1. Avoid triggering React state updates inside continuous high-frequency events like `onDragOver`. Use a counter-based entry tracking system (`dragCounter` ref) on the target container to smooth out hover state updates across nested children.
2. Avoid using native `<button>` tags for elements that act as drag handles.
3. Always populate and read dataTransfer payloads during HTML5 drag and drop operations instead of relying solely on transient React states.

## CLI Tools (Claude, Codex, AntiGravity) failed to authenticate inside the PTY terminal (2026-06-16)

**Error:** Claude Code (`claude`), Codex (`codex`), and AntiGravity (`antigravity`) failed to launch or authenticate within the workspace terminal PTY, throwing "Please set an Auth method" or generic API key connection errors.

**Root cause:** The backend `terminalRoutes.ts` spawned PTY processes in a clean environment lacking the user's configured integration API keys (which are decrypted and reside only on the frontend/local storage).

**Fix:** 
1. Modified `Terminal.tsx` to read the active user integrations using `useIntegrations()` and pass `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, and `CODEX_API_KEY` inside the `env` body payload of the POST `/api/terminal/sessions` request.
2. Updated `terminalRoutes.ts` to accept the optional `envVars` object in the POST handler and mix it into the spawned PTY session environment variables.

**Prevention:** Always ensure any backend shell or PTY runner process inheriting clean environments is explicitly passed active credentials from the user's integrations store when executing external CLI tool binaries.

## Column settings Max WIP field overextended beyond container (2026-06-16)

**Error:** The "Max WIP" input field in the column settings popover was overextended beyond the popover boundary.

**Root cause:** HTML `<input>` fields have a browser-specific default min-content width (around 150px). When placed inside flex row items with `flex: 1` in a small popover container (width 250px), the inputs did not shrink below their default browser width because `min-width: auto` prevents shrinking below default input sizes.

**Fix:** Added `.tb-col-settings-pop .tb-assign-input { width: 100%; min-width: 0; }` to `TaskBoard.css` to override user-agent stylesheet width controls and allow inputs to shrink inside the columns. Additionally, added unicode icons `📋` and `⚙` to header buttons in `TaskBoard.tsx` to give them physical layout size (width/height > 0) so they render correctly and are clickable.

**Prevention:** Always set `width: 100%; min-width: 0;` on form inputs inside narrow flex containers to ensure they respect the parent flex constraints and do not overflow.



