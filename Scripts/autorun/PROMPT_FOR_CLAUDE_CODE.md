# feat/workspace-widget — Cycle 1 — Phase A (SETUP)
**Generated:** 2026-05-28 by Cowork autorun fire #9 after both PR #93 (Scribe) and PR #94 (File Explorer) merged to main
**Scope:** ONE cycle. Branch creation + Holocron source file inventory + push to origin. **DO NOT port any code in this cycle.**

---

## Standing rules (Ilya's global CLAUDE.md — read fully before starting)
- 🧪 in **every response** (not just the first). No exceptions.
- **ETA per step** before starting it. If an ETA slips by >5 min, switch approach.
- **Verification before any "done" / "complete" / "working" claim.** Paste proof (command output, file diff, screenshot) inline BEFORE the claim, not after.
- **No browser subagents.** Use `run_command` + curl / Node / direct file reads.
- **No `pkill -f`** on patterns that match the calling shell argv.
- **No auto-push.** You commit. Ilya pushes manually after reviewing.
- **No undoing Ilya's manual work.** If you see commits on the branch that you didn't make, leave them alone.

---

## Context — what just shipped
- PR #93 `feat/scribe-widget` merged to `main` as `d5fbc2f` (Scribe markdown editor, ~3,700 LOC)
- PR #94 `feat/file-explorer-enhanced` merged to `main` as `9b929a6` (Dual-mode file explorer with hierarchy lock)
- Main HEAD now: `9b929a6`
- The subtree `Docs/holocron-reference/` was carried into main with PR #93 — **DO NOT subtree-add again.** It's already there.
- `feat/workspace-widget` branch does NOT yet exist locally or on origin. You will create it in this cycle.

---

## What you do in Cycle 1 (Phase A — Setup)

### Step 1 — Verify clean working tree (ETA ~10 s)
```bash
cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"
git status --short
git rev-parse HEAD
```

**Expected:** zero untracked/modified files; HEAD on `main` at `9b929a6` (or a child of it if Ilya did more work). If you see uncommitted changes, **STOP** and ask Ilya before continuing.

### Step 2 — Make sure local main matches origin/main (ETA ~10 s)
```bash
git fetch origin --quiet
git log --oneline origin/main..main 2>&1
git log --oneline main..origin/main 2>&1
```

