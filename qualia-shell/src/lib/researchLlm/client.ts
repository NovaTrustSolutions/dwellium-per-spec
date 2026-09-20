/**
 * researchLlm/client — minimal OpenAI-compatible chat-completions client for
 * the Research Lab's free providers. Browser-direct fetch, `stream: false`,
 * no SDK, no new deps.
 *
 * FIREWALL: requests are built ONLY from user-typed text plus one of the
 * fixed RESEARCH_PRESETS system prompts. No context injection, no
 * attachments, no imports from any app data store — enforced by
 * researchLabImportGuard.test.ts. Every prompt passes researchLlm/guard.ts
 * before it reaches this module (the widget calls guardOutbound first).
 *
 * CORS reality: many providers do not send CORS headers, so a browser-direct
 * call dies as a fetch TypeError before any HTTP status exists. We surface
 * that honestly as `corsBlocked` — the follow-up is a backend research proxy
 * (NOT built here; backend deploys are blocked).
 */
import { getResearchProvider } from '../../data/researchProviders';
import type { ResearchLogResponse } from './researchLogStore';

/** Fixed research system prompts — the only non-user-typed request content. */
export const RESEARCH_PRESETS: readonly { id: string; label: string; system: string }[] = [
    {
        id: 'housing-law-ga',
        label: 'Housing-law researcher (Georgia)',
        system: 'You are a careful legal research assistant specializing in Georgia (US state) landlord-tenant and housing law. Cite the relevant O.C.G.A. sections when you can, state uncertainty plainly, and always note that this is research, not legal advice.',
    },
    {
        id: 'drafter',
        label: 'Document drafter',
        system: 'You are a precise drafting assistant for property-management documents. Produce clean, professional drafts with placeholder fields like [TENANT NAME] — never invent real names, addresses, or amounts.',
    },
    {
        id: 'model-probe',
        label: 'Model comparison probe',
        system: 'You are being benchmarked against other models on the same prompt. Answer directly and concisely; show reasoning steps only when they change the answer.',
    },
    { id: 'blank', label: 'Blank', system: '' },
] as const;

export interface ResearchRunRequest {
    providerId: string;
    model: string;
    apiKey: string;
    presetId: string;
    /** User-typed text — the ONLY variable request content. */
    prompt: string;
    signal?: AbortSignal;
}

export interface ResearchRunResult extends ResearchLogResponse {
    /** fetch threw TypeError — likely CORS; badge the provider. */
    corsBlocked?: boolean;
    /** HTTP status when the provider answered at all. */
    status?: number;
    /** UI-only: this slot hasn't settled yet (seeded placeholder, never persisted). */
    pending?: boolean;
}

/** Default per-run timeout (plan 062 phase 1) — one hanging provider must not hang the widget. */
export const RESEARCH_TIMEOUT_MS = 60_000;

