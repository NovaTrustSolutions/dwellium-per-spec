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
import { synthesisStore, synthesisUserIdHolder, captureSynthesis } from '../components/Synthesis/synthesisStore';
import { copawStore } from '../components/Hive/copawStore';
import { tagStore, tagsForItem } from '../lib/tagStore';

const callLlmMock = vi.fn();
vi.mock('../lib/llmClient', () => ({
    hasActiveLlm: () => true,
    callLlm: (...args: any[]) => callLlmMock(...args),
}));
const recallPassagesMock = vi.fn();
vi.mock('../lib/memoryGraphRag/recall', () => ({
    recallPassages: (...args: any[]) => recallPassagesMock(...args),
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

function passage(over: Partial<{ passageId: string; sourceId: string; sourceKind: string; title: string; text: string; score: number }> = {}) {
    return {
        passageId: over.passageId ?? `p-${Math.random().toString(36).slice(2, 8)}`,
        sourceId: over.sourceId ?? 'tag:1',
        sourceKind: over.sourceKind ?? 'tag',
        title: over.title ?? 'A saved note',
        text: over.text ?? 'Some saved text.',
        score: over.score ?? 0.9,
    };
}

async function typeQueryAndWaitForPreview(text: string) {
    typeQuery(text);
    await waitFor(() => expect(recallPassagesMock).toHaveBeenCalled(), { timeout: 2000 });
}

beforeEach(() => {
    callLlmMock.mockReset();
    recallPassagesMock.mockReset();
    recallPassagesMock.mockResolvedValue([]);
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
        fireEvent.click(screen.getByRole('button', { name: /^Delete synthesis: q1/ }));
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

describe('Synthesis Lab — retrieval, citations, cancel (plan 070 phase 2)', () => {
    it('(a) preview shows sources; unticking removes it from the prompt sent to callLlm and from captured sources — MUTATION-CHECK', async () => {
        recallPassagesMock.mockResolvedValue([
            passage({ passageId: 'p1', sourceId: 'tag:1', sourceKind: 'tag', title: 'Keep Me' }),
            passage({ passageId: 'p2', sourceId: 'tag:2', sourceKind: 'tag', title: 'Drop Me' }),
        ]);
        render(<Synthesis />);
        await typeQueryAndWaitForPreview('What does the vendor policy say?');
        await screen.findByText('Sources (2)');
        fireEvent.click(screen.getByRole('checkbox', { name: /Drop Me/ }));

        callLlmMock.mockResolvedValue({ text: 'the answer citing [1]' });
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        const sentPrompt = callLlmMock.mock.calls[0][0].prompt;
        expect(sentPrompt).toContain('Keep Me');
        expect(sentPrompt).not.toContain('Drop Me');

        await screen.findByText(/the answer citing/);
        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        const snap = synthesisFor(null);
        expect(snap[0].sources).toEqual([{ sourceId: 'tag:1', sourceKind: 'tag', title: 'Keep Me' }]);
    });

    it('(b) no matching sources shows the general-knowledge note and sends the raw question as the prompt', async () => {
        recallPassagesMock.mockResolvedValue([]);
        render(<Synthesis />);
        await typeQueryAndWaitForPreview('A question nothing matches');
        await screen.findByText('No saved sources match — the answer will use general knowledge.');

        callLlmMock.mockResolvedValue({ text: 'plain answer' });
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        expect(callLlmMock.mock.calls[0][0].prompt).toBe('A question nothing matches');
    });

    it('(c) [1] renders as a button that opens the mapped widget; [9] out of range stays plain text — MUTATION-CHECK', async () => {
        recallPassagesMock.mockResolvedValue([passage({ passageId: 'p1', sourceId: 'tag:1', sourceKind: 'tag', title: 'Cited Source' })]);
        callLlmMock.mockResolvedValue({ text: 'See [1] and also [9] for more.' });
        render(<Synthesis />);
        await typeQueryAndWaitForPreview('question with citations');
        await screen.findByText('Sources (1)');
        clickSynthesize();
        await screen.findByRole('button', { name: /Open source 1: Cited Source/ });

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        fireEvent.click(screen.getByRole('button', { name: /Open source 1: Cited Source/ }));
        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'qualia-open-widget', detail: 'tag-file' }));
        dispatchSpy.mockRestore();

        // [9] is out of range for a 1-source answer — it must not become a button, only plain text.
        // (The renderer emits plain text runs, not per-token spans, so match the
        // surrounding text rather than an exact-text node.)
        expect(screen.queryByRole('button', { name: /Open source 9/ })).toBeNull();
        expect(screen.getByText(/\[9\] for more\./)).toBeInTheDocument();
    });

    it('(d) Cancel aborts the in-flight call; an AbortError rejection leaves no error banner and the previous answer intact — MUTATION-CHECK', async () => {
        callLlmMock.mockResolvedValueOnce({ text: 'first answer' });
        render(<Synthesis />);
        typeQuery('first question');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        await screen.findByText('first answer');

        const d = deferred<{ text: string }>();
        callLlmMock.mockReturnValue(d.promise);
        typeQuery('second question, cancel me');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(2));
        const signal: AbortSignal = callLlmMock.mock.calls[1][0].signal;
        expect(signal.aborted).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
        expect(signal.aborted).toBe(true);
        d.reject(new DOMException('Aborted', 'AbortError'));

        await waitFor(() => expect(screen.queryByRole('button', { name: /^Cancel$/ })).toBeNull());
        expect(screen.queryByText(/AbortError|Aborted/)).toBeNull();
        expect(screen.getByText('first answer')).toBeInTheDocument();
    });

    it('(e) a truncated response shows the length-limit notice', async () => {
        callLlmMock.mockResolvedValue({ text: 'cut off mid-', truncated: true });
        render(<Synthesis />);
        typeQuery('a long question');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        expect(await screen.findByRole('status')).toHaveTextContent('This answer hit the length limit and may be cut off.');
    });

    it('(f) second layer excludes the answer\'s own synthesis id, sends the focus text, and the captured layer-2 entry has followUp — MUTATION-CHECK', async () => {
        callLlmMock.mockResolvedValueOnce({ text: 'root answer' });
        render(<Synthesis />);
        typeQuery('root question');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        await screen.findByText('root answer');

        fireEvent.change(screen.getByLabelText('Second-pass focus (optional)'), { target: { value: 'pricing details' } });
        callLlmMock.mockResolvedValueOnce({ text: 'deeper answer' });
        recallPassagesMock.mockResolvedValue([]);
        fireEvent.click(screen.getByRole('button', { name: /Second-layer query/ }));
        await waitFor(() => expect(recallPassagesMock).toHaveBeenCalled());
        const [, recallQuery, recallOpts] = recallPassagesMock.mock.calls[recallPassagesMock.mock.calls.length - 1];
        expect(recallQuery).toContain('pricing details');
        expect(recallOpts.excludeSourceIds.some((id: string) => id.startsWith('synthesis:'))).toBe(true);

        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(2));
        expect(callLlmMock.mock.calls[1][0].prompt).toContain('pricing details');
        await screen.findByText('deeper answer');

        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        const snap = synthesisFor(null);
        const layer2 = snap.find((s) => s.result === 'deeper answer');
        expect(layer2?.followUp).toBe('pricing details');
    });

    it('(g) a slow response for an old query does not overwrite a newer preview — MUTATION-CHECK', async () => {
        const first = deferred<ReturnType<typeof passage>[]>();
        const second = [passage({ passageId: 'new-1', title: 'Fresh Source' })];
        recallPassagesMock.mockImplementationOnce(() => first.promise);
        recallPassagesMock.mockImplementationOnce(() => Promise.resolve(second));

        render(<Synthesis />);
        typeQuery('first slow query');
        await waitFor(() => expect(recallPassagesMock).toHaveBeenCalledTimes(1));

        typeQuery('second fast query');
        await waitFor(() => expect(recallPassagesMock).toHaveBeenCalledTimes(2));
        await screen.findByText('Sources (1)');
        expect(screen.getByText(/Fresh Source/)).toBeInTheDocument();

        // The stale first request now resolves — it must not clobber the newer preview.
        first.resolve([passage({ passageId: 'old-1', title: 'Stale Source' })]);
        await Promise.resolve(); await Promise.resolve();
        expect(screen.queryByText(/Stale Source/)).toBeNull();
        expect(screen.getByText(/Fresh Source/)).toBeInTheDocument();
    });

    it('(h) synthesis calls are tagged source: "synthesis"', async () => {
        callLlmMock.mockResolvedValue({ text: 'tagged' });
        render(<Synthesis />);
        typeQuery('tag this call');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        expect(callLlmMock.mock.calls[0][0].source).toBe('synthesis');
    });
    it('(k) Synthesize before the preview catches up looks up sources for the CURRENT question', async () => {
        setPerUserIdentity('andy');
        recallPassagesMock.mockImplementation(async (_uid: string, q: string) =>
            q.includes('boiler') ? [passage({ passageId: 'pb', sourceId: 'tag:b', sourceKind: 'tag', title: 'Boiler Note' })]
                : [passage({ passageId: 'pl', sourceId: 'tag:l', sourceKind: 'tag', title: 'Lease Note' })]);
        callLlmMock.mockResolvedValue({ text: 'done' });
        render(<Synthesis />);
        await typeQueryAndWaitForPreview('When does the lease renew?');
        await screen.findByText('Sources (1)');
        typeQuery('Who serviced the boiler?');   // click before the 300ms debounce refreshes the preview
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        const prompt = callLlmMock.mock.calls[0][0].prompt as string;
        expect(prompt).toContain('Boiler Note');
        expect(prompt).not.toContain('Lease Note');
    });

    it('(l) Cancel during second-layer source lookup stops the LLM call and clears busy', async () => {
        setPerUserIdentity('andy');
        callLlmMock.mockResolvedValueOnce({ text: 'first answer' });
        render(<Synthesis />);
        typeQuery('ab');   // under the preview threshold: no preview lookup
        clickSynthesize();
        await screen.findByText('first answer');
        const slow = deferred<unknown[]>();
        recallPassagesMock.mockImplementationOnce(() => slow.promise);
        fireEvent.click(screen.getByRole('button', { name: /Second-layer query/ }));
        fireEvent.click(await screen.findByRole('button', { name: /^Cancel$/ }));
        slow.resolve([]);
        await waitFor(() => expect(screen.getByRole('button', { name: /Second-layer query/ })).not.toBeDisabled());
        expect(callLlmMock).toHaveBeenCalledTimes(1);
        expect(screen.getByText('first answer')).toBeInTheDocument();
    });
});

