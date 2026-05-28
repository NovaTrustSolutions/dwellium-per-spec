/**
 * Right-click context menu for the Scribe editor.
 *
 * Matches Holocron/Agenteryx menu exactly:
 *   Cut / Copy           (selection only)
 *   Paste / Paste+ / Paste++   (always)
 *   ──
 *   Clear Formatting     (selection only)
 *   Markdown ▶           (submenu on hover)
 *
 * The Markdown submenu opens on hover of its trigger row and closes on a
 * 150ms timer after the cursor leaves both nodes. Sibling popover so its
 * positioning is independent of the parent menu (handles right/bottom flip).
 *
 * Inline markdown actions:
 *   Bold (⌘B), Italic (⌘I), Strikethrough — wrap selection with marker
 *   Heading 1/2/3 — prefix each selected line with #, ##, ###
 *   Bullet List / Numbered List / Blockquote — prefix each line
 *   Code Block (`) — wrap selection in triple-backtick fences
 */
import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { smartPaste, rawPaste } from './markdownConfig';

interface MenuState {
    x: number;
    y: number;
    hasSelection: boolean;
}

interface Props {
    getView: () => EditorView | null;
}

const SUBMENU_CLOSE_DELAY = 150;

export function ContextMenu({ getView }: Props) {
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [submenuOpen, setSubmenuOpen] = useState(false);
    const submenuTriggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const view = getView();
        if (!view) return;

        const handler = (e: MouseEvent) => {
            e.preventDefault();
            const sel = view.state.selection.main;
            setMenu({
                x: e.clientX,
                y: e.clientY,
                hasSelection: sel.from !== sel.to,
            });
            setSubmenuOpen(false);
        };

        view.contentDOM.addEventListener('contextmenu', handler);
        return () => view.contentDOM.removeEventListener('contextmenu', handler);
    }, [getView]);

    useEffect(() => {
        if (!menu) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (menuRef.current && menuRef.current.contains(target)) return;
            // Check if click is in submenu (rendered as separate popover)
            const submenu = document.querySelector('[data-scribe-submenu]');
            if (submenu && submenu.contains(target)) return;
            setMenu(null);
            setSubmenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setMenu(null);
                setSubmenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [menu]);

    const close = () => {
        setMenu(null);
        setSubmenuOpen(false);
    };

    const openSubmenu = () => {
        if (submenuTimerRef.current) {
            clearTimeout(submenuTimerRef.current);
            submenuTimerRef.current = null;
        }
        setSubmenuOpen(true);
    };

    const scheduleSubmenuClose = () => {
        if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
        submenuTimerRef.current = setTimeout(() => setSubmenuOpen(false), SUBMENU_CLOSE_DELAY);
    };

    // ── Cut / Copy / Paste handlers ────────────────────────────────────────
    const handleCut = () => {
        const view = getView();
        if (!view) return;
        const { from, to } = view.state.selection.main;
        if (from === to) return;
        const text = view.state.doc.sliceString(from, to);
        void navigator.clipboard.writeText(text);
        view.dispatch({ changes: { from, to, insert: '' } });
        close();
    };

    const handleCopy = () => {
        const view = getView();
        if (!view) return;
        const { from, to } = view.state.selection.main;
        if (from === to) return;
        const text = view.state.doc.sliceString(from, to);
        void navigator.clipboard.writeText(text);
        close();
    };

    const handlePasteVerbatim = () => {
        const view = getView();
        if (!view) return;
        close();
        void navigator.clipboard.readText().then((text) => {
            if (!text) return;
            view.dispatch(view.state.replaceSelection(text));
            view.focus();
        }).catch(() => {});
    };

    const handlePasteSmart = () => {
        const view = getView();
        if (!view) return;
        close();
        smartPaste(view);
        view.focus();
    };

    const handlePasteRaw = () => {
        const view = getView();
        if (!view) return;
        close();
        rawPaste(view);
        view.focus();
    };

    // ── Markdown formatting helpers ────────────────────────────────────────
    const wrapInline = (marker: string) => {
        const view = getView();
        if (!view) return;
        close();
        const { from, to } = view.state.selection.main;
        if (from === to) {
            view.dispatch({
                changes: { from, insert: marker + marker },
                selection: { anchor: from + marker.length },
            });
        } else {
            const text = view.state.doc.sliceString(from, to);
            view.dispatch({
                changes: { from, to, insert: marker + text + marker },
                selection: { anchor: from, head: from + text.length + marker.length * 2 },
            });
        }
        view.focus();
    };

    const prefixLines = (prefix: string | ((idx: number) => string)) => {
        const view = getView();
        if (!view) return;
        close();
        const { from, to } = view.state.selection.main;
        const startLineNum = view.state.doc.lineAt(from).number;
        const endLineNum = view.state.doc.lineAt(to).number;
        const changeSpec: Array<{ from: number; insert: string }> = [];
        let counter = 0;
        for (let n = startLineNum; n <= endLineNum; n++) {
            const line = view.state.doc.line(n);
            const insert = typeof prefix === 'function' ? prefix(counter) : prefix;
            changeSpec.push({ from: line.from, insert });
            counter++;
        }
        const changes = view.state.changes(changeSpec);
        view.dispatch({ changes, selection: view.state.selection.map(changes, 1) });
        view.focus();
    };

    const handleCodeBlock = () => {
        const view = getView();
        if (!view) return;
        close();
        const { from, to } = view.state.selection.main;
        if (from === to) {
            view.dispatch({
                changes: { from, insert: '```\n\n```' },
                selection: { anchor: from + 4 },
            });
        } else {
            const text = view.state.doc.sliceString(from, to);
            const fenced = '```\n' + text + '\n```';
            view.dispatch({
                changes: { from, to, insert: fenced },
                selection: { anchor: from, head: from + fenced.length },
            });
        }
        view.focus();
    };

    const clearMarkdownFormatting = () => {
        const view = getView();
        if (!view) return;
        close();
        const { from, to } = view.state.selection.main;
        if (from === to) return;
        let text = view.state.doc.sliceString(from, to);
        text = text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            .replace(/~~([^~]+)~~/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/^\s*>\s?/gm, '');
        view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from, head: from + text.length },
        });
        view.focus();
    };

    const handleBold = () => wrapInline('**');
    const handleItalic = () => wrapInline('*');
    const handleStrikethrough = () => wrapInline('~~');
    const handleH1 = () => prefixLines('# ');
    const handleH2 = () => prefixLines('## ');
    const handleH3 = () => prefixLines('### ');
    const handleBulletList = () => prefixLines('- ');
    const handleNumberedList = () => prefixLines((i) => `${i + 1}. `);
    const handleBlockquote = () => prefixLines('> ');

    if (!menu) return null;

    // Clamp main menu within viewport
    const MARGIN = 8;
    const MENU_W = 220;
    // Items: 2 (cut/copy if sel) + 3 (paste×3) + divider + 1 (clear if sel) + 1 (markdown) ≈ 280 max
    const MENU_H = (menu.hasSelection ? 2 : 0) * 32 + 3 * 32 + 8 + (menu.hasSelection ? 32 : 0) + 32 + 24;
    const x = menu.x + MENU_W > window.innerWidth - MARGIN ? Math.max(MARGIN, menu.x - MENU_W) : menu.x;
    const y = menu.y + MENU_H > window.innerHeight - MARGIN ? Math.max(MARGIN, menu.y - MENU_H) : menu.y;

    return (
        <>
            <div
                ref={menuRef}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    position: 'fixed', top: y, left: x, zIndex: 1000,
                    background: '#1a1a1a', border: '1px solid #2a2a2a',
                    borderRadius: 8, padding: 4,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
                    minWidth: MENU_W, fontSize: 13,
                }}
            >
                {menu.hasSelection && (
                    <>
                        <CtxMenuItem label="Cut" shortcut="⌘X" onClick={handleCut} />
                        <CtxMenuItem label="Copy" shortcut="⌘C" onClick={handleCopy} />
                    </>
                )}
                <CtxMenuItem label="Paste" shortcut="⌘V" onClick={handlePasteVerbatim} />
                <CtxMenuItem label="Paste+" shortcut="⌘⇧V" onClick={handlePasteSmart} />
                <CtxMenuItem label="Paste++" shortcut="⌘⇧⌥V" onClick={handlePasteRaw} />
                <CtxMenuDivider />
                {menu.hasSelection && (
                    <CtxMenuItem label="Clear Formatting" onClick={clearMarkdownFormatting} />
                )}
                <div
                    ref={submenuTriggerRef}
                    onMouseEnter={openSubmenu}
                    onMouseLeave={scheduleSubmenuClose}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 24, padding: '8px 16px',
                        fontSize: 13, color: '#e5e5e5',
                        borderRadius: 4, cursor: 'default',
                        background: submenuOpen ? '#2a2a2a' : 'transparent',
                        userSelect: 'none',
                    }}
                >
                    <span>Markdown</span>
                    <span style={{ fontSize: 11, color: '#666' }}>▶</span>
                </div>
            </div>

            {submenuOpen && submenuTriggerRef.current && (
                <MarkdownSubmenu
                    triggerRect={submenuTriggerRef.current.getBoundingClientRect()}
                    onMouseEnter={openSubmenu}
                    onMouseLeave={scheduleSubmenuClose}
                    onBold={handleBold}
                    onItalic={handleItalic}
                    onStrikethrough={handleStrikethrough}
                    onH1={handleH1}
                    onH2={handleH2}
                    onH3={handleH3}
                    onBulletList={handleBulletList}
                    onNumberedList={handleNumberedList}
                    onBlockquote={handleBlockquote}
                    onCodeBlock={handleCodeBlock}
                />
            )}
        </>
    );
}

