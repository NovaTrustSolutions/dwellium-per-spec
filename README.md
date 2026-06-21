# Dwellium — Per Spec

[CT-3H-HANDOFF-M4Q7] [CT-3E-ARCH-W8K3]

Complete handoff folder for constructing the Dwellium shell (qualia-shell) app, aligned to the Phase 3-H Engineer Handoff spec from AstraStrata Review.

This folder contains everything needed to build, run, and understand the full shell with all widgets.

---

## What's in here

```
Dwellium -Per Spec/
├── README.md                       ← you are here
├── qualia-shell/                   ← full app source + git history + F-1 edits applied
│   ├── src/
│   │   ├── components/             ← 41 component dirs (26 registered widgets)
│   │   ├── registry/               ← WIDGET_REGISTRY (Fix #026)
│   │   ├── providers/              ← React context providers
│   │   ├── hooks/, services/, config/
│   │   └── ...
│   ├── e2e/                        ← Playwright tests (passphrase sync'd)
│   ├── public/                     ← static assets (nebula-bg.mp4, logos)
│   ├── package.json                ← deps locked
│   └── vite.config.ts
├── packages/                       ← internal shared packages
├── Docs/
│   ├── F1_UniversalShell_Schema.md     ← before/after + added files matrix
│   ├── Widget_Audit.md                 ← 26/26 widgets + 33/33 Strata modules audit
│   ├── Handoff_Parity_Checklist.md     ← Phase 3-H parity gate
│   └── commit_msg.txt                  ← ready-made git commit message
└── Scripts/
    └── push_to_github.sh               ← one-shot push helper for NovaTrustSolutions/qualia-shell
```

---

## Quick start (build + preview)

Prerequisites:
- Node 22 (see `.nvmrc`)
- npm ≥ 10

```bash
cd qualia-shell
npm install
npm run build         # tsc -b && react-router build → output in build/client/
npm run preview       # serves the built app on http://localhost:4173
```

This is a React Router 7 framework-mode app — `npx vite build` is a silent no-op; always use `npm run build`.

For the dev server with hot reload:
```bash
npm run dev           # Vite dev on http://localhost:5173
```

Default login:
- Click splash overlay ("Click to Access Terminal")
- Pick a dev avatar (Andy / Lisa / Archi)
- Production sign-in uses Google Identity Services

Detailed build steps, troubleshooting, and parity verification are in `qualia-shell/BUILD.md` (if present) or the build walkthrough inside `Docs/Handoff_Parity_Checklist.md`.

---

## What was done (F-1 Universal Shell — Phase 3-H)

F-1 introduces the 4-column persistent frame (Option C in the handoff):

| Column | Role |
|---|---|
| Filing Cabinet | Navigation / nested folder tree of widgets |
| Scratch Pad | Notes, clipboard, ephemeral workspace |
| Canvas | Active widget/document viewer |
| Orchestrator | AI agent panel, command center |

Per-column `AdapterBoundary` provides RT-01 isolation so one crashing widget can't take down the shell. The `ContainerAdapter` pattern lets any widget be hosted inside any column without code changes.

Key additions live in `src/components/UniversalShell/`:
- `UniversalShell.tsx` / `UniversalShell.css`
- `AdapterBoundary.tsx`
- `adapterRegistry.ts`
- `adapters/` (per-column adapters)
- `types.ts`, `index.ts`

Supporting utilities:
- `src/utils/lazyWithReload.ts` — dynamic import with reload-on-chunk-miss
- `src/registry/WIDGET_REGISTRY.ts` — single source of truth for widget metadata (Fix #026)

Auth:
- `src/components/Auth/LoginScreen.tsx` passphrase updated to `Comet2878!`
- `e2e/helpers/auth.ts` kept in sync

Canary tokens embedded for traceability: `[CT-3H-HANDOFF-M4Q7]` (handoff spec) and `[CT-3E-ARCH-W8K3]` (architecture spec).

See `Docs/F1_UniversalShell_Schema.md` for the full before/after diagrams and added-file matrix with line counts and source citations.

---

## Widget inventory (high level)

- **26** registered widgets in the shell registry, all with real implementations
- **33** Strata dashboard modules (PropertiesModule 2,438 LOC, LeasingModule 1,255 LOC, VendorsModule 1,238 LOC, ComplianceEngine 1,121 LOC, etc.)
- **5** Astra dashboard tabs (AstraWorkspace, IntelligenceDashboard, ThreadChannels, ObservabilityPanel + home)
- **TranscriptionHub** (2,874 LOC, 0 TODOs) — MicrophoneTranscriber via `@moonshine-ai/moonshine-js`, fact-check, legal scan, 3 export formats

Full per-widget audit matrix in `Docs/Widget_Audit.md`.

---

## How to push this to GitHub

The feature branch has already been staged locally. To push:

```bash
bash "./Scripts/push_to_github.sh"
```

The script handles: creating the branch, staging (junk excluded by `.gitignore`), commit (using `Docs/commit_msg.txt`), and push to `NovaTrustSolutions/qualia-shell`. Prints the PR URL at the end.

If you prefer the plain commands:
```bash
cd qualia-shell
rm -f .git/index.lock
git checkout feat/f1-universal-shell-and-wip 2>/dev/null || git checkout -b feat/f1-universal-shell-and-wip
git add -A
git commit -F ../Docs/commit_msg.txt
git push -u origin feat/f1-universal-shell-and-wip
```

---

## Known deferred items

Carry-over from the handoff (not yet wired):
- `ErrorBoundary.tsx` lines 79,82 — `react-error-boundary` type-mismatch (typecheck warning, runtime fine)
- `InboxWidget.tsx` lines 362,374 — `.body` on `InboxItem` (dead-code path, no runtime impact)

Both are annotated in `Docs/Widget_Audit.md` under **Deferred**.

---

[CT-3H-HANDOFF-M4Q7] [CT-3E-ARCH-W8K3]  
[FULL COVERAGE]
