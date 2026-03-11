import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Building2, Users, Wrench, Truck, Mail, Home, Database } from 'lucide-react';

const API = 'http://localhost:3000';

interface SearchResult {
    id: string;
    type: string;
    title: string;
    score: number;
    snippet: string;
    metadata: Record<string, any>;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
    property: <Building2 size={14} />,
    tenant: <Users size={14} />,
    unit: <Home size={14} />,
    workitem: <Wrench size={14} />,
    vendor: <Truck size={14} />,
    owner: <Users size={14} />,
    email: <Mail size={14} />,
};

const TYPE_COLORS: Record<string, string> = {
    property: '#6366f1',
    tenant: '#22c55e',
    unit: '#f59e0b',
    workitem: '#f97316',
    vendor: '#a855f7',
    owner: '#06b6d4',
    email: '#64748b',
};

interface Props {
    onNavigate?: (result: SearchResult) => void;
}

export default function GlobalSearch({ onNavigate }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [indexStatus, setIndexStatus] = useState<{ ready: boolean; indexedCount: number; isIndexing: boolean } | null>(null);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const token = localStorage.getItem('dwellium_token');
    const headers = { Authorization: `Bearer ${token}` };

    // Init: check index status
    useEffect(() => {
        fetch(`${API}/api/search/status`, { headers })
            .then(r => r.json())
            .then(d => d.success && setIndexStatus(d.data))
            .catch(() => { });
    }, []);

    // Global shortcut: Cmd+K or Ctrl+K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(o => !o);
            }
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Close when clicking outside
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setResults([]);
            setSelectedIdx(0);
        }
    }, [open]);

    // Debounced search
    const search = useCallback(async (q: string) => {
        if (q.trim().length < 2) { setResults([]); return; }
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}&k=10`, { headers });
            const data = await res.json();
            if (data.success) { setResults(data.data); setSelectedIdx(0); }
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => search(query), 280);
        return () => clearTimeout(t);
    }, [query, search]);

    const triggerIndex = async () => {
        await fetch(`${API}/api/search/index`, { method: 'POST', headers });
        setIndexStatus(s => s ? { ...s, isIndexing: true } : s);
        const poll = setInterval(async () => {
            const r = await fetch(`${API}/api/search/status`, { headers });
            const d = await r.json();
            if (d.success) {
                setIndexStatus(d.data);
                if (!d.data.isIndexing) clearInterval(poll);
            }
        }, 3000);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && results[selectedIdx]) {
            handleSelect(results[selectedIdx]);
        }
    };

    const handleSelect = (r: SearchResult) => {
        setOpen(false);
        onNavigate?.(r);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            {/* ── Search Input (always visible) ── */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 12px',
                    background: open ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.06)',
                    border: open ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, color: '#94a3b8', cursor: 'pointer', fontSize: 13,
                    transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >
                <Search size={14} />
                <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
                <kbd style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>⌘K</kbd>
            </button>

            {/* ── Inline Dropdown ── */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                    width: 340, maxWidth: '90vw',
                    background: '#0f1624',
                    borderRadius: 12,
                    border: '1px solid rgba(99,102,241,0.25)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                    zIndex: 9999,
                    overflow: 'hidden',
                }}>
                    {/* Input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #1e2a3d' }}>
                        {loading ? (
                            <div style={{ width: 14, height: 14, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'gs-spin 0.8s linear infinite', flexShrink: 0 }} />
                        ) : (
                            <Search size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                        )}
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search tenants, properties, vendors…"
                            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: 13, fontFamily: 'Inter, sans-serif', minWidth: 0 }}
                        />
                        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                            <X size={14} />
                        </button>
                    </div>

                    {/* Index status */}
                    {indexStatus && !indexStatus.ready && (
                        <div style={{ padding: '8px 12px', background: '#1e2537', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f97316' }}>
                                <Database size={11} />
                                {indexStatus.isIndexing ? 'Indexing…' : 'Index empty'}
                            </div>
                            {!indexStatus.isIndexing && (
                                <button onClick={triggerIndex}
                                    style={{ padding: '3px 8px', background: '#6366f1', border: 'none', borderRadius: 5, color: '#fff', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                                    Build Index
                                </button>
                            )}
                        </div>
                    )}

                    {indexStatus?.ready && query.length === 0 && (
                        <div style={{ padding: '8px 12px', background: '#1a2436', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                            <Database size={11} color="#22c55e" />
                            {indexStatus.indexedCount.toLocaleString()} docs indexed
                        </div>
                    )}

                    {/* Results */}
                    {results.length > 0 && (
                        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                            {results.map((r, i) => (
                                <div
                                    key={r.id}
                                    onClick={() => handleSelect(r)}
                                    style={{
                                        padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                                        background: i === selectedIdx ? 'rgba(99,102,241,0.1)' : 'transparent',
                                        borderBottom: '1px solid #0d1525',
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={() => setSelectedIdx(i)}
                                >
                                    <div style={{ marginTop: 2, color: TYPE_COLORS[r.type] || '#94a3b8', flexShrink: 0 }}>
                                        {TYPE_ICONS[r.type] || <Search size={14} />}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                                            <span style={{
                                                background: (TYPE_COLORS[r.type] || '#64748b') + '20',
                                                color: TYPE_COLORS[r.type] || '#94a3b8',
                                                border: `1px solid ${(TYPE_COLORS[r.type] || '#64748b')}40`,
                                                padding: '0px 5px', borderRadius: 10, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', flexShrink: 0,
                                            }}>
                                                {r.type}
                                            </span>
                                        </div>
                                        {r.snippet && (
                                            <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.snippet}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {query.length >= 2 && !loading && results.length === 0 && (
                        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                            No results for "<strong style={{ color: '#94a3b8' }}>{query}</strong>"
                        </div>
                    )}

                    {/* Footer */}
                    <div style={{ padding: '6px 12px', borderTop: '1px solid #1e2a3d', display: 'flex', gap: 12, fontSize: 10, color: '#475569' }}>
                        <span>↑↓ navigate</span>
                        <span>↵ select</span>
                        <span>esc close</span>
                    </div>
                </div>
            )}

            <style>{`@keyframes gs-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
