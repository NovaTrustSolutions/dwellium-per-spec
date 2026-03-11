import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTheme, FONT_PAIRINGS } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { API_BASE as API_ROOT } from '../../config';
import { Theme } from '../../data/types';
import './InboxZero.css';

// ============================================
// TYPES
// ============================================

interface InboxItem {
    id: string;
    source: string;
    subject: string;
    sender: string;
    snippet: string;
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
}

interface NewsletterSender {
    sender: string;
    count: number;
    readCount: number;
    archivedCount: number;
    readRate: number;
    lastSeen: string;
    unsubscribed: boolean;
}

interface InboxStats {
    total: number;
    pending: number;
    approved: number;
    archived: number;
    signal: number;
    noise: number;
    lowPriority: number;
}

interface AgentSettings {
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

interface LlmSafetyEvent {
    id: string;
    scope: string;
    severity: 'low' | 'medium' | 'high';
    score: number;
    blocked: boolean;
    createdAt: string;
    signals: Array<{ label: string; severity: 'low' | 'medium' | 'high'; match?: string }>;
    meta: Record<string, unknown>;
}

interface LlmSafetyStats {
    windowHours: number;
    total: number;
    blocked: number;
    bySeverity: Record<'high' | 'medium' | 'low', number>;
    byScope: Array<{ scope: string; count: number }>;
}

interface SecurityStatusSnapshot {
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

type TabId = 'triage' | 'newsletters' | 'stats' | 'capabilities' | 'settings';

const API_BASE = `${API_ROOT}/api/inbox`;
const SECURITY_API_BASE = `${API_ROOT}/api/security`;

const THEME_PALETTES: { id: Theme; name: string; mood: string; colors: string[] }[] = [
    { id: 'dark', name: 'Dwellium Dark', mood: 'Default dark interface', colors: ['#0d0f12', '#16191f', '#0088cc', '#e8eaed'] },
    { id: 'light', name: 'Dwellium Light', mood: 'Default light interface', colors: ['#e8ecf1', '#ffffff', '#0088cc', '#1a1d24'] },
    { id: 'trust', name: 'Trust & Professional', mood: 'Reliable, secure, established', colors: ['#0F172A', '#0369A1', '#F8FAFC', '#3B82F6'] },
    { id: 'vibrant', name: 'Vibrant & Modern', mood: 'Innovative, energetic', colors: ['#6366F1', '#10B981', '#FFFFFF', '#F59E0B'] },
    { id: 'luxury', name: 'Luxury & Premium', mood: 'Sophisticated, exclusive', colors: ['#1C1917', '#CA8A04', '#FAFAF9', '#78716C'] },
    { id: 'healthcare', name: 'Healthcare', mood: 'Calm, trustworthy, clean', colors: ['#0891B2', '#059669', '#FFFFFF', '#06B6D4'] },
    { id: 'creative', name: 'Creative & Playful', mood: 'Fun, approachable', colors: ['#EC4899', '#8B5CF6', '#FEF3C7', '#F59E0B'] },
    { id: 'dark-excellence', name: 'Dark Excellence', mood: 'True black, 15:1 contrast', colors: ['#0A0A0A', '#1A1A1A', '#3B82F6', '#FFFFFF'] },
];

const URGENCY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#fbbf24',
    low: '#34d399',
};

const SIGNAL_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    signal: { label: 'Signal', color: '#22c55e', icon: '⚡' },
    noise: { label: 'Noise', color: '#6b7280', icon: '🔇' },
    low_priority: { label: 'Low', color: '#eab308', icon: '⏸️' },
};

