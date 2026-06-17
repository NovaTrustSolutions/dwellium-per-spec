/**
 * TagHotkey — global Cmd/Ctrl+T tagging (2026-06-14). Press the hotkey anywhere
 * (any app, with anything highlighted) to capture the selection, name a tag, and
 * link it to one or more projects. Mounted once in AdminShell.
 *
 * Note: in a plain browser tab the OS/browser may intercept Cmd/Ctrl+T (new
 * tab); inside the Dwellium desktop app it's free. A custom `dwellium:open-tag`
 * event also opens the dialog so other surfaces can trigger it.
 */
import { useEffect, useState } from 'react';
import { Check, Tag } from 'lucide-react';
import { addTag, TAG_PROJECTS } from '../../lib/tagsStore';
import './TagHotkey.css';

export default function TagHotkey() {
    const [openDlg, setOpenDlg] = useState(false);
    const [name, setName] = useState('');
    const [selection, setSelection] = useState('');
    const [chosen, setChosen] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 't' || e.key === 'T')) {
                e.preventDefault();
                e.stopPropagation();
                const sel = (window.getSelection?.()?.toString() ?? '').trim();
                setSelection(sel);
                setName(sel ? sel.slice(0, 40) : '');
                setChosen([]);
                setSaved(false);
                setOpenDlg(true);
            } else if (e.key === 'Escape' && openDlg) {
                setOpenDlg(false);
            }
        };
        const onOpen = () => { setSelection(''); setName(''); setChosen([]); setSaved(false); setOpenDlg(true); };
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('dwellium:open-tag', onOpen);
        return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('dwellium:open-tag', onOpen); };
    }, [openDlg]);

    if (!openDlg) return null;

    const toggle = (p: string) => setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]));
    const save = () => {
        if (!name.trim()) return;
        addTag({ name: name.trim(), projects: chosen, content: selection, source: 'selection' });
        setSaved(true);
        setTimeout(() => setOpenDlg(false), 700);
    };

    return (
        <div className="tagdlg__scrim" onClick={() => setOpenDlg(false)}>
            <div className="tagdlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create tag">
                <div className="tagdlg__h"><Tag size={16} aria-hidden /> Tag {selection ? 'selection' : 'something'}</div>
                {selection && <div className="tagdlg__sel">“{selection.slice(0, 160)}{selection.length > 160 ? '…' : ''}”</div>}
                <label className="tagdlg__lbl">Tag name</label>
                <input className="tagdlg__input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder="e.g. auth-bug, design-idea…" />
                <label className="tagdlg__lbl">Link to projects</label>
                <div className="tagdlg__projects">
                    {TAG_PROJECTS.map((p) => (
                        <button key={p} type="button" className={`tagdlg__proj ${chosen.includes(p) ? 'on' : ''}`} onClick={() => toggle(p)}>{p}</button>
                    ))}
                </div>
                <div className="tagdlg__actions">
                    <button className="tagdlg__cancel" onClick={() => setOpenDlg(false)}>Cancel</button>
                    <button className="tagdlg__save" onClick={save} disabled={!name.trim()}>{saved ? <><Check size={14} aria-hidden /> Saved</> : `Save tag${chosen.length ? ` → ${chosen.length} project${chosen.length > 1 ? 's' : ''}` : ''}`}</button>
                </div>
            </div>
        </div>
    );
}
