/**
 * KnowledgeBasePanel — Settings → Data Folders (2026-06-14). Three local source
 * folders the user can point Dwellium at:
 *   • Knowledge Base  — AI-summarized wiki + concept links
 *   • Hobbies / Personal — AI-summarized like the KB
 *   • Private — LOCAL ONLY: files are listed but NEVER sent to any LLM and never
 *     exposed to any agent (Honcho/Hermes/Stella/ARA). getAgentVisibleKb()
 *     excludes it by construction.
 *
 * Folder walking runs through the dev-server /__kb/scan route; AI summaries use
 * the user's own LLM keys (skipped entirely for Private).
 */
import { useState } from 'react';
import { Lock, Folder, FolderOpen, Link } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { useKb, saveKbFolder, linkByConcepts, type KbEntry, type KbFolder } from './kbStore';
import FolderPickerModal from './FolderPickerModal';

const MAX_AI_FILES = 30;

function FolderSection({ folder }: { folder: KbFolder }) {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const [path, setPath] = useState(folder.folder);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);

    const chooseFolder = async () => {
        const api = (window as any).electronAPI;
        if (api?.chooseDirectory) {
            try {
                const p = await api.chooseDirectory();
                if (p) setPath(p);
            } catch (err) {
                console.error('Electron chooseDirectory error:', err);
            }
        } else {
            setPickerOpen(true);
        }
    };

    const index = async () => {
        setError(''); setBusy(true); setProgress('Scanning folder…');
        try {
            const r = await fetch('/__kb/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: path }) });
            const j = await r.json();
            if (!j?.success) throw new Error(j?.error || 'Scan failed');
            const files = (j.files as { rel: string; name: string; text: string }[]).slice(0, MAX_AI_FILES);
            const entries: KbEntry[] = [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (folder.isPrivate) {
                    // PRIVATE: never contact an LLM. Local listing only.
                    entries.push({ rel: f.rel, title: f.name, summary: '(private — local only, never sent to any model)', concepts: [] });
                    setProgress(`Listing ${i + 1}/${files.length} (local, private)`);
                    continue;
                }
                setProgress(`Summarizing ${i + 1}/${files.length}: ${f.name}`);
                let summary = '(no summary)'; let concepts: string[] = [];
                if (llmReady) {
                    try {
                        const res = await callLlm({
                            prompt: `File: ${f.rel}\n\n${f.text}`,
                            systemPrompt: 'You write a knowledge-base entry for one file. Reply ONLY JSON: {"summary":"1-2 sentence plain-English blurb","concepts":["3-6 key concepts/topics, short noun phrases"]}.',
                            responseFormat: 'json', maxTokens: 400, temperature: 0.2,
                        }, integrations.llm);
                        if (res) { const p = JSON.parse(res.text); summary = String(p.summary || summary); concepts = Array.isArray(p.concepts) ? p.concepts.map(String) : []; }
                    } catch { /* keep defaults */ }
                }
                entries.push({ rel: f.rel, title: f.name, summary, concepts });
            }
            const links = folder.isPrivate ? [] : linkByConcepts(entries);
            saveKbFolder(folder.category, { folder: j.folder, entries, links, indexedAt: Date.now() });
            setProgress(`${folder.isPrivate ? 'Listed' : 'Indexed'} ${entries.length} files${folder.isPrivate ? ' (kept private)' : ` · ${links.length} concept links`}.`);
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    };

    const accent = folder.isPrivate ? '#ef6a6a' : 'var(--accent)';
    return (
        <section className="cp-section" style={folder.isPrivate ? { borderLeft: '3px solid #ef6a6a', paddingLeft: 12 } : undefined}>
            <h3 className="cp-section__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{folder.isPrivate ? <Lock size={14} aria-hidden /> : <Folder size={14} aria-hidden />}{folder.name}{folder.isPrivate && <span style={{ marginLeft: 8, fontSize: 10, color: '#ef6a6a', border: '1px solid #ef6a6a', borderRadius: 6, padding: '1px 6px' }}>PRIVATE · NO AGENT ACCESS</span>}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary, #808080)', lineHeight: 1.5, margin: '0 0 12px' }}>
                {folder.isPrivate
                    ? 'A local folder kept entirely private. Files are listed for you to browse, but their contents are NEVER sent to any LLM and never exposed to Honcho, Hermes, Stella, or ARA.'
                    : 'A local folder turned into a short AI wiki — every file gets a summary + key concepts, and files that share concepts get linked together.'}
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/you/Folder  (absolute path or ~/Folder)"
                    style={{ flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-surface, #1a1a1a)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-default, #333)' }} />
                <button
                    type="button"
                    onClick={() => void chooseFolder()}
                    title="Select folder"
                    aria-label="Select folder"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--bg-surface, #1a1a1a)',
                        color: 'var(--text-secondary, #aaa)',
                        border: '1px solid var(--border-default, #333)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default, #333)'; }}
                >
                    <FolderOpen size={16} aria-hidden />
                </button>
                <button onClick={() => void index()} disabled={busy || !path.trim()}
                    style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, cursor: busy || !path.trim() ? 'not-allowed' : 'pointer', background: !busy && path.trim() ? accent : '#222', color: !busy && path.trim() ? (folder.isPrivate ? '#fff' : 'var(--accent-text, #000)') : '#777', border: 'none', whiteSpace: 'nowrap' }}>
                    {busy ? 'Working…' : folder.isPrivate ? 'Index (private)' : 'Index folder'}</button>
            </div>
            {!folder.isPrivate && !llmReady && <p style={{ fontSize: 11.5, color: '#e7c879', margin: '0 0 8px' }}>No LLM key configured — files will be listed but summaries empty (Control Panel → API Keys).</p>}
            {progress && <p style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)', margin: '4px 0' }}>{progress}</p>}
            {error && <p style={{ fontSize: 12, color: '#ef6a6a', margin: '4px 0' }}>{error}</p>}
            {folder.entries.length > 0 && (
                <div style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border-default, #2a2a2a)', borderRadius: 8 }}>
                    {folder.entries.map((e, i) => (
                        <div key={e.rel + i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,.06))' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <strong style={{ fontSize: 13, color: 'var(--text-primary, #eee)' }}>{e.title}</strong>
                                {!folder.isPrivate && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--accent-text, var(--accent))' }}><Link size={11} aria-hidden /> {folder.links.filter(([a, b]) => a === i || b === i).length}</span>}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)', margin: '3px 0', lineHeight: 1.4 }}>{e.summary}</div>
                            {e.concepts.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{e.concepts.map((c) => <span key={c} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent-text, var(--accent))' }}>{c}</span>)}</div>}
                        </div>
                    ))}
                </div>
            )}
            {pickerOpen && (
                <FolderPickerModal
                    initialPath={path}
                    onSelect={(selected) => {
                        setPath(selected);
                        setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </section>
    );
}

export default function KnowledgeBasePanel() {
    const kb = useKb();
    return (
        <>
            <FolderSection folder={kb.folders.knowledge} />
            <FolderSection folder={kb.folders.personal} />
            <FolderSection folder={kb.folders.private} />
        </>
    );
}
