/**
 * FileDialogs — promise-based in-widget confirm / prompt / notify (replaces window.alert/confirm/prompt).
 * `host` renders an absolute overlay, so the widget root must be `position: relative`.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

export interface ConfirmOptions { title: string; message: string; confirmLabel: string; danger?: boolean; requireText?: string }
export interface PromptOptions { title: string; message?: string; defaultValue: string; confirmLabel: string }
export type NotifyTone = 'info' | 'error';

type Req =
    | { id: number; kind: 'confirm'; opts: ConfirmOptions; opener: Element | null; resolve: (v: boolean) => void }
    | { id: number; kind: 'prompt'; opts: PromptOptions; opener: Element | null; resolve: (v: string | null) => void };
interface Toast { id: number; message: string; tone: NotifyTone }

const DANGER_TEXT = 'color-mix(in srgb, var(--danger) 60%, var(--text-primary))';
const MUTED_TEXT = 'color-mix(in srgb, var(--text-tertiary) 60%, var(--text-primary))';
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled)';
const TOAST_MS = 4000;

const btn = (primary: boolean, danger: boolean, disabled: boolean): CSSProperties => ({
    minHeight: 32, padding: '0 14px', borderRadius: 'var(--radius-md)', fontFamily: 'inherit', fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: primary ? 'none' : '1px solid var(--border-default)',
    background: primary ? (danger ? 'var(--danger)' : 'var(--accent)') : 'transparent',
    color: primary ? (danger ? 'var(--text-primary)' : 'var(--accent-text)') : 'var(--text-primary)',
});

function Dialog({ req, onDone }: { req: Req; onDone: (v: boolean | string | null) => void }) {
    const isPrompt = req.kind === 'prompt';
    const { opts } = req;
    const danger = req.kind === 'confirm' && !!req.opts.danger;
    const need = req.kind === 'confirm' ? req.opts.requireText : undefined;
    const [text, setText] = useState(isPrompt ? req.opts.defaultValue : '');
    const root = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const ok = need === undefined || text.trim() === need.trim();
    const titleId = useId(); const descId = useId();
    const accept = () => { if (ok) onDone(isPrompt ? text.trim() : true); };
    const cancel = () => onDone(isPrompt ? null : false);

    useEffect(() => {
        if (input.current) { input.current.focus(); input.current.select?.(); }
        else root.current?.querySelector<HTMLElement>('[data-primary]')?.focus();
    }, []);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); accept(); return; }
        if (e.key !== 'Tab') return;
        // sorted: some DOM impls (jsdom/nwsapi) return selector-list matches grouped by selector, not in document order
        const items = Array.from(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
            .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
        if (!items.length) return;
        const first = items[0]; const last = items[items.length - 1]; const at = document.activeElement;
        if (e.shiftKey && (at === first || !root.current?.contains(at))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (at === last || !root.current?.contains(at))) { e.preventDefault(); first.focus(); }
    };

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--bg-desktop) 70%, transparent)' }}>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- key handler implements the modal focus trap */}
            <div ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
                data-danger={danger ? 'true' : 'false'} onKeyDown={onKeyDown}
                style={{ width: 'min(360px, 90%)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', color: 'var(--text-primary)', fontSize: 12 }}>
                <div id={titleId} style={{ fontSize: 14, fontWeight: 600, color: danger ? DANGER_TEXT : 'var(--text-primary)' }}>{opts.title}</div>
                <div id={descId} style={{ color: MUTED_TEXT, lineHeight: 1.4 }}>{opts.message}</div>
                {need !== undefined && <div style={{ color: DANGER_TEXT }}>Type <strong>{need}</strong> to confirm</div>}
                {(isPrompt || need !== undefined) && (
                    <input ref={input} value={text} onChange={(e) => setText(e.target.value)}
                        aria-label={need !== undefined ? `Type ${need} to confirm` : opts.title}
                        style={{ minHeight: 32, padding: '0 8px', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12 }} />
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={cancel} style={btn(false, false, false)}>Cancel</button>
                    <button type="button" data-primary="" disabled={!ok} onClick={accept} style={btn(true, danger, !ok)}>{opts.confirmLabel}</button>
                </div>
            </div>
        </div>
    );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
    useEffect(() => { const t = setTimeout(() => onDismiss(toast.id), TOAST_MS); return () => clearTimeout(t); }, [toast.id, onDismiss]);
    const err = toast.tone === 'error';
    return (
        <div role={err ? 'alert' : 'status'} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', minHeight: 32, boxSizing: 'border-box', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 12, color: err ? DANGER_TEXT : 'var(--text-primary)' }}>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)} style={{ minHeight: 32, minWidth: 32, background: 'transparent', border: 'none', color: MUTED_TEXT, cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
    );
}

export function useFileDialogs() {
    const [current, setCurrent] = useState<Req | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const cur = useRef<Req | null>(null);
    const queue = useRef<Req[]>([]);
    const alive = useRef(true);
    const seq = useRef(0);

    const show = (r: Req | null) => { cur.current = r; if (alive.current) setCurrent(r); };
    const cancelValue = (r: Req) => (r.kind === 'confirm' ? false : null);

    useEffect(() => {
        alive.current = true;
        return () => { // ponytail: unmount = cancel everything pending
            alive.current = false;
            [cur.current, ...queue.current].forEach((r) => (r as { resolve: (v: unknown) => void } | null)?.resolve(r ? cancelValue(r) : null));
            cur.current = null; queue.current = [];
        };
    }, []);

    const enqueue = useCallback((r: Req) => { if (cur.current) queue.current.push(r); else show(r); }, []);

    const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => enqueue({ id: ++seq.current, kind: 'confirm', opts, opener: document.activeElement, resolve })), [enqueue]);
    const prompt = useCallback((opts: PromptOptions) => new Promise<string | null>((resolve) => enqueue({ id: ++seq.current, kind: 'prompt', opts, opener: document.activeElement, resolve })), [enqueue]);

    const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
    const notify = useCallback((message: string, tone: NotifyTone = 'info') => {
        setToasts((t) => [...t, { id: ++seq.current, message, tone }].slice(-3));
    }, []);

    const done = (v: boolean | string | null) => {
        const r = cur.current; if (!r) return;
        (r.resolve as (x: unknown) => void)(v);
        const next = queue.current.shift() ?? null;
        show(next);
        const op = r.opener as HTMLElement | null;
        if (!next && op?.isConnected) op.focus();
    };

    const host: ReactNode = (
        <>
            {current && <Dialog key={current.id} req={current} onDone={done} />}
            {toasts.length > 0 && (
                <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
                    {toasts.map((t) => <div key={t.id} style={{ pointerEvents: 'auto' }}><ToastItem toast={t} onDismiss={dismiss} /></div>)}
                </div>
            )}
        </>
    );

    return { confirm, prompt, notify, host };
}
