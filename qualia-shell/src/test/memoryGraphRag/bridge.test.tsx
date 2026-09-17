/**
 * The app-wide auto-feed: content saved anywhere in the app reaches the shared
 * Cognitive Memory Network without the user opening the widget, and does so
 * without touching the LLM.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const callLlm = vi.fn();
vi.mock('../../lib/llmClient', async (orig) => ({ ...(await orig<object>()), callLlm: (...a: unknown[]) => callLlm(...a) }));

import { UserContext } from '../../context/UserContext';
import { useScribeStore } from '../../components/Scribe/scribeStore';
import { getCmn, resetCmnForTests } from '../../lib/memoryGraphRag/shared';
import { useCognitiveMemoryBridge } from '../../services/cognitiveMemoryBridge';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <UserContext.Provider value={{ user: { id: 'andy' } } as never}>{children}</UserContext.Provider>
);

beforeEach(() => {
    localStorage.clear();
    resetCmnForTests();
    callLlm.mockReset();
    useScribeStore.setState({ openFiles: [] } as never);
});

describe('useCognitiveMemoryBridge', () => {
    it('feeds Scribe documents into the shared network and reacts to later changes', async () => {
        useScribeStore.setState({
            openFiles: [{ filepath: '/notes/lease.md', content: 'The Maple Street lease renews in March. The tenant pays the owner monthly.' }],
        } as never);
        renderHook(() => useCognitiveMemoryBridge(), { wrapper });

        await waitFor(() => expect(getCmn('andy').metrics().documents).toBe(1), { timeout: 5000 });
        expect(getCmn('andy').metrics().events[0]).toMatchObject({ kind: 'ingest', source: 'auto' });

        useScribeStore.setState({
            openFiles: [
                { filepath: '/notes/lease.md', content: 'The Maple Street lease renews in March. The tenant pays the owner monthly.' },
                { filepath: '/notes/boiler.md', content: 'Acme Heating serviced the boiler and recommends a new valve.' },
            ],
        } as never);
        await waitFor(() => expect(getCmn('andy').metrics().documents).toBe(2), { timeout: 5000 });
        expect(callLlm).not.toHaveBeenCalled();
    });

    it('does nothing when nobody is signed in', async () => {
        useScribeStore.setState({ openFiles: [{ filepath: '/x.md', content: 'Some content here.' }] } as never);
        renderHook(() => useCognitiveMemoryBridge());
        await new Promise((r) => setTimeout(r, 2000));
        expect(getCmn('andy').metrics().documents).toBe(0);
    });
});
