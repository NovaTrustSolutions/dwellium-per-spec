/**
 * KnowledgeBasePanel — Scribe Settings → Knowledge Base (2026-06-14).
 * Set a local folder; everything inside gets a short AI wiki (summary +
 * concepts), and similar concepts get linked across files (feature E). The
 * folder is walked by the dev-server /__kb/scan route; summaries come from the
 * user's own LLM keys via callLlm. Persisted per-user in kbStore.
 */
import { useState } from 'react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { useKb, saveKb, linkByConcepts, type KbEntry } from './kbStore';

const MAX_AI_FILES = 30; // cap the AI pass; re-run to extend

export default function KnowledgeBasePanel() {
    const kb = useKb();
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const [folder, setFolder] = useState(kb.folder);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');

    const index = async () => {
        setError(''); setBusy(true); setProgress('Scanning folder…');
        try {
            const r = await fetch('/__kb/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder }) });
            const j = await r.json();
            if (!j?.success) throw new Error(j?.error || 'Scan failed');
            const files = (j.files as { rel: string; name: string; text: string }[]).slice(0, MAX_AI_FILES);
            const entries: KbEntry[] = [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
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
                    } catch { /* keep defaults for this file */ }
                }
                entries.push({ rel: f.rel, title: f.name, summary, concepts });
            }
            const links = linkByConcepts(entries);
            saveKb({ folder: j.folder, entries, links, indexedAt: Date.now() });
            setProgress(`Indexed ${entries.length} files · ${links.length} concept links.`);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const linkCountFor = (idx: number) => kb.links.filter(([a, b]) => a === idx || b === idx).length;

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">Scribe — Knowledge Base</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary, #808080)', lineHeight: 1.5, margin: '0 0 12px' }}>
                Point Scribe at a local folder. Every file inside gets a short AI wiki (summary + key concepts), and
                files that share concepts get linked together. Folder access runs through the dev server; summaries use
                your configured LLM keys.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="/Users/you/Notes  (absolute path or ~/Notes)"
                    style={{ flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-surface, #1a1a1a)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-default, #333)' }}
                />
                <button
                    onClick={() => void index()}
                    disabled={busy || !folder.trim()}
                    style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, cursor: busy || !folder.trim() ? 'not-allowed' : 'pointer', background: !busy && folder.trim() ? 'var(--accent, #D6FE51)' : '#222', color: !busy && folder.trim() ? '#000' : '#777', border: '1px solid var(--border-default, #333)', whiteSpace: 'nowrap' }}
                >{busy ? 'Indexing…' : 'Index folder'}</button>
            </div>

            {!llmReady && <p style={{ fontSize: 11.5, color: '#e7c879', margin: '0 0 8px' }}>No LLM key configured — files will be listed but summaries will be empty. Add a key in Control Panel → API Keys.</p>}
            {progress && <p style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)', margin: '4px 0' }}>{progress}</p>}
            {error && <p style={{ fontSize: 12, color: '#ef6a6a', margin: '4px 0' }}>{error}</p>}

            {kb.entries.length > 0 && (
                <div style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border-default, #2a2a2a)', borderRadius: 8 }}>
                    {kb.entries.map((e, i) => (
                        <div key={e.rel} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,.06))' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <strong style={{ fontSize: 13, color: 'var(--text-primary, #eee)' }}>{e.title}</strong>
                                <span style={{ fontSize: 11, color: 'var(--accent-text, var(--accent))' }}>🔗 {linkCountFor(i)} linked</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)', margin: '4px 0', lineHeight: 1.45 }}>{e.summary}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {e.concepts.map((c) => (
                                    <span key={c} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent-text, var(--accent))' }}>{c}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
