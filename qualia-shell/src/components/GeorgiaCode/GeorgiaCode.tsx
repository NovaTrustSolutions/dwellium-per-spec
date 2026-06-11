/**
 * GeorgiaCode — Legal Research Console
 *
 * Semantic search interface for the Official Code of Georgia Annotated (OCGA).
 * Queries the vector database for relevant law sections using AI embeddings.
 */

import { useState, useCallback, useEffect, useRef, KeyboardEvent } from 'react';
import { API_BASE } from '../../config';
import { Search, BookOpen, Scale, ChevronDown, ChevronUp, Bookmark, Copy, ExternalLink, Database, Loader } from 'lucide-react';
import './GeorgiaCode.css';

// ============================================
// TYPES
// ============================================

interface SearchResult {
    volumeId: string;
    text: string;
    similarity: number;
}

interface IndexStatus {
    downloaded: number;
    totalSizeKB: number;
    totalSizeMB: number;
    directory: string;
}

// ============================================
// QUICK SEARCH TOPICS
// ============================================

const QUICK_TOPICS = [
    'Landlord-Tenant Eviction Notice',
    'Security Deposit Return Timeline',
    'Property Tax Assessment',
    'Fair Housing Protections',
    'Building Code Violations',
    'Lease Agreement Requirements',
    'Habitability Standards',
    'Tenant Rights & Repairs',
    'Commercial Property Zoning',
    'Lead Paint Disclosure',
    'Rental Late Fees',
    'Property Insurance Requirements',
];

// ============================================
// COMPONENT
// ============================================

