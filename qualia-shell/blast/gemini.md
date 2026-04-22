# Automation Hub — Project Constitution

## Data Schemas

### `Automation` (Static Config)
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "category": "software | process",
  "icon": "string (emoji)",
  "setupTime": "string",
  "annualTimeSaved": "string",
  "integrations": ["string"],
  "status": "active | paused | draft",
  "schedule": {
    "enabled": false,
    "cron": "string | null",
    "nextRun": "ISO string | null"
  }
}
```

### `AuditLogEntry` (Per-run record)
```json
{
  "id": "string",
  "automationId": "string",
  "timestamp": "ISO string",
  "durationMs": "number",
  "result": "success | failure | partial",
  "summary": "string",
  "details": "string | null"
}
```

## Behavioral Rules
1. **No Auto-Execution**: Automations never execute without explicit user action (Launch button or Scheduled trigger).
2. **Audit Everything**: Every run, success or failure, must produce an AuditLogEntry.
3. **10-Layout Limit**: Schedule configs persist in localStorage keyed by user ID.
4. **Visual-First**: The widget is a dashboard; actual backend scripts live in `tools/` (future phase).

## Architectural Invariants
- Widget follows same pattern as all Qualia Shell widgets (function component, CSS module, registered in Desktop.tsx + hierarchy.ts).
- All state is local/localStorage for MVP. Backend integration is Phase 2.
- The 7 automations from the report are hardcoded as seed data.

## Identified Automations (7 Total)

| # | Name | Category | Integrations | Setup | Annual Savings |
|---|------|----------|-------------|-------|----------------|
| 1 | Zero-Touch Transcript Pipeline | Software | Whisper API, Gemini Flash, iCloud/Drive | 2h | 52h |
| 2 | Sunday Triage Email Auto-Drafter | Software | Gmail API, GPT-4o, Google Docs | 4h | 156h |
| 3 | Automated Backup & Digital Twin Sync | Software | rclone, Google Drive, Dropbox | 0.5h | 26h |
| 4 | Construction Watchdog | Software | Trello, OCR/Docparser, Google Sheets | 3h | 52h |
| 5 | Cost-Plus Template Standardization | Process | Google Forms/Sheets | 1h | 26h+ |
| 6 | Legal Template Library | Process | Google Docs/Notes | 2h | 52h |
| 7 | Utility Watchdog Agent | Software | Georgia Power Scraper, Email | 2h | 52h |
