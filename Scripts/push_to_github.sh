#!/usr/bin/env bash
# [CT-3H-HANDOFF-M4Q7] push_to_github.sh
# Pushes F-1 Universal Shell + all WIP to feat/f1-universal-shell-and-wip
#
# Usage: from anywhere, run
#   bash "<path to Dwellium -Per Spec>/Scripts/push_to_github.sh"
#
# The script resolves qualia-shell and commit_msg.txt relative to its OWN location,
# so it works wherever the Dwellium folder lives.

set -euo pipefail

# Resolve the directory this script lives in (portable on macOS/Linux)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DWELLIUM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_PATH="$DWELLIUM_ROOT/qualia-shell"
COMMIT_MSG="$DWELLIUM_ROOT/Docs/commit_msg.txt"
BRANCH="feat/f1-universal-shell-and-wip"

echo "==> Dwellium root: $DWELLIUM_ROOT"
echo "==> Repo:          $REPO_PATH"
echo "==> Commit msg:    $COMMIT_MSG"

cd "$REPO_PATH" || { echo "ERROR: repo not found at $REPO_PATH"; exit 1; }

# Sanity check — confirm we're in qualia-shell
if ! grep -q '"name": "qualia-shell"' package.json 2>/dev/null; then
    echo "ERROR: this does not look like the qualia-shell repo (package.json missing or wrong name)"
    exit 1
fi

echo "==> Clearing stale index.lock (if any)"
rm -f .git/index.lock

echo "==> Current branch before switch:"
git branch --show-current

echo "==> Creating/switching to feature branch: $BRANCH"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
else
    git checkout -b "$BRANCH"
fi

echo "==> Staging all changes"
git add -A

echo "==> Staged file count:"
git diff --cached --name-only | wc -l

echo "==> Checking for junk in staged set"
if git diff --cached --name-only | grep -E '(node_modules_broken|node_modules_quarantined|\.tmp/|\.bak$|\.DS_Store)' ; then
    echo "WARNING: junk files staged. Aborting. Tighten .gitignore and re-run."
    exit 1
fi
echo "  (clean — no junk staged)"

echo "==> Creating commit"
git commit -F "$COMMIT_MSG"

echo "==> Commit created:"
git log --oneline -1

echo "==> Pushing to origin"
git push -u origin "$BRANCH"

echo ""
echo "=========================================="
echo "  DONE — branch pushed to GitHub"
echo "=========================================="
echo ""
echo "Open a PR at:"
echo "  https://github.com/NovaTrustSolutions/qualia-shell/pull/new/$BRANCH"
echo ""
# [CT-3H-HANDOFF-M4Q7]
