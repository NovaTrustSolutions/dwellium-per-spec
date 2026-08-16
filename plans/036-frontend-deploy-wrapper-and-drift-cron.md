# Plan 036: Checked Netlify deploy wrapper + scheduled env-drift check

> **Executor instructions**: Follow step by step; run every verification command.
> On any STOP condition, stop and report. Commit in the worktree per the git
> workflow. SKIP updating `plans/README.md` — the reviewer maintains the index.
> Before reporting, audit every claim against an actual tool result.
>
> **Repo**: FRONTEND `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`
> (planned at frontend `8892c68`, 2026-07-04).
>
> **Drift check (run first)**: `git diff --stat 8892c68..HEAD -- Scripts/ .github/workflows/`
> Mismatch with "Current state" → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (new script + new workflow; no product code)
- **Depends on**: 031 (DONE — the verifier this plan schedules)
- **Category**: dx
- **Planned at**: frontend `8892c68`, 2026-07-04

## Why this matters

On 2026-07-04 a manual `netlify deploy --prod --dir build/client` shipped a
BROKEN production build (root → 404 for ~3 minutes): the CLI re-ran the
netlify.toml build command locally WITHOUT the `NETLIFY` env var, so
`react-router.config.ts` (`ssr: !process.env.NETLIFY`) built SSR mode — no
`build/client/index.html` — and that overwrote the correct SPA build moments
before upload. The correct sequence (NETLIFY=true build → assert index.html →
deploy `--no-build`) currently lives only in session memory. This plan encodes
it as a script, and schedules the plan-031 drift verifier so the next silent
env wipe is caught by a red workflow run instead of a user with a dead login.

## Current state

- `react-router.config.ts` (qualia-shell/): `ssr: !process.env.NETLIFY` — the flag that MUST be set for a deployable SPA build.
- `qualia-shell/scripts/write-netlify-redirects.mjs`: emits `build/client/_redirects`; needs `NETLIFY_API_PROXY_TARGET` env to write the `/api/*` proxy lines.
- `Scripts/verify_deploy_env.mjs` (plan 031, at repo root): read-only live-site drift checker; exit 0 = healthy; checks 1-3 need no credentials.
- Known-good deploy sequence (executed successfully 2026-07-04, deploy `6a48affd…`):
  1. `cd qualia-shell`
  2. `export NETLIFY=true VITE_API_URL="" VITE_APPFOLIO_SEEDS=false VITE_ONE_SAVE=true NETLIFY_API_PROXY_TARGET=https://dwellium-backend-472241012306.us-central1.run.app`
  3. `npx react-router build`
  4. `node scripts/write-netlify-redirects.mjs`
  5. assert `build/client/index.html` exists (the 404-prevention gate)
  6. `npx netlify-cli deploy --prod --no-build --dir build/client --site ee11c6c2-ac8d-494c-b390-e1d2162d7480`
  (`VITE_API_URL=""` matters: `qualia-shell/src/config.ts:21-31` gives an explicit `VITE_API_URL` priority over same-origin resolution, and local `.env` sets it to `http://localhost:3000`.)
- Workflows live at `.github/workflows/` (e.g. `appfolio-parity-gate.yml`, `pii-scan.yml`). Push-trigger flake is a known repo quirk; `workflow_dispatch` is the reliable trigger.
- `Scripts/` conventions: plain-Node/bash, exit code = pass/fail (see `Scripts/gate.sh`, `Scripts/verify_no_pii_leak.mjs`).

## Commands you will need

| Purpose | Command (repo root, on the Mac) | Expected |
|---|---|---|
| Script syntax | `bash -n Scripts/deploy_netlify.sh` | exit 0 |
| Dry-run build phase | `DEPLOY_DRY_RUN=true bash Scripts/deploy_netlify.sh` | builds + asserts, prints "DRY RUN — skipping deploy", exit 0 |
| Workflow lint | `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/env-drift-check.yml'))"` | no error |
| Verifier | `node Scripts/verify_deploy_env.mjs` | exit 0 |

