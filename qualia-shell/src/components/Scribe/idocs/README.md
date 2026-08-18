# Scribe · Interactive Docs (v1)

Gamma.app-style card/block documents inside the Scribe widget (third mode tab, `editorMode === 'idocs'`).

## Data model (`idocTypes.ts`)
`IDoc { id, title, description?, theme, cards[], createdAt, updatedAt, analytics }` →
`Card { id, title?, layout: default|split-left|split-right|hero, headerImage?, blocks[] }` →
`Block` = discriminated union on `type`: heading, text, callout, quote, image, gallery, embed, chart,
table, accordion, tabs, columns, button, code, divider, timeline, quiz, toc.
Themes (`IDOC_THEMES`) are `--idoc-*` CSS-variable maps applied inline on the doc root; `inherit` forwards app tokens.

## Persistence (`idocsStore.ts`)
`createLocalStorageStore` dynamic key `scribe-idocs:<userId>` (anon `_anonymous`) wrapped in `withSync` (One Save
objectType `scribe-idocs`). Mutators are plain functions; `useIdocs()` reads via `useSyncExternalStore`. Tests call `.reset()`.

## AI generation (`idocsAi.ts`)
`generateDocFromPrompt / generateDocFromText` → `callLlm` with a strict-JSON system prompt listing every block shape →
`parseJsonLoose` (fence-tolerant) → `normalizeDoc` (coerces every card/block: unknown type → text, missing ids, clamped
levels, arrays ensured). All entry points take the `llm` bundle + injectable `callLlmFn` (tests feed canned replies).
`rewriteBlockMd` powers the per-block "AI ▾" menu. `embedSrcFor(url)` is the only source of iframe `src` values.

## Rendering / export
`IDocRenderer` (pure; scroll + present modes; markdown via react-markdown+gfm; charts via recharts) is shared by the editor
canvas, Present overlay and preview. `idocExport.ts` builds script-free standalone HTML (details/summary, inline SVG
charts, sandboxed iframes), Markdown, text-PDF (pdf-lib helper), print (`@media print` page-per-card), JSON.

## Adding a block type
1. Add the variant to `Block` + `BLOCK_TYPES` + `defaultBlock()` in `idocTypes.ts`.
2. Add a `case` in `normalizeBlock` (idocsAi.ts) and a line to `BLOCK_CONTRACT`.
3. Render it in `IDocRenderer.tsx` (`BlockView`), edit it in `BlockEditor.tsx`, export it in `idocExport.ts` (html + md).
4. Style under `.scribe-idocs__<name>` in `InteractiveDocs.css`. TypeScript's exhaustive `switch` flags anything missed.

## Wave 1 (2026-08-18) — what changed
- 24 block types (adds steps, funnel, boxes, math (KaTeX), diagram (Mermaid), qr (local encoder `blocks/qr.ts`)); donut/area charts; card-link buttons (`#card:<id>`).
- Cards: backgrounds (color/image/overlay/intensity/align), layouts `image-top`/`background`, nested cards (`children`, ⌘⇧O), footnotes (`[^n]`), presenter notes; doc: page sizes, header/footer/logo/section numbers (`chrome`), language/dir, `isTemplate`.
- Editor: drag-and-drop (cards + blocks), copy/paste/duplicate/multi-select, insert cards from another doc, `/` slash palette, history + ⌘Z/⌘⇧Z (`idocsHistory.ts`, 30 snapshots, ~2 MB cap), doc-level AI menu (`idocsDocAi.ts` DOC_AI_ACTIONS: summarize / add card / translate / restyle / regenerate card), shortcuts sheet (`?`).
- Present: Spotlight (`S`, ↓/↑ reveal), 47 themes.
- AI/import: amount/audience/language options, outline-first for >12 cards (cap 30), URL import (backend `/api/scribe/fetch-article` → fallback fetch), PDF import (pdf.js via PDFGear), 6 built-in templates + save-as-template, +9 embed providers (24 total).

## Known simplifications (after wave 1)
- No realtime collaboration or share links — "Share" = copy JSON / save HTML to Artifact Gallery (wave 3: publish).
- Analytics local-only (views, seconds per card from Present in this browser).
- Embeds are iframes only (no oEmbed/metadata); images URL or downscaled data URL; no AI image generation yet (wave 2).
- PDF export is text-only (pdf-lib); Print gives the styled page-per-card output.
- Math/diagram/code rendering upgrades via the CDN-lazy `previewEnhance` loaders (fail-safe to plain text/monospace).
