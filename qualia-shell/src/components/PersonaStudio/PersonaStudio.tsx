/**
 * PersonaStudio — Anam-lab-style conversational persona builder + live call
 * stage for Dwellium, shared by ARA (Aura) and Stella.
 *
 * Two-pane layout replicating the reference builder (lab.anam.ai, recorded
 * 2026-07-05): a left config rail with PROMPT / AVATAR / VOICE / LLM / TOOLS
 * tabs (system prompt, first greeting, skip-greeting + interruptible toggles,
 * director notes with style + expressivity + cues, knowledge) and a right
 * stage with the live persona frame ("Start call"), AVATAR/VOICE/LLM chips,
 * running transcript, and a type-to-talk input.
 *
 * Free stack: Web Speech STT + SpeechSynthesis TTS; brain = the per-user
 * integrations LLM (GPT-4.1-mini on OpenAI per product decision 2026-07-05).
 */
import { useEffect, useRef, useState } from 'react';
import './PersonaStudio.css';
import { usePersonaConfig } from './personaConfigStore';
import { usePersonaCall } from './usePersonaCall';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm } from '../../lib/llmClient';
import PersonaAvatarCanvas from './PersonaAvatarCanvas';
import PersonaFace from './PersonaFace';
import { VISUALIZER_THEMES, type VisualizerThemeId } from '../ARAConsole/voiceVisualizerThemes';
import {
    DEFAULT_PERSONA_SYSTEM_PROMPT,
    PERSONA_STYLE_OPTIONS,
    PERSONA_VOICE_CATALOG,
    getVoiceOption,
    type PersonaStyle,
    type PersonaVoiceOption,
} from './personaEngine';
import { ensureKokoro, getKokoroStatus, subscribeKokoro, synthesizeKokoro, type KokoroStatus } from './personaNeuralTts';
import { decodePersonaShare, encodePersonaShare, mergePersonaImport } from './personaShare';
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';
import type { LlmProvider } from '../../types/integrations';

type BuilderTab = 'prompt' | 'avatar' | 'voice' | 'llm' | 'tools';

const BUILDER_TABS: { id: BuilderTab; label: string }[] = [
    { id: 'prompt', label: 'Prompt' },
    { id: 'avatar', label: 'Avatar' },
    { id: 'voice', label: 'Voice' },
    { id: 'llm', label: 'LLM' },
    { id: 'tools', label: 'Tools' },
];

const PROVIDER_LABELS: Record<LlmProvider, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    gemini: 'Gemini',
    local: 'Local',
    custom: 'Custom',
};

/** Downscale an uploaded portrait to ≤640px and return a JPEG data-URL (localStorage-friendly). */
function downscalePortrait(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('decode failed'));
            img.onload = () => {
                const max = 640;
                const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.naturalWidth * scale);
                canvas.height = Math.round(img.naturalHeight * scale);
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('no 2d context')); return; }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });
}

type PlacementTarget = 'leftEye' | 'rightEye' | 'mouth' | null;

/** Knowledge is capped so the config stays localStorage-friendly. */
const KNOWLEDGE_CHAR_CAP = 20000;

/** ARA voice-clone service — same routes ARAConsole uses (list / upload). */
const ARA_VOICE_API = `${API_BASE}/api/ara/voice`;

/** Cloned-voice row as returned by GET /api/ara/voice/clones. */
interface ClonedVoice {
    id: string;
    path: string | null;
}

/** Bearer-token headers matching UserContext.authFetch (no Content-Type — the
 *  clone upload posts FormData, whose boundary the browser must set itself). */
function araAuthHeaders(): Record<string, string> {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Format elapsed whole seconds as a mm:ss call timer. */
function formatElapsed(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            className={`pstudio__toggle ${on ? 'pstudio__toggle--on' : ''}`}
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={() => onChange(!on)}
        >
            <span className="pstudio__toggle-knob" />
        </button>
    );
}

export interface PersonaStudioProps {
    host: 'ara' | 'stella';
}

