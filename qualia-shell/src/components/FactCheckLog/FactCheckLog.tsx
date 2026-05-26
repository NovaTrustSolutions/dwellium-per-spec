import { useState, useEffect, useCallback, useMemo } from 'react';
import './FactCheckLog.css';
import { API_BASE } from '../../config';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';

// ============================================
// TYPES
// ============================================

interface FactCheckEntry {
    id: string;
    claim: string;
    verdict: 'verified' | 'disputed' | 'unverifiable' | 'partially_true';
    confidence: number;
    explanation: string;
    sources: string[];
    timestamp: number;
    sessionId?: string;
}

type VerdictFilter = 'all' | 'verified' | 'disputed' | 'unverifiable' | 'partially_true';

const API_FACT_CHECK = `${API_BASE}/api/transcribe/fact-check`;

const VERDICT_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
    verified: { label: 'Verified', icon: '✅', color: '#34d399', bg: 'rgba(16, 185, 129, 0.12)' },
    disputed: { label: 'Disputed', icon: '❌', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
    unverifiable: { label: 'Unverifiable', icon: '❓', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' },
    partially_true: { label: 'Partial', icon: '⚠️', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.12)' },
};

// ============================================
// COMPONENT
// ============================================

export default function FactCheckLog() {
    const { integrations } = useIntegrations();
    const [entries, setEntries] = useState<FactCheckEntry[]>([]);
    const [filter, setFilter] = useState<VerdictFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [manualClaim, setManualClaim] = useState('');
    const [checking, setChecking] = useState(false);

    // ---- POLL FOR NEW ENTRIES ----
    const fetchLog = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_FACT_CHECK}/log`);
            const json = await res.json();
            if (json.success && json.data?.entries) {
                setEntries(json.data.entries);
            }
        } catch {
            // Backend offline — use local entries
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLog();
        const interval = setInterval(fetchLog, 5000);
        return () => clearInterval(interval);
    }, [fetchLog]);

    // ---- MANUAL FACT-CHECK ----
    // 2026-05-26: prefer the user's configured LLM (Anthropic/OpenAI/Gemini/Local/Custom).
    // Falls back to backend if no LLM is configured OR if the LLM call fails.
    const submitManualCheck = async () => {
        if (!manualClaim.trim()) return;
        const claimText = manualClaim.trim();
        setChecking(true);

        // ── 1) Try user-configured LLM first ──
        if (hasActiveLlm(integrations.llm)) {
            try {
                const llmRes = await callLlm({
                    systemPrompt: `You are a fact-checking assistant. Evaluate the user's claim and respond with JSON only. Schema: { "verdict": "verified"|"disputed"|"unverifiable"|"partially_true", "confidence": number between 0 and 1, "explanation": "1-3 sentence reasoning", "sources": [array of URL strings, may be empty] }. Be decisive: only mark unverifiable when the claim cannot be evaluated from general knowledge. Mark partially_true when the claim is partly accurate but misleading.`,
                    prompt: claimText,
                    responseFormat: 'json',
                    maxTokens: 512,
                    temperature: 0.1,
                }, integrations.llm);
                if (llmRes) {
                    const parsed = JSON.parse(llmRes.text);
                    setEntries(prev => [{
                        id: crypto.randomUUID(),
                        claim: claimText,
                        verdict: parsed.verdict || 'unverifiable',
                        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
                        explanation: parsed.explanation || '',
                        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
                        timestamp: Date.now(),
                    }, ...prev]);
                    setManualClaim('');
                    setChecking(false);
                    return;
                }
            } catch {
                // LLM call failed — fall through to backend
            }
        }

        // ── 2) Fall back to backend ──
        try {
            const res = await fetch(API_FACT_CHECK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ claims: [claimText] }),
            });
            const json = await res.json();
            if (json.success && json.data?.results) {
                const results = json.data.results.map((r: any) => ({
                    id: crypto.randomUUID(),
                    claim: r.claim,
                    verdict: r.verdict,
                    confidence: r.confidence,
                    explanation: r.explanation || '',
                    sources: r.sources || [],
                    timestamp: Date.now(),
                }));
                setEntries(prev => [...results, ...prev]);
                setManualClaim('');
            }
        } catch {
            // Both LLM and backend offline — show placeholder
            setEntries(prev => [{
                id: crypto.randomUUID(),
                claim: claimText,
                verdict: 'unverifiable',
                confidence: 0,
                explanation: 'No LLM configured and backend offline. Configure an LLM provider in Settings → API Keys to enable fact-checking.',
                sources: [],
                timestamp: Date.now(),
            }, ...prev]);
            setManualClaim('');
        } finally {
            setChecking(false);
        }
    };

    // ---- FILTERING ----
    const filtered = useMemo(() => {
        let result = entries;
        if (filter !== 'all') {
            result = result.filter(e => e.verdict === filter);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e =>
                e.claim.toLowerCase().includes(q) ||
                e.explanation.toLowerCase().includes(q)
            );
        }
        return result;
    }, [entries, filter, searchQuery]);

    // ---- STATS ----
    const stats = useMemo(() => {
        const total = entries.length;
        const verified = entries.filter(e => e.verdict === 'verified').length;
        const disputed = entries.filter(e => e.verdict === 'disputed').length;
        const avgConf = total > 0
            ? entries.reduce((sum, e) => sum + e.confidence, 0) / total
            : 0;
        return { total, verified, disputed, avgConf };
    }, [entries]);

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // ---- SAVE TO FILE MANAGER ----
    const saveToFileManager = async () => {
        if (entries.length === 0) return;
        const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        let md = `# Fact-Check Report — ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n\n`;
        md += `**Total Claims:** ${stats.total} | **Verified:** ${stats.verified} | **Disputed:** ${stats.disputed} | **Avg Confidence:** ${(stats.avgConf * 100).toFixed(0)}%\n\n---\n\n`;
        for (const e of entries) {
            const v = e.verdict.toUpperCase();
            const conf = Math.round(e.confidence * 100);
            md += `### ${v} (${conf}%)\n\n`;
            md += `**Claim:** ${e.claim}\n\n`;
            if (e.explanation) md += `**Explanation:** ${e.explanation}\n\n`;
            if (e.sources?.length) {
                md += `**Sources:**\n`;
                for (const src of e.sources) md += `- ${src}\n`;
                md += `\n`;
            }
            md += `---\n\n`;
        }
        const blob = new Blob([md], { type: 'text/markdown' });
        const formData = new FormData();
        formData.append('file', blob, `FactCheck_Report_${ts}.md`);
        try {
            const resp = await fetch(`${API_BASE}/api/files/upload`, { method: 'POST', body: formData });
            const data = await resp.json();
            if (data.success) {
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: '📁 Fact-check report saved to File Manager' }));
            } else {
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `❌ Save failed: ${data.error}` }));
            }
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: '❌ Upload error' }));
        }
    };

    // ---- RENDER ----
    return (
        <div className="fact-check-log">
            {/* ========== HEADER ========== */}
            <div className="fcl-header">
                <div className="fcl-header__title-row">
                    <span className="fcl-header__icon">🔍</span>
                    <h2 className="fcl-header__title">Fact-Check Log</h2>
                    {loading && <span className="fcl-header__loading">●</span>}
                </div>

                <div className="fcl-header__actions">
                    <div className="fcl-header__stats">
                        <div className="fcl-stat">
                            <span className="fcl-stat__value">{stats.total}</span>
                            <span className="fcl-stat__label">Claims</span>
                        </div>
                        <div className="fcl-stat fcl-stat--verified">
                            <span className="fcl-stat__value">{stats.verified}</span>
                            <span className="fcl-stat__label">Verified</span>
                        </div>
                        <div className="fcl-stat fcl-stat--disputed">
                            <span className="fcl-stat__value">{stats.disputed}</span>
                            <span className="fcl-stat__label">Disputed</span>
                        </div>
                        <div className="fcl-stat">
                            <span className="fcl-stat__value">{(stats.avgConf * 100).toFixed(0)}%</span>
                            <span className="fcl-stat__label">Avg Conf.</span>
                        </div>
                    </div>
                    {entries.length > 0 && (
                        <button className="fcl-save-btn" onClick={saveToFileManager} title="Save report to File Manager">
                            📁 Save to Files
                        </button>
                    )}
                </div>
            </div>

            {/* ========== MANUAL INPUT ========== */}
            <div className="fcl-input">
                <input
                    className="fcl-input__field"
                    placeholder="Paste a claim to fact-check…"
                    value={manualClaim}
                    onChange={e => setManualClaim(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitManualCheck()}
                />
                <button
                    className="fcl-input__btn"
                    onClick={submitManualCheck}
                    disabled={checking || !manualClaim.trim()}
                >
                    {checking ? '⏳' : '🔎'} Check
                </button>
            </div>

            {/* ========== FILTER BAR ========== */}
            <div className="fcl-filters">
                <div className="fcl-filters__pills">
                    {(['all', 'verified', 'disputed', 'unverifiable', 'partially_true'] as VerdictFilter[]).map(v => (
                        <button
                            key={v}
                            className={`fcl-pill ${filter === v ? 'fcl-pill--active' : ''}`}
                            onClick={() => setFilter(v)}
                            style={filter === v && v !== 'all' ? { color: VERDICT_CONFIG[v]?.color, borderColor: VERDICT_CONFIG[v]?.color } : {}}
                        >
                            {v === 'all' ? 'All' : VERDICT_CONFIG[v].icon + ' ' + VERDICT_CONFIG[v].label}
                        </button>
                    ))}
                </div>
                <input
                    className="fcl-filters__search"
                    placeholder="Search claims…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {/* ========== ENTRIES LIST ========== */}
            <div className="fcl-entries">
                {filtered.length === 0 ? (
                    <div className="fcl-empty">
                        <div className="fcl-empty__icon">🔍</div>
                        <div className="fcl-empty__title">
                            {entries.length === 0 ? 'No claims checked yet' : 'No matching claims'}
                        </div>
                        <div className="fcl-empty__sub">
                            {entries.length === 0
                                ? 'Claims from transcriptions will appear here as they are verified.'
                                : 'Try adjusting your filter or search query.'
                            }
                        </div>
                    </div>
                ) : (
                    filtered.map(entry => {
                        const vc = VERDICT_CONFIG[entry.verdict];
                        const isExpanded = expandedId === entry.id;

                        return (
                            <div
                                key={entry.id}
                                className={`fcl-entry ${isExpanded ? 'fcl-entry--expanded' : ''}`}
                                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            >
                                <div className="fcl-entry__main">
                                    <div className="fcl-entry__verdict-col">
                                        <span className="fcl-entry__verdict-icon" style={{ color: vc.color }}>
                                            {vc.icon}
                                        </span>
                                        <span
                                            className="fcl-entry__verdict-label"
                                            style={{ color: vc.color, background: vc.bg }}
                                        >
                                            {vc.label}
                                        </span>
                                    </div>

                                    <div className="fcl-entry__content">
                                        <p className="fcl-entry__claim">{entry.claim}</p>
                                        <div className="fcl-entry__meta">
                                            <span className="fcl-entry__time">{formatTime(entry.timestamp)}</span>
                                            <div className="fcl-entry__conf-wrap">
                                                <div className="fcl-entry__conf-bar">
                                                    <div
                                                        className="fcl-entry__conf-fill"
                                                        style={{
                                                            width: `${entry.confidence * 100}%`,
                                                            background: vc.color
                                                        }}
                                                    />
                                                </div>
                                                <span className="fcl-entry__conf-text">{(entry.confidence * 100).toFixed(0)}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <span className="fcl-entry__chevron">{isExpanded ? '▾' : '▸'}</span>
                                </div>

                                {isExpanded && (
                                    <div className="fcl-entry__details">
                                        {entry.explanation && (
                                            <div className="fcl-entry__explanation">
                                                <strong>Explanation:</strong> {entry.explanation}
                                            </div>
                                        )}
                                        {entry.sources.length > 0 && (
                                            <div className="fcl-entry__sources">
                                                <strong>Sources:</strong>
                                                <ul>
                                                    {entry.sources.map((src, i) => (
                                                        <li key={i}>
                                                            <a href={src} target="_blank" rel="noopener noreferrer">{src}</a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div >
    );
}
