# Dwellium → One Calm Workspace

**A consolidation proposal — efficiency & simplicity first.**
Date: 2026-06-09 · Author: design pass over `qualia-shell` @ `e4fde28`

---

## TL;DR

Dwellium isn't missing features — it's drowning in them. The codebase has **42 widgets, ~10 separate "agents," and 28 independent persistence stores.** Every one is real and works. The problem is there's **no single front door, no single brain, and no single memory** — so the user (and the agent) has to know *where* everything lives.

The fix is consolidation around four "ones":

> **One Conductor** (a single agent that spawns the rest) · **One Memory** · **One Save** (everything persists forever) · **One Canvas** (a browser‑like, talk‑to‑arrange dashboard).

And three ways to make it clean, beautiful, and easy — pick one as the north star:

1. **One Front Door** — a ⌘K command bar + the Conductor replace the 42‑item sidebar. You ask; the right surface appears.
2. **Spaces, not widgets** — collapse 42 widgets into ~5 saved layouts ("Write / Manage / Research / Comms / Build").
3. **Calm canvas** — one accent, one spacing grid, the gradient‑lit‑edge + spotlight motion you already have, ruthless removal of chrome.

My recommendation: **do all three, in that order.** They stack.

---

## 1. Honest diagnosis (what the code says)

| Signal | Count | What it means |
|---|---|---|
| Widgets in the registry | **42** | Too many top‑level choices. Cognitive load lives here. |
| "Agents" (ARA, Stella, Hydra, Honcho, Two Brains, Hermes, CoPaw, Synthesis, Triage, NotebookLM…) | **~10** | Each is a separate door. Overlapping jobs, no orchestrator the user talks to. |
| Persistence stores (`createLocalStorageStore`) + Honcho + SQLite + filesystem | **28 + 3 backends** | Memory and saved state are *scattered*. "Did that save? Where?" is unanswerable. |
| Window manager | `saveLayout` / `savedLayouts` / snap / minimize already exist | **The browser‑like canvas is 70% built.** This is leverage, not a rebuild. |

**The core insight:** you already have the hard parts (window manager, per‑user stores, a multi‑LLM router in Hydra, a memory engine in Honcho, a filesystem‑is‑truth principle). You don't need *more*. You need to **route everything through fewer surfaces.**

---

## 2. The consolidation — four "ones"

### One Conductor (collapse ~10 agents → 1 that spawns the rest)
Promote a single agent — call it **ARA** — to the only agent the user ever talks to. Everything else (Hermes, Honcho, Hydra, Scribe‑AI, Triage, Synthesis, Two Brains) becomes a **skill/sub‑agent ARA can spawn**, not a separate widget.

- You already have the pieces: **Hydra** is a multi‑LLM orchestrator, and the docs name an "in‑product Orchestrator" that was never built. Make ARA that orchestrator; fold Hydra's routing into it.
- ARA owns the LLM router (`llmClient`, 5 providers) and a **tool registry**: `spawn('hermes')`, `recall(memory)`, `openWidget('strata')`, `arrangeLayout(...)`, `ingest(file)`.
- "Hermes" stops being a tab and becomes *"ARA, relay this to my phone."*

**Result:** one mental model. The user asks ARA; ARA decides which engine/sub‑agent does the work.

### One Memory (Honcho as the spine)
Today memory is split across **Honcho** (peer/session memory), **ThoughtWeaver** (captures), and 28 local stores. Make **Honcho the single memory spine**; ThoughtWeaver captures and every widget write *feed into it*. ARA reads/writes only Honcho. One place to search, one place that never forgets.

### One Save (persist everything, forever)
This is your explicit requirement, and you already have the right principle: **filesystem is the source of truth; the DB is a rebuildable index.** Extend it to a rule with no exceptions:

> **Every object a user creates — a doc, a note, a chat turn, a captured thought, a layout, a setting — is written to the filesystem spine and indexed. Nothing lives only in memory or only in localStorage.**

Concretely: a single `objects/` store keyed by id, append‑only event log for edits, autosave on every change (debounced), and a nightly index rebuild. Then "if I put it in, it stays" is *true by construction* — not 28 stores you hope saved.

### One Canvas (browser‑like, already 70% there)
Lean into the window manager you have and finish the browser metaphor:
- **Drag, resize, snap** → keep (exists).
- **Group windows into tabs** → new: stack windows like browser tabs in one frame.
- **Persistent Spaces** → named saved layouts (extends `saveLayout`).
- **Everything restores on reload** → the layout is one of the persisted objects above.

---

## 3. The three ways to make it clean, beautiful & easy

