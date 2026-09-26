/**
 * llmStream — token-streaming sibling of the central llmClient (assessment
 * sweep 2026-06-12 upgrade #6; real per-provider SSE landed plan 046-A3).
 *
 * Same generator signature callers coded against; now yields one StreamEvent
 * per provider delta. Request bodies come from the SAME builders llmClient
 * uses (no `temperature` for no-sampling Claude, `max_completion_tokens` for
 * OpenAI, …) so the 2026-08-19 "empty reply on newer models" fixes carry over.
 * When a stream ends with NO text on a token-budget stop, we fall back to the
 * non-streaming `callLlm`, which already retries at `retryBudget`.
 *
 * Metering: streaming bypasses the callLlm chokepoint, so this file records
 * recordAiSuccess/recordLlmUsage (and recordAiFailure on throw) itself.
 * Reversible: the ARA `streamTokens` pref (araPrefsStore) gates its use.
 */

import {
    callLlm,
    LlmError,
    buildAnthropicBody,
    buildOpenAiBody,
    type LlmRequest,
    type LlmUsage,
} from './llmClient';
import { pumpSseBody } from './readSse';
import { recordAiFailure, recordAiSuccess } from './aiHealthStore';
import { recordLlmUsage, currentUsageUserId } from './llmUsageStore';
import { DEFAULT_MODELS, type IntegrationsBundle, type LlmProvider } from '../types/integrations';

export interface StreamEvent {
    /** Incremental text chunk. */
    delta: string;
    /** Cumulative text so far. */
    text: string;
    /** True on the final event. */
    done: boolean;
}

/** True once at least one provider implements real SSE. */
export const STREAMING_AVAILABLE = true;

// ── Pure per-provider SSE `data:` parsers (exported for tests) ────────────

/** Plan 068 (A6): `usage` is a PARTIAL update — the caller merges successive updates (fields overwrite; Anthropic's input arrives separately from its output). */
export interface ParsedStreamData { delta?: string; stop?: string; usage?: Partial<LlmUsage> }

/** Anthropic /v1/messages stream: text deltas only (thinking deltas skipped), stop_reason + final usage from message_delta, input usage from message_start. */
export function parseAnthropicStreamData(data: string): ParsedStreamData {
    const j = safeJson(data);
    if (!j) return {};
    if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && typeof j.delta.text === 'string') return { delta: j.delta.text };
    if (j.type === 'message_start' && j.message?.usage) {
        const u = j.message.usage;
        const usage: Partial<LlmUsage> = {};
        if (typeof u.input_tokens === 'number') usage.inputTokens = u.input_tokens;
        if (typeof u.output_tokens === 'number') usage.outputTokens = u.output_tokens;
        if (typeof u.cache_read_input_tokens === 'number') usage.cacheReadTokens = u.cache_read_input_tokens;
        if (typeof u.cache_creation_input_tokens === 'number') usage.cacheWriteTokens = u.cache_creation_input_tokens;
        return Object.keys(usage).length ? { usage } : {};
    }
    if (j.type === 'message_delta') {
        const out: ParsedStreamData = {};
        if (typeof j.delta?.stop_reason === 'string') out.stop = j.delta.stop_reason;
        if (typeof j.usage?.output_tokens === 'number') out.usage = { outputTokens: j.usage.output_tokens };
        return out;
    }
    return {};
}

/** OpenAI-compatible chat-completions stream: choices[0].delta.content / finish_reason; final `usage` chunk (empty choices) has full counts; `[DONE]` → {}. */
export function parseOpenAiStreamData(data: string): ParsedStreamData {
    if (data.trim() === '[DONE]') return {};
    const j = safeJson(data);
    if (!j) return {};
    const out: ParsedStreamData = {};
    const choice = j?.choices?.[0];
    if (choice) {
        if (typeof choice.delta?.content === 'string') out.delta = choice.delta.content;
        if (typeof choice.finish_reason === 'string') out.stop = choice.finish_reason;
    }
    const u = j?.usage;
    if (u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number') {
        const cached = typeof u.prompt_tokens_details?.cached_tokens === 'number' ? u.prompt_tokens_details.cached_tokens : 0;
        const usage: Partial<LlmUsage> = { inputTokens: Math.max(0, u.prompt_tokens - cached), outputTokens: u.completion_tokens };
        if (cached > 0) usage.cacheReadTokens = cached;
        out.usage = usage;
    }
    return out;
}

