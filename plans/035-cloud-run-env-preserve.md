# Plan 035: Make `deploy/cloud-run.sh` stop wiping service env vars (preserve-unknowns merge + dry-run)

> **Executor instructions**: Follow step by step; run every verification command.
> On any STOP condition, stop and report. Commit in the worktree per the git
> workflow. SKIP updating `plans/README.md` — the reviewer maintains the index.
> Before reporting, audit every claim against an actual tool result.
>
> **Repo**: BACKEND `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager`
> (planned at backend `db40f4c`, 2026-07-04).
>
> **Drift check (run first)**: `git diff --stat db40f4c..HEAD -- deploy/cloud-run.sh`
> Mismatch with "Current state" → STOP.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED (deploy tooling — a bug here breaks deploys; mitigated by dry-run mode + no live deploy required to verify)
- **Depends on**: none
- **Category**: dx / security
- **Planned at**: backend `db40f4c`, 2026-07-04

## Why this matters

The service env has been wiped by deploys **three documented times** (commit
`0c3814c` "restored after deploy wipe"; 2026-07-03 incident: Google sign-in dead
in production; 2026-07-04: `GOOGLE_AUTH_ALLOWED_EMAILS` + `AUDIT_LOG_VIEWER_EMAILS`
had to be re-applied by hand after the deploy). Root cause (verified 2026-07-04):
`gcloud run deploy --env-vars-file "${env_file}"` REPLACES the service's entire
literal-env set with only what the script writes into `env_file` — any var the
script doesn't know about is silently deleted. After this plan, the script
merges the live service's current env into `env_file` (script values win;
unknown keys are preserved), and a `DEPLOY_DRY_RUN=true` mode prints the merged
env-file and exits, making the merge testable without deploying.

## Current state

- `deploy/cloud-run.sh` (193 lines, bash, `set -euo pipefail`):
  - Lines ~7-20: config defaults (`PROJECT_ID:-my-project-57391aion-ethos-api`, `REGION:-us-central1`, `SERVICE_NAME:-dwellium-backend`, …).
  - Lines ~107-127: `env_file="$(mktemp)"` + heredoc writing the KNOWN vars (NODE_ENV, AUTH_ENABLED, AUTH_SESSION_HOURS, SEED_DEMO_DATA, TRUST_PROXY, CORS_ORIGINS, 7 dir paths, CLOUD_BROWSER_CHROMIUM_PATH, SOFFICE_PATH, SCHEDULER_ENABLED, GMAIL_FETCHER_ENABLED) in `KEY: "value"` YAML form.
  - Lines ~129-142: conditional appends — `GOOGLE_CLIENT_ID` (if exported), `GOOGLE_OAUTH_CLIENT_ID` (if exported, with GOOGLE_CLIENT_ID fallback), `GOOGLE_OAUTH_PUBLIC_BASE_URL` (always), `GOOGLE_OAUTH_REDIRECT_URI` (if exported).
  - Line ~149: `gcloud run deploy … --env-vars-file "${env_file}" …` ← the wipe.
  - Lines ~170-181: post-deploy `gcloud run services update --update-env-vars "PUBLIC_BASE_URL=…,RECALL_WEBHOOK_BASE_URL=…"` — proof the update-vs-replace distinction is already used in this script.
