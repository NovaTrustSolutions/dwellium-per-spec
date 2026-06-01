#!/usr/bin/env bash
###############################################################################
# launch_workspace_autorun.sh — 2-HOUR UNATTENDED Claude Code loop (workspace arc)
#
# Runs the feat/workspace-widget arc (Cycle 2 -> 3 -> 4 -> ...) CONTINUOUSLY,
# headless, with NO review stops between cycles, for up to ~2 hours. Keeps the
# Mac awake (caffeinate), commits each cycle (Claude does it), logs everything,
# and stops only on the time cap, a STOP/ALL_DONE sentinel, or the iteration cap.
#
# USAGE (run in YOUR terminal — needs git creds + the build toolchain):
#   chmod +x launch_workspace_autorun.sh
#   ./launch_workspace_autorun.sh
#   MAX_HOURS=2 ./launch_workspace_autorun.sh        # default is 2
#   ./launch_workspace_autorun.sh --print            # write prompt + show cmd, run nothing
#
# To stop early from another terminal:  touch "<repo>/Scripts/autorun/STOP"
###############################################################################
set -uo pipefail   # NOT 'set -e' — a single bad iteration must not kill a 2h run.

# ----------------------------- CONFIG ---------------------------------------
PROJECT_DIR="${PROJECT_DIR:-/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec}"
PROMPT_SRC="${PROMPT_SRC:-}"   # optional: path to WORKSPACE_AUTORUN_PROMPT.md to copy in
PROMPT_FILE="${PROMPT_FILE:-$PROJECT_DIR/Scripts/autorun/WORKSPACE_AUTORUN_PROMPT.md}"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/Scripts/autorun/logs}"
STATUS_FILE="$LOG_DIR/AUTORUN_STATUS.md"
STOP_SENTINEL="$PROJECT_DIR/Scripts/autorun/STOP"
DONE_SENTINEL="$PROJECT_DIR/Scripts/autorun/ALL_DONE"

MAX_HOURS="${MAX_HOURS:-4}"                 # wall-clock cap (your 4h ask)
MAX_ITERS="${MAX_ITERS:-60}"               # safety iteration cap
COOLDOWN_SECS="${COOLDOWN_SECS:-10}"       # pause between cycles
PER_ITER_TIMEOUT="${PER_ITER_TIMEOUT:-1800}"  # kill a single hung cycle after 30 min

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
# Headless + no permission prompts = truly unattended. Safe here: the loop only
# touches the workspace branch + Scripts/autorun/**, never pushes, and Claude
# commits every cycle so anything can be rolled back.
CLAUDE_FLAGS="${CLAUDE_FLAGS:---dangerously-skip-permissions}"

PRINT_ONLY=0
[[ "${1:-}" == "--print" ]] && PRINT_ONLY=1

# ----------------------------- HELPERS --------------------------------------
# Set early so the EXIT trap can reference them even on an early exit (e.g. --print).
START_TS="$(date +%s)"
ITER=0