function CtxMenuItem({ label, shortcut, onClick }: {
    label: string;
    shortcut?: string;
    onClick: () => void;
}) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 24, padding: '8px 16px',
                fontSize: 13, color: '#e5e5e5',
                borderRadius: 4, cursor: 'pointer',
                background: hovered ? '#2a2a2a' : 'transparent',
                userSelect: 'none',
            }}
        >
            <span>{label}</span>
            {shortcut && (
                <span style={{ fontSize: 11, color: '#666', fontFamily: 'inherit', letterSpacing: 0.3 }}>
                    {shortcut}
                </span>
            )}
        </div>
    );
}

function CtxMenuDivider() {
    return <div style={{ height: 1, margin: '4px 8px', background: '#2a2a2a' }} />;
}

interface MarkdownSubmenuProps {
    triggerRect: DOMRect;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onBold: () => void;
    onItalic: () => void;
    onStrikethrough: () => void;
    onH1: () => void;
    onH2: () => void;
    onH3: () => void;
    onBulletList: () => void;
    onNumberedList: () => void;
    onBlockquote: () => void;
    onCodeBlock: () => void;
}

function MarkdownSubmenu(props: MarkdownSubmenuProps) {
    const { triggerRect, onMouseEnter, onMouseLeave } = props;
    const SUBMENU_W = 240;
    const SUBMENU_H = 340;
    const MARGIN = 8;

    let left: number;
    if (triggerRect.right + SUBMENU_W > window.innerWidth - MARGIN) {
        left = triggerRect.left - SUBMENU_W;
        if (left < MARGIN) left = Math.max(MARGIN, window.innerWidth - SUBMENU_W - MARGIN);
    } else {
        left = triggerRect.right;
    }

    let top = triggerRect.top;
    if (top + SUBMENU_H > window.innerHeight - MARGIN) {
        top = Math.max(MARGIN, window.innerHeight - SUBMENU_H - MARGIN);
    }

    return (
        <div
            data-scribe-submenu
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                position: 'fixed', top, left, zIndex: 1001,
                background: '#1a1a1a', border: '1px solid #2a2a2a',
                borderRadius: 8, padding: 4,
                boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
                minWidth: SUBMENU_W,
            }}
        >
            <CtxMenuItem label="Bold" shortcut="⌘B" onClick={props.onBold} />
            <CtxMenuItem label="Italic" shortcut="⌘I" onClick={props.onItalic} />
            <CtxMenuItem label="Strikethrough" onClick={props.onStrikethrough} />
            <CtxMenuDivider />
            <CtxMenuItem label="Heading 1" shortcut="#" onClick={props.onH1} />
            <CtxMenuItem label="Heading 2" shortcut="##" onClick={props.onH2} />
            <CtxMenuItem label="Heading 3" shortcut="###" onClick={props.onH3} />
            <CtxMenuDivider />
            <CtxMenuItem label="Bullet List" onClick={props.onBulletList} />
            <CtxMenuItem label="Numbered List" onClick={props.onNumberedList} />
            <CtxMenuItem label="Blockquote" onClick={props.onBlockquote} />
            <CtxMenuItem label="Code Block" shortcut="`" onClick={props.onCodeBlock} />
        </div>
    );
}
