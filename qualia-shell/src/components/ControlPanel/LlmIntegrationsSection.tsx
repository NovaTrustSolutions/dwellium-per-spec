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
import type {
    IntegrationsBundle,
    LlmProvider,
    LlmAnthropicConfig,
    LlmOpenAIConfig,
    LlmGeminiConfig,
    LlmLocalConfig,
    LlmCustomConfig,
    SupabaseConfig,
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
                color: '#fbbf24',
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

            {/* Supabase */}
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 20, marginBottom: 8 }}>
                Supabase
            </h4>
            <SupabaseCard bundle={integrations} update={update} />
        </section>
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
