/**
 * TabGroupManager — Phase-10 C2 (Option α): create / rename / delete / open
 * named tab groups. A compact desktop panel: pick from the currently-open
 * windows, name the stack, and reopen it any time as browser-style tabs in a
 * region (via tabGroupStore.applyGroup → existing apply-space tabbed bus).
 *
 * Drag-a-tab-to-group affordances are the documented Phase-11 carry-forward;
 * this is the plan's MVP CRUD surface.
 */
import { useState } from 'react';
import { useTabGroups, GROUP_REGION_CHOICES } from '../../lib/tabGroupStore';
import { widgetLabel } from '../../lib/dwelliumCommands';
import './TabGroupManager.css';

export interface OpenWindowInfo {
    component: string;
    title: string;
    /** Window id — lets region-tab drags (text/tab-window-id) resolve to a component. */
    id?: string;
}

const WIDGET_MIME = 'application/x-dwellium-widget';
const TAB_WID_MIME = 'text/tab-window-id';

/** Resolve a drag payload (window ⤴ grip OR region tab) to a component id. */
function componentFromDrag(dt: DataTransfer, openWindows: OpenWindowInfo[]): string | null {
    try {
        const widget = dt.getData(WIDGET_MIME);
        if (widget) {
            const parsed = JSON.parse(widget);
            if (typeof parsed?.widgetType === 'string') return parsed.widgetType;
        }
        const wid = dt.getData(TAB_WID_MIME);
        if (wid) {
            const win = openWindows.find(w => w.id === wid);
            if (win) return win.component;
        }
    } catch { /* malformed payload */ }
    return null;
}

function isGroupDrag(dt: DataTransfer): boolean {
    const types = [...(dt.types || [])];
    return types.includes(WIDGET_MIME) || types.includes(TAB_WID_MIME);
}

interface Props {
    openWindows: OpenWindowInfo[];
    onClose: () => void;
}

