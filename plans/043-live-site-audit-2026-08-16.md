# Plan 043: Live-site improvement plan — https://argyleholocron.netlify.app/

> **Executor instructions**: each item is independent and small; ship in priority order.
> Every item has a one-line `Verify` command — run it and paste output before marking done.
> Frontend repo: `~/Downloads/Dwellium -Per Spec` (canonical, `origin/main` = NovaTrustSolutions/dwellium-per-spec).
> Build with `npx react-router build` (never `npx vite build`). Gate green before commit; no push without Ilya's go.

## Status

- **2026-08-16 execution (Ilya: "P0-1 can be skipped, then fix everything else")** — items 2–8 + 10 DONE, item 9 PARTIAL, on branch `advisor/043-live-site-fixes` (based on `fix/onesave-object-id-and-status-indicators` @ `3530a73`). Gate: `tsc -b` clean · vitest **210 files / 1775 tests green** · `NETLIFY=1 npx react-router build` exit 0 · built client served locally and checked in a browser at 375×812 + 1280×720. **NOT pushed / NOT deployed** (Ilya gates). Item 1 intentionally SKIPPED per Ilya.
  - Item 2 ✅ `hero-bg.webp` 1600×702, **24.9 KB** (was 798 KB PNG 640×640) — first frame of the login video, so poster→video is now seamless; `<link rel=preload as=image fetchpriority=high>` in root.tsx; logo `<img>` sized. Manifest icon → `app-icon-512.png` 100 KB (was 376 KB 1024²).
  - Item 3 ✅ boot `<link>` = Hanken Grotesk + Inter + JetBrains Mono (3 families, was 17); duplicate `@import`s removed from `global.css` + `StrataDashboard.css`; the 5 non-default font pairings + Roboto/Outfit layout presets fetch their families on demand (`ThemeContext.tsx` `googleFonts`, `LayoutContext.tsx`).
  - Item 4 ✅ `Cache-Control: immutable` for `/assets/*.js|.mjs|.css|.wasm` only — **deliberately not `/assets/*`**: `public/assets/*` (png/webp/mp4) is copied unhashed into the same folder.
  - Item 5 ✅ `nebula-bg-1280.mp4` 20 s / 1280×702 / CRF 30 = **716 KB** (was 74.4 MB); old file `git rm`'d (still in history). Video plays on click (verified `readyState 4`).
  - Item 6 ✅ `public/favicon.png` (64², logo mark crop), `public/og-image.png` (1200×630, absolute `og:image` URL), `public/robots.txt` (`Disallow: /`). `vite.svg` reference removed.
  - Item 7 ✅ logo `width: min(320px, 80vw, 40vh)`, backdrop `padding: 48px 16px 40px` — container left = **16 px** at 375 w (was −30.5).
  - Item 8 ✅ `focus({ preventScroll: true })` instead of `autoFocus` + `margin-top: 0` — header top = 71 px, `scrollTop` 0 at 1280×720 (was scrolled 450 px, logo hidden).
  - Item 9 ⚠️ PARTIAL: `Permissions-Policy` added; report-only CSP now allows `fonts.googleapis.com` / `fonts.gstatic.com`. **NOT flipped to enforce** — a live `securitypolicyviolation` probe shows `script-src-elem inline`: index.html carries 4 inline `<script>`s (theme IIFE + `__reactRouterContext` + module import + stream close) that `script-src 'self'` would block → app would not hydrate. Enforcing needs per-build hashes (or `'unsafe-inline'`) plus a behind-login `connect-src` sweep (Sentry, api.anam.ai …). Follow-up plan if wanted.
  - Item 10 ✅ `plans/` committed on the branch.

- **Priority**: mixed (P0 → P3 below)
- **Effort**: S per item; whole plan ≈ 1 day
- **Audited**: 2026-08-16 against the LIVE deploy (etag `e06d26d…`) + local HEAD `3530a73`
- **Category**: security / performance / correctness / SEO
- **Depends on**: none (item 1 = existing plan 014, still TODO)

## Baseline (measured 2026-08-16, pre-login screen)

| Metric | Desktop | Mobile |
|---|---|---|
| Lighthouse Perf / A11y / BP / SEO | 92 / 100 / 96 / 92 | Perf **68** |
| FCP / LCP | 0.9 s / 1.8 s | 2.9 s / **8.9 s** |
| TBT / CLS | 0 ms / 0 | 0 ms / 0 |

Public surface (unauthenticated) = "Click to Login" splash → access-password gate. Everything behind the gate was audited from source, not live.

Transfer on first load: `entry.client` 57 KB gz + `chunk-4N6VE7H7` 42 KB gz + login chunk 26 KB gz + login CSS 20 KB gz + **hero-bg.png 798 KB** + Google Fonts CSS **183 KB (384 @font-face)** + logo 31 KB.

---

## P0 — Security

