/**
 * DictationSection — plan 047 "FluidVoice companion" phase 1 setup card.
 *
 * FluidVoice is a GPL-3 macOS menu-bar dictation app (companion install — zero
 * embed, no server). It types into ANY focused Dwellium text field via the
 * Accessibility API: ARA composer, Scribe, Inbox replies, Strata work-order
 * notes. This card is install instructions + a one-click "Copy vocabulary"
 * that puts the property-management custom-vocabulary seed
 * (src/data/fluidVoiceVocabulary.ts) on the clipboard for the loopback
 * dictionary API. Text + one clipboard call; no persistent state.
 */
import { useState, type CSSProperties } from 'react';
import { Mic, ClipboardCopy } from 'lucide-react';
import { buildVocabularyPayload, FLUIDVOICE_VOCABULARY, SEED_COMMAND } from '../../data/fluidVoiceVocabulary';

const CODE_STYLE: CSSProperties = {
    display: 'block', fontSize: 12, color: 'var(--accent)', background: 'rgba(0,0,0,0.35)',
    border: '1px solid var(--border, #333)', borderRadius: 6, padding: '6px 10px',
    fontFamily: "'JetBrains Mono','Fira Code',monospace", overflowX: 'auto', whiteSpace: 'pre',
    margin: '6px 0 0',
};

export default function DictationSection() {
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

    const copyVocabulary = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(buildVocabularyPayload(), null, 2));
            setCopyState('copied');
        } catch {
            setCopyState('failed');
        }
    };

    return (
        <section className="cp-section">
            <h3 className="cp-section__title"><Mic size={15} aria-hidden /> Dictation (FluidVoice)</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 0, lineHeight: 1.6 }}>
                FluidVoice is an open-source (GPL-3) Mac menu-bar app that turns speech into text
                on-device and types it into <strong>any</strong> focused Dwellium field — the ARA
                composer, Scribe, Inbox replies, Strata work-order notes. It is a companion install
                on your Mac; nothing runs on Dwellium&rsquo;s servers.
            </p>
            <ol style={{ color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.7, margin: '8px 0', paddingLeft: 18 }}>
                <li>
                    Install (macOS 15+, Apple Silicon):
                    <code style={CODE_STYLE}>brew install --cask fluidvoice</code>
                </li>
                <li>Grant Microphone + Accessibility; pick a push-to-talk hotkey (Right-Option works well); choose the Parakeet model; leave cloud AI off.</li>
                <li>
                    Seed the property-management vocabulary ({FLUIDVOICE_VOCABULARY.length} terms — widget names,
                    lease jargon, community names): in FluidVoice Settings enable <em>Local API</em>, click
                    <em> Copy vocabulary</em> below, then run:
                    <code style={CODE_STYLE}>{SEED_COMMAND}</code>
                </li>
                <li>Disable Local API again afterwards (it exposes dictation history to local processes).</li>
            </ol>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                    onClick={() => void copyVocabulary()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                    <ClipboardCopy size={14} aria-hidden /> Copy vocabulary
                </button>
                {copyState === 'copied' && (
                    <span role="status" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Copied {FLUIDVOICE_VOCABULARY.length} terms — paste into the seed command above.
                    </span>
                )}
                {copyState === 'failed' && (
                    <span role="status" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Clipboard unavailable in this browser — copy the seed from src/data/fluidVoiceVocabulary.ts instead.
                    </span>
                )}
            </div>
        </section>
    );
}
