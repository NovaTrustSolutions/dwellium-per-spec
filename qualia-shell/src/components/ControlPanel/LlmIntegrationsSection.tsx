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

import { useState } from 'react';
import { useUser } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { testProvider } from '../../lib/llmClient';
import { API_BASE } from '../../config';
import type {
    IntegrationsBundle,
    LlmProvider,
    LlmAnthropicConfig,
    LlmOpenAIConfig,
    LlmGeminiConfig,
    LlmLocalConfig,
    LlmCustomConfig,
    SupabaseConfig,
    PostgresConfig,
} from '../../types/integrations';
import { DEFAULT_MODELS, PROVIDER_LABELS, maskKey } from '../../types/integrations';

const PROVIDER_ORDER: LlmProvider[] = ['anthropic', 'openai', 'gemini', 'local', 'custom'];

export default function LlmIntegrationsSection() {
    const { user } = useUser();
    const { integrations, update } = useIntegrations();

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
                ⚠️ Keys are stored locally in your browser under your user account ({user.id.slice(0, 8)}…).
                They are visible to anyone with access to this device. Clear via Reset to remove.
            </div>

            {/* Active LLM picker */}
            <div className="cp-field">
                <label className="cp-label">Active LLM Provider</label>
                <select
                    className="cp-select"
                    value={integrations.llm.active || ''}
                    onChange={e => update(b => ({
                        ...b,
                        llm: { ...b.llm, active: (e.target.value || null) as LlmProvider | null },
                    }))}
                >
                    <option value="">— None —</option>
                    {PROVIDER_ORDER.map(p => (
                        <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                    ))}
                </select>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 4 }}>
                    Widgets that need an LLM (ThoughtWeaver, Fact Check, Stella, Hydra, etc.) route through this provider.
                </p>
            </div>

            {/* Anthropic */}
            <AnthropicCard bundle={integrations} update={update} />
            <OpenAICard bundle={integrations} update={update} />
            <GeminiCard bundle={integrations} update={update} />
            <LocalCard bundle={integrations} update={update} />
            <CustomCard bundle={integrations} update={update} />

            {/* P11-9: live web search (the non-Anthropic path) */}
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 20, marginBottom: 8 }}>
                Web Search
            </h4>
            <SearchProvidersCard bundle={integrations} update={update} />

            {/* Database */}
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 20, marginBottom: 8 }}>
                Databases
            </h4>
            <SupabaseCard bundle={integrations} update={update} />
            <PostgresCard bundle={integrations} update={update} />
        </section>
    );
}

// P11-9: Tavily / Brave keys give Web Search a live path that doesn't need
// an Anthropic key (skills.ts cascade: Anthropic → Tavily → Brave → LLM).
function SearchProvidersCard({ bundle, update }: CardProps) {
    const cfg = bundle.search || { active: null as 'tavily' | 'brave' | null };
    const tavily = cfg.tavily || { apiKey: '', enabled: true };
    const brave = cfg.brave || { apiKey: '', enabled: true };
    const set = (patch: Partial<NonNullable<typeof bundle.search>>) => update(b => ({
        ...b,
        search: { active: cfg.active ?? null, tavily, brave, ...patch },
    }));
    return (
        <div className="cp-integration-card" style={{ marginBottom: 12 }}>
            <div className="cp-integration-card__header">
                <span className="cp-integration-card__title">Search Providers (Tavily / Brave)</span>
            </div>
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">Tavily API Key</label>
                <ApiKeyInput value={tavily.apiKey} onChange={v => set({ tavily: { ...tavily, apiKey: v } })} placeholder="tvly-…" />
            </div>
            <div className="cp-field">
                <label className="cp-label">Brave Search API Key</label>
                <ApiKeyInput value={brave.apiKey} onChange={v => set({ brave: { ...brave, apiKey: v } })} placeholder="BSA…" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Used by the Web Search skill when no Anthropic key is configured (or its live search fails). Tavily is tried first.
            </div>
        </div>
    );
}

// ── Card components ─────────────────────────────────────────────────

type Updater = (next: (current: IntegrationsBundle) => IntegrationsBundle) => void;

interface CardProps {
    bundle: IntegrationsBundle;
    update: Updater;
}

