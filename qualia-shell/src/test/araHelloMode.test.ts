/**
 * araHelloMode — plan 056 §1 HARD RULE: hello mode sends ONLY the fixed
 * orientation system prompt + the user's typed text. No Authorization header,
 * no context from any store, exact URL/model. Plus a structural guard: the
 * module imports nothing (so no store can ever leak in).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    HELLO_MODE_MODEL, HELLO_MODE_SYSTEM_PROMPT, HELLO_MODE_URL, buildHelloModeRequest, callHelloMode,
} from '../lib/araHelloMode';

afterEach(() => vi.unstubAllGlobals());

describe('araHelloMode', () => {
    it('hello-mode body guard: outgoing body is exactly {system prompt, user text}, no auth, correct URL', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: async () => ({ choices: [{ message: { content: '  Hi! I\'m ARA.  ' } }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const text = await callHelloMode('What can you help me with in Dwellium?');
        expect(text).toBe('Hi! I\'m ARA.');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
        expect(url).toBe('https://text.pollinations.ai/openai');
        expect(url).toBe(HELLO_MODE_URL);
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({ 'Content-Type': 'application/json' }); // no Authorization key at all
        expect(JSON.parse(init.body)).toEqual({
            model: HELLO_MODE_MODEL,
            messages: [
                { role: 'system', content: HELLO_MODE_SYSTEM_PROMPT },
                { role: 'user', content: 'What can you help me with in Dwellium?' },
            ],
            stream: false,
        });
        expect(HELLO_MODE_MODEL).toBe('openai');
        expect(HELLO_MODE_SYSTEM_PROMPT).toMatch(/NO access to any property, tenant, or financial data/);
    });

    it('buildHelloModeRequest is pure: same text → identical body, user text is the ONLY variable', () => {
        const a = buildHelloModeRequest('hello');
        const b = buildHelloModeRequest('hello');
        expect(a.body).toBe(b.body);
        const diff = buildHelloModeRequest('different');
        expect(JSON.parse(diff.body).messages[0]).toEqual(JSON.parse(a.body).messages[0]);
        expect(JSON.parse(a.body).messages).toHaveLength(2);
    });

    it('structural guard: the module has no imports (no store, no context, no researchLlm can leak in)', () => {
        const src = readFileSync(resolve(process.cwd(), 'src/lib/araHelloMode.ts'), 'utf8');
        expect(src).not.toMatch(/^\s*(import|export\s+\*|export\s+\{[^}]*\}\s+from)\s/m);
        expect(src).not.toMatch(/import\s*\(/); // no dynamic imports either
    });

    it('throws on HTTP error / empty reply so ARA falls to its error surface', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
        await expect(callHelloMode('x')).rejects.toThrow('Hello mode HTTP 429');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [] }) }));
        await expect(callHelloMode('x')).rejects.toThrow('empty reply');
    });
});