const PROJECT_NAMES: Record<string, string> = {
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

// ============================================
// CAPABILITIES DATA
// ============================================

interface CapabilityFeature {
    name: string;
    description: string;
}

interface CapabilityCategory {
    id: string;
    icon: string;
    title: string;
    description: string;
    color: string;
    features: CapabilityFeature[];
}

const CAPABILITIES_DATA: CapabilityCategory[] = [
    {
        id: 'ai-assistant',
        icon: '🤖',
        title: 'AI Personal Assistant',
        description: 'LLM-powered email classification, auto-labeling, reply drafts, and rule management',
        color: '#818cf8',
        features: [
            { name: 'Prompt-based rules', description: 'Define rules in plain English — converted to structured rules' },
            { name: 'AI email classification', description: 'Incoming emails classified against rules using LLM' },
            { name: 'Auto-labeling', description: 'AI applies Gmail/Outlook labels based on rule matches' },
            { name: 'Auto-archiving', description: 'AI archives emails matching specified conditions' },
            { name: 'Auto-reply drafts', description: 'AI pre-drafts replies in your tone, queued for review' },
            { name: 'Auto-forwarding', description: 'AI forwards emails to addresses based on rules' },
            { name: 'Template responses', description: 'Dynamic templates with variables in automated replies' },
            { name: 'Rule groups', description: 'Group rules into named categories for organization' },
            { name: 'Rule execution history', description: 'Track which rules fired, when, and on what emails' },
            { name: 'Rule statistics', description: 'See how often each rule is triggered over time' },
            { name: 'Knowledge base', description: 'Upload docs to give AI additional context' },
            { name: 'About/Persona settings', description: 'Define your style so AI matches your voice' },
            { name: 'Multi-model support', description: 'OpenAI, Gemini, Claude, Bedrock, Groq, or Ollama' },
        ],
    },
    {
        id: 'email-client',
        icon: '📬',
        title: 'Email Client',
        description: 'Full-featured built-in email client with thread view, compose, and batch operations',
        color: '#60a5fa',
        features: [
            { name: 'Full Gmail/Outlook client', description: 'Read, compose, reply, and manage emails' },
            { name: 'Thread view', description: 'View full conversation threads' },
            { name: 'Compose & reply', description: 'Full email composition with autocomplete' },
            { name: 'AI compose autocomplete', description: 'AI-powered autocomplete while drafting' },
            { name: 'Attachments', description: 'View and download email attachments' },
            { name: 'Labels/folders', description: 'Create and manage Gmail labels or Outlook folders' },
            { name: 'Batch operations', description: 'Perform actions on multiple emails at once' },
            { name: 'Email streaming', description: 'Real-time email updates via server-sent events' },
            { name: 'Drafts management', description: 'View and manage draft emails' },
            { name: 'Contact integration', description: 'Pull in Google/Outlook contacts' },
        ],
    },
    {
        id: 'analytics',
        icon: '📊',
        title: 'Email Analytics & Stats',
        description: 'Visual dashboards, sender analysis, response metrics, and real-time analytics',
        color: '#22c55e',
        features: [
            { name: 'Email activity dashboard', description: 'Visual charts of email volume over time' },
            { name: 'Sent vs received tracking', description: 'Compare inbound/outbound patterns' },
            { name: 'Top senders analysis', description: 'See who sends you the most email' },
            { name: 'Top recipients analysis', description: 'See who you email most frequently' },
            { name: 'Newsletter stats', description: 'Track newsletter subscriptions and read rates' },
            { name: 'Response time metrics', description: 'Measure how quickly you respond' },
            { name: 'Stats by time period', description: 'Filter analytics by day, week, month' },
            { name: 'Organization-wide stats', description: 'Aggregate stats across team members' },
            { name: 'Tinybird analytics pipeline', description: 'Real-time analytics powered by Tinybird' },
            { name: 'AI usage analytics', description: 'Track token usage and AI processing volume' },
        ],
    },
    {
        id: 'bulk-unsubscriber',
        icon: '🔇',
        title: 'Bulk Unsubscriber',
        description: 'Automatically detect and unsubscribe from newsletters with browser automation',
        color: '#f59e0b',
        features: [
            { name: 'Newsletter detection', description: 'Automatically identifies newsletters and mailing lists' },
            { name: 'One-click unsubscribe', description: 'Unsubscribe from newsletters with a single click' },
            { name: 'Browser automation', description: 'Playwright automates complex unsubscribe flows' },
            { name: 'AI page analysis', description: 'AI analyzes unsubscribe pages for correct action' },
            { name: 'Fallback strategies', description: 'Multiple fallback methods when primary fails' },
            { name: 'Unsubscribe history', description: 'Track all unsubscribe actions taken' },
            { name: 'Bulk selection', description: 'Select multiple newsletters to unsubscribe at once' },
        ],
    },
    {
        id: 'bulk-archiver',
        icon: '🗄️',
        title: 'Bulk Archiver',
        description: 'AI-powered inbox cleaning with batch archive, sender categorization, and run history',
        color: '#6b7280',
        features: [
            { name: 'Bulk archive', description: 'Archive large batches of old emails at once' },
            { name: 'Quick bulk archive', description: 'Fast archive with simplified workflow' },
            { name: 'Clean tool', description: 'AI-powered inbox cleaning with history tracking' },
            { name: 'Clean onboarding', description: 'Guided setup for inbox cleaning rules' },
            { name: 'Clean run history', description: 'See past cleaning runs and what was archived' },
            { name: 'Sender-based archiving', description: 'Archive all emails from specific senders' },
            { name: 'AI sender categorization', description: 'AI categorizes senders to help decide' },
        ],
    },
    {
        id: 'cold-email-blocker',
        icon: '🧊',
        title: 'Cold Email Blocker',
        description: 'Automatic cold email detection and screening for unknown senders',
        color: '#38bdf8',
        features: [
            { name: 'Automatic cold email detection', description: 'AI screens emails from unknown senders' },
            { name: 'First-contact analysis', description: 'Only triggers for senders you\'ve never emailed' },
            { name: 'Auto-labeling/archiving', description: 'Automatically labels or archives cold emails' },
            { name: 'Cold email log', description: 'Review all emails flagged as cold outreach' },
            { name: 'Standalone operation', description: 'Works independently from AI assistant rules' },
        ],
    },
    {
        id: 'reply-tracking',
        icon: '↩️',
        title: 'Reply Zero / Reply Tracking',
        description: 'Track emails needing responses, awaiting replies, and follow-up reminders',
        color: '#a78bfa',
        features: [
            { name: 'Emails to reply to', description: 'Track emails that need your response' },
            { name: 'Awaiting responses', description: 'Track emails where you\'re waiting for a reply' },
            { name: 'Follow-up reminders', description: 'Get reminded when follow-ups are due' },
            { name: 'Auto-draft management', description: 'AI draft suggestions for tracked emails' },
            { name: 'Reply tracker onboarding', description: 'Guided setup for reply tracking' },
            { name: 'No-reply detection', description: 'Identifies emails that don\'t need a response' },
        ],
    },
    {
        id: 'meeting-briefs',
        icon: '📅',
        title: 'Meeting Briefs',
        description: 'AI-generated pre-meeting briefings with email context from attendees',
        color: '#f472b6',
        features: [
            { name: 'Pre-meeting briefings', description: 'AI generates personalized briefings before events' },
            { name: 'Email context pull', description: 'Briefs include relevant email history with attendees' },
            { name: 'Calendar integration', description: 'Connects to Google Calendar and Outlook Calendar' },
            { name: 'Brief history', description: 'Review past meeting briefs' },
            { name: 'Upcoming events view', description: 'See upcoming events with brief status' },
        ],
    },
    {
        id: 'smart-filing',
        icon: '📁',
        title: 'Smart Filing',
        description: 'Auto-save email attachments to Google Drive or OneDrive with folder mapping',
        color: '#34d399',
        features: [
            { name: 'Auto-save attachments', description: 'Save email attachments to Drive/OneDrive' },
            { name: 'Folder mapping', description: 'Configure which folders attachments get saved to' },
            { name: 'Drive connections', description: 'Connect multiple Drive accounts' },
            { name: 'Filing history', description: 'Track all auto-filed documents' },
            { name: 'Filing preview', description: 'Preview files before they\'re saved' },
        ],
    },
    {
        id: 'smart-categories',
        icon: '🏷️',
        title: 'Smart Categories',
        description: 'AI-powered sender categorization with custom categories and bulk operations',
        color: '#fb923c',
        features: [
            { name: 'AI sender categorization', description: 'Automatically categorize senders' },
            { name: 'Custom categories', description: 'Define your own sender categories' },
            { name: 'Category-based rules', description: 'Apply different rules per category' },
            { name: 'Bulk categorization', description: 'Categorize many senders at once using AI' },
        ],
    },
    {
        id: 'email-digest',
        icon: '📧',
        title: 'Email Digest',
        description: 'Scheduled email activity summaries with customizable frequency and content',
        color: '#e879f9',
        features: [
            { name: 'Scheduled email digest', description: 'Periodic summaries of email activity' },
            { name: 'Digest preview', description: 'Preview digest before it\'s sent' },
            { name: 'Digest scheduling', description: 'Configure frequency (daily, weekly, etc.)' },
            { name: 'Digest settings', description: 'Customize what\'s included in the digest' },
            { name: 'Resend integration', description: 'Digests sent via Resend transactional email' },
        ],
    },
    {
        id: 'integrations',
        icon: '🔗',
        title: 'Integrations',
        description: '26 integrations including Gmail, Outlook, Calendar, Drive, Slack, and AI providers',
        color: '#2dd4bf',
        features: [
            { name: 'Gmail API', description: 'Core email provider (read, send, label, archive)' },
            { name: 'Microsoft Outlook', description: 'Alternative email provider with full parity' },
            { name: 'Google Calendar', description: 'Meeting briefs, event-based automations' },
            { name: 'Google Drive / OneDrive', description: 'Smart filing, attachment storage' },
            { name: 'Google Contacts', description: 'Contact lookup and enrichment' },
            { name: 'Slack', description: 'Notifications and alerts channel integration' },
            { name: 'Google Pub/Sub', description: 'Real-time Gmail push notifications' },
            { name: 'Tinybird', description: 'Real-time email analytics pipeline' },
            { name: 'OpenAI / Gemini / Claude', description: 'Primary and alternative AI providers' },
            { name: 'Lemon Squeezy / Stripe', description: 'Payment processing and subscriptions' },
            { name: 'Resend', description: 'Transactional email for digests and summaries' },
            { name: 'PostHog', description: 'Product analytics and feature flags' },
            { name: 'Sentry / Axiom', description: 'Error tracking, logging, observability' },
            { name: 'MCP Protocol', description: 'External AI agent integration endpoint' },
        ],
    },
    {
        id: 'organization',
        icon: '🏢',
        title: 'Organization / Team',
        description: 'Multi-user teams with shared analytics, member management, and org-level rules',
        color: '#fbbf24',
        features: [
            { name: 'Multi-user organizations', description: 'Create teams with shared oversight' },
            { name: 'Organization stats', description: 'Aggregate email analytics across team' },
            { name: 'Member management', description: 'Add/remove team members' },
            { name: 'Invitation system', description: 'Invite users via link' },
            { name: 'Organization-level rules', description: 'Shared rule sets across team' },
            { name: 'Executed rules count', description: 'Track team-wide rule execution' },
        ],
    },
    {
        id: 'account-settings',
        icon: '👤',
        title: 'Account & Settings',
        description: 'Multi-account support, API keys, SSO, onboarding, and debug tools',
        color: '#94a3b8',
        features: [
            { name: 'Multi-account support', description: 'Connect and manage multiple email accounts' },
            { name: 'API key management', description: 'Generate API keys for programmatic access' },
            { name: 'User persona/about', description: 'Define writing style for AI responses' },
            { name: 'Usage tracking', description: 'Monitor AI token usage and processing costs' },
            { name: 'SSO (Single Sign-On)', description: 'Enterprise authentication support' },
            { name: 'Setup progress tracking', description: 'Guided setup wizard with completion' },
            { name: 'Onboarding flows', description: 'Step-by-step onboarding for new users' },
            { name: 'Debug tools', description: 'Rule history, draft debugging, inspection' },
            { name: 'Referral system', description: 'Refer friends with unique codes + stats' },
            { name: 'License management', description: 'Manage subscription and license keys' },
            { name: 'Premium tiers', description: 'Free, Pro, and Enterprise plans' },
        ],
    },
    {
        id: 'platform-infra',
        icon: '⚙️',
        title: 'Platform Infrastructure',
        description: 'Next.js, PostgreSQL, Redis, background queues, webhooks, Docker, REST API',
        color: '#64748b',
        features: [
            { name: 'Next.js App Router', description: 'Modern SSR + API routes' },
            { name: 'PostgreSQL (Prisma)', description: 'Relational database with migrations' },
            { name: 'Redis (Upstash)', description: 'Caching, rate limiting, and queues' },
            { name: 'Background queues', description: 'AI, archive, and categorization queues' },
            { name: 'Webhook handling', description: 'Gmail & Outlook push notification processing' },
            { name: 'Cron jobs', description: 'Scheduled actions (digest, follow-ups, renewal)' },
            { name: 'Docker deployment', description: 'Full Docker Compose setup for self-hosting' },
            { name: 'REST API (v1)', description: 'Versioned external API with OpenAPI docs' },
            { name: 'Email encryption', description: 'Encrypted email content storage' },
            { name: 'Rate limiting', description: 'Per-user rate limits for API calls' },
        ],
    },
];

const CAPABILITIES_STORAGE_KEY = 'dwellium-iz-capabilities';

// ============================================
// COMPONENT
// ============================================

export default function InboxZero() {
    const { theme: currentTheme, setTheme, fontPairing: currentFont, setFontPairing, animationsEnabled, setAnimationsEnabled } = useTheme();
    const [activeTab, setActiveTab] = useState<TabId>('triage');
    const [items, setItems] = useState<InboxItem[]>([]);
    const [stats, setStats] = useState<InboxStats | null>(null);
    const [newsletters, setNewsletters] = useState<NewsletterSender[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [routePickerFor, setRoutePickerFor] = useState<string | null>(null);
    const [undoStack, setUndoStack] = useState<{ id: string; action: string; ts: number }[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [triageFilter, setTriageFilter] = useState<string>('all');
    const undoTimerRef = useRef<number | null>(null);
    const inboxCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const inboxFocusTimerRef = useRef<number | null>(null);
    const [focusTargetItemId, setFocusTargetItemId] = useState<string | null>(null);
    const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

    // Capabilities state
    const [expandedCaps, setExpandedCaps] = useState<Set<string>>(new Set());
    const [capabilityToggles, setCapabilityToggles] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem(CAPABILITIES_STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        // Default: all enabled
        const defaults: Record<string, boolean> = {};
        CAPABILITIES_DATA.forEach(cat => { defaults[cat.id] = true; });
        return defaults;
    });

    // Persist capability toggles
    useEffect(() => {
        localStorage.setItem(CAPABILITIES_STORAGE_KEY, JSON.stringify(capabilityToggles));
    }, [capabilityToggles]);

    const toggleCapExpand = (id: string) => {
        setExpandedCaps(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleCapability = (id: string) => {
        setCapabilityToggles(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const totalFeatures = useMemo(() => CAPABILITIES_DATA.reduce((sum, cat) => sum + cat.features.length, 0), []);
    const enabledCategories = useMemo(() => CAPABILITIES_DATA.filter(cat => capabilityToggles[cat.id] !== false).length, [capabilityToggles]);

    // Settings state
    const [settings, setSettings] = useState<AgentSettings | null>(null);
    const [settingsDirty, setSettingsDirty] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);

    // Permissions admin state (god only)
    const { role: currentUserRole, token: authToken, authFetch, hasMinRole } = useUser();
    const isGod = currentUserRole === 'god';
    const canViewLlmSafetyAudit = isGod || hasMinRole('management');
    const [permUsers, setPermUsers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
    const [permSelectedUser, setPermSelectedUser] = useState<string>('');
    const [permMap, setPermMap] = useState<Record<string, boolean>>({});
    const [permLoading, setPermLoading] = useState(false);
    const [permSaving, setPermSaving] = useState(false);
    const [permSaveMsg, setPermSaveMsg] = useState('');
    const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [llmSafetyEvents, setLlmSafetyEvents] = useState<LlmSafetyEvent[]>([]);
    const [llmSafetyStats, setLlmSafetyStats] = useState<LlmSafetyStats | null>(null);
    const [securityStatus, setSecurityStatus] = useState<SecurityStatusSnapshot | null>(null);
    const [llmSafetyLoading, setLlmSafetyLoading] = useState(false);
    const [llmSafetyError, setLlmSafetyError] = useState<string | null>(null);
    const [llmSafetySeverityFilter, setLlmSafetySeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
    const [llmSafetyBlockedOnly, setLlmSafetyBlockedOnly] = useState(false);
    const [llmSafetyLastLoadedAt, setLlmSafetyLastLoadedAt] = useState<number | null>(null);

    // ---- LEGAL SHIELD STATUS ----
    const [legalShieldHealth, setLegalShieldHealth] = useState<{
        healthy: boolean; totalRecords: number; volumes: number; indices: number;
        checks: { name: string; status: string; detail: string; ms?: number }[];
        checkDurationMs: number; checkedAt: string;
    } | null>(null);
    const [legalShieldLoading, setLegalShieldLoading] = useState(false);
    const legalShieldLoadedRef = useRef(false);

    const fetchLegalShieldHealth = useCallback(async () => {
        if (!authToken) return;
        setLegalShieldLoading(true);
        try {
            const res = await authFetch(`${API_ROOT}/api/georgia-code/legal-shield-health`);
            const json = await res.json();
            if (json.success) setLegalShieldHealth(json.data);
        } catch { /* offline */ }
        finally { setLegalShieldLoading(false); }
    }, [authFetch, authToken]);

    // Ref to prevent re-fetching settings on every render (breaks the loop)
    const settingsLoadedRef = useRef(false);
    const llmSafetyLoadedRef = useRef(false);
    const permUsersLoadedRef = useRef(false);

    // ---- DATA FETCHING ----
    const fetchItems = useCallback(async () => {
        try {
            const params = triageFilter !== 'all' ? `?signalClass=${triageFilter}` : '';
            const res = await fetch(`${API_BASE}${params}`);
            const data = await res.json();
            if (data.success) setItems(data.data);
        } catch {
            // Backend offline
        } finally {
            setLoading(false);
        }
    }, [triageFilter]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/stats`);
            const data = await res.json();
            if (data.success) setStats(data.data);
        } catch { /* offline */ }
    }, []);

    const fetchNewsletters = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/newsletters`);
            const data = await res.json();
            if (data.success) setNewsletters(data.data);
        } catch {
            // Generate from local items as fallback
            const senderMap = new Map<string, NewsletterSender>();
            items.forEach(item => {
                const existing = senderMap.get(item.sender) || {
                    sender: item.sender,
                    count: 0,
                    readCount: 0,
                    archivedCount: 0,
                    readRate: 0,
                    lastSeen: item.createdAt,
                    unsubscribed: false,
                };
                existing.count++;
                if (item.isRead) existing.readCount++;
                if (item.status === 'archived') existing.archivedCount++;
                existing.readRate = existing.count > 0 ? existing.readCount / existing.count : 0;
                senderMap.set(item.sender, existing);
            });
            setNewsletters(Array.from(senderMap.values()).sort((a, b) => b.count - a.count));
        }
    }, [items]);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await authFetch(`${API_ROOT}/api/settings`);
            const data = await res.json();
            if (data.success) {
                setSettings(data.data);
                setSettingsDirty(false);
            }
        } catch { /* backend offline */ }
    }, [authFetch]);

    const fetchLlmSafetyAudit = useCallback(async () => {
        if (!canViewLlmSafetyAudit || !authToken) return;

        setLlmSafetyLoading(true);
        setLlmSafetyError(null);

        try {
            const params = new URLSearchParams();
            params.set('limit', '30');
            if (llmSafetySeverityFilter !== 'all') params.set('severity', llmSafetySeverityFilter);
            if (llmSafetyBlockedOnly) params.set('blocked', 'true');

            const [statusRes, statsRes, eventsRes] = await Promise.all([
                authFetch(`${SECURITY_API_BASE}/status`),
                authFetch(`${SECURITY_API_BASE}/llm-safety-events/stats?hours=24`),
                authFetch(`${SECURITY_API_BASE}/llm-safety-events?${params.toString()}`),
            ]);

            const [statusJson, statsJson, eventsJson] = await Promise.all([
                statusRes.json().catch(() => null),
                statsRes.json().catch(() => null),
                eventsRes.json().catch(() => null),
            ]);

            if (!statusRes.ok || !statsRes.ok || !eventsRes.ok) {
                const errorMsg = (eventsJson && eventsJson.error) || (statusJson && statusJson.error) || (statsJson && statsJson.error) || 'Unable to load LLM safety audit log';
                throw new Error(errorMsg);
            }

            if (statusJson?.success) setSecurityStatus(statusJson.data as SecurityStatusSnapshot);
            if (statsJson?.success) setLlmSafetyStats(statsJson.data as LlmSafetyStats);
            if (eventsJson?.success && Array.isArray(eventsJson.data)) setLlmSafetyEvents(eventsJson.data as LlmSafetyEvent[]);
            setLlmSafetyLastLoadedAt(Date.now());
        } catch (err) {
            setLlmSafetyError(err instanceof Error ? err.message : 'Failed to load LLM safety audit');
        } finally {
            setLlmSafetyLoading(false);
        }
    }, [authFetch, authToken, canViewLlmSafetyAudit, llmSafetyBlockedOnly, llmSafetySeverityFilter]);

    const saveSettings = useCallback(async () => {
        if (!settings) return;
        setSettingsSaving(true);
        setSettingsMsg(null);
        try {
            const res = await authFetch(`${API_ROOT}/api/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (data.success) {
                setSettings(data.data);
                setSettingsDirty(false);
                setSettingsMsg({ type: 'success', text: 'Settings saved successfully!' });
                setTimeout(() => setSettingsMsg(null), 4000);
            } else {
                setSettingsMsg({ type: 'error', text: data.error || 'Save failed' });
            }
        } catch {
            setSettingsMsg({ type: 'error', text: 'Backend is offline — cannot save settings.' });
        } finally {
            setSettingsSaving(false);
        }
    }, [settings, authFetch]);

    const updateSetting = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => {
        setSettings(prev => prev ? { ...prev, [key]: value } : prev);
        setSettingsDirty(true);
    };

    useEffect(() => {
        fetchItems();
        fetchStats();
    }, [fetchItems, fetchStats]);

    useEffect(() => {
        const handleFocusItem = (event: Event) => {
            const custom = event as CustomEvent<{ itemId?: string; status?: string }>;
            const itemId = custom.detail?.itemId;
            const status = custom.detail?.status;
            if (!itemId) return;

            setActiveTab('triage');
            setTriageFilter('all');
            setSearchQuery('');
            setRoutePickerFor(null);

            // Triage view only renders pending items; only queue a deep-link when target is pending.
            if (status && status !== 'pending') {
                setExpandedId(null);
                return;
            }

            setExpandedId(itemId);
            setFocusTargetItemId(itemId);
        };

        window.addEventListener('qualia-inbox-focus-item', handleFocusItem as EventListener);
        return () => window.removeEventListener('qualia-inbox-focus-item', handleFocusItem as EventListener);
    }, []);

    // ---- Tab-triggered fetches (SPLIT to avoid infinite loop) ----

    // 1. Newsletters — only when newsletters tab opens
    useEffect(() => {
        if (activeTab === 'newsletters') fetchNewsletters();
    }, [activeTab, fetchNewsletters]);

    // 2. Settings + permissions — one-shot fetch when settings tab first opens
    useEffect(() => {
        if (activeTab !== 'settings') {
            // Reset load refs when leaving settings so re-entering will re-fetch
            settingsLoadedRef.current = false;
            llmSafetyLoadedRef.current = false;
            permUsersLoadedRef.current = false;
            return;
        }

        // Fetch settings once
        if (!settingsLoadedRef.current) {
            settingsLoadedRef.current = true;
            fetchSettings();
        }

        // Fetch Legal Shield health once
        if (!legalShieldLoadedRef.current && authToken) {
            legalShieldLoadedRef.current = true;
            fetchLegalShieldHealth();
        }

        // Fetch user list for permissions panel (god only) — once
        if (isGod && !permUsersLoadedRef.current && authToken) {
            permUsersLoadedRef.current = true;
            fetch(`${API_ROOT}/api/auth/users`, {
                headers: { Authorization: `Bearer ${authToken}` },
            })
                .then(r => r.ok ? r.json() : [])
                .then(data => { if (Array.isArray(data)) setPermUsers(data); })
                .catch(() => { /* ignore */ });
        }
    }, [activeTab, fetchSettings, isGod, authToken]);

    // 3. LLM Safety Audit — separate so filter changes don't re-trigger settings fetch
    useEffect(() => {
        if (activeTab !== 'settings' || !canViewLlmSafetyAudit || !authToken) return;
        fetchLlmSafetyAudit();
    }, [activeTab, canViewLlmSafetyAudit, authToken, fetchLlmSafetyAudit]);

    // ---- ACTIONS ----
    const handleArchive = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/${id}/archive`, { method: 'POST' });
            if (res.ok) {
                setUndoStack(prev => [{ id, action: 'archive', ts: Date.now() }, ...prev].slice(0, 10));
                fetchItems();
                fetchStats();
            }
        } catch { /* error */ }
    };

    const handleApprove = async (id: string, projectId?: string) => {
        try {
            const res = await fetch(`${API_BASE}/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId }),
            });
            if (res.ok) {
                setRoutePickerFor(null);
                fetchItems();
                fetchStats();
            }
        } catch { /* error */ }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchItems();
                fetchStats();
            }
        } catch { /* error */ }
    };

    const handleBulkArchive = async () => {
        const ids = Array.from(selectedIds);
        try {
            const res = await fetch(`${API_BASE}/bulk-archive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            });
            if (res.ok) {
                setSelectedIds(new Set());
                fetchItems();
                fetchStats();
            }
        } catch {
            // Fallback: archive one by one
            for (const id of ids) { await handleArchive(id); }
            setSelectedIds(new Set());
        }
    };

    const handleMarkRead = async (id: string) => {
        try {
            await fetch(`${API_BASE}/${id}/read`, { method: 'POST' });
        } catch { /* ignore */ }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        const pendingIds = pendingItems.map(i => i.id);
        if (selectedIds.size === pendingIds.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(pendingIds));
        }
    };

    // ---- COMPUTED ----
    const pendingItems = useMemo(() => {
        let result = items.filter(i => i.status === 'pending');
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(i =>
                i.subject.toLowerCase().includes(q) ||
                i.sender.toLowerCase().includes(q) ||
                i.snippet.toLowerCase().includes(q)
            );
        }
        return result;
    }, [items, searchQuery]);

    useEffect(() => {
        if (!focusTargetItemId) return;
        const target = pendingItems.find(item => item.id === focusTargetItemId);
        if (!target) return;

        const card = inboxCardRefs.current[focusTargetItemId];
        if (card) {
            card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        setExpandedId(focusTargetItemId);
        setFocusedItemId(focusTargetItemId);
        setFocusTargetItemId(null);

        if (inboxFocusTimerRef.current) {
            clearTimeout(inboxFocusTimerRef.current);
        }
        inboxFocusTimerRef.current = window.setTimeout(() => {
            setFocusedItemId(current => (current === target.id ? null : current));
        }, 2200);
    }, [focusTargetItemId, pendingItems]);

    const zeroProgress = useMemo(() => {
        if (!stats || stats.total === 0) return 100;
        return Math.round(((stats.total - stats.pending) / stats.total) * 100);
    }, [stats]);

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 60) return `${diffMin}m`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h`;
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // Undo toast auto-clear
    useEffect(() => {
        if (undoStack.length > 0) {
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            undoTimerRef.current = window.setTimeout(() => {
                setUndoStack(prev => prev.slice(0, -1));
            }, 5000);
        }
        return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
    }, [undoStack]);

    useEffect(() => {
        return () => {
            if (inboxFocusTimerRef.current) clearTimeout(inboxFocusTimerRef.current);
        };
    }, []);

    // ---- RENDER ----
    return (
        <div className="iz">
            {/* ========== HEADER ========== */}
            <div className="iz-header">
                <div className="iz-header__top">
                    <div className="iz-header__title-row">
                        <span className="iz-header__icon">📭</span>
                        <h2 className="iz-header__title">Inbox Zero</h2>
                    </div>

                    {/* Progress ring */}
                    <div className="iz-progress">
                        <svg className="iz-progress__ring" viewBox="0 0 44 44">
                            <circle className="iz-progress__bg" cx="22" cy="22" r="18" />
                            <circle
                                className="iz-progress__fill"
                                cx="22" cy="22" r="18"
                                style={{
                                    strokeDasharray: `${2 * Math.PI * 18}`,
                                    strokeDashoffset: `${2 * Math.PI * 18 * (1 - zeroProgress / 100)}`,
                                }}
                            />
                        </svg>
                        <span className="iz-progress__text">{zeroProgress}%</span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="iz-tabs">
                    {([
                        { id: 'triage' as TabId, label: '📬 Triage', count: stats?.pending },
                        { id: 'newsletters' as TabId, label: '📰 Newsletters', count: newsletters.length },
                        { id: 'stats' as TabId, label: '📊 Stats' },
                        { id: 'capabilities' as TabId, label: '🎯 Capabilities' },
                        { id: 'settings' as TabId, label: '⚙️ Settings' },
                    ]).map(tab => (
                        <button
                            key={tab.id}
                            className={`iz-tab ${activeTab === tab.id ? 'iz-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className="iz-tab__badge">{tab.count}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ========== TRIAGE TAB ========== */}
            {activeTab === 'triage' && (
                <div className="iz-triage">
                    {/* Search + filter bar */}
                    <div className="iz-toolbar">
                        <input
                            className="iz-toolbar__search"
                            placeholder="Search emails…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <div className="iz-toolbar__filters">
                            {['all', 'signal', 'noise', 'low_priority'].map(f => (
                                <button
                                    key={f}
                                    className={`iz-filter ${triageFilter === f ? 'iz-filter--active' : ''}`}
                                    onClick={() => setTriageFilter(f)}
                                >
                                    {f === 'all' ? 'All' : SIGNAL_CONFIG[f]?.icon + ' ' + SIGNAL_CONFIG[f]?.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Batch action bar */}
                    {selectedIds.size > 0 && (
                        <div className="iz-batch">
                            <button className="iz-batch__select-all" onClick={selectAll}>
                                {selectedIds.size === pendingItems.length ? 'Deselect all' : 'Select all'}
                            </button>
                            <span className="iz-batch__count">{selectedIds.size} selected</span>
                            <button className="iz-batch__btn iz-batch__btn--archive" onClick={handleBulkArchive}>
                                📥 Archive
                            </button>
                        </div>
                    )}

                    {/* Cards list */}
                    <div className="iz-cards">
                        {loading && <div className="iz-loading">Loading inbox…</div>}

                        {!loading && pendingItems.length === 0 && (
                            <div className="iz-empty">
                                <div className="iz-empty__icon">🎉</div>
                                <div className="iz-empty__title">Inbox Zero!</div>
                                <div className="iz-empty__sub">All caught up — nice work.</div>
                            </div>
                        )}

                        {pendingItems.map(item => {
                            const sc = SIGNAL_CONFIG[item.signalClass];
                            const isExpanded = expandedId === item.id;
                            const isSelected = selectedIds.has(item.id);

                            return (
                                <div
                                    key={item.id}
                                    ref={el => { inboxCardRefs.current[item.id] = el; }}
                                    className={`iz-card ${isExpanded ? 'iz-card--expanded' : ''} ${isSelected ? 'iz-card--selected' : ''} ${focusedItemId === item.id ? 'iz-card--focus' : ''}`}
                                    style={{ '--signal-color': sc?.color } as React.CSSProperties}
                                >
                                    <div className="iz-card__main" onClick={() => {
                                        setExpandedId(isExpanded ? null : item.id);
                                        if (!item.isRead) handleMarkRead(item.id);
                                    }}>
                                        <input
                                            type="checkbox"
                                            className="iz-card__check"
                                            checked={isSelected}
                                            onChange={e => { e.stopPropagation(); toggleSelect(item.id); }}
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <div className="iz-card__urgency" style={{ background: URGENCY_COLORS[item.urgency] }} />
                                        <div className="iz-card__content">
                                            <div className="iz-card__top">
                                                <span className="iz-card__subject">{item.subject}</span>
                                                <span className="iz-card__time">{formatTime(item.createdAt)}</span>
                                            </div>
                                            <div className="iz-card__bottom">
                                                <span className="iz-card__sender">{item.sender}</span>
                                                <span className="iz-card__signal" style={{ color: sc?.color, background: sc?.color + '18' }}>
                                                    {sc?.icon} {sc?.label}
                                                </span>
                                                {item.hasAttachments && <span className="iz-card__attach">📎</span>}
                                            </div>
                                            <p className="iz-card__snippet">{item.summary || item.snippet}</p>
                                            {item.routedToProject && (
                                                <div className="iz-card__route">
                                                    ➜ {PROJECT_NAMES[item.routedToProject] || item.routedToProject}
                                                    {item.routingConfidence && (
                                                        <span className="iz-card__conf">{Math.round(item.routingConfidence * 100)}%</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <span className="iz-card__chevron">{isExpanded ? '▾' : '▸'}</span>
                                    </div>

                                    {isExpanded && (
                                        <div className="iz-card__actions" onClick={e => e.stopPropagation()}>
                                            {item.routingReasoning && (
                                                <p className="iz-card__reasoning">🤖 {item.routingReasoning}</p>
                                            )}
                                            <div className="iz-card__btns">
                                                <button
                                                    className="iz-action iz-action--approve"
                                                    onClick={() => {
                                                        if (item.routedToProject) {
                                                            handleApprove(item.id, item.routedToProject);
                                                        } else {
                                                            setRoutePickerFor(item.id);
                                                        }
                                                    }}
                                                >
                                                    ✅ {item.routedToProject ? 'Approve & Route' : 'Approve'}
                                                </button>
                                                <button className="iz-action iz-action--archive" onClick={() => handleArchive(item.id)}>
                                                    📥 Archive
                                                </button>
                                                <button className="iz-action iz-action--delete" onClick={() => handleDelete(item.id)}>
                                                    🗑️ Delete
                                                </button>
                                            </div>

                                            {routePickerFor === item.id && (
                                                <div className="iz-picker">
                                                    <p className="iz-picker__label">Route to project:</p>
                                                    <div className="iz-picker__grid">
                                                        {Object.entries(PROJECT_NAMES).map(([id, name]) => (
                                                            <button
                                                                key={id}
                                                                className="iz-picker__option"
                                                                onClick={() => handleApprove(item.id, id)}
                                                            >
                                                                {name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ========== NEWSLETTERS TAB ========== */}
            {activeTab === 'newsletters' && (
                <div className="iz-newsletters">
                    {newsletters.length === 0 ? (
                        <div className="iz-empty">
                            <div className="iz-empty__icon">📰</div>
                            <div className="iz-empty__title">No newsletters detected</div>
                            <div className="iz-empty__sub">Sender stats will appear as emails are processed.</div>
                        </div>
                    ) : (
                        newsletters.map(nl => (
                            <div key={nl.sender} className="iz-nl">
                                <div className="iz-nl__info">
                                    <div className="iz-nl__avatar">
                                        {nl.sender.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="iz-nl__details">
                                        <span className="iz-nl__name">{nl.sender}</span>
                                        <span className="iz-nl__meta">
                                            {nl.count} emails · {(nl.readRate * 100).toFixed(0)}% read
                                        </span>
                                    </div>
                                </div>
                                <div className="iz-nl__bar-wrap">
                                    <div className="iz-nl__bar">
                                        <div
                                            className="iz-nl__bar-fill"
                                            style={{ width: `${nl.readRate * 100}%` }}
                                        />
                                    </div>
                                </div>
                                <div className={`iz-nl__status ${nl.unsubscribed ? 'iz-nl__status--off' : ''}`}>
                                    {nl.unsubscribed ? '🔕 Unsubscribed' : '🔔 Subscribed'}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ========== STATS TAB ========== */}
            {activeTab === 'stats' && (
                <div className="iz-stats-tab">
                    {/* Donut chart */}
                    <div className="iz-donut-section">
                        <svg className="iz-donut" viewBox="0 0 120 120">
                            <circle className="iz-donut__bg" cx="60" cy="60" r="50" />
                            {stats && (() => {
                                const total = stats.total || 1;
                                const r = 50;
                                const C = 2 * Math.PI * r;
                                const segments = [
                                    { name: 'Signal', value: stats.signal, color: '#22c55e' },
                                    { name: 'Noise', value: stats.noise, color: '#6b7280' },
                                    { name: 'Low', value: stats.lowPriority || 0, color: '#eab308' },
                                ];
                                let offset = 0;
                                return segments.map(seg => {
                                    const pct = seg.value / total;
                                    const dash = pct * C;
                                    const el = (
                                        <circle
                                            key={seg.name}
                                            cx="60" cy="60" r={r}
                                            fill="none"
                                            stroke={seg.color}
                                            strokeWidth="10"
                                            strokeDasharray={`${dash} ${C - dash}`}
                                            strokeDashoffset={-offset}
                                            strokeLinecap="round"
                                            className="iz-donut__seg"
                                        />
                                    );
                                    offset += dash;
                                    return el;
                                });
                            })()}
                            <text x="60" y="55" textAnchor="middle" className="iz-donut__num">{stats?.total || 0}</text>
                            <text x="60" y="72" textAnchor="middle" className="iz-donut__label">total</text>
                        </svg>

                        <div className="iz-legend">
                            {[
                                { name: 'Pending', value: stats?.pending || 0, color: '#818cf8' },
                                { name: 'Signal', value: stats?.signal || 0, color: '#22c55e' },
                                { name: 'Noise', value: stats?.noise || 0, color: '#6b7280' },
                                { name: 'Approved', value: stats?.approved || 0, color: '#60a5fa' },
                                { name: 'Archived', value: stats?.archived || 0, color: '#374151' },
                            ].map(item => (
                                <div key={item.name} className="iz-legend__item">
                                    <span className="iz-legend__dot" style={{ background: item.color }} />
                                    <span className="iz-legend__name">{item.name}</span>
                                    <span className="iz-legend__value">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Progress metrics */}
                    <div className="iz-metrics">
                        <div className="iz-metric">
                            <div className="iz-metric__value" style={{ color: '#34d399' }}>{zeroProgress}%</div>
                            <div className="iz-metric__label">Inbox Zero Progress</div>
                            <div className="iz-metric__bar">
                                <div className="iz-metric__bar-fill" style={{ width: `${zeroProgress}%`, background: '#34d399' }} />
                            </div>
                        </div>
                        <div className="iz-metric">
                            <div className="iz-metric__value" style={{ color: '#818cf8' }}>{stats?.pending || 0}</div>
                            <div className="iz-metric__label">Remaining</div>
                        </div>
                        <div className="iz-metric">
                            <div className="iz-metric__value" style={{ color: '#60a5fa' }}>{stats?.approved || 0}</div>
                            <div className="iz-metric__label">Processed Today</div>
                        </div>
                        <div className="iz-metric">
                            <div className="iz-metric__value" style={{ color: '#22c55e' }}>
                                {stats && stats.total > 0 ? Math.round((stats.signal / stats.total) * 100) : 0}%
                            </div>
                            <div className="iz-metric__label">Signal Ratio</div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========== CAPABILITIES TAB ========== */}
            {activeTab === 'capabilities' && (
                <div className="iz-cap">
                    {/* Summary banner */}
                    <div className="iz-cap__banner">
                        <div className="iz-cap__banner-stats">
                            <div className="iz-cap__stat">
                                <span className="iz-cap__stat-value">{enabledCategories}/{CAPABILITIES_DATA.length}</span>
                                <span className="iz-cap__stat-label">Categories Active</span>
                            </div>
                            <div className="iz-cap__stat">
                                <span className="iz-cap__stat-value">{totalFeatures}</span>
                                <span className="iz-cap__stat-label">Total Features</span>
                            </div>
                        </div>
                    </div>

                    {/* Category cards */}
                    <div className="iz-cap__list">
                        {CAPABILITIES_DATA.map(cat => {
                            const isExpanded = expandedCaps.has(cat.id);
                            const isEnabled = capabilityToggles[cat.id] !== false;

                            return (
                                <div
                                    key={cat.id}
                                    className={`iz-cap__card ${isExpanded ? 'iz-cap__card--expanded' : ''} ${!isEnabled ? 'iz-cap__card--disabled' : ''}`}
                                    style={{ '--cap-color': cat.color } as React.CSSProperties}
                                >
                                    <div className="iz-cap__header" onClick={() => toggleCapExpand(cat.id)}>
                                        <span className="iz-cap__icon">{cat.icon}</span>
                                        <div className="iz-cap__title-area">
                                            <span className="iz-cap__title">{cat.title}</span>
                                            <span className="iz-cap__desc">{cat.description}</span>
                                        </div>
                                        <div className="iz-cap__meta">
                                            <span className="iz-cap__count" style={{ color: cat.color, background: cat.color + '18' }}>
                                                {cat.features.length}
                                            </span>
                                            {!isEnabled && <span className="iz-cap__disabled-badge">OFF</span>}
                                            <span className="iz-cap__chevron">{isExpanded ? '▾' : '▸'}</span>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="iz-cap__features">
                                            {cat.features.map((feat, idx) => (
                                                <div key={idx} className="iz-cap__feature">
                                                    <span className="iz-cap__feature-dot" style={{ background: isEnabled ? cat.color : '#374151' }} />
                                                    <div className="iz-cap__feature-info">
                                                        <span className="iz-cap__feature-name">{feat.name}</span>
                                                        <span className="iz-cap__feature-desc">{feat.description}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ========== SETTINGS TAB ========== */}
            {activeTab === 'settings' && (
                <div className="iz-settings">
                    {!settings ? (
                        <div className="iz-loading">Loading settings…</div>
                    ) : (
                        <>
                            {/* Save bar */}
                            <div className="iz-settings__bar">
                                <span className="iz-settings__bar-label">
                                    {settingsDirty ? '● Unsaved changes' : 'Agent Configuration'}
                                </span>
                                <button
                                    className={`iz-settings__save ${settingsDirty ? 'iz-settings__save--active' : ''}`}
                                    onClick={saveSettings}
                                    disabled={settingsSaving || !settingsDirty}
                                >
                                    {settingsSaving ? '⏳ Saving…' : '💾 Save Settings'}
                                </button>
                            </div>

                            {settingsMsg && (
                                <div className={`iz-settings__msg iz-settings__msg--${settingsMsg.type}`}>
                                    {settingsMsg.type === 'success' ? '✅' : '❌'} {settingsMsg.text}
                                </div>
                            )}

                            {/* Inbox Zero Capabilities */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">🎯 Inbox Zero Capabilities</h3>
                                <p className="iz-settings__section-desc">Enable or disable capability modules. Disabled modules will be marked inactive in the Capabilities tab.</p>
                                <div className="iz-cap-settings">
                                    {CAPABILITIES_DATA.map(cat => (
                                        <label key={cat.id} className={`iz-cap-settings__item ${capabilityToggles[cat.id] !== false ? 'iz-cap-settings__item--on' : ''}`}>
                                            <div className="iz-cap-settings__info">
                                                <span className="iz-cap-settings__icon">{cat.icon}</span>
                                                <div className="iz-cap-settings__text">
                                                    <span className="iz-cap-settings__name">{cat.title}</span>
                                                    <span className="iz-cap-settings__count">{cat.features.length} features</span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className={`iz-settings__toggle ${capabilityToggles[cat.id] !== false ? 'iz-settings__toggle--on' : ''}`}
                                                onClick={(e) => { e.preventDefault(); toggleCapability(cat.id); }}
                                            >
                                                <span className="iz-settings__toggle-knob" />
                                            </button>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Legal Shield Status */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">⚖️ Legal Shield — Georgia Code</h3>
                                <p className="iz-settings__section-desc">
                                    Real-time compliance scanner powered by LanceDB vector search across the full Georgia Code (O.C.G.A.).
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {legalShieldHealth ? (
                                        <>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
                                                background: legalShieldHealth.healthy ? 'rgba(52,211,153,0.10)' : 'rgba(239,68,68,0.10)',
                                                border: `1px solid ${legalShieldHealth.healthy ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                                borderRadius: '8px',
                                            }}>
                                                <span style={{ fontSize: '20px' }}>{legalShieldHealth.healthy ? '✅' : '⚠️'}</span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, color: legalShieldHealth.healthy ? '#34d399' : '#ef4444' }}>
                                                        {legalShieldHealth.healthy ? 'HEALTHY' : 'DEGRADED'}
                                                    </div>
                                                    <div style={{ fontSize: '12px', opacity: 0.7 }}>
                                                        Last checked: {new Date(legalShieldHealth.checkedAt).toLocaleString()} ({legalShieldHealth.checkDurationMs}ms)
                                                    </div>
                                                </div>
                                                <button
                                                    className="iz-settings__save iz-settings__save--active"
                                                    style={{ fontSize: '12px', padding: '6px 12px' }}
                                                    onClick={() => { legalShieldLoadedRef.current = false; fetchLegalShieldHealth(); }}
                                                    disabled={legalShieldLoading}
                                                >
                                                    {legalShieldLoading ? '⏳ Checking…' : '🔄 Run Health Check'}
                                                </button>
                                            </div>
                                            <div style={{
                                                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px',
                                            }}>
                                                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{legalShieldHealth.totalRecords.toLocaleString()}</div>
                                                    <div style={{ fontSize: '11px', opacity: 0.6 }}>Records</div>
                                                </div>
                                                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{legalShieldHealth.volumes}</div>
                                                    <div style={{ fontSize: '11px', opacity: 0.6 }}>Volumes</div>
                                                </div>
                                                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{legalShieldHealth.indices}</div>
                                                    <div style={{ fontSize: '11px', opacity: 0.6 }}>Indices</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {legalShieldHealth.checks.map((c, i) => (
                                                    <div key={i} style={{
                                                        display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                                                        padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px',
                                                    }}>
                                                        <span>{c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'}</span>
                                                        <span style={{ fontFamily: 'monospace', minWidth: '160px' }}>{c.name}</span>
                                                        <span style={{ opacity: 0.7 }}>{c.detail}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                                            {legalShieldLoading ? '⏳ Loading Legal Shield status…' : 'Legal Shield status unavailable'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Themes */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">🎨 Themes</h3>
                                <p className="iz-settings__section-desc">Choose a color palette — applies universally to every widget and section.</p>
                                <div className="iz-themes">
                                    {THEME_PALETTES.map(tp => (
                                        <button
                                            key={tp.id}
                                            className={`iz-theme-card ${currentTheme === tp.id ? 'iz-theme-card--active' : ''}`}
                                            onClick={() => setTheme(tp.id)}
                                        >
                                            <div className="iz-theme-card__swatches">
                                                {tp.colors.map((c, i) => (
                                                    <div key={i} className="iz-theme-card__swatch" style={{ background: c }} />
                                                ))}
                                            </div>
                                            <div className="iz-theme-card__info">
                                                <span className="iz-theme-card__name">{tp.name}</span>
                                                <span className="iz-theme-card__mood">{tp.mood}</span>
                                            </div>
                                            {currentTheme === tp.id && <span className="iz-theme-card__check">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Typography */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">🔤 Typography</h3>
                                <p className="iz-settings__section-desc">Choose a font pairing — applies to all headings, body text, and monospace across Qualia.</p>
                                <div className="iz-fonts">
                                    {FONT_PAIRINGS.map(fp => (
                                        <button
                                            key={fp.id}
                                            className={`iz-font-card ${currentFont === fp.id ? 'iz-font-card--active' : ''}`}
                                            onClick={() => setFontPairing(fp.id)}
                                        >
                                            <div className="iz-font-card__preview">
                                                <span className="iz-font-card__sample-heading" style={{ fontFamily: fp.headingStack }}>Aa</span>
                                                <span className="iz-font-card__sample-body" style={{ fontFamily: fp.bodyStack }}>The quick brown fox</span>
                                            </div>
                                            <div className="iz-font-card__info">
                                                <span className="iz-font-card__name">{fp.name}</span>
                                                <span className="iz-font-card__fonts">{fp.headings} + {fp.body}</span>
                                                <span className="iz-font-card__personality">{fp.personality}</span>
                                            </div>
                                            <div className="iz-font-card__weights">{fp.weights}</div>
                                            {currentFont === fp.id && <span className="iz-font-card__check">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Animations & Interactions */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">✨ Animations & Interactions</h3>
                                <p className="iz-settings__section-desc">Pro Max micro-interactions, scroll reveals, skeleton loaders, glassmorphism, and border beams. Disable to reduce motion.</p>
                                <div className="iz-settings__group">
                                    <label className="iz-settings__label iz-settings__label--toggle">
                                        <div>
                                            <span className="iz-settings__name">Enable Animations</span>
                                            <span className="iz-settings__hint">Toggle all micro-interactions, transitions, and scroll effects. Respects system prefers-reduced-motion.</span>
                                        </div>
                                        <button
                                            type="button"
                                            className={`iz-settings__toggle ${animationsEnabled ? 'iz-settings__toggle--on' : ''}`}
                                            onClick={() => setAnimationsEnabled(!animationsEnabled)}
                                        >
                                            <span className="iz-settings__toggle-knob" />
                                        </button>
                                    </label>
                                </div>
                            </div>

                            {/* 🔐 Permissions (god only) */}
                            {isGod && (
                                <div className="iz-settings__section">
                                    <h3 className="iz-settings__section-title">🔐 Permissions</h3>
                                    <p className="iz-settings__section-desc">Assign widget and section visibility per user. Only you (Andy) can manage these.</p>

                                    {/* User Selector */}
                                    <div className="iz-settings__group">
                                        <label className="iz-settings__label">
                                            <span className="iz-settings__name">Select User</span>
                                            <select
                                                className="iz-settings__input iz-perms__user-select"
                                                value={permSelectedUser}
                                                onChange={async (e) => {
                                                    const uid = e.target.value;
                                                    setPermSelectedUser(uid);
                                                    if (!uid) { setPermMap({}); return; }
                                                    setPermLoading(true);
                                                    try {
                                                        const res = await fetch(`${API_ROOT}/api/auth/permissions/${uid}`, {
                                                            headers: { Authorization: `Bearer ${authToken}` },
                                                        });
                                                        if (res.ok) {
                                                            const data = await res.json();
                                                            setPermMap(data.permissions || {});
                                                        }
                                                    } catch { /* ignore */ }
                                                    setPermLoading(false);
                                                }}
                                            >
                                                <option value="">— Choose a user —</option>
                                                {permUsers.filter(u => u.role !== 'god').map(u => (
                                                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>

                                    {permSelectedUser && !permLoading && (
                                        <>
                                            {/* Bulk Toggle */}
                                            <div className="iz-perms__bulk">
                                                <button
                                                    className="iz-perms__bulk-btn"
                                                    onClick={() => {
                                                        const allOn = Object.values(permMap).every(v => v);
                                                        const toggled: Record<string, boolean> = {};
                                                        for (const k of Object.keys(permMap)) toggled[k] = !allOn;
                                                        setPermMap(toggled);
                                                    }}
                                                >
                                                    {Object.values(permMap).every(v => v) ? '☐ Deselect All' : '☑ Select All'}
                                                </button>
                                            </div>

                                            {/* Widget Permissions */}
                                            <div className="iz-perms__category">
                                                <h4 className="iz-perms__category-title">⊞ Widgets</h4>
                                                <div className="iz-perms__grid">
                                                    {[
                                                        { key: 'widget:astra-dashboard', icon: '◈', label: 'Astra' },
                                                        { key: 'widget:strata-dashboard', icon: '🏢', label: 'Strata' },
                                                        { key: 'widget:thought-weaver', icon: '🧶', label: 'Thought Weaver' },
                                                        { key: 'widget:inbox-zero', icon: '📭', label: 'Inbox Zero' },
                                                        { key: 'widget:inbox', icon: '📬', label: 'Inbox' },
                                                        { key: 'widget:tasks', icon: '✅', label: 'Tasks' },
                                                        { key: 'widget:ara-console', icon: '🧠', label: 'ARA' },
                                                        { key: 'widget:transcription', icon: '🎙️', label: 'Transcribe' },
                                                        { key: 'widget:fact-check-log', icon: '🔍', label: 'Fact Check' },
                                                        { key: 'widget:hierarchy-browser', icon: '🗂️', label: 'Explorer' },
                                                        { key: 'widget:file-manager', icon: '📁', label: 'Files' },
                                                        { key: 'widget:notepad', icon: '📝', label: 'Notepad' },
                                                        { key: 'widget:doc-viewer', icon: '📄', label: 'Docs' },
                                                        { key: 'widget:terminal', icon: '⬛', label: 'Terminal' },
                                                        { key: 'widget:trello-board', icon: '📋', label: 'Trello' },
                                                        { key: 'widget:control-panel', icon: '⚙️', label: 'Settings' },
                                                    ].map(w => (
                                                        <label key={w.key} className={`iz-perms__item ${permMap[w.key] ? 'iz-perms__item--on' : ''}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!permMap[w.key]}
                                                                onChange={(e) => setPermMap(prev => ({ ...prev, [w.key]: e.target.checked }))}
                                                            />
                                                            <span className="iz-perms__item-icon">{w.icon}</span>
                                                            <span className="iz-perms__item-label">{w.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Section Permissions */}
                                            <div className="iz-perms__category">
                                                <h4 className="iz-perms__category-title">📐 Sections</h4>
                                                <div className="iz-perms__grid iz-perms__grid--sections">
                                                    {[
                                                        { key: 'section:domains', icon: '📂', label: 'Domain Tree' },
                                                        { key: 'section:settings-admin', icon: '🛡️', label: 'Admin Settings' },
                                                    ].map(s => (
                                                        <label key={s.key} className={`iz-perms__item ${permMap[s.key] ? 'iz-perms__item--on' : ''}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!permMap[s.key]}
                                                                onChange={(e) => setPermMap(prev => ({ ...prev, [s.key]: e.target.checked }))}
                                                            />
                                                            <span className="iz-perms__item-icon">{s.icon}</span>
                                                            <span className="iz-perms__item-label">{s.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Save */}
                                            <div className="iz-perms__save-row">
                                                <button
                                                    className="iz-perms__save-btn"
                                                    disabled={permSaving}
                                                    onClick={async () => {
                                                        setPermSaving(true);
                                                        setPermSaveMsg('');
                                                        try {
                                                            const res = await fetch(`${API_ROOT}/api/auth/permissions/${permSelectedUser}`, {
                                                                method: 'PUT',
                                                                headers: {
                                                                    'Content-Type': 'application/json',
                                                                    Authorization: `Bearer ${authToken}`,
                                                                },
                                                                body: JSON.stringify({ permissions: permMap }),
                                                            });
                                                            if (res.ok) {
                                                                setPermSaveMsg('✅ Permissions saved');
                                                            } else {
                                                                const err = await res.json().catch(() => ({ error: 'Save failed' }));
                                                                setPermSaveMsg(`❌ ${err.error}`);
                                                            }
                                                        } catch {
                                                            setPermSaveMsg('❌ Network error');
                                                        }
                                                        setPermSaving(false);
                                                        setTimeout(() => setPermSaveMsg(''), 4000);
                                                    }}
                                                >
                                                    {permSaving ? 'Saving…' : '💾 Save Permissions'}
                                                </button>
                                                {permSaveMsg && <span className="iz-perms__save-msg">{permSaveMsg}</span>}
                                            </div>
                                        </>
                                    )}

                                    {permLoading && (
                                        <div className="iz-perms__loading">Loading permissions…</div>
                                    )}
                                </div>
                            )}

                            {/* AI & Routing */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">🤖 AI & Routing</h3>
                                <div className="iz-settings__group">
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">OpenAI API Key</span>
                                        <span className="iz-settings__hint">Used for LLM-powered routing (Pass 2)</span>
                                        <input
                                            type="password"
                                            className="iz-settings__input"
                                            value={settings.openaiApiKey}
                                            onChange={e => updateSetting('openaiApiKey', e.target.value)}
                                            placeholder="sk-…"
                                        />
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">OpenAI Model</span>
                                        <span className="iz-settings__hint">Model for email analysis and routing</span>
                                        <select
                                            className="iz-settings__select"
                                            value={settings.openaiModel}
                                            onChange={e => updateSetting('openaiModel', e.target.value)}
                                        >
                                            <option value="gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
                                            <option value="gpt-4o">GPT-4o (best quality)</option>
                                            <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (fastest)</option>
                                        </select>
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Signal Domains</span>
                                        <span className="iz-settings__hint">Comma-separated list of high-priority sender domains</span>
                                        <textarea
                                            className="iz-settings__textarea"
                                            value={settings.signalDomains}
                                            onChange={e => updateSetting('signalDomains', e.target.value)}
                                            placeholder="example.com, client.io"
                                            rows={2}
                                        />
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Noise Domains</span>
                                        <span className="iz-settings__hint">Comma-separated list of known spam/noise domains</span>
                                        <textarea
                                            className="iz-settings__textarea"
                                            value={settings.noiseDomains}
                                            onChange={e => updateSetting('noiseDomains', e.target.value)}
                                            placeholder="marketing.co, spam.io"
                                            rows={2}
                                        />
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Routing Rules File</span>
                                        <span className="iz-settings__hint">Path to JSON file with declarative routing rules</span>
                                        <input
                                            type="text"
                                            className="iz-settings__input"
                                            value={settings.routingRulesFile}
                                            onChange={e => updateSetting('routingRulesFile', e.target.value)}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Gmail */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">📧 Gmail Integration</h3>
                                <div className="iz-settings__group">
                                    <label className="iz-settings__label iz-settings__label--toggle">
                                        <div>
                                            <span className="iz-settings__name">Gmail Fetcher</span>
                                            <span className="iz-settings__hint">Automatically poll for new unread emails</span>
                                        </div>
                                        <button
                                            className={`iz-settings__toggle ${settings.gmailFetcherEnabled ? 'iz-settings__toggle--on' : ''}`}
                                            onClick={() => updateSetting('gmailFetcherEnabled', !settings.gmailFetcherEnabled)}
                                        >
                                            <span className="iz-settings__toggle-knob" />
                                        </button>
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Poll Interval (ms)</span>
                                        <span className="iz-settings__hint">How often to check for new emails (default: 900000 = 15 min)</span>
                                        <input
                                            type="number"
                                            className="iz-settings__input"
                                            value={settings.gmailPollIntervalMs}
                                            onChange={e => updateSetting('gmailPollIntervalMs', parseInt(e.target.value) || 900000)}
                                            min={30000}
                                            step={60000}
                                        />
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Watch Email</span>
                                        <span className="iz-settings__hint">The Gmail address being monitored</span>
                                        <input
                                            type="email"
                                            className="iz-settings__input"
                                            value={settings.gmailWatchEmail}
                                            onChange={e => updateSetting('gmailWatchEmail', e.target.value)}
                                            placeholder="you@example.com"
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Trello */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">📋 Trello Integration</h3>
                                <div className="iz-settings__group">
                                    <label className="iz-settings__label iz-settings__label--toggle">
                                        <div>
                                            <span className="iz-settings__name">Trello Integration</span>
                                            <span className="iz-settings__hint">Create Trello cards for triaged items</span>
                                        </div>
                                        <button
                                            className={`iz-settings__toggle ${settings.trelloEnabled ? 'iz-settings__toggle--on' : ''}`}
                                            onClick={() => updateSetting('trelloEnabled', !settings.trelloEnabled)}
                                        >
                                            <span className="iz-settings__toggle-knob" />
                                        </button>
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Trello API Key</span>
                                        <input
                                            type="password"
                                            className="iz-settings__input"
                                            value={settings.trelloApiKey}
                                            onChange={e => updateSetting('trelloApiKey', e.target.value)}
                                            placeholder="API key"
                                        />
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Trello Token</span>
                                        <input
                                            type="password"
                                            className="iz-settings__input"
                                            value={settings.trelloToken}
                                            onChange={e => updateSetting('trelloToken', e.target.value)}
                                            placeholder="Token"
                                        />
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Board ID</span>
                                        <input
                                            type="text"
                                            className="iz-settings__input"
                                            value={settings.trelloBoardId}
                                            onChange={e => updateSetting('trelloBoardId', e.target.value)}
                                        />
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">List ID</span>
                                        <span className="iz-settings__hint">Target Trello list for new cards</span>
                                        <input
                                            type="text"
                                            className="iz-settings__input"
                                            value={settings.trelloListId}
                                            onChange={e => updateSetting('trelloListId', e.target.value)}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Google Drive & Sharing */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">☁️ Google Drive & Sharing</h3>
                                <div className="iz-settings__group">
                                    <label className="iz-settings__label iz-settings__label--toggle">
                                        <div>
                                            <span className="iz-settings__name">Google Drive Sync</span>
                                            <span className="iz-settings__hint">Enable Google Drive file sharing in triage</span>
                                        </div>
                                        <button
                                            className={`iz-settings__toggle ${settings.googleDriveEnabled ? 'iz-settings__toggle--on' : ''}`}
                                            onClick={() => updateSetting('googleDriveEnabled', !settings.googleDriveEnabled)}
                                        >
                                            <span className="iz-settings__toggle-knob" />
                                        </button>
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Team Share Emails</span>
                                        <span className="iz-settings__hint">Comma-separated emails to auto-share uploaded files with</span>
                                        <textarea
                                            className="iz-settings__textarea"
                                            value={settings.teamShareEmails}
                                            onChange={e => updateSetting('teamShareEmails', e.target.value)}
                                            placeholder="team@example.com, lead@example.com"
                                            rows={2}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Security */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title">🛡️ Security & Guard</h3>
                                <div className="iz-settings__group">
                                    <label className="iz-settings__label iz-settings__label--toggle">
                                        <div>
                                            <span className="iz-settings__name">Entity Guardian</span>
                                            <span className="iz-settings__hint">Pre-upload file scanning and validation</span>
                                        </div>
                                        <button
                                            className={`iz-settings__toggle ${settings.entityGuardianEnabled ? 'iz-settings__toggle--on' : ''}`}
                                            onClick={() => updateSetting('entityGuardianEnabled', !settings.entityGuardianEnabled)}
                                        >
                                            <span className="iz-settings__toggle-knob" />
                                        </button>
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Max File Size (MB)</span>
                                        <span className="iz-settings__hint">Maximum allowed file upload size</span>
                                        <input
                                            type="number"
                                            className="iz-settings__input"
                                            value={settings.maxFileSizeMb}
                                            onChange={e => updateSetting('maxFileSizeMb', parseInt(e.target.value) || 100)}
                                            min={1}
                                            max={2048}
                                        />
                                    </label>
                                    <label className="iz-settings__label">
                                        <span className="iz-settings__name">Blocked Extensions</span>
                                        <span className="iz-settings__hint">Comma-separated file extensions to reject</span>
                                        <textarea
                                            className="iz-settings__textarea"
                                            value={settings.blockedExtensions}
                                            onChange={e => updateSetting('blockedExtensions', e.target.value)}
                                            placeholder="exe, bat, cmd, scr"
                                            rows={2}
                                        />
                                    </label>
                                </div>

                                {canViewLlmSafetyAudit && (
                                    <div className="iz-settings__group iz-safety">
                                        <div className="iz-safety__header">
                                            <div>
                                                <span className="iz-settings__name">LLM Safety Audit (Prompt Injection Alerts)</span>
                                                <span className="iz-settings__hint">
                                                    Persistent event log for flagged prompt-injection attempts across agents and automations.
                                                    {llmSafetyLastLoadedAt ? ` Last refreshed ${new Date(llmSafetyLastLoadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : ''}
                                                </span>
                                            </div>
                                            <div className="iz-safety__controls">
                                                <select
                                                    className="iz-safety__select"
                                                    value={llmSafetySeverityFilter}
                                                    onChange={e => setLlmSafetySeverityFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
                                                >
                                                    <option value="all">All severities</option>
                                                    <option value="high">High</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="low">Low</option>
                                                </select>
                                                <label className="iz-safety__checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={llmSafetyBlockedOnly}
                                                        onChange={e => setLlmSafetyBlockedOnly(e.target.checked)}
                                                    />
                                                    Blocked only
                                                </label>
                                                <button
                                                    type="button"
                                                    className="iz-safety__refresh"
                                                    onClick={fetchLlmSafetyAudit}
                                                    disabled={llmSafetyLoading}
                                                >
                                                    {llmSafetyLoading ? '⏳ Loading…' : '↻ Refresh'}
                                                </button>
                                            </div>
                                        </div>

                                        {securityStatus && (
                                            <div className="iz-safety__status-grid">
                                                <div className="iz-safety__status-card">
                                                    <div className="iz-safety__status-label">Audit Persistence</div>
                                                    <div className="iz-safety__status-value">
                                                        {securityStatus.llmSafetyAudit.persistentLogEnabled ? 'Enabled' : 'Disabled'}
                                                    </div>
                                                    <div className="iz-safety__status-meta">Max rows: {securityStatus.llmSafetyAudit.maxRows}</div>
                                                </div>
                                                <div className={`iz-safety__status-card ${securityStatus.domainEncryption.astra.enabled ? 'is-enabled' : 'is-disabled'}`}>
                                                    <div className="iz-safety__status-label">Astra Encryption</div>
                                                    <div className="iz-safety__status-value">{securityStatus.domainEncryption.astra.enabled ? 'Enabled' : 'Disabled'}</div>
                                                    <div className="iz-safety__status-meta">Source: {securityStatus.domainEncryption.astra.source}</div>
                                                </div>
                                                <div className={`iz-safety__status-card ${securityStatus.domainEncryption.strata.enabled ? 'is-enabled' : 'is-disabled'}`}>
                                                    <div className="iz-safety__status-label">Strata Encryption</div>
                                                    <div className="iz-safety__status-value">{securityStatus.domainEncryption.strata.enabled ? 'Enabled' : 'Disabled'}</div>
                                                    <div className="iz-safety__status-meta">Source: {securityStatus.domainEncryption.strata.source}</div>
                                                </div>
                                            </div>
                                        )}

                                        {llmSafetyStats && (
                                            <div className="iz-safety__stats">
                                                <div className="iz-safety__stat">
                                                    <span className="iz-safety__stat-label">24h Events</span>
                                                    <span className="iz-safety__stat-value">{llmSafetyStats.total}</span>
                                                </div>
                                                <div className="iz-safety__stat">
                                                    <span className="iz-safety__stat-label">Blocked</span>
                                                    <span className="iz-safety__stat-value">{llmSafetyStats.blocked}</span>
                                                </div>
                                                <div className="iz-safety__stat">
                                                    <span className="iz-safety__stat-label">High</span>
                                                    <span className="iz-safety__stat-value">{llmSafetyStats.bySeverity.high || 0}</span>
                                                </div>
                                                <div className="iz-safety__stat">
                                                    <span className="iz-safety__stat-label">Medium</span>
                                                    <span className="iz-safety__stat-value">{llmSafetyStats.bySeverity.medium || 0}</span>
                                                </div>
                                                <div className="iz-safety__stat">
                                                    <span className="iz-safety__stat-label">Low</span>
                                                    <span className="iz-safety__stat-value">{llmSafetyStats.bySeverity.low || 0}</span>
                                                </div>
                                            </div>
                                        )}

                                        {llmSafetyError && (
                                            <div className="iz-safety__error">❌ {llmSafetyError}</div>
                                        )}

                                        <div className="iz-safety__events">
                                            {llmSafetyLoading && llmSafetyEvents.length === 0 && (
                                                <div className="iz-safety__empty">Loading LLM safety events…</div>
                                            )}

                                            {!llmSafetyLoading && llmSafetyEvents.length === 0 && !llmSafetyError && (
                                                <div className="iz-safety__empty">No matching LLM safety events found.</div>
                                            )}

                                            {llmSafetyEvents.map(event => {
                                                const metaEntries = Object.entries(event.meta || {}).slice(0, 3);
                                                return (
                                                    <div key={event.id} className={`iz-safety__event iz-safety__event--${event.severity}`}>
                                                        <div className="iz-safety__event-top">
                                                            <span className={`iz-safety__badge iz-safety__badge--${event.severity}`}>
                                                                {event.severity.toUpperCase()}
                                                            </span>
                                                            {event.blocked && (
                                                                <span className="iz-safety__badge iz-safety__badge--blocked">BLOCKED</span>
                                                            )}
                                                            <span className="iz-safety__scope">{event.scope}</span>
                                                            <span className="iz-safety__score">score {event.score}</span>
                                                            <span className="iz-safety__time">
                                                                {new Date(event.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        <div className="iz-safety__signals">
                                                            {event.signals.map((signal, idx) => (
                                                                <span key={`${event.id}-${signal.label}-${idx}`} className={`iz-safety__signal iz-safety__signal--${signal.severity}`}>
                                                                    {signal.label}
                                                                    {signal.match ? `: ${signal.match}` : ''}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        {metaEntries.length > 0 && (
                                                            <div className="iz-safety__meta">
                                                                {metaEntries.map(([key, value]) => (
                                                                    <span key={`${event.id}-${key}`} className="iz-safety__meta-item">
                                                                        <strong>{key}</strong>: {String(value)}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ========== UNDO TOAST ========== */}
            {undoStack.length > 0 && (
                <div className="iz-undo">
                    <span>📥 Archived — </span>
                    <button className="iz-undo__btn" onClick={() => setUndoStack([])}>Undo</button>
                </div>
            )}
        </div>
    );
}
