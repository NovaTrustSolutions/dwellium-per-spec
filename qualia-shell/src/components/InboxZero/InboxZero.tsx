import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
    ArrowDown, ArrowUp, Bot, Brain, Building2, Check, ClipboardList, Clock, Cloud,
    Download, FileSpreadsheet, FileText, Film, Folder, FolderOpen, FolderTree, Image,
    Inbox, LayoutDashboard, LayoutGrid, Link, ListChecks, Lock, Mail, MailOpen, Mic, Music, Package,
    Palette, Paperclip, PartyPopper, RefreshCw, Reply, Ruler, Save, Scale, Search, Settings,
    ShieldCheck, Sparkles, Square, SquareCheck, Terminal, Trash2, TriangleAlert, Type,
    Undo2, Workflow, X, Zap,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme, FONT_PAIRINGS } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { INBOX_API, SECURITY_API, API_BASE } from '../../config/api';
import { Theme } from '../../data/types';
import type {
    InboxItem, NewsletterSender, InboxStats, AgentSettings,
    LlmSafetyEvent, LlmSafetyStats, SecurityStatusSnapshot,
    TabId, AuditLogEntry, ThreadLink, OperatorMetrics,
    URGENCY_COLORS as URGENCY_COLORS_TYPE, SIGNAL_CONFIG as SIGNAL_CONFIG_TYPE, PROJECT_NAMES as PROJECT_NAMES_TYPE,
} from './InboxZeroTypes';
import { URGENCY_COLORS, SIGNAL_CONFIG, PROJECT_NAMES } from './InboxZeroTypes';
import { sanitizeHtml } from '../../utils/safeMarkdown';
import './InboxZero.css';

import NewslettersTab from './NewslettersTab';
import StatsTab from './StatsTab';
import RulesManager from './RulesManager';
import { GlobalAuditTab } from './GlobalAuditTab';
import { DraftReplyPanel } from './SmartActions';
import {
    useInboxItems, useInboxStats, useNewsletters, useOperatorMetrics,
    useSettings as useSettingsQuery, useEmailBody,
    inboxKeys,
} from './useInboxQueries';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { useWidgetMemory } from '../../lib/widgetMemory';
import { backendStatusStore } from '../../lib/backendStatusStore';

// QueryClient is provided at the App level via QueryProvider.

// ============================================
// Types are imported from ./InboxZeroTypes.ts
// ============================================

const API_INBOX = INBOX_API;
const SECURITY_API_BASE = SECURITY_API;


const THEME_PALETTES: { id: Theme; name: string; mood: string; colors: string[] }[] = [
    { id: 'dark', name: 'Dwellium Dark', mood: 'Default dark interface', colors: ['#0d0f12', '#16191f', 'var(--accent)', '#e8eaed'] },
    { id: 'light', name: 'Dwellium Light', mood: 'Default light interface', colors: ['#e8ecf1', '#ffffff', 'var(--accent)', '#1a1d24'] },
    { id: 'trust', name: 'Trust & Professional', mood: 'Reliable, secure, established', colors: ['#0F172A', '#0369A1', '#F8FAFC', '#3B82F6'] },
    { id: 'vibrant', name: 'Vibrant & Modern', mood: 'Innovative, energetic', colors: ['#6366F1', '#22c55e', '#FFFFFF', '#f59e0b'] },
    { id: 'luxury', name: 'Luxury & Premium', mood: 'Sophisticated, exclusive', colors: ['#1C1917', '#CA8A04', '#FAFAF9', '#78716C'] },
    { id: 'healthcare', name: 'Healthcare', mood: 'Calm, trustworthy, clean', colors: ['#0891B2', '#059669', '#FFFFFF', '#06B6D4'] },
    { id: 'creative', name: 'Creative & Playful', mood: 'Fun, approachable', colors: ['#EC4899', '#8B5CF6', '#FEF3C7', '#f59e0b'] },
    { id: 'dark-excellence', name: 'Dark Excellence', mood: 'True black, 15:1 contrast', colors: ['#0A0A0A', '#1A1A1A', '#3B82F6', '#FFFFFF'] },
];

// Plan 066 §5e — snooze durations offered from the triage card menu.
const SNOOZE_OPTIONS: Array<{ label: string; ms: number }> = [
    { label: '1 hour', ms: 60 * 60_000 },
    { label: '4 hours', ms: 4 * 60 * 60_000 },
    { label: '1 day', ms: 24 * 60 * 60_000 },
    { label: '1 week', ms: 7 * 24 * 60 * 60_000 },
];

// Urgency colors, signal config, and project names imported from InboxZeroTypes.ts

// Project names imported from InboxZeroTypes.ts

// ============================================
// COMPONENT
// ============================================

