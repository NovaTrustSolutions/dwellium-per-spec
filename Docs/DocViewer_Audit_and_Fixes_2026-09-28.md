# Doc Viewer — audit and fixes (2026-09-28)

Frontend branch `fix/docviewer-audit` (base `origin/main` e0cf535): 1a9a3c1, 242fe17, 901ad98, 1df4d4e, f421bbe.
Backend branch `fix/file-content-version-bytes` (base `origin/backend/ship` 6fb4fa9): 7993ad0, 49d7397.
Neither branch is pushed or deployed.

A generated report with screenshots and every measurement lives at `~/Desktop/DocViewer_Report_2026-09-28.html`.

## What the widget does

Opens PDFs, text files, images and (new) Word documents from the file store. Renders PDF pages with
pdf.js; navigates by thumbnail rail, page box or buttons; zooms. Marks up a document with highlight,
freehand draw, shapes (rectangle, circle, line, arrow), text, six stamps and a drawn signature; edits
text already in the PDF; inserts, deletes and rotates pages; undo and redo cover annotations and page
edits alike. Saves back into Dwellium (previous bytes kept as a version), exports a copy, caches a
local copy, or opens the original. New in this work: select, move and delete a placed mark; search with
match count and next/previous across pages; real page thumbnails; unsaved markup kept as a draft and
offered back after a reload; and read-only Word preview via the backend LibreOffice route.

## The defects, and what they cost

| What the user saw | Root cause |
|---|---|
| "Signature placed", but nothing on the page and nothing in the saved file | No signature case in the bake, and the pad stored empty strokes (a functional state updater read a ref cleared on the next line) |
| A 6,246-character text file saved as 5,018 characters | Text loaded from `/preview`, which truncates at 5,000 chars server-side, and Save Back sent that back as the file |
| Marks jumped to the wrong page after deleting a page | Page-keyed annotations were never re-keyed |
| On a rotated page, a highlight saved 0.68 page-widths from where it was drawn | Screen and bake used different coordinate models, neither aware of `/Rotate` or an offset CropBox |
| A freshly opened PDF showed a blank page until you navigated | The render effect ignored the canvas mount, and the canvas mounted only after loading finished |
| Files past the first 50 rows would not open | Open-by-id searched the fetched list instead of loading by id |
| Save Back overwrote an unchanged document without asking | No dirty flag, no confirmation, and it was enabled before bytes had loaded |
| Every "version" held the new bytes | The version row pointed at the live path, which was then overwritten |
| A Drive file could not be downloaded after one save | The download route did not treat the remote cache as a managed directory |
| Mouse-only input, so no signing on a tablet | Mouse handlers with no pointer events |
| 9 lint errors, axe violations, no dialog semantics, phone toolbar overflow | Accessibility was never addressed |

The audit also recorded a fabricated fallback page ("MASTER SERVICES AGREEMENT") that the widget drew
when a page failed to render, which a user could annotate and save over a real document. It is gone;
a failed render now says so.

## Verification

Five scripted suites drive the real widget in a browser with no shell and no login, against an
in-memory copy of the files API. Saved documents are re-read and rendered by pdf.js independently of
the widget, then pixel-diffed against the pristine fixture, so position claims are measured.

| Suite | Rows |
|---|---|
| Data loss (P0) | 7 |
| Correctness (P1) | 13 |
| New features (P3) | 9 |
| Capability tour | 18 |
| Accessibility and responsive | 11 |
| Original code reproducing the defects | 11 |

Unit gates on the final commit: `tsc -b` clean, 3,193 tests across 374 files, both production builds,
PII scan clean, and zero eslint errors in the widget (was 9). Backend: 63 suites, 594 tests.

## Known limits

- The harness fakes the backend, so it proves the widget, not the production server; the backend has
  its own tests.
- The blank-first-page fix has no unit test: jsdom batches the state updates that caused it, so the
  live check is its proof.
- `DocViewer.tsx` is ~1,200 lines after the split, short of the ~700 target. Loading, page operations
  and save still live in the root; moving them would have risked the data-loss fixes for no
  user-visible gain.
- Annotation drafts are one per file, last writer wins.
- `TemplateGenerator` in the same folder was left alone: open PR #134 rewrites it.
- The re-upload path in `FileController.uploadFile` has the same "version keeps no bytes" shape as the
  save route had; it is out of this scope and flagged separately.
