/**
 * Floating navigator above the editor when pending redlines exist.
 * Shows "Redline N of M", prev/next, Accept All / Reject All.
 *
 * Ported from Holocron's RedlineNavigator.tsx (Cycle 6). Removed:
 * editorMode gate (single-mode in Dwellium), comment auto-resolve
 * (Cycle 7), Electron IPC.
 */
import { useState, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { useScribeStore, type Redline } from './scribeStore';

export function RedlineNavigator({ getView }: { getView: () => EditorView | null }) {
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const redlines = useScribeStore((s) => s.redlines);

    const fileRedlines = useMemo(() => {
        if (!activeFilepath) return [];
        return redlines
            .filter((r) => r.filepath === activeFilepath && r.state === 'pending')
            .sort((a, b) => a.from - b.from);
    }, [redlines, activeFilepath]);

    const [cursor, setCursor] = useState(0);

    if (fileRedlines.length === 0) return null;

    const safeCursor = Math.min(cursor, fileRedlines.length - 1);

    const scrollTo = (idx: number) => {
        const view = getView();
        const r = fileRedlines[idx];
        if (!view || !r) return;
        view.dispatch({ effects: EditorView.scrollIntoView(r.from, { y: 'center' }) });
    };

    const goPrev = () => {
        const next = (safeCursor - 1 + fileRedlines.length) % fileRedlines.length;
        setCursor(next);
        scrollTo(next);
    };

    const goNext = () => {
        const next = (safeCursor + 1) % fileRedlines.length;
        setCursor(next);
        scrollTo(next);
    };

    const acceptAll = () => {
        const view = getView();
        if (!view) return;
        const docLen = view.state.doc.length;
        const valid = fileRedlines.filter((r) => r.from >= 0 && r.to <= docLen && r.from < r.to);
        if (valid.length === 0) return;
        const seen = new Set<string>();
        const winners: Redline[] = [];
        for (const r of [...valid].sort((a, b) => a.from - b.from)) {
            const key = `${r.from}:${r.to}`;
            if (seen.has(key)) continue;
            seen.add(key);
            winners.push(r);
        }
        view.dispatch({
            changes: winners
                .sort((a, b) => b.from - a.from)
                .map((r) => ({ from: r.from, to: r.to, insert: r.proposedText })),
        });
        for (const r of fileRedlines) useScribeStore.getState().removeRedline(r.id);
        setCursor(0);
    };

    const rejectAll = () => {
        for (const r of fileRedlines) useScribeStore.getState().removeRedline(r.id);
        setCursor(0);
    };

    return (
        <div style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '8px 18px',
            background: 'var(--accent)',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 999,
            boxShadow: '0 6px 20px color-mix(in srgb, var(--accent) 30%, transparent), 0 2px 6px rgba(0,0,0,0.25)',
            fontSize: 13,
            fontFamily: 'inherit',
            color: 'var(--text-inverse)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            minWidth: 340,
            justifyContent: 'center',
        }}>
            <span style={{ fontWeight: 500 }}>
                Redline <span style={{ fontWeight: 700 }}>{safeCursor + 1}</span> of <span style={{ fontWeight: 700 }}>{fileRedlines.length}</span>
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
                <NavBtn label="▲" title="Previous" onClick={goPrev} disabled={fileRedlines.length < 2} />
                <NavBtn label="▼" title="Next" onClick={goNext} disabled={fileRedlines.length < 2} />
            </div>
            <span style={{ color: 'rgba(0,0,0,0.2)', fontSize: 14 }}>│</span>
            <div style={{ display: 'flex', gap: 6 }}>
                <NavBtn label="Accept All" title="Accept all" onClick={acceptAll} accept />
                <NavBtn label="Reject All" title="Reject all" onClick={rejectAll} reject />
            </div>
        </div>
    );
}

function NavBtn({ label, title, onClick, disabled, accept, reject }: {
    label: string; title: string; onClick: () => void;
    disabled?: boolean; accept?: boolean; reject?: boolean;
}) {
    const isChip = accept || reject;
    const baseBg = accept ? '#1a7a2e' : reject ? '#c0392b' : 'rgba(0,0,0,0.08)';
    const baseColor = accept || reject ? '#fff' : '#000';
    const hoverBg = accept ? '#22903a' : reject ? '#ef4444' : 'rgba(0,0,0,0.15)';
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                background: baseBg,
                border: 'none',
                color: baseColor,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.4 : 1,
                padding: isChip ? '4px 12px' : '4px 8px',
                fontSize: 12,
                fontWeight: isChip ? 700 : 600,
                fontFamily: 'inherit',
                borderRadius: 999,
                transition: 'background 120ms, transform 80ms',
                lineHeight: 1,
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = baseBg; }}
        >
            {label}
        </button>
    );
}
