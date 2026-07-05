/**
 * ApiKeysPanel — self-contained, prop-less panel of the 5 LLM provider cards
 * (Anthropic / OpenAI / Gemini / Local / Custom).
 *
 * Extracted from LlmIntegrationsSection so it can mount standalone inside a
 * widget: it calls `useIntegrations()` itself and renders each provider via the
 * write-only `ApiKeyField` plus the existing enabled-toggle / model field /
 * Test-Connection logic. No reveal toggle anywhere — keys are write-only.
 *
 * Mount it directly:  import ApiKeysPanel from '../ControlPanel/ApiKeysPanel';
 *                     <ApiKeysPanel />
 *
 * Styling reuses the existing `cp-*` ControlPanel classes (fey palette via
 * --accent acid-lime + --font-primary). Test/usage behavior is preserved
 * byte-for-byte from the original section.
 *
 * 2026-06-15 created.
 */

import * as React from 'react';
import { useState } from 'react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { testProvider, listModels } from '../../lib/llmClient';
import { ApiKeyField } from './ApiKeyField';
import ModelSelect from './ModelSelect';
import type {
    IntegrationsBundle,
    LlmProvider,
    LlmAnthropicConfig,
    LlmOpenAIConfig,
    LlmGeminiConfig,
    LlmLocalConfig,
    LlmCustomConfig,
    RecallConfig,
    AnamConfig,
} from '../../types/integrations';
import { DEFAULT_MODELS, PROVIDER_LABELS, CURATED_MODELS } from '../../types/integrations';

const PROVIDER_ORDER: LlmProvider[] = ['anthropic', 'openai', 'gemini', 'local', 'custom'];

type Updater = (next: (current: IntegrationsBundle) => IntegrationsBundle) => void;

interface CardProps {
    bundle: IntegrationsBundle;
    update: Updater;
    removeSecret: Updater;
}

export default function ApiKeysPanel(): React.JSX.Element {
    const { integrations, update, removeSecret } = useIntegrations();
    const activeId = React.useId();

    return (
        <div className="cp-apikeys-panel">
            {/* Active LLM picker */}
            <div className="cp-field" style={{ marginBottom: 12 }}>
                <label className="cp-label" htmlFor={activeId}>Active LLM Provider</label>
                <select
                    id={activeId}
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

            <AnthropicCard bundle={integrations} update={update} removeSecret={removeSecret} />
            <OpenAICard bundle={integrations} update={update} removeSecret={removeSecret} />
            <GeminiCard bundle={integrations} update={update} removeSecret={removeSecret} />
            <LocalCard bundle={integrations} update={update} removeSecret={removeSecret} />
            <CustomCard bundle={integrations} update={update} removeSecret={removeSecret} />

            {/* Meeting-bot platform — powers ARA's meeting note-taker. Not an
                LLM provider, so it has its own simple card (no Test-Connection,
                no Active-LLM coupling). */}
            <RecallCard bundle={integrations} update={update} removeSecret={removeSecret} />

            {/* Plan 041 — Anam Avatar Engine. Not an LLM provider; same simple
                shape as RecallCard (single secret, no model, no Test-Connection —
                testing would mean minting a real session token). */}
            <AnamCard bundle={integrations} update={update} removeSecret={removeSecret} />
        </div>
    );
}