### Way 1 — "One Front Door" (the biggest simplicity win)
Replace the 42‑item sidebar as the primary nav with a **single ⌘K command bar + ARA**. Type or talk: *"open Strata," "draft a follow‑up," "what did I save about the PGA property?"* — the right surface appears. The sidebar shrinks to **~5 pinned things you actually use**, everything else is summoned on demand (the Spotlight / Raycast / Arc model).

- **Why it's beautiful:** empty, calm canvas instead of a wall of 42 icons.
- **Why it's easy:** one input to learn, not 42 locations to memorize.
- **Effort:** medium — you have the widget registry to power the command list, and ARA to interpret intent.

### Way 2 — "Spaces, not widgets"
Group the 42 widgets into **~5 task Spaces**, each a named, saved window layout:

| Space | Holds |
|---|---|
| **Write** | Scribe, Docs, Notepad |
| **Manage** | Strata, Astra, Tenant Portal, Task Board |
| **Research** | NotebookLM, Fact Check, Transcribe, Codex |
| **Comms** | Inbox Zero, Hermes relay, ARA |
| **Build** | Terminal, Automations, Universal Shell |

The sidebar becomes **5 Spaces, not 42 widgets.** One keystroke switches the whole canvas. (Your `savedLayouts` already does the heavy lifting.)

- **Why it's beautiful:** each Space is a curated, intentional screen.
- **Why it's easy:** you think in *tasks* ("I'm writing"), not *tools*.

### Way 3 — "Calm visual system" (make it gorgeous)
A single, disciplined design language across the whole app:
- **One accent** (theme‑driven; you have the 16‑theme system). Stop mixing acid‑lime + purple + gold ad hoc.
- **One 8px spacing grid**, generous whitespace, max **2 font weights**.
- **Consistent glass cards** with the **gradient‑lit edge + cursor spotlight you already built** — apply them everywhere, not just Scribe.
- **Slim 28px chrome**, kill redundant toolbars, hide what isn't in use.
- **Motion = the master‑design springs** (`cubic-bezier(.34,1.56,.64,1)`) — already in the codebase.

- **Why it works:** beauty is restraint. You already shipped the ingredients; the win is *applying them uniformly and deleting the rest.*

---

## 4. Talk‑to‑customize (your "customize by talking" ask)

Give ARA a small **layout DSL** as tools, then everything below is just a sentence:

- *"Put Strata on the left, Scribe on the right, save this as my Morning space."* → `arrange()` + `saveSpace('Morning')`
- *"Make the accent teal and hide the minimap."* → `setTheme({accent})` + `setPref()`
- *"Group my three research windows into tabs."* → `groupWindows()`

Because layouts/prefs are **persisted objects** (Section 2), every spoken change survives reload. This is the feature that makes the dashboard feel *alive and yours.*

---

## 5. Persistence guarantee (your "stays forever" requirement)

One rule, enforced everywhere:

1. **Write‑through:** any create/edit → debounced autosave to `objects/<id>` on the filesystem spine + append to an edit log.
2. **Index, don't store‑of‑record:** SQLite/Honcho index for search; the file is truth.
3. **Restore everything:** open files, layout, chat history, captures, settings all rehydrate on launch.
4. **Never silently drop:** the 28 localStorage stores migrate to the spine; localStorage becomes a cache, not the only copy.

Outcome: **anything put into Dwellium is retrievable and permanent — guaranteed by architecture, not discipline.**

---

## 6. Phased roadmap (low‑risk order)

1. **Visual system (Way 3)** — pure CSS/tokens, no logic risk. Instant "wow," already mostly built. *(days)*
2. **Spaces (Way 2)** — wrap `savedLayouts` as named Spaces; sidebar → 5 Spaces. *(days)*
3. **Persistence spine (One Save)** — the object store + write‑through; migrate the 28 stores behind it. *(1–2 weeks; the gate for "forever")*
4. **One Front Door (Way 1)** — ⌘K command bar over the widget registry + ARA intent. *(1 week)*
5. **One Conductor + One Memory** — fold the agents into ARA‑as‑orchestrator + Honcho spine; talk‑to‑customize tools. *(2–3 weeks; the deepest change, do last)*

---

## 7. Quick wins (this week, ~zero risk)

- Apply the **gradient‑lit edge + spotlight + springs** (already built for Scribe) to **all windows** — done in this session for windows; extend to cards.
- Collapse the sidebar to **icon‑rail by default** (you have `.sidebar--icon-only`) → instantly calmer.
- Add a **⌘K command palette** that just opens widgets from the registry (the seed of Way 1).
- Pick **one accent** per theme and audit out the stray hardcoded colors.

---

### The one sentence

**Dwellium already has everything. Make it feel like one calm thing you talk to — one front door, one brain, one memory, one canvas — and delete the rest.**
