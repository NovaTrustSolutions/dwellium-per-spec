# 064 — Master themes: `--text` / `--muted` reach WCAG AA on their own surfaces

Measured 2026-09-20 against `e0cf535` (`origin/main`). Found while verifying plan 063 with axe-core 4.11
across all 16 selectable themes (`src/context/ThemeContext.tsx::VALID_PICKER_THEMES`).

Repo: frontend `~/Downloads/Dwellium -Per Spec` (app in `qualia-shell/`). Branch `fix/064-theme-contrast`,
worktree `.claude/worktrees/064-theme-contrast`. One CSS file, one test, docs. No component CSS changes.

## Problem

`qualia-shell/src/styles/themes-master.css` bridges each palette onto the app tokens:
`--text-primary: var(--text)`, `--text-secondary: var(--muted)`, `--text-tertiary: var(--muted)`, and the
surfaces `--bg-desktop: var(--bg)`, `--bg-surface: var(--surface)`, `--bg-surface-elevated` / `-hover` /
`--window-titlebar: var(--surface2)`. So every widget's secondary text is `--muted` on one of three surfaces.

Worst ratio of each token against its own theme's `--bg` / `--surface` / `--surface2` (AA needs 4.5:1):

| Theme | `--text` | `--muted` | Theme | `--text` | `--muted` |
|---|---|---|---|---|---|
| cosmos (default) | 18.19 | 5.33 | dracula | 12.39 | **2.81** |
| deep-dark | 18.22 | **3.69** | obsidian | 15.22 | 5.27 |
| simple-black | 17.76 | 5.01 | tokyo-night | 8.32 | **2.96** |
| cyberpunk | 15.96 | **2.98** | gruvbox | 6.43 | **2.40** |
| synthwave | — | **3.87** (rgba, composited) | apple-dark | 11.35 | **3.96** |
| solarized | **3.62** | **3.84** | nord | 7.49 | **2.66** |
| rose-pine | 11.51 | **2.94** | latte | 10.85 | **3.53** |
| mocha | 8.69 | **2.54** | corporate | 17.29 | **4.26** |

13 of 16 themes fail; solarized fails on primary text too. `terminal-bl4` and `halocron` (not in the picker) pass.
In one real widget (Template Generator as on `origin/main`) axe reports token-coloured failing text on 11 of 16 themes.

## Fix (token level only)

Per failing token: keep HSL **hue and saturation**, move **lightness only** — lighter on dark themes, darker on
light ones — in 0.05 % steps until the worst of the three surfaces is ≥ 4.5:1 after rounding to hex.
Synthwave's translucent muted keeps its rgb and raises **alpha only** (.55 → .62). 14 token changes, 13 themes:

| Theme | Token | Before | After | Worst ratio |
|---|---|---|---|---|
| deep-dark | `--muted` | `#6e6e88` | `#7d7d95` | 3.69 → 4.55 |
| cyberpunk | `--muted` | `#666655` | `#83836d` | 2.98 → 4.50 |
| synthwave | `--muted` | `rgba(200,190,255,.55)` | `rgba(200,190,255,.62)` | 3.87 → 4.55 |
| solarized | `--text` | `#839496` | `#97a6a7` | 3.62 → 4.54 |
| solarized | `--muted` | `#7a9ba3` | `#8ba8af` | 3.84 → 4.53 |
| rose-pine | `--muted` | `#6e6a86` | `#8d89a2` | 2.94 → 4.50 |
| mocha | `--muted` | `#6c6f85` | `#979aab` | 2.54 → 4.51 |
| dracula | `--muted` | `#6272a4` | `#8a96bb` | 2.81 → 4.50 |
| tokyo-night | `--muted` | `#6b7599` | `#8d95b0` | 2.96 → 4.51 |
| gruvbox | `--muted` | `#928374` | `#c0b8af` | 2.40 → 4.50 |
| apple-dark | `--muted` | `#98989f` | `#a3a3a9` | 3.96 → 4.52 |
| nord | `--muted` | `#8090a8` | `#b3bccb` | 2.66 → 4.51 |
| latte | `--muted` | `#7c6aad` | `#6c58a1` | 3.53 → 4.50 |
| corporate | `--muted` | `#6b7280` | `#676e7c` | 4.26 → 4.51 |

**Not changed:** cosmos, simple-black, obsidian (already pass) — so the **default theme's tokens are untouched**
and the Linux Playwright screenshot baselines (default theme) do not need recapturing.

