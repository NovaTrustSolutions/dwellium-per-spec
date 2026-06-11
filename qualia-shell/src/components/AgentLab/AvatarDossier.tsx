import { useRef } from 'react';
import {
    type PersonaDossier, type DossierKV, type DossierChannel, type DossierNote,
    type PersonaAvatar, NEURAL_VIDEOS,
} from '../../lib/agents/personas';
import './AvatarDossier.css';

/**
 * AvatarDossier — the "Neural Identity Dossier" card, fully EDITABLE. Every
 * value is an inline input/textarea; list sections add/remove rows; ANY field
 * or section can be hidden (and restored). The avatar is a looping neural video
 * (one distinct loop per persona), swappable for an uploaded image or the
 * wireframe. The parent persists changes (Agent Lab → upsertPersona).
 */

const clampPct = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

function Txt({ value, onChange, placeholder, className }: {
    value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
    return (
        <input className={`avd-edit ${className || ''}`} value={value} placeholder={placeholder} spellCheck={false}
            onChange={e => onChange(e.target.value)} />
    );
}

function KVList({ rows, onChange, addLabel }: { rows: DossierKV[]; onChange: (rows: DossierKV[]) => void; addLabel: string }) {
    const set = (i: number, p: Partial<DossierKV>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
    return (
        <ul className="avd-list">
            {rows.map((r, i) => (
                <li key={i} className="avd-row">
                    <Txt className="avd-row-label" value={r.label} onChange={v => set(i, { label: v })} placeholder="Label" />
                    <Txt className="avd-row-value" value={r.value} onChange={v => set(i, { value: v })} placeholder="Value" />
                    <button type="button" className="avd-del" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove field">✕</button>
                </li>
            ))}
            <li><button type="button" className="avd-add" onClick={() => onChange([...rows, { label: 'New', value: '' }])}>+ {addLabel}</button></li>
        </ul>
    );
}

/** Read + downscale an uploaded image to a small data URL (keeps storage tiny). */
function readImageScaled(file: File, max = 256): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => resolve(String(reader.result)); // fall back to raw data URL
            img.onload = () => {
                try {
                    const scale = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * scale);
                    c.height = Math.round(img.height * scale);
                    const ctx = c.getContext('2d');
                    if (!ctx) return resolve(String(reader.result));
                    ctx.drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL('image/jpeg', 0.82));
                } catch { resolve(String(reader.result)); }
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });
}

