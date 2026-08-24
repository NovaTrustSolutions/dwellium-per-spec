/**
 * DictationSection — plan 047 FluidVoice companion card, upgraded to 100% by
 * plan 053:
 *   1. LIVE detection — pings FluidVoice's loopback API (no-cors honesty:
 *      resolve ≈ Running, network error ≈ Not detected) with a Re-check.
 *   2. One-click "Send vocabulary" POST straight to the Local API
 *      (fire-and-recheck — the opaque response cannot be read, the UI says so;
 *      clipboard + curl stays as the verifiable fallback).
 *   3. Copyable per-app "Dwellium prompt" for FluidVoice's AI enhancement.
 *   4. Built-in any-platform dictation: global hotkey (default ⌥D, per-user)
 *      via the Web Speech API — the non-Mac fallback FluidVoice can't cover.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Mic, ClipboardCopy, RefreshCw, Send, Keyboard } from 'lucide-react';
import { buildVocabularyPayload, FLUIDVOICE_VOCABULARY, SEED_COMMAND } from '../../data/fluidVoiceVocabulary';
import { DWELLIUM_DICTATION_PROMPT } from '../../data/dictationPrompt';
import { useFluidVoiceStatus, sendVocabulary, isMacLike, FLUIDVOICE_BASE } from '../../lib/fluidVoiceLocalApi';
import {
    DEFAULT_DICTATION_HOTKEY, eventToHotkey, formatHotkey, matchesHotkey,
    setDictationHotkey, useDictationHotkey, useDictationIdentity,
} from '../../lib/dictationHotkeyStore';
import { getSpeechRecognitionCtor } from '../../lib/globalDictation';

const CODE_STYLE: CSSProperties = {
    display: 'block', fontSize: 12, color: 'var(--accent)', background: 'rgba(0,0,0,0.35)',
    border: '1px solid var(--border, #333)', borderRadius: 6, padding: '6px 10px',
    fontFamily: "'JetBrains Mono','Fira Code',monospace", overflowX: 'auto', whiteSpace: 'pre',
    margin: '6px 0 0',
};
const PROMPT_STYLE: CSSProperties = { ...CODE_STYLE, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', maxHeight: 180, overflowY: 'auto' };
const BTN_STYLE: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7,
    border: '1px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const GHOST_BTN_STYLE: CSSProperties = { ...BTN_STYLE, border: '1px solid var(--border, #333)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600 };
const MUTED: CSSProperties = { color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.6 };
const STATUS_TXT: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' };
const H4: CSSProperties = { fontSize: 13, color: 'var(--text-primary)', margin: '18px 0 4px' };

function StatusPill({ state }: { state: 'unknown' | 'checking' | 'running' | 'not-detected' }) {
    const label = state === 'running' ? 'Running'
        : state === 'not-detected' ? 'Not detected'
            : state === 'checking' ? 'Checking…' : 'macOS app';
    const color = state === 'running' ? 'var(--accent)' : 'var(--text-tertiary)';
    return (
        <span data-testid="fluidvoice-status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 999, padding: '3px 10px' }}>
            {label}
        </span>
    );
}

export default function DictationSection() {
    useDictationIdentity();
    const hotkey = useDictationHotkey();
    const { state, recheck } = useFluidVoiceStatus();
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const [promptCopy, setPromptCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
    const [seedState, setSeedState] = useState<'idle' | 'sending' | 'sent' | 'unreachable'>('idle');
    const [capturing, setCapturing] = useState(false);
    const speechSupported = getSpeechRecognitionCtor() !== null;
    const onMac = isMacLike();

    const copy = async (text: string, set: (s: 'copied' | 'failed') => void) => {
        try {
            await navigator.clipboard.writeText(text);
            set('copied');
        } catch {
            set('failed');
        }
    };

    const seed = async () => {
        setSeedState('sending');
        setSeedState(await sendVocabulary() === 'sent' ? 'sent' : 'unreachable');
        recheck(); // fire-and-recheck: at least confirm something still answers on :47733
    };

    useEffect(() => {
        if (!capturing) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') { setCapturing(false); return; }
            const hk = eventToHotkey(e);
            if (hk) { setDictationHotkey(hk); setCapturing(false); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [capturing]);

    const running = state === 'running';

    return (
        <section className="cp-section">
            <h3 className="cp-section__title"><Mic size={15} aria-hidden /> Dictation (FluidVoice)</h3>
            <p style={{ ...MUTED, marginTop: 0 }}>
                FluidVoice is an open-source (GPL-3) Mac menu-bar app that turns speech into text
                on-device and types it into <strong>any</strong> focused Dwellium field — the ARA
                composer, Scribe, Inbox replies, Strata work-order notes. It is a companion install
                on your Mac; nothing runs on Dwellium&rsquo;s servers.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '8px 0' }}>
                <StatusPill state={state} />
                {onMac && (
                    <button onClick={recheck} style={GHOST_BTN_STYLE} title={`Ping ${FLUIDVOICE_BASE}/v1/health again`}>
                        <RefreshCw size={13} aria-hidden /> Re-check
                    </button>
                )}
                {onMac && (
                    <span style={STATUS_TXT}>
                        Detection pings the local API on 127.0.0.1:47733 — &ldquo;Running&rdquo; means something answered
                        (FluidVoice with Local API on); a network error shows &ldquo;Not detected&rdquo;.
                    </span>
                )}
                {!onMac && <span style={STATUS_TXT}>FluidVoice needs macOS 15+ — on this device use the built-in hotkey dictation below.</span>}
            </div>

            {running ? (
                <div>
                    <h4 style={H4}>Seed the vocabulary</h4>
                    <p style={{ ...MUTED, margin: '0 0 8px' }}>
                        FluidVoice is answering on the Local API, so the {FLUIDVOICE_VOCABULARY.length}-term
                        property-management vocabulary (widget names, lease jargon, Andy&rsquo;s communities)
                        can be sent in one click — always append-mode, never replace.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button onClick={() => void seed()} disabled={seedState === 'sending'} style={BTN_STYLE}>
                            <Send size={14} aria-hidden /> Send vocabulary to FluidVoice
                        </button>
                        {seedState === 'sent' && (
                            <span role="status" style={STATUS_TXT}>
                                Sent {FLUIDVOICE_VOCABULARY.length} terms. The browser cannot read FluidVoice&rsquo;s reply
                                (no CORS on the loopback API), so confirm in FluidVoice → Custom Dictionary — or run the
                                curl fallback below.
                            </span>
                        )}
                        {seedState === 'unreachable' && (
                            <span role="status" style={STATUS_TXT}>
                                The request failed to leave the browser — re-check FluidVoice&rsquo;s Local API toggle and try again,
                                or use the clipboard + curl fallback below.
                            </span>
                        )}
                    </div>
                    <details style={{ marginTop: 8 }}>
                        <summary style={{ ...STATUS_TXT, cursor: 'pointer' }}>Fallback: seed from the terminal instead</summary>
                        <p style={{ ...MUTED, margin: '6px 0 0' }}>
                            Click <em>Copy vocabulary</em>, then run:
                        </p>
                        <code style={CODE_STYLE}>{SEED_COMMAND}</code>
                    </details>
                    <p style={{ ...MUTED, margin: '8px 0 0' }}>
                        When you&rsquo;re done seeding, disable Local API again in FluidVoice Settings (it exposes
                        dictation history to local processes).
                    </p>
                </div>
            ) : (
                <ol style={{ ...MUTED, lineHeight: 1.7, margin: '8px 0', paddingLeft: 18 }}>
                    <li>
                        Install (macOS 15+, Apple Silicon):
                        <code style={CODE_STYLE}>brew install --cask fluidvoice</code>
                    </li>
                    <li>Grant Microphone + Accessibility; pick a push-to-talk hotkey (Right-Option works well); choose the Parakeet model; leave cloud AI off.</li>
                    <li>
                        Seed the property-management vocabulary ({FLUIDVOICE_VOCABULARY.length} terms — widget names,
                        lease jargon, community names): in FluidVoice Settings enable <em>Local API</em>, click
                        <em> Re-check</em> above (the pill flips to Running and a one-click send appears), or click
                        <em> Copy vocabulary</em> below and run:
                        <code style={CODE_STYLE}>{SEED_COMMAND}</code>
                    </li>
                    <li>Disable Local API again afterwards (it exposes dictation history to local processes).</li>
                </ol>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <button onClick={() => void copy(JSON.stringify(buildVocabularyPayload(), null, 2), setCopyState)} style={BTN_STYLE}>
                    <ClipboardCopy size={14} aria-hidden /> Copy vocabulary
                </button>
                {copyState === 'copied' && (
                    <span role="status" style={STATUS_TXT}>
                        Copied {FLUIDVOICE_VOCABULARY.length} terms — paste into the seed command above.
                    </span>
                )}
                {copyState === 'failed' && (
                    <span role="status" style={STATUS_TXT}>
                        Clipboard unavailable in this browser — copy the seed from src/data/fluidVoiceVocabulary.ts instead.
                    </span>
                )}
            </div>

            <h4 style={H4}>Dwellium prompt (per-app AI enhancement)</h4>
            <p style={{ ...MUTED, margin: 0 }}>
                FluidVoice can &ldquo;assign different prompt sets to different apps&rdquo; (README, Per-App
                Configuration). In FluidVoice Settings → AI enhancement, add a prompt, set its routing to
                &ldquo;selected apps only&rdquo;, pick your browser, and paste this so dictation lands in
                Dwellium&rsquo;s tone and spelling:
            </p>
            <pre data-testid="dwellium-prompt" style={PROMPT_STYLE}>{DWELLIUM_DICTATION_PROMPT}</pre>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <button onClick={() => void copy(DWELLIUM_DICTATION_PROMPT, setPromptCopy)} style={BTN_STYLE}>
                    <ClipboardCopy size={14} aria-hidden /> Copy Dwellium prompt
                </button>
                {promptCopy === 'copied' && <span role="status" style={STATUS_TXT}>Prompt copied — paste it into FluidVoice Settings.</span>}
                {promptCopy === 'failed' && <span role="status" style={STATUS_TXT}>Clipboard unavailable — select the prompt text above and copy manually.</span>}
            </div>

            <h4 style={H4}><Keyboard size={13} aria-hidden /> Built-in dictation (any platform)</h4>
            <p style={{ ...MUTED, margin: 0 }}>
                No Mac, or nothing installed? Dwellium ships its own hotkey dictation: click into any text
                field and press <strong>{formatHotkey(hotkey)}</strong> — the browser&rsquo;s speech
                recognition types what you say into the focused field; press it again to stop.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={STATUS_TXT}>Hotkey: <strong data-testid="dictation-hotkey-label">{formatHotkey(hotkey)}</strong></span>
                <button onClick={() => setCapturing(true)} style={GHOST_BTN_STYLE}>Change hotkey</button>
                {!matchesHotkey({ ...DEFAULT_DICTATION_HOTKEY }, hotkey) && (
                    <button onClick={() => setDictationHotkey(DEFAULT_DICTATION_HOTKEY)} style={GHOST_BTN_STYLE}>Reset to ⌥D</button>
                )}
                {capturing && <span role="status" style={STATUS_TXT}>Press the new hotkey (must include ⌃, ⌥ or ⌘) — Esc to cancel.</span>}
            </div>
            <p role="status" style={{ ...STATUS_TXT, margin: '6px 0 0' }}>
                {speechSupported
                    ? 'Speech recognition is supported in this browser.'
                    : 'Speech recognition is not supported in this browser (try Chrome or Edge) — the hotkey will explain the same when pressed.'}
            </p>
        </section>
    );
}
