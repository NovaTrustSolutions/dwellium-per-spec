/**
 * InboxZeroTypes.ts — Shared TypeScript interfaces for all Inbox Zero tabs
 *
 * Imported by: TriageTab, NewsletterTab, StatsTab,
 *              SettingsTab, InboxZero (orchestrator), and all sub-components.
 *
 * Single source of truth — no duplicate interface definitions.
 */

import type { LucideIcon } from 'lucide-react';
import { Zap, VolumeX, Pause } from 'lucide-react';

// ─── Tab ID ────────────────────────────────────────────
export type TabId =
    | 'triage'
    | 'newsletters'
    | 'rules'
    | 'audit'
    | 'stats'
    | 'settings';

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

// ponytail: capability catalog + settings toggles deleted at plan 066 §2b
// (advertised features the code contradicted); CapabilitiesTab.tsx removed too.

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

export const SIGNAL_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon }> = {
    signal: { label: 'Signal', color: '#22c55e', icon: Zap },
    noise: { label: 'Noise', color: '#6b7280', icon: VolumeX },
    low_priority: { label: 'Low', color: '#eab308', icon: Pause },
};

export const PROJECT_NAMES: Record<string, string> = {
    'proj-invoicing': 'Invoicing',
    'proj-msa': 'MSA Management',
    'proj-onboarding': 'Onboarding',
    'proj-gdpr': 'GDPR / Privacy',
    'proj-inventory': 'Inventory',
    'proj-brand-guidelines': 'Brand Guidelines',
    'proj-reports': 'Financial Reports',
    'proj-hive': 'The Hive',
    'proj-dashboard': 'AI-Dashboard369',
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
