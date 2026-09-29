/**
 * personaStream — streaming LLM client for the Persona Studio (SSE over
 * fetch, browser-direct). Mirrors llmClient.ts per-provider request shapes
 * (including the `anthropic-dangerous-direct-browser-access: true` header)
 * plus `stream: true`, invoking `onDelta` per text chunk so the persona can
 * start speaking sentence-by-sentence before the reply finishes.
 *
 * Supports openai / local / custom (OpenAI-compatible SSE) and anthropic
 * (content_block_delta events). Returns null WITHOUT fetching when the active
 * provider can't stream (gemini) or isn't configured/enabled — callers fall
 * back to the non-streaming `callLlm`.
 *
 * The two line-parsers are exported pure so they unit-test without a browser
 * (mirrors personaEngine discipline).
 *
 * 2026-07-05 created (Persona Studio arc — streamed speech).
 */

import { LlmError } from '../../lib/llmClient';
import type { LlmRequest, LlmResponse, LlmUsage } from '../../lib/llmClient';
import { recordLlmUsage, currentUsageUserId } from '../../lib/llmUsageStore';
// Plan 068 (A1): reuse llmStream's per-provider SSE usage parsers (same field
// names/shapes llmClient's non-streaming parsers use) rather than reimplement them.
import { parseAnthropicStreamData, parseOpenAiStreamData } from '../../lib/llmStream';
import { DEFAULT_MODELS } from '../../types/integrations';
import type { IntegrationsBundle, LlmProvider } from '../../types/integrations';

// ── Pure SSE line parsers ─────────────────────────────────────────────

/** Parse one SSE line from an OpenAI-compatible /chat/completions stream. Returns the text delta or null. Pure. */
export function extractOpenAiCompatDelta(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return null;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return null;
    try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        return typeof delta === 'string' && delta.length > 0 ? delta : null;
    } catch {
        return null;                                    // malformed line — skip, never throw mid-stream
    }
}

