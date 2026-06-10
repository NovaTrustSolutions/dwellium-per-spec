/**
 * InboxZeroTypes.ts — Shared TypeScript interfaces for all Inbox Zero tabs
 *
 * Imported by: TriageTab, NewsletterTab, StatsTab, CapabilitiesTab,
 *              SettingsTab, InboxZero (orchestrator), and all sub-components.
 *
 * Single source of truth — no duplicate interface definitions.
 */

// ─── Tab ID ────────────────────────────────────────────
export type TabId =
    | 'triage'
    | 'newsletters'
    | 'stats'
    | 'capabilities'
    | 'rules'
    | 'nif'
    | 'actions'
    | 'analytics'
    | 'cold-email'
    | 'replies'
    | 'tracker'
    | 'settings'
    | 'audit';

// ─── Core Entities ─────────────────────────────────────

export interface InboxItem {
    id: string;
    source: string;
    sourceId?: string;
    /** The connected Gmail account this email was fetched from (multi-account). */
    sourceAccount?: string;
    subject: string;
    sender: string;
    snippet: string;
    /** SECURITY: body is NOT stored in state. Fetch on-demand via /api/inbox/{id}/body */
    body?: string;
    summary?: string;
    signalClass: 'signal' | 'noise' | 'low_priority';
    urgency: 'high' | 'medium' | 'low';
    status: string;
    routedToProject?: string;
    routingConfidence?: number;
    routingReasoning?: string;
    hasAttachments: boolean;
    createdAt: string;
    isRead?: boolean;
    gmailError?: boolean;
    retryable?: boolean;
    snoozedUntil?: string;
    labels?: string[];
}

export interface NewsletterSender {
    sender: string;
    count: number;
    readCount: number;
    archivedCount: number;
    readRate: number;
    lastSeen: string;
    unsubscribed: boolean;
}

export interface InboxStats {
    total: number;
    pending: number;
    approved: number;
    archived: number;
    signal: number;
    noise: number;
    lowPriority: number;
}

export interface AgentSettings {
    openaiApiKey: string;
    openaiModel: string;
    signalDomains: string;
    noiseDomains: string;
    routingRulesFile: string;
    gmailFetcherEnabled: boolean;
    gmailPollIntervalMs: number;
    gmailWatchEmail: string;
    trelloEnabled: boolean;
    trelloApiKey: string;
    trelloToken: string;
    trelloBoardId: string;
    trelloListId: string;
    googleDriveEnabled: boolean;
    teamShareEmails: string;
    entityGuardianEnabled: boolean;
    maxFileSizeMb: number;
    blockedExtensions: string;
}

export interface LlmSafetyEvent {
    id: string;
    scope: string;
    severity: 'low' | 'medium' | 'high';
    score: number;
    blocked: boolean;
    createdAt: string;
    signals: Array<{ label: string; severity: 'low' | 'medium' | 'high'; match?: string }>;
    meta: Record<string, unknown>;
}

export interface LlmSafetyStats {
    windowHours: number;
    total: number;
    blocked: number;
    bySeverity: Record<'high' | 'medium' | 'low', number>;
    byScope: Array<{ scope: string; count: number }>;
}

export interface SecurityStatusSnapshot {
    llmSafetyAudit: {
        persistentLogEnabled: boolean;
        maxRows: number;
    };
    domainEncryption: {
        segmentationEnabled: boolean;
        keyFilePath?: string;
        astra: { enabled: boolean; source: string };
        strata: { enabled: boolean; source: string };
    };
}

export interface AuditLogEntry {
    id: string;
    inbox_item_id: string;
    action: string;
    actor: string;
    reason?: string;
    details: Record<string, any>;
    created_at: string;
}

export interface ThreadLink {
    id: string;
    inbox_item_id: string;
    link_type: string;
    target_id: string;
    target_type: string;
    target_name?: string;
    created_at: string;
}

export interface CapabilityFeature {
    name: string;
    description: string;
    status: 'live' | 'beta' | 'planned';
}

export interface CapabilityCategory {
    id: string;
    icon: string;
    title: string;
    description: string;
    color: string;
    features: CapabilityFeature[];
}

export const CAPABILITIES_STORAGE_KEY = 'dwellium-iz-capabilities';