export default function PersonaStudio({ host }: PersonaStudioProps) {
    const { config, patch } = usePersonaConfig();
    const { integrations } = useIntegrations();
    const call = usePersonaCall(config, host);
    const [tab, setTab] = useState<BuilderTab>('prompt');
    const [draft, setDraft] = useState('');
    const [placing, setPlacing] = useState<PlacementTarget>(null);
    const transcriptEndRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const knowledgeFileRef = useRef<HTMLInputElement | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const genErrorTimerRef = useRef<number | null>(null);

    // Generate-prompt bar (Anam-parity)
    const [genDesc, setGenDesc] = useState('');
    const [genPending, setGenPending] = useState(false);
    const [genError, setGenError] = useState<string | null>(null);

    // Knowledge document upload
    const [knowledgeTrimmed, setKnowledgeTrimmed] = useState(false);

    // Custom-tool add form (Tools tab)
    const [ctName, setCtName] = useState('');
    const [ctDesc, setCtDesc] = useState('');
    const [ctUrl, setCtUrl] = useState('');
    const [ctMethod, setCtMethod] = useState<'GET' | 'POST'>('GET');

    // Live-call timer (whole seconds since call start; shown as mm:ss)
    const [callElapsed, setCallElapsed] = useState(0);

    // On-device neural TTS (Kokoro) status line under the voice list.
    const [kokoroStatus, setKokoroStatus] = useState<KokoroStatus>('idle');
    const [kokoroProgress, setKokoroProgress] = useState(0);
    useEffect(() => {
        setKokoroStatus(getKokoroStatus());
        return subscribeKokoro((status, progress) => {
            setKokoroStatus(status);
            setKokoroProgress(progress);
        });
    }, []);

    // Cloned voices (backend ARA voice service) — fetched when the Voice tab opens.
    const [cloneVoices, setCloneVoices] = useState<ClonedVoice[]>([]);
    const [cloneServiceOk, setCloneServiceOk] = useState<boolean | null>(null);
    const [cloneUploading, setCloneUploading] = useState(false);
    const cloneFileRef = useRef<HTMLInputElement | null>(null);

    // Export / import / share footer (B-11).
    const [importOpen, setImportOpen] = useState(false);
    const [shareCodeDraft, setShareCodeDraft] = useState('');
    const [shareNotice, setShareNotice] = useState<string | null>(null);
    const shareNoticeTimerRef = useRef<number | null>(null);
    const importFileRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (tab !== 'voice') return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${ARA_VOICE_API}/clones`, { headers: araAuthHeaders() });
                if (!res.ok) throw new Error(`clones fetch failed: ${res.status}`);
                const data = await res.json();
                if (cancelled) return;
                setCloneVoices(data?.success && Array.isArray(data.data) ? data.data : []);
                setCloneServiceOk(true);
            } catch {
                if (cancelled) return;
                setCloneVoices([]);
                setCloneServiceOk(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tab]);

    /** Upload a voice sample exactly like ARAConsole.handleVoiceUpload (FormData: audio + voice_id). */
    const handleCloneUpload = async (file: File | undefined) => {
        if (!file || cloneUploading) return;
        const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
        setCloneUploading(true);
        try {
            const formData = new FormData();
            formData.append('audio', file, file.name);
            formData.append('voice_id', name);
            const res = await fetch(`${ARA_VOICE_API}/clone`, {
                method: 'POST',
                headers: araAuthHeaders(),
                body: formData,
            });
            if (!res.ok) throw new Error(`clone upload failed: ${res.status}`);
            const data = await res.json();
            if (!data?.success) throw new Error('clone upload rejected');
            // Refresh the list so the new clone shows up immediately.
            const listRes = await fetch(`${ARA_VOICE_API}/clones`, { headers: araAuthHeaders() });
            const listData = await listRes.json();
            if (listData?.success && Array.isArray(listData.data)) setCloneVoices(listData.data);
        } catch {
            setCloneServiceOk(false);
        } finally {
            setCloneUploading(false);
        }
    };

    /** Surface a transient confirmation line in the share footer. */
    const showShareNotice = (msg: string) => {
        setShareNotice(msg);
        if (shareNoticeTimerRef.current !== null) window.clearTimeout(shareNoticeTimerRef.current);
        shareNoticeTimerRef.current = window.setTimeout(() => setShareNotice(null), 5000);
    };

    /** Export the current config as a pretty-JSON download (feature-detected). */
    const handleExport = () => {
        try {
            if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function') {
                showShareNotice('Export unavailable in this browser.');
                return;
            }
            const anchor = document.createElement('a');
            if (!('download' in anchor)) {
                showShareNotice('Export unavailable in this browser.');
                return;
            }
            const safeName = (config.name || 'persona').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
            const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }));
            anchor.href = url;
            anchor.download = `persona-${safeName}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            showShareNotice(`Persona "${config.name}" exported.`);
        } catch {
            showShareNotice('Export failed.');
        }
    };

    /** Shared landing point for both import paths (file + pasted share code). */
    const applyImportedPersona = (merged: ReturnType<typeof mergePersonaImport>) => {
        if (!merged) {
            showShareNotice('Import failed — not a valid persona file or share code.');
            return;
        }
        patch(merged);
        setImportOpen(false);
        setShareCodeDraft('');
        showShareNotice(`Persona "${merged.name}" imported.`);
    };

    const handleImportFile = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onerror = () => showShareNotice('Import failed — could not read the file.');
        reader.onload = () => {
            try {
                applyImportedPersona(mergePersonaImport(JSON.parse(String(reader.result ?? ''))));
            } catch {
                showShareNotice('Import failed — not a valid persona file or share code.');
            }
        };
        reader.readAsText(file);
    };

    const handlePasteImport = () => {
        const code = shareCodeDraft.trim();
        if (!code) return;
        applyImportedPersona(decodePersonaShare(code));
    };

    /** Copy the base64 share code to the clipboard (feature-detected). */
    const handleCopyShare = async () => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            showShareNotice('Clipboard unavailable in this browser.');
            return;
        }
        try {
            await navigator.clipboard.writeText(encodePersonaShare(config));
            showShareNotice('Share code copied — paste it in Import.');
        } catch {
            showShareNotice('Clipboard write failed.');
        }
    };

    const handlePortraitUpload = async (file: File | undefined) => {
        if (!file) return;
        try {
            const dataUrl = await downscalePortrait(file);
            patch({ faceImage: dataUrl, avatarMode: 'photo' });
        } catch {
            /* unreadable image — leave config unchanged */
        }
    };

    const handlePlacementClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!placing) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        if (placing === 'mouth') {
            patch({ faceRegions: { ...config.faceRegions, mouth: { ...config.faceRegions.mouth, x, y } } });
        } else {
            patch({ faceRegions: { ...config.faceRegions, [placing]: { x, y } } });
        }
        setPlacing(null);
    };

    /** Surface a transient error line under the generate bar. */
    const showGenError = (msg: string) => {
        setGenError(msg);
        if (genErrorTimerRef.current !== null) window.clearTimeout(genErrorTimerRef.current);
        genErrorTimerRef.current = window.setTimeout(() => setGenError(null), 5000);
    };

    /** Generate-prompt bar: describe the persona → LLM writes the system prompt. */
    const handleGenerate = async () => {
        const desc = genDesc.trim();
        if (!desc || genPending || !call.llmReady) return;
        setGenPending(true);
        setGenError(null);
        try {
            const res = await callLlm({
                prompt: 'Write a system prompt for a real-time spoken voice assistant persona based on this description: "' + desc + '". Reply with ONLY the system prompt text, 2-4 sentences, written in second person ("You are…"). No headers, no quotes.',
                maxTokens: 300,
                temperature: 0.7,
            }, integrations.llm);
            if (res?.text) {
                patch({ systemPrompt: res.text.trim(), useDefaultPrompt: false });
                setGenDesc('');
                setTab('prompt');
            } else {
                showGenError('No LLM configured — add an API key in Settings → API Keys.');
            }
        } catch {
            showGenError('Prompt generation failed — check your API key and try again.');
        } finally {
            setGenPending(false);
        }
    };

    /** Stop any in-flight voice preview (browser TTS or OpenAI audio). */
    const stopPreview = () => {
        try {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        } catch { /* speechSynthesis unavailable */ }
        if (previewAudioRef.current) {
            try { previewAudioRef.current.pause(); } catch { /* already stopped */ }
            previewAudioRef.current = null;
        }
    };

    /** Speak the sample line through a browser voice — shared preview fallback. */
    const previewViaBrowser = (sample: string, matches?: string[]) => {
        try {
            if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
            const utterance = new SpeechSynthesisUtterance(sample);
            utterance.rate = config.speechRate;
            const voices = window.speechSynthesis.getVoices();
            for (const name of matches ?? []) {
                const match = voices.find(voice => voice.name === name);
                if (match) { utterance.voice = match; break; }
            }
            window.speechSynthesis.speak(utterance);
        } catch { /* preview is best-effort */ }
    };

    /** Play a short sample line in the given catalog voice. Feature-detected; never throws. */
    const previewVoice = async (v: PersonaVoiceOption) => {
        const sample = `Hi, I'm ${config.name}. This is how I sound.`;
        stopPreview();
        if (v.provider === 'browser') {
            previewViaBrowser(sample, v.browserVoiceMatch);
            return;
        }
        if (v.provider === 'kokoro') {
            void ensureKokoro();                    // kick off (or reuse) the model download
            const blob = v.kokoroVoice ? await synthesizeKokoro(sample, v.kokoroVoice, config.speechRate) : null;
            if (blob) {
                try {
                    const audio = new Audio(URL.createObjectURL(blob));
                    previewAudioRef.current = audio;
                    await audio.play().catch(() => { /* autoplay blocked */ });
                } catch { /* preview is best-effort */ }
            } else {
                // Model still downloading (or failed) — a browser voice stands
                // in so the button always does something.
                previewViaBrowser(sample);
            }
            return;
        }
        const apiKey = integrations.llm.openai?.apiKey;
        if (!apiKey || !v.openaiVoice) return;
        try {
            const res = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({ model: 'tts-1', voice: v.openaiVoice, input: sample }),
            });
            if (!res.ok) return;
            const blob = await res.blob();
            const audio = new Audio(URL.createObjectURL(blob));
            previewAudioRef.current = audio;
            await audio.play().catch(() => { /* autoplay blocked */ });
        } catch { /* preview is best-effort */ }
    };

    /** Read uploaded text documents and append them to the knowledge field (capped). */
    const handleKnowledgeFiles = async (fileList: FileList | null) => {
        const files = fileList ? Array.from(fileList) : [];
        if (files.length === 0) return;
        let knowledge = config.knowledge;
        for (const file of files) {
            const content = await new Promise<string>(resolve => {
                const reader = new FileReader();
                reader.onerror = () => resolve('');
                reader.onload = () => resolve(String(reader.result ?? ''));
                reader.readAsText(file);
            });
            if (content) knowledge += `\n\n--- ${file.name} ---\n${content}`;
        }
        const capped = knowledge.length > KNOWLEDGE_CHAR_CAP;
        if (capped) knowledge = knowledge.slice(0, KNOWLEDGE_CHAR_CAP);
        setKnowledgeTrimmed(capped);
        patch({ knowledge });
    };

    const ctUrlValid = ctUrl.startsWith('http://') || ctUrl.startsWith('https://');

    /** Append the drafted custom tool to the config and clear the form. */
    const addCustomTool = () => {
        if (!ctName || !ctUrlValid) return;
        patch({
            customTools: [
                ...config.customTools,
                { id: `ct-${Date.now()}`, name: ctName, description: ctDesc, method: ctMethod, url: ctUrl },
            ],
        });
        setCtName('');
        setCtDesc('');
        setCtUrl('');
        setCtMethod('GET');
    };

    /** Toggle fullscreen on the stage frame. Feature-detected; never throws. */
    const toggleFullscreen = () => {
        try {
            if (document.fullscreenElement) {
                void document.exitFullscreen?.();
            } else {
                void frameRef.current?.requestFullscreen?.();
            }
        } catch { /* fullscreen unsupported */ }
    };

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [call.turns.length]);

    // Call timer: tick every second while live; reset on call end.
    useEffect(() => {
        if (call.callState !== 'live') {
            setCallElapsed(0);
            return;
        }
        const startedAt = Date.now();
        setCallElapsed(0);
        const id = window.setInterval(() => {
            setCallElapsed(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => window.clearInterval(id);
    }, [call.callState]);

    // Unmount cleanup: stop previews + pending transient-line timers.
    useEffect(() => () => {
        stopPreview();
        if (genErrorTimerRef.current !== null) window.clearTimeout(genErrorTimerRef.current);
        if (shareNoticeTimerRef.current !== null) window.clearTimeout(shareNoticeTimerRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const live = call.callState === 'live';
    const activeProvider = integrations.llm.active;
    const voiceOption = getVoiceOption(config.voiceId);
    const openaiKeyPresent = !!integrations.llm.openai?.apiKey;

    const submitDraft = () => {
        const text = draft.trim();
        if (!text || !live) return;
        setDraft('');
        call.sendText(text);
    };

    const llmChip = activeProvider === 'openai'
        ? (config.modelOverride || integrations.llm.openai?.model || 'gpt-4.1-mini')
        : activeProvider
            ? PROVIDER_LABELS[activeProvider]
            : 'Not configured';

    return (
        <div className="pstudio">
            {/* ── Builder rail ─────────────────────────────────────── */}
            <aside className="pstudio__builder">
                <div className="pstudio__genbar">
                    <input
                        className="pstudio__input"
                        placeholder="A friendly leasing agent for a property-management company…"
                        value={genDesc}
                        onChange={e => setGenDesc(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleGenerate(); }}
                        aria-label="Describe your persona"
                    />
                    <button
                        className="pstudio__gen-btn"
                        onClick={() => void handleGenerate()}
                        disabled={!genDesc.trim() || genPending || !call.llmReady}
                    >
                        {genPending ? 'Generating…' : 'Generate'}
                    </button>
                </div>
                {genError && <div className="pstudio__gen-error" role="alert">{genError}</div>}
                <div className="pstudio__tabs" role="tablist" aria-label="Persona configuration">
                    {BUILDER_TABS.map(t => (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={tab === t.id}
                            className={`pstudio__tab ${tab === t.id ? 'pstudio__tab--active' : ''}`}
                            onClick={() => setTab(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="pstudio__panel">
                    {tab === 'prompt' && (
                        <>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>01</span> System prompt</h4>
                                <textarea
                                    className="pstudio__textarea"
                                    rows={6}
                                    value={config.useDefaultPrompt ? DEFAULT_PERSONA_SYSTEM_PROMPT : config.systemPrompt}
                                    disabled={config.useDefaultPrompt}
                                    onChange={e => patch({ systemPrompt: e.target.value })}
                                    aria-label="System prompt"
                                />
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Default prompt</span>
                                    <Toggle
                                        on={config.useDefaultPrompt}
                                        onChange={v => patch({
                                            useDefaultPrompt: v,
                                            ...(v ? {} : { systemPrompt: config.systemPrompt || DEFAULT_PERSONA_SYSTEM_PROMPT }),
                                        })}
                                        label="Use default prompt"
                                    />
                                </div>
                            </section>

                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>02</span> First greeting</h4>
                                <textarea
                                    className="pstudio__textarea"
                                    rows={2}
                                    placeholder="Leave blank to let the persona generate its own greeting, or type the exact opening line you want it to say."
                                    value={config.greeting}
                                    onChange={e => patch({ greeting: e.target.value })}
                                    aria-label="First greeting"
                                />
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Skip greeting</span>
                                    <Toggle on={config.skipGreeting} onChange={v => patch({ skipGreeting: v })} label="Skip greeting" />
                                </div>
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Interruptible</span>
                                    <Toggle on={config.interruptible} onChange={v => patch({ interruptible: v })} label="Interruptible" />
                                </div>
                            </section>

                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>03</span> Director notes</h4>
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Style</span>
                                    <select
                                        className="pstudio__select"
                                        value={config.style}
                                        onChange={e => patch({ style: e.target.value as PersonaStyle })}
                                        aria-label="Performance style"
                                    >
                                        {PERSONA_STYLE_OPTIONS.map(s => (
                                            <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Expressivity</span>
                                    <input
                                        className="pstudio__slider"
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={Math.round(config.expressivity * 100)}
                                        onChange={e => patch({ expressivity: Number(e.target.value) / 100 })}
                                        aria-label="Expressivity"
                                    />
                                </div>
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Add cues</span>
                                    <Toggle on={config.addCues} onChange={v => patch({ addCues: v })} label="Add performance cues" />
                                </div>
                            </section>

                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>04</span> Knowledge</h4>
                                <textarea
                                    className="pstudio__textarea"
                                    rows={4}
                                    placeholder="Paste facts, policies, or property details the persona should treat as ground truth."
                                    value={config.knowledge}
                                    onChange={e => patch({ knowledge: e.target.value })}
                                    aria-label="Knowledge"
                                />
                                <input
                                    ref={knowledgeFileRef}
                                    type="file"
                                    multiple
                                    accept=".txt,.md,.csv,.json,text/plain"
                                    style={{ display: 'none' }}
                                    onChange={e => { void handleKnowledgeFiles(e.target.files); e.target.value = ''; }}
                                    aria-label="Upload knowledge documents"
                                />
                                <button className="pstudio__upload-btn" onClick={() => knowledgeFileRef.current?.click()}>
                                    ⬆ Upload documents
                                </button>
                                {knowledgeTrimmed && (
                                    <p className="pstudio__hint">Knowledge trimmed to 20k characters.</p>
                                )}
                            </section>
                        </>
                    )}

                    {tab === 'avatar' && (
                        <>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>01</span> Persona name</h4>
                                <input
                                    className="pstudio__input"
                                    value={config.name}
                                    onChange={e => patch({ name: e.target.value })}
                                    aria-label="Persona name"
                                />
                            </section>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>02</span> Photo avatar (your face)</h4>
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Use photo avatar</span>
                                    <Toggle
                                        on={config.avatarMode === 'photo'}
                                        onChange={v => patch({ avatarMode: v ? 'photo' : 'viz' })}
                                        label="Use photo avatar"
                                    />
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={e => handlePortraitUpload(e.target.files?.[0])}
                                    aria-label="Upload portrait"
                                />
                                <button className="pstudio__upload-btn" onClick={() => fileInputRef.current?.click()}>
                                    {config.faceImage ? 'Replace portrait…' : '⬆ Upload portrait…'}
                                </button>
                                {config.faceImage && (
                                    <>
                                        <div
                                            className={`pstudio__place-wrap ${placing ? 'pstudio__place-wrap--placing' : ''}`}
                                            onClick={handlePlacementClick}
                                            role="img"
                                            aria-label="Portrait with eye and mouth markers"
                                        >
                                            <img src={config.faceImage} alt="" className="pstudio__place-img" />
                                            <span className="pstudio__marker pstudio__marker--eye" style={{ left: `${config.faceRegions.leftEye.x * 100}%`, top: `${config.faceRegions.leftEye.y * 100}%` }} />
                                            <span className="pstudio__marker pstudio__marker--eye" style={{ left: `${config.faceRegions.rightEye.x * 100}%`, top: `${config.faceRegions.rightEye.y * 100}%` }} />
                                            <span
                                                className="pstudio__marker pstudio__marker--mouth"
                                                style={{
                                                    left: `${(config.faceRegions.mouth.x - config.faceRegions.mouth.w) * 100}%`,
                                                    top: `${(config.faceRegions.mouth.y - config.faceRegions.mouth.h) * 100}%`,
                                                    width: `${config.faceRegions.mouth.w * 2 * 100}%`,
                                                    height: `${config.faceRegions.mouth.h * 2 * 100}%`,
                                                }}
                                            />
                                        </div>
                                        <div className="pstudio__place-btns">
                                            {([['leftEye', 'Left eye'], ['rightEye', 'Right eye'], ['mouth', 'Mouth']] as const).map(([key, label]) => (
                                                <button
                                                    key={key}
                                                    className={`pstudio__place-btn ${placing === key ? 'pstudio__place-btn--active' : ''}`}
                                                    onClick={() => setPlacing(placing === key ? null : key)}
                                                >
                                                    {placing === key ? `Click photo…` : `Set ${label.toLowerCase()}`}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="pstudio__row">
                                            <span className="pstudio__row-label">Mouth width</span>
                                            <input
                                                className="pstudio__slider" type="range" min={4} max={20}
                                                value={Math.round(config.faceRegions.mouth.w * 100)}
                                                onChange={e => patch({ faceRegions: { ...config.faceRegions, mouth: { ...config.faceRegions.mouth, w: Number(e.target.value) / 100 } } })}
                                                aria-label="Mouth width"
                                            />
                                        </div>
                                        <div className="pstudio__row">
                                            <span className="pstudio__row-label">Mouth height</span>
                                            <input
                                                className="pstudio__slider" type="range" min={2} max={10}
                                                value={Math.round(config.faceRegions.mouth.h * 100)}
                                                onChange={e => patch({ faceRegions: { ...config.faceRegions, mouth: { ...config.faceRegions.mouth, h: Number(e.target.value) / 100 } } })}
                                                aria-label="Mouth height"
                                            />
                                        </div>
                                    </>
                                )}
                                <p className="pstudio__hint">
                                    Upload a portrait you own, mark the eyes and mouth once, and it lip-syncs
                                    with blinks and head motion — all in-browser, no external service.
                                </p>
                            </section>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>03</span> Live visual (no photo)</h4>
                                <div className="pstudio__avatar-grid">
                                    {VISUALIZER_THEMES.map(t => (
                                        <button
                                            key={t.id}
                                            className={`pstudio__avatar-card ${config.avatarThemeId === t.id ? 'pstudio__avatar-card--active' : ''}`}
                                            onClick={() => patch({ avatarThemeId: t.id })}
                                            title={t.description}
                                            aria-pressed={config.avatarThemeId === t.id}
                                        >
                                            <span className="pstudio__avatar-card-swatch" data-theme={t.id} />
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="pstudio__hint">
                                    Audio-reactive looks used when no photo avatar is enabled.
                                </p>
                            </section>
                        </>
                    )}

                    {tab === 'voice' && (
                        <>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>01</span> Select voice</h4>
                                <div className="pstudio__voice-list">
                                    {PERSONA_VOICE_CATALOG.map(v => {
                                        const locked = v.provider === 'openai' && !openaiKeyPresent;
                                        const active = config.voiceId === v.id;
                                        return (
                                            <div
                                                key={v.id}
                                                role="button"
                                                tabIndex={0}
                                                className={`pstudio__voice-row ${active ? 'pstudio__voice-row--active' : ''} ${locked ? 'pstudio__voice-row--locked' : ''}`}
                                                onClick={() => { if (!locked) patch({ voiceId: v.id }); }}
                                                onKeyDown={e => {
                                                    if (locked) return;
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        patch({ voiceId: v.id });
                                                    }
                                                }}
                                                aria-pressed={active}
                                                aria-disabled={locked || undefined}
                                                title={locked ? 'Add an OpenAI key in Settings → API Keys to unlock' : v.description}
                                            >
                                                <span className="pstudio__voice-name">{v.label}</span>
                                                <span className="pstudio__voice-desc">{v.description}{locked ? ' — needs OpenAI key' : ''}</span>
                                                <button
                                                    className="pstudio__voice-preview"
                                                    onClick={e => { e.stopPropagation(); void previewVoice(v); }}
                                                    disabled={locked}
                                                    aria-label={`Preview ${v.label} voice`}
                                                >
                                                    ▶
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                {voiceOption.provider === 'kokoro' && (
                                    <p
                                        className={`pstudio__kokoro-status ${kokoroStatus === 'ready' ? 'pstudio__kokoro-status--ready' : ''}`}
                                        role="status"
                                    >
                                        {kokoroStatus === 'loading'
                                            ? `Downloading neural voice model… ${Math.round(kokoroProgress * 100)}%`
                                            : kokoroStatus === 'ready'
                                                ? 'Neural model ready — runs on this device.'
                                                : kokoroStatus === 'error' || kokoroStatus === 'unsupported'
                                                    ? 'Neural model failed to load — using browser voice fallback.'
                                                    : '~90 MB one-time download starts on first use.'}
                                    </p>
                                )}
                            </section>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>02</span> Cloned voices (backend)</h4>
                                {cloneServiceOk === false ? (
                                    <p className="pstudio__hint pstudio__clone-offline">
                                        ARA voice service offline — cloning unavailable.
                                    </p>
                                ) : cloneServiceOk === null ? (
                                    <p className="pstudio__hint">Checking ARA voice service…</p>
                                ) : (
                                    <>
                                        <div className="pstudio__voice-list">
                                            {cloneVoices.filter(v => v.id !== 'default').map(v => (
                                                <div key={v.id} className="pstudio__voice-row pstudio__clone-row">
                                                    <span className="pstudio__voice-name">{v.id}</span>
                                                    <span className="pstudio__voice-desc">Cloned voice — uploaded sample</span>
                                                </div>
                                            ))}
                                            {cloneVoices.filter(v => v.id !== 'default').length === 0 && (
                                                <p className="pstudio__hint">No cloned voices yet — upload a short WAV sample.</p>
                                            )}
                                        </div>
                                        <input
                                            ref={cloneFileRef}
                                            type="file"
                                            accept="audio/wav,audio/wave,.wav"
                                            style={{ display: 'none' }}
                                            onChange={e => { void handleCloneUpload(e.target.files?.[0]); e.target.value = ''; }}
                                            aria-label="Upload voice sample WAV"
                                        />
                                        <button
                                            className="pstudio__upload-btn"
                                            onClick={() => cloneFileRef.current?.click()}
                                            disabled={cloneUploading}
                                        >
                                            {cloneUploading ? 'Uploading…' : '⬆ Upload 10s WAV…'}
                                        </button>
                                        <p className="pstudio__hint">Cloned voices play through the ARA console for now.</p>
                                    </>
                                )}
                            </section>
                            <section className="pstudio__section">
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Speed</span>
                                    <input
                                        className="pstudio__slider"
                                        type="range"
                                        min={50}
                                        max={200}
                                        value={Math.round(config.speechRate * 100)}
                                        onChange={e => patch({ speechRate: Number(e.target.value) / 100 })}
                                        aria-label="Speech speed"
                                    />
                                    <span className="pstudio__row-value">{config.speechRate.toFixed(2)}×</span>
                                </div>
                            </section>
                        </>
                    )}

                    {tab === 'llm' && (
                        <>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>01</span> Brain</h4>
                                <div className="pstudio__provider-list">
                                    {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map(p => {
                                        const cfg: any = (integrations.llm as any)[p];
                                        const configured = p === 'local' ? !!cfg?.baseUrl : !!cfg?.apiKey;
                                        return (
                                            <div key={p} className={`pstudio__provider-row ${activeProvider === p ? 'pstudio__provider-row--active' : ''}`}>
                                                <span className="pstudio__voice-name">{PROVIDER_LABELS[p]}</span>
                                                <span className="pstudio__voice-desc">
                                                    {activeProvider === p ? 'Active' : configured ? 'Configured' : 'Not configured'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="pstudio__hint">
                                    The persona thinks with your active provider from Settings → API Keys.
                                </p>
                                <div className="pstudio__row">
                                    <span className="pstudio__row-label">Disable LLM</span>
                                    <Toggle
                                        on={config.llmDisabled}
                                        onChange={v => patch({ llmDisabled: v })}
                                        label="Disable LLM"
                                    />
                                </div>
                                <p className="pstudio__hint">
                                    When off, the persona replies with a fixed line instead of thinking.
                                </p>
                            </section>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>02</span> OpenAI model</h4>
                                <input
                                    className="pstudio__input"
                                    value={config.modelOverride}
                                    placeholder="gpt-4.1-mini"
                                    onChange={e => patch({ modelOverride: e.target.value })}
                                    aria-label="OpenAI model override"
                                />
                                <p className="pstudio__hint">Applied when OpenAI is the active provider. Default: gpt-4.1-mini.</p>
                            </section>
                        </>
                    )}

                    {tab === 'tools' && (
                        <>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>01</span> Select tools</h4>
                                {([
                                    ['endCall', 'end_call', 'Allows the user to ask the persona to end the call.'],
                                    ['skipTurn', 'skip_turn', 'Allows the user to request more time; the persona waits quietly.'],
                                    ['changeLanguage', 'change_language', 'Allows the user to switch the conversation language.'],
                                    ['openWidget', 'open_widget', 'Lets the persona open any Dwellium widget (Inbox, Files, Stella, ARA…).'],
                                    ['hermes', 'hermes', 'Lets the persona delegate multi-step tasks to the Hermes agent.'],
                                ] as const).map(([key, label, desc]) => (
                                    <div key={key} className="pstudio__tool-row">
                                        <div>
                                            <span className="pstudio__voice-name">{label}</span>
                                            <span className="pstudio__voice-desc">{desc}</span>
                                        </div>
                                        <Toggle
                                            on={config.tools[key]}
                                            onChange={v => patch({ tools: { ...config.tools, [key]: v } })}
                                            label={`Enable ${label}`}
                                        />
                                    </div>
                                ))}
                            </section>
                            <section className="pstudio__section">
                                <h4 className="pstudio__section-title"><span>02</span> Custom tools</h4>
                                {config.customTools.map(t => (
                                    <div key={t.id} className="pstudio__ct-row">
                                        <div className="pstudio__ct-info">
                                            <span className="pstudio__voice-name">{t.name}</span>
                                            <span className="pstudio__voice-desc">{t.description}</span>
                                            <span className="pstudio__ct-url">{t.method} {t.url}</span>
                                        </div>
                                        <button
                                            className="pstudio__ct-delete"
                                            onClick={() => patch({ customTools: config.customTools.filter(x => x.id !== t.id) })}
                                            aria-label={`Delete ${t.name}`}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                                <div className="pstudio__ct-form">
                                    <input
                                        className="pstudio__input"
                                        placeholder="tool_name"
                                        value={ctName}
                                        onChange={e => setCtName(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                                        aria-label="Custom tool name"
                                    />
                                    <input
                                        className="pstudio__input"
                                        placeholder="What does this tool do?"
                                        value={ctDesc}
                                        onChange={e => setCtDesc(e.target.value)}
                                        aria-label="Custom tool description"
                                    />
                                    <div className="pstudio__ct-form-row">
                                        <select
                                            className="pstudio__select"
                                            value={ctMethod}
                                            onChange={e => setCtMethod(e.target.value as 'GET' | 'POST')}
                                            aria-label="Custom tool method"
                                        >
                                            <option value="GET">GET</option>
                                            <option value="POST">POST</option>
                                        </select>
                                        <input
                                            className="pstudio__input"
                                            placeholder="https://api.example.com/endpoint"
                                            value={ctUrl}
                                            onChange={e => setCtUrl(e.target.value)}
                                            aria-label="Custom tool URL"
                                        />
                                    </div>
                                    <button
                                        className="pstudio__ct-add-btn"
                                        onClick={addCustomTool}
                                        disabled={!ctName || !ctUrlValid}
                                    >
                                        Add tool
                                    </button>
                                </div>
                                <p className="pstudio__hint">
                                    Custom tools join the same TOOL protocol as the built-ins — the persona
                                    supplies free-form JSON args and the call hits your endpoint.
                                </p>
                            </section>
                        </>
                    )}
                </div>

                {/* Export / import / share footer (B-11) */}
                <div className="pstudio__share-row">
                    <button className="pstudio__share-btn" onClick={handleExport}>Export</button>
                    <button
                        className={`pstudio__share-btn ${importOpen ? 'pstudio__share-btn--active' : ''}`}
                        onClick={() => setImportOpen(o => !o)}
                        aria-expanded={importOpen}
                    >
                        Import
                    </button>
                    <button className="pstudio__share-btn" onClick={() => void handleCopyShare()}>Copy share code</button>
                </div>
                {importOpen && (
                    <div className="pstudio__share-import">
                        <input
                            ref={importFileRef}
                            type="file"
                            accept=".json,application/json"
                            style={{ display: 'none' }}
                            onChange={e => { handleImportFile(e.target.files?.[0]); e.target.value = ''; }}
                            aria-label="Import persona JSON file"
                        />
                        <button className="pstudio__share-btn" onClick={() => importFileRef.current?.click()}>
                            Choose file…
                        </button>
                        <input
                            className="pstudio__input pstudio__share-paste"
                            placeholder="paste share code"
                            value={shareCodeDraft}
                            onChange={e => setShareCodeDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handlePasteImport(); }}
                            aria-label="Paste share code"
                        />
                        <button className="pstudio__share-btn" onClick={handlePasteImport} disabled={!shareCodeDraft.trim()}>
                            Apply
                        </button>
                    </div>
                )}
                {shareNotice && <div className="pstudio__share-notice" role="status">{shareNotice}</div>}
            </aside>

            {/* ── Stage ────────────────────────────────────────────── */}
            <main className="pstudio__stage">
                <div ref={frameRef} className={`pstudio__frame ${live ? 'pstudio__frame--live' : ''}`}>
                    {config.avatarMode === 'photo' && config.faceImage ? (
                        <PersonaFace
                            imageUrl={config.faceImage}
                            regions={config.faceRegions}
                            speaking={call.speaking}
                            live={live}
                            speechRef={call.speechRef}
                            listenRef={call.listenRef}
                        />
                    ) : (
                        <PersonaAvatarCanvas
                            themeId={config.avatarThemeId as VisualizerThemeId}
                            speaking={call.speaking}
                            live={live}
                            audioRef={call.audioRef}
                        />
                    )}
                    {!live && !(config.avatarMode === 'photo' && config.faceImage) && (
                        <div className="pstudio__frame-idle">
                            <span className="pstudio__frame-initial">{(config.name || 'L').slice(0, 1).toUpperCase()}</span>
                            <span className="pstudio__frame-name">{config.name}</span>
                        </div>
                    )}
                    {live && (
                        <div className="pstudio__frame-status">
                            {`${call.thinking ? 'Thinking…' : call.speaking ? 'Speaking' : call.listening ? 'Listening' : 'Connected'} · ${formatElapsed(callElapsed)}`}
                        </div>
                    )}
                    <button
                        className="pstudio__fullscreen-btn"
                        onClick={toggleFullscreen}
                        aria-label="Toggle fullscreen"
                    >
                        ⛶
                    </button>
                    <button
                        className={`pstudio__call-btn ${live ? 'pstudio__call-btn--stop' : ''}`}
                        onClick={live ? call.endCall : call.startCall}
                    >
                        {live ? '■ Stop' : '📞 Start call'}
                    </button>
                </div>

                <div className="pstudio__chips">
                    <div className="pstudio__chip"><span>Avatar</span>{VISUALIZER_THEMES.find(t => t.id === config.avatarThemeId)?.label ?? config.avatarThemeId}</div>
                    <div className="pstudio__chip"><span>Voice</span>{voiceOption.label}</div>
                    <div className="pstudio__chip"><span>LLM</span>{llmChip}</div>
                </div>

                {!call.llmReady && (
                    <div className="pstudio__banner">
                        No LLM configured — add an API key in Settings → API Keys (OpenAI recommended: gpt-4.1-mini) so {config.name} can think.
                    </div>
                )}
                {call.sttEngine === 'whisper' && (
                    <div className="pstudio__banner pstudio__banner--soft">
                        Using on-device Whisper for speech recognition (first use downloads ~40 MB).
                    </div>
                )}
                {call.sttEngine === 'none' && (
                    <div className="pstudio__banner pstudio__banner--soft">
                        This browser has no speech recognition — {config.name} will still talk; reply by typing below.
                    </div>
                )}

                <div className="pstudio__transcript" aria-live="polite">
                    {call.turns.map(turn => {
                        if (turn.role === 'event') {
                            return turn.toolBadge ? (
                                <div key={turn.id} className="pstudio__tool-chip">🔧 {turn.toolBadge}</div>
                            ) : (
                                <div key={turn.id} className="pstudio__event">{turn.text}</div>
                            );
                        }
                        return (
                            <div key={turn.id} className={`pstudio__bubble pstudio__bubble--${turn.role}`}>
                                {turn.text}
                            </div>
                        );
                    })}
                    <div ref={transcriptEndRef} />
                </div>

                <div className="pstudio__inputbar">
                    <input
                        className="pstudio__input pstudio__input--chat"
                        placeholder={live ? 'Type your message…' : 'Start a call to talk'}
                        value={draft}
                        disabled={!live}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') submitDraft(); }}
                        aria-label="Message the persona"
                    />
                    <button
                        className="pstudio__send-btn"
                        onClick={submitDraft}
                        disabled={!live || !draft.trim()}
                        aria-label="Send message"
                    >
                        ↑
                    </button>
                </div>
            </main>
        </div>
    );
}
