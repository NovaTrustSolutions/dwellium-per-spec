# Dwellium Autobuild Backlog

Gap analysis against `specs/DWELLIUM_FEATURE_SPEC_v2.md` +
`specs/Dwellium_Features_and_Ideal_Dashboard.md` + the design system. Updated by
the autobuild loop. One feature = one local commit (nothing is ever pushed).

**Legend:** ✅ done (commit SHA) · 🔜 queued · 🔎 needs code verification before
implementing · ⏳ large / backend-dependent.

---

## ✅ Done (this branch, local, unpushed)

| Feature | Spec | Commit |
|---|---|---|
| Backend failure never logs you out — global reconnect banner | HARD RULE / 2.2 | `7e2cc63` |
| TrelloBoard B.L.A.S.T. card gate + AI card-suggest in add-card form | 1.2 / 8.x | `8555a75` |
| Remove persistent "Drag outside window to pop out" banner → compact Lucide tear-off grip; Lucide icon + tokenized colors | 2.7b / 3.4 / 3.5 | `7cb0b8f` |
| Layout grid / snap lines visible only in edit mode (drag/resize) | 2.8 | `d8b3b13` |

(Many earlier features shipped in prior cycles on this branch — see `git log`.)

---

## 🔜 Priority queue — explicitly-absent items first

1. **🔎 Scribe Brain-Dump / Intake tab (5.2)** — spec says "not currently in the
   Dwellium build." Sticky "Dump" tab in Scribe header → full-height intake;
   submit auto-prepends `# Prompt N` + timestamp, appends to thread brain-dump
   file, sends to agent (chat shows a compact link, not raw text); "Report"
   button appears after the first dump. *Verified absent:* no `Dump`/brain-dump
   UI in `components/Scribe/Scribe.tsx`. Backend: reuse existing scribe/agent
   endpoints; keep an offline-honest path.
2. **🔎 System-wide content search (2.5 / B1)** — the existing
   `components/GlobalSearch/GlobalSearch.tsx` is **Strata-entity-scoped**
   (properties/tenants/vendors), used only inside StrataDashboard. A prominent
   *content* search across documents/notes/files (keyword + semantic) is absent.
   Add a top-level search surface (widget or command-bar) over the doc corpus;
   reuse `Scribe/docSearch.ts` for the offline keyword path, backend semantic
   when online.
3. **🔎 Workspace root path visibility (2.4 / B1)** — show the workspace root
   path in the UI and make saved files navigable in the File Explorer. *Verified
   absent:* no `workspaceRoot`/"workspace path" surface in Workspace/Scribe.
   Needs a source of truth (config/API) for the root; surface it in the File
   Explorer header.
4. **🔎 Version button increments v1→v2→v3 (2.6)** — `scribeStore.ts` already
   calls `POST /api/scribe/version`. Verify whether it actually increments and
   preserves prior versions (spec says it sticks at "v1"). May be a
   backend-contract fix or a client increment bug; reproduce before changing.

## 🔜 UX / design-system fixes

5. **Header/chrome ratio ≤15–20% (2.7b / 3.5)** — title bar is currently 46px
   (`Window.css`), spec target 28–32px; nav tabs single row 32–36px; content
   ≥70–85%. (Pop-out banner already removed in `7cb0b8f`.)
6. **🔎 Tabs visible in all window states (2.7a)** — tabs reportedly disappear
   when a window is maximized; should stay visible/usable. Verify in
   `Window`/`TabBar`/region tab bars.
7. **🔎 Text size & density (2.10)** — larger readable defaults (body 15–16px,
   min 11px), comfortable spacing, clickable control sizes — esp. File Explorer,
   Inbox Zero, control panels. Audit against typography tokens (3.6).
8. **🔎 Theme/color uniformity (2.1)** — sweep for any remaining hardcoded hex in
   component stylesheets; every color must reference a CSS token so a theme = a
   token swap. (Window tear-off/drag-grip tokenized in `7cb0b8f`.)
9. **🔎 Panel positions — no float-over-document (2.7c)** — Contents left,
   minimap at editor right edge, ARA chat docked right column; none floating over
   the doc. Verify Scribe layout (`scribeLayoutStore`, `AraMiniPanel`,
   `Minimap`, `TableOfContents`).
10. **API provider Test button + live status (2.3)** — per-provider "Test"
    button + live connection-status indicator + clearly-visible active provider
    in the integrations/Control Panel.

## ⏳ Larger / backend-dependent (knowledge & agents)

11. RAG ingestion pipeline + namespace term isolation (7.1)
12. Three-tier wiki compilation (7.2) · synthesis/compounding loop (7.3)
13. Foundry capture→triage→review→admit (7.4)
14. Knowledge graph (d3-force, communities, gap detection) (7.5)
15. The Hive — agent cards/cost/triggers, Dreams panel, CoPaw capture (8.x)
16. Schema Producer · PRD synthesis · Gap-analysis agents (8.6–8.8)
17. Scribe: AI redlines (5.5), inline comments (5.6), paste variants (5.3),
    citation pill (5.4), focus mode / inline flags (5.11), sticky user msg (5.9)
18. File Explorer full capability set (4.3) · Domain→Project→Thread on disk (4.2)

---

### Working rules
- Full gate before every commit: `cd qualia-shell && npx tsc -b && npx vitest run
  && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build &&
  cd .. && node Scripts/verify_no_pii_leak.mjs`. Baseline ≥779 vitest; never drop.
- Backend offline → never log out; reuse `BackendConnectionBanner` +
  `backendStatusStore`. Colors via CSS vars. Lucide icons in chrome. Clean
  "not yet connected" placeholders, never a React error.
- Never push; never reset --hard / clean -fd / rewrite history.
