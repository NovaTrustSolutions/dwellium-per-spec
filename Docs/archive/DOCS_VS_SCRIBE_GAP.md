# Scribe vs. `suitenumerique/docs` — full review + gap list

**Session:** Claude (Opus), 2026-05-30. Source reviewed: the official `suitenumerique/docs` README/feature list (fetched this session) + the project's stated stack (Django REST + Next.js + ProseMirror + BlockNote + Hocuspocus + Yjs). Scribe side: read its actual component tree in `qualia-shell/src/components/Scribe/`.

## Honest framing (read first)
- **Docs is a full-stack, multi-user collaborative editor.** Its defining features (real-time co-editing, presence, sharing, access control) are powered by a **Yjs/Hocuspocus websocket CRDT server + a Django backend + Postgres + S3 + OIDC**. None of that backend is in this workspace (Scribe's own backend is a separate repo that isn't here either).
- **Scribe is a single-user, local-first Markdown editor** (CodeMirror 6): multi-tab, table of contents, minimap, **redlines/track-changes**, **comments**, themes, keymap, file **ingestion** (drag-drop → Markdown), versions/snapshots, and **ARA AI** integration (send selection to an LLM, get redline suggestions).
- Therefore "add **all** of Docs's features to Scribe" can't be done as a 4-hour autonomous sweep, and several items can't be made to *actually work* here (no backend/CRDT server), and I can't take reliable per-feature screenshots of a running app (the app needs its backend + I can't keep a dev server alive on your Mac). I'll build the parts that are genuinely feasible **and verify them with tests + a real build**, which is the verification you've been able to trust.

---

## What Docs has → is it in Scribe?

| Docs feature | In Scribe? | Tier |
|---|---|---|
| Markdown editing | ✅ Yes (CodeMirror 6) | — |
| Rich-text formatting (bold/italic/headings/tables) | ✅ Yes (toolbar + markdown) | — |
| **Slash commands & block menu** | ❌ No | ✅ **Feasible here** |
| **AI writing helpers — Rewrite / Summarize / Translate / Fix spelling** | 🟡 Partial (generic "send to AI" only; no discrete one-tap actions) | ✅ **Feasible here** (LLM client already wired) |
| Comments | ✅ Yes (`CommentEditor`) | — |
| Track changes / redlines | ✅ Yes (`RedlineNavigator`) — *Docs doesn't even have this* | — |
| Offline editing | ✅ Yes (local files + autosave) | — |
| **Cross-document search** | ❌ No (only in-file find) | ✅ **Feasible here** |
| **Subpages & hierarchy (doc tree)** | ❌ No (flat multi-tab) | 🟡 Feasible (moderate; local tree) |
| Import `.md` | ✅ Yes (ingestion) | — |
| **Import `.docx`** | ❌ No | 🟡 Feasible (`mammoth` lib available) |
| **Export `.docx`** | ❌ No (exports Markdown) | 🟡 Feasible (a docx lib) |
| **Export `.pdf`** | ❌ No | 🟡 Feasible (print-to-PDF path) |
| Export `.odt` | ❌ No | 🔴 Needs a converter service |
| **Real-time collaboration (Yjs CRDT)** | ❌ No | 🔴 **Needs infra not here** (Hocuspocus server + backend) |
| **Live cursors & presence** | ❌ No | 🔴 Needs CRDT/websocket server |
| **Sharing + granular access control** | ❌ No | 🔴 Needs backend + auth (OIDC) |
| Full WYSIWYG block editor (BlockNote/ProseMirror) | ❌ No (Scribe is a source-Markdown editor) | 🔴 Editor re-architecture, not a "feature" |
| Searchable across instances / public instances | ❌ No | 🔴 Needs backend |

---

## The feasible build list (what I can actually add to Scribe + verify here)

In priority order (value × feasibility). This is the "one by one" to-do; each ships with a real test + build, not a screenshot claim.

1. **AI writing helpers** — discrete Rewrite / Summarize / Translate / Fix-spelling actions in the selection toolbar, using the existing `callLlm`. *(Highest value, lowest risk — LLM path already proven.)*
2. **Slash-command menu** — type `/` to insert headings, lists, tables, quotes, code blocks, dividers (Markdown-aware).
3. **Cross-document search** — search across all open/known Scribe files, jump to match.
4. **`.docx` import** — convert dropped `.docx` → Markdown (via `mammoth`).
5. **`.docx` / `.pdf` export** — export the current doc.
6. **Subpage hierarchy** — a local document tree (parent/child) over Scribe files.

Out of scope here (need infrastructure or a decision): real-time collaboration, live presence, sharing/access-control, `.odt`, full BlockNote re-architecture. Those would be a separate, backend-involving project.

## How verification will actually work
- ✅ **What I can do reliably:** unit tests that can fail (prompt builders, slash-menu logic, search), `tsc -b`, and a real production build with a bundle-grep proving the code shipped.
- ⚠️ **Screenshots:** require the app running with its backend (not in this workspace) and a live dev server on your Mac (I can't keep one alive). I can *attempt* a screenshot via desktop control **only if you have Scribe open on screen** — but I won't gate features on it or fake it.

**Starting with #1 (AI writing helpers) now, verified.** Tell me to keep going down the list and I'll take them one at a time.
