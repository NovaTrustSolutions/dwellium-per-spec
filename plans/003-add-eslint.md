# Plan 003: Add ESLint (typescript + react-hooks + jsx-a11y) as a non-blocking gate

> **Executor instructions**: Follow step by step; run each verification. Obey STOP
> conditions — especially the "huge backlog" one. Update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/package.json Scripts/gate.sh`
> If changed, re-read before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (added non-blocking first)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

This is a ~148k-LOC TypeScript/React app (630 source files) with **no linter** — no
`eslint`/`prettier`/`biome` dependency, no config, no `lint` script, no pre-commit
hook. `Scripts/gate.sh` runs `tsc` + `vitest` + builds + PII + SSR smoke, but nothing
catches unused vars/imports, leftover `console.log`, React Hooks `exhaustive-deps`
violations (the codebase is hook-dense — `TranscriptionHub.tsx` alone has 15 effects +
32 callbacks), or accessibility regressions (ironic, given the heavy manual a11y work
recorded in `CLAUDE.md`). Adding ESLint — first as a *non-blocking* signal — gives the
team a ratchet without a disruptive day-one cleanup.

## Current state

- `qualia-shell/package.json` `scripts`: `dev / build / preview / test / e2e*` — **no `lint`**. `devDependencies` has no eslint/prettier/biome (verified by grep).
- No `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `biome.json`, `.editorconfig`, `.husky/` anywhere.
- `Scripts/gate.sh` is the strict gate runner (tsc → vitest → 2 builds → PII → SSR smoke). It is the natural place to add a lint step.
- Conventions: ESM, TypeScript 5.6, React 19, Vite 6. Use ESLint **flat config** (`eslint.config.js`, ESM) — the modern form for this toolchain.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install (Mac) | `cd qualia-shell && npm install` | exit 0 |
| Lint (after setup) | `cd qualia-shell && npm run lint` | runs (warnings allowed initially) |
| Count problems | `cd qualia-shell && npx eslint . -f json \| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log('errors',r.reduce((a,f)=>a+f.errorCount,0),'warnings',r.reduce((a,f)=>a+f.warningCount,0))})"` | prints counts |

> All commands run on the Mac (sandbox can't `npm install`).

## Scope

**In scope**:
- `qualia-shell/eslint.config.js` (create)
- `qualia-shell/package.json` (add devDeps + `"lint"` script)
- `Scripts/gate.sh` (append a **non-blocking** lint step)

**Out of scope**:
- Do NOT mass-fix lint findings in this plan. No `eslint --fix` across the repo, no touching component source to clear warnings. This plan installs the tool only.
- Do NOT add Prettier or a pre-commit hook here (separate decision; can be a follow-up).
- Do NOT make lint blocking in CI yet.

## Git workflow

- Branch: `advisor/003-eslint`
- Commits: `chore(lint): add eslint flat config + non-blocking gate step`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Add dependencies

Add to `qualia-shell` devDependencies (pick current versions at install time):
`eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `globals`.

**Verify (Mac)**: `cd qualia-shell && npm install` → exit 0; `npx eslint --version` prints a version.

### Step 2: Create `qualia-shell/eslint.config.js` (flat config)

Target `src/**` and `app/**`. Compose `typescript-eslint` recommended (non-type-checked to start — fast), `react-hooks` recommended, `jsx-a11y` recommended. Ignore `build/`, `dist/`, `dist-external/`, `node_modules/`, `*.cjs`, `scratch/`, `blast/`, `electron/`, `e2e/` baselines. Set initially-noisy rules to `"warn"` (e.g. `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`) so the first run does not fail the build. Keep `react-hooks/rules-of-hooks` as `"error"` (genuine bugs) and `react-hooks/exhaustive-deps` as `"warn"`.

Target shape (illustrative — adjust to installed API):
```js
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['build/**','dist/**','dist-external/**','node_modules/**','**/*.cjs','scratch/**','blast/**','electron/**','e2e/**'] },
  ...tseslint.configs.recommended,
  { files: ['src/**/*.{ts,tsx}','app/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
    } },
);
```

**Verify (Mac)**: `cd qualia-shell && npx eslint . ` runs to completion (non-zero exit is OK at this stage if only warnings; if it errors out on *config*, that's a STOP).

### Step 3: Add the `lint` script

Add `"lint": "eslint ."` to `qualia-shell/package.json` scripts.

**Verify**: `cd qualia-shell && npm run lint` executes eslint.

### Step 4: Wire a non-blocking lint step into the gate

In `Scripts/gate.sh`, after the `tsc` step, add a lint invocation that **does not fail the gate** (e.g. `( cd qualia-shell && npm run lint ) || echo "[gate] lint reported issues (non-blocking)"`). Keep it advisory.

**Verify (Mac)**: `bash Scripts/gate.sh` still reaches GREEN (lint output appears but doesn't abort).

### Step 5: Record the baseline counts

Run the count command from the table and paste the error/warning totals into the PR description and the `plans/README.md` row note, so a future plan can ratchet specific rules to `error`.

## Test plan

No new unit tests. Verification = eslint runs cleanly as a *tool* (config loads, no crash) and the gate stays green with the non-blocking step.

## Done criteria

- [ ] `cd qualia-shell && npm run lint` runs ESLint (exit code may be non-zero from warnings — acceptable)
- [ ] `npx eslint --version` works; config at `qualia-shell/eslint.config.js` loads without a config error
- [ ] `bash Scripts/gate.sh` reaches GREEN with the lint step present and non-blocking
- [ ] Baseline error/warning counts recorded in the PR + `plans/README.md` note
- [ ] No source files under `src/`/`app/` were modified to clear warnings (`git status` shows only config + package.json + gate.sh)
- [ ] `plans/README.md` row updated

## STOP conditions

- ESLint reports **errors in the thousands** such that even non-blocking output is unusable — STOP, report the counts, and propose narrowing the rule set (don't disable everything or auto-fix en masse).
- The flat-config API of the installed `typescript-eslint` differs from the excerpt and you can't get a clean config load after two attempts — STOP and report the version + error.
- Making the gate non-blocking is not achievable without restructuring `gate.sh` significantly — STOP and report (a tiny wrapper should suffice).

## Maintenance notes

- Follow-up (not this plan): once the warning backlog is triaged, ratchet `exhaustive-deps` and `no-unused-vars` to `error` and make the CI step blocking.
- Reviewer: confirm no component source changed; confirm the gate still goes green; sanity-check the ignore list doesn't accidentally cover `src/`.
- This pairs naturally with several other findings (the hooks-deps warnings will flag the effect-cleanup leaks noted elsewhere in the audit).
