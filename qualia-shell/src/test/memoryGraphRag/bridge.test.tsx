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
import { wikiStore, wikiUserIdHolder, setWikiPage } from '../../components/Wiki/wikiStore';
import { copawStore, copawUserIdHolder, captureFacts } from '../../components/Hive/copawStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <UserContext.Provider value={{ user: { id: 'andy' } } as never}>{children}</UserContext.Provider>
);

beforeEach(() => {
    localStorage.clear();
    resetCmnForTests();
    callLlm.mockReset();
    useScribeStore.setState({ openFiles: [] } as never);
    wikiStore.reset();
    wikiUserIdHolder.current = null;
    copawStore.reset();
    copawUserIdHolder.current = null;
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

    it('feeds a Wiki page edit and a CoPaw memory capture into the shared network', async () => {
        renderHook(() => useCognitiveMemoryBridge(), { wrapper });
        await waitFor(() => expect(getCmn('andy').metrics().documents).toBe(0), { timeout: 5000 });
        // Let the mount-time feed (1.5 s debounce) finish first, so only the Wiki
        // subscription can deliver the page below — otherwise the initial feed would.
        await new Promise((r) => setTimeout(r, 1700));

        wikiUserIdHolder.current = 'andy';
        setWikiPage({
            path: 'Acme/Renovation', tier: 'project', name: 'Renovation',
            overview: 'Tracks the kitchen remodel.', concepts: [], openQuestions: [],
            sources: [], compiledAt: new Date().toISOString(), compiledBy: 'outline',
        });
        await waitFor(() => expect(getCmn('andy').metrics().documents).toBe(1), { timeout: 5000 });

        copawUserIdHolder.current = 'andy';
        captureFacts('Hermes', 'A declarative fact long enough to survive the extractor heuristics.', new Date());
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