export default function AvatarDossier({ dossier, onChange, avatar, onAvatarChange, neuralVideo, onNeuralVideoChange }: {
    dossier: PersonaDossier;
    onChange: (d: PersonaDossier) => void;
    avatar: PersonaAvatar;
    onAvatarChange: (a: PersonaAvatar) => void;
    neuralVideo: string;
    onNeuralVideoChange: (src: string) => void;
}) {
    const patch = (p: Partial<PersonaDossier>) => onChange({ ...dossier, ...p });
    const fileRef = useRef<HTMLInputElement | null>(null);

    const hidden = new Set(dossier.hidden ?? []);
    const isHidden = (k: string) => hidden.has(k);
    const toggleHide = (k: string) => patch({ hidden: hidden.has(k) ? [...hidden].filter(x => x !== k) : [...hidden, k] });
    const HideBtn = ({ k }: { k: string }) => (
        <button type="button" className="avd-hide" title="Hide field" aria-label="Hide field" onClick={() => toggleHide(k)}>⊘</button>
    );

    const setChannel = (i: number, p: Partial<DossierChannel>) => patch({ channels: dossier.channels.map((c, j) => (j === i ? { ...c, ...p } : c)) });
    const setNote = (i: number, p: Partial<DossierNote>) => patch({ notes: dossier.notes.map((n, j) => (j === i ? { ...n, ...p } : n)) });

    const onUpload = async (file?: File) => {
        if (!file) return;
        try { onAvatarChange({ kind: 'image', src: await readImageScaled(file) }); } catch { /* ignore */ }
    };
    const curVideoIdx = Math.max(0, NEURAL_VIDEOS.indexOf(neuralVideo));

    return (
        <div className="avd" data-dossier>
            <div className="avd-frame">
                <header className="avd-topbar">
                    <div className="avd-brand">
                        <div className="avd-logo" aria-hidden="true" />
                        <span>Neural Identity Dossier</span>
                    </div>
                    <div className="avd-status">
                        {!isHidden('subjectId') && <label>Subject <Txt className="avd-status-edit" value={dossier.subjectId} onChange={v => patch({ subjectId: v })} placeholder="ID" /><HideBtn k="subjectId" /></label>}
                        {!isHidden('scanMode') && <label>Scan <Txt className="avd-status-edit" value={dossier.scanMode} onChange={v => patch({ scanMode: v })} placeholder="Mode" /><HideBtn k="scanMode" /></label>}
                        {!isHidden('clearance') && <label>Clearance <Txt className="avd-status-edit" value={dossier.clearance} onChange={v => patch({ clearance: v })} placeholder="Level" /><HideBtn k="clearance" /></label>}
                    </div>
                </header>

                {/* Looping neural activity — top-right corner. */}
                <video className="avd-corner-video" src={neuralVideo} autoPlay loop muted playsInline aria-label="Neural activity loop" />

                <section className="avd-grid">
                    {/* LEFT */}
                    <aside className="avd-panel">
                        <div className="avd-section">
                            <div className="avd-eyebrow">Profile</div>
                            {!isHidden('title') && <div className="avd-fieldrow"><Txt className="avd-h1" value={dossier.title} onChange={v => patch({ title: v })} placeholder="Title" /><HideBtn k="title" /></div>}
                            {!isHidden('description') && <div className="avd-fieldrow"><textarea className="avd-desc" value={dossier.description} onChange={e => patch({ description: e.target.value })} placeholder="Description…" /><HideBtn k="description" /></div>}
                        </div>
                        {!isHidden('identity') && (
                            <div className="avd-section">
                                <h2 className="avd-h2">Identity Matrix <HideBtn k="identity" /></h2>
                                <KVList rows={dossier.identity} onChange={identity => patch({ identity })} addLabel="Field" />
                            </div>
                        )}
                        {!isHidden('traits') && (
                            <div className="avd-section">
                                <h2 className="avd-h2">Signal Traits <HideBtn k="traits" /></h2>
                                <KVList rows={dossier.traits} onChange={traits => patch({ traits })} addLabel="Trait" />
                            </div>
                        )}
                    </aside>

                    {/* CENTER — avatar */}
                    <section className="avd-panel avd-stage">
                        <div className="avd-avatar">
                            <div className="avd-ring" />
                            <div className="avd-ring2" />
                            <div className="avd-ring3" />
                            <div className="avd-crosshair" />
                            {avatar.kind === 'image' && avatar.src ? (
                                <img className="avd-media avd-media--circle" src={avatar.src} alt="Persona avatar" />
                            ) : (
                                <><div className="avd-head"><div className="avd-wire" /></div><div className="avd-neck" /><div className="avd-shoulders" /></>
                            )}
                            {!isHidden('tags') && dossier.tags.slice(0, 4).map((t, i) => (
                                <div key={i} className={`avd-tag avd-tag--${i + 1}`}>
                                    <Txt className="avd-tag-label" value={t.label} onChange={v => patch({ tags: dossier.tags.map((x, j) => (j === i ? { ...x, label: v } : x)) })} placeholder="Tag" />
                                    <Txt className="avd-tag-value" value={t.value} onChange={v => patch({ tags: dossier.tags.map((x, j) => (j === i ? { ...x, value: v } : x)) })} placeholder="Value" />
                                </div>
                            ))}
                        </div>

                        {/* Editable avatar controls */}
                        <div className="avd-avatar-tools">
                            <span className="avd-tool-label">Circle</span>
                            <button type="button" className="avd-avatar-btn" onClick={() => fileRef.current?.click()}>Upload image</button>
                            {avatar.kind === 'image' && avatar.src && (
                                <button type="button" className="avd-avatar-btn" onClick={() => onAvatarChange({ kind: 'wireframe' })}>Remove image</button>
                            )}
                            <span className="avd-tool-label">Loop</span>
                            <select className="avd-avatar-select" value={String(curVideoIdx)} aria-label="Neural loop"
                                onChange={e => onNeuralVideoChange(NEURAL_VIDEOS[Number(e.target.value)])}>
                                {NEURAL_VIDEOS.map((_, i) => <option key={i} value={i}>Neural {i + 1}</option>)}
                            </select>
                            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onUpload(e.target.files?.[0])} />
                        </div>

                        {!isHidden('metrics') && (
                            <div className="avd-metrics-wrap">
                                <div className="avd-metrics">
                                    {dossier.metrics.map((m, i) => (
                                        <div key={i} className="avd-metric">
                                            <Txt className="avd-metric-value" value={m.value} onChange={v => patch({ metrics: dossier.metrics.map((x, j) => (j === i ? { ...x, value: v } : x)) })} placeholder="Value" />
                                            <Txt className="avd-metric-label" value={m.label} onChange={v => patch({ metrics: dossier.metrics.map((x, j) => (j === i ? { ...x, label: v } : x)) })} placeholder="Label" />
                                        </div>
                                    ))}
                                </div>
                                <div className="avd-sectaghide"><HideBtn k="metrics" /></div>
                            </div>
                        )}
                    </section>

                    {/* RIGHT */}
                    <aside className="avd-panel">
                        {!isHidden('readout') && (
                            <div className="avd-section">
                                <div className="avd-eyebrow">Analysis</div>
                                <h2 className="avd-h2">Subsystem Readout <HideBtn k="readout" /></h2>
                                <KVList rows={dossier.readout} onChange={readout => patch({ readout })} addLabel="Readout" />
                            </div>
                        )}
                        {!isHidden('channels') && (
                            <div className="avd-section">
                                <h2 className="avd-h2">Channel Strength <HideBtn k="channels" /></h2>
                                <div className="avd-channels">
                                    {dossier.channels.map((c, i) => (
                                        <div key={i} className="avd-channel">
                                            <div className="avd-channel-head">
                                                <Txt className="avd-channel-label" value={c.label} onChange={v => setChannel(i, { label: v })} placeholder="Channel" />
                                                <input className="avd-channel-pct" type="number" min={0} max={100} value={c.pct} onChange={e => setChannel(i, { pct: clampPct(Number(e.target.value)) })} />
                                                <span className="avd-channel-unit">%</span>
                                                <button type="button" className="avd-del" onClick={() => patch({ channels: dossier.channels.filter((_, j) => j !== i) })} aria-label="Remove channel">✕</button>
                                            </div>
                                            <div className="avd-bar"><i style={{ width: `${clampPct(c.pct)}%` }} /></div>
                                        </div>
                                    ))}
                                    <button type="button" className="avd-add" onClick={() => patch({ channels: [...dossier.channels, { label: 'New channel', pct: 50 }] })}>+ Channel</button>
                                </div>
                            </div>
                        )}
                        {!isHidden('notes') && (
                            <div className="avd-section">
                                <h2 className="avd-h2">Notes <HideBtn k="notes" /></h2>
                                <div className="avd-notes">
                                    {dossier.notes.map((n, i) => (
                                        <div key={i} className="avd-note">
                                            <div className="avd-note-head">
                                                <Txt className="avd-note-title" value={n.title} onChange={v => setNote(i, { title: v })} placeholder="Note title" />
                                                <button type="button" className="avd-del" onClick={() => patch({ notes: dossier.notes.filter((_, j) => j !== i) })} aria-label="Remove note">✕</button>
                                            </div>
                                            <textarea className="avd-note-body" value={n.body} onChange={e => setNote(i, { body: e.target.value })} placeholder="Note…" />
                                        </div>
                                    ))}
                                    <button type="button" className="avd-add" onClick={() => patch({ notes: [...dossier.notes, { title: 'New note', body: '' }] })}>+ Note</button>
                                </div>
                            </div>
                        )}
                    </aside>
                </section>

                {hidden.size > 0 && (
                    <div className="avd-hidden-bar">
                        <span className="avd-hidden-label">Hidden ({hidden.size}):</span>
                        {[...hidden].map(k => (
                            <button key={k} type="button" className="avd-restore" onClick={() => toggleHide(k)} title="Restore field">+ {k}</button>
                        ))}
                    </div>
                )}

                <footer className="avd-footer">
                    <span>Editable persona dossier</span>
                    <span>Neural loop avatar</span>
                    <span>Every field editable + hideable</span>
                </footer>
            </div>
        </div>
    );
}