/** Parse one SSE line from an Anthropic /v1/messages stream (content_block_delta → delta.text). Returns delta or null. Pure. */
export function extractAnthropicDelta(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return null;
    const payload = trimmed.slice(5).trim();
    if (!payload) return null;
    try {
        const json = JSON.parse(payload);
        if (json?.type !== 'content_block_delta') return null;
        const text = json?.delta?.text;
        return typeof text === 'string' && text.length > 0 ? text : null;
    } catch {
        return null;                                    // malformed line — skip, never throw mid-stream
    }
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Stream a completion through the user's active provider, invoking onDelta
 * per text chunk. Supports openai / local / custom (OpenAI-compatible
 * stream:true) and anthropic (stream:true). Returns the full LlmResponse when
 * done. Returns null WITHOUT fetching when the active provider can't stream
 * (gemini) or isn't configured/enabled — caller falls back to callLlm.
 * modelOverride applies only when active === 'openai' and non-empty (else
 * provider's configured model, else DEFAULT_MODELS).
 */
export async function streamLlm(
    req: LlmRequest,
    llm: IntegrationsBundle['llm'],
    modelOverride: string,
    onDelta: (delta: string) => void,
): Promise<LlmResponse | null> {
    const active = llm.active;
    if (!active) return null;

    switch (active) {
        case 'anthropic': {
            if (!llm.anthropic?.enabled || !llm.anthropic.apiKey) return null;
            return streamAnthropic(req, llm.anthropic.apiKey, llm.anthropic.model || DEFAULT_MODELS.anthropic, onDelta);
        }
        case 'openai': {
            if (!llm.openai?.enabled || !llm.openai.apiKey) return null;
            const model = (modelOverride && modelOverride.trim()) || llm.openai.model || DEFAULT_MODELS.openai;
            return streamOpenAiCompat(req, 'openai', 'https://api.openai.com/v1/chat/completions', llm.openai.apiKey, model, onDelta);
        }
        case 'gemini':
            return null;                                // Gemini's SSE shape differs — caller falls back to callLlm
        case 'local': {
            if (!llm.local?.enabled || !llm.local.baseUrl) return null;
            const url = `${llm.local.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
            return streamOpenAiCompat(req, 'local', url, null, llm.local.model || DEFAULT_MODELS.local, onDelta);
        }
        case 'custom': {
            if (!llm.custom?.enabled || !llm.custom.baseUrl || !llm.custom.apiKey || !llm.custom.model) return null;
            const trimmed = llm.custom.baseUrl.replace(/\/$/, '');
            const url = trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
            return streamOpenAiCompat(req, 'custom', url, llm.custom.apiKey, llm.custom.model, onDelta);
        }
    }
}

// ── SSE pump ──────────────────────────────────────────────────────────

/** `data: [DONE]` sentinel — ends an OpenAI-compatible stream. */
function isDoneLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('data:') && trimmed.slice(5).trim() === '[DONE]';
}

/** Strip the `data:` SSE prefix, or null for non-data lines / the `[DONE]` sentinel. */
function sseDataPayload(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return null;
    const payload = trimmed.slice(5).trim();
    return payload && payload !== '[DONE]' ? payload : null;
}

interface PumpResult { text: string; usage: Partial<LlmUsage>; sawUsage: boolean }

/**
 * Read an SSE body line-by-line, feeding each line through the pure extractor
 * and forwarding non-empty deltas to onDelta. Returns the accumulated text
 * plus any provider usage parsed along the way (A1: same partial-update-merge
 * discipline as llmStream.ts — Anthropic's input arrives separately from its
 * output; later fields overwrite).
 */
async function pumpSse(
    body: ReadableStream<Uint8Array>,
    extract: (line: string) => string | null,
    onDelta: (delta: string) => void,
    parseUsage: (payload: string) => Partial<LlmUsage> | undefined,
): Promise<PumpResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let full = '';
    let usageAcc: Partial<LlmUsage> = {};
    let sawUsage = false;

    const feed = (line: string) => {
        const delta = extract(line);                    // blank/comment/event/malformed lines → null
        if (delta) {
            full += delta;
            onDelta(delta);
        }
        const payload = sseDataPayload(line);
        if (payload) {
            const u = parseUsage(payload);
            if (u && Object.keys(u).length) { usageAcc = { ...usageAcc, ...u }; sawUsage = true; }
        }
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        let nl = lineBuffer.indexOf('\n');
        let finished = false;
        while (nl !== -1) {
            const line = lineBuffer.slice(0, nl);
            lineBuffer = lineBuffer.slice(nl + 1);
            if (isDoneLine(line)) { finished = true; break; }
            feed(line);
            nl = lineBuffer.indexOf('\n');
        }
        if (finished) {
            await reader.cancel().catch(() => { /* already closed */ });
            return { text: full, usage: usageAcc, sawUsage };
        }
    }
    if (lineBuffer.trim() && !isDoneLine(lineBuffer)) feed(lineBuffer);
    return { text: full, usage: usageAcc, sawUsage };
}

/** Builds the measured LlmUsage (both counts present) or undefined — same shape recordLlmUsage expects. */
function toMeasuredUsage(usage: Partial<LlmUsage>, sawUsage: boolean): LlmUsage | undefined {
    if (!sawUsage || typeof usage.inputTokens !== 'number' || typeof usage.outputTokens !== 'number') return undefined;
    return {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ...(usage.cacheReadTokens ? { cacheReadTokens: usage.cacheReadTokens } : {}),
        ...(usage.cacheWriteTokens ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
    };
}

// ── Provider implementations ──────────────────────────────────────────

/** promptChars fallback-estimate input, shared by both provider paths (A1). */
function promptChars(req: LlmRequest): number {
    return (req.prompt?.length ?? 0) + (req.systemPrompt?.length ?? 0);
}

async function streamOpenAiCompat(
    req: LlmRequest,
    provider: LlmProvider,
    url: string,
    apiKey: string | null,
    model: string,
    onDelta: (delta: string) => void,
): Promise<LlmResponse | null> {
    // Plan 068 (A1/C4): capture the ledger owner BEFORE the fetch, same
    // discipline as callLlm/streamLlm(llmStream.ts).
    const userId = currentUsageUserId();
    let billable = false;
    let text = '';
    let usage: LlmUsage | undefined;
    try {
        const body: any = {
            model,
            max_tokens: req.maxTokens ?? 1024,
            temperature: req.temperature ?? 0.3,
            stream: true,
            messages: [
                ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
                { role: 'user', content: req.prompt },
            ],
        };
        if (req.responseFormat === 'json') body.response_format = { type: 'json_object' };
        // A1: ask for a final usage chunk — only the real OpenAI endpoint; local/custom
        // OpenAI-compatible servers may reject the unknown field.
        if (provider === 'openai') body.stream_options = { include_usage: true };
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new LlmError(provider, res.status, errText || `HTTP ${res.status}`);
        }
        // From here the provider has accepted the request — it bills us either way.
        billable = true;
        if (!res.body) {
            // Some test envs surface no stream body — fall back to a plain JSON read.
            try {
                const json = await res.json();
                text = json?.choices?.[0]?.message?.content ?? '';
                if (text) {
                    onDelta(text);
                    return { text, provider, model };
                }
            } catch { /* no usable body */ }
            return null;
        }
        const result = await pumpSse(res.body, extractOpenAiCompatDelta, onDelta, (p) => parseOpenAiStreamData(p).usage);
        text = result.text;
        usage = toMeasuredUsage(result.usage, result.sawUsage);
        return { text, provider, model, usage };
    } finally {
        if (billable) {
            recordLlmUsage({ provider, model, promptChars: promptChars(req), responseChars: text.length, usage, source: req.source, userId });
        }
    }
}

async function streamAnthropic(
    req: LlmRequest,
    apiKey: string,
    model: string,
    onDelta: (delta: string) => void,
): Promise<LlmResponse | null> {
    const userId = currentUsageUserId();
    let billable = false;
    let text = '';
    let usage: LlmUsage | undefined;
    try {
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
                stream: true,
                system: req.systemPrompt,
                messages: [{ role: 'user', content: req.prompt }],
            }),
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new LlmError('anthropic', res.status, errText || `HTTP ${res.status}`);
        }
        billable = true;
        if (!res.body) {
            // Some test envs surface no stream body — fall back to a plain JSON read.
            try {
                const json = await res.json();
                text = json?.content?.[0]?.text ?? '';
                if (text) {
                    onDelta(text);
                    return { text, provider: 'anthropic', model };
                }
            } catch { /* no usable body */ }
            return null;
        }
        const result = await pumpSse(res.body, extractAnthropicDelta, onDelta, (p) => parseAnthropicStreamData(p).usage);
        text = result.text;
        usage = toMeasuredUsage(result.usage, result.sawUsage);
        return { text, provider: 'anthropic', model, usage };
    } finally {
        if (billable) {
            recordLlmUsage({ provider: 'anthropic', model, promptChars: promptChars(req), responseChars: text.length, usage, source: req.source, userId });
        }
    }
}