export const CAPABILITIES_DATA: CapabilityCategory[] = [
    {
        id: 'email-triage',
        icon: '📧',
        title: 'Email Triage & Processing',
        description: 'NIF classification → smart routing → approval queue with undo, labels, threads, and scheduled actions.',
        color: '#818cf8',
        features: [
            { name: 'Real-time SSE updates', status: 'live', description: 'Server-sent events for instant inbox changes' },
            { name: 'NIF signal classification', status: 'live', description: 'AI-powered signal/noise/low-priority categorization' },
            { name: 'Smart routing', status: 'live', description: '19 regex-based rules + AI fallback for project routing' },
            { name: 'Approval queue', status: 'live', description: 'Human-in-the-loop approval before any action executes' },
            { name: 'Batch operations', status: 'live', description: 'Bulk archive, classify, and label operations' },
            { name: 'Undo system', status: 'live', description: '30-second undo window for any status change' },
            { name: 'Thread linking', status: 'live', description: 'Link emails to workitems, tenants, or properties' },
            { name: 'Full email viewer', status: 'live', description: 'On-demand body fetching with sandboxed HTML rendering' },
            { name: 'Snooze', status: 'live', description: 'Snooze emails for 1h/4h/1d/1w with auto-resurface' },
            { name: 'Retry classification', status: 'live', description: 'Re-run NIF classification on any email' },
            { name: 'Keyboard navigation', status: 'planned', description: 'j/k/x shortcuts for power users' },
        ],
    },
    {
        id: 'ai-agents',
        icon: '🤖',
        title: 'AI Intelligence',
        description: 'ARA conversational AI, NIF classification engine, and smart action generation',
        color: '#22d3ee',
        features: [
            { name: 'ARA Chat Engine', status: 'live', description: 'Context-aware AI assistant with property/workitem/decision awareness' },
            { name: 'NIF Intelligence', status: 'live', description: 'Neural Intake Filter — 3-class email classification with confidence scores' },
            { name: 'Smart Actions', status: 'live', description: 'AI-suggested next steps (reply, schedule, create task, escalate)' },
            { name: 'Predictive analytics', status: 'live', description: 'Volume forecasting and backlog aging analysis' },
            { name: 'Summarization', status: 'live', description: 'AI-generated email summaries for quick scanning' },
            { name: 'Entity Guardian', status: 'live', description: 'PII/legal term filter preventing sensitive data in AI prompts' },
            { name: 'Multi-model support', status: 'beta', description: 'Switchable between GPT-4, Claude, and local models' },
        ],
    },
    {
        id: 'analytics',
        icon: '📊',
        title: 'Analytics & Monitoring',
        description: 'Visual dashboards, sender analysis, classification metrics, and NIF intelligence stats',
        color: '#22c55e',
        features: [
            { name: 'Email activity dashboard', status: 'live', description: 'AnalyticsDashboard with volume charts, class breakdown, top senders' },
            { name: 'Top senders analysis', status: 'live', description: 'analyticsService ranks senders by volume and signal class' },
            { name: 'Newsletter stats', status: 'live', description: 'Newsletter tab tracks subscription count and read rates' },
            { name: 'NIF classification metrics', status: 'live', description: 'NIF Intel dashboard: confidence trends, class distribution, model perf' },
            { name: 'Smart Actions analytics', status: 'live', description: 'Action execution history and success rate tracking' },
            { name: 'Response time metrics', status: 'beta', description: 'Reply Tracker calculates avg response days for received replies' },
            { name: 'Stats by time period', status: 'planned', description: 'Filter analytics by day, week, month' },
            { name: 'Organization-wide stats', status: 'planned', description: 'Aggregate stats across team members' },
        ],
    },
    {
        id: 'automation',
        icon: '⚡',
        title: 'Automation & Rules',
        description: 'Regex routing rules with priority ordering, bulk classify, and scheduled scans',
        color: '#fb923c',
        features: [
            { name: 'NIF signal classification', status: 'live', description: 'Emails auto-categorized as signal/noise/low_priority' },
            { name: 'Custom routing rules', status: 'live', description: '19 regex-based rules for domain-specific routing' },
            { name: 'Custom categories', status: 'planned', description: 'Define your own sender categories' },
            { name: 'Category-based rules', status: 'planned', description: 'Apply different rules per category' },
        ],
    },
    {
        id: 'integrations',
        icon: '🔗',
        title: 'Integrations',
        description: 'Gmail, Google Calendar, Drive, Trello, OpenAI, and observability integrations',
        color: '#2dd4bf',
        features: [
            { name: 'Gmail API', status: 'live', description: 'Core email provider — read, label, archive via OAuth2' },
            { name: 'Google Calendar', status: 'live', description: 'Event scheduling and ARA context injection' },
            { name: 'Google Drive', status: 'live', description: 'Document storage and file management' },
            { name: 'Trello', status: 'live', description: 'Task board sync, card creation, and property matching' },
            { name: 'OpenAI / AI providers', status: 'live', description: 'ARA chat, NIF classification, smart actions via aiProviderService' },
            { name: 'Sentry / Pino logging', status: 'live', description: 'Error tracking (optional DSN) + structured JSON logging' },
            { name: 'Microsoft Outlook', status: 'planned', description: 'Alternative email provider with full parity' },
            { name: 'Slack', status: 'planned', description: 'Notifications and alerts channel integration' },
        ],
    },
    {
        id: 'organization',
        icon: '🏢',
        title: 'Organization / Team',
        description: 'RBAC with 7 roles, field-level permissions, and user management',
        color: '#fbbf24',
        features: [
            { name: 'RBAC (7 roles)', status: 'live', description: 'god/corporate/management/advisor/maintenance/agent/tenant' },
            { name: 'Field-level permissions', status: 'live', description: 'field_permissions table controls access to sensitive fields' },
            { name: 'User management', status: 'live', description: 'CRUD users with role assignment and property access' },
            { name: 'Audit log', status: 'live', description: 'Full action audit trail with user/IP/timestamp' },
            { name: 'Organization-level rules', status: 'planned', description: 'Shared rule sets across team' },
        ],
    },
    {
        id: 'platform-infra',
        icon: '⚙️',
        title: 'Platform Infrastructure',
        description: 'Express.js, SQLite, SSE, background queues, scheduler, API versioning, HMAC signing',
        color: '#64748b',
        features: [
            { name: 'Express.js API', status: 'live', description: 'Production REST API with versioned routes (/api/v1/' },
            { name: 'SQLite (better-sqlite3)', status: 'live', description: 'Synchronous embedded database with 14+ tables' },
            { name: 'SSE streaming', status: 'live', description: 'Real-time server-sent events for inbox updates' },
            { name: 'Background scheduler', status: 'live', description: 'Interval-based task scheduling with approval/report modes' },
            { name: 'Cron jobs', status: 'live', description: 'Scheduled actions (Gmail polling every 900s, predictive scan every 4h)' },
            { name: 'Rate limiting', status: 'live', description: 'Per-key rate limits with sliding window (rateLimiter.ts)' },
            { name: 'API versioning', status: 'live', description: 'v1 canonical + backward-compat /api/ with deprecation headers' },
            { name: 'HMAC request signing', status: 'live', description: 'X-Signature header validation for browser intern routes' },
            { name: 'REST API (v1)', status: 'live', description: '40+ routes across 20 route files' },
            { name: 'Docker deployment', status: 'planned', description: 'Full Docker Compose setup for self-hosting' },
        ],
    },
];

