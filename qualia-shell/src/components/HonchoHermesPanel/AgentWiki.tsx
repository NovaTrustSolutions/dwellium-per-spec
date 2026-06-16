/**
 * AgentWiki — the bidirectional LLM-Wiki view (image-3 spec).
 *
 *  ┌── Identity ──────────────┐   "knows YOU"
 *  │ MEMORY.md  USER.md  SOUL │
 *  └──────────────────────────┘
 *  ┌── Wiki ──────────────────┐   "knows your WORLD"
 *  │ raw · wiki · meetings ·  │
 *  │ docs · facts             │
 *  └──────────────────────────┘
 *
 * Material ingested into `raw` is distilled into `facts`; contradictions are
 * flagged against existing facts. Identity + facts flow back into agent runs
 * via buildWikiContext() (wired by callers).
 */
import { useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import {
    agentWikiStore,
    setIdentityFile,
    addPage,
    deletePage,
    ingestRaw,
    wikiCounts,
    WIKI_FOLDERS,
    type IdentityKind,
    type WikiFolder,
    type IngestReport,
} from './agentWikiStore';

const IDENTITY_FILES: { kind: IdentityKind; blurb: string }[] = [
    { kind: 'MEMORY.md', blurb: 'Working memory about you & the work' },
    { kind: 'USER.md', blurb: 'Who you are, how you like to work' },
    { kind: 'SOUL.md', blurb: "The agent's own values & principles" },
];

export function AgentWiki() {
    const state = useSyncExternalStore(agentWikiStore.subscribe, agentWikiStore.getSnapshot, agentWikiStore.getServerSnapshot);
    const counts = wikiCounts(state);

    const [editing, setEditing] = useState<IdentityKind | null>(null);
    const [draft, setDraft] = useState('');
    const [folder, setFolder] = useState<WikiFolder>('raw');
    const [openFolder, setOpenFolder] = useState<WikiFolder>('facts');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [sources, setSources] = useState('');
    const [report, setReport] = useState<IngestReport | null>(null);

    const startEdit = (k: IdentityKind) => { setEditing(k); setDraft(state.identity[k]); };
    const saveEdit = () => { if (editing) setIdentityFile(editing, draft); setEditing(null); };

    const doIngest = () => {
        if (!body.trim()) return;
        const srcs = sources.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        if (folder === 'raw') {
            const r = ingestRaw({ title, body, sources: srcs });
            setReport(r);
            setOpenFolder('facts');
        } else {
            addPage({ folder, title, body, sources: srcs });
            setReport(null);
            setOpenFolder(folder);
        }
        setTitle(''); setBody(''); setSources('');
    };

    const pages = state.pages.filter(p => p.folder === openFolder);

    return (
        <div className="aw">
            {/* Identity files — "knows you" */}
            <div className="aw__sectlabel">Identity · the agent knows <em>you</em></div>
            <div className="aw__identity">
                {IDENTITY_FILES.map(({ kind, blurb }) => (
                    <div key={kind} className="aw__idcard">
                        <div className="aw__idhead">
                            <span className="aw__idname">{kind}</span>
                            {editing === kind
                                ? <button className="aw__btn aw__btn--p" onClick={saveEdit}>Save</button>
                                : <button className="aw__btn" onClick={() => startEdit(kind)}>Edit</button>}
                        </div>
                        <div className="aw__idblurb">{blurb}</div>
                        {editing === kind
                            ? <textarea className="aw__ta" value={draft} onChange={e => setDraft(e.target.value)} rows={8} />
                            : <pre className="aw__idbody">{state.identity[kind]}</pre>}
                    </div>
                ))}
            </div>

            {/* Wiki folders — "knows your world" */}
            <div className="aw__sectlabel">Wiki · the agent knows your <em>world</em></div>
            <div className="aw__folders">
                {WIKI_FOLDERS.map(f => (
                    <button key={f.id} className={`aw__folder ${openFolder === f.id ? 'on' : ''}`} onClick={() => setOpenFolder(f.id)} title={f.blurb}>
                        <span className="aw__ficon">{f.icon}</span>
                        <span className="aw__flabel">{f.label}</span>
                        <span className="aw__fcount">{counts[f.id]}</span>
                    </button>
                ))}
            </div>

            {/* Ingest box */}
            <div className="aw__ingest">
                <div className="aw__irow">
                    <select className="aw__sel" value={folder} onChange={e => setFolder(e.target.value as WikiFolder)}>
                        {WIKI_FOLDERS.map(f => <option key={f.id} value={f.id}>{f.icon} {f.label}</option>)}
                    </select>
                    <input className="aw__inp" placeholder="Title (optional)" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <textarea className="aw__ta" placeholder="Paste material — into raw it gets distilled into facts & contradictions flagged…" value={body} onChange={e => setBody(e.target.value)} rows={3} />
                <div className="aw__irow">
                    <input className="aw__inp" placeholder="Sources (comma / newline separated)" value={sources} onChange={e => setSources(e.target.value)} />
                    <button className="aw__btn aw__btn--p" onClick={doIngest} disabled={!body.trim()}>
                        {folder === 'raw' ? 'Ingest → distil' : 'Add page'}
                    </button>
                </div>
                {report && (
                    <div className="aw__report">
                        Distilled <strong>{report.factsAdded}</strong> fact{report.factsAdded === 1 ? '' : 's'}.
                        {report.contradictions.length > 0 && (
                            <span className="aw__warn"> {report.contradictions.length} contradiction{report.contradictions.length === 1 ? '' : 's'} flagged.</span>
                        )}
                    </div>
                )}
            </div>

            {/* Pages in the open folder */}
            <div className="aw__pages">
                {pages.length === 0 && <div className="aw__empty">No pages in <strong>{openFolder}</strong> yet.</div>}
                {pages.map(p => (
                    <div key={p.id} className={`aw__page ${p.contradicts ? 'is-contested' : ''}`}>
                        <div className="aw__phead">
                            <span className="aw__ptitle">{p.title}</span>
                            <button className="aw__del" onClick={() => deletePage(p.id)} aria-label="Delete page"><X size={16} /></button>
                        </div>
                        <div className="aw__pbody">{p.body}</div>
                        {p.contradicts && <div className="aw__pwarn">Conflicts with an existing fact — needs review</div>}
                        {p.sources.length > 0 && <div className="aw__psrc">sources: {p.sources.join(' · ')}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
}
