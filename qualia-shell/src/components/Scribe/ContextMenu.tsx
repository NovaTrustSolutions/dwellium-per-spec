/**
 * Right-click context menu for the Scribe editor.
 * Positioned at click coordinates, closes on outside click / Escape.
 */
import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { useScribeStore, type Redline } from './scribeStore';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { REDLINE_SYSTEM_PROMPT, parseRedlineResponse } from './redlinePrompt';

interface MenuState {
    x: number;
    y: number;
    hasSelection: boolean;
    selFrom: number;
    selTo: number;
    selText: string;
}

interface Props {
    getView: () => EditorView | null;
}

export function ContextMenu({ getView }: Props) {
    const [menu, setMenu] = useState<MenuState | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const { integrations } = useIntegrations();
    const activeFilepath = useScribeStore((s) => s.activeFilepath);

    useEffect(() => {
        const view = getView();
        if (!view) return;

        const handler = (e: MouseEvent) => {
            e.preventDefault();
            const sel = view.state.selection.main;
            const hasSelection = sel.from !== sel.to;
            setMenu({
                x: e.clientX,
                y: e.clientY,
                hasSelection,
                selFrom: sel.from,
                selTo: sel.to,
                selText: hasSelection ? view.state.doc.sliceString(sel.from, sel.to) : '',
            });
        };

        view.contentDOM.addEventListener('contextmenu', handler);
        return () => view.contentDOM.removeEventListener('contextmenu', handler);
    }, [getView]);

    useEffect(() => {
        if (!menu) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && ref.current.contains(e.target as Node)) return;
            setMenu(null);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [menu]);

    if (!menu) return null;

    const llmReady = hasActiveLlm(integrations.llm);

    const close = () => setMenu(null);

    const handleCut = () => {
        if (!menu.hasSelection) return;
        void navigator.clipboard.writeText(menu.selText);
        const view = getView();
        if (view) view.dispatch({ changes: { from: menu.selFrom, to: menu.selTo, insert: '' } });
        close();
    };

    const handleCopy = () => {
        if (!menu.hasSelection) return;
        void navigator.clipboard.writeText(menu.selText);
        close();
    };

    const handlePaste = () => {
        const view = getView();
        if (!view) return;
        close();
        void navigator.clipboard.readText().then((text) => {
            if (text) view.dispatch(view.state.replaceSelection(text));
        }).catch(() => {});
    };

    const handleRedline = () => {
        if (!menu.hasSelection || !activeFilepath || !llmReady) return;
        close();
        useScribeStore.getState().setRedlineLoading(true);
        void (async () => {
            try {
                const res = await callLlm({
                    prompt: menu.selText,
                    systemPrompt: REDLINE_SYSTEM_PROMPT,
                    responseFormat: 'json',
                    maxTokens: 2048,
                    temperature: 0.3,
                }, integrations.llm);
                if (!res) return;
                const parsed = parseRedlineResponse(res.text);
                if (!parsed) return;
                for (const p of parsed.redlines) {
                    const idx = menu.selText.indexOf(p.originalText);
                    if (idx === -1) continue;
                    const redline: Redline = {
                        id: crypto.randomUUID(),
                        filepath: activeFilepath,
                        from: menu.selFrom + idx,
                        to: menu.selFrom + idx + p.originalText.length,
                        originalText: p.originalText,
                        proposedText: p.proposedText,
                        rationale: p.rationale,
                        state: 'pending',
                    };
                    useScribeStore.getState().addRedline(redline);
                }
            } catch {} finally { useScribeStore.getState().setRedlineLoading(false); }
        })();
    };

    const handleComment = () => {
        if (!menu.hasSelection || !activeFilepath) return;
        useScribeStore.getState().addComment(activeFilepath, menu.selFrom, menu.selTo);
        close();
    };

    const handleToggleMinimap = () => {
        const s = useScribeStore.getState();
        s.setMinimapVisible(!s.minimapVisible);
        close();
    };

    const handleToggleToc = () => {
        const s = useScribeStore.getState();
        s.setTocVisible(!s.tocVisible);
        close();
    };

    const MARGIN = 8;
    const MENU_W = 200;
    const MENU_H = menu.hasSelection ? 300 : 180;
    const x = menu.x + MENU_W > window.innerWidth - MARGIN ? Math.max(MARGIN, menu.x - MENU_W) : menu.x;
    const y = menu.y + MENU_H > window.innerHeight - MARGIN ? Math.max(MARGIN, menu.y - MENU_H) : menu.y;

    return (
        <div
            ref={ref}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                position: 'fixed', top: y, left: x, zIndex: 60,
                background: '#111', border: '1px solid #333',
                borderRadius: 8, padding: 4,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                minWidth: MENU_W, fontSize: 13,
            }}
        >
            {menu.hasSelection && (
                <>
                    <MenuItem label="Cut" shortcut="⌘X" onClick={handleCut} />
                    <MenuItem label="Copy" shortcut="⌘C" onClick={handleCopy} />
                </>
            )}
            <MenuItem label="Paste" shortcut="⌘V" onClick={handlePaste} />
            <Divider />
            {menu.hasSelection && (
                <>
                    <MenuItem label="✦ Redline" shortcut="⌘L" onClick={handleRedline} disabled={!llmReady} />
                    <MenuItem label="💬 Comment" shortcut="⌘⇧C" onClick={handleComment} />
                    <Divider />
                </>
            )}
            <MenuItem label="🗺 Toggle Minimap" shortcut="⌘⇧K" onClick={handleToggleMinimap} />
            <MenuItem label="☰ Toggle Contents" shortcut="⌘⇧T" onClick={handleToggleToc} />
        </div>
    );
}

function MenuItem({ label, shortcut, onClick, disabled }: {
    label: string; shortcut?: string; onClick: () => void; disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '7px 12px', gap: 16,
                background: 'transparent', border: 'none',
                color: disabled ? '#555' : '#ccc',
                fontSize: 13, fontFamily: 'inherit', borderRadius: 4,
                cursor: disabled ? 'default' : 'pointer',
                textAlign: 'left',
                transition: 'background 80ms, color 80ms',
            }}
            onMouseEnter={(e) => {
                if (!disabled) { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#D6FE51'; }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = disabled ? '#555' : '#ccc';
            }}
        >
            <span>{label}</span>
            {shortcut && <span style={{ fontSize: 11, color: '#555', fontFamily: 'inherit' }}>{shortcut}</span>}
        </button>
    );
}

function Divider() {
    return <div style={{ height: 1, margin: '4px 8px', background: '#222' }} />;
}
