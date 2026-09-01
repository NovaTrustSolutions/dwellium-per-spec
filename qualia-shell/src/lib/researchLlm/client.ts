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
}

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
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: req.model, messages, stream: false }),
            signal: req.signal,
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
        if ((err as Error)?.name === 'AbortError') return { ...base, latencyMs, error: 'Cancelled.' };
        return { ...base, latencyMs, error: String(err) };
    }
}
