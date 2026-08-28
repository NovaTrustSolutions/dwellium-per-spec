# Ponytail Debt Ledger

Every deliberate simplification in the codebase carries a `ponytail:` comment
naming its ceiling and (ideally) the trigger to revisit. This ledger is the
roll-up so a deferral can't quietly become permanent.

Regenerate with: `grep -rnE '(#|//|\{/\*) ?ponytail:' qualia-shell/src tools`
(+ the same grep over the backend's `src`). Last scan: **2026-08-27**,
frontend `main` + backend `feat/053-backend`.

## Debt (17 rows)

| Where | Simplified | Ceiling | Upgrade trigger |
|---|---|---|---|
| `qualia-shell/src/components/StrataDashboard/StrataDashboard.tsx:603` | Move-in table = honest empty state | No data source | Wire to lease `moveInDate` when Leasing exposes it |
| `StrataDashboard.tsx:613` | Move-out table = honest empty state | No data source | Wire to lease notices when Leasing exposes them |
| `StrataDashboard.tsx:627` | Delinquency/collections/expiry = hint, no numbers | Real figures live in QuickBooks | ⚠ no-trigger (implicitly: a QuickBooks source) |
| `components/Shell/SyncStatusPill.tsx:36` | No ticking "just now" clock | Tooltip carries absolute time | 60 s tick if Ilya wants relative text |
| `components/Shell/FluidOS.tsx:133` | Frame-blocked hosts = static verified list | Hand-extended | Backend HEAD probe `/api/preview/probe` if the list gets long |
| `components/Shell/FluidOS.tsx:451` | Fixed 55/45 pane split | Not adjustable | ⚠ no-trigger |
| `components/Scribe/idocs/idocTypes.ts:89` | No nested cards in v1 | Flat card list | `children?: Card[]` + recursive renderer when needed |
| `components/Scribe/idocs/idocsAi.ts:222` | One nesting level, depth guard | Single level | ⚠ no-trigger (by-design cap) |
| `components/Scribe/idocs/IDocRenderer.tsx:76` | Link rewrite also touches fenced code | Cosmetic mis-rewrites in code blocks | Remark plugin if it ever bites |
| `components/Scribe/idocs/idocPptx.ts:121` | 1:1 slides export as 4:3 | No square PPTX layout | ⚠ no-trigger |
| `components/Scribe/idocs/blocks/aiImage.ts:27` | Always requests 1024×1024 | "size" steers prompt + downscale only | ⚠ no-trigger |
| `components/Scribe/idocs/idocsHistory.ts:72` | O(n·docs) re-serialize per snapshot drop | Fine at 30 snapshots × a handful of docs | ⚠ no-trigger (ceiling named, path not) |
| `components/Scribe/idocs/idocsImport.ts:102` | No-LLM import = one card/page, cap 30 | No structure awareness | Headings-aware split when a model is available |
| `components/Scribe/idocs/blocks/chartData.ts:16` | Delimiter sniff on first line only | Mixed-delimiter files mis-parse | ⚠ no-trigger |
| `components/ARAConsole/araEscalation.ts:28` | Refusal detection = regex heuristic | FP costs one Hermes run; FN leaves a refusal on screen | ⚠ no-trigger (tuned toward recall) |
| `lib/globalDictation.ts:83` | Contenteditable dictation = finals-only | No live interim preview in rich editors | Marker-node region if live CE preview matters |
| `lib/oneSaveStore.ts:129` | Reconnect replays last value only | Multi-tab write ordering unguaranteed | Full outbox if multi-tab ordering matters |

## Backend debt (2 rows) — `~/dwellium-backend/ai-dashboard369-file-manager`

| Where | Simplified | Ceiling | Upgrade trigger |
|---|---|---|---|
| `src/agents/araChatEngine.ts:792` | Library retrieval = brute-force cosine over SQLite | ~10k chunks | LanceDB table like Georgia Code |
| `src/routes/idocsRoutes.ts:380` | Doc presence in-memory | Single instance (Cloud Run MAX_INSTANCES=1) | Redis/pub-sub if scaled out |

## Assertions, not debt (5)

Markers that justify a correct-as-is choice; no ceiling to revisit:
`components/ESign/ESign.tsx:266` (index key on positional signing rows) ·
`components/Scribe/idocs/PresenterView.tsx:34` (BroadcastChannel fallback) ·
`components/Scribe/idocs/IDocEditor.tsx:87` (RTL controlled-input pattern) ·
`tools/notebooklm/sync.sh:106` (secret via `-H @file`, never argv) ·
backend `src/routes/idocsRoutes.ts:37` (Node scrypt, same primitive as authService).

**24 markers, 8 with no trigger.** Rot watch: the two no-trigger rows that
could quietly matter are StrataDashboard:627 (QuickBooks numbers) and
araEscalation:28 (refusal heuristic).