interface ChatCompletionBody {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function chatCompletionsUrl(baseUrl: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/** One provider, one prompt, stream:false. Never throws — errors are data. */
export async function runResearchChat(req: ResearchRunRequest): Promise<ResearchRunResult> {
    const provider = getResearchProvider(req.providerId);
    const started = Date.now();
    const base: ResearchRunResult = { providerId: req.providerId, model: req.model, text: '', latencyMs: 0 };
    if (!provider) return { ...base, error: `Unknown provider "${req.providerId}"` };
    if (provider.unusable) return { ...base, error: provider.note ?? 'Provider is not usable browser-direct.' };
    if (provider.needsAccountId && provider.baseUrl.includes('{account_id}')) {
        return { ...base, error: 'Cloudflare needs your account id in the base URL before it can be called.' };
    }
    const preset = RESEARCH_PRESETS.find(p => p.id === req.presetId) ?? RESEARCH_PRESETS[RESEARCH_PRESETS.length - 1];
    const messages = [
        ...(preset.system ? [{ role: 'system', content: preset.system }] : []),
        { role: 'user', content: req.prompt },
    ];
    // Keyless providers (e.g. Pollinations): POST to the base URL itself — it
    // already ends in /openai — and send NO Authorization header.
    const url = provider.keyless ? provider.baseUrl : chatCompletionsUrl(provider.baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!provider.keyless) headers.Authorization = `Bearer ${req.apiKey}`;
    // Compose the caller's signal (Cancel button) with a hard default timeout
    // so one hanging free provider can never hang the widget forever.
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(RESEARCH_TIMEOUT_MS)].filter(Boolean) as AbortSignal[]);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: req.model, messages, stream: false }),
            signal,
        });
        const latencyMs = Date.now() - started;
        const raw = await res.text();
        if (!res.ok) {
            // 429s and friends: show the provider's words verbatim, no dressing up.
            return { ...base, latencyMs, status: res.status, error: `HTTP ${res.status}: ${raw.slice(0, 2000)}` };
        }
        let body: ChatCompletionBody;
        try { body = JSON.parse(raw) as ChatCompletionBody; } catch {
            return { ...base, latencyMs, status: res.status, error: `Non-JSON response: ${raw.slice(0, 500)}` };
        }
        return {
            ...base,
            latencyMs,
            status: res.status,
            text: body.choices?.[0]?.message?.content ?? '',
            usage: body.usage
                ? { promptTokens: body.usage.prompt_tokens, completionTokens: body.usage.completion_tokens }
                : undefined,
        };
    } catch (err) {
        const latencyMs = Date.now() - started;
        if (err instanceof TypeError) {
            return { ...base, latencyMs, corsBlocked: true, error: 'This provider stopped allowing browser calls (it passed the 2026-08-29 CORS audit) — report it so it can be re-audited.' };
        }
        // Check TimeoutError before AbortError — AbortSignal.timeout's own abort
        // reason carries the more specific name; a caller Cancel is a plain AbortError.
        if ((err as Error)?.name === 'TimeoutError') return { ...base, latencyMs, error: `Timed out after ${RESEARCH_TIMEOUT_MS / 1000}s.` };
        if ((err as Error)?.name === 'AbortError') return { ...base, latencyMs, error: 'Cancelled.' };
        return { ...base, latencyMs, error: String(err) };
    }
}

export interface ListModelsResult {
    /** Sorted, de-duplicated model ids. Present only on success. */
    models?: string[];
    error?: string;
    corsBlocked?: boolean;
}

interface ModelsListBody {
    data?: { id?: string }[];
}

export function modelsUrl(baseUrl: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/models`;
}

/**
 * GET {base}/models — same keyless/Authorization branching as
 * runResearchChat, plus one usability deviation (plan 062 phase 4, Ilya gate
 * G1 default): an EMPTY apiKey sends NO Authorization header rather than
 * "Bearer " — most providers' /models endpoint (OpenRouter included) is
 * public, so the picker can populate before the user has pasted a key.
 * Never throws — errors are data.
 */
export async function listModels(providerId: string, apiKey: string, signal?: AbortSignal): Promise<ListModelsResult> {
    const provider = getResearchProvider(providerId);
    if (!provider) return { error: `Unknown provider "${providerId}"` };
    if (provider.unusable) return { error: provider.note ?? 'Provider is not usable browser-direct.' };
    if (provider.needsAccountId && provider.baseUrl.includes('{account_id}')) {
        return { error: 'Cloudflare needs your account id in the base URL before it can be called.' };
    }
    const url = provider.keyless ? provider.baseUrl : modelsUrl(provider.baseUrl);
    const headers: Record<string, string> = {};
    if (!provider.keyless && apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const composedSignal = AbortSignal.any([signal, AbortSignal.timeout(RESEARCH_TIMEOUT_MS)].filter(Boolean) as AbortSignal[]);
    try {
        const res = await fetch(url, { method: 'GET', headers, signal: composedSignal });
        const raw = await res.text();
        if (!res.ok) return { error: `HTTP ${res.status}: ${raw.slice(0, 500)}` };
        let body: ModelsListBody;
        try { body = JSON.parse(raw) as ModelsListBody; } catch {
            return { error: `Non-JSON response: ${raw.slice(0, 300)}` };
        }
        const ids = (body.data ?? [])
            .map(m => m.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
        return { models: [...new Set(ids)].sort() };
    } catch (err) {
        if (err instanceof TypeError) return { error: 'CORS-blocked fetching the model list.', corsBlocked: true };
        if ((err as Error)?.name === 'TimeoutError') return { error: `Timed out after ${RESEARCH_TIMEOUT_MS / 1000}s.` };
        if ((err as Error)?.name === 'AbortError') return { error: 'Cancelled.' };
        return { error: String(err) };
    }
}