ts()  { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_DIR/autorun_runner.log"; }

write_status() {
  {
    echo "# Workspace autorun status"
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
trap 'log "SIGINT/SIGTERM — will stop after current cycle."; touch "$STOP_SENTINEL"' INT TERM

# ----------------------------- WRITE PROMPT (if provided) -------------------
mkdir -p "$(dirname "$PROMPT_FILE")" "$LOG_DIR"
if [[ -n "$PROMPT_SRC" && -f "$PROMPT_SRC" ]]; then
  cp "$PROMPT_SRC" "$PROMPT_FILE"
  log "Copied prompt from $PROMPT_SRC -> $PROMPT_FILE"
fi

# ----------------------------- PREFLIGHT ------------------------------------
log "=== Workspace autorun starting (MAX_HOURS=$MAX_HOURS, MAX_ITERS=$MAX_ITERS) ==="
log "PROJECT_DIR=$PROJECT_DIR"
log "PROMPT_FILE=$PROMPT_FILE"

if [[ "$PRINT_ONLY" == "1" ]]; then
  echo "--print: would run, per iteration (inside repo):"
  echo "  cat \"$PROMPT_FILE\" | $CLAUDE_BIN -p $CLAUDE_FLAGS"
  echo "  wrapped in: caffeinate -dimsu, time-capped at ${MAX_HOURS}h"
  exit 0
fi

[[ -d "$PROJECT_DIR" ]] || { log "FATAL: project dir not found: $PROJECT_DIR"; exit 1; }
command -v "$CLAUDE_BIN" >/dev/null 2>&1 || { log "FATAL: '$CLAUDE_BIN' not on PATH."; exit 1; }
git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { log "FATAL: not a git repo."; exit 1; }
[[ -f "$PROMPT_FILE" ]] || { log "FATAL: prompt file missing: $PROMPT_FILE (pass PROMPT_SRC=... to install it)"; exit 1; }

# Confirm we're on the workspace branch (warn, don't hard-fail — Claude re-checks too).
CUR_BRANCH="$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
[[ "$CUR_BRANCH" == "feat/workspace-widget" ]] || log "WARN: current branch is '$CUR_BRANCH', not feat/workspace-widget. The prompt will checkout the right branch on iteration 1."

# Clear stale sentinels from a prior run.
rm -f "$STOP_SENTINEL" "$DONE_SENTINEL" 2>/dev/null || true

# Pick a timeout binary (coreutils 'timeout', or 'gtimeout' from brew).
TIMEOUT_BIN=""
command -v timeout  >/dev/null 2>&1 && TIMEOUT_BIN="timeout"
command -v gtimeout >/dev/null 2>&1 && TIMEOUT_BIN="gtimeout"
[[ -z "$TIMEOUT_BIN" ]] && log "WARN: no timeout/gtimeout — per-cycle timeout disabled (brew install coreutils)."

# Keep the Mac awake for the whole run. If caffeinate exists, re-exec under it ONCE.
if [[ -z "${_UNDER_CAFFEINATE:-}" ]] && command -v caffeinate >/dev/null 2>&1; then
  log "Re-exec under caffeinate (prevents sleep for the run)."
  export _UNDER_CAFFEINATE=1
  exec caffeinate -dimsu "$0" "$@"
fi
[[ -z "${_UNDER_CAFFEINATE:-}" ]] && log "WARN: caffeinate not found — Mac may sleep. Keep the lid OPEN and plugged in."

# START_TS + ITER already initialized near the top (for the EXIT trap). Reset the
# clock here so the cap measures from the real loop start (post-caffeinate re-exec).
START_TS=$(date +%s)
DEADLINE_TS=$(( START_TS + MAX_HOURS*3600 ))

# ----------------------------- MAIN LOOP ------------------------------------
while true; do
  NOW=$(date +%s)
  if [[ -f "$STOP_SENTINEL" ]]; then log "STOP sentinel — halting."; write_status STOPPED "stop sentinel"; break; fi
  if [[ -f "$DONE_SENTINEL" ]]; then log "ALL_DONE sentinel — arc complete. Halting."; write_status DONE "all_done"; break; fi
  if (( NOW >= DEADLINE_TS )); then log "Time cap (${MAX_HOURS}h) reached — halting."; write_status STOPPED "time cap"; break; fi
  if (( ITER >= MAX_ITERS )); then log "Iteration cap ($MAX_ITERS) — halting."; write_status STOPPED "iter cap"; break; fi

  ITER=$((ITER+1))
  ITER_LOG="$LOG_DIR/autorun_iter_$(printf '%03d' "$ITER")_$(date +%H%M%S).log"
  log "----- Cycle iteration $ITER / $MAX_ITERS  (log: $ITER_LOG) -----"
  write_status RUNNING "iteration $ITER in progress"

  RUN_CMD=( "$CLAUDE_BIN" -p $CLAUDE_FLAGS )
  [[ -n "$TIMEOUT_BIN" ]] && RUN_CMD=( "$TIMEOUT_BIN" --signal=TERM "${PER_ITER_TIMEOUT}s" "${RUN_CMD[@]}" )

  set +o pipefail
  ( cd "$PROJECT_DIR" && cat "$PROMPT_FILE" | "${RUN_CMD[@]}" ) >>"$ITER_LOG" 2>&1
  RC=$?
  set -o pipefail

  if   (( RC == 124 )); then log "Iteration $ITER TIMED OUT (${PER_ITER_TIMEOUT}s). Continuing."
  elif (( RC != 0   )); then log "Iteration $ITER rc=$RC (see $ITER_LOG). Continuing."
  else                       log "Iteration $ITER ok (rc=0)."
  fi

  # Claude commits its own work; this is a SAFETY NET for anything it staged but
  # didn't commit. Never touches HALT (it's untracked and we don't add it here
  # because we only commit already-tracked modifications + staged files).
  if [[ -n "$(git -C "$PROJECT_DIR" status --porcelain --untracked-files=no)" ]]; then
    git -C "$PROJECT_DIR" commit -q -am "autorun(safety-net): uncommitted changes from iteration $ITER ($(ts))" \
      && log "Safety-net committed leftover tracked changes from iteration $ITER." \
      || log "Safety-net commit: nothing to do / failed (ok)."
  fi

  write_status RUNNING "iteration $ITER done (rc=$RC)"
  sleep "$COOLDOWN_SECS"
done

log "=== Autorun finished after $ITER iteration(s), $(( ($(date +%s)-START_TS)/60 )) min ==="
write_status FINISHED "loop exited after $ITER iterations"
echo
echo "Review with:  git -C \"$PROJECT_DIR\" log --oneline -20"
echo "When satisfied, push (main first):"
echo "  git -C \"$PROJECT_DIR\" push origin main"
echo "  git -C \"$PROJECT_DIR\" push -u origin feat/workspace-widget"
