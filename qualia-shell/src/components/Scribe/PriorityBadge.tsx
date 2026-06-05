/**
 * PriorityBadge — per-document priority control for the Scribe toolbar
 * (spec §5.11). Shows the active document's priority as a colored chip and
 * opens a small menu to change it. Persists per-user, backend-free, via
 * `priorityStore`.
 */

import { useState, useContext, useSyncExternalStore } from 'react';
import { useScribeStore } from './scribeStore';
import { UserContext } from '../../context/UserContext';
import {
    priorityStore,
    priorityUserIdHolder,
    getDocPriority,
    setDocPriority,
    PRIORITY_ORDER,
    PRIORITY_META,
    type PriorityMap,
    type DocPriority,
} from './priorityStore';

export function PriorityBadge() {
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const userCtx = useContext(UserContext);
    priorityUserIdHolder.current = userCtx?.user?.id ?? null;
    const map: PriorityMap = useSyncExternalStore(
        priorityStore.subscribe,
        priorityStore.getSnapshot,
        priorityStore.getServerSnapshot,
    );
    const [open, setOpen] = useState(false);

    if (!activeFilepath) return null;
    const current = getDocPriority(map, activeFilepath);
    const meta = PRIORITY_META[current];

    const pick = (p: DocPriority) => {
        setDocPriority(activeFilepath, p);
        setOpen(false);
    };

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen((v) => !v)}
                title="Set document priority"
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', fontSize: 11, fontWeight: 600,
                    borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    background: current === 'none' ? 'transparent' : `${meta.color}1f`,
                    border: `1px solid ${current === 'none' ? '#333' : meta.color}`,
                    color: current === 'none' ? '#808080' : meta.color,
                    transition: 'background 120ms, color 120ms, border-color 120ms',
                }}
            >
                <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: meta.color,
                    boxShadow: current === 'none' ? 'none' : `0 0 6px ${meta.color}`,
                }} />
                {current === 'none' ? 'Priority' : meta.label}
            </button>
            {open && (
                <div
                    role="menu"
                    aria-label="Document priority"
                    style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 60, marginTop: 4,
                        background: '#111', border: '1px solid #333', borderRadius: 8,
                        boxShadow: '0 6px 20px rgba(0,0,0,0.5)', padding: 4, minWidth: 150,
                    }}
                >
                    {PRIORITY_ORDER.map((p) => {
                        const m = PRIORITY_META[p];
                        const active = p === current;
                        return (
                            <button
                                key={p}
                                role="menuitemradio"
                                aria-checked={active}
                                onClick={() => pick(p)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                    background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                                    border: 'none', color: '#ddd', padding: '6px 10px', borderRadius: 6,
                                    cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'rgba(255,255,255,0.06)' : 'transparent'; }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                                {m.label}
                                {active && <span style={{ marginLeft: 'auto', color: '#D6FE51' }}>✓</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
