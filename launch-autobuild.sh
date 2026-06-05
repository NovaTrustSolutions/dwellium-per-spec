#!/usr/bin/env bash
# ============================================================================
# launch-autobuild.sh — open a NEW Terminal tab and start the unattended
# Dwellium autonomous build (autobuild-dwellium.sh) in it.
#
# Run:  ./launch-autobuild.sh
# ============================================================================
set -euo pipefail

REPO="${REPO:-$HOME/Downloads/Dwellium -Per Spec}"
RUNNER="${RUNNER:-$REPO/autobuild-dwellium.sh}"

[ -f "$RUNNER" ] || { echo "ERROR: runner not found: $RUNNER"; exit 1; }
chmod +x "$RUNNER" 2>/dev/null || true

# Command the new tab will execute (single-quoted paths are safe; they contain
# spaces but no single quotes).
CMD="cd '$REPO' && bash '$RUNNER'"

# --- Terminal.app: open a NEW TAB and run the build in it -------------------
# (System Events keystroke needs Accessibility permission for Terminal the
#  first time: System Settings → Privacy & Security → Accessibility → enable
#  Terminal. If the tab doesn't open, use the NEW-WINDOW fallback below.)
osascript <<OSA
tell application "Terminal"
    activate
    tell application "System Events" to keystroke "t" using {command down}
    delay 0.4
    do script "$CMD" in front window
end tell
OSA

echo "Launched autonomous build in a new Terminal tab."
echo "It will NOT push — review the commits there, then come back to verify."

# ---------------------------------------------------------------------------
# NEW-WINDOW fallback (no Accessibility permission needed) — uncomment if the
# tab approach doesn't trigger:
#
#   osascript -e "tell application \"Terminal\" to do script \"$CMD\""
#
# iTerm2 variant:
#   osascript <<'OSA'
#   tell application "iTerm"
#     activate
#     tell current window to create tab with default profile
#     tell current session of current window to write text "cd '$REPO' && bash '$RUNNER'"
#   end tell
#   OSA
# ---------------------------------------------------------------------------
