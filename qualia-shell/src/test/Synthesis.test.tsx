/**
 * Synthesis Lab widget tests (plan 070 phase 1, wave 2).
 *
 * Covers: owner-race guard on the async LLM call, CoPaw facts only on
 * Capture (never on a bare Synthesize), the answer/question split (editing
 * the textarea never changes what Capture saves), second-layer parentId
 * lineage through captured ancestors, per-item + clear-all delete with
 * confirm(), tag persistence across Capture, and the quota error surface.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setPerUserIdentity, copawUserIdHolder } from '../lib/perUserIdentity';
import { synthesisStore, synthesisUserIdHolder } from '../components/Synthesis/synthesisStore';
import { copawStore } from '../components/Hive/copawStore';
import { tagStore, tagsForItem } from '../lib/tagStore';

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
// Synthesis's usePerUserIdentity() reads the real UserContext (no provider
// here) and would overwrite our manual setPerUserIdentity() on every render.
// Stub it to a no-op so the test drives ownership directly (ownerGuardBuilderAgents.test.tsx pattern).
vi.mock('../lib/perUserIdentity', async (orig) => ({ ...(await orig<any>()), usePerUserIdentity: () => {} }));

import Synthesis from '../components/Synthesis/Synthesis';
import { UserContext } from '../context/UserContext';

function asUser(id: string) {
    return (
        <UserContext.Provider value={{ user: { id } } as unknown as React.ContextType<typeof UserContext>}>
            <Synthesis />
        </UserContext.Provider>
    );
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** Read a user's CoPaw memory snapshot without disturbing the live holder. */
function copawFor(userId: string | null) {
    const prev = copawUserIdHolder.current;
    copawUserIdHolder.current = userId;
    const snap = copawStore.getSnapshot();
    copawUserIdHolder.current = prev;
    return snap;
}

/** Read a user's synthesis snapshot without disturbing the live holder. */
function synthesisFor(userId: string | null) {
    const prev = synthesisUserIdHolder.current;
    synthesisUserIdHolder.current = userId;
    const snap = synthesisStore.getSnapshot();
    synthesisUserIdHolder.current = prev;
    return snap;
}

const FACT_SENTENCE = 'The vendor invoice must include a purchase order number for approval.';

function typeQuery(text: string) {
    fireEvent.change(screen.getByLabelText('Question to synthesize'), { target: { value: text } });
}

function clickSynthesize() {
    fireEvent.click(screen.getByRole('button', { name: /^Synthesize$/ }));
}

beforeEach(() => {
    callLlmMock.mockReset();
    synthesisStore.reset();
    copawStore.reset();
    tagStore.reset();
    localStorage.clear();
    setPerUserIdentity(null);
});

