# Plan 001: README quick-start gives correct build, Node, and login instructions

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- README.md qualia-shell/package.json`
> If `README.md` changed since this plan was written, compare the "Current state"
> excerpts against the live file before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (coordinate the Node version with plan 002 — both must land the same value)
- **Category**: docs
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

The root `README.md` quick-start tells a new contributor to run `npx vite build`
and `npx vite preview`. With the `@react-router/dev` Vite plugin wired (this is a
React Router 7 *framework-mode* app), `npx vite build` is a **silent no-op** — it
exits 0 and produces zero artifacts (documented in `CLAUDE.md`). The real build is
`npm run build` (`tsc -b && react-router build`) and output lands in `build/client`,
not `dist/`. The README also states Node ≥ 25.5.0 while `package.json` `engines`
says `>=20`, and the login section names avatars/passphrase that no longer match the
code. A contributor following it builds nothing, sees no error, and concludes the
app is broken. Fixing it is the cheapest possible unblock.

## Current state

- `README.md` — root readme; the quick-start, prerequisites, and login sections are stale.
  - `README.md:42-43` (prerequisites): "Node ≥ 25.5.0 (see `.nvmrc`)" and "npm ≥ 11.8.0". (`.nvmrc` actually contains `22`.)
  - `README.md:46-50` (build block):
    ```
    cd qualia-shell
    npm install
    npx vite build        # produces dist/
    npx vite preview      # serves built app on http://localhost:4173
    ```
  - `README.md:58-61` (login): "Pick an avatar (Andy / Lisa / Wendy / Lee)" and "Passphrase: **`Comet2878!`**".
- `qualia-shell/package.json` scripts (the source of truth for commands):
  - `"dev": "react-router dev"`, `"build": "tsc -b && react-router build"`, `"preview": "vite preview --outDir build/client"`, `"test": "vitest run"`.
- Reality the README must reflect (from the code, do not re-derive — state it):
  - Build output dir is `build/client` (see `netlify.toml` `publish = "build/client"`).
  - Dev sign-in roster is **Andy / Lisa / Archi** (`qualia-shell/src/components/Auth/localAccounts.ts:43-47`); production sign-in is Google Identity Services (per `CLAUDE.md` current-state). There is a stage-1 shared gate passphrase, but do NOT print any passphrase value in the README (plan 014 removes shipped credentials).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (run on the Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Build (proves the new instructions) | `cd qualia-shell && npm run build` | exit 0; `build/client/` is populated |
| Grep check | `grep -n "vite build\|dist/" README.md` | no quick-start hits remain |

> Note: the build/test commands must be run on the user's Mac. The Linux sandbox cannot run Vite/vitest (missing native rollup/esbuild binaries) — `tsc` works there but builds do not.

## Scope

**In scope** (only file to modify):
- `README.md`

**Out of scope** (do NOT touch):
- `qualia-shell/package.json` — the Node `engines` bump belongs to plan 002. This plan only makes the README *describe* the agreed value; if 002 hasn't landed, write Node **22** (it matches `.nvmrc` and `netlify.toml`).
- `README-INSTALL.md`, `USER_GUIDE.md`, `Docs/**` — separate docs, not this plan.
- Do not invent new sections; only correct the three stale blocks.

## Git workflow

- Branch: `advisor/001-readme-quickstart`
- One commit; conventional-commit style (match `git log`): `docs(readme): correct build commands, Node version, and login section`.
- Do NOT push or open a PR unless the operator (Ilya) explicitly says so — this repo gates pushes (see `CLAUDE.md`).

## Steps

### Step 1: Replace the build block

In the quick-start, replace the `npx vite build` / `npx vite preview` block with:
```
cd qualia-shell
npm install
npm run build         # tsc -b && react-router build → output in build/client/
npm run preview       # serves the built app on http://localhost:4173
```
Add one sentence: "This is a React Router 7 framework-mode app — `npx vite build` is a silent no-op; always use `npm run build`."

**Verify**: `grep -n "vite build" README.md` → no match inside the quick-start; `grep -n "build/client" README.md` → at least one match.

### Step 2: Fix the prerequisites

Change the Node prerequisite to **Node 22** (and npm ≥ 10) to match `.nvmrc` and `netlify.toml`. Remove the "≥ 25.5.0 / ≥ 11.8.0" figures.

**Verify**: `grep -n "25.5\|11.8" README.md` → no match.

### Step 3: Fix the login section

Update the avatar list to **Andy / Lisa / Archi** and state that production login uses Google. Do not print any passphrase value.

**Verify**: `grep -n "Wendy\|Comet2878" README.md` → no match.

## Test plan

No unit tests (docs-only). Verification is the build command succeeding from the rewritten instructions:
- `cd qualia-shell && npm run build` → exit 0 and `ls build/client/index.html` exists.

## Done criteria

ALL must hold:
- [ ] `grep -n "vite build" README.md` → no match in the quick-start
- [ ] `grep -n "dist/" README.md` → no quick-start match (the `dist/` mention is gone)
- [ ] `grep -n "25.5\|Wendy\|Comet2878" README.md` → no match
- [ ] `cd qualia-shell && npm run build` exits 0 and `build/client/index.html` exists
- [ ] Only `README.md` is modified (`git status --short` shows just that file)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The README quick-start no longer contains the `vite build`/`dist/` text from "Current state" (someone already fixed it) — report and mark this plan REJECTED in the index.
- `npm run build` fails for reasons unrelated to docs (a real build break) — report; do not "fix the build" here.

## Maintenance notes

- If the build output dir ever changes (e.g. SSR re-enabled for a non-Netlify target), update this block again — `netlify.toml publish` is the source of truth.
- Reviewer: confirm the Node number matches plan 002's `engines` value; the two must agree.
