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
import { wikiStore, wikiUserIdHolder } from '../../components/Wiki/wikiStore';
import { copawStore, copawUserIdHolder } from '../../components/Hive/copawStore';
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

/** Wiki pages (plan 070 P5): one document per page — sourceId `wiki:<path>`, kind 'wiki'.
 *  Text = name + overview + concepts + open questions. */
export function wikiDocuments(uid: string | null): SourceDocument[] {
    wikiUserIdHolder.current = uid;
    const out: SourceDocument[] = [];
    for (const page of Object.values(wikiStore.getSnapshot())) {
        const parts = [`${page.name}.`];
        if (page.overview) parts.push(page.overview);
        if (page.concepts.length) parts.push(`Concepts: ${page.concepts.join(', ')}.`);
        if (page.openQuestions.length) parts.push(`Open questions: ${page.openQuestions.join(' ')}`);
        const text = parts.join(' ').trim();
        if (!text) continue;
        out.push({ sourceId: `wiki:${page.path}`, sourceKind: 'wiki', title: page.name || page.path, text });
    }
    return out;
}

/** CoPaw memory facts (plan 070 P5): one document per fact — sourceId `memory:<id>`, kind 'memory',
 *  title = fact source. EXCLUDES facts whose source is 'Synthesis Lab' (the captured synthesis is
 *  already a document; including its facts would duplicate it and defeat second-layer self-exclusion). */
export function memoryDocuments(uid: string | null): SourceDocument[] {
    copawUserIdHolder.current = uid;
    return copawStore.getSnapshot()
        .filter((fact) => fact.source !== 'Synthesis Lab')
        .map((fact) => ({
            sourceId: `memory:${fact.id}`, sourceKind: 'memory' as const,
            title: fact.source, text: fact.text,
        }));
}

/** Source kinds whose existence the app can check. Scribe is NOT here: closing a file isn't deleting it. */
export const LIVENESS_KINDS: ReadonlySet<string> = new Set(['tag', 'capture', 'synthesis', 'wiki', 'memory']);

/** sourceIds that currently exist for LIVENESS_KINDS (from the same builders the bridge uses).
 *  The CMN is add-only, so recall filters out passages of these kinds whose source was deleted. */
export function liveSourceIds(uid: string | null): Set<string> {
    const docs = [...tagDocuments(uid), ...captureDocuments(uid), ...wikiDocuments(uid), ...memoryDocuments(uid)];
    return new Set(docs.map((d) => d.sourceId));
}

/** Everything the app holds locally for this user — what the bridge feeds in. */
export function allLocalDocuments(uid: string | null): SourceDocument[] {
    return [...tagDocuments(uid), ...scribeDocuments(), ...captureDocuments(uid), ...wikiDocuments(uid), ...memoryDocuments(uid)];
}