function ProviderCardShell({
    title,
    provider,
    enabled,
    onEnabledChange,
    children,
    bundle,
}: {
    title: string;
    provider: LlmProvider;
    enabled: boolean;
    onEnabledChange: (v: boolean) => void;
    children: React.ReactNode;
    bundle: IntegrationsBundle;
}) {
    const [testing, setTesting] = useState(false);
    const [testMsg, setTestMsg] = useState<string | null>(null);
    const test = bundle.tests[provider];

    const handleTest = async () => {
        setTesting(true);
        setTestMsg(null);
        const result = await testProvider(provider, bundle.llm);
        setTesting(false);
        setTestMsg(result.ok ? `✓ ${PROVIDER_LABELS[provider]} responded` : `✗ ${result.error}`);
        // (Test results aren't persisted to the bundle to avoid race with active updates.)
    };

    return (
        <div className="cp-integration-card" style={{ marginBottom: 12 }}>
            <div className="cp-integration-card__header">
                <span className="cp-integration-card__title">{title}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e => onEnabledChange(e.target.checked)}
                    />
                    Enabled
                </label>
            </div>
            {children}
            <div className="cp-actions" style={{ marginTop: 8 }}>
                <button className="cp-btn" onClick={handleTest} disabled={testing || !enabled}>
                    {testing ? 'Testing…' : 'Test Connection'}
                </button>
                {testMsg && (
                    <span style={{
                        fontSize: 11,
                        color: testMsg.startsWith('✓') ? '#22c55e' : '#ef4444',
                        marginLeft: 8,
                        alignSelf: 'center',
                    }}>{testMsg}</span>
                )}
                {test && !testMsg && (
                    <span style={{ fontSize: 11, color: test.ok ? '#22c55e' : '#ef4444', marginLeft: 8, alignSelf: 'center' }}>
                        {test.ok ? '✓ Last tested' : `✗ ${test.error}`} {new Date(test.testedAt).toLocaleTimeString()}
                    </span>
                )}
            </div>
        </div>
    );
}

function ApiKeyInput({
    value,
    onChange,
    placeholder = 'sk-…',
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    const [reveal, setReveal] = useState(false);
    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
                className="cp-input"
                type={reveal ? 'text' : 'password'}
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{ flex: 1, fontFamily: reveal ? 'inherit' : 'monospace' }}
                autoComplete="off"
                spellCheck={false}
            />
            <button
                type="button"
                className="cp-btn cp-btn--subtle"
                onClick={() => setReveal(r => !r)}
                title={reveal ? 'Hide' : 'Reveal'}
                style={{ fontSize: 11, padding: '4px 8px' }}
            >
                {reveal ? '🙈' : '👁'}
            </button>
            {!reveal && value && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                    {maskKey(value)}
                </span>
            )}
        </div>
    );
}

function AnthropicCard({ bundle, update }: CardProps) {
    const cfg: LlmAnthropicConfig = bundle.llm.anthropic || { apiKey: '', model: DEFAULT_MODELS.anthropic, enabled: false };
    const setField = (patch: Partial<LlmAnthropicConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, anthropic: { ...cfg, ...patch } },
    }));
    return (
        <ProviderCardShell
            title="Anthropic"
            provider="anthropic"
            enabled={cfg.enabled}
            onEnabledChange={v => setField({ enabled: v })}
            bundle={bundle}
        >
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">API Key</label>
                <ApiKeyInput value={cfg.apiKey} onChange={v => setField({ apiKey: v })} placeholder="sk-ant-…" />
            </div>
            <div className="cp-field">
                <label className="cp-label">Model</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.model}
                    onChange={e => setField({ model: e.target.value })}
                    placeholder={DEFAULT_MODELS.anthropic}
                />
            </div>
        </ProviderCardShell>
    );
}

function OpenAICard({ bundle, update }: CardProps) {
    const cfg: LlmOpenAIConfig = bundle.llm.openai || { apiKey: '', model: DEFAULT_MODELS.openai, enabled: false };
    const setField = (patch: Partial<LlmOpenAIConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, openai: { ...cfg, ...patch } },
    }));
    return (
        <ProviderCardShell
            title="OpenAI"
            provider="openai"
            enabled={cfg.enabled}
            onEnabledChange={v => setField({ enabled: v })}
            bundle={bundle}
        >
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">API Key</label>
                <ApiKeyInput value={cfg.apiKey} onChange={v => setField({ apiKey: v })} placeholder="sk-…" />
            </div>
            <div className="cp-field">
                <label className="cp-label">Model</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.model}
                    onChange={e => setField({ model: e.target.value })}
                    placeholder={DEFAULT_MODELS.openai}
                />
            </div>
        </ProviderCardShell>
    );
}

function GeminiCard({ bundle, update }: CardProps) {
    const cfg: LlmGeminiConfig = bundle.llm.gemini || { apiKey: '', model: DEFAULT_MODELS.gemini, enabled: false };
    const setField = (patch: Partial<LlmGeminiConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, gemini: { ...cfg, ...patch } },
    }));
    return (
        <ProviderCardShell
            title="Google Gemini"
            provider="gemini"
            enabled={cfg.enabled}
            onEnabledChange={v => setField({ enabled: v })}
            bundle={bundle}
        >
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">API Key</label>
                <ApiKeyInput value={cfg.apiKey} onChange={v => setField({ apiKey: v })} placeholder="AIza…" />
            </div>
            <div className="cp-field">
                <label className="cp-label">Model</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.model}
                    onChange={e => setField({ model: e.target.value })}
                    placeholder={DEFAULT_MODELS.gemini}
                />
            </div>
        </ProviderCardShell>
    );
}

