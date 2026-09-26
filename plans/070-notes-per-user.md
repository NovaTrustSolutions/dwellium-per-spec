# Plan 070: Notes belong to their creator (god-role "see everyone's notes" toggle)

## Status
- **Decided by Ilya (2026-09-26):** existing notes → owned by Andy (the `god` account `andy@dwellium.com`); everyone else's notes are strictly private; the `god` role gets **full** access (read, edit, delete) to other users' notes **only while a toggle in Settings is on**. "Andy" = any account with role `god` (today only Andy; local dev with auth off also runs as Andy — `authMiddleware.ts` `getDevUser()`).
- **Why:** the `notes` table has no owner column; `GET/POST/DELETE /api/files/notes` never filter by user (backend `fileRoutes.ts:234-270`, `database.ts:182-189, 287-294, 408-431`), so every signed-in user can read, edit and delete every note.
- **Repos:** backend `~/dwellium-backend` (branch `feat/070-notes-owner`), frontend `dwellium-per-spec` (branch `feat/070-notes-owner`, stacked on `fix/notepad-no-demo-notes` → #150).
- **Data rules (CLAUDE.md):** no DELETE/TRUNCATE/DROP; the only write to existing rows is the approved backfill `UPDATE notes SET owner_id = <andy id> WHERE owner_id IS NULL`.

## Contract

### Backend
- Migration (idempotent, at startup like `files.uploaded_by`): `ALTER TABLE notes ADD COLUMN owner_id TEXT` + `CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_id)`.
- Backfill (idempotent, every boot): owner_id := id of the user whose `lower(email) = 'andy@dwellium.com'`, only `WHERE owner_id IS NULL`, only if that user exists. Log the number of rows stamped.
- `scope=all` query param on every notes route = "the caller asked to act on everyone's notes". It is honoured **only** for role `god`; for anyone else it is ignored (not an error).
- Visibility `canSeeNote(note, user, wantsAll)`: `note.owner_id === user.id` OR (`user.role === 'god'` AND (`wantsAll` OR `note.owner_id IS NULL`)).
- `GET /notes[?q=][&scope=all]`: owner-filtered in SQL (not after LIMIT).
- `GET /notes/:id`: 404 when not visible (never reveal existence).
- `POST /notes`: new id → insert with `owner_id = user.id`. Existing id → allowed only if `canSeeNote`; the upsert never changes `owner_id`. Otherwise **404** (no id-squatting: a POST can't overwrite or claim someone else's note).
- `DELETE /notes/:id`: allowed if `canSeeNote` (owners may delete their own notes; `requireManagement` is replaced by this rule). Otherwise 404.
- Mentions follow note visibility.
- Tests (temp `DWELLIUM_DATA_DIR`): user A can't list/get/update/delete B's note; A's POST with B's id → 404 and B's note unchanged; god without scope sees only own + unowned; god with `scope=all` reads/edits/deletes B's; non-god `scope=all` ignored; backfill stamps only NULL rows and is idempotent; upsert still keeps created_at/mentions.

### Frontend
- `src/lib/notesScopeStore.ts`: per-user One Save store `{ readOthers: boolean }` (default false), holder `notesScopeUserIdHolder` in `perUserIdentity.ts` ALL_HOLDERS (plan 067 pattern).
- `notesScopeParam(role: string | null | undefined, readOthers: boolean): string` → `'scope=all'` iff role === 'god' && readOthers, else `''`.
- Apply to every notes call: `Notepad.tsx` (list, get, save), `CommandPalette.tsx` notes fetch, `ContentSearch/remoteSearch.ts` (`searchRemote` gains an optional `notesScope` string param; the widget passes it).
- Settings (`ControlPanel`): a toggle "Show other users' notes" rendered only for role `god`, with one line of help text ("Notepad, ⌘K and Search will include every user's notes; edits and deletes apply to them too.").
- Tests: param helper; toggle hidden for non-god; Notepad list URL carries `scope=all` only for god+on.

## Out of scope
- Showing the owner's name on a note (needs a users lookup) — follow-up.
- Semantic file search / files ACL (already per-file).