### 1. Credentials + PII ship in the public JS bundle (= existing plan 014, TODO)

**Evidence** — `curl -s https://argyleholocron.netlify.app/assets/default-8j339b1r.js | grep -c 'Comet2878'` → `1`. Same chunk contains `andy@dwellium.com`, `lisa@zpgroup.io`, `architect@dwellium.com`, `iklipinitser@gmail.com`. Source: `qualia-shell/src/components/Auth/LoginScreen.tsx:24` (`GATE_PASSWORD`) + `localAccounts.ts:44-46` (per-account `password:` literals). Comparison is client-side (`LoginScreen.tsx:49,77`) → the gate is decorative; anyone reading the bundle logs in.

**Fix (minimal)** — execute plan 014. Since `65ad555` already made sessions backend-first, the lazy path is: delete `GATE_PASSWORD` + `password` fields from the client; POST gate + credentials to the existing backend auth route (`/api/auth/*` proxied via Netlify `_redirects`) and let it answer 200/401. Keep the UI. **Operator action:** rotate the gate password and all three account passwords — they have been public since first deploy.

**Verify** — `curl -s https://argyleholocron.netlify.app/assets/$(curl -s https://argyleholocron.netlify.app/ | grep -o 'default-[A-Za-z0-9_-]*\.js' | head -1) | grep -cE 'Comet2878|@dwellium\.com|@zpgroup\.io|@gmail\.com'` → `0`.

---

## P1 — Performance (mobile LCP 8.9 s → target < 2.5 s)

### 2. Hero/LCP image is a 640×640 PNG (798 KB) stretched full-screen

**Evidence** — `sips -g pixelWidth hero-bg.png` → 640; served 797,550 B; used as `<video poster>` (`LoginScreen.tsx:97`) → visibly blurry at 1280 px, and it is the LCP element. Lighthouse `image-delivery-insight`: 755 KB savings; `unsized-images` fails.

