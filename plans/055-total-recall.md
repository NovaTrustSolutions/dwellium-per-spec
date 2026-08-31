# Plan 055 — Total Recall: Dwellium never forgets where Andy was

> 2026-08-30, Ilya: Dwellium must be the one-stop shop — no window-switching, and
> anything being worked on saves on close and reopens at the EXACT point it was
> left. Priorities: ease of use, onboarding, intuitive actions, flawlessly
> integrated AI.
>
> **Audit (verified 2026-08-30):** window list is `useState([])` in
> `WindowContext.tsx:184` — nothing restores; the "default stack" (ARA+Strata)
> masks it. Holocron's open-tab set and Fluid's cockpit tabs are not persisted
> (only enabled/split flags are). Scribe starts with `openFiles: []` every
> mount. Already solid: ARA conversations (per mode), whiteboard boards, dock,
> all per-user One Save stores, popout/dock-back. The foundation exists; the
> desktop itself is amnesiac.

## Phase 1 — The desktop remembers (core session restore)
Persist the live session per user + per layout via One Save: Classic window list
(component id, geometry, z, minimized, group), Holocron open tabs + active tab,
Cockpit tabs + active. Restore on login/reload exactly; run the default stack
ONLY when there is nothing to restore. Debounced writes; `beforeunload`/
`visibilitychange` flush so a closed window never loses the last edit.
**Done means:** open 4 widgets across layouts, move/resize, close the browser,
reopen, sign in → pixel-identical desktop (same windows, positions, active
tabs); fresh account still gets the default stack.
**Verify:** new vitest suites (persist/restore round-trip, Andy≠Lisa, legacy-
empty → default stack) + the Playwright rig: seed session → open/move → reload →
assert geometry deep-equal; full gate exit-0.

## Phase 2 — Every widget reopens at its exact point (resume-point primitive)
One tiny primitive `useWidgetMemory(widgetId, slice)` (per-user, One Save,
debounced) for view state, adopted by the daily-driver widgets:
Scribe (open files, active file, cursor/scroll per file), Strata (module,
selected entity, search), Inbox Zero (selection/filter), Task Board (filters),
E-Sign / Broadcasts / Links / Photo Vault / Scheduling (active tab), Tools hub +
Guide (scroll), Research Lab (provider/model/prompt draft). Unsent drafts
(ARA composer, Broadcasts campaign body, Scribe comments) flush on blur/close.
**Done means:** for each listed widget — put it in a distinctive state, reload,
reopen → identical view incl. drafts.
**Verify:** per-widget vitest (state round-trip through the primitive) + rig
screenshots before/after reload diffed by eye for the report; full gate exit-0.

## Phase 3 — Continuity UX (ease of use)
"Welcome back" moment on login: session restored silently + one quiet toast
("Restored 4 windows — you were editing *Woodland Parc lease* in Scribe ·
Fresh start") with a Fresh-start escape; ⌘K gains a **Resume** group (last 5
touched widgets/docs, from the same memory); closing a widget never prompts —
everything is already saved (kill any lingering confirm dialogs).
**Done means:** login lands where Andy left off with one unobtrusive toast; ⌘K
top section = his recent work; zero "are you sure / unsaved changes" dialogs
remain anywhere.
**Verify:** rig video/screens of close→reopen→toast; grep proves no
beforeunload confirm prompts; vitest for the Resume provider + toast logic.

## Phase 4 — AI woven into the resume flow
ARA opens knowing the context: a "You were last working on …" chip built from
the session memory (widget + doc title only — same data boundaries as today),
one starter chip "Pick up where I left off" that expands into a real prompt;
the 7 AM morning brief gains a "Left off" line; Scribe selection toolbar's ARA
action pre-fills with the active doc context (already partially wired — finish).
**Done means:** open ARA after a restored session → the chip names the real
last-touched doc/widget; clicking the starter produces a grounded reply
(local rig with a key, or asserted at prompt level in tests without one).
**Verify:** vitest on chip/prompt construction from seeded memory; brief line
asserted in the backend brief test; rig screenshot.

## Phase 5 — Onboarding & intuitive-actions polish (measured, not vibes)
Re-run the first-run flow end-to-end on the rig and time-to-first-win; sweep
for unintuitive actions (double-click titlebar = maximize, Esc consistency,
middle-click tab close, drag-anywhere affordances) and fix the top 5 found;
update the Guide §2/§3 for the new continuity behavior.
**Done means:** the sweep's findings list is produced with fixes for the top 5;
guide matches reality; first-run rig pass recorded.
**Verify:** the findings list with before/after screenshots; full gate; CI green.

## Log
- 2026-08-30: plan created from the persistence audit; phases 1+2 dispatched to builders.
- 2026-08-31: phase 5 done. Part A rig (screenshots + findings.json in the session scratchpad `p5-shots/`): fresh-run shell interactive ~0.9 s, FirstRunCard ~1.2 s, full three-step walk ~12 s; returning-run restore + toast + ⌘K Resume + ARA chip all verified live. Measurement caught a real phase-3 bug: the welcome-back toast said "Restored 16 windows" for a 2-window session (restore summary accumulated across StrictMode/remount re-runs) — fixed. Top-5 intuitive-action fixes shipped: (1) truthful restore summary, (2) middle-click closes tabs in Holocron + Cockpit, (3) Finder-drag onto Scribe/Whiteboard unblocked (shell drag blocker now honors `.cm-editor` + `[data-dwellium-drop-zone]`), (4) Esc never closes windows — it dismisses transient chrome (grep-suite enforced), (5) ⌘W closes the active OS-shell tab (capture-phase; hidden Classic windows safe). Titlebar double-click maximize already existed — verified + documented. Guide §2/§5/§9 truth-passed. Not-fixed findings → PONYTAIL-DEBT.md (5 rows with triggers). Full gate: tsc 0, eslint 0 errors on touched, vitest 310 files / 2814 tests exit 0, NETLIFY build exit 0.
