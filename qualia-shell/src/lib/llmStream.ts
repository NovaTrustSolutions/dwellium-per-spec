/**
 * llmStream — token-streaming wrapper over the central llmClient (assessment
 * sweep 2026-06-12, upgrade #6: "replies arrive as blobs; streaming tokens
 * would make the conductor feel twice as fast at zero model cost").
 *
 * Today the providers are called non-streaming. This wrapper exposes a
 * streaming-shaped API that ARA (and any widget) can adopt incrementally:
 * when a provider+flag support true SSE streaming it yields tokens as they
 * arrive; otherwise it falls back to the existing single-shot callLlm and
 * yields the whole result once. Callers code against the streaming API and
 * get progressive output for free the moment per-provider SSE lands — no
 * call-site change. Reversible: the ARA streaming FLAG (araPrefsStore) gates
 * whether the console uses this path at all.
 */

import { callLlm, type LlmRequest } from './llmClient';
import type { IntegrationsBundle } from '../types/integrations';

export interface StreamEvent {
    /** Incremental text chunk. */
    delta: string;
    /** Cumulative text so far. */
    text: string;
    /** True on the final event. */
    done: boolean;
}

/**
 * Stream a completion. Yields incremental StreamEvents. Falls back to a single
 * final event when streaming isn't available for the active provider. Returns
 * the full text, or null if no provider is configured.
 */
export async function* streamLlm(
    req: LlmRequest,
    llm: IntegrationsBundle['llm'],
): AsyncGenerator<StreamEvent, string | null, void> {
    // Per-provider SSE is a follow-up (each provider needs its own stream
    // parser + the chokepoint metering moved to onComplete). Until then we
    // degrade to the existing single-shot path so callers work today.
    const res = await callLlm(req, llm);
    if (!res) return null;
    yield { delta: res.text, text: res.text, done: true };
    return res.text;
}

/** True once at least one provider implements real SSE (flips with that work). */
export const STREAMING_AVAILABLE = false;
