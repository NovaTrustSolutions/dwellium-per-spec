# Plan 004: Move stale process docs + launch scripts out of the repo root

> **Executor instructions**: Follow step by step. The reference-check in Step 1 is
> mandatory before any move. Obey STOP conditions. Update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git -C . status --short` and `git diff --stat a619279..HEAD -- '*.md' '*.sh'`
> If files in the list below are already gone/moved, adjust and note it.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (relocations only — but verify references first)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

The repo root holds 22 markdown files and ~10 `launch_*.sh` scripts. Thirteen of the
docs are one-shot session/handoff/status artifacts (e.g. `WHY_GREEN_IS_NOT_WORKING.md`,
`MANUAL_DWELLIUM_GAP_ANALYSIS.md`) committed alongside the few live docs
(`README.md`, `CLAUDE.md`, `AGENTS.md`, `BACKLOG.md`, `FUCKUPS.md`). A new contributor
or agent can't tell signal from history. Relocating the historical artifacts to
`Docs/archive/` and the launch scripts under `Scripts/` makes the root legible without
deleting anything.

## Current state

Tracked process/handoff docs at root to ARCHIVE (confirmed via `git ls-files`):
`ASTRA_AUDIT.md`, `AUTOBUILD_BACKLOG.md`, `AUTOBUILD_PROMPT.md`,
`CLAUDE_CODE_GMAIL_CALENDAR_HANDOFF.md`, `DOCS_VS_SCRIBE_GAP.md`, `FIX_VERIFICATION.md`,
`Gap_Analysis_vs_3H.md`, `HANDOFF_AURA_VISUALIZER.md`, `LIVE_VERIFICATION_REPORT.md`,
`MANUAL_DWELLIUM_GAP_ANALYSIS.md`, `SCRIBE_MANUAL_GAP_ANALYSIS.md`,
`THOUGHTWEAVER_STATUS.md`, `WHY_GREEN_IS_NOT_WORKING.md`.

Launch scripts at root to RELOCATE (only after the Step-1 reference check passes):
`launch-autobuild.sh`, `launch_ara_autorun.sh`, `launch_cleanup_autorun.sh`,
`launch_dashboard_autorun.sh`, `launch_ingest_autorun.sh`, `launch_integrations_autorun.sh`,
`launch_workspace_autorun.sh`, `autobuild-dwellium.sh`, `workspace_zen_gate_push.sh`.

KEEP at root (do NOT move): `README.md`, `README-INSTALL.md`, `CLAUDE.md`, `AGENTS.md`,
`BACKLOG.md`, `FUCKUPS.md`, `USER_GUIDE.md`, `Dwellium_Build_Runbook.md`, `install.sh`,
`AUDIT.md`, `netlify.toml`, `docker-compose.yml`, `.nvmrc`, `mcp_config.json`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Reference check (docs) | `grep -rn "WHY_GREEN_IS_NOT_WORKING\|MANUAL_DWELLIUM_GAP_ANALYSIS\|ASTRA_AUDIT\|THOUGHTWEAVER_STATUS\|LIVE_VERIFICATION_REPORT\|FIX_VERIFICATION\|HANDOFF_AURA_VISUALIZER\|SCRIBE_MANUAL_GAP_ANALYSIS\|DOCS_VS_SCRIBE_GAP\|Gap_Analysis_vs_3H\|AUTOBUILD_BACKLOG\|AUTOBUILD_PROMPT\|CLAUDE_CODE_GMAIL_CALENDAR_HANDOFF" CLAUDE.md AGENTS.md README.md Scripts .github 2>/dev/null` | note any hits |
| Reference check (scripts) | `grep -rn "launch_ara_autorun\|launch_dashboard_autorun\|launch_ingest_autorun\|launch_integrations_autorun\|launch_workspace_autorun\|launch_cleanup_autorun\|launch-autobuild\|autobuild-dwellium\|workspace_zen_gate_push" . --include=*.sh --include=*.md --include=*.json -l 2>/dev/null` | note any hits |
| Verify gate untouched | `bash Scripts/gate.sh` | GREEN |

## Scope

**In scope**: `git mv` of the listed root files into `Docs/archive/` (docs) and `Scripts/launch/` (scripts). Create those subdirs.

**Out of scope**:
- The KEEP list above.
- Any launch script referenced by a `~/Library/LaunchAgents/*.plist`, `install.sh`, `Scripts/gate.sh`, or `.github/**` — see STOP conditions.
- Do not edit the *contents* of any moved file (pure move).

## Git workflow

- Branch: `advisor/004-archive-root-clutter`
- Use `git mv` (preserves history). One commit: `chore(repo): archive stale root process docs + relocate launch scripts`.
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Reference check (MANDATORY, before any move)

Run both reference-check commands above, plus check for launchd references:
`grep -rn "Downloads/Dwellium" install.sh launch*.sh autobuild-dwellium.sh 2>/dev/null` and recall that launchd `.plist`s may live in `~/Library/LaunchAgents` (outside the repo, per `FUCKUPS.md` F-011/F-014).

- For any **doc** with references in `CLAUDE.md`/`AGENTS.md`/`README.md`: still move it, but in the SAME commit update the referencing link to the new `Docs/archive/` path.
- For any **launch script** that is referenced by `install.sh`, a plist, or another script: do NOT move it; leave it at root and note it in the PR. Only move scripts with zero references.

**Verify**: you have a concrete list of which scripts are safe to move (zero references) vs. which stay.

### Step 2: Move the docs

`mkdir -p Docs/archive` then `git mv <each doc> Docs/archive/`. Update any link found in Step 1.

**Verify**: `ls Docs/archive/ | wc -l` ≥ 13; `git status --short` shows renames (`R`).

### Step 3: Move the safe launch scripts

`mkdir -p Scripts/launch` then `git mv <safe scripts> Scripts/launch/`.

**Verify**: `ls Scripts/launch/`; the moved scripts are gone from root (`ls *.sh` at root no longer lists them).

### Step 4: Confirm nothing broke

**Verify (Mac)**: `bash Scripts/gate.sh` → GREEN (the gate references none of the moved files; if it does, you missed a reference in Step 1 — STOP).

## Test plan

No unit tests. Verification = reference checks clean + gate green.

## Done criteria

- [ ] Reference checks ran and informed which scripts moved vs stayed (recorded in PR)
- [ ] 13 process docs are under `Docs/archive/` (or fewer, if drift already moved some — note it)
- [ ] Zero-reference launch scripts moved to `Scripts/launch/`; referenced ones left at root and listed
- [ ] `bash Scripts/gate.sh` GREEN
- [ ] All changes are renames or link updates only — no file contents changed except link paths (`git diff` shows only path updates)
- [ ] `plans/README.md` row updated

## STOP conditions

- A launch script you were about to move is referenced by `install.sh`, `Scripts/gate.sh`, a `.plist`, or `.github/**` — leave it, report it; do NOT rewrite the referencing file's path to chase it (launchd plists live outside the repo and can't be safely edited here).
- `git mv` reports a file is untracked (not in git) — it's local cruft, not in scope for archiving; report and skip.
- The gate goes red after moving — a reference was missed; revert the moves and report.

## Maintenance notes

- Going forward, put one-shot session artifacts directly in `Docs/archive/`, not the root.
- Reviewer: confirm `CLAUDE.md`/`AGENTS.md` links still resolve, and that no launchd-driven autorun broke (the user can confirm `launchctl list` separately).