describe('Synthesis Lab — styling/a11y/markdown polish (plan 070 phase 3)', () => {
    it('Cmd+Enter and Ctrl+Enter submit the question; plain Enter does not', async () => {
        callLlmMock.mockResolvedValue({ text: 'answer body' });
        render(<Synthesis />);
        typeQuery('a question');
        fireEvent.keyDown(screen.getByLabelText('Question to synthesize'), { key: 'Enter' });
        expect(callLlmMock).not.toHaveBeenCalled();

        fireEvent.keyDown(screen.getByLabelText('Question to synthesize'), { key: 'Enter', metaKey: true });
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        await screen.findByText('answer body');

        typeQuery('another question');
        callLlmMock.mockResolvedValue({ text: 'second body' });
        fireEvent.keyDown(screen.getByLabelText('Question to synthesize'), { key: 'Enter', ctrlKey: true });
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(2));
        await screen.findByText('second body');
    });

    it('Copy shows "Copied" on success; a clipboard rejection shows the error and never "Copied" — MUTATION-CHECK', async () => {
        callLlmMock.mockResolvedValue({ text: 'copy me' });
        render(<Synthesis />);
        typeQuery('q');
        clickSynthesize();
        await screen.findByText('copy me');

        const writeText = vi.fn().mockResolvedValueOnce(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

        fireEvent.click(screen.getByRole('button', { name: /^Copy$/ }));
        await screen.findByRole('button', { name: /^Copied$/ });

        writeText.mockRejectedValueOnce(new Error('denied'));
        fireEvent.click(await screen.findByRole('button', { name: /^Copied$|^Copy$/ }));
        // Wait for the previous "Copied" state to lapse or the click to register the failure.
        await waitFor(() => expect(screen.getByText("Couldn't copy — select the text instead.")).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /^Copied$/ })).toBeNull();

        delete (navigator as any).clipboard;
    });

    it('history search filters captures and shows "No captures match"', async () => {
        setPerUserIdentity('andy');
        render(<Synthesis />);
        for (const [q, a] of [['find the cat', 'a1'], ['find the dog', 'a2']] as const) {
            const d = deferred<{ text: string }>();
            callLlmMock.mockReturnValue(d.promise);
            typeQuery(q);
            clickSynthesize();
            await waitFor(() => expect(callLlmMock).toHaveBeenCalled());
            d.resolve({ text: a });
            await waitFor(() => expect(screen.getByText(a)).toBeInTheDocument());
            fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        }
        await screen.findByText('Captured (2)');

        fireEvent.change(screen.getByLabelText('Search captured syntheses'), { target: { value: 'cat' } });
        await screen.findByText('Captured (1/2)');
        expect(screen.getByText('find the cat', { selector: '.syn-hist__title' })).toBeInTheDocument();
        expect(screen.queryByText('find the dog', { selector: '.syn-hist__title' })).toBeNull();

        fireEvent.change(screen.getByLabelText('Search captured syntheses'), { target: { value: 'nothing matches this' } });
        await screen.findByText('No captures match');
        expect(screen.getByText('Captured (0/2)')).toBeInTheDocument();
    });

    it('two captures with the same query get distinct delete-button accessible names — MUTATION-CHECK', async () => {
        setPerUserIdentity('andy');
        render(<Synthesis />);
        let first = true;
        for (const a of ['answer one', 'answer two']) {
            const d = deferred<{ text: string }>();
            callLlmMock.mockReturnValue(d.promise);
            typeQuery('same question');
            clickSynthesize();
            await waitFor(() => expect(callLlmMock).toHaveBeenCalled());
            d.resolve({ text: a });
            await waitFor(() => expect(screen.getByText(a)).toBeInTheDocument());
            // capturedAt is second-precision in the rendered label — force the two
            // captures into different seconds so the labels are genuinely distinct.
            if (!first) await new Promise((r) => setTimeout(r, 1100));
            first = false;
            fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
        }
        const deleteButtons = screen.getAllByRole('button', { name: /^Delete synthesis: same question/ });
        expect(deleteButtons).toHaveLength(2);
        expect(deleteButtons[0].getAttribute('aria-label')).not.toBe(deleteButtons[1].getAttribute('aria-label'));
    }, 10000);

    it('renders Markdown in the answer body (bold + list)', async () => {
        callLlmMock.mockResolvedValue({ text: '**Bold claim**\n\n- first item\n- second item' });
        const { container } = render(<Synthesis />);
        typeQuery('markdown please');
        clickSynthesize();
        await waitFor(() => expect(callLlmMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(container.querySelector('.syn-answer__body strong')).not.toBeNull());
        expect(container.querySelector('.syn-answer__body strong')?.textContent).toBe('Bold claim');
        expect(container.querySelectorAll('.syn-answer__body li').length).toBe(2);
    });

    it('a [1] inside inline code is not rendered as a citation button', async () => {
        recallPassagesMock.mockResolvedValue([passage({ passageId: 'p1', sourceId: 'tag:1', sourceKind: 'tag', title: 'Cited Source' })]);
        callLlmMock.mockResolvedValue({ text: 'Use `[1]` in code, but [1] outside cites.' });
        const { container } = render(<Synthesis />);
        await typeQueryAndWaitForPreview('question with code citation');
        await screen.findByText('Sources (1)');
        clickSynthesize();
        await screen.findByRole('button', { name: /Open source 1: Cited Source/ });

        const codeEl = container.querySelector('.syn-answer__body code');
        expect(codeEl?.textContent).toBe('[1]');
        expect(codeEl?.querySelector('button.syn-cite')).toBeNull();
    });

    it('the error banner uses role="alert"', async () => {
        callLlmMock.mockRejectedValue(new Error('boom'));
        render(<Synthesis />);
        typeQuery('q');
        clickSynthesize();
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('boom');
    });

    it('a lineage chip appears on a captured→second-layer answer and loads the parent on click', async () => {
        callLlmMock.mockResolvedValueOnce({ text: 'root answer' });
        render(<Synthesis />);
        typeQuery('root question');
        clickSynthesize();
        await screen.findByText('root answer');
        fireEvent.click(screen.getByRole('button', { name: /^Capture$/ }));

        callLlmMock.mockResolvedValueOnce({ text: 'deeper answer' });
        fireEvent.click(screen.getByRole('button', { name: /Second-layer query/ }));
        await screen.findByText('deeper answer');

        const chip = await screen.findByRole('button', { name: /Built on: root question \(layer 1\)/ });

        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(chip);
        confirmSpy.mockRestore();

        expect(screen.getByText('root answer')).toBeInTheDocument();
        expect((screen.getByLabelText('Question to synthesize') as HTMLTextAreaElement).value).toBe('root question');
    });
    it('Cmd/Ctrl+Enter during an IME composition does not submit', async () => {
        callLlmMock.mockResolvedValue({ text: 'answer body' });
        render(<Synthesis />);
        typeQuery('日本語の質問');
        fireEvent.keyDown(screen.getByLabelText('Question to synthesize'), { key: 'Enter', ctrlKey: true, isComposing: true });
        await new Promise((r) => setTimeout(r, 50));
        expect(callLlmMock).not.toHaveBeenCalled();
    });
    it('an account switch clears the history search text', () => {
        for (const uid of ['user-a', 'user-b']) {
            synthesisUserIdHolder.current = uid;
            captureSynthesis({ id: `s-${uid}`, query: `q for ${uid}`, result: 'r', layer: 1, parentId: null });
        }
        setPerUserIdentity('user-a');
        const { rerender } = render(asUser('user-a'));
        fireEvent.change(screen.getByLabelText('Search captured syntheses'), { target: { value: 'leftover filter' } });
        expect(screen.getByText('No captures match')).toBeInTheDocument();
        setPerUserIdentity('user-b');
        rerender(asUser('user-b'));
        expect((screen.getByLabelText('Search captured syntheses') as HTMLInputElement).value).toBe('');
        expect(screen.getByText('q for user-b')).toBeInTheDocument();
    });
});