function LocalCard({ bundle, update }: CardProps) {
    const cfg: LlmLocalConfig = bundle.llm.local || { baseUrl: 'http://localhost:11434', model: DEFAULT_MODELS.local, enabled: false };
    const setField = (patch: Partial<LlmLocalConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, local: { ...cfg, ...patch } },
    }));
    return (
        <ProviderCardShell
            title="Local LLM (Ollama, LM Studio)"
            provider="local"
            enabled={cfg.enabled}
            onEnabledChange={v => setField({ enabled: v })}
            bundle={bundle}
        >
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">Base URL</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.baseUrl}
                    onChange={e => setField({ baseUrl: e.target.value })}
                    placeholder="http://localhost:11434"
                />
            </div>
            <div className="cp-field">
                <label className="cp-label">Model</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.model}
                    onChange={e => setField({ model: e.target.value })}
                    placeholder={DEFAULT_MODELS.local}
                />
            </div>
        </ProviderCardShell>
    );
}

function CustomCard({ bundle, update }: CardProps) {
    const cfg: LlmCustomConfig = bundle.llm.custom || { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: '', enabled: false };
    const setField = (patch: Partial<LlmCustomConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, custom: { ...cfg, ...patch } },
    }));
    return (
        <ProviderCardShell
            title="Custom (OpenRouter, Together, Anyscale, etc.)"
            provider="custom"
            enabled={cfg.enabled}
            onEnabledChange={v => setField({ enabled: v })}
            bundle={bundle}
        >
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">Provider Name</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.name}
                    onChange={e => setField({ name: e.target.value })}
                    placeholder="OpenRouter"
                />
            </div>
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">Base URL</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.baseUrl}
                    onChange={e => setField({ baseUrl: e.target.value })}
                    placeholder="https://openrouter.ai/api/v1"
                />
            </div>
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">API Key</label>
                <ApiKeyInput value={cfg.apiKey} onChange={v => setField({ apiKey: v })} placeholder="sk-or-…" />
            </div>
            <div className="cp-field">
                <label className="cp-label">Model</label>
                <input
                    className="cp-input"
                    type="text"
                    value={cfg.model}
                    onChange={e => setField({ model: e.target.value })}
                    placeholder="anthropic/claude-3-5-sonnet"
                />
            </div>
        </ProviderCardShell>
    );
}

function SupabaseCard({ bundle, update }: CardProps) {
    const cfg: SupabaseConfig = bundle.supabase || { url: '', anonKey: '', enabled: false };
    const setField = (patch: Partial<SupabaseConfig>) => update(b => ({
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
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label">Anon Key (public)</label>
                <ApiKeyInput value={cfg.anonKey} onChange={v => setField({ anonKey: v })} placeholder="eyJ…" />
            </div>
            <div className="cp-field">
                <label className="cp-label">Service Key (optional, server-side admin)</label>
                <ApiKeyInput value={cfg.serviceKey || ''} onChange={v => setField({ serviceKey: v })} placeholder="eyJ…" />
            </div>
        </div>
    );
}

function PostgresCard({ bundle, update }: CardProps) {
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

    const [mode, setMode] = useState<'string' | 'fields'>(cfg.connectionString ? 'string' : 'fields');
    const [testing, setTesting] = useState(false);
    const [testMsg, setTestMsg] = useState<string | null>(null);

    const handleTest = async () => {
        setTesting(true);
        setTestMsg(null);
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
                setTestMsg('✗ Backend route /api/integrations/test-postgres not implemented yet. Config saved; test wiring is backend work.');
                return;
            }
            const json = await res.json().catch(() => ({}));
            if (res.ok && json?.success) {
                setTestMsg(`✓ Connected${json.version ? ` (${json.version})` : ''}`);
            } else {
                setTestMsg(`✗ ${json?.error || `HTTP ${res.status}`}`);
            }
        } catch (e: any) {
            setTestMsg(`✗ Network error: ${e?.message || 'unreachable'}`);
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
                <div className="cp-field" style={{ marginBottom: 8 }}>
                    <label className="cp-label">Connection String</label>
                    <ApiKeyInput
                        value={cfg.connectionString || ''}
                        onChange={v => setField({ connectionString: v })}
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
                    <div className="cp-field" style={{ marginBottom: 8 }}>
                        <label className="cp-label">Password</label>
                        <ApiKeyInput
                            value={cfg.password || ''}
                            onChange={v => setField({ password: v })}
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
                        color: testMsg.startsWith('✓') ? '#22c55e' : '#ef4444',
                        marginLeft: 8,
                        alignSelf: 'center',
                        lineHeight: 1.4,
                    }}>{testMsg}</span>
                )}
            </div>
        </div>
    );
}
