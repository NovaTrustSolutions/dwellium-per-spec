import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser } from '../../context/UserContext';
import './ARAConsole.css';
import { API_BASE } from '../../config';

const API_ARA = `${API_BASE}/api/ara`;
const TRANSCRIBE_API = `${API_BASE}/api/transcribe`;

interface ARAMode {
    id: string;
    name: string;
    icon: string;
    shortDescription: string;
    lens: string;
    logic: string;
    voice: string;
    forbiddenBehavior: string;
    bestFor: string;
    entityGuardianRequired: boolean;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    mode?: string;
    entityGuardianActive?: boolean;
    timestamp: number;
}

/* ── Per-personality color themes ── */
const PERSONA_THEMES: Record<string, { accent: string; accentRgb: string; gradient: string; bgTint: string }> = {
    'chief-of-staff': {
        accent: '#3898ec',
        accentRgb: '56, 152, 236',
        gradient: 'linear-gradient(135deg, #3898ec 0%, #2563eb 100%)',
        bgTint: 'rgba(56, 152, 236, 0.04)',
    },
    'clinical-analyst': {
        accent: '#10b981',
        accentRgb: '16, 185, 129',
        gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        bgTint: 'rgba(16, 185, 129, 0.04)',
    },
    'lead-counsel': {
        accent: '#f59e0b',
        accentRgb: '245, 158, 11',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        bgTint: 'rgba(245, 158, 11, 0.04)',
    },
    'diplomat': {
        accent: '#8b5cf6',
        accentRgb: '139, 92, 246',
        gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        bgTint: 'rgba(139, 92, 246, 0.04)',
    },
    'devils-advocate': {
        accent: '#ef4444',
        accentRgb: '239, 68, 68',
        gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        bgTint: 'rgba(239, 68, 68, 0.04)',
    },
    'research-synthesizer': {
        accent: '#06b6d4',
        accentRgb: '6, 182, 212',
        gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
        bgTint: 'rgba(6, 182, 212, 0.04)',
    },
    'financial-strategist': {
        accent: '#22c55e',
        accentRgb: '34, 197, 94',
        gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        bgTint: 'rgba(34, 197, 94, 0.04)',
    },
    'creative-director': {
        accent: '#ec4899',
        accentRgb: '236, 72, 153',
        gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
        bgTint: 'rgba(236, 72, 153, 0.04)',
    },
};

const DEFAULT_THEME = {
    accent: '#3898ec',
    accentRgb: '56, 152, 236',
    gradient: 'linear-gradient(135deg, #3898ec 0%, #2563eb 100%)',
    bgTint: 'rgba(56, 152, 236, 0.04)',
};

