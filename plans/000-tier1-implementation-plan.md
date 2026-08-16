# Tier 1 — Implementation Plan (Quick-Win Hardening & Hygiene)

> **Planned at** commit `a619279`, 2026-06-20. This is the **umbrella** over ten small,
> low-risk changes. Each has its own executor plan in this folder (linked below); this
> document states the scope, audience, sequencing, risk, and verification for the batch.
> Per repo policy: every change is gate-green before commit, and **nothing is pushed
> without Ilya's explicit go.**

## What this is (in one line)

A coordinated batch of **10 small, low-risk fixes** — security hardening, first-load
performance, one privacy leak, and contributor hygiene. **No new features, no refactors,
no architecture or backend changes.**

## The changes (exactly what will change)

| # | Change | Type | File(s) | Before → After | Plan | Effort | Risk |
|--:|--------|------|---------|----------------|------|:------:|:----:|
| 1 | Defer the login video | perf | `Auth/LoginScreen.tsx` | 71 MB video autoplays on first paint → poster image; video loads only after the user clicks "Login" | [006](006-defer-login-video.md) | S | LOW |
| 2 | Close the markdown XSS hole | security | `utils/safeMarkdown.ts` (+ client entry, + test) | DOMPurify allowlists `onclick`/`style` → removed; code-copy button uses a delegated listener | [010](010-remove-onclick-from-sanitizer.md) | S | LOW |
| 3 | Mask Sentry Session Replay | security | `services/sentry.ts` | replay captures all text/inputs/media + sends email → masked; email dropped | [012](012-mask-sentry-replay.md) | S | LOW |
| 4 | Add security headers | security | `netlify.toml` | no headers → **report-only** CSP + `X-Frame-Options`/`nosniff`/`Referrer-Policy`/HSTS | [011](011-add-security-headers.md) | S–M | LOW (report-only) |
| 5 | Fix the README quick-start | docs | `README.md` | wrong build command (`vite build` is a no-op), wrong Node, wrong login → correct | [001](001-fix-readme-quickstart.md) | S | LOW |
| 6 | Unify the Node version | dx | `package.json`, `.nvmrc`, `README.md` | four declared values (25.5/20/22/22) → Node **22** everywhere | [002](002-unify-node-version.md) | S | LOW |
| 7 | Declare the phantom dependency | deps | `package.json` | `@huggingface/transformers` imported but undeclared → declared + pinned | [005](005-declare-transformers-dependency.md) | S | LOW |
| 8 | Stop the OpenJarvis mic on unmount | bug/privacy | `OpenJarvis/OpenJarvis.tsx` | mic stays live if the panel closes mid-record → tracks stopped on unmount | [016](016-stop-openjarvis-mic-on-unmount.md) | S | LOW |
| 9 | Stop eager-loading intro videos | perf | `HydraAI/HydraIntro.tsx`, the `AraIntroVideo` file, delete dead `halocron-intro.mp4` | `preload="auto"` + a dead 3 MB v1 → `preload="none"` + dead file removed | [007](007-trim-intro-videos.md) | S | LOW |
| 10 | De-clutter the repo root | dx | root → `Docs/archive/`, `Scripts/launch/` | 13 stale process docs + ~10 launch scripts at root → archived/relocated | [004](004-archive-root-clutter.md) | S | LOW |

Net effect: ~80–90 MB shaved off the unauthenticated first-load path; the active XSS
vector closed with a CSP net under it; secrets kept out of error telemetry; the mic
released reliably; and a repo a new contributor (or agent) can actually build and read.

## Who this is FOR

- **Every visitor / end user.** Changes 1 and 9 remove ~71 MB (login) plus several MB of
  intro-video pre-fetch from the path you hit *before and right after* logging in — a real
  first-load speedup, especially on mobile or slow links, and lower bandwidth cost.
- **You as operator, and every account holder (security).** Change 2 closes an active
  HTML→script XSS path that LLM/web/file content could reach; change 3 stops API keys and
  your email from being captured into third-party Sentry replays; change 4 adds a CSP +
  clickjacking/MIME hardening net. Together they make it materially harder for a malicious
  payload to read the in-browser provider keys or auth token.