## Scope

**In scope (create only):**
- `Scripts/deploy_netlify.sh` (new)
- `.github/workflows/env-drift-check.yml` (new)

**Out of scope:** `netlify.toml`; `qualia-shell/**` source; `Scripts/verify_deploy_env.mjs` (do not modify); other workflows; performing a real production deploy (dry-run only in this plan).

## Git workflow

- Branch `advisor/036-deploy-wrapper` off `main` (worktree: `git worktree add ".advisor-worktrees/036" -b advisor/036-deploy-wrapper main` — quote paths, they contain spaces).
- Commits: `feat(scripts): checked Netlify deploy wrapper (SPA-build assert + --no-build)` / `ci: scheduled env-drift check (verify_deploy_env.mjs)`. Do NOT push.

## Steps

### Step 1: `Scripts/deploy_netlify.sh`

Bash, `set -euo pipefail`. Encodes the known-good sequence from Current state
verbatim, plus:
- Hard gate after build: `[[ -f build/client/index.html ]]` else exit 1 with
  message "SPA build missing index.html — NETLIFY env not applied? Refusing to
  deploy (this exact bug caused the 2026-07-04 prod 404)."
- Hard gate: `grep -q "/api/\*" build/client/_redirects` else exit 1.
- `DEPLOY_DRY_RUN=true` → do everything except the `netlify-cli deploy` call.
- After a real deploy: run `node ../Scripts/verify_deploy_env.mjs` (from repo
  root: `node Scripts/verify_deploy_env.mjs`) and exit nonzero if it fails —
  deploy-then-verify in one motion.
- `NETLIFY_API_PROXY_TARGET` overridable via env, defaulting to the current
  Cloud Run URL above.

**Verify**: `bash -n Scripts/deploy_netlify.sh` → exit 0; then
`DEPLOY_DRY_RUN=true bash Scripts/deploy_netlify.sh` → build runs, both gates
pass, prints the dry-run skip line, exit 0, and NO new deploy appears on the
site (do not run a real deploy in this plan).

### Step 2: `.github/workflows/env-drift-check.yml`

Name: `Env Drift Check`. Triggers: `workflow_dispatch` + `schedule: cron '0 13 * * *'`
(daily, ~9am ET). One job, ubuntu-latest, Node 22 (`actions/setup-node@v4`),
steps: checkout → `node Scripts/verify_deploy_env.mjs`. No secrets needed
(check 4 self-SKIPs without `NETLIFY_AUTH_TOKEN`; if the repo has that secret
configured later, pass it via `env:` — add the line commented out).

**Verify**: YAML parses (command above); `git diff --name-only main..HEAD` → exactly the two new files.

### Step 3: Commit both.

**Verify**: `git status --short` clean after commit.

## Test plan

Dry-run gate in Step 1 is the test for the wrapper; workflow correctness is
YAML-parse + (post-merge, operator) one `workflow_dispatch` run — note that in
your report as an operator follow-up, don't attempt it from the worktree.

## Done criteria

- [ ] `bash -n` exit 0; dry-run exit 0 with both hard gates exercised
- [ ] Workflow YAML parses; cron + dispatch triggers present
- [ ] `git diff --name-only main..HEAD` → exactly the 2 new files; committed
- [ ] Report notes the operator follow-up: dispatch `Env Drift Check` once after merge to confirm green

## STOP conditions

- The dry-run build fails for reasons unrelated to this plan (repo won't build at HEAD) — report, don't fix the build.
- `Scripts/verify_deploy_env.mjs` is missing or was renamed (plan-031 drift).

## Maintenance notes

- When the Cloud Run URL or site ID changes, update the defaults here AND in `Docs/ops/DEPLOY_ENV_BASELINE.md`.
- If Netlify credits run out again, the wrapper's deploy step fails loudly — that's intended; see the baseline doc's recovery runbook.
