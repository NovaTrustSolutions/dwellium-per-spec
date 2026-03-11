# Automation Hub — Findings

## B.L.A.S.T. Discovery Answers (Per Automation)

### 1. Zero-Touch Transcript Pipeline
- **North Star**: Eliminate manual transcription, renaming, and filing of audio recordings.
- **Integrations**: OpenAI Whisper API, Gemini Flash, iCloud/Google Drive. Keys: TBD.
- **Source of Truth**: Audio files in an "Ingest" drop folder.
- **Delivery Payload**: Transcribed + summarized file in "Processed Transcripts" folder; summary appended to Activity Log Google Doc.
- **Behavioral Rules**: Use strict naming format `YYYY-MM-DD_Speaker_Topic`. Never overwrite existing files.

### 2. Sunday Triage Email Auto-Drafter
- **North Star**: Continuously auto-triage incoming emails so Sundays are for decisions, not list-making.
- **Integrations**: Gmail API, GPT-4o, Google Docs. Keys: Gmail OAuth required.
- **Source of Truth**: Gmail inbox (high-priority senders: Chase, Elisa, Bo, Ilya).
- **Delivery Payload**: Summary bullets to Daily Activity Log; draft replies saved as Gmail Drafts.
- **Behavioral Rules**: Use "Diplomat" persona for replies. Apply "Forensic/Defensive" analysis style. Never send — only draft.

### 3. Automated Backup & Digital Twin Sync
- **North Star**: Nightly automatic sync of Google Drive to local SSD + Dropbox with zero manual effort.
- **Integrations**: rclone, Google Drive, Dropbox. Keys: rclone OAuth tokens.
- **Source of Truth**: Google Drive (primary "Source of Truth").
- **Delivery Payload**: Mirrored copies on local SSD and Dropbox.
- **Behavioral Rules**: Run silently at 3 AM. Alert only on failure.

### 4. Construction Watchdog (Lien Waiver & Invoice Tracking)
- **North Star**: Automated financial compliance tracking for $3.2M renovation history.
- **Integrations**: Trello (board email forwarding), OCR (Docparser/Zapier AI), Google Sheets. Keys: Trello API, Sheets API.
- **Source of Truth**: Forwarded contractor invoice emails → Trello board.
- **Delivery Payload**: Parsed data in "Project Financials" Google Sheet; auto-draft if Lien Waiver missing.
- **Behavioral Rules**: Always flag missing Lien Waivers. Never approve payment without waiver confirmation.

### 5. Cost-Plus Template Standardization
- **North Star**: Force vendors to report in Andy's data format instead of narratives.
- **Integrations**: Google Forms, Google Sheets. Keys: None (public form).
- **Source of Truth**: Vendor-submitted Google Form entries.
- **Delivery Payload**: Structured rows in a shared Google Sheet.
- **Behavioral Rules**: Reject narrative-style reports. Require: Date, Labor Hours, Materials Cost, Receipt Link.

### 6. Legal Template Library
- **North Star**: Reusable "litigation-grade" email snippets to avoid rewriting legal arguments.
- **Integrations**: Google Docs / Apple Notes. Keys: None.
- **Source of Truth**: Andy's past emails consolidated into a snippet library.
- **Delivery Payload**: Searchable library in Docs/Notes (future: Qualia module).
- **Behavioral Rules**: Snippet categories: Invoice Dispute, Assignment of Benefits, Scope Disputes.

### 7. Utility Watchdog Agent
- **North Star**: Auto-detect high power bills on vacant units and trigger immediate manager action.
- **Integrations**: Georgia Power (web scraper), Email trigger, Property management data. Keys: Portal credentials.
- **Source of Truth**: Monthly utility bill emails or portal scrape.
- **Delivery Payload**: High Priority Task for Manager: "Walk Unit Immediately" or Tenant Ledger chargeback.
- **Behavioral Rules**: If Usage > $50 AND Unit = Vacant → Critical Alert. If Date > Move-In → Chargeback.

## Widget Architecture Discovery
- Qualia Shell uses function components with CSS modules
- Registration: import in Desktop.tsx → WINDOW_COMPONENTS map → DockItem in hierarchy.ts
- Reference widget: HomeUpkeepAI (723 lines, tabbed UI with dashboard, alerts, systems, inspect tabs)