Both diffs should be empty. If `main` has diverged from `origin/main`, **STOP** and report. (If `git fetch` errors with "could not read Username", that's the sandbox running this prompt — when YOU run it from Ilya's terminal with his credentials it'll succeed.)

### Step 3 — Create branch off main (ETA ~5 s)
```bash
git checkout -b feat/workspace-widget
git rev-parse HEAD  # must equal whatever main was at
```

### Step 4 — Confirm subtree is already present (ETA ~10 s)
```bash
ls -la Docs/holocron-reference/ | head -5
ls Docs/holocron-reference/editor/src/renderer/src/components/ 2>&1 | head -20
```

**Expected:** `Docs/holocron-reference/` exists; you see a tree including `editor/`, and inside `editor/src/renderer/src/components/` you see directories like `scribe/`, `chat/`, `codex/`, `foundry/`, `hive/`, `hud/`, `layout/`, `settings/`. **If the subtree is somehow missing, STOP and ask Ilya — do NOT subtree-add again.**

### Step 5 — Inventory the Workspace-relevant files in the Holocron mirror (ETA ~1 min)

Run these `find` invocations and **paste the full output** in your response:

```bash
find Docs/holocron-reference -type f -iname "*workspace*" 2>&1
find Docs/holocron-reference -type f -iname "*domain*" -o -iname "*domaine*" 2>&1 | head -40
find Docs/holocron-reference -type f -iname "*project*.ts*" 2>&1 | head -30
find Docs/holocron-reference -type f -iname "*thread*" 2>&1 | head -30
find Docs/holocron-reference -type f -iname "*hierarchy*" 2>&1 | head -20
find Docs/holocron-reference -type d -iname "layout" 2>&1
ls Docs/holocron-reference/editor/src/renderer/src/components/layout/ 2>&1
ls Docs/holocron-reference/editor/src/renderer/src/store/ 2>&1 | head -40
ls Docs/holocron-reference/editor/src/renderer/src/hooks/ 2>&1 | head -40
ls Docs/holocron-reference/editor/src/main/ 2>&1 | head -40
ls Docs/holocron-reference/editor/scripts/migrations/ 2>&1
```

**Don't read the files yet.** This is inventory only. Just the file paths.

### Step 6 — Inventory the Dwellium target-side files you'll need to know about (ETA ~30 s)

```bash
ls qualia-shell/src/registry/ 2>&1
cat qualia-shell/src/registry/widgetRegistry.ts 2>&1 | grep -n "scribe\|file.\?explorer\|filemanager" | head -20
cat qualia-shell/src/hierarchy/hierarchy.ts 2>&1 | grep -n "Filing Cabinet\|scribe\|file.\?explorer" | head -30 || find qualia-shell -name "hierarchy.ts" -exec grep -n "Filing Cabinet\|scribe" {} +
ls qualia-shell/src/components/Scribe/ 2>&1 | head -20
ls qualia-shell/src/components/FileExplorer/ 2>&1 | head -20 || ls qualia-shell/src/components/ | grep -i "file\|explorer"
ls qualia-shell/src/lib/ 2>&1 | head -40
ls qualia-shell/src/store/ 2>&1 | head -40 || find qualia-shell/src -type d -name "store" -o -name "stores"
```

This tells you (a) where Scribe widget lives so you can pattern-match, (b) where File Explorer lives, (c) where to register the new Workspace widget, (d) what stores already exist.

### Step 7 — Commit a placeholder marker (ETA ~30 s)

Create `Scripts/autorun/WORKSPACE_PORTING_PLAN.md` as an EMPTY stub with a single header (the real plan gets drafted in Cycle 2):

```bash
cat > Scripts/autorun/WORKSPACE_PORTING_PLAN.md <<'EOF'
# Workspace Widget Porting Plan — Holocron → Dwellium

**Branch:** `feat/workspace-widget`
**Created:** TBD (Cycle 2 — discovery + plan)
**Status:** STUB — to be drafted in Cycle 2.

EOF
git add Scripts/autorun/WORKSPACE_PORTING_PLAN.md
git status --short
```

### Step 8 — Run the strict gate (ETA ~3-5 min)

```bash
cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```

**Acceptance: 6/6 green.** vitest must report `278 passed | 39 skipped` (baseline from end of Phase-9+). If anything goes red:
- **STOP IMMEDIATELY.**
- Paste the failure output.
- Do NOT try to "just fix it" — main was green at `9b929a6`, so any failure on a 1-commit-stub branch is highly suspicious (most likely cause: local environment drift, not source code).

### Step 9 — Commit the stub (ETA ~30 s)

```bash
git commit -m "$(cat <<'EOF'
chore(workspace): scaffold porting plan stub for feat/workspace-widget (Cycle 1)

Phase A (Setup) cycle. No production code touched. Subtree
Docs/holocron-reference/ already present from PR #93. Just creates
the empty WORKSPACE_PORTING_PLAN.md placeholder for Cycle 2 to fill in.

Strict gate green: tsc, vitest 278/39, both react-router builds, PII,
SSR smoke. Baseline matches main 9b929a6.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git log --oneline -3
```

### Step 10 — Report (do NOT push)

Reply to Ilya with:

1. 🧪 token at top
2. Branch + new HEAD SHA
3. Output of Step 5 + Step 6 inventories (full paste, not summarized — Cycle 2 needs the raw paths)
4. Strict gate result (6/6 green or what failed)
5. **EXPLICIT line: "DO NOT PUSH yet — Phase A is for review only. Push when Cycle 2 plan is locked."**
6. The exact `git push -u origin feat/workspace-widget` command Ilya will run AFTER he reviews the Cycle 2 plan (not now).

---

## Scope boundaries — what NOT to do this cycle
- ❌ Do NOT port any code from Holocron. Cycle 2 plans the port; Cycles 3+ execute it.
- ❌ Do NOT modify ANY file under `qualia-shell/src/**` or `qualia-shell/app/**`.
- ❌ Do NOT add any npm dependencies (zustand etc. are already there from Scribe).
- ❌ Do NOT touch `Docs/holocron-reference/**` — it's reference-only.
- ❌ Do NOT push to origin. Ilya pushes manually.
- ❌ Do NOT subtree-add the Holocron mirror — it's already there from PR #93.
- ❌ Do NOT touch the `feat/scribe-widget` branch — Ilya has post-PR polish commits on it that are his to manage.
- ❌ Do NOT touch the `feat/file-explorer-enhanced` branch.
- ❌ Do NOT instruct Cowork autorun what to do. The autorun reads STATUS independently.

---

## Acceptance criteria — Cycle 1 is complete when
- [ ] `feat/workspace-widget` branch exists locally with exactly **1 commit** beyond main
- [ ] That commit is the chore(workspace) stub commit above
- [ ] `Scripts/autorun/WORKSPACE_PORTING_PLAN.md` exists as a 5-line stub
- [ ] Strict gate 6/6 green (proof pasted inline)
- [ ] You reported the full Step 5 + Step 6 inventory output back to Ilya
- [ ] Branch NOT pushed yet

When all 6 boxes are checked, stop and wait for Ilya to either (a) review and ask you to start Cycle 2 (discovery + plan) or (b) ask follow-up questions on the inventory before locking the plan.

---

## What's coming after Cycle 1 (so you can scope your inventory accordingly)
- **Cycle 2** — DISCOVERY + PLAN. Read all relevant Holocron files identified in Step 5. Read the Dwellium hooks/store/registry files identified in Step 6. Draft `WORKSPACE_PORTING_PLAN.md` with: data model (Domain → Project → Thread), backend-route surface area, per-user storage location, integration with Scribe (Scribe tab belongs to thread?) + File Explorer (file tree scoped to project?), open questions for Ilya, ~10-cycle port sequence sketch. STOP for review.
- **Cycles 3-11** — PORT. One subtask per cycle, each ending in a strict-gate-green commit.
- **Cycle 12** — CLOSE. Closure doc + final strict gate. Ilya pushes + opens PR #95.

🧪
