/**
 * llmClient — central LLM router. Reads the active user's integrations bundle
 * and dispatches to the user-selected provider. Widgets call `callLlm(...)`
 * and don't care which provider is configured — when the user switches
 * Anthropic → OpenAI in Settings, every widget picks it up via the same
 * useIntegrations hook.
 *
 * Each provider helper makes a direct browser-to-provider HTTPS call. Keys
 * are read from the per-user IntegrationsBundle and never logged. Anthropic
 * requires `anthropic-dangerous-direct-browser-access: true` for browser
 * usage; we send it. OpenAI/Gemini/OpenRouter/Ollama all support CORS by
 * default for the relevant endpoints.
 *
 * Returns `null` when the active provider isn't configured or all providers
 * are disabled — callers should fall back to backend or a heuristic.
 *
 * 2026-05-26 created.
 */

import type { IntegrationsBundle, LlmProvider } from '../types/integrations';
import { recordAiFailure, recordAiSuccess } from './aiHealthStore';
import { recordLlmUsage } from './llmUsageStore';
import { DEFAULT_MODELS } from '../types/integrations';

// ── Request / response types ─────────────────────────────────────────

export interface LlmRequest {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;          // default 1024
    temperature?: number;        // default 0.3
    responseFormat?: 'text' | 'json';   // hint for providers that support it
}

export interface LlmResponse {
    text: string;
    provider: LlmProvider;
    model: string;
}

export class LlmError extends Error {
    constructor(public readonly provider: LlmProvider, public readonly status: number, message: string) {
        super(`[${provider}] ${message}`);
        this.name = 'LlmError';
    }
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Route a single completion through the user's active LLM provider.
 * Returns null if no provider is configured + enabled.
 */
export async function callLlm(
    req: LlmRequest,
    llm: IntegrationsBundle['llm'],
): Promise<LlmResponse | null> {
    let res: LlmResponse | null;
    try {
        res = await dispatchLlm(req, llm);
    } catch (err) {
        // Assessment sweep (weakness #8): the SAME chokepoint that meters
        // spend also feeds the AI-health signal — every widget's
        // useAIAvailability() sees provider failures without tracking them
        // itself. Recording never swallows the error.
        if (err instanceof LlmError) recordAiFailure(err.provider, err.status);
        else recordAiFailure(llm.active ?? 'unknown', 0);
        throw err;
    }
    // P12-1 AI-spend ledger: one chokepoint records ESTIMATED usage for every
    // completion (recordLlmUsage never throws — the ledger can't break calls).
    if (res) {
        recordAiSuccess();
        recordLlmUsage({
            provider: res.provider,
            model: res.model,
            promptChars: (req.prompt?.length ?? 0) + (req.systemPrompt?.length ?? 0),
            responseChars: res.text?.length ?? 0,
        });
    }
    return res;
}

async function dispatchLlm(
    req: LlmRequest,
    llm: IntegrationsBundle['llm'],
): Promise<LlmResponse | null> {
    const active = llm.active;
    if (!active) return null;

    switch (active) {
        case 'anthropic':
            if (!llm.anthropic?.enabled || !llm.anthropic.apiKey) return null;
            return callAnthropic(req, llm.anthropic.apiKey, llm.anthropic.model || DEFAULT_MODELS.anthropic);
        case 'openai':
            if (!llm.openai?.enabled || !llm.openai.apiKey) return null;
            return callOpenAI(req, llm.openai.apiKey, llm.openai.model || DEFAULT_MODELS.openai);
        case 'gemini':
            if (!llm.gemini?.enabled || !llm.gemini.apiKey) return null;
            return callGemini(req, llm.gemini.apiKey, llm.gemini.model || DEFAULT_MODELS.gemini);
        case 'local':
            if (!llm.local?.enabled || !llm.local.baseUrl) return null;
            return callLocal(req, llm.local.baseUrl, llm.local.model || DEFAULT_MODELS.local);
        case 'custom':
            if (!llm.custom?.enabled || !llm.custom.baseUrl || !llm.custom.apiKey || !llm.custom.model) return null;
            return callCustom(req, llm.custom.baseUrl, llm.custom.apiKey, llm.custom.model);
    }
}

/**
 * Check if any LLM is configured + enabled for the current bundle. Useful
 * for UI affordances ("LLM available" badge) and for picking heuristic vs
 * AI codepath at widget render time.
 */
export function hasActiveLlm(llm: IntegrationsBundle['llm']): boolean {
    if (!llm.active) return false;
    switch (llm.active) {
        case 'anthropic': return !!(llm.anthropic?.enabled && llm.anthropic.apiKey);
        case 'openai': return !!(llm.openai?.enabled && llm.openai.apiKey);
        case 'gemini': return !!(llm.gemini?.enabled && llm.gemini.apiKey);
        case 'local': return !!(llm.local?.enabled && llm.local.baseUrl);
        case 'custom': return !!(llm.custom?.enabled && llm.custom.baseUrl && llm.custom.apiKey && llm.custom.model);
    }
}

/**
 * P12-2: route a call to a persona's preferred provider/model. Returns the
 * bundle unchanged when the preferred provider isn't configured+enabled —
 * honest fallback to the user's active provider, never a dead call.
 */
export function applyModelPreference(
    llm: IntegrationsBundle['llm'],
    pref?: { provider: LlmProvider; model?: string } | null,
): IntegrationsBundle['llm'] {
    if (!pref) return llm;
    const switched: IntegrationsBundle['llm'] = { ...llm, active: pref.provider };
    if (!hasActiveLlm(switched)) return llm;
    if (!pref.model) return switched;
    switch (pref.provider) {
        case 'anthropic': return { ...switched, anthropic: { ...switched.anthropic!, model: pref.model } };
        case 'openai': return { ...switched, openai: { ...switched.openai!, model: pref.model } };
        case 'gemini': return { ...switched, gemini: { ...switched.gemini!, model: pref.model } };
        case 'local': return { ...switched, local: { ...switched.local!, model: pref.model } };
        case 'custom': return { ...switched, custom: { ...switched.custom!, model: pref.model } };
    }
}

/**
 * Smoke-test a provider with a minimal "ping" prompt. Used by the
 * Integrations UI Test button. Returns true on 2xx + non-empty content.
 */
export async function testProvider(
    provider: LlmProvider,
    llm: IntegrationsBundle['llm'],
): Promise<{ ok: boolean; error?: string }> {
    const stash = llm.active;
    const llmWithOverride = { ...llm, active: provider };
    try {
        const res = await callLlm(
            { prompt: 'Say "ok"', maxTokens: 16, temperature: 0 },
            llmWithOverride,
        );
        if (!res) return { ok: false, error: `Provider ${provider} not configured or not enabled` };
        if (!res.text || res.text.length === 0) return { ok: false, error: 'Empty response' };
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    } finally {
        // No-op; we never mutated the original llm.
        void stash;
    }
}

// ── Model-list discovery (Task B) ─────────────────────────────────────
//
// Populate the Model dropdown from the provider's own /models endpoint, using
// the SAME direct-browser call path the completion helpers above use (same auth
// headers, same origins — already allow-listed in the CSP connect-src). The UI
// merges these with the curated fallback (CURATED_MODELS) and always keeps a
// "Custom…" escape hatch, so a fetch failure is non-fatal.

export interface ModelListResult {
    /** Chat-capable model ids for the provider (may be empty on error). */
    models: string[];
    /** Present iff the fetch failed / no key — the UI falls back to curated. */
    error?: string;
}

/** Narrow an unknown JSON value to an array of records without using `any`. */
function asRecordArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null);
}

