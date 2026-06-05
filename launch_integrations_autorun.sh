#!/usr/bin/env bash
###############################################################################
# launch_cleanup_autorun.sh — 2-HOUR UNATTENDED Claude Code loop
#   Test + clean up all features (runtime-verified) + dashboard UI polish.
#
# Runs `claude -p` headless in a loop for ~2h, NO input needed. Each iteration
# feeds the driver prompt, which RUNS the app and verifies features actually
# work (not just compile), fixes what's broken, commits with proof.
#
# USAGE (in your terminal, at the repo root):
#   chmod +x launch_cleanup_autorun.sh
#   ./launch_cleanup_autorun.sh
#   MAX_HOURS=2 ./launch_cleanup_autorun.sh        # default 2
#   ./launch_cleanup_autorun.sh --print            # show what it would run, do nothing
#
# Stop early from another terminal:  touch "Scripts/autorun/STOP"
###############################################################################
set -uo pipefail

PROJECT_DIR="${PROJECT_DIR:-/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec}"
PROMPT_FILE="${PROMPT_FILE:-$PROJECT_DIR/Scripts/autorun/INTEGRATIONS_HEALTH_AUTORUN_PROMPT.md}"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/Scripts/autorun/logs}"
STATUS_FILE="$LOG_DIR/INTG_AUTORUN_STATUS.md"
STOP_SENTINEL="$PROJECT_DIR/Scripts/autorun/STOP"
DONE_SENTINEL="$PROJECT_DIR/Scripts/autorun/ALL_DONE"

MAX_HOURS="${MAX_HOURS:-4}"
MAX_ITERS="${MAX_ITERS:-60}"
COOLDOWN_SECS="${COOLDOWN_SECS:-10}"
PER_ITER_TIMEOUT="${PER_ITER_TIMEOUT:-2400}"   # 40 min/iter cap (runtime tests are slow)

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
# --dangerously-skip-permissions = truly unattended (no permission prompts).
CLAUDE_FLAGS="${CLAUDE_FLAGS:---dangerously-skip-permissions}"

PRINT_ONLY=0; [[ "${1:-}" == "--print" ]] && PRINT_ONLY=1
START_TS="$(date +%s)"; ITER=0

ts(){ date '+%Y-%m-%d %H:%M:%S'; }
log(){ echo "[$(ts)] $*" | tee -a "$LOG_DIR/intg_runner.log"; }
write_status(){
  { echo "# Integrations+Health autorun status"; echo
    echo "- State: ${1:-?}"; echo "- Note: ${2:-}"
    echo "- Iteration: ${ITER:-0} / $MAX_ITERS"
    echo "- Elapsed: $(( ($(date +%s) - START_TS) / 60 )) min / $((MAX_HOURS*60)) min"
    echo "- Updated: $(ts)"; echo; echo "Stop: touch $STOP_SENTINEL"; echo
    echo '```'; git -C "$PROJECT_DIR" log --oneline -12 2>/dev/null || echo "(no git)"; echo '```'
  } > "$STATUS_FILE"; }
cleanup(){ log "Runner exiting."; write_status STOPPED "runner exited"; }
trap cleanup EXIT
trap 'log "signal — stop after this cycle"; touch "$STOP_SENTINEL"' INT TERM

mkdir -p "$(dirname "$PROMPT_FILE")" "$LOG_DIR"
log "=== Integrations+Health autorun starting (MAX_HOURS=$MAX_HOURS) ==="
log "PROJECT_DIR=$PROJECT_DIR"; log "PROMPT_FILE=$PROMPT_FILE"

if [[ "$PRINT_ONLY" == "1" ]]; then
  echo "--print: per iteration would run (in repo):"
  echo "  cat \"$PROMPT_FILE\" | $CLAUDE_BIN -p $CLAUDE_FLAGS  (tee'd to a per-iter log)"
  echo "  wrapped in caffeinate -dimsu, capped at ${MAX_HOURS}h"; exit 0
fi

[[ -d "$PROJECT_DIR" ]] || { log "FATAL: project dir not found"; exit 1; }
command -v "$CLAUDE_BIN" >/dev/null 2>&1 || { log "FATAL: '$CLAUDE_BIN' not on PATH"; exit 1; }
git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { log "FATAL: not a git repo"; exit 1; }
[[ -f "$PROMPT_FILE" ]] || { log "FATAL: prompt missing: $PROMPT_FILE"; exit 1; }
log "Branch: $(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)"

