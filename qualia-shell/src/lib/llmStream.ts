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
} from './llmClient';
import { pumpSseBody } from './readSse';
import { recordAiFailure, recordAiSuccess } from './aiHealthStore';
import { recordLlmUsage } from './llmUsageStore';
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

export interface ParsedStreamData { delta?: string; stop?: string }

/** Anthropic /v1/messages stream: text deltas only (thinking deltas skipped), stop_reason from message_delta. */
export function parseAnthropicStreamData(data: string): ParsedStreamData {
    const j = safeJson(data);
    if (!j) return {};
    if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && typeof j.delta.text === 'string') return { delta: j.delta.text };
    if (j.type === 'message_delta' && typeof j.delta?.stop_reason === 'string') return { stop: j.delta.stop_reason };
    return {};
}

/** OpenAI-compatible chat-completions stream: choices[0].delta.content / finish_reason; `[DONE]` → {}. */
export function parseOpenAiStreamData(data: string): ParsedStreamData {
    if (data.trim() === '[DONE]') return {};
    const j = safeJson(data);
    const choice = j?.choices?.[0];
    if (!choice) return {};
    const out: ParsedStreamData = {};
    if (typeof choice.delta?.content === 'string') out.delta = choice.delta.content;
    if (typeof choice.finish_reason === 'string') out.stop = choice.finish_reason;
    return out;
}

/** Gemini streamGenerateContent?alt=sse: non-thought parts joined; finishReason. */
export function parseGeminiStreamData(data: string): ParsedStreamData {
    const j = safeJson(data);
    const cand = j?.candidates?.[0];
    if (!cand) return {};
    const parts: any[] = Array.isArray(cand.content?.parts) ? cand.content.parts : [];
    const delta = parts.filter((p) => p && !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
    const out: ParsedStreamData = {};
    if (delta) out.delta = delta;
    if (typeof cand.finishReason === 'string') out.stop = cand.finishReason;
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
                body: { ...buildOpenAiBody(req, model), stream: true },
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

    // Buffer deltas from the pump callback; the generator drains between reads.
    const pending: string[] = [];
    let text = '';
    let stop: string | undefined;
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

        let resolveWake: (() => void) | null = null;
        const wake = () => { resolveWake?.(); resolveWake = null; };
        let finished = false;
        let pumpErr: unknown = null;
        void pumpSseBody(res.body, (ev) => {
            const p = target.parse(ev.data);
            if (p.delta) pending.push(p.delta);
            if (p.stop) stop = p.stop;
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
            // Thinking/reasoning ate the budget → the non-streaming path already
            // retries once at retryBudget (and meters itself). Yield its text whole.
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
    recordLlmUsage({
        provider: target.provider,
        model: target.model,
        promptChars: (req.prompt?.length ?? 0) + (req.systemPrompt?.length ?? 0),
        responseChars: text.length,
    });
    yield { delta: '', text, done: true };
    return text;
}
