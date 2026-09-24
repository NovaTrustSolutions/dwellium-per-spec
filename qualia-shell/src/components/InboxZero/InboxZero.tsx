import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
    ArrowDown, ArrowUp, Bot, Brain, Check, ClipboardList, Clock,
    Download, Inbox,
    Link, Mail, MailOpen,
    Paperclip, PartyPopper, RefreshCw, Reply, Search,
    Sparkles, Trash2, TriangleAlert,
    Undo2, X, Zap,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '../../context/UserContext';
import { INBOX_API } from '../../config/api';
import type {
    InboxItem, NewsletterSender, InboxStats,
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
import SettingsTab from './SettingsTab';
import {
    useInboxItems, useInboxStats, useNewsletters, useOperatorMetrics,
    useEmailBody,
    inboxKeys,
} from './useInboxQueries';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { useWidgetMemory } from '../../lib/widgetMemory';
import { backendStatusStore } from '../../lib/backendStatusStore';

// QueryClient is provided at the App level via QueryProvider.

// ============================================
// Types are imported from ./InboxZeroTypes.ts
// ============================================

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
    // ponytail: no `attachments` field — GET /:id/body always returns
    // attachments: [] today (no backend route to download one exists yet);
    // the dead download-card UI that read it was removed at plan 066 §6.
    const [viewerEmail, setViewerEmail] = useState<(InboxItem & {
        body?: string;
    }) | null>(null);
    const [viewerLoading, setViewerLoading] = useState(false);
    const viewerOverlayRef = useRef<HTMLDivElement | null>(null);

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

    // Plan 066 §6c — Settings/permissions/legal-shield/LLM-safety state, and
    // their fetch effects, moved to SettingsTab.tsx (self-contained: it reads
    // its own useUser()/useTheme()). isGod stays here — RulesManager (Rules
    // tab) also needs it for canEdit.
    const { role: currentUserRole, authFetch } = useUser();
    const isGod = currentUserRole === 'god';

    // ---- DATA FETCHING (React Query) ----
    // Bridge pattern: RQ hooks provide data; bridge variables preserve existing API surface
    const itemsQuery = useInboxItems(authFetch, triageFilter, debouncedSearch, currentOffset, ITEMS_PER_PAGE);
    const statsQuery = useInboxStats(authFetch);
    const metricsQuery = useOperatorMetrics(authFetch);
    const newslettersQuery = useNewsletters(authFetch, activeTab === 'newsletters');
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

    // Convenience refetch alias — used by action handlers + SSE to invalidate cache
    const invalidateInbox = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    }, [queryClient]);

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

    // Plan 066 §6b — close the full email viewer on Escape, or on a click on
    // the backdrop itself (not one that bubbled up from inside the panel).
    // Attached imperatively (not via JSX onClick) so neither the backdrop nor
    // the panel needs a click handler jsx-a11y would flag.
    useEffect(() => {
        if (!viewerEmail && !viewerLoading) return;
        const overlay = viewerOverlayRef.current;
        const closeViewer = () => { setViewerEmail(null); setViewerLoading(false); };
        const onOverlayClick = (e: MouseEvent) => { if (e.target === overlay) closeViewer(); };
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeViewer(); };
        overlay?.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            overlay?.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [viewerEmail, viewerLoading]);

    // ---- Tab-triggered fetches (SPLIT to avoid infinite loop) ----

    // 1. Newsletters — React Query auto-handles via enabled flag (activeTab === 'newsletters')
    // No manual trigger needed.

    // 2. Settings + permissions + LLM safety audit — moved into SettingsTab.tsx
    // (plan 066 §6c); it mounts only while activeTab === 'settings', so its own
    // mount effects replace what used to live here.

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
                <div className="iz-tabs" role="tablist" aria-label="InboxZero sections" tabIndex={-1} onKeyDown={(e) => {
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
                                        color: sortField === s.id ? 'var(--accent-text)' : 'var(--text-secondary)',
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
                                        {/* Left: main content — a plain wrapper (no click handler of its own,
                                            plan 066 §6b): it holds a checkbox and a dedicated expand/collapse
                                            button as siblings, since a <button> cannot contain nested
                                            interactive content like the checkbox. */}
                                        <div className="iz-card__main" style={{ flex: 1 }}>
                                            <input
                                                type="checkbox"
                                                className="iz-card__check"
                                                aria-label={`Select “${item.subject}”`}
                                                checked={isSelected}
                                                onChange={() => toggleSelect(item.id)}
                                            />
                                            <button
                                                type="button"
                                                className="iz-card__content"
                                                aria-expanded={isExpanded}
                                                style={{
                                                    background: 'none', border: 'none', padding: 0, margin: 0,
                                                    textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit', cursor: 'pointer',
                                                }}
                                                onClick={() => {
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
                                                }}
                                            >
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
                                                            borderRadius: 4, background: 'color-mix(in srgb, var(--danger) 15%, transparent)',
                                                            // mixed toward --text-primary: lighter on dark themes, darker on light ones — plain --danger missed 4.5:1 at 10px
                                                            color: 'color-mix(in srgb, var(--danger) 70%, var(--text-primary))', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
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
                                            </button>
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
                                                                setViewerEmail({ ...item, body: d.data.body });
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
                                                    aria-controls={`iz-snooze-${item.id}`}
                                                    aria-expanded={snoozeMenuFor === item.id}
                                                    onClick={e => { e.stopPropagation(); setSnoozeMenuFor(snoozeMenuFor === item.id ? null : item.id); }}
                                                >
                                                    <Clock size={14} aria-hidden /> Snooze
                                                </button>
                                                {snoozeMenuFor === item.id && (
                                                    <div className="iz-snooze-menu" id={`iz-snooze-${item.id}`} role="group" aria-label="Snooze for">
                                                        {SNOOZE_OPTIONS.map(opt => (
                                                            <button
                                                                key={opt.label}
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

                                    {/* No onClick on .iz-card__actions below (plan 066 §6b): it used to
                                        stop clicks from bubbling to .iz-card__main's own handler, but that
                                        handler moved onto the dedicated .iz-card__content button above (a
                                        sibling of this element, not an ancestor), so there is nothing left
                                        to stop. */}
                                    {isExpanded && (
                                        <div className="iz-card__actions">
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
                                                                    setViewerEmail({ ...item, body: d.data.body });
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
                                                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent-text)' }}
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
                {/* Plan 066 §6b: neither div below carries a JSX onClick — a static
                    element with a click handler needs an interactive role to pass
                    jsx-a11y, and there is no honest one for "backdrop that dismisses
                    a dialog". Backdrop-click-to-close and Escape-to-close are wired
                    imperatively in the effect below instead (same trick this file
                    already uses for the snooze menu's outside-click close). */}
                {(viewerEmail || viewerLoading) && (
                    <div className="iz-viewer-overlay" ref={viewerOverlayRef}>
                        <div
                            className="iz-viewer"
                            role="dialog"
                            aria-modal="true"
                            aria-label={viewerEmail ? viewerEmail.subject : 'Loading email'}
                        >
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
                                                {/* ponytail: no count — GET /:id/body has no attachments route
                                                    to back one yet (plan 066 §6); this just flags the email has some. */}
                                                <Paperclip size={13} aria-hidden /> Attachments
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

                                    {/* ponytail: attachment download cards removed at plan 066 §6 — they
                                        linked to `${INBOX_API}/:id/attachments/:attachmentId`, a route that
                                        does not exist, and GET /:id/body always returns attachments: [].
                                        Add them back once a real download route exists. */}

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
                <div role="tabpanel" id="iz-tabpanel-settings" aria-labelledby="iz-tab-settings">
                    <SettingsTab />
                </div>
            )}

        </div>
    );
}
