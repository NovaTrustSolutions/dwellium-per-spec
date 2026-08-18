/**
 * IDocLibrary — "New with AI" / paste / import (.md .txt .docx .json .pdf) /
 * from URL / blank / templates + the searchable, sortable doc grid.
 * Composer options (cards, amount, tone, audience, language) persist in
 * localStorage['scribe-idocs:composer'].
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { hasActiveLlm } from '../../../lib/llmClient';
import { useIntegrations } from '../../../hooks/useIntegrations';
import { docxToMarkdown } from '../docxConvert';
import { download, exportHtml, safeFilename } from './idocExport';
import { MAX_CARDS, docFromMarkdownHeadings, generateDocFromPrompt, generateDocFromText, type GenerateAmount, type GenerateOpts } from './idocsAi';
import { importFromPdf, importFromUrl } from './idocsImport';
import { createDoc, deleteDoc, duplicateDoc, exportDoc, importDoc, replaceDoc, setActive, setView, updateDoc, type IdocsState } from './idocsStore';
import { BUILTIN_TEMPLATES, docFromTemplate } from './idocsTemplates';
import { themeById, type IDoc } from './idocTypes';
import './IDocLibrary.css';

const TONES = ['', 'professional', 'friendly', 'persuasive', 'educational', 'playful'];
const AMOUNTS: GenerateAmount[] = ['brief', 'medium', 'detailed', 'extensive'];
const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Polish', 'Russian', 'Ukrainian', 'Turkish', 'Arabic', 'Hebrew', 'Hindi', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Korean', 'Vietnamese', 'Indonesian', 'Swedish'];
const COMPOSER_KEY = 'scribe-idocs:composer';

interface ComposerOpts { cards: number; amount: GenerateAmount; tone: string; audience: string; language: string }
const DEFAULT_OPTS: ComposerOpts = { cards: 6, amount: 'medium', tone: '', audience: '', language: '' };

function loadOpts(): ComposerOpts {
    try {
        const raw = localStorage.getItem(COMPOSER_KEY);
        if (!raw) return DEFAULT_OPTS;
        const p = JSON.parse(raw) as Partial<ComposerOpts>;
        return {
            cards: Math.max(1, Math.min(MAX_CARDS, Number(p.cards) || DEFAULT_OPTS.cards)),
            amount: AMOUNTS.includes(p.amount as GenerateAmount) ? (p.amount as GenerateAmount) : 'medium',
            tone: typeof p.tone === 'string' ? p.tone : '',
            audience: typeof p.audience === 'string' ? p.audience : '',
            language: typeof p.language === 'string' ? p.language : '',
        };
    } catch { return DEFAULT_OPTS; }
}

type Tab = 'ai' | 'paste' | 'url' | null;
type SortKey = 'updated' | 'title';

export default function IDocLibrary({ state, initialPrompt }: { state: IdocsState; initialPrompt?: string | null }) {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const [tab, setTab] = useState<Tab>(initialPrompt ? 'ai' : null);
    const [prompt, setPrompt] = useState(initialPrompt ?? '');
    const [pasteText, setPasteText] = useState('');
    const [url, setUrl] = useState('');
    const [opts, setOpts] = useState<ComposerOpts>(loadOpts);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showTemplates, setShowTemplates] = useState(false);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<SortKey>('updated');
    const fileRef = useRef<HTMLInputElement>(null);
    const [confirmDel, setConfirmDel] = useState<string | null>(null);
    // A widget-action prompt that couldn't auto-generate (no LLM) lands in the composer.
    useEffect(() => { if (initialPrompt) { setPrompt(initialPrompt); setTab('ai'); } }, [initialPrompt]);
    useEffect(() => { try { localStorage.setItem(COMPOSER_KEY, JSON.stringify(opts)); } catch { /* sandboxed */ } }, [opts]);

    const genOpts: GenerateOpts = { cards: opts.cards, amount: opts.amount, tone: opts.tone || undefined, audience: opts.audience.trim() || undefined, language: opts.language.trim() || undefined };
    const patch = (p: Partial<ComposerOpts>) => setOpts((o) => ({ ...o, ...p }));
    const open = (doc: IDoc) => { replaceDoc(doc); setActive(doc.id); setView('edit'); };

    const run = async (job: () => Promise<void>) => {
        setBusy(true); setError(null);
        try { await job(); } catch (e) { setError(`Failed: ${(e as Error).message}`); } finally { setBusy(false); }
    };

    const runAi = () => run(async () => {
        const doc = tab === 'paste'
            ? await generateDocFromText(pasteText, genOpts, integrations.llm)
            : await generateDocFromPrompt(prompt, genOpts, integrations.llm);
        if (doc) open(doc); else setError('The model returned nothing usable. Try again or rephrase.');
    });

    const runUrl = () => run(async () => {
        const r = await importFromUrl(url, integrations.llm, genOpts);
        if ('error' in r) setError(r.message); else open(r.doc);
    });

    const pasteNoAi = () => { if (pasteText.trim()) open(docFromMarkdownHeadings(pasteText, 'Pasted doc')); };

    const onImport = (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        void run(async () => {
            const name = f.name.toLowerCase();
            const title = f.name.replace(/\.[^.]+$/, '');
            if (name.endsWith('.json')) {
                if (!importDoc(await f.text())) setError('Not a valid Interactive Doc JSON file.');
                return;
            }
            if (name.endsWith('.pdf')) {
                const r = await importFromPdf(f, integrations.llm, genOpts);
                if ('error' in r) setError(r.message); else open(r.doc);
                return;
            }
            const text = name.endsWith('.docx') ? await docxToMarkdown(await f.arrayBuffer()) : await f.text();
            if (llmReady) {
                const d = await generateDocFromText(text, genOpts, integrations.llm);
                if (d) { open({ ...d, title: d.title || title }); return; }
            }
            open(docFromMarkdownHeadings(text, title));
        });
    };

    const cloneTemplate = (src: IDoc) => {
        const copy = duplicateDoc(src.id);
        if (!copy) return;
        const doc: IDoc = { ...copy, title: src.title, isTemplate: false };
        replaceDoc(doc); setActive(doc.id); setView('edit');
    };

    const q = query.trim().toLowerCase();
    const sorted = useMemo(() => {
        const list = state.docs.filter((d) => !q || d.title.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q));
        return sort === 'title' ? list.sort((a, b) => a.title.localeCompare(b.title)) : list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, [state.docs, q, sort]);
    const userTemplates = sorted.filter((d) => d.isTemplate);
    const docs = sorted.filter((d) => !d.isTemplate);
    const canGenerate = tab === 'ai' ? !!prompt.trim() : tab === 'paste' ? !!pasteText.trim() : !!url.trim();

    return (
        <div className="scribe-idocs__library">
            <header className="scribe-idocs__lib-head">
                <h1>Interactive Docs</h1>
                <p className="scribe-idocs__hint">Card-based, themed, interactive documents — generate with AI, paste an outline, import a file or URL, or start from a template.</p>
                <div className="scribe-idocs__row">
                    <button type="button" className={`scribe-idocs__btn scribe-idocs__btn--primary${tab === 'ai' ? ' is-active' : ''}`} onClick={() => setTab(tab === 'ai' ? null : 'ai')}>✦ New with AI</button>
                    <button type="button" className={`scribe-idocs__btn${tab === 'paste' ? ' is-active' : ''}`} onClick={() => setTab(tab === 'paste' ? null : 'paste')}>Paste text / outline</button>
                    <button type="button" className={`scribe-idocs__btn${tab === 'url' ? ' is-active' : ''}`} onClick={() => setTab(tab === 'url' ? null : 'url')}>From URL</button>
                    <button type="button" className="scribe-idocs__btn" onClick={() => fileRef.current?.click()} disabled={busy}>Import (.md .txt .docx .pdf .json)</button>
                    <input ref={fileRef} type="file" accept=".md,.txt,.markdown,.docx,.pdf,.json,text/plain,text/markdown,application/pdf,application/json" hidden onChange={onImport} />
                    <button type="button" className={`scribe-idocs__btn${showTemplates ? ' is-active' : ''}`} onClick={() => setShowTemplates((v) => !v)}>Templates</button>
                    <button type="button" className="scribe-idocs__btn" onClick={() => createDoc()}>Blank</button>
                </div>
                {tab && (
                    <div className="scribe-idocs__composer">
                        {tab === 'ai' && <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What should the doc be about? e.g. “Onboarding guide for new property managers, with a quiz at the end”" aria-label="Prompt" />}
                        {tab === 'paste' && <textarea rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste notes, an outline, or a whole article (≤12k chars used)…" aria-label="Source text" />}
                        {tab === 'url' && <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/article" aria-label="Page URL" onKeyDown={(e) => { if (e.key === 'Enter' && url.trim() && !busy) void runUrl(); }} />}
                        <div className="scribe-idocs__row scribe-idocs-lib__opts">
                            <label className="scribe-idocs__inline">Cards <input type="number" min={1} max={MAX_CARDS} value={opts.cards} onChange={(e) => patch({ cards: Math.max(1, Math.min(MAX_CARDS, Number(e.target.value) || 6)) })} /></label>
                            <label className="scribe-idocs__inline">Amount <select value={opts.amount} onChange={(e) => patch({ amount: e.target.value as GenerateAmount })}>{AMOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
                            <label className="scribe-idocs__inline">Tone <select value={opts.tone} onChange={(e) => patch({ tone: e.target.value })}>{TONES.map((t) => <option key={t} value={t}>{t || 'auto'}</option>)}</select></label>
                            <label className="scribe-idocs__inline">Audience <input type="text" value={opts.audience} onChange={(e) => patch({ audience: e.target.value })} placeholder="e.g. property owners" /></label>
                            <label className="scribe-idocs__inline">Language <input type="text" list="scribe-idocs-langs" value={opts.language} onChange={(e) => patch({ language: e.target.value })} placeholder="auto" /></label>
                            <datalist id="scribe-idocs-langs">{LANGUAGES.map((l) => <option key={l} value={l} />)}</datalist>
                        </div>
                        <div className="scribe-idocs__row">
                            {opts.cards > 12 && <span className="scribe-idocs__hint">Outline first, then {Math.ceil(opts.cards / 10)} batches — takes a bit longer.</span>}
                            <span className="scribe-idocs__spacer" />
                            {tab === 'paste' && <button type="button" className="scribe-idocs__btn" onClick={pasteNoAi} disabled={!pasteText.trim() || busy}>Split by headings (no AI)</button>}
                            {tab === 'url'
                                ? <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void runUrl()} disabled={busy || !url.trim()}>{busy ? 'Importing…' : llmReady ? 'Import with AI' : 'Import (split by headings)'}</button>
                                : <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void runAi()} disabled={busy || !llmReady || !canGenerate}>{busy ? 'Generating…' : 'Generate'}</button>}
                        </div>
                        {!llmReady && <p className="scribe-idocs__warn">No LLM configured — add a key in Control Panel → API Keys to generate with AI. Import, URL and “Split by headings” still work.</p>}
                        {error && <p className="scribe-idocs__warn" role="alert">{error}</p>}
                    </div>
                )}
                {!tab && error && <p className="scribe-idocs__warn" role="alert">{error}</p>}
            </header>

            {showTemplates && (
                <section className="scribe-idocs-lib__section" aria-label="Templates">
                    <h2>Templates</h2>
                    <ul className="scribe-idocs__grid">
                        {BUILTIN_TEMPLATES.map((tpl) => (
                            <li key={tpl.id} className="scribe-idocs__docitem scribe-idocs-lib__tpl">
                                <div className="scribe-idocs__doccard">
                                    <span className="scribe-idocs__docswatch" style={{ background: themeById((tpl.doc as { theme?: string }).theme).swatch }} />
                                    <strong>{tpl.title}</strong>
                                    <small>{tpl.description}</small>
                                    <small className="scribe-idocs__docmeta">Built-in · {(tpl.doc as { cards: unknown[] }).cards.length} cards</small>
                                </div>
                                <div className="scribe-idocs__doctools">
                                    <button type="button" onClick={() => open(docFromTemplate(tpl))}>Use template</button>
                                </div>
                            </li>
                        ))}
                        {userTemplates.map((d) => (
                            <li key={d.id} className="scribe-idocs__docitem scribe-idocs-lib__tpl">
                                <button type="button" className="scribe-idocs__doccard" onClick={() => { setActive(d.id); setView('edit'); }} title="Edit template">
                                    <span className="scribe-idocs__docswatch" style={{ background: themeById(d.theme).swatch }} />
                                    <strong>{d.title || 'Untitled'}</strong>
                                    {d.description && <small>{d.description}</small>}
                                    <small className="scribe-idocs__docmeta">Yours · {d.cards.length} cards · {new Date(d.updatedAt).toLocaleDateString()}</small>
                                </button>
                                <div className="scribe-idocs__doctools">
                                    <button type="button" onClick={() => cloneTemplate(d)}>Use template</button>
                                    <button type="button" onClick={() => updateDoc(d.id, { isTemplate: false })} title="Unmark as template">Unmark</button>
                                    {confirmDel === d.id
                                        ? <><button type="button" className="is-danger" onClick={() => { deleteDoc(d.id); setConfirmDel(null); }}>Delete?</button><button type="button" onClick={() => setConfirmDel(null)}>No</button></>
                                        : <button type="button" onClick={() => setConfirmDel(d.id)} title="Delete" aria-label="Delete template">✕</button>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {state.docs.length > 0 && (
                <div className="scribe-idocs__row scribe-idocs-lib__toolbar">
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search docs…" aria-label="Search docs" className="scribe-idocs-lib__search" />
                    <label className="scribe-idocs__inline">Sort <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}><option value="updated">Last updated</option><option value="title">Title</option></select></label>
                    <span className="scribe-idocs__hint">{docs.length} doc{docs.length === 1 ? '' : 's'}{userTemplates.length ? ` · ${userTemplates.length} template${userTemplates.length === 1 ? '' : 's'}` : ''}</span>
                </div>
            )}

            {state.docs.length === 0 ? (
                <p className="scribe-idocs__empty">No docs yet — generate one with AI, import a file or URL, or pick a template above.</p>
            ) : docs.length === 0 ? (
                <p className="scribe-idocs__empty">{q ? `Nothing matches “${query}”.` : 'All your docs are templates — open “Templates” above to use one.'}</p>
            ) : (
                <ul className="scribe-idocs__grid">
                    {docs.map((d) => (
                        <li key={d.id} className="scribe-idocs__docitem">
                            <button type="button" className="scribe-idocs__doccard" onClick={() => { setActive(d.id); setView('edit'); }}>
                                <span className="scribe-idocs__docswatch" style={{ background: themeById(d.theme).swatch }} />
                                <strong>{d.title || 'Untitled'}</strong>
                                {d.description && <small>{d.description}</small>}
                                <small className="scribe-idocs__docmeta">{d.cards.length} cards · {d.analytics?.views ?? 0} views · {new Date(d.updatedAt).toLocaleDateString()}{d.language ? ` · ${d.language}` : ''}</small>
                            </button>
                            <div className="scribe-idocs__doctools">
                                <button type="button" onClick={() => { setActive(d.id); setView('present'); }} title="Present">▶</button>
                                <button type="button" onClick={() => duplicateDoc(d.id)} title="Duplicate">⧉</button>
                                <button type="button" onClick={() => updateDoc(d.id, { isTemplate: true })} title="Save as template">☆</button>
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
