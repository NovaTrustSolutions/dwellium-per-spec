# Plan 002: Node version is specified once, consistently (Node 22)

> **Executor instructions**: Follow step by step; run each verification and confirm
> before moving on. Obey STOP conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/package.json .nvmrc netlify.toml README.md`
> If any changed, re-read it before proceeding; on a mismatch with "Current state", STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (pairs with plan 001, which fixes the README copy)
- **Category**: dx
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

The required Node version is declared four different ways with three distinct values:
README says ≥ 25.5.0, `package.json` `engines` says `>=20.0.0`, `.nvmrc` says `22`,
and `netlify.toml` builds on `22`. `engines` *permits* Node 20, but CI/Netlify build
on 22 — so a contributor on an `engines`-legal Node 20 can hit runtime/ABI surprises
the deploy pipeline never sees (this repo already has a documented `better-sqlite3`
Node-ABI footgun in `FUCKUPS.md` F-014). Standardizing on one number removes a whole
class of "works on my machine" confusion.

## Current state

- `qualia-shell/package.json:6-9` (`engines`): `"node": ">=20.0.0"`, `"npm": ">=10.0.0"`.
- `.nvmrc`: contains `22` (confirmed).
- `netlify.toml` `[build.environment]`: `NODE_VERSION = "22"`.
- `README.md:42`: "Node ≥ 25.5.0" (fixed separately in plan 001).
- De-facto truth = **22** (`.nvmrc` + Netlify already agree).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Show all four values | `grep -n "NODE_VERSION" netlify.toml; cat .nvmrc; grep -n '"node"' qualia-shell/package.json; grep -n "Node" README.md` | review |
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Install respects engines (Mac) | `cd qualia-shell && npm install` | exit 0, no `EBADENGINE` |

## Scope

**In scope**:
- `qualia-shell/package.json` (the `engines` block only)
- `.nvmrc` (confirm/normalize to `22`)
- `README.md` (only if plan 001 hasn't already set Node 22 — otherwise leave it)

**Out of scope**:
- `netlify.toml` — already `22`; do not change.
- Any dependency upgrade. This plan changes declared engines only, not installed packages.

## Git workflow

- Branch: `advisor/002-node-version`
- One commit: `chore(engines): standardize Node on 22 across engines/.nvmrc/README`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Set `engines` to Node 22

In `qualia-shell/package.json`, change `"node": ">=20.0.0"` to `"node": ">=22 <23"` (keep `"npm": ">=10.0.0"`).

**Verify**: `grep -n '"node"' qualia-shell/package.json` → shows `>=22 <23`.

### Step 2: Confirm `.nvmrc`

Ensure `.nvmrc` is exactly `22` (it already is — only act if drift check showed otherwise).

**Verify**: `cat .nvmrc` → `22`.

### Step 3: Reinstall to confirm the engine constraint is satisfiable

**Verify (Mac)**: `cd qualia-shell && npm install` → exit 0 with no `EBADENGINE` warning on the local Node (which should be 22 per `.nvmrc`).

## Test plan

No unit tests. Verification is `npm install` + `npx tsc -b` both clean under Node 22.

## Done criteria

- [ ] `grep -n '"node"' qualia-shell/package.json` shows `>=22 <23`
- [ ] `cat .nvmrc` is `22`; `grep NODE_VERSION netlify.toml` is `22`; README (post-001) says `22` — all four agree
- [ ] `cd qualia-shell && npm install` exits 0 with no engine error
- [ ] `cd qualia-shell && npx tsc -b` exits 0
- [ ] `plans/README.md` row updated

## STOP conditions

- `npm install` emits `EBADENGINE` (the local Node is not 22) — report; do not loosen `engines` to paper over it.
- A dependency in `package.json` declares it needs Node < 22 — STOP and report (don't downgrade the standard silently).

## Maintenance notes

- When bumping Node in future, change it in exactly these places (engines, `.nvmrc`, `netlify.toml`, README) together.
- Reviewer: confirm no `EBADENGINE` in the install log and that CI's Node matches.
