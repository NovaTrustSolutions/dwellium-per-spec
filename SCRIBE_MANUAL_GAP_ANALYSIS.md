# Scribe — Manual ↔ Dwellium Gap Analysis

**Date:** 2026-06-08
**Manual reviewed:** `~/Downloads/Manual` — 45 PNG screenshots of the **"Agenteryx"** product manual (11 figure sections fig-1.1…fig-11.5 + 7 settings screens). "Agenteryx" is the spec/reference name for this product; its left nav (Scribe, Codex, Foundry, Hive, Domains, HUD) maps to Dwellium's own widgets, so the manual is effectively **Dwellium's own design spec**.
**Scope of this pass:** deep review of the Scribe screens (`settings-scribe`, `fig-5.1`, `fig-5.2`, `fig-1.1`) vs Dwellium's `src/components/Scribe/*`, plus an app-level overview. **Verified by reading source**, not assumed.

---

## Headline

Dwellium's Scribe **already implements the manual's Scribe feature set** — it's the same product. The one genuine *feature* gap was the editor-theme **Settings UI** (Dwellium had a preset picker; the manual shows a full per-token color editor). **That gap is now closed** (this pass), and the editor palette is byte-exact with the manual. Remaining deltas are a few document-management features (Branch, Compare/diff) and the Settings *shell* layout.

---

## Scribe feature parity

| Manual feature (Agenteryx) | Dwellium | Status |
|---|---|---|
| Markdown editor (CodeMirror 6) | `Scribe.tsx` + `markdownConfig.ts` | ✅ Present |
| Live syntax highlighting | `buildHighlightStyle` (13 tags) | ✅ Present |
| **Editor theme — 13 tokens, presets, custom, save-as** | `scribeThemes.ts` + rebuilt `ScribeSettings.tsx` | ✅ **Closed this pass** |
| "Agenteryx Default" preset (exact colors) | `AGENTERYX` preset (byte-exact `#ff9f0a`…) | ✅ Present + renamed to match |
| Editor theme independent of app theme | separate `scribeThemeStore` | ✅ Present |
| File tree (folders, sort, new file/folder) | `FileTree.tsx` | ✅ Present |
| File-type badges (PDF / MD pills) | FileTree | ⚠️ Verify (badges not confirmed) |
| Open Files tabs | `TabBar.tsx` | ✅ Present |
| Project / workspace switcher ("FEATURE SPEC V2") | threads / workspace | 🟡 Partial (no top switcher chip) |
| Split view (tree │ editor │ panel) | `Splitter.tsx` (3×) | ✅ Present |
| Integrated LLM chat panel ("LLM Studio") | `AraMiniPanel.tsx` | ✅ Present |
| Right-click context menu (rename/move/re-ingest/delete) | `ContextMenu.tsx` | ✅ Present |
| Brain-Dump / "Dump" tab | `DumpMode.tsx` | ✅ Present |
| Versioning ("+ Version") | versioning in store | ✅ Present |
| **Compare** (diff two versions) | — | ❌ Gap |
| **Branch** (version branching, bottom bar) | — | ❌ Gap |
| Export / download (PDF, docx) | `pdfExport.ts` + `docxConvert.ts` | ✅ Present |
| AI redlines / rewrite-fix-translate-summarize | `aiActions.ts` + `redlinePlugin.ts` | ✅ Present |
| Inline comments | `CommentEditor.tsx` | ✅ Present |
| Table of contents | `TableOfContents.tsx` | ✅ Present |
| Minimap | `Minimap.tsx` | ✅ Present |
| Slash commands / selection toolbar / tables | `slashCommands.ts`, `SelectionToolbar.tsx`, `tablePlugin.ts` | ✅ Present |
| Find & Replace | `FindReplace.tsx` | ✅ Present |
| Focus mode | `Scribe.tsx` | ✅ Present |
| Document priority | `PriorityBadge.tsx` | ✅ Present (Dwellium extra) |

**Tally:** ~21 present · 1 closed this pass · 1 partial · 2 gaps (Compare, Branch) · 1 to verify (badges).

---

## What I changed this pass (Scribe → manual parity)

Rebuilt the Scribe editor-theme settings to match `settings-scribe.png` exactly:

- **`ScribeSettings.tsx`** — replaced the preset-only picker with the manual's layout: a **Theme dropdown** (presets + saved customs), a **2-column grid of all 13 editable tokens** (color swatch + label + uppercase hex), the manual's description + the "Editing a color on a preset will automatically save it as a new custom theme named '…(custom)'" note + the "v1 scope: 13 tokens…" footer, and a **New custom theme name + Save as custom** flow.
- **`useScribeTheme.ts`** — added `setToken(key,color)` (forks a preset into "{name} (custom)" on first edit, live-applies to all open editors), `saveCustomAs(name)`, `deleteCustom`, and now loads saved customs.
- **`scribeThemeStore.ts`** — added `scribeCustomsStore` (per-user custom themes) + `saveScribeCustoms`.
- **`scribeThemes.ts`** — renamed the preset `Agenteryx` → **`Agenteryx Default`** to match the manual label. Colors were already byte-exact.

Verified: `npx tsc -b` → exit 0.

---

## Visual parity

- **Editor + syntax colors:** ✅ byte-exact — the "Agenteryx Default" palette matches the manual hex-for-hex.
- **Scribe Settings panel:** ✅ now matches the manual (dropdown, 13-token grid, hex labels, save-as-custom, copy).
- **Editor chrome (fig-5.1/5.2):** ✅ close — same dark workspace, file tree, open-files, split editor + right LLM panel.
- **Settings *shell* (delta):** the manual's Settings is a **full-screen modal** with its own left nav (General · Connections · Modes · Appearance · Scribe · Agent · Maintenance) and a "Close esc" button. Dwellium surfaces these as **ControlPanel sections** instead. Functionally equivalent; structurally different. Matching the modal shell 1:1 is a separate UI task (flagged below).

---

## App-level (manual ↔ Dwellium) — overview

The manual brands the app **Agenteryx**; left rail: **Scribe, Codex, Foundry, Hive, Domains, HUD**. Dwellium ships Scribe, Foundry, The Hive, Knowledge Graph / Cognitive-M-Network, the DOMAINS sidebar, and dashboards — so the surfaces map, under different names. A **full section-by-section audit of all 11 figure groups + 7 settings screens** (Codex, Foundry, Hive, Domains, HUD, Modes, Agent, Connections, Maintenance, etc.) was **not** done in this pass — this analysis is Scribe-deep + app-overview. The figure inventory for that follow-on: fig-1.x (overview), 2.x–4.x, 6.x–11.x, and settings-{general,connections,modes,appearance,agent,maintenance}.

---

## Recommended next steps (prioritized)

1. **Compare / diff view** for versions (manual's "Compare") — real feature gap.
2. **Branch** (version branching + bottom-bar control) — real feature gap.
3. **File-type badges** (PDF/MD pills) in FileTree — verify/add.
4. **Project/workspace switcher** chip at the top of the Scribe panel.
5. **Settings shell parity** — optional full-screen modal w/ left-nav + "Close esc" to match the manual 1:1.
6. **Full manual audit** — section-by-section pass over the remaining ~40 figures (Codex/Foundry/Hive/Domains/HUD/Modes/Agent/Connections/Maintenance) for app-wide parity.
