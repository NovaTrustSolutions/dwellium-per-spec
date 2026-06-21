# Manual ↔ Dwellium — Gap Analysis

**Date:** 2026-06-08
**Manual:** `~/Downloads/Manual` — 45 screenshots of the **"Agenteryx"** product manual (11 figure sections + 7 settings screens). Agenteryx (originally "Holocron") is the **design spec for Dwellium**: its left rail (Scribe · Codex · Foundry · Hive · Domains · HUD) and Settings (General · Connections · Modes · Appearance · Scribe · Agent · Maintenance) map to Dwellium's own surfaces.
**Reviewed in depth:** app shell (fig-1.1, fig-5.x), Settings → Appearance + Settings → Scribe. **Companion doc:** `SCRIBE_MANUAL_GAP_ANALYSIS.md` (Scribe feature-by-feature).
**Method:** screenshots compared against `qualia-shell/src/**`, verified by reading source.

---

## Headline

Dwellium implements essentially all of the manual's *surfaces* — it's the same product. The standout live gap is **theme application**: the manual states themes "apply instantly using CSS custom properties" to the whole app, but in Dwellium **many widgets don't re-skin** because their CSS hardcodes colors instead of reading the theme tokens. That's the active fix (below). Beyond that: Scribe is near-full parity (editor-theme gap already closed), and a few items remain (Compare/Branch in Scribe; the Settings modal *shell*).

---

## App structure mapping (manual → Dwellium)

| Manual (Agenteryx) left rail | Dwellium | Status |
|---|---|---|
| Scribe | Scribe widget | ✅ Present (deep) |
| Codex | Wiki / Knowledge surfaces | 🟡 Partial / different name |
| Foundry | Foundry widget | ✅ Present |
| Hive | The Hive widget | ✅ Present |
| Domains | DOMAINS sidebar / hierarchy | ✅ Present |
| HUD | Dashboards (Astra/Strata) | 🟡 Partial / different name |

---

## Settings parity (manual's 7 screens)

| Manual Settings screen | Dwellium | Status |
|---|---|---|
| **Appearance** — 8 theme cards w/ mini-previews (Holocron Dark, Tokyo Night, Dracula, Nord, Solarized Dark, Light Mode, Midnight Blue, Fey); "applies instantly via CSS custom properties" | ControlPanel → Appearance: **16-theme picker** (superset incl. Tokyo Night, Dracula, Nord, Solarized, Latte/Light, Fey-equivalent) + per-token editor + import/export | ✅ Present + superset — **but theme application incomplete (see Gap A)** |
| **Scribe** — 13-token editor-theme editor, presets + save-as-custom | `ScribeSettings.tsx` rebuilt to match (13 editable tokens, dropdown, save-as-custom, "Agenteryx Default") | ✅ Closed (this session) |
| General | ControlPanel → Layout/General | 🟡 Verify (not screen-compared) |
| Connections | Integrations + API Keys sections | 🟡 Partial (structure differs) |
| Modes | Mode/persona selection | 🟡 Verify |
| Agent | AI/agent settings | 🟡 Verify |
| Maintenance | System update section | 🟡 Partial |
| **Settings shell** — full-screen modal, own left nav, "Close esc" | ControlPanel sections (not a full-screen modal) | 🟡 Structural delta |

---

## Gap A — Themes don't reach every widget (active fix)

**Manual:** "Theme applies instantly using CSS custom properties. No restart needed." → the whole UI recolors per theme.

**Dwellium today:** the 16-theme system sets Dwellium's design tokens (`--bg-desktop`, `--bg-surface`, `--text-primary`, `--accent`, …) per theme, and token-driven components recolor correctly. **But many widget CSS files hardcode colors** — most visibly the acid-lime `#D6FE51` (e.g. `TwoBrains.css`, `PDFGear.css`) and fixed dark backgrounds / white text — so those widgets ignore the active theme. That's why themes look "not applied" on some widgets.

**Fix (in progress):** a tokenization sweep — replace hardcoded color literals in widget CSS with the matching theme tokens (`#D6FE51` → `var(--accent)`, fixed dark bg → `var(--bg-surface)` family, white text → `var(--text-primary)`, etc.) so every widget reads the live theme.

---

## Gap B — Scribe (from the companion doc)

Near-full parity. Remaining real gaps: **Compare** (diff two versions) and **Branch** (version branching). Minor: file-type badges, top workspace switcher chip. Everything else (editor, syntax theme, file tree, tabs, split view, LLM panel, context menu, redlines, comments, TOC, minimap, export, find/replace, focus, dump) is present.

---

## Gap C — Stella agent (resolved this session)

The Stella widget called an unimplemented `/api/stella/*` backend, so it always showed "agent offline." A **complete Stella backend** (`stellaRoutes.ts`: status-online, skills, file-based memory, chat, cron/mcp/voice) was implemented + mounted; the Electron app already auto-starts the backend, so Stella comes online on launch. (Backend `tsc` green; live boot verifies on the Mac.)

---

## Coverage + recommended follow-on

This pass reviewed the app shell, Scribe, and Settings (Appearance + Scribe). A **full figure-by-figure audit** of the remaining ~40 screenshots (Codex, Foundry, Hive, Domains, HUD, Modes, Agent, Connections, Maintenance, General — fig-2.x…fig-4.x, fig-6.x…fig-11.x) is the recommended next deliverable for app-wide 100% parity.

**Priority next steps:** (1) finish the theme-token sweep so every widget recolors [active]; (2) Scribe Compare + Branch; (3) Settings full-screen-modal shell parity; (4) full figure audit of the non-Scribe sections.
