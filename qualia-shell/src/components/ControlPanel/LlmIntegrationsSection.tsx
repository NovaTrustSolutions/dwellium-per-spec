/**
 * LlmIntegrationsSection — per-user LLM + Supabase configuration UI.
 *
 * Rendered as a new section in ControlPanel.tsx. Distinct from the existing
 * "Integrations" section which manages Gmail/Calendar via the backend at
 * /api/integrations. This section manages CLIENT-SIDE configuration:
 *
 *   - LLM providers (Anthropic, OpenAI, Gemini, Local, OpenRouter/Custom)
 *     stored in localStorage namespaced by user.id; consumed by widgets via
 *     the llmClient helper.
 *   - Supabase URL + keys for any frontend code that wants to talk to a
 *     user-supplied Supabase project.
 *
 * Each provider card: enabled toggle, API key (masked input), model name,
 * Test button. The top of the section has an "Active LLM" selector — when
 * multiple providers are configured, the active one is what llmClient routes
 * to first.
 *
 * 2026-05-26 created.
 */

import { useState, useEffect } from 'react';
import { useUser } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { API_BASE } from '../../config';
import ApiKeysPanel from './ApiKeysPanel';
import { ApiKeyField } from './ApiKeyField';
import type {
    IntegrationsBundle,
    SupabaseConfig,
    PostgresConfig,
} from '../../types/integrations';

export default function LlmIntegrationsSection() {
    const { user } = useUser();
    const { integrations, update, removeSecret } = useIntegrations();

    if (!user) {
        return (
            <section className="cp-section">
                <h3 className="cp-section__title">API Keys (Per-User)</h3>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                    Sign in to configure your personal API keys. Each user's keys are stored
                    separately in this browser.
                </p>
            </section>
        );
    }

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">API Keys — {user.name}</h3>

            <div style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.3)',
                color: '#f59e0b',
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 6,
                marginBottom: 12,
                lineHeight: 1.5,
            }}>
                Keys are stored locally in your browser under your user account ({user.id.slice(0, 8)}…).
                They are visible to anyone with access to this device. Clear via Reset to remove.
            </div>

            {/* LLM providers (active picker + 5 write-only key cards) live in
                ApiKeysPanel so the same panel can mount inside a widget. */}
            <ApiKeysPanel />

            {/* P11-9: live web search (the non-Anthropic path) */}
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 20, marginBottom: 8 }}>
                Web Search
            </h4>
            <SearchProvidersCard bundle={integrations} update={update} removeSecret={removeSecret} />

            {/* P11-14: Google (Gmail + Calendar) web OAuth connect */}
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 20, marginBottom: 8 }}>
                Google (Gmail + Calendar)
            </h4>
            <GoogleConnectCard />

            {/* Database */}
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 20, marginBottom: 8 }}>
                Databases
            </h4>
            <SupabaseCard bundle={integrations} update={update} removeSecret={removeSecret} />
            <PostgresCard bundle={integrations} update={update} removeSecret={removeSecret} />
        </section>
    );
}