export default function InboxZero() {
    const { theme: currentTheme, setTheme, fontPairing: currentFont, setFontPairing, animationsEnabled, setAnimationsEnabled } = useTheme();
    const queryClient = useQueryClient();
    usePerUserIdentity();
    // Plan 055 phase 2 — tab, triage filter and the open message reopen where
    // they were left (a stale message id simply matches no row).
    // storage key, not a registry id — kept so existing widget memory
    // (remembered tab/filter) survives the alias retirement (plan 066 §3d).
    const [mem, patchMem] = useWidgetMemory('inbox-zero', {
        activeTab: 'triage',
        triageFilter: 'all',
        expandedId: null as string | null,
    });
    // A persisted activeTab from a retired tab (nif/actions/analytics/
    // cold-email/replies/tracker/capabilities, plan 066 §2a) falls back
    // to 'triage' — it simply won't match IZ_TABS below. Rules + Audit came
    // back at plan 066 §5b/§5c.
    const IZ_TABS: readonly TabId[] = ['triage', 'newsletters', 'rules', 'audit', 'stats', 'settings'];
    const activeTab: TabId = IZ_TABS.includes(mem.activeTab as TabId) ? (mem.activeTab as TabId) : 'triage';
    const setActiveTab = useCallback((t: TabId): void => patchMem({ activeTab: t }), [patchMem]);
    const triageFilter = mem.triageFilter;
    const setTriageFilter = useCallback((f: string): void => patchMem({ triageFilter: f }), [patchMem]);
    const expandedId = mem.expandedId;
    const setExpandedId = useCallback((id: string | null): void => patchMem({ expandedId: id }), [patchMem]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [routePickerFor, setRoutePickerFor] = useState<string | null>(null);

    // Full email viewer state
    // SECURITY: viewerEmail stores metadata only; body is fetched on-demand via /api/inbox/:id/body
    const [viewerEmail, setViewerEmail] = useState<(InboxItem & {
        body?: string;
        attachments?: Array<{ attachmentId: string; filename: string; mimeType: string; size: number }>;
    }) | null>(null);
    const [viewerLoading, setViewerLoading] = useState(false);

    /**
     * Detect plain-text vs HTML email bodies and format accordingly.
     * Plain text: escape HTML entities, convert \n to <br>, style > quoted lines.
     * HTML: pass through unchanged.
     *
     * Uses a tag ALLOWLIST to avoid false positives from email addresses
     * like <user@domain.com> or casual angle brackets in plain text.
     */
    const formatEmailBody = (body: string): string => {
        if (!body) return '';
        // Check for ACTUAL HTML tags — not email addresses in angle brackets
        const HTML_TAG_PATTERN = /<(?:div|p|br|span|table|tr|td|th|ul|ol|li|h[1-6]|a\s|img\s|blockquote|strong|em|b|i|u|pre|code|hr|head|body|html|style|meta|link|font|center|section|article|header|footer|nav|main|aside|figure|figcaption|details|summary|mark|small|sub|sup|abbr|cite|del|ins|s|strike|tt|var|samp|kbd|wbr|nobr|label|input|form|button|select|option|textarea|iframe)[>\s/]/i;
        if (HTML_TAG_PATTERN.test(body)) return body;
        // Plain text: escape HTML entities, preserve newlines
        let escaped = body
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // Style email quote lines (lines starting with >)
        escaped = escaped.replace(/^&gt;(.*)$/gm,
            '<span style="color:var(--text-tertiary);border-left:3px solid var(--border-default);padding-left:10px;display:inline-block;margin:2px 0">&gt;$1</span>');
        // Convert newlines to <br>
        escaped = escaped.replace(/\r?\n/g, '<br>');
        return escaped;
    };
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Sort state
    const [sortField, setSortField] = useState<'date' | 'urgency' | 'signal' | 'sender' | 'subject'>('date');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Debounce search input → 300ms delay before triggering API call
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);
    const undoTimerRef = useRef<number | null>(null);
    const inboxCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const inboxFocusTimerRef = useRef<number | null>(null);
    const [focusTargetItemId, setFocusTargetItemId] = useState<string | null>(null);
    const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

    // Plan 066 §5a/§5e/§5f — session-only undo bar, one open snooze menu, one open draft panel.
    const [undoBar, setUndoBar] = useState<{ id: string; subject: string; kind: 'Archived' | 'Deleted' } | null>(null);
    const [snoozeMenuFor, setSnoozeMenuFor] = useState<string | null>(null);
    const [draftOpenId, setDraftOpenId] = useState<string | null>(null);

    // Audit trail + thread links caches (Phase 0.1.7)
    const [auditCache, setAuditCache] = useState<Record<string, any[]>>({});
    const [linksCache, setLinksCache] = useState<Record<string, any[]>>({});
    const [approvalReasons, setApprovalReasons] = useState<Record<string, string>>({});
    const [linkModalFor, setLinkModalFor] = useState<string | null>(null);
    const [linkForm, setLinkForm] = useState({ linkType: 'workitem', targetId: '', targetName: '' });

    // GAP-20: Pagination state
    const [hasMore, setHasMore] = useState(false);
    const [currentOffset, setCurrentOffset] = useState(0);
    const ITEMS_PER_PAGE = 50;

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
            const res = await authFetch(`${API_BASE}/api/georgia-code/legal-shield-health`);
            const json = await res.json();
            if (json.success) setLegalShieldHealth(json.data);
        } catch { /* offline */ }
        finally { setLegalShieldLoading(false); }
    }, [authFetch, authToken]);

    // Ref to prevent re-fetching on every render (breaks the loop)
    const llmSafetyLoadedRef = useRef(false);
    const permUsersLoadedRef = useRef(false);

    // ---- DATA FETCHING (React Query) ----
    // Bridge pattern: RQ hooks provide data; bridge variables preserve existing API surface
    const itemsQuery = useInboxItems(authFetch, triageFilter, debouncedSearch, currentOffset, ITEMS_PER_PAGE);
    const statsQuery = useInboxStats(authFetch);
    const metricsQuery = useOperatorMetrics(authFetch);
    const newslettersQuery = useNewsletters(authFetch, activeTab === 'newsletters');
    const settingsQuery = useSettingsQuery(authFetch, activeTab === 'settings');
    // Plan 066 §4h — triage card body: list items no longer carry `body`;
    // fetch it once per expanded id (RQ's 5 min staleTime means collapse +
    // re-expand does not refetch) and fall back to the snippet while it's
    // loading or the fetch failed.
    const expandedBodyQuery = useEmailBody(authFetch, expandedId);

    // Bridge variables — existing JSX reads these; RQ provides data behind the scenes
    const items = itemsQuery.data?.items ?? [];
    const stats = statsQuery.data ?? null;
    const newsletters = newslettersQuery.data ?? [];
    // Plan 060 phase 2: a rate-limited failure should look like "still
    // loading", not "broken" — the global banner already explains why.
    const backendStatus = useSyncExternalStore(
        backendStatusStore.subscribe,
        backendStatusStore.getSnapshot,
        backendStatusStore.getServerSnapshot,
    );
    const isRateLimited = backendStatus.state === 'rate-limited';
    const loading = itemsQuery.isLoading || (itemsQuery.isError && isRateLimited);
    // Distinguish a genuine "all caught up" empty state from a failed fetch — without
    // this guard the UI shows the celebratory "Inbox Zero!" message even when the
    // backend request errored (misleading the operator into thinking nothing is pending).
    const itemsError = itemsQuery.isError && !isRateLimited;
    const itemsErrorMessage =
        itemsQuery.error instanceof Error ? itemsQuery.error.message : 'Unable to load inbox';
    const metrics = metricsQuery.data ?? null;

    // Sync hasMore from RQ data
    useEffect(() => {
        if (itemsQuery.data) setHasMore(itemsQuery.data.hasMore);
    }, [itemsQuery.data]);

    // Sync settings from RQ into local state (needed for dirty tracking + save)
    useEffect(() => {
        if (settingsQuery.data && !settingsDirty) {
            setSettings(settingsQuery.data);
        }
    }, [settingsQuery.data, settingsDirty]);

    // Convenience refetch alias — used by action handlers + SSE to invalidate cache
    const invalidateInbox = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    }, [queryClient]);

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
            const res = await authFetch(`${API_BASE}/api/settings`, {
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
                // Invalidate settings query cache so next tab open gets fresh data
                queryClient.invalidateQueries({ queryKey: inboxKeys.settings() });
            } else {
                setSettingsMsg({ type: 'error', text: data.error || 'Save failed' });
            }
        } catch {
            setSettingsMsg({ type: 'error', text: 'Backend is offline — cannot save settings.' });
        } finally {
            setSettingsSaving(false);
        }
    }, [settings, authFetch, queryClient]);

    const updateSetting = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => {
        setSettings(prev => prev ? { ...prev, [key]: value } : prev);
        setSettingsDirty(true);
    };

    // Inbox updates via polling — no backend /stream route exists (plan 060 §8).
    useEffect(() => {
        const poll = window.setInterval(() => {
            invalidateInbox();
        }, 60_000);

        return () => {
            clearInterval(poll);
        };
    }, [invalidateInbox]);

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
    }, [setActiveTab, setExpandedId, setTriageFilter]);

    // Plan 066 §5e — close the open snooze menu on Escape or an outside click.
    useEffect(() => {
        if (!snoozeMenuFor) return;
        const close = (e: Event) => {
            if (e instanceof KeyboardEvent) {
                if (e.key === 'Escape') setSnoozeMenuFor(null);
                return;
            }
            const target = e.target as Element | null;
            if (target?.closest?.('.iz-snooze-wrap')) return;
            setSnoozeMenuFor(null);
        };
        document.addEventListener('keydown', close);
        document.addEventListener('mousedown', close);
        return () => {
            document.removeEventListener('keydown', close);
            document.removeEventListener('mousedown', close);
        };
    }, [snoozeMenuFor]);

    // ---- Tab-triggered fetches (SPLIT to avoid infinite loop) ----

    // 1. Newsletters — React Query auto-handles via enabled flag (activeTab === 'newsletters')
    // No manual trigger needed.

    // 2. Settings + permissions — settings auto-fetched by RQ when enabled (activeTab === 'settings')
    useEffect(() => {
        if (activeTab !== 'settings') {
            // Reset load refs when leaving settings so re-entering will re-fetch
            llmSafetyLoadedRef.current = false;
            permUsersLoadedRef.current = false;
            return;
        }

        // Fetch Legal Shield health once
        if (!legalShieldLoadedRef.current && authToken) {
            legalShieldLoadedRef.current = true;
            fetchLegalShieldHealth();
        }

        // Fetch user list for permissions panel (god only) — once
        if (isGod && !permUsersLoadedRef.current && authToken) {
            permUsersLoadedRef.current = true;
            authFetch(`${API_BASE}/api/auth/users`, {
                headers: { Authorization: `Bearer ${authToken}` },
            })
                .then(r => r.ok ? r.json() : [])
                .then(data => { if (Array.isArray(data)) setPermUsers(data); })
                .catch(() => { /* ignore */ });
        }
    }, [activeTab, isGod, authToken]);

    // 3. LLM Safety Audit — separate so filter changes don't re-trigger settings fetch
    useEffect(() => {
        if (activeTab !== 'settings' || !canViewLlmSafetyAudit || !authToken) return;
        fetchLlmSafetyAudit();
    }, [activeTab, canViewLlmSafetyAudit, authToken, fetchLlmSafetyAudit]);

    // ---- ACTIONS ----
    // Every mutation below checks res.ok AND the JSON success field (when the
    // route returns one) before touching cache/state, and surfaces failure via
    // the qualia-toast event — no success is ever shown for a non-2xx (plan 066 §2d).
    const mutationFailed = async (res: Response, label: string): Promise<boolean> => {
        if (!res.ok) {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `${label} failed (${res.status})` }));
            return true;
        }
        const data = await res.json().catch(() => ({}));
        if (data.success === false) {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `${label} failed: ${data.error || 'unknown error'}` }));
            return true;
        }
        return false;
    };

    // Plan 066 §5a — clears any pending auto-dismiss timer and (re)arms an 8s one;
    // a second archive/delete before the first dismisses simply replaces the bar.
    const showUndoBar = (id: string, subject: string, kind: 'Archived' | 'Deleted') => {
        if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
        setUndoBar({ id, subject, kind });
        undoTimerRef.current = window.setTimeout(() => {
            setUndoBar(null);
            undoTimerRef.current = null;
        }, 8000);
    };

    // Bare archive call, no undo bar — used by handleArchive (single item) and by
    // handleBulkArchive's per-item fallback, which must NOT show Undo (bulk is out
    // of scope for 5a).
    const archiveItem = async (id: string): Promise<boolean> => {
        try {
            const res = await authFetch(`${INBOX_API}/${id}/archive`, { method: 'POST' });
            if (await mutationFailed(res, 'Archive')) return false;
            invalidateInbox();
            return true;
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Archive failed: network error' }));
            return false;
        }
    };

    const handleArchive = async (id: string) => {
        const subject = items.find(i => i.id === id)?.subject || '';
        if (await archiveItem(id)) showUndoBar(id, subject, 'Archived');
    };

    const handleUndo = async () => {
        if (!undoBar) return;
        try {
            const res = await authFetch(`${INBOX_API}/${undoBar.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'pending', reason: 'Undo' }),
            });
            if (await mutationFailed(res, 'Undo')) return;
            if (undoTimerRef.current) { window.clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
            setUndoBar(null);
            invalidateInbox();
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Restored' }));
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Undo failed: network error' }));
        }
    };

    // Plan 066 §5e
    const handleSnooze = async (id: string, ms: number) => {
        setSnoozeMenuFor(null);
        const until = new Date(Date.now() + ms).toISOString();
        try {
            const res = await authFetch(`${INBOX_API}/${id}/snooze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ until }),
            });
            if (await mutationFailed(res, 'Snooze')) return;
            invalidateInbox();
            const short = new Date(until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Snoozed until ${short}` }));
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Snooze failed: network error' }));
        }
    };

    const handleApprove = async (id: string, projectId?: string) => {
        const reason = approvalReasons[id] || '';
        try {
            const res = await authFetch(`${INBOX_API}/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, reason }),
            });
            if (res.ok) {
                setRoutePickerFor(null);
                setApprovalReasons(prev => { const n = { ...prev }; delete n[id]; return n; });
                invalidateInbox();
            } else {
                const data = await res.json().catch(() => ({}));
                if (res.status === 400 && data.error?.includes('reason')) {
                    window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Approval reason is required.' }));
                } else {
                    window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Action failed: ${res.status}` }));
                }
            }
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Approve failed: network error' }));
        }
    };

    const handleDelete = async (id: string) => {
        const subject = items.find(i => i.id === id)?.subject || '';
        try {
            const res = await authFetch(`${INBOX_API}/${id}`, { method: 'DELETE' });
            if (await mutationFailed(res, 'Delete')) return;
            invalidateInbox();
            showUndoBar(id, subject, 'Deleted');
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Delete failed: network error' }));
        }
    };

    const handleBulkArchive = async () => {
        const ids = Array.from(selectedIds);
        try {
            const res = await authFetch(`${INBOX_API}/bulk-archive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            });
            if (await mutationFailed(res, 'Bulk archive')) return;
            setSelectedIds(new Set());
            invalidateInbox();
        } catch {
            // Network-level failure (not a JSON error response) — fall back to
            // archiving one at a time; each call surfaces its own toast on failure.
            // Uses archiveItem, not handleArchive — bulk archive never shows Undo (5a scope).
            for (const id of ids) { await archiveItem(id); }
            setSelectedIds(new Set());
        }
    };

    const handleMarkRead = async (id: string) => {
        try {
            const res = await authFetch(`${INBOX_API}/${id}/read`, { method: 'POST' });
            await mutationFailed(res, 'Mark read');
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Mark read failed: network error' }));
        }
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
        // Search is server-side (backend plan 066 B1) — no client-side re-filter needed.

        // Sort
        const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const signalOrder: Record<string, number> = { signal: 0, low_priority: 1, noise: 2 };
        result = [...result].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'date':
                    cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    break;
                case 'urgency':
                    cmp = (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3);
                    break;
                case 'signal':
                    cmp = (signalOrder[a.signalClass] ?? 3) - (signalOrder[b.signalClass] ?? 3);
                    break;
                case 'sender':
                    cmp = (a.sender || '').localeCompare(b.sender || '');
                    break;
                case 'subject':
                    cmp = (a.subject || '').localeCompare(b.subject || '');
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return result;
    }, [items, debouncedSearch, sortField, sortDir]);

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
    }, [focusTargetItemId, pendingItems, setExpandedId]);

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

    // Real undo restored at plan 066 §5a (see showUndoBar/handleUndo above) — the
    // old one (removed at §2c) never checked whether the Gmail label call
    // succeeded, so it showed a false "recovered".

    useEffect(() => {
        return () => {
            if (inboxFocusTimerRef.current) clearTimeout(inboxFocusTimerRef.current);
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        };
    }, []);

    // ---- RENDER ----
    return (
        <div className="iz">
            {/* ========== HEADER ========== */}
            <div className="iz-header">
                <div className="iz-header__top">
                    <div className="iz-header__title-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="iz-header__icon"><Inbox size={14} /></span>
                        <h2 className="iz-header__title" style={{ margin: 0 }}>Inbox Zero</h2>
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
                <div className="iz-tabs" role="tablist" aria-label="InboxZero sections" onKeyDown={(e) => {
                    const tabs: TabId[] = ['triage','newsletters','rules','audit','stats','settings'];
                    const idx = tabs.indexOf(activeTab);
                    if (idx < 0) return;
                    let next: number | undefined;
                    if (e.key === 'ArrowRight') { e.preventDefault(); next = (idx + 1) % tabs.length; }
                    else if (e.key === 'ArrowLeft') { e.preventDefault(); next = (idx - 1 + tabs.length) % tabs.length; }
                    else if (e.key === 'Home') { e.preventDefault(); next = 0; }
                    else if (e.key === 'End') { e.preventDefault(); next = tabs.length - 1; }
                    if (next !== undefined) {
                        setActiveTab(tabs[next]);
                        document.getElementById(`iz-tab-${tabs[next]}`)?.focus();
                    }
                }}>
                    {([
                        { id: 'triage' as TabId, label: 'Triage', count: stats?.pending },
                        { id: 'newsletters' as TabId, label: 'Newsletters', count: newsletters.length },
                        { id: 'rules' as TabId, label: 'Rules' },
                        { id: 'audit' as TabId, label: 'Audit' },
                        { id: 'stats' as TabId, label: 'Stats' },
                        { id: 'settings' as TabId, label: 'Settings' },
                    ]).map(tab => (
                        <button
                            key={tab.id}
                            id={`iz-tab-${tab.id}`}
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            aria-controls={`iz-tabpanel-${tab.id}`}
                            tabIndex={activeTab === tab.id ? 0 : -1}
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

            {/* Plan 066 §5a — session-only undo bar; one at a time, auto-dismisses after 8s. */}
            {undoBar && (
                <div className="iz-undo-bar" role="status" aria-live="polite">
                    <span className="iz-undo-bar__text">
                        {undoBar.kind === 'Archived' ? 'Archived' : 'Deleted'} “{undoBar.subject}”
                    </span>
                    <button className="iz-undo-bar__btn" onClick={handleUndo}>
                        <Undo2 size={13} aria-hidden /> Undo
                    </button>
                </div>
            )}

            {/* ========== TRIAGE TAB ========== */}
            {activeTab === 'triage' && (
                <div role="tabpanel" id="iz-tabpanel-triage" aria-labelledby="iz-tab-triage">
                <div className="iz-triage">
                    {/* Search + filter bar */}
                    <div className="iz-toolbar">
                        <div className="iz-toolbar__search-row">
                            <div className="iz-toolbar__search-wrap">
                                <svg className="iz-toolbar__search-icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                </svg>
                                <input
                                    className="iz-toolbar__search"
                                    placeholder="Search emails…"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { setDebouncedSearch(searchQuery); } }}
                                />
                                {searchQuery && (
                                    <button
                                        className="iz-toolbar__search-clear"
                                        onClick={() => { setSearchQuery(''); setDebouncedSearch(''); }}
                                        title="Clear search"
                                        aria-label="Clear search"
                                    ><X size={16} /></button>
                                )}
                            </div>
                            <button
                                className="btn-primary iz-toolbar__search-btn"
                                onClick={() => setDebouncedSearch(searchQuery)}
                                title="Search now"
                            >
                                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                </svg>
                                Search
                            </button>
                        </div>
                        {debouncedSearch.trim() && !loading && (
                            <div className="iz-toolbar__result-count">
                                <Search size={13} aria-hidden /> <strong>{pendingItems.length}</strong> email{pendingItems.length !== 1 ? 's' : ''} found
                                {debouncedSearch.trim() && (
                                    <span className="iz-toolbar__result-query"> for "{debouncedSearch.trim()}"</span>
                                )}
                            </div>
                        )}
                        <div className="iz-toolbar__filters">
                            {['all', 'signal', 'noise', 'low_priority'].map(f => (
                                <button
                                    key={f}
                                    className={`iz-filter ${triageFilter === f ? 'iz-filter--active' : ''}`}
                                    onClick={() => setTriageFilter(f)}
                                >
                                    {f === 'all' ? 'All' : (() => {
                                        const SignalIcon = SIGNAL_CONFIG[f]?.icon;
                                        return (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                {SignalIcon && <SignalIcon size={14} aria-hidden />} {SIGNAL_CONFIG[f]?.label}
                                            </span>
                                        );
                                    })()}
                                </button>
                            ))}
                        </div>

                        {/* Sort bar */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
                            borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: 4,
                        }}>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginRight: 4 }}>Sort:</span>
                            {[
                                { id: 'date' as const, label: 'Date' },
                                { id: 'urgency' as const, label: 'Urgency' },
                                { id: 'signal' as const, label: 'Signal' },
                                { id: 'sender' as const, label: 'Sender' },
                                { id: 'subject' as const, label: 'Subject' },
                            ].map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        if (sortField === s.id) {
                                            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setSortField(s.id);
                                            setSortDir(s.id === 'date' ? 'desc' : 'asc');
                                        }
                                    }}
                                    style={{
                                        padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                                        fontFamily: 'inherit', fontWeight: sortField === s.id ? 600 : 400,
                                        background: sortField === s.id ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                                        color: sortField === s.id ? '#D6FE51' : '#64748b',
                                        border: sortField === s.id ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid transparent',
                                        transition: 'all 0.12s ease',
                                    }}
                                >
                                    {s.label} {sortField === s.id ? (sortDir === 'asc' ? <ArrowUp size={12} aria-hidden style={{ verticalAlign: 'middle' }} /> : <ArrowDown size={12} aria-hidden style={{ verticalAlign: 'middle' }} />) : ''}
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
                                <Download size={14} aria-hidden /> Archive
                            </button>
                            {/* ponytail: AI Classify, Add Label and Batch Route removed at plan
                                066 §2c/§2d — they called routes that never existed (AI Classify,
                                Add Label) or routed to the deleted Actions tab (Batch Route). */}
                        </div>
                    )}

                    {/* Metric cards row */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
                        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 10, padding: '12px 16px',
                        }}>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Needs Reply</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {pendingItems.filter(i => i.urgency === 'high').length}
                                </span>
                                <span style={{ fontSize: 16, color: 'var(--text-tertiary)' }}><Mail size={14} /></span>
                            </div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 10, padding: '12px 16px',
                        }}>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Filtered Pitch</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>
                                    {pendingItems.filter(i => i.signalClass === 'noise').length}
                                </span>
                                <span style={{ fontSize: 14, color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}><TriangleAlert size={14} aria-hidden /> Today</span>
                            </div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 10, padding: '12px 16px',
                        }}>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>AI Triage Status</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>⊙ Active</span>
                                <span style={{ fontSize: 16, color: '#22c55e' }}><Check size={14} /></span>
                            </div>
                        </div>
                    </div>

                    {/* Cards list */}
                    <div className="iz-cards">
                        {loading && <div className="iz-loading">Loading inbox…</div>}

                        {!loading && itemsError && (
                            <div className="iz-empty" role="alert">
                                <div className="iz-empty__icon"><TriangleAlert size={32} aria-hidden /></div>
                                <div className="iz-empty__title">Couldn’t load inbox</div>
                                <div className="iz-empty__sub">{itemsErrorMessage}</div>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    style={{ marginTop: 12 }}
                                    onClick={() => itemsQuery.refetch()}
                                >
                                    Retry
                                </button>
                            </div>
                        )}

                        {!loading && !itemsError && pendingItems.length === 0 && (
                            <div className="iz-empty">
                                <div className="iz-empty__icon"><PartyPopper size={32} aria-hidden /></div>
                                <div className="iz-empty__title">Inbox Zero!</div>
                                <div className="iz-empty__sub">All caught up — nice work.</div>
                            </div>
                        )}

                        {/* Section header */}
                        {!loading && !itemsError && pendingItems.length > 0 && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 4px 10px', marginBottom: 4,
                            }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Primary</span>
                                <span style={{
                                    fontSize: 11, fontWeight: 700, color: 'var(--accent)',
                                    background: 'rgba(129,140,248,0.15)', padding: '1px 8px',
                                    borderRadius: 10,
                                }}>{pendingItems.length}</span>
                            </div>
                        )}

                        {pendingItems.map(item => {
                            const sc = SIGNAL_CONFIG[item.signalClass];
                            const isExpanded = expandedId === item.id;
                            const isSelected = selectedIds.has(item.id);
                            // Plan 066 §4h — the list no longer carries `body`; the expanded
                            // card shows the fetched body once available, the snippet otherwise
                            // (loading or fetch failure), through the same sanitize/format path.
                            const inlineBody = isExpanded && expandedBodyQuery.data?.body
                                ? expandedBodyQuery.data.body
                                : item.snippet || '';

                            return (
                                <div
                                    key={item.id}
                                    ref={el => { inboxCardRefs.current[item.id] = el; }}
                                    className={`iz-card ${isExpanded ? 'iz-card--expanded' : ''} ${isSelected ? 'iz-card--selected' : ''} ${focusedItemId === item.id ? 'iz-card--focus' : ''}`}
                                    style={{ '--signal-color': sc?.color } as React.CSSProperties}
                                >
                                    <div style={{ display: 'flex' }}>
                                        {/* Left: main content */}
                                        <div className="iz-card__main" style={{ flex: 1 }} onClick={() => {
                                            const nextId = isExpanded ? null : item.id;
                                            setExpandedId(nextId);
                                            if (nextId && !item.isRead) handleMarkRead(item.id); // open only — collapse fired it twice
                                            if (nextId && !auditCache[nextId]) {
                                                authFetch(`${INBOX_API}/${nextId}/audit`).then(r => r.ok ? r.json() : { entries: [] }).then(d => {
                                                    setAuditCache(prev => ({ ...prev, [nextId]: d.entries || [] }));
                                                }).catch(() => {});
                                                authFetch(`${INBOX_API}/${nextId}/links`).then(r => r.ok ? r.json() : { links: [] }).then(d => {
                                                    setLinksCache(prev => ({ ...prev, [nextId]: d.links || [] }));
                                                }).catch(() => {});
                                            }
                                        }}>
                                            <input
                                                type="checkbox"
                                                className="iz-card__check"
                                                checked={isSelected}
                                                onChange={e => { e.stopPropagation(); toggleSelect(item.id); }}
                                                onClick={e => e.stopPropagation()}
                                            />
                                            <div className="iz-card__content">
                                                {/* Sender line with badges */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        {item.sender?.split('@')[0]?.split('<')[0]?.replace(/"/g, '').trim() || 'Unknown'}
                                                    </span>
                                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                        {item.sender?.match(/<(.+?)>/)?.[1] || item.sender?.match(/\S+@\S+/)?.[0] || ''}
                                                    </span>
                                                    {item.sourceAccount && (
                                                        <span title={`Received in your ${item.sourceAccount} mailbox`} style={{
                                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                                            background: 'color-mix(in srgb, var(--accent, #6366f1) 14%, transparent)',
                                                            color: 'var(--accent, #818cf8)',
                                                            border: '1px solid color-mix(in srgb, var(--accent, #6366f1) 35%, transparent)',
                                                            display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 200,
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}><Mail size={11} aria-hidden /> {item.sourceAccount}</span>
                                                    )}
                                                    {item.urgency === 'high' && (
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, padding: '2px 8px',
                                                            borderRadius: 4, background: 'rgba(239,68,68,0.15)',
                                                            color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        }}><Zap size={11} aria-hidden /> High Priority</span>
                                                    )}
                                                    {item.signalClass === 'signal' && (
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, padding: '2px 8px',
                                                            borderRadius: 4, background: 'rgba(59,130,246,0.15)',
                                                            color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)',
                                                        }}>Needs Reply</span>
                                                    )}
                                                </div>
                                                {/* Subject */}
                                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                                                    {item.subject}
                                                </div>
                                                {/* Snippet */}
                                                <p className="iz-card__snippet">{item.summary || item.snippet}</p>
                                                {/* Time */}
                                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatTime(item.createdAt)}</span>
                                                {item.routedToProject && (
                                                    <div className="iz-card__route">
                                                        {PROJECT_NAMES[item.routedToProject] || item.routedToProject}
                                                        {item.routingConfidence && (
                                                            <span className="iz-card__conf">{Math.round(item.routingConfidence * 100)}%</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: always-visible actions */}
                                        <div style={{
                                            display: 'flex', flexDirection: 'column', gap: 6,
                                            padding: '12px 14px', borderLeft: '1px solid rgba(255,255,255,0.04)',
                                            minWidth: 120, alignItems: 'flex-start', justifyContent: 'center',
                                        }}>
                                            <button
                                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', padding: '3px 0' }}
                                                onClick={e => { e.stopPropagation(); handleArchive(item.id); }}
                                            >
                                                <span style={{ fontSize: 13 }}><ClipboardList size={14} /></span> Archive
                                            </button>
                                            <button
                                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', padding: '3px 0' }}
                                                onClick={e => { e.stopPropagation(); handleMarkRead(item.id); }}
                                            >
                                                <span style={{ fontSize: 13, display: 'inline-flex' }}>{item.isRead ? <Mail size={14} aria-hidden /> : <MailOpen size={14} aria-hidden />}</span> {item.isRead ? 'Mark Unread' : 'Mark Read'}
                                            </button>
                                            <button
                                                style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', padding: '3px 0' }}
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    if (!item.isRead) handleMarkRead(item.id);
                                                    setViewerLoading(true);
                                                    // SECURITY: Fetch body on-demand, never store in bulk state
                                                    authFetch(`${INBOX_API}/${item.id}/body`)
                                                        .then(r => r.ok ? r.json() : null)
                                                        .then(d => {
                                                            if (d?.success) {
                                                                setViewerEmail({ ...item, body: d.data.body, attachments: d.data.attachments || [] });
                                                            } else {
                                                                setViewerEmail(item);
                                                            }
                                                        })
                                                        .catch(() => setViewerEmail(item))
                                                        .finally(() => setViewerLoading(false));
                                                }}
                                            >
                                                <Reply size={13} aria-hidden /> Smart Reply
                                            </button>
                                            <div className="iz-snooze-wrap">
                                                <button
                                                    className="iz-snooze-trigger"
                                                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', padding: '3px 0' }}
                                                    aria-haspopup="menu"
                                                    aria-expanded={snoozeMenuFor === item.id}
                                                    onClick={e => { e.stopPropagation(); setSnoozeMenuFor(snoozeMenuFor === item.id ? null : item.id); }}
                                                >
                                                    <Clock size={14} aria-hidden /> Snooze
                                                </button>
                                                {snoozeMenuFor === item.id && (
                                                    <div className="iz-snooze-menu" role="menu">
                                                        {SNOOZE_OPTIONS.map(opt => (
                                                            <button
                                                                key={opt.label}
                                                                role="menuitem"
                                                                className="iz-snooze-menu__item"
                                                                onClick={e => { e.stopPropagation(); handleSnooze(item.id, opt.ms); }}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="iz-card__actions" onClick={e => e.stopPropagation()}>
                                            {item.routingReasoning && (
                                                <p className="iz-card__reasoning"><Bot size={13} aria-hidden /> {item.routingReasoning}</p>
                                            )}

                                    {/* GAP-09: Full email body expandable section — plan 066 §4h:
                                        fetched once per expanded id via useEmailBody; the snippet
                                        covers the loading/error window (see `inlineBody` above). */}
                                    {inlineBody && (
                                        <div style={{
                                            marginTop: 8, borderRadius: 8,
                                            overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'var(--bg-surface)', minHeight: 120, maxHeight: 400,
                                        }}>
                                            <iframe
                                                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:20px 24px;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.7;color:#1e293b;background:var(--bg-surface);word-wrap:break-word;overflow-wrap:break-word}img{max-width:100%;height:auto;border-radius:4px;display:block;margin:8px 0}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{padding:8px 12px;border:1px solid var(--border-default);text-align:left;font-size:13px}th{background:#f8fafc;font-weight:600}blockquote{margin:12px 0;padding:12px 20px;border-left:4px solid #6366f1;background:#f8fafc;color:var(--text-tertiary);border-radius:0 6px 6px 0}pre,code{font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;background:var(--bg-surface-elevated);border-radius:4px;padding:2px 6px}pre{padding:14px 18px;overflow-x:auto}hr{border:none;border-top:1px solid var(--border-default);margin:16px 0}h1,h2,h3{color:#0f172a;margin:16px 0 8px}ul,ol{padding-left:24px}li{margin:4px 0}p{margin:8px 0}.email-footer,.unsubscribe{font-size:11px;color:var(--text-secondary);margin-top:24px;padding-top:16px;border-top:1px solid var(--border-default)}</style></head><body>${sanitizeHtml(formatEmailBody(inlineBody))}</body></html>`}
                                                style={{ width: '100%', height: '100%', minHeight: 120, border: 'none', display: 'block' }}
                                                title="email-body-inline"
                                                sandbox=""
                                            />
                                        </div>
                                    )}

                                    {/* Phase 0.2.4 — Approval reason input (shown for pending items) */}
                                            {item.status === 'pending' && (
                                                <div style={{ marginBottom: 8 }}>
                                                    <textarea
                                                        className="iz-card__reason-input"
                                                        placeholder="Approval reason (required if enabled)…"
                                                        value={approvalReasons[item.id] || ''}
                                                        onChange={e => setApprovalReasons(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                        rows={2}
                                                        style={{
                                                            width: '100%', padding: '6px 10px', borderRadius: 6,
                                                            border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
                                                            color: 'inherit', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit'
                                                        }}
                                                    />
                                                </div>
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
                                                    <Check size={14} aria-hidden /> {item.routedToProject ? 'Approve & Route' : 'Approve'}
                                                </button>
                                                <button className="iz-action iz-action--archive" onClick={() => handleArchive(item.id)}>
                                                    <Download size={14} aria-hidden /> Archive
                                                </button>
                                                {/* View Full Email — SECURITY: fetches body on-demand */}
                                                <button
                                                    className="iz-action"
                                                    style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}
                                                    onClick={() => {
                                                        if (!item.isRead) handleMarkRead(item.id);
                                                        setViewerLoading(true);
                                                        // SECURITY: Fetch body on-demand via dedicated endpoint
                                                        authFetch(`${INBOX_API}/${item.id}/body`)
                                                            .then(r => r.ok ? r.json() : null)
                                                            .then(d => {
                                                                if (d?.success) {
                                                                    setViewerEmail({ ...item, body: d.data.body, attachments: d.data.attachments || [] });
                                                                } else {
                                                                    setViewerEmail(item);
                                                                }
                                                            })
                                                            .catch(() => setViewerEmail(item))
                                                            .finally(() => setViewerLoading(false));
                                                    }}
                                                >
                                                    <Mail size={14} aria-hidden /> View Full Email
                                                </button>
                                                <button className="iz-action iz-action--delete" onClick={() => handleDelete(item.id)}>
                                                    <Trash2 size={14} aria-hidden /> Delete
                                                </button>

                                                {/* Draft reply (plan 066 §5f) — every expanded card gets it,
                                                    not just ones with routing reasoning. */}
                                                <button
                                                    className="iz-action iz-action--draft"
                                                    onClick={() => setDraftOpenId(draftOpenId === item.id ? null : item.id)}
                                                >
                                                    <Sparkles size={14} aria-hidden /> Draft reply
                                                </button>

                                                {/* Retry button (Phase 0.1.3) — appears when Gmail archival failed */}
                                                {(item.gmailError || item.retryable) && (
                                                    <button
                                                        className="iz-action iz-action--retry"
                                                        onClick={async () => {
                                                            try {
                                                                const res = await authFetch(`${INBOX_API}/${item.id}/retry`, { method: 'POST' });
                                                                if (await mutationFailed(res, 'Retry')) return;
                                                                invalidateInbox();
                                                            } catch {
                                                                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Retry failed: network error' }));
                                                            }
                                                        }}
                                                    >
                                                        <RefreshCw size={14} aria-hidden /> Retry Gmail
                                                    </button>
                                                )}

                                                {/* Link to Strata (Phase 0.1.4) */}
                                                <button
                                                    className="iz-action iz-action--link"
                                                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                                                    onClick={() => {
                                                        setLinkModalFor(linkModalFor === item.id ? null : item.id);
                                                        setLinkForm({ linkType: 'workitem', targetId: '', targetName: '' });
                                                    }}
                                                >
                                                    <Link size={14} aria-hidden /> Link to Strata
                                                </button>
                                            </div>

                                            {/* Draft reply panel (plan 066 §5f) — one open at a time. */}
                                            {draftOpenId === item.id && (
                                                <div className="iz-draft-panel">
                                                    <DraftReplyPanel itemId={item.id} apiBase={INBOX_API} authFetch={authFetch} />
                                                </div>
                                            )}

                                            {/* Link to Strata Modal (Phase 0.1.4 — Enhanced) */}
                                            {linkModalFor === item.id && (
                                                <div style={{
                                                    marginTop: 10, padding: 16, borderRadius: 10,
                                                    background: 'color-mix(in srgb, var(--accent) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                                                }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Link size={14} aria-hidden /> Link to Strata</div>

                                                    {/* Row 1: Category selector */}
                                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                                        {[
                                                            { value: 'workitem', label: 'Work Item' },
                                                            { value: 'property', label: 'Property' },
                                                            { value: 'entity', label: 'Person' },
                                                            { value: 'unit', label: 'Unit' },
                                                            { value: 'section', label: 'Section' },
                                                            { value: 'subsection', label: 'Subsection' },
                                                            { value: 'lease', label: 'Lease' },
                                                            { value: 'incident', label: 'Incident' },
                                                            { value: 'custom-tag', label: 'Custom Tag' },
                                                        ].map(opt => (
                                                            <button
                                                                key={opt.value}
                                                                style={{
                                                                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                                    cursor: 'pointer', fontFamily: 'inherit',
                                                                    background: linkForm.linkType === opt.value ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.04)',
                                                                    color: linkForm.linkType === opt.value ? '#D6FE51' : '#94a3b8',
                                                                    border: linkForm.linkType === opt.value ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid rgba(255,255,255,0.08)',
                                                                }}
                                                                onClick={() => setLinkForm(f => ({ ...f, linkType: opt.value }))}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Row 2: Target ID + Name */}
                                                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                                        <input
                                                            type="text"
                                                            placeholder={linkForm.linkType === 'custom-tag' ? 'Tag name (e.g. urgent-review)…' : 'Target ID or name…'}
                                                            value={linkForm.targetId}
                                                            onChange={e => setLinkForm(f => ({ ...f, targetId: e.target.value }))}
                                                            style={{
                                                                flex: 1, padding: '6px 10px', borderRadius: 6,
                                                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                                                                color: 'inherit', fontSize: '0.82rem',
                                                            }}
                                                        />
                                                        {linkForm.linkType !== 'custom-tag' && (
                                                            <input
                                                                type="text"
                                                                placeholder="Label (optional)…"
                                                                value={(linkForm as any).targetName || ''}
                                                                onChange={e => setLinkForm(f => ({ ...f, targetName: e.target.value } as any))}
                                                                style={{
                                                                    flex: 1, padding: '6px 10px', borderRadius: 6,
                                                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                                                                    color: 'inherit', fontSize: '0.82rem',
                                                                }}
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Row 3: Action buttons */}
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <button
                                                            style={{
                                                                padding: '6px 16px', borderRadius: 6,
                                                                background: 'var(--accent)', color: 'var(--text-primary)', border: 'none',
                                                                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                                            }}
                                                            onClick={async () => {
                                                                if (!linkForm.targetId.trim()) return;
                                                                try {
                                                                    const res = await authFetch(`${INBOX_API}/${item.id}/link`, {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({
                                                                            linkType: linkForm.linkType,
                                                                            targetId: linkForm.targetId,
                                                                            targetType: linkForm.linkType,
                                                                            targetName: (linkForm as any).targetName || undefined,
                                                                        })
                                                                    });
                                                                    if (await mutationFailed(res, 'Link')) return;
                                                                    setLinkModalFor(null);
                                                                    setLinksCache(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                                                } catch {
                                                                    window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Link failed: network error' }));
                                                                }
                                                            }}
                                                        >
                                                            <Link size={14} aria-hidden /> Link
                                                        </button>
                                                        <button
                                                            style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: '0.82rem' }}
                                                            onClick={() => setLinkModalFor(null)}
                                                        >Cancel</button>
                                                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flex: 1, textAlign: 'right' }}>
                                                            Linking as: <strong style={{ color: 'var(--accent)' }}>{linkForm.linkType}</strong>
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

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

                                            {/* ── Audit Trail (Phase 0.1.7) ── */}
                                            {auditCache[item.id] && auditCache[item.id].length > 0 && (
                                                <div className="iz-card__audit" style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.6, marginBottom: '6px', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}><ClipboardList size={12} aria-hidden /> AUDIT TRAIL</p>
                                                    {auditCache[item.id].slice(0, 8).map((entry: any, idx: number) => (
                                                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '4px 0', borderBottom: idx < auditCache[item.id].length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                                            <span style={{ fontSize: '10px', opacity: 0.4, whiteSpace: 'nowrap', minWidth: '70px' }}>
                                                                {new Date(entry.created_at || entry.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            <span style={{ fontSize: '11px', opacity: 0.7, flex: 1 }}>
                                                                <strong style={{ color: entry.action === 'approved' ? '#22c55e' : entry.action === 'archived' ? '#f59e0b' : entry.action === 'deleted' ? '#ef4444' : '#D6FE51' }}>
                                                                    {entry.action}
                                                                </strong>
                                                                {entry.actor && <span> by {entry.actor}</span>}
                                                                {entry.reason && <span style={{ opacity: 0.5 }}> — {entry.reason}</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* ── Thread Links (Phase 0.1.7) ── */}
                                            {linksCache[item.id] && linksCache[item.id].length > 0 && (
                                                <div className="iz-card__links" style={{ marginTop: '8px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.6, marginBottom: '6px', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}><Link size={12} aria-hidden /> LINKED ITEMS</p>
                                                    {linksCache[item.id].map((link: any, idx: number) => (
                                                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0' }}>
                                                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                                                                {link.link_type || link.type || 'related'}
                                                            </span>
                                                            <span style={{ fontSize: '11px', opacity: 0.7, flex: 1 }}>
                                                                {link.linked_subject || link.subject || link.linked_item_id}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* GAP-20: Load More pagination */}
                    {hasMore && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <button
                                className="iz-action"
                                style={{ padding: '8px 24px', fontSize: '13px', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: '8px', cursor: 'pointer' }}
                                onClick={() => { setCurrentOffset(prev => prev + ITEMS_PER_PAGE); invalidateInbox(); }}
                            >
                                Load More
                            </button>
                        </div>
                    )}
                </div>

                {/* ========== EMAIL VIEWER OVERLAY ========== */}
                {(viewerEmail || viewerLoading) && (
                    <div className="iz-viewer-overlay" onClick={() => { setViewerEmail(null); setViewerLoading(false); }}>
                        <div className="iz-viewer" onClick={e => e.stopPropagation()}>
                            {viewerLoading ? (
                                <div className="iz-viewer__loading">
                                    <div className="iz-viewer__spinner" />
                                    <span>Loading full email…</span>
                                </div>
                            ) : viewerEmail ? (
                                <>
                                    {/* Header */}
                                    <div className="iz-viewer__header">
                                        <div className="iz-viewer__header-left">
                                            <h2 className="iz-viewer__subject">{viewerEmail.subject}</h2>
                                            <div className="iz-viewer__meta">
                                                <span className="iz-viewer__sender-badge">
                                                    <span className="iz-viewer__sender-avatar">{viewerEmail.sender.charAt(0).toUpperCase()}</span>
                                                    <span className="iz-viewer__sender-name">{viewerEmail.sender}</span>
                                                </span>
                                                <span className="iz-viewer__date">{new Date(viewerEmail.createdAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                        <button className="iz-viewer__close" onClick={() => setViewerEmail(null)} title="Close (Esc)" aria-label="Close email"><X size={16} /></button>
                                    </div>

                                    {/* Badges */}
                                    <div className="iz-viewer__badges">
                                        <span className="iz-viewer__badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: SIGNAL_CONFIG[viewerEmail.signalClass]?.color + '20', color: SIGNAL_CONFIG[viewerEmail.signalClass]?.color, border: `1px solid ${SIGNAL_CONFIG[viewerEmail.signalClass]?.color}40` }}>
                                            {(() => { const SignalIcon = SIGNAL_CONFIG[viewerEmail.signalClass]?.icon; return SignalIcon ? <SignalIcon size={14} aria-hidden /> : null; })()} {SIGNAL_CONFIG[viewerEmail.signalClass]?.label}
                                        </span>
                                        <span className="iz-viewer__badge" style={{ background: URGENCY_COLORS[viewerEmail.urgency] + '20', color: URGENCY_COLORS[viewerEmail.urgency], border: `1px solid ${URGENCY_COLORS[viewerEmail.urgency]}40` }}>
                                            {viewerEmail.urgency.toUpperCase()} urgency
                                        </span>
                                        {viewerEmail.hasAttachments && (
                                            <span className="iz-viewer__badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                                                <Paperclip size={13} aria-hidden /> {viewerEmail.attachments?.length || ''} Attachment{(viewerEmail.attachments?.length || 0) !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {viewerEmail.routedToProject && (
                                            <span className="iz-viewer__badge" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                                                {PROJECT_NAMES[viewerEmail.routedToProject] || viewerEmail.routedToProject}
                                                {viewerEmail.routingConfidence ? ` (${Math.round(viewerEmail.routingConfidence * 100)}%)` : ''}
                                            </span>
                                        )}
                                    </div>

                                    {/* AI Summary */}
                                    {viewerEmail.summary && (
                                        <div className="iz-viewer__summary">
                                            <span className="iz-viewer__summary-label"><Bot size={14} aria-hidden /> AI Summary</span>
                                            <p>{viewerEmail.summary}</p>
                                        </div>
                                    )}

                                    {/* Attachments */}
                                    {viewerEmail.attachments && viewerEmail.attachments.length > 0 && (
                                        <div className="iz-viewer__attachments">
                                            <span className="iz-viewer__attachments-label"><Paperclip size={14} aria-hidden /> Attachments</span>
                                            <div className="iz-viewer__attachments-grid">
                                                {viewerEmail.attachments.map((att, i) => {
                                                    const ext = att.filename.split('.').pop()?.toLowerCase() || '';
                                                    const AttIcon = ['pdf'].includes(ext) ? FileText
                                                        : ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext) ? Image
                                                        : ['doc','docx'].includes(ext) ? FileText
                                                        : ['xls','xlsx','csv'].includes(ext) ? FileSpreadsheet
                                                        : ['zip','rar','7z','gz','tar'].includes(ext) ? Package
                                                        : ['mp3','wav','m4a','ogg'].includes(ext) ? Music
                                                        : ['mp4','mov','avi','mkv','webm'].includes(ext) ? Film
                                                        : Paperclip;
                                                    const sizeStr = att.size < 1024 ? `${att.size} B`
                                                        : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)} KB`
                                                        : `${(att.size / 1048576).toFixed(1)} MB`;
                                                    return (
                                                        <a
                                                            key={i}
                                                            className="iz-viewer__attachment-card"
                                                            href={`${INBOX_API}/${viewerEmail.id}/attachments/${att.attachmentId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            download={att.filename}
                                                            title={`Download: ${att.filename} (${sizeStr})`}
                                                        >
                                                            <span className="iz-viewer__attachment-icon"><AttIcon size={16} aria-hidden /></span>
                                                            <div className="iz-viewer__attachment-info">
                                                                <span className="iz-viewer__attachment-name">{att.filename}</span>
                                                                <span className="iz-viewer__attachment-size">{sizeStr}</span>
                                                            </div>
                                                            <span className="iz-viewer__attachment-dl"><Download size={14} /></span>
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Email Body — auto-resizing iframe */}
                                    <div className="iz-viewer__body" style={{ background: 'var(--bg-surface)', borderRadius: 8, overflow: 'hidden' }}>
                                        <iframe
                                            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:28px 32px;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.75;color:#1e293b;background:var(--bg-surface);word-wrap:break-word;overflow-wrap:break-word}img{max-width:100%;height:auto;border-radius:6px;display:block;margin:12px 0}a{color:#2563eb;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{padding:10px 14px;border:1px solid var(--border-default);text-align:left;font-size:14px}th{background:#f8fafc;font-weight:600;color:#334155}blockquote{margin:16px 0;padding:14px 24px;border-left:4px solid #6366f1;background:#f8fafc;color:var(--text-tertiary);border-radius:0 8px 8px 0;font-style:italic}pre,code{font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;background:var(--bg-surface-elevated);border-radius:4px;padding:2px 6px}pre{padding:16px 20px;overflow-x:auto;border:1px solid var(--border-default)}hr{border:none;border-top:1px solid var(--border-default);margin:20px 0}h1{font-size:22px;color:#0f172a;margin:20px 0 10px}h2{font-size:18px;color:#0f172a;margin:18px 0 8px}h3{font-size:16px;color:#1e293b;margin:14px 0 6px}ul,ol{padding-left:28px}li{margin:6px 0}p{margin:10px 0}.email-footer,.unsubscribe{font-size:11px;color:var(--text-secondary);margin-top:28px;padding-top:18px;border-top:1px solid var(--border-default)}</style></head><body>${sanitizeHtml(formatEmailBody(viewerEmail.body || '')) || `<div style="padding:40px;text-align:center;color:var(--text-secondary);font-style:italic"><p style="font-size:16px"></p><p>${sanitizeHtml(viewerEmail.snippet || 'No email body available.')}</p></div>`}</body></html>`}
                                            style={{ width: '100%', border: 'none', display: 'block', minHeight: 200 }}
                                            title="email-viewer-body"
                                            sandbox="allow-popups"
                                        />
                                    </div>

                                    {/* Routing Reasoning */}
                                    {viewerEmail.routingReasoning && (
                                        <div className="iz-viewer__reasoning">
                                            <span className="iz-viewer__reasoning-label"><Brain size={14} aria-hidden /> Routing Reasoning</span>
                                            <p>{viewerEmail.routingReasoning}</p>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="iz-viewer__actions">
                                        <button
                                            className="iz-action iz-action--approve"
                                            onClick={() => {
                                                if (viewerEmail.routedToProject) {
                                                    handleApprove(viewerEmail.id, viewerEmail.routedToProject);
                                                } else {
                                                    setRoutePickerFor(viewerEmail.id);
                                                    setExpandedId(viewerEmail.id);
                                                }
                                                setViewerEmail(null);
                                            }}
                                        >
                                            <Check size={14} aria-hidden /> {viewerEmail.routedToProject ? 'Approve & Route' : 'Approve'}
                                        </button>
                                        <button className="iz-action iz-action--archive" onClick={() => { handleArchive(viewerEmail.id); setViewerEmail(null); }}>
                                            <Download size={14} aria-hidden /> Archive
                                        </button>
                                        <button className="iz-action iz-action--delete" onClick={() => { handleDelete(viewerEmail.id); setViewerEmail(null); }}>
                                            <Trash2 size={14} aria-hidden /> Delete
                                        </button>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                )}
                </div>
            )}

            {/* ponytail: NIF Intel, Actions, Analytics, Cold Block, Replies, Tracker
                and Capabilities tabs removed at plan 066 §2a — each called routes
                that never existed or advertised features the code contradicted.
                Rules + Audit came back at plan 066 §5b/§5c below. */}

            {/* ========== NEWSLETTERS TAB ========== */}
            {activeTab === 'newsletters' && (
                <div role="tabpanel" id="iz-tabpanel-newsletters" aria-labelledby="iz-tab-newsletters">
                    <NewslettersTab
                        newsletters={newsletters}
                        authFetch={authFetch}
                        inboxApiBase={INBOX_API}
                        onRefresh={() => queryClient.invalidateQueries({ queryKey: inboxKeys.newsletters() })}
                    />
                </div>
            )}

            {/* ========== RULES TAB (plan 066 §5c) ========== */}
            {activeTab === 'rules' && (
                <div role="tabpanel" id="iz-tabpanel-rules" aria-labelledby="iz-tab-rules">
                    <RulesManager apiBase={INBOX_API} authFetch={authFetch} canEdit={isGod} />
                </div>
            )}

            {/* ========== AUDIT TAB (plan 066 §5b) ========== */}
            {activeTab === 'audit' && (
                <div role="tabpanel" id="iz-tabpanel-audit" aria-labelledby="iz-tab-audit">
                    <GlobalAuditTab apiBase={INBOX_API} authFetch={authFetch} />
                </div>
            )}

            {/* ========== STATS TAB ========== */}
            {activeTab === 'stats' && (
                <div role="tabpanel" id="iz-tabpanel-stats" aria-labelledby="iz-tab-stats">
                    <StatsTab stats={stats} metrics={metrics} zeroProgress={zeroProgress} />
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
                                    {settingsSaving ? 'Saving…' : <><Save size={14} aria-hidden /> Save Settings</>}
                                </button>
                            </div>

                            {settingsMsg && (
                                <div className={`iz-settings__msg iz-settings__msg--${settingsMsg.type}`}>
                                    {settingsMsg.type === 'success' ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />} {settingsMsg.text}
                                </div>
                            )}

                            {/* ponytail: capability toggles removed at plan 066 §2b — the
                                Capabilities tab they controlled is gone too. */}

                            {/* Legal Shield Status */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title"><Scale size={16} aria-hidden /> Legal Shield — Georgia Code</h3>
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
                                                <span style={{ fontSize: '20px', display: 'inline-flex' }}>{legalShieldHealth.healthy ? <Check size={20} aria-hidden /> : <TriangleAlert size={20} aria-hidden />}</span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, color: legalShieldHealth.healthy ? '#22c55e' : '#ef4444' }}>
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
                                                    {legalShieldLoading ? 'Checking…' : <><RefreshCw size={12} aria-hidden /> Run Health Check</>}
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
                                                        <span style={{ display: 'inline-flex' }}>{c.status === 'pass' ? <Check size={13} aria-hidden /> : c.status === 'warn' ? <TriangleAlert size={13} aria-hidden /> : <X size={13} aria-hidden />}</span>
                                                        <span style={{ fontFamily: 'monospace', minWidth: '160px' }}>{c.name}</span>
                                                        <span style={{ opacity: 0.7 }}>{c.detail}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                                            {legalShieldLoading ? 'Loading Legal Shield status…' : 'Legal Shield status unavailable'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Themes */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title"><Palette size={16} aria-hidden /> Themes</h3>
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
                                            {currentTheme === tp.id && <span className="iz-theme-card__check"><Check size={14} /></span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Typography */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title"><Type size={16} aria-hidden /> Typography</h3>
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
                                            {currentFont === fp.id && <span className="iz-font-card__check"><Check size={14} /></span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Animations & Interactions */}
                            <div className="iz-settings__section">
                                <h3 className="iz-settings__section-title"><Sparkles size={16} aria-hidden /> Animations & Interactions</h3>
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

                            {/* Permissions (god only) */}
                            {isGod && (
                                <div className="iz-settings__section">
                                    <h3 className="iz-settings__section-title"><Lock size={16} aria-hidden /> Permissions</h3>
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
                                                        const res = await authFetch(`${API_BASE}/api/auth/permissions/${uid}`, {
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
                                                    {Object.values(permMap).every(v => v) ? <><Square size={13} aria-hidden /> Deselect All</> : <><SquareCheck size={13} aria-hidden /> Select All</>}
                                                </button>
                                            </div>

                                            {/* Widget Permissions */}
                                            <div className="iz-perms__category">
                                                <h4 className="iz-perms__category-title"><LayoutGrid size={14} aria-hidden /> Widgets</h4>
                                                <div className="iz-perms__grid">
                                                    {[
                                                        { key: 'widget:astra-dashboard', icon: LayoutDashboard, label: 'Astra' },
                                                        { key: 'widget:strata-dashboard', icon: Building2, label: 'Strata' },
                                                        { key: 'widget:thought-weaver', icon: Workflow, label: 'Thought Weaver' },
                                                        { key: 'widget:inbox', icon: Mail, label: 'Inbox' },
                                                        { key: 'widget:tasks', icon: ListChecks, label: 'Tasks' },
                                                        { key: 'widget:ara-console', icon: Brain, label: 'ARA' },
                                                        { key: 'widget:transcription', icon: Mic, label: 'Transcribe' },
                                                        { key: 'widget:fact-check-log', icon: Search, label: 'Fact Check' },
                                                        { key: 'widget:hierarchy-browser', icon: FolderTree, label: 'Explorer' },
                                                        { key: 'widget:file-manager', icon: Folder, label: 'Files' },
                                                        { key: 'widget:notepad', icon: FileText, label: 'Notepad' },
                                                        { key: 'widget:doc-viewer', icon: FileText, label: 'Docs' },
                                                        { key: 'widget:terminal', icon: Terminal, label: 'Terminal' },
                                                        { key: 'widget:trello-board', icon: ClipboardList, label: 'Trello' },
                                                        { key: 'widget:control-panel', icon: Settings, label: 'Settings' },
                                                    ].map(w => {
                                                        const WidgetIcon = w.icon;
                                                        return (
                                                        <label key={w.key} className={`iz-perms__item ${permMap[w.key] ? 'iz-perms__item--on' : ''}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!permMap[w.key]}
                                                                onChange={(e) => setPermMap(prev => ({ ...prev, [w.key]: e.target.checked }))}
                                                            />
                                                            <span className="iz-perms__item-icon"><WidgetIcon size={16} aria-hidden /></span>
                                                            <span className="iz-perms__item-label">{w.label}</span>
                                                        </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Section Permissions */}
                                            <div className="iz-perms__category">
                                                <h4 className="iz-perms__category-title"><Ruler size={14} aria-hidden /> Sections</h4>
                                                <div className="iz-perms__grid iz-perms__grid--sections">
                                                    {[
                                                        { key: 'section:domains', icon: FolderOpen, label: 'Domain Tree' },
                                                        { key: 'section:settings-admin', icon: ShieldCheck, label: 'Admin Settings' },
                                                    ].map(s => {
                                                        const SectionIcon = s.icon;
                                                        return (
                                                        <label key={s.key} className={`iz-perms__item ${permMap[s.key] ? 'iz-perms__item--on' : ''}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!permMap[s.key]}
                                                                onChange={(e) => setPermMap(prev => ({ ...prev, [s.key]: e.target.checked }))}
                                                            />
                                                            <span className="iz-perms__item-icon"><SectionIcon size={16} aria-hidden /></span>
                                                            <span className="iz-perms__item-label">{s.label}</span>
                                                        </label>
                                                        );
                                                    })}
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
                                                            const res = await authFetch(`${API_BASE}/api/auth/permissions/${permSelectedUser}`, {
                                                                method: 'PUT',
                                                                headers: {
                                                                    'Content-Type': 'application/json',
                                                                    Authorization: `Bearer ${authToken}`,
                                                                },
                                                                body: JSON.stringify({ permissions: permMap }),
                                                            });
                                                            if (res.ok) {
                                                                setPermSaveMsg('Permissions saved');
                                                            } else {
                                                                const err = await res.json().catch(() => ({ error: 'Save failed' }));
                                                                setPermSaveMsg(`${err.error}`);
                                                            }
                                                        } catch {
                                                            setPermSaveMsg('Network error');
                                                        }
                                                        setPermSaving(false);
                                                        setTimeout(() => setPermSaveMsg(''), 4000);
                                                    }}
                                                >
                                                    {permSaving ? 'Saving…' : <><Save size={14} aria-hidden /> Save Permissions</>}
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
                                <h3 className="iz-settings__section-title"><Bot size={16} aria-hidden /> AI & Routing</h3>
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
                                <h3 className="iz-settings__section-title"><Mail size={16} aria-hidden /> Gmail Integration</h3>
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
                                <h3 className="iz-settings__section-title"><ClipboardList size={16} aria-hidden /> Trello Integration</h3>
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
                                <h3 className="iz-settings__section-title"><Cloud size={16} aria-hidden /> Google Drive & Sharing</h3>
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
                                <h3 className="iz-settings__section-title"><ShieldCheck size={16} aria-hidden /> Security & Guard</h3>
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
                                                    {llmSafetyLoading ? 'Loading…' : <><RefreshCw size={14} aria-hidden /> Refresh</>}
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
                                            <div className="iz-safety__error" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} aria-hidden /> {llmSafetyError}</div>
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

        </div>
    );
}
