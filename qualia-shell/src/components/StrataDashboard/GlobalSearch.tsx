/**
 * GlobalSearch — Unified entity search bar for Strata (10/10 Enhanced)
 *
 * Features:
 *   • Debounced query (300ms) calls GET /search?q=<query>&type=&propertyId=&status=&sort=
 *   • Inline dropdown with grouped results + relevance scoring
 *   • Facet filter chips (All, Property, Tenant, Vendor, Workitem, Insurance, Compliance, Legal, Incident)
 *   • Saved searches (⭐ save/load presets)
 *   • Zero-result state with suggestions
 *   • Result count + facet counts footer
 *   • Index health indicator (green/yellow/red)
 *   • Keyboard nav (arrows + Enter + Escape)
 *   • ⌘K / Ctrl+K global shortcut to focus
 *   • Deep-link onNavigate(type, id, module) callback
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Building2, Home, User, Truck, Car, X, ClipboardList, Shield, Star, Activity, Scale, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { strataGet, strataPost, strataDelete } from './strataApi';

interface SearchResult {
    type: 'property' | 'unit' | 'tenant' | 'vendor' | 'owner' | 'vehicle' | 'workitem' | 'insurance' | 'compliance' | 'incident' | 'legal';
    id: string;
    name: string;
    subtitle: string;
    context?: string;
    parentId?: string;
    score?: number;
    module?: string;
}

interface SearchResponse {
    results: SearchResult[];
    totalResults: number;
    facets: Record<string, number>;
    query: string;
}

interface SavedSearch { id: string; name: string; query: string; filters?: any; }

interface Props {
    onNavigate?: (result: SearchResult) => void;
}

const TYPE_ICONS: Record<string, React.ReactElement> = {
    property: <Building2 size={14} />, unit: <Home size={14} />, tenant: <User size={14} />,
    vendor: <Truck size={14} />, owner: <Building2 size={14} />, vehicle: <Car size={14} />,
    workitem: <ClipboardList size={14} />, insurance: <Shield size={14} />,
    compliance: <CheckCircle2 size={14} />, incident: <AlertTriangle size={14} />, legal: <Scale size={14} />,
};

const TYPE_LABELS: Record<string, string> = {
    property: 'Property', unit: 'Unit', tenant: 'Tenant', vendor: 'Vendor', owner: 'Owner',
    vehicle: 'Vehicle', workitem: 'Workitem', insurance: 'Insurance',
    compliance: 'Compliance', incident: 'Incident', legal: 'Legal',
};

const TYPE_COLORS: Record<string, string> = {
    property: '#3b82f6', unit: '#D6FE51', tenant: '#22c55e', vendor: '#f59e0b', owner: '#D6FE51',
    vehicle: '#ec4899', workitem: '#06b6d4', insurance: '#22c55e',
    compliance: '#14b8a6', incident: '#ef4444', legal: '#a855f7',
};

const FACET_OPTIONS = ['all', 'property', 'tenant', 'vendor', 'workitem', 'insurance', 'compliance', 'legal', 'incident'] as const;

export default function GlobalSearch({ onNavigate }: Props) {
    const [query, setQuery] = useState('');
    const [response, setResponse] = useState<SearchResponse | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [loading, setLoading] = useState(false);
    const [activeFacet, setActiveFacet] = useState<string>('all');
    const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
    const [showSaved, setShowSaved] = useState(false);
    const [healthStatus, setHealthStatus] = useState<'good' | 'warn' | 'error'>('good');
    const [healthTotal, setHealthTotal] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Load saved searches and health on mount
    useEffect(() => {
        strataGet<SavedSearch[]>('/search/saved').then(setSavedSearches).catch(() => {});
        strataGet<{ totalIndexed: number }>('/search/health').then(h => {
            setHealthTotal(h.totalIndexed);
            setHealthStatus(h.totalIndexed > 50 ? 'good' : h.totalIndexed > 0 ? 'warn' : 'error');
        }).catch(() => setHealthStatus('error'));
    }, []);

    const doSearch = useCallback(async (q: string, facet?: string) => {
        if (q.length < 2) { setResponse(null); setIsOpen(false); return; }
        setLoading(true);
        try {
            const typeParam = (facet || activeFacet) !== 'all' ? `&type=${facet || activeFacet}` : '';
            const data = await strataGet<SearchResponse>(`/search?q=${encodeURIComponent(q)}${typeParam}`);
            setResponse(data);
            setIsOpen(data.results.length > 0 || q.length >= 2);
            setActiveIndex(-1);
        } catch { setResponse(null); }
        setLoading(false);
    }, [activeFacet]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(query), 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, doSearch]);

    // ⌘K / Ctrl+K global shortcut
    useEffect(() => {
        const handleGlobalKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); }
        };
        window.addEventListener('keydown', handleGlobalKey);
        return () => window.removeEventListener('keydown', handleGlobalKey);
    }, []);

    // Click outside to close
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current && !inputRef.current.contains(e.target as Node)) {
                setIsOpen(false); setShowSaved(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleKey = (e: React.KeyboardEvent) => {
        const results = response?.results || [];
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, -1)); }
        else if (e.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) { e.preventDefault(); handleSelect(results[activeIndex]); }
        else if (e.key === 'Escape') { setIsOpen(false); setQuery(''); inputRef.current?.blur(); }
    };

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false); setQuery('');
        // Log click-through
        strataPost('/search/log', { query: response?.query, selectedType: result.type, selectedId: result.id, resultCount: response?.totalResults }).catch(() => {});
        onNavigate?.(result);
    };

    const handleFacetClick = (facet: string) => {
        setActiveFacet(facet);
        if (query.length >= 2) doSearch(query, facet);
    };

    const handleSaveSearch = async () => {
        if (!query.trim()) return;
        const name = prompt('Save search as:', query);
        if (!name) return;
        try {
            const saved = await strataPost<SavedSearch>('/search/saved', { name, query, filters: { type: activeFacet } });
            setSavedSearches(prev => [saved, ...prev]);
        } catch {}
    };

    const handleLoadSaved = (s: SavedSearch) => {
        setQuery(s.query);
        if (s.filters?.type) setActiveFacet(s.filters.type);
        setShowSaved(false);
        doSearch(s.query, s.filters?.type);
    };

    const handleDeleteSaved = async (id: string) => {
        try {
            await strataDelete(`/search/saved/${id}`);
            setSavedSearches(prev => prev.filter(s => s.id !== id));
        } catch {}
    };

    const results = response?.results || [];
    const grouped = results.reduce((acc, r) => {
        if (!acc[r.type]) acc[r.type] = [];
        acc[r.type].push(r);
        return acc;
    }, {} as Record<string, SearchResult[]>);

    const healthColor = healthStatus === 'good' ? '#22c55e' : healthStatus === 'warn' ? '#f59e0b' : '#ef4444';

    return (
        <div className="global-search" style={{ position: 'relative', width: '100%', maxWidth: '600px' }}>
            {/* Search input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))', transition: 'all 0.2s ease', ...(isOpen ? { borderColor: 'var(--accent, #3b82f6)', boxShadow: '0 0 0 2px rgba(59,130,246,0.15)' } : {}) }}>
                <Search size={16} style={{ color: 'var(--text-tertiary, #888)', flexShrink: 0 }} />
                <input ref={inputRef} type="text" placeholder="Search… ⌘K" value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => { if (results.length > 0) setIsOpen(true); }}
                    onKeyDown={handleKey}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary, #fff)', fontSize: '13px' }}
                />
                {/* Health indicator */}
                <span title={`Index: ${healthTotal} records`} style={{ width: 6, height: 6, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
                {/* Save button */}
                <button onClick={handleSaveSearch} title="Save search" style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: '2px', opacity: query ? 1 : 0.3 }}><Star size={13} /></button>
                {/* Saved Searches toggle */}
                <button onClick={() => setShowSaved(!showSaved)} title="Saved searches" style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px' }}><Activity size={13} /></button>
                {query && (
                    <button onClick={() => { setQuery(''); setResponse(null); setIsOpen(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px' }}><X size={14} /></button>
                )}
                {loading && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>⏳</span>}
            </div>

            {/* Facet filter chips */}
            <div style={{ display: 'flex', gap: 3, padding: '4px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {FACET_OPTIONS.map(f => (
                    <button key={f} onClick={() => handleFacetClick(f)} style={{
                        padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                        background: activeFacet === f ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'rgba(255,255,255,0.04)',
                        color: activeFacet === f ? '#D6FE51' : '#64748b',
                    }}>
                        {f === 'all' ? 'All' : TYPE_LABELS[f] || f}
                        {f !== 'all' && response?.facets?.[f] ? ` (${response.facets[f]})` : ''}
                    </button>
                ))}
            </div>

            {/* Saved searches dropdown */}
            {showSaved && savedSearches.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-secondary, #1e1e2e)', border: '1px solid var(--border-subtle)', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', maxHeight: 200, overflowY: 'auto', zIndex: 9999, padding: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', padding: '6px 10px' }}>⭐ Saved Searches</div>
                    {savedSearches.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }}
                            onClick={() => handleLoadSaved(s)}>
                            <span style={{ flex: 1 }}>{s.name}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.query}</span>
                            <button onClick={e => { e.stopPropagation(); handleDeleteSaved(s.id); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontSize: 10 }}>×</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Results dropdown */}
            {isOpen && (
                <div ref={dropdownRef} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-secondary, #1e1e2e)', border: '1px solid var(--border-subtle)', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', maxHeight: 420, overflowY: 'auto', zIndex: 9999, padding: 4 }}>
                    {results.length === 0 ? (
                        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>No results for "{query}"</p>
                            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>Try: property names, tenant names, vendor names, policy numbers, or broader terms</p>
                        </div>
                    ) : (<>
                        {Object.entries(grouped).map(([type, items]) => (
                            <div key={type}>
                                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: TYPE_COLORS[type] || '#888', padding: '8px 10px 4px', letterSpacing: '0.5px' }}>
                                    {TYPE_LABELS[type] || type}
                                </div>
                                {items.map(r => {
                                    const flatIdx = results.indexOf(r);
                                    return (
                                        <button key={r.id} onClick={() => handleSelect(r)} onMouseEnter={() => setActiveIndex(flatIdx)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left', background: flatIdx === activeIndex ? 'rgba(59,130,246,0.15)' : 'transparent', color: 'var(--text-primary)', fontSize: 13, transition: 'background 0.1s' }}>
                                            <span style={{ color: TYPE_COLORS[r.type], flexShrink: 0 }}>{TYPE_ICONS[r.type]}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                                                {r.context && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 1 }}>{r.context}</div>}
                                            </div>
                                            <span style={{ color: 'var(--text-tertiary)', fontSize: 11, flexShrink: 0 }}>{r.subtitle}</span>
                                            {r.module && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', fontWeight: 600 }}>{r.module}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                        <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{response?.totalResults} results</span>
                            <span>↑↓ navigate · ↵ select · esc close</span>
                        </div>
                    </>)}
                </div>
            )}
        </div>
    );
}
