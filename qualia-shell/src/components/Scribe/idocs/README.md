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

## Known v1 simplifications
- No nested cards / block nesting; columns hold markdown strings.
- No realtime collaboration or sharing links — "Share" = copy JSON / save HTML to Artifact Gallery.
- Analytics (views, seconds per card) are local-only, recorded from Present mode in this browser.
- Embeds are iframes only (no oEmbed/metadata fetch); images stored as URLs or downscaled data URLs.
- PDF export is text-only (existing pdf-lib helper); use Print for a styled page-per-card output.
- Block reorder is ↑/↓ buttons (no drag-and-drop); no undo history beyond browser input undo.
