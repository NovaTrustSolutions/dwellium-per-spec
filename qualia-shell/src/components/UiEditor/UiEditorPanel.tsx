/**
 * UiEditorPanel — 2026-06-12 (Ilya): the natural-language UI editor.
 * Type "change the header color to yellow" or click "Pick element" and say
 * "make it bigger" — edits apply instantly, persist per-user (One Save), and
 * are individually toggleable/deletable here.
 *
 * Pipeline per instruction: heuristic parseUiEdit (zero latency) → LLM
 * fallback (constrained JSON, sanitized) → honest "couldn't parse" message.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, RotateCcw, Trash2, Undo2, Wand2 } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { useUiEdits } from '../../lib/uiEditStore';
import { parseUiEdit, parseUiEditWithLlm, pickedElementHolder, NAMED_TARGETS } from '../../lib/uiEditParser';
import { hasActiveLlm } from '../../lib/llmClient';
import './UiEditorPanel.css';

/** Build a short, stable selector + label for a clicked element. */
export function describeElement(el: Element): { selector: string; label: string } {
    if (el.id) return { selector: `#${CSS.escape(el.id)}`, label: `#${el.id}` };
    const classes = Array.from(el.classList).filter(c => !c.startsWith('hover') && c.length < 40).slice(0, 2);
    if (classes.length > 0) {
        const selector = `.${classes.map(c => CSS.escape(c)).join('.')}`;
        return { selector, label: `${el.tagName.toLowerCase()}${selector}` };
    }
    // Last resort: tag within its closest classed ancestor.
    const parent = el.closest('[class]');
    if (parent && parent !== el && parent.classList.length > 0) {
        const pc = CSS.escape(parent.classList[0]);
        return { selector: `.${pc} ${el.tagName.toLowerCase()}`, label: `${el.tagName.toLowerCase()} in .${parent.classList[0]}` };
    }
    return { selector: el.tagName.toLowerCase(), label: el.tagName.toLowerCase() };
}

