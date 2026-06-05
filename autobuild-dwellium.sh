#!/usr/bin/env bash
# ============================================================================
# autobuild-dwellium.sh — run Claude Code UNATTENDED to build the Dwellium
# feature backlog, gated, with NO git push. Review the local commits, then
# push yourself.
#
# Setup (one time):
#   1. Put this file + AUTOBUILD_PROMPT.md in the repo root.
#   2. Put the 3 spec docs in ./specs/  (DWELLIUM_FEATURE_SPEC_v2.md,
#      "Combined HTML Report Design System.md", Dwellium_Features_and_Ideal_Dashboard.md)
#   3. chmod +x autobuild-dwellium.sh
#
# Run:   ./autobuild-dwellium.sh
# ============================================================================
set -euo pipefail

# --- config (override via env) ----------------------------------------------
REPO="${REPO:-$HOME/Downloads/Dwellium -Per Spec}"
PROMPT_FILE="${PROMPT_FILE:-$REPO/AUTOBUILD_PROMPT.md}"
MODEL="${MODEL:-opus}"
MAX_TURNS="${MAX_TURNS:-200}"
LOG="${LOG:-$REPO/autobuild-$(date +%Y%m%d-%H%M%S).log}"

# --- preflight ---------------------------------------------------------------
command -v claude >/dev/null 2>&1 || { echo "ERROR: 'claude' (Claude Code) not on PATH."; exit 1; }
[ -d "$REPO" ]            || { echo "ERROR: repo not found: $REPO"; exit 1; }
cd "$REPO"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: $REPO is not a git repo."; exit 1; }
[ -f "$PROMPT_FILE" ]     || { echo "ERROR: prompt file not found: $PROMPT_FILE"; exit 1; }
[ -d "$REPO/specs" ]      || echo "WARN: ./specs not found — the agent expects the spec docs there."

START_SHA="$(git rev-parse HEAD)"
START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "============================================================"
echo " Dwellium AUTOBUILD (unattended)"
echo " Repo:    $REPO"
echo " Branch:  $START_BRANCH   Start HEAD: ${START_SHA:0:10}"
echo " Model:   $MODEL   Max turns: $MAX_TURNS"
echo " Log:     $LOG"
echo " PUSH:    BLOCKED — commits stay local for review"
echo "============================================================"
echo

# --- run Claude Code headless / autonomous ----------------------------------
# -p                         : non-interactive (print) mode, exits when done
# --permission-mode acceptEdits : auto-approve file edits, no prompts
# --allowedTools "...,Bash"  : allow the tools it needs (incl. all Bash) unattended
# --disallowedTools "..."     : HARD blocks (deny wins over allow) — no push, no destructive ops
# --max-turns                : runaway guard
# --output-format stream-json --verbose : live, inspectable action stream
claude -p "$(cat "$PROMPT_FILE")" \
  --model "$MODEL" \
  --permission-mode acceptEdits \
  --allowedTools "Read,Write,Edit,Glob,Grep,TodoWrite,Bash" \
  --disallowedTools "Bash(git push*),Bash(git reset --hard*),Bash(git clean*),Bash(rm -rf*),Bash(git remote*)" \
  --max-turns "$MAX_TURNS" \
  --output-format stream-json --verbose \
  2>&1 | tee "$LOG"

# --- post-run summary (for your review before pushing) ----------------------
echo
echo "==================== AUTOBUILD FINISHED ===================="
echo "Local commits since start (UNPUSHED):"
git --no-pager log --oneline "${START_SHA}..HEAD" || true
echo
echo "Working-tree status:"
git status --short || true
echo
echo "Nothing was pushed. Review the commits + log ($LOG), then have it verified before push."