export default function GeorgiaCode() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<IndexStatus | null>(null);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [searchTime, setSearchTime] = useState<number>(0);
    const [hasSearched, setHasSearched] = useState(false);
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
    const [bookmarked, setBookmarked] = useState<Set<number>>(new Set());
    const [backendUnavailable, setBackendUnavailable] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch status on mount. Backend A has no /api/georgia-code mount → the
    // status endpoint 404s with HTML, which makes r.json() throw. The pre-M3
    // catch silently swallowed that; we now flip a flag so the UI can
    // surface an honest "index not loaded" diagnostic alongside the
    // existing OFFLINE badge.
    useEffect(() => {
        fetch(`${API_BASE}/api/georgia-code/status`)
            .then(async r => {
                if (r.status === 404) { setBackendUnavailable(true); return null; }
                const ct = r.headers.get('content-type') || '';
                if (!ct.includes('application/json')) { setBackendUnavailable(true); return null; }
                return r.json();
            })
            .then(d => {
                if (d && d.success) setStatus(d.data);
            })
            .catch(() => { setBackendUnavailable(true); });
    }, []);

    // Auto-focus search
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Search handler
    const handleSearch = useCallback(async (searchQuery?: string) => {
        const q = searchQuery || query;
        if (!q.trim()) return;

        setLoading(true);
        setHasSearched(true);
        setExpandedIdx(null);
        const startTime = performance.now();

        try {
            const res = await fetch(`${API_BASE}/api/georgia-code/search?q=${encodeURIComponent(q)}&topK=10`);
            const data = await res.json();
            setSearchTime(Math.round(performance.now() - startTime));
            if (data.success && data.data) {
                setResults(data.data);
            } else {
                setResults([]);
            }
        } catch {
            setResults([]);
        }

        setLoading(false);
    }, [query]);

    // Keyboard shortcuts
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSearch();
    }, [handleSearch]);

    // Topic click
    const handleTopicClick = useCallback((topic: string) => {
        setQuery(topic);
        handleSearch(topic);
    }, [handleSearch]);

    // Copy text
    const handleCopy = useCallback((text: string, idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
    }, []);

    // Toggle bookmark
    const toggleBookmark = useCallback((idx: number) => {
        setBookmarked(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    }, []);

    // Format volume name for display
    const formatVolume = (vol: string) => {
        return vol
            .replace(/_djvu$/, '')
            .replace(/\(/g, '(')
            .replace(/\)/g, ')')
            .trim();
    };

    // Relevance level
    const getRelevance = (score: number) => {
        if (score >= 0.75) return { level: 'high', label: 'High', pct: score * 100 };
        if (score >= 0.5) return { level: 'medium', label: 'Medium', pct: score * 100 };
        return { level: 'low', label: 'Low', pct: score * 100 };
    };

    const indexedChunks = status?.totalSizeMB ? Math.round((status.totalSizeMB / 156) * 234000) : 0;

    return (
        <div className="georgia-code">
            {/* HEADER */}
            <div className="gc-header">
                <div className="gc-header-top">
                    <div className="gc-title-group">
                        <div className="gc-emblem">
                            <Scale size={22} color="white" />
                        </div>
                        <div>
                            <div className="gc-title">Georgia Code</div>
                            <div className="gc-subtitle">Official Code of Georgia Annotated — AI-Powered Legal Research</div>
                        </div>
                    </div>

                    <div className={`gc-status-badge ${status && status.downloaded >= 52 ? 'indexed' : status && status.downloaded > 0 ? 'indexing' : 'offline'}`}>
                        <span className="gc-status-dot" />
                        {status && status.downloaded >= 52 ? 'Indexed' : status && status.downloaded > 0 ? 'Indexing' : 'Offline'}
                    </div>
                </div>

                <div className="gc-stats-bar">
                    <div className="gc-stat">
                        <span className="gc-stat-value">{status?.downloaded || 0}</span>
                        <span className="gc-stat-label">Volumes</span>
                    </div>
                    <div className="gc-stat">
                        <span className="gc-stat-value">53</span>
                        <span className="gc-stat-label">Titles</span>
                    </div>
                    <div className="gc-stat">
                        <span className="gc-stat-value">{status?.totalSizeMB || 0}MB</span>
                        <span className="gc-stat-label">Legal Text</span>
                    </div>
                    <div className="gc-stat">
                        <span className="gc-stat-value">2024</span>
                        <span className="gc-stat-label">Edition</span>
                    </div>
                </div>
            </div>
            {/* Honest-unavailable banner lives OUTSIDE .gc-header because that
                container sets overflow:hidden (decorative gradient clip), which
                would otherwise eat the banner. Sibling to the header keeps it
                visible above the search row. */}
            {backendUnavailable && (
                <div
                    role="status"
                    style={{
                        margin: '12px 28px 0',
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        color: '#f59e0b',
                        fontSize: 13,
                        lineHeight: 1.5,
                    }}
                >
                    ⚠️ Georgia Code index is not loaded — requires the
                    georgia-code service mounted at <code>/api/georgia-code</code>
                    (OCGA vector index + embeddings backend). Search is disabled
                    until the index service is connected.
                </div>
            )}

            {/* SEARCH */}
            <div className="gc-search-container">
                <div className="gc-search-box">
                    <Search className="gc-search-icon" size={16} />
                    <input
                        ref={inputRef}
                        className="gc-search-input"
                        type="text"
                        placeholder="Search Georgia law — e.g., 'tenant eviction notice requirements'..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        id="georgia-code-search"
                    />
                    <button
                        className="gc-search-btn"
                        onClick={() => handleSearch()}
                        disabled={!query.trim() || loading}
                    >
                        {loading ? <Loader size={14} className="gc-spinner-inline" /> : 'Search'}
                    </button>
                </div>
                <div className="gc-search-hint">
                    <kbd>Enter</kbd> to search · Semantic AI search across all 53 Titles
                </div>
            </div>

            {/* QUICK TOPICS */}
            {!hasSearched && (
                <div className="gc-topics">
                    {QUICK_TOPICS.map(topic => (
                        <button
                            key={topic}
                            className="gc-topic-chip"
                            onClick={() => handleTopicClick(topic)}
                        >
                            {topic}
                        </button>
                    ))}
                </div>
            )}

            {/* RESULTS / EMPTY STATE */}
            {loading ? (
                <div className="gc-loading">
                    <div className="gc-spinner" />
                    <div className="gc-loading-text">Searching {status?.downloaded || 52} volumes of Georgia law...</div>
                </div>
            ) : hasSearched && results.length > 0 ? (
                <div className="gc-results">
                    <div className="gc-results-header">
                        <span className="gc-results-count">
                            {results.length} relevant section{results.length !== 1 ? 's' : ''} found
                        </span>
                        <span className="gc-results-time">{searchTime}ms</span>
                    </div>

                    {results.map((result, idx) => {
                        const rel = getRelevance(result.similarity);
                        const isExpanded = expandedIdx === idx;

                        return (
                            <div
                                key={idx}
                                className={`gc-result-card ${isExpanded ? 'expanded' : ''}`}
                                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                            >
                                <div className="gc-result-meta">
                                    <div className="gc-result-volume">
                                        <BookOpen size={14} />
                                        {formatVolume(result.volumeId)}
                                    </div>
                                    <div className="gc-result-score">
                                        <div className="gc-relevance-bar">
                                            <div
                                                className={`gc-relevance-fill ${rel.level}`}
                                                style={{ width: `${rel.pct}%` }}
                                            />
                                        </div>
                                        {(result.similarity * 100).toFixed(0)}% match
                                    </div>
                                </div>

                                <div className="gc-result-text">{result.text}</div>

                                <div className="gc-result-expand" onClick={(e) => { e.stopPropagation(); setExpandedIdx(isExpanded ? null : idx); }}>
                                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    {isExpanded ? 'Collapse' : 'Expand full text'}

                                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                        <span
                                            onClick={(e) => { e.stopPropagation(); handleCopy(result.text, idx); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                                        >
                                            <Copy size={11} />
                                            {copiedIdx === idx ? 'Copied!' : 'Copy'}
                                        </span>
                                        <span
                                            onClick={(e) => { e.stopPropagation(); toggleBookmark(idx); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                                        >
                                            <Bookmark size={11} fill={bookmarked.has(idx) ? '#D6FE51' : 'none'} />
                                            {bookmarked.has(idx) ? 'Saved' : 'Save'}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : hasSearched ? (
                <div className="gc-empty-state">
                    <div className="gc-empty-icon">📜</div>
                    <div className="gc-empty-title">No matching sections found</div>
                    <div className="gc-empty-text">
                        Try rephrasing your query or use different keywords.
                        The search covers all 53 Titles of the Georgia Code.
                    </div>
                </div>
            ) : (
                <div className="gc-empty-state">
                    <div className="gc-empty-icon">⚖️</div>
                    <div className="gc-empty-title">Georgia Legal Research</div>
                    <div className="gc-empty-text">
                        Search across the entire Official Code of Georgia Annotated using
                        AI-powered semantic search. Find relevant statutes, regulations,
                        and legal provisions for property management and beyond.
                    </div>
                </div>
            )}

            {/* FOOTER */}
            <div className="gc-footer">
                <div className="gc-footer-brand">
                    <Database size={12} />
                    <span>OCGA 2024 · Public Domain · Internet Archive</span>
                </div>
                <div className="gc-footer-actions">
                    <button
                        className="gc-footer-btn"
                        onClick={() => {
                            fetch(`${API_BASE}/api/georgia-code/status`)
                                .then(r => r.json())
                                .then(d => { if (d.success) setStatus(d.data); });
                        }}
                    >
                        ↻ Refresh Status
                    </button>
                </div>
            </div>
        </div>
    );
}
