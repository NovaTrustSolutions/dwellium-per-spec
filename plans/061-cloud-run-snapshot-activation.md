# 061 — Activate SQLite snapshot/restore on Cloud Run (get the DB off gcsfuse)

Backend repo `~/dwellium-backend/ai-dashboard369-file-manager`, branch from `backend/ship` @ `74e30cf`.
Design reference: `docs/persistent-data-cloud-run.md` + `src/services/dataSnapshot.ts` (merged, tested,
gated on `DWELLIUM_SNAPSHOT_DIR`, currently inert).

## Verified facts (2026-09-19, console + code)

- Live service `dwellium-backend` rev `00062-kgp`, 2 GiB / 2 CPU, min = max = 1 instance.
  Bucket `my-project-57391aion-ethos-api-dwellium-runtime` mounted (gcsfuse) at `/var/dwellium`;
  `DWELLIUM_DATA_DIR = ONE_SAVE_DATA_DIR = /var/dwellium/data` → **the SQLite DB lives on gcsfuse today**.
- On the mount under `data/`: `dwellium.db` **45.3 MB**, `objects/` (One Save, ~50+ small JSON files,
  ~240 KB per page), `events/`, `security/` (encryption keys), `scribe/` (user documents/images), `lancedb/`.
- Logs: `BufferedWriteHandler.OutOfOrderError … data/dwellium.db-journal` every few seconds under write
  load; 549 in the week before today; caused the 22:41–22:45 stall (health 50 s → timeouts).
- The doc's design assumes the data dir is **local disk** and only snapshots go to a mount. The deploy
  script contradicts it (data dir on the mount). Activating the env var alone would NOT fix the errors —
  the DB would still be on gcsfuse. The plan below moves the data dir.
- `restoreSnapshotIfEmpty` only runs when the local data dir has no DB. A snapshot dir with no snapshot
  ⇒ boots **empty**. So the live data must be snapshotted **before** the data dir moves (Phase 2).
- Not in a snapshot: `scribe/` (user files), `lancedb/`, `georgia-code/`, uploads, synced files.
  `scribe/` is user data and must stay durable → it must keep living on the mount (Phase 1).