- Vars that exist on the live service today but are NOT in the script's known
  set (the ones that keep getting wiped): `GOOGLE_CLIENT_ID` (when not
  exported), `GOOGLE_AUTH_ALLOWED_EMAILS`, `AUDIT_LOG_VIEWER_EMAILS`.
  Secret-backed env (`OPENAI_API_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, …) rides
  `--set-secrets` and is a separate mechanism — do not touch it.
- No test framework exists for deploy scripts; `bash -n` is the syntax gate.
- The operator runs this script authenticated as andy@dwellium.com.

## Approach (decided — do not redesign)

After the heredoc + conditional appends build `env_file`, add a **preserve pass**:

1. Fetch the live service's literal env as `KEY<TAB>VALUE` lines:
   `gcloud run services describe "${SERVICE_NAME}" --project … --region … --format='value[separator="	"](spec.template.spec.containers[0].env.name, spec.template.spec.containers[0].env.value)'`
   — note this yields semicolon-joined pairs; parse defensively (see Step 1).
   Simpler and more robust alternative (choose this if the format fight gets
   ugly): `--format=json` piped to `python3 -c` extracting `name`/`value` pairs
   of entries that have a literal `value` (skip entries with `valueFrom` —
   those are secret refs).
2. For each live key NOT already present in `env_file` and not a known
   secret-ref, append `KEY: "VALUE"` to `env_file` (YAML-escape double quotes
   in values). Script-known values always win (they're written first; the
   preserve pass only appends missing keys).
3. Echo a summary: `Preserved N existing env var(s): KEY1 KEY2 …`.
4. `DEPLOY_DRY_RUN=true bash deploy/cloud-run.sh` → after building the merged
   env_file, print `--- merged env file ---`, `cat "${env_file}"`, and `exit 0`
   BEFORE any `gcloud run deploy` / IAM / bucket / secret mutation. Place the
   dry-run exit AFTER the preserve pass so the merge is what's being tested.
   (The describe call is read-only and allowed in dry-run.)
   If the service does not exist yet (first deploy), the preserve pass must
   no-op gracefully (empty live env), not fail the script.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Syntax check | `bash -n deploy/cloud-run.sh` | exit 0 |
| Dry run (read-only) | `DEPLOY_DRY_RUN=true bash deploy/cloud-run.sh` | prints merged env incl. preserved keys; exits 0; NO deploy |

## Scope

**In scope:** `deploy/cloud-run.sh` only.
**Out of scope:** any application source; any secret-handling change (`upsert_secret_from_env` and `--set-secrets` stay exactly as they are); any live deploy (the reviewer/operator deploys later); the frontend repo.

## Git workflow

- Branch `advisor/035-env-preserve` off backend `main` (create a worktree: `git worktree add ../worktrees/advisor-035 -b advisor/035-env-preserve main`; note the package root nests at `ai-dashboard369-file-manager/` inside the worktree).
- Commit: `fix(deploy): preserve existing Cloud Run env vars on deploy (merge pass + DEPLOY_DRY_RUN)`. Do NOT push.

## Steps

### Step 1: Add the preserve pass + dry-run gate

Implement the Approach in `deploy/cloud-run.sh` immediately after the last
conditional env append (after the `GOOGLE_OAUTH_REDIRECT_URI` block, ~line 142)
and before the `cpu_flag` block. Guard the whole preserve pass so a failure to
describe (service missing / first deploy) degrades to "Preserved 0" rather than
aborting (`|| true` with an explicit empty default — but do NOT swallow JSON
parse errors silently; print a warning).

**Verify**: `bash -n deploy/cloud-run.sh` → exit 0.

### Step 2: Dry-run against the live service (read-only)

`DEPLOY_DRY_RUN=true bash deploy/cloud-run.sh` (operator gcloud auth is active).
Expected: the merged env file printout contains BOTH the script-known keys AND
the preserved keys `GOOGLE_AUTH_ALLOWED_EMAILS`, `AUDIT_LOG_VIEWER_EMAILS`,
`GOOGLE_CLIENT_ID` (not exported in your shell → must arrive via preserve),
and does NOT contain `OPENAI_API_KEY`/`GOOGLE_OAUTH_CLIENT_SECRET` as literals
(secret refs must be skipped). Script exits 0 without deploying (confirm: no
"Building" output, `gcloud run revisions list --service dwellium-backend
--project my-project-57391aion-ethos-api --region us-central1 --limit 1` shows
the SAME latest revision before and after).

**Verify**: paste the merged-env printout (values may be shown for non-secret
keys; emails/URLs here are not secrets) + the unchanged revision name.

### Step 3: Wipe-simulation assertion

Re-run the dry-run with `GOOGLE_CLIENT_ID` exported to a dummy-looking but
plausible value `test-client-id.apps.googleusercontent.com`: the merged file
must show the EXPORTED value (script wins over preserve) exactly once — no
duplicate `GOOGLE_CLIENT_ID:` lines (duplicate keys make `--env-vars-file`
behavior undefined).

**Verify**: `DEPLOY_DRY_RUN=true GOOGLE_CLIENT_ID=test-client-id.apps.googleusercontent.com bash deploy/cloud-run.sh | grep -c "^GOOGLE_CLIENT_ID:"` → `1`, with the exported value.

## Test plan

The dry-run IS the test (Steps 2-3); no jest additions — deploy scripts sit
outside the app suite, matching repo precedent.

## Done criteria

- [ ] `bash -n` exit 0
- [ ] Dry-run output shows preserved keys incl. `GOOGLE_AUTH_ALLOWED_EMAILS` + `AUDIT_LOG_VIEWER_EMAILS`; secret-backed keys NOT duplicated as literals; latest revision unchanged
- [ ] Duplicate-key guard verified (Step 3 grep = 1)
- [ ] `git diff --name-only main..HEAD` → exactly `ai-dashboard369-file-manager/deploy/cloud-run.sh`; committed on the branch

## STOP conditions

- The describe/JSON parse cannot distinguish literal env from secret refs — report the actual JSON shape instead of guessing.
- The dry-run triggers ANY mutating gcloud call (visible in output) — the gate is misplaced; fix or stop after one attempt.
- `deploy/cloud-run.sh` at HEAD doesn't match the line anchors in Current state.

## Maintenance notes

- The preserve pass makes the script forward-compatible with any future env var; the baseline doc (`Docs/ops/DEPLOY_ENV_BASELINE.md` in the FRONTEND repo) remains the human-readable source of truth — keep both in sync.
- Reviewer: check YAML escaping of values containing quotes/colons, and the first-deploy no-op path.
