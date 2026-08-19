/**
 * Getting-started guide (plan 047 §6). A TS string rather than a `?raw`
 * import — the repo has no raw-import precedent and tsc -b must stay green.
 * Rendered by components/Guide/Guide.tsx via react-markdown + remark-gfm.
 */
export const GETTING_STARTED_MD = `# Getting started with Dwellium

## Your first five minutes

1. **Add an AI key** — ARA and every AI widget run on your own key. Open *API Keys* (⌘K → "api keys").
2. **Bring your data** — add your first property in *Strata → Residents*.
3. **Ask ARA** — open ARA and say hello. The first reply unlocks the *AI Tools* group in the sidebar.

The **Get to your first win** card (bottom-left) tracks these three. Pick your role on it once — *I run the properties* or *I help manage them* — and the sidebar arranges itself.

## The sidebar, tier by tier

| Tier | What | When you see it |
|---|---|---|
| **Pinned** | ARA · Strata · Scribe · Inbox Zero · Task Board | Always (staff: Strata · Task Board · Inbox Zero) |
| **Property Management** | Tenant Portal, Trello, Astra, Universal Shell, API Keys | Expanded by default for owner-operators |
| **AI Tools** | Agent Lab, Thought Weaver, Transcribe, Meeting Notetaker, … | Collapsed until your first ARA reply |
| **Filing Cabinet** | Files, Docs, PDF Gear, Notepad, Time Travel, **Tools hub**, **Guide** | Collapsed; long groups show *Show N more* |
| **Labs** | Terminal, Georgia Code, Foundry, Synthesis, … | Never in the sidebar — ⌘K \`labs:\` or the *+ Add widget* gallery |

## ⌘K does everything

- Type a widget name to open it, or a plain sentence ("open strata on the right").
- \`help:\` → Guide · Keyboard shortcuts · Tools hub; \`help: scribe\` opens Scribe **and** its tip.
- \`labs:\` → the hidden-door widgets.
- Press **?** anywhere (not in a text field) for the shortcut sheet.

## First-open tips

The first time you open a widget you get a three-line card: what it does, one thing to try, and related widgets. *Got it* (or 20 s) dismisses it for good — the titlebar **?** brings it back.

## Tools hub — the ten planned open-source tools

Open *Tools hub* (Filing Cabinet or \`help: tools\`). Every tool shows a status:

- **Coming soon** — not shipped yet (the button is disabled, phase shown).
- **Needs setup** — shipped, but its server URL isn't configured. Setup notes below.
- **Ready** — opens inside Dwellium.

### Setup notes

- **Whiteboard** (Excalidraw, MIT) — no server; ships as a native widget.
- **E-Sign** (Documenso, AGPL unmodified image) — self-host; set \`VITE_DOCUMENSO_URL\`. Leases and renewals get a *Send for signature* button.
- **Dictation** (FluidVoice, GPL-3) — Mac companion app; install it and dictate into any Dwellium field. No server.
- **Scheduling** (cal.diy, MIT) — self-host; set \`VITE_CAL_URL\`.
- **Broadcasts** (listmonk, AGPL via API) — self-host; set \`VITE_LISTMONK_URL\`; pick an email provider and DNS first (SPF/DKIM/DMARC).
- **Links & QR** (Dub, hosted API) — needs a Dub workspace; set \`VITE_DUB_URL\`.
- **Photo Vault** (Immich, AGPL unmodified) — self-host; set \`VITE_IMMICH_URL\`.
- **Design Studio** (Penpot, MPL-2.0) — launcher to a managed Penpot first; set \`VITE_PENPOT_URL\`.
- **Remote Support** (RustDesk, AGPL stock build) — launcher; set \`VITE_RUSTDESK_URL\`.
- **AppFlowy Workspace** (AGPL) — phase 3 trial only; set \`VITE_APPFLOWY_URL\`.

All AGPL tools run **unmodified** — every customisation lives in Dwellium.

## Replay the onboarding

Press **?** → *Replay first-run*. The role card returns, tips re-arm, nothing else changes.
`;
