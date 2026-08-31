# Ponytail Debt Ledger

Every deliberate simplification in the codebase carries a `ponytail:` comment
naming its ceiling and (ideally) the trigger to revisit. This ledger is the
roll-up so a deferral can't quietly become permanent.

Regenerate with: `grep -rnE '(#|//|\{/\*) ?ponytail:' qualia-shell/src tools`
(+ the same grep over the backend's `src`). Last scan: **2026-08-28**,
worktree branch `worktree-agent-a917d932d21414e0d` (plan 054 phase 6).

## Debt (16 rows)

| Where | Simplified | Ceiling | Upgrade trigger |
|---|---|---|---|
| `qualia-shell/src/components/Shell/WalkthroughOverlay.tsx` | Walkthrough anchors are Classic-only; in Holocron/Fluid every step renders centered (words, no cutouts) and auto-start defers until Classic | v1 scope — Holocron tab strip / Cockpit panes have no `data-tour` anchors | A user replays the tour in Holocron or the Cockpit and asks where things live → add per-layout anchors + step targets |
| `qualia-shell/src/components/StrataDashboard/StrataDashboard.tsx:603` | Move-in table = honest empty state | No data source | Wire to lease `moveInDate` when Leasing exposes it |
| `StrataDashboard.tsx:613` | Move-out table = honest empty state | No data source | Wire to lease notices when Leasing exposes them |
| `StrataDashboard.tsx:627` | Delinquency/collections/expiry = hint, no numbers | Real figures live in QuickBooks | Ilya green-lights a QuickBooks integration (plan TBD) |
| `components/Shell/SyncStatusPill.tsx:36` | No ticking "just now" clock | Tooltip carries absolute time | 60 s tick if Ilya wants relative text |
| `components/Shell/FluidOS.tsx:142` | Frame-blocked hosts = static verified list | Hand-extended | Backend HEAD probe `/api/preview/probe` if the list gets long |
| `components/Scribe/idocs/idocTypes.ts:89` | No nested cards in v1 | Flat card list | `children?: Card[]` + recursive renderer when needed |
| `components/Scribe/idocs/idocsAi.ts:222` | One nesting level, depth guard | Single level (by-design cap) | A real doc needs depth 2 |
| `components/Scribe/idocs/IDocRenderer.tsx:76` | Link rewrite also touches fenced code | Cosmetic mis-rewrites in code blocks | Remark plugin if it ever bites |
| `components/Scribe/idocs/idocPptx.ts:121` | 1:1 slides export as 4:3 | No square PPTX layout | Anyone exports a 1:1 deck for print |
| `components/Scribe/idocs/blocks/aiImage.ts:27` | Always requests 1024×1024 | "size" steers prompt + downscale only | An image block ships at a size where the 1024 downscale visibly softens |
| `components/Scribe/idocs/idocsHistory.ts:72` | O(n·docs) re-serialize per snapshot drop | Fine at 30 snapshots × a handful of docs | Snapshot cap raised above 30 or docs per user exceeds ~20 |
| `components/Scribe/idocs/idocsImport.ts:102` | No-LLM import = one card/page, cap 30 | No structure awareness | Headings-aware split when a model is available |
| `components/ARAConsole/araEscalation.ts:28` | Refusal detection = regex heuristic | FP costs one Hermes run; FN leaves a refusal on screen (tuned toward recall) | >1 false-escalation per week observed → LLM judge on the user's key |
| `lib/globalDictation.ts:83` | Contenteditable dictation = finals-only | No live interim preview in rich editors | Marker-node region if live CE preview matters |
| `lib/oneSaveStore.ts:129` | Reconnect replays last value only | Multi-tab write ordering unguaranteed | Full outbox if multi-tab ordering matters |

## Plan 055 phase-5 audit — found, not fixed (5 rows, 2026-08-31)

Intuitive-actions sweep verdicts that did not make the top-5 fix cut. Evidence
in the phase-5 report (rig screenshots + findings.json).

| Where | Finding | Why deferred | Upgrade trigger |
|---|---|---|---|
| `qualia-shell/src/components/Window/Window.tsx` titlebar | Right-click on a widget titlebar shows nothing (no context menu) | Low value vs. effort; ⌘K + titlebar buttons cover the actions | A user asks for close-others/move-to-group from the titlebar |
| Shell (global) | No ⌘N / ⌘T "new window/tab" equivalents | ⌘K is the documented open-anything path (guide §3/§9) | Ilya wants browser-parity tab keys in the OS shells |
| `Desktop.tsx` background click | Clicking the desktop doesn't blur/deselect the active window | Harmless today — no marquee selection, z-order unaffected; no data risk | A widget ships whose focus ring/selection visibly lingers after a desktop click |
| `Shell/FirstRunCard.tsx` "Bring your data" | Step ticks from the GLOBAL `/properties` list — on a shared backend a brand-new user sees it pre-checked (rig fresh-run proof) | Real fresh deployments start empty; per-user attribution needs backend help | First-run runs against any seeded/shared backend in production |
| `SystemHealth/SystemHealthBanner.tsx` × first run | "4 connections need setup" banner fires over the first-run card at minute zero (rig screenshot) | Both are honest; suppressing needs a quiet-period rule | Onboarding feedback says minute-one is noisy — gate the banner until first-win done or day 2 |

## Backend debt (2 rows) — `~/dwellium-backend/ai-dashboard369-file-manager`

| Where | Simplified | Ceiling | Upgrade trigger |
|---|---|---|---|
| `src/agents/araChatEngine.ts:792` | Library retrieval = brute-force cosine over SQLite | ~10k chunks | LanceDB table like Georgia Code |
| `src/routes/idocsRoutes.ts:380` | Doc presence in-memory | Single instance (Cloud Run MAX_INSTANCES=1) | Redis/pub-sub if scaled out |

## Retired (2 rows — plan 054 phase 6)

| Where (was) | Was | Closed by |
|---|---|---|
| `components/Shell/FluidOS.tsx:451` | Fixed 55/45 Terminal/Background-tasks split | `6557bc3` — draggable row splitter (25–75 % clamp, double-click reset, arrow-key ±5 %, per-user persisted `workSplit`) |
| `components/Scribe/idocs/blocks/chartData.ts:16` | Delimiter sniff on first line only | `66fc7e1` — quote-aware consistency vote over the first 10 non-empty lines, ties to comma |

## Assertions, not debt (5)

Markers that justify a correct-as-is choice; no ceiling to revisit:
`components/ESign/ESign.tsx:266` (index key on positional signing rows) ·
`components/Scribe/idocs/PresenterView.tsx:34` (BroadcastChannel fallback) ·
`components/Scribe/idocs/IDocEditor.tsx:87` (RTL controlled-input pattern) ·
`tools/notebooklm/sync.sh:106` (secret via `-H @file`, never argv) ·
backend `src/routes/idocsRoutes.ts:37` (Node scrypt, same primitive as authService).

**22 active markers (+2 retired), 0 with no trigger.** Every debt row now names
an explicit upgrade trigger — nothing rots silently. The two rows still worth
watching: StrataDashboard:627 (QuickBooks numbers) and araEscalation:28
(refusal heuristic) — both gated on their named triggers, not on memory.