// P11-14: Google OAuth connect — backend routes exist (/api/google/oauth/*);
// the CREDENTIAL BLOCKER (by design): Ilya drops the OAuth client JSON at
// backend credentials/oauth2-credentials.json, then Connect just works.
function GoogleConnectCard() {
    const [status, setStatus] = useState<{ configured: boolean; connected: boolean; blocker?: string } | null>(null);
    useEffect(() => {
        let alive = true;
        fetch(`${API_BASE}/api/google/oauth/status`)
            .then(r => r.json())
            .then(j => { if (alive && j?.success) setStatus(j.data); })
            .catch(() => { if (alive) setStatus(null); });
        return () => { alive = false; };
    }, []);
    return (
        <div className="cp-integration-card" style={{ marginBottom: 12 }}>
            <div className="cp-integration-card__header">
                <span className="cp-integration-card__title">Google Account</span>
                <span style={{ fontSize: 11, color: status?.connected ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {status === null ? 'backend offline' : status.connected ? 'Connected' : status.configured ? 'Ready to connect' : 'Awaiting credentials'}
                </span>
            </div>
            {status?.configured && !status.connected && (
                <button
                    className="cp-btn"
                    style={{ marginTop: 4 }}
                    onClick={() => window.open(`${API_BASE}/api/google/oauth/start`, '_blank', 'noopener')}
                >Connect Google…</button>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                {status?.blocker
                    ? `Setup: ${status.blocker}`
                    : 'Grants Dwellium Gmail compose/read + Calendar + Drive/Sheets read (the scopes the automation engine already uses).'}
            </div>
        </div>
    );
}

// P11-9: Tavily / Brave keys give Web Search a live path that doesn't need
// an Anthropic key (skills.ts cascade: Anthropic → Tavily → Brave → LLM).
function SearchProvidersCard({ bundle, update, removeSecret }: CardProps) {
    const cfg = bundle.search || { active: null as 'tavily' | 'brave' | null };
    const tavily = cfg.tavily || { apiKey: '', enabled: true };
    const brave = cfg.brave || { apiKey: '', enabled: true };
    const set = (patch: Partial<NonNullable<typeof bundle.search>>) => update(b => ({
        ...b,
        search: { active: cfg.active ?? null, tavily, brave, ...patch },
    }));
    const remove = (patch: Partial<NonNullable<typeof bundle.search>>) => removeSecret(b => ({
        ...b,
        search: { active: cfg.active ?? null, tavily, brave, ...patch },
    }));
    return (
        <div className="cp-integration-card" style={{ marginBottom: 12 }}>
            <div className="cp-integration-card__header">
                <span className="cp-integration-card__title">Search Providers (Tavily / Brave)</span>
            </div>
            <div style={{ marginBottom: 8 }}>
                <ApiKeyField
                    label="Tavily API key"
                    provider="tavily"
                    value={tavily.apiKey}
                    onChange={v => set({ tavily: { ...tavily, apiKey: v } })}
                    onRemove={() => remove({ tavily: { ...tavily, apiKey: '' } })}
                    placeholder="tvly-…"
                />
            </div>
            <div style={{ marginBottom: 8 }}>
                <ApiKeyField
                    label="Brave Search API key"
                    provider="brave"
                    value={brave.apiKey}
                    onChange={v => set({ brave: { ...brave, apiKey: v } })}
                    onRemove={() => remove({ brave: { ...brave, apiKey: '' } })}
                    placeholder="BSA…"
                />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Used by the Web Search skill when no Anthropic key is configured (or its live search fails). Tavily is tried first.
            </div>
        </div>
    );
}

// ── Card components (non-LLM: Search / Supabase / Postgres) ─────────────
// The 5 LLM provider cards moved to ApiKeysPanel. These remaining cards keep
// their existing behavior; their secret inputs now use the write-only
// ApiKeyField (no reveal toggle) and route key-clears through removeSecret.

type Updater = (next: (current: IntegrationsBundle) => IntegrationsBundle) => void;

interface CardProps {
    bundle: IntegrationsBundle;
    update: Updater;
    /** Force-persist a key clear through the anti-clobber guard. */
    removeSecret: Updater;
}

function SupabaseCard({ bundle, update, removeSecret }: CardProps) {
    const cfg: SupabaseConfig = bundle.supabase || { url: '', anonKey: '', enabled: false };
    const setField = (patch: Partial<SupabaseConfig>) => update(b => ({
        ...b,
        supabase: { ...cfg, ...patch },
    }));
    const removeField = (patch: Partial<SupabaseConfig>) => removeSecret(b => ({
        ...b,
        supabase: { ...cfg, ...patch },
    }));
    return (
        <div className="cp-integration-card" style={{ marginBottom: 12 }}>
            <div className="cp-integration-card__header">
                <span className="cp-integration-card__title">Supabase</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={e => setField({ enabled: e.target.checked })}
                    />
                    Enabled
                </label>
            </div>
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">Project URL</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.url}
                    onChange={e => setField({ url: e.target.value })}
                    placeholder="https://xyzproject.supabase.co"
                />
            </div>
            <div style={{ marginBottom: 8 }}>
                <ApiKeyField
                    label="Anon Key (public)"
                    provider="supabase-anon"
                    value={cfg.anonKey}
                    onChange={v => setField({ anonKey: v })}
                    onRemove={() => removeField({ anonKey: '' })}
                    placeholder="eyJ…"
                />
            </div>
            <div style={{ marginBottom: 8 }}>
                <ApiKeyField
                    label="Service Key (optional, server-side admin)"
                    provider="supabase-service"
                    value={cfg.serviceKey || ''}
                    onChange={v => setField({ serviceKey: v })}
                    onRemove={() => removeField({ serviceKey: '' })}
                    placeholder="eyJ…"
                />
            </div>
        </div>
    );
}

function PostgresCard({ bundle, update, removeSecret }: CardProps) {
    const cfg: PostgresConfig = bundle.postgres || {
        connectionString: '',
        host: '',
        port: 5432,
        database: '',
        user: '',
        password: '',
        sslMode: 'require',
        syncEnabled: true,
        enabled: false,
    };
    const setField = (patch: Partial<PostgresConfig>) => update(b => ({
        ...b,
        postgres: { ...cfg, ...patch },
    }));
    const removeField = (patch: Partial<PostgresConfig>) => removeSecret(b => ({
        ...b,
        postgres: { ...cfg, ...patch },
    }));

    const [mode, setMode] = useState<'string' | 'fields'>(cfg.connectionString ? 'string' : 'fields');
    const [testing, setTesting] = useState(false);
    const [testMsg, setTestMsg] = useState<string | null>(null);
    const [testOk, setTestOk] = useState(false);

    const handleTest = async () => {
        setTesting(true);
        setTestMsg(null);
        setTestOk(false);
        // Browser can't speak Postgres wire protocol directly. We POST to a
        // backend route that runs the connection on our behalf. If the route
        // doesn't exist yet (404), surface that clearly so the user knows
        // the test is awaiting backend wiring.
        try {
            const payload: any = mode === 'string'
                ? { connectionString: cfg.connectionString }
                : {
                    host: cfg.host,
                    port: cfg.port,
                    database: cfg.database,
                    user: cfg.user,
                    password: cfg.password,
                    sslMode: cfg.sslMode,
                };
            const res = await fetch(`${API_BASE}/api/integrations/test-postgres`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.status === 404) {
                setTestMsg('Backend route /api/integrations/test-postgres not implemented yet. Config saved; test wiring is backend work.');
                return;
            }
            const json = await res.json().catch(() => ({}));
            if (res.ok && json?.success) {
                setTestMsg(`Connected${json.version ? ` (${json.version})` : ''}`);
                setTestOk(true);
            } else {
                setTestMsg(`${json?.error || `HTTP ${res.status}`}`);
            }
        } catch (e: any) {
            setTestMsg(`Network error: ${e?.message || 'unreachable'}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="cp-integration-card" style={{ marginBottom: 12 }}>
            <div className="cp-integration-card__header">
                <span className="cp-integration-card__title">Postgres (shared cloud DB)</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={e => setField({ enabled: e.target.checked })}
                    />
                    Enabled
                </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button
                    type="button"
                    className={`cp-btn ${mode === 'string' ? '' : 'cp-btn--subtle'}`}
                    onClick={() => setMode('string')}
                    style={{ fontSize: 12 }}
                >Connection String</button>
                <button
                    type="button"
                    className={`cp-btn ${mode === 'fields' ? '' : 'cp-btn--subtle'}`}
                    onClick={() => setMode('fields')}
                    style={{ fontSize: 12 }}
                >Discrete Fields</button>
            </div>

            {mode === 'string' ? (
                <div style={{ marginBottom: 8 }}>
                    <ApiKeyField
                        label="Connection String"
                        provider="postgres-conn"
                        value={cfg.connectionString || ''}
                        onChange={v => setField({ connectionString: v })}
                        onRemove={() => removeField({ connectionString: '' })}
                        placeholder="postgres://user:pass@host:5432/db?sslmode=require"
                    />
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <div className="cp-field" style={{ flex: 2 }}>
                            <label className="cp-label">Host</label>
                            <input
                                className="cp-input"
                                type="text"
                                value={cfg.host || ''}
                                onChange={e => setField({ host: e.target.value })}
                                placeholder="db.example.com"
                            />
                        </div>
                        <div className="cp-field" style={{ flex: 1 }}>
                            <label className="cp-label">Port</label>
                            <input
                                className="cp-input"
                                type="number"
                                value={cfg.port || 5432}
                                onChange={e => setField({ port: parseInt(e.target.value, 10) || 5432 })}
                                placeholder="5432"
                            />
                        </div>
                    </div>
                    <div className="cp-field" style={{ marginBottom: 8 }}>
                        <label className="cp-label">Database</label>
                        <input
                            className="cp-input"
                            type="text"
                            value={cfg.database || ''}
                            onChange={e => setField({ database: e.target.value })}
                            placeholder="dwellium"
                        />
                    </div>
                    <div className="cp-field" style={{ marginBottom: 8 }}>
                        <label className="cp-label">User</label>
                        <input
                            className="cp-input"
                            type="text"
                            value={cfg.user || ''}
                            onChange={e => setField({ user: e.target.value })}
                            placeholder="postgres"
                            autoComplete="off"
                        />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <ApiKeyField
                            label="Password"
                            provider="postgres-password"
                            value={cfg.password || ''}
                            onChange={v => setField({ password: v })}
                            onRemove={() => removeField({ password: '' })}
                            placeholder="••••••••"
                        />
                    </div>
                    <div className="cp-field" style={{ marginBottom: 8 }}>
                        <label className="cp-label">SSL Mode</label>
                        <select
                            className="cp-select"
                            value={cfg.sslMode || 'require'}
                            onChange={e => setField({ sslMode: e.target.value as PostgresConfig['sslMode'] })}
                        >
                            <option value="disable">disable</option>
                            <option value="require">require (recommended)</option>
                            <option value="verify-ca">verify-ca</option>
                            <option value="verify-full">verify-full</option>
                        </select>
                    </div>
                </>
            )}

            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <input
                        type="checkbox"
                        checked={cfg.syncEnabled ?? true}
                        onChange={e => setField({ syncEnabled: e.target.checked })}
                    />
                    Sync between Electron app and web version
                </label>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Both clients read/write the same cloud Postgres. Disable if you want client-local-only storage in Electron.
                </p>
            </div>

            <div className="cp-actions" style={{ marginTop: 4 }}>
                <button
                    className="cp-btn"
                    onClick={handleTest}
                    disabled={testing || !cfg.enabled || (mode === 'string' ? !cfg.connectionString : !cfg.host)}
                >
                    {testing ? 'Testing…' : 'Test Connection'}
                </button>
                {testMsg && (
                    <span style={{
                        fontSize: 11,
                        color: testOk ? '#22c55e' : '#ef4444',
                        marginLeft: 8,
                        alignSelf: 'center',
                        lineHeight: 1.4,
                    }}>{testMsg}</span>
                )}
            </div>
        </div>
    );
}
