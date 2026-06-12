import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser } from '../../context/UserContext';
import { useHierarchy } from '../../context/HierarchyContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { detectWidgetHandoffs, openWidgetHandoff, composeAraPrompt } from './araLinkage';
import { parseCommand, stripPoliteness } from '../../lib/dwelliumCommands';
import { matchSkill, AGENT_SKILLS, runSkillForInput } from '../../lib/agents/skills';
import { ARA_SPAWN_EVENT, consumePendingSpawn, parseSpawn, type SpawnRequest } from '../../lib/agents/spawn';
import { parseChain, executeChain } from '../../lib/conductorChain';
import { classifyIntent, recordRoutingDecision, looksActionable, consumePendingAraPrompt, ARA_PROMPT_EVENT } from '../../lib/llmRouter';
import { runTeam, runPersona, type OrchestratorDeps } from '../../lib/agents/orchestrator';
import { agentTeamsStore } from '../../lib/agents/agentTeamsStore';
import { findPersona } from '../../lib/agents/personas';
import { hermesLearningUserIdHolder, hermesLearningStore, recordRun, relevantPastRuns, formatFewShot, rateRun } from '../HonchoHermesPanel/hermesLearningStore';
import { useSyncExternalStore } from 'react';
import { araFewShot, recordAraChat } from './araHermes';
import './ARAConsole.css';
import { API_BASE } from '../../config';
import { FileUploadButton } from '../shared/FileUploadButton';
import '../shared/FileUploadButton.css';
import { sanitizeHtml } from '../../utils/safeMarkdown';
import VoiceVisualizer from './VoiceVisualizer';
import AraIntroVideo from './AraIntroVideo';
import AraSidePanel, { type AraSidePanelView } from './AraSidePanel';

// ── TTS voice catalog (Cycle 1 of ARA voice arc — 2026-05-28) ────────────
// Two tiers: OpenAI TTS (high quality, 6 voices, requires the user's OpenAI
// key) and browser SpeechSynthesis enhanced macOS voices (fallback when no
// OpenAI key is configured). Each entry's `id` is what we persist in
// localStorage["dwellium-ara-voice"]; the speakText resolver picks the path.
interface TtsVoiceOption {
    id: string;                          // canonical key persisted per-user
    label: string;                       // user-facing label in the picker
    description: string;                 // one-liner the picker tooltip / row shows
    provider: 'openai' | 'browser';
    openaiVoice?: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer';
    browserVoiceMatch?: string[];        // case-sensitive substring match in voice.name (first hit wins)
}

const TTS_VOICE_CATALOG: TtsVoiceOption[] = [
    { id: 'openai-alloy',   label: 'Alloy',   description: 'OpenAI — warm, neutral, balanced',           provider: 'openai', openaiVoice: 'alloy' },
    { id: 'openai-nova',    label: 'Nova',    description: 'OpenAI — bright, energetic female',         provider: 'openai', openaiVoice: 'nova' },
    { id: 'openai-shimmer', label: 'Shimmer', description: 'OpenAI — soft, breathy female',             provider: 'openai', openaiVoice: 'shimmer' },
    { id: 'openai-fable',   label: 'Fable',   description: 'OpenAI — British, expressive storyteller',  provider: 'openai', openaiVoice: 'fable' },
    { id: 'openai-echo',    label: 'Echo',    description: 'OpenAI — calm, conversational male',        provider: 'openai', openaiVoice: 'echo' },
    { id: 'openai-onyx',    label: 'Onyx',    description: 'OpenAI — deep, authoritative male',         provider: 'openai', openaiVoice: 'onyx' },
    { id: 'browser-samantha', label: 'Samantha (macOS)', description: 'Apple — Siri-quality enhanced female', provider: 'browser', browserVoiceMatch: ['Samantha (Enhanced)', 'Samantha'] },
    { id: 'browser-karen',    label: 'Karen (macOS)',    description: 'Apple — natural Australian female',    provider: 'browser', browserVoiceMatch: ['Karen (Enhanced)', 'Karen'] },
    { id: 'browser-daniel',   label: 'Daniel (macOS)',   description: 'Apple — calm British male',            provider: 'browser', browserVoiceMatch: ['Daniel (Enhanced)', 'Daniel'] },
    { id: 'browser-system',   label: 'System default',   description: 'Whatever your OS picks',                provider: 'browser' },
];

const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

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

interface ContextSource {
    name: string;
    type: 'inbox' | 'trello' | 'ruVector' | 'georgiaCode' | 'property' | 'workitem' | 'entity' | 'health' | 'workspace' | 'decisions' | 'auditLog' | 'commLog' | 'calendar' | 'scheduler';
    itemCount: number;
    snippet?: string;
}

interface WorkspaceContext {
    id: string;
    name: string;
    type: string;
    breadcrumb?: string[];
}

interface MessageObservability {
    latencyMs: number;
    contextBuildMs: number;
    providerUsed: string;
    tokensUsed?: number;
    retryCount: number;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    mode?: string;
    entityGuardianActive?: boolean;
    timestamp: number;
    contextSources?: ContextSource[];
    observability?: MessageObservability;
    /** Phase-10 A2: Hermes run id backing this answer — enables 👍/👎 voting. */
    hermesRunId?: string;
}

interface VoiceStatus {
    tts: {
        provider: string;
        available: boolean;
        fallbacks?: string[];
    };
    stt: {
        provider: string;
        available: boolean;
    };
}

interface LastRequestState {
    text: string;
    mode: string;
    jurisdiction?: 'georgia' | 'florida';
    workspaceContext?: WorkspaceContext;
}

interface PersistedConversationState {
    sessionId: string;
    messages: ChatMessage[];
    lastRequest: LastRequestState | null;
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
        accent: '#22c55e',
        accentRgb: '16, 185, 129',
        gradient: 'linear-gradient(135deg, #22c55e 0%, #059669 100%)',
        bgTint: 'rgba(16, 185, 129, 0.04)',
    },
    'lead-counsel': {
        accent: '#f59e0b',
        accentRgb: '245, 158, 11',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        bgTint: 'rgba(245, 158, 11, 0.04)',
    },
    'diplomat': {
        accent: '#D6FE51',
        accentRgb: '139, 92, 246',
        gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        bgTint: 'color-mix(in srgb, var(--accent) 4%, transparent)',
    },
    'devils-advocate': {
        accent: '#ef4444',
        accentRgb: '239, 68, 68',
        gradient: 'linear-gradient(135deg, #ef4444 0%, #ef4444 100%)',
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
    'executive-assistant': {
        accent: '#6366f1',
        accentRgb: '99, 102, 241',
        gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        bgTint: 'rgba(99, 102, 241, 0.05)',
    },
};

const DEFAULT_THEME = {
    accent: '#3898ec',
    accentRgb: '56, 152, 236',
    gradient: 'linear-gradient(135deg, #3898ec 0%, #2563eb 100%)',
    bgTint: 'rgba(56, 152, 236, 0.04)',
};

// ARA's default lens. Used as a client-side fallback so the persona exists even
// before the backend /api/ara/modes endpoint ships the matching mode.
const EXECUTIVE_ASSISTANT_MODE: ARAMode = {
    id: 'executive-assistant',
    name: 'Executive Assistant',
    icon: '🗂️',
    shortDescription: 'Your default right hand — coordinates everything and routes to the right tool or specialist lens.',
    lens: 'General-purpose executive support: triage, summarize, schedule, draft, navigate, and delegate.',
    logic: 'Clarify intent, take the most direct useful action, and hand off to a specialist lens when depth is needed.',
    voice: 'Warm, concise, proactive.',
    forbiddenBehavior: 'No legal, medical, or financial advice presented as professional counsel.',
    bestFor: 'Day-to-day coordination, navigating the workspace, and getting things done fast.',
    entityGuardianRequired: false,
};

/**
 * Humanized acknowledgment for a just-run Conductor command. Varies phrasing
 * (no two in a row feel canned) and always ends by asking what's next — ARA
 * is a colleague, not a status line.
 */
function humanizeCommandAck(label: string): string {
    const openMatch = label.match(/^Open\s+(.+)$/i);
    if (openMatch) {
        const raw = openMatch[1];
        const thing = raw.charAt(0).toUpperCase() + raw.slice(1); // "settings" → "Settings"
        const variants = [
            `On it — ${thing} is open. What would you like me to do next?`,
            `Done! ${thing}'s up. What would you like me to do next?`,
            `There you go, ${thing} is open. What's next?`,
            `Got it — ${thing}'s ready for you. What would you like me to do next?`,
            `${thing} is up. Anything else I can grab for you?`,
        ];
        return variants[Math.floor(Math.random() * variants.length)];
    }
    const generic = [
        `Done — ${label.toLowerCase()}. What would you like me to do next?`,
        `All set: ${label.toLowerCase()}. What's next?`,
        `That's done. What would you like me to do next?`,
    ];
    return generic[Math.floor(Math.random() * generic.length)];
}

function createChatMessage(
    partial: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<Pick<ChatMessage, 'timestamp'>>
): ChatMessage {
    return {
        id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: partial.timestamp ?? Date.now(),
        ...partial,
    };
}

