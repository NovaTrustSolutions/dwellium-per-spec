# Dwellium — Complete Legibility Pass: Implementation Plan (LLM hand-off)

**Audience:** an LLM coding agent with full read/write access to the
`NovaTrustSolutions/dwellium-per-spec` repo and a way to run the app + Playwright.
**Goal:** guarantee that **every widget**, in **every sub-section**, under **every
theme**, has readable text — i.e. no text whose color is too close to the container
/ background it sits on ("container color and background must never match").
**Definition of done:** an automated contrast report shows **zero** WCAG-AA failures
across all themes × all widgets, a CI gate prevents regressions, and a visual
spot-check of gradient/over-image cases passes.

Use the **hybrid** approach below (Phase A exhaustive audit → Phase B fix → Phase C
prevent → Phase D visual spot-check → Phase E verify).

---

## 0. Critical context & gotchas (read first — these cost a prior agent hours)

- **Theme system.** Themes are `theme-<id>` classes + `[data-theme="<id>"]` on
  `<html>`. Tokens live in `qualia-shell/src/styles/variables.css` (the 8 "Dwellium"
  themes) and `qualia-shell/src/styles/themes-master.css` (the 18 "Master Pack"
  themes). The canonical list + ids are in
  `qualia-shell/src/context/ThemeContext.tsx` (`THEMES`, `MASTER_THEME_IDS`) and the
  union in `qualia-shell/src/data/types.ts`.
- **All 26 theme ids:** `dark, light, trust, vibrant, luxury, healthcare, creative,
  dark-excellence, terminal-bl4, cosmos, deep-dark, simple-black, cyberpunk,
  synthwave, solarized, rose-pine, mocha, dracula, obsidian, tokyo-night, gruvbox,
  apple-dark, nord, latte, corporate, halocron`.
- **🔴 Do NOT switch themes by mutating `document.documentElement.className`.**
  CSS custom properties do **not** reliably recompute under rapid class-swapping —
  a prior audit got false positives this way. Switch themes through the **real
  theme store** so the whole cascade updates: either drive the Control Panel →
  Appearance swatch (`page.getByRole('button', { name: '<Theme label>' }).click()`)
  or expose `themeStore.setTheme` (see Phase A). After switching, **wait for a
  paint** (`await page.waitForTimeout(150)`) before measuring.
- **🔴 Manual `localStorage['dwellium-theme']` is overwritten** by the per-user
  theme sync on mount. Always switch via the app's theme setter, not localStorage.
- **Compositing matters.** Card/glass surfaces are translucent (e.g.
  `rgba(14,14,14,0.88)`). Compute contrast against the **composited** background:
  blend the element's bg over its ancestor chain down to the opaque desktop bg,
  then compare to the (also composited) text color. Comparing against `transparent`
  gives garbage.
- **Animations cause transient faintness, not a real contrast bug.** StrataDashboard
  used a staggered `s-fadeIn` (opacity 0→1, up to ~0.8s) — screenshots taken
  mid-animation look illegible but the settled state is fine. **Measure only after
  animations settle** (wait ~1s after mount / sub-tab switch), and separately ensure
  entrance animations are fast + reduced-motion-safe (already fixed for Strata;
  apply the same pattern elsewhere).
- **Widget registry = source of truth.** All widgets are in
  `qualia-shell/src/registry/widgetRegistry.ts` (`WIDGET_REGISTRY`, 50 entries;
  `getWidgetKeys()`). Open any widget by dispatching the bus:
  `window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: '<id>' } }))`
  (handled in `WindowContext.tsx`). It renders inside `.window__content[data-widget-id="<id>"]`.
- **Sub-sections.** Many widgets have internal nav (Strata has Overview, Manager
  Home, Calendar, Properties, Leasing, Residents, Vendors, Owners, Accounting,
  Maintenance, Reporting, Communication, Profiles & Entities, Corporate Review,
  Integrations, Tenant Portal). The walker must click each internal nav item and
  re-measure. Enumerate sub-nav generically by querying clickable nav elements
  inside the widget root (see Phase A step 4).
