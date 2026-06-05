/**
 * LocalVoiceLibrary — enroll + label voices (per-user, local) for neural
 * speaker identification, plus accuracy controls:
 *   #2 multi-sample enrollment ("Add sample" folds another clip into a voiceprint)
 *   #4 tunable match threshold + margin (sliders)
 *   #5 "Group unknown voices" → clusters Unknown segments so you can bulk-label
 */
import { useState, useSyncExternalStore } from 'react';
import {
    speakerLibraryStore, enrollSpeaker, removeSpeaker, renameSpeaker, addSpeakerSample,
} from './speakerLibraryStore';
import { speakerSettingsStore, updateSpeakerSettings } from './speakerSettings';
import { getEmbedderMode } from './speakerEmbedder';
import { clusterEmbeddings } from './speakerDiarization';

export function LocalVoiceLibrary({ getLatestEmbedding, getUnknownEmbeddings }: {
    getLatestEmbedding: () => number[] | null;
    getUnknownEmbeddings?: () => number[][];
}) {
    const speakers = useSyncExternalStore(
        speakerLibraryStore.subscribe, speakerLibraryStore.getSnapshot, speakerLibraryStore.getServerSnapshot,
    );
    const settings = useSyncExternalStore(
        speakerSettingsStore.subscribe, speakerSettingsStore.getSnapshot, speakerSettingsStore.getServerSnapshot,
    );
    const [msg, setMsg] = useState<string | null>(null);
    const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2800); };

    const enroll = () => {
        const emb = getLatestEmbedding();
        if (!emb || emb.length === 0) { flash('No voice sample yet — record a moment first.'); return; }
        const name = typeof window !== 'undefined' ? window.prompt('Label this voice (e.g. "Andy"):', '') : null;
        if (!name || !name.trim()) return;
        enrollSpeaker(name.trim(), emb);
        flash(`✓ Enrolled "${name.trim()}".`);
    };

    const addSample = (id: string, label: string) => {
        const emb = getLatestEmbedding();
        if (!emb || emb.length === 0) { flash('No recent voice sample to add.'); return; }
        addSpeakerSample(id, emb);
        flash(`✓ Added a sample to "${label}" (improves accuracy).`);
    };

    const groupUnknowns = () => {
        const embs = getUnknownEmbeddings?.() ?? [];
        if (embs.length < 2) { flash('Need at least 2 unidentified segments to group.'); return; }
        const clusters = clusterEmbeddings(embs, settings.threshold);
        let enrolled = 0;
        clusters.forEach((c, i) => {
            const name = typeof window !== 'undefined'
                ? window.prompt(`Group ${i + 1} of ${clusters.length} — ${c.indices.length} segment(s). Name this voice (blank = skip):`, '')
                : null;
            if (name && name.trim()) { enrollSpeaker(name.trim(), c.centroid); enrolled++; }
        });
        flash(enrolled ? `✓ Labeled ${enrolled} voice group(s).` : 'No groups labeled.');
    };

    const mode = getEmbedderMode();
    const modeLabel = mode === 'neural' ? 'neural voiceprint' : mode === 'basic' ? 'basic (model not loaded)' : 'idle';
    const unknownCount = getUnknownEmbeddings?.().length ?? 0;
    const slider = (label: string, key: 'threshold' | 'margin', min: number, max: number, step: number) => (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb' }}>
            <span style={{ width: 96 }}>{label}</span>
            <input type="range" min={min} max={max} step={step} value={settings[key]}
                onChange={e => updateSpeakerSettings({ [key]: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ width: 38, textAlign: 'right', color: '#D6FE51' }}>{settings[key].toFixed(2)}</span>
        </label>
    );

    return (
        <div className="th-voice-library" style={{ border: '1px solid #2a2a2a', borderRadius: 10, padding: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>🧬 Voice Library</span>
                <span style={{ fontSize: 11, color: '#808080' }}>{speakers.length} enrolled · {modeLabel}</span>
                <span style={{ flex: 1 }} />
                <button onClick={enroll} title="Take the most recent voice sample and label it"
                    style={{ fontSize: 12, fontWeight: 600, color: '#0c0c0c', background: '#D6FE51', border: 'none', borderRadius: 999, padding: '5px 12px', cursor: 'pointer' }}>
                    ＋ Enroll most recent voice
                </button>
            </div>
            {msg && <div style={{ fontSize: 11, color: '#34d399', marginBottom: 6 }}>{msg}</div>}

            {speakers.length === 0 ? (
                <div style={{ fontSize: 11.5, color: '#808080' }}>
                    No voices enrolled yet. Speak, then “Enroll most recent voice” and name it — it’ll be recognized next time.
                    Enroll 3–5 samples per person for best accuracy.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {speakers.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <span style={{ color: '#D6FE51' }}>🎙️</span>
                            <span style={{ color: '#eee', fontWeight: 600 }}>{s.label}</span>
                            <span style={{ fontSize: 10.5, color: '#808080' }}>{s.sampleCount} sample{s.sampleCount === 1 ? '' : 's'}</span>
                            <span style={{ flex: 1 }} />
                            <button onClick={() => addSample(s.id, s.label)} title="Fold the most recent voice sample into this voiceprint"
                                style={{ fontSize: 11, color: '#D6FE51', background: 'transparent', border: '1px solid #333', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                                ＋ Sample
                            </button>
                            <button onClick={() => { const n = window.prompt('Rename voice:', s.label); if (n && n.trim()) renameSpeaker(s.id, n.trim()); }}
                                style={{ fontSize: 11, color: '#9ad7ff', background: 'transparent', border: '1px solid #333', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                                Rename
                            </button>
                            <button onClick={() => removeSpeaker(s.id)} title="Remove this voiceprint"
                                style={{ fontSize: 11, color: '#ff6b85', background: 'transparent', border: '1px solid #3a2a2e', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* #5: group unknown voices for bulk labeling */}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={groupUnknowns} disabled={unknownCount < 2}
                    title="Cluster the unidentified segments by voice so you can label each group at once"
                    style={{ fontSize: 11.5, color: unknownCount < 2 ? '#666' : '#fff', background: 'transparent', border: '1px solid #333', borderRadius: 8, padding: '4px 10px', cursor: unknownCount < 2 ? 'not-allowed' : 'pointer' }}>
                    🧩 Group &amp; label unknown voices ({unknownCount})
                </button>
            </div>

            {/* #4: accuracy controls */}
            <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 11.5, color: '#9ad7ff', cursor: 'pointer' }}>Accuracy settings</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {slider('Match threshold', 'threshold', 0.5, 0.95, 0.01)}
                    {slider('Top-1/2 margin', 'margin', 0, 0.2, 0.01)}
                    <div style={{ fontSize: 10.5, color: '#808080' }}>
                        Higher threshold = fewer false matches (more “Unknown”). Higher margin = won’t guess between similar voices.
                    </div>
                </div>
            </details>
        </div>
    );
}
