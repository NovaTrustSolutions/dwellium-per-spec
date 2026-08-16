# Plan 008: Make Halocron OS and its heavy screens truly lazy (off the Desktop critical path)

> **Executor instructions**: Follow step by step; run each verification. Watch the
> `KG_AGENTS` named-export gotcha in Step 2. Obey STOP conditions. Update this plan's
> row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/components/Shell/Desktop.tsx qualia-shell/src/components/Shell/HalocronOS.tsx qualia-shell/src/components/Shell/HalocronWorkspaces.tsx qualia-shell/src/registry/widgetRegistry.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (shell-level lazy boundaries)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

`widgetRegistry.ts` declares HalocronKnowledgeGraph, CloudBrowser, and CognitiveHarness
as **lazy** widgets — but `HalocronOS.tsx` *statically* imports all three, and
`Desktop.tsx` *statically* imports `HalocronOS` and renders it unconditionally. Because
Desktop is the always-mounted shell, the static chain
`Desktop → HalocronOS → {KnowledgeGraph, CloudBrowser, CognitiveHarness, Workspaces}`
pulls all of them into the main Desktop chunk and loads them for **every authenticated
user on first paint**, even those who never open the Halocron OS launcher. The lazy
wrappers in the registry are dead — Vite even warns ("statically imported … will not
move module into another chunk"). Making `HalocronOS` lazy in Desktop, and its heavy
children lazy per tab, defers a large block off the critical path and silences the
warnings.

## Current state

- `qualia-shell/src/components/Shell/Desktop.tsx:21`: `import HalocronOS from './HalocronOS';` (static); rendered unconditionally at `Desktop.tsx:1162` `<HalocronOS />`.
- `qualia-shell/src/components/Shell/HalocronOS.tsx:25-29` (static imports):
  ```ts
  import HalocronKnowledgeGraph, { KG_AGENTS } from './HalocronKnowledgeGraph';
  import HalocronWorkspaces from './HalocronWorkspaces';
  import CloudBrowser from '../CloudBrowser/CloudBrowser';
  import ClaudePlaybook from './ClaudePlaybook';
  import CognitiveHarness from '../CognitiveHarness/CognitiveHarness';
  ```
  Note `KG_AGENTS` is a **named export** imported eagerly alongside the default — this is the gotcha (a default-only `React.lazy` cannot also bind `KG_AGENTS`).
- `widgetRegistry.ts` lazy declarations: KG at `:102`, CognitiveHarness at `:407`, CloudBrowser at `:550` (the registry uses the repo's `lazyWithReload`).
- Repo conventions (from `CLAUDE.md`):
  - **Top-level lazy candidates** (App/Desktop altitude, where a chunk-load failure has no recovery but reload) use `lazyWithReload` from `qualia-shell/src/utils/lazyWithReload.ts`, with the shared `<AppSuspenseFallback variant="viewport" />` from `qualia-shell/src/components/Shell/AppSuspenseFallback.tsx`.
  - **Sub-component lazy candidates** (inside a shell that must keep state) use bare `React.lazy`.
  - Named-export wrapping pattern: `const X = lazyWithReload(() => import('./X').then((m) => ({ default: m.X })));`

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run halocronOS` | pass |
| Build + watch warnings (Mac) | `cd qualia-shell && npm run build 2>&1 \| grep -i "will not move\|HalocronKnowledgeGraph\|CloudBrowser\|CognitiveHarness"` | the static+dynamic warnings for these three should be GONE after the fix |
| Confirm separate chunks (Mac) | `ls build/client/assets \| grep -iE "KnowledgeGraph\|CloudBrowser\|CognitiveHarness"` | each appears as its own chunk file |

## Scope

**In scope**:
- `qualia-shell/src/components/Shell/Desktop.tsx` (make `HalocronOS` lazy)
- `qualia-shell/src/components/Shell/HalocronOS.tsx` (make KG / CloudBrowser / CognitiveHarness / Workspaces lazy per tab; resolve `KG_AGENTS`)
- possibly a tiny new module for `KG_AGENTS` if extraction is the chosen fix (see Step 2)

**Out of scope**:
- `widgetRegistry.ts` lazy declarations (already correct — leave them).
- The internals of KnowledgeGraph/CloudBrowser/CognitiveHarness/Workspaces components.
- `ClaudePlaybook` (small; lazy optional, not required).

## Git workflow

- Branch: `advisor/008-lazy-halocron-os`
- Commit(s): `perf(shell): lazy-load HalocronOS + its heavy screens off the Desktop chunk`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Make `HalocronOS` lazy in Desktop

In `Desktop.tsx`, replace the static import with `lazyWithReload` and wrap the render site in `Suspense` with the shared fallback:
```tsx
import { lazyWithReload } from '../../utils/lazyWithReload';
import AppSuspenseFallback from './AppSuspenseFallback';
const HalocronOS = lazyWithReload(() => import('./HalocronOS'));
```
At `Desktop.tsx:1162`, wrap: `<Suspense fallback={<AppSuspenseFallback variant="viewport" />}><HalocronOS /></Suspense>` (import `Suspense` from `react` if not already). HalocronOS already renders `null` when the OS layout is disabled, so the Suspense boundary only resolves a chunk when needed.

**Verify**: `grep -n "lazyWithReload(() => import('./HalocronOS'))" qualia-shell/src/components/Shell/Desktop.tsx` → present; `grep -n "^import HalocronOS" Desktop.tsx` → the static import is gone.

### Step 2: Resolve the `KG_AGENTS` named export, then lazy-load the heavy children

`KG_AGENTS` is imported eagerly at `HalocronOS.tsx:25`. Choose ONE:
- **(a) Extract the constant** (preferred): move `KG_AGENTS` into a tiny `HalocronKnowledgeGraph.agents.ts` (or similar) that both `HalocronOS` and `HalocronKnowledgeGraph` import statically (it's just data, cheap), then `React.lazy` the component:
  ```ts
  import { KG_AGENTS } from './HalocronKnowledgeGraph.agents';
  const HalocronKnowledgeGraph = lazy(() => import('./HalocronKnowledgeGraph'));
  ```
- **(b)** If `KG_AGENTS` is trivially small and only used in one place, keep a static `import { KG_AGENTS } from './HalocronKnowledgeGraph'` for the constant AND `const HalocronKnowledgeGraph = lazy(() => import('./HalocronKnowledgeGraph'))` for the component — but note this still statically pulls the module, so (a) is the real fix. Prefer (a).

Then convert `CloudBrowser`, `CognitiveHarness`, and `HalocronWorkspaces` to bare `React.lazy` (sub-component altitude per convention), and wrap the per-tab render sites in `<Suspense fallback={…}>`. `ClaudePlaybook` may stay static (small).

**Verify**: `grep -n "React.lazy\|lazy(" qualia-shell/src/components/Shell/HalocronOS.tsx` → KG/CloudBrowser/CognitiveHarness/Workspaces are lazy; `grep -n "from './HalocronKnowledgeGraph'" HalocronOS.tsx` no longer statically imports the default component.

### Step 3: Typecheck + tests + build

**Verify (Mac)**: `npx tsc -b` exit 0; `npx vitest run halocronOS` passes; `npm run build` → the "will not move into another chunk" warnings for these three are gone, and `build/client/assets` shows them as separate chunks.

### Step 4: Live smoke (Mac)

`npm run preview`, enable the Halocron OS layout, click through the Apps / Knowledge Graph / Workspace / Cloud Browser tabs — each renders (a brief Suspense fallback is fine), zero console errors.

## Test plan

- Reuse `qualia-shell/src/test/halocronOS.test.tsx` (it already exercises the OS shell). It must still pass with the lazy boundaries (tests may need `await` on Suspense — if a test now requires `findBy*`/`act`, adjust minimally, following the existing patterns in that file).
- Verification: `npx vitest run halocronOS` → all pass.

## Done criteria

- [ ] `Desktop.tsx` imports `HalocronOS` via `lazyWithReload` and wraps it in `Suspense`
- [ ] `HalocronOS.tsx` lazy-loads KnowledgeGraph, CloudBrowser, CognitiveHarness, Workspaces; `KG_AGENTS` resolved without statically importing the KG component
- [ ] `npm run build` no longer prints "will not move … into another chunk" for these three; they appear as their own chunks in `build/client/assets`
- [ ] `npx tsc -b` + `npx vitest run halocronOS` green; live smoke clean
- [ ] Only the in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- After lazying, `npx vitest run halocronOS` fails in a way that needs more than minimal `findBy/act` adjustment (i.e. the test depends on synchronous mount) — STOP and report; don't rewrite the test's intent.
- `KG_AGENTS` turns out to be more than a plain constant (it imports heavy code) — STOP; extracting it won't help and needs a rethink.
- The Suspense fallback causes a visible layout break in the OS shell — STOP and report.

## Maintenance notes

- This is the structural fix for the Vite static+dynamic warnings; if a future change re-adds a static import of any of these into a shell file, the warning (and the eager-load regression) returns — keep them lazy.
- Reviewer: confirm via the build output that the three chunks split out, and that the OS tabs still render.