# clear stale sentinels from a prior run
[[ -f "$DONE_SENTINEL" ]] && { log "clearing stale ALL_DONE"; rm -f "$DONE_SENTINEL" 2>/dev/null || true; }
rm -f "$STOP_SENTINEL" 2>/dev/null || true

TIMEOUT_BIN=""; command -v timeout >/dev/null 2>&1 && TIMEOUT_BIN="timeout"; command -v gtimeout >/dev/null 2>&1 && TIMEOUT_BIN="gtimeout"
[[ -z "$TIMEOUT_BIN" ]] && log "WARN: no timeout/gtimeout (brew install coreutils) — per-iter cap off"

# keep the Mac awake for the whole run
if [[ -z "${_UNDER_CAFFEINATE:-}" ]] && command -v caffeinate >/dev/null 2>&1; then
  log "re-exec under caffeinate (no sleep)"; export _UNDER_CAFFEINATE=1; exec caffeinate -dimsu "$0" "$@"
fi
[[ -z "${_UNDER_CAFFEINATE:-}" ]] && log "WARN: no caffeinate — keep lid OPEN + plugged in"

START_TS=$(date +%s); DEADLINE_TS=$(( START_TS + MAX_HOURS*3600 ))

while true; do
  NOW=$(date +%s)
  [[ -f "$STOP_SENTINEL" ]] && { log "STOP — halting"; write_status STOPPED "stop sentinel"; break; }
  [[ -f "$DONE_SENTINEL" ]] && { log "ALL_DONE — halting"; write_status DONE "all_done"; break; }
  (( NOW >= DEADLINE_TS )) && { log "time cap — halting"; write_status STOPPED "time cap"; break; }
  (( ITER >= MAX_ITERS )) && { log "iter cap — halting"; write_status STOPPED "iter cap"; break; }

  ITER=$((ITER+1))
  ITER_LOG="$LOG_DIR/intg_iter_$(printf '%03d' "$ITER")_$(date +%H%M%S).log"
  log "----- iteration $ITER / $MAX_ITERS (log: $ITER_LOG) -----"
  write_status RUNNING "iteration $ITER"

  RUN_CMD=( "$CLAUDE_BIN" -p $CLAUDE_FLAGS )
  [[ -n "$TIMEOUT_BIN" ]] && RUN_CMD=( "$TIMEOUT_BIN" --signal=TERM "${PER_ITER_TIMEOUT}s" "${RUN_CMD[@]}" )

  set +o pipefail
  ( cd "$PROJECT_DIR" && cat "$PROMPT_FILE" | "${RUN_CMD[@]}" ) 2>&1 | tee "$ITER_LOG"
  RC="${PIPESTATUS[0]}"
  set -o pipefail
  (( RC==124 )) && log "iter $ITER TIMED OUT" || { (( RC!=0 )) && log "iter $ITER rc=$RC" || log "iter $ITER ok"; }

  # safety-net commit of any tracked leftovers Claude staged but didn't commit
  if [[ -n "$(git -C "$PROJECT_DIR" status --porcelain --untracked-files=no)" ]]; then
    git -C "$PROJECT_DIR" commit -q -am "autorun(intg safety-net): iteration $ITER ($(ts))" \
      && log "safety-net committed iter $ITER" || log "safety-net: nothing/failed"
  fi

  [[ -f "$DONE_SENTINEL" ]] && { log "ALL_DONE post-iter — halting"; write_status DONE all_done; break; }
  [[ -f "$STOP_SENTINEL" ]] && { log "STOP post-iter — halting"; write_status STOPPED stop; break; }
  write_status RUNNING "iter $ITER done (rc=$RC)"; sleep "$COOLDOWN_SECS"
done

log "=== finished after $ITER iteration(s), $(( ($(date +%s)-START_TS)/60 )) min ==="
write_status FINISHED "loop exited after $ITER iterations"
echo; echo "Review:  git -C \"$PROJECT_DIR\" log --oneline -25"
echo "         cat \"$PROJECT_DIR/Scripts/autorun/INTEGRATIONS_INVENTORY.md\""
echo "         cat \"$PROJECT_DIR/Scripts/autorun/INTG_DECISIONS.md\""
echo "         open \"$PROJECT_DIR/Scripts/autorun/intg-shots/\""
