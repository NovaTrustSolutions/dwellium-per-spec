# 063 — Template Generator: make it do what it says

Audited 2026-09-19 against `e0cf535` (`origin/main`). Source of the findings: a read of the whole
component, an adversarial second review (17 of 19 candidate defects confirmed, 2 partly, 0 refuted),
a static a11y audit, and a `pdf-lib` repro script (multi-page overprint, `WinAnsi cannot encode`,
632 pt text on a 612 pt page, `$&` corrupting substitution — all reproduced).

Repo: frontend `~/Downloads/Dwellium -Per Spec` (app in `qualia-shell/`). No backend change.
Branch: `feat/063-template-generator`, worktree `.claude/worktrees/063-template-generator`.

**Standing rules for every executor**
- No new dependencies. `jszip`, `mammoth`, `dompurify` are already installed; `pdf-lib` stops being used here.
- No sample data: no fake names, addresses or amounts in defaults. Test fixtures inside `src/test/**` are fine.
- `git add` explicit paths only (the worktree's `node_modules` is a symlink). Never `git add -A`.
- Do not push, merge, or touch `main`. Do not edit `LoginScreen.tsx` or anything under `src/context/UserContext.tsx`.
- Build with `npx react-router build`, never `npx vite build`.
- Read `docs/code.md` line 264 before writing the store (per-user `createLocalStorageStore` + `withSync`, never bare `useState` for state a user expects to find again; re-check the world after every `await`).
- A deliberate shortcut gets a `// ponytail:` comment naming its ceiling.

## What is wrong today (one line each, anchors are `TemplateGenerator.tsx` at `e0cf535`)

1. Generate PDF ignores the HTML template; it prints a label/value list (`:141-226`).
2. Overflow pages stay blank and text overprints page 1 (`page` is never reassigned, `:178`).
3. Non-WinAnsi text (Cyrillic, CJK, emoji) throws; the user sees only "Failed to generate PDF" (`:146`).
4. No wrapping; long values run off the page (`:194`).
5. `v.value` is used as a replacement *string*, so `$&`, `$'`, `$$` corrupt the output (`:111`). Values are not HTML-escaped either.
6. `{{ key }}` with spaces, and keys with `-` or `.`, are ignored (`:110`, `:118`).
7. Extract Variables deletes every variable not in the template, filled in or not (`:125-130`).
8. Added variables get an uneditable key `var_<base36>` that matches no placeholder; type and label are display-only (`:246-249`, `:357`).
9. After one PDF exists, Preview HTML shows nothing new and Download serves a stale file (`:459`). Preview is not live (`:135-138`).
10. Nothing persists. The header comment claims save/load (`:7`).
11. Blocks UI is unreachable (`:94`, `:375`). `iframeRef` is never read. DOCX tab is a stub with a drag-and-drop promise and no handlers (`:404-415`).
12. Defaults ship a fake client (`:78-79`) and the violet `#6c5ce7` the design sweep removed everywhere else (`:43`, `:48`, `:169`).
13. CSS: fixed 220 px + 380 px columns, no responsive rule, no default window size, so the editor has no width in a quadrant window; ~35 hardcoded colours, `#c8d6e5` textarea text is ~1.2–1.5:1 on the light themes; two `outline: none`; icon spans sized by `font-size` while every icon is `size={14}`; an infinite float animation.
14. a11y: toast is unannounced, 3 s, and the only place errors appear; inputs named by placeholder only; tabs expose no current state.
15. No tests.

## Design (the lazy version)

**The template is the source of truth for variables.** The form shows exactly the keys found in the
active source, in first-appearance order. Values live in a map keyed by variable name, so a key that
disappears while the user is typing in the template keeps its value and comes back with it. This
deletes Add Variable, Remove Variable, Extract Variables and the unrenameable-key problem instead of
fixing them. To add a variable, type `{{new_key}}` in the template.

**The browser is the PDF engine.** The preview iframe is always the rendered document; the primary
button calls `iframe.contentWindow.print()` and the user picks "Save as PDF". That gives CSS fidelity,
wrapping, page breaks and Unicode for free and removes ~90 lines of `pdf-lib` drawing code (defects 1–4).
The sandbox becomes `allow-same-origin allow-modals` — still no `allow-scripts`, so template scripts cannot run.
The preview document gets a CSP (`default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:`) and `<meta refresh>` is stripped: the sandbox does not stop network loads, and the document holds autofilled tenant data (wave-3 review). Remote logos therefore do not load — embed them as `data:` URIs.
Skipped: producing PDF bytes in-app (needed only for "save to Filing Cabinet"); add it through the
backend `/api/docs/convert` route when that is asked for.

**DOCX uses what is installed.** `jszip` opens the file, native `DOMParser` finds placeholders,
the filled `.docx` downloads, and the existing mammoth path renders a preview into the same iframe,
so Print works for DOCX too. Skipped: `cloneBlock` / `deleteBlock` / `cloneRow` — remove the cards that advertise them.

## Module contracts (parallel executors build against these; do not change a signature without updating this file)

### `qualia-shell/src/components/DocViewer/templateEngine.ts` — pure, no React, no browser globals at import
```ts
export type VarType = 'text' | 'number' | 'date' | 'currency';
export const PLACEHOLDER_SOURCE = '\\{\\{\\s*([\\w.-]+)\\s*\\}\\}';   // build a fresh RegExp(…, 'g') per call — a shared /g regex keeps lastIndex
export function extractKeys(source: string): string[];              // unique, first-appearance order
export function inferType(key: string): VarType;                    // /date/i → 'date'; /amount|price|total|rent|fee|deposit|balance/i → 'currency'; else 'text'
export function labelFor(key: string): string;                      // 'client_name' → 'Client name'
export function formatValue(raw: string, type: VarType): string;    // '' → ''; date 'YYYY-MM-DD' → local date WITHOUT timezone shift; currency → Intl USD; unparsable → raw
export function escapeHtml(s: string): string;                      // & < > " '
export function renderTemplate(html: string, values: Record<string, string>, types: Record<string, VarType>): string;
```
`renderTemplate`: one `replace` with a **function** replacer. Known key with a non-empty value →
`escapeHtml(formatValue(value, types[key] ?? inferType(key)))`. Missing or empty value → the original
`{{key}}` text stays, so a blank field is visible in the preview and on paper.
`// ponytail: currency is USD only; take a currency code per template when a non-US user appears.`

### `qualia-shell/src/components/DocViewer/templateAutofill.ts` — pure
```ts
import type { Property, EntityProfile } from '../StrataDashboard/strataTypes';
export type AutofillKind = 'property' | 'tenant' | 'owner' | 'vendor';
export function recordToValues(kind: AutofillKind, record: Property | EntityProfile): Record<string, string>;
export function recordLabel(kind: AutofillKind, record: Property | EntityProfile): string;   // text for the <option>
```
Read the real field names in `packages/types/index.ts` first. Property → `property_name`,
`property_address` (the address parts that exist, joined with ", "), `property_city`, `property_state`,
`property_zip`. Entity → `<kind>_name`, `<kind>_email`, `<kind>_phone`; a tenant also fills `client_name`.
Never emit a key with an empty value. The caller applies only keys present in the template.

### `qualia-shell/src/components/DocViewer/docxFill.ts`
```ts
export async function extractDocxKeys(file: Blob): Promise<string[]>;
export async function fillDocx(file: Blob, values: Record<string, string>, types: Record<string, VarType>): Promise<Blob>;
export async function docxToHtml(file: Blob): Promise<string>;      // sanitized with DOMPurify before it is returned
```
- Lazy `await import('jszip')` (pattern: `Scribe/idocs/idocsPptxImport.ts:24`). For `docxToHtml`, **reuse** `Scribe/docxConvert.ts` if it already exposes docx→HTML; write new mammoth code only if it does not.
- Parts: `word/document.xml`, every `word/header*.xml`, every `word/footer*.xml`.
- Word splits `{{client_name}}` across runs. Per `<w:p>`: join the `<w:t>` text only to FIND placeholders, then edit run by run — a placeholder inside one run is replaced in place; one split across runs puts its value in the run where it starts and trims its fragments from the runs it spans. Runs are never merged wholesale, so a `<w:tab/>` / `<w:br/>` run between two placeholders keeps its place (amended after the wave-3 review: the first version collapsed everything into the first run and moved the tab after both values). Assign through `textContent` so XML escaping is automatic; untouched runs are not rewritten.
  `// ponytail: a value takes the formatting of the run its placeholder STARTS in.`
- Same fill rule as HTML: empty value leaves `{{key}}` in place.
- A file that is not a zip, or has no `word/document.xml`, throws `Error('Not a .docx file')`.

### `qualia-shell/src/utils/templateGeneratorStore.ts` — copy the shape of `universalShellStore.ts`
```ts
export interface StoredTemplate { id: string; name: string; html: string; values: Record<string, string>; types: Record<string, VarType>; }
export interface TemplateGeneratorState { templates: StoredTemplate[]; activeId: string; }
export const TEMPLATE_GENERATOR_KEY = 'dwellium:templateGenerator';      // full key `${KEY}:<uid>` / `:_anonymous`
export const DEFAULT_HTML_TEMPLATE: string;
export function createDefaultState(): TemplateGeneratorState;            // one template: id 'default', name 'Property report', values {}, types {}
export const templateGeneratorStore;                                     // withSync(createLocalStorageStore(...), { objectType: 'templateGenerator', holder, resolveKey })
export function setTemplateGeneratorState(next: TemplateGeneratorState): void;
export function useTemplateGeneratorState(): TemplateGeneratorState;
```
- Holder `templateGeneratorUserIdHolder` in `src/lib/perUserIdentity.ts`, added to `ALL_HOLDERS` (mirror lines 102-103 and 137). If a test pins the holder count, update that test.
- `deserialize` validates shape field by field; anything malformed → `createDefaultState()`; an `activeId` that matches no template → the first template's id.
- `DEFAULT_HTML_TEMPLATE`: today's layout, with the violet replaced by `#111` text / `#111` table header / `#999` rule, footer `Generated by Dwellium · {{date}}`. No values.
- The uploaded `.docx` is **not** stored (binary; stays on the user's disk). Its values go in the active template's `values` map like any other key.

## Cluster A — engine + autofill mapping (new files only)
Files: `templateEngine.ts`, `templateAutofill.ts`, `src/test/templateEngine.test.ts`, `src/test/templateAutofill.test.ts`.
Tests must include: `$&`, `$'`, `$$`, `$350.00` values come out literally; `<b>&"` is escaped;
`{{ title }}` and `{{client-name}}` and `{{a.b}}` substitute; repeated keys extract once; empty value leaves the placeholder; `formatValue('2026-01-05','date')` does not shift a day in a negative-UTC zone (construct the date from parts, not `new Date('2026-01-05')`); `recordToValues` omits empty fields.

## Cluster B — DOCX (new files only)
Files: `docxFill.ts`, `src/test/docxFill.test.ts`.
The test builds its own `.docx` with `jszip` (minimal `[Content_Types].xml` + `word/document.xml`), including
one placeholder **split across three runs**, one in `word/header1.xml`, and a value containing `<&>`. Assert:
keys extracted (split one included), filled XML contains the escaped value once, untouched paragraph is byte-identical,
non-docx input rejects with `Not a .docx file`. `docxToHtml` may be covered by a mocked-mammoth test if mammoth cannot run in jsdom — say so in the test name.

## Cluster C — per-user store (new file + 2 lines in `perUserIdentity.ts`)
Files: `src/utils/templateGeneratorStore.ts`, `src/lib/perUserIdentity.ts`, `src/test/templateGeneratorStore.test.ts`.
Follow `src/test/universalShellPersistence.test.tsx`: call `.reset()` in `beforeEach` **and between unmount and remount**
(a remount test that passes with the `localStorage` write deleted proves nothing — mutation-check it once and restore).
Cases: default state; set → reset → read returns the stored value; two user ids do not see each other's templates; malformed JSON → default; dangling `activeId` repaired.

## Cluster D — CSS cleanup (existing rules only; no new class names)
File: `TemplateGenerator.css`, plus one line in `src/context/WindowContext.tsx::COMPONENT_DEFAULT_SIZES`: `'template-generator': { w: 1100, h: 760 }`.
- Replace every hardcoded colour with the theme custom properties used by neighbouring widgets (`grep -n "var(--" src/components/PDFGear/*.css | head -40` for the vocabulary; tokens live in `src/styles/themes-master.css`). Status colours via `color-mix(in srgb, var(--success) 15%, transparent)` style, matching existing usage in the repo. Zero `#hex` and zero `rgba(` literals may remain except inside `color-mix`.
- Narrow layout: `.tg` gets `container-type: inline-size` on a wrapper-free basis — make `.tg` `flex-wrap: wrap`, and under `@container (max-width: 760px)` give `.tg-sidebar`, `.tg-main`, `.tg-preview` `flex: 1 1 100%; width: 100%` with a sensible `min-height` for editor and preview. If a container query cannot restyle `.tg`'s own children this way in practice, fall back to `@media` on the window body — verify in a 560 px wide window before choosing.
- Delete both `outline: none` lines; add one `.tg :focus-visible` rule only if the global ring (`src/styles/global.css:125-131`) does not already reach textarea/input/select.
- Delete the `tgFloat` animation and its keyframes. Delete `font-size` on the icon spans (the integrator sets icon `size` props).
- Delete the `.tg-block*` rules and the `.tg-docx__feature*` rules (their markup goes away in cluster E). The integrator adds rules for new classes afterwards.

## Cluster E — integrate (after A–D land; one executor owns `TemplateGenerator.tsx`)
Files: `TemplateGenerator.tsx` (rewrite in place), new `FillFromRecord.tsx`, `TemplateGenerator.css` (new-class rules only), `src/test/templateGenerator.test.tsx`, `src/registry/widgetRegistry.ts` (only if the description/tip would be untrue).
- State comes from `useTemplateGeneratorState()`; every edit goes through `setTemplateGeneratorState`. Local `useState` only for: active tab, source mode (`'html' | 'docx'`), the loaded docx `File` + its keys + its preview HTML, status message, `showFill`.
- Sidebar: title "Templates" (not "PDF Gear" — that is another widget). Template `<select aria-label="Template">`, **New**, a name `<input aria-label="Template name">`, **Delete** (disabled when one template remains; confirm the same way the nearest DocViewer/PDFGear code confirms a destructive action — reuse `PDFGear/PdfModal.tsx` if it fits, else `window.confirm`). Tabs keep their look and gain `aria-current="page"` on the active one; the `<nav>` gets `aria-label="Template sections"`. A line `N of M filled`. Primary button **Print / Save as PDF**. In docx mode with a file loaded: **Download filled .docx**.
- HTML tab: the textarea, `aria-labelledby` its `<h3>`.
- Variables tab: one row per key of the current mode — `<label htmlFor>` showing `labelFor(key)` with the `{{key}}` chip, a type `<select>` (text / number / date / currency, default `inferType(key)`), and an `<input>` whose `type` follows it (`text` / `number` / `date` / `number step="0.01"`). Empty state: "Type `{{name}}` in the template to create a variable." Below the list: a **Fill from Dwellium records** toggle that mounts `<FillFromRecord>` only while open.
- `FillFromRecord.tsx`: kind `<select>`, record `<select>`, **Fill** button. Data from the existing hooks `useProperties` / `useEntities(type)` in `StrataDashboard/useStrataQueries.ts` (read the `EntityType` union for the right `type` strings). States: loading; error → "Couldn't load records. Is the backend connected?"; empty → "No <kind> records yet."; Fill applies `recordToValues` filtered to keys in the template, never overwriting with empty, and reports "Filled N fields". First confirm a `QueryClientProvider` is above every widget (`src/providers/QueryProvider.tsx`); if it is not, **STOP** and report.
- DOCX tab: drop zone with `data-dwellium-drop-zone` (the opt-in read by `src/lib/fileDropZones.ts`, otherwise `AdminShell` blocks the drop), `onDragOver`/`onDrop`, and a real `<input type="file" accept=".docx">` behind a real `<button>`. After load: file name, "N placeholders", **Remove**. Zero placeholders → say so. Errors go to the status region. Remove `<NotYet>` and the four feature cards.
- Preview: always an iframe. HTML mode → `srcDoc={useDeferredValue(renderTemplate(...))}`. DOCX mode → `fillDocx` then `docxToHtml` in an effect keyed on the deferred values, with a cancelled-flag guard so a slow render never overwrites a newer one. `sandbox="allow-same-origin allow-modals"`, `title` names the mode. Badge: "Live preview".
- Print: `iframeRef.current?.contentWindow?.print()`.
- Status region: one always-mounted `<div role="status" aria-live="polite">`; info messages clear after 5 s through a single timer ref cleared on unmount; errors stay until the next action or a dismiss button.
- Icons: pass the intended `size` (48 for the drop-zone and empty-state icons).
- Delete: `pdf-lib` import, `generatePdf`, `downloadPdf`, `generatedUrl`, `blocks`, `cloneBlock`, `deleteBlock`, `addVariable`, `removeVariable`, `extractVariables`, `DEFAULT_VARIABLES`. Rewrite the header comment to describe only what the file does.
- The date variable defaults to today **at mount, only when the key exists and has no stored value** — not at module load.
- Component test (wrap in `<StrictMode>`): typing a value updates the iframe `srcdoc` with the escaped text; a `<script>` typed as a value appears escaped; changing the type select changes the input `type`; Print calls `contentWindow.print` (spy); New + rename + switch keeps each template's values apart; loading a docx fixture lists its keys. Mock the Strata hooks for one `FillFromRecord` case each of loaded / error / empty.

## Cluster F — docs (same commit as E)
- `docs/code.md`: one dated entry in the file's existing shape (Found / Root cause / Fix / Prevention).
- `plans/README.md`: status row for 063.

## Gate (must be green before the branch is called done)
From the worktree root:
`cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_SKIP_BUILD=true SMOKE_TEST_PORT=3210 node Scripts/smoke_test_ssr_phase8.mjs`
Plus `cd qualia-shell && npx eslint src/components/DocViewer src/utils/templateGeneratorStore.ts src/test/template*.test.ts* src/test/docxFill.test.ts` — zero errors in touched files (the repo-level count is pre-existing).

## Live verification (no login, no seeded session)
Standalone Vite harness in the session scratchpad importing the widget from the worktree source, wrapped in `StrictMode` + `QueryProvider`,
driven by Playwright; screenshots labelled "standalone render (no shell, no login)". Proofs to capture: default state; a filled template with a
Cyrillic name, a `$&` value and a `<b>` value rendered literally; a 60-row template exported with `page.pdf()` (same engine as Save as PDF) — page count > 1 and text present on the last page; a second named template; reload keeps both; a `.docx` built in the script, loaded, filled, downloaded and re-opened to confirm the value; the 560 px layout; the light theme; the records panel's honest offline state.

## STOP conditions
- A cluster needs a file owned by another cluster → stop and report; do not edit it.
- `withSync` needs a backend allowlist entry for the new `objectType` → stop (none was found at audit time: `grep -rn universalShell` in the backend returns nothing).
- mammoth or jszip cannot be loaded in the browser build → stop; do not add a dependency.