// ── Provider card shell (enabled toggle + Test Connection) ──────────────

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
    const [testOk, setTestOk] = useState(false);
    const test = bundle.tests[provider];

    const handleTest = async () => {
        setTesting(true);
        setTestMsg(null);
        const result = await testProvider(provider, bundle.llm);
        setTesting(false);
        setTestMsg(result.ok ? `${PROVIDER_LABELS[provider]} responded` : `${result.error}`);
        setTestOk(result.ok);
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
                        color: testOk ? '#22c55e' : '#ef4444',
                        marginLeft: 8,
                        alignSelf: 'center',
                    }}>{testMsg}</span>
                )}
                {test && !testMsg && (
                    <span style={{ fontSize: 11, color: test.ok ? '#22c55e' : '#ef4444', marginLeft: 8, alignSelf: 'center' }}>
                        {test.ok ? 'Last tested' : `${test.error}`} {new Date(test.testedAt).toLocaleTimeString()}
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Per-provider cards ──────────────────────────────────────────────────

function AnthropicCard({ bundle, update, removeSecret }: CardProps) {
    const cfg: LlmAnthropicConfig = bundle.llm.anthropic || { apiKey: '', model: DEFAULT_MODELS.anthropic, enabled: false };
    const setField = (patch: Partial<LlmAnthropicConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, anthropic: { ...cfg, ...patch } },
    }));
    const removeKey = () => removeSecret(b => ({
        ...b,
        llm: { ...b.llm, anthropic: { ...cfg, apiKey: '' } },
    }));
    return (
        <ProviderCardShell
            title="Anthropic"
            provider="anthropic"
            enabled={cfg.enabled}
            onEnabledChange={v => setField({ enabled: v })}
            bundle={bundle}
        >
            <div style={{ marginBottom: 8 }}>
                <ApiKeyField
                    label="API key"
                    provider="anthropic"
                    value={cfg.apiKey}
                    onChange={v => setField({ apiKey: v })}
                    onRemove={removeKey}
                    placeholder="sk-ant-…"
                />
            </div>
            <ModelSelect
                value={cfg.model}
                curated={CURATED_MODELS.anthropic}
                cachedModels={cfg.availableModels}
                modelsFetchedAt={cfg.modelsFetchedAt}
                canFetch={!!cfg.apiKey}
                fetchModels={() => listModels('anthropic', bundle.llm)}
                onSelect={model => setField({ model })}
                onModelsFetched={models => setField({ availableModels: models, modelsFetchedAt: Date.now() })}
                placeholder={DEFAULT_MODELS.anthropic}
            />
        </ProviderCardShell>
    );
}

function OpenAICard({ bundle, update, removeSecret }: CardProps) {
    const cfg: LlmOpenAIConfig = bundle.llm.openai || { apiKey: '', model: DEFAULT_MODELS.openai, enabled: false };
    const setField = (patch: Partial<LlmOpenAIConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, openai: { ...cfg, ...patch } },
    }));
    const removeKey = () => removeSecret(b => ({
        ...b,
        llm: { ...b.llm, openai: { ...cfg, apiKey: '' } },
    }));
    return (
        <ProviderCardShell
            title="OpenAI"
            provider="openai"
            enabled={cfg.enabled}
            onEnabledChange={v => setField({ enabled: v })}
            bundle={bundle}
        >
            <div style={{ marginBottom: 8 }}>
                <ApiKeyField
                    label="API key"
                    provider="openai"
                    value={cfg.apiKey}
                    onChange={v => setField({ apiKey: v })}
                    onRemove={removeKey}
                    placeholder="sk-…"
                />
            </div>
            <ModelSelect
                value={cfg.model}
                curated={CURATED_MODELS.openai}
                cachedModels={cfg.availableModels}
                modelsFetchedAt={cfg.modelsFetchedAt}
                canFetch={!!cfg.apiKey}
                fetchModels={() => listModels('openai', bundle.llm)}
                onSelect={model => setField({ model })}
                onModelsFetched={models => setField({ availableModels: models, modelsFetchedAt: Date.now() })}
                placeholder={DEFAULT_MODELS.openai}
            />
        </ProviderCardShell>
    );
}

