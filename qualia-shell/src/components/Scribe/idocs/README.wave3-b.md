# Scribe · Interactive Docs — Wave 3B (publishing + sharing + live-lite, frontend)

Built against the frozen contract **`Docs/idocs-wave3-api.md`** (repo root; §1 publishing, §2 sharing/live-lite, §3 generate, §5 client). The backend is built in parallel to the same file — nothing here was tested against a live server; every path is unit-tested with mocked `fetch`.

## What shipped

| Piece | File | Notes |
|---|---|---|
| API client | `idocsApi.ts` | One typed function per route (`publishDoc, listPublications, unpublish, publicationAnalytics, putSharedDoc, getSharedDoc, listShared, setMembers, unshare, postComment, postPresence, generateDoc, generateSchema`) over an injectable `fetchFn` (default: global fetch, already auth-patched by `installApiAuthFetch`); paths `${API_BASE}/api/idocs/…`; headers `Content-Type: application/json` + `X-Qualia-API: v2`. Envelope `{ success, data }` unwrapped. All failures → `IdocsApiError { status, code, current?, emails? }` (409 → `current`; 400 unknown-users → `emails`; network → `status 0 / code 'network'`). Helpers: `publicUrlFor(slug)`, `embedCodeFor(slug)`, `linkedInShareUrl(url)`, `isValidSlug`, `slugify`. |
| Publish | `PublishDialog.tsx` + `PublishDialog.css`; editor **Publish ▾** menu | Slug auto from title (editable, `[a-z0-9-]{3,64}`, live validation), optional password, SEO title/description, "Hide from search engines" (noindex), "Allow embedding". Publish → `POST /publish` with `exportHtml(doc)`; then shows `${origin}/p/<slug>` + Copy / Open, embed `<iframe …>` + Copy, Share on LinkedIn, Re-publish (same slug → server updates in place), Unpublish (`DELETE /publications/:slug`). Persists `doc.publication = { slug, url, publishedAt }`. Menu quick actions when published: Copy public link / Open public page. |
| Server analytics | `IDocEditor.tsx` → `ServerAnalytics` | Analytics popover gains a "Published (server)" section when `doc.publication` exists: views, unique viewers 30 d, last viewed, per-card table (views / avg s / % viewers) from `GET /publications/:slug/analytics`. Local section untouched. |
| Netlify | `scripts/write-netlify-redirects.mjs` | Emits `/p/* ${target}/api/idocs/p/:splat 200!` right after `/api/*` (same env condition) so public links read `https://<site>/p/<slug>`. |
| Share | `ShareDialog.tsx`; editor **Share ▾ → "Share with people…"** | Members table (email + role view/comment/edit), add/remove/change role, **Share / Save members** → first time `PUT /shared/:docId { doc }` then `PUT …/members`; **Stop sharing** → `DELETE /shared/:docId`. Persists `doc.shared = { version, updatedAt, role: 'owner' }` which switches the editor into live-lite mode. `unknown-users` → lists the unresolved emails inline. |
| Shared with me | `IDocLibrary.tsx` | Section from `GET /shared` (rows with `role: 'owner'` excluded — those are already my docs). Open → `GET /shared/:docId` → stored locally under its `docId` with `shared: { version, updatedAt, role, ownerId, ownerName }` → editor view. Backend down → section simply absent. Local grid rows show "shared by X (role)" / "shared" / "published" in the meta line. |
| Role gating | `InteractiveDocs.tsx` → `SharedDocViewer.tsx` | `view` / `comment` → `SharedDocViewer` (scroll renderer, ← Library, Present, presence chips, **no** editor chrome). `comment` additionally gets Comments (card picker + `CommentsPanel` with `postRemote` → `POST /shared/:docId/comments`, then an immediate poll pulls the server doc). `edit` / `owner` → full `IDocEditor`. |
| Live-lite | `useSharedDocSync.ts` (+ `SyncBanner`, `PresenceChips` in `SharedDocViewer.tsx`) | Active whenever `doc.shared` exists. Poll `GET /shared/:docId` every 5 s (15 s when `document.hidden`). `server.version > local` and no unsaved local edits → applied silently (store write). With local edits → banner **"Newer version from <name> — Load theirs / Keep mine (overwrites)"**. Owner/edit local edits → debounced 1.5 s `PUT` with the last-seen `version`; 409 → same banner from `error.current`; Keep mine → `PUT` without `version` (force). Presence: `POST …/presence { cardId }` on card focus change + every 20 s → initials chips (name on hover) in the header. "Unsaved local edits" = fingerprint of the doc (minus `updatedAt/analytics/shared/publication`) differs from the last synced fingerprint. `toRemoteDoc()` strips `shared` + `publication` before sending. |
| `IDoc` type | `idocTypes.ts` | Two optional fields added: `publication?: { slug; url; publishedAt }` and `shared?: { version; updatedAt?; role: 'owner'\|'view'\|'comment'\|'edit'; ownerId?; ownerName? }`. |
| Tests | `src/test/idocsApi.test.ts`, `useSharedDocSync.test.tsx`, `PublishDialog.test.tsx`, `idocsSharedLibrary.test.tsx` | Real timers only; polling/debounce intervals injected (~20 ms) + `waitFor`. |

## UX flows

1. **Publish**: editor → Publish ▾ → "Publish to the web…" → adjust slug/password/SEO/flags → Publish → copy link / embed / LinkedIn. Re-open the dialog any time for Re-publish (pushes current content) or Unpublish. Analytics ▾ shows the server section once published.
2. **Share**: editor → Share ▾ → "Share with people…" → add emails + roles → Share. The header shows a "Shared" badge and presence chips; edits now sync (badge shows "· saving…"). Manage/Stop sharing from the same dialog.
3. **Receive**: library → "Shared with me" → click a card → view/comment members get the read-only viewer (comment: Comments drawer with a card picker), edit members get the editor. Everything the owner changes shows up within one poll.
4. **Conflict**: two editors type at once → whoever saves second gets 409 → banner → Load theirs (discard mine) or Keep mine (overwrite).

## Limitations (by design — this is "live-lite", not CRDT)

- Last-writer-wins at whole-doc granularity; no per-block merge, no cursors. The gap doc scores it partial on purpose (contract §2).
- Comment-role members can **add** comments only (`POST …/comments`); reply / resolve / delete are hidden for them (no contract route). Owner/edit comments ride along in the full-doc PUT.
- Presence is server-in-memory (Cloud Run 1 instance) and best-effort; chips can lag ≤20 s.
- `publication` / `shared` are client-local metadata: opening the same doc in another browser (via "Shared with me") re-derives `shared` from the server; `publication` is not re-derived (use `listPublications` if that ever matters).
- Public pages depend on the backend `GET /api/idocs/p/:slug` + the Netlify `/p/*` rule; the UI only builds URLs — nothing here verified them live.

## Not deviated from the contract

Paths, methods, bodies and envelopes follow `Docs/idocs-wave3-api.md` verbatim. Only tolerance added: the client accepts `current` / `emails` either at the envelope top level (`{ success:false, error, current }`) or nested under `data` — the contract's 409 example is written top-level, so the backend should keep it there.