function dedupeSorted(ids: string[]): string[] {
    return Array.from(new Set(ids.filter(Boolean))).sort();
}

/**
 * Fetch the chat-capable model ids for a provider. Returns `{ models: [] }` with
 * an `error` when there's no key or the request fails — never throws.
 */
export async function listModels(
    provider: LlmProvider,
    llm: IntegrationsBundle['llm'],
): Promise<ModelListResult> {
    try {
        switch (provider) {
            case 'anthropic': {
                const key = llm.anthropic?.apiKey;
                if (!key) return { models: [], error: 'No Anthropic API key configured' };
                return { models: await fetchAnthropicModels(key) };
            }
            case 'openai': {
                const key = llm.openai?.apiKey;
                if (!key) return { models: [], error: 'No OpenAI API key configured' };
                return { models: await fetchOpenAIModels(key) };
            }
            case 'gemini': {
                const key = llm.gemini?.apiKey;
                if (!key) return { models: [], error: 'No Gemini API key configured' };
                return { models: await fetchGeminiModels(key) };
            }
            case 'local': {
                const baseUrl = llm.local?.baseUrl;
                if (!baseUrl) return { models: [], error: 'No Local LLM base URL configured' };
                return { models: await fetchOpenAICompatibleModels(`${baseUrl.replace(/\/$/, '')}/v1/models`) };
            }
            case 'custom': {
                const cfg = llm.custom;
                if (!cfg?.baseUrl) return { models: [], error: 'No Custom base URL configured' };
                const trimmed = cfg.baseUrl.replace(/\/$/, '');
                const url = trimmed.endsWith('/models') ? trimmed : `${trimmed}/models`;
                return { models: await fetchOpenAICompatibleModels(url, cfg.apiKey) };
            }
        }
    } catch (e) {
        return { models: [], error: e instanceof Error ? e.message : String(e) };
    }
}

async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
    });
    if (!res.ok) throw new LlmError('anthropic', res.status, (await res.text().catch(() => '')) || `HTTP ${res.status}`);
    const json = (await res.json()) as { data?: unknown };
    const ids = asRecordArray(json?.data)
        .map(m => (typeof m.id === 'string' ? m.id : ''))
        .filter(Boolean);
    return dedupeSorted(ids);
}

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
    const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new LlmError('openai', res.status, (await res.text().catch(() => '')) || `HTTP ${res.status}`);
    const json = (await res.json()) as { data?: unknown };
    const ids = asRecordArray(json?.data)
        .map(m => (typeof m.id === 'string' ? m.id : ''))
        .filter(isChatCapableOpenAIId);
    return dedupeSorted(ids);
}

