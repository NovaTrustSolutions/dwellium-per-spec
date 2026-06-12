/**
 * ArtifactGallery — P12-3 (gap item 10): everything your agents produce,
 * browsable. Grid of typed cards (≤5-word title + ≤14-word summary), filter
 * chips, search, preview (sandboxed for HTML, inline for images), pin,
 * delete, copy, open-in-Scribe. Auto-fed by ARA replies, team-run
 * deliverables, image generation, and drafted documents.
 */
import { useMemo, useState } from 'react';
import { Layers, Pin, Search, Trash2, X, Copy, ExternalLink } from 'lucide-react';
import { useArtifacts, type Artifact, type ArtifactType } from '../../lib/artifactStore';
import { useScribeStore } from '../Scribe/scribeStore';
import './ArtifactGallery.css';

const TYPE_LABELS: Record<ArtifactType, string> = {
    markdown: 'Markdown', html: 'HTML', image: 'Images', code: 'Code', data: 'Data', text: 'Text',
};

const SOURCE_LABELS: Record<string, string> = {
    'ara': 'ARA', 'team-run': 'Team run', 'skill': 'Skill', 'stella': 'Stella', 'manual': 'Manual',
};

function timeAgo(ts: number): string {
    const m = Math.floor((Date.now() - ts) / 60_000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function ArtifactGallery() {
    const { artifacts, deleteArtifact, togglePinArtifact, clearArtifacts } = useArtifacts();
    const [filter, setFilter] = useState<ArtifactType | 'all'>('all');
    const [query, setQuery] = useState('');
    const [preview, setPreview] = useState<Artifact | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return [...artifacts]
            .filter(a => (filter === 'all' || a.type === filter))
            .filter(a => !q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || (a.type !== 'image' && a.content.toLowerCase().includes(q)))
            .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.createdAt - a.createdAt);
    }, [artifacts, filter, query]);

    const counts = useMemo(() => {
        const c: Partial<Record<ArtifactType, number>> = {};
        for (const a of artifacts) c[a.type] = (c[a.type] ?? 0) + 1;
        return c;
    }, [artifacts]);

    const openInScribe = (a: Artifact) => {
        try {
            useScribeStore.getState().openInMemoryFile(`artifacts/${a.title.replace(/[^a-zA-Z0-9 -]/g, '').trim() || a.id}.md`, a.content);
            window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: 'scribe' }));
        } catch { /* */ }
    };

    const copy = (a: Artifact) => {
        try { void navigator.clipboard.writeText(a.content); } catch { /* */ }
    };

    return (
        <div className="agal">
            <header className="agal__head">
                <div className="agal__title"><Layers size={15} aria-hidden /> Artifacts <span className="agal__count">{artifacts.length}</span></div>
                <div className="agal__search">
                    <Search size={13} aria-hidden />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search artifacts…" aria-label="Search artifacts" />
                </div>
                <button
                    className="agal__clear"
                    onClick={() => { if (confirmClear) { clearArtifacts(); setConfirmClear(false); } else setConfirmClear(true); }}
                    disabled={artifacts.length === 0}
                >
                    <Trash2 size={12} aria-hidden /> {confirmClear ? 'Really clear all?' : 'Clear all'}
                </button>
            </header>

            <div className="agal__filters" role="tablist" aria-label="Filter by type">
                <button role="tab" aria-selected={filter === 'all'} className={`agal__chip${filter === 'all' ? ' is-on' : ''}`} onClick={() => setFilter('all')}>All {artifacts.length}</button>
                {(Object.keys(TYPE_LABELS) as ArtifactType[]).map(t => (
                    <button key={t} role="tab" aria-selected={filter === t} className={`agal__chip${filter === t ? ' is-on' : ''}`} onClick={() => setFilter(t)} disabled={!counts[t]}>
                        {TYPE_LABELS[t]} {counts[t] ?? 0}
                    </button>
                ))}
            </div>

            {visible.length === 0 && (
                <p className="agal__empty">
                    {artifacts.length === 0
                        ? 'Nothing captured yet. Long ARA replies, team-run deliverables, generated images, and drafted documents land here automatically.'
                        : 'No artifacts match the current filter.'}
                </p>
            )}

            <div className="agal__grid">
                {visible.map(a => (
                    <article key={a.id} className={`agal__card${a.pinned ? ' is-pinned' : ''}`}>
                        <button className="agal__card-body" onClick={() => setPreview(a)} aria-label={`Preview: ${a.title}`}>
                            {a.type === 'image'
                                ? <img className="agal__thumb" src={a.content} alt={a.title} loading="lazy" />
                                : <pre className="agal__snippet" aria-hidden>{a.content.slice(0, 220)}</pre>}
                            <h3 className="agal__card-title">{a.title}</h3>
                            <p className="agal__card-summary">{a.summary}</p>
                            <footer className="agal__card-meta">
                                <span className={`agal__badge agal__badge--${a.type}`}>{TYPE_LABELS[a.type]}</span>
                                <span>{SOURCE_LABELS[a.source] ?? a.source}</span>
                                <span>{timeAgo(a.createdAt)}</span>
                            </footer>
                        </button>
                        <div className="agal__card-actions">
                            <button onClick={() => togglePinArtifact(a.id)} title={a.pinned ? 'Unpin' : 'Pin (survives the 120-item cap)'} aria-label={`${a.pinned ? 'Unpin' : 'Pin'} ${a.title}`}>
                                <Pin size={13} aria-hidden />
                            </button>
                            <button onClick={() => copy(a)} title="Copy content" aria-label={`Copy ${a.title}`}><Copy size={13} aria-hidden /></button>
                            {a.type !== 'image' && (
                                <button onClick={() => openInScribe(a)} title="Open in Scribe" aria-label={`Open ${a.title} in Scribe`}><ExternalLink size={13} aria-hidden /></button>
                            )}
                            <button onClick={() => deleteArtifact(a.id)} title="Delete" aria-label={`Delete ${a.title}`} className="agal__del"><Trash2 size={13} aria-hidden /></button>
                        </div>
                    </article>
                ))}
            </div>

            {preview && (
                <div className="agal__modal" role="dialog" aria-label={`Artifact: ${preview.title}`} onClick={() => setPreview(null)}>
                    <div className="agal__modal-inner" onClick={e => e.stopPropagation()}>
                        <header className="agal__modal-head">
                            <h3>{preview.title}</h3>
                            <button onClick={() => setPreview(null)} aria-label="Close preview"><X size={16} aria-hidden /></button>
                        </header>
                        {preview.type === 'image' && <img className="agal__modal-img" src={preview.content} alt={preview.title} />}
                        {preview.type === 'html' && <iframe className="agal__modal-frame" title={preview.title} sandbox="" srcDoc={preview.content} />}
                        {preview.type !== 'image' && preview.type !== 'html' && <pre className="agal__modal-pre">{preview.content}</pre>}
                    </div>
                </div>
            )}
        </div>
    );
}
