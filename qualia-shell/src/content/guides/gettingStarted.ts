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

The **Get to your first win** card (bottom-left) walks you through three steps and checks them off as you go:

1. **Pick your role** — *I run the properties* (owner-operator) or *I help manage them* (staff). The sidebar arranges itself: owners start with Property Management open; staff start lean with Strata, Task Board and Inbox Zero.
2. **Add an AI key** — ARA and every AI widget run on *your* key (Anthropic, OpenAI, Gemini, or a local model). The card's button opens **API Keys**; paste one key and you're done. Keys are encrypted and sync only to your account.
3. **Bring your data** — add your first property in Strata, and **Ask ARA** anything ("Which leases end in the next 60 days?"). Your first ARA reply unlocks the AI Tools group.

Want to see the app full before importing anything? **Settings → Data → Demo workspace** fills Strata with a clearly-bannered sample portfolio — *Replace with your data* is one click, and demo data never touches your real records.

## 3 · Learn the shell (five things, two minutes)

| # | Thing | The habit |
|---|---|---|
| 1 | **⌘K** (the pill at the top) | The one shortcut to learn. Type any widget name, or a sentence — "open strata on the right". \`help:\` lists the guides; \`labs:\` opens the hidden experimental widgets. |
| 2 | **?** (anywhere, not while typing) | The shortcut sheet: every key, plus *Getting started*, *Tools hub* and *Replay first-run*. |
| 3 | **Sidebar tiers** | Pinned five on top (ARA · Strata · Scribe · Inbox Zero · Task Board), then Property Management, AI Tools, Filing Cabinet. Long groups say *Show N more*. Hover anything for a one-line description. |
| 4 | **First-open tips** | The first time you open a widget: what it does, one thing to try, related widgets. *Got it* dismisses; the titlebar **?** brings it back. |
| 5 | **Layouts** | *Control Panel → Interface Layout*: **Classic desktop** (floating windows), **Holocron OS** (launcher), or **Cockpit** — a four-pane IDE view: navigation · ARA chat · terminal + background tasks · browser preview. Escape returns to Classic. |

Everything autosaves — the **Saved ✓** pill near the bottom is your receipt. If it says *Offline — will retry*, keep working; it syncs when the connection returns.

## 4 · Meet your AI team

- **ARA** (pinned, opens on login) is the main assistant. Starter chips suggest first questions per persona; replies **stream in live**; the composer has voice input and file upload. Once a day ARA posts **Today at a glance** — up to three things worth doing, built from your real tasks, inbox and leases.
- **The morning brief** arrives every day at 7 AM Eastern, generated server-side — you don't need the app open. Look for the badge on ARA's sidebar icon and the *Your morning brief is ready* banner. Want an OS notification too? **Control Panel → Activation Center** → toggle it on.
- **Hermes** runs multi-step jobs in the background while you work (watch them in the Cockpit's *Background tasks* pane or the Honcho/Hermes panel).
- No key yet? AI widgets show one **Add a key** button — they never fail silently.

## 5 · Run the properties

- **Strata Dashboard** is the main desk: Overview KPIs, then Properties, Leasing, Residents, Vendors, Owners, Accounting, Maintenance, Reporting down the left rail. Search it with **⌘⇧F**.
- **Leasing**: approved lease documents grow a **Send for e-signature** button once E-Sign is connected (see the Tools hub below).
- **Inbox Zero** triages email to the right place; **Task Board** is the shared kanban; **Scribe** writes documents — including Interactive Docs you can publish to a link, export to PPTX/DOCX, or send for signature.
- **Whiteboard** (pinned in Property Management) is a full Excalidraw canvas — floor plans, maintenance markup. Your drawings save per-account automatically.

## 6 · The tool shed (Tools hub)

Open **Tools hub** (Filing Cabinet, or \`help: tools\`). Ten open-source tools live here; every row shows its live status:

- **Ready** — opens right now: **Whiteboard**, **Design Studio** (Penpot's free cloud, opens in a new tab), **Dictation** (see below).
- **Set up** — the widget is shipped and turns on the moment its one setting exists; the button opens the setup notes:

| Tool | What it does for you | What turns it on |
|---|---|---|
| **E-Sign** (Documenso) | Leases and renewals signed online, tracked | A free Documenso account + \`VITE_DOCUMENSO_URL\` |
| **Scheduling** (Cal.com) | Showings and vendor visits booked from a link | A free cal.com booking page + \`VITE_CALCOM_URL\` |
| **Broadcasts** (listmonk) | Resident/owner mailing lists and notices | The listmonk server (tools/listmonk) + \`VITE_LISTMONK_URL\` |
| **Links & QR** (Dub) | Short links + QR codes for notices and unit doors | A Dub workspace + \`VITE_DUB_URL\` |
| **Photo Vault** (Immich) | Inspection and move-in/out photos, searchable | The office-Mac Immich (tools/immich) + \`VITE_IMMICH_URL\` — viewing needs Tailscale on your device |
| **Remote Support** (RustDesk) | Take over the office PC or a kiosk to help | Install the client; relay config appears once \`VITE_RUSTDESK_RELAY\` is set |

- **Dictation** (FluidVoice, Mac): *Control Panel → Dictation* → install with one brew command, click **Copy vocabulary** to teach it your property terms, then talk into any Dwellium field.
- **Coming soon** — AppFlowy Workspace (phase 3 trial).

All AGPL tools run **unmodified**; every customisation lives inside Dwellium.

## 7 · It follows you everywhere

Log in from any machine and everything is there: layouts, whiteboards, notes, tasks, your encrypted keys, even which tips you've seen. The only exception is Photo Vault, which is private to your Tailscale network by design — install Tailscale on the new machine to see photos.

## 8 · Shortcuts worth keeping

| Keys | Does |
|---|---|
| **⌘K** | Open anything / search / ask |
| **?** | Shortcut sheet + guides |
| **⌘⇧F** | Search inside Strata |
| **⌘W** | Close the front window |
| **⌘J** | Toggle OpenJarvis |
| **Esc** | Close sheets · leave the Cockpit |

## Stuck?

Press **?** → *Getting started* re-opens this guide; *Replay first-run* brings back the three-step card and re-arms the tips. Every widget's titlebar **?** re-shows its tip. And ARA has read this guide — asking it "how do I…" is always a fine first move.
`;
