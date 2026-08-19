/**
 * IDocLibrary — "New with AI" / "Create with Agent" (outline-first: draft →
 * edit outline → generate, with style presets + optional web research) /
 * paste / import (.md .txt .docx .pptx .json .pdf) / from URL / blank / templates +
 * the searchable, sortable doc grid. Composer options (cards, amount, tone,
 * audience, language) persist in localStorage['scribe-idocs:composer'].
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { hasActiveLlm } from '../../../lib/llmClient';
import { useIntegrations } from '../../../hooks/useIntegrations';
import type { IntegrationsBundle } from '../../../types/integrations';
import { docxToMarkdown } from '../docxConvert';
import { download, exportHtml, safeFilename } from './idocExport';
import { MAX_CARDS, docFromMarkdownHeadings, generateDocFromPrompt, generateDocFromText, type GenerateAmount, type GenerateOpts } from './idocsAi';
import { defaultExtractPdfText, fetchUrlText, importFromPdf, importFromUrl } from './idocsImport';
import { mergeDocs } from './idocsMerge';
import {
    STYLE_PRESETS, canResearch, generateFromOutline, generateOutline, loadRecentOutlines, researchTopic, saveLastOutline,
    type DocOutline, type OutlineCard, type ResearchResult, type StylePreset,
} from './idocsOutline';
import { createDoc, deleteDoc, duplicateDoc, exportDoc, importDoc, replaceDoc, setActive, setView, updateDoc, type IdocsState } from './idocsStore';
import { BUILTIN_TEMPLATES, docFromTemplate } from './idocsTemplates';
import { newId, themeById, type IDoc } from './idocTypes';
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

type Tab = 'ai' | 'paste' | 'url' | 'agent' | null;
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
    // Wave 3A: multi-select → merge into a new doc.
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const toggleSelected = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const mergeSelected = () => {
        const picked = state.docs.filter((d) => selected.has(d.id));
        if (picked.length < 2) return;
        const [first, ...rest] = picked;
        const merged = mergeDocs(first, rest);
        setSelected(new Set());
        createDoc({ ...merged, id: newId('doc'), title: `${first.title} (merged)`, isTemplate: false, analytics: { views: 0, cardSeconds: {} } });
    };
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
            if (name.endsWith('.pptx')) {
                const { importPptxFile } = await import('./idocsPptxImport');
                open(await importPptxFile(f));
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
                    <button type="button" className={`scribe-idocs__btn${tab === 'agent' ? ' is-active' : ''}`} onClick={() => setTab(tab === 'agent' ? null : 'agent')} title="Outline first, then generate — with style presets and optional web research">✦ Create with Agent</button>
                    <button type="button" className={`scribe-idocs__btn${tab === 'paste' ? ' is-active' : ''}`} onClick={() => setTab(tab === 'paste' ? null : 'paste')}>Paste text / outline</button>
                    <button type="button" className={`scribe-idocs__btn${tab === 'url' ? ' is-active' : ''}`} onClick={() => setTab(tab === 'url' ? null : 'url')}>From URL</button>
                    <button type="button" className="scribe-idocs__btn" onClick={() => fileRef.current?.click()} disabled={busy}>Import (.md .txt .docx .pptx .pdf .json)</button>
                    <input ref={fileRef} type="file" accept=".md,.txt,.markdown,.docx,.pptx,.pdf,.json,text/plain,text/markdown,application/pdf,application/json,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden onChange={onImport} />
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
                        {tab === 'agent' && <AgentComposer genOpts={genOpts} llmReady={llmReady} integrations={integrations} open={open} initialPrompt={prompt} />}
                        {tab !== 'agent' && <div className="scribe-idocs__row">
                            {opts.cards > 12 && <span className="scribe-idocs__hint">Outline first, then {Math.ceil(opts.cards / 10)} batches — takes a bit longer.</span>}
                            <span className="scribe-idocs__spacer" />
                            {tab === 'paste' && <button type="button" className="scribe-idocs__btn" onClick={pasteNoAi} disabled={!pasteText.trim() || busy}>Split by headings (no AI)</button>}
                            {tab === 'url'
                                ? <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void runUrl()} disabled={busy || !url.trim()}>{busy ? 'Importing…' : llmReady ? 'Import with AI' : 'Import (split by headings)'}</button>
                                : <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void runAi()} disabled={busy || !llmReady || !canGenerate}>{busy ? 'Generating…' : 'Generate'}</button>}
                        </div>}
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
                    {selected.size > 0 && <>
                        <span className="scribe-idocs__spacer" />
                        <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={mergeSelected} disabled={selected.size < 2} title="Append the selected docs' cards into a new doc (first selected keeps its theme)">Merge {selected.size} into new doc</button>
                        <button type="button" className="scribe-idocs__btn" onClick={() => setSelected(new Set())}>Clear</button>
                    </>}
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
                            <label className="scribe-idocs-lib__pick"><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelected(d.id)} aria-label={`Select ${d.title || 'Untitled'} for merge`} /></label>
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

// ── Create with Agent (outline-first) ─────────────────────────────────

const PRESETS = Object.keys(STYLE_PRESETS) as StylePreset[];
const AGENT_ACCEPT = '.md,.txt,.markdown,.docx,.pdf,text/plain,text/markdown,application/pdf';

interface AgentComposerProps { genOpts: GenerateOpts; llmReady: boolean; integrations: IntegrationsBundle; open: (doc: IDoc) => void; initialPrompt?: string }

/** Read an uploaded .pdf/.docx/.md/.txt as text (reuses the idocsImport readers). */
async function readSourceFile(f: File): Promise<string> {
    const name = f.name.toLowerCase();
    if (name.endsWith('.pdf')) return (await defaultExtractPdfText(new Uint8Array(await f.arrayBuffer()))).map((p, i) => `[Page ${i + 1}]\n${p}`).join('\n\n');
    if (name.endsWith('.docx')) return docxToMarkdown(await f.arrayBuffer());
    return f.text();
}

