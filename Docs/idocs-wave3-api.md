# Interactive Docs — Wave 3 API contract (frontend ⇄ backend)

Frozen 2026-08-19 for parallel build. Backend repo: `~/dwellium-backend/ai-dashboard369-file-manager` (Express + better-sqlite3, `src/services/dwelliumSchema.ts`, `authenticate` from `src/services/authMiddleware`, tests via `tests/helpers/harness.ts` `makeApp()/createTestUser()` + supertest). Frontend: `qualia-shell/src/components/Scribe/idocs/*`, calls go through `authFetch` (adds `Authorization: Bearer` + `X-Qualia-API: v2`) to `${API_BASE}` (Netlify proxies `/api/*` → Cloud Run; same-origin in prod).

Conventions: JSON envelopes `{ success: true, data }` / `{ success: false, error }`; owner = `req.user.id` (never from body); all `/api/idocs/*` require a session **except** the three public viewer routes marked PUBLIC. `docId` = the client-side `IDoc.id` (uuid). `version` = integer, starts at 1, incremented on every server write of a shared doc.

## 1. Publishing (static HTML the frontend already generates via `exportHtml(doc)`)

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/api/idocs/publish` | session | `{ docId, title, html, slug?, password?, seo?: { title?, description?, noindex?: boolean }, embedAllowed?: boolean }` → `{ slug, url: "/p/<slug>", publishedAt }`. Slug: lowercase `[a-z0-9-]{3,64}`; if omitted derive from title; if taken by another owner → suffix `-2`, `-3`…; same owner + same `docId` → **update in place** (re-publish). `password` stored as bcrypt/scrypt hash, never returned. |
| GET | `/api/idocs/publications` | session | → `{ items: [{ slug, docId, title, url, hasPassword, seo, embedAllowed, publishedAt, updatedAt, views }] }` (mine only) |
| DELETE | `/api/idocs/publications/:slug` | session (owner) | → `{ ok: true }` |
| GET | `/api/idocs/publications/:slug/analytics` | session (owner) | → `{ views, uniqueViewers30d, lastViewedAt, perCard: [{ cardId, views, avgSeconds, pctOfViewers }] }` |
| GET | `/api/idocs/p/:slug` | **PUBLIC** | `text/html`. If password-protected and no valid unlock cookie → a minimal self-contained password page (POST form to `/unlock`). Else the stored HTML with: `<meta name="robots" content="noindex">` when `seo.noindex`; `<title>`/`<meta name=description>` from `seo` (override the doc's); an inline **beacon script** (see §1a) injected before `</body>`. Headers: `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, `X-Frame-Options` **not** set and `Content-Security-Policy: frame-ancestors *` when `embedAllowed` (else `frame-ancestors 'none'`). 404 JSON if unknown. |
| POST | `/api/idocs/p/:slug/unlock` | **PUBLIC** | form or JSON `{ password }` → on match set cookie `idoc_<slug>=<HMAC(slug, secret)>; Path=/api/idocs/p/<slug>; HttpOnly; SameSite=Lax; Max-Age=86400` and 302 → `/api/idocs/p/:slug`; else 401 + the password page with error. Rate-limit 10/min/IP. |
| POST | `/api/idocs/p/:slug/beacon` | **PUBLIC** | `{ sid, events: [{ type: 'view' } \| { type: 'card', cardId, seconds }] }` → `{ ok: true }`. `sid` = viewer session id (random, from localStorage in the beacon). Store rows `(slug, sid, card_id, seconds, at)`; a `view` row per page load. Rate-limit 60/min/IP; ignore `seconds > 3600`. |

### 1a. Beacon script (backend injects; frontend never sees it)
Uses `IntersectionObserver` on `[data-card-id]` (the export HTML already renders each card with `data-card-id`), accumulates seconds per visible card, `navigator.sendBeacon('/api/idocs/p/<slug>/beacon', JSON)` every 15 s and on `pagehide`. `sid` = `localStorage['idoc-sid']` (uuid). No cookies, no third parties.

### 1b. Netlify (frontend repo, `qualia-shell/scripts/write-netlify-redirects.mjs`)
Add `/p/* ${target}/api/idocs/p/:splat 200!` next to the existing `/api/*` rule so public links read `https://argyleholocron.netlify.app/p/<slug>`. Embed code the UI shows: `<iframe src="https://argyleholocron.netlify.app/p/<slug>" width="100%" height="700" style="border:0" allowfullscreen></iframe>`.

## 2. Workspace sharing + roles + live-lite

