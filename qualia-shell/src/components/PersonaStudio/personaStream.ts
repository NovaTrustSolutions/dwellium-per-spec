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
import type { LlmRequest, LlmResponse } from '../../lib/llmClient';
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

/**
 * Read an SSE body line-by-line, feeding each line through the pure extractor
 * and forwarding non-empty deltas to onDelta. Returns the accumulated text.
 */
async function pumpSse(
    body: ReadableStream<Uint8Array>,
    extract: (line: string) => string | null,
    onDelta: (delta: string) => void,
): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let full = '';

    const feed = (line: string) => {
        const delta = extract(line);                    // blank/comment/event/malformed lines → null
        if (delta) {
            full += delta;
            onDelta(delta);
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
            return full;
        }
    }
    if (lineBuffer.trim() && !isDoneLine(lineBuffer)) feed(lineBuffer);
    return full;
}

// ── Provider implementations ──────────────────────────────────────────

async function streamOpenAiCompat(
    req: LlmRequest,
    provider: LlmProvider,
    url: string,
    apiKey: string | null,
    model: string,
    onDelta: (delta: string) => void,
): Promise<LlmResponse | null> {
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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new LlmError(provider, res.status, errText || `HTTP ${res.status}`);
    }
    if (!res.body) {
        // Some test envs surface no stream body — fall back to a plain JSON read.
        try {
            const json = await res.json();
            const text = json?.choices?.[0]?.message?.content ?? '';
            if (text) {
                onDelta(text);
                return { text, provider, model };
            }
        } catch { /* no usable body */ }
        return null;
    }
    const text = await pumpSse(res.body, extractOpenAiCompatDelta, onDelta);
    return { text, provider, model };
}

async function streamAnthropic(
    req: LlmRequest,
    apiKey: string,
    model: string,
    onDelta: (delta: string) => void,
): Promise<LlmResponse | null> {
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
    if (!res.body) {
        // Some test envs surface no stream body — fall back to a plain JSON read.
        try {
            const json = await res.json();
            const text = json?.content?.[0]?.text ?? '';
            if (text) {
                onDelta(text);
                return { text, provider: 'anthropic', model };
            }
        } catch { /* no usable body */ }
        return null;
    }
    const text = await pumpSse(res.body, extractAnthropicDelta, onDelta);
    return { text, provider: 'anthropic', model };
}