- **Auth.** Use the existing e2e helper `qualia-shell/e2e/helpers/auth.ts::loginAs`
  (it also seeds `qualia_sidebar_groups`). Backend may be needed for some widgets;
  static-API mode is acceptable for layout/contrast.
- **Gate (must stay green):**
  `cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_SKIP_BUILD=true SMOKE_TEST_PORT=3210 node Scripts/smoke_test_ssr_phase8.mjs`
- **Never hardcode CSS colors for text/surfaces** in fixes — use theme tokens
  (`--text-primary/secondary/tertiary`, `--bg-surface*`, `--bg-glass`, `--accent*`).
  The Strata fix pattern: derive faint text from primary via
  `color-mix(in srgb, var(--text-primary) 80%, transparent)` so it always contrasts
  with whatever surface the theme produces.

---

## Phase A — Build the automated contrast walker (exhaustive audit)

Deliverable: `qualia-shell/e2e/legibility-audit.spec.ts` (Playwright) that produces
`Docs/legibility-report.json` + a console summary.

**A1. Expose a test theme setter** (so the walker switches themes reliably):
in `ThemeContext.tsx`, add, guarded for dev/test only:
`if (typeof window !== 'undefined') (window as any).__setTheme = themeStore.setTheme;`
(or reuse the existing store import). Remove or keep behind `import.meta.env.DEV`.

**A2. Drop in this contrast helper** (works in `page.evaluate`):

```js
function relLum({r,g,b}){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);}
function parse(c){const m=(c||'').match(/[\d.]+/g)||[];return{r:+m[0]||0,g:+m[1]||0,b:+m[2]||0,a:m[3]!==undefined?+m[3]:1};}
function over(fg,bg){const a=fg.a;return{r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a),a:1};}
function compositedBg(el){ // blend bg up the ancestor chain to an opaque color
  let acc={r:0,g:0,b:0,a:0}, node=el;
  const stack=[];
  while(node){stack.push(parse(getComputedStyle(node).backgroundColor)); node=node.parentElement;}
  // start from the bottom (root) up
  let base={r:255,g:255,b:255,a:1};
  for(let i=stack.length-1;i>=0;i--){const c=stack[i]; if(c.a>0) base=over(c,base);}
  return base;
}
function ratio(fg,bg){const L1=relLum(fg),L2=relLum(bg);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);}
```

**A3. Text-node visitor.** For the active widget root
(`.window__content[data-widget-id="<id>"]`), select every element that has a direct,
non-empty text node and is visible (`offsetParent !== null`, non-zero box). For each:
compute `fg = composited text color over its own bg`, `bg = compositedBg(parent)`,
`r = ratio(fg,bg)`. Threshold: **4.5** for normal text; **3.0** if computed
`font-size ≥ 24px` OR (`≥18.66px` AND `font-weight ≥ 700`). Record failures as
`{theme, widgetId, subSection, text: el.textContent.slice(0,40), fontPx, ratio, fg, bg, selectorPath}`.
Skip elements with `opacity < 0.99` on themselves or any ancestor (animation in
flight) — or wait for settle first (preferred).

**A4. Sub-section enumeration.** Inside the widget root, collect candidate nav
controls: `root.querySelectorAll('[role="tab"], .s-nav-item, nav button, [class*="nav"] button, [class*="tab"]')`.
For each, click it, `waitForTimeout(900)` (let content + fade settle), then run the
visitor. De-dupe by visible label. Always measure the default view first.

**A5. Drive matrix.** For each `themeId` of the 26: `await page.evaluate(t => window.__setTheme(t), themeId)`, `waitForTimeout(200)`.
Then for each `widgetId` of `getWidgetKeys()`: dispatch open-widget, `waitForTimeout(1000)`,
run A4 (sub-sections) + A3 (visitor), close the widget (`dwellium:close-widget`).
Collect all failures.

**A6. Output.** Write `Docs/legibility-report.json` (array of failures) + print a
grouped summary (by widget, then theme). Also write `Docs/legibility-report.md`
as a readable table.

