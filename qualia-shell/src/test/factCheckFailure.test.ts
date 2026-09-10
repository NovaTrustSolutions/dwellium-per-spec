import { describe, expect, it } from 'vitest';
import { describeBackendFailure, describeFactCheckFailure } from '../lib/factCheckFailure';

describe('Fact Check failure wording', () => {
    it('names a missing provider only when no provider is active', () => {
        const text = describeFactCheckFailure({ llmActive: false, backendError: describeBackendFailure('network', 'Failed to fetch') });
        expect(text).toMatch(/No LLM provider is active/);
        expect(text).toMatch(/backend unreachable \(Failed to fetch\)/);
    });

    it('never claims "no LLM configured" when the provider is active but failed', () => {
        const text = describeFactCheckFailure({
            llmActive: true,
            llmProvider: 'anthropic',
            llmError: '[anthropic] HTTP 401 invalid x-api-key',
            backendError: describeBackendFailure('not-json', 504),
        });
        expect(text).not.toMatch(/No LLM/i);
        expect(text).toMatch(/anthropic LLM call failed: \[anthropic\] HTTP 401 invalid x-api-key/);
        expect(text).toMatch(/non-JSON body \(HTTP 504\)/);
    });

    it('describes each backend failure kind', () => {
        expect(describeBackendFailure('http', 429)).toBe('backend answered HTTP 429');
        expect(describeBackendFailure('rejected', 'success=false')).toBe('backend rejected the request (success=false)');
        expect(describeBackendFailure('network')).toBe('backend unreachable (network error)');
    });
});
