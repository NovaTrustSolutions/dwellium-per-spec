# feat/scribe-widget — PUSH + PR WALKTHROUGH
**Generated:** 2026-05-27 after Cycle 12 closed at `009d12c`
**Status:** Branch is PR-READY. NOT a porting cycle — this is the manual push + PR step.

---

## What just happened

You completed all 12 cycles of the Scribe widget port:
- 23 new Scribe files / 3,718 LOC
- 8 backend routes via `Docs/backend-A-routes.patch`
- Bundle: ~650 KB lazy-loaded (CodeMirror + Scribe component)
- Zero test regressions across 12 commits
- Closure report at `Docs/feat-scribe-widget-closure.md`

---

## Option A — Push + open PR via Claude Code

Paste this into Claude Code (ilyaklipinitser) when you're ready:

```
Push feat/scribe-widget to origin + open PR feat/scribe-widget → main on NovaTrustSolutions/dwellium-per-spec.

🧪 token in your response per my global CLAUDE.md rules.

Execute:

1. Confirm we're on the right branch:
   cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"
   git branch --show-current  → feat/scribe-widget
   git rev-parse --short HEAD  → 009d12c (Cycle 12 closure commit)
   git log --oneline main..feat/scribe-widget | wc -l  → 12

2. Final defensive strict gate (one more time before push):
   cd qualia-shell
   npx tsc -b
   npx vitest run 2>&1 | grep "Tests"
   npx react-router build 2>&1 | tail -2
   VITE_APPFOLIO_SEEDS=false npx react-router build 2>&1 | tail -2
   cd ..
   node Scripts/verify_no_pii_leak.mjs 2>&1 | tail -1
   lsof -ti :3000 2>/dev/null | xargs kill 2>/dev/null ; SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs 2>&1 | tail -1
   If anything fails, STOP — do not push on a red gate.

3. Push the branch:
   git push -u origin feat/scribe-widget
   Confirm the push output shows feat/scribe-widget → feat/scribe-widget on remote.

4. Open the PR via gh CLI:
   gh pr create \
     -R NovaTrustSolutions/dwellium-per-spec \
     --base main \
     --head feat/scribe-widget \
     --title "feat: Scribe markdown editor widget — CodeMirror 6 + AI redlines + comments + versioning + minimap (port from Agenteryx/Holocron)" \
     --body-file Docs/feat-scribe-widget-closure.md
   
   The --body-file uses the closure report as the PR body — gives reviewers (you, in this case) the full feature map + decision log + acceptance checklist in one place.

5. Print the PR URL + verify:
   gh pr view --repo NovaTrustSolutions/dwellium-per-spec feat/scribe-widget --json number,url,state,headRefName,baseRefName -q '"PR #\(.number) (\(.state)): \(.headRefName) → \(.baseRefName)\n\(.url)"'

6. STOP. Report PR URL + number.

Rules:
- 🧪 in every response
- NO new code changes
- If anything fails, paste the error and STOP — don't try to recover via merging into a dirty state
```

---

## Option B — Push only, open PR via GitHub UI yourself

If you'd rather open the PR via the GitHub web UI (lets you see file diffs visually before clicking Merge):

```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" && \
git push -u origin feat/scribe-widget && \
echo "" && \
echo "Open: https://github.com/NovaTrustSolutions/dwellium-per-spec/compare/main...feat/scribe-widget"
```

That URL takes you straight to the compare view. Click "Create pull request", paste the contents of `Docs/feat-scribe-widget-closure.md` as the body, set title to `feat: Scribe markdown editor widget — CodeMirror 6 + AI redlines + comments + versioning + minimap`.

---

## Before you merge — manual acceptance walk

After PR is open, walk through the 11-item acceptance checklist in `Docs/feat-scribe-widget-closure.md`. Top 3 to verify FIRST (gates the rest):

1. **Scribe widget opens** from Filing Cabinet sidebar — confirms scaffold + registration + lazy loading
2. **AI redlines work end-to-end** — configure OpenAI in Settings → API Keys → select text in Scribe → press Cmd+L → redlines appear with Accept/Reject
3. **Comments persist across reload** — add a comment, hard-refresh (Cmd+Shift+R), reopen file → amber underline + 💬 indicator should be back

If those 3 pass, the rest are mechanical confirmation. If any of those 3 fail, paste the failure and don't merge.

---

## After merge

Cowork autorun's next scheduled fire will:
1. Detect main HEAD changed (no longer at `7f3b548`)
2. Detect feat/scribe-widget either merged or has nothing new
3. Recognize Scribe arc COMPLETE
4. Generate the first prompt for **feat/file-explorer-enhanced** — the 2nd of the 4 feature branches per the original plan
   (Holocron's dual-mode file explorer with drag-to-agent, screenshot paste, hierarchy lock)

If you want a pause between branches to review what landed before kicking off ~12 more cycles, run this BEFORE pushing/merging:

```bash
touch "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/Scripts/autorun/HALT"
```

The next scheduled autorun will see HALT + skip prompt generation. Remove with `rm Scripts/autorun/HALT` when you're ready to continue.

---

## What Cowork autorun will do next

When the 2-hour scheduled cycle fires (after merge):
1. Read this STATUS.md
2. Detect main HEAD has advanced past `7f3b548`
3. Mark Scribe arc COMPLETE in STATUS
4. Generate Cycle 1 prompt for feat/file-explorer-enhanced (subtree-add already done in feat/scribe-widget; second branch can reuse Docs/holocron-reference/ directly)
5. If HALT file exists, skip and log "halted — waiting on Ilya to remove HALT"