> Notes: ~26 × 50 × (1–16 sub-sections) is large; shard by theme or widget and run
> in parallel workers. Seed empty/dynamic widgets with the static-API fixtures so
> content renders. Some widgets legitimately render nothing without backend — mark
> `status: 'no-content'` and skip rather than false-fail.

---

## Phase B — Fix every failure the report lists

For each failure, fix at the **source**, never with a one-off hardcoded color:

1. **Faint text on a surface** → change the text color to a theme token that
   contrasts with that surface. Preferred pattern (guaranteed across all themes):
   `color: color-mix(in srgb, var(--text-primary) 80%, transparent);` for secondary,
   `62%` for tertiary. (This is the exact fix already applied in
   `components/StrataDashboard/StrataDashboard.css` — copy it.)
2. **Surface ≈ desktop (container blends into bg)** → give the container a real
   elevated surface token (`--bg-surface-elevated` / `--bg-glass`) and a
   `1px solid var(--border-default)` border so it's always distinct.
3. **Accent/gradient text low-contrast on light themes** → don't clip an accent
   gradient to text for body content; use `var(--text-primary)`, or restrict the
   gradient to large headings only and verify ≥3.0.
4. **Hardcoded hex/rgb** (e.g. `color:#fff`, `background:#fff`, `rgba(255,255,255,…)`)
   → replace with tokens. Grep offenders:
   `grep -rnE "color:\s*#|background[^;]*#fff|rgba\(255, *255, *255" qualia-shell/src/components --include=*.css`.
5. **Transient faintness from entrance animations** → shorten + add
   `@media (prefers-reduced-motion: reduce)` and `body.animations-off` overrides that
   set `opacity:1; animation:none` (Strata pattern already in place).

Re-run Phase A after each batch until the report is empty.

---

## Phase C — Prevent regressions (CI token enforcement)

1. **Stylelint (or a custom grep gate)** that fails CI on hardcoded text/background
   colors in `qualia-shell/src/components/**/*.css` (allow a documented short
   whitelist for brand marks / physical-color scenes). Add as a step in
   `.github/workflows/appfolio-parity-gate.yml`.
2. **Commit `legibility-audit.spec.ts` as a CI job** (the Phase A walker) that fails
   if any contrast failure appears — this is the real guarantee. Run it on a small
   theme subset per PR (e.g. dark + light + halocron) and the full 26 nightly to keep
   PRs fast.
3. Document the rule in `qualia-shell/src/styles/AGENTS.md`: "widget text uses
   `--text-*` tokens; faint text derives from `--text-primary` via color-mix; never
   hardcode text/surface colors."

---

## Phase D — Visual spot-check (catches what math misses)

For the handful of widgets with gradients, text-over-image, video, or canvas
(e.g. ARA Console, Holocron Library, Knowledge Graph, Transcription Hub, Astra/Strata
charts), capture a Playwright screenshot per theme and review each for legibility
(human or vision model). Contrast math can't see text over images/gradients reliably.

---

## Phase E — Verify & hand back

1. Phase A report = 0 failures across all 26 themes.
2. Full gate green (command in §0).
3. CI legibility job green.
4. Remove the `window.__setTheme` dev hook if you don't want it shipped (or guard it
   behind `import.meta.env.DEV`).
5. Summarize: themes×widgets covered, failures found & fixed, files touched.

---

## Appendix — quick reference

- Open a widget: `window.dispatchEvent(new CustomEvent('dwellium:open-widget',{detail:{widgetId:ID}}))`
- Close: `window.dispatchEvent(new CustomEvent('dwellium:close-widget',{detail:{widgetId:ID}}))`
- Widget root: `.window__content[data-widget-id="ID"]`
- Theme set (after adding hook): `window.__setTheme('halocron')`
- Widget ids: `import { getWidgetKeys } from 'qualia-shell/src/registry/widgetRegistry'`
- Theme ids: see §0 (26).
- Strata fix reference (copy the pattern): `qualia-shell/src/components/StrataDashboard/StrataDashboard.css`
  (`--s-text-secondary/--s-text-tertiary` color-mix + reduced-motion animation block).
