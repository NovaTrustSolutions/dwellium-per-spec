/**
 * SearchPanel — cross-document search UI (suitenumerique/docs parity). Searches
 * the *content* of open documents (via the tested `docSearch` engine) and the
 * *names* of all known files; clicking a hit opens that document.
 *
 * Content search covers loaded documents (the ones with text in memory); files
 * that aren't open are matched by name and open on click so you can search
 * inside them. Honest scope — no backend full-text index here.
 */
import { useState, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { useScribeStore } from './scribeStore';
import { searchDocuments, countMatchedFiles } from './docSearch';

export function SearchPanel({ files }: { files: Array<{ filepath: string }> }) {
    const openFiles = useScribeStore((s) => s.openFiles);
    const openFile = useScribeStore((s) => s.openFile);
    const [query, setQuery] = useState('');

    const matches = useMemo(() => {
        if (!query.trim()) return [];
        const docs = openFiles.map((f) => ({ filepath: f.filepath, content: f.content }));
        return searchDocuments(docs, query, { maxTotal: 200 });
    }, [openFiles, query]);

    const nameMatches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const open = new Set(openFiles.map((f) => f.filepath));
        return files.filter((f) => f.filepath.toLowerCase().includes(q) && !open.has(f.filepath));
    }, [files, openFiles, query]);

    const fileCount = countMatchedFiles(matches);

    return (
        <div className="scribe__search">
            <input
                className="scribe__search-input"
                type="search"
                placeholder="Search all documents…"
                aria-label="Search all documents"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                    width: '100%', boxSizing: 'border-box', padding: '6px 10px',
                    background: '#1a1a1a', border: '1px solid #333', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
                }}
            />
            {query.trim() && (
                <div className="scribe__search-results" style={{ marginTop: 6 }}>
                    <div className="scribe__search-meta" style={{ fontSize: 11, color: '#808080', padding: '2px 2px 6px' }}>
                        {matches.length} match{matches.length === 1 ? '' : 'es'} in {fileCount} open doc{fileCount === 1 ? '' : 's'}
                        {nameMatches.length ? ` · ${nameMatches.length} filename` : ''}
                    </div>
                    {matches.map((m, i) => (
                        <button
                            key={`${m.filepath}:${m.line}:${m.column}:${i}`}
                            className="scribe__search-hit"
                            title={`${m.filepath}:${m.line}`}
                            onClick={() => void openFile(m.filepath)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '5px 8px' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#1e1e1e'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            <span style={{ display: 'block', color: 'var(--accent)', fontSize: 11 }}>{(m.filepath.split('/').pop() ?? m.filepath)}:{m.line}</span>
                            <span style={{ display: 'block', color: '#bbb', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.lineText}</span>
                        </button>
                    ))}
                    {nameMatches.map((f) => (
                        <button
                            key={f.filepath}
                            className="scribe__search-hit"
                            onClick={() => void openFile(f.filepath)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '5px 8px' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#1e1e1e'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9ad7ff', fontSize: 11 }}><FileText size={12} aria-hidden /> {f.filepath}</span>
                            <span style={{ display: 'block', color: '#808080', fontSize: 11 }}>filename match — open to search inside</span>
                        </button>
                    ))}
                    {matches.length === 0 && nameMatches.length === 0 && (
                        <div style={{ fontSize: 11, color: '#808080', padding: '4px 8px' }}>No matches.</div>
                    )}
                </div>
            )}
        </div>
    );
}
