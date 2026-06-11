/**
 * Automation Hub — B.L.A.S.T. Workflow Automation Dashboard
 *
 * Displays all 7 workflow automations from the Efficiency Plan.
 * Each automation card has:  Launch · Settings (schedule) · Status badge
 * Tabs: Automations | Audit Log
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import './AutomationHub.css';
import { API_BASE } from '../../config';

const API_AUTOMATIONS = `${API_BASE}/api/automations`;

// ============================================
// TYPES
// ============================================

interface AutomationSchedule {
    enabled: boolean;
    frequency: 'manual' | 'hourly' | 'daily' | 'weekly' | 'monthly';
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
}

interface AutomationNotifications {
    onSuccess: boolean;
    onFailure: boolean;
    email: string;
}

interface AutomationRetryPolicy {
    maxRetries: number;
    retryDelay: number; // seconds
}

interface Automation {
    id: string;
    name: string;
    description: string;
    category: 'software' | 'process';
    icon: string;
    setupTime: string;
    annualSaved: string;
    integrations: string[];
    status: 'active' | 'paused' | 'draft';
    schedule: AutomationSchedule;
    notifications: AutomationNotifications;
    retryPolicy: AutomationRetryPolicy;
    timeout: number;
    envVars: Record<string, string>;
    tags: string[];
    notes: string;
    requiresApproval: boolean;
    owner: 'andy' | 'lisa';
    setupGuide: string[];
}

type OwnerTab = 'andy' | 'lisa';

interface PendingApproval {
    id: string;
    automationId: string;
    automationName: string;
    automationIcon: string;
    requestedAt: string;
    description: string;
    status: 'pending' | 'approved' | 'rejected';
}

interface AuditLogEntry {
    id: string;
    automationId: string;
    automationName: string;
    timestamp: string;
    durationMs: number;
    result: 'success' | 'failure' | 'partial';
    summary: string;
}

type SettingsTab = 'general' | 'schedule' | 'integrations' | 'execution' | 'notifications';

const SETTINGS_TABS: { key: SettingsTab; label: string; icon: string }[] = [
    { key: 'general', label: 'General', icon: '📝' },
    { key: 'schedule', label: 'Schedule', icon: '🕐' },
    { key: 'integrations', label: 'Integrations', icon: '🔗' },
    { key: 'execution', label: 'Execution', icon: '⚡' },
    { key: 'notifications', label: 'Alerts', icon: '🔔' },
];

const EMOJI_PICKER = ['🎙️', '📧', '☁️', '🏗️', '📋', '⚖️', '⚡', '🤖', '🔧', '📊', '🛡️', '🏠', '💡', '📦', '🔍', '🌐', '📡', '🧠', '🎯', '💰'];

const DEFAULT_NOTIFICATIONS: AutomationNotifications = { onSuccess: false, onFailure: true, email: '' };
const DEFAULT_RETRY: AutomationRetryPolicy = { maxRetries: 0, retryDelay: 30 };

// ============================================
// SEED DATA — 7 Automations from Report
// ============================================

function seedAutomation(base: Partial<Automation> & { id: string; name: string; description: string; category: Automation['category']; icon: string; setupTime: string; annualSaved: string; integrations: string[] }): Automation {
    return {
        ...base,
        status: base.status ?? 'draft',
        schedule: base.schedule ?? { enabled: false, frequency: 'manual', time: '09:00' },
        notifications: base.notifications ?? { ...DEFAULT_NOTIFICATIONS },
        retryPolicy: base.retryPolicy ?? { ...DEFAULT_RETRY },
        timeout: base.timeout ?? 300,
        envVars: base.envVars ?? {},
        tags: base.tags ?? [],
        notes: base.notes ?? '',
        requiresApproval: base.requiresApproval ?? false,
        owner: base.owner ?? 'andy',
        setupGuide: base.setupGuide ?? [],
    };
}

const AUTOMATIONS_SEED: Automation[] = [
    // ── Andy's Automations ──
    seedAutomation({
        id: 'auto-1', name: 'Zero-Touch Transcript Pipeline', description: 'Watch a drop folder → Whisper transcription → Gemini summary → auto-rename & file.', category: 'software', icon: '🎙️', setupTime: '2h', annualSaved: '52h', integrations: ['Whisper API', 'Gemini Flash', 'Google Drive'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, envVars: { WHISPER_MODEL: 'large-v3', OUTPUT_DIR: '/transcripts' }, tags: ['ai', 'transcription'], owner: 'andy', setupGuide: [
            'Open the Settings panel and go to the Integrations tab.',
            'Make sure "Whisper API" and "Google Drive" are listed. If not, type them in and press Enter.',
            'Go to the Integrations tab and set WHISPER_MODEL to "large-v3".',
            'Set OUTPUT_DIR to the folder where you want transcripts saved (like /transcripts).',
            'Drop an audio file into your watch folder to test it.',
            'Click ▶ Launch to run it. The system will transcribe, summarize, and file it for you.',
        ]
    }),
    seedAutomation({
        id: 'auto-2', name: 'Sunday Triage Email Auto-Drafter', description: 'Auto-analyze high-priority emails → summarize to Activity Log → draft replies.', category: 'software', icon: '📧', setupTime: '4h', annualSaved: '156h', integrations: ['Gmail API', 'GPT-4o', 'Google Docs'], schedule: { enabled: false, frequency: 'daily', time: '07:00' }, envVars: { MAX_EMAILS: '50', PRIORITY_FILTER: 'high' }, tags: ['email', 'ai'], requiresApproval: true, owner: 'andy', setupGuide: [
            'Make sure Gmail is connected. Check the backend .env file for your Gmail OAuth token.',
            'Open Settings → Integrations. Confirm "Gmail API" and "GPT-4o" are listed.',
            'Set MAX_EMAILS to how many emails you want checked each run (50 is a good start).',
            'Set PRIORITY_FILTER to "high" so it only looks at important emails.',
            'Turn on the schedule if you want it to run every morning at 7 AM.',
            'Click ▶ Launch to test. It will ask for your approval before sending any drafts.',
        ]
    }),
    seedAutomation({
        id: 'auto-3', name: 'Automated Backup & Digital Twin Sync', description: 'Nightly rclone sync of Google Drive to local SSD + Dropbox at 3 AM.', category: 'software', icon: '☁️', setupTime: '0.5h', annualSaved: '26h', integrations: ['rclone', 'Google Drive', 'Dropbox'], schedule: { enabled: false, frequency: 'daily', time: '03:00' }, envVars: { RCLONE_REMOTE: 'gdrive:', BACKUP_PATH: '/backups' }, tags: ['backup'], owner: 'andy', setupGuide: [
            'Install rclone on your computer. Open Terminal and type: brew install rclone',
            'Run "rclone config" in Terminal. Follow the steps to connect your Google Drive.',
            'Open Settings → Integrations and set RCLONE_REMOTE to your remote name (like "gdrive:").',
            'Set BACKUP_PATH to where you want backups saved on your computer.',
            'Turn on the schedule. Set it to Daily at 3:00 AM.',
            'Click ▶ Launch to run a test backup. Check your backup folder to make sure files are there.',
        ]
    }),
    seedAutomation({
        id: 'auto-4', name: 'Construction Watchdog', description: 'Forward invoices to Trello → OCR scan → push to Sheets → flag missing Lien Waivers.', category: 'software', icon: '🏗️', setupTime: '3h', annualSaved: '52h', integrations: ['Trello', 'Docparser', 'Google Sheets'], schedule: { enabled: false, frequency: 'manual', time: '10:00' }, envVars: { TRELLO_BOARD_ID: '', SHEET_ID: '' }, tags: ['construction', 'compliance'], requiresApproval: true, owner: 'andy', setupGuide: [
            'Go to your Trello board for construction projects. Copy the board ID from the URL.',
            'Open Settings → Integrations and paste the board ID into TRELLO_BOARD_ID.',
            'Create a Google Sheet for tracking invoices. Copy the Sheet ID from its URL.',
            'Paste the Sheet ID into SHEET_ID in the Integrations tab.',
            'Forward any construction invoice email to your Trello board email address.',
            'Click ▶ Launch. It will scan the invoices and flag any missing Lien Waivers for your review.',
        ]
    }),
    seedAutomation({
        id: 'auto-5', name: 'Cost-Plus Template Standardization', description: 'Mandatory vendor reporting form: Date, Labor Hours, Materials, Receipts.', category: 'process', icon: '📋', setupTime: '1h', annualSaved: '26h+', integrations: ['Google Forms', 'Google Sheets'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, tags: ['vendors', 'reporting'], owner: 'andy', setupGuide: [
            'Open Google Forms and create a new form called "Vendor Invoice Report".',
            'Add these fields: Date, Vendor Name, Labor Hours, Materials Cost, and a file upload for Receipts.',
            'Link the form to a Google Sheet so all answers go there automatically.',
            'Send the form link to your vendors. Tell them to fill it out every time they do work.',
            'Click ▶ Launch to view the summary of all submitted vendor reports.',
        ]
    }),
    seedAutomation({
        id: 'auto-6', name: 'Legal Template Library', description: 'Reusable litigation-grade email snippets: Invoice Disputes, Benefits Denials.', category: 'process', icon: '⚖️', setupTime: '2h', annualSaved: '52h', integrations: ['Google Docs'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, tags: ['legal'], owner: 'andy', setupGuide: [
            'Create a Google Doc called "Legal Email Templates".',
            'Write template emails for common situations: Invoice Disputes, Benefits Denials, Late Payments.',
            'Use [BRACKETS] for parts that change each time, like [VENDOR NAME] or [AMOUNT].',
            'Share the doc with your team so everyone can use the same templates.',
            'Click ▶ Launch to pull up the template library when you need to send a legal email.',
        ]
    }),
    seedAutomation({
        id: 'auto-7', name: 'Utility Watchdog Agent', description: 'Scrape utility portals → flag high bills on vacant units → trigger manager walkthrough.', category: 'software', icon: '⚡', setupTime: '2h', annualSaved: '52h', integrations: ['Georgia Power', 'Email', 'AppFolio'], schedule: { enabled: false, frequency: 'monthly', time: '08:00' }, envVars: { THRESHOLD_AMOUNT: '150', VACANT_ONLY: 'true' }, tags: ['utilities', 'monitoring'], requiresApproval: true, owner: 'andy', setupGuide: [
            'Open Settings → Integrations and make sure your utility portal logins are saved.',
            'Set THRESHOLD_AMOUNT to the dollar amount that triggers a warning (like 150).',
            'Set VACANT_ONLY to "true" if you only want to watch empty units.',
            'Turn on the monthly schedule so it checks bills on the 1st of each month.',
            'Click ▶ Launch to run a test scan. It will flag any high bills and ask you to approve a walkthrough.',
        ]
    }),
    seedAutomation({
        id: 'auto-8', name: 'Trello Knowledge Vector Index', description: 'Crawl all Trello boards, lists, and cards → flatten card data (descriptions, checklists, comments, attachments) into text documents → generate OpenAI embeddings → store in SQLite vector database. Enables semantic search: ask "where is the gate code?" and it finds the exact card. Agents + ARA can query automatically.', category: 'software', icon: '🧠', setupTime: '30m', annualSaved: '104h', integrations: ['Trello', 'OpenAI', 'SQLite Vector DB'], schedule: { enabled: false, frequency: 'daily', time: '02:00' }, envVars: { TRELLO_API_KEY: '', TRELLO_TOKEN: '', OPENAI_API_KEY: '' }, tags: ['ai', 'vector-db', 'search', 'trello'], requiresApproval: false, owner: 'andy', setupGuide: [
            'Make sure your Trello API key and token are set in the .env file on the backend.',
            'Make sure your OpenAI API key is also set in the .env file.',
            'Click ▶ Launch to start indexing all your Trello boards.',
            'The system will crawl every board, every list, and every card automatically.',
            'Each card gets turned into searchable text (title, description, checklists, comments, labels).',
            'Once done, you can search your entire Trello with natural language questions.',
            'Turn on the Daily schedule (2 AM) to keep the index fresh automatically.',
        ]
    }),
    // ══════════════════════════════════════════════
    // ── Lisa's Automations (ZP Group Roadmap) ──
    // ══════════════════════════════════════════════

    // ── Phase 1: High-Impact Automations ──
    seedAutomation({
        id: 'auto-L1', name: 'Recurring Journal Entries for Management Fees', description: 'Auto-post recurring management fees ($1,000/property for Andy Zohoury) as recurring journal entries in AppFolio → eliminates monthly manual review & entry.', category: 'software', icon: '📒', setupTime: '45m', annualSaved: '26h', integrations: ['AppFolio'], schedule: { enabled: false, frequency: 'monthly', time: '09:00', dayOfMonth: 1 }, tags: ['accounting', 'recurring'], owner: 'lisa', setupGuide: [
            'Log into AppFolio. Go to Accounting → Journal Entries.',
            'Click "Create Recurring Journal Entry".',
            'Set the amount to $1,000 per property for Andy Zohoury.',
            'Set it to repeat on the 1st of every month.',
            'Save the recurring entry. AppFolio will post it automatically each month.',
            'Click ▶ Launch here to verify the entries are set up correctly.',
        ]
    }),
    seedAutomation({
        id: 'auto-L2', name: 'Vendor Insurance (COI) Expiration Alerts', description: 'Track vendor COI expiration dates in AppFolio → auto-email vendors 30 days prior → flag non-compliant vendors. Replaces manual Trello + email tracking.', category: 'software', icon: '🛡️', setupTime: '1h', annualSaved: '39h', integrations: ['AppFolio', 'Gmail API', 'Trello'], schedule: { enabled: false, frequency: 'daily', time: '08:00' }, tags: ['vendors', 'compliance'], requiresApproval: true, owner: 'lisa', setupGuide: [
            'Open AppFolio → Vendors. Make sure every vendor has their COI expiration date entered.',
            'Go to each vendor card and upload their latest Certificate of Insurance (COI) PDF.',
            'Open Settings here and turn on the Daily schedule at 8:00 AM.',
            'The system will email vendors 30 days before their COI expires.',
            'Any vendor whose COI is expired will show up as "non-compliant" in red.',
            'Click ▶ Launch to scan all vendors right now. You will approve emails before they send.',
        ]
    }),
    seedAutomation({
        id: 'auto-L3', name: 'Recurring "Life" Bill Automation', description: 'Auto-code recurring personal/corporate card charges to correct GL accounts. Maps known vendors (Stoney River → GL 6030, Circle Sushi, Parking) to eliminate manual entry.', category: 'software', icon: '💳', setupTime: '1.5h', annualSaved: '52h', integrations: ['AppFolio', 'Bank Feed'], schedule: { enabled: false, frequency: 'daily', time: '10:00' }, envVars: { AUTO_CODE_VENDORS: 'true', DEFAULT_GL: '6030' }, tags: ['accounting', 'expenses'], owner: 'lisa', setupGuide: [
            'Open AppFolio → Banking → Bank Rules.',
            'Create a rule for each charge you see often. For example:',
            '   • "Stoney River" → code to GL 6030 (Meals)',
            '   • "Circle Sushi" → code to GL 6030',
            '   • "Parking" → code to GL 6020 (Auto & Travel)',
            'Set AUTO_CODE_VENDORS to "true" in Settings → Integrations.',
            'Click ▶ Launch to auto-code all unmatched bank feed items.',
        ]
    }),
    seedAutomation({
        id: 'auto-L4', name: 'Email Filtering & Labeling Rules', description: 'Auto-archive newsletters (Epoch, NewsBreak) and auto-label invoices from known senders (Bill.com, Amazon) → clear 38,000+ email backlog by routing noise away from inbox.', category: 'software', icon: '📧', setupTime: '2h', annualSaved: '130h', integrations: ['Gmail API'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, envVars: { ARCHIVE_SENDERS: 'epoch,newsbreak', LABEL_INVOICES: 'bill.com,amazon' }, tags: ['email', 'productivity'], owner: 'lisa', setupGuide: [
            'Open Gmail → Settings (gear icon) → See All Settings → Filters.',
            'Click "Create a new filter". Type a newsletter sender (like "epoch").',
            'Check "Skip the Inbox (Archive it)" and "Apply the label: Newsletters".',
            'Click "Create filter". Repeat for each newsletter you want filtered.',
            'For invoices: Create a filter for "bill.com". Apply the label "Invoices".',
            'Do the same for "amazon". Now invoices get labeled and newsletters skip your inbox.',
            'Click ▶ Launch to apply these rules to your existing emails in bulk.',
        ]
    }),
    seedAutomation({
        id: 'auto-L5', name: 'BILL.com Auto-Pay Threshold Adjustment', description: 'Adjust auto-pay cap to prevent manual intervention on recurring vendor invoices (e.g., Yummy Pools $399 vs $300 limit). Monitors threshold breaches and auto-approves known vendors.', category: 'software', icon: '💸', setupTime: '15m', annualSaved: '13h', integrations: ['Bill.com', 'AppFolio'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, tags: ['payments', 'vendors'], requiresApproval: true, owner: 'lisa', setupGuide: [
            'Log into BILL.com. Go to Settings → Auto-Pay.',
            'Find the auto-pay limit (it might be set to $300 right now).',
            'Raise it to $500 so vendors like Yummy Pools ($399) get paid automatically.',
            'Add your trusted vendors to the "Approved Vendors" list.',
            'Click Save. Now bills under $500 from approved vendors pay themselves.',
            'Click ▶ Launch to check for bills stuck because they went over the old limit.',
        ]
    }),

    // ── Phase 2: Workflow Optimization ──
    seedAutomation({
        id: 'auto-L6', name: 'Batch & Blast Accounting Protocol', description: 'Route all receipts to a dedicated digital inbox folder → process in one 2-hour weekly block on Tuesdays. Eliminates context-switching from sporadic bill entry throughout the day.', category: 'process', icon: '📦', setupTime: '1h', annualSaved: '104h', integrations: ['AppFolio', 'Dropbox', 'Google Drive'], schedule: { enabled: false, frequency: 'weekly', time: '09:00', dayOfWeek: 2 }, tags: ['accounting', 'workflow'], owner: 'lisa', setupGuide: [
            'Create a folder in Google Drive called "📥 Receipts Inbox".',
            'Whenever you get a receipt (email, photo, PDF), save it to that folder.',
            'Pick one day per week for accounting. Tuesday mornings work great.',
            'On that day, open the folder and process everything at once in AppFolio.',
            'Turn on the Weekly schedule here (Tuesday at 9 AM) for a reminder.',
            'Click ▶ Launch to see how many receipts are waiting in your inbox.',
        ]
    }),
    seedAutomation({
        id: 'auto-L7', name: 'Centralized Vendor Truth System', description: 'Consolidate all vendor data into AppFolio vendor cards — attach W-9 and COI directly. No payment issued unless vendor is "Green" (docs current). Replaces 4-app cross-referencing.', category: 'process', icon: '📂', setupTime: '3h', annualSaved: '78h', integrations: ['AppFolio', 'Trello', 'Gmail API', 'Dashlane'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, tags: ['vendors', 'compliance'], owner: 'lisa', setupGuide: [
            'Open AppFolio → Vendors. Pick a vendor to start with.',
            'Upload their W-9 form and COI to the vendor card under the "Documents" tab.',
            'Check: Is the COI still valid? If yes, mark the vendor as "Green" (current).',
            'If the COI is expired, mark them "Red" and hold all payments to them.',
            'Repeat for each vendor. Start with the 10 you pay most often.',
            'Click ▶ Launch to get a report of which vendors are Green vs. Red.',
        ]
    }),
    seedAutomation({
        id: 'auto-L8', name: 'Legacy Knowledge Wiki, SOPs & Static Knowledge Base', description: 'Record 5-min Loom SOPs for invoice entry and utility coding → build searchable index of deed locations, utility account numbers, gate codes (#2468), combo locks (1124), and vendor histories. Centralizes all "tribal knowledge" currently buried in 38,000+ emails. Eliminates manual inbox searches for codes, logins, and histories.', category: 'process', icon: '📚', setupTime: '4h', annualSaved: '208h', integrations: ['Loom', 'Google Docs', 'Google Sheets', 'Notion'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, tags: ['documentation', 'training', 'knowledge-base'], owner: 'lisa', setupGuide: [
            'Create a Google Sheet called "🔑 Master Codes & Logins".',
            'Add columns: Property, Gate Code, Lock Combo, Utility Login, Account Number, Notes.',
            'Fill in every code and login you know. Start with the ones you search for most.',
            'Open Loom (loom.com). Record a 5-minute video showing how to enter an invoice in AppFolio.',
            'Save the Loom link in a Google Doc called "📚 How-To Videos".',
            'Share both files with the team. Pin or bookmark them so everyone can find them.',
            'Click ▶ Launch to check if any codes or logins are missing from your sheet.',
        ]
    }),

    // ── Phase 3: Strategic Improvements ──
    seedAutomation({
        id: 'auto-L9', name: 'Bank Feed Rule Optimization', description: 'Set up aggressive bank rules: auto-categorize Uber → Travel & Parking, YogaBody → Personal. Clear $85k+ uncleared item backlog through pattern-based auto-reconciliation.', category: 'software', icon: '🏦', setupTime: '2h', annualSaved: '52h', integrations: ['AppFolio', 'Bank Feed'], schedule: { enabled: false, frequency: 'daily', time: '07:00' }, envVars: { RULE_MODE: 'aggressive', AUTO_MATCH: 'true' }, tags: ['banking', 'reconciliation'], owner: 'lisa', setupGuide: [
            'Open AppFolio → Banking → Bank Feed.',
            'Look at the uncleared items list. Find ones that repeat (like Uber, YogaBody).',
            'Click on a repeating item. Click "Create Rule" or "Always code this way".',
            'Map it: Uber → GL 6020 (Travel), YogaBody → GL 6090 (Personal).',
            'Repeat for the top 20 vendors you see most often.',
            'Set RULE_MODE to "aggressive" in Settings so it auto-matches similar names.',
            'Click ▶ Launch to auto-process all uncleared items using your new rules.',
        ]
    }),
    seedAutomation({
        id: 'auto-L10', name: 'Calendar-Based Compliance Triggers', description: 'Convert calendar events (Backflow Device Annuals, Tax Filings) into recurring tasks assigned to team members 2 weeks prior. Prevents missed deadlines and last-minute scrambles.', category: 'software', icon: '📅', setupTime: '1.5h', annualSaved: '26h', integrations: ['AppFolio', 'Google Calendar', 'ClickUp'], schedule: { enabled: false, frequency: 'weekly', time: '09:00', dayOfWeek: 1 }, tags: ['compliance', 'tasks'], owner: 'lisa', setupGuide: [
            'Open Google Calendar. Find all compliance deadlines (backflow tests, tax filings).',
            'For each deadline, create a recurring calendar event (yearly or quarterly).',
            'Set a reminder for 2 weeks before each deadline.',
            'In the event description, write who is responsible and what they need to do.',
            'Turn on the Weekly schedule here. Every Monday it will check upcoming deadlines.',
            'Click ▶ Launch to see all compliance deadlines in the next 30 days.',
        ]
    }),
    seedAutomation({
        id: 'auto-L11', name: 'Company History Project Optimizer', description: 'Feed deed PDFs to Gemini AI → auto-extract ownership timelines, scrap values, tax law summaries. Edit AI output instead of writing from scratch. Saves 2-4h per section.', category: 'software', icon: '🏛️', setupTime: '1h', annualSaved: '52h', integrations: ['Gemini Flash', 'Google Docs', 'Google Drive'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, envVars: { AI_MODEL: 'gemini-flash', EXTRACT_MODE: 'ownership_timeline' }, tags: ['ai', 'research'], owner: 'lisa', setupGuide: [
            'Upload your deed PDFs to a Google Drive folder called "📜 Property Deeds".',
            'Open Settings → Integrations. Make sure AI_MODEL is set to "gemini-flash".',
            'Set EXTRACT_MODE to what you want: "ownership_timeline" or "tax_summary".',
            'Click ▶ Launch. The AI will read the deeds and create a Google Doc with the info.',
            'Open the Google Doc it creates. Review and edit it — this is a draft, not final.',
            'Repeat for each property. Each one takes about 5 minutes instead of 2-4 hours.',
        ]
    }),

    // ── Phase 4: DayFlow Round 2 Automations (Feb 18–28 Analysis) ──
    seedAutomation({
        id: 'auto-L12', name: 'AppFolio Online Payables & ACH Auto-Pay', description: 'Enable AppFolio Online Payables to transition 80% of 201 monthly manual checks to automated ACH payments. Set auto-pay rules for recurring small-balance items (e.g., $1 ACH transfer fees, Amazon orders under $100). Eliminates manual printing, signing, mailing, and tracking of checks.', category: 'software', icon: '🏧', setupTime: '2.5h', annualSaved: '208h', integrations: ['AppFolio', 'Bank of America', 'ACH Network'], schedule: { enabled: false, frequency: 'monthly', time: '09:00', dayOfMonth: 1 }, envVars: { AUTO_PAY_THRESHOLD: '500', ACH_ENABLED: 'true' }, tags: ['payments', 'vendors', 'checks'], requiresApproval: true, owner: 'lisa', setupGuide: [
            'Log into AppFolio. Go to Accounting → Payables → Online Payables.',
            'Click "Enable Online Payables" if it is not already turned on.',
            'Connect your Bank of America account for ACH transfers.',
            'Go to Vendors. For each vendor, click "Payment Method" and switch from Check to ACH.',
            'Start with your top 20 vendors — the ones you write the most checks to.',
            'For small recurring items (like $1 ACH fees), set up auto-pay rules under Payables.',
            'Set AUTO_PAY_THRESHOLD to $500 — anything under this pays automatically.',
            'Click ▶ Launch to see which vendors are still on checks and should switch to ACH.',
        ]
    }),
    seedAutomation({
        id: 'auto-L13', name: 'Email-to-PDF Archiving & Finder Routing', description: 'Auto-save incoming email attachments (statements, invoices) as PDFs and route to correct Finder folder based on sender name. Maps top 20 frequent senders (Amex Serve → yearly statement folders, Relax The Back → vendor folder, Real Floor → vendor folder). Replaces 120-180 min daily manual "Save as PDF" sessions.', category: 'software', icon: '📄', setupTime: '3.5h', annualSaved: '182h', integrations: ['Gmail API', 'Hazel', 'Google Drive', 'Finder'], schedule: { enabled: false, frequency: 'daily', time: '06:00' }, envVars: { SENDER_MAP_COUNT: '20', PDF_OUTPUT_DIR: '/Documents/Filed', ARCHIVE_YEARS: '2018-2026' }, tags: ['filing', 'pdf', 'archiving'], owner: 'lisa', setupGuide: [
            'Install Hazel on your Mac. Download it from noodlesoft.com.',
            'Create a "Downloads" watch folder in Hazel.',
            'Add a rule: If file name contains "Serve Statement" → move to Documents/Amex Serve/[year].',
            'Add a rule: If file name contains "Relax The Back" → move to Documents/Vendors/Relax The Back.',
            'Repeat for your top 20 senders. Think about which emails you save as PDF the most.',
            'In Gmail, filter emails from these senders to auto-download their attachments.',
            'Set PDF_OUTPUT_DIR to your main filing folder (like /Documents/Filed).',
            'Click ▶ Launch to test the routing with your recent downloads.',
        ]
    }),
    seedAutomation({
        id: 'auto-L14', name: 'Trello Template Standardization & Voice-to-Text', description: 'Master "Tenant Move-Out Template" card in Trello with pre-populated utility/login checklists — duplicate per lease end (e.g., Ski Country Chalet 4-30-26). Also connects Plaud AI recorder for voice-to-text medical notes → auto-email into Trello cards. Eliminates manual typing of checklists and appointment summaries.', category: 'process', icon: '📝', setupTime: '2h', annualSaved: '52h', integrations: ['Trello', 'Plaud AI', 'Gmail API'], schedule: { enabled: false, frequency: 'manual', time: '09:00' }, tags: ['templates', 'voice-to-text', 'checklists'], owner: 'lisa', setupGuide: [
            'Open Trello. Create a new card called "📋 TEMPLATE: Tenant Move-Out Checklist".',
            'Add a checklist: Transfer utilities, Change locks, Final walkthrough, Return deposit, Update AppFolio.',
            'Add property-specific items (gate codes, storage pod combos, utility accounts).',
            'When a tenant moves out, click "Copy Card" on the template. Rename it with their info.',
            'For medical notes: Open the Plaud AI app on your phone after a doctor visit.',
            'Record your summary or let Plaud transcribe the conversation.',
            'Email the transcript to your Trello board email address. It creates a card automatically.',
            'Click ▶ Launch to see all active move-out checklists and their progress.',
        ]
    }),
];


// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEY_AUTOMATIONS = 'qualia_automation_hub_automations';
const STORAGE_KEY_AUDIT = 'qualia_automation_hub_audit';
const STORAGE_KEY_APPROVALS = 'qualia_automation_hub_approvals';

// ============================================
// HELPERS
// ============================================

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
}

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    active: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    paused: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    draft: { color: 'var(--text-tertiary)', bg: 'rgba(100,116,139,0.12)' },
};

const RESULT_COLORS: Record<string, { color: string; icon: string }> = {
    success: { color: '#22c55e', icon: '✓' },
    failure: { color: '#ef4444', icon: '✕' },
    partial: { color: '#f59e0b', icon: '◐' },
};

const FREQUENCY_LABELS: Record<string, string> = {
    manual: 'Manual',
    hourly: 'Every Hour',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================
// MAIN COMPONENT
// ============================================

type Tab = 'automations' | 'approvals' | 'audit';

export default function AutomationHub() {
    const [tab, setTab] = useState<Tab>('automations');
    const [automations, setAutomations] = useState<Automation[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_AUTOMATIONS);
            if (saved) {
                const cached: Automation[] = JSON.parse(saved);
                // Merge new seeds + backfill missing fields on existing entries
                const seedMap = new Map(AUTOMATIONS_SEED.map(s => [s.id, s]));
                const merged = cached.map(a => {
                    const seed = seedMap.get(a.id);
                    if (seed && !a.setupGuide) return { ...a, setupGuide: seed.setupGuide };
                    if (!a.setupGuide) return { ...a, setupGuide: [] };
                    return a;
                });
                const cachedIds = new Set(cached.map(a => a.id));
                const newSeeds = AUTOMATIONS_SEED.filter(s => !cachedIds.has(s.id));
                if (newSeeds.length > 0) return [...merged, ...newSeeds];
                return merged;
            }
        } catch { /* ignore */ }
        return AUTOMATIONS_SEED;
    });
    const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_AUDIT);
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        return [];
    });
    const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_APPROVALS);
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        return [];
    });
    const [ownerTab, setOwnerTab] = useState<OwnerTab>('andy');
    const [settingsId, setSettingsId] = useState<string | null>(null);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
    const [runningId, setRunningId] = useState<string | null>(null);
    const [newEnvKey, setNewEnvKey] = useState('');
    const [newEnvVal, setNewEnvVal] = useState('');
    const [helpId, setHelpId] = useState<string | null>(null);
    const [newIntegration, setNewIntegration] = useState('');
    const [newTag, setNewTag] = useState('');

    // Persist
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_AUTOMATIONS, JSON.stringify(automations));
    }, [automations]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(auditLog));
    }, [auditLog]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_APPROVALS, JSON.stringify(pendingApprovals));
    }, [pendingApprovals]);

    // ──── LOAD AUDIT LOG FROM BACKEND ────
    const loadAuditLog = useCallback(async () => {
        try {
            const res = await fetch(`${API_AUTOMATIONS}/runs?limit=100`);
            if (res.ok) {
                const data = await res.json();
                const entries: AuditLogEntry[] = (data.runs || []).map((r: any) => ({
                    id: r.id,
                    automationId: r.automation_id,
                    automationName: r.automation_name,
                    timestamp: r.started_at,
                    durationMs: r.duration_ms,
                    result: r.status === 'success' ? 'success' : r.status === 'failure' ? 'failure' : 'partial',
                    summary: r.result_summary || '',
                }));
                setAuditLog(entries);
            }
        } catch { /* backend offline, keep local data */ }
    }, []);

    // Refresh audit log when switching to audit tab
    const prevTab = useRef(tab);
    useEffect(() => {
        if (tab === 'audit' && prevTab.current !== 'audit') loadAuditLog();
        prevTab.current = tab;
    }, [tab, loadAuditLog]);

    // ──── LAUNCH (REAL API) ────
    const executeLaunch = useCallback(async (auto: Automation) => {
        setRunningId(auto.id);

        try {
            const res = await fetch(`${API_AUTOMATIONS}/${auto.id}/run`, { method: 'POST' });
            const data = await res.json();
            const run = data.run;

            if (run) {
                const entry: AuditLogEntry = {
                    id: run.id,
                    automationId: run.automation_id,
                    automationName: run.automation_name,
                    timestamp: run.started_at,
                    durationMs: run.duration_ms,
                    result: run.status === 'success' ? 'success' : run.status === 'failure' ? 'failure' : 'partial',
                    summary: run.result_summary || '',
                };
                setAuditLog(prev => [entry, ...prev].slice(0, 100));

                // Set to active on first successful run
                if (run.status === 'success') {
                    setAutomations(prev => prev.map(a =>
                        a.id === auto.id && a.status === 'draft' ? { ...a, status: 'active' } : a
                    ));
                }
            }
        } catch (err) {
            // Fallback: still log the attempt locally
            const entry: AuditLogEntry = {
                id: `local-${Date.now()}`,
                automationId: auto.id,
                automationName: auto.name,
                timestamp: new Date().toISOString(),
                durationMs: 0,
                result: 'failure',
                summary: 'Backend unreachable — check server connection.',
            };
            setAuditLog(prev => [entry, ...prev].slice(0, 100));
        } finally {
            setRunningId(null);
        }
    }, []);

    // ──── LAUNCH WITH APPROVAL GATE ────
    const handleLaunch = useCallback((auto: Automation) => {
        if (auto.requiresApproval) {
            // Queue for approval instead of executing
            const approval: PendingApproval = {
                id: `approval-${Date.now()}`,
                automationId: auto.id,
                automationName: auto.name,
                automationIcon: auto.icon,
                requestedAt: new Date().toISOString(),
                description: auto.description,
                status: 'pending',
            };
            setPendingApprovals(prev => [approval, ...prev]);
            setTab('approvals');
        } else {
            executeLaunch(auto);
        }
    }, [executeLaunch]);

    // ──── APPROVE / REJECT ────
    const handleApprove = useCallback(async (approval: PendingApproval) => {
        setPendingApprovals(prev => prev.map(a =>
            a.id === approval.id ? { ...a, status: 'approved' as const } : a
        ));
        const auto = automations.find(a => a.id === approval.automationId);
        if (auto) await executeLaunch(auto);
    }, [automations, executeLaunch]);

    const handleReject = useCallback((approvalId: string) => {
        setPendingApprovals(prev => prev.map(a =>
            a.id === approvalId ? { ...a, status: 'rejected' as const } : a
        ));
    }, []);

    const clearResolvedApprovals = useCallback(() => {
        setPendingApprovals(prev => prev.filter(a => a.status === 'pending'));
    }, []);

    // ──── GENERIC UPDATE ────
    const updateAutomation = useCallback((id: string, partial: Partial<Automation>) => {
        setAutomations(prev => prev.map(a =>
            a.id === id ? { ...a, ...partial } : a
        ));
    }, []);

    // ──── SCHEDULE UPDATE ────
    const updateSchedule = useCallback((id: string, partial: Partial<AutomationSchedule>) => {
        setAutomations(prev => prev.map(a =>
            a.id === id ? { ...a, schedule: { ...a.schedule, ...partial } } : a
        ));
    }, []);

    // ──── NOTIFICATIONS UPDATE ────
    const updateNotifications = useCallback((id: string, partial: Partial<AutomationNotifications>) => {
        setAutomations(prev => prev.map(a =>
            a.id === id ? { ...a, notifications: { ...a.notifications, ...partial } } : a
        ));
    }, []);

    // ──── RETRY POLICY UPDATE ────
    const updateRetryPolicy = useCallback((id: string, partial: Partial<AutomationRetryPolicy>) => {
        setAutomations(prev => prev.map(a =>
            a.id === id ? { ...a, retryPolicy: { ...a.retryPolicy, ...partial } } : a
        ));
    }, []);

    // ──── TOGGLE STATUS ────
    const toggleStatus = useCallback((id: string) => {
        setAutomations(prev => prev.map(a =>
            a.id === id
                ? { ...a, status: a.status === 'active' ? 'paused' : 'active' }
                : a
        ));
    }, []);

    // ──── RENDER: AUTOMATION CARD ────
    const renderCard = (auto: Automation) => {
        const isRunning = runningId === auto.id;
        const statusStyle = STATUS_COLORS[auto.status];
        const lastRun = auditLog.find(e => e.automationId === auto.id);

        return (
            <div key={auto.id} className={`ahub__card ${isRunning ? 'ahub__card--running' : ''}`}>
                <div className="ahub__card-header">
                    <span className="ahub__card-icon">{auto.icon}</span>
                    <div className="ahub__card-title-group">
                        <h3 className="ahub__card-title">{auto.name}</h3>
                        <span
                            className="ahub__card-status"
                            style={{ color: statusStyle.color, background: statusStyle.bg }}
                        >
                            {auto.status}
                        </span>
                    </div>
                </div>

                <p className="ahub__card-desc">{auto.description}</p>

                <div className="ahub__card-meta">
                    <span className="ahub__card-meta-item">⏱ Setup: {auto.setupTime}</span>
                    <span className="ahub__card-meta-item">💰 Saves: {auto.annualSaved}/yr</span>
                </div>

                <div className="ahub__card-integrations">
                    {auto.integrations.map(i => (
                        <span key={i} className="ahub__card-tag">{i}</span>
                    ))}
                </div>

                {auto.schedule.enabled && (
                    <div className="ahub__card-schedule-badge">
                        🕐 {FREQUENCY_LABELS[auto.schedule.frequency]} at {auto.schedule.time}
                        {auto.schedule.frequency === 'weekly' && auto.schedule.dayOfWeek != null && ` (${DAYS[auto.schedule.dayOfWeek]})`}
                    </div>
                )}

                {auto.requiresApproval && (
                    <div className="ahub__card-approval-badge">
                        🛡️ Requires Approval
                    </div>
                )}

                {lastRun && (
                    <div className="ahub__card-lastrun">
                        Last: {formatTimestamp(lastRun.timestamp)} —{' '}
                        <span style={{ color: RESULT_COLORS[lastRun.result].color }}>
                            {RESULT_COLORS[lastRun.result].icon} {lastRun.result}
                        </span>
                        {' '}({formatDuration(lastRun.durationMs)})
                    </div>
                )}

                <div className="ahub__card-actions">
                    <button
                        className={`ahub__btn ahub__btn--launch ${isRunning ? 'ahub__btn--disabled' : ''}`}
                        onClick={() => !isRunning && handleLaunch(auto)}
                        disabled={isRunning}
                    >
                        {isRunning ? (
                            <><span className="ahub__spinner" /> Running...</>
                        ) : (
                            '▶ Launch'
                        )}
                    </button>
                    <button
                        className="ahub__btn ahub__btn--settings"
                        onClick={() => {
                            if (settingsId === auto.id) { setSettingsId(null); }
                            else { setSettingsId(auto.id); setSettingsTab('general'); }
                        }}
                    >
                        {settingsId === auto.id ? '✕ Close' : '⚙️ Settings'}
                    </button>
                    {auto.status !== 'draft' && (
                        <button
                            className="ahub__btn ahub__btn--toggle"
                            onClick={() => toggleStatus(auto.id)}
                        >
                            {auto.status === 'active' ? '⏸ Pause' : '▶ Resume'}
                        </button>
                    )}
                    {auto.setupGuide.length > 0 && (
                        <button
                            className="ahub__btn ahub__btn--help"
                            onClick={() => setHelpId(helpId === auto.id ? null : auto.id)}
                        >
                            {helpId === auto.id ? '✕ Close Help' : '❓ Help'}
                        </button>
                    )}
                </div>

                {/* ===== SETUP GUIDE PANEL ===== */}
                {helpId === auto.id && auto.setupGuide.length > 0 && (
                    <div className="ahub__help-panel">
                        <div className="ahub__help-header">
                            <span className="ahub__help-icon">📖</span>
                            <span>How to Set This Up</span>
                        </div>
                        <ol className="ahub__help-steps">
                            {auto.setupGuide.map((step, i) => (
                                <li key={i} className="ahub__help-step">{step}</li>
                            ))}
                        </ol>
                        <div className="ahub__help-footer">
                            💡 Once everything above is done, just click <strong>▶ Launch</strong> to run it!
                        </div>
                    </div>
                )}

                {/* ===== FULL SETTINGS PANEL ===== */}
                {settingsId === auto.id && (
                    <div className="ahub__settings-panel">
                        {/* Settings Tabs */}
                        <div className="ahub__stabs">
                            {SETTINGS_TABS.map(t => (
                                <button
                                    key={t.key}
                                    className={`ahub__stab ${settingsTab === t.key ? 'ahub__stab--active' : ''}`}
                                    onClick={() => setSettingsTab(t.key)}
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>

                        {/* ── GENERAL TAB ── */}
                        {settingsTab === 'general' && (
                            <div className="ahub__stab-content">
                                <div className="ahub__settings-row">
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        className="ahub__settings-input"
                                        value={auto.name}
                                        onChange={e => updateAutomation(auto.id, { name: e.target.value })}
                                    />
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Description</label>
                                    <textarea
                                        className="ahub__settings-textarea"
                                        value={auto.description}
                                        onChange={e => updateAutomation(auto.id, { description: e.target.value })}
                                        rows={3}
                                    />
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Icon</label>
                                    <div className="ahub__emoji-picker">
                                        {EMOJI_PICKER.map(em => (
                                            <button
                                                key={em}
                                                className={`ahub__emoji-btn ${auto.icon === em ? 'ahub__emoji-btn--active' : ''}`}
                                                onClick={() => updateAutomation(auto.id, { icon: em })}
                                            >{em}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Category</label>
                                    <select
                                        className="ahub__settings-select"
                                        value={auto.category}
                                        onChange={e => updateAutomation(auto.id, { category: e.target.value as Automation['category'] })}
                                    >
                                        <option value="software">Software</option>
                                        <option value="process">Process</option>
                                    </select>
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Setup Time</label>
                                    <input
                                        type="text"
                                        className="ahub__settings-input ahub__settings-input--sm"
                                        value={auto.setupTime}
                                        onChange={e => updateAutomation(auto.id, { setupTime: e.target.value })}
                                    />
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Annual Savings</label>
                                    <input
                                        type="text"
                                        className="ahub__settings-input ahub__settings-input--sm"
                                        value={auto.annualSaved}
                                        onChange={e => updateAutomation(auto.id, { annualSaved: e.target.value })}
                                    />
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Tags</label>
                                    <div className="ahub__chip-list">
                                        {auto.tags.map(tag => (
                                            <span key={tag} className="ahub__chip">
                                                {tag}
                                                <button className="ahub__chip-remove" onClick={() =>
                                                    updateAutomation(auto.id, { tags: auto.tags.filter(t => t !== tag) })
                                                }>×</button>
                                            </span>
                                        ))}
                                        <div className="ahub__chip-add">
                                            <input
                                                type="text"
                                                placeholder="Add tag..."
                                                value={newTag}
                                                onChange={e => setNewTag(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && newTag.trim()) {
                                                        if (!auto.tags.includes(newTag.trim())) {
                                                            updateAutomation(auto.id, { tags: [...auto.tags, newTag.trim()] });
                                                        }
                                                        setNewTag('');
                                                    }
                                                }}
                                                className="ahub__chip-input"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Notes</label>
                                    <textarea
                                        className="ahub__settings-textarea"
                                        value={auto.notes}
                                        onChange={e => updateAutomation(auto.id, { notes: e.target.value })}
                                        rows={2}
                                        placeholder="Internal notes..."
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── SCHEDULE TAB ── */}
                        {settingsTab === 'schedule' && (
                            <div className="ahub__stab-content">
                                <label className="ahub__settings-toggle">
                                    <input
                                        type="checkbox"
                                        checked={auto.schedule.enabled}
                                        onChange={e => updateSchedule(auto.id, { enabled: e.target.checked })}
                                    />
                                    <span>Enable Schedule</span>
                                </label>

                                {auto.schedule.enabled && (
                                    <>
                                        <div className="ahub__settings-row">
                                            <label>Frequency</label>
                                            <select
                                                className="ahub__settings-select"
                                                value={auto.schedule.frequency}
                                                onChange={e => updateSchedule(auto.id, { frequency: e.target.value as AutomationSchedule['frequency'] })}
                                            >
                                                <option value="hourly">Hourly</option>
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                                <option value="monthly">Monthly</option>
                                            </select>
                                        </div>

                                        <div className="ahub__settings-row">
                                            <label>Time</label>
                                            <input
                                                type="time"
                                                className="ahub__settings-input ahub__settings-input--sm"
                                                value={auto.schedule.time}
                                                onChange={e => updateSchedule(auto.id, { time: e.target.value })}
                                            />
                                        </div>

                                        {auto.schedule.frequency === 'weekly' && (
                                            <div className="ahub__settings-row">
                                                <label>Day</label>
                                                <select
                                                    className="ahub__settings-select"
                                                    value={auto.schedule.dayOfWeek ?? 1}
                                                    onChange={e => updateSchedule(auto.id, { dayOfWeek: Number(e.target.value) })}
                                                >
                                                    {DAYS.map((d, i) => (
                                                        <option key={d} value={i}>{d}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── INTEGRATIONS TAB ── */}
                        {settingsTab === 'integrations' && (
                            <div className="ahub__stab-content">
                                <div className="ahub__settings-section-title">Connected Services</div>
                                <div className="ahub__chip-list">
                                    {auto.integrations.map(int => (
                                        <span key={int} className="ahub__chip ahub__chip--integration">
                                            {int}
                                            <button className="ahub__chip-remove" onClick={() =>
                                                updateAutomation(auto.id, { integrations: auto.integrations.filter(i => i !== int) })
                                            }>×</button>
                                        </span>
                                    ))}
                                    <div className="ahub__chip-add">
                                        <input
                                            type="text"
                                            placeholder="Add service..."
                                            value={newIntegration}
                                            onChange={e => setNewIntegration(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && newIntegration.trim()) {
                                                    if (!auto.integrations.includes(newIntegration.trim())) {
                                                        updateAutomation(auto.id, { integrations: [...auto.integrations, newIntegration.trim()] });
                                                    }
                                                    setNewIntegration('');
                                                }
                                            }}
                                            className="ahub__chip-input"
                                        />
                                    </div>
                                </div>

                                <div className="ahub__settings-section-title" style={{ marginTop: '16px' }}>Environment Variables</div>
                                <div className="ahub__env-list">
                                    {Object.entries(auto.envVars).map(([key, val]) => (
                                        <div key={key} className="ahub__env-row">
                                            <span className="ahub__env-key">{key}</span>
                                            <input
                                                type="text"
                                                className="ahub__settings-input"
                                                value={val}
                                                onChange={e => {
                                                    const newVars = { ...auto.envVars, [key]: e.target.value };
                                                    updateAutomation(auto.id, { envVars: newVars });
                                                }}
                                            />
                                            <button className="ahub__env-delete" onClick={() => {
                                                const newVars = { ...auto.envVars };
                                                delete newVars[key];
                                                updateAutomation(auto.id, { envVars: newVars });
                                            }}>×</button>
                                        </div>
                                    ))}
                                    <div className="ahub__env-add">
                                        <input
                                            type="text"
                                            placeholder="KEY"
                                            value={newEnvKey}
                                            onChange={e => setNewEnvKey(e.target.value.toUpperCase())}
                                            className="ahub__settings-input ahub__settings-input--sm"
                                        />
                                        <input
                                            type="text"
                                            placeholder="value"
                                            value={newEnvVal}
                                            onChange={e => setNewEnvVal(e.target.value)}
                                            className="ahub__settings-input"
                                        />
                                        <button
                                            className="ahub__btn ahub__btn--small"
                                            onClick={() => {
                                                if (newEnvKey.trim()) {
                                                    updateAutomation(auto.id, {
                                                        envVars: { ...auto.envVars, [newEnvKey.trim()]: newEnvVal }
                                                    });
                                                    setNewEnvKey('');
                                                    setNewEnvVal('');
                                                }
                                            }}
                                        >+ Add</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── EXECUTION TAB ── */}
                        {settingsTab === 'execution' && (
                            <div className="ahub__stab-content">
                                <div className="ahub__settings-row">
                                    <label>Timeout (seconds)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        className="ahub__settings-input ahub__settings-input--sm"
                                        value={auto.timeout}
                                        onChange={e => updateAutomation(auto.id, { timeout: Number(e.target.value) })}
                                    />
                                    <span className="ahub__settings-hint">0 = no timeout</span>
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Max Retries</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={10}
                                        className="ahub__settings-input ahub__settings-input--sm"
                                        value={auto.retryPolicy.maxRetries}
                                        onChange={e => updateRetryPolicy(auto.id, { maxRetries: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Retry Delay (seconds)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="ahub__settings-input ahub__settings-input--sm"
                                        value={auto.retryPolicy.retryDelay}
                                        onChange={e => updateRetryPolicy(auto.id, { retryDelay: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Status</label>
                                    <select
                                        className="ahub__settings-select"
                                        value={auto.status}
                                        onChange={e => updateAutomation(auto.id, { status: e.target.value as Automation['status'] })}
                                    >
                                        <option value="draft">Draft</option>
                                        <option value="active">Active</option>
                                        <option value="paused">Paused</option>
                                    </select>
                                </div>
                                <div className="ahub__settings-row">
                                    <label>Require Approval</label>
                                    <label className="ahub__settings-toggle" style={{ minWidth: 'auto', marginBottom: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={auto.requiresApproval}
                                            onChange={e => updateAutomation(auto.id, { requiresApproval: e.target.checked })}
                                        />
                                        <span style={{ color: auto.requiresApproval ? '#f59e0b' : undefined }}>
                                            {auto.requiresApproval ? '🛡️ Human-in-the-loop active' : 'Off'}
                                        </span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* ── NOTIFICATIONS TAB ── */}
                        {settingsTab === 'notifications' && (
                            <div className="ahub__stab-content">
                                <label className="ahub__settings-toggle">
                                    <input
                                        type="checkbox"
                                        checked={auto.notifications.onSuccess}
                                        onChange={e => updateNotifications(auto.id, { onSuccess: e.target.checked })}
                                    />
                                    <span>Notify on Success</span>
                                </label>
                                <label className="ahub__settings-toggle">
                                    <input
                                        type="checkbox"
                                        checked={auto.notifications.onFailure}
                                        onChange={e => updateNotifications(auto.id, { onFailure: e.target.checked })}
                                    />
                                    <span>Notify on Failure</span>
                                </label>
                                <div className="ahub__settings-row">
                                    <label>Notification Email</label>
                                    <input
                                        type="email"
                                        className="ahub__settings-input"
                                        placeholder="you@example.com"
                                        value={auto.notifications.email}
                                        onChange={e => updateNotifications(auto.id, { email: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ──── RENDER: AUTOMATIONS TAB ────
    const renderAutomations = () => {
        const ownerAutomations = automations.filter(a => a.owner === ownerTab);
        const software = ownerAutomations.filter(a => a.category === 'software');
        const process = ownerAutomations.filter(a => a.category === 'process');
        const ownerLabel = ownerTab === 'andy' ? 'Andy' : 'Lisa';

        return (
            <div className="ahub__automations">
                {/* Owner Sub-Tabs */}
                <div className="ahub__owner-tabs">
                    <button
                        className={`ahub__owner-tab ${ownerTab === 'andy' ? 'ahub__owner-tab--active' : ''}`}
                        onClick={() => setOwnerTab('andy')}
                    >
                        👤 Andy
                        <span className="ahub__owner-count">{automations.filter(a => a.owner === 'andy').length}</span>
                    </button>
                    <button
                        className={`ahub__owner-tab ${ownerTab === 'lisa' ? 'ahub__owner-tab--active' : ''}`}
                        onClick={() => setOwnerTab('lisa')}
                    >
                        👤 Lisa
                        <span className="ahub__owner-count">{automations.filter(a => a.owner === 'lisa').length}</span>
                    </button>
                </div>

                {/* Summary Bar */}
                <div className="ahub__summary-bar">
                    <div className="ahub__summary-stat">
                        <div className="ahub__summary-value">{ownerAutomations.length}</div>
                        <div className="ahub__summary-label">Total</div>
                    </div>
                    <div className="ahub__summary-stat">
                        <div className="ahub__summary-value" style={{ color: '#22c55e' }}>
                            {ownerAutomations.filter(a => a.status === 'active').length}
                        </div>
                        <div className="ahub__summary-label">Active</div>
                    </div>
                    <div className="ahub__summary-stat">
                        <div className="ahub__summary-value" style={{ color: '#3b82f6' }}>
                            {software.length + process.length}
                        </div>
                        <div className="ahub__summary-label">{ownerLabel}’s Workflows</div>
                    </div>
                    <div className="ahub__summary-stat">
                        <div className="ahub__summary-value">{auditLog.filter(e => ownerAutomations.some(a => a.id === e.automationId)).length}</div>
                        <div className="ahub__summary-label">Runs</div>
                    </div>
                </div>

                {software.length > 0 && (
                    <>
                        <h4 className="ahub__section-title">⚡ Software Automations</h4>
                        <div className="ahub__card-grid">
                            {software.map(renderCard)}
                        </div>
                    </>
                )}

                {process.length > 0 && (
                    <>
                        <h4 className="ahub__section-title">📐 Process Optimizations</h4>
                        <div className="ahub__card-grid">
                            {process.map(renderCard)}
                        </div>
                    </>
                )}
            </div>
        );
    };

    // ──── RENDER: AUDIT LOG TAB ────
    const renderAuditLog = () => (
        <div className="ahub__audit">
            {auditLog.length === 0 ? (
                <div className="ahub__audit-empty">
                    <div className="ahub__audit-empty-icon">📊</div>
                    <p>No automation runs yet. Launch an automation to see results here.</p>
                </div>
            ) : (
                <table className="ahub__audit-table">
                    <thead>
                        <tr>
                            <th>Automation</th>
                            <th>Timestamp</th>
                            <th>Duration</th>
                            <th>Result</th>
                            <th>Summary</th>
                        </tr>
                    </thead>
                    <tbody>
                        {auditLog.map(entry => {
                            const resultStyle = RESULT_COLORS[entry.result];
                            return (
                                <tr key={entry.id}>
                                    <td className="ahub__audit-name">{entry.automationName}</td>
                                    <td className="ahub__audit-time">{formatTimestamp(entry.timestamp)}</td>
                                    <td className="ahub__audit-duration">{formatDuration(entry.durationMs)}</td>
                                    <td>
                                        <span
                                            className="ahub__audit-result"
                                            style={{ color: resultStyle.color }}
                                        >
                                            {resultStyle.icon} {entry.result}
                                        </span>
                                    </td>
                                    <td className="ahub__audit-summary">{entry.summary}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );

    // ──── MAIN RENDER ────
    return (
        <div className="ahub">
            <div className="ahub__tabs">
                <button
                    className={`ahub__tab ${tab === 'automations' ? 'ahub__tab--active' : ''}`}
                    onClick={() => setTab('automations')}
                >
                    🤖 Automations
                </button>
                <button
                    className={`ahub__tab ${tab === 'approvals' ? 'ahub__tab--active' : ''}`}
                    onClick={() => setTab('approvals')}
                >
                    🛡️ Approvals {pendingApprovals.filter(a => a.status === 'pending').length > 0 && <span className="ahub__tab-badge ahub__tab-badge--warn">{pendingApprovals.filter(a => a.status === 'pending').length}</span>}
                </button>
                <button
                    className={`ahub__tab ${tab === 'audit' ? 'ahub__tab--active' : ''}`}
                    onClick={() => setTab('audit')}
                >
                    📊 Audit Log {auditLog.length > 0 && <span className="ahub__tab-badge">{auditLog.length}</span>}
                </button>
            </div>

            <div className="ahub__content">
                {tab === 'automations' && renderAutomations()}
                {tab === 'approvals' && (
                    <div className="ahub__approvals">
                        {pendingApprovals.length === 0 ? (
                            <div className="ahub__audit-empty">
                                <div className="ahub__audit-empty-icon">🛡️</div>
                                <p>No pending approvals. Automations with approval enabled will appear here before execution.</p>
                            </div>
                        ) : (
                            <>
                                {pendingApprovals.filter(a => a.status !== 'pending').length > 0 && (
                                    <div style={{ textAlign: 'right', padding: '0 0 10px' }}>
                                        <button className="ahub__btn ahub__btn--secondary ahub__btn--small" onClick={clearResolvedApprovals}>
                                            🗑 Clear Resolved
                                        </button>
                                    </div>
                                )}
                                <div className="ahub__approval-list">
                                    {pendingApprovals.map(approval => (
                                        <div key={approval.id} className={`ahub__approval-card ahub__approval-card--${approval.status}`}>
                                            <div className="ahub__approval-header">
                                                <span className="ahub__approval-icon">{approval.automationIcon}</span>
                                                <div className="ahub__approval-info">
                                                    <h4 className="ahub__approval-name">{approval.automationName}</h4>
                                                    <span className="ahub__approval-time">Requested: {formatTimestamp(approval.requestedAt)}</span>
                                                </div>
                                                <span className={`ahub__approval-status ahub__approval-status--${approval.status}`}>
                                                    {approval.status === 'pending' && '⏳ Pending'}
                                                    {approval.status === 'approved' && '✅ Approved'}
                                                    {approval.status === 'rejected' && '❌ Rejected'}
                                                </span>
                                            </div>
                                            <p className="ahub__approval-desc">{approval.description}</p>
                                            {approval.status === 'pending' && (
                                                <div className="ahub__approval-actions">
                                                    <button className="ahub__btn ahub__btn--launch" onClick={() => handleApprove(approval)}>
                                                        ✅ Approve & Run
                                                    </button>
                                                    <button className="ahub__btn ahub__btn--secondary" onClick={() => handleReject(approval.id)}>
                                                        ❌ Reject
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
                {tab === 'audit' && renderAuditLog()}
            </div>
        </div>
    );
}
