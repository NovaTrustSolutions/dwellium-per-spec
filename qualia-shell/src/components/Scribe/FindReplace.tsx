/**
 * FindReplace — Scribe document Find & Replace panel (spec §5.11).
 *
 * The editor already ships the battle-tested `@codemirror/search` engine (via
 * `basicSetup`'s searchKeymap + the `search()` state we add in Scribe.tsx).
 * The §5.11 gap was a *discoverable, on-brand* UI — the native CM panel is
 * unstyled and light against the fey dark theme. This is a fey-styled React
 * panel that drives the same engine commands (`setSearchQuery`, `findNext`,
 * `findPrevious`, `replaceNext`, `replaceAll`) so behavior matches CodeMirror
 * exactly, including case-sensitivity, whole-word, and regex.
 *
 * Visibility is store-driven (`findReplaceOpen`) so ⌘F (wired in Scribe.tsx)
 * and the toolbar button both open it.
 */

import { useState, useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import {
    SearchQuery,
    setSearchQuery,
    getSearchQuery,
    findNext,
    findPrevious,
    replaceNext,
    replaceAll,
} from '@codemirror/search';
import { useScribeStore } from './scribeStore';

const ACCENT = '#D6FE51';

interface Count { total: number; current: number; invalid: boolean }

function computeCount(view: EditorView, q: SearchQuery): Count {
    if (!q.search) return { total: 0, current: 0, invalid: false };
    if (!q.valid) return { total: 0, current: 0, invalid: true };
    let total = 0, current = 0;
    try {
        const sel = view.state.selection.main;
        const it = q.getCursor(view.state) as Iterator<{ from: number; to: number }>;
        let r = it.next();
        while (!r.done) {
            total++;
            if (r.value.from === sel.from && r.value.to === sel.to) current = total;
            r = it.next();
        }
    } catch {
        return { total: 0, current: 0, invalid: true };
    }
    return { total, current, invalid: false };
}

export function FindReplace({ getView }: { getView: () => EditorView | null }) {
    const open = useScribeStore((s) => s.findReplaceOpen);
    const setOpen = useScribeStore((s) => s.setFindReplaceOpen);
    const activeFilepath = useScribeStore((s) => s.activeFilepath);

    const [find, setFind] = useState('');
    const [replace, setReplace] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [regexp, setRegexp] = useState(false);
    const [count, setCount] = useState<Count>({ total: 0, current: 0, invalid: false });
    const findInputRef = useRef<HTMLInputElement>(null);

    // Push the query to the editor + recompute the match count whenever the
    // term or any option changes while the panel is open.
    useEffect(() => {
        if (!open) return;
        const view = getView();
        if (!view) return;
        const q = new SearchQuery({ search: find, replace, caseSensitive, wholeWord, regexp });
        view.dispatch({ effects: setSearchQuery.of(q) });
        setCount(computeCount(view, q));
    }, [open, find, replace, caseSensitive, wholeWord, regexp]); // eslint-disable-line react-hooks/exhaustive-deps

    // On open: prefill from a single-line selection, then focus + select.
    useEffect(() => {
        if (!open) return;
        const view = getView();
        if (view) {
            const sel = view.state.selection.main;
            if (!sel.empty) {
                const text = view.state.sliceDoc(sel.from, sel.to);
                if (text && !text.includes('\n')) setFind(text);
            }
        }
        const t = setTimeout(() => { findInputRef.current?.focus(); findInputRef.current?.select(); }, 0);
        return () => clearTimeout(t);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const recount = (view: EditorView) => setCount(computeCount(view, getSearchQuery(view.state)));

    const nav = (dir: 1 | -1) => {
        const view = getView();
        if (!view) return;
        (dir === 1 ? findNext : findPrevious)(view);
        view.focus();
        recount(view);
    };

    const doReplaceOne = () => {
        const view = getView();
        if (!view) return;
        replaceNext(view);
        view.focus();
        recount(view);
    };

    const doReplaceAll = () => {
        const view = getView();
        if (!view) return;
        replaceAll(view);
        recount(view);
    };

    const close = () => {
        const view = getView();
        if (view) {
            // Clear the query so match highlights disappear, then return focus.
            view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
            view.focus();
        }
        setOpen(false);
    };

    const countLabel = count.invalid
        ? 'bad pattern'
        : count.total === 0
            ? (find ? 'No results' : '')
            : count.current > 0
                ? `${count.current} of ${count.total}`
                : `${count.total} found`;

    return (
        <div
            role="search"
            aria-label="Find and replace"
            style={{
                position: 'absolute', top: 8, right: 16, zIndex: 50,
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: 8, borderRadius: 8,
                background: '#0d0d0d', border: '1px solid #333',
                boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
                width: showReplace ? 380 : 340,
                fontFamily: 'inherit',
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        >
            {/* Find row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setShowReplace((v) => !v)} title={showReplace ? 'Hide replace' : 'Show replace'}
                    style={chevStyle}>{showReplace ? '▾' : '▸'}</button>
                <input
                    ref={findInputRef}
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); nav(e.shiftKey ? -1 : 1); }
                    }}
                    placeholder="Find"
                    aria-label="Find"
                    style={inputStyle}
                />
                <Tg label="Aa" title="Match case" active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} />
                <Tg label="W" title="Whole word" active={wholeWord} onClick={() => setWholeWord((v) => !v)} />
                <Tg label=".*" title="Regular expression" active={regexp} onClick={() => setRegexp((v) => !v)} />
                <span style={{
                    minWidth: 64, textAlign: 'right', fontSize: 11, fontFamily: 'monospace',
                    color: count.invalid ? '#ff6b6b' : '#808080',
                }}>{countLabel}</span>
                <button onClick={() => nav(-1)} title="Previous (⇧⏎)" style={navBtnStyle} aria-label="Previous match">‹</button>
                <button onClick={() => nav(1)} title="Next (⏎)" style={navBtnStyle} aria-label="Next match">›</button>
                <button onClick={close} title="Close (Esc)" style={{ ...navBtnStyle, color: '#888' }} aria-label="Close">×</button>
            </div>

            {/* Replace row */}
            {showReplace && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 26 }}>
                    <input
                        value={replace}
                        onChange={(e) => setReplace(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doReplaceOne(); } }}
                        placeholder="Replace with"
                        aria-label="Replace with"
                        style={inputStyle}
                    />
                    <button onClick={doReplaceOne} title="Replace this match" style={actionBtnStyle} disabled={count.total === 0}>Replace</button>
                    <button onClick={doReplaceAll} title="Replace all matches" style={actionBtnStyle} disabled={count.total === 0}>All</button>
                </div>
            )}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, height: 28, padding: '0 8px',
    background: '#000', border: '1px solid #333', borderRadius: 5,
    color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none',
};

const navBtnStyle: React.CSSProperties = {
    flexShrink: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 5,
    color: '#ccc', cursor: 'pointer', fontSize: 15, lineHeight: 1, fontFamily: 'inherit',
};

const chevStyle: React.CSSProperties = {
    flexShrink: 0, width: 20, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: '#808080', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
};

const actionBtnStyle: React.CSSProperties = {
    flexShrink: 0, height: 28, padding: '0 12px',
    background: 'transparent', border: '1px solid #333', borderRadius: 5,
    color: '#ccc', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
};

function Tg({ label, title, active, onClick }: { label: string; title: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title={title}
            aria-pressed={active}
            style={{
                flexShrink: 0, width: 26, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? ACCENT : 'transparent',
                border: `1px solid ${active ? ACCENT : '#2a2a2a'}`,
                borderRadius: 5, color: active ? '#000' : '#888',
                cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
            }}
        >
            {label}
        </button>
    );
}
