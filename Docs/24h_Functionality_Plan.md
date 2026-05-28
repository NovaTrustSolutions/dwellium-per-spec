# Dwellium — 24-Hour "Make It Functioning" Plan

*Goal: take the app from "5 widgets work, the rest show offline/empty" to "the app visibly functions end-to-end" within 24 hours. Executed by Claude Code on the local Mac (now near-autonomous via the broadened permission allowlist). Ilya checks in at each milestone gate (~every 4–6h); Cowork verifies progress at each gate.*

---

## Premise (from the functionality audit)

- The frontend is built. **0 widgets are genuinely broken** — they're offline because their backend isn't running.
- **Master dependency:** the sibling Express backend (`../ai-dashboard369-file-manager`, `/api/*` on :3000) unblocks **~21 of 26 widgets**.
- **Second dependency:** an **LLM provider key** (OpenAI / Anthropic / Gemini) held *by the backend* unblocks the ~7 AI "brain" widgets.
- **Heavy/specialized services** (Stella Python agent + Honcho/Hermes; Georgia statute RAG index; NotebookLM/Google) each unblock 1 widget and may exceed a 24h window → these get **honest "unavailable" UX states** if they can't be stood up, rather than looking broken.
- Full per-widget inventory: `Docs/Functionality_Audit.md`.

## Hard rules for the whole effort

- **Secrets stay with Ilya.** Claude Code never creates accounts, never types API keys, never commits secrets. When a key/credential is needed, Claude Code prepares the `.env` slot and **stops for Ilya to paste the value**.
- **No production-source regressions to the committed app.** Work happens on a branch; the existing `main` (`f312b3d`) stays intact.
- **Every milestone ends with a verification artifact** (fresh screenshots + a working/broken table), not a claim.
- **Each milestone has a HALT/escalation condition** so a blocker surfaces at the next check-in, not at hour 24.

---

## Milestone 0 — Backend bring-up + TRUE baseline  ·  T+0 → ~T+4h  ·  **Check-in 1**

**The make-or-break gate.**

1. Detect whether `../ai-dashboard369-file-manager` exists relative to the repo. 
   - **If absent:** HALT. A full property-management API cannot be built in 24h. Report at Check-in 1 with options (locate it, restore from a backup/remote, or rescope to "static-mode demo polish"). *This is the single biggest risk — surfaced in the first 4 hours by design.*
   - **If present:** install deps, start it, seed its dev DB.
2. Resolve the **port mismatch**: frontend `config/api.ts` defaults to `:3002`, `.env` / `vite.config` proxy point at `:3000`. Pick one, set `VITE_API_URL` consistently, confirm the proxy.
3. Launch the frontend in **backend mode** against the live backend; log in for real (the auth flow hits `/api/auth/*`).
4. Capture a fresh screenshot pass of **all 26 widgets** → the real "what works with the backend up" baseline.

**Skills:** `engineering:system-design` (map the service topology), `engineering:debug` (connection failures).
**Check-in 1 deliverable:** backend-exists verdict (go/no-go), the corrected port/proxy config, and a true per-widget working/broken table with screenshots.

---

## Milestone 1 — Core data + auth + CRUD widgets (Class B)  ·  ~T+4 → T+10h  ·  **Check-in 2**

Get the ~13 backend-only widgets returning real data: auth/session, inbox, inbox-zero, tasks, trello-board, file-manager, doc-viewer, pdf-gear, notepad, template-generator, astra-dashboard, two-brains, thought-weaver (non-AI paths), terminal.

- Fix any endpoint/contract mismatches the baseline exposed (wrong path, payload shape, auth header).
- Verify each with a real interaction (create a task, open a file, etc.), not just a render.

**Skills:** `engineering:debug`, `engineering:code-review`, `data:*` (if data-shape issues).
**Check-in 2 deliverable:** property-management + productivity core fully functional end-to-end, with proof.

---

## Milestone 2 — AI "brain" widgets (Class C)  ·  ~T+10 → T+16h  ·  **Check-in 3**

Wire the LLM-backed widgets once the key is in place.

1. Claude Code prepares the backend `.env` LLM-key slot → **Ilya pastes the provider key** (Claude Code does not handle it).
2. Bring up: Hydra-AI (its 5 provider "heads"), Stella chat path, ARA Console / OpenJarvis, fact-check-log, home-upkeep photo analysis, transcription summaries.
3. For anything that needs a service not yet up, implement a clear, intentional "service unavailable — configure X" state (no blank/empty panels).