export default function TabGroupManager({ openWindows, onClose }: Props) {
    const { groups, createGroup, renameGroup, deleteGroup, applyGroup, addTabToGroup, removeTabFromGroup } = useTabGroups();
    const [dropHover, setDropHover] = useState<string | null>(null); // group id or 'new'
    const [title, setTitle] = useState('');
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    // P11-1: per-group region target ('' = Auto/first region).
    const [regionTargets, setRegionTargets] = useState<Record<string, string>>({});

    const toggle = (component: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(component)) next.delete(component);
            else next.add(component);
            return next;
        });
    };

    const create = () => {
        if (selected.size === 0) return;
        createGroup(title, [...selected]);
        setTitle('');
        setSelected(new Set());
    };

    const commitRename = () => {
        if (renamingId) renameGroup(renamingId, renameValue);
        setRenamingId(null);
    };

    // Dedupe open windows by component (tabs reference components, not window ids).
    const candidates = [...new Map(openWindows.map(w => [w.component, w])).values()];

    return (
        <div className="tgm" role="dialog" aria-label="Tab groups">
            <div className="tgm__head">
                <span className="tgm__title">Tab Groups</span>
                <button className="tgm__close" onClick={onClose} aria-label="Close tab groups panel">✕</button>
            </div>

            <div
                className={`tgm__section ${dropHover === 'new' ? 'tgm__drop-hover' : ''}`}
                onDragOver={e => {
                    if (!isGroupDrag(e.dataTransfer)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    setDropHover('new');
                }}
                onDragLeave={() => setDropHover(h => (h === 'new' ? null : h))}
                onDrop={e => {
                    setDropHover(null);
                    const component = componentFromDrag(e.dataTransfer, openWindows);
                    if (!component) return;
                    e.preventDefault();
                    // P11-2: dropping a tab/window here pre-selects it for the
                    // new group (name it, hit Group).
                    setSelected(prev => new Set(prev).add(component));
                }}
            >
                <div className="tgm__section-label">New group from open windows <span className="tgm__hint">(or drag a tab here)</span></div>
                {candidates.length === 0 ? (
                    <div className="tgm__empty">No open windows to group.</div>
                ) : (
                    <ul className="tgm__candidates">
                        {candidates.map(w => (
                            <li key={w.component}>
                                <label className="tgm__candidate">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(w.component)}
                                        onChange={() => toggle(w.component)}
                                        aria-label={`Include ${w.title} in the new group`}
                                    />
                                    <span>{w.title}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="tgm__create-row">
                    <input
                        className="tgm__input"
                        placeholder="Group name"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') create(); }}
                        aria-label="New group name"
                    />
                    <button className="tgm__btn tgm__btn--primary" onClick={create} disabled={selected.size === 0}>
                        Group {selected.size > 0 ? `(${selected.size})` : ''}
                    </button>
                </div>
            </div>

            <div className="tgm__section">
                <div className="tgm__section-label">Saved groups</div>
                {groups.length === 0 ? (
                    <div className="tgm__empty">No groups yet — select windows above and name the stack.</div>
                ) : (
                    <ul className="tgm__groups">
                        {groups.map(g => (
                            <li
                                key={g.id}
                                className={`tgm__group ${dropHover === g.id ? 'tgm__drop-hover' : ''}`}
                                onDragOver={e => {
                                    if (!isGroupDrag(e.dataTransfer)) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'copy';
                                    setDropHover(g.id);
                                }}
                                onDragLeave={() => setDropHover(h => (h === g.id ? null : h))}
                                onDrop={e => {
                                    setDropHover(null);
                                    const component = componentFromDrag(e.dataTransfer, openWindows);
                                    if (!component) return;
                                    e.preventDefault();
                                    addTabToGroup(g.id, component); // P11-2: drag-a-tab-onto-a-group
                                }}
                            >
                                <div className="tgm__group-row">
                                    {renamingId === g.id ? (
                                        <input
                                            className="tgm__input tgm__input--rename"
                                            value={renameValue}
                                            autoFocus
                                            onChange={e => setRenameValue(e.target.value)}
                                            onBlur={commitRename}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') commitRename();
                                                if (e.key === 'Escape') setRenamingId(null);
                                            }}
                                            aria-label={`New name for group ${g.title}`}
                                        />
                                    ) : (
                                        <button
                                            className="tgm__group-name"
                                            onClick={() => applyGroup(g, regionTargets[g.id] || undefined)}
                                            title={`Open "${g.title}" as tabs`}
                                            aria-label={`Open group ${g.title} (${g.componentIds.length} tabs)`}
                                        >
                                            {g.title}
                                            <span className="tgm__count">{g.componentIds.length}</span>
                                        </button>
                                    )}
                                    <select
                                        className="tgm__region-select"
                                        value={regionTargets[g.id] ?? ''}
                                        onChange={e => setRegionTargets(prev => ({ ...prev, [g.id]: e.target.value }))}
                                        aria-label={`Target region for group ${g.title}`}
                                        title="Region to open this group in (Auto = first region of the current layout)"
                                    >
                                        {GROUP_REGION_CHOICES.map(c => (
                                            <option key={c.id || 'auto'} value={c.id}>{c.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="tgm__btn"
                                        onClick={() => { setRenamingId(g.id); setRenameValue(g.title); }}
                                        aria-label={`Rename group ${g.title}`}
                                    >✎</button>
                                    <button
                                        className="tgm__btn tgm__btn--danger"
                                        onClick={() => deleteGroup(g.id)}
                                        aria-label={`Delete group ${g.title}`}
                                    >🗑</button>
                                </div>
                                <div className="tgm__tabs">
                                    {g.componentIds.map(c => (
                                        <span key={c} className="tgm__tab-chip">
                                            {widgetLabel(c)}
                                            <button
                                                className="tgm__chip-x"
                                                onClick={() => removeTabFromGroup(g.id, c)}
                                                aria-label={`Remove ${widgetLabel(c)} from ${g.title}`}
                                            >×</button>
                                        </span>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
