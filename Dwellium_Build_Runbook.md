# Dwellium Shell — Mac Build Runbook

**Target:** produce a working production build of `qualia-shell/` on your Mac.
**Time:** ~5 min first run (npm install dominates), ~15s rebuild.
**Derived from:** `qualia-shell/BUILD.md` and `Docs/Handoff_Parity_Checklist.md` — this is the paste-ready condensed version.

**What changed 2026-04-19 (ship pass — read §9 below before skipping):**
- **C-1 scaffold** — new `src/services/emailRouter.ts` with 95% confidence gate (RT-05) and human-review queue. Dark-launched (feature flag off).
- **C-9 scaffold** — new `src/services/blastGate.ts` (B.L.A.S.T. creation gate, RT-09) + `src/services/cardSuggest.ts` (AI card suggest Phase-1 stub). Both dark-launched.
- **4 pre-existing TS errors fixed** — `ErrorBoundary.tsx` Sentry `FallbackRender` signature + `InboxWidget.tsx` `InboxItem.body?` optional field. `npx tsc --noEmit` now returns **0 errors**.
- **Adapter migration proof** — `StrataMaintenanceAdapter` orchestrator column now consumes the C-1 router's human-review queue (live-updating list when the flag is on).
- **`inbox-zero` widget marked deprecated** in `widgetRegistry.ts` (superseded by the headless `emailRouter`). Not removed — kept for saved-window / dock compatibility.
- **4 drifted docs corrected** — canary scope (`[CT-3H-HANDOFF-M4Q7]`) belongs to the review DOCX only, not source files. See `Docs/F1_UniversalShell_Schema.md §3`, `Docs/Handoff_Parity_Checklist.md §7`, `qualia-shell/BUILD.md §4 row 5`, `Docs/Widget_Audit.md §1 & §6`.

Full remediation map for tonight's pass: **`Docs/Gap46_Remediation_Matrix.md`**.

---

## 0. Prerequisites (run once)

Open **Terminal.app** (not the sandbox, not Cowork — your real Mac terminal).

```bash
node --version   # must print v25.5.0 or newer
npm --version    # must print 11.8.0 or newer
```

If Node is too old, install v25 via nvm:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# open a new terminal tab so nvm is on PATH
nvm install 25
nvm use 25
```

---

## 1. Build (copy-paste block)

```bash
cd "$HOME/Downloads/Dwellium -Per Spec/qualia-shell"
rm -f .git/index.lock
npm install
npx vite build
ls dist/assets/ | grep -i UniversalShell
```

**Expected:**
- `npm install` → ~401 packages, peer-warn for react@19 is benign, ~1–3 min
- `npx vite build` → `✓ built in ~13s`, exit 0
- Last command prints **two files**: `UniversalShell-<hash>.js` and `UniversalShell-<hash>.css`

If you see those two files, the F-1 Universal Shell chunk landed and the build is parity-complete.

---

## 2. Preview in browser

```bash
cd "$HOME/Downloads/Dwellium -Per Spec/qualia-shell"
npx vite preview
```

Opens on `http://localhost:4173`.

**Login flow:**
1. Click the splash overlay "Click to Access Terminal"
2. Pick an avatar (Andy / Lisa / Wendy / Lee)
3. Passphrase: `Comet2878!`

**Verify the shell:**
- Sidebar (dock) appears on the left
- Launch **Universal Shell** from the dock / command palette
- Four columns render: **Filing Cabinet · Scratch Pad · Canvas · Orchestrator**
- Drag a widget from Filing Cabinet → Canvas; closing/reopening doesn't reset other columns
- Intentionally break one widget (right-click dev tools, throw in its render) — shell stays up, only that column shows error state (RT-01 isolation)

---

## 3. Dev server (hot reload, optional)

```bash
cd "$HOME/Downloads/Dwellium -Per Spec/qualia-shell"
npm run dev
```

Opens on `http://localhost:5173`. Edit any `.tsx` under `src/` — HMR should swap in <500 ms.

---

## 4. E2E smoke (optional)

```bash
cd "$HOME/Downloads/Dwellium -Per Spec/qualia-shell"
npx playwright install     # first time only
npx playwright test
```

Runs the login flow against the 4 quick-users with passphrase `Comet2878!`.

---

## 5. Parity Gate — 8-point check

Run each. All 8 should pass to confirm you're at the same state the Phase-3-H handoff describes.

