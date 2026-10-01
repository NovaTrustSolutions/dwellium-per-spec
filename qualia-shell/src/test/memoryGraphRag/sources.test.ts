/**
 * Wiki + memory document builders and recall-liveness sourceId set (plan 070 P5).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wikiDocuments, memoryDocuments, liveSourceIds, LIVENESS_KINDS } from '../../lib/memoryGraphRag/sources';
import { wikiStore, wikiUserIdHolder, setWikiPage } from '../../components/Wiki/wikiStore';
import type { WikiPage } from '../../components/Wiki/wikiStore';
import { copawStore, copawUserIdHolder, captureFacts } from '../../components/Hive/copawStore';
import { synthesisStore, synthesisUserIdHolder, captureSynthesis, removeSynthesis } from '../../components/Synthesis/synthesisStore';
import { foundryStore, foundryUserIdHolder, captureItem } from '../../components/Foundry/foundryStore';
import { tagStoreUserIdHolder } from '../../lib/tagStore';
import { useScribeStore } from '../../components/Scribe/scribeStore';

const NOW = new Date('2026-06-04T12:00:00.000Z');

function page(overrides: Partial<WikiPage> = {}): WikiPage {
    return {
        path: 'Acme/Renovation', tier: 'project', name: 'Renovation',
        overview: '', concepts: [], openQuestions: [], sources: [],
        compiledAt: NOW.toISOString(), compiledBy: 'outline',
        ...overrides,
    };
}

beforeEach(() => {
    localStorage.clear();
    wikiStore.reset();
    wikiUserIdHolder.current = null;
    copawStore.reset();
    copawUserIdHolder.current = null;
    synthesisStore.reset();
    synthesisUserIdHolder.current = null;
    foundryStore.reset();
    foundryUserIdHolder.current = null;
    tagStoreUserIdHolder.current = null;
});

describe('wikiDocuments', () => {
    it('builds one document per page with name/overview/concepts/open-questions folded into text', () => {
        setWikiPage(page({
            path: 'Acme/Renovation', name: 'Renovation',
            overview: 'Tracks the kitchen remodel.',
            concepts: ['permit', 'contractor'],
            openQuestions: ['When does the permit expire?'],
        }));
        const docs = wikiDocuments(null);
        expect(docs).toHaveLength(1);
        expect(docs[0].sourceId).toBe('wiki:Acme/Renovation');
        expect(docs[0].sourceKind).toBe('wiki');
        expect(docs[0].title).toBe('Renovation');
        expect(docs[0].text).toContain('Renovation.');
        expect(docs[0].text).toContain('Tracks the kitchen remodel.');
        expect(docs[0].text).toContain('permit, contractor');
        expect(docs[0].text).toContain('When does the permit expire?');
    });

    it('returns nothing when there are no pages', () => {
        expect(wikiDocuments(null)).toEqual([]);
    });
});

describe('memoryDocuments', () => {
    it('builds one document per fact, title = fact source', () => {
        captureFacts('Hermes', 'The vendor must submit a certificate of insurance before any work begins.', copawUserIdHolder.current, NOW);
        const docs = memoryDocuments(null);
        expect(docs).toHaveLength(1);
        expect(docs[0].sourceKind).toBe('memory');
        expect(docs[0].title).toBe('Hermes');
        expect(docs[0].text).toContain('certificate of insurance');
        expect(docs[0].sourceId).toMatch(/^memory:/);
    });

    it('excludes facts captured from Synthesis Lab', () => {
        captureFacts('Synthesis Lab', 'The maintenance backlog grew twelve percent last quarter across the portfolio.', copawUserIdHolder.current, NOW);
        captureFacts('Hermes', 'A second, unrelated declarative fact worth keeping around for tests.', copawUserIdHolder.current, NOW);
        const docs = memoryDocuments(null);
        expect(docs).toHaveLength(1);
        expect(docs[0].title).toBe('Hermes');
    });
});

describe('liveSourceIds', () => {
    it('includes tag/foundry/synthesis/wiki/memory ids and excludes scribe', () => {
        const foundryItem = captureItem({ sourceType: 'note', rawContent: 'A captured note.' } as never, NOW)!;
        captureSynthesis({ id: 's1', query: 'q', result: 'r', layer: 0, parentId: null }, NOW);
        setWikiPage(page({ path: 'Acme/Live', name: 'Live' }));
        captureFacts('Hermes', 'A declarative fact long enough to survive the extractor heuristics.', copawUserIdHolder.current, NOW);

        // An open Scribe file must NOT count as live: closing it isn't deleting it.
        useScribeStore.setState({ openFiles: [{ filepath: '/notes/open.md', content: 'Open file text.' }] } as never);
        const ids = liveSourceIds(null);
        useScribeStore.setState({ openFiles: [] } as never);
        expect(ids.has(`foundry:${foundryItem.id}`)).toBe(true);
        expect(ids.has('synthesis:s1')).toBe(true);
        expect(ids.has('wiki:Acme/Live')).toBe(true);
        expect([...ids].some((id) => id.startsWith('memory:'))).toBe(true);
        expect([...ids].some((id) => id.startsWith('scribe:'))).toBe(false);
        expect(LIVENESS_KINDS.has('scribe')).toBe(false);
    });

    it('reflects deletions — removing a synthesis drops its id from the live set', () => {
        captureSynthesis({ id: 's-del', query: 'q', result: 'r', layer: 0, parentId: null }, NOW);
        expect(liveSourceIds(null).has('synthesis:s-del')).toBe(true);
        removeSynthesis('s-del');
        expect(liveSourceIds(null).has('synthesis:s-del')).toBe(false);
    });
});

describe('builders never leave a per-user holder pointed at another account (plan 070 P5 review)', () => {
    it('reading as another uid returns that user\'s data and restores every holder', () => {
        synthesisUserIdHolder.current = 'lisa';
        captureSynthesis({ id: 'lisa-1', query: 'q', result: 'r', layer: 1, parentId: null }, NOW);
        copawUserIdHolder.current = 'lisa';
        captureFacts('Hermes', 'A declarative fact long enough to survive the extractor heuristics.', copawUserIdHolder.current, NOW);

        const holders = [synthesisUserIdHolder, copawUserIdHolder, wikiUserIdHolder, foundryUserIdHolder, tagStoreUserIdHolder];
        holders.forEach((h) => { h.current = 'andy'; }); // the signed-in user
        const ids = liveSourceIds('lisa');
        expect(ids.has('synthesis:lisa-1')).toBe(true);
        expect([...ids].some((id) => id.startsWith('memory:'))).toBe(true);
        expect(holders.map((h) => h.current)).toEqual(['andy', 'andy', 'andy', 'andy', 'andy']);
    });
});