function GeminiCard({ bundle, update, removeSecret }: CardProps) {
    const cfg: LlmGeminiConfig = bundle.llm.gemini || { apiKey: '', model: DEFAULT_MODELS.gemini, enabled: false };
    const setField = (patch: Partial<LlmGeminiConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, gemini: { ...cfg, ...patch } },
    }));
    const removeKey = () => removeSecret(b => ({
        ...b,
        llm: { ...b.llm, gemini: { ...cfg, apiKey: '' } },
    }));
    return (
        <ProviderCardShell
            title="Google Gemini"
            provider="gemini"
            enabled={cfg.enabled}
            onEnabledChange={v => setField({ enabled: v })}
            bundle={bundle}
        >
            <div style={{ marginBottom: 8 }}>
                <ApiKeyField
                    label="API key"
                    provider="gemini"
                    value={cfg.apiKey}
                    onChange={v => setField({ apiKey: v })}
                    onRemove={removeKey}
                    placeholder="AIza…"
                />
            </div>
            <ModelSelect
                value={cfg.model}
                curated={CURATED_MODELS.gemini}
                cachedModels={cfg.availableModels}
                modelsFetchedAt={cfg.modelsFetchedAt}
                canFetch={!!cfg.apiKey}
                fetchModels={() => listModels('gemini', bundle.llm)}
                onSelect={model => setField({ model })}
                onModelsFetched={models => setField({ availableModels: models, modelsFetchedAt: Date.now() })}
                placeholder={DEFAULT_MODELS.gemini}
            />
        </ProviderCardShell>
    );
}

function LocalCard({ bundle, update }: CardProps) {
    // Local LLM (Ollama / LM Studio) has NO API key — only a base URL + model,
    // so there's no ApiKeyField here; nothing secret to write-protect.
    const cfg: LlmLocalConfig = bundle.llm.local || { baseUrl: 'http://localhost:11434', model: DEFAULT_MODELS.local, enabled: false };
    const baseUrlId = React.useId();
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
                <label className="cp-label" htmlFor={baseUrlId}>Base URL</label>
                <input
                    id={baseUrlId}
                    className="cp-input"
                    type="text"
                    value={cfg.baseUrl}
                    onChange={e => setField({ baseUrl: e.target.value })}
                    placeholder="http://localhost:11434"
                />
            </div>
            <ModelSelect
                value={cfg.model}
                curated={CURATED_MODELS.local}
                cachedModels={cfg.availableModels}
                modelsFetchedAt={cfg.modelsFetchedAt}
                canFetch={!!cfg.baseUrl}
                fetchModels={() => listModels('local', bundle.llm)}
                onSelect={model => setField({ model })}
                onModelsFetched={models => setField({ availableModels: models, modelsFetchedAt: Date.now() })}
                placeholder={DEFAULT_MODELS.local}
            />
        </ProviderCardShell>
    );
}

