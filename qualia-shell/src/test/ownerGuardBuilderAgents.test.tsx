/**
 * Owner-race guard coverage for BuilderAgents' `run` (§8.6/8.7/8.8 agents).
 * Same shape as src/test/ownerGuardAra.test.ts: drive `callLlm` through a
 * deferred promise, switch the active user mid-await via setPerUserIdentity,
 * and assert the switched-away account's CoPaw memory (copawStore) never
 * receives the pending result and the output never renders.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setPerUserIdentity, copawUserIdHolder } from '../lib/perUserIdentity';
import { copawStore } from '../components/Hive/copawStore';

const callLlmMock = vi.fn();
vi.mock('../lib/llmClient', () => ({
    hasActiveLlm: () => true,
    callLlm: (...args: any[]) => callLlmMock(...args),
}));
vi.mock('../hooks/useAIAvailability', () => ({
    useAIAvailability: () => ({ status: 'ready', ready: true, reason: null, configure: () => {}, recheck: () => {} }),
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: 'anthropic', anthropic: { enabled: true, apiKey: 'test' } } }, update: () => {}, replace: () => {}, clear: () => {}, removeSecret: () => {} }),
}));
// BuilderAgents' usePerUserIdentity() reads the real UserContext (no provider
// here) and would overwrite our manual setPerUserIdentity() on every render.
// Stub it to a no-op so the test drives ownership directly, same as
// ownerGuardAra.test.ts's approach.
vi.mock('../lib/perUserIdentity', async (orig) => ({ ...(await orig<any>()), usePerUserIdentity: () => {} }));

import BuilderAgents from '../components/BuilderAgents/BuilderAgents';

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

/** Read a user's CoPaw memory snapshot without disturbing the live holder. */
function copawFor(userId: string | null) {
    const prev = copawUserIdHolder.current;
    copawUserIdHolder.current = userId;
    const snap = copawStore.getSnapshot();
    copawUserIdHolder.current = prev;
    return snap;
}

const FACT_SENTENCE = 'The vendor invoice must include a purchase order number for approval.';

function fillAndRun() {
    fireEvent.change(screen.getByPlaceholderText(/maintenance work order/i), { target: { value: 'A work order with status and vendor.' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Schema Producer/i }));
}

describe('BuilderAgents — owner-race guard on run()', () => {
    beforeEach(() => {
        callLlmMock.mockReset();
        copawStore.reset();
        setPerUserIdentity(null);
    });

    it('account switches mid-LLM-call (A → B) → output is dropped, neither user gets CoPaw facts', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);

        render(<BuilderAgents />);
        fillAndRun();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));

        setPerUserIdentity(null);      // logout mid-await
        setPerUserIdentity('user-b');  // switch account mid-await
        d.resolve({ text: FACT_SENTENCE });
        await Promise.resolve(); await Promise.resolve();

        expect(screen.queryByText(FACT_SENTENCE)).toBeNull();
        expect(copawFor('user-a')).toEqual([]);
        expect(copawFor('user-b')).toEqual([]);
    });

    it('control: no switch → output renders and IS captured under the original owner', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);

        render(<BuilderAgents />);
        fillAndRun();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));

        d.resolve({ text: FACT_SENTENCE });
        await waitFor(() => expect(screen.getByText(FACT_SENTENCE)).toBeInTheDocument());

        expect(copawFor('user-a')).toHaveLength(1);
        expect(copawFor('user-a')[0].text).toBe(FACT_SENTENCE);
    });
});