/** Gemini streamGenerateContent?alt=sse: non-thought parts joined; finishReason; usageMetadata (last chunk wins). */
export function parseGeminiStreamData(data: string): ParsedStreamData {
    const j = safeJson(data);
    if (!j) return {};
    const out: ParsedStreamData = {};
    const cand = j?.candidates?.[0];
    if (cand) {
        const parts: any[] = Array.isArray(cand.content?.parts) ? cand.content.parts : [];
        const delta = parts.filter((p) => p && !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
        if (delta) out.delta = delta;
        if (typeof cand.finishReason === 'string') out.stop = cand.finishReason;
    }
    const um = j?.usageMetadata;
    if (um && typeof um.promptTokenCount === 'number') {
        const candidatesTokens = typeof um.candidatesTokenCount === 'number' ? um.candidatesTokenCount : 0;
        const thoughtsTokens = typeof um.thoughtsTokenCount === 'number' ? um.thoughtsTokenCount : 0;
        const usage: Partial<LlmUsage> = { inputTokens: um.promptTokenCount, outputTokens: candidatesTokens + thoughtsTokens };
        if (typeof um.cachedContentTokenCount === 'number' && um.cachedContentTokenCount > 0) usage.cacheReadTokens = um.cachedContentTokenCount;
        out.usage = usage;
    }
    return out;
}

function safeJson(s: string): any {
    try { return JSON.parse(s); } catch { return null; }
}

// ── Request shaping ───────────────────────────────────────────────────────

interface StreamTarget {
    provider: LlmProvider;
    model: string;
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    parse: (data: string) => ParsedStreamData;
}

/** OpenAI-compatible body for local/custom endpoints (mirrors llmClient callLocal/callCustom). */
function compatBody(req: LlmRequest, model: string): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.3,
        messages: [
            ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
            { role: 'user', content: req.prompt },
        ],
    };
    if (req.responseFormat === 'json') body.response_format = { type: 'json_object' };
    return body;
}