function CustomCard({ bundle, update, removeSecret }: CardProps) {
    const cfg: LlmCustomConfig = bundle.llm.custom || { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: '', enabled: false };
    const nameId = React.useId();
    const baseUrlId = React.useId();
    const setField = (patch: Partial<LlmCustomConfig>) => update(b => ({
        ...b,
        llm: { ...b.llm, custom: { ...cfg, ...patch } },
    }));
    const removeKey = () => removeSecret(b => ({
        ...b,
        llm: { ...b.llm, custom: { ...cfg, apiKey: '' } },
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
                <label className="cp-label" htmlFor={nameId}>Provider Name</label>
                <input
                    id={nameId}
                    className="cp-input"
                    type="text"
                    value={cfg.name}
                    onChange={e => setField({ name: e.target.value })}
                    placeholder="OpenRouter"
                />
            </div>
            <div className="cp-field" style={{ marginBottom: 8 }}>
                <label className="cp-label" htmlFor={baseUrlId}>Base URL</label>
                <input
                    id={baseUrlId}
                    className="cp-input"
                    type="text"
                    value={cfg.baseUrl}
                    onChange={e => setField({ baseUrl: e.target.value })}
                    placeholder="https://openrouter.ai/api/v1"
                />
            </div>
            <div style={{ marginBottom: 8 }}>
                <ApiKeyField
                    label="API key"
                    provider="custom"
                    value={cfg.apiKey}
                    onChange={v => setField({ apiKey: v })}
                    onRemove={removeKey}
                    placeholder="sk-or-…"
                />
            </div>
            <ModelSelect
                value={cfg.model}
                curated={CURATED_MODELS.custom}
                cachedModels={cfg.availableModels}
                modelsFetchedAt={cfg.modelsFetchedAt}
                canFetch={!!cfg.baseUrl}
                fetchModels={() => listModels('custom', bundle.llm)}
                onSelect={model => setField({ model })}
                onModelsFetched={models => setField({ availableModels: models, modelsFetchedAt: Date.now() })}
                placeholder="anthropic/claude-3-5-sonnet"
            />
        </ProviderCardShell>
    );
}

// ── Recall.ai (meeting bot) ──────────────────────────────────────────────
// NOT an LLM provider — it's the platform ARA's meeting note-taker uses to put
// a bot in a call (visible mode) or capture the desktop (background mode). It
// has only a single secret (the API key), no model, and no Test-Connection
// (testing would mean spawning a real bot). The key is write-only via
// ApiKeyField and encrypted at rest exactly like the LLM keys.
function RecallCard({ bundle, update, removeSecret }: CardProps) {
    const cfg: RecallConfig = bundle.recall || { apiKey: '', enabled: false };
    const setField = (patch: Partial<RecallConfig>) => update(b => ({
        ...b,
        recall: { ...cfg, ...patch },
    }));
    const removeKey = () => removeSecret(b => ({
        ...b,
        recall: { ...cfg, apiKey: '' },
    }));
    return (
        <div className="cp-integration-card" style={{ marginBottom: 12 }}>
            <div className="cp-integration-card__header">
                <span className="cp-integration-card__title">Recall.ai (meeting bot)</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={e => setField({ enabled: e.target.checked })}
                    />
                    Enabled
                </label>
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '0 0 8px' }}>
                Powers ARA's Meeting Notetaker — sends a note-taker bot into your call or
                captures audio in the background. Get a key at recall.ai.
            </p>
            <ApiKeyField
                label="Recall.ai API key"
                provider="recall"
                value={cfg.apiKey}
                onChange={v => setField({ apiKey: v })}
                onRemove={removeKey}
                placeholder="recall-…"
            />
        </div>
    );
}

// ── Anam Avatar Engine (plan 041 — backendless avatar harness) ──────────
// NOT an LLM provider — it's the live-avatar platform AvatarHarness /
// avatarClient.ts use for browser-direct calls to api.anam.ai. Single secret
// (the API key), no model field, no Test-Connection (testing would mean
// minting a real session token against api.anam.ai). Key is write-only via
// ApiKeyField and encrypted at rest exactly like every other vault secret —
// `avatarClient.ts` reads it straight from the vault; it never leaves the
// browser except TO Anam over TLS.
function AnamCard({ bundle, update, removeSecret }: CardProps) {
    const cfg: AnamConfig = bundle.anam || { apiKey: '', enabled: false };
    const setField = (patch: Partial<AnamConfig>) => update(b => ({
        ...b,
        anam: { ...cfg, ...patch },
    }));
    const removeKey = () => removeSecret(b => ({
        ...b,
        anam: { ...cfg, apiKey: '' },
    }));
    return (
        <div className="cp-integration-card" style={{ marginBottom: 12 }}>
            <div className="cp-integration-card__header">
                <span className="cp-integration-card__title">Anam Avatar Engine</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={e => setField({ enabled: e.target.checked })}
                    />
                    Enabled
                </label>
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '0 0 8px' }}>
                Powers the live interactive avatar (ARA, Stella). Calls go directly from your
                browser to api.anam.ai using this key. Get a key at anam.ai.
            </p>
            <ApiKeyField
                label="Anam API key"
                provider="anam"
                value={cfg.apiKey}
                onChange={v => setField({ apiKey: v })}
                onRemove={removeKey}
                placeholder="anam-…"
            />
        </div>
    );
}
