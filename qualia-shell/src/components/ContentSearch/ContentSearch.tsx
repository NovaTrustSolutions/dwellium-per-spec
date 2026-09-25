/**
 * ContentSearch — system-wide content search (spec §2.5). Searches across the
 * local corpus (brain dumps, syntheses, wiki pages, foundry items, CoPaw
 * memory) + file names, ranked, with snippets and click-to-open. Backend-free:
 * this widget itself never calls a search endpoint.
 */
import { useState, useEffect, useMemo, useContext, useSyncExternalStore, useId, type KeyboardEvent, type ReactNode } from 'react';
import { Search, FileText, Brain, Layers, Inbox, BookOpen, Cpu } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { fetchTree } from '../FileExplorer/fileExplorerApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import { dumpStore, dumpUserIdHolder, type DumpEntry } from '../Scribe/dumpStore';
import { synthesisStore, synthesisUserIdHolder, type Synthesis } from '../Synthesis/synthesisStore';
import { wikiStore, wikiUserIdHolder, type WikiMap } from '../Wiki/wikiStore';
import { foundryStore, foundryUserIdHolder, type FoundryItem } from '../Foundry/foundryStore';
import { copawStore, copawUserIdHolder, type MemoryFact } from '../Hive/copawStore';
import { searchCorpus, highlightParts, type SearchDoc, type SearchDocType } from './searchEngine';
import { getWidgetMeta } from '../../registry/widgetRegistry';
import './ContentSearch.css';

const ACCENT = '#D6FE51';
const MAX_SHOWN = 50;
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

/** Renders `text` with query-token matches wrapped in <mark> (Phase 2 highlighting). */
function Highlighted({ text, query }: { text: string; query: string }): ReactNode {
    return highlightParts(text, query).map((p, i) =>
        p.match ? <mark key={i} className="cs-mark">{p.text}</mark> : <span key={i}>{p.text}</span>,
    );
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
    const [filter, setFilter] = useState<'all' | SearchDocType>('all');
    const [selected, setSelected] = useState(0);
    const listId = useId();

    useEffect(() => {
        let cancelled = false;
        const loadFiles = () => {
            fetchTree()
                .then((t) => { if (!cancelled) { setFiles(allFilePaths(t)); setFilesUnavailable(false); } })
                .catch(() => { if (!cancelled) setFilesUnavailable(true); });
        };
        loadFiles();
        window.addEventListener('focus', loadFiles);
        return () => { cancelled = true; window.removeEventListener('focus', loadFiles); };
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

    // Rank everything, filter by type, THEN cap — so chip counts and the filtered
    // list cover every match, not just the global top 50 (6 ms for 2,000 docs).
    const { hits } = useMemo(() => searchCorpus(query, docs, Infinity), [query, docs]);
    const total = hits.length;

    // Reset filter/selection in the handlers (not effects) so no render pairs a new
    // query with a stale filter or an out-of-range selection.
    const changeQuery = (q: string) => { setQuery(q); setFilter('all'); setSelected(0); };
    const changeFilter = (f: 'all' | SearchDocType) => { setFilter(f); setSelected(0); };
    // Option ids from the list id + row index: hit ids are paths and may contain spaces.
    const optionId = (i: number) => `${listId}-opt-${i}`;

    const typesPresent = useMemo(() => {
        const seen = new Set<SearchDocType>();
        const out: SearchDocType[] = [];
        for (const h of hits) if (!seen.has(h.type)) { seen.add(h.type); out.push(h.type); }
        return out;
    }, [hits]);

    const matching = useMemo(
        () => (filter === 'all' ? hits : hits.filter((h) => h.type === filter)),
        [hits, filter],
    );
    const filteredHits = useMemo(() => matching.slice(0, MAX_SHOWN), [matching]);

    // Keep the selected row in view (guarded — jsdom has no scrollIntoView).
    useEffect(() => {
        const el = filteredHits[selected] && document.getElementById(optionId(selected));
        el?.scrollIntoView?.({ block: 'nearest' });
    }, [selected, filteredHits]);

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

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelected((i) => Math.min(i + 1, Math.max(filteredHits.length - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            const h = filteredHits[selected];
            if (h) openHit(h);
        } else if (e.key === 'Escape' && query) {
            changeQuery('');
        }
    };

    const counterText = !query
        ? `${docs.length} indexed`
        : matching.length > filteredHits.length
            ? `showing ${filteredHits.length} of ${matching.length}`
            : `${matching.length} result${matching.length === 1 ? '' : 's'}`;

    return (
        <div className="cs-root">
            <div className="cs-header">
                <Search size={16} style={{ color: ACCENT }} />
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => changeQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search all content — brain dumps, syntheses, wiki, foundry, memory, files…"
                    className="cs-input"
                    aria-label="Search all content"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={hits.length > 0}
                    aria-controls={listId}
                    aria-activedescendant={filteredHits[selected] ? optionId(selected) : undefined}
                />
                <span className="cs-count" aria-live="polite">{counterText}</span>
            </div>
            {filesUnavailable && <div className="cs-warning">Files unavailable — searching local content only.</div>}

            {query && hits.length > 0 && (
                <div className="cs-filters">
                    <button type="button" className="cs-chip" aria-pressed={filter === 'all'} onClick={() => changeFilter('all')}>
                        All ({total})
                    </button>
                    {typesPresent.map((t) => (
                        <button key={t} type="button" className="cs-chip" aria-pressed={filter === t} onClick={() => changeFilter(t)}>
                            {TYPE_META[t].label} ({hits.filter((h) => h.type === t).length})
                        </button>
                    ))}
                </div>
            )}

            <div className="cs-body">
                {!query && (
                    <div className="cs-empty">
                        Searches brain dumps, syntheses, wiki pages, Foundry items, AI memory, and file names.
                    </div>
                )}
                {query && hits.length === 0 && <div className="cs-no-results">No results for “{query}”.</div>}
                <div id={listId} role="listbox" aria-label="Search results">
                {filteredHits.map((h, i) => {
                    const M = TYPE_META[h.type];
                    const Icon = M.icon;
                    return (
                        <div
                            key={h.id}
                            id={optionId(i)}
                            role="option"
                            aria-selected={i === selected}
                            className="cs-row"
                            onClick={() => openHit(h)}
                        >
                            <Icon size={15} style={{ color: ACCENT, flexShrink: 0, marginTop: 1 }} />
                            <div className="cs-row-main">
                                <div className="cs-row-title-line">
                                    <span className="cs-row-title"><Highlighted text={h.title} query={query} /></span>
                                    <span className="cs-row-type">{M.label}</span>
                                </div>
                                <div className="cs-row-snippet"><Highlighted text={h.snippet} query={query} /></div>
                            </div>
                        </div>
                    );
                })}
                </div>
            </div>
        </div>
    );
}
