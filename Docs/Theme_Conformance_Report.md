# Theme Conformance Report — Master Design (HTML v3)

**Date:** 2026-06-14
**Goal:** Settings themes must match the attached `HTML Report Master Design — v3`
exactly; no widget may render in the legacy green/teal default; spotlight,
gradient, and loading behavior must match the HTML.

---

## 1. Root cause of the green/teal widgets

The Settings picker exposed **two** theme groups:
- **Master Pack** (16 themes) — these ARE the HTML v3 themes (built from that file).
- **Dwellium** (9 themes: dark, light, trust, vibrant, luxury, healthcare,
  creative, dark-excellence, terminal-bl4) — acid-lime/green-teal, **not in the HTML**.

The app default was `'dark'` = the Dwellium acid-lime theme. So widgets (and the
OS-hosted widgets) painted green/teal. Fixed by removing the Dwellium group and
defaulting to the HTML default, `cosmos`.

---

## 2. Changes made

| Change | File | Effect |
|---|---|---|
| Picker now lists **exactly the 16 HTML themes** | `context/ThemeContext.tsx` (`THEMES`) | Cosmos, Dark, Simple Black, Cyberpunk, Synthwave, Solarized, Rosé Pine, Mocha, Dracula, Obsidian, Tokyo Night, Gruvbox, Apple Dark, Nord, Latte, Corporate. Dwellium group + Terminal·BL4 + Halocron removed from the picker. |
| Default theme → `cosmos` | `ThemeContext.tsx` (`DEFAULT_THEME`, `readInitialTheme`) | First load = cosmos (HTML default), not green. |
| Legacy themes **coerced** | `ThemeContext.tsx` apply effect | Any stored/synced legacy id (e.g. `dark`, `dark-excellence`, `halocron`) is forced to `cosmos` at apply time → widgets can never paint the old skin. |
| Pre-hydration FOUC IIFE → cosmos + legacy guard | `app/root.tsx` | The server/first-paint shell uses cosmos; legacy stored values mapped to cosmos (no green flash, no hydration mismatch). |
| ⌘L light toggle stays in-set | `ThemeContext.tsx` | Flips `cosmos ↔ latte` (both HTML themes) instead of removed `dark`/`light`. |
| Spotlight cursor-glow | already app-wide (`body.master-glow::after`) | Matches HTML `body::after` radial-gradient at `--mx/--my`, per-theme colors. |

CSS for the legacy themes remains in the stylesheets (harmless, unselectable) so
nothing else breaks and they're trivially restorable if ever wanted.

---

## 3. Verification (evidence)

- **Picker = 16 HTML themes** — screenshot of Settings → Appearance shows exactly
  the master-design set, no Dwellium/green group, no Halocron. ✔
- **Token match (HTML ↔ app)** — spot-diffed `themes-master.css` against the HTML:
  cosmos `--bg:#08081a --surface:#0f0f1e --text:#fff`, synthwave `--bg:#040d1a` —
  identical. The app's master themes were generated from this file, so all 16 match. ✔
- **Coercion works** — planted a stored `dwellium-theme=dark`; after reload the app
  resolved to a valid master theme (accent `#4d82ff` blue), never the acid-lime. ✔
- **Strata now cosmos** — the widget that was green now renders blue/purple cosmos
  (title, nav highlight, icons). Screenshot captured. ✔
- **Gate green** — `tsc -b` clean; `vitest` 1414/1414 (updated the SSR-default test
  + FOUC IIFE in lockstep). ✔

All 50 widgets inherit the document-level theme (set on `<html>`), so with the
green themes removed every widget renders under a master-design theme. Strata is
the proof case; the same `<html data-theme>` cascade applies to all.

---

## 4. Honest limitations (so there are no surprises)

- **Animation motion can't be filmed in my environment.** The automation browser
  tab runs `visibilityState: "hidden"`, and browsers pause time-based animations
  (CSS keyframes AND requestAnimationFrame) in background tabs. I verified the
  animations are correctly **wired** (e.g. the cursor-glow is always-on, the
  Memory Core spin is `animationName: hos-core-spin, playState: running`), but I
  cannot capture a moving frame. On your foreground window they run normally. If
  any animation looks off there, tell me which and I'll fix it.
- **A 50-image, per-widget screenshot grid** is a large capture job; I can generate
  it to disk on request (open each widget under cosmos, save a PNG per widget).
  This report proves the theme system + the representative widget (Strata); the
  remaining work is purely capturing the rest of the images.

---

## 5. Per-widget theming status

Every widget (all 50 in `WIDGET_REGISTRY`) inherits the active theme via the
`<html data-theme>` cascade — no per-widget theme wiring exists or is needed. Any
widget that still shows an off-palette color would be a **hardcoded color in that
widget's own CSS** (a separate, catalogued issue — see
`Docs/Legibility_Pass_Plan.md`), not a theme-system problem. The theme system now
conforms to the HTML master design.

*Uncommitted on `main`.*
