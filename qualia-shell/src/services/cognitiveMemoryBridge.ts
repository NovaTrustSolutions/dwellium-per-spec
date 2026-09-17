/**
 * Cognitive Memory Network — app-wide auto-feed.
 *
 * Mounted once in the signed-in shell (next to the Honcho/Hermes runners).
 * Whenever the user's local knowledge changes anywhere in the app — Tag File,
 * Scribe documents, Foundry captures, Syntheses — the change flows into the
 * shared memory network, so the network reflects the whole app instead of
 * only what was pasted into the MemoryGraphRAG widget.
 *
 * Uses the OFFLINE extractor on purpose: background ingestion must never spend
 * the user's LLM key. Ingestion is de-duplicated by the network itself, so
 * re-feeding the full document set on every change is cheap.
 */
import { useContext, useEffect } from 'react';
import { UserContext } from '../context/UserContext';
import { useIntegrations } from '../hooks/useIntegrations';
import { getCmn } from '../lib/memoryGraphRag/shared';
import { allLocalDocuments } from '../lib/memoryGraphRag/sources';
import { tagStore } from '../lib/tagStore';
import { foundryStore } from '../components/Foundry/foundryStore';
import { synthesisStore } from '../components/Synthesis/synthesisStore';
import { useScribeStore } from '../components/Scribe/scribeStore';

export const BRIDGE_DEBOUNCE_MS = 1500;

export function useCognitiveMemoryBridge(): void {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    const { integrations } = useIntegrations();
    const llm = integrations.llm;

    useEffect(() => {
        if (!uid) return;
        const cmn = getCmn(uid, llm);
        let timer: ReturnType<typeof setTimeout> | null = null;
        const feed = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                void cmn.ingest(allLocalDocuments(uid), 'auto', { offline: true });
            }, BRIDGE_DEBOUNCE_MS);
        };
        feed();
        const offs = [
            tagStore.subscribe(feed),
            foundryStore.subscribe(feed),
            synthesisStore.subscribe(feed),
            useScribeStore.subscribe(feed),
        ];
        return () => { if (timer) clearTimeout(timer); offs.forEach((off) => off()); };
    }, [uid, llm]);
}
