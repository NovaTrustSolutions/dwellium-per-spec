#!/usr/bin/env bash
###############################################################################
# launch_dashboard_autorun.sh — 2-HOUR UNATTENDED Claude Code loop
#                         (PM-Exec Dashboard arc)
#
# Same proven design as launch_workspace_autorun.sh, with two fixes:
#   (1) per-iteration output is captured to the iter log via tee (the workspace
#       run's iter logs came out empty — `claude -p` output now lands in the file)
#   (2) the ALL_DONE sentinel is re-checked IMMEDIATELY after each iteration, so
#       the loop can't start one stray extra cycle after the arc reports done.
#
# USAGE (in YOUR terminal — needs git creds + build toolchain):
#   chmod +x launch_dashboard_autorun.sh
#   ./launch_dashboard_autorun.sh
#   MAX_HOURS=2 ./launch_dashboard_autorun.sh
#   ./launch_dashboard_autorun.sh --print      # write prompt + show cmd, run nothing
#
# Stop early:  touch "<repo>/Scripts/autorun/STOP"
###############################################################################
set -uo pipefail

# ----------------------------- CONFIG ---------------------------------------
PROJECT_DIR="${PROJECT_DIR:-/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec}"
PROMPT_SRC="${PROMPT_SRC:-}"
PROMPT_FILE="${PROMPT_FILE:-$PROJECT_DIR/Scripts/autorun/DASHBOARD_AUTORUN_PROMPT.md}"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/Scripts/autorun/logs}"
STATUS_FILE="$LOG_DIR/DASH_AUTORUN_STATUS.md"
STOP_SENTINEL="$PROJECT_DIR/Scripts/autorun/STOP"
DONE_SENTINEL="$PROJECT_DIR/Scripts/autorun/ALL_DONE"

MAX_HOURS="${MAX_HOURS:-4}"
MAX_ITERS="${MAX_ITERS:-60}"
COOLDOWN_SECS="${COOLDOWN_SECS:-10}"
PER_ITER_TIMEOUT="${PER_ITER_TIMEOUT:-1800}"

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---dangerously-skip-permissions}"

PRINT_ONLY=0
[[ "${1:-}" == "--print" ]] && PRINT_ONLY=1

# Set early so the EXIT trap can reference them even on an early exit.
START_TS="$(date +%s)"
ITER=0