function summarizeText(value: string, fallback: string, maxLength = 72): string {
    const cleaned = value.replace(/\s+/g, ' ').replace(/[*_`#>-]/g, '').trim();
    if (!cleaned) return fallback;
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}…` : cleaned;
}

function formatProviderLabel(provider?: string): string {
    switch (provider) {
        case 'openai-tts': return 'OpenAI TTS';
        case 'chatterbox': return 'Chatterbox TTS';
        case 'google-cloud': return 'Google Cloud';
        case 'macos-say': return 'macOS Say';
        case 'browser': return 'Browser Fallback';
        case 'gpt-4o-mini': return 'GPT-4o mini';
        default: return provider || 'Unknown';
    }
}

function buildSessionStorageKey(mode: string): string {
    return `dwellium-ara-session-${mode}`;
}

function exportConversation(messages: ChatMessage[]) {
    return messages
        .filter(message =>
            (message.role === 'user' || message.role === 'assistant') &&
            !message.content.startsWith('[Error]')
        )
        .map(message => ({
            role: message.role,
            content: message.content,
        }));
}

function hasThinContext(message?: ChatMessage | null): boolean {
    if (!message || message.role !== 'assistant') return false;
    const sourceCount = message.contextSources?.length || 0;
    const totalItems = message.contextSources?.reduce((sum, source) => sum + source.itemCount, 0) || 0;
    return sourceCount < 2 || totalItems < 3;
}

function getSafetyNotice(text: string, mode: string): string | null {
    const legalPattern = /legal|lawsuit|litigation|statute|code section|compliance|attorney|counsel/i;
    const tenantPattern = /tenant|resident|lease|evict|rent|deposit|fair housing/i;

    if (tenantPattern.test(text)) {
        return 'Tenant-sensitive topic. Human approval is still required before acting or communicating.';
    }
    if (mode === 'lead-counsel' || legalPattern.test(text)) {
        return 'Legal-sensitive topic. Treat this as decision support, not a substitute for legal review.';
    }
    return null;
}

export default function ARAConsole() {
    const { user, authFetch, isAuthenticated } = useUser();
    const { selectedId, getSelectedItem, getBreadcrumb } = useHierarchy();
    const { integrations } = useIntegrations();
    // OpenAI key from per-user integrations (set in Settings → API Keys).
    // When present, ARA TTS routes through OpenAI's /audio/speech instead of
    // dropping to the robotic browser SpeechSynthesis fallback.
    const openaiApiKey = useMemo(() => {
        // The integrations bundle shape (per per-user-integrations arc 2026-05-26):
        //   integrations.llm.openai.apiKey  ← canonical path
        // Older builds may have used .providers.openai.apiKey — kept as a fallback.
        return integrations?.llm?.openai?.apiKey
            ?? (integrations?.llm as any)?.providers?.openai?.apiKey
            ?? '';
    }, [integrations]);
    const [modes, setModes] = useState<ARAMode[]>([]);
    // Executive Assistant is ARA's default lens (the general-purpose persona).
    const [activeMode, setActiveMode] = useState<string>('executive-assistant');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [modePickerOpen, setModePickerOpen] = useState(false);
    const [expandedTooltipId, setExpandedTooltipId] = useState<string | null>(null);
    const [jurisdiction, setJurisdiction] = useState<'georgia' | 'florida'>('georgia');
    // Docked tools drawer (Honcho / Hermes / Tools / Settings) + its resizable width.
    const [sidePanel, setSidePanel] = useState<AraSidePanelView | 'none'>('none');
    const [sideWidth, setSideWidth] = useState<number>(() => {
        try { return Math.min(640, Math.max(280, Number(localStorage.getItem('dwellium-ara-side-w')) || 380)); }
        catch { return 380; }
    });
    const beginSideResize = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = sideWidth;
        let latest = startW;
        const onMove = (ev: PointerEvent) => {
            // Panel is docked right, so dragging the divider left widens it.
            latest = Math.min(640, Math.max(280, startW + (startX - ev.clientX)));
            setSideWidth(latest);
        };
        const onUp = () => {
            try { localStorage.setItem('dwellium-ara-side-w', String(latest)); } catch { /* sandboxed */ }
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, [sideWidth]);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const sessionId = useRef(`session-${Date.now()}`);
    const skipSessionPersistRef = useRef(true);
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
    const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
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
    const [avatarStatus, setAvatarStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'>('idle');
    const [avatarError, setAvatarError] = useState<string>('');
    const anamClientRef = useRef<any>(null);
    const avatarVideoRef = useRef<HTMLVideoElement>(null);
    const avatarReconnectTimerRef = useRef<number | null>(null);
    const avatarRetryCountRef = useRef(0);
    const [avatarRetryCount, setAvatarRetryCount] = useState(0);
    const [avatarReconnectTick, setAvatarReconnectTick] = useState(0);

    const [requestError, setRequestError] = useState<string | null>(null);
    const [lastRequest, setLastRequest] = useState<LastRequestState | null>(null);
    const [expandedMeta, setExpandedMeta] = useState<Record<string, boolean>>({});
    const [showObservability, setShowObservability] = useState(false);
    const [observabilitySnapshot, setObservabilitySnapshot] = useState<any>(null);
    const [actionMode, setActionMode] = useState<'none' | 'note' | 'workitem'>('none');
    const [noteSubject, setNoteSubject] = useState('');
    const [workitemTitle, setWorkitemTitle] = useState('');
    const [workitemPriority, setWorkitemPriority] = useState<'low' | 'medium' | 'high'>('medium');
    const [workitemType, setWorkitemType] = useState('task');
    const [workitemDomain, setWorkitemDomain] = useState('operations');
    const [actionStatus, setActionStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
    const [actionLoading, setActionLoading] = useState<'note' | 'workitem' | null>(null);

    const clearAvatarReconnectTimer = useCallback(() => {
        if (avatarReconnectTimerRef.current !== null) {
            window.clearTimeout(avatarReconnectTimerRef.current);
            avatarReconnectTimerRef.current = null;
        }
    }, []);

    const resetAvatarReconnectState = useCallback(() => {
        avatarRetryCountRef.current = 0;
        setAvatarRetryCount(0);
        clearAvatarReconnectTimer();
    }, [clearAvatarReconnectTimer]);

    const scheduleAvatarReconnect = useCallback((reason: string) => {
        clearAvatarReconnectTimer();
        const nextAttempt = avatarRetryCountRef.current + 1;
        if (nextAttempt > 3) {
            setAvatarStatus('error');
            setAvatarError(reason);
            return;
        }
        avatarRetryCountRef.current = nextAttempt;
        setAvatarRetryCount(nextAttempt);
        setAvatarStatus('reconnecting');
        setAvatarError(`${reason} Retrying (${nextAttempt}/3)…`);
        avatarReconnectTimerRef.current = window.setTimeout(() => {
            setAvatarReconnectTick(value => value + 1);
        }, Math.min(4500, 1200 * nextAttempt));
    }, [clearAvatarReconnectTimer]);

    const manualAvatarReconnect = useCallback(() => {
        resetAvatarReconnectState();
        setAvatarError('');
        setAvatarStatus('connecting');
        setAvatarReconnectTick(value => value + 1);
    }, [resetAvatarReconnectState]);

    const handleAvatarToggle = useCallback(() => {
        if (avatarEnabled) {
            // Turning off — no password needed, cleanup SDK
            if (anamClientRef.current) {
                try { anamClientRef.current.stopStreaming?.(); } catch { /* ignore */ }
                anamClientRef.current = null;
            }
            clearAvatarReconnectTimer();
            setAvatarEnabled(false);
            setAvatarStatus('idle');
            setAvatarError('');
            localStorage.setItem('dwellium-ara-avatar', 'false');
        } else {
            // Turning on — require password
            setAvatarPasswordModal(true);
            setAvatarPasswordInput('');
            setAvatarPasswordError(false);
        }
    }, [avatarEnabled, clearAvatarReconnectTimer]);

    const submitAvatarPassword = useCallback(() => {
        if (avatarPasswordInput === AVATAR_PASSWORD) {
            resetAvatarReconnectState();
            setAvatarEnabled(true);
            setAvatarStatus('connecting');
            setAvatarError('');
            localStorage.setItem('dwellium-ara-avatar', 'true');
            setAvatarPasswordModal(false);
            setAvatarPasswordInput('');
            setAvatarPasswordError(false);
        } else {
            setAvatarPasswordError(true);
        }
    }, [avatarPasswordInput, resetAvatarReconnectState]);

    // Anam SDK initialization — API key flow via auth-protected backend
    useEffect(() => {
        if (!avatarEnabled) return;

        let cancelled = false;

        async function initAnamSdk() {
            setAvatarStatus(avatarRetryCountRef.current > 0 ? 'reconnecting' : 'connecting');
            setAvatarError('');

            try {
                // Dynamically import the SDK only when avatar mode is enabled so
                // avatar support stays out of the main app path until it is used.
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
                    if (!cancelled) {
                        resetAvatarReconnectState();
                        setAvatarStatus('connected');
                        setAvatarError('');
                    }
                    console.log('[ARA Avatar] Connection established');
                });

                client.addListener?.(AnamEvent?.CONNECTION_CLOSED || 'CONNECTION_CLOSED', () => {
                    if (!cancelled) {
                        setAvatarStatus('disconnected');
                        scheduleAvatarReconnect('Avatar session closed unexpectedly.');
                    }
                    console.log('[ARA Avatar] Connection closed');
                });

                // Stream to video element
                if (avatarVideoRef.current) {
                    await client.streamToVideoElement('ara-avatar-video');
                }

                if (!cancelled) {
                    resetAvatarReconnectState();
                    setAvatarStatus('connected');
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error('[ARA Avatar] SDK init failed:', err);
                    const message = err.message || 'Failed to connect to Anam AI';
                    if (
                        avatarEnabled &&
                        !message.includes('not installed') &&
                        !message.includes('Failed to get session token from backend') &&
                        !message.includes('ANAM_API_KEY')
                    ) {
                        scheduleAvatarReconnect(message);
                    } else {
                        setAvatarStatus('error');
                        setAvatarError(message);
                    }
                }
            }
        }

        initAnamSdk();

        return () => {
            cancelled = true;
            clearAvatarReconnectTimer();
            if (anamClientRef.current) {
                try { anamClientRef.current.stopStreaming?.(); } catch { /* ignore */ }
                anamClientRef.current = null;
            }
        };
    }, [avatarEnabled, authFetch, avatarReconnectTick, clearAvatarReconnectTimer, resetAvatarReconnectState, scheduleAvatarReconnect]);


    // TTS state
    const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('dwellium-ara-tts');
            if (saved === null) return true; // Default to ON
            return saved === 'true';
        } catch { return true; }
    });
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Humanize state — when ON, prepends a humanize directive to the outgoing
    // user message so ARA's reply lands warmer, more conversational. Persisted
    // per-user via localStorage. Default ON for new users since the corporate-
    // sounding default was the original complaint.
    const [humanizeEnabled, setHumanizeEnabled] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('dwellium-ara-humanize');
            if (saved === null) return true;
            return saved === 'true';
        } catch { return true; }
    });
    const toggleHumanize = useCallback(() => {
        setHumanizeEnabled(prev => {
            const next = !prev;
            try { localStorage.setItem('dwellium-ara-humanize', String(next)); } catch { /* sandboxed */ }
            return next;
        });
    }, []);

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

        // Resolve the active voice option from the catalog. Backward compat:
        // legacy values 'female' / 'male' (pre-Cycle-1 voice arc) map to
        // alloy / onyx so existing localStorage doesn't break.
        const legacyMap: Record<string, string> = { female: 'openai-alloy', male: 'openai-onyx' };
        const resolvedId = legacyMap[activeVoice] ?? activeVoice;
        const option = TTS_VOICE_CATALOG.find(v => v.id === resolvedId) ?? TTS_VOICE_CATALOG[0];

        // ── Path A: OpenAI TTS via direct browser fetch (preferred) ─────
        // Same browser-direct pattern as llmClient.ts for Anthropic. Key comes
        // from the per-user integrations bundle; no server proxy required.
        if (option.provider === 'openai' && openaiApiKey) {
            try {
                console.log(`[ARA TTS] Requesting OpenAI TTS — voice=${option.openaiVoice}`);
                const res = await fetch(OPENAI_TTS_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiApiKey}`,
                    },
                    body: JSON.stringify({
                        model: 'tts-1',
                        input: cleaned.length > 4000 ? cleaned.slice(0, 4000) : cleaned,
                        voice: option.openaiVoice,
                        response_format: 'mp3',
                    }),
                });
                if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    currentAudioRef.current = audio;
                    audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); currentAudioRef.current = null; };
                    audio.onerror = (e) => {
                        console.error('[ARA TTS] ❌ OpenAI audio playback error:', e);
                        setIsSpeaking(false); URL.revokeObjectURL(url); currentAudioRef.current = null;
                    };
                    await audio.play();
                    console.log(`[ARA TTS] ▶️ OpenAI ${option.openaiVoice} playing (${blob.size} bytes)`);
                    return;
                }
                const errText = await res.text().catch(() => '');
                console.warn(`[ARA TTS] OpenAI returned HTTP ${res.status}: ${errText.slice(0, 200)} — falling back to browser TTS`);
            } catch (err) {
                console.error('[ARA TTS] ❌ OpenAI TTS fetch failed — falling back:', err);
            }
        } else if (option.provider === 'openai' && !openaiApiKey) {
            console.warn('[ARA TTS] No OpenAI API key configured — falling back to browser SpeechSynthesis. Open Settings → API Keys to add one.');
        }

        // ── Path B: Browser SpeechSynthesis with the chosen voice ───────
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.rate = 0.92;
        utterance.pitch = 1.06;
        const voices = window.speechSynthesis.getVoices();
        // If the active option is a browser voice, try its match list first.
        let preferred: SpeechSynthesisVoice | undefined;
        if (option.provider === 'browser' && option.browserVoiceMatch) {
            for (const needle of option.browserVoiceMatch) {
                preferred = voices.find(v => v.name.includes(needle));
                if (preferred) break;
            }
        }
        // Fall back to the universal high-quality preference chain
        if (!preferred) {
            preferred =
                voices.find(v => v.name.includes('Samantha (Enhanced)')) ||
                voices.find(v => v.name.includes('Karen (Enhanced)')) ||
                voices.find(v => v.name.includes('Zoe (Enhanced)')) ||
                voices.find(v => v.name.includes('Samantha')) ||
                voices.find(v => v.name.includes('Karen')) ||
                voices.find(v => v.name.includes('Zoe')) ||
                voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
                voices.find(v => v.lang.startsWith('en-US') && v.localService) ||
                voices.find(v => v.lang.startsWith('en'));
        }
        if (preferred) utterance.voice = preferred;
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
        console.log(`[ARA TTS] 🔊 Browser SpeechSynthesis — voice=${preferred?.name ?? 'default'}`);
    }, [stripMarkdown, activeVoice, openaiApiKey]);

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

    const fetchObservability = useCallback(async () => {
        try {
            const res = await authFetch(`${API_ARA}/observability`);
            if (!res.ok) throw new Error(`Observability fetch failed: ${res.status}`);
            const data = await res.json();
            if (data.success) {
                setObservabilitySnapshot(data.data);
            }
        } catch (err) {
            console.warn('[ARA] Failed to fetch observability:', err);
        }
    }, [authFetch]);

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchObservability();
    }, [fetchObservability, isAuthenticated]);

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
                    // Always surface Executive Assistant first (use the backend's
                    // version if it ships one, else the client-side fallback).
                    const fetched: ARAMode[] = Array.isArray(data.data) ? data.data : [];
                    const ea = fetched.find(m => m.id === 'executive-assistant') || EXECUTIVE_ASSISTANT_MODE;
                    const others = fetched.filter(m => m.id !== 'executive-assistant');
                    setModes([ea, ...others]);
                    console.log(`[ARA] Loaded ${others.length + 1} personalities`);
                }
            })
            .catch(err => {
                console.error('[ARA] Failed to fetch modes:', err);
                // Even if the backend is unreachable, keep ARA usable with the default lens.
                setModes(prev => (prev.length ? prev : [EXECUTIVE_ASSISTANT_MODE]));
            });
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
    const selectedWorkspaceItem = useMemo(() => {
        if (!selectedId) return null;
        return getSelectedItem();
    }, [getSelectedItem, selectedId]);
    const workspaceContext = useMemo<WorkspaceContext | undefined>(() => {
        if (!selectedWorkspaceItem) return undefined;
        const breadcrumb = getBreadcrumb()
            .map(item => item.name)
            .filter(Boolean);
        return {
            id: selectedWorkspaceItem.id,
            name: selectedWorkspaceItem.name,
            type: selectedWorkspaceItem.type,
            breadcrumb,
        };
    }, [getBreadcrumb, selectedWorkspaceItem]);
    const latestAssistantMessage = useMemo(
        () => [...messages].reverse().find(message => message.role === 'assistant'),
        [messages]
    );
    const latestUserMessage = useMemo(
        () => [...messages].reverse().find(message => message.role === 'user'),
        [messages]
    );
    const defaultNoteSubject = useMemo(
        () => `ARA Note — ${summarizeText(latestUserMessage?.content || latestAssistantMessage?.content || '', 'Conversation summary')}`,
        [latestAssistantMessage?.content, latestUserMessage?.content]
    );
    const defaultWorkitemTitle = useMemo(
        () => summarizeText(latestUserMessage?.content || latestAssistantMessage?.content || '', 'ARA follow-up'),
        [latestAssistantMessage?.content, latestUserMessage?.content]
    );
    const thinContextWarning = useMemo(
        () => hasThinContext(latestAssistantMessage)
            ? 'Thin context: ARA answered with limited supporting context. Verify before acting.'
            : null,
        [latestAssistantMessage]
    );
    const safetyNotice = useMemo(
        () => getSafetyNotice(input || latestUserMessage?.content || latestAssistantMessage?.content || '', activeMode),
        [activeMode, input, latestAssistantMessage?.content, latestUserMessage?.content]
    );

    useEffect(() => {
        const storageKey = buildSessionStorageKey(activeMode);
        let restored: PersistedConversationState | null = null;
        skipSessionPersistRef.current = true;
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                restored = JSON.parse(raw) as PersistedConversationState;
            }
        } catch {
            restored = null;
        }

        setMessages(restored?.messages || []);
        setLastRequest(restored?.lastRequest || null);
        sessionId.current = restored?.sessionId || `session-${Date.now()}`;
        setRequestError(null);
        setActionStatus(null);
        setActionMode('none');
    }, [activeMode]);

    useEffect(() => {
        if (skipSessionPersistRef.current) {
            skipSessionPersistRef.current = false;
            return;
        }
        const storageKey = buildSessionStorageKey(activeMode);
        const payload: PersistedConversationState = {
            sessionId: sessionId.current,
            messages,
            lastRequest,
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
    }, [activeMode, lastRequest, messages]);

    const sendPrompt = useCallback(async (
        rawText: string,
        options?: { retry?: boolean; mode?: string; jurisdiction?: 'georgia' | 'florida'; workspaceContext?: WorkspaceContext }
    ) => {
        const text = rawText.trim();
        if (!text || isLoading) return;

        const modeToUse = options?.mode || activeMode;
        const jurisdictionToUse = options?.jurisdiction || (modeToUse === 'lead-counsel' ? jurisdiction : undefined);
        const workspaceContextToUse = options?.workspaceContext ?? workspaceContext;

        if (!options?.retry) {
            setMessages(prev => [...prev, createChatMessage({
                role: 'user',
                content: text,
            })]);
            setInput('');
        }

        setRequestError(null);
        setActionStatus(null);
        setIsLoading(true);
        setLastRequest({ text, mode: modeToUse, jurisdiction: jurisdictionToUse, workspaceContext: workspaceContextToUse });

        // Humanize prefix: prepended to the outgoing user message when the
        // toggle is on. Frontend-only — no backend change needed. The LLM
        // honors this style guidance for its reply.
        const HUMANIZE_PREFIX =
            "[Reply style: you're a sharp, warm human assistant mid-conversation — never a chatbot. " +
            "Use contractions (don't, you're, we'll). Short sentences. Plain language — no corporate jargon, " +
            "no hedging, no 'As an AI', no robotic acknowledgments like 'Acknowledged' or 'Processing'. " +
            "React naturally ('Nice.', 'Got it.', 'Oof, okay —'). Vary how you start replies. " +
            "If you must list things, lead with a single sentence first, then the list. " +
            "When you finish a task, ask a natural follow-up like 'What would you like me to do next?']\n\n";
        let outgoingMessage = humanizeEnabled ? HUMANIZE_PREFIX + text : text;

        // ── Phase-10 A2: Hermes quick-chat hints ──────────────────────────
        // Inject the top-K (3) similar PAST ARA exchanges the user kept
        // (👎-voted runs are excluded at the araHermes layer). Backend path:
        // appended to the outgoing message as a bracketed context block (the
        // humanize-prefix precedent — this chat route has no system-prompt
        // field). LLM-fallback path: appended to the systemPrompt instead.
        hermesLearningUserIdHolder.current = user?.id ?? null; // per-user log
        const hermesHints = araFewShot(text);
        if (hermesHints) {
            outgoingMessage += `\n\n[Context from past conversations — use if relevant, never mention this block:\n${hermesHints}]`;
        }

        try {
            const res = await authFetch(`${API_ARA}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: modeToUse,
                    message: outgoingMessage,
                    sessionId: sessionId.current,
                    humanize: humanizeEnabled,  // backend hint for future use
                    ...(jurisdictionToUse ? { jurisdiction: jurisdictionToUse } : {}),
                    ...(workspaceContextToUse ? { workspaceContext: workspaceContextToUse } : {}),
                })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.success) {
                throw new Error(data.error || `Chat failed (${res.status})`);
            }

            // Phase-10 A2: record the exchange into the per-user Hermes log
            // (ara-chat tag) so future similar questions get it as few-shot;
            // the run id rides on the message to power 👍/👎.
            const hermesRec = recordAraChat(text, data.data.content);
            const araMsg = createChatMessage({
                role: 'assistant',
                content: data.data.content,
                mode: data.data.mode,
                entityGuardianActive: data.data.entityGuardianActive,
                contextSources: data.data.contextSources,
                observability: data.data.observability,
                hermesRunId: hermesRec.id,
            });
            setMessages(prev => [...prev, araMsg]);
            fetchObservability();

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
                    if (ttsEnabled) speakText(data.data.content);
                }
            } else if (ttsEnabled) {
                speakText(data.data.content);
            }
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : 'Backend unreachable. Is the server running on port 3000?';

            // ── LLM-ready offline fallback (gap A1) ──
            // ARA's backend carries deep domain context (modes, entity guardian,
            // observability, ruVector retrieval), so we try it FIRST and only
            // fall back to the user's personal LLM key when the backend is
            // unreachable — unlike Stella, which routes LLM-first. This keeps the
            // rich backend path primary while still answering when it's down.
            if (hasActiveLlm(integrations.llm)) {
                try {
                    const llmRes = await callLlm({
                        systemPrompt:
                            `You are ARA, the human-feeling chief-of-staff inside the Dwellium property-management app, ` +
                            `currently operating in "${modeToUse}" mode${jurisdictionToUse ? ` (jurisdiction: ${jurisdictionToUse})` : ''}. ` +
                            `Speak like a warm, sharp colleague: contractions, short sentences, no corporate jargon, ` +
                            `no robotic phrasing — never say "As an AI" or "Acknowledged". ` +
                            `The ARA backend is offline, so deep context retrieval is unavailable — answer from general knowledge, ` +
                            `be concise and direct, and note when a question would need live property data. Use Markdown when helpful.` +
                            (hermesHints ? `\n\n${hermesHints}` : ''),
                        prompt: humanizeEnabled ? HUMANIZE_PREFIX + text : text,
                        maxTokens: 1024,
                        temperature: 0.4,
                    }, integrations.llm);
                    if (llmRes) {
                        setActionStatus({
                            kind: 'success',
                            message: `Backend offline — answered via your ${integrations.llm.active} key.`,
                        });
                        const hermesRec = recordAraChat(text, llmRes.text);
                        setMessages(prev => [...prev, createChatMessage({
                            role: 'assistant',
                            content: llmRes.text,
                            mode: modeToUse,
                            hermesRunId: hermesRec.id,
                        })]);
                        return;
                    }
                } catch (llmErr) {
                    // Fall through to the standard error surface below.
                    console.warn('[ARA] LLM fallback failed:', llmErr);
                }
            }

            setRequestError(message);
            setMessages(prev => [...prev, createChatMessage({
                role: 'assistant',
                content: `Hmm, I hit a snag — ${message} Want me to try that again in a moment?`,
                mode: modeToUse,
            })]);
        } finally {
            setIsLoading(false);
        }
    }, [
        isLoading,
        activeMode,
        jurisdiction,
        workspaceContext,
        authFetch,
        avatarEnabled,
        avatarStatus,
        fetchObservability,
        speakText,
        stripMarkdown,
        ttsEnabled,
        humanizeEnabled,
        integrations.llm,
        user,
    ]);

    // ── Phase-10 A1: host Agent Lab orchestrator runs inside ARA chat ─────
    // "spawn research squad on X" / "run a deal desk analysis of Y" / "solo
    // researcher on Z" — typed into ARA's composer OR fired from ⌘K via the
    // `dwellium:ara-spawn` event (pending-slot covers the ⌘K→mount race). The
    // run streams its decompose/execute/verify/merge phases into one
    // progressive assistant message, mirroring AgentLab.tsx's deps wiring
    // (callLlm + Hermes recall/record) so agents keep learning regardless of
    // which door the run came through.
    const updateMessageContent = useCallback((id: string, transform: (content: string) => string) => {
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: transform(m.content) } : m)));
    }, []);

    const runSpawn = useCallback(async (req: SpawnRequest, echoUser: boolean = true) => {
        hermesLearningUserIdHolder.current = user?.id ?? null;
        const progress = createChatMessage({
            role: 'assistant',
            content: `**${req.name}** taking on: _${req.goal}_`,
        });
        setMessages(prev => (echoUser
            ? [...prev, createChatMessage({ role: 'user', content: `${req.kind === 'team' ? 'Spawn' : 'Solo'} ${req.name}: ${req.goal}` }), progress]
            : [...prev, progress]));
        const line = (s: string) => updateMessageContent(progress.id, c => `${c}\n\n${s}`);
        if (!hasActiveLlm(integrations.llm)) {
            line('⚠ No LLM configured — add a key in Control Panel → API Keys, then try again.');
            return;
        }
        setIsLoading(true);
        const deps: OrchestratorDeps = {
            invoke: async (r) => (await callLlm(r, integrations.llm))?.text ?? null,
            recall: (prompt) => formatFewShot(relevantPastRuns(prompt, 3)),
            record: (rec) => { recordRun(rec); },
            // P11-5: equipped skills execute during member tasks.
            runSkill: async (skillInput, skillIds) => {
                const catalog = AGENT_SKILLS.filter(s => skillIds.includes(s.id));
                const r = await runSkillForInput(skillInput, { llm: integrations.llm }, catalog);
                return r && r.ok ? { name: r.skill.name, text: r.text } : null;
            },
        };
        try {
            const { teams, personas } = agentTeamsStore.getSnapshot();
            if (req.kind === 'team') {
                const team = teams.find(t => t.id === req.id);
                if (!team) { line(`⚠ Team "${req.name}" not found in the Agent Lab catalog.`); return; }
                const result = await runTeam({
                    goal: req.goal, sources: '', team, personas, deps,
                    onEvent: e => line(`\`${e.phase}\` ${e.message}`),
                });
                if (result.error) {
                    line(`⚠ ${result.error}`);
                } else {
                    recordRun({ prompt: req.goal, taskType: 'planning', outcome: 'success', summary: result.final.slice(0, 200), toolsUsed: [team.id] });
                    line(`---\n\n${result.final}`);
                    if (ttsEnabled) void speakText(`${req.name} has finished.`);
                }
            } else {
                const persona = findPersona(personas, req.id);
                if (!persona) { line(`⚠ "${req.name}" not found in the Agent Lab catalog.`); return; }
                line(`\`execute\` ${persona.name} is working…`);
                const out = await runPersona({ goal: req.goal, sources: '', persona, deps });
                recordRun({ prompt: req.goal, taskType: 'general', outcome: out.output ? 'success' : 'fail', summary: out.verified.slice(0, 200), toolsUsed: [persona.id] });
                const text = out.verified || out.output;
                line(text ? `---\n\n${text}` : '⚠ No output — the model returned nothing.');
                if (text && ttsEnabled) void speakText(`${persona.name} has finished.`);
            }
        } catch (err) {
            line(`⚠ Run failed — ${err instanceof Error ? err.message : String(err)}.`);
        } finally {
            setIsLoading(false);
        }
    }, [user, integrations.llm, updateMessageContent, ttsEnabled, speakText]);

    useEffect(() => {
        const handler = (ev: Event) => {
            consumePendingSpawn(); // live event supersedes the mount-race slot
            const req = (ev as CustomEvent).detail as SpawnRequest | null;
            if (req?.goal) void runSpawn(req);
        };
        window.addEventListener(ARA_SPAWN_EVENT, handler);
        const pending = consumePendingSpawn(); // spawn fired before ARA mounted
        if (pending) void runSpawn(pending);
        return () => window.removeEventListener(ARA_SPAWN_EVENT, handler);
    }, [runSpawn]);

    // ── Phase-10 A2: 👍/👎 on ARA answers trains Hermes ───────────────────
    // 👍 (+1) boosts the run in future few-shot ranking; 👎 (−1) excludes it
    // from ARA hints entirely (filtered at the araHermes layer).
    // P11-1 (2026-06-12): voted-state derives from the Hermes STORE rating
    // instead of session-local useState — chips no longer reset visually
    // between sessions while the rating persists underneath.
    const hermesRuns = useSyncExternalStore(
        hermesLearningStore.subscribe,
        hermesLearningStore.getSnapshot,
        hermesLearningStore.getServerSnapshot,
    );
    const hermesVotes = useMemo(() => {
        const map: Record<string, number> = {};
        for (const r of hermesRuns) if (typeof r.rating === 'number') map[r.id] = r.rating;
        return map;
    }, [hermesRuns]);
    const voteOnMessage = useCallback((runId: string, value: 1 | -1) => {
        hermesLearningUserIdHolder.current = user?.id ?? null;
        rateRun(runId, value);
    }, [user]);

    // ── P11-3: spawn-in-chain runner — orchestrator run as a chain step,
    // returning the final deliverable for result piping (no chat-hosting;
    // the chain renders its own step lines).
    const runSpawnForChain = useCallback(async (req: SpawnRequest): Promise<{ ok: boolean; text: string }> => {
        hermesLearningUserIdHolder.current = user?.id ?? null;
        if (!hasActiveLlm(integrations.llm)) {
            return { ok: false, text: 'No LLM configured — add a key in Control Panel → API Keys.' };
        }
        const deps: OrchestratorDeps = {
            invoke: async (r) => (await callLlm(r, integrations.llm))?.text ?? null,
            recall: (prompt) => formatFewShot(relevantPastRuns(prompt, 3)),
            record: (rec) => { recordRun(rec); },
            // P11-5: equipped skills execute during member tasks.
            runSkill: async (skillInput, skillIds) => {
                const catalog = AGENT_SKILLS.filter(s => skillIds.includes(s.id));
                const r = await runSkillForInput(skillInput, { llm: integrations.llm }, catalog);
                return r && r.ok ? { name: r.skill.name, text: r.text } : null;
            },
        };
        const { teams, personas } = agentTeamsStore.getSnapshot();
        if (req.kind === 'team') {
            const team = teams.find(t => t.id === req.id);
            if (!team) return { ok: false, text: `Team "${req.name}" not found in the Agent Lab catalog.` };
            const result = await runTeam({ goal: req.goal, sources: '', team, personas, deps });
            if (result.error) return { ok: false, text: result.error };
            recordRun({ prompt: req.goal, taskType: 'planning', outcome: 'success', summary: result.final.slice(0, 200), toolsUsed: [team.id] });
            return { ok: true, text: result.final };
        }
        const persona = findPersona(personas, req.id);
        if (!persona) return { ok: false, text: `"${req.name}" not found in the Agent Lab catalog.` };
        const out = await runPersona({ goal: req.goal, sources: '', persona, deps });
        const text = out.verified || out.output;
        recordRun({ prompt: req.goal, taskType: 'general', outcome: out.output ? 'success' : 'fail', summary: (out.verified || '').slice(0, 200), toolsUsed: [persona.id] });
        return { ok: !!text, text: text || 'No output — the model returned nothing.' };
    }, [user, integrations.llm]);

    // ── Conductor tier dispatch (Phase-10 B2 refactor) ─────────────────────
    // The four exact-parser tiers (spawn → chain → command → skill), extracted
    // so they can run twice: once on the raw utterance, and once on the
    // llmRouter's NORMALIZED form when the raw pass misses ("can you get the
    // strata thing up" → "open strata"). `parseText` is what the parsers see;
    // `echoText` is what appears as the user's chat message (always the raw
    // utterance, so the transcript reflects what was actually said).
    const dispatchTiers = useCallback(async (parseText: string, echoText: string): Promise<boolean> => {
        const text = parseText.trim();
        if (!text) return false;
        // Tier 1 — spawn (A1): orchestrator run hosted in chat.
        const spawnReq = parseSpawn(stripPoliteness(text));
        if (spawnReq) {
            setMessages(prev => [...prev, createChatMessage({ role: 'user', content: echoText })]);
            setInput('');
            void runSpawn(spawnReq, false);
            return true;
        }
        // Tier 2 — chain (A3): multi-step command+skill sequences.
        const chain = parseChain(text);
        if (chain) {
            const progress = createChatMessage({ role: 'assistant', content: `Running ${chain.steps.length} steps…` });
            setMessages(prev => [...prev, createChatMessage({ role: 'user', content: echoText }), progress]);
            setInput('');
            setIsLoading(true);
            try {
                const outcomes = await executeChain(chain, { llm: integrations.llm }, (i, o) => {
                    const icon = o.ok ? '✓' : '⚠';
                    updateMessageContent(progress.id, c => `${c}\n\n${icon} **Step ${i + 1}** — ${o.text}`);
                }, runSpawnForChain); // P11-3: spawn steps run the orchestrator
                const allOk = outcomes.every(o => o.ok);
                updateMessageContent(progress.id, c => `${c}\n\n${allOk ? 'All done. What would you like me to do next?' : 'Finished with hiccups — see the flagged step above.'}`);
                if (ttsEnabled && allOk) void speakText('All done.');
            } finally {
                setIsLoading(false);
            }
            return true;
        }
        // Tier 3 — One Conductor direct command.
        const cmd = parseCommand(text);
        if (cmd) {
            cmd.run();
            const ack = humanizeCommandAck(cmd.label);
            setMessages(prev => [
                ...prev,
                createChatMessage({ role: 'user', content: echoText }),
                createChatMessage({ role: 'assistant', content: ack }),
            ]);
            setInput('');
            if (ttsEnabled) void speakText(ack);
            return true;
        }
        // Tier 4 — browser-side skills.
        const skillHit = matchSkill(text);
        if (skillHit) {
            setMessages(prev => [...prev, createChatMessage({ role: 'user', content: echoText })]);
            setInput('');
            setIsLoading(true);
            try {
                const result = await skillHit.skill.run(skillHit.arg, { llm: integrations.llm });
                setMessages(prev => [...prev, createChatMessage({
                    role: 'assistant',
                    content: `${result.text}\n\nWhat would you like me to do next?`,
                })]);
                if (ttsEnabled && !result.text.startsWith('![')) void speakText(result.text);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setMessages(prev => [...prev, createChatMessage({
                    role: 'assistant',
                    content: `Hmm, that ${skillHit.skill.name.toLowerCase()} run hit a snag — ${msg}. Want me to try again?`,
                })]);
            } finally {
                setIsLoading(false);
            }
            return true;
        }
        return false;
    }, [runSpawn, runSpawnForChain, updateMessageContent, ttsEnabled, speakText, integrations.llm]);

    // ── The ONE routing pipeline (B2): exact tiers → LLM-on-miss normalized
    // re-dispatch → chat. Shared by the composer AND the ⌘K ara-prompt bus
    // so both doors behave identically.
    const routeUtterance = useCallback(async (text: string) => {
        // Pass 1 — exact parsers on the raw utterance (zero latency).
        if (await dispatchTiers(text, text)) return;
        // Pass 2 — Phase-10 B2 (heuristic-first, LLM-on-miss per Ilya's 10.6
        // call): classify fuzzy-but-actionable inputs with llmRouter and
        // re-dispatch the normalized form through the same tiers. Questions /
        // long texts skip this (looksActionable) so chat latency is unchanged.
        if (hasActiveLlm(integrations.llm) && looksActionable(text)) {
            try {
                hermesLearningUserIdHolder.current = user?.id ?? null;
                const decision = await classifyIntent(text, { llm: integrations.llm });
                recordRoutingDecision(text, decision);
                if (decision.via === 'llm' && decision.intent !== 'chat' && decision.normalized
                    && decision.normalized.trim().toLowerCase() !== text.toLowerCase()) {
                    if (await dispatchTiers(decision.normalized, text)) return;
                }
            } catch { /* classification is best-effort — fall through to chat */ }
        }
        await sendPrompt(text);
    }, [dispatchTiers, sendPrompt, integrations.llm, user]);

    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text) return;
        // Busy guard (2026-06-11 Ilya live-pass finding): while a spawn/chain/
        // skill run holds isLoading, input used to be SILENTLY swallowed —
        // "open strata" mid-team-run did nothing with zero feedback. Direct
        // commands don't touch the LLM, so run them immediately even while
        // busy; everything else gets an honest "still working" note.
        if (isLoading) {
            const busyCmd = parseCommand(text);
            if (busyCmd) {
                busyCmd.run();
                const ack = humanizeCommandAck(busyCmd.label);
                setMessages(prev => [
                    ...prev,
                    createChatMessage({ role: 'user', content: text }),
                    createChatMessage({ role: 'assistant', content: ack }),
                ]);
                setInput('');
                if (ttsEnabled) void speakText(ack);
                return;
            }
            setMessages(prev => [...prev, createChatMessage({
                role: 'assistant',
                content: "One sec — I'm still finishing the last task. I'll take that as soon as it's done (direct commands like \"open strata\" work anytime).",
            })]);
            return;
        }
        await routeUtterance(text);
    }, [input, isLoading, routeUtterance, ttsEnabled, speakText]);

    // ⌘K hand-off: the palette routes unparseable queries here ("Ask ARA").
    // Pending-slot covers the palette→ARA-mount race (lazy chunk loading).
    // Uses the SAME full pipeline as the composer — live-pass 2026-06-11
    // found the original handler skipped the LLM-on-miss leg, so fuzzy ⌘K
    // queries fell to backend chat, which CLAIMED to open widgets without
    // actually doing anything.
    useEffect(() => {
        const handler = (ev: Event) => {
            consumePendingAraPrompt(); // live event supersedes the slot
            const text = String((ev as CustomEvent).detail?.text ?? '').trim();
            if (text) void routeUtterance(text);
        };
        window.addEventListener(ARA_PROMPT_EVENT, handler);
        const pending = consumePendingAraPrompt(); // fired before ARA mounted
        if (pending) void routeUtterance(pending);
        return () => window.removeEventListener(ARA_PROMPT_EVENT, handler);
    }, [routeUtterance]);

    const retryLastRequest = useCallback(async () => {
        if (!lastRequest || isLoading) return;
        await sendPrompt(lastRequest.text, {
            retry: true,
            mode: lastRequest.mode,
            jurisdiction: lastRequest.jurisdiction,
            workspaceContext: lastRequest.workspaceContext,
        });
    }, [isLoading, lastRequest, sendPrompt]);

    // ── A3: receive a selection handoff (LINKAGE gap A3) ──────────────────
    // The Scribe-embedded AraMiniPanel listens for `scribe:send-to-ara`; until now
    // the full ARAConsole widget was blind to it. Mirror the exact contract
    // (preface + blockquoted text via composeAraPrompt) so a selection sent to ARA
    // is answered by whichever ARA surface is open. Pure composition lives in
    // araLinkage.ts; this effect is the thin DOM-listener wiring.
    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent).detail || {};
            const composed = composeAraPrompt(detail);
            if (!composed) return;
            void sendPrompt(composed);
        };
        window.addEventListener('scribe:send-to-ara', handler);
        return () => window.removeEventListener('scribe:send-to-ara', handler);
    }, [sendPrompt]);

    // ── A2: suggest "open in <widget>" handoffs from ARA's latest reply ───
    // ARA can answer about the inbox / files / docs; these chips let the user
    // jump to the referenced widget via the shared `dwellium:open-widget` bus.
    const suggestedHandoffs = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                return detectWidgetHandoffs(messages[i].content);
            }
        }
        return [];
    }, [messages]);

    const handleHandoffClick = useCallback((handoff: { widgetId: string; label: string; icon: string }) => {
        openWidgetHandoff(handoff);
        setActionStatus({ kind: 'success', message: `Opening ${handoff.label}…` });
    }, []);

    const toggleMeta = useCallback((messageId: string) => {
        setExpandedMeta(prev => ({ ...prev, [messageId]: !prev[messageId] }));
    }, []);

    const openActionComposer = useCallback((nextAction: 'note' | 'workitem') => {
        setActionStatus(null);
        setActionMode(nextAction);
        if (nextAction === 'note') {
            setNoteSubject(defaultNoteSubject);
        } else {
            setWorkitemTitle(defaultWorkitemTitle);
            setWorkitemPriority('medium');
            setWorkitemType('task');
            setWorkitemDomain('operations');
        }
    }, [defaultNoteSubject, defaultWorkitemTitle]);

    const submitConversationNote = useCallback(async () => {
        setActionLoading('note');
        setActionStatus(null);
        try {
            const res = await authFetch(`${API_ARA}/chat/to-note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionId.current,
                    subject: noteSubject.trim() || defaultNoteSubject,
                    history: exportConversation(messages),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || `Note save failed (${res.status})`);
            }
            setActionStatus({ kind: 'success', message: `Saved note ${data.data?.id || ''}`.trim() });
            setActionMode('none');
        } catch (err) {
            setActionStatus({
                kind: 'error',
                message: err instanceof Error ? err.message : 'Failed to save note',
            });
        } finally {
            setActionLoading(null);
        }
    }, [authFetch, noteSubject, defaultNoteSubject, messages]);

    const submitConversationWorkitem = useCallback(async () => {
        setActionLoading('workitem');
        setActionStatus(null);
        try {
            const res = await authFetch(`${API_ARA}/chat/to-workitem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionId.current,
                    title: workitemTitle.trim() || defaultWorkitemTitle,
                    priority: workitemPriority,
                    type: workitemType,
                    domain: workitemDomain,
                    history: exportConversation(messages),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || `Workitem creation failed (${res.status})`);
            }
            setActionStatus({ kind: 'success', message: `Created workitem ${data.data?.id || ''}`.trim() });
            setActionMode('none');
        } catch (err) {
            setActionStatus({
                kind: 'error',
                message: err instanceof Error ? err.message : 'Failed to create workitem',
            });
        } finally {
            setActionLoading(null);
        }
    }, [authFetch, workitemTitle, defaultWorkitemTitle, workitemPriority, workitemType, workitemDomain, messages]);

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
        if (mode && avatarEnabled && avatarStatus === 'connected' && anamClientRef.current) {
            const switchText = `Mode switched: ${mode.name}. ${mode.lens}`;
            anamClientRef.current.talk(switchText).catch(() => { /* ignore */ });
        }
    };

    const clearChat = () => {
        setMessages([]);
        setRequestError(null);
        setActionStatus(null);
        setActionMode('none');
        setLastRequest(null);
        authFetch(`${API_ARA}/session/${sessionId.current}`, { method: 'DELETE' }).catch(() => { });
        localStorage.removeItem(buildSessionStorageKey(activeMode));
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
                return <h5 key={i} className="ara-h3" dangerouslySetInnerHTML={{ __html: sanitizeHtml(processed.slice(4)) }} />;
            }
            if (processed.startsWith('## ')) {
                return <h4 key={i} className="ara-h2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(processed.slice(3)) }} />;
            }
            if (processed === '') return <br key={i} />;
            return <p key={i} className="ara-line" dangerouslySetInnerHTML={{ __html: sanitizeHtml(processed) }} />;
        });
    };

    const getPersonaTheme = (id: string) => PERSONA_THEMES[id] || DEFAULT_THEME;

    return (
        <div
            className={`ara-console ${sidePanel !== 'none' ? 'ara-console--paneled' : ''}`}
            style={{
                '--ara-accent': theme.accent,
                '--ara-accent-rgb': theme.accentRgb,
                '--ara-gradient': theme.gradient,
                '--ara-bg-tint': theme.bgTint,
                '--ara-side-w': sidePanel !== 'none' ? `${sideWidth}px` : '0px',
            } as React.CSSProperties}
        >
            {/* Startup intro — plays a video each time ARA opens (skippable). */}
            <AraIntroVideo />

            {/* Voice-reactive visualizer overlay — fades in only while ARA (Aura)
                is speaking; taps the live TTS audio for real audio reactivity.
                Switchable templates (Galaxy / Orb / Bars / Waveform). */}
            <VoiceVisualizer active={isSpeaking} audioRef={currentAudioRef} />

            {/* Mode Bar */}
            <div className="ara-mode-bar">
                <div className="ara-mode-selector">
                    <button
                        ref={triggerRef}
                        className={`ara-mode-trigger ${modePickerOpen ? 'ara-mode-trigger--open' : ''}`}
                        onClick={() => { setModePickerOpen(!modePickerOpen); setExpandedTooltipId(null); }}
                        title="Personas — switch ARA's lens"
                        aria-label="Personas"
                    >
                        <span className="ara-mode-eyebrow">Personas</span>
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
                                    <span className="ara-dropdown-title">Personas</span>
                                    <span className="ara-dropdown-count">{modes.length} lenses</span>
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
                                                        aria-label={isExpanded ? `Hide ${mode.name} details` : `Show ${mode.name} details`}
                                                        aria-expanded={isExpanded}
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

                <div className="ara-mode-views">
                    {([
                        { id: 'honcho', icon: '🧠', label: 'Honcho' },
                        { id: 'hermes', icon: '⚡', label: 'Hermes' },
                        { id: 'tools', icon: '🧰', label: 'Tools' },
                        { id: 'settings', icon: '⚙️', label: 'Settings' },
                    ] as { id: AraSidePanelView; icon: string; label: string }[]).map(v => (
                        <button
                            key={v.id}
                            type="button"
                            className={`ara-view-btn ${sidePanel === v.id ? 'ara-view-btn--active' : ''}`}
                            onClick={() => setSidePanel(prev => (prev === v.id ? 'none' : v.id))}
                            title={v.label}
                            aria-label={v.label}
                            aria-pressed={sidePanel === v.id}
                        >
                            <span aria-hidden>{v.icon}</span>
                            <span className="ara-view-btn__label">{v.label}</span>
                        </button>
                    ))}
                </div>

                <div className="ara-mode-status">
                    {activeMode === 'lead-counsel' && (
                        <div className="ara-jurisdiction-toggle">
                            <button
                                className={`ara-jurisdiction-btn ${jurisdiction === 'georgia' ? 'active' : ''}`}
                                onClick={() => {
                                    if (jurisdiction !== 'georgia') {
                                        setJurisdiction('georgia');
                                        setMessages(prev => [...prev, createChatMessage({
                                            role: 'assistant',
                                            content: '**Jurisdiction switched: 🍑 Georgia**\n\n_Georgia legal framework now auto-applied. All analysis will reference O.C.G.A. and Georgia case law._',
                                            mode: 'lead-counsel',
                                            entityGuardianActive: true,
                                        })]);
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
                                        setMessages(prev => [...prev, createChatMessage({
                                            role: 'assistant',
                                            content: '**Jurisdiction switched: 🌴 Florida**\n\n_Florida legal framework now auto-applied. All analysis will reference Fla. Stat. and Florida case law._',
                                            mode: 'lead-counsel',
                                            entityGuardianActive: true,
                                        })]);
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
                    <button className="ara-clear-btn" onClick={clearChat} title="Clear conversation" aria-label="Clear conversation">
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
                {messages.map((msg) => (
                    <div key={msg.id} className={`ara-message ara-message--${msg.role}`}>
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
                                    aria-label={isSpeaking ? 'Stop speaking' : 'Read message aloud'}
                                >
                                    {isSpeaking ? '⏹' : '🔊'}
                                </button>
                                {msg.hermesRunId && (
                                    <span className="ara-vote-group">
                                        <button
                                            className={`ara-vote-btn ${hermesVotes[msg.hermesRunId] === 1 ? 'ara-vote-btn--active' : ''}`}
                                            onClick={() => voteOnMessage(msg.hermesRunId!, 1)}
                                            title="Good answer — use it as a reference for similar questions"
                                            aria-label="Rate this answer up"
                                        >👍</button>
                                        <button
                                            className={`ara-vote-btn ${hermesVotes[msg.hermesRunId] === -1 ? 'ara-vote-btn--down' : ''}`}
                                            onClick={() => voteOnMessage(msg.hermesRunId!, -1)}
                                            title="Bad answer — never use it as a reference"
                                            aria-label="Rate this answer down"
                                        >👎</button>
                                    </span>
                                )}
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
                        {msg.role === 'assistant' && (msg.contextSources?.length || msg.observability) && (
                            <div className="ara-message-meta">
                                <div className="ara-message-meta-summary">
                                    {msg.contextSources?.map(source => (
                                        <span key={`${msg.id}-${source.name}`} className="ara-meta-pill">
                                            {source.name} · {source.itemCount}
                                        </span>
                                    ))}
                                    {msg.observability && (
                                        <>
                                            <span className="ara-meta-pill">Latency {msg.observability.latencyMs}ms</span>
                                            <span className="ara-meta-pill">Context {msg.observability.contextBuildMs}ms</span>
                                            <span className="ara-meta-pill">{formatProviderLabel(msg.observability.providerUsed)}</span>
                                        </>
                                    )}
                                    <button
                                        className="ara-meta-toggle"
                                        onClick={() => toggleMeta(msg.id)}
                                        title="Toggle response details"
                                    >
                                        {expandedMeta[msg.id] ? 'Hide details' : 'Details'}
                                    </button>
                                </div>
                                {expandedMeta[msg.id] && (
                                    <div className="ara-message-meta-detail">
                                        {msg.contextSources?.length ? (
                                            <div className="ara-meta-block">
                                                <strong>Context sources</strong>
                                                <ul className="ara-meta-list">
                                                    {msg.contextSources.map(source => (
                                                        <li key={`${msg.id}-${source.type}-${source.name}`}>
                                                            <span>{source.name}</span>
                                                            <span>
                                                                {source.itemCount} items{source.snippet ? ` · ${source.snippet}` : ''}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                        {msg.observability && (
                                            <div className="ara-meta-block">
                                                <strong>Request diagnostics</strong>
                                                <ul className="ara-meta-list">
                                                    <li><span>Provider</span><span>{formatProviderLabel(msg.observability.providerUsed)}</span></li>
                                                    <li><span>Latency</span><span>{msg.observability.latencyMs}ms</span></li>
                                                    <li><span>Context build</span><span>{msg.observability.contextBuildMs}ms</span></li>
                                                    {typeof msg.observability.tokensUsed === 'number' && (
                                                        <li><span>Tokens</span><span>{msg.observability.tokensUsed}</span></li>
                                                    )}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
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

            {(latestAssistantMessage || requestError || observabilitySnapshot) && (
                <div className="ara-actions-panel">
                    <div className="ara-actions-header">
                        <span>Conversation Actions</span>
                        <button
                            className="ara-actions-toggle"
                            onClick={() => setShowObservability(value => !value)}
                        >
                            {showObservability ? 'Hide observability' : 'Show observability'}
                        </button>
                    </div>
                    <div className="ara-actions-row">
                        <button
                            className="ara-action-btn"
                            onClick={() => openActionComposer('note')}
                            disabled={!latestAssistantMessage || isLoading}
                        >
                            Save As Note
                        </button>
                        <button
                            className="ara-action-btn"
                            onClick={() => openActionComposer('workitem')}
                            disabled={!latestAssistantMessage || isLoading}
                        >
                            Create Workitem
                        </button>
                        <button
                            className="ara-action-btn"
                            onClick={retryLastRequest}
                            disabled={!lastRequest || isLoading}
                        >
                            Retry Last Prompt
                        </button>
                    </div>

                    {suggestedHandoffs.length > 0 && (
                        <div className="ara-handoff-row" role="group" aria-label="Open referenced widget">
                            <span className="ara-handoff-label">Open:</span>
                            {suggestedHandoffs.map((h) => (
                                <button
                                    key={h.widgetId}
                                    type="button"
                                    className="ara-action-btn ara-handoff-btn"
                                    onClick={() => handleHandoffClick(h)}
                                    aria-label={`Open ${h.label}`}
                                >
                                    {h.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {workspaceContext && (
                        <div className="ara-action-feedback ara-action-feedback--context">
                            Pinned context: {workspaceContext.breadcrumb?.join(' > ') || workspaceContext.name}
                        </div>
                    )}

                    {thinContextWarning && (
                        <div className="ara-action-feedback ara-action-feedback--warning">
                            {thinContextWarning}
                        </div>
                    )}

                    {safetyNotice && (
                        <div className="ara-action-feedback ara-action-feedback--warning">
                            {safetyNotice}
                        </div>
                    )}

                    {requestError && (
                        <div className="ara-action-feedback ara-action-feedback--error">
                            Last request failed: {requestError}
                        </div>
                    )}

                    {actionStatus && (
                        <div className={`ara-action-feedback ${actionStatus.kind === 'success' ? 'ara-action-feedback--success' : 'ara-action-feedback--error'}`}>
                            {actionStatus.message}
                        </div>
                    )}

                    {actionMode === 'note' && (
                        <div className="ara-action-form">
                            <label className="ara-action-field">
                                <span>Note subject</span>
                                <input
                                    aria-label="Note subject"
                                    value={noteSubject}
                                    onChange={e => setNoteSubject(e.target.value)}
                                    placeholder="Conversation summary"
                                />
                            </label>
                            <div className="ara-action-form-actions">
                                <button className="ara-action-btn ara-action-btn--secondary" onClick={() => setActionMode('none')}>
                                    Cancel
                                </button>
                                <button
                                    className="ara-action-btn"
                                    onClick={submitConversationNote}
                                    disabled={actionLoading === 'note'}
                                >
                                    {actionLoading === 'note' ? 'Saving…' : 'Save Note'}
                                </button>
                            </div>
                        </div>
                    )}

                    {actionMode === 'workitem' && (
                        <div className="ara-action-form">
                            <label className="ara-action-field">
                                <span>Workitem title</span>
                                <input
                                    aria-label="Workitem title"
                                    value={workitemTitle}
                                    onChange={e => setWorkitemTitle(e.target.value)}
                                    placeholder="ARA follow-up"
                                />
                            </label>
                            <div className="ara-action-grid">
                                <label className="ara-action-field">
                                    <span>Priority</span>
                                    <select
                                        aria-label="Workitem priority"
                                        value={workitemPriority}
                                        onChange={e => setWorkitemPriority(e.target.value as 'low' | 'medium' | 'high')}
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                    </select>
                                </label>
                                <label className="ara-action-field">
                                    <span>Type</span>
                                    <select
                                        aria-label="Workitem type"
                                        value={workitemType}
                                        onChange={e => setWorkitemType(e.target.value)}
                                    >
                                        <option value="task">Task</option>
                                        <option value="work_order">Work Order</option>
                                        <option value="inspection">Inspection</option>
                                        <option value="notice">Notice</option>
                                    </select>
                                </label>
                                <label className="ara-action-field">
                                    <span>Domain</span>
                                    <select
                                        aria-label="Workitem domain"
                                        value={workitemDomain}
                                        onChange={e => setWorkitemDomain(e.target.value)}
                                    >
                                        <option value="operations">Operations</option>
                                        <option value="maintenance">Maintenance</option>
                                        <option value="leasing">Leasing</option>
                                        <option value="compliance">Compliance</option>
                                        <option value="hr">HR</option>
                                        <option value="legal">Legal</option>
                                        <option value="accounting">Accounting</option>
                                    </select>
                                </label>
                            </div>
                            <div className="ara-action-form-actions">
                                <button className="ara-action-btn ara-action-btn--secondary" onClick={() => setActionMode('none')}>
                                    Cancel
                                </button>
                                <button
                                    className="ara-action-btn"
                                    onClick={submitConversationWorkitem}
                                    disabled={actionLoading === 'workitem'}
                                >
                                    {actionLoading === 'workitem' ? 'Creating…' : 'Create Workitem'}
                                </button>
                            </div>
                        </div>
                    )}

                    {showObservability && observabilitySnapshot && (
                        <div className="ara-observability">
                            <div className="ara-observability-grid">
                                <div className="ara-observability-card">
                                    <span>Total chats</span>
                                    <strong>{observabilitySnapshot.totalChats}</strong>
                                </div>
                                <div className="ara-observability-card">
                                    <span>Avg latency</span>
                                    <strong>{observabilitySnapshot.avgLatencyMs}ms</strong>
                                </div>
                                <div className="ara-observability-card">
                                    <span>Provider failures</span>
                                    <strong>{observabilitySnapshot.providerFailures}</strong>
                                </div>
                                <div className="ara-observability-card">
                                    <span>Last provider</span>
                                    <strong>{formatProviderLabel(observabilitySnapshot.lastChat?.providerUsed)}</strong>
                                </div>
                            </div>
                            {observabilitySnapshot.lastChat && (
                                <div className="ara-observability-last">
                                    <span>Last chat:</span>
                                    <span>{observabilitySnapshot.lastChat.mode}</span>
                                    <span>{observabilitySnapshot.lastChat.latencyMs}ms</span>
                                    <span>{observabilitySnapshot.lastChat.contextSourceCount} sources</span>
                                </div>
                            )}
                            {observabilitySnapshot.recentFailures?.length ? (
                                <div className="ara-observability-failure">
                                    <strong>Last failure</strong>
                                    <span>{observabilitySnapshot.recentFailures[observabilitySnapshot.recentFailures.length - 1].mode}</span>
                                    <span>{observabilitySnapshot.recentFailures[observabilitySnapshot.recentFailures.length - 1].error}</span>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}

            {/* Input Bar */}
            <div className="ara-input-bar">
                <button
                    className={`ara-mic-btn ${micActive ? 'ara-mic-btn--active' : ''} ${micTranscribing ? 'ara-mic-btn--transcribing' : ''}`}
                    onClick={toggleMic}
                    disabled={micTranscribing || isLoading}
                    title={micActive ? 'Stop recording' : micTranscribing ? 'Transcribing…' : 'Voice input'}
                    aria-label={micActive ? 'Stop recording' : micTranscribing ? 'Transcribing voice input' : 'Start voice input'}
                    aria-pressed={micActive}
                >
                    {micTranscribing ? '⏳' : micActive ? '⏹' : '🎙️'}
                </button>
                <button
                    className={`ara-tts-btn ${ttsEnabled ? 'ara-tts-btn--on' : ''}`}
                    onClick={toggleTts}
                    title={ttsEnabled ? 'Disable auto-read replies (TTS on)' : 'Enable auto-read replies (TTS off)'}
                    aria-label={ttsEnabled ? 'Disable auto-read replies' : 'Enable auto-read replies'}
                    aria-pressed={ttsEnabled}
                >
                    {ttsEnabled ? '🔊' : '🔇'}
                </button>
                {/* Humanize toggle — when ON, prepends a warm-conversational style
                    directive to outgoing messages so ARA's replies sound human, not corporate. */}
                <button
                    className={`ara-tts-btn ${humanizeEnabled ? 'ara-tts-btn--on' : ''}`}
                    onClick={toggleHumanize}
                    title={humanizeEnabled
                        ? 'Humanize ON — replies are warm + conversational. Click to turn off.'
                        : 'Humanize OFF — replies use ARA default tone. Click to turn on.'}
                    aria-label={humanizeEnabled ? 'Turn off humanized replies' : 'Turn on humanized replies'}
                    aria-pressed={humanizeEnabled}
                    style={{ fontSize: 14 }}
                >
                    {humanizeEnabled ? '💬' : '🤖'}
                </button>
                {isSpeaking && (
                    <button
                        className="ara-mute-btn"
                        onClick={muteAra}
                        title="Mute — stop ARA speaking"
                        aria-label="Mute — stop ARA speaking"
                    >
                        ⏹
                    </button>
                )}
                <button
                    className={`ara-avatar-btn ${avatarEnabled ? 'ara-avatar-btn--active' : ''}`}
                    onClick={handleAvatarToggle}
                    title={avatarEnabled ? 'Disable AI Avatar' : 'Enable AI Avatar (requires password)'}
                    aria-label={avatarEnabled ? 'Disable AI Avatar' : 'Enable AI Avatar'}
                    aria-pressed={avatarEnabled}
                >
                    {avatarEnabled ? '🧑‍💻' : '👤'}
                </button>
                <button
                    className={`ara-voice-settings-btn ${voiceSettingsOpen ? 'ara-voice-settings-btn--active' : ''}`}
                    onClick={() => { setVoiceSettingsOpen(!voiceSettingsOpen); if (!voiceSettingsOpen) fetchVoices(); }}
                    title="Voice Settings"
                    aria-label="Voice settings"
                    aria-expanded={voiceSettingsOpen}
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
                    aria-label={`Voice gender: ${voiceGender === 'female' ? 'female' : 'male'}. Click to switch.`}
                >
                    <span className={`ara-gender-option ${voiceGender === 'female' ? 'ara-gender-option--active' : ''}`}>♀</span>
                    <span className={`ara-gender-option ${voiceGender === 'male' ? 'ara-gender-option--active' : ''}`}>♂</span>
                </button>
                <FileUploadButton
                    size="sm"
                    iconOnly
                    defaultPrompt="Analyze this document or image in the context of property management."
                    onResult={(result) => {
                        const analysisMsg = createChatMessage({
                            role: 'assistant',
                            content: `📎 **${result.originalName}** — AI Analysis\n\n${result.analysis}${result.savedDocumentId ? `\n\n✅ *Saved as document*` : ''}`,
                            mode: activeMode,
                        });
                        setMessages(prev => [...prev, analysisMsg]);
                    }}
                />
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
                    title="Send message"
                    aria-label="Send message"
                >
                    ➤
                </button>
            </div>

            {/* Voice Settings Panel */}
            {voiceSettingsOpen && (
                <div className="ara-voice-panel">
                    <div className="ara-voice-panel-header">
                        <h4>🎙️ Voice Settings</h4>
                        <button className="ara-voice-panel-close" onClick={() => setVoiceSettingsOpen(false)} title="Close voice settings" aria-label="Close voice settings">✕</button>
                    </div>

                    {/* Provider Status */}
                    <div className="ara-voice-provider">
                        <span className="ara-voice-provider-dot" style={{ background: voiceStatus?.tts?.provider === 'openai-tts' ? '#D6FE51' : voiceStatus?.tts?.provider === 'chatterbox' ? '#22c55e' : voiceStatus?.tts?.provider === 'google-cloud' ? '#3b82f6' : '#f59e0b' }} />
                        <span className="ara-voice-provider-label">
                            {voiceStatus?.tts?.provider === 'openai-tts' ? 'OpenAI TTS (Primary)'
                                : voiceStatus?.tts?.provider === 'chatterbox' ? 'Chatterbox TTS (Fallback)'
                                : voiceStatus?.tts?.provider === 'google-cloud' ? 'Google Cloud TTS'
                                    : voiceStatus?.tts?.provider === 'macos-say' ? 'macOS Say (Basic)'
                                        : 'Browser Fallback'}
                        </span>
                    </div>
                    {voiceStatus?.tts?.fallbacks?.length ? (
                        <div className="ara-voice-fallbacks">
                            Fallback chain: {voiceStatus.tts.fallbacks.map(formatProviderLabel).join(' → ')}
                        </div>
                    ) : null}

                    {/* TTS Voice Picker (2026-05-28 ARA voice arc Cycle 1) ──────
                        10-voice catalog: 6 OpenAI TTS voices + 3 enhanced macOS
                        SpeechSynthesis voices + System Default. OpenAI voices
                        require an OpenAI API key in Settings → API Keys; gated
                        with a visual hint when no key present. */}
                    <div className="ara-voice-section">
                        <h5>Voice Type</h5>
                        {!openaiApiKey && (
                            <div style={{
                                padding: '6px 10px',
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.25)',
                                borderRadius: 4,
                                color: '#f59e0b',
                                fontSize: 11,
                                marginBottom: 8,
                            }}>
                                ⚠ OpenAI voices need a key. Open Settings → API Keys to add one. Browser voices below work without a key.
                            </div>
                        )}
                        <div className="ara-voice-list">
                            {TTS_VOICE_CATALOG.map((v) => {
                                const isActive = activeVoice === v.id
                                    || (activeVoice === 'female' && v.id === 'openai-alloy')
                                    || (activeVoice === 'male' && v.id === 'openai-onyx');
                                const disabled = v.provider === 'openai' && !openaiApiKey;
                                return (
                                    <div key={v.id} className={`ara-voice-item ${isActive ? 'ara-voice-item--active' : ''}`} style={disabled ? { opacity: 0.45 } : undefined}>
                                        <button
                                            className="ara-voice-item-select"
                                            onClick={() => selectVoice(v.id)}
                                            disabled={disabled}
                                            title={disabled ? 'Requires OpenAI API key' : v.description}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left' }}
                                        >
                                            <span className="ara-voice-item-radio">{isActive ? '◉' : '○'}</span>
                                            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                                                <span className="ara-voice-item-name">
                                                    {v.provider === 'openai' ? '🌐' : '💻'} {v.label}
                                                </span>
                                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{v.description}</span>
                                            </span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Cloned voices (legacy Chatterbox backend) — only shown if any beyond default exist */}
                    {clonedVoices.length > 1 && (
                        <div className="ara-voice-section">
                            <h5>Cloned Voices</h5>
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
                                                aria-label={`Delete cloned voice ${v.id}`}
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

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
                            {avatarStatus === 'reconnecting' && `⟳ Reconnecting (${avatarRetryCount}/3)…`}
                            {avatarStatus === 'connected' && '● Live'}
                            {avatarStatus === 'disconnected' && '○ Disconnected'}
                            {avatarStatus === 'error' && '⚠ Error'}
                            {avatarStatus === 'idle' && '○ Idle'}
                        </span>
                        <button className="ara-avatar-panel-close" onClick={handleAvatarToggle} title="Close avatar panel" aria-label="Close avatar panel">✕</button>
                    </div>
                    <div className="ara-avatar-video-wrap">
                        {(avatarStatus === 'error' || avatarStatus === 'disconnected') && avatarError ? (
                            <div className="ara-avatar-error">
                                <span className="ara-avatar-error-icon">⚠️</span>
                                <p>{avatarError}</p>
                                {(avatarError.includes('ANAM_API_KEY') || avatarError.includes('not installed') || avatarError.includes('session token')) && (
                                    <p className="ara-avatar-error-hint">
                                        To set up: add <code>ANAM_API_KEY</code> and <code>ANAM_PERSONA_ID</code> to the server <code>.env</code> and run <code>npm install @anam-ai/js-sdk</code>
                                    </p>
                                )}
                                <button className="ara-avatar-reconnect-btn" onClick={manualAvatarReconnect}>
                                    Retry Avatar
                                </button>
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
                        {(avatarStatus === 'connecting' || avatarStatus === 'reconnecting') && (
                            <div className="ara-avatar-connecting">
                                <div className="ara-avatar-connecting-spinner" />
                                <span>{avatarStatus === 'reconnecting' ? 'Reconnecting CARA II…' : 'Initializing CARA II…'}</span>
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

            {/* Docked tools drawer — Honcho / Hermes / Tools / Settings, with a
                draggable divider between it and the chat. */}
            {sidePanel !== 'none' && (
                <>
                    <div
                        className="ara-side-divider"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize ARA panel"
                        onPointerDown={beginSideResize}
                    />
                    <AraSidePanel
                        view={sidePanel}
                        onSelectView={setSidePanel}
                        onClose={() => setSidePanel('none')}
                        onPrefill={(t) => { setInput(t); inputRef.current?.focus(); }}
                    />
                </>
            )}
        </div>
    );
}
