/**
 * TemplateGenerator — fills `{{key}}` placeholders in an HTML or DOCX
 * template from a per-key variable form (or a live Dwellium record) and
 * renders a live preview. The browser is the PDF engine: the preview iframe
 * IS the document, and "Print / Save as PDF" calls `contentWindow.print()`.
 *
 * The template is the source of truth for variables — the form shows
 * exactly the keys found in the active source (HTML template text, or the
 * loaded .docx's placeholders), in first-appearance order. A key's value
 * survives it briefly disappearing from the template while typing.
 *
 * State: templates (html + per-key values/types) persist per-user via
 * `useTemplateGeneratorState()`. Local state covers only this-session,
 * this-window things: active tab, which source is active (html vs. the
 * loaded docx), the loaded docx File + its keys + its rendered preview,
 * the status message, and the "fill from records" toggle.
 */
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Download, FileText, FileUp, Globe, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import FillFromRecord from './FillFromRecord';
import { docxToHtml, extractDocxKeys, fillDocx } from './docxFill';
import { extractKeys, inferType, labelFor, renderTemplate, withPreviewCsp, type VarType } from './templateEngine';
import {
    DEFAULT_HTML_TEMPLATE,
    setTemplateGeneratorState,
    useTemplateGeneratorState,
    type StoredTemplate,
} from '../../utils/templateGeneratorStore';
import './TemplateGenerator.css';

type GeneratorTab = 'html' | 'variables' | 'docx';
type SourceMode = 'html' | 'docx';
type StatusMessage = { kind: 'info' | 'error'; text: string };

const VAR_TYPES: ReadonlyArray<{ value: VarType; label: string }> = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'currency', label: 'Currency' },
];

function inputTypeFor(type: VarType): string {
    if (type === 'date') return 'date';
    if (type === 'number' || type === 'currency') return 'number';
    return 'text';
}

function todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TemplateGenerator() {
    const state = useTemplateGeneratorState();
    const activeTemplate = useMemo(
        () => state.templates.find((t) => t.id === state.activeId) ?? state.templates[0],
        [state.templates, state.activeId],
    );

    const [activeTab, setActiveTab] = useState<GeneratorTab>('html');
    const [sourceMode, setSourceMode] = useState<SourceMode>('html');
    const [docxFile, setDocxFile] = useState<File | null>(null);
    const [docxKeys, setDocxKeys] = useState<string[]>([]);
    const [docxPreviewHtml, setDocxPreviewHtml] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [status, setStatus] = useState<StatusMessage | null>(null);
    const [showFill, setShowFill] = useState(false);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const htmlHeadingId = useId();
    const variablesHeadingId = useId();
    const varIdBase = useId();

    function showStatus(next: StatusMessage) {
        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
            statusTimerRef.current = null;
        }
        setStatus(next);
        if (next.kind === 'info') {
            statusTimerRef.current = setTimeout(() => setStatus(null), 5000);
        }
    }

    useEffect(() => () => {
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    }, []);

    // An empty `date` shows today — derived at render, NEVER written on mount.
    // A mount-time store write bumps One Save's localWriteSeq while the store's
    // first hydrate GET is in flight, so the account's saved templates get
    // discarded and the local default is then synced over them (docs/code.md
    // 2026-09-17: only a user's edit may win that race). Edits persist
    // `activeTemplate.values`, so the derived date is stored only once the
    // user sets a date themselves.
    const values = useMemo(
        () => (activeTemplate.values.date ? activeTemplate.values : { ...activeTemplate.values, date: todayIso() }),
        [activeTemplate.values],
    );

    function updateActive(patch: Partial<StoredTemplate>) {
        setTemplateGeneratorState({
            ...state,
            templates: state.templates.map((t) => (t.id === activeTemplate.id ? { ...t, ...patch } : t)),
        });
    }

    function selectTemplate(id: string) {
        setTemplateGeneratorState({ ...state, activeId: id });
    }

    function newTemplate() {
        const t: StoredTemplate = {
            id: crypto.randomUUID(),
            name: 'Untitled template',
            html: DEFAULT_HTML_TEMPLATE,
            values: {},
            types: {},
        };
        setTemplateGeneratorState({ templates: [...state.templates, t], activeId: t.id });
    }

    function deleteActive() {
        if (state.templates.length <= 1) return;
        if (!window.confirm(`Delete "${activeTemplate.name}"? This can't be undone.`)) return;
        const remaining = state.templates.filter((t) => t.id !== activeTemplate.id);
        setTemplateGeneratorState({ templates: remaining, activeId: remaining[0].id });
    }

    function setValue(key: string, raw: string) {
        updateActive({ values: { ...activeTemplate.values, [key]: raw } });
    }

    function setType(key: string, type: VarType) {
        updateActive({ types: { ...activeTemplate.types, [key]: type } });
    }

    const activeKeys = useMemo(
        () => (sourceMode === 'html' ? extractKeys(activeTemplate.html) : docxKeys),
        [sourceMode, activeTemplate.html, docxKeys],
    );
    const filledCount = activeKeys.filter((k) => !!values[k]).length;

    const renderedHtml = useMemo(
        () => renderTemplate(activeTemplate.html, values, activeTemplate.types),
        [activeTemplate.html, values, activeTemplate.types],
    );
    const deferredHtmlPreview = useDeferredValue(renderedHtml);
    const deferredValues = useDeferredValue(values);

    // DOCX mode: fill + render to HTML off the deferred values, guarded by a
    // per-run cancelled flag so a slow render never clobbers a newer one.
    useEffect(() => {
        if (sourceMode !== 'docx' || !docxFile) return;
        let cancelled = false;
        (async () => {
            try {
                const filled = await fillDocx(docxFile, deferredValues, activeTemplate.types);
                const html = await docxToHtml(filled);
                if (!cancelled) setDocxPreviewHtml(html);
            } catch (err) {
                if (!cancelled) {
                    showStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not render the DOCX preview.' });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [sourceMode, docxFile, deferredValues, activeTemplate.types]);

    async function loadDocxFile(file: File) {
        try {
            const keys = await extractDocxKeys(file);
            setDocxFile(file);
            setDocxKeys(keys);
            setSourceMode('docx');
            showStatus({
                kind: 'info',
                text: keys.length === 0
                    ? `Loaded ${file.name} — no placeholders found`
                    : `Loaded ${file.name} — ${keys.length} placeholder${keys.length === 1 ? '' : 's'}`,
            });
        } catch (err) {
            showStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not read that file.' });
        }
    }

    function removeDocx() {
        setDocxFile(null);
        setDocxKeys([]);
        setDocxPreviewHtml('');
        if (sourceMode === 'docx') setSourceMode('html');
    }

    function onFilePicked(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void loadDocxFile(file);
    }

    function onDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void loadDocxFile(file);
    }

    async function downloadFilledDocx() {
        if (!docxFile) return;
        try {
            const filled = await fillDocx(docxFile, values, activeTemplate.types);
            const url = URL.createObjectURL(filled);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${docxFile.name.replace(/\.docx$/i, '')}-filled.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Deferred: revoking right after click() truncates the download in Safari (same as PDFGear.downloadBlob).
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch (err) {
            showStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not fill that file.' });
        }
    }

    function handleFill(filled: Record<string, string>, count: number) {
        if (count > 0) updateActive({ values: { ...activeTemplate.values, ...filled } });
        showStatus({ kind: 'info', text: `Filled ${count} field${count === 1 ? '' : 's'}` });
    }

    function varFieldId(key: string): string {
        return `${varIdBase}-${key.replace(/\./g, '_')}`;
    }

    return (
        <div className="tg">
            <div className="tg-sidebar">
                <div className="tg-sidebar__header">
                    <span className="tg-sidebar__title">Templates</span>
                </div>

                <div className="tg-sidebar__templates">
                    <select
                        aria-label="Template"
                        className="tg-select"
                        value={activeTemplate.id}
                        onChange={(e) => selectTemplate(e.target.value)}
                    >
                        {state.templates.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                    <div className="tg-sidebar__template-row">
                        <input
                            aria-label="Template name"
                            className="tg-input"
                            value={activeTemplate.name}
                            onChange={(e) => updateActive({ name: e.target.value })}
                        />
                        <button type="button" className="tg-icon-btn" onClick={newTemplate} aria-label="New template" title="New template">
                            <Plus size={14} aria-hidden />
                        </button>
                        <button
                            type="button"
                            className="tg-icon-btn"
                            onClick={deleteActive}
                            disabled={state.templates.length <= 1}
                            aria-label="Delete template"
                            title="Delete template"
                        >
                            <Trash2 size={14} aria-hidden />
                        </button>
                    </div>
                </div>

                <nav className="tg-sidebar__nav" aria-label="Template sections">
                    <button
                        className={`tg-sidebar__tab ${activeTab === 'html' ? 'tg-sidebar__tab--active' : ''}`}
                        aria-current={activeTab === 'html' ? 'page' : undefined}
                        onClick={() => { setActiveTab('html'); setSourceMode('html'); }}
                    >
                        <span className="tg-sidebar__tab-icon"><Globe size={14} aria-hidden /></span>
                        <span>HTML Template</span>
                    </button>
                    <button
                        className={`tg-sidebar__tab ${activeTab === 'variables' ? 'tg-sidebar__tab--active' : ''}`}
                        aria-current={activeTab === 'variables' ? 'page' : undefined}
                        onClick={() => setActiveTab('variables')}
                    >
                        <span className="tg-sidebar__tab-icon"><Pencil size={14} aria-hidden /></span>
                        <span>Variables</span>
                    </button>
                    <button
                        className={`tg-sidebar__tab ${activeTab === 'docx' ? 'tg-sidebar__tab--active' : ''}`}
                        aria-current={activeTab === 'docx' ? 'page' : undefined}
                        onClick={() => { setActiveTab('docx'); if (docxFile) setSourceMode('docx'); }}
                    >
                        <span className="tg-sidebar__tab-icon"><FileText size={14} aria-hidden /></span>
                        <span>DOCX Template</span>
                    </button>
                </nav>

                <div className="tg-sidebar__actions">
                    <div className="tg-sidebar__fill-count">{filledCount} of {activeKeys.length} filled</div>
                    <button
                        className="tg-action-btn tg-action-btn--primary"
                        onClick={() => iframeRef.current?.contentWindow?.print()}
                    >
                        <Printer size={14} aria-hidden /> Print / Save as PDF
                    </button>
                    {sourceMode === 'docx' && docxFile && (
                        <button className="tg-action-btn" onClick={() => void downloadFilledDocx()}>
                            <Download size={14} aria-hidden /> Download filled .docx
                        </button>
                    )}
                </div>
            </div>

            <div className="tg-main">
                {activeTab === 'html' && (
                    <div className="tg-editor">
                        <div className="tg-editor__header">
                            <h3 id={htmlHeadingId}>HTML Template Editor</h3>
                            <span className="tg-editor__hint">
                                Use <code>{'{{variable_name}}'}</code> for dynamic values
                            </span>
                        </div>
                        <textarea
                            className="tg-editor__textarea"
                            aria-labelledby={htmlHeadingId}
                            value={activeTemplate.html}
                            onChange={(e) => updateActive({ html: e.target.value })}
                            spellCheck={false}
                            placeholder="Enter HTML template..."
                        />
                    </div>
                )}

                {activeTab === 'variables' && (
                    <div className="tg-variables">
                        <div className="tg-variables__header">
                            <h3 id={variablesHeadingId}>Variables</h3>
                        </div>
                        <div className="tg-variables__list" aria-labelledby={variablesHeadingId}>
                            {activeKeys.length === 0 ? (
                                <p className="tg-variables__empty">
                                    Type <code>{'{{name}}'}</code> in the template to create a variable.
                                </p>
                            ) : (
                                activeKeys.map((key) => {
                                    const type = activeTemplate.types[key] ?? inferType(key);
                                    const id = varFieldId(key);
                                    return (
                                        <div key={key} className="tg-var-row">
                                            <label htmlFor={id} className="tg-var-row__label">
                                                {labelFor(key)}
                                                <span className="tg-var-row__key">{`{{${key}}}`}</span>
                                            </label>
                                            <select
                                                className="tg-var-row__type-select"
                                                aria-label={`${labelFor(key)} type`}
                                                value={type}
                                                onChange={(e) => setType(key, e.target.value as VarType)}
                                            >
                                                {VAR_TYPES.map((t) => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                            <input
                                                id={id}
                                                className="tg-var-row__input"
                                                type={inputTypeFor(type)}
                                                step={type === 'currency' ? '0.01' : undefined}
                                                value={values[key] ?? ''}
                                                onChange={(e) => setValue(key, e.target.value)}
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <div className="tg-variables__fill">
                            <button
                                type="button"
                                className="tg-action-btn"
                                onClick={() => setShowFill((v) => !v)}
                                aria-expanded={showFill}
                            >
                                {showFill ? 'Hide record fill' : 'Fill from Dwellium records'}
                            </button>
                            {showFill && <FillFromRecord templateKeys={activeKeys} onFill={handleFill} />}
                        </div>
                    </div>
                )}

                {activeTab === 'docx' && (
                    <div className="tg-docx">
                        <div className="tg-docx__header">
                            <h3>DOCX Template</h3>
                            <span className="tg-editor__hint">
                                Upload a .docx file with <code>{'{{placeholders}}'}</code>
                            </span>
                        </div>
                        {docxFile ? (
                            <div className="tg-docx__file">
                                <FileText size={20} aria-hidden />
                                <div className="tg-docx__file-info">
                                    <p className="tg-docx__file-name">{docxFile.name}</p>
                                    <p className="tg-docx__file-meta">
                                        {docxKeys.length === 0
                                            ? 'No placeholders found'
                                            : `${docxKeys.length} placeholder${docxKeys.length === 1 ? '' : 's'}`}
                                    </p>
                                </div>
                                <button type="button" className="tg-icon-btn" onClick={removeDocx} aria-label="Remove file" title="Remove file">
                                    <Trash2 size={14} aria-hidden />
                                </button>
                            </div>
                        ) : (
                            <div
                                className={`tg-docx__upload-zone${dragOver ? ' tg-docx__upload-zone--active' : ''}`}
                                data-dwellium-drop-zone="template-generator"
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={onDrop}
                            >
                                <span className="tg-docx__upload-icon"><FileUp size={48} aria-hidden /></span>
                                <p className="tg-docx__upload-text">Drag &amp; drop a .docx template here</p>
                                <p className="tg-docx__upload-hint">or choose a file from your computer</p>
                                <button
                                    type="button"
                                    className="tg-action-btn tg-action-btn--primary tg-docx__upload-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Browse Files
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".docx"
                                    hidden
                                    onChange={onFilePicked}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="tg-preview">
                <div className="tg-preview__header">
                    <h3>Preview</h3>
                    <span className="tg-preview__badge">Live preview</span>
                </div>
                <div className="tg-preview__content">
                    <iframe
                        ref={iframeRef}
                        className="tg-preview__iframe"
                        srcDoc={withPreviewCsp(sourceMode === 'html' ? deferredHtmlPreview : docxPreviewHtml)}
                        title={sourceMode === 'html' ? 'HTML template preview' : 'DOCX template preview'}
                        sandbox="allow-same-origin allow-modals"
                    />
                </div>
            </div>

            <div className="tg-status" role="status" aria-live="polite">
                {status && (
                    <span className={`tg-status__msg tg-status__msg--${status.kind}`}>
                        {status.text}
                        {status.kind === 'error' && (
                            <button type="button" className="tg-status__dismiss" onClick={() => setStatus(null)} aria-label="Dismiss">
                                <X size={12} aria-hidden />
                            </button>
                        )}
                    </span>
                )}
            </div>
        </div>
    );
}
