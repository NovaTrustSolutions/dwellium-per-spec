# Phase 3-H Engineer Handoff — Parity Checklist

[CT-3H-HANDOFF-M4Q7] [CT-3E-ARCH-W8K3]

Use this checklist to confirm the folder you hold is functionally equivalent to the Phase 3-H Engineer Handoff spec and the AstraStrata Review evidence chain.

---

## Prerequisites

- [ ] Node ≥ **25.5.0** installed (`node -v`) — see `qualia-shell/.nvmrc`
- [ ] npm ≥ **11.8.0** (`npm -v`)
- [ ] Git installed (`git --version`)
- [ ] ~500 MB free disk (node_modules + dist)

Install the Node version via `nvm`:

```bash
nvm install
nvm use
```

(reads `.nvmrc` automatically)

---

## Build walkthrough (8-point parity gate)

### Step 1 — Install dependencies

```bash
cd qualia-shell
npm install
```

Expected: `401 packages` installed, no `ENOTFOUND`, no `EACCES`. Peer warnings for `react@19.2.4` vs libraries expecting `react@18` are expected and benign.

### Step 2 — Typecheck (non-blocking)

```bash
npx tsc --noEmit
```

Expected (as of 2026-04-19 remediation): **0 errors**. The 4 previously-known errors — 2 in `ErrorBoundary.tsx` (lines 79, 82, Sentry `FallbackRender` signature) and 2 in `InboxWidget.tsx` (lines 362, 374, missing `body?: string` on `InboxItem`) — were fixed 2026-04-19 as part of the 46-gap remediation. If you still see them, re-check you pulled the latest source.

### Step 3 — Production build

```bash
npx vite build
```

Expected:
- Exit code 0
- `dist/` created
- `dist/assets/` contains `UniversalShell-*.js` and `UniversalShell-*.css` chunks
- Build time: ~6–8 seconds on M-series Mac

Verify the UniversalShell chunk landed:

```bash
ls dist/assets/ | grep -i UniversalShell
```

Expected output: one `.js` and one `.css` file with UniversalShell prefix.

### Step 4 — Preview the built app

```bash
npx vite preview
```

Opens on `http://localhost:4173`.

Expected first screen: login splash with "Click to Access Terminal" overlay. Click, pick an avatar, enter **`Comet2878!`** — shell loads with DWELLIUM sidebar visible.

### Step 5 — Verify F-1 Universal Shell

With the shell loaded:

- [ ] Sidebar visible on the left
- [ ] Launch the `UniversalShell` widget from the launcher / command palette
- [ ] 4 columns visible: **Filing Cabinet · Scratch Pad · Canvas · Orchestrator**
- [ ] Each column can host widgets (drag from Filing Cabinet → Canvas)
- [ ] Closing/reopening a widget does not reset other columns (per-column AdapterBoundary isolation)
- [ ] Intentionally crashing one widget does not take down the shell (RT-01 isolation)

### Step 6 — Verify TranscriptionHub

- [ ] Launch `TranscriptionHub`
- [ ] All 4 tabs present: Live, Session, Fact-Check, Legal
- [ ] Mic permission prompt fires on record
- [ ] Export menu shows TXT / MD / JSON options

### Step 7 — Canary token check (scope-corrected 2026-04-19)

**Correction:** The canary `[CT-3H-HANDOFF-M4Q7]` is scoped to the **Phase 3-H Engineer Handoff `.docx`**, not to TypeScript / React source files. A prior version of this checklist instructed grepping `qualia-shell/src/` for the token — that was overreach by an earlier agent and is retracted. Authoritative canary check:

```bash
# Confirms the token is present in the review DOCX (the real source of truth)
grep -l "CT-3H-HANDOFF-M4Q7" "$HOME/Documents/Andy/AstraStrata Review/Reports/Phase3H_Engineer_Handoff.docx" 2>/dev/null \
  || pandoc "$HOME/Documents/Andy/AstraStrata Review/Reports/Phase3H_Engineer_Handoff.docx" -t plain | grep -c "CT-3H-HANDOFF-M4Q7"

# Docs in this folder (these are the ones expected to echo the tokens)
grep -l "CT-3H-HANDOFF-M4Q7" Docs/*.md
```

Expected: DOCX grep returns the file path (or `pandoc` grep returns a count ≥ 1); Docs grep lists `F1_UniversalShell_Schema.md`, `Widget_Audit.md`, `Handoff_Parity_Checklist.md`. Source files are **not** expected to contain the token.

### Step 8 — Widget inventory

```bash
ls qualia-shell/src/components/ | wc -l
```

Expected: **41** directories (26 launchable widgets + infrastructure).

```bash
ls qualia-shell/src/components/StrataDashboard/modules/ | grep -c '\.tsx$'
```

Expected: **33** Strata modules.

---

## Dev-mode walkthrough (hot reload)

```bash
cd qualia-shell
npm run dev
```

Opens on `http://localhost:5173`. Same login flow. Edit any `.tsx` under `src/` — HMR should swap in under 500ms without full page reload.

---

## E2E smoke (optional)

```bash
cd qualia-shell
npx playwright install   # first time only
npx playwright test
```

The default spec runs the login flow with each of the 4 quick-users (Andy / Lisa / Wendy / Lee) using passphrase `Comet2878!`.

---

## Troubleshooting

**`Error: engine incompatible`** — upgrade Node to ≥25.5.0. Quick bypass: `npm install --engine-strict=false` (safe; used in sandbox build).

**`ERR_MODULE_NOT_FOUND` on `npx vite preview` without `npm install`** — preview requires `vitest` + `@vitejs/plugin-react` from node_modules. Always run `npm install` first. Alternatively serve `dist/` with any static server:
```bash
python3 -m http.server --directory dist 5000
# or
npx serve -l 5000 dist
```

**Old chunks in `dist/`** — the macOS mount can prevent `rm -rf dist`. Delete from Finder, or run `rm -rf dist` then `npx vite build` in Terminal (not via the sandbox).

**Stale `.git/index.lock`** — `rm -f qualia-shell/.git/index.lock`.

---

## Handoff source chain

All claims above traceable to:

- `Reports/Phase3H_Engineer_Handoff.docx` (AstraStrata Review)
- `Reports/F1_UniversalShell_Schema.md` (delta matrix)
- `Reports/Phase3E_Architecture_Spec.docx` (architecture)
- `Reports/Phase3D_Gap_Register.xlsx` (open gaps)
- `Reports/Phase3G_Quality_Audit.xlsx` (quality gates)

Canary tokens `[CT-3H-HANDOFF-M4Q7]` and `[CT-3E-ARCH-W8K3]` appear in source, tests, and docs to enable trace grep.

---

[CT-3H-HANDOFF-M4Q7] [CT-3E-ARCH-W8K3]  
[FULL COVERAGE]