**Fix** — re-export a real 1600×900 (or the video's first frame) as WebP q75 (~80–120 KB) → `public/assets/hero-bg.webp`; point `poster` at it; add `<link rel="preload" as="image" href="/assets/hero-bg.webp" fetchpriority="high">` in `app/root.tsx`. Same for `public/assets/strata-astra-logo.png` (376 KB manifest icon → 512 px PNG/WebP ≈ 30 KB).

**Verify** — `curl -sI https://argyleholocron.netlify.app/assets/hero-bg.webp | grep content-length` → < 150000; re-run mobile Lighthouse, LCP < 2.5 s.

### 3. Google Fonts: 17 families requested, 2 used

**Evidence** — `app/root.tsx:98` loads Inter, Roboto, JetBrains Mono, Playfair, Montserrat, Cormorant, Poppins, Open Sans, Nunito, Lato, Space Grotesk, IBM Plex, Work Sans, Merriweather, Source Sans 3, Lora, Raleway (183 KB CSS, render-blocking). `grep -rl` over `src/styles` + `src/components`: 13 of them have **0** references. Actual body font is Hanken Grotesk, loaded by a *second* render-blocking `@import` in `src/styles/global.css:4`. CSP report-only logs a `font-src` violation on every page load because of this.

**Fix** — delete the `<link>` in `root.tsx:98`; move the Hanken Grotesk + JetBrains Mono `@import` out of `global.css` into a single `<link rel="stylesheet">` in `root.tsx` (or self-host both `.woff2` under `public/fonts/` — required anyway before item 9). If theme picker needs the others (Inter is referenced 58×; Roboto/Montserrat/Cormorant ≤2×), load them lazily on theme switch, not on every visit.

**Verify** — `curl -s https://argyleholocron.netlify.app/ | grep -o 'family=[^&"]*' | wc -l` ≤ 2; no `font-src` lines in DevTools console.

### 4. Hashed assets are not cached

**Evidence** — `curl -sI …/assets/entry.client-EYnRVIdF.js | grep cache-control` → `public,max-age=0,must-revalidate` (Netlify default) — every revisit re-validates ~14 requests.

**Fix** — `netlify.toml`, one block:
```toml
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```
(Vite hashes every file under `/assets/`; `index.html` stays `max-age=0`.)

**Verify** — same curl → `max-age=31536000, immutable`.

### 5. 74 MB login video streams on the first click (also on phones)

**Evidence** — `curl -sI …/assets/nebula-bg.mp4` → `content-length: 74409677`; on the mobile viewport after clicking, `video.readyState` = 4 (playing). Plans 006/007 deferred it until interaction, but the file itself is untouched ("accepted + monitored" in root CLAUDE.md).

**Fix** — pick one: (a) `ffmpeg -i nebula-bg.mp4 -t 20 -vf scale=1280:-2 -c:v libx264 -crf 30 -an nebula-bg-1280.mp4` (≈2–4 MB) and swap the `<source>`; (b) keep the poster only when `matchMedia('(max-width: 768px)').matches || navigator.connection?.saveData`. (a) is the smaller diff.

**Verify** — `curl -sI …/assets/nebula-bg-1280.mp4 | grep content-length` < 5,000,000.

---

## P1 — Correctness / SEO

### 6. SPA fallback masks missing static files (favicon, OG image, robots)

**Evidence** — all of `/vite.svg`, `/og-image.png`, `/robots.txt`, `/sitemap.xml`, `/sw.js` return **200 with the 4,295-byte index.html** (`curl -so /dev/null -w '%{http_code} %{size_download}'`). `qualia-shell/public/` contains none of them. Result: no favicon in tabs, broken social preview, Lighthouse `robots-txt` "17 errors".

**Fix** — add to `qualia-shell/public/`: `favicon.svg` (change `root.tsx:61` href), `og-image.png` (1200×630), `robots.txt` = `User-agent: *\nDisallow: /` (gated private app — don't invite indexing). Netlify serves real files before the `/*` redirect, so no config change.

**Verify** — `for p in favicon.svg og-image.png robots.txt; do curl -so /dev/null -w "$p %{content_type}\n" https://argyleholocron.netlify.app/$p; done` → none say `text/html`.

### 7. Login card clipped on phones

**Evidence** — at 375 px viewport `.login-container` measures `left: -30.5px, width: 368px` (card starts off-screen); `LoginScreen.css` has **zero** `@media` rules; `.login-logo-img { width: 320px }` + `.login-header { padding: 24px }` = 368 px min-content.

**Fix** — `.login-logo-img { width: min(320px, 80vw); max-width: 100%; }` and `.login-backdrop { padding: 90px 16px 40px; }`.

**Verify** — Browser at 375 px: `document.querySelector('.login-container').getBoundingClientRect().left` ≥ 0.

### 8. Desktop 1280×720: `autoFocus` scrolls the logo card half out of view

**Evidence** — screenshot after "Click to Login": logo card top clipped. `LoginScreen.tsx:145` `autoFocus` on the password input triggers scroll-into-view inside the `overflow-y:auto` backdrop.

**Fix** — `.login-header { margin-top: 0 }` + reduce `.login-backdrop` top padding to `48px`, or drop `autoFocus`. Cosmetic; ship with item 7.

---

## P2 — Hardening

### 9. CSP is still report-only, and can't be enforced yet

**Evidence** — response header is `content-security-policy-report-only`; `font-src 'self'` + `style-src 'self' 'unsafe-inline'` both reject `fonts.googleapis.com` / `fonts.gstatic.com`, so enforcing today breaks fonts. No `Permissions-Policy` header.

**Fix** — after item 3 (self-hosted fonts): rename the header to `Content-Security-Policy` in `netlify.toml`; add `Permissions-Policy = "camera=(self), microphone=(self), geolocation=(), payment=()"` (app uses mic/camera for TranscriptionHub/avatar; keep `self`).

**Verify** — `curl -sI https://argyleholocron.netlify.app/ | grep -iE '^content-security-policy:|permissions-policy'` → both present, no `-report-only`; login + one widget with mic still work.

### 10. Commit `plans/`

**Evidence** — `git status --short` → `?? plans/` (flagged in Round 3 too). This file included.

**Fix** — `git add plans && git commit -m "docs(plans): version planning history"` — Ilya's call.

---

## P3 — Watch list (no action now)

- **Lazy chunks are big but correctly lazy**: `ort-wasm…wasm` 21.6 MB, `ara-intro.mp4` 21 MB, `moonshine` 2.3 MB, `pdf.worker` 2 MB, `kokoro` 1.3 MB, `Scribe` 930 KB. Network trace of the login screen showed only 14 requests — none of these load pre-login. Re-check after any `widgetRegistry.ts` edit.
- **Branding/domain**: title + manifest say "AstraStrata", host is `argyleholocron.netlify.app`. Custom domain when ready (Netlify → Domain management; HSTS `preload` already set).
- **`plans/README.md` note** on Netlify CI publishing stale output — item 4's `immutable` header makes a stale publish *more* costly if a stale `index.html` references old hashes; keep using plan 036's deploy wrapper.

## STOP conditions

- Item 1: do **not** blank the last god password without the bootstrap decision in plan 014 §STOP.
- Item 9: do **not** flip CSP to enforce until item 3 is deployed and the console is violation-free for one full login + widget session.

## Sources

- Live headers/sizes: `curl` against `https://argyleholocron.netlify.app/` 2026-08-16 17:49–17:55 UTC
- Lighthouse 12 (`npx lighthouse`, headless Chrome, `--preset=desktop` and default mobile), 2026-08-16
- Source: `qualia-shell/app/root.tsx`, `src/components/Auth/LoginScreen.{tsx,css}`, `src/components/Auth/localAccounts.ts`, `src/styles/global.css`, `netlify.toml`, `build/client/assets/`
