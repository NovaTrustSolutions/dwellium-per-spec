/**
 * ContentSearch — system-wide content search (spec §2.5). Searches across the
 * local corpus (brain dumps, syntheses, wiki pages, foundry items, CoPaw
 * memory) + file names, ranked, with snippets and click-to-open. Backend-free:
 * this widget itself never calls a search endpoint.
 */
import { useState, useEffect, useMemo, useRef, useContext, useSyncExternalStore, useId, type KeyboardEvent, type ReactNode } from 'react';
import { Search, FileText, Brain, Layers, Inbox, BookOpen, Cpu, StickyNote, Mic } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { fetchTree } from '../FileExplorer/fileExplorerApi';
import type { FileEntry } from '../FileExplorer/FileExplorerCell';
import { dumpStore, dumpUserIdHolder, type DumpEntry } from '../Scribe/dumpStore';
import { synthesisStore, synthesisUserIdHolder, type Synthesis } from '../Synthesis/synthesisStore';
import { wikiStore, wikiUserIdHolder, type WikiMap } from '../Wiki/wikiStore';
import { foundryStore, foundryUserIdHolder, type FoundryItem } from '../Foundry/foundryStore';
import { copawStore, copawUserIdHolder, type MemoryFact } from '../Hive/copawStore';
import { readTranscriptLog, type TranscriptLogEntry } from '../../lib/transcriptSearch';
import { fetchFileNames, searchRemote } from './remoteSearch';
import { useNotesScopeParam } from '../../lib/notesScopeStore';
import { searchCorpus, highlightParts, type SearchDoc, type SearchDocType, type SearchHit } from './searchEngine';
import { getWidgetMeta } from '../../registry/widgetRegistry';
import { setPendingDeepLink } from '../../lib/pendingDeepLink';
import './ContentSearch.css';

