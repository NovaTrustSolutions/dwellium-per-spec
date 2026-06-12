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
import { useTabGroups } from '../../lib/tabGroupStore';
import { widgetLabel } from '../../lib/dwelliumCommands';
import './TabGroupManager.css';

export interface OpenWindowInfo {
    component: string;
    title: string;
}

interface Props {
    openWindows: OpenWindowInfo[];
    onClose: () => void;
}

export default function TabGroupManager({ openWindows, onClose }: Props) {
    const { groups, createGroup, renameGroup, deleteGroup, applyGroup, removeTabFromGroup } = useTabGroups();
    const [title, setTitle] = useState('');
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

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

            <div className="tgm__section">
                <div className="tgm__section-label">New group from open windows</div>
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
                            <li key={g.id} className="tgm__group">
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
                                            onClick={() => applyGroup(g)}
                                            title={`Open "${g.title}" as tabs`}
                                            aria-label={`Open group ${g.title} (${g.componentIds.length} tabs)`}
                                        >
                                            {g.title}
                                            <span className="tgm__count">{g.componentIds.length}</span>
                                        </button>
                                    )}
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
