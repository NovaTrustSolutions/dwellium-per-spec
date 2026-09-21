# 065 — Accent as text: a contrast-safe `--accent-text`, the runtime picker, and the codemod

Measured 2026-09-20 against `e0cf535` (`origin/main`). Follow-up to plan 064 (item 3). Frontend only, no backend.
**Depends on 064 (PR #135) being on `main`** — this plan extends `src/test/themeContrast.test.ts` and the theme-file header
from that PR. If 064 is not merged when work starts, branch from `fix/064-theme-contrast` instead and say so in the PR.

## Problem

`--accent` is a fill colour that the app also uses as a text colour. As text it is below WCAG AA (4.5:1) on the theme's
own surfaces in **6 of 16** picker themes, and the Control Panel lets the user replace `--accent` with any colour at all
(`ThemeContext.tsx:302` sets only `--accent`). Worst ratio of `--accent` (= `--blue`) against `--bg`/`--surface`/`--surface2`,
and against its own 14 % tint over `--surface` (the usual "accent chip"):

| Theme | `--blue` | on surfaces | on own tint | | Theme | `--blue` | on surfaces | on own tint |
|---|---|---|---|---|---|---|---|---|
| solarized | `#268bd2` | **3.11** | **2.96** | | apple-dark | `#0a84ff` | **3.11** | **3.28** |
| dracula | `#6272a4` | **2.81** | **2.90** | | nord | `#81a1c1` | **3.21** | **3.06** |
| gruvbox | `#83a598` | **3.28** | **3.47** | | corporate | `#0070c9` | **4.44** | **4.14** |

The other 10 pass both (cosmos, the default, 5.54 / 4.86; tightest passes: synthwave 4.62, simple-black 4.59 on tint).
Confirmed live after 064: every remaining `color-contrast` node in the test widget (61 across 16 themes) had `--accent` as its foreground.

A token for this already exists: `--accent-text`, defined in every block of `themes-master.css` as `var(--blue)` (so it is
no safer than `--accent` today) and 8 times in `variables.css`, used 37 times.

**Exposure on `origin/main`** (the 064 plan said "~420"; that missed the fallback form — corrected here):

| Shape | Count | Files |
|---|---|---|
| CSS `color: var(--accent);` | 222 | 47 |
| CSS `color: var(--accent, <fallback>);` | 123 | — |
| CSS `color: var(--accent-hover);` | 26 | — |
| TSX inline `color: 'var(--accent)'` | 199 | 58 |
| TSX `stroke=` / `fill=` / `color=` props | 2 | — |

Heaviest: `TranscriptionHub.css` 33, `StellaAgent.css` 17, `Scribe.css` 17, Strata modules (`PropertiesModule.tsx` 17,
`ReportingModule.tsx` 16, `MaintenanceModule.tsx` 13, `LeasingModule.tsx` 10, `StrataDashboard.tsx` 10, `VendorsModule.tsx` 9),
`InboxZero.css` 11, `ThoughtWeaver.css` 10, `HonchoHermesPanel.css` 10.

## Design (the lazy version)

One rule, one token, one mechanical sweep: **`--accent` paints fills, tints, borders, icons and focus rings; text uses `--accent-text`.**

- **Do not change `--accent` / `--blue` themselves.** Buttons, tints, borders and gradients keep the theme's identity.
- **Make `--accent-text` safe where it is not**, with the 064 method: same hue and saturation, lightness moved the minimum
  needed. Only the 6 failing themes get a literal value; the other 10 stay `var(--blue)`. So on the **default theme
  `--accent-text` still equals `--accent`** and the codemod is pixel-identical there → the blocking Linux screenshot
  baselines and the axe baseline (8 Strata pages, default theme) are unaffected.
- **Runtime:** when the user picks a custom accent, set `--accent-text` next to `--accent`; when they clear it, remove both.
- **Codemod** the text usages. Skipped on purpose: backgrounds, borders, `box-shadow`, gradients, `-webkit-text-fill-color`
  gradient text, SVG `stroke`/`fill` (icons need 3:1 non-text contrast, a different rule — not this plan), and any
  large-text exemption (large text only needs 3:1, but treating all text alike is simpler and never wrong).

## Phase 1 — token (S)

Files: `src/styles/themes-master.css`, `src/test/themeContrast.test.ts`, new `src/utils/contrast.ts`.

- Move the pure helpers out of the 064 test into `src/utils/contrast.ts` (`parseColor`, `luminance`, `contrast`, plus
  `nudgeToContrast(color, backgrounds, target = 4.5)` — the 064 lightness walk, lighter on dark backgrounds, darker on light).
  The test imports them; Phase 2 reuses them. No new dependency.
- For the 6 failing themes set `--accent-text` to `nudgeToContrast(--blue, [bg, surface, surface2, tint14(surface), tint14(surface2)])`
  rounded to hex. Record before → after and the resulting worst ratio per theme in this file, as 064 did.
- Extend the test: for every theme block, resolve `--accent-text` (follow one `var(--x)` hop) and assert ≥ 4.5:1 on
  `--bg`, `--surface`, `--surface2` **and** on a 14 % accent tint over `--surface` and `--surface2`. Mutation-check it.
- `variables.css` has 8 more `--accent-text` definitions for the legacy themes. `ThemeContext` coerces stored themes to the
  16 picker themes, so first prove whether those blocks are reachable (`terminal-bl4`, `halocron`, tenant/security portals).
  Reachable → same treatment + same test; unreachable → leave, and note it.

## Phase 2 — runtime accent picker (S)

Files: `src/context/ThemeContext.tsx` (the effect at ~`:296-304`), `src/test/` new `accentText.test.ts`.

- In the effect that applies `accentColor`: after `root.style.setProperty('--accent', accentColor)` read the theme's computed
  `--bg` / `--surface` / `--surface2` from `getComputedStyle(root)` and set `--accent-text` to
  `nudgeToContrast(accentColor, thoseSurfaces + tints)`. On clear, `removeProperty('--accent-text')` as well, so the theme's
  own token wins again. It re-runs on theme change (the effect already depends on `[theme, accentColor]`).
- Effect-time only (SSR-safe per the repo's 3-altitude rule). Guard `parseColor` failure: leave `--accent-text` alone.
- Tests: a dark-on-dark pick (`#333399` on cosmos) comes back ≥ 4.5 with the same hue; an already-safe pick comes back
  unchanged; clearing removes the property; a theme switch recomputes.
- `// ponytail: surfaces are read once per theme/accent change; a widget's own translucent overlay is not modelled.`

## Phase 3 — codemod (M, mechanical)

New `Scripts/codemod_accent_text.mjs` (dry-run by default, `--write` to apply, prints per-file counts). Rewrites, in `qualia-shell/src/**`:

| From | To |
|---|---|
| CSS, declaration property exactly `color` : `var(--accent)` | `var(--accent-text)` |
| CSS `color: var(--accent, X)` | `var(--accent-text, X)` |
| TSX `color: 'var(--accent)'` / `"var(--accent)"` | `'var(--accent-text)'` |

Property must be exactly `color` (not `background-color`, `border-color`, `outline-color`, `caret-color`, `accent-color`,
`-webkit-text-fill-color`). `TemplateGenerator.css` needs nothing (063 already removed accent text there).

Review in four clusters by file ownership, one commit each, so a bad cluster reverts alone:
**A** `StrataDashboard/**` (in the CI baselines — run the Playwright baseline spec locally for this one) ·
**B** `TranscriptionHub`, `Scribe`, `StellaAgent` · **C** all other component CSS · **D** all other TSX.

Then the guard — `src/test/accentAsText.test.ts` (same shape as `ci/parityGateTwin.test.ts`): greps `src/**/*.{css,tsx}` for the
three "From" shapes and fails on any hit outside a short allowlist array in the test, each entry with a one-line reason.
That is what stops the next widget from reintroducing it.

**Ilya gate — `--accent-hover` as text (26).** `--accent-hover` bridges to `--ge`, a second hue. Measure it per theme first
(same script). If it fails anywhere, add `--accent-text-hover` by the same method and codemod those 26; if it passes
everywhere, leave them. Default if no answer: measure, and only add the token if something fails.

## Ride-along (only once 063 and 064 are both on `main`)
`TemplateGenerator.css`: replace `var(--tg-text-soft)` with `var(--text-secondary)` and delete the `--tg-text-soft` definition and
its comment — 064 made `--muted` safe, which was the workaround's only reason.

## Verify
1. `npx vitest run src/test/themeContrast.test.ts src/test/accentText.test.ts src/test/accentAsText.test.ts` — green, each mutation-checked.
2. Strict gate from `CLAUDE.md`. Cluster A additionally: the Playwright screenshot-baseline + axe-baseline specs locally.
3. Prove "default theme is pixel-identical": in the standalone harness on cosmos with no custom accent, computed `color` of a
   converted element equals the computed `--accent` (one assertion), before trusting the baselines.
4. Live axe sweep, all 16 themes, on three converted widgets (one per cluster B/C/D) in the standalone harness: `color-contrast`
   nodes whose foreground is the theme's `--accent` must go to 0. Count `response`-style evidence, not impressions — and count
   only nodes whose foreground IS the token (064's lesson).
5. Same sweep once more with a hostile custom accent (`#333399` on cosmos, `#ffee00` on latte).
6. Deploy preview: fetch the served CSS, check content-type and the six new values (a 200 proves nothing on this site).

## STOP conditions
- The default theme's `--accent-text` would have to differ from `--accent` → stop: that means recapturing the Linux baselines, which needs Ilya's go.
- A Strata baseline screenshot differs after cluster A → stop and show the diff; do not recapture.
- The codemod wants to touch a non-`color` property, or a file outside `qualia-shell/src/` → stop; fix the script, not the files.
- `nudgeToContrast` cannot reach 4.5 inside 0–100 % lightness for some theme → stop and report it.

## Decisions for Ilya (defaults in bold)
1. Custom accent: **derive the text colour from the pick (may look lighter/darker than the swatch)** · or keep text exactly the
   picked colour and show a "low contrast" note in the Control Panel.
2. `--accent-hover` as text: **measure first, add a token only if something fails.**
3. Execution: **one executor runs the codemod; four review commits** · or a ruflo swarm by cluster (the work is mechanical — a swarm buys little).

## Size
Phase 1 ~60 lines + 6 values. Phase 2 ~30 lines + tests. Phase 3: script ~60 lines, ~545 one-token replacements (222 + 123 + 199) across at least 105 files (47 CSS + 58 TSX, before counting the files that hold only the fallback form), guard test ~40 lines.