export function UiEditorPanel() {
    const { edits, addUiEdit, toggleUiEdit, removeUiEdit, undoLastUiEdit, clearUiEdits } = useUiEdits();
    const { integrations } = useIntegrations();
    const [input, setInput] = useState('');
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [picking, setPicking] = useState(false);
    const [picked, setPicked] = useState<{ selector: string; label: string } | null>(pickedElementHolder.current);
    const rootRef = useRef<HTMLDivElement>(null);

    // ── Click-to-pick: outline on hover, click selects, Esc cancels.
    useEffect(() => {
        if (!picking) return;
        let lastEl: HTMLElement | null = null;
        let lastOutline = '';
        const clearHover = () => {
            if (lastEl) { lastEl.style.outline = lastOutline; lastEl = null; }
        };
        const inPanel = (t: EventTarget | null) =>
            t instanceof Node && rootRef.current ? rootRef.current.closest('.window')?.contains(t) ?? false : false;
        const onMove = (e: MouseEvent) => {
            const el = e.target as HTMLElement;
            if (!el || el === lastEl || inPanel(el)) return;
            clearHover();
            lastEl = el;
            lastOutline = el.style.outline;
            el.style.outline = '2px solid var(--accent, #D6FE51)';
        };
        const onClick = (e: MouseEvent) => {
            if (inPanel(e.target)) return; // panel clicks don't end pick mode
            e.preventDefault();
            e.stopPropagation();
            clearHover();
            const desc = describeElement(e.target as Element);
            pickedElementHolder.current = desc;
            setPicked(desc);
            setPicking(false);
            setStatus(`Picked ${desc.label} — now tell me what to change.`);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { clearHover(); setPicking(false); }
        };
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            clearHover();
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [picking]);

    const apply = useCallback(async () => {
        const text = input.trim();
        if (!text || busy) return;
        setStatus(null);
        // Pass 1 — heuristics.
        let op = parseUiEdit(text);
        // Pass 2 — LLM fallback.
        if (!op && hasActiveLlm(integrations.llm)) {
            setBusy(true);
            try { op = await parseUiEditWithLlm(text, integrations.llm); }
            finally { setBusy(false); }
        }
        if (!op) {
            setStatus(pickedElementHolder.current || /header|sidebar|desktop|dock|window|container/i.test(text)
                ? "Couldn't turn that into a style change — try \"…color to yellow\", \"move … to the right\", \"hide …\", \"bigger text in …\"."
                : 'Tell me WHAT to change (header / sidebar / desktop / dock / windows / content) or use Pick element first.');
            return;
        }
        const added = addUiEdit({ selector: op.selector, label: op.label, css: op.css, instruction: text });
        setStatus(added ? `${op.summary}` : 'That change was blocked by the safety filter.');
        if (added) setInput('');
    }, [input, busy, integrations.llm, addUiEdit]);

    return (
        <div className="ui-editor" ref={rootRef}>
            <header className="ui-editor__intro">
                <Wand2 size={16} aria-hidden />
                <p>
                    Describe a change in plain words — <em>"change the header color to yellow"</em>,{' '}
                    <em>"move the content to the right"</em>, <em>"hide the dock"</em>. Edits persist and are reversible below.
                </p>
            </header>

            <div className="ui-editor__composer">
                <input
                    className="ui-editor__input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void apply(); }}
                    placeholder={picked ? `Editing ${picked.label} — e.g. "make it yellow"` : 'e.g. change the header color to yellow'}
                    aria-label="Describe a UI change"
                    disabled={busy}
                />
                <button className="ui-editor__btn" onClick={() => void apply()} disabled={busy || !input.trim()}>
                    {busy ? 'Thinking…' : 'Apply'}
                </button>
                <button
                    className={`ui-editor__btn ui-editor__btn--pick${picking ? ' is-active' : ''}`}
                    onClick={() => setPicking(p => !p)}
                    aria-pressed={picking}
                    title="Click any element on screen to target it"
                >
                    <Crosshair size={14} aria-hidden /> {picking ? 'Click an element… (Esc cancels)' : 'Pick element'}
                </button>
            </div>

            {picked && (
                <div className="ui-editor__picked">
                    Target: <code>{picked.label}</code>
                    <button onClick={() => { pickedElementHolder.current = null; setPicked(null); }} aria-label="Clear picked element">×</button>
                </div>
            )}

            {status && <div className="ui-editor__status" role="status">{status}</div>}

            <div className="ui-editor__targets">
                Named targets: {NAMED_TARGETS.map(t => t.aliases[0]).join(' · ')}
            </div>

            <section className="ui-editor__list" aria-label="Applied edits">
                <header className="ui-editor__list-head">
                    <h3>Applied edits ({edits.length})</h3>
                    <div>
                        <button className="ui-editor__btn" onClick={() => undoLastUiEdit()} disabled={edits.length === 0} title="Undo last edit">
                            <Undo2 size={13} aria-hidden /> Undo
                        </button>
                        <button className="ui-editor__btn ui-editor__btn--danger" onClick={() => clearUiEdits()} disabled={edits.length === 0} title="Remove all edits">
                            <RotateCcw size={13} aria-hidden /> Reset all
                        </button>
                    </div>
                </header>
                {edits.length === 0 && <p className="ui-editor__empty">No edits yet — your UI is stock.</p>}
                <ul>
                    {edits.map(e => (
                        <li key={e.id} className={`ui-editor__edit${e.enabled ? '' : ' is-off'}`}>
                            <label className="ui-editor__edit-toggle">
                                <input type="checkbox" checked={e.enabled} onChange={() => toggleUiEdit(e.id)} aria-label={`Toggle edit: ${e.instruction || e.label}`} />
                                <span className="ui-editor__edit-text">
                                    <strong>{e.instruction || e.label}</strong>
                                    <small>{e.label} · {Object.entries(e.css).map(([p, v]) => `${p}: ${v}`).join('; ')}</small>
                                </span>
                            </label>
                            <button className="ui-editor__edit-del" onClick={() => removeUiEdit(e.id)} aria-label={`Delete edit: ${e.instruction || e.label}`}>
                                <Trash2 size={13} aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}

export default UiEditorPanel;
