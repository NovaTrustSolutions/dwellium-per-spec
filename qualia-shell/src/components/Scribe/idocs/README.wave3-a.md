# Interactive Docs — Wave 3A: export / import (PPTX · DOCX · merge)

Fragment for README.md (merged by the integrator).

## What shipped

| Area | File | Entry points |
|---|---|---|
| PPTX export | `idocPptx.ts` | `buildPptxSpec(doc): PptxSpec` (pure) · `exportPptx(doc)` (browser; lazy `import('pptxgenjs')`) · `mdToParas` / `mdInline` (md → runs, shared) · `pptxTheme(doc)` |
| DOCX export | `idocDocx.ts` | `buildIdocDocx(doc, images?)` (pure → `docx.Document`) · `exportDocx(doc)` |
| Export menu | `idocExport.ts` `EXPORT_ACTIONS` | `pptx` "PowerPoint (.pptx)" · `docx` "Word (.docx)" — both `import()` their module lazily |
| PPTX import | `idocsPptxImport.ts` | `importPptxFile(file): Promise<IDoc>` · `importPptxTheme(file): Promise<CustomTheme>` (lazy `import('jszip')`, DOMParser) |
| Library | `IDocLibrary.tsx` | Import button accepts `.pptx`; multi-select checkbox per doc → "Merge N into new doc" |
| Theme editor | `ThemeEditor.tsx` | "Import .pptx theme" file button (merges the 8 vars + name into the editor) |
| Merge | `idocsMerge.ts` | `mergeDocs(target, sources): IDoc` (pure) |
| Deps | `package.json` | `pptxgenjs@3.12.0`, `jszip@3.10.1` (exact pins) |
| Tests | `src/test/idocPptx.test.ts`, `idocDocx.test.ts`, `idocsPptxImport.test.ts`, `idocsMerge.test.ts` | 30 tests |

## PPTX export — mapping

Layout: `pageSize` → `16x9` (fluid/16:9, 10×5.625 in) · `4x3` (4:3 and 1:1) · `A4` (8.27×11.69) · `LETTER` (8.5×11). Margin 0.5 in.
1 card = 1 slide; blocks flow top-down, a card that overflows continues on `"<title> (cont.)"` slides (notes only on the first). Nested cards follow their parent as their own slides (title 22 pt vs 26 pt). Card title → text element at top; `card.notes` → slide notes; `card.background.color` → slide background; background image / `layout:'background'` header image → full-slide image behind everything; other header images → 2.2 in image row on top. Doc chrome header/logo/footer/section numbers → small muted text on top-level slides (respects `hideOnFirst`).

| Block | Element(s) |
|---|---|
| heading | text (28/22/18 pt, bold, heading font) |
| text | text (md → runs: `**bold**`, `*italic*`, `` `code` ``, `[link](url)`, `-`/`1.` bullets with indent; headings→bold, quotes stripped, fences→mono, tables flattened) |
| callout | rounded shape (tone colour @ 85 % transparency + border) with runs |
| quote | rounded muted shape, italic runs + "— cite" |
| image | image (3 in) + italic caption |
| gallery | image grid (≤4 per row) |
| header/background image | image (see above) |
| embed | link "▶ Embedded <provider>: url" |
| chart | native chart: bar/line/pie/donut(doughnut)/area, labels + values, theme colours |
| table | native table, header row filled with accent |
| accordion / tabs | text: bold title + body per item |
| columns | side-by-side text boxes |
| button | rounded accent shape with hyperlink |
| code / math / diagram | mono text (code/diagram on light grey fill) |
| divider | thin border-colour bar |
| timeline | per item: muted date box + title/body text |
| quiz | text: "Q: …", "A) …", "Answer: … — explanation" |
| toc | bullets of card titles (nested indented) |
| steps | per item: accent circle with number/• + text |
| funnel | centred accent bars, width ∝ value |
| boxes | shape grid (`columns`), emphasis → accent tint |
| qr | local QR SVG as image + link caption |
| footnotes | small muted text at end of card |

Theme: `exportThemeVars(doc)` (paper for `inherit`) → 6 hex colours + first family of heading/body font stacks; uploaded (data-URL) fonts can't be embedded by pptxgenjs → `Calibri` / `Arial`, original family kept in `PptxTheme.fontNote`. Images: fetched to base64 with a 5 s timeout, dedup by src; CORS/network failure → grey placeholder box with the alt text.

## DOCX export — mapping

Title → `Title`; card → `Heading 1` (nested → 2/3…); heading block → `Heading (depth+level)`; text/columns/tabs/accordion/steps/timeline → paragraphs (bullets from markdown, hyperlinks as `ExternalHyperlink`); callout → shaded paragraphs (tone fill); quote → indented italic; table → `Table` (accent header); chart → 2-col data table + caption `chart: <kind> — <title> — see live doc`; image/gallery/header → `ImageRun` (png/jpg/gif/bmp fetched best-effort, else `[image: alt]`); code/diagram/math → Courier; quiz → Q/A lines; button/embed/qr → links; footnotes → numbered lines; `card.notes` → "Presenter notes" appendix (page break).

## PPTX import — mapping

Slide order from `presentation.xml` `sldIdLst` (+ rels), fallback numeric sort. Per slide: `p:sp` with `ph type=title|ctrTitle` → `card.title`; other `p:sp` text bodies → one `text` block each (`a:buChar` → `- `, `a:buAutoNum` → `1. `, `lvl` → indent, `b="1"`/`i="1"` → md, `a:hlinkClick` → `[text](url)`); `p:pic` → `image` (data URL from `ppt/media`, `descr` → alt); `a:tbl` → `table` (first row = headers); chart `graphicFrame` → `chart` from `ppt/charts/chartN.xml` first series (`c:cat` / `c:val`, title), unknown chart type → info callout "Chart placeholder"; `p:grpSp` flattened; `notesSlideN.xml` (minus slide-number placeholder) → `card.notes`. Theme: `clrScheme` lt2→bg, lt1→surface, dk1→text, dk2→muted, accent1→accent, border = 25 % blend lt2→dk2; `majorFont`/`minorFont` latin → heading/body font; radius 8 px.

## Merge

`mergeDocs(target, sources)` appends every source card in order; keeps target id/title/theme/chrome; a card whose subtree reuses any id already present (cards, blocks, footnotes) is deep-cloned with fresh ids (`cloneCard`), otherwise ids are kept. Library: tick ≥2 docs → "Merge N into new doc" creates a new doc `"<first title> (merged)"` with the first doc's theme.

## Known simplifications (ponytail)

- No title slide for the doc itself; 1:1 page size exports as 4:3; split-left/right header images become a top image row.
- Text height is estimated (chars/line heuristic) → occasional early/late "(cont.)" splits; pptxgenjs `fit: 'shrink'` covers small misses.
- pptxgenjs writer is not unit-tested (browser file APIs); the pure spec builder is.
- Import: no slide master/layout inheritance — a body placeholder with ≥2 paragraphs and no explicit `a:buNone` is treated as bullets; positions/sizes are ignored (blocks flow in z-order); SmartArt/video/audio skipped; only the first chart series is read.
- DOCX: svg/webp images become `[image: alt]`; charts are data tables (no native Word charts).
- Merge: card-link buttons inside re-id'd cards still point at the old card id.
