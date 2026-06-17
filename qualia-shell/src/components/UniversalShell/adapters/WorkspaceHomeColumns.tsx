/**
 * WorkspaceHomeColumns — real, functional content for the Universal Shell's
 * four columns on the Overview (home) container:
 *
 *   Filing Cabinet → quick-open your files + documents
 *   Scratch Pad    → a persisted quick-note
 *   Canvas         → what's open right now + a launcher
 *   Orchestrator   → talk to the Conductor (ARA) to arrange the canvas
 *
 * Kept lightweight (no heavy widget embeds) so the shell stays fast; each
 * column drives the real app via the same events the sidebar / ⌘K use.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { FolderTree, FileText, Tag, Files, HardDrive, Send, Check } from 'lucide-react';
import { useWindows } from '../../../context/WindowContext';
import { openWidget, parseCommand } from '../../../lib/dwelliumCommands';

const FILE_WIDGETS = [
    { id: 'file-explorer', label: 'File Explorer', Icon: FolderTree },
    { id: 'doc-viewer', label: 'Documents', Icon: FileText },
    { id: 'pdf-gear', label: 'PDF Gear', Icon: FileText },
    { id: 'tag-file', label: 'Tag Files', Icon: Tag },
    { id: 'template-generator', label: 'Templates', Icon: Files },
];

export function FilingCabinetHome() {
    return (
        <div className="ush-col">
            <div className="ush-col-hint">Open your files and documents.</div>
            <div className="ush-launch-grid">
                {FILE_WIDGETS.map(w => (
                    <button key={w.id} className="ush-launch" onClick={() => openWidget(w.id)}>
                        <w.Icon size={15} /><span>{w.label}</span>
                    </button>
                ))}
            </div>
            <button className="ush-launch ush-launch--full" onClick={() => openWidget('file-manager')}>
                <HardDrive size={15} /><span>Open File Manager</span>
            </button>
        </div>
    );
}

const SCRATCH_KEY = 'dwellium-universal-scratch';

export function ScratchPadHome() {
    const [text, setText] = useState('');
    useEffect(() => {
        try { setText(localStorage.getItem(SCRATCH_KEY) || ''); } catch { /* */ }
    }, []);
    const onChange = (v: string) => {
        setText(v);
        try { localStorage.setItem(SCRATCH_KEY, v); } catch { /* */ }
    };
    return (
        <div className="ush-col">
            <textarea
                className="ush-scratch"
                value={text}
                onChange={e => onChange(e.target.value)}
                placeholder="Quick notes… saved automatically as you type."
                spellCheck={false}
            />
        </div>
    );
}

const QUICK_OPEN = [
    { id: 'scribe', label: 'Scribe' },
    { id: 'strata-dashboard', label: 'Strata' },
    { id: 'notepad', label: 'Notepad' },
    { id: 'ara-console', label: 'ARA' },
];

export function CanvasHome() {
    const { windows, focusWindow, restoreWindow } = useWindows();
    return (
        <div className="ush-col">
            {windows.length === 0 ? (
                <div className="ush-empty">Nothing open yet — launch something below.</div>
            ) : (
                <div className="ush-win-list">
                    {windows.map(w => (
                        <button
                            key={w.id}
                            className={`ush-win ${w.minimized ? 'ush-win--min' : ''}`}
                            onClick={() => { if (w.minimized) restoreWindow(w.id); focusWindow(w.id); }}
                        >
                            <span className="ush-win-title">{w.title}</span>
                            {w.minimized && <span className="ush-win-badge">min</span>}
                        </button>
                    ))}
                </div>
            )}
            <div className="ush-launch-grid">
                {QUICK_OPEN.map(q => (
                    <button key={q.id} className="ush-launch" onClick={() => openWidget(q.id)}>+ {q.label}</button>
                ))}
            </div>
        </div>
    );
}

const EXAMPLE_CMDS = ['switch to research', 'open scribe', 'dark mode', 'group strata and scribe into tabs'];

export function OrchestratorHome() {
    const [cmd, setCmd] = useState('');
    const [last, setLast] = useState<ReactNode>('');
    const run = (raw?: string) => {
        const input = (raw ?? cmd).trim();
        if (!input) return;
        const parsed = parseCommand(input);
        if (parsed) { parsed.run(); setLast(<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={14} aria-hidden /> {parsed.label}</span>); setCmd(''); }
        else { setLast(`Didn't understand "${input}". Try "open strata" or "switch to research".`); }
    };
    return (
        <div className="ush-col">
            <div className="ush-col-hint">Tell the Conductor what to do.</div>
            <div className="ush-orch-input">
                <input
                    value={cmd}
                    onChange={e => setCmd(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') run(); }}
                    placeholder='e.g. "put strata on the left and scribe on the right"'
                />
                <button onClick={() => run()} aria-label="Run command"><Send size={14} /></button>
            </div>
            {last && <div className="ush-orch-last">{last}</div>}
            <div className="ush-chips">
                {EXAMPLE_CMDS.map(c => (
                    <button key={c} className="ush-chip" onClick={() => run(c)}>{c}</button>
                ))}
            </div>
            <button className="ush-launch ush-launch--full" onClick={() => openWidget('ara-console')}>
                Open ARA Console
            </button>
        </div>
    );
}