Roles: `view` < `comment` < `edit`. Owner is implicit `owner`.

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| PUT | `/api/idocs/shared/:docId` | owner or `edit` | `{ doc, version? }` — writes the FULL doc JSON. If `version` is given and ≠ current → **409** `{ error: 'version-conflict', current: { doc, version, updatedAt, updatedBy } }`. Owner's first PUT creates the shared record. → `{ version, updatedAt }` |
| GET | `/api/idocs/shared/:docId` | owner or member | → `{ doc, version, updatedAt, updatedBy: { id, name }, role, owner: { id, name }, members: [{ userId, name, email, role }] }` |
| GET | `/api/idocs/shared` | session | → `{ items: [{ docId, title, owner: { id, name }, role, version, updatedAt, memberCount }] }` — docs shared **with me** plus docs **I** shared. |
| PUT | `/api/idocs/shared/:docId/members` | owner | `{ members: [{ email, role }] }` (replaces the list; emails resolved against `users` — unknown → `{ error: 'unknown-users', emails: [...] }` 400) → `{ members: [...] }` |
| DELETE | `/api/idocs/shared/:docId` | owner | → `{ ok: true }` (unshare; members lose access) |
| POST | `/api/idocs/shared/:docId/comments` | `comment`+ | `{ cardId, blockId?, text }` → server appends a `BlockComment` `{ id, blockId?, author: user.name, text, at }` to `doc.cards[cardId].comments`, `version++` → `{ comment, version }` (lets comment-only members write without full-doc PUT). |
| POST | `/api/idocs/shared/:docId/presence` | member | `{ cardId? }` → `{ others: [{ userId, name, cardId?, at }] }` — in-memory map, entries expire after 30 s. (Cloud Run runs 1 instance; documented limitation.) |

Frontend polling contract: while a shared doc is open, `GET /shared/:docId` every 5 s (or 15 s when the window is hidden) + `POST presence` on card focus change; when the server `version` > local and there are **no** unsaved local edits → apply silently; with local edits → banner "Newer version from <name> — Load theirs / Keep mine (overwrites)". Saves are `PUT` with the last-seen `version`; on 409 show the same banner. This is "live-lite", not CRDT — the gap doc scores it as partial on purpose.

## 3. Generate API (server-side; ARA/Hermes/external can call it)

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/api/idocs/generate` | session | `{ prompt, kind?: 'document'\|'deck'\|'onepager', amount?: 'brief'\|'medium'\|'detailed', audience?, language?, tone?, userLlmKey?: { provider: 'openai', apiKey, model? } }` → `{ doc }` where `doc` conforms to the frontend `IDoc` shape (`idocTypes.ts` — copy the type + a minimal normalizer into `src/services/idocs/idocSchema.ts`; validate: `title`, `cards[]` each `{ id, title?, blocks[] }`, block `type` ∈ the known list; drop unknown blocks). Uses `OPENAI_API_KEY` or the passthrough key like `araRoutes.ts:46-62`. Rate-limit via `aiWorkloadRateLimiter`. |
| GET | `/api/idocs/generate/schema` | session | → `{ blockTypes: [...], example: <small IDoc> }` (self-documenting for connectors) |

## 4. Storage (backend, `dwelliumSchema.ts` additions)

```sql
CREATE TABLE IF NOT EXISTS idoc_publications (
  slug TEXT PRIMARY KEY, doc_id TEXT NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL,
  html TEXT NOT NULL, password_hash TEXT, seo_json TEXT, embed_allowed INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS idoc_pub_owner_doc ON idoc_publications(owner_id, doc_id);
CREATE TABLE IF NOT EXISTS idoc_beacons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, sid TEXT NOT NULL,
  card_id TEXT, seconds REAL NOT NULL DEFAULT 0, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idoc_beacons_slug ON idoc_beacons(slug, at);
CREATE TABLE IF NOT EXISTS idoc_shared_docs (
  doc_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS idoc_shares (
  doc_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('view','comment','edit')),
  added_at TEXT NOT NULL, PRIMARY KEY (doc_id, user_id));
```

## 5. Frontend client (`qualia-shell/src/components/Scribe/idocs/idocsApi.ts`)
One module exporting typed functions for every row above (`publishDoc`, `listPublications`, `unpublish`, `publicationAnalytics`, `putSharedDoc`, `getSharedDoc`, `listShared`, `setMembers`, `unshare`, `postComment`, `postPresence`, `generateDoc`) over an injected `authFetch` (default: `installApiAuthFetch`'s global fetch wrapper — see `src/lib/installApiAuthFetch.ts`). All throw `IdocsApiError { status, code }`; 409 surfaces `current`.