export interface OperatorMetrics {
    throughputToday: number;
    throughputWeek: number;
    avgResponseMinutes: number;
    approvalQueueDepth: number;
    totalProcessed: number;
    backlogByAge: { fresh: number; aging: number; stale: number };
}

// ─── Display Constants ─────────────────────────────────

export const URGENCY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#fbbf24',
    low: '#34d399',
};

export const SIGNAL_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    signal: { label: 'Signal', color: '#22c55e', icon: '⚡' },
    noise: { label: 'Noise', color: '#6b7280', icon: '🔇' },
    low_priority: { label: 'Low', color: '#eab308', icon: '⏸️' },
};

export const PROJECT_NAMES: Record<string, string> = {
    'proj-invoicing': '💰 Invoicing',
    'proj-msa': '📜 MSA Management',
    'proj-onboarding': '👋 Onboarding',
    'proj-gdpr': '🔒 GDPR / Privacy',
    'proj-inventory': '📦 Inventory',
    'proj-brand-guidelines': '🎨 Brand Guidelines',
    'proj-reports': '📊 Financial Reports',
    'proj-hive': '🐝 The Hive',
    'proj-dashboard': '⚙️ AI-Dashboard369',
};

// ─── Shared Tab Props ──────────────────────────────────

export interface TabProps {
    authFetch: (url: string, init?: RequestInit) => Promise<Response>;
    authToken: string | null;
}

export interface TriageTabProps extends TabProps {
    items: InboxItem[];
    setItems: React.Dispatch<React.SetStateAction<InboxItem[]>>;
    stats: InboxStats | null;
    loading: boolean;
    selectedIds: Set<string>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    expandedId: string | null;
    setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    sortField: 'date' | 'urgency' | 'signal' | 'sender' | 'subject';
    setSortField: React.Dispatch<React.SetStateAction<'date' | 'urgency' | 'signal' | 'sender' | 'subject'>>;
    sortDir: 'asc' | 'desc';
    setSortDir: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>;
    triageFilter: string;
    setTriageFilter: React.Dispatch<React.SetStateAction<string>>;
    fetchItems: (append?: boolean) => Promise<void>;
    hasMore: boolean;
    onArchive: (id: string) => Promise<void>;
    onApprove: (id: string, project?: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onMarkRead: (id: string) => Promise<void>;
}
