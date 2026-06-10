# One Save — end-to-end smoke test

**Goal:** prove the persistence spine actually works — that data and setup survive a full browser-data wipe + re-login — not just that it compiles. Two parts: an **automated backend round-trip** (Part A) and the **real survival test** in the UI (Part B).

Covers the 29 wrapped stores: content (P1), arrangement (P2), appearance + hierarchy/layout-settings (`withSyncStatic`).

---

## Prerequisites

1. **Backend P0 applied** in `ai-dashboard369-file-manager` (files from `Docs/OneSave_Backend_P0.md`: `objectStore.ts`, `objectRoutes.ts`, `app.ts` mount). `ownerFromReq` wired to the real auth user (already is — `req.user.id`).
2. Backend running. Simplest for local: `AUTH_ENABLED` unset/false → `authenticate` injects the dev user (Andy) so no token is needed.
3. Frontend built/served with the flag **on**: `VITE_ONE_SAVE=true`.

---

## Part A — automated backend round-trip (~10s)

```bash
# backend running with AUTH_ENABLED=false:
bash Scripts/smoke_one_save.sh

# or with disk verification:
ONE_SAVE_DATA_DIR=~/dwellium-backend/ai-dashboard369-file-manager/data \
  bash Scripts/smoke_one_save.sh
```

Asserts: `PUT` upsert → `GET` payload round-trips → appears in owner-scoped `list` → soft-delete removes it from the list → (optional) `objects/<id>.json` + append-only `events/<id>.ndjson` exist on disk. Prints `PASS` / `FAIL` and exits non-zero on failure.

If Part A fails, fix the backend before touching the UI — Part B can't work without it.

---

## Part B — the survival test (the real proof)

Build + serve the frontend with `VITE_ONE_SAVE=true` and the backend running, then:

1. **Log in** (Andy). Open the browser devtools → Application → Local Storage; note the app is using it as the cache.
2. **Make changes across the wrapped categories:**
   - **Appearance:** switch theme (e.g. dark → tokyo-night), change the accent color, toggle animations.
   - **Arrangement:** open 2–3 widgets, arrange them, **Save Layout** as "SmokeTest"; resize a Scribe pane.
   - **Content:** create a **Wiki** page; add a **ThoughtWeaver** capture; add a **Task Board** card; enroll/label a speaker (or add a tag).
3. **Wait ~2s** after the last change (write-through is debounced ~800ms) so everything has POSTed. Optionally confirm in devtools → Network that `PUT /api/objects/...` calls fired (one per change).
4. **Nuke the cache:** devtools → Application → **Clear site data** (or Storage → Clear). Hard-reload.
5. **Log back in** as Andy.
6. **Verify everything came back:**
   - Theme + accent + animations = what you set (not defaults).
   - "SmokeTest" layout present; Scribe pane width restored.
   - Wiki page, ThoughtWeaver capture, Task Board card, tag/speaker all present.

**Bonus — cross-user isolation:** log in as **Lisa** → none of Andy's content/setup shows (owner-scoped). Switch back to Andy → his returns.

---

## Pass / fail checklist

| # | Check | Pass |
|---|---|:---:|
| A1 | `smoke_one_save.sh` prints PASS | ☐ |
| A2 | (if DATA_DIR set) object + event-log files on disk | ☐ |
| B1 | `PUT /api/objects` fires on each change (Network tab) | ☐ |
| B2 | After Clear-site-data + re-login: **appearance** restored | ☐ |
| B3 | …**arrangement** (layout + pane sizes) restored | ☐ |
| B4 | …**content** (wiki / capture / task / tag) restored | ☐ |
| B5 | Lisa does **not** see Andy's data (owner isolation) | ☐ |

All boxes checked = the "stays forever + my setup follows me" guarantee holds.

---

## Troubleshooting

- **Nothing persists / no PUT calls fire** → the flag is off. Confirm the build used `VITE_ONE_SAVE=true` (`grep -r ONE_SAVE build/client/assets | head`), and `oneSaveClient.ONE_SAVE_ENABLED` is true at runtime.
- **`PUT` returns 401** → `AUTH_ENABLED=true` but no/expired token. Either run the backend with `AUTH_ENABLED=false` (dev user) or pass a real `TOKEN=` to the script.
- **`PUT` returns 404** → route not mounted. Confirm `app.use('/api/objects', …)` is in `app.ts` and the server was restarted.
- **CORS error in the browser** → backend `CORS_ORIGINS` must include the frontend origin.
- **Data restores for the wrong user / leaks across users** → `ownerFromReq` isn't reading `req.user.id`; never trust a client-sent owner.
- **Appearance flashes default before correcting on a new device** → expected: the pre-hydration FOUC IIFE reads the empty local cache first, then `hydrate()` applies the synced value post-login. Same-device has no flash.
- **Excluded by design (don't expect these to sync):** auth token, API keys (`integrationsStore`), speaker calibration, ingestion folder handle, `dockItems` (composite blob — pending custom merge), and screen-dependent sidebar dims.
