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

## Phase 2 — seed snapshots — DONE 2026-09-19 (verified)

- Snapshots bucket created + `roles/storage.objectAdmin` granted; deployed with `ENABLE_SNAPSHOTS=true`
  (data dir still on the mount). Periodic snapshots have run every 5 min since 00:38 EDT:
  `[Snapshot] Wrote snapshot-<ts>.sqlite (341,700,608 bytes, 147 state files)`; bucket keeps 3.
- Watchdog revision `00068` verified: `Starting` 01:09:58 → `Wrote` 01:10:24 (26 s).
- Two findings while verifying:
  1. The deploy script's deploy-then-update sequence runs two revisions against the same SQLite file for
     ~30 s; on gcsfuse the outgoing revision's SIGTERM snapshot then fails (`disk I/O error`, seen 3×).
     Harmless once the DB is on local disk (each instance has its own). Until then the 5-minute periodic
     snapshot is the seed, not the SIGTERM one.
  2. `events/whiteboard_<uid>.ndjson` is **283 MB** — every whiteboard save appended the full board to
     One Save history; that is 280 of the 341 MB. Fixed on the branch: `ONE_SAVE_EVENTS_DIR` keeps history
     on the durable mount, snapshots leave it out, restore skips it. Restore payload → ~46 MB.
     The seed copy procedure (buildSnapshotFromCopy) is kept as a tool but was NOT needed.
- `ae8f4a8` (events on the durable mount) deployed as `00070-qvp` 01:21 EDT with the data dir still on the
  mount: first snapshot `45,621,248 bytes, 74 state files` (was 341 MB / 147). Bucket holds it as the seed.
- Phase 4 addition: cap the payload stored per history event (e.g. 256 KB; store size + `payloadOmitted`
  for larger) after checking what the TimeTravel widget renders for an omitted payload.

## Phase 3 — cutover — ATTEMPT 1 FAILED SAFELY 2026-09-19 02:25 EDT; retry procedure below

**What happened:** revision `00072-8pm` (SNAPSHOT_CUTOVER=1) refused to boot — the newest snapshot
failed `quick_check` (`*** in database main ***`); Cloud Run retried 3× (three different 1-minute
snapshots, all failing) and kept 100% traffic on `00071`. No data moved, nothing lost.
**Diagnosis (local, on a downloaded snapshot):** `integrity_check` = `database disk image is malformed`,
pages 8193+ "never used"; every table reads fine EXCEPT `design_history` (Design-agent SVGs). `.recover`
produces a DB with `integrity_check: ok`, all tables identical except `design_history` = 0 rows.
So the corruption is orphaned pages + one broken b-tree — the signature of lost journal writes on gcsfuse
(the OutOfOrderError storm), not a torn copy. Whether the LIVE file has it too: check `live.sqlite`
(download step below) — expected yes, since `db.backup()` copies pages verbatim.
**Shipped for the retry:** `ec7abd4` (quick_check before publish; restore falls back newest→oldest and
only fails when none is usable) + `src/scripts/repairAndSeed.sh` (`.recover` → integrity ok → row-count
diff → seed rebuilt with the input's 74 state files via buildSnapshotFromCopy).

**Decision (Ilya):** accept that `design_history` (generated floor-plan/design SVGs) restores empty.

**Retry sequence (quiet hour; Ilya runs gcloud, agent runs the local script):**
0. `gcloud storage cp gs://…-dwellium-runtime/data/dwellium.db ~/dwellium-seed/live.sqlite` → agent runs
   `integrity_check` on it (informational: confirms the source is damaged; if it is NOT, seed from it instead).
1. **Stop the old writer + its rotation** (it publishes a malformed snapshot every minute and rotation
   would delete the uploaded seed within 3 minutes — KEEP=3):
   `gcloud run services update dwellium-backend --project my-project-57391aion-ethos-api --region us-central1 --remove-env-vars DWELLIUM_SNAPSHOT_DIR`
   (new revision, data dir still on the mount, snapshots off; harmless).
2. Download the newest snapshot again (freshest data) → agent: `bash src/scripts/repairAndSeed.sh ~/dwellium-seed/latest.sqlite ~/dwellium-seed/out`
   → prints integrity ok, the `design_history` DIFF line only, `googleAccounts: 1`.
3. Upload the seed: `gcloud storage cp ~/dwellium-seed/out/snapshot-*.sqlite gs://my-project-57391aion-ethos-api-dwellium-snapshots/`
   (its timestamp name is newer than the auto ones, so restore picks it first; fallback covers the rest).
4. Cutover deploy from `ec7abd4`+: `ENABLE_SNAPSHOTS=true SNAPSHOT_CUTOVER=1 DWELLIUM_SNAPSHOT_INTERVAL_MIN=5 bash deploy/cloud-run.sh`
   (the env file re-adds DWELLIUM_SNAPSHOT_DIR). Expected boot log: `[Snapshot] Restored snapshot-<seed> (… bytes, 74 state files) into /var/dwellium-local/data`.
5. Verify (agent): Andy's session, Google link, One Save object count (74 objects on the mount vs
   `/api/objects?owner=…&limit=500`), Scribe files, Properties; five-minute watch: zero `OutOfOrderError`,
   `[Snapshot] Wrote` lines with the new revision (now verified before publish).
Accepted loss window: writes between the snapshot used in step 2 and the traffic switch in step 4
(≈ build time, 8–12 min) — do it when nobody is working in the app. Events history is untouched (mount).

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
