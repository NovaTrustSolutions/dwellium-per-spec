/**
 * agentActivityStore — plan 071 phase 3 W1-A. Recording at the callLlm
 * chokepoint (success/failure/snippet-hiding/ownership-guard/isolation), plus
 * a callLlm integration test tagging a real request with `source`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    agentActivityStore,
    recordAgentActivity,
    currentAgentActivityUserId,
    agentActivityUserIdHolder,
    HIDDEN_SNIPPET,
} from '../lib/agentActivityStore';
import { callLlm } from '../lib/llmClient';
import { llmUsageUserIdHolder } from '../lib/llmUsageStore';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const anthropicLlm = { active: 'anthropic', anthropic: { enabled: true, apiKey: 'k', model: 'claude-opus-5' } } as any;

describe('agentActivityStore', () => {
    beforeEach(() => {
        localStorage.clear();
        agentActivityStore.reset();
        agentActivityUserIdHolder.current = null;
    });

    it('records a successful call with a clipped snippet', () => {
        agentActivityUserIdHolder.current = 'andy';
        recordAgentActivity({ source: 'synthesis', ok: true, text: 'a'.repeat(200), userId: 'andy' });
        const entry = agentActivityStore.getSnapshot().synthesis;
        expect(entry.ok).toBe(true);
        expect(entry.snippet?.length).toBeLessThanOrEqual(140);
        expect(entry.snippet?.endsWith('…')).toBe(true);
    });

    it('hides a snippet that looks like a secret', () => {
        agentActivityUserIdHolder.current = 'andy';
        recordAgentActivity({ source: 'synthesis', ok: true, text: 'api_key is sk-abcdefghijklmnopqrstuvwx', userId: 'andy' });
        expect(agentActivityStore.getSnapshot().synthesis.snippet).toBe(HIDDEN_SNIPPET);
    });

    it('a long normal answer whose secret-looking text sits past char 140 still shows its (clean) snippet', () => {
        agentActivityUserIdHolder.current = 'andy';
        const text = `${'word '.repeat(40)}api_key is sk-abcdefghijklmnopqrstuvwx`; // secret text starts well past 140
        recordAgentActivity({ source: 'synthesis', ok: true, text, userId: 'andy' });
        const snippet = agentActivityStore.getSnapshot().synthesis.snippet;
        expect(snippet).not.toBe(HIDDEN_SNIPPET);
        expect(snippet).not.toMatch(/sk-/);
    });

    it('records a failure with an error and no snippet', () => {
        agentActivityUserIdHolder.current = 'andy';
        recordAgentActivity({ source: 'stella', ok: false, error: 'HTTP 429', userId: 'andy' });
        const entry = agentActivityStore.getSnapshot().stella;
        expect(entry.ok).toBe(false);
        expect(entry.error).toBe('HTTP 429');
        expect(entry.snippet).toBeUndefined();
    });

    it('drops the write when userId no longer matches the current owner', () => {
        agentActivityUserIdHolder.current = 'andy';
        recordAgentActivity({ source: 'synthesis', ok: true, text: 'hi', userId: 'lisa' }); // captured before an account switch
        expect(agentActivityStore.getSnapshot().synthesis).toBeUndefined();
    });

    it('no source → nothing recorded', () => {
        agentActivityUserIdHolder.current = 'andy';
        recordAgentActivity({ ok: true, text: 'hi', userId: 'andy' });
        expect(Object.keys(agentActivityStore.getSnapshot())).toHaveLength(0);
    });

    it('per-user key isolation: andy and lisa each see only their own activity', () => {
        agentActivityUserIdHolder.current = 'andy';
        recordAgentActivity({ source: 'hydra', ok: true, text: 'andy answer', userId: 'andy' });
        expect(agentActivityStore.getSnapshot().hydra?.snippet).toBe('andy answer');

        agentActivityUserIdHolder.current = 'lisa';
        expect(agentActivityStore.getSnapshot().hydra).toBeUndefined();
        recordAgentActivity({ source: 'hydra', ok: true, text: 'lisa answer', userId: 'lisa' });
        expect(agentActivityStore.getSnapshot().hydra?.snippet).toBe('lisa answer');

        agentActivityUserIdHolder.current = 'andy';
        expect(agentActivityStore.getSnapshot().hydra?.snippet).toBe('andy answer');
    });

    it('currentAgentActivityUserId reflects the holder', () => {
        agentActivityUserIdHolder.current = 'andy';
        expect(currentAgentActivityUserId()).toBe('andy');
        agentActivityUserIdHolder.current = null;
        expect(currentAgentActivityUserId()).toBeNull();
    });
});

describe('agentActivityStore x callLlm chokepoint integration', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.restoreAllMocks();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        localStorage.clear();
        agentActivityStore.reset();
        agentActivityUserIdHolder.current = 'andy';
        // callLlm captures its userId from llmUsageUserIdHolder (currentUsageUserId()),
        // then passes it to recordAgentActivity, which checks it against
        // agentActivityUserIdHolder — both must agree for the write to land.
        llmUsageUserIdHolder.current = 'andy';
    });
    afterEach(() => vi.unstubAllGlobals());

    it("a successful call tagged source:'synthesis' records activity", async () => {
        fetchMock.mockResolvedValue(jsonResponse({
            content: [{ type: 'text', text: 'Hello from synthesis' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
        }));
        await callLlm({ prompt: 'hi', source: 'synthesis' }, anthropicLlm);
        const entry = agentActivityStore.getSnapshot().synthesis;
        expect(entry.ok).toBe(true);
        expect(entry.snippet).toBe('Hello from synthesis');
    });

    it('a failing call records ok:false with an error', async () => {
        fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
        await expect(callLlm({ prompt: 'hi', source: 'synthesis' }, anthropicLlm)).rejects.toThrow();
        const entry = agentActivityStore.getSnapshot().synthesis;
        expect(entry.ok).toBe(false);
        expect(entry.error).toBeTruthy();
    });
});
