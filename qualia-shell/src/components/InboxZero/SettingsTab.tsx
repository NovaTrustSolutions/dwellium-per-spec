/**
 * SettingsTab — Inbox Zero's Settings tab, extracted from InboxZero.tsx at
 * plan 066 §6c with NO behavior change. Fully self-contained: reads its own
 * useUser()/useTheme()/useQueryClient() rather than taking them as props,
 * since those are context reads (same instances InboxZero itself reads) and
 * nothing here is shared with another tab. G4 is unanswered — this is a file
 * extraction only, not a move to Control Panel.
 *
 * InboxZero mounts <SettingsTab /> on the first visit to the tab and then only
 * hides it, so unsaved edits (settingsDirty) survive a tab switch exactly as
 * before the extraction. The tab-triggered fetch effects this replaces were
 * keyed on `activeTab === 'settings'`; they are mount effects here, so Legal
 * Shield health and the permissions user list load once per widget session
 * instead of on every revisit.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Bot, Brain, Building2, Check, ClipboardList, Cloud, FileText, Folder, FolderOpen,
    FolderTree, LayoutDashboard, LayoutGrid, ListChecks, Lock, Mail, Mic, Palette,
    RefreshCw, Ruler, Save, Scale, Search, Settings as SettingsIcon, ShieldCheck,
    Sparkles, Square, SquareCheck, Terminal, TriangleAlert, Type, Workflow, X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme, FONT_PAIRINGS } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { API_BASE, SECURITY_API } from '../../config/api';
import { Theme } from '../../data/types';
import type {
    AgentSettings, LlmSafetyEvent, LlmSafetyStats, SecurityStatusSnapshot,
} from './InboxZeroTypes';
import { useSettings as useSettingsQuery, inboxKeys } from './useInboxQueries';

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

export default function SettingsTab() {
    const { theme: currentTheme, setTheme, fontPairing: currentFont, setFontPairing, animationsEnabled, setAnimationsEnabled } = useTheme();
    const queryClient = useQueryClient();
    const { role: currentUserRole, token: authToken, authFetch, hasMinRole } = useUser();
    const isGod = currentUserRole === 'god';
    const canViewLlmSafetyAudit = isGod || hasMinRole('management');

    // Settings state
    const [settings, setSettings] = useState<AgentSettings | null>(null);
    const [settingsDirty, setSettingsDirty] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Permissions admin state (god only)
    const [permUsers, setPermUsers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
    const [permSelectedUser, setPermSelectedUser] = useState<string>('');
    const [permMap, setPermMap] = useState<Record<string, boolean>>({});
    const [permLoading, setPermLoading] = useState(false);
    const [permSaving, setPermSaving] = useState(false);
    const [permSaveMsg, setPermSaveMsg] = useState('');

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

    // Ref to prevent re-fetching the user list on every render — reset is
    // implicit on unmount now (the LLM safety fetch has no such ref; its own
    // effect below is keyed on canViewLlmSafetyAudit/authToken already).
    const permUsersLoadedRef = useRef(false);

    const settingsQuery = useSettingsQuery(authFetch, true);

    // Sync settings from RQ into local state (needed for dirty tracking + save)
    useEffect(() => {
        if (settingsQuery.data && !settingsDirty) {
            setSettings(settingsQuery.data);
        }
    }, [settingsQuery.data, settingsDirty]);

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

    // Legal Shield health + user list for permissions panel — fetched once on mount
    // (this tab only mounts while active, so "once per tab visit" == "once on mount").
    useEffect(() => {
        if (!legalShieldLoadedRef.current && authToken) {
            legalShieldLoadedRef.current = true;
            fetchLegalShieldHealth();
        }

        if (isGod && !permUsersLoadedRef.current && authToken) {
            permUsersLoadedRef.current = true;
            authFetch(`${API_BASE}/api/auth/users`, {
                headers: { Authorization: `Bearer ${authToken}` },
            })
                .then(r => r.ok ? r.json() : [])
                .then(data => { if (Array.isArray(data)) setPermUsers(data); })
                .catch(() => { /* ignore */ });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGod, authToken]);

    // LLM Safety Audit — separate so filter changes don't re-trigger the effect above.
    useEffect(() => {
        if (!canViewLlmSafetyAudit || !authToken) return;
        fetchLlmSafetyAudit();
    }, [canViewLlmSafetyAudit, authToken, fetchLlmSafetyAudit]);

    return (
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
                                        background: legalShieldHealth.healthy ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)',
                                        border: `1px solid ${legalShieldHealth.healthy ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`,
                                        borderRadius: '8px',
                                    }}>
                                        <span style={{ fontSize: '20px', display: 'inline-flex' }}>{legalShieldHealth.healthy ? <Check size={20} aria-hidden /> : <TriangleAlert size={20} aria-hidden />}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, color: legalShieldHealth.healthy ? 'var(--success)' : 'var(--danger)' }}>
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
                                        <div style={{ padding: '10px 14px', background: 'var(--bg-surface-elevated)', borderRadius: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{legalShieldHealth.totalRecords.toLocaleString()}</div>
                                            <div style={{ fontSize: '11px', opacity: 0.6 }}>Records</div>
                                        </div>
                                        <div style={{ padding: '10px 14px', background: 'var(--bg-surface-elevated)', borderRadius: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{legalShieldHealth.volumes}</div>
                                            <div style={{ fontSize: '11px', opacity: 0.6 }}>Volumes</div>
                                        </div>
                                        <div style={{ padding: '10px 14px', background: 'var(--bg-surface-elevated)', borderRadius: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{legalShieldHealth.indices}</div>
                                            <div style={{ fontSize: '11px', opacity: 0.6 }}>Indices</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {legalShieldHealth.checks.map((c, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                                                padding: '6px 10px', background: 'var(--bg-surface-elevated)', borderRadius: '6px',
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
                            <label className="iz-settings__label iz-settings__label--toggle" htmlFor="iz-toggle-animations" aria-label="Enable Animations">
                                <div>
                                    <span className="iz-settings__name">Enable Animations</span>
                                    <span className="iz-settings__hint">Toggle all micro-interactions, transitions, and scroll effects. Respects system prefers-reduced-motion.</span>
                                </div>
                                <button
                                    type="button"
                                    id="iz-toggle-animations"
                                    role="switch"
                                    aria-checked={animationsEnabled}
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
                                                { key: 'widget:control-panel', icon: SettingsIcon, label: 'Settings' },
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
                            <label className="iz-settings__label iz-settings__label--toggle" htmlFor="iz-toggle-gmail-fetcher" aria-label="Gmail Fetcher">
                                <div>
                                    <span className="iz-settings__name">Gmail Fetcher</span>
                                    <span className="iz-settings__hint">Automatically poll for new unread emails</span>
                                </div>
                                <button
                                    type="button"
                                    id="iz-toggle-gmail-fetcher"
                                    role="switch"
                                    aria-checked={settings.gmailFetcherEnabled}
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
                            <label className="iz-settings__label iz-settings__label--toggle" htmlFor="iz-toggle-trello" aria-label="Trello Integration">
                                <div>
                                    <span className="iz-settings__name">Trello Integration</span>
                                    <span className="iz-settings__hint">Create Trello cards for triaged items</span>
                                </div>
                                <button
                                    type="button"
                                    id="iz-toggle-trello"
                                    role="switch"
                                    aria-checked={settings.trelloEnabled}
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
                            <label className="iz-settings__label iz-settings__label--toggle" htmlFor="iz-toggle-gdrive" aria-label="Google Drive Sync">
                                <div>
                                    <span className="iz-settings__name">Google Drive Sync</span>
                                    <span className="iz-settings__hint">Enable Google Drive file sharing in triage</span>
                                </div>
                                <button
                                    type="button"
                                    id="iz-toggle-gdrive"
                                    role="switch"
                                    aria-checked={settings.googleDriveEnabled}
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
                            <label className="iz-settings__label iz-settings__label--toggle" htmlFor="iz-toggle-entity-guardian" aria-label="Entity Guardian">
                                <div>
                                    <span className="iz-settings__name">Entity Guardian</span>
                                    <span className="iz-settings__hint">Pre-upload file scanning and validation</span>
                                </div>
                                <button
                                    type="button"
                                    id="iz-toggle-entity-guardian"
                                    role="switch"
                                    aria-checked={settings.entityGuardianEnabled}
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
                                            className="iz-safety__select" aria-label="Filter by severity"
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
    );
}
