/**
 * IDocLibrary — "New with AI" / paste / import / blank + the doc grid.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { hasActiveLlm } from '../../../lib/llmClient';
import { useIntegrations } from '../../../hooks/useIntegrations';
import { docxToMarkdown } from '../docxConvert';
import { download, exportHtml, safeFilename } from './idocExport';
import { docFromMarkdownHeadings, generateDocFromPrompt, generateDocFromText } from './idocsAi';
import { createDoc, deleteDoc, duplicateDoc, exportDoc, importDoc, replaceDoc, setActive, setView, type IdocsState } from './idocsStore';
import { themeById, type IDoc } from './idocTypes';

const TONES = ['', 'professional', 'friendly', 'persuasive', 'educational', 'playful'];

export default function IDocLibrary({ state, initialPrompt }: { state: IdocsState; initialPrompt?: string | null }) {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const [tab, setTab] = useState<'ai' | 'paste' | null>(initialPrompt ? 'ai' : null);
    const [prompt, setPrompt] = useState(initialPrompt ?? '');
    const [pasteText, setPasteText] = useState('');
    const [cards, setCards] = useState(6);
    const [tone, setTone] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [confirmDel, setConfirmDel] = useState<string | null>(null);
    // A widget-action prompt that couldn't auto-generate (no LLM) lands in the composer.
    useEffect(() => { if (initialPrompt) { setPrompt(initialPrompt); setTab('ai'); } }, [initialPrompt]);

    const open = (doc: IDoc) => { replaceDoc(doc); setActive(doc.id); setView('edit'); };

    const runAi = async () => {
        setBusy(true); setError(null);
        try {
            const doc = tab === 'paste'
                ? await generateDocFromText(pasteText, { cards, tone }, integrations.llm)
                : await generateDocFromPrompt(prompt, { cards, tone }, integrations.llm);
            if (doc) open(doc); else setError('The model returned nothing usable. Try again or rephrase.');
        } catch (e) { setError(`Generation failed: ${(e as Error).message}`); }
        finally { setBusy(false); }
    };

    const pasteNoAi = () => { if (pasteText.trim()) open(docFromMarkdownHeadings(pasteText, 'Pasted doc')); };

    const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setBusy(true); setError(null);
        try {
            const name = f.name.toLowerCase();
            const title = f.name.replace(/\.[^.]+$/, '');
            if (name.endsWith('.json')) {
                const d = importDoc(await f.text());
                if (!d) setError('Not a valid Interactive Doc JSON file.');
                return;
            }
            let text: string;
            if (name.endsWith('.docx')) text = await docxToMarkdown(await f.arrayBuffer());
            else text = await f.text();
            if (llmReady) {
                const d = await generateDocFromText(text, { cards, tone }, integrations.llm);
                if (d) { open({ ...d, title: d.title || title }); return; }
            }
            open(docFromMarkdownHeadings(text, title));
        } catch (err) { setError(`Import failed: ${(err as Error).message}`); }
        finally { setBusy(false); }
    };

    return (
        <div className="scribe-idocs__library">
            <header className="scribe-idocs__lib-head">
                <h1>Interactive Docs</h1>
                <p className="scribe-idocs__hint">Card-based, themed, interactive documents — generate with AI, paste an outline, or start blank.</p>
                <div className="scribe-idocs__row">
                    <button type="button" className={`scribe-idocs__btn scribe-idocs__btn--primary${tab === 'ai' ? ' is-active' : ''}`} onClick={() => setTab(tab === 'ai' ? null : 'ai')}>✦ New with AI</button>
                    <button type="button" className={`scribe-idocs__btn${tab === 'paste' ? ' is-active' : ''}`} onClick={() => setTab(tab === 'paste' ? null : 'paste')}>Paste text / outline</button>
                    <button type="button" className="scribe-idocs__btn" onClick={() => fileRef.current?.click()} disabled={busy}>Import (.md .txt .docx .json)</button>
                    <input ref={fileRef} type="file" accept=".md,.txt,.markdown,.docx,.json,text/plain,text/markdown,application/json" hidden onChange={(e) => void onImport(e)} />
                    <button type="button" className="scribe-idocs__btn" onClick={() => createDoc()}>Blank</button>
                </div>
                {tab && (
                    <div className="scribe-idocs__composer">
                        {tab === 'ai' ? (
                            <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What should the doc be about? e.g. “Onboarding guide for new property managers, with a quiz at the end”" aria-label="Prompt" />
                        ) : (
                            <textarea rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste notes, an outline, or a whole article (≤12k chars used)…" aria-label="Source text" />
                        )}
                        <div className="scribe-idocs__row">
                            <label className="scribe-idocs__inline">Cards <input type="number" min={1} max={12} value={cards} onChange={(e) => setCards(Math.max(1, Math.min(12, Number(e.target.value) || 6)))} /></label>
                            <label className="scribe-idocs__inline">Tone <select value={tone} onChange={(e) => setTone(e.target.value)}>{TONES.map((t) => <option key={t} value={t}>{t || 'auto'}</option>)}</select></label>
                            <span className="scribe-idocs__spacer" />
                            {tab === 'paste' && <button type="button" className="scribe-idocs__btn" onClick={pasteNoAi} disabled={!pasteText.trim() || busy}>Split by headings (no AI)</button>}
                            <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void runAi()} disabled={busy || !llmReady || !(tab === 'ai' ? prompt.trim() : pasteText.trim())}>{busy ? 'Generating…' : 'Generate'}</button>
                        </div>
                        {!llmReady && <p className="scribe-idocs__warn">No LLM configured — add a key in Control Panel → API Keys to generate with AI. Import and “Split by headings” still work.</p>}
                        {error && <p className="scribe-idocs__warn" role="alert">{error}</p>}
                    </div>
                )}
            </header>

            {state.docs.length === 0 ? (
                <p className="scribe-idocs__empty">No docs yet — create one above.</p>
            ) : (
                <ul className="scribe-idocs__grid">
                    {state.docs.map((d) => (
                        <li key={d.id} className="scribe-idocs__docitem">
                            <button type="button" className="scribe-idocs__doccard" onClick={() => { setActive(d.id); setView('edit'); }}>
                                <span className="scribe-idocs__docswatch" style={{ background: themeById(d.theme).swatch }} />
                                <strong>{d.title || 'Untitled'}</strong>
                                {d.description && <small>{d.description}</small>}
                                <small className="scribe-idocs__docmeta">{d.cards.length} cards · {d.analytics?.views ?? 0} views · {new Date(d.updatedAt).toLocaleDateString()}</small>
                            </button>
                            <div className="scribe-idocs__doctools">
                                <button type="button" onClick={() => { setActive(d.id); setView('present'); }} title="Present">▶</button>
                                <button type="button" onClick={() => duplicateDoc(d.id)} title="Duplicate">⧉</button>
                                <button type="button" onClick={() => download(`${safeFilename(d.title)}.html`, 'text/html', exportHtml(d))} title="Export HTML">HTML</button>
                                <button type="button" onClick={() => download(`${safeFilename(d.title)}.idoc.json`, 'application/json', exportDoc(d.id))} title="Export JSON">JSON</button>
                                {confirmDel === d.id
                                    ? <><button type="button" className="is-danger" onClick={() => { deleteDoc(d.id); setConfirmDel(null); }}>Delete?</button><button type="button" onClick={() => setConfirmDel(null)}>No</button></>
                                    : <button type="button" onClick={() => setConfirmDel(d.id)} title="Delete" aria-label="Delete doc">✕</button>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
