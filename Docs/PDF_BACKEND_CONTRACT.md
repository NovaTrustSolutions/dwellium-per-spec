# PDFGear — backend contract for native-only operations

**Owner:** backend repo (`ai-dashboard369-file-manager`)
**Client:** `qualia-shell/src/components/PDFGear/PDFGear.tsx`
**As of:** 2026-06-05

PDFGear runs **everything it can in the browser** (pdf-lib + pdfjs + tesseract.js).
The operations below are the *only* ones that need native binaries the browser
doesn't have. The client already calls these endpoints and **degrades honestly**
when they're absent (toast + client fallback where one exists) — so the app is
fully usable today; wiring these endpoints upgrades fidelity, it doesn't unblock.

All endpoints: `POST {API_BASE}{path}`, `multipart/form-data` with a `file`
field, responding with the processed file as the body (or `{ error }` JSON on
failure). `API_BASE` resolution lives in `qualia-shell/src/config.ts`.

| Tool | Endpoint | Native dependency | Client fallback today |
|------|----------|-------------------|-----------------------|
| Compress (real) | `POST /pdf/compress` | Ghostscript (`gs -dPDFSETTINGS=/ebook`) | ✅ client structural compress (object streams) runs if backend offline |
| PDF/A convert | `POST /pdf/pdfa` | Ghostscript / veraPDF | ❌ honest "needs backend" toast |
| Repair | `POST /pdf/repair` | `qpdf --replace-input` / Ghostscript | ❌ honest "needs backend" toast |
| Add password (encrypt) | `POST /pdf/encrypt` (field: `password`) | qpdf / PDFBox (pdf-lib can't AES-encrypt) | ❌ honest toast; the inverse (remove restrictions) IS client-side |
| Office ↔ PDF | `POST /docs/convert` (field: `targetFormat`) | LibreOffice headless | ❌ client handles txt/png/jpeg/html/md/rtf/xml only |
| Certificate sign | `POST /pdf/sign` (cert fields) | OpenSSL / PDFBox | ❌ honest toast |

### Already 100% client-side (no backend needed)
Merge · split (range / by-count / burst) · extract · reorder · rotate · n-up ·
scale · crop · add/remove blank pages · watermark · page numbers · structural
compress · add text / signature (text) / date / checkmark (click-to-place) ·
highlight / underline / box / note · form field add + flatten · **true redaction**
(rasterise affected pages so text is unrecoverable) · sanitise (strip metadata +
document JavaScript) · remove restrictions · edit/read metadata · get info ·
compare two PDFs · images → PDF · export pages as images · extract embedded
images · stamp image (click-to-place) · overlay PDF · **OCR → text** and
**OCR → searchable PDF** (tesseract.js, lazy-loaded) · convert PDF →
txt/md/html/xml/rtf/png/jpeg.

### Notes
- The client passes the **current working document** (post-edit bytes), not the
  originally-opened file, so backend ops compose with client edits.
- `/pdf/compress` is the one backend op with a client fallback wired
  (`compressStructural`) — if the route 404s/errors the user still gets a
  smaller file, with a toast explaining it used the client compressor.
- OCR fetches the WASM core + `eng.traineddata` from the tesseract CDN on first
  use (cached afterwards). For a fully air-gapped build, self-host those assets
  and set tesseract's `workerPath`/`langPath`/`corePath`.