# ----------------------------- HELPERS --------------------------------------
ts()  { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_DIR/dash_autorun_runner.log"; }

write_status() {
  {
    echo "# PM-Exec Dashboard autorun status"
    echo
    echo "- **State:** ${1:-?}"
    echo "- **Note:** ${2:-}"
    echo "- **Iteration:** ${ITER:-0} / $MAX_ITERS"
    echo "- **Elapsed:** $(( ($(date +%s) - START_TS) / 60 )) min / $((MAX_HOURS*60)) min"
    echo "- **Updated:** $(ts)"
    echo
    echo "Stop early: \`touch $STOP_SENTINEL\`"
    echo
    echo "## Recent commits"; echo '```'
    git -C "$PROJECT_DIR" log --oneline -15 2>/dev/null || echo "(no git)"
    echo '```'
  } > "$STATUS_FILE"
}

cleanup() { log "Runner exiting."; write_status "STOPPED" "runner exited"; }
trap cleanup EXIT
trap 'log "SIGINT/SIGTERM — stopping after current cycle."; touch "$STOP_SENTINEL"' INT TERM

# ----------------------------- WRITE PROMPT (if provided) -------------------
mkdir -p "$(dirname "$PROMPT_FILE")" "$LOG_DIR"
if [[ -n "$PROMPT_SRC" && -f "$PROMPT_SRC" ]]; then
  cp "$PROMPT_SRC" "$PROMPT_FILE"; log "Copied prompt $PROMPT_SRC -> $PROMPT_FILE"
fi

# ----------------------------- PREFLIGHT ------------------------------------
log "=== PM-Exec Dashboard autorun starting (MAX_HOURS=$MAX_HOURS, MAX_ITERS=$MAX_ITERS) ==="
log "PROJECT_DIR=$PROJECT_DIR"; log "PROMPT_FILE=$PROMPT_FILE"

if [[ "$PRINT_ONLY" == "1" ]]; then
  echo "--print: per iteration would run (inside repo):"
  echo "  cat \"$PROMPT_FILE\" | $CLAUDE_BIN -p $CLAUDE_FLAGS  (tee'd to iter log)"
  echo "  wrapped in caffeinate -dimsu, time-capped at ${MAX_HOURS}h"
  exit 0
fi

[[ -d "$PROJECT_DIR" ]] || { log "FATAL: project dir not found: $PROJECT_DIR"; exit 1; }
command -v "$CLAUDE_BIN" >/dev/null 2>&1 || { log "FATAL: '$CLAUDE_BIN' not on PATH."; exit 1; }
git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { log "FATAL: not a git repo."; exit 1; }
[[ -f "$PROMPT_FILE" ]] || { log "FATAL: prompt missing: $PROMPT_FILE (pass PROMPT_SRC=... to install it)"; exit 1; }

CUR_BRANCH="$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
log "Current branch: $CUR_BRANCH (the prompt creates/checks out feat/pm-exec-dashboard on iteration 1)."

# Clear stale sentinels from a PRIOR arc so this run isn't instantly 'done'.
# (The workspace arc left ALL_DONE behind — remove it so this loop actually runs.)
if [[ -f "$DONE_SENTINEL" ]]; then
  log "Removing stale ALL_DONE from a prior arc so this run can start."
  rm -f "$DONE_SENTINEL" 2>/dev/null || log "WARN: couldn't remove stale ALL_DONE — remove it manually."
fi
rm -f "$STOP_SENTINEL" 2>/dev/null || true

TIMEOUT_BIN=""
command -v timeout  >/dev/null 2>&1 && TIMEOUT_BIN="timeout"
command -v gtimeout >/dev/null 2>&1 && TIMEOUT_BIN="gtimeout"
[[ -z "$TIMEOUT_BIN" ]] && log "WARN: no timeout/gtimeout — per-cycle timeout disabled (brew install coreutils)."

# Keep the Mac awake; re-exec under caffeinate once.
if [[ -z "${_UNDER_CAFFEINATE:-}" ]] && command -v caffeinate >/dev/null 2>&1; then
  log "Re-exec under caffeinate (prevents sleep)."; export _UNDER_CAFFEINATE=1
  exec caffeinate -dimsu "$0" "$@"
fi
[[ -z "${_UNDER_CAFFEINATE:-}" ]] && log "WARN: caffeinate not found — keep the lid OPEN + plugged in."

# Reset clock at real loop start (post re-exec).
START_TS=$(date +%s)
DEADLINE_TS=$(( START_TS + MAX_HOURS*3600 ))

# ----------------------------- MAIN LOOP ------------------------------------
while true; do
  NOW=$(date +%s)
  if [[ -f "$STOP_SENTINEL" ]]; then log "STOP sentinel — halting."; write_status STOPPED "stop sentinel"; break; fi
  if [[ -f "$DONE_SENTINEL" ]]; then log "ALL_DONE — arc complete. Halting."; write_status DONE "all_done"; break; fi
  if (( NOW >= DEADLINE_TS )); then log "Time cap (${MAX_HOURS}h) — halting."; write_status STOPPED "time cap"; break; fi
  if (( ITER >= MAX_ITERS )); then log "Iteration cap ($MAX_ITERS) — halting."; write_status STOPPED "iter cap"; break; fi

  ITER=$((ITER+1))
  ITER_LOG="$LOG_DIR/dash_iter_$(printf '%03d' "$ITER")_$(date +%H%M%S).log"
  log "----- Cycle iteration $ITER / $MAX_ITERS  (log: $ITER_LOG) -----"
  write_status RUNNING "iteration $ITER in progress"

  RUN_CMD=( "$CLAUDE_BIN" -p $CLAUDE_FLAGS )
  [[ -n "$TIMEOUT_BIN" ]] && RUN_CMD=( "$TIMEOUT_BIN" --signal=TERM "${PER_ITER_TIMEOUT}s" "${RUN_CMD[@]}" )

  # FIX (1): tee so the iteration transcript is actually captured (workspace run's
  # iter logs were empty). PIPESTATUS[0] gives claude's real exit code despite the tee.
  set +o pipefail
  ( cd "$PROJECT_DIR" && cat "$PROMPT_FILE" | "${RUN_CMD[@]}" ) 2>&1 | tee "$ITER_LOG"
  RC="${PIPESTATUS[0]}"
  set -o pipefail

  if   (( RC == 124 )); then log "Iteration $ITER TIMED OUT (${PER_ITER_TIMEOUT}s). Continuing."
  elif (( RC != 0   )); then log "Iteration $ITER rc=$RC (see $ITER_LOG). Continuing."
  else                       log "Iteration $ITER ok (rc=0)."
  fi

  # Safety net: commit anything Claude staged but didn't commit (tracked only).
  if [[ -n "$(git -C "$PROJECT_DIR" status --porcelain --untracked-files=no)" ]]; then
    git -C "$PROJECT_DIR" commit -q -am "autorun(safety-net): leftover changes from iteration $ITER ($(ts))" \
      && log "Safety-net committed leftover tracked changes from iteration $ITER." \
      || log "Safety-net commit: nothing to do / failed (ok)."
  fi

  # FIX (2): re-check ALL_DONE/STOP RIGHT HERE so a finished arc can't trigger one
  # more iteration before the top-of-loop check.
  if [[ -f "$DONE_SENTINEL" ]]; then log "ALL_DONE detected post-iteration — arc complete. Halting."; write_status DONE "all_done"; break; fi
  if [[ -f "$STOP_SENTINEL" ]]; then log "STOP detected post-iteration — halting."; write_status STOPPED "stop sentinel"; break; fi

  write_status RUNNING "iteration $ITER done (rc=$RC)"
  sleep "$COOLDOWN_SECS"
done

log "=== Autorun finished after $ITER iteration(s), $(( ($(date +%s)-START_TS)/60 )) min ==="
write_status FINISHED "loop exited after $ITER iterations"
echo
echo "Review:  git -C \"$PROJECT_DIR\" log --oneline -25"
echo "         cat \"$PROJECT_DIR/Scripts/autorun/DASH_PROGRESS.md\""
echo "         cat \"$PROJECT_DIR/Scripts/autorun/DASH_PLAN.md\""
echo "Push when satisfied (main first):"
echo "  git -C \"$PROJECT_DIR\" push origin main"
echo "  git -C \"$PROJECT_DIR\" push -u origin feat/pm-exec-dashboard"