/** Resolve the active provider into a streaming request; null when not configured/enabled. */
function resolveTarget(req: LlmRequest, llm: IntegrationsBundle['llm']): StreamTarget | null {
    switch (llm.active) {
        case 'anthropic': {
            if (!llm.anthropic?.enabled || !llm.anthropic.apiKey) return null;
            const model = llm.anthropic.model || DEFAULT_MODELS.anthropic;
            return {
                provider: 'anthropic', model,
                url: 'https://api.anthropic.com/v1/messages',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': llm.anthropic.apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: { ...buildAnthropicBody(req, model), stream: true },
                parse: parseAnthropicStreamData,
            };
        }
        case 'openai': {
            if (!llm.openai?.enabled || !llm.openai.apiKey) return null;
            const model = llm.openai.model || DEFAULT_MODELS.openai;
            return {
                provider: 'openai', model,
                url: 'https://api.openai.com/v1/chat/completions',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.openai.apiKey}` },
                // A6: ask for a final usage chunk. Only for the real OpenAI endpoint —
                // local/custom OpenAI-compatible servers may reject the unknown field.
                body: { ...buildOpenAiBody(req, model), stream: true, stream_options: { include_usage: true } },
                parse: parseOpenAiStreamData,
            };
        }
        case 'gemini': {
            if (!llm.gemini?.enabled || !llm.gemini.apiKey) return null;
            const model = llm.gemini.model || DEFAULT_MODELS.gemini;
            const body: Record<string, unknown> = {
                contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
                generationConfig: {
                    maxOutputTokens: req.maxTokens ?? 1024,
                    temperature: req.temperature ?? 0.3,
                    ...(req.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
                },
            };
            if (req.systemPrompt) body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
            return {
                provider: 'gemini', model,
                url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(llm.gemini.apiKey)}`,
                headers: { 'Content-Type': 'application/json' },
                body,
                parse: parseGeminiStreamData,
            };
        }
        case 'local': {
            if (!llm.local?.enabled || !llm.local.baseUrl) return null;
            const model = llm.local.model || DEFAULT_MODELS.local;
            return {
                provider: 'local', model,
                url: `${llm.local.baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
                headers: { 'Content-Type': 'application/json' },
                body: { ...compatBody(req, model), stream: true },
                parse: parseOpenAiStreamData,
            };
        }
        case 'custom': {
            const c = llm.custom;
            if (!c?.enabled || !c.baseUrl || !c.apiKey || !c.model) return null;
            const trimmed = c.baseUrl.replace(/\/$/, '');
            return {
                provider: 'custom', model: c.model,
                url: trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
                body: { ...compatBody(req, c.model), stream: true },
                parse: parseOpenAiStreamData,
            };
        }
        default:
            return null;
    }
}

const BUDGET_STOPS = new Set(['max_tokens', 'length', 'MAX_TOKENS']);

/**
 * Stream a completion. Yields incremental StreamEvents; returns the full text,
 * or null if no provider is configured.
 */
export async function* streamLlm(
    req: LlmRequest,
    llm: IntegrationsBundle['llm'],
): AsyncGenerator<StreamEvent, string | null, void> {
    const target = resolveTarget(req, llm);
    if (!target) return null;

    // Plan 068 (C4): capture the ledger owner before any await, same discipline as callLlm.
    const userId = currentUsageUserId();
    // Buffer deltas from the pump callback; the generator drains between reads.
    const pending: string[] = [];
    let text = '';
    let stop: string | undefined;
    // A6: partial usage updates merge here (Anthropic input arrives at message_start,
    // output at message_delta; OpenAI/Gemini send one complete-ish update — last wins).
    let usageAcc: Partial<LlmUsage> = {};
    let sawUsage = false;
    // A6: true once the provider ACCEPTED the request (2xx + body) — from then on it
    // bills us, so the finally block records exactly once. A rejected request
    // (401/429/400) generated nothing and is not recorded.
    let billable = false;

    try {
        try {
            let res = await fetch(target.url, { method: 'POST', headers: target.headers, body: JSON.stringify(target.body) });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                // Unrecognised no-sampling Claude id → retry once without temperature (llmClient parity).
                if (target.provider === 'anthropic' && res.status === 400 && /temperature/i.test(errText)) {
                    const body = { ...buildAnthropicBody(req, target.model, undefined, true), stream: true };
                    res = await fetch(target.url, { method: 'POST', headers: target.headers, body: JSON.stringify(body) });
                }
                if (!res.ok) throw new LlmError(target.provider, res.status, errText || `HTTP ${res.status}`);
            }
            if (!res.body) throw new LlmError(target.provider, res.status, 'Empty stream body');
            billable = true;

            let resolveWake: (() => void) | null = null;
            const wake = () => { resolveWake?.(); resolveWake = null; };
            let finished = false;
            let pumpErr: unknown = null;
            void pumpSseBody(res.body, (ev) => {
                const p = target.parse(ev.data);
                if (p.delta) pending.push(p.delta);
                if (p.stop) stop = p.stop;
                if (p.usage) { usageAcc = { ...usageAcc, ...p.usage }; sawUsage = true; }
                wake();
            }).then(() => { finished = true; wake(); }, (e) => { pumpErr = e; finished = true; wake(); });

            for (;;) {
                for (let delta = pending.shift(); delta !== undefined; delta = pending.shift()) {
                    text += delta;
                    yield { delta, text, done: false };
                }
                if (finished) break;
                await new Promise<void>((r) => { resolveWake = r; });
            }
            if (pumpErr) throw pumpErr;

            if (!text && stop === 'refusal') {
                throw new LlmError(target.provider, 200, `${target.model} declined this request (stop_reason: refusal)`);
            }
            if (!text && stop && BUDGET_STOPS.has(stop)) {
                // Thinking/reasoning ate the budget → the non-streaming path retries once
                // at retryBudget and meters ITS call; this streamed attempt was billed too
                // (its thinking tokens), so the finally block still records it.
                const res2 = await callLlm(req, llm);
                if (!res2) return null;
                yield { delta: res2.text, text: res2.text, done: true };
                return res2.text;
            }
        } catch (err) {
            if (err instanceof LlmError) recordAiFailure(err.provider, err.status);
            else recordAiFailure(target.provider, 0);
            throw err;
        }

        recordAiSuccess();
        yield { delta: '', text, done: true };
        return text;
    } finally {
        // A6: an early return() by the consumer, an abort, or a mid-stream error still
        // lands here — record whatever partial text (and usage, if seen) we have.
        // Exactly one record per accepted stream (the budget-stop fallback's callLlm
        // records its own, separate, billed call).
        if (billable) {
            const usage: LlmUsage | undefined = (sawUsage && typeof usageAcc.inputTokens === 'number' && typeof usageAcc.outputTokens === 'number')
                ? { inputTokens: usageAcc.inputTokens, outputTokens: usageAcc.outputTokens, ...(usageAcc.cacheReadTokens ? { cacheReadTokens: usageAcc.cacheReadTokens } : {}), ...(usageAcc.cacheWriteTokens ? { cacheWriteTokens: usageAcc.cacheWriteTokens } : {}) }
                : undefined;
            recordLlmUsage({
                provider: target.provider,
                model: target.model,
                promptChars: (req.prompt?.length ?? 0) + (req.systemPrompt?.length ?? 0),
                responseChars: text.length,
                usage,
                source: req.source,
                userId,
            });
        }
    }
}