const MAX_SHOWN = 50;
const REMOTE_DEBOUNCE_MS = 250;
const TYPE_META: Record<SearchDocType, { icon: typeof FileText; label: string }> = {
    file: { icon: FileText, label: 'File' },
    dump: { icon: Brain, label: 'Brain Dump' },
    synthesis: { icon: Layers, label: 'Synthesis' },
    wiki: { icon: BookOpen, label: 'Wiki' },
    foundry: { icon: Inbox, label: 'Foundry' },
    memory: { icon: Cpu, label: 'Memory' },
    note: { icon: StickyNote, label: 'Note' },
    transcript: { icon: Mic, label: 'Transcript' },
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
    const notesScope = useNotesScopeParam();

    const dumps: DumpEntry[] = useSyncExternalStore(dumpStore.subscribe, dumpStore.getSnapshot, dumpStore.getServerSnapshot);
    const syntheses: Synthesis[] = useSyncExternalStore(synthesisStore.subscribe, synthesisStore.getSnapshot, synthesisStore.getServerSnapshot);
    const wiki: WikiMap = useSyncExternalStore(wikiStore.subscribe, wikiStore.getSnapshot, wikiStore.getServerSnapshot);
    const foundry: FoundryItem[] = useSyncExternalStore(foundryStore.subscribe, foundryStore.getSnapshot, foundryStore.getServerSnapshot);
    const memory: MemoryFact[] = useSyncExternalStore(copawStore.subscribe, copawStore.getSnapshot, copawStore.getServerSnapshot);

    const [files, setFiles] = useState<string[]>([]);
    const [filesUnavailable, setFilesUnavailable] = useState(false);
    // Loaded in the mount effect, not the initializer: localStorage is init-time SSR-unsafe (CLAUDE.md).
    const [transcripts, setTranscripts] = useState<TranscriptLogEntry[]>([]);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<'all' | SearchDocType>('all');
    const [selected, setSelected] = useState(0);
    // A ref, not state: a focus-time refresh of the names must not re-run the remote search.
    const fileNamesRef = useRef<Map<string, string>>(new Map());
    // Last raw transcript log read — skip the JSON parse when nothing changed.
    const transcriptRawRef = useRef<string | null>(null);
    const [remoteHits, setRemoteHits] = useState<SearchHit[]>([]);
    const [remotePending, setRemotePending] = useState(false);
    const [remoteUnavailable, setRemoteUnavailable] = useState(false);
    const remoteSeq = useRef(0);
    const listId = useId();

    // Re-parse only when the raw log changed (it can be MBs). Also called on each
    // query change: a same-tab save fires no 'storage' event and no window focus.
    const refreshTranscripts = () => {
        let raw: string | null = null;
        try { raw = localStorage.getItem('dwellium-transcription-log'); } catch { /* sandboxed */ }
        if (raw === transcriptRawRef.current) return;
        transcriptRawRef.current = raw;
        setTranscripts(readTranscriptLog(raw));
    };

    useEffect(() => {
        let cancelled = false;
        const loadFiles = () => {
            fetchTree()
                .then((t) => { if (!cancelled) { setFiles(allFilePaths(t)); setFilesUnavailable(false); } })
                .catch(() => { if (!cancelled) setFilesUnavailable(true); });
        };
        const loadTranscripts = () => { if (!cancelled) refreshTranscripts(); };
        const loadNames = () => { fetchFileNames().then((m) => { if (!cancelled) fileNamesRef.current = m; }); };
        // One 'focus' listener covers all three refreshes (files, transcripts, file names) —
        // reused rather than adding a listener per concern.
        const onFocus = () => { loadFiles(); loadTranscripts(); loadNames(); };
        loadFiles();
        loadTranscripts();
        loadNames();
        window.addEventListener('focus', onFocus);
        window.addEventListener('storage', loadTranscripts);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('storage', loadTranscripts);
        };
    }, []);

    // Debounced, abortable, stale-guarded remote search (notes + semantic file content).
    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            remoteSeq.current++;
            setRemoteHits([]); setRemotePending(false); setRemoteUnavailable(false);
            return;
        }
        const seq = ++remoteSeq.current;
        const controller = new AbortController();
        // Pending only once the debounced request actually goes out — not during the
        // 250 ms debounce wait itself — so a fast default mock never trips a synchronous
        // assertion made right after local results render.
        const timer = window.setTimeout(() => {
            setRemotePending(true);
            searchRemote(trimmed, fileNamesRef.current, controller.signal, notesScope)
                .then((res) => {
                    if (remoteSeq.current !== seq) return; // superseded by a newer query
                    setRemoteHits(res.hits);
                    setRemoteUnavailable(res.failed);
                    setRemotePending(false);
                })
                .catch(() => {
                    if (remoteSeq.current !== seq) return;
                    setRemoteUnavailable(true);
                    setRemotePending(false);
                });
        }, REMOTE_DEBOUNCE_MS);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [query, notesScope]);

    const docs: SearchDoc[] = useMemo(() => {
        const d: SearchDoc[] = [];
        for (const x of dumps) d.push({ id: `dump-${x.id}`, type: 'dump', title: `Prompt ${x.promptNumber}`, body: x.content, widget: 'scribe' });
        for (const x of syntheses) d.push({ id: `syn-${x.id}`, type: 'synthesis', title: x.query || 'Synthesis', body: x.result, widget: 'synthesis' });
        for (const p of Object.values(wiki)) d.push({ id: `wiki-${p.path}`, type: 'wiki', title: p.name, body: [p.overview, ...p.concepts, ...p.openQuestions, ...(p.sources ?? [])].join(' '), widget: 'wiki' });
        for (const x of foundry) {
            const target = typeof x.target === 'string' ? x.target : '';
            const assessment = typeof x.assessment === 'string' ? x.assessment : '';
            d.push({ id: `fdy-${x.id}`, type: 'foundry', title: (x.rawContent.split('\n')[0] || 'Item').slice(0, 60), body: `${x.rawContent} ${x.tags.join(' ')} ${target} ${assessment}`, widget: 'foundry' });
        }
        for (const x of memory) d.push({ id: `mem-${x.id}`, type: 'memory', title: x.source, body: x.text, widget: 'hive' });
        for (const p of files) d.push({ id: `file-${p}`, type: 'file', title: p.split('/').pop() || p, body: p, widget: 'file-explorer' });
        for (const e of transcripts) {
            const speakers = [...new Set(e.segments.map((s) => s.speaker).filter(Boolean))].join(' ');
            const text = e.segments.map((s) => s.text).join(' ');
            d.push({ id: `tx-${e.id}`, type: 'transcript', title: e.title || 'Untitled recording', body: `${speakers} ${text}`, widget: 'transcription', ref: e.id });
        }
        return d;
    }, [dumps, syntheses, wiki, foundry, memory, files, transcripts]);

    // Rank everything, filter by type, THEN cap — so chip counts and the filtered
    // list cover every match, not just the global top 50 (6 ms for 2,000 docs).
    const { hits } = useMemo(() => searchCorpus(query, docs, Infinity), [query, docs]);
    const total = hits.length + remoteHits.length;

    // Reset filter/selection in the handlers (not effects) so no render pairs a new
    // query with a stale filter or an out-of-range selection.
    // Remote hits belong to the query that fetched them — drop them here so they never
    // render under a different query while the next debounced request is in flight.
    const changeQuery = (q: string) => { setQuery(q); setFilter('all'); setSelected(0); setRemoteHits([]); refreshTranscripts(); };
    const changeFilter = (f: 'all' | SearchDocType) => { setFilter(f); setSelected(0); };
    // Option ids from the list id + row index: hit ids are paths and may contain spaces.
    const optionId = (i: number) => `${listId}-opt-${i}`;

    const typesPresent = useMemo(() => {
        const seen = new Set<SearchDocType>();
        const out: SearchDocType[] = [];
        for (const h of [...hits, ...remoteHits]) if (!seen.has(h.type)) { seen.add(h.type); out.push(h.type); }
        return out;
    }, [hits, remoteHits]);

    const typeCount = (t: SearchDocType) =>
        hits.filter((h) => h.type === t).length + remoteHits.filter((h) => h.type === t).length;

    const matching = useMemo(
        () => (filter === 'all' ? hits : hits.filter((h) => h.type === filter)),
        [hits, filter],
    );
    const filteredHits = useMemo(() => matching.slice(0, MAX_SHOWN), [matching]);
    // Remote hits are never re-ranked against local ones — shown after, not counted toward the 50-cap.
    const remoteMatching = useMemo(
        () => (filter === 'all' ? remoteHits : remoteHits.filter((h) => h.type === filter)),
        [remoteHits, filter],
    );
    const displayHits = useMemo(() => [...filteredHits, ...remoteMatching], [filteredHits, remoteMatching]);
    // Remote hits arrive/vanish on their own; clamp so the selection never points past the list.
    const activeIndex = displayHits.length ? Math.min(selected, displayHits.length - 1) : -1;

    // Keep the selected row in view (guarded — jsdom has no scrollIntoView).
    useEffect(() => {
        const el = activeIndex >= 0 ? document.getElementById(optionId(activeIndex)) : null;
        el?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex]);

    const open = (widgetId: string) => {
        const meta = getWidgetMeta(widgetId);
        window.dispatchEvent(new CustomEvent('dwellium:open-widget', {
            detail: { widgetId, label: meta?.label ?? widgetId, icon: meta?.icon ?? '' },
        }));
    };
    // Wiki hits deep-link to the specific page: stash the path for a not-yet-mounted
    // widget, then dispatch the live event for an already-mounted one (Wiki.tsx listens
    // for both — same pattern as its own pending-path handling). Notes and transcripts
    // use the shared pending slot (lib/pendingDeepLink) plus their live events.
    const openHit = (h: SearchDoc) => {
        open(h.widget);
        if (h.type === 'wiki') {
            const path = h.id.slice('wiki-'.length);
            (window as unknown as { __dwelliumWikiPendingPath?: string }).__dwelliumWikiPendingPath = path;
            window.dispatchEvent(new CustomEvent('dwellium:wiki-open-page', { detail: { path } }));
        } else if (h.type === 'note' && h.ref) {
            setPendingDeepLink('notepad', h.ref);
            window.dispatchEvent(new CustomEvent('qualia-notepad-open-note', { detail: { noteId: h.ref, title: h.title } }));
        } else if (h.type === 'transcript' && h.ref) {
            setPendingDeepLink('transcription', h.ref);
            window.dispatchEvent(new CustomEvent('dwellium:open-transcription-log', { detail: { logId: h.ref } }));
        }
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelected((i) => Math.min(i + 1, Math.max(displayHits.length - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            const h = displayHits[activeIndex];
            if (h) openHit(h);
        } else if (e.key === 'Escape' && query) {
            changeQuery('');
        }
    };

    const combinedMatching = matching.length + remoteMatching.length;
    const combinedShown = displayHits.length;
    const counterBase = !query
        ? `${docs.length} indexed`
        : combinedMatching > combinedShown
            ? `showing ${combinedShown} of ${combinedMatching}`
            : `${combinedMatching} result${combinedMatching === 1 ? '' : 's'}`;
    // One aria-live region for the whole counter area — the pending note is appended,
    // not a second live region.
    const counterText = remotePending ? `${counterBase} · Searching notes and file contents…` : counterBase;

    return (
        <div className="cs-root">
            <div className="cs-header">
                <Search size={16} className="cs-icon" />
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => changeQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search all content — brain dumps, syntheses, wiki, foundry, memory, transcripts, notes, files…"
                    className="cs-input"
                    aria-label="Search all content"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={displayHits.length > 0}
                    aria-controls={listId}
                    aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                />
                <span className="cs-count" aria-live="polite">{counterText}</span>
            </div>
            {filesUnavailable && <div className="cs-warning">Files unavailable — searching local content only.</div>}
            {remoteUnavailable && <div className="cs-warning">Notes / file contents unavailable — showing local results.</div>}

            {query && (hits.length > 0 || remoteHits.length > 0) && (
                <div className="cs-filters">
                    <button type="button" className="cs-chip" aria-pressed={filter === 'all'} onClick={() => changeFilter('all')}>
                        All ({total})
                    </button>
                    {typesPresent.map((t) => (
                        <button key={t} type="button" className="cs-chip" aria-pressed={filter === t} onClick={() => changeFilter(t)}>
                            {TYPE_META[t].label} ({typeCount(t)})
                        </button>
                    ))}
                </div>
            )}

            <div className="cs-body">
                {!query && (
                    <div className="cs-empty">
                        Searches brain dumps, syntheses, wiki pages, Foundry items, AI memory, audio transcripts, and
                        file names — plus notes and file contents when the backend is reachable.
                    </div>
                )}
                {query && displayHits.length === 0 && !remotePending && <div className="cs-no-results">No results for “{query}”.</div>}
                <div id={listId} role="listbox" aria-label="Search results">
                {displayHits.map((h, i) => {
                    const M = TYPE_META[h.type];
                    const Icon = M.icon;
                    return (
                        <div
                            key={h.id}
                            id={optionId(i)}
                            role="option"
                            aria-selected={i === activeIndex}
                            className="cs-row"
                            onClick={() => openHit(h)}
                        >
                            <Icon size={15} className="cs-icon cs-row-icon" />
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