- One Save object files are written with plain `writeFileSync` (whole-file); fine on gcsfuse today, and
  they move to local disk + snapshot with the DB (they are in the snapshot's `onesave` root).

## Phase 1 — code: one env for "durable files stay on the mount" (backend, small)

Today every consumer derives its path from `DWELLIUM_DATA_DIR`. After the move, that dir is ephemeral,
so anything that is user data and NOT snapshotted needs its own durable root.

- New env `DWELLIUM_DURABLE_DIR` (fallback: `DWELLIUM_DATA_DIR`, then the existing default) consumed by:
  - `src/services/userDataDir.ts` (Scribe documents/images, File Explorer per-user files) — **must** move.
  - `src/services/lanceVectorStore.ts` and `src/services/georgiaCodeIndexer.ts` (caches; keeping them on
    the mount avoids a rebuild/redownload on every deploy) — same one-line change.
  - `src/services/streetView.ts` (`property-photos/` cache of paid Google Street View fetches — losing it on
    every deploy would re-bill each property) — same one-line change in its `dataDir(env)` helper.
- Leave on `DWELLIUM_DATA_DIR` (they are inside the snapshot): `database.ts`, `domainEncryption.ts`,
  `notebooklmStore.ts`, `objectStore.ts` (via `ONE_SAVE_DATA_DIR`), `automationScheduler.ts`.
- README env table: `DWELLIUM_DURABLE_DIR`, `DWELLIUM_SNAPSHOT_DIR`, `DWELLIUM_SNAPSHOT_INTERVAL_MIN`.
- `deploy/cloud-run.sh`: env block becomes
  `DWELLIUM_DATA_DIR=/var/dwellium-local/data`, `QUALIA_DATA_DIR=/var/dwellium-local/data`,
  `ONE_SAVE_DATA_DIR=/var/dwellium-local/data`, `DWELLIUM_DURABLE_DIR=/var/dwellium/data`,
  `DWELLIUM_SNAPSHOT_DIR=/mnt/snapshots`, `DWELLIUM_SNAPSHOT_INTERVAL_MIN=5`;
  a second `--add-volume name=data-snapshots,type=cloud-storage,bucket=<snapshots bucket>` +
  `--add-volume-mount volume=data-snapshots,mount-path=/mnt/snapshots` (outside `/var/dwellium` —
  no nested mounts). **But** ship these script edits behind a flag (`SNAPSHOT_CUTOVER=1`) so Phase 2
  can deploy the code with the data dir still on the mount.
- Tests: `tests/userDataDir.test.ts` (or nearest): `DWELLIUM_DURABLE_DIR` wins over `DWELLIUM_DATA_DIR`
  for Scribe/file roots; snapshot tests unchanged.
- Gate: `npx tsc --noEmit -p . && npx jest --runInBand --forceExit` (full suite; 555 tests today).

## Phase 2 — seed a snapshot from a COPY of the live DB — Ilya runs gcloud, agent runs the script

**Why this changed (2026-09-19 00:32–01:35 UTC-4, verified in Cloud Logging):** the first attempt
(deploy `00063`/`00064` with `ENABLE_SNAPSHOTS=true`) started the scheduler
(`[Snapshot] Enabled → /mnt/snapshots every 5 min`) but produced nothing in an hour and logged no
`Wrote`/`Failed`. The deploy script's deploy-then-update sequence ran two revisions against the same
SQLite file on gcsfuse; the mount logged `stale file handle … dwellium.db was modified or deleted by
another process`, `00063`'s final snapshot died with `SqliteError: disk I/O error`, and `00064`'s
`db.backup()` appears stalled with the in-flight guard never clearing. **The online backup API cannot
read a live DB off gcsfuse.** Fixes on the branch: a 2-minute watchdog on `snapshotNow` (loud
`[Snapshot] Timed out …`, slot released) + a `[Snapshot] Starting` line, and
`src/scripts/buildSnapshotFromCopy.ts`, which builds a normal `snapshot-<ts>.sqlite` from a plain copy.

1. **Copy the runtime data off the bucket, read-only** (Ilya; only files the snapshot format covers —
   NOT `scribe/`, `lancedb/`, `georgia-code/`):
   ```bash
   mkdir -p ~/dwellium-seed/data && cd ~/dwellium-seed/data && B=gs://my-project-57391aion-ethos-api-dwellium-runtime/data && gcloud storage cp "$B/dwellium.db" . && gcloud storage cp -r "$B/objects" "$B/events" "$B/security" . && (gcloud storage cp "$B/notebooklm-settings.json" "$B/automation-schedules.json" . 2>/dev/null; true) && ls -la
   ```
   Do it at a quiet moment: a copy taken mid-write can be torn; the script's `quick_check` catches that
   and the answer is simply to copy again.
2. **Build + verify the snapshot locally** (agent, no gcloud):
   `cd ~/dwellium-backend/ai-dashboard369-file-manager && npx ts-node src/scripts/buildSnapshotFromCopy.ts ~/dwellium-seed/data ~/dwellium-seed/out`
   — prints bytes, table count, state-file count, `google_oauth_accounts` rows, `quick_check`. Agent then
   cross-checks with `sqlite3`: the Google account row(s) for `andy@dwellium.com`, the One Save object
   count vs the bucket listing, and `data/security/domain-encryption-keys.json` present.
3. **Upload the seed** (Ilya): `gcloud storage cp ~/dwellium-seed/out/snapshot-*.sqlite gs://my-project-57391aion-ethos-api-dwellium-snapshots/`
4. **Redeploy the branch with the watchdog** (Ilya, `ENABLE_SNAPSHOTS=true`, data dir still on the
   mount). Expected within 2 min of each tick: `[Snapshot] Starting …` then either `Wrote` (fine) or
   `Timed out` (expected while the DB is on gcsfuse — harmless, the seed already exists, and Phase 3
   moves the DB where backups work). Any periodic `Wrote` that appears is a bonus, newer seed.
5. **Gate for Phase 3:** the seed object is in the bucket, `quick_check = ok`, real rows, state files
   counted. The ≤1-minute cutover window in Phase 3 now becomes "changes since the seed copy" — so do
   steps 1–3 and Phase 3 back-to-back at the quiet hour, with the copy taken last.

## Phase 3 — cutover: data dir to local disk — Ilya runs gcloud, quiet hour

1. Set `DWELLIUM_SNAPSHOT_INTERVAL_MIN=1` (services update) and wait 2 min so the newest snapshot is
   ≤1 min old.
2. Deploy with `SNAPSHOT_CUTOVER=1`: data dir → `/var/dwellium-local/data` (Cloud Run's in-memory
   writable layer; 45 MB DB + One Save files, well inside 2 GiB; `journal_mode` stays DELETE per
   `database.ts`, which is correct on local disk too — no gcsfuse in the write path any more).
3. New revision boots: `[Snapshot] Restored snapshot-<ts>.sqlite (… bytes, N state files) into
   /var/dwellium-local/data`. Old revision gets SIGTERM → final snapshot.
   Known window (doc "Deploy ordering"): writes in the ≤1 min between the restored snapshot and the
   traffic switch land only in the old revision's final snapshot, which is never restored (the new
   revision's own later snapshots are newer). Accepted for one quiet-hour cutover; state it in the log.
4. Verify (agent, no gcloud): Netlify `/api/auth/me` 200 for Andy; Google link still present
   (`/api/google/accounts` 200 with the account); One Save hydrate returns the same object ids as before
   (compare `/api/objects?owner=…&limit=500` count); Scribe file list unchanged; then a 5-minute watch of
   the logs shows **zero** `OutOfOrderError` and `[Snapshot] Wrote …` lines every minute; set interval
   back to 5.
5. The old `data/dwellium.db` on the runtime bucket is left in place (never deleted — data-protection
   rule); note in the runbook that it is now a frozen copy from the cutover time.

## Phase 4 — guardrails (backend, small)

- `/health` reports `snapshot: { enabled, lastWroteAt, lastError }` so the pill/banner path and a curl
  can tell if snapshots stop (a silent snapshot failure = silent data loss on the next deploy).
- Alert: Cloud Logging metric on `textPayload:"[Snapshot] Failed"` → email (Ilya, console).
- `docs/persistent-data-cloud-run.md`: replace the "reconnect Google once" section with the Phase-2
  seeding procedure (it predates having live data on the mount); document `DWELLIUM_DURABLE_DIR` and the
  memory footprint note (DB size counts against instance memory; today 45 MB).
- `docs/code.md` entry: error / root cause (design vs deploy script mismatch) / fix / prevention.

## Rollback

Note on the script's preserve-unknowns merge: once `DWELLIUM_SNAPSHOT_DIR` and the `data-snapshots`
volume are on the live service, a later deploy with `ENABLE_SNAPSHOTS` unset does NOT remove them (the
merge keeps unknown live env; `--add-volume` never removes volumes). That is the safe direction — snapshots
keep running — but to truly disable them use `gcloud run services update --remove-env-vars
DWELLIUM_SNAPSHOT_DIR --remove-volume data-snapshots` explicitly.

Deploy with `SNAPSHOT_CUTOVER` unset again: data dir returns to `/var/dwellium/data` (the frozen DB from
cutover time). Anything written after cutover is in the snapshots bucket; restore by copying the newest
snapshot's DB over `data/dwellium.db` on the runtime bucket **only with Ilya's explicit go** (it
overwrites rows).

## Not doing

- Moving to Cloud SQL / Postgres — the right long-term answer, separate plan; this one removes the
  stalls with code that already exists.
- Snapshotting Scribe/uploads — they are whole-file writes that gcsfuse handles; they stay durable on
  the mount via `DWELLIUM_DURABLE_DIR`.
- Multi-instance — min = max = 1 is what makes a single local SQLite valid; do not raise MAX_INSTANCES.

## Estimates

Phase 1 ~40 lines + tests (agent, ~30 min incl. gate). Phase 2 ~15 min of Ilya's gcloud + a 10-minute
wait. Phase 3 ~15 min at a quiet hour + 10-minute watch. Phase 4 ~40 lines.
