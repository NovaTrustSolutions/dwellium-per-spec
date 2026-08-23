# Importing these templates into AppFlowy

Works the same on the hosted web app (`https://appflowy.com/app`) and a
self-host. Written against AppFlowy Web / desktop as of 2026-08. If a menu
label differs slightly in your version, the entry point is always the space's
**+** / **⋯** menu → **Import**.

## 1. Lease tracker (`lease-tracker.csv`) → Grid

1. In your workspace sidebar, hover the space name → **+** (or **⋯**) → **Import** → **CSV**.
2. Pick `lease-tracker.csv`. AppFlowy creates a **Grid** with the columns
   Unit · Resident · Monthly Rent · Lease Start · Lease End · Status · Renewal Date.
3. Tidy the field types (click a column header → Edit property): Monthly Rent
   → Number; Lease Start / Lease End / Renewal Date → Date; Status → Single
   select with options `Active`, `Expiring soon`, `Month-to-month`, `Vacant`.
4. Delete the EXAMPLE rows and enter real leases. The rows marked
   `EXAMPLE — replace with real resident` are placeholders only — no real
   resident data ships in this repo on purpose.
5. Optional: add a **Calendar** view on the grid (view switcher → **+** →
   Calendar, layout on Lease End) to see expirations by month, and a filter
   `Status = Expiring soon` view for renewals.

If your AppFlowy version has no CSV import entry: create an empty Grid, open
`lease-tracker.csv` in a spreadsheet, and copy-paste the rows — AppFlowy grids
accept multi-cell paste.

## 2. Vendor board (`vendor-board.md`) → Board

Markdown imports as a **document**, so the board takes one extra step:

1. **Import** → **Markdown** → `vendor-board.md`. You now have the reference
   doc with all vendor cards under their trade headings.
2. Create the actual kanban: space **+** → **Board**. Rename the default
   columns (or the grouping single-select options) to `Plumbing`,
   `Electrical`, `Landscaping`, `HVAC`.
3. Add one card per real vendor, copying from the imported doc. Give cards the
   properties named at the top of the doc (contact, phone, COI expiry, rate,
   properties served, last job). The doc's entries are all marked
   `(example)` — replace them with your real vendors and keep or delete the
   reference doc afterwards.

## 3. Property docs (`property-docs/*.md`) → documents

1. **Import** → **Markdown** and select the three files (or import one at a
   time): `move-in-checklist.md`, `inspection-sop.md`,
   `maintenance-escalation-policy.md`.
2. Each becomes its own page with headings, tables and checkboxes intact.
   Suggested structure: a "Property Ops" space containing all three plus the
   vendor board and lease tracker.
3. The checklist's `- [ ]` items import as todo blocks — duplicate the page
   per move-in (⋯ → Duplicate) so the master stays blank.

## 4. Optional: publish

AppFlowy can publish a page read-only (Share → Publish). Useful for the
move-in checklist or house rules if you want a link to hand to residents;
keep the vendor board and lease tracker private.