/** Keep chat/completions models; drop embeddings / audio / image / moderation. */
function isChatCapableOpenAIId(id: string): boolean {
    if (!id) return false;
    // `o\d` rather than an o1|o3|o4 allowlist: the reasoning series has already
    // gone o1 → o3 → o4, and an enumerated list silently HIDES the next one from
    // the dropdown — the live catalog fetch would return it and we would filter
    // it back out. Prefix families (gpt-*, chatgpt-*) are open-ended for the
    // same reason; the exclusion list below is what keeps non-chat ids out.
    if (!/^(gpt-|o\d|chatgpt-)/.test(id)) return false;
    if (/(embedding|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|search)/.test(id)) return false;
    return true;
}

async function fetchGeminiModels(apiKey: string): Promise<string[]> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`);
    if (!res.ok) throw new LlmError('gemini', res.status, (await res.text().catch(() => '')) || `HTTP ${res.status}`);
    const json = (await res.json()) as { models?: unknown };
    const ids = asRecordArray(json?.models)
        .filter(m => Array.isArray(m.supportedGenerationMethods) && (m.supportedGenerationMethods as unknown[]).includes('generateContent'))
        .map(m => (typeof m.name === 'string' ? m.name.replace(/^models\//, '') : ''))
        .filter(Boolean);
    return dedupeSorted(ids);
}

/** Local (Ollama/LM Studio) + Custom expose an OpenAI-compatible /models list. */
async function fetchOpenAICompatibleModels(url: string, apiKey?: string): Promise<string[]> {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: unknown; models?: unknown };
    // OpenAI-compatible shape is { data: [{ id }] }; Ollama's native /v1/models
    // matches it, but tolerate a bare { models: [{ id|name }] } too.
    const source = json?.data ?? json?.models;
    const ids = asRecordArray(source)
        .map(m => (typeof m.id === 'string' ? m.id : typeof m.name === 'string' ? m.name : ''))
        .filter(Boolean);
    return dedupeSorted(ids);
}

// ── Provider implementations ──────────────────────────────────────────

async function callAnthropic(req: LlmRequest, apiKey: string, model: string): Promise<LlmResponse> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model,
            max_tokens: req.maxTokens ?? 1024,
            temperature: req.temperature ?? 0.3,
            system: req.systemPrompt,
            messages: [{ role: 'user', content: req.prompt }],
        }),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new LlmError('anthropic', res.status, errText || `HTTP ${res.status}`);
    }
    const json = await res.json();
    const text = json?.content?.[0]?.text ?? '';
    return { text, provider: 'anthropic', model };
}

async function callOpenAI(req: LlmRequest, apiKey: string, model: string): Promise<LlmResponse> {
    const body: any = {
        model,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.3,
        messages: [
            ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
            { role: 'user', content: req.prompt },
        ],
    };
    if (req.responseFormat === 'json') body.response_format = { type: 'json_object' };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new LlmError('openai', res.status, errText || `HTTP ${res.status}`);
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? '';
    return { text, provider: 'openai', model };
}

async function callGemini(req: LlmRequest, apiKey: string, model: string): Promise<LlmResponse> {
    // Gemini uses ?key=<apiKey> in URL. Combined system+user via instructions
    // field if systemPrompt provided.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body: any = {
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: {
            maxOutputTokens: req.maxTokens ?? 1024,
            temperature: req.temperature ?? 0.3,
            ...(req.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
        },
    };
    if (req.systemPrompt) {
        body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
    }
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new LlmError('gemini', res.status, errText || `HTTP ${res.status}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { text, provider: 'gemini', model };
}

/**
 * Local LLM via OpenAI-compatible endpoint. Most local runners (Ollama,
 * LM Studio, llama.cpp server) expose /v1/chat/completions natively or via
 * a compatibility shim. Base URL is what the user enters (e.g.,
 * "http://localhost:11434" for Ollama → we append /v1/chat/completions).
 */
async function callLocal(req: LlmRequest, baseUrl: string, model: string): Promise<LlmResponse> {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const body: any = {
        model,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.3,
        messages: [
            ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
            { role: 'user', content: req.prompt },
        ],
    };
    if (req.responseFormat === 'json') body.response_format = { type: 'json_object' };
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new LlmError('local', res.status, errText || `HTTP ${res.status}`);
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? '';
    return { text, provider: 'local', model };
}

/**
 * Custom OpenAI-compatible endpoint (OpenRouter, Together, Anyscale, etc.).
 * User supplies full base URL (we append /chat/completions if not present).
 */
async function callCustom(req: LlmRequest, baseUrl: string, apiKey: string, model: string): Promise<LlmResponse> {
    const trimmed = baseUrl.replace(/\/$/, '');
    const url = trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
    const body: any = {
        model,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.3,
        messages: [
            ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
            { role: 'user', content: req.prompt },
        ],
    };
    if (req.responseFormat === 'json') body.response_format = { type: 'json_object' };
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new LlmError('custom', res.status, errText || `HTTP ${res.status}`);
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? '';
    return { text, provider: 'custom', model };
}
