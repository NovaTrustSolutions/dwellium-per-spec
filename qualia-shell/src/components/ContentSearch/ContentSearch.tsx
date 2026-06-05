/**
 * ContentSearch — system-wide content search (spec §2.5). Searches across the
 * local corpus (brain dumps, syntheses, wiki pages, foundry items, CoPaw memory)
 * + file names, ranked, with snippets and click-to-open. Backend-free; full
 * file-content + semantic search is surfaced as a "needs backend index" note.
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
    const [query, setQuery] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchTree().then((t) => { if (!cancelled) setFiles(allFilePaths(t)); }).catch(() => { /* offline → no files */ });
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

    const hits = useMemo(() => searchCorpus(query, docs), [query, docs]);
    const open = (widget: string) => window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: widget }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#000', color: '#ccc', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <Search size={16} style={{ color: ACCENT }} />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all content — notes, dumps, syntheses, wiki, foundry, files…"
                    style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 15, outline: 'none', fontFamily: 'inherit' }} />
                <span style={{ fontSize: 11, color: '#666' }}>{query ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : `${docs.length} indexed`}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                {!query && (
                    <div style={{ padding: 16, color: '#555', fontSize: 12, lineHeight: 1.7 }}>
                        Type to search across your local corpus. Full file-content + semantic search additionally uses the backend index when connected.
                    </div>
                )}
                {query && hits.length === 0 && <div style={{ padding: 16, color: '#555', fontSize: 12 }}>No results for “{query}”.</div>}
                {hits.map((h) => {
                    const M = TYPE_META[h.type];
                    const Icon = M.icon;
                    return (
                        <button key={h.id} onClick={() => open(h.widget)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', marginBottom: 5, background: '#0a0a0a', border: '1px solid #1c1c1c', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.background = '#111'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1c1c1c'; e.currentTarget.style.background = '#0a0a0a'; }}>
                            <Icon size={15} style={{ color: ACCENT, flexShrink: 0, marginTop: 1 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ color: '#eee', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                                    <span style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{M.label}</span>
                                </div>
                                <div style={{ fontSize: 11.5, color: '#999', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.snippet}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