describe('Synthesis Lab', () => {
    it('(g) CoPaw gets facts only after Capture, never on a bare Synthesize', async () => {
        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);
        render(<Synthesis />);
        typeQuery('What drives churn?');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        d.resolve({ text: FACT_SENTENCE });
        await waitFor(() => expect(screen.getByText(FACT_SENTENCE)).toBeInTheDocument());

        // MUTATION-CHECK (g): no facts yet — synthesize alone must never call captureFacts.
        expect(copawFor(null)).toEqual([]);

        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        expect(copawFor(null)).toHaveLength(1);
        expect(copawFor(null)[0].text).toBe(FACT_SENTENCE);
    });

    it('(d) Capture is disabled while busy; editing the textarea after a run never changes what Capture saves', async () => {
        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);
        render(<Synthesis />);
        typeQuery('Original question');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        d.resolve({ text: 'The original answer body.' });
        await waitFor(() => expect(screen.getByText('The original answer body.')).toBeInTheDocument());

        // Edit the textarea post-run — the on-screen ANSWER must not change.
        typeQuery('A totally different, edited question');
        expect(screen.getByText('The original answer body.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        const snap = synthesisFor(null);
        expect(snap).toHaveLength(1);
        expect(snap[0].query).toBe('Original question');
        expect(snap[0].result).toBe('The original answer body.');

        // MUTATION-CHECK (d) part 2: busy-disables-Capture — start a second run and
        // assert the Capture button is disabled mid-flight.
        const d2 = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d2.promise);
        typeQuery('second question');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(2));
        expect(screen.getByRole('button', { name: /Second-layer query/ })).toBeDisabled();
        d2.resolve({ text: 'second answer' });
        await waitFor(() => expect(screen.getByText('second answer')).toBeInTheDocument());
    });

    it('(c) a failed second-layer run keeps the layer-1 answer on screen and shows no "layer 2" label', async () => {
        const d1 = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d1.promise);
        render(<Synthesis />);
        typeQuery('layer one question');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        d1.resolve({ text: 'layer one answer' });
        await waitFor(() => expect(screen.getByText('layer one answer')).toBeInTheDocument());

        const d2 = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d2.promise);
        fireEvent.click(screen.getByRole('button', { name: /Second-layer query/ }));
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(2));
        d2.reject(new Error('LLM exploded'));
        await waitFor(() => expect(screen.getByText('LLM exploded')).toBeInTheDocument());

        // MUTATION-CHECK (c): the layer-1 answer must survive the failed second-layer run.
        expect(screen.getByText('layer one answer')).toBeInTheDocument();
        expect(screen.queryByText(/layer 2/)).toBeNull();
    });

    it('(h) second-layer after Capture records parentId = the captured id and layer 2', async () => {
        const d1 = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d1.promise);
        render(<Synthesis />);
        typeQuery('root question');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        d1.resolve({ text: 'root answer' });
        await waitFor(() => expect(screen.getByText('root answer')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        const capturedId = synthesisFor(null)[0].id;

        const d2 = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d2.promise);
        fireEvent.click(screen.getByRole('button', { name: /Second-layer query/ }));
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(2));
        d2.resolve({ text: 'second layer answer' });
        await waitFor(() => expect(screen.getByText('second layer answer')).toBeInTheDocument());
        expect(screen.getAllByText(/layer 2/).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        const snap = synthesisFor(null);
        const secondLayer = snap.find((s) => s.result === 'second layer answer');
        expect(secondLayer?.layer).toBe(2);
        expect(secondLayer?.parentId).toBe(capturedId);
    });

    it('(e) tags added before Capture remain attached to the same id after Capture', async () => {
        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);
        render(<Synthesis />);
        typeQuery('tag me');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        d.resolve({ text: 'tagged answer body' });
        await waitFor(() => expect(screen.getByText('tagged answer body')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText('Add a tag'), { target: { value: 'important' } });
        fireEvent.keyDown(screen.getByLabelText('Add a tag'), { key: 'Enter' });
        await waitFor(() => expect(screen.getByText('#important')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        const capturedId = synthesisFor(null)[0].id;
        expect(tagsForItem(tagStore.getSnapshot(), 'synthesis', capturedId)).toEqual(['important']);
    });

    it('(a) clear-all: confirm() false keeps captures, true clears them', async () => {
        setPerUserIdentity('andy');
        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);
        render(<Synthesis />);
        typeQuery('q1');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        d.resolve({ text: 'a1' });
        await waitFor(() => expect(screen.getByText('a1')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        expect(synthesisFor('andy')).toHaveLength(1);

        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        fireEvent.click(screen.getByRole('button', { name: 'Delete all captured syntheses' }));
        expect(synthesisFor('andy')).toHaveLength(1);

        confirmSpy.mockReturnValue(true);
        fireEvent.click(screen.getByRole('button', { name: 'Delete all captured syntheses' }));
        expect(synthesisFor('andy')).toHaveLength(0);
        confirmSpy.mockRestore();
    });

    it('(b) per-item delete removes only that item after confirm', async () => {
        setPerUserIdentity('andy');
        render(<Synthesis />);

        for (const [q, a] of [['q1', 'a1'], ['q2', 'a2']] as const) {
            const d = deferred<{ text: string }>();
            callLlmMock.mockReturnValue(d.promise);
            typeQuery(q);
            clickSynthesize();
            await waitFor(() => expect(callLlmMock).toHaveBeenCalled());
            d.resolve({ text: a });
            await waitFor(() => expect(screen.getByText(a)).toBeInTheDocument());
            fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        }
        expect(synthesisFor('andy')).toHaveLength(2);

        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(screen.getByRole('button', { name: 'Delete synthesis: q1' }));
        confirmSpy.mockRestore();

        const remaining = synthesisFor('andy');
        expect(remaining).toHaveLength(1);
        expect(remaining[0].query).toBe('q2');
    });

    it('(i) a quota error on Capture shows the storage-full message', async () => {
        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);
        render(<Synthesis />);
        typeQuery('q');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        d.resolve({ text: 'answer body' });
        await waitFor(() => expect(screen.getByText('answer body')).toBeInTheDocument());

        const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new DOMException('full', 'QuotaExceededError');
        });
        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        setItemSpy.mockRestore();

        expect(await screen.findByText('Storage is full — delete some captured syntheses and try again.')).toBeInTheDocument();
        expect(synthesisFor(null)).toHaveLength(0);
    });

    it('(f) account switch mid-call: nothing renders, nothing lands in either user\'s synthesis or CoPaw store', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);
        render(<Synthesis />);
        typeQuery('q');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));

        setPerUserIdentity(null);      // logout mid-await
        setPerUserIdentity('user-b');  // switch account mid-await
        d.resolve({ text: FACT_SENTENCE });
        await Promise.resolve(); await Promise.resolve();

        expect(screen.queryByText(FACT_SENTENCE)).toBeNull();
        expect(synthesisFor('user-a')).toEqual([]);
        expect(synthesisFor('user-b')).toEqual([]);
        expect(copawFor('user-a')).toEqual([]);
        expect(copawFor('user-b')).toEqual([]);
    });
    it('(j) an account switch clears the previous user\'s on-screen answer so it cannot be captured', async () => {
        setPerUserIdentity('user-a');
        callLlmMock.mockResolvedValueOnce({ text: FACT_SENTENCE, provider: 'anthropic', model: 'x' });
        const { rerender } = render(asUser('user-a'));
        typeQuery('What does approval need?');
        clickSynthesize();
        await screen.findByText(FACT_SENTENCE);

        setPerUserIdentity('user-b');
        rerender(asUser('user-b'));
        expect(screen.queryByText(FACT_SENTENCE)).toBeNull();
        expect(screen.queryByRole('button', { name: /^Capture$/ })).toBeNull();
        expect((screen.getByLabelText('Question to synthesize') as HTMLTextAreaElement).value).toBe('');
        expect(synthesisFor('user-b')).toEqual([]);
        expect(copawFor('user-b')).toEqual([]);
    });
});
