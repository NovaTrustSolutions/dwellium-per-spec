/**
 * ContentSearch — system-wide content search (spec §2.5). Searches across the
 * local corpus (brain dumps, syntheses, wiki pages, foundry items, CoPaw
 * memory) + file names, ranked, with snippets and click-to-open. Backend-free:
 * this widget itself never calls a search endpoint.
 */
import { useState, useEffect, useMemo, useContext, useSyncExternalStore } from 'react';
import { Search, FileText, Brain, Layers, Inbox, BookOpen, Cpu } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { fetchTree } from '../FileExplorer/fileExplorerApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import { dumpStore, dumpUserIdHolder, type DumpEntry } from '../Scribe/dumpStore';
import { synthesisStore, synthesisUserIdHolder, type Synthesis } from '../Synthesis/synthesisStore';
import { wikiStore, wikiUserIdHolder, type WikiMap } from '../Wiki/wikiStore';
import { foundryStore, foundryUserIdHolder, type FoundryItem } from '../Foundry/foundryStore';
import { copawStore, copawUserIdHolder, type MemoryFact } from '../Hive/copawStore';
import { searchCorpus, type SearchDoc, type SearchDocType } from './searchEngine';
import { getWidgetMeta } from '../../registry/widgetRegistry';
import './ContentSearch.css';

const ACCENT = '#D6FE51';
const TYPE_META: Record<SearchDocType, { icon: typeof FileText; label: string }> = {
    file: { icon: FileText, label: 'File' },
    dump: { icon: Brain, label: 'Brain Dump' },
    synthesis: { icon: Layers, label: 'Synthesis' },
    wiki: { icon: BookOpen, label: 'Wiki' },
    foundry: { icon: Inbox, label: 'Foundry' },
    memory: { icon: Cpu, label: 'Memory' },
};

function allFilePaths(tree: FileEntry[]): string[] {
    const out: string[] = [];
    const walk = (e: FileEntry) => { if (e.tier === 'file') out.push(e.path); e.children?.forEach(walk); };
    tree.forEach(walk);
    return out;
}

export default function ContentSearch() {
    const userCtx = useContext(UserContext);
    const uid = userCtx?.user?.id ?? null;
    dumpUserIdHolder.current = uid; synthesisUserIdHolder.current = uid; wikiUserIdHolder.current = uid;
    foundryUserIdHolder.current = uid; copawUserIdHolder.current = uid;

    const dumps: DumpEntry[] = useSyncExternalStore(dumpStore.subscribe, dumpStore.getSnapshot, dumpStore.getServerSnapshot);
    const syntheses: Synthesis[] = useSyncExternalStore(synthesisStore.subscribe, synthesisStore.getSnapshot, synthesisStore.getServerSnapshot);
    const wiki: WikiMap = useSyncExternalStore(wikiStore.subscribe, wikiStore.getSnapshot, wikiStore.getServerSnapshot);
    const foundry: FoundryItem[] = useSyncExternalStore(foundryStore.subscribe, foundryStore.getSnapshot, foundryStore.getServerSnapshot);
    const memory: MemoryFact[] = useSyncExternalStore(copawStore.subscribe, copawStore.getSnapshot, copawStore.getServerSnapshot);

    const [files, setFiles] = useState<string[]>([]);
    const [filesUnavailable, setFilesUnavailable] = useState(false);
    const [query, setQuery] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchTree()
            .then((t) => { if (!cancelled) setFiles(allFilePaths(t)); })
            .catch(() => { if (!cancelled) setFilesUnavailable(true); });
        return () => { cancelled = true; };
    }, []);

    const docs: SearchDoc[] = useMemo(() => {
        const d: SearchDoc[] = [];
        for (const x of dumps) d.push({ id: `dump-${x.id}`, type: 'dump', title: `Prompt ${x.promptNumber}`, body: x.content, widget: 'scribe' });
        for (const x of syntheses) d.push({ id: `syn-${x.id}`, type: 'synthesis', title: x.query || 'Synthesis', body: x.result, widget: 'synthesis' });
        for (const p of Object.values(wiki)) d.push({ id: `wiki-${p.path}`, type: 'wiki', title: p.name, body: [p.overview, ...p.concepts, ...p.openQuestions].join(' '), widget: 'wiki' });
        for (const x of foundry) d.push({ id: `fdy-${x.id}`, type: 'foundry', title: (x.rawContent.split('\n')[0] || 'Item').slice(0, 60), body: `${x.rawContent} ${x.tags.join(' ')}`, widget: 'foundry' });
        for (const x of memory) d.push({ id: `mem-${x.id}`, type: 'memory', title: x.source, body: x.text, widget: 'hive' });
        for (const p of files) d.push({ id: `file-${p}`, type: 'file', title: p.split('/').pop() || p, body: p, widget: 'file-explorer' });
        return d;
    }, [dumps, syntheses, wiki, foundry, memory, files]);

    const { hits, total } = useMemo(() => searchCorpus(query, docs), [query, docs]);

    const open = (widgetId: string) => {
        const meta = getWidgetMeta(widgetId);
        window.dispatchEvent(new CustomEvent('dwellium:open-widget', {
            detail: { widgetId, label: meta?.label ?? widgetId, icon: meta?.icon ?? '' },
        }));
    };
    // Wiki hits deep-link to the specific page: stash the path for a not-yet-mounted
    // widget, then dispatch the live event for an already-mounted one (Wiki.tsx listens
    // for both — same pattern as its own pending-path handling).
    const openHit = (h: SearchDoc) => {
        open(h.widget);
        if (h.type === 'wiki') {
            const path = h.id.slice('wiki-'.length);
            (window as unknown as { __dwelliumWikiPendingPath?: string }).__dwelliumWikiPendingPath = path;
            window.dispatchEvent(new CustomEvent('dwellium:wiki-open-page', { detail: { path } }));
        }
    };

    const counterText = !query
        ? `${docs.length} indexed`
        : total > hits.length
            ? `showing ${hits.length} of ${total}`
            : `${total} result${total === 1 ? '' : 's'}`;

    return (
        <div className="cs-root">
            <div className="cs-header">
                <Search size={16} style={{ color: ACCENT }} />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all content — brain dumps, syntheses, wiki, foundry, memory, files…"
                    className="cs-input" />
                <span className="cs-count">{counterText}</span>
            </div>
            {filesUnavailable && <div className="cs-warning">Files unavailable — searching local content only.</div>}

            <div className="cs-body">
                {!query && (
                    <div className="cs-empty">
                        Searches brain dumps, syntheses, wiki pages, Foundry items, AI memory, and file names.
                    </div>
                )}
                {query && hits.length === 0 && <div className="cs-no-results">No results for “{query}”.</div>}
                {hits.map((h) => {
                    const M = TYPE_META[h.type];
                    const Icon = M.icon;
                    return (
                        <button key={h.id} className="cs-row" onClick={() => openHit(h)}>
                            <Icon size={15} style={{ color: ACCENT, flexShrink: 0, marginTop: 1 }} />
                            <div className="cs-row-main">
                                <div className="cs-row-title-line">
                                    <span className="cs-row-title">{h.title}</span>
                                    <span className="cs-row-type">{M.label}</span>
                                </div>
                                <div className="cs-row-snippet">{h.snippet}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
