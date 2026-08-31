/**
 * Getting-started guide (plan 047 §6; rewritten 2026-08-20 after phase 1+2 +
 * Cockpit shipped). A TS string rather than a `?raw` import — the repo has no
 * raw-import precedent and tsc -b must stay green.
 * Rendered by components/Guide/Guide.tsx via react-markdown + remark-gfm.
 */
export const GETTING_STARTED_MD = `# Getting started with Dwellium

Dwellium is your property-management desk: one screen for your properties, your inbox, and an AI team that does real work. This guide takes a brand-new user from sign-in to productive in about an hour — skim the first two sections now, come back for the rest.

## 1 · Sign in

- **Continue with Google** on the front door — one click, no password to remember. Your workspace (layouts, keys, notes, theme) follows your account to any machine.
- Residents have their own door: **Resident? Sign in here** goes to the Tenant Portal, never this admin desk.

## 2 · Your first ten minutes

The **Get to your first win** card (bottom-left) first asks how you use Dwellium — *I run the properties* (owner-operator) or *I help manage them* (staff); the sidebar arranges itself (owners start with Property Management open, staff start lean). Then it tracks three steps and checks them off as you go:

1. **Add an AI key** — ARA and every AI widget run on *your* key (Anthropic, OpenAI, Gemini, or a local model). The card's button opens **API Keys**; paste one key and you're done. Keys are encrypted and sync only to your account.
2. **Bring your data** — add your first property in Strata (the card's button lands you in the Properties module).
3. **Ask ARA** anything ("Which leases end in the next 60 days?"). Your first ARA reply unlocks the AI Tools group.

Want to see the app full before importing anything? **Settings → Data → Demo workspace** fills Strata with a clearly-bannered sample portfolio — *Replace with your data* is one click, and demo data never touches your real records.

## 3 · Learn the shell (five things, two minutes)

| # | Thing | The habit |
|---|---|---|
| 1 | **⌘K** (the pill at the top) | The one shortcut to learn. Type any widget name, or a sentence — "open strata on the right". \`help:\` lists the guides; \`labs:\` opens the hidden experimental widgets. |
| 2 | **?** (anywhere, not while typing) | The shortcut sheet: every key, plus *Getting started*, *Tools hub* and *Replay first-run*. |
| 3 | **Sidebar tiers** | Pinned five on top (ARA · Strata · Scribe · Inbox Zero · Task Board), then Property Management, AI Tools, Filing Cabinet. Long groups say *Show N more*. Hover anything for a one-line description. |
| 4 | **First-open tips** | The first time you open a widget: what it does, one thing to try, related widgets. *Got it* dismisses; the titlebar **?** brings it back. |
| 5 | **Layouts** | *Control Panel → Interface Layout*: **Classic desktop** (floating windows), **Holocron OS** (launcher), or **Cockpit** — a four-pane IDE view: navigation · ARA chat · terminal + background tasks · browser preview. Escape returns to Classic. In every layout, any tab or window can pop out into its own browser window (drag it out of the tab strip, or click its **⧉**), be dragged to another monitor, and dock back into whatever layout you're in via its **⇤ Dock Back** button. |

Everything autosaves — the **Saved ✓** pill near the bottom is your receipt. If it says *Offline — will retry*, keep working; it syncs when the connection returns.

Close anytime — nothing asks "are you sure". Everything is saved as you work, and signing back in puts you exactly where you left off: same windows, same tabs, same document, with one quiet *Restored…* note. Prefer a clean desk? **⌘K → Fresh start** (also in the Control Panel) reopens the default workspace — it only changes what's *open*, never your data.

## 4 · Meet your AI team

- **ARA** (pinned, opens on login) is the main assistant. Starter chips suggest first questions per persona; replies **stream in live**; the composer has voice input and file upload. Once a day ARA posts **Today at a glance** — up to three things worth doing, built from your real tasks, inbox and leases.
- **The morning brief** arrives every day at 7 AM Eastern, generated server-side — you don't need the app open. Look for the badge on ARA's sidebar icon and the *Your morning brief is ready* banner. Want an OS notification too? **Control Panel → Activation Center** → toggle it on.
- **Hermes** runs multi-step jobs in the background while you work (watch them in the Cockpit's *Background tasks* pane or the Honcho/Hermes panel).
- ARA also reads your **Library** — a mirror of your NotebookLM notebooks (contracts, housing law, requirements) — and cites sources by title; the reply shows a *Library · N* chip. Synced from a Mac with \`tools/notebooklm/sync.sh\`; the NotebookLM widget shows what's in it and when it last synced.
- No key yet? AI widgets show one **Add a key** button — they never fail silently.

## 5 · Run the properties

- **Strata Dashboard** is the main desk: Overview KPIs, then Properties, Leasing, Residents, Vendors, Owners, Accounting, Maintenance, Reporting down the left rail. Search it with **⌘⇧F**.
- **Leasing**: approved lease documents grow a **Send for e-signature** button once E-Sign is connected (see the Tools hub below).
- **Inbox Zero** triages email to the right place; **Task Board** is the shared kanban; **Scribe** writes documents — including Interactive Docs you can publish to a link, export to PPTX/DOCX, or send for signature. Drag a file straight from Finder into the Scribe editor: text/markdown inserts, images upload and embed.
- **Whiteboard** (pinned in Property Management) is a full Excalidraw canvas — floor plans, maintenance markup. Your drawings save per-account automatically; drop an image or an \`.excalidraw\` file from Finder right onto the canvas.

## 6 · The tool shed (Tools hub)

Open **Tools hub** (Filing Cabinet, or \`help: tools\`). Ten open-source tools live here; every row shows its live status:

- **Ready** — opens right now: **Whiteboard**, **Design Studio** (Penpot's free cloud, opens in a new tab), **Dictation** (see below), **Remote Support** (RustDesk's free community servers by default — a private relay is optional), and **Links & QR** (QR door sheets need no account; hosted Dub is optional).
- **Set up** — the widget is shipped and turns on the moment its one setting exists; the button opens the setup notes:

| Tool | What it does for you | What turns it on |
|---|---|---|
| **E-Sign** (Documenso) | Leases and renewals signed online, tracked | A free Documenso account + \`VITE_DOCUMENSO_URL\` |
| **Scheduling** (Cal.com) | Showings and vendor visits booked from a link | A free cal.com booking page + \`VITE_CALCOM_URL\` |
| **Broadcasts** (listmonk) | Resident/owner mailing lists and notices | The listmonk server (tools/listmonk) + \`VITE_LISTMONK_URL\` |
| **Photo Vault** (Immich) | Inspection and move-in/out photos, searchable | The office-Mac Immich (tools/immich) + \`VITE_IMMICH_URL\` — viewing needs Tailscale on your device |
| **AppFlowy Workspace** (AppFlowy) | Notion-style docs, grids and kanban — lease tracker, vendor board, SOPs (templates in tools/appflowy) | A free AppFlowy account (appflowy.com/app) or self-host (tools/appflowy) + \`VITE_APPFLOWY_URL\` |

- **Dictation** (FluidVoice, Mac): *Control Panel → Dictation* → install with one brew command, click **Copy vocabulary** to teach it your property terms, then talk into any Dwellium field.

All AGPL tools run **unmodified**; every customisation lives inside Dwellium.

For a whole **AI company** — not one tool — open **Automation Hub → AI Company (OpenOPC)** and click *Open console*: OpenOPC recruits an org of role agents and drives a live kanban toward your goal, escalating decisions to you. It runs in an OpenOPC runner **you** host on a sandbox/VM — those agents execute code and drive a browser, so it never runs inside Dwellium and never touches tenant or financial data.

## 7 · Stress-test a big decision (Advisory Board)

Some calls are worth slowing down for: renewal pricing, hiring, taking on a property, changing an offer. The **5 Persona Advisory Board** on the Holocron **Home** page runs those through five strategic lenses that are made to disagree with each other, then gives you one decision brief.

![The board on Holocron Home](/demo/advisory-board/01-diagram.png)

**How it works — the CRIT loop:**

1. **Context** — type the decision in one line ("Raise renewal rents 6% at Woodland Parc, or hold at 3%?").
2. **Interview** — the board asks up to three focused questions *before* advising. Answer them; that is where the value comes from. (You can skip, and it will state its assumptions instead.)
3. **Role** — five lenses read the same evidence: Product Clarity, Risk and Capital, Scale and Systems, Offer Strength, and your Future Self.
4. **Task** — you get the disagreement between them, a Future Self check, and a final brief with a next action.

Each lens argues its own corner. The risk lens does the arithmetic on downside:

![Risk and Capital Lens](/demo/advisory-board/lens-risk.png)

...while the offer lens pushes on whether the thing is even sellable:

![Offer Strength Lens](/demo/advisory-board/lens-offer.png)

Then it lands on one brief you can act on this week:

![Final decision brief](/demo/advisory-board/08-final-brief.png)

**To use it:** Holocron **Home** → click any persona (or **Open the Advisory Board →**), or press **⌘K** and type *Advisory Board*. It opens on a worked example — the Woodland Parc renewal decision — so you can see the shape before running your own; hit **Run your own decision** to start. It runs on your own AI key, and any single lens can be re-asked on its own with **Ask just this lens**.

These are interpretive strategic lenses inspired by publicly documented principles — not impersonations of, or affiliated with, the people named.

## 8 · It follows you everywhere

Log in from any machine and everything is there: layouts, whiteboards, notes, tasks, your encrypted keys, even which tips you've seen. The only exception is Photo Vault, which is private to your Tailscale network by design — install Tailscale on the new machine to see photos.

## 9 · Shortcuts worth keeping

| Keys | Does |
|---|---|
| **⌘K** | Open anything / search / ask |
| **?** | Shortcut sheet + guides |
| **⌘⇧F** | Search inside Strata |
| **⌘W** | Close the front window — or the active tab in Holocron / the Cockpit |
| **⌘J** | Toggle OpenJarvis |
| **Esc** | Close sheets, menus and popovers · leave the Cockpit — never your windows |
| **Double-click a titlebar** | Maximize / restore the window |
| **Middle-click a tab** | Close it (Holocron & Cockpit tab strips) |

## Stuck?

Press **?** → *Getting started* re-opens this guide; *Replay first-run* brings back the three-step card and re-arms the tips. Every widget's titlebar **?** re-shows its tip. And ARA has read this guide — asking it "how do I…" is always a fine first move.
`;
