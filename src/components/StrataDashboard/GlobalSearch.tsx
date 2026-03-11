/**
 * GlobalSearch — Always-visible entity search bar for Strata
 *
 * Features:
 *   • Fixed at the top of module content (always visible)
 *   • Debounced query (300ms) calls GET /search?q=<query>
 *   • Inline dropdown with grouped results: Properties, Units, Tenants, Vendors, Vehicles
 *   • Keyboard nav (arrows + Enter + Escape)
 *   • Clicking a result fires onNavigate callback
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Building2, Home, User, Truck, Car, X } from 'lucide-react';
import { strataGet } from './strataApi';

interface SearchResult {
    type: 'property' | 'unit' | 'tenant' | 'vendor' | 'owner' | 'vehicle';
    id: string;
    name: string;
    subtitle: string;
}

interface Props {
    onNavigate?: (type: string, id: string) => void;
}

const TYPE_ICONS: Record<string, React.ReactElement> = {
    property: <Building2 size={14} />,
    unit: <Home size={14} />,
    tenant: <User size={14} />,
    vendor: <Truck size={14} />,
    owner: <Building2 size={14} />,
    vehicle: <Car size={14} />,
};

const TYPE_LABELS: Record<string, string> = {
    property: 'Property',
    unit: 'Unit',
    tenant: 'Tenant',
    vendor: 'Vendor',
    owner: 'Owner',
    vehicle: 'Vehicle',
};

const TYPE_COLORS: Record<string, string> = {
    property: '#3b82f6',
    unit: '#8b5cf6',
    tenant: '#10b981',
    vendor: '#f59e0b',
    owner: '#6366f1',
    vehicle: '#ec4899',
};

export default function GlobalSearch({ onNavigate }: Props) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Debounced search
    const doSearch = useCallback(async (q: string) => {
        if (q.length < 2) { setResults([]); setIsOpen(false); return; }
        setLoading(true);
        try {
            const data = await strataGet<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`);
            setResults(data);
            setIsOpen(data.length > 0);
            setActiveIndex(-1);
        } catch { setResults([]); }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(query), 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, doSearch]);

    // Click outside to close
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current && !inputRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Keyboard navigation
    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, -1));
        } else if (e.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
            e.preventDefault();
            handleSelect(results[activeIndex]);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setQuery('');
            inputRef.current?.blur();
        }
    };

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false);
        setQuery('');
        onNavigate?.(result.type, result.id);
    };

    // Group results by type
    const grouped = results.reduce((acc, r) => {
        if (!acc[r.type]) acc[r.type] = [];
        acc[r.type].push(r);
        return acc;
    }, {} as Record<string, SearchResult[]>);

    return (
        <div className="global-search" style={{ position: 'relative', width: '100%', maxWidth: '600px' }}>
            <div className="global-search__input-wrap" style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                transition: 'all 0.2s ease',
                ...(isOpen ? { borderColor: 'var(--accent, #3b82f6)', boxShadow: '0 0 0 2px rgba(59,130,246,0.15)' } : {}),
            }}>
                <Search size={16} style={{ color: 'var(--text-tertiary, #888)', flexShrink: 0 }} />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search properties, units, tenants, vendors..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => { if (results.length > 0) setIsOpen(true); }}
                    onKeyDown={handleKey}
                    style={{
                        flex: 1, border: 'none', outline: 'none', background: 'transparent',
                        color: 'var(--text-primary, #fff)', fontSize: '13px',
                    }}
                />
                {query && (
                    <button onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }} style={{
                        background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px',
                    }}><X size={14} /></button>
                )}
                {loading && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>⏳</span>}
            </div>

            {isOpen && results.length > 0 && (
                <div ref={dropdownRef} className="global-search__dropdown" style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--bg-secondary, #1e1e2e)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                    maxHeight: '360px', overflowY: 'auto', zIndex: 9999,
                    padding: '4px',
                }}>
                    {Object.entries(grouped).map(([type, items]) => (
                        <div key={type}>
                            <div style={{
                                fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                                color: TYPE_COLORS[type] || 'var(--text-tertiary)',
                                padding: '8px 10px 4px', letterSpacing: '0.5px',
                            }}>
                                {TYPE_LABELS[type] || type}
                            </div>
                            {items.map((r, idx) => {
                                const flatIdx = results.indexOf(r);
                                return (
                                    <button
                                        key={r.id}
                                        onClick={() => handleSelect(r)}
                                        onMouseEnter={() => setActiveIndex(flatIdx)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            width: '100%', padding: '8px 10px', border: 'none',
                                            borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
                                            background: flatIdx === activeIndex ? 'rgba(59,130,246,0.15)' : 'transparent',
                                            color: 'var(--text-primary)', fontSize: '13px',
                                            transition: 'background 0.1s',
                                        }}
                                    >
                                        <span style={{ color: TYPE_COLORS[r.type], flexShrink: 0 }}>{TYPE_ICONS[r.type]}</span>
                                        <span style={{ flex: 1, fontWeight: 500 }}>{r.name}</span>
                                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{r.subtitle}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