- **Anyone who cares about mic privacy.** Change 8 ensures OpenJarvis doesn't hold the
  microphone open after its panel closes (OS mic indicator turns off).
- **New contributors and coding agents (including future Cowork/Claude sessions).**
  Changes 5, 6, 7, 10 mean the README actually builds, there's one Node version, no
  undeclared-dependency surprise, and a legible root — faster onboarding, less "works on my
  machine."
- **Maintainers.** Fewer build warnings, an honest dependency graph, a cleaner tree.

## Who this is NOT for (non-goals + who won't benefit)

- **Not for anyone wanting a refactor.** The god files (TranscriptionHub ~3.2k, ARAConsole
  ~2.9k, Stella ~2.9k lines) are untouched. That's Tier 3.
- **Not the agent-skill security work.** The `new Function` code-execution + untrusted-text
  piping in the skills/conductor layer (finding #19) is **not** addressed here — it's a
  separate, larger trust-boundary effort.
- **Not server-side auth, and not the secret-encryption upgrade.** Removing the committed
  god credentials (plan 014) and strengthening the derivable-key at-rest encryption (plan
  013) are **Tier 2** — not in this batch. After Tier 1, the deployed app's login is still
  client-side; this batch does **not** make it "securely authenticated."
- **Not a bundle/code-splitting re-architecture.** The big JS wins — lazy-loading the
  Halocron OS screens (#13) and moonshine's 2.37 MB (#14) — are **Tier 2**. Tier 1 perf
  touches media only, not the JS chunk graph.
- **Not feature work.** No ThoughtWeaver phone sync, no Gmail/Calendar OAuth, no new
  capabilities. Users waiting on those gain nothing from this batch.
- **Not a deep change for any single in-app workflow.** Someone who only lives in the
  Strata dashboard sees no Strata behavior change here (they still get the security +
  login-speed wins, but nothing module-specific).
- **Not a CI or backend change.** ESLint (#17) is Tier 2; the backend is a separate repo and
  is untouched. The only infra change is Netlify response headers.

## Sequencing & PR batching

Four independently shippable PRs (each gate-green before commit; no push without your go):

- **PR A — Docs/DX hygiene (zero runtime risk):** 005, 001, 002, 004.
- **PR B — Perf / media:** 006, 007.
- **PR C — Security core:** 010, then 012, then 011 (CSP **report-only**). Land 010 with or before 011.
- **PR D — Privacy bug:** 016.

Rationale: A is a risk-free warm-up; B is user-visible and safe; C is the security core
(010 fixes the XSS, 011 is the net under it); D is a one-liner. You can also run them as one
combined branch for a single gate pass, but smaller PRs review faster and isolate any
regression.

## Risk & blast radius

All ten are **LOW** risk. The only change with any breakage potential is the CSP (011) —
mitigated by shipping it **report-only**, which observes violations without blocking
anything. Media changes are reversible; there are no data migrations, no schema, no backend,
and no auth-flow changes in Tier 1.

## Verification (runs on the Mac — the Linux sandbox can't build/test)

- **Per plan:** each linked plan has machine-checkable Done criteria + STOP conditions.
- **Batch gate before any commit:** `bash Scripts/gate.sh` → GREEN (tsc + vitest + both
  builds + PII scan + SSR smoke). Build is `npm run build` — `npx vite build` is a no-op.
- **New tests** land with 010 (sanitizer strips `onclick`), and optionally 012 / 016 / 006.
- **Post-deploy (operator):** `curl -sI https://argyleholocron.netlify.app/ | grep -i content-security-policy-report-only` (011); Network tab shows **no** `nebula-bg.mp4` request before clicking (006).

## Rollout

Netlify deploys on push to `main`; you gate pushes. Recommended order: land PR A + B + D
first (pure wins), then PR C; watch the CSP report-only output for a few days before any
future *enforce* step — that enforcement is explicitly **out of Tier 1**.

## What NOT to touch (cross-cutting guardrails)

- No source edits beyond each plan's In-scope list.
- Do **not** flip CSP to enforcing in this batch.
- Do **not** change `loginLocal`/the auth flow, god-file internals, or the agent-skill
  executor here.
- Do **not** push or open a PR without Ilya's explicit go.
