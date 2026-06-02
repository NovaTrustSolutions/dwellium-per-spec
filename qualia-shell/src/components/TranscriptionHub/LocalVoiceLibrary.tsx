/**
 * LocalVoiceLibrary — enroll + label voices, stored per-user locally, used to
 * identify speakers by neural voiceprint on subsequent speech. Self-contained
 * (subscribes to the speaker library store) so it stays decoupled from the
 * large TranscriptionHub render.
 *
 * Flow: speak → the recorder embeds the voice → "Enroll most recent voice" takes
 * that sample, you give it a name → next time that voice speaks it's matched and
 * the transcript links to the label.
 */
import { useState, useSyncExternalStore } from 'react';
import { speakerLibraryStore, enrollSpeaker, removeSpeaker, renameSpeaker } from './speakerLibraryStore';
import { getEmbedderMode } from './speakerEmbedder';

export function LocalVoiceLibrary({ getLatestEmbedding }: { getLatestEmbedding: () => number[] | null }) {
    const speakers = useSyncExternalStore(
        speakerLibraryStore.subscribe,
        speakerLibraryStore.getSnapshot,
        speakerLibraryStore.getServerSnapshot,
    );
    const [msg, setMsg] = useState<string | null>(null);
    const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2600); };

    const enroll = () => {
        const emb = getLatestEmbedding();
        if (!emb || emb.length === 0) { flash('No voice sample yet — record a moment first.'); return; }
        const name = typeof window !== 'undefined' ? window.prompt('Label this voice (e.g. "Andy"):', '') : null;
        if (!name || !name.trim()) return;
        enrollSpeaker(name.trim(), emb);
        flash(`✓ Enrolled "${name.trim()}" — future speech will be matched to them.`);
    };

    const mode = getEmbedderMode();
    const modeLabel = mode === 'neural' ? 'neural voiceprint'
        : mode === 'basic' ? 'basic (model not loaded)'
        : 'idle';

    return (
        <div className="th-voice-library" style={{ border: '1px solid #2a2a2a', borderRadius: 10, padding: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>🧬 Voice Library</span>
                <span style={{ fontSize: 11, color: '#808080' }}>{speakers.length} enrolled · {modeLabel}</span>
                <span style={{ flex: 1 }} />
                <button
                    onClick={enroll}
                    title="Take the most recent voice sample and label it"
                    style={{ fontSize: 12, fontWeight: 600, color: '#0c0c0c', background: '#D6FE51', border: 'none', borderRadius: 999, padding: '5px 12px', cursor: 'pointer' }}
                >
                    ＋ Enroll most recent voice
                </button>
            </div>
            {msg && <div style={{ fontSize: 11, color: '#34d399', marginBottom: 6 }}>{msg}</div>}
            {speakers.length === 0 ? (
                <div style={{ fontSize: 11.5, color: '#808080' }}>
                    No voices enrolled yet. Speak, then “Enroll most recent voice” and give it a name — it’ll be recognized next time.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {speakers.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <span style={{ color: '#D6FE51' }}>🎙️</span>
                            <span style={{ color: '#eee', fontWeight: 600 }}>{s.label}</span>
                            <span style={{ fontSize: 10.5, color: '#808080' }}>{s.sampleCount} sample{s.sampleCount === 1 ? '' : 's'}</span>
                            <span style={{ flex: 1 }} />
                            <button
                                onClick={() => { const n = window.prompt('Rename voice:', s.label); if (n && n.trim()) renameSpeaker(s.id, n.trim()); }}
                                title="Rename"
                                style={{ fontSize: 11, color: '#9ad7ff', background: 'transparent', border: '1px solid #333', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                            >
                                Rename
                            </button>
                            <button
                                onClick={() => removeSpeaker(s.id)}
                                title="Remove this voiceprint"
                                style={{ fontSize: 11, color: '#ff6b85', background: 'transparent', border: '1px solid #3a2a2e', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
