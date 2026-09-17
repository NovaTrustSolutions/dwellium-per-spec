/**
 * Cognitive Memory Network — document builders for the app's local stores.
 *
 * One place that knows how to turn Tag File items, Scribe documents, Foundry
 * captures and Syntheses into SourceDocuments, shared by the MemoryGraphRAG
 * widget's "Pull …" buttons and the app-wide auto-feed bridge. Pure functions
 * over store snapshots; no React, no network.
 */
import { getTaggedItems, tagStoreUserIdHolder } from '../tagStore';
import { foundryStore, foundryUserIdHolder } from '../../components/Foundry/foundryStore';
import { synthesisStore, synthesisUserIdHolder } from '../../components/Synthesis/synthesisStore';
import { useScribeStore } from '../../components/Scribe/scribeStore';
import type { SourceDocument } from './types';

export function tagDocuments(uid: string | null): SourceDocument[] {
    tagStoreUserIdHolder.current = uid;
    return getTaggedItems().map((it) => ({
        sourceId: `tag:${it.id}`, sourceKind: 'tag', title: it.title,
        text: `${it.title}. Tags: ${it.tags.join(', ')}. Source: ${it.source}.`,
    }));
}

export function scribeDocuments(): SourceDocument[] {
    return useScribeStore.getState().openFiles.map((f) => ({
        sourceId: `scribe:${f.filepath}`, sourceKind: 'scribe',
        title: f.filepath.split('/').pop() || f.filepath, text: f.content || '',
    }));
}

/** Foundry intake items + captured Syntheses (per-user local stores). */
export function captureDocuments(uid: string | null): SourceDocument[] {
    foundryUserIdHolder.current = uid;
    synthesisUserIdHolder.current = uid;
    return [
        ...foundryStore.getSnapshot().map((it) => ({
            sourceId: `foundry:${it.id}`, sourceKind: 'capture' as const,
            title: (it.rawContent || '').slice(0, 60) || 'Capture', text: it.rawContent || '',
        })),
        ...synthesisStore.getSnapshot().map((s) => ({
            sourceId: `synthesis:${s.id}`, sourceKind: 'synthesis' as const,
            title: s.query || 'Synthesis', text: `${s.query}\n\n${s.result}`,
        })),
    ];
}

/** Everything the app holds locally for this user — what the bridge feeds in. */
export function allLocalDocuments(uid: string | null): SourceDocument[] {
    return [...tagDocuments(uid), ...scribeDocuments(), ...captureDocuments(uid)];
}