**Trade-offs, stated:** gruvbox and nord have a light `--surface2`, so their muted text ends up noticeably lighter
(primary/secondary hierarchy narrows: gruvbox text 6.43 vs muted 4.50 on `--surface2`). The alternative — darkening
`--surface2` — would move every elevated surface, hover state and title bar in the app; a text token is the smaller change.
`--border-strong` bridges to `--muted`, so strong borders get slightly lighter on the 13 themes. `--panel-text` is left
alone (it sits on `--panel-bg` ≈ `--bg`, where it already passes). The file header said "ported byte-for-byte" from the
source design; it now says which tokens deviate and why.

**Ceiling:** the guarantee is against the three opaque surfaces. A widget that stacks its own translucent overlay on a
surface can still land a hair under 4.5; that is the widget's composite, not the token.

## Regression test

`qualia-shell/src/test/themeContrast.test.ts` parses `themes-master.css`, and for **every** `.theme-X` block that defines
`--text` and `--muted` asserts ≥ 4.5:1 for both against `--bg`, `--surface`, `--surface2` (translucent tokens are
composited over each surface first). It also reads `VALID_PICKER_THEMES` out of `ThemeContext.tsx` and fails if a picker
theme has no block — a new theme cannot skip the check. Mutation check: restore one old value → the test must fail.

## Item 3 — `--accent` as text: documented, sized, NOT mass-edited

`--accent` (bridged from `--blue`) is below 4.5:1 as text on solarized / dracula / nord / apple-dark / gruvbox / corporate (confirmed live: after this plan every remaining `color-contrast` node in the test widget — 61 across 16 themes — has the theme's `--accent` as its foreground), and the
runtime accent picker overrides `--accent` with any colour the user likes (`ThemeContext.tsx:302` sets only `--accent`).
Exposure on `origin/main`: **222** `color: var(--accent)` declarations in **47** component CSS files (TranscriptionHub 33,
StellaAgent 17, Scribe 17, InboxZero 11, …) plus **199** inline `color: 'var(--accent)'` in TSX. A token `--accent-text`
already exists (37 uses) and is bridged to `--blue` too.

Decision: write the rule down now — *`--accent` paints fills, tints and borders; text uses `--accent-text`* — in the theme
file header and `docs/code.md`. Follow-up plan (not this one): (a) make `--accent-text` contrast-safe per theme and derive it
at runtime when the user picks an accent (`color-mix` toward `--text` until 4.5:1), (b) codemod `color: var(--accent)` →
`var(--accent-text)` file by file with a per-widget axe check. ~420 call sites is a plan of its own.

## `--tg-text-soft` (plan 063 workaround)

It lives only on PR #134's branch (`feat/063-template-generator`), not on `origin/main`, so this branch cannot touch it.
Its only job is to avoid `--muted`, so once both branches are on `main` it is **redundant**: every theme's `--muted` then
passes on all three surfaces. Replace `var(--tg-text-soft)` with `var(--text-secondary)` in a small follow-up after both land
(not here, and not on #134 — that branch does not have these token values). That widget's other rule, no `--accent` as text, is
item 3's subject and stays.

**Merge note:** this branch and PR #134 both append an entry at the end of `Docs/code.md` and add a row to `plans/README.md`,
so whichever merges second gets a trivial textual conflict there — keep both sides.

## Result (2026-09-20)

Contrast test 19/19, mutation-checked against the `origin/main` stylesheet (exactly the 13 affected themes fail, solarized at 4.11 / 3.62). Live, Template Generator as on `origin/main`, axe `color-contrast` on all 16 themes: nodes whose foreground is the theme's `--muted`/`--text` **135 → 0**; themes affected **11 → 0**; all contrast nodes 184 → 61, the 61 being `--accent` as text (item 3). Evidence: `~/Desktop/Theme-Contrast-064/` (`axe-before.json`, `axe-after.json`, 3 before/after screenshot pairs).

## Verify

1. `npx vitest run src/test/themeContrast.test.ts` — green; mutation-checked.
2. Strict gate from `CLAUDE.md` (tsc · vitest · build ×2 · PII · SSR smoke).
3. Standalone harness, Template Generator as on `origin/main`: axe `color-contrast` per theme, counting failures whose
   foreground is the theme's `--muted`/`--text`, before vs after; before/after screenshots on solarized, latte, deep-dark
   (`~/Desktop/Theme-Contrast-064/`).

## STOP conditions
- A token cannot reach 4.5:1 by lightness alone without leaving the 0–100 % range → stop, report the theme.
- The default theme (`cosmos`) needs a change → stop: that means recapturing the Linux baselines, which needs Ilya's go.