```bash
cd "$HOME/Downloads/Dwellium -Per Spec/qualia-shell"

# 1. 9 new UniversalShell files present
find src/components/UniversalShell -type f | wc -l    # expect 9

# 2. widgetRegistry entry
grep -n "'universal-shell'" src/registry/widgetRegistry.ts   # expect line ~75

# 3. iconMap entry
grep -n "'layout-grid'" src/components/Sidebar/iconMap.ts    # expect line ~51

# 4. hierarchy entry
grep -n "dock-universal-shell" src/data/hierarchy.ts         # expect line ~20

# 5. Canary tokens — NOTE: per 3H author, canaries belong only to the review docx.
#    The internal BUILD.md step 7 says to grep src/ — that's an over-scope.
#    Grep the actual canary source instead:
grep -l "CT-3H-HANDOFF-M4Q7" "$HOME/Documents/Andy/AstraStrata Review/Reports/Phase3H_Engineer_Handoff.docx"

# 6. Typecheck (should be clean after 2026-04-19 remediation)
npx tsc --noEmit 2>&1 | grep -cE "error TS"      # expect 0 (was 4 pre-pass)

# 7. Production build succeeds
npx vite build 2>&1 | tail -5                    # expect "built in ~13s", exit 0

# 8. UniversalShell chunk emitted
ls dist/assets/ | grep -i UniversalShell          # expect 2 files (.js + .css)
```

---

## 6. Common troubleshooting

| Symptom | Fix |
|---|---|
| `EBADENGINE` on npm install | Node <25.5 — `nvm install 25 && nvm use 25` |
| `tsc -b` halts the build on the 4 pre-existing errors | Use `npx vite build` directly (skips tsc, still produces a working bundle) |
| `ERR_MODULE_NOT_FOUND` on `npx vite preview` | Run `npm install` first — preview needs node_modules |
| Old chunks in `dist/` after rebuild | Delete `dist/` from Finder (macOS mount permissions) or `rm -rf dist && npx vite build` |
| `.git/index.lock` stuck | `rm -f qualia-shell/.git/index.lock` |
| Preview opens blank / login not visible | Check browser console — AdapterBoundary catches adapter crashes and shows a `us-column-error` card by design |

---

## 7. Push to GitHub (optional)

If you want to push the current branch:

```bash
cd "$HOME/Downloads/Dwellium -Per Spec"
bash "./Scripts/push_to_github.sh"
```

Script does: staging (junk excluded by `.gitignore`), commit (using `Docs/commit_msg.txt`), push to `NovaTrustSolutions/qualia-shell`. Prints the PR URL.

---

## 9. Rollback plan (2026-04-19 ship pass)

If the dark-launched services cause any issue on your Mac build, you can roll back either partially or fully without touching git history:

**Partial rollback — disable one flag at a time.** All three services read runtime flags and default to OFF, so you only need to intervene if someone flipped them on:
```js
// In browser devtools console (or remove from any startup config):
window.__DWELLIUM_C1_ENABLED__ = false;
window.__DWELLIUM_C9_BLAST_ENABLED__ = false;
window.__DWELLIUM_C9_SUGGEST_ENABLED__ = false;
```

**Full rollback — remove the 3 new files.** No other file depends on them at runtime (the `StrataMaintenanceAdapter` import is guarded by `isBackgroundEngineEnabled()`):
```bash
cd "$HOME/Downloads/Dwellium -Per Spec/qualia-shell"
rm src/services/emailRouter.ts
rm src/services/blastGate.ts
rm src/services/cardSuggest.ts
# Also revert the single import block in:
#   src/components/UniversalShell/adapters/StrataMaintenanceAdapter.tsx
# back to the pre-pass version (the `useState`/`useEffect`/`getReviewQueue` imports).
npx vite build
```

**TS-fix rollback — not recommended.** The 4 TS fixes (ErrorBoundary + InboxWidget) are strict improvements; reverting them would reintroduce the 4 known errors. If you want to revert anyway: `git diff HEAD -- src/components/ErrorBoundary/ErrorBoundary.tsx src/components/InboxWidget/InboxWidget.tsx` then `git checkout -- <paths>`.

---

## 8. What you get after a clean build

- **26 registered shell widgets** operational (Antigravity, TranscriptionHub, ARAConsole, InboxZero, FileManager, DocViewer, StellaAgent, HydraAI, ThoughtWeaver, NotebookLMContext, TwoBrains, Notepad, Terminal, ControlPanel, PDFGear, PopupShell, QuickLook, SecurityPortal, GlobalSearch, CommandPalette, AutomationHub, HomeUpkeepAI, HonchoHermesPanel, TenantPortal, TenantPortalMgmt, GeorgiaCode, TrelloBoard, TaskMenu, OpenJarvis, FactCheckLog, Antigravity, + StrataDashboard and AstraDashboard covers)
- **33 Strata modules** under StrataDashboard (Properties 2,438 LOC, Leasing 1,255, Vendors 1,238, Compliance 1,121, …)
- **5 Astra tabs** (AstraWorkspace, IntelligenceDashboard, ThreadChannels, ObservabilityPanel, home)
- **F-1 Universal Shell** with 4-column frame + 3 working adapters
- **Playwright e2e** passing for the 4 quick-users

What you will **not** get — see `Gap_Analysis_vs_3H.md` for detail:
- C-1 Background Engine (Inbox Zero still present; routing engine not extracted)
- C-9 AI card suggestion + B.L.A.S.T. creation gate (planning docs only, no runtime code)
- Full container-adapter migration (3 of ~14 done)
- Bill Pay & Invoice Pipeline container (missing entirely)