export default function ARAConsole() {
    const { authFetch, isAuthenticated } = useUser();
    const [modes, setModes] = useState<ARAMode[]>([]);
    const [activeMode, setActiveMode] = useState<string>('chief-of-staff');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [modePickerOpen, setModePickerOpen] = useState(false);
    const [expandedTooltipId, setExpandedTooltipId] = useState<string | null>(null);
    const [jurisdiction, setJurisdiction] = useState<'georgia' | 'florida'>('georgia');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const sessionId = useRef(`session-${Date.now()}`);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Mic state
    const [micActive, setMicActive] = useState(false);
    const [micTranscribing, setMicTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);

    // Voice Settings state
    const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
    const [clonedVoices, setClonedVoices] = useState<Array<{ id: string; path: string | null }>>([
        { id: 'default', path: null }
    ]);
    const [activeVoice, setActiveVoice] = useState<string>(() => {
        try { return localStorage.getItem('dwellium-ara-voice') || 'female'; } catch { return 'female'; }
    });
    const [voiceGender, setVoiceGender] = useState<'female' | 'male'>(() => {
        try { return (localStorage.getItem('dwellium-ara-gender') as 'female' | 'male') || 'female'; } catch { return 'female'; }
    });
    const [voiceUploadName, setVoiceUploadName] = useState('');
    const [voiceUploading, setVoiceUploading] = useState(false);
    const [voiceUploadDrag, setVoiceUploadDrag] = useState(false);
    const [voiceStatus, setVoiceStatus] = useState<{ tts: { provider: string } } | null>(null);
    const voiceFileRef = useRef<HTMLInputElement>(null);

    // Avatar state (Anam AI)
    const AVATAR_PASSWORD = 'Comet2878!';
    // Persona ID is now configured server-side via ANAM_PERSONA_ID env var
    const [avatarEnabled, setAvatarEnabled] = useState<boolean>(() => {
        try { return localStorage.getItem('dwellium-ara-avatar') === 'true'; } catch { return false; }
    });
    const [avatarPasswordModal, setAvatarPasswordModal] = useState(false);
    const [avatarPasswordInput, setAvatarPasswordInput] = useState('');
    const [avatarPasswordError, setAvatarPasswordError] = useState(false);
    const [avatarStatus, setAvatarStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [avatarError, setAvatarError] = useState<string>('');
    const anamClientRef = useRef<any>(null);
    const avatarVideoRef = useRef<HTMLVideoElement>(null);

    const handleAvatarToggle = useCallback(() => {
        if (avatarEnabled) {
            // Turning off — no password needed, cleanup SDK
            if (anamClientRef.current) {
                try { anamClientRef.current.stopStreaming?.(); } catch { /* ignore */ }
                anamClientRef.current = null;
            }
            setAvatarEnabled(false);
            setAvatarStatus('idle');
            localStorage.setItem('dwellium-ara-avatar', 'false');
        } else {
            // Turning on — require password
            setAvatarPasswordModal(true);
            setAvatarPasswordInput('');
            setAvatarPasswordError(false);
        }
    }, [avatarEnabled]);

    const submitAvatarPassword = useCallback(() => {
        if (avatarPasswordInput === AVATAR_PASSWORD) {
            setAvatarEnabled(true);
            localStorage.setItem('dwellium-ara-avatar', 'true');
            setAvatarPasswordModal(false);
            setAvatarPasswordInput('');
            setAvatarPasswordError(false);
        } else {
            setAvatarPasswordError(true);
        }
    }, [avatarPasswordInput]);

    // Anam SDK initialization — API key flow via auth-protected backend
    useEffect(() => {
        if (!avatarEnabled) return;

        let cancelled = false;

        async function initAnamSdk() {
            setAvatarStatus('connecting');
            setAvatarError('');

            try {
                // Dynamically import the SDK (requires: npm install @anam-ai/js-sdk)
                const anamModule = await import('@anam-ai/js-sdk').catch(() => null);

                if (!anamModule || cancelled) {
                    if (!cancelled) {
                        setAvatarStatus('error');
                        setAvatarError('Anam SDK not installed. Run: npm install @anam-ai/js-sdk');
                    }
                    return;
                }

                const { createClient, AnamEvent } = anamModule;

                // Get session token from backend (backend calls Anam API with persona config)
                console.log('[ARA Avatar] Requesting session token from backend...');
                const tokenRes = await authFetch(`${API_ARA}/avatar/session-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                const tokenData = await tokenRes.json();

                if (!tokenData.success || !tokenData.data?.sessionToken) {
                    if (!cancelled) {
                        setAvatarStatus('error');
                        setAvatarError(tokenData.error || 'Failed to get session token from backend.');
                    }
                    return;
                }

                if (cancelled) return;

                const { sessionToken } = tokenData.data;
                console.log('[ARA Avatar] Session token obtained, creating client...');

                // Use createClient with the stateful session token from the backend.
                // The backend calls Anam API with personaConfig included, producing a
                // 'stateful' token. SDK v4.10.0 rejects 'legacy' tokens, so this is required.
                const client = createClient(sessionToken);

                if (cancelled) return;
                anamClientRef.current = client;

                // Listen for connection events
                client.addListener?.(AnamEvent?.CONNECTION_ESTABLISHED || 'CONNECTION_ESTABLISHED', () => {
                    if (!cancelled) setAvatarStatus('connected');
                    console.log('[ARA Avatar] Connection established');
                });

                client.addListener?.(AnamEvent?.CONNECTION_CLOSED || 'CONNECTION_CLOSED', () => {
                    if (!cancelled) setAvatarStatus('error');
                    console.log('[ARA Avatar] Connection closed');
                });

                // Stream to video element
                if (avatarVideoRef.current) {
                    await client.streamToVideoElement('ara-avatar-video');
                }

                if (!cancelled) setAvatarStatus('connected');
            } catch (err: any) {
                if (!cancelled) {
                    console.error('[ARA Avatar] SDK init failed:', err);
                    setAvatarStatus('error');
                    setAvatarError(err.message || 'Failed to connect to Anam AI');
                }
            }
        }

        initAnamSdk();

        return () => {
            cancelled = true;
            if (anamClientRef.current) {
                try { anamClientRef.current.stopStreaming?.(); } catch { /* ignore */ }
                anamClientRef.current = null;
            }
        };
    }, [avatarEnabled, authFetch]);


    // TTS state
    const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('dwellium-ara-tts');
            if (saved === null) return true; // Default to ON
            return saved === 'true';
        } catch { return true; }
    });
    const [isSpeaking, setIsSpeaking] = useState(false);

    const toggleTts = useCallback(() => {
        setTtsEnabled(prev => {
            const next = !prev;
            localStorage.setItem('dwellium-ara-tts', String(next));
            if (!next) {
                // Stop all audio playback
                if (currentAudioRef.current) {
                    currentAudioRef.current.pause();
                    currentAudioRef.current = null;
                }
                window.speechSynthesis.cancel();
                setIsSpeaking(false);
            }
            return next;
        });
    }, []);

    const muteAra = useCallback(() => {
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
        }
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }, []);

    // Strip markdown for clean spoken text
    const stripMarkdown = useCallback((text: string): string => {
        return text
            .replace(/\*\*(.+?)\*\*/g, '$1')       // bold
            .replace(/\*(.+?)\*/g, '$1')            // italic
            .replace(/_(.+?)_/g, '$1')              // italic underscore
            .replace(/`([^`]+)`/g, '$1')            // inline code
            .replace(/^#{1,6}\s+/gm, '')           // headings
            .replace(/^[-•]\s/gm, '')              // bullets
            .replace(/^\d+\.\s/gm, '')             // numbered lists
            .replace(/\[Error\]/g, 'Error')         // error prefix
            .replace(/\[Connection Error\]/g, 'Connection Error')
            .replace(/\n{2,}/g, '. ')               // double newlines to pauses
            .replace(/\n/g, '. ')                   // newlines to pauses
            .trim();
    }, []);

    const currentAudioRef = useRef<HTMLAudioElement | null>(null);

    const speakText = useCallback(async (text: string) => {
        // Stop any current playback
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
        }
        window.speechSynthesis.cancel();

        const cleaned = stripMarkdown(text);
        if (!cleaned) return;

        setIsSpeaking(true);

        try {
            // Try Chatterbox backend TTS first
            console.log('[ARA TTS] Requesting backend speech...');
            const res = await authFetch(`${API_ARA}/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleaned, voice: activeVoice }),
            });

            const ct = res.headers.get('content-type') || '';
            const provider = res.headers.get('x-audio-provider') || 'unknown';
            console.log(`[ARA TTS] Response: status=${res.status}, content-type=${ct}, provider=${provider}`);

            if (res.ok && ct.includes('audio')) {
                const blob = await res.blob();
                console.log(`[ARA TTS] ✅ Playing backend audio: ${blob.size} bytes, type=${blob.type}, provider=${provider}`);
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                currentAudioRef.current = audio;
                audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); currentAudioRef.current = null; };
                audio.onerror = (e) => {
                    console.error('[ARA TTS] ❌ Audio playback error:', e);
                    setIsSpeaking(false); URL.revokeObjectURL(url); currentAudioRef.current = null;
                };
                try {
                    await audio.play();
                    console.log('[ARA TTS] ▶️ Audio playing successfully');
                } catch (playErr) {
                    console.error('[ARA TTS] ❌ audio.play() rejected:', playErr);
                    // If audio play fails, don't fall through — the audio format is the issue
                    setIsSpeaking(false);
                    URL.revokeObjectURL(url);
                    currentAudioRef.current = null;
                }
                return;
            }

            console.warn(`[ARA TTS] Backend returned non-audio: status=${res.status}, ct=${ct}`);
        } catch (err) {
            console.error('[ARA TTS] ❌ Backend TTS fetch failed:', err);
        }

        // Fallback: browser SpeechSynthesis
        console.log('[ARA TTS] ⚠️ Falling back to browser SpeechSynthesis');
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes('Samantha')) ||
            voices.find(v => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    }, [stripMarkdown, authFetch, activeVoice]);

    const stopSpeaking = useCallback(() => {
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
        }
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }, []);

    // Fetch cloned voices and voice status
    const fetchVoices = useCallback(async () => {
        try {
            const [voicesRes, statusRes] = await Promise.all([
                authFetch(`${API_ARA}/voice/clones`),
                authFetch(`${API_ARA}/voice/status`),
            ]);
            const voicesData = await voicesRes.json();
            const statusData = await statusRes.json();
            if (voicesData.success) setClonedVoices(voicesData.data);
            if (statusData.success) setVoiceStatus(statusData.data);
        } catch { /* silently fail */ }
    }, [authFetch]);

    useEffect(() => { fetchVoices(); }, [fetchVoices]);

    const selectVoice = useCallback((voiceId: string) => {
        setActiveVoice(voiceId);
        localStorage.setItem('dwellium-ara-voice', voiceId);
    }, []);

    const handleVoiceUpload = useCallback(async (file: File) => {
        if (!file) return;
        const name = voiceUploadName.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
        setVoiceUploading(true);
        try {
            const formData = new FormData();
            formData.append('audio', file, file.name);
            formData.append('voice_id', name);
            const res = await authFetch(`${API_ARA}/voice/clone`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (data.success) {
                setVoiceUploadName('');
                await fetchVoices();
                selectVoice(data.data.voice_id);
            }
        } catch (err) {
            console.error('Voice upload failed:', err);
        } finally {
            setVoiceUploading(false);
        }
    }, [voiceUploadName, authFetch, fetchVoices, selectVoice]);

    const deleteVoice = useCallback(async (voiceId: string) => {
        try {
            await authFetch(`${API_ARA}/voice/clone/${voiceId}`, { method: 'DELETE' });
            if (activeVoice === voiceId) selectVoice('default');
            await fetchVoices();
        } catch { /* silently fail */ }
    }, [authFetch, activeVoice, selectVoice, fetchVoices]);

    // Get current theme
    const theme = useMemo(() => PERSONA_THEMES[activeMode] || DEFAULT_THEME, [activeMode]);

    // Fetch available modes (only when authenticated)
    useEffect(() => {
        if (!isAuthenticated) return;
        authFetch(`${API_ARA}/modes`)
            .then(r => {
                if (!r.ok) throw new Error(`Modes fetch failed: ${r.status}`);
                return r.json();
            })
            .then(data => {
                if (data.success) {
                    setModes(data.data);
                    console.log(`[ARA] Loaded ${data.data.length} personalities`);
                }
            })
            .catch(err => console.error('[ARA] Failed to fetch modes:', err));
    }, [authFetch, isAuthenticated]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        if (!modePickerOpen) return;
        const handleOutsideClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (
                dropdownRef.current && !dropdownRef.current.contains(target) &&
                triggerRef.current && !triggerRef.current.contains(target)
            ) {
                setModePickerOpen(false);
                setExpandedTooltipId(null);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [modePickerOpen]);

    const currentMode = modes.find(m => m.id === activeMode);

    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        const userMsg: ChatMessage = {
            role: 'user',
            content: text,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await authFetch(`${API_ARA}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: activeMode,
                    message: text,
                    sessionId: sessionId.current,
                    ...(activeMode === 'lead-counsel' ? { jurisdiction } : {})
                })
            });
            const data = await res.json();
            if (data.success) {
                const araMsg: ChatMessage = {
                    role: 'assistant',
                    content: data.data.content,
                    mode: data.data.mode,
                    entityGuardianActive: data.data.entityGuardianActive,
                    timestamp: Date.now()
                };
                setMessages(prev => [...prev, araMsg]);

                // ── Pipe ARA's response to live avatar if connected ──
                if (avatarEnabled && avatarStatus === 'connected' && anamClientRef.current) {
                    try {
                        const cleaned = stripMarkdown(data.data.content);
                        if (cleaned) {
                            console.log('[ARA Avatar] Sending ARA response to avatar via talk()');
                            await anamClientRef.current.talk(cleaned);
                        }
                    } catch (avatarErr) {
                        console.warn('[ARA Avatar] talk() failed, falling back to TTS:', avatarErr);
                        // Fallback to regular TTS if avatar talk fails
                        if (ttsEnabled) speakText(data.data.content);
                    }
                } else if (ttsEnabled) {
                    // No avatar — use regular TTS (Chatterbox or browser)
                    speakText(data.data.content);
                }
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `[Error] ${data.error}`,
                    timestamp: Date.now()
                }]);
            }
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `[Connection Error] Backend unreachable. Is the server running on port 3000?`,
                timestamp: Date.now()
            }]);
        }

        setIsLoading(false);
    }, [input, activeMode, isLoading, authFetch, jurisdiction, ttsEnabled, speakText, avatarEnabled, avatarStatus, stripMarkdown]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const switchMode = (modeId: string) => {
        setActiveMode(modeId);
        setModePickerOpen(false);
        setExpandedTooltipId(null);
        const mode = modes.find(m => m.id === modeId);
        if (mode) {
            const switchText = `Mode switched: ${mode.name}. ${mode.lens}`;
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `**Mode switched: ${mode.icon} ${mode.name}**\n\n_${mode.lens}_`,
                mode: modeId,
                entityGuardianActive: mode.entityGuardianRequired,
                timestamp: Date.now()
            }]);
            // Announce mode switch via avatar if connected
            if (avatarEnabled && avatarStatus === 'connected' && anamClientRef.current) {
                anamClientRef.current.talk(switchText).catch(() => { /* ignore */ });
            }
        }
    };

    const clearChat = () => {
        setMessages([]);
        authFetch(`${API_ARA}/session/${sessionId.current}`, { method: 'DELETE' }).catch(() => { });
        sessionId.current = `session-${Date.now()}`;
    };

    // ── Microphone Voice Input ──────────────────────
    const toggleMic = useCallback(async () => {
        if (micActive) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
            }
            setMicActive(false);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;

            const chunks: Blob[] = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
                if (chunks.length === 0) return;
                const blob = new Blob(chunks, { type: 'audio/webm' });
                setMicTranscribing(true);
                try {
                    const formData = new FormData();
                    formData.append('audio', blob, 'voice-input.webm');
                    formData.append('format', 'webm');
                    const res = await authFetch(TRANSCRIBE_API, {
                        method: 'POST',
                        body: formData
                    });
                    const json = await res.json();
                    if (json.success && json.data.fullText) {
                        setInput(prev => {
                            const spacer = prev.trim() ? ' ' : '';
                            return prev + spacer + json.data.fullText;
                        });
                        setTimeout(() => inputRef.current?.focus(), 100);
                    }
                } catch (err) {
                    console.error('Voice transcription failed:', err);
                } finally {
                    setMicTranscribing(false);
                }
            };

            mediaRecorder.start();
            setMicActive(true);
        } catch (err) {
            console.error('Microphone access denied:', err);
        }
    }, [micActive, authFetch]);

    // Cleanup mic + TTS on unmount
    useEffect(() => {
        return () => {
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
            }
            window.speechSynthesis.cancel();
        };
    }, []);

    // Simple markdown-ish rendering (bold, italic, code, line breaks)
    const escapeHtml = (value: string) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const renderContent = (text: string) => {
        const lines = text.split('\n');
        return lines.map((line, i) => {
            let processed = escapeHtml(line);
            processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
            processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>');
            processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
            if (processed.match(/^[-•]\s/)) {
                processed = `<span class="ara-bullet">•</span>${processed.slice(2)}`;
            }
            if (processed.match(/^\d+\.\s/)) {
                const num = processed.match(/^(\d+)\./)?.[1];
                processed = `<span class="ara-num">${num}.</span>${processed.replace(/^\d+\.\s/, '')}`;
            }
            if (processed.startsWith('### ')) {
                return <h5 key={i} className="ara-h3" dangerouslySetInnerHTML={{ __html: processed.slice(4) }} />;
            }
            if (processed.startsWith('## ')) {
                return <h4 key={i} className="ara-h2" dangerouslySetInnerHTML={{ __html: processed.slice(3) }} />;
            }
            if (processed === '') return <br key={i} />;
            return <p key={i} className="ara-line" dangerouslySetInnerHTML={{ __html: processed }} />;
        });
    };

    const getPersonaTheme = (id: string) => PERSONA_THEMES[id] || DEFAULT_THEME;

    return (
        <div
            className="ara-console"
            style={{
                '--ara-accent': theme.accent,
                '--ara-accent-rgb': theme.accentRgb,
                '--ara-gradient': theme.gradient,
                '--ara-bg-tint': theme.bgTint,
            } as React.CSSProperties}
        >
            {/* Mode Bar */}
            <div className="ara-mode-bar">
                <div className="ara-mode-selector">
                    <button
                        ref={triggerRef}
                        className={`ara-mode-trigger ${modePickerOpen ? 'ara-mode-trigger--open' : ''}`}
                        onClick={() => { setModePickerOpen(!modePickerOpen); setExpandedTooltipId(null); }}
                    >
                        <span className="ara-mode-icon">{currentMode?.icon || '🧠'}</span>
                        <span className="ara-mode-name">{currentMode?.name || 'Loading...'}</span>
                        <span className="ara-mode-chevron">{modePickerOpen ? '▲' : '▼'}</span>
                    </button>

                    {modePickerOpen && (
                        <>
                            {/* Overlay to catch outside clicks and block events below */}
                            <div
                                className="ara-dropdown-overlay"
                                onClick={() => { setModePickerOpen(false); setExpandedTooltipId(null); }}
                            />
                            <div ref={dropdownRef} className="ara-mode-dropdown">
                                <div className="ara-dropdown-header">
                                    <span className="ara-dropdown-title">ARA Personalities</span>
                                    <span className="ara-dropdown-count">{modes.length} modes</span>
                                </div>
                                <div className="ara-dropdown-list">
                                    {modes.map(mode => {
                                        const mTheme = getPersonaTheme(mode.id);
                                        const isExpanded = expandedTooltipId === mode.id;
                                        return (
                                            <div key={mode.id} className="ara-mode-option-wrap">
                                                <button
                                                    className={`ara-mode-option ${mode.id === activeMode ? 'active' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); switchMode(mode.id); }}
                                                    style={{ '--opt-accent': mTheme.accent, '--opt-accent-rgb': mTheme.accentRgb } as React.CSSProperties}
                                                >
                                                    <span className="ara-mode-option-icon">{mode.icon}</span>
                                                    <div className="ara-mode-option-info">
                                                        <span className="ara-mode-option-name">{mode.name}</span>
                                                        <span className="ara-mode-option-desc">{mode.shortDescription}</span>
                                                    </div>
                                                    {mode.entityGuardianRequired && (
                                                        <span className="ara-entity-badge" title="Entity Guardian active">🛡️</span>
                                                    )}
                                                    <button
                                                        className="ara-mode-option-expand"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedTooltipId(isExpanded ? null : mode.id);
                                                        }}
                                                        title="Show details"
                                                    >
                                                        {isExpanded ? '▾' : 'ⓘ'}
                                                    </button>
                                                </button>
                                                {isExpanded && (
                                                    <div className="ara-mode-detail" style={{ '--opt-accent': mTheme.accent, '--opt-accent-rgb': mTheme.accentRgb } as React.CSSProperties}>
                                                        <p className="ara-detail-lens">{mode.lens}</p>
                                                        <div className="ara-detail-grid">
                                                            <div className="ara-detail-item">
                                                                <span className="ara-detail-label">🎭 Voice</span>
                                                                <span className="ara-detail-value">{mode.voice}</span>
                                                            </div>
                                                            <div className="ara-detail-item">
                                                                <span className="ara-detail-label">🎯 Best For</span>
                                                                <span className="ara-detail-value">{mode.bestFor}</span>
                                                            </div>
                                                            <div className="ara-detail-item">
                                                                <span className="ara-detail-label">🧠 Logic</span>
                                                                <span className="ara-detail-value">{mode.logic}</span>
                                                            </div>
                                                            <div className="ara-detail-item ara-detail-item--forbidden">
                                                                <span className="ara-detail-label">⛔ Forbidden</span>
                                                                <span className="ara-detail-value">{mode.forbiddenBehavior}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="ara-mode-status">
                    {activeMode === 'lead-counsel' && (
                        <div className="ara-jurisdiction-toggle">
                            <button
                                className={`ara-jurisdiction-btn ${jurisdiction === 'georgia' ? 'active' : ''}`}
                                onClick={() => {
                                    if (jurisdiction !== 'georgia') {
                                        setJurisdiction('georgia');
                                        setMessages(prev => [...prev, {
                                            role: 'assistant',
                                            content: '**Jurisdiction switched: 🍑 Georgia**\n\n_Georgia legal framework now auto-applied. All analysis will reference O.C.G.A. and Georgia case law._',
                                            mode: 'lead-counsel',
                                            entityGuardianActive: true,
                                            timestamp: Date.now()
                                        }]);
                                    }
                                }}
                            >
                                🍑 Georgia
                            </button>
                            <button
                                className={`ara-jurisdiction-btn ${jurisdiction === 'florida' ? 'active' : ''}`}
                                onClick={() => {
                                    if (jurisdiction !== 'florida') {
                                        setJurisdiction('florida');
                                        setMessages(prev => [...prev, {
                                            role: 'assistant',
                                            content: '**Jurisdiction switched: 🌴 Florida**\n\n_Florida legal framework now auto-applied. All analysis will reference Fla. Stat. and Florida case law._',
                                            mode: 'lead-counsel',
                                            entityGuardianActive: true,
                                            timestamp: Date.now()
                                        }]);
                                    }
                                }}
                            >
                                🌴 Florida
                            </button>
                        </div>
                    )}
                    {currentMode?.entityGuardianRequired && (
                        <span className="ara-guardian-indicator" title="Entity Guardian is active for this mode">
                            🛡️ Entity Guardian
                        </span>
                    )}
                    <button className="ara-clear-btn" onClick={clearChat} title="Clear conversation">
                        ⟳
                    </button>
                </div>
            </div>

            {/* Mode Hint */}
            {currentMode && messages.length === 0 && (
                <div className="ara-mode-hint">
                    <div className="ara-hint-icon">{currentMode.icon}</div>
                    <h3>{currentMode.name}</h3>
                    <p className="ara-hint-lens">{currentMode.lens}</p>
                    <p className="ara-hint-best">Best for: {currentMode.bestFor}</p>
                    <div className="ara-hint-tags">
                        <span className="ara-hint-tag">🎭 {currentMode.voice.split('—')[0]?.trim()}</span>
                        <span className="ara-hint-tag">🧠 {currentMode.logic.split('—')[0]?.trim()}</span>
                    </div>
                </div>
            )}

            {/* Chat Area */}
            <div className="ara-chat-area">
                {messages.map((msg, i) => (
                    <div key={i} className={`ara-message ara-message--${msg.role}`}>
                        {msg.role === 'assistant' && (
                            <div className="ara-message-header">
                                <span className="ara-avatar">◆</span>
                                <span className="ara-sender">ARA</span>
                                {msg.mode && (
                                    <span className="ara-msg-mode" style={{ color: getPersonaTheme(msg.mode).accent }}>
                                        {modes.find(m => m.id === msg.mode)?.icon}
                                    </span>
                                )}
                                {msg.entityGuardianActive && (
                                    <span className="ara-msg-guardian">🛡️</span>
                                )}
                                <span className="ara-msg-time">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <button
                                    className={`ara-speak-btn ${isSpeaking ? 'ara-speak-btn--active' : ''}`}
                                    onClick={() => isSpeaking ? stopSpeaking() : speakText(msg.content)}
                                    title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
                                >
                                    {isSpeaking ? '⏹' : '🔊'}
                                </button>
                            </div>
                        )}
                        {msg.role === 'user' && (
                            <div className="ara-message-header ara-message-header--user">
                                <span className="ara-msg-time">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="ara-sender ara-sender--user">You</span>
                            </div>
                        )}
                        <div className="ara-message-body">
                            {renderContent(msg.content)}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="ara-message ara-message--assistant ara-message--loading">
                        <div className="ara-message-header">
                            <span className="ara-avatar">◆</span>
                            <span className="ara-sender">ARA</span>
                        </div>
                        <div className="ara-typing">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="ara-input-bar">
                <button
                    className={`ara-mic-btn ${micActive ? 'ara-mic-btn--active' : ''} ${micTranscribing ? 'ara-mic-btn--transcribing' : ''}`}
                    onClick={toggleMic}
                    disabled={micTranscribing || isLoading}
                    title={micActive ? 'Stop recording' : micTranscribing ? 'Transcribing…' : 'Voice input'}
                >
                    {micTranscribing ? '⏳' : micActive ? '⏹' : '🎙️'}
                </button>
                <button
                    className={`ara-tts-btn ${ttsEnabled ? 'ara-tts-btn--on' : ''}`}
                    onClick={toggleTts}
                    title={ttsEnabled ? 'Disable auto-read replies (TTS on)' : 'Enable auto-read replies (TTS off)'}
                >
                    {ttsEnabled ? '🔊' : '🔇'}
                </button>
                {isSpeaking && (
                    <button
                        className="ara-mute-btn"
                        onClick={muteAra}
                        title="Mute — stop ARA speaking"
                    >
                        ⏹
                    </button>
                )}
                <button
                    className={`ara-avatar-btn ${avatarEnabled ? 'ara-avatar-btn--active' : ''}`}
                    onClick={handleAvatarToggle}
                    title={avatarEnabled ? 'Disable AI Avatar' : 'Enable AI Avatar (requires password)'}
                >
                    {avatarEnabled ? '🧑‍💻' : '👤'}
                </button>
                <button
                    className={`ara-voice-settings-btn ${voiceSettingsOpen ? 'ara-voice-settings-btn--active' : ''}`}
                    onClick={() => { setVoiceSettingsOpen(!voiceSettingsOpen); if (!voiceSettingsOpen) fetchVoices(); }}
                    title="Voice Settings"
                >
                    ⚙️
                </button>
                <button
                    className="ara-gender-toggle"
                    onClick={() => {
                        const next = voiceGender === 'female' ? 'male' : 'female';
                        setVoiceGender(next);
                        setActiveVoice(next);
                        localStorage.setItem('dwellium-ara-gender', next);
                        localStorage.setItem('dwellium-ara-voice', next);
                    }}
                    title={`Voice: ${voiceGender === 'female' ? 'Female' : 'Male'} — click to switch`}
                >
                    <span className={`ara-gender-option ${voiceGender === 'female' ? 'ara-gender-option--active' : ''}`}>♀</span>
                    <span className={`ara-gender-option ${voiceGender === 'male' ? 'ara-gender-option--active' : ''}`}>♂</span>
                </button>
                <textarea
                    ref={inputRef}
                    className="ara-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={micTranscribing ? 'Transcribing your voice…' : `Message ARA (${currentMode?.name || '...'})`}
                    rows={1}
                    disabled={isLoading}
                />
                <button
                    className="ara-send-btn"
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                >
                    ➤
                </button>
            </div>

            {/* Voice Settings Panel */}
            {voiceSettingsOpen && (
                <div className="ara-voice-panel">
                    <div className="ara-voice-panel-header">
                        <h4>🎙️ Voice Settings</h4>
                        <button className="ara-voice-panel-close" onClick={() => setVoiceSettingsOpen(false)}>✕</button>
                    </div>

                    {/* Provider Status */}
                    <div className="ara-voice-provider">
                        <span className="ara-voice-provider-dot" style={{ background: voiceStatus?.tts?.provider === 'chatterbox' ? '#22c55e' : voiceStatus?.tts?.provider === 'google-cloud' ? '#3b82f6' : '#f59e0b' }} />
                        <span className="ara-voice-provider-label">
                            {voiceStatus?.tts?.provider === 'chatterbox' ? 'Chatterbox TTS (SoTA)'
                                : voiceStatus?.tts?.provider === 'google-cloud' ? 'Google Cloud TTS'
                                    : voiceStatus?.tts?.provider === 'macos-say' ? 'macOS Say (Basic)'
                                        : 'Browser Fallback'}
                        </span>
                    </div>

                    {/* Active Voice */}
                    <div className="ara-voice-section">
                        <h5>Active Voice</h5>
                        <div className="ara-voice-list">
                            {clonedVoices.map(v => (
                                <div key={v.id} className={`ara-voice-item ${v.id === activeVoice ? 'ara-voice-item--active' : ''}`}>
                                    <button
                                        className="ara-voice-item-select"
                                        onClick={() => selectVoice(v.id)}
                                    >
                                        <span className="ara-voice-item-radio">{v.id === activeVoice ? '◉' : '○'}</span>
                                        <span className="ara-voice-item-name">{v.id === 'default' ? '🎭 Default (Chatterbox)' : `🎤 ${v.id}`}</span>
                                    </button>
                                    {v.id !== 'default' && (
                                        <button
                                            className="ara-voice-item-delete"
                                            onClick={() => deleteVoice(v.id)}
                                            title={`Delete ${v.id}`}
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Clone Voice */}
                    <div className="ara-voice-section">
                        <h5>Clone a Voice</h5>
                        <p className="ara-voice-hint">Upload a 10-second WAV reference clip to clone any voice.</p>
                        <div className="ara-voice-clone-form">
                            <input
                                type="text"
                                className="ara-voice-name-input"
                                placeholder="Voice name (e.g. my-voice)"
                                value={voiceUploadName}
                                onChange={e => setVoiceUploadName(e.target.value)}
                            />
                            <div
                                className={`ara-voice-dropzone ${voiceUploadDrag ? 'ara-voice-dropzone--drag' : ''}`}
                                onDragOver={e => { e.preventDefault(); setVoiceUploadDrag(true); }}
                                onDragLeave={() => setVoiceUploadDrag(false)}
                                onDrop={e => {
                                    e.preventDefault();
                                    setVoiceUploadDrag(false);
                                    const file = e.dataTransfer.files[0];
                                    if (file) handleVoiceUpload(file);
                                }}
                                onClick={() => voiceFileRef.current?.click()}
                            >
                                <input
                                    ref={voiceFileRef}
                                    type="file"
                                    accept="audio/wav,audio/wave,.wav"
                                    style={{ display: 'none' }}
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) handleVoiceUpload(file);
                                    }}
                                />
                                {voiceUploading ? (
                                    <div className="ara-voice-uploading">
                                        <span className="ara-voice-spinner" />
                                        <span>Cloning voice…</span>
                                    </div>
                                ) : (
                                    <>
                                        <span className="ara-voice-drop-icon">📎</span>
                                        <span className="ara-voice-drop-text">Drop WAV file or click to browse</span>
                                        <span className="ara-voice-drop-sub">10 seconds recommended</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Avatar Panel (Anam AI SDK) */}
            {avatarEnabled && (
                <div className="ara-avatar-panel">
                    <div className="ara-avatar-panel-header">
                        <h4>🧑‍💻 AI Avatar</h4>
                        <span className="ara-avatar-badge">CARA II</span>
                        <span className={`ara-avatar-status ara-avatar-status--${avatarStatus}`}>
                            {avatarStatus === 'connecting' && '⟳ Connecting…'}
                            {avatarStatus === 'connected' && '● Live'}
                            {avatarStatus === 'error' && '⚠ Error'}
                            {avatarStatus === 'idle' && '○ Idle'}
                        </span>
                        <button className="ara-avatar-panel-close" onClick={handleAvatarToggle}>✕</button>
                    </div>
                    <div className="ara-avatar-video-wrap">
                        {avatarStatus === 'error' && avatarError ? (
                            <div className="ara-avatar-error">
                                <span className="ara-avatar-error-icon">⚠️</span>
                                <p>{avatarError}</p>
                                <p className="ara-avatar-error-hint">
                                    To set up: add <code>ANAM_API_KEY</code> and <code>ANAM_PERSONA_ID</code> to the server <code>.env</code> and run <code>npm install @anam-ai/js-sdk</code>
                                </p>
                            </div>
                        ) : (
                            <video
                                ref={avatarVideoRef}
                                id="ara-avatar-video"
                                className="ara-avatar-video"
                                autoPlay
                                playsInline
                                muted={false}
                            />
                        )}
                        {avatarStatus === 'connecting' && (
                            <div className="ara-avatar-connecting">
                                <div className="ara-avatar-connecting-spinner" />
                                <span>Initializing CARA II…</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Avatar Password Modal */}
            {avatarPasswordModal && (
                <div className="ara-avatar-modal-overlay" onClick={() => setAvatarPasswordModal(false)}>
                    <div className="ara-avatar-modal" onClick={e => e.stopPropagation()}>
                        <div className="ara-avatar-modal-header">
                            <span className="ara-avatar-modal-icon">🔐</span>
                            <h4>Enable AI Avatar</h4>
                        </div>
                        <p className="ara-avatar-modal-desc">
                            The AI Avatar feature requires authorization. Enter the access password to enable.
                        </p>
                        <input
                            type="password"
                            className={`ara-avatar-modal-input ${avatarPasswordError ? 'ara-avatar-modal-input--error' : ''}`}
                            value={avatarPasswordInput}
                            onChange={e => { setAvatarPasswordInput(e.target.value); setAvatarPasswordError(false); }}
                            onKeyDown={e => { if (e.key === 'Enter') submitAvatarPassword(); }}
                            placeholder="Enter password"
                            autoFocus
                        />
                        {avatarPasswordError && (
                            <span className="ara-avatar-modal-error">Incorrect password. Try again.</span>
                        )}
                        <div className="ara-avatar-modal-actions">
                            <button className="ara-avatar-modal-cancel" onClick={() => setAvatarPasswordModal(false)}>Cancel</button>
                            <button className="ara-avatar-modal-submit" onClick={submitAvatarPassword}>Unlock</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
