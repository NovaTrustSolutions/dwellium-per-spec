import { useContext, useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
    BarChart3,
    Brain,
    Calendar,
    Check,
    ClipboardList,
    Clock,
    Download,
    FileText,
    Flame,
    Folder,
    Hourglass,
    Lightbulb,
    MessageCircle,
    Package,
    Pencil,
    Pin,
    Save,
    Satellite,
    Sparkles,
    Trash2,
    TrendingUp,
    User,
    X,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { API_BASE } from '../../config';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { twSyncConfig, pullCaptures, planImport } from './thoughtWeaverSync';
import { pullInbox } from './twInbox';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { logActivity } from '../../lib/activityLogStore';
import {
    thoughtWeaverStore,
    thoughtWeaverUserIdHolder,
    appendLocalCapture,
    deleteLocalCapture,
    clearLocalCaptures,
    recategorizeLocalCapture,
    importCaptures,
} from './thoughtWeaverStore';
import type { LocalCapture } from './thoughtWeaverStore';
import { twImportedStore, markImported } from './twImportedStore';
import {
    todoStore,
    addTodo,
    syncTodosFromCaptures,
    toggleTodo,
    deleteTodo,
    clearDoneTodos,
} from './todoStore';
import type { TodoItem } from './todoStore';
import {
    reportStore,
    addDailyReport,
    addWeeklySummary,
    setInsights,
    clearReports,
} from './reportStore';
import type { ReportData } from './reportStore';
import {
    generateReports,
    isDailyReportDue,
    isWeeklyReportDue,
} from './reportEngine';
import type { GenerateOptions, GenerateContext, ReportSink } from './reportEngine';
import { weekStartOf } from './insights';
import type { InsightCapture } from './insights';
import {
    sendToAra,
    saveToHonchoMemory,
    composeInsightContext,
    insightToHonchoSeed,
    buildTwContextDigest,
} from './thoughtWeaverLinkage';
import { localCategorize } from './localCategorizer';
import { deriveStats, deriveBuckets, deriveTimeline } from './localViews';
import './ThoughtWeaver.css';

// ── Daily to-do synthesis ────────────────────────────────────────────
// Without an LLM we still want to surface actionable items: split captures
// into sentences, keep ones with action verbs at the front. Admin-bucket
// captures get priority='high', needs_review='medium', everything else='low'.
const ACTION_VERBS = [
    'call', 'email', 'reach', 'send', 'reply', 'write', 'draft', 'review', 'check', 'schedule',
    'book', 'pay', 'order', 'buy', 'pick', 'finish', 'complete', 'submit', 'file', 'sign',
    'meet', 'ask', 'tell', 'remind', 'follow', 'plan', 'prepare', 'fix', 'update', 'create',
    'add', 'remove', 'delete', 'install', 'set', 'organize', 'clean', 'pick', 'pickup',
    'do', 'need', 'must', 'should', 'todo', 'task',
];

function isActionable(text: string): boolean {
    const lower = text.trim().toLowerCase();
    if (!lower) return false;
    const firstWord = lower.split(/\s+/)[0].replace(/[^a-z]/g, '');
    if (ACTION_VERBS.includes(firstWord)) return true;
    // "I need to / I have to / Don't forget to / Remember to" patterns
    if (/\b(need to|have to|don'?t forget|remember to|by (tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|eod|cob))\b/.test(lower)) return true;
    return false;
}

function synthesizeTodosFromCaptures(captures: CaptureEntry[]): Array<Omit<TodoItem, 'id' | 'done' | 'createdAt' | 'completedAt'>> {
    const out: Array<Omit<TodoItem, 'id' | 'done' | 'createdAt' | 'completedAt'>> = [];
    for (const c of captures) {
        const sentences = c.original_text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
        for (const s of sentences) {
            if (!isActionable(s) && c.filed_to !== 'admin') continue;
            const priority: TodoItem['priority'] = c.filed_to === 'admin' ? 'high'
                : c.filed_to === 'needs_review' ? 'medium' : 'low';
            out.push({ text: s.length > 200 ? s.slice(0, 197) + '…' : s, sourceCaptureId: c.id, priority });
        }
    }
    return out;
}

// ── Types ────────────────────────────────────────────────────────────

type TabId = 'capture' | 'today' | 'reports' | 'dashboard' | 'timeline';
type BucketId = 'people' | 'projects' | 'ideas' | 'admin';

interface Stats {
    totalCaptures: number;
    pendingReviews: number;
    activePeople: number;
    activeProjects: number;
    totalIdeas: number;
    tasksDue: number;
}

interface CaptureEntry {
    id: string;
    original_text: string;
    filed_to: string;
    confidence: number;
    destination_name: string | null;
    status: string;
    createdAt: string;
    /** Every capture is local now (plan 067 Phase 2 — the backend stores nothing). */
    source: 'local';
}

interface BucketItem {
    id: string;
    name: string;
    notes?: string;
    context?: string;
    one_liner?: string;
    next_action?: string;
    status?: string;
    due_date?: string | null;
    tags: string[];
    type?: string;
    createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: 'capture', label: 'Capture', icon: FileText },
    { id: 'today', label: 'Today', icon: Check },
    { id: 'reports', label: 'Reports', icon: TrendingUp },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'timeline', label: 'Timeline', icon: Clock },
];

// Colors double as both a decorative left-border/icon tint AND, in several
// places (badges, chips), the text color itself — so each is blended toward
// --text-primary via color-mix() rather than used as a flat token/hex,
// keeping contrast solid on both very dark (cosmos) and very light (latte,
// corporate) themes while still telling the 4 buckets apart. (An earlier
// pass used flat var(--danger)/var(--warning)/var(--success) tokens to
// dodge a capture-harness bug where Chromium serializes color-mix() as
// `color(srgb r g b)` — 0-1 fractional, not 0-255 — misread as near-black;
// the harness parser now scales that case ×255, so the adaptive blend is
// back and measures correctly.)
const twCatText = (token: string) => `color-mix(in srgb, ${token} 35%, var(--text-primary))`;
const BUCKETS: { id: BucketId; label: string; icon: LucideIcon; color: string }[] = [
    { id: 'people', label: 'People', icon: User, color: twCatText('var(--accent)') },
    { id: 'projects', label: 'Projects', icon: Folder, color: twCatText('var(--danger)') },
    { id: 'ideas', label: 'Ideas', icon: Lightbulb, color: twCatText('var(--warning)') },
    { id: 'admin', label: 'Tasks', icon: ClipboardList, color: twCatText('var(--success)') },
];

const TEMPLATES: { icon: LucideIcon; label: string; template: string }[] = [
    { icon: User, label: 'Person', template: 'Met [name] — context: [where/how]. Follow up: [action].' },
    { icon: Folder, label: 'Project', template: 'Project: [name]. Next action: [step]. Notes: [details].' },
    { icon: Lightbulb, label: 'Idea', template: 'Idea: [one-liner]. Details: [expand]. Could be useful for: [context].' },
    { icon: ClipboardList, label: 'Task', template: 'Need to: [action]. Due: [date/timeframe]. Notes: [context].' },
];

const API = `${API_BASE}/api/thought-weaver`;

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function dateGroup(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    if (date >= today) return 'Today';
    if (date >= yesterday) return 'Yesterday';
    if (date >= weekAgo) return 'This Week';
    return 'Earlier';
}

function confidenceLabel(c: number): string {
    if (c >= 0.8) return 'High';
    if (c >= 0.6) return 'Medium';
    return 'Low';
}

function bucketColor(bucket: string): string {
    const found = BUCKETS.find(b => b.id === bucket);
    return found ? found.color : twCatText('var(--text-secondary)');
}

function bucketIcon(bucket: string): LucideIcon {
    const found = BUCKETS.find(b => b.id === bucket);
    return found ? found.icon : Pin;
}

/** Render the Lucide icon for a bucket (decorative). */
function BucketIcon({ bucket, size = 14 }: { bucket: string; size?: number }) {
    const Ic = bucketIcon(bucket);
    return <Ic size={size} aria-hidden />;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Thoughts belong to the signed-in account (plan 067): with nobody signed in
 * there is no workspace at all — never the shared `_anonymous` bucket, which
 * every visitor of this browser would read and write. Anonymous thoughts
 * captured before this change stay in that bucket untouched.
 */
export default function ThoughtWeaver() {
    const userCtx = useContext(UserContext);
    const userId = userCtx?.user?.id ?? null;
    if (!userId) {
        return (
            <div className="tw">
                <p className="tw-empty" role="status">
                    Sign in to use Thought Weaver — your thoughts are saved to your own account.
                </p>
            </div>
        );
    }
    return <ThoughtWeaverWorkspace userId={userId} />;
}

function ThoughtWeaverWorkspace({ userId }: { userId: string }) {
    const { integrations } = useIntegrations();

    // ── Per-user local persistence (Phase-8+ Task 8.10 Option β dynamic-key) ──
    // The single identity writer points every per-user holder (captures,
    // imported ids, to-dos, reports — plan 067) at this user BEFORE the
    // useSyncExternalStore reads below.
    usePerUserIdentity();
    const localCaptures: LocalCapture[] = useSyncExternalStore(
        thoughtWeaverStore.subscribe,
        thoughtWeaverStore.getSnapshot,
        thoughtWeaverStore.getServerSnapshot,
    );
    const todos: TodoItem[] = useSyncExternalStore(
        todoStore.subscribe,
        todoStore.getSnapshot,
        todoStore.getServerSnapshot,
    );
    const reports: ReportData = useSyncExternalStore(
        reportStore.subscribe,
        reportStore.getSnapshot,
        reportStore.getServerSnapshot,
    );
    const [newTodoText, setNewTodoText] = useState('');
    const [generating, setGenerating] = useState(false);
    const [genMsg, setGenMsg] = useState<string | null>(null);
    const [handoffMsg, setHandoffMsg] = useState<string | null>(null);
    const [syncMsg, setSyncMsg] = useState<string | null>(null);
    // Clear the "Sync from captures" note after a few seconds so it never reads as current.
    useEffect(() => {
        if (!syncMsg) return;
        const t = setTimeout(() => setSyncMsg(null), 5000);
        return () => clearTimeout(t);
    }, [syncMsg]);
    const didCatchUp = useRef(false);
    const llmReady = hasActiveLlm(integrations.llm);

    const [activeTab, setActiveTab] = useState<TabId>('capture');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeBucket, setActiveBucket] = useState<BucketId | 'all'>('all');
    const [timelineFilter, setTimelineFilter] = useState<BucketId | 'all'>('all');
    const [lastResult, setLastResult] = useState<{ filed_to: string; confidence: number; destination_name: string | null } | null>(null);
    // How the most recent capture was sorted — surfaced honestly in the toast
    // instead of silently swallowing where the result came from.
    const [captureSource, setCaptureSource] = useState<'llm' | 'backend' | 'local' | null>(null);
    // Which local capture is being re-filed by the user (category override).
    const [refileId, setRefileId] = useState<string | null>(null);

    // ── Actions ──────────────────────────────────────────────────────

    const handleCapture = async () => {
        if (!text.trim() || loading) return;
        const thoughtText = text.trim();
        setLoading(true);

        // Common: persist locally FIRST (always-persistent ask). Whatever
        // happens with the LLM / backend, the user keeps their thought.
        const persistLocally = (filed_to: string, confidence: number, destination_name: string | null) => {
            const entry = {
                id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                text: thoughtText,
                filed_to,
                confidence,
                destination_name,
                createdAt: new Date().toISOString(),
            };
            appendLocalCapture(entry);
            // Universal per-login app history (plan 038): fires exactly once
            // per successful capture regardless of which of the 3 branches
            // (LLM / backend / local-fallback) won. Never log full thought
            // text — first 140 chars only.
            logActivity('thought-weaver', 'Thought Weaver', 'capture', { preview: thoughtText.slice(0, 140) });
            // P11-13 revised 2026-09-25 (plan 067, G2): no more desktop writes
            // to Supabase — a new capture is local-only. Supabase rows are a
            // one-time IMPORT (see the effect below), never a write target.
        };

        // ── 1) Try user-configured LLM first ──
        // 2026-05-26: when the user has a personal LLM key in Settings → API Keys,
        // route the categorization through that provider directly. Falls back to
        // backend if no LLM is configured OR if the LLM call/parse fails.
        if (hasActiveLlm(integrations.llm)) {
            try {
                const llmRes = await callLlm({
                    systemPrompt: `You are a thought-categorization assistant. Classify the user's text into exactly one bucket and respond with JSON only.
Buckets:
  - "people": mentions of meeting/talking-to/about a specific person
  - "projects": project status, milestones, deliverables, deadlines
  - "ideas": speculative thoughts, "what if", new concepts to explore
  - "admin": tasks, todos, things that need to be done
  - "needs_review": ambiguous text that doesn't clearly fit a bucket
Schema: { "filed_to": "people"|"projects"|"ideas"|"admin"|"needs_review", "confidence": number 0-1, "destination_name": "short descriptive label for this thought (3-6 words)" }`,
                    prompt: thoughtText,
                    responseFormat: 'json',
                    maxTokens: 256,
                    temperature: 0.2,
                }, integrations.llm);
                if (llmRes) {
                    const parsed = JSON.parse(llmRes.text);
                    const filed_to = parsed.filed_to || 'needs_review';
                    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
                    const destination_name = parsed.destination_name || null;
                    setLastResult({ filed_to, confidence, destination_name });
                    setCaptureSource('llm');
                    persistLocally(filed_to, confidence, destination_name);
                    setText('');
                    setLoading(false);
                    return;
                }
            } catch {
                // LLM call/parse failed — fall through to backend
            }
        }

        // ── 2) Fall back to backend ──
        try {
            const res = await fetch(`${API}/capture`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: thoughtText }),
            });
            const json = await res.json();
            if (json.success) {
                // Plan 067 Phase 2 (G1): POST /capture is now a stateless classifier —
                // `{ filed_to, confidence, destination_name }` — nothing is stored
                // server-side, so persisting locally (below) is the only write.
                setLastResult({ filed_to: json.data.filed_to, confidence: json.data.confidence, destination_name: json.data.destination_name });
                setCaptureSource('backend');
                persistLocally(json.data.filed_to, json.data.confidence, json.data.destination_name);
                setText('');
                setLoading(false);
                return;
            }
        } catch { /* backend offline AND no LLM configured — still persist locally */ }

        // ── 3) Both LLM and backend unavailable: categorize LOCALLY ──
        // Offline must not mean "do nothing". Run the deterministic heuristic so
        // the thought is actually sorted into People/Projects/Ideas/Tasks instead
        // of being dumped as needs_review/confidence-0. This is the difference
        // between "saved but dead" and "the feature works with no backend".
        const local = localCategorize(thoughtText);
        persistLocally(local.filed_to, local.confidence, local.destination_name);
        setLastResult({ filed_to: local.filed_to, confidence: local.confidence, destination_name: local.destination_name });
        setCaptureSource('local');
        setText('');
        setLoading(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleCapture(); }
    };

    const applyTemplate = (template: string) => { setText(template); };

    // ── Computed ─────────────────────────────────────────────────────

    // P11-13 revised 2026-09-25 (plan 067 Phase 2, D2/D3/D4/G1/G2/G3): every
    // capture view comes from the LOCAL store only — the shared in-memory
    // backend Maps (D3, cross-user leak) and the Supabase phone-sync writes
    // (D4, anon-key-in-URL leak) are both retired. Two READ-ONLY sources are
    // still a ONE-TIME IMPORT into the local store, never a live merge: the
    // user's Supabase rows (Phase 1, unchanged) and the backend's per-user
    // `thought-weaver-inbox_<uid>` One Save object (Phase 2 — phone captures
    // land here now, server-classified, never stored in a shared Map).
    // Hydrate the synced "already imported" id set FIRST (so a delete
    // recorded on another device is known before deciding what's new —
    // `twImportedStore` is itself One-Save-synced), pull both sources, let
    // `planImport` (pure) decide which rows are genuinely new (not local, not
    // previously imported/deleted), write them into the local store in one
    // `importCaptures()` call, then record every pulled id via `markImported`
    // so it is never re-imported even after the user deletes it locally.
    // Imported rows are local from then on — same delete/re-file handles as
    // any other capture (`mergedCaptures` below assumes only one source).
    // `alive` + re-checking the user holder after every await guards against
    // an unmount or an account switch mid-import (A's rows must never land
    // in B's store); StrictMode's double-effect-mount is safe because
    // `importCaptures` dedupes by id and `markImported` is a no-op when every
    // id is already recorded. The Supabase pull stays optional (only when the
    // user has Supabase configured); the inbox pull always runs once a user
    // is signed in.
    useEffect(() => {
        if (!userId) return;
        let alive = true;
        (async () => {
            try {
                await twImportedStore.hydrate();
            } catch {
                // One Save disabled/unreachable — the local imported-id
                // snapshot is still authoritative for this device.
            }
            if (!alive || thoughtWeaverUserIdHolder.current !== userId) return;

            const cfg = twSyncConfig(integrations);
            const supabaseRows = cfg ? await pullCaptures(cfg, userId) : [];
            if (!alive || thoughtWeaverUserIdHolder.current !== userId) return;

            const inboxRows = await pullInbox(userId);
            if (!alive || thoughtWeaverUserIdHolder.current !== userId) return;

            const localIds = new Set(thoughtWeaverStore.getSnapshot().map(c => c.id));
            const { toAppend, seenIds } = planImport([...supabaseRows, ...inboxRows], localIds, twImportedStore.getSnapshot());
            if (toAppend.length > 0) importCaptures(toAppend);
            if (seenIds.length > 0) markImported(seenIds);
        })();
        return () => { alive = false; };
    }, [integrations, userId]);

    // Every capture is local now — no backend/synced source left to merge.
    const mergedCaptures = useMemo<CaptureEntry[]>(() => {
        return localCaptures
            .map((c): CaptureEntry => ({
                id: c.id,
                original_text: c.text,
                filed_to: c.filed_to,
                confidence: c.confidence,
                destination_name: c.destination_name,
                status: c.filed_to === 'needs_review' ? 'needs_review' : 'filed',
                createdAt: c.createdAt,
                source: 'local',
            }))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [localCaptures]);

    // Shared delete confirm (plan 067 Phase 3, D6) — used by both the Recent
    // list and the Dashboard item delete. Deleting a local capture is
    // irreversible (Phase 2 removed the backend copy), so name the thought
    // (first ~60 chars, verbatim) in the confirm and bail out on Cancel.
    const handleDeleteCapture = useCallback((id: string, text: string) => {
        const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
        const ok = typeof window !== 'undefined' && window.confirm(
            `Delete this thought — "${preview}"? This cannot be undone.`
        );
        if (ok) deleteLocalCapture(id);
    }, []);

    // ── Glanceable views from the LOCAL trusted store (D5) ────────────────
    // The header counts, Dashboard, and Timeline reflect ONLY what's stored on
    // this device — there is no backend source left to merge on top of.
    const effectiveStats = useMemo<Stats>(() => deriveStats(localCaptures), [localCaptures]);
    const effectiveBuckets = useMemo<Record<BucketId, BucketItem[]>>(
        () => deriveBuckets(localCaptures),
        [localCaptures],
    );
    const effectiveTimeline = useMemo<BucketItem[]>(() => deriveTimeline(localCaptures), [localCaptures]);

    // User override of the AI's category on a local capture (never-misinterpreted).
    const handleRefile = useCallback((id: string, bucket: BucketId) => {
        recategorizeLocalCapture(id, bucket);
        setRefileId(null);
    }, []);

    const handleClearAllLocal = useCallback(() => {
        if (localCaptures.length === 0) return;
        const ok = typeof window !== 'undefined' && window.confirm(
            `Delete all ${localCaptures.length} of YOUR captures from this browser? This cannot be undone.`
        );
        if (ok) clearLocalCaptures();
    }, [localCaptures.length]);

    // ── Reports + insights generation (Cycle 13) ──────────────────────
    // Build the local-first sink + injectable LLM, then drive the pure engine.
    // All persistence stays in the per-user reportStore / todoStore (no backend).
    const runGenerate = useCallback(async (opts?: GenerateOptions) => {
        if (generating) return;
        setGenerating(true);
        setGenMsg(null);
        try {
            const now = new Date();
            const insightCaptures: InsightCapture[] = mergedCaptures.map(c => ({
                id: c.id,
                text: c.original_text,
                filed_to: c.filed_to,
                destination_name: c.destination_name,
                createdAt: c.createdAt,
            }));
            const ctx: GenerateContext = {
                captures: insightCaptures,
                today: now.toISOString().slice(0, 10),
                nowIso: now.toISOString(),
                llm: (req) => callLlm(req, integrations.llm),
            };
            const sink: ReportSink = {
                addDailyReport,
                addWeeklySummary,
                setInsights,
                syncTodos: (seeds) => syncTodosFromCaptures(seeds),
            };
            const r = await generateReports(ctx, sink, opts);
            const wantInsights = opts === undefined || opts.insights === true;
            const parts: string[] = [];
            if (r.ranDaily) parts.push('daily report');
            if (r.ranWeekly) parts.push('weekly summary');
            if (r.todosAdded > 0) parts.push(`${r.todosAdded} to-do${r.todosAdded === 1 ? '' : 's'}`);
            if (wantInsights) parts.push(`${r.insightCount} insight${r.insightCount === 1 ? '' : 's'}`);
            setGenMsg(parts.length ? `Generated ${parts.join(', ')}.` : 'Nothing new to generate yet.');
        } catch {
            setGenMsg('Generation hit a snag — your captures are safe.');
        } finally {
            setGenerating(false);
        }
    }, [generating, mergedCaptures, integrations.llm]);

    // On-open catch-up: once captures are available, if a daily report hasn't
    // been generated for today, draft it + refresh to-dos (and the weekly
    // summary if that's also due). Insights are LLM-only, so they stay behind
    // the explicit "Generate now" button rather than spending tokens on open.
    // Runs once per mount (ref-guarded); client-only by virtue of useEffect.
    useEffect(() => {
        if (didCatchUp.current) return;
        if (mergedCaptures.length === 0) return;
        didCatchUp.current = true;
        const today = new Date().toISOString().slice(0, 10);
        const snap = reportStore.getSnapshot();
        if (!isDailyReportDue(snap.lastDailyReportDate, today)) return;
        const weekDue = isWeeklyReportDue(snap.lastWeeklyReportWeek, weekStartOf(today));
        runGenerate({ daily: true, todos: true, weekly: weekDue });
    }, [mergedCaptures.length, runGenerate]);

    const handleClearReports = useCallback(() => {
        const total = reports.dailyReports.length + reports.weeklySummaries.length + reports.insights.length;
        if (total === 0) return;
        const ok = typeof window !== 'undefined' && window.confirm(
            `Clear all ${total} generated report${total === 1 ? '' : 's'}/insight${total === 1 ? '' : 's'}? Your captures + to-dos are kept.`
        );
        if (ok) { clearReports(); setGenMsg(null); }
    }, [reports.dailyReports.length, reports.weeklySummaries.length, reports.insights.length]);

    // ── Cross-widget handoffs (Cycle 15: TW ↔ ARA ↔ Honcho) ──────────────
    // All decoupled via the existing buses: ARA reuses `scribe:send-to-ara`
    // (zero ARA change); Honcho saves to its LOCAL dreamStore. Pure logic lives
    // in thoughtWeaverLinkage.ts; these are the thin call sites.
    const handleInsightToAra = useCallback((insight: { text: string; kind: 'pattern' | 'connection' | 'suggestion' }) => {
        const ok = sendToAra(composeInsightContext(insight));
        setHandoffMsg(ok ? 'Sent insight to ARA.' : 'Nothing to send.');
    }, []);

    const handleInsightToHoncho = useCallback((insight: { id: string; text: string; kind: 'pattern' | 'connection' | 'suggestion' }) => {
        const saved = saveToHonchoMemory(insightToHonchoSeed(insight));
        setHandoffMsg(saved ? 'Saved to Honcho memory.' : 'Nothing to save.');
    }, []);

    const handleDigestToAra = useCallback(() => {
        const digest = buildTwContextDigest(
            mergedCaptures.map(c => ({ text: c.original_text, filed_to: c.filed_to })),
            reports.insights,
        );
        const ok = sendToAra(digest ? { text: digest, preface: 'Here is a digest of my recent notes for context:' } : null);
        setHandoffMsg(ok ? 'Sent recent-notes digest to ARA.' : 'No notes to share yet.');
    }, [mergedCaptures, reports.insights]);

    const allBucketItems = useMemo(() => {
        if (activeBucket === 'all') return Object.entries(effectiveBuckets).flatMap(([type, items]) => items.map(i => ({ ...i, type })));
        return effectiveBuckets[activeBucket].map(i => ({ ...i, type: activeBucket }));
    }, [effectiveBuckets, activeBucket]);

    const filteredTimeline = useMemo(() => {
        if (timelineFilter === 'all') return effectiveTimeline;
        return effectiveTimeline.filter(i => i.type === timelineFilter);
    }, [effectiveTimeline, timelineFilter]);

    const groupedTimeline = useMemo(() => {
        const groups: Record<string, BucketItem[]> = {};
        for (const item of filteredTimeline) {
            const group = dateGroup(item.createdAt);
            if (!groups[group]) groups[group] = [];
            groups[group].push(item);
        }
        return groups;
    }, [filteredTimeline]);

    // ── Render ───────────────────────────────────────────────────────

    return (
        <div className="tw">
            {/* Header */}
            <div className="tw-header">
                <div className="tw-header__top">
                    <h2 className="tw-title"><Brain size={16} aria-hidden /> Thought Weaver</h2>
                    {effectiveStats && (
                        <div className="tw-stats-mini">
                            <span className="tw-stats-mini__item" style={{ color: twCatText('var(--accent)') }}><User size={13} aria-hidden /> {effectiveStats.activePeople}</span>
                            <span className="tw-stats-mini__item" style={{ color: twCatText('var(--danger)') }}><Folder size={13} aria-hidden /> {effectiveStats.activeProjects}</span>
                            <span className="tw-stats-mini__item" style={{ color: twCatText('var(--warning)') }}><Lightbulb size={13} aria-hidden /> {effectiveStats.totalIdeas}</span>
                            <span className="tw-stats-mini__item" style={{ color: twCatText('var(--success)') }}><ClipboardList size={13} aria-hidden /> {effectiveStats.tasksDue}</span>
                        </div>
                    )}
                </div>
                <div className="tw-tabs">
                    {TABS.map(tab => {
                        const TabIcon = tab.icon;
                        return (
                        <button key={tab.id} className={`tw-tab ${activeTab === tab.id ? 'tw-tab--active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                            <TabIcon size={14} aria-hidden /> {tab.label}
                        </button>
                        );
                    })}
                </div>
            </div>

            {/* ─── CAPTURE TAB ─── */}
            {activeTab === 'capture' && (
                <div className="tw-capture">
                    <div className="tw-capture__input-area">
                        <textarea
                            className="tw-capture__textarea"
                            placeholder="Drop a thought... meetings, ideas, tasks, people. AI will organize it."
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={3}
                        />
                        <div className="tw-capture__toolbar">
                            <div className="tw-templates">
                                {TEMPLATES.map(t => {
                                    const TmplIcon = t.icon;
                                    return (
                                    <button key={t.label} className="tw-template-chip" onClick={() => applyTemplate(t.template)} title={t.label} aria-label={t.label}>
                                        <TmplIcon size={16} aria-hidden />
                                    </button>
                                    );
                                })}
                            </div>
                            <button className="tw-capture__btn" onClick={handleCapture} disabled={!text.trim() || loading} aria-busy={loading}>
                                {loading ? 'Classifying...' : 'Capture'}
                            </button>
                        </div>
                    </div>

                    {/* Classification result toast — the region is ALWAYS rendered
                        (plan 067 Phase 3, D9) so a screen reader has already
                        registered it as a live region before the content inside
                        changes; a region mounted together with its first content
                        is often not announced. */}
                    <div role="status" aria-live="polite">
                        {lastResult && (
                            <div className="tw-result" style={{ borderLeftColor: bucketColor(lastResult.filed_to) }}>
                                <span className="tw-result__icon"><BucketIcon bucket={lastResult.filed_to} size={16} /></span>
                                <div className="tw-result__text">
                                    <strong>{lastResult.filed_to === 'needs_review' ? 'Needs Review' : `Filed → ${lastResult.destination_name}`}</strong>
                                    <span className={`tw-confidence tw-confidence--${confidenceLabel(lastResult.confidence).toLowerCase()}`}>
                                        {confidenceLabel(lastResult.confidence)} ({Math.round(lastResult.confidence * 100)}%)
                                    </span>
                                    {captureSource && (
                                        <span className="tw-source-badge" title="How this thought was sorted">
                                            {captureSource === 'llm' ? <><Sparkles size={12} aria-hidden /> via your LLM</>
                                                : captureSource === 'backend' ? <><Satellite size={12} aria-hidden /> via backend</>
                                                : <><Save size={12} aria-hidden /> sorted locally · offline</>}
                                        </span>
                                    )}
                                </div>
                                <button className="tw-result__close" onClick={() => { setLastResult(null); setCaptureSource(null); }} aria-label="Dismiss result"><X size={16} /></button>
                            </div>
                        )}
                    </div>

                    {/* Recent captures — local store only (plan 067 Phase 2) */}
                    <div className="tw-recent">
                        <div className="tw-recent__header">
                            <h3 className="tw-section-title">Recent Captures</h3>
                            {localCaptures.length > 0 && (
                                <button
                                    className="tw-clear-local-btn"
                                    onClick={handleClearAllLocal}
                                    title={`Delete YOUR ${localCaptures.length} local captures`}
                                >
                                    <Trash2 size={14} aria-hidden /> Clear my captures ({localCaptures.length})
                                </button>
                            )}
                        </div>
                        {mergedCaptures.length === 0 ? (
                            <div className="tw-empty">
                                <span className="tw-empty__icon"><Brain size={14} /></span>
                                <p>No thoughts yet. Start capturing!</p>
                            </div>
                        ) : (
                            <div className="tw-captures-list">
                                {mergedCaptures.map(c => (
                                    <div key={c.id} className="tw-capture-card" style={{ borderLeftColor: bucketColor(c.filed_to) }}>
                                        <p className="tw-capture-card__text">{c.original_text}</p>
                                        <div className="tw-capture-card__meta">
                                            <span className="tw-badge" style={{ background: bucketColor(c.filed_to) + '22', color: bucketColor(c.filed_to) }}>
                                                <BucketIcon bucket={c.filed_to} /> {c.filed_to === 'needs_review' ? 'Review' : c.filed_to}
                                            </span>
                                            <span className="tw-confidence-mini">{Math.round(c.confidence * 100)}%</span>
                                            <span className="tw-local-badge" title="Stored in this browser — only you can delete it"><Save size={12} aria-hidden /> local</span>
                                            {/* User override of the AI's category — you always have the final say.
                                                This also covers needs_review items (plan 067 Phase 2, D3): every
                                                capture is local now, so re-filing via `recategorizeLocalCapture`
                                                is the one categorize path — the old backend `/resolve/:id` picker
                                                (only reachable for non-local rows) is gone with it. */}
                                            {refileId === c.id ? (
                                                <div className="tw-resolve-picker">
                                                    {BUCKETS.map(b => {
                                                        const BIcon = b.icon;
                                                        return (
                                                        <button key={b.id} className="tw-resolve-btn" style={{ color: b.color }} onClick={() => handleRefile(c.id, b.id)} title={`File under ${b.label}`} aria-label={`File under ${b.label}`}>
                                                            <BIcon size={14} aria-hidden />
                                                        </button>
                                                        );
                                                    })}
                                                    <button className="tw-resolve-cancel" onClick={() => setRefileId(null)} aria-label="Cancel re-file"><X size={16} /></button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="tw-categorize-btn"
                                                    onClick={() => setRefileId(c.id)}
                                                    title={c.status === 'needs_review'
                                                        ? 'Categorize — you decide the category; the AI never has the final say on your stored thought'
                                                        : 'Re-file — you decide the category; the AI never has the final say on your stored thought'}
                                                >
                                                    <Pencil size={14} aria-hidden /> {c.status === 'needs_review' ? 'Categorize' : 'Re-file'}
                                                </button>
                                            )}
                                            <span className="tw-time">{timeAgo(c.createdAt)}</span>
                                            <button
                                                className="tw-delete-btn"
                                                onClick={() => handleDeleteCapture(c.id, c.original_text)}
                                                title="Delete this capture"
                                                aria-label={`Delete "${c.original_text.length > 60 ? c.original_text.slice(0, 60) + '…' : c.original_text}"`}
                                            >
                                                <Trash2 size={14} aria-hidden />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── TODAY TAB ─── */}
            {activeTab === 'today' && (
                <div className="tw-today">
                    <div className="tw-today__header">
                        <h3 className="tw-section-title">Today's List</h3>
                        <div className="tw-today__actions">
                            <button
                                className="tw-today__sync-btn"
                                onClick={() => {
                                    const generated = synthesizeTodosFromCaptures(mergedCaptures);
                                    const added = syncTodosFromCaptures(generated);
                                    setSyncMsg(added > 0
                                        ? `Added ${added} to-do${added === 1 ? '' : 's'} from captures`
                                        : 'No new to-dos — everything is already on your list');
                                }}
                                title="Pull actionable items from your captures"
                            >
                                ↻ Sync from captures
                            </button>
                            {todos.some(t => t.done) && (
                                <button className="tw-today__clear-btn" onClick={clearDoneTodos}>
                                    Clear done ({todos.filter(t => t.done).length})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Always-rendered live region (plan 067 Phase 3, D9) so the
                        "Sync from captures" result is actually announced instead
                        of only landing in the console. */}
                    <div role="status" aria-live="polite">
                        {syncMsg && <p className="tw-reports__msg">{syncMsg}</p>}
                    </div>

                    {/* Quick-add */}
                    <div className="tw-today__add">
                        <input
                            type="text"
                            className="tw-today__input"
                            placeholder="Add a to-do..."
                            value={newTodoText}
                            onChange={e => setNewTodoText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && newTodoText.trim()) {
                                    addTodo({ text: newTodoText.trim(), sourceCaptureId: null, priority: 'medium' });
                                    setNewTodoText('');
                                }
                            }}
                        />
                        <button
                            className="tw-today__add-btn"
                            disabled={!newTodoText.trim()}
                            onClick={() => {
                                addTodo({ text: newTodoText.trim(), sourceCaptureId: null, priority: 'medium' });
                                setNewTodoText('');
                            }}
                        >
                            + Add
                        </button>
                    </div>

                    {/* List */}
                    {todos.length === 0 ? (
                        <div className="tw-empty">
                            <span className="tw-empty__icon"><Check size={14} /></span>
                            <p>Nothing here yet. Click "Sync from captures" or add an item.</p>
                        </div>
                    ) : (
                        (['high', 'medium', 'low'] as TodoItem['priority'][]).map(pri => {
                            const bucket = todos.filter(t => t.priority === pri);
                            if (bucket.length === 0) return null;
                            return (
                                <div key={pri} className={`tw-today__group tw-today__group--${pri}`}>
                                    <h4 className="tw-today__group-title">
                                        {pri === 'high' ? <Flame size={14} aria-hidden /> : pri === 'medium' ? <Zap size={14} aria-hidden /> : <MessageCircle size={14} aria-hidden />} {pri.toUpperCase()}
                                        <span className="tw-today__group-count">{bucket.filter(t => !t.done).length}/{bucket.length}</span>
                                    </h4>
                                    {bucket.map(t => (
                                        <div key={t.id} className={`tw-todo ${t.done ? 'tw-todo--done' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={t.done}
                                                onChange={() => toggleTodo(t.id)}
                                                className="tw-todo__checkbox"
                                                aria-label={t.done ? `Mark "${t.text}" not done` : `Mark "${t.text}" done`}
                                            />
                                            <span className="tw-todo__text">{t.text}</span>
                                            {t.sourceCaptureId && (
                                                <span className="tw-todo__source" title="From a capture"><Pencil size={14} /></span>
                                            )}
                                            <button
                                                className="tw-delete-btn"
                                                onClick={() => deleteTodo(t.id)}
                                                title="Delete to-do"
                                                aria-label="Delete to-do"
                                            >
                                                <Trash2 size={14} aria-hidden />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ─── REPORTS TAB ─── */}
            {activeTab === 'reports' && (
                <div className="tw-reports">
                    <div className="tw-reports__header">
                        <h3 className="tw-section-title">Reports &amp; Insights</h3>
                        <div className="tw-reports__actions">
                            <button
                                className="tw-reports__gen-btn"
                                onClick={() => runGenerate()}
                                disabled={generating || mergedCaptures.length === 0}
                                aria-busy={generating}
                                title="Draft today's report, refresh to-dos, roll up the week, and surface insights"
                            >
                                {generating ? <><Hourglass size={14} aria-hidden /> Generating…</> : <><Sparkles size={14} aria-hidden /> Generate now</>}
                            </button>
                            <button
                                className="tw-reports__handoff-btn"
                                onClick={handleDigestToAra}
                                disabled={mergedCaptures.length === 0}
                                title="Send a digest of recent captures + insights to ARA as context"
                            >
                                → ARA context
                            </button>
                            {(reports.dailyReports.length + reports.weeklySummaries.length + reports.insights.length) > 0 && (
                                <button className="tw-reports__clear-btn" onClick={handleClearReports} disabled={generating}>
                                    Clear reports
                                </button>
                            )}
                        </div>
                    </div>

                    {genMsg && (
                        <p className="tw-reports__msg" role="status" aria-live="polite">{genMsg}</p>
                    )}
                    {handoffMsg && (
                        <p className="tw-reports__msg" role="status" aria-live="polite">{handoffMsg}</p>
                    )}
                    {!llmReady && (
                        <p className="tw-reports__hint" role="note">
                            Add an LLM key in Settings → API Keys for richer reports and non-obvious insights. Without
                            it, reports use a built-in heuristic and the insights pass stays empty.
                        </p>
                    )}

                    {(reports.dailyReports.length + reports.weeklySummaries.length + reports.insights.length) === 0 ? (
                        <div className="tw-empty">
                            <span className="tw-empty__icon"><TrendingUp size={14} /></span>
                            <p>
                                {mergedCaptures.length === 0
                                    ? 'Capture a few thoughts first, then come back to generate a report.'
                                    : 'No reports yet. Click "Generate now" to draft today\'s report and surface insights.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Non-obvious insights */}
                            {reports.insights.length > 0 && (
                                <section className="tw-reports__section" aria-label="Insights">
                                    <h4 className="tw-reports__section-title"><Lightbulb size={14} aria-hidden /> Insights</h4>
                                    {reports.insights.map(i => (
                                        <div key={i.id} className={`tw-insight tw-insight--${i.kind}`}>
                                            <span className="tw-insight__kind">{i.kind}</span>
                                            <span className="tw-insight__text">{i.text}</span>
                                            <div className="tw-insight__actions">
                                                <button
                                                    className="tw-insight__action"
                                                    onClick={() => handleInsightToAra(i)}
                                                    title="Discuss this insight with ARA"
                                                    aria-label="Send insight to ARA"
                                                >
                                                    → ARA
                                                </button>
                                                <button
                                                    className="tw-insight__action"
                                                    onClick={() => handleInsightToHoncho(i)}
                                                    title="Save this insight to Honcho memory"
                                                    aria-label="Save insight to Honcho memory"
                                                >
                                                    <Brain size={12} aria-hidden /> Honcho
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </section>
                            )}

                            {/* Daily reports */}
                            {reports.dailyReports.length > 0 && (
                                <section className="tw-reports__section" aria-label="Daily reports">
                                    <h4 className="tw-reports__section-title"><Calendar size={14} aria-hidden /> Daily Reports</h4>
                                    {reports.dailyReports.map(r => (
                                        <article key={r.id} className="tw-report-card">
                                            <header className="tw-report-card__head">
                                                <span className="tw-report-card__date">{r.date}</span>
                                                <span className="tw-report-card__count">{r.captureCount} capture{r.captureCount === 1 ? '' : 's'}</span>
                                            </header>
                                            <p className="tw-report-card__body">{r.summary}</p>
                                        </article>
                                    ))}
                                </section>
                            )}

                            {/* Weekly summaries */}
                            {reports.weeklySummaries.length > 0 && (
                                <section className="tw-reports__section" aria-label="Weekly summaries">
                                    <h4 className="tw-reports__section-title"><Calendar size={14} aria-hidden /> Weekly Summaries</h4>
                                    {reports.weeklySummaries.map(w => (
                                        <article key={w.id} className="tw-report-card">
                                            <header className="tw-report-card__head">
                                                <span className="tw-report-card__date">Week of {w.weekStart}</span>
                                                <span className="tw-report-card__count">{w.captureCount} capture{w.captureCount === 1 ? '' : 's'}</span>
                                            </header>
                                            <p className="tw-report-card__body">{w.summary}</p>
                                        </article>
                                    ))}
                                </section>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ─── DASHBOARD TAB ─── */}
            {activeTab === 'dashboard' && (
                <div className="tw-dashboard">
                    {/* Stats bar */}
                    {effectiveStats && (
                        <div className="tw-stats-bar">
                            {([
                                { icon: Brain, label: 'Captures', value: effectiveStats.totalCaptures, color: twCatText('var(--accent)') },
                                { icon: Download, label: 'To Review', value: effectiveStats.pendingReviews, color: twCatText('var(--danger)'), highlight: effectiveStats.pendingReviews > 0 },
                                { icon: User, label: 'People', value: effectiveStats.activePeople, color: twCatText('var(--accent)') },
                                { icon: Folder, label: 'Active', value: effectiveStats.activeProjects, color: twCatText('var(--danger)') },
                                { icon: Lightbulb, label: 'Ideas', value: effectiveStats.totalIdeas, color: twCatText('var(--warning)') },
                                { icon: ClipboardList, label: 'Due', value: effectiveStats.tasksDue, color: twCatText('var(--success)'), highlight: effectiveStats.tasksDue > 0 },
                            ] as { icon: LucideIcon; label: string; value: number; color: string; highlight?: boolean }[]).map(s => {
                                const StatIcon = s.icon;
                                return (
                                <div key={s.label} className={`tw-stat-card ${s.highlight ? 'tw-stat-card--highlight' : ''}`}>
                                    <span className="tw-stat-card__icon"><StatIcon size={16} aria-hidden /></span>
                                    <span className="tw-stat-card__value" style={{ color: s.color }}>{s.value}</span>
                                    <span className="tw-stat-card__label">{s.label}</span>
                                </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Bucket filter */}
                    <div className="tw-bucket-filter">
                        <button className={`tw-bucket-pill ${activeBucket === 'all' ? 'tw-bucket-pill--active' : ''}`} onClick={() => setActiveBucket('all')}>
                            All
                        </button>
                        {BUCKETS.map(b => {
                            const BIcon = b.icon;
                            return (
                            <button key={b.id} className={`tw-bucket-pill ${activeBucket === b.id ? 'tw-bucket-pill--active' : ''}`}
                                style={activeBucket === b.id ? { background: b.color + '22', color: b.color, borderColor: b.color } : {}}
                                onClick={() => setActiveBucket(b.id)}>
                                <BIcon size={14} aria-hidden /> {b.label}
                                <span className="tw-bucket-pill__count">{effectiveBuckets[b.id].length}</span>
                            </button>
                            );
                        })}
                    </div>

                    {/* Items list */}
                    <div className="tw-items-list">
                        {allBucketItems.length === 0 ? (
                            <div className="tw-empty"><span className="tw-empty__icon"><Package size={14} /></span><p>No items yet. Capture some thoughts!</p></div>
                        ) : (
                            allBucketItems.map(item => (
                                <div key={item.id} className="tw-item-card" style={{ borderLeftColor: bucketColor(item.type || '') }}>
                                    <div className="tw-item-card__header">
                                        <span className="tw-item-card__icon"><BucketIcon bucket={item.type || ''} /></span>
                                        <span className="tw-item-card__name">{item.name}</span>
                                        {item.status && <span className="tw-item-card__status">{item.status}</span>}
                                    </div>
                                    {(item.notes || item.context || item.one_liner) && (
                                        <p className="tw-item-card__detail">{item.one_liner || item.context || item.notes}</p>
                                    )}
                                    <div className="tw-item-card__footer">
                                        <div className="tw-item-card__tags">
                                            {item.tags?.map(t => <span key={t} className="tw-tag">#{t}</span>)}
                                        </div>
                                        <div className="tw-item-card__actions">
                                            <span className="tw-time">{timeAgo(item.createdAt)}</span>
                                            <button
                                                className="tw-delete-btn"
                                                onClick={() => handleDeleteCapture(item.id, item.notes || item.name)}
                                                title="Delete"
                                                aria-label={`Delete "${(item.notes || item.name || '').length > 60 ? (item.notes || item.name).slice(0, 60) + '…' : (item.notes || item.name)}"`}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ─── TIMELINE TAB ─── */}
            {activeTab === 'timeline' && (
                <div className="tw-timeline">
                    <div className="tw-bucket-filter">
                        <button className={`tw-bucket-pill ${timelineFilter === 'all' ? 'tw-bucket-pill--active' : ''}`} onClick={() => setTimelineFilter('all')}>
                            All
                        </button>
                        {BUCKETS.map(b => {
                            const BIcon = b.icon;
                            return (
                            <button key={b.id} className={`tw-bucket-pill ${timelineFilter === b.id ? 'tw-bucket-pill--active' : ''}`}
                                style={timelineFilter === b.id ? { background: b.color + '22', color: b.color, borderColor: b.color } : {}}
                                onClick={() => setTimelineFilter(b.id)}>
                                <BIcon size={14} aria-hidden /> {b.label}
                            </button>
                            );
                        })}
                    </div>

                    {Object.keys(groupedTimeline).length === 0 ? (
                        <div className="tw-empty"><span className="tw-empty__icon"><Clock size={14} /></span><p>No timeline entries yet.</p></div>
                    ) : (
                        Object.entries(groupedTimeline).map(([group, items]) => (
                            <div key={group} className="tw-timeline-group">
                                <h4 className="tw-timeline-group__title">{group}</h4>
                                <div className="tw-timeline-entries">
                                    {items.map(item => (
                                        <div key={item.id} className="tw-timeline-entry">
                                            <div className="tw-timeline-dot" style={{ background: bucketColor(item.type || '') }} />
                                            <div className="tw-timeline-content">
                                                <div className="tw-timeline-entry__header">
                                                    <span className="tw-badge" style={{ background: bucketColor(item.type || '') + '22', color: bucketColor(item.type || '') }}>
                                                        <BucketIcon bucket={item.type || ''} /> {item.type}
                                                    </span>
                                                    <span className="tw-time">{timeAgo(item.createdAt)}</span>
                                                </div>
                                                <p className="tw-timeline-entry__name">{item.name}</p>
                                                {item.notes && <p className="tw-timeline-entry__notes">{item.notes}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
