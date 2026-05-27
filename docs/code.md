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