function AgentComposer({ genOpts, llmReady, integrations, open, initialPrompt }: AgentComposerProps) {
    const [prompt, setPrompt] = useState(initialPrompt ?? '');
    const [source, setSource] = useState<{ name: string; text: string } | null>(null);
    const [url, setUrl] = useState('');
    const [preset, setPreset] = useState<StylePreset>('classic');
    const [research, setResearch] = useState(false);
    const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
    const [outline, setOutline] = useState<DocOutline | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [recent, setRecent] = useState(loadRecentOutlines);
    const fileRef = useRef<HTMLInputElement>(null);
    const researchOk = canResearch({ llm: integrations.llm, search: integrations.search });
    const agentOpts = { ...genOpts, preset, research: researchResult };

    const run = async (label: string, job: () => Promise<void>) => {
        setBusy(label); setError(null);
        try { await job(); } catch (e) { setError(`Failed: ${(e as Error).message}`); } finally { setBusy(null); }
    };

    const attach = (f: File | undefined) => { if (f) void run('Reading file…', async () => setSource({ name: f.name, text: await readSourceFile(f) })); };
    const attachUrl = () => run('Fetching page…', async () => {
        const got = await fetchUrlText(url);
        if ('error' in got) { setError(got.message); return; }
        setSource({ name: got.title || url, text: got.text }); setUrl('');
    });

    const draft = () => run('Drafting outline…', async () => {
        let r: ResearchResult | null = null;
        if (research && researchOk) {
            setBusy('Researching…');
            r = await researchTopic(prompt.trim() || source?.name || '', { llm: integrations.llm, search: integrations.search });
            setBusy('Drafting outline…');
        }
        setResearchResult(r);
        const o = await generateOutline({ prompt, sourceText: source?.text }, { ...genOpts, preset, research: r }, integrations.llm);
        if (!o) { setError('The model returned no usable outline. Try again or rephrase.'); return; }
        setOutline(o); saveLastOutline(o, { ...genOpts, preset, research: r }); setRecent(loadRecentOutlines());
    });

    const generate = () => outline && run('Generating…', async () => {
        saveLastOutline(outline, agentOpts); setRecent(loadRecentOutlines());
        const doc = await generateFromOutline(outline, agentOpts, integrations.llm, undefined, (done, total) => setProgress({ done, total }));
        setProgress(null);
        if (doc) open(doc); else setError('Generation failed — your outline is kept; press Generate to retry.');
    });

    const patchCard = (i: number, p: Partial<OutlineCard>) => setOutline((o) => o && { ...o, cards: o.cards.map((c, k) => (k === i ? { ...c, ...p } : c)) });
    const moveCard = (i: number, d: -1 | 1) => setOutline((o) => {
        if (!o || i + d < 0 || i + d >= o.cards.length) return o;
        const cards = [...o.cards]; const [c] = cards.splice(i, 1); cards.splice(i + d, 0, c); return { ...o, cards };
    });
    const removeCard = (i: number) => setOutline((o) => o && { ...o, cards: o.cards.filter((_, k) => k !== i) });
    const addCard = () => setOutline((o) => o && { ...o, cards: [...o.cards, { title: `Card ${o.cards.length + 1}`, bullets: [] }] });

    if (outline) {
        return (
            <div className="scribe-idocs-agent" aria-label="Outline editor">
                <p className="scribe-idocs__hint">Step 2 of 3 — edit the outline (titles are fixed for generation; bullets become the content), then generate.</p>
                <input type="text" value={outline.title} onChange={(e) => setOutline({ ...outline, title: e.target.value })} aria-label="Document title" className="scribe-idocs-agent__title" />
                <input type="text" value={outline.description} onChange={(e) => setOutline({ ...outline, description: e.target.value })} aria-label="Description" placeholder="One-sentence description" />
                <ol className="scribe-idocs-agent__cards">
                    {outline.cards.map((c, i) => (
                        <li key={i} className="scribe-idocs-agent__card">
                            <div className="scribe-idocs__row">
                                <span className="scribe-idocs-agent__num">{i + 1}</span>
                                <input type="text" value={c.title} onChange={(e) => patchCard(i, { title: e.target.value })} aria-label={`Card ${i + 1} title`} className="scribe-idocs-agent__cardtitle" />
                                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={() => moveCard(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={() => moveCard(i, 1)} disabled={i === outline.cards.length - 1} aria-label="Move down">↓</button>
                                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={() => removeCard(i)} aria-label={`Remove card ${i + 1}`}>✕</button>
                            </div>
                            <textarea rows={Math.max(2, c.bullets.length)} value={c.bullets.join('\n')} onChange={(e) => patchCard(i, { bullets: e.target.value.split('\n') })} onBlur={(e) => patchCard(i, { bullets: e.target.value.split('\n').map((b) => b.trim()).filter(Boolean) })} aria-label={`Card ${i + 1} bullets`} placeholder="One bullet per line" />
                        </li>
                    ))}
                </ol>
                <div className="scribe-idocs__row">
                    <button type="button" className="scribe-idocs__btn" onClick={addCard}>+ Add card</button>
                    <span className="scribe-idocs__hint">{STYLE_PRESETS[preset].label}{researchResult ? ` · ${researchResult.sources.length} sources` : ''} · {outline.cards.length} cards</span>
                    <span className="scribe-idocs__spacer" />
                    <button type="button" className="scribe-idocs__btn" onClick={() => { setOutline(null); setProgress(null); }} disabled={!!busy}>← Back</button>
                    <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void generate()} disabled={!!busy || !llmReady || !outline.cards.some((c) => c.title.trim())}>
                        {progress ? `Card ${Math.min(progress.total, progress.done + 1)} of ${progress.total}…` : busy ? busy : 'Generate doc'}
                    </button>
                </div>
                {error && <p className="scribe-idocs__warn" role="alert">{error}</p>}
            </div>
        );
    }

    return (
        <div className="scribe-idocs-agent" aria-label="Create with Agent">
            <p className="scribe-idocs__hint">Step 1 of 3 — describe the doc (and/or attach a source), pick a style, then draft an outline you can edit before anything is written.</p>
            <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What should the doc be about? e.g. “Q3 owner update for Maple Court, with a maintenance recap and next-quarter plan”" aria-label="Agent prompt" />
            <div className="scribe-idocs__row">
                <button type="button" className="scribe-idocs__btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>Attach file (.md .txt .docx .pdf)</button>
                <input ref={fileRef} type="file" accept={AGENT_ACCEPT} hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ''; }} />
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or a page URL" aria-label="Source URL" onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) void attachUrl(); }} />
                <button type="button" className="scribe-idocs__btn" onClick={() => void attachUrl()} disabled={!!busy || !url.trim()}>Fetch</button>
                {source && <span className="scribe-idocs-agent__source">📎 {source.name} ({source.text.length.toLocaleString()} chars) <button type="button" onClick={() => setSource(null)} aria-label="Remove source">✕</button></span>}
            </div>
            <div className="scribe-idocs__row" role="radiogroup" aria-label="Style preset">
                {PRESETS.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={preset === p} className={`scribe-idocs__btn${preset === p ? ' is-active' : ''}`} onClick={() => setPreset(p)} title={STYLE_PRESETS[p].blurb}>{STYLE_PRESETS[p].label}</button>
                ))}
                <span className="scribe-idocs__hint">{STYLE_PRESETS[preset].blurb}</span>
            </div>
            <div className="scribe-idocs__row">
                <label className="scribe-idocs__inline" title={researchOk ? 'Web-search the topic (top 5) and ground the doc in it; adds a Sources card' : 'Add a Tavily/Brave (or Anthropic) key in Control Panel → API Keys to enable'}>
                    <input type="checkbox" checked={research && researchOk} onChange={(e) => setResearch(e.target.checked)} disabled={!researchOk} /> Research the topic{!researchOk ? ' (no search key)' : ''}
                </label>
                <span className="scribe-idocs__spacer" />
                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => void draft()} disabled={!!busy || !llmReady || (!prompt.trim() && !source)}>{busy ?? 'Draft outline'}</button>
            </div>
            {error && <p className="scribe-idocs__warn" role="alert">{error}</p>}
            {recent.length > 0 && (
                <div className="scribe-idocs-agent__recent">
                    <span className="scribe-idocs__hint">Recent outlines:</span>
                    {recent.map((r, i) => (
                        <button key={`${r.at}-${i}`} type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={() => { setOutline(r.outline); if (r.opts.preset && STYLE_PRESETS[r.opts.preset]) setPreset(r.opts.preset); setResearchResult(r.opts.research ?? null); }} title={new Date(r.at).toLocaleString()}>
                            {r.outline.title} · {r.outline.cards.length} cards
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