**Skills:** `engineering:debug`, `engineering:architecture`.
**Check-in 3 deliverable:** AI widgets responding to real prompts, or showing honest configured-status messaging.

---

## Milestone 3 — Specialized services + graceful degradation  ·  ~T+16 → T+21h  ·  **Check-in 4**

- Attempt the heavy integrations if time allows: Stella's Python agent process (+ Honcho/Hermes), Georgia-code statute index, NotebookLM. 
- Where a full stand-up isn't 24h-realistic, ship a clean, labeled "unavailable / setup required" state with a one-line how-to.
- Transcription mic/STT: validate the in-browser path (works locally with mic permission).
- Sweep all remaining offline/empty panels → each must be either working or intentionally, clearly degraded.

**Skills:** `engineering:debug`, `engineering:testing-strategy`.
**Check-in 4 deliverable:** every one of the 26 widgets is either functional or shows a deliberate, honest unavailable state — nothing looks "broken."

---

## Milestone 4 — Verification + reproducible bring-up  ·  ~T+21 → T+24h  ·  **Check-in 5 (final)**

- End-to-end pass across all widgets; full screenshot tour proving functionality.
- Write a **one-command bring-up runbook** (start backend + DB + frontend + any services) so the working state is reproducible, not a one-off.
- Commit the fixes on a branch; summarize what's functional, what's degraded-by-design, and what each degraded item needs.

**Skills:** `engineering:deploy-checklist`, `engineering:documentation`, `engineering:testing-strategy`.
**Final deliverable:** a functioning app + a runbook + an honest status sheet.

---

## Parallel execution mode — 3 Claude Code instances (optional accelerator)

**Use git worktrees, never 3 instances on one working directory** (concurrent edits to the same git index + files corrupt state). One repo, three isolated checkouts, three branches, merge at the end.

**Milestone 0 runs SOLO.** It is the make-or-break gate and produces the shared foundation (backend up, port/proxy fixed, true baseline). Nothing parallelizes until Check-in 1 clears.

**After Check-in 1, split Milestones 1–3 into 3 tracks** (chosen for minimal file overlap):

```bash
# from repo root, AFTER Milestone 0 is committed on feat/functionality-bringup:
git worktree add ../dwellium-trackA feat/track-a-core
git worktree add ../dwellium-trackB feat/track-b-ai
git worktree add ../dwellium-trackC feat/track-c-services
# open one `claude` in each folder
```

| Track | Scope (≈ Milestone) | Widgets |
|---|---|---|
| **A — Core/CRUD** | Milestone 1 | inbox, inbox-zero, tasks, trello, file-manager, doc-viewer, pdf-gear, notepad, template-generator, astra-dashboard, terminal |
| **B — AI brains** | Milestone 2 | hydra, stella (chat), ara-console, openjarvis, fact-check-log, home-upkeep-ai, transcription summaries |
| **C — Specialized + verify** | Milestone 3 + 4 | georgia-code, notebooklm, two-brains, thought-weaver, Stella agent process; plus the runbook + final test pass |

**Shared-resource rules (must hold across all 3):**
- **One backend** serves all three — do not start three; all point at the single Express server + DB.
- **One LLM key**, set once in the backend `.env` (Ilya pastes it; no instance handles the secret).
- **Distinct frontend ports** for screenshots: 5173 / 5174 / 5175.
- **Permission allowlist in `~/.claude/settings.json`** (user-global) so all three inherit the no-prompt rules — otherwise copy `.claude/settings.local.json` into each worktree.
- **File ownership for shared files** (widget registry, `config/api.ts`, shared CSS): one track owns each; others coordinate through it to avoid merge conflicts.

**Honest cost.** Expect ~1.7–2× speedup, not 3× — Milestone 0 is serial, the services track is mostly serial, and you take on 3 branches to merge + 3× the per-check-in verification load. Best leverage is running Track A and Track B concurrently; Track C trails.

**Track kickoffs are issued at Check-in 1**, assigned from Milestone 0's real baseline (which widgets are genuinely broken vs. merely keyless) — not pre-written, to avoid guessing before the backend is confirmed.

---

## 24h achievability — the honest conditions

24h to "functioning" is realistic **if and only if** the backend repo exists and runs. In that case Milestones 0–2 (backend + core + AI brains with a key) get the app visibly working, and Milestone 3 cleans up the long tail. If the backend is **missing or incomplete**, the goal must rescope at Check-in 1 — and you'll know that in the first 4 hours, not at the deadline. The exotic services (Stella agent, Georgia RAG, NotebookLM) are the parts most likely to land as "degraded-by-design" within 24h; that's expected and accounted for.
