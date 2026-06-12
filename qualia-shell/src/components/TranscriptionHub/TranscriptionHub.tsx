import { useState, useRef, useEffect, useCallback, useMemo, useContext, useSyncExternalStore, ChangeEvent } from 'react';
import { MicrophoneTranscriber } from '@moonshine-ai/moonshine-js';
import { UserContext } from '../../context/UserContext';
import { embedAudio, audioBufferToMono16k, trimSilence, shouldEmbed } from './speakerEmbedder';
import { identifyWithConfidence, type EnrolledSpeaker } from './speakerLibrary';
import { speakerLibraryStore, speakerLibraryUserIdHolder, addSpeakerSample, autoEnrollUnknown, renameSpeaker, SPEAKER_RENAMED_EVENT } from './speakerLibraryStore';
import { createSpeakerSmoother } from './speakerDiarization';
import { getSpeakerSettings } from './speakerSettings';
import { LocalVoiceLibrary } from './LocalVoiceLibrary';
import './TranscriptionHub.css';
import { API_BASE } from '../../config';
import { TagInput } from '../Tags/TagInput';
import { useIntegrations } from '../../hooks/useIntegrations';
import { scanSegmentsViaLlm, buildNotebookLmQuery } from './legalShieldClient';
import { hasActiveLlm } from '../../lib/llmClient';
import { buildMatchedStatutes, dedupMatchedStatutes, formatSimilarity } from './statuteMatch';
import type { LegalScanResult as LegalScanResultLlm } from './legalShieldClient';

// Open the user's NotebookLM (preferring their Calendar Google email) with a
// pre-filled query. Mirrors NotebookLMContext.openNotebookLM but inline here so
// we don't need a hook. If no email is configured falls back to base URL.
function openNotebookLmWithQuery(googleEmail: string | null, query: string): void {
    const url = googleEmail
        ? `https://notebooklm.google.com/?authuser=${encodeURIComponent(googleEmail)}`
        : 'https://notebooklm.google.com/';
    try {
        if (typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
            // Best-effort: copy query to clipboard since NotebookLM has no
            // ?q= param. User pastes into the chat box on landing.
            void navigator.clipboard.writeText(query);
        }
    } catch { /* clipboard blocked — that's fine */ }
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
}

// Web Speech API types (vendor-prefixed in Chrome)
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}
interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((ev: SpeechRecognitionEvent) => void) | null;
    onerror: ((ev: Event & { error: string }) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
}
declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition: new () => SpeechRecognitionInstance;
    }
}

// ============================================
// TYPES
// ============================================

interface TranscriptionSegment {
    id: string;
    text: string;
    start: number;
    end: number;
    speaker: string;
    confidence: number;
    /** Neural voiceprint for this segment (for enroll-from-segment + re-matching). */
    embedding?: number[];
}

interface FactCheckResult {
    claim: string;
    verdict: 'verified' | 'disputed' | 'unverifiable' | 'partially_true';
    confidence: number;
    explanation?: string;
    sources?: string[];
}

interface LegalScanResult {
    segment: string;
    alert: 'violation' | 'legal_risk' | 'caution' | 'clear';
    statute: string;
    advice: string;
    matchedStatutes: { volumeId: string; similarity: number; excerpt: string }[];
}

interface DiscrepancyAlert {
    contradictionId: string;
    speakerName: string;
    discrepancy: string;
    severity: 'high' | 'medium' | 'low';
    originalStatement: string;
    originalTimestamp: string;
    newStatement: string;
}

interface ContradictionSegmentAlert {
    segmentText: string;
    alerts: DiscrepancyAlert[];
}

const LEGAL_ALERT_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
    violation: { icon: '⚖️', label: 'VIOLATION', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.5)' },
    legal_risk: { icon: '🛑', label: 'DO NOT ANSWER', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.5)' },
    caution: { icon: '⚠️', label: 'Caution', color: '#eab308', bg: 'rgba(234, 179, 8, 0.10)', border: 'rgba(234, 179, 8, 0.35)' },
};

interface SavedTranscription {
    id: string;
    title: string;
    segments: TranscriptionSegment[];
    factChecks: [string, FactCheckResult][];
    duration: number;
    wordCount: number;
    createdAt: number;
    summaryStatus?: 'draft' | 'pending_review' | 'approved' | 'rejected';
    approvedBy?: string;
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';
type ExportFormat = 'text' | 'srt' | 'vtt';
type TabView = 'recorder' | 'log' | 'upload' | 'meeting_manager';

const API_TRANSCRIBE = `${API_BASE}/api/transcribe`;
const API_GEORGIA_CODE = `${API_BASE}/api/georgia-code`;
const STORAGE_KEY = 'dwellium-transcription-log';
const MEETING_SCRIPT_KEY = 'dwellium-meeting-script';

const SPEAKER_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
    'User': { bg: 'rgba(214, 254, 81, 0.15)', text: '#D6FE51', ring: '#D6FE51' },
    'Speaker B': { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', ring: '#10b981' },
    'Speaker C': { bg: 'rgba(251, 146, 60, 0.15)', text: '#fb923c', ring: '#f97316' },
    'Speaker D': { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6', ring: '#ec4899' },
    'Unknown': { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af', ring: '#6b7280' },
};

function getSpeakerColor(speaker: string) {
    return SPEAKER_COLORS[speaker] || SPEAKER_COLORS['Unknown'];
}

const VERDICT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    verified: { icon: '✅', label: 'Verified', color: '#34d399' },
    disputed: { icon: '❌', label: 'Disputed', color: '#ef4444' },
    unverifiable: { icon: '⚠️', label: 'Unverifiable', color: '#fbbf24' },
    partially_true: { icon: '🔶', label: 'Partially True', color: '#fb923c' },
};

const SUMMARY_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: 'Draft', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.16)' },
    pending_review: { label: 'Pending Review', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.16)' },
    approved: { label: 'Approved', color: '#34d399', bg: 'rgba(52, 211, 153, 0.16)' },
    rejected: { label: 'Rejected', color: '#f87171', bg: 'rgba(248, 113, 113, 0.16)' },
};

// ============================================
// COMPONENT
// ============================================

// ============================================
// SPEAKER LIBRARY PANEL
// ============================================
interface SpeakerData {
    id: string;
    name: string;
    sampleCount: number;
    firstSeen: string;
    lastSeen: string;
    metadata: Record<string, any>;
}

function SpeakerLibraryPanel({ apiBase }: { apiBase: string }) {
    const [speakers, setSpeakers] = useState<SpeakerData[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [addingNew, setAddingNew] = useState(false);

    const loadSpeakers = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/speakers`);
            const json = await res.json();
            if (json.success) {
                let list = json.data as SpeakerData[];
                // Auto-seed Andy if no speakers exist
                if (list.length === 0) {
                    const seedRes = await fetch(`${apiBase}/speakers`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: 'Andy', metadata: { role: 'primary_user' } })
                    });
                    const seedJson = await seedRes.json();
                    if (seedJson.success) list = [seedJson.data];
                }
                setSpeakers(list);
            }
        } catch { /* silent */ }
        setLoading(false);
    }, [apiBase]);

    useEffect(() => { loadSpeakers(); }, [loadSpeakers]);

    const addSpeaker = async () => {
        if (!newName.trim()) return;
        try {
            const res = await fetch(`${apiBase}/speakers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            });
            const json = await res.json();
            if (json.success) {
                setSpeakers(prev => [...prev, json.data]);
                setNewName('');
                setAddingNew(false);
            }
        } catch { /* silent */ }
    };

    const renameSpeaker = async (id: string) => {
        if (!editName.trim()) return;
        try {
            const res = await fetch(`${apiBase}/speakers/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName.trim() })
            });
            const json = await res.json();
            if (json.success) {
                setSpeakers(prev => prev.map(s => s.id === id ? { ...s, name: editName.trim() } : s));
            }
        } catch { /* silent */ }
        setEditingId(null);
    };

    const removeSpeaker = async (id: string) => {
        try {
            await fetch(`${apiBase}/speakers/${id}`, { method: 'DELETE' });
            setSpeakers(prev => prev.filter(s => s.id !== id));
        } catch { /* silent */ }
    };

    const formatDate = (d: string) => {
        try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
        catch { return '—'; }
    };

    return (
        <div className="th-speaker-library">
            <button className="th-speaker-library__header" onClick={() => setExpanded(p => !p)}>
                <span className="th-speaker-library__icon">🎙️</span>
                <span className="th-speaker-library__title">Speaker Library</span>
                <span className="th-speaker-library__count">{speakers.length}</span>
                <span className="th-speaker-library__chevron">{expanded ? '▾' : '▸'}</span>
            </button>

            {expanded && (
                <div className="th-speaker-library__body">
                    {loading ? (
                        <div className="th-speaker-library__loading">Loading speakers…</div>
                    ) : speakers.length === 0 ? (
                        <div className="th-speaker-library__empty">No speakers registered yet.</div>
                    ) : (
                        <div className="th-speaker-library__list">
                            {speakers.map(sp => (
                                <div key={sp.id} className={`th-speaker-card ${sp.metadata?.role === 'primary_user' ? 'th-speaker-card--primary' : ''}`}>
                                    <div className="th-speaker-card__avatar">
                                        {sp.metadata?.role === 'primary_user' ? '👤' : '🎤'}
                                    </div>
                                    <div className="th-speaker-card__info">
                                        {editingId === sp.id ? (
                                            <div className="th-speaker-card__edit-row">
                                                <input
                                                    className="th-speaker-card__edit-input"
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') renameSpeaker(sp.id); if (e.key === 'Escape') setEditingId(null); }}
                                                    autoFocus
                                                />
                                                <button className="th-speaker-card__save-name" onClick={() => renameSpeaker(sp.id)}>✓</button>
                                                <button className="th-speaker-card__cancel-name" onClick={() => setEditingId(null)}>✕</button>
                                            </div>
                                        ) : (
                                            <span
                                                className="th-speaker-card__name"
                                                onClick={() => { setEditingId(sp.id); setEditName(sp.name); }}
                                                title="Click to rename"
                                            >
                                                {sp.name}
                                                {sp.metadata?.role === 'primary_user' && <span className="th-speaker-card__badge">Primary</span>}
                                            </span>
                                        )}
                                        <span className="th-speaker-card__meta">
                                            {sp.sampleCount} samples · Last seen {formatDate(sp.lastSeen)}
                                        </span>
                                    </div>
                                    <button
                                        className="th-speaker-card__delete"
                                        onClick={() => removeSpeaker(sp.id)}
                                        title="Remove speaker"
                                    >🗑️</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {addingNew ? (
                        <div className="th-speaker-library__add-form">
                            <input
                                className="th-speaker-library__add-input"
                                placeholder="Speaker name…"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') addSpeaker(); if (e.key === 'Escape') setAddingNew(false); }}
                                autoFocus
                            />
                            <button className="th-speaker-library__add-confirm" onClick={addSpeaker}>Add</button>
                            <button className="th-speaker-library__add-cancel" onClick={() => setAddingNew(false)}>Cancel</button>
                        </div>
                    ) : (
                        <button className="th-speaker-library__add-btn" onClick={() => setAddingNew(true)}>
                            + Add Speaker
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function TranscriptionHub() {
    // Per-user integrations (LLM + Google email used for NotebookLM deep-link)
    const { integrations } = useIntegrations();
    const googleEmail: string | null = integrations?.google?.calendar?.email ?? null;

    // --- Tab state ---
    const [activeTab, setActiveTab] = useState<TabView>('recorder');

    // --- Recording state ---
    const [state, setState] = useState<RecordingState>('idle');
    const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
    const [elapsed, setElapsed] = useState(0);
    const [sessionId] = useState(() => crypto.randomUUID());
    const [factChecks, setFactChecks] = useState<Map<string, FactCheckResult>>(new Map());
    const [recordingTime, setRecordingTime] = useState(0); // Added from diff
    const [volume, setVolume] = useState(0); // Added from diff
    const [coachingStatus, setCoachingStatus] = useState<'on_track' | 'needs_pivot' | 'danger' | null>(null);
    const [coachingFeedback, setCoachingFeedback] = useState<string>('Meeting manager standing by. Start recording.');
    const [coachingFlags, setCoachingFlags] = useState<string[]>([]);
    const [sendingChunk, setSendingChunk] = useState(false);

    // --- Dynamic Meeting Intelligence state ---
    const [meetingScript, setMeetingScript] = useState<string>(() => {
        try { return localStorage.getItem(MEETING_SCRIPT_KEY) || ''; } catch { return ''; }
    });
    const [talkingPoints, setTalkingPoints] = useState<Array<{ point: string; reason: string; priority: string }>>([]);
    const [talkingPointsLoading, setTalkingPointsLoading] = useState(false);
    const [rebuttals, setRebuttals] = useState<Array<{ theirArgument: string; suggestedRebuttal: string; strength: string }>>([]);
    const [rebuttalsLoading, setRebuttalsLoading] = useState(false);
    const [onDemandSummary, setOnDemandSummary] = useState<{ summary: string; keyPoints: string[]; unansweredQuestions: string[]; suggestedNextTopics: string[] } | null>(null);
    const [onDemandSummaryLoading, setOnDemandSummaryLoading] = useState(false);

    // --- Post-Meeting Actions state ---
    const [postMeetingLogId, setPostMeetingLogId] = useState<string | null>(null);
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
    const [aiActionItems, setAiActionItems] = useState<Array<{ description: string; assignee: string | null; priority: string }>>([]);
    const [aiActionItemsLoading, setAiActionItemsLoading] = useState(false);
    const [aiDecisions, setAiDecisions] = useState<Array<{ decision: string; madeBy: string | null; context: string }>>([]);
    const [aiDecisionsLoading, setAiDecisionsLoading] = useState(false);
    const [aiRecapEmail, setAiRecapEmail] = useState<{ subject: string; body: string } | null>(null);
    const [aiRecapEmailLoading, setAiRecapEmailLoading] = useState(false);
    const [aiRewrite, setAiRewrite] = useState<string | null>(null);
    const [aiRewriteLoading, setAiRewriteLoading] = useState(false);
    const [aiDraft, setAiDraft] = useState<{ content: string; title: string } | null>(null);
    const [aiDraftLoading, setAiDraftLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
    const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
    const [editSpeakerValue, setEditSpeakerValue] = useState('');
    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    // --- Live Fact Check state ---
    const [factCheckEnabled, setFactCheckEnabled] = useState(true);
    const [factCheckQueue, setFactCheckQueue] = useState<string[]>([]);
    const [factCheckRunning, setFactCheckRunning] = useState(false);
    const [factCheckPanelOpen, setFactCheckPanelOpen] = useState(true);

    // --- Legal Shield state ---
    const [legalShieldEnabled, setLegalShieldEnabled] = useState(true); // ON by default
    const [legalAlerts, setLegalAlerts] = useState<Map<string, LegalScanResult>>(new Map());
    const [legalScanQueue, setLegalScanQueue] = useState<string[]>([]);
    const [legalScanRunning, setLegalScanRunning] = useState(false);
    const [legalPanelOpen, setLegalPanelOpen] = useState(true);
    const [legalFlags, setLegalFlags] = useState<string[]>([]); // Added for UI consistency with coaching

    // --- Speaker Contradiction Detection state ---
    const [contradictionAlerts, setContradictionAlerts] = useState<Map<string, DiscrepancyAlert[]>>(new Map());
    const [contradictionQueue, setContradictionQueue] = useState<Array<{ speaker: string; text: string }>>([]);
    const [contradictionRunning, setContradictionRunning] = useState(false);

    // --- Live Transcription state (Web Speech API) ---
    const [liveTranscript, setLiveTranscript] = useState('');
    const [liveFinalParts, setLiveFinalParts] = useState<string[]>([]);
    const [isLiveEnabled, setIsLiveEnabled] = useState(true);
    // SSR guard: SpeechRecognition only exists in browser. Default to
    // "unsupported" server-side; client hydration with the same default is
    // fine — capability detection is then accurate on first user interaction.
    const [liveSupported] = useState(() => {
        if (typeof window === 'undefined') return false;
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    });

    // --- Cloud STT state (Leon-powered Google Cloud Speech) ---
    const [cloudSTTEnabled, setCloudSTTEnabled] = useState(false);

    // --- Moonshine AI state (default ON — captures locally without backend) ---
    const [moonshineEnabled, setMoonshineEnabled] = useState(true);
    const [moonshineLoading, setMoonshineLoading] = useState(false);
    const [moonshineReady, setMoonshineReady] = useState(false);
    const moonshineRef = useRef<MicrophoneTranscriber | null>(null);
    const moonshineSegCountRef = useRef(0);
    const moonshineStartTimeRef = useRef(0);

    // --- Speaker identification state ---
    const speakerProfilesRef = useRef<Map<string, number[]>>(new Map());
    // ── Neural speaker library (per-user, local) ──
    const userCtx = useContext(UserContext);
    speakerLibraryUserIdHolder.current = userCtx?.user?.id ?? null;
    const enrolledSpeakers = useSyncExternalStore(
        speakerLibraryStore.subscribe, speakerLibraryStore.getSnapshot, speakerLibraryStore.getServerSnapshot,
    );
    const enrolledRef = useRef<EnrolledSpeaker[]>(enrolledSpeakers);
    enrolledRef.current = enrolledSpeakers;
    const latestEmbeddingRef = useRef<number[] | null>(null);
    const smootherRef = useRef(createSpeakerSmoother({ minSwitchStreak: getSpeakerSettings().minSwitchStreak }));
    const currentSpeakerRef = useRef('User');
    const speakerCountRef = useRef(1);

    // --- Transcription Log state ---
    const [savedTranscriptions, setSavedTranscriptions] = useState<SavedTranscription[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    // --- Backend reachability (surfaced, not silently swallowed) ---
    const [backendOffline, setBackendOffline] = useState(false);

    // --- Load transcriptions from backend on mount (source of truth) ---
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API_TRANSCRIBE}/logs?limit=200`);
                setBackendOffline(!res.ok);
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data?.length > 0) {
                        // Map backend format to frontend format
                        const backendLogs: SavedTranscription[] = json.data.map((log: any) => ({
                            id: log.id,
                            title: log.title,
                            segments: log.segments || [],
                            factChecks: log.factChecks || [],
                            duration: log.duration || 0,
                            wordCount: log.wordCount || 0,
                            createdAt: new Date(log.createdAt).getTime(),
                            summaryStatus: log.summaryStatus || 'draft',
                            approvedBy: log.approvedBy || undefined,
                        }));
                        // Merge: backend is source of truth, but preserve any localStorage-only entries
                        setSavedTranscriptions(prev => {
                            const backendIds = new Set(backendLogs.map(l => l.id));
                            const localOnly = prev.filter(l => !backendIds.has(l.id));
                            return [...backendLogs, ...localOnly];
                        });
                    }
                }
            } catch (err) {
                setBackendOffline(true);
                console.warn('[TranscriptionHub] Could not load logs from backend, using localStorage fallback:', err);
            }
        })();
    }, []);

    // --- Upload state ---
    const [uploadText, setUploadText] = useState('');
    const [uploadFactResults, setUploadFactResults] = useState<FactCheckResult[]>([]);
    const [uploadChecking, setUploadChecking] = useState(false);
    const [uploadDragOver, setUploadDragOver] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'transcribing' | 'done' | 'error'>('idle');
    const [uploadFileName, setUploadFileName] = useState('');
    const [uploadFileSize, setUploadFileSize] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadTranscript, setUploadTranscript] = useState<TranscriptionSegment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Refs ---
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    // FIX 2026-06-12 (Ilya: "keeps repeating the same thing"): the old WebM
    // init-segment hack prepended chunk 0 — which contains HEADERS **AND the
    // first ~3s of AUDIO** — to every later chunk, so Whisper re-transcribed
    // the opening words with every 3s chunk → identical segments forever.
    // Chunks are now SELF-CONTAINED via a rotating recorder (below); the
    // init-segment refs are gone.
    const chunkLoopActiveRef = useRef(false);
    const chunkRotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const chunkStarterRef = useRef<(() => void) | null>(null);
    /** Claims already queued for fact-check/legal scan (dedupe). */
    const seenClaimsRef = useRef<Set<string>>(new Set());
    /** Peak RMS within the current chunk window (silence gate). */
    const chunkPeakRmsRef = useRef(0);
    const streamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animFrameRef = useRef<number>(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const transcriptEndRef = useRef<HTMLDivElement | null>(null);
    const levelDataRef = useRef<Uint8Array | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const liveRestartRef = useRef(false);
    const isProcessingContradictions = useRef(false);
    const isProcessingMeeting = useRef(false);
    const lastMeetingCheckRef = useRef(0);
    const liveRestartDelayRef = useRef(0); // tracks restart backoff ms
    const liveRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // pending restart timer
    const segmentFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null); // periodic localStorage flush

    // Persist transcription log (localStorage as fast cache)
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTranscriptions));
    }, [savedTranscriptions]);

    // ---- PERIODIC SEGMENT FLUSH (every 5 min) ----
    // Prevents memory blowup during long sessions by snapshotting segments to localStorage
    useEffect(() => {
        if (state !== 'recording') return;
        segmentFlushTimerRef.current = setInterval(() => {
            setSegments(current => {
                if (current.length > 500) {
                    // Keep last 200 segments in-memory, flush older ones to a rolling snapshot key
                    const snapshot = localStorage.getItem(`${STORAGE_KEY}-live`) || '[]';
                    let archived: TranscriptionSegment[] = [];
                    try { archived = JSON.parse(snapshot); } catch { archived = []; }
                    const toFlush = current.slice(0, current.length - 200);
                    localStorage.setItem(`${STORAGE_KEY}-live`, JSON.stringify([...archived, ...toFlush].slice(-2000)));
                    console.log(`[Transcription] Flushed ${toFlush.length} segments to storage, retaining ${200} in memory`);
                    return current.slice(-200);
                }
                return current;
            });
        }, 5 * 60 * 1000); // every 5 minutes
        return () => { if (segmentFlushTimerRef.current) clearInterval(segmentFlushTimerRef.current); };
    }, [state]);

    // ---- TIMER ----
    useEffect(() => {
        if (state === 'recording') {
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [state]);

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [segments]);

    // ---- Live Fact Check Queue Processing ----
    useEffect(() => {
        if (!factCheckEnabled || factCheckRunning || factCheckQueue.length === 0) return;

        const processQueue = async () => {
            setFactCheckRunning(true);
            const claims = [...factCheckQueue];
            setFactCheckQueue([]);

            try {
                const res = await fetch(`${API_TRANSCRIBE}/fact-check`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ claims })
                });
                const json = await res.json();
                if (json.success && json.data.results) {
                    setFactChecks(prev => {
                        const next = new Map(prev);
                        for (const r of json.data.results) {
                            next.set(r.claim, r);
                        }
                        return next;
                    });
                }
            } catch {
                // Silent — fact-checking is opportunistic
            } finally {
                setFactCheckRunning(false);
            }
        };

        const timer = setTimeout(processQueue, 1500); // Debounce fact checks
        return () => clearTimeout(timer);
    }, [factCheckQueue, factCheckEnabled, factCheckRunning]);

    // ---- Legal Shield Queue Processing ----
    // 2026-05-28: previously POSTed to a non-existent /api/georgia-code/legal-scan
    // route (silent 404). Reconnected to the user's configured LLM via the
    // shared llmClient with a Georgia-code-aware system prompt — works the
    // moment a key is added in Settings → API Keys. NotebookLM is still
    // reachable as a manual deep-consult via the "Consult NotebookLM" button.
    useEffect(() => {
        if (!legalShieldEnabled || legalScanRunning || legalScanQueue.length === 0) return;

        const processLegalQueue = async () => {
            setLegalScanRunning(true);
            const segments = [...legalScanQueue];
            setLegalScanQueue([]);

            try {
                // Path A: LLM client (preferred — works without backend)
                const llmResult = await scanSegmentsViaLlm(
                    segments.map(s => ({ segment: typeof s === 'string' ? s : (s as any).segment || String(s) })),
                    integrations.llm,
                );
                let scanResults: LegalScanResult[] | null = null;
                let scanTimeMs = llmResult?.scanTimeMs ?? 0;
                if (llmResult && llmResult.results.length > 0) {
                    // Adapt LLM-shape (code_ref, summary, suggested_action) →
                    // local-shape (statute, advice, matchedStatutes). Map
                    // alert "caution"/"violation"/"clear" through unchanged;
                    // the local type also supports "legal_risk" which we don't
                    // produce — that's fine.
                    scanResults = llmResult.results.map((r: LegalScanResultLlm): LegalScanResult => ({
                        segment: r.segment,
                        alert: r.alert,
                        statute: r.code_ref ?? '',
                        advice: r.suggested_action ?? r.summary ?? '',
                        // Cycle 9: extract ALL cited O.C.G.A. sections (primary
                        // from code_ref @ similarity 1, secondary from summary @
                        // 0.6), normalized + de-duped — was single-statute@1.
                        matchedStatutes: buildMatchedStatutes(r),
                    }));
                } else {
                    // Path B: legacy backend (in case a future route reappears)
                    try {
                        const res = await fetch(`${API_GEORGIA_CODE}/legal-scan`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ segments })
                        });
                        const json = await res.json();
                        if (json.success && json.data?.results) {
                            // Cycle 9: de-dupe backend-supplied matchedStatutes too.
                            scanResults = (json.data.results as LegalScanResult[]).map(r => ({
                                ...r,
                                matchedStatutes: dedupMatchedStatutes(r.matchedStatutes),
                            }));
                            scanTimeMs = json.data.scanTimeMs ?? 0;
                        }
                    } catch { /* backend not available — that's fine */ }
                }

                if (scanResults && scanResults.length > 0) {
                    setLegalAlerts(prev => {
                        const next = new Map(prev);
                        const currentFlags: string[] = [];
                        for (const r of scanResults!) {
                            if (r.alert !== 'clear') {
                                next.set(r.segment, r);
                                currentFlags.push(r.alert);
                            }
                        }
                        setLegalFlags(currentFlags);
                        return next;
                    });
                    console.log(`[LegalShield] Scan complete: ${scanTimeMs}ms, ${scanResults.length} segments`);
                }
            } catch (err) {
                console.warn('[LegalShield] Scan failed:', err);
            } finally {
                setLegalScanRunning(false);
            }
        };

        const timer = setTimeout(processLegalQueue, 500); // 500ms debounce
        return () => clearTimeout(timer);
    }, [legalScanQueue, legalShieldEnabled, legalScanRunning, integrations.llm]);

    // --- Contradiction Detection Queue ---
    useEffect(() => {
        if (contradictionRunning || contradictionQueue.length === 0) return;

        const processContradictionQueue = async () => {
            setContradictionRunning(true);
            const batch = [...contradictionQueue];
            setContradictionQueue([]);

            for (const item of batch) {
                try {
                    const res = await fetch(`${API_BASE}/api/transcribe/process-segment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            speaker: item.speaker,
                            text: item.text,
                        }),
                    });

                    if (res.ok) {
                        const json = await res.json() as any;
                        if (json.data?.hasContradictions && json.data.alerts?.length > 0) {
                            console.log(`[SpeakerLib] ⚠️ ${json.data.alerts.length} contradiction(s) for "${item.text.slice(0, 40)}..."`);
                            setContradictionAlerts(prev => {
                                const next = new Map(prev);
                                next.set(item.text, json.data.alerts as DiscrepancyAlert[]);
                                return next;
                            });
                        }
                    }
                } catch (err) {
                    console.warn('[SpeakerLib] Contradiction check failed:', err);
                }
            }

            setContradictionRunning(false);
        };

        const timer = setTimeout(processContradictionQueue, 1500); // 1.5s debounce
        return () => clearTimeout(timer);
    }, [contradictionQueue, contradictionRunning]);

    // ---- Meeting Manager Queue Processing ----
    // Latest meeting inputs in a ref so the poller interval is created ONCE per
    // recording session — not re-created on every `elapsed`/`segments` tick
    // (that churn was the "stuck in a loop"). This effect only updates a ref, so
    // it never triggers a re-render.
    const meetingDataRef = useRef({ segments, elapsed, meetingScript });
    meetingDataRef.current = { segments, elapsed, meetingScript };

    useEffect(() => {
        if (state !== 'recording' || backendOffline) return; // don't poll a dead backend in a loop

        const processMeetingQueue = async () => {
            if (isProcessingMeeting.current) return;
            const now = Date.now();
            if (now - lastMeetingCheckRef.current < 5000) return; // every 5s for near real-time

            const { segments: segs, elapsed: el, meetingScript: script } = meetingDataRef.current;
            const recentSegments = segs
                .filter(s => s.end >= el - 180)
                .map(s => `[${s.speaker}] ${s.text}`)
                .join('\n');
            if (!recentSegments.trim()) return;

            isProcessingMeeting.current = true;
            lastMeetingCheckRef.current = now;
            const scriptToUse = script.trim() || 'No specific script loaded. Provide general coaching: keep the speaker on topic, professional, and concise. Flag any unprofessional language or tangents.';

            try {
                const authToken = localStorage.getItem('dwellium-token') || '';
                const response = await fetch(`${API_BASE}/api/ara/meeting-manager`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
                    body: JSON.stringify({ transcript: recentSegments, scriptContent: scriptToUse }),
                });
                const json = await response.json();
                if (json.success && json.data) {
                    setCoachingStatus(json.data.status);
                    setCoachingFeedback(json.data.feedback);
                    setCoachingFlags(json.data.flags || []);
                }
            } catch (error) {
                console.error('Failed to run meeting manager scan:', error);
            } finally {
                isProcessingMeeting.current = false;
            }
        };

        const interval = setInterval(processMeetingQueue, 1000);
        return () => clearInterval(interval);
    }, [state, backendOffline]);


    // ---- UTILITY FUNCTIONS ----
    const formatTime = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const formatTimestamp = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const formatSrtTimestamp = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };

    const getSpeakerDisplayName = (speaker: string) => speakerNames[speaker] || speaker;

    // ---- SESSION STATS ----
    const stats = useMemo(() => {
        const wordCount = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).filter(w => w.length > 0).length, 0);
        const speakers = new Map<string, number>();
        for (const seg of segments) {
            const dur = seg.end - seg.start;
            speakers.set(seg.speaker, (speakers.get(seg.speaker) || 0) + dur);
        }
        const avgConfidence = segments.length > 0
            ? segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
            : 0;
        return { wordCount, speakers, avgConfidence };
    }, [segments]);

    // Fact check stats
    const factCheckStats = useMemo(() => {
        const results = Array.from(factChecks.values());
        const total = results.length;
        const verified = results.filter(r => r.verdict === 'verified').length;
        const disputed = results.filter(r => r.verdict === 'disputed').length;
        const unverifiable = results.filter(r => r.verdict === 'unverifiable').length;
        const partial = results.filter(r => r.verdict === 'partially_true').length;
        return { total, verified, disputed, unverifiable, partial };
    }, [factChecks]);

    // ---- WAVEFORM + LEVEL METER ----
    const drawWaveform = useCallback(() => {
        const analyser = analyserRef.current;
        const canvas = canvasRef.current;
        if (!analyser || !canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        if (!levelDataRef.current) levelDataRef.current = new Uint8Array(bufferLength);

        const draw = () => {
            animFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);

            let sumSquares = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = (dataArray[i] - 128) / 128;
                sumSquares += v * v;
            }
            const rms = Math.sqrt(sumSquares / bufferLength);
            setAudioLevel(Math.min(1, rms * 4));
            // 2026-06-12 silence gate: track the LOUDEST moment of the
            // current chunk window so near-silent chunks are never sent to
            // Whisper (which hallucinates "Thank you for watching" on
            // silence — YouTube training-data artifact).
            if (rms > chunkPeakRmsRef.current) chunkPeakRmsRef.current = rms;

            ctx.fillStyle = 'rgba(10, 10, 20, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, '#D6FE51');
            gradient.addColorStop(0.5, '#D6FE51');
            gradient.addColorStop(1, '#D6FE51');

            ctx.lineWidth = 2.5;
            ctx.strokeStyle = gradient;
            ctx.shadowColor = '#D6FE51';
            ctx.shadowBlur = 8;
            ctx.beginPath();

            const sliceWidth = canvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * canvas.height) / 2;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }

            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        };

        draw();
    }, []);

    // ---- API CALLS ----
    const sendAudioChunk = useCallback(async (blob: Blob) => {
        if (blob.size === 0) return;
        setSendingChunk(true);
        setError(null);

        // 2026-06-12: every blob is a SELF-CONTAINED recording (rotating
        // recorder) — no init-segment concatenation, no re-transcription.
        const audioBlob = blob;
        const currentMimeType = blob.type || mediaRecorderRef.current?.mimeType || 'audio/webm';

        const fileExt = currentMimeType.includes('mp4') ? 'mp4' : (currentMimeType.includes('aac') ? 'aac' : 'webm');

        const formData = new FormData();
        formData.append('audio', audioBlob, `recording.${fileExt}`);
        formData.append('sessionId', sessionId);
        formData.append('format', fileExt);

        try {
            // Primary: send to Whisper transcription endpoint
            // Run Cloud STT in parallel to reduce latency
            const whisperPromise = fetch(API_TRANSCRIBE, { method: 'POST', body: formData }).then(r => r.json());

            let cloudPromise: Promise<any> | null = null;
            if (cloudSTTEnabled) {
                const cloudForm = new FormData();
                cloudForm.append('audio', blob, 'recording.webm');
                cloudForm.append('language', 'en-US');
                cloudForm.append('encoding', 'WEBM_OPUS');
                cloudForm.append('sampleRate', '48000');
                cloudPromise = fetch(`${API_TRANSCRIBE}/live-stt`, { method: 'POST', body: cloudForm }).then(r => r.json()).catch(() => null);
            }

            const [json, cloudJson] = await Promise.all([whisperPromise, cloudPromise]);

            if (json.success && json.data.segments) {
                // 2026-06-12 defense-in-depth: drop Whisper's well-known
                // silence hallucinations when they are the ENTIRE segment
                // (YouTube-outro artifacts; the silence gate upstream should
                // prevent most, but breath/noise chunks can still slip by).
                const HALLUCINATIONS = /^(?:\s*(?:thank(?:s| you)(?: for watching)?|please (?:like and )?subscribe|see you (?:next time|in the next video)|bye(?:-bye)?|you|\.)[.!,\s]*)+$/i;
                const newSegs: TranscriptionSegment[] = (json.data.segments as TranscriptionSegment[])
                    .filter(s => !HALLUCINATIONS.test(s.text.trim()));
                if (newSegs.length > 0) setSegments(prev => [...prev, ...newSegs]);

                // Only clear the *interim* live transcript — NOT the final accumulated parts.
                // Previously this wiped liveFinalParts which erased all live Web Speech words.
                setLiveTranscript('');

                // Queue claims for live fact-checking (2026-06-12: deduped —
                // an identical claim is checked once per session, not once
                // per chunk it appears in)
                if (factCheckEnabled) {
                    const claimsText = newSegs.map(s => s.text)
                        .filter(t => t.length > 20 && !seenClaimsRef.current.has(t));
                    if (claimsText.length > 0) {
                        claimsText.forEach(t => seenClaimsRef.current.add(t));
                        setFactCheckQueue(prev => [...prev, ...claimsText]);
                    }
                }

                // Queue segments for legal shield scanning (same dedupe)
                if (legalShieldEnabled) {
                    const legalTexts = newSegs.map(s => s.text)
                        .filter(t => t.length > 15 && !seenClaimsRef.current.has(`legal:${t}`));
                    if (legalTexts.length > 0) {
                        legalTexts.forEach(t => seenClaimsRef.current.add(`legal:${t}`));
                        setLegalScanQueue(prev => [...prev, ...legalTexts]);
                    }
                }
            } else if (!json.success) {
                setError(json.error || 'Transcription failed');
            }

            // Handle Cloud STT result
            if (cloudJson?.success && cloudJson?.data?.text) {
                setLiveFinalParts(prev => [...prev, cloudJson.data.text]);
                setLiveTranscript('');
            }
        } catch (err) {
            console.error('Transcription API error:', err);
            setError('Backend offline — transcription pending');
            setSegments(prev => [...prev, {
                id: crypto.randomUUID(),
                text: '[Transcription pending — backend offline]',
                start: elapsed,
                end: elapsed + 10,
                speaker: 'User',
                confidence: 0
            }]);
        } finally {
            setSendingChunk(false);
        }
    }, [sessionId, elapsed, factCheckEnabled, cloudSTTEnabled, legalShieldEnabled]);

    // ---- LIVE SPEECH RECOGNITION ----
    const startLiveRecognition = useCallback(() => {
        if (!isLiveEnabled || !liveSupported) return;
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            recognition.maxAlternatives = 1;

            // 2026-06-12 duplicate-finals fix: `i >= event.resultIndex` could
            // re-append a final that fires in more than one event (Chrome
            // re-reports finals on some flushes). Track the highest final
            // index SEEN this recognition session instead — each final is
            // appended exactly once; the counter resets on (re)start because
            // the results list resets.
            let lastFinalIndex = -1;
            recognition.onstart = () => { lastFinalIndex = -1; };
            recognition.onresult = (event: SpeechRecognitionEvent) => {
                // Rebuild the full interim from ALL results in this recognition session.
                // Using only event.resultIndex causes earlier in-progress words to be
                // overwritten on each event fire, producing truncated / incorrect dictation.
                let fullInterim = '';
                for (let i = 0; i < event.results.length; i++) {
                    const result = event.results[i];
                    const transcript = result[0].transcript;
                    if (result.isFinal) {
                        if (i > lastFinalIndex) {
                            lastFinalIndex = i;
                            setLiveFinalParts(prev => [...prev, transcript.trim()]);
                            liveRestartDelayRef.current = 0;
                        }
                    } else {
                        fullInterim += transcript;
                    }
                }
                setLiveTranscript(fullInterim);
            };

            recognition.onerror = (event) => {
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.warn('[LiveTranscript] SpeechRecognition error:', event.error);
                }
                // On real errors, increase backoff so Chrome throttle is respected
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    liveRestartRef.current = false; // Stop retrying on permission errors
                }
            };

            recognition.onend = () => {
                if (!liveRestartRef.current) return;
                // Exponential backoff: 250ms → 500ms → 1s → max 3s
                // Prevents Chrome from throttling after repeated rapid restarts
                liveRestartDelayRef.current = Math.min(3000, (liveRestartDelayRef.current || 250) * 1.5);
                if (liveRestartTimerRef.current) clearTimeout(liveRestartTimerRef.current);
                liveRestartTimerRef.current = setTimeout(() => {
                    if (liveRestartRef.current) {
                        try { recognition.start(); } catch { /* already starting */ }
                    }
                }, liveRestartDelayRef.current);
            };

            recognition.start();
            recognitionRef.current = recognition;
            liveRestartRef.current = true;
            liveRestartDelayRef.current = 0;
        } catch (err) {
            console.warn('[LiveTranscript] SpeechRecognition not available:', err);
        }
    }, [isLiveEnabled, liveSupported]);

    const stopLiveRecognition = useCallback(() => {
        liveRestartRef.current = false;
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch { /* ok */ }
            recognitionRef.current = null;
        }
        setLiveTranscript('');
        setLiveFinalParts([]);
    }, []);

    // ---- SPEAKER IDENTIFICATION ----
    const identifySpeaker = useCallback((audioBuffer?: AudioBuffer): string => {
        if (!audioBuffer) return currentSpeakerRef.current;

        // Extract audio features: RMS energy, zero-crossing rate, spectral centroid approx
        const channelData = audioBuffer.getChannelData(0);
        const len = channelData.length;
        if (len === 0) return currentSpeakerRef.current;

        // RMS energy
        let sumSquares = 0;
        let zeroCrossings = 0;
        let spectralSum = 0;
        for (let i = 0; i < len; i++) {
            sumSquares += channelData[i] * channelData[i];
            if (i > 0 && ((channelData[i] >= 0 && channelData[i - 1] < 0) || (channelData[i] < 0 && channelData[i - 1] >= 0))) {
                zeroCrossings++;
            }
            spectralSum += Math.abs(channelData[i]) * i;
        }
        const rms = Math.sqrt(sumSquares / len);
        const zcr = zeroCrossings / len;
        const centroid = spectralSum / (len * (sumSquares + 0.0001));
        const features = [rms, zcr, centroid];

        // Compare against known speaker profiles
        const profiles = speakerProfilesRef.current;
        let bestMatch = '';
        let bestDist = Infinity;

        for (const [speaker, profile] of profiles) {
            const dist = Math.sqrt(
                features.reduce((sum, f, i) => sum + Math.pow(f - profile[i], 2), 0)
            );
            if (dist < bestDist) {
                bestDist = dist;
                bestMatch = speaker;
            }
        }

        // Threshold for "new speaker" detection
        const NEW_SPEAKER_THRESHOLD = 0.15;
        if (bestDist < NEW_SPEAKER_THRESHOLD && bestMatch) {
            currentSpeakerRef.current = bestMatch;
            // Update profile with running average
            const existing = profiles.get(bestMatch)!;
            profiles.set(bestMatch, existing.map((v, i) => v * 0.8 + features[i] * 0.2));
        } else {
            // New speaker detected
            const speakerNames = ['User', 'Speaker B', 'Speaker C', 'Speaker D'];
            const idx = Math.min(speakerCountRef.current, speakerNames.length - 1);
            const newSpeaker = speakerNames[idx];
            if (!profiles.has(newSpeaker)) {
                speakerCountRef.current++;
            }
            profiles.set(newSpeaker, features);
            currentSpeakerRef.current = newSpeaker;
        }

        return currentSpeakerRef.current;
    }, []);

    // Neural identification: embed the segment's audio and match it against the
    // enrolled voice library (replaces the old feature-distance heuristic).
    const identifyAndTag = useCallback(async (segId: string, buffer?: AudioBuffer) => {
        const tag = (label: string, embedding?: number[]) =>
            setSegments(prev => prev.map(s => s.id === segId
                ? { ...s, speaker: label, embedding: embedding ?? s.embedding }
                : s));
        if (!buffer) { tag(smootherRef.current.current() ?? 'Unknown'); return; }

        const settings = getSpeakerSettings();
        // #3: strip silence, then gate on duration + voiced content. Too short or
        // too quiet → don't embed (it'd be a garbage voiceprint); hold current.
        const voiced = trimSilence(audioBufferToMono16k(buffer));
        if (!shouldEmbed(voiced, 16000, { minMs: settings.minMs })) {
            tag(smootherRef.current.current() ?? 'Unknown');
            return;
        }
        let embedding: number[] | null = null;
        try { embedding = await embedAudio(voiced); } catch { /* model/audio unavailable */ }
        if (embedding) latestEmbeddingRef.current = embedding;
        // #4: margin-gated identification, then temporal smoothing.
        const detail = embedding
            ? identifyWithConfidence(embedding, enrolledRef.current, { threshold: settings.threshold, margin: settings.margin })
            : null;
        // Speaker-Library 2026-06-12 (Ilya): cross-session matching without
        // manual enrollment —
        //  (a) CONFIDENT MATCH → fold this sample into the voiceprint (the
        //      profile keeps improving with every conversation);
        //  (b) CLEAR MISS (no profile is even close) → auto-capture a
        //      provisional "Unknown Speaker N" profile, so the same person
        //      auto-matches next week; assign their real name in the library.
        //      Borderline scores enroll nothing (no library pollution).
        let label = detail?.match?.label ?? 'Unknown';
        if (embedding && detail) {
            if (detail.match && detail.best && detail.best.score >= settings.threshold + 0.05) {
                addSpeakerSample(detail.match.id, embedding);
            } else if (!detail.match && (!detail.best || detail.best.score < settings.threshold - 0.1)) {
                label = autoEnrollUnknown(embedding).label;
            }
        }
        const smoothed = smootherRef.current.push(label);
        tag(smoothed, embedding ?? undefined);
    }, []);

    // Speaker-Library 2026-06-12: renaming a speaker in the library remaps
    // the label across the LIVE session AND all SAVED transcriptions — so
    // searching the new name finds the old conversations.
    useEffect(() => {
        const handler = (ev: Event) => {
            const { oldLabel, newLabel } = (ev as CustomEvent<{ oldLabel: string; newLabel: string }>).detail || {};
            if (!oldLabel || !newLabel) return;
            setSegments(prev => prev.map(s => (s.speaker === oldLabel ? { ...s, speaker: newLabel } : s)));
            setSavedTranscriptions(prev => prev.map(log => ({
                ...log,
                segments: log.segments.map(s => (s.speaker === oldLabel ? { ...s, speaker: newLabel } : s)),
            })));
        };
        window.addEventListener(SPEAKER_RENAMED_EVENT, handler);
        return () => window.removeEventListener(SPEAKER_RENAMED_EVENT, handler);
    }, []);

    // Speaker-Library 2026-06-12: ⌘K deep-link — open a saved transcription
    // by id (the palette's transcript search results land here).
    useEffect(() => {
        const handler = (ev: Event) => {
            const id = (ev as CustomEvent<{ logId?: string }>).detail?.logId;
            if (!id) return;
            const entry = savedTranscriptions.find(log => log.id === id);
            if (entry) loadTranscription(entry);
        };
        window.addEventListener('dwellium:open-transcription-log', handler);
        return () => window.removeEventListener('dwellium:open-transcription-log', handler);
        // loadTranscription is a stable in-component fn; resubscribe on log changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedTranscriptions]);

    // ---- MOONSHINE AI TRANSCRIPTION ----
    const startMoonshine = useCallback(async () => {
        if (!moonshineEnabled) return;
        try {
            setMoonshineLoading(true);
            moonshineSegCountRef.current = 0;
            moonshineStartTimeRef.current = Date.now();
            speakerProfilesRef.current = new Map();
            currentSpeakerRef.current = 'User';
            speakerCountRef.current = 1;

            const transcriber = new MicrophoneTranscriber(
                'model/tiny',
                {
                    onModelLoadStarted() {
                        console.log('[Moonshine] Loading model...');
                    },
                    onModelLoaded() {
                        console.log('[Moonshine] Model loaded');
                        setMoonshineLoading(false);
                        setMoonshineReady(true);
                    },
                    onTranscribeStarted() {
                        console.log('[Moonshine] Transcription started');
                    },
                    onTranscribeStopped() {
                        console.log('[Moonshine] Transcription stopped');
                    },
                    onTranscriptionUpdated(text: string) {
                        // Show as live interim caption
                        setLiveTranscript(text || '');
                    },
                    onTranscriptionCommitted(text: string, buffer?: AudioBuffer) {
                        if (!text || text.trim().length === 0) return;

                        // Neural speaker identification (async): create the segment
                        // now with a provisional label, then embed the voice and match
                        // it against the enrolled library; identifyAndTag updates it.
                        const speaker = 'Unknown';
                        const segId = crypto.randomUUID();
                        const now = Date.now();
                        const startSec = (now - moonshineStartTimeRef.current) / 1000;
                        moonshineSegCountRef.current++;

                        const segment: TranscriptionSegment = {
                            id: segId,
                            text: text.trim(),
                            start: Math.max(0, startSec - 3),
                            end: startSec,
                            speaker,
                            confidence: 0.92, // Moonshine typically has high accuracy
                        };

                        setSegments(prev => [...prev, segment]);
                        void identifyAndTag(segId, buffer);
                        setLiveTranscript('');
                        setLiveFinalParts([]);

                        // Queue for fact-checking
                        if (factCheckEnabled && text.length > 20) {
                            setFactCheckQueue(prev => [...prev, text]);
                        }

                        // Queue for legal shield
                        if (legalShieldEnabled && text.length > 15) {
                            setLegalScanQueue(prev => [...prev, text]);
                        }

                        // Queue for speaker contradiction detection
                        if (text.length > 15) {
                            setContradictionQueue(prev => [...prev, { speaker, text: text.trim() }]);
                        }
                    },
                    onError(error: any) {
                        console.error('[Moonshine] Error:', error);
                        setError(`Moonshine error: ${error}`);
                        setMoonshineLoading(false);
                    },
                    onSpeechStart() {
                        // Visual indicator could go here
                    },
                    onSpeechEnd() {
                        // Visual indicator could go here
                    },
                },
                true, // useVAD
                'quantized'
            );

            moonshineRef.current = transcriber;
            await transcriber.start();
        } catch (err) {
            console.error('[Moonshine] Failed to start:', err);
            setError('Hardware AI transcription unavailable. Falling back to Browser STT.');
            setMoonshineLoading(false);
            setMoonshineEnabled(false);
            // Fallback to native browser recognition
            startLiveRecognition();
        }
    }, [moonshineEnabled, factCheckEnabled, identifySpeaker, identifyAndTag, legalShieldEnabled, setContradictionQueue]);

    const stopMoonshine = useCallback(() => {
        if (moonshineRef.current) {
            try {
                moonshineRef.current.stop();
            } catch { /* ok */ }
            moonshineRef.current = null;
        }
        setMoonshineReady(false);
        setMoonshineLoading(false);
    }, []);

    // ---- RECORDING ----
    const startRecording = async () => {
        try {
            setError(null);
            setElapsed(0);
            setSegments([]);
            setFactChecks(new Map());
            setLiveTranscript('');
            setLiveFinalParts([]);
            audioChunksRef.current = [];
            seenClaimsRef.current.clear(); // per-session fact-check dedupe
            setCoachingStatus(null); // Reset coaching state
            setCoachingFeedback('Meeting manager standing by. Start recording.');
            setCoachingFlags([]);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioCtx = new AudioContext();
            audioCtxRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;

            if (canvasRef.current) {
                canvasRef.current.width = canvasRef.current.offsetWidth * 2;
                canvasRef.current.height = canvasRef.current.offsetHeight * 2;
            }
            drawWaveform();

            let mimeType = '';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                mimeType = 'audio/aac';
            }

            const options = mimeType ? { mimeType } : undefined;

            // 2026-06-12 rotating recorder: record ~6s, stop (yields ONE
            // self-contained file with its own headers), send it, start the
            // next. Replaces start(3000) timeslice + init-segment concat —
            // the mechanism behind the repeated-segments bug.
            const startChunkRecorder = () => {
                const rec = new MediaRecorder(stream, options);
                mediaRecorderRef.current = rec;
                const parts: Blob[] = [];
                rec.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
                rec.onstop = () => {
                    if (chunkRotateTimerRef.current) { clearTimeout(chunkRotateTimerRef.current); chunkRotateTimerRef.current = null; }
                    // Silence gate (2026-06-12): a chunk whose loudest moment
                    // never rose above the floor is silence — Whisper
                    // hallucinates on it ("Thank you for watching"). Skip it.
                    const hadSpeech = chunkPeakRmsRef.current >= 0.015;
                    chunkPeakRmsRef.current = 0; // reset for the next window
                    if (parts.length > 0 && hadSpeech) {
                        const blob = new Blob(parts, { type: rec.mimeType || mimeType || 'audio/webm' });
                        audioChunksRef.current.push(blob);
                        void sendAudioChunk(blob);
                    }
                    if (chunkLoopActiveRef.current) startChunkRecorder();
                };
                rec.start();
                chunkRotateTimerRef.current = setTimeout(() => {
                    if (rec.state === 'recording') rec.stop();
                }, 6000);
            };
            chunkStarterRef.current = startChunkRecorder;
            chunkLoopActiveRef.current = true;
            startChunkRecorder();
            setState('recording');
            setActiveTab('recorder');

            // Start live transcription
            if (moonshineEnabled) {
                void startMoonshine();
            } else {
                startLiveRecognition();
            }
        } catch (err) {
            console.error('Microphone access denied:', err);
            setError('Microphone access denied. Please allow microphone permissions.');
        }
    };

    const pauseRecording = () => {
        if (state !== 'recording') return;
        // Rotating recorder: pause = stop the loop (current chunk flushes +
        // transcribes) without releasing the mic stream.
        chunkLoopActiveRef.current = false;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setState('paused');
        // Pause live transcription
        stopLiveRecognition();
        stopMoonshine();
    };

    const resumeRecording = () => {
        if (state !== 'paused') return;
        chunkLoopActiveRef.current = true;
        chunkStarterRef.current?.();
        setState('recording');
        // Resume live transcription
        if (moonshineEnabled) {
            void startMoonshine();
        } else {
            startLiveRecognition();
        }
    };

    const stopRecording = () => {
        chunkLoopActiveRef.current = false; // rotating loop ends; final chunk flushes
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => { });
            audioCtxRef.current = null;
        }
        cancelAnimationFrame(animFrameRef.current);
        analyserRef.current = null;
        setAudioLevel(0);
        setState('idle');

        // Stop live transcription
        stopLiveRecognition();
        stopMoonshine();

        // Auto-save transcription to log
        if (segments.length > 0) {
            saveTranscription();
        }
    };

    // ---- SAVE TRANSCRIPTION ----
    const saveTranscription = useCallback(() => {
        if (segments.length === 0) return;
        const wordCount = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).filter(w => w.length > 0).length, 0);
        const entryId = crypto.randomUUID();
        const entry: SavedTranscription = {
            id: entryId,
            title: `Recording — ${new Date().toLocaleString()}`,
            segments: [...segments],
            factChecks: Array.from(factChecks.entries()),
            duration: elapsed,
            wordCount,
            createdAt: Date.now(),
            summaryStatus: 'draft',
        };
        // Save to local state immediately
        setSavedTranscriptions(prev => [entry, ...prev]);

        // Persist to backend (async, fire-and-forget)
        fetch(`${API_TRANSCRIBE}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: entryId,
                title: entry.title,
                segments: entry.segments,
                factChecks: entry.factChecks,
                duration: entry.duration,
                wordCount: entry.wordCount,
            }),
        }).then(res => {
            if (res.ok) console.log('[TranscriptionHub] Log saved to backend');
            else console.warn('[TranscriptionHub] Backend save failed:', res.status);
        }).catch(err => {
            console.warn('[TranscriptionHub] Backend save error:', err);
        });
    }, [segments, factChecks, elapsed]);

    // ---- LOAD TRANSCRIPTION FROM LOG ----
    const loadTranscription = (entry: SavedTranscription) => {
        setSegments(entry.segments);
        setFactChecks(new Map(entry.factChecks));
        setElapsed(entry.duration);
        setActiveTab('recorder');
        // Cycle 8: re-run Legal Shield on a LOADED transcript so matched statutes
        // are reachable when REVIEWING a saved recording. Previously the legal
        // scan only fired during live mic transcription (the moonshine / cloud-STT
        // segment paths enqueued each new segment) — opening a past transcript set
        // the segments but never queued a scan, leaving the matched-statute UI
        // permanently dead for the review flow. Enqueue the segment texts using
        // the SAME length gate as the live path (text.length > 15). The scan
        // effect drains the queue and only calls the LLM when Legal Shield is on
        // AND a provider is active, so this is a no-op offline (correct).
        if (legalShieldEnabled) {
            const texts = entry.segments
                .map(s => s.text)
                .filter(t => typeof t === 'string' && t.trim().length > 15);
            if (texts.length > 0) setLegalScanQueue(prev => [...prev, ...texts]);
        }
    };

    // ---- DELETE TRANSCRIPTION ----
    const deleteTranscription = (id: string) => {
        setSavedTranscriptions(prev => prev.filter(t => t.id !== id));

        // Delete from backend (async, fire-and-forget)
        fetch(`${API_TRANSCRIBE}/logs/${id}`, { method: 'DELETE' })
            .then(res => {
                if (res.ok) console.log('[TranscriptionHub] Log deleted from backend');
            })
            .catch(err => console.warn('[TranscriptionHub] Backend delete error:', err));
    };

    const showToastMessage = useCallback((message: string) => {
        window.dispatchEvent(new CustomEvent('qualia-toast', { detail: message }));
    }, []);

    const updateSavedLog = useCallback((logId: string, patch: Partial<SavedTranscription>) => {
        setSavedTranscriptions(prev => prev.map(log => log.id === logId ? { ...log, ...patch } : log));
    }, []);

    const exportLogToNote = useCallback(async (logId: string) => {
        const entry = savedTranscriptions.find(log => log.id === logId);
        if (!entry) return;
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/to-note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: `Transcript: ${entry.title}` }),
            });
            const json = await res.json();
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || `Note export failed (${res.status})`);
            }
            showToastMessage('📝 Transcript saved as note');
        } catch (err) {
            showToastMessage(`❌ ${err instanceof Error ? err.message : 'Failed to save transcript as note'}`);
        }
    }, [savedTranscriptions, showToastMessage]);

    const exportLogToWorkitem = useCallback(async (logId: string) => {
        const entry = savedTranscriptions.find(log => log.id === logId);
        if (!entry) return;
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/to-workitem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `Follow-up: ${entry.title}`,
                    type: 'task',
                    priority: 'medium',
                    domain: 'operations',
                }),
            });
            const json = await res.json();
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || `Workitem export failed (${res.status})`);
            }
            showToastMessage('✅ Transcript exported to workitem');
        } catch (err) {
            showToastMessage(`❌ ${err instanceof Error ? err.message : 'Failed to export transcript to workitem'}`);
        }
    }, [savedTranscriptions, showToastMessage]);

    const setTranscriptReviewStatus = useCallback(async (
        logId: string,
        status: 'approved' | 'rejected' | 'pending_review'
    ) => {
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const json = await res.json();
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || `Approval update failed (${res.status})`);
            }
            updateSavedLog(logId, {
                summaryStatus: json.data?.summaryStatus || status,
                approvedBy: json.data?.approvedBy,
            });
            const label = status === 'pending_review' ? 'marked pending review' : `marked ${status}`;
            showToastMessage(`📋 Transcript ${label}`);
        } catch (err) {
            showToastMessage(`❌ ${err instanceof Error ? err.message : 'Failed to update transcript review state'}`);
        }
    }, [showToastMessage, updateSavedLog]);

    // ---- UPLOAD & FACT CHECK ----
    const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'flac', 'webm', 'mp4', 'ogg', 'aac', 'wma'];
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const isAudioFile = (file: File) => {
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) return true;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        return AUDIO_EXTENSIONS.includes(ext);
    };

    const processUploadedFile = useCallback(async (file: File) => {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            setUploadError(`File too large: ${formatFileSize(file.size)}. Maximum is 500MB.`);
            setUploadStatus('error');
            return;
        }
        if (file.size === 0) {
            setUploadError('File is empty.');
            setUploadStatus('error');
            return;
        }

        setUploadFileName(file.name);
        setUploadFileSize(file.size);
        setUploadError(null);
        setUploadTranscript([]);
        setUploadFactResults([]);

        if (isAudioFile(file)) {
            // --- AUDIO FILE: Upload to transcription API ---
            setUploadStatus('uploading');
            setUploadProgress(0);

            const ext = file.name.split('.').pop()?.toLowerCase() || 'webm';
            const formData = new FormData();
            formData.append('audio', file, file.name);
            formData.append('sessionId', crypto.randomUUID());
            formData.append('format', ext);

            try {
                // Use XHR for upload progress tracking
                const result = await new Promise<any>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', API_TRANSCRIBE);

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const pct = Math.round((e.loaded / e.total) * 100);
                            setUploadProgress(pct);
                        }
                    };

                    xhr.upload.onload = () => {
                        setUploadStatus('transcribing');
                        setUploadProgress(100);
                    };

                    xhr.onload = () => {
                        try {
                            const json = JSON.parse(xhr.responseText);
                            if (xhr.status >= 200 && xhr.status < 300) {
                                resolve(json);
                            } else {
                                reject(new Error(json.error || `Server returned ${xhr.status}`));
                            }
                        } catch {
                            reject(new Error(`Invalid response (HTTP ${xhr.status})`));
                        }
                    };

                    xhr.onerror = () => reject(new Error('Network error — backend may be offline'));
                    xhr.ontimeout = () => reject(new Error('Upload timed out'));
                    xhr.timeout = 300000; // 5 min timeout for large files

                    xhr.send(formData);
                });

                if (result.success && result.data?.segments) {
                    setUploadTranscript(result.data.segments);
                    const fullText = result.data.segments.map((s: any) => s.text).join(' ');
                    setUploadText(fullText);
                    setUploadStatus('done');
                } else if (result.success && result.data?.fullText) {
                    setUploadText(result.data.fullText);
                    setUploadStatus('done');
                } else {
                    throw new Error(result.error || 'Transcription returned no results');
                }
            } catch (err: any) {
                setUploadError(err.message || 'Upload failed');
                setUploadStatus('error');
            }
        } else {
            // --- TEXT FILE: Read directly ---
            setUploadStatus('uploading');
            setUploadProgress(50);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target?.result as string || '';
                setUploadText(text);
                setUploadStatus('done');
                setUploadProgress(100);
            };
            reader.onerror = () => {
                setUploadError('Failed to read file');
                setUploadStatus('error');
            };
            reader.readAsText(file);
        }
    }, []);

    const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processUploadedFile(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ---- ACTION STATUS BAR STATE ----
    const [actionStatus, setActionStatus] = useState<{
        type: 'loading' | 'success' | 'error' | 'info';
        message: string;
        detail?: string;
    } | null>(null);

    const runUploadFactCheck = async () => {
        if (!uploadText.trim()) return;
        if (uploadText.trim().length < 30) {
            setActionStatus({ type: 'error', message: 'Text too short for fact checking', detail: 'Please provide at least a few complete sentences.' });
            return;
        }
        setUploadChecking(true);
        setUploadFactResults([]);
        setActionStatus({ type: 'loading', message: 'Extracting claims and verifying with AI…' });
        try {
            // Send full text — the backend extracts verifiable claims via trigger detection
            const res = await fetch(`${API_TRANSCRIBE}/fact-check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: uploadText })
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => null);
                throw new Error(errJson?.error || `Server error ${res.status}`);
            }
            const json = await res.json();
            if (json.success && json.data.results) {
                setUploadFactResults(json.data.results);
                const verdicts = json.data.results.reduce((acc: any, r: any) => {
                    acc[r.verdict] = (acc[r.verdict] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

                // Check if ALL results are unverifiable
                const allUnverifiable = json.data.results.length > 0 &&
                    json.data.results.every((r: any) => r.verdict === 'unverifiable');

                if (allUnverifiable) {
                    setActionStatus({
                        type: 'info',
                        message: `All ${json.data.results.length} claims are unverifiable`,
                        detail: 'This text appears to contain personal/conversational content rather than factual claims. Try text with dates, statistics, or specific facts.'
                    });
                } else {
                    const parts = [
                        verdicts.verified && `✅ ${verdicts.verified} verified`,
                        verdicts.disputed && `❌ ${verdicts.disputed} disputed`,
                        verdicts.partially_true && `⚠️ ${verdicts.partially_true} partial`,
                        verdicts.unverifiable && `❓ ${verdicts.unverifiable} unverifiable`,
                    ].filter(Boolean);
                    setActionStatus({ type: 'success', message: `Fact check complete — ${parts.join(', ')}` });
                }
            } else {
                throw new Error(json.error || 'Unexpected response format');
            }
        } catch (err) {
            const msg = (err as Error).message || 'Unknown error';
            setActionStatus({ type: 'error', message: 'Fact check failed', detail: msg });
        } finally {
            setUploadChecking(false);
            // Auto-dismiss success/info after 12s
            setTimeout(() => setActionStatus(prev =>
                (prev?.type === 'success' || prev?.type === 'info') ? null : prev
            ), 12000);
        }
    };

    // ---- SPEAKER RENAME ----
    const startEditSpeaker = (speaker: string) => {
        setEditingSpeaker(speaker);
        setEditSpeakerValue(getSpeakerDisplayName(speaker));
    };

    const saveSpeakerName = () => {
        if (editingSpeaker && editSpeakerValue.trim()) {
            const newName = editSpeakerValue.trim();
            setSpeakerNames(prev => ({ ...prev, [editingSpeaker]: newName }));
            // Speaker-Library fix 2026-06-12 (Ilya: "typed my name … couldn't
            // pull it up"): this editor used to update ONLY a session display
            // map — the library voiceprint and the SAVED log kept the old
            // label, so ⌘K name-search found nothing. Renaming here now
            // propagates everywhere:
            //  1. the library profile (future sessions auto-label correctly),
            //     via renameSpeaker → which fires SPEAKER_RENAMED_EVENT →
            //     remaps live segments + every saved transcription;
            //  2. when no profile carries this label (e.g. legacy 'User'
            //     heuristic tags), remap the segments + saved logs directly.
            const profile = speakerLibraryStore.getSnapshot().find(s => s.label === editingSpeaker);
            if (profile) {
                renameSpeaker(profile.id, newName);
            } else if (editingSpeaker !== newName) {
                setSegments(prev => prev.map(s => (s.speaker === editingSpeaker ? { ...s, speaker: newName } : s)));
                setSavedTranscriptions(prev => prev.map(log => ({
                    ...log,
                    segments: log.segments.map(s => (s.speaker === editingSpeaker ? { ...s, speaker: newName } : s)),
                })));
            }
        }
        setEditingSpeaker(null);
    };

    // ---- EXPORT ----
    const getTranscriptText = (format: ExportFormat) => {
        switch (format) {
            case 'srt':
                return segments.map((s, i) =>
                    `${i + 1}\n${formatSrtTimestamp(s.start)} --> ${formatSrtTimestamp(s.end)}\n${getSpeakerDisplayName(s.speaker)}: ${s.text}\n`
                ).join('\n');
            case 'vtt':
                return `WEBVTT\n\n` + segments.map(s =>
                    `${formatSrtTimestamp(s.start).replace(',', '.')} --> ${formatSrtTimestamp(s.end).replace(',', '.')}\n${getSpeakerDisplayName(s.speaker)}: ${s.text}\n`
                ).join('\n');
            case 'text':
            default:
                return segments
                    .map(s => `[${formatTimestamp(s.start)}] ${getSpeakerDisplayName(s.speaker)}: ${s.text}`)
                    .join('\n');
        }
    };

    const exportTranscript = (format: ExportFormat) => {
        const text = getTranscriptText(format);
        navigator.clipboard.writeText(text);
        setExportMenuOpen(false);
    };

    const downloadRecording = () => {
        if (audioChunksRef.current.length === 0) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const saveAsNote = async () => {
        const content = segments
            .map(s => `**[${formatTimestamp(s.start)}] ${getSpeakerDisplayName(s.speaker)}:** ${s.text}`)
            .join('\n\n');
        try {
            await fetch(`${API_BASE}/api/files/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `Transcript — ${new Date().toLocaleDateString()}`,
                    content
                })
            });
        } catch {
            navigator.clipboard.writeText(content);
        }
    };

    const saveToFileManager = async () => {
        const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const title = `Transcript_${ts}`;
        // Build markdown content
        let md = `# Transcription — ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n\n`;
        md += `**Duration:** ${formatTimestamp(elapsed)} | **Segments:** ${segments.length} | **Words:** ${stats.wordCount}\n\n---\n\n`;
        for (const s of segments) {
            md += `**[${formatTimestamp(s.start)}] ${getSpeakerDisplayName(s.speaker)}:** ${s.text}\n\n`;
        }
        // Append fact checks if any
        if (factChecks.size > 0) {
            md += `---\n\n## Fact Checks\n\n`;
            factChecks.forEach((result, claim) => {
                md += `- **${result.verdict.toUpperCase()}** (${Math.round(result.confidence * 100)}%) — ${claim}\n`;
                if (result.explanation) md += `  ${result.explanation}\n`;
                md += `\n`;
            });
        }
        // Upload as file
        const blob = new Blob([md], { type: 'text/markdown' });
        const formData = new FormData();
        formData.append('file', blob, `${title}.md`);
        try {
            const resp = await fetch(`${API_BASE}/api/files/upload`, { method: 'POST', body: formData });
            const data = await resp.json();
            if (data.success) {
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `📁 Transcript saved to File Manager` }));
            } else {
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `❌ Save failed: ${data.error}` }));
            }
        } catch (err) {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `❌ Upload error` }));
        }
    };

    const saveUploadDocumentToFiles = useCallback(async () => {
        const content = uploadText.trim()
            || uploadTranscript.map(s => `[${formatTimestamp(s.start)}] ${getSpeakerDisplayName(s.speaker)}: ${s.text}`).join('\n');
        if (!content.trim()) return;

        const baseName = uploadFileName
            ? uploadFileName.replace(/\.[^.]+$/, '')
            : `transcription-upload-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`;

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const formData = new FormData();
        formData.append('file', blob, `${baseName}.txt`);

        try {
            const resp = await fetch(`${API_BASE}/api/files/upload`, { method: 'POST', body: formData });
            const data = await resp.json();
            if (!resp.ok || !data?.success) {
                throw new Error(data?.error || `Upload failed (${resp.status})`);
            }
            setActionStatus({ type: 'success', message: 'Transcript saved into Files' });
            showToastMessage('📁 Upload transcript saved to Files');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save upload document';
            setActionStatus({ type: 'error', message: 'Save failed', detail: message });
        }
    }, [uploadText, uploadTranscript, uploadFileName, showToastMessage]);

    // ============================================
    // MEETING INTELLIGENCE FUNCTIONS
    // ============================================

    // Persist meeting script to localStorage
    useEffect(() => {
        try { localStorage.setItem(MEETING_SCRIPT_KEY, meetingScript); } catch { /* ok */ }
    }, [meetingScript]);

    // Build transcript string for intelligence queries
    const getRecentTranscriptStr = useCallback((minutes: number = 5) => {
        const cutoff = elapsed - (minutes * 60);
        return segments
            .filter(s => s.end >= cutoff)
            .map(s => `[${getSpeakerDisplayName(s.speaker)}]: ${s.text}`)
            .join('\n');
    }, [segments, elapsed]);

    const fetchTalkingPoints = useCallback(async () => {
        if (!meetingScript.trim()) return;
        setTalkingPointsLoading(true);
        try {
            const transcript = getRecentTranscriptStr();
            const res = await fetch(`${API_TRANSCRIBE}/meeting/talking-points`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript, scriptContent: meetingScript })
            });
            const json = await res.json();
            if (json.success) setTalkingPoints(json.data);
        } catch (err) { console.error('[TalkingPoints]', err); }
        setTalkingPointsLoading(false);
    }, [meetingScript, getRecentTranscriptStr]);

    const fetchRebuttals = useCallback(async () => {
        if (!meetingScript.trim()) return;
        setRebuttalsLoading(true);
        try {
            const transcript = getRecentTranscriptStr();
            const res = await fetch(`${API_TRANSCRIBE}/meeting/rebuttals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript, scriptContent: meetingScript })
            });
            const json = await res.json();
            if (json.success) setRebuttals(json.data);
        } catch (err) { console.error('[Rebuttals]', err); }
        setRebuttalsLoading(false);
    }, [meetingScript, getRecentTranscriptStr]);

    const fetchOnDemandSummary = useCallback(async () => {
        setOnDemandSummaryLoading(true);
        try {
            const transcript = getRecentTranscriptStr();
            const res = await fetch(`${API_TRANSCRIBE}/meeting/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript })
            });
            const json = await res.json();
            if (json.success) setOnDemandSummary(json.data);
        } catch (err) { console.error('[OnDemandSummary]', err); }
        setOnDemandSummaryLoading(false);
    }, [getRecentTranscriptStr]);

    // ============================================
    // POST-MEETING ACTION FUNCTIONS
    // ============================================

    const fetchAiSummary = useCallback(async (logId: string) => {
        setAiSummaryLoading(true);
        setAiSummary(null);
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'detailed' })
            });
            const json = await res.json();
            if (json.success) setAiSummary(json.data.summary);
        } catch (err) { console.error('[AiSummary]', err); }
        setAiSummaryLoading(false);
    }, []);

    const fetchAiActionItems = useCallback(async (logId: string) => {
        setAiActionItemsLoading(true);
        setAiActionItems([]);
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/action-items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const json = await res.json();
            if (json.success) setAiActionItems(json.data);
        } catch (err) { console.error('[AiActionItems]', err); }
        setAiActionItemsLoading(false);
    }, []);

    const fetchAiDecisions = useCallback(async (logId: string) => {
        setAiDecisionsLoading(true);
        setAiDecisions([]);
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const json = await res.json();
            if (json.success) setAiDecisions(json.data);
        } catch (err) { console.error('[AiDecisions]', err); }
        setAiDecisionsLoading(false);
    }, []);

    const fetchAiRecapEmail = useCallback(async (logId: string) => {
        setAiRecapEmailLoading(true);
        setAiRecapEmail(null);
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/recap-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meetingTitle: savedTranscriptions.find(t => t.id === logId)?.title || 'Meeting' })
            });
            const json = await res.json();
            if (json.success) setAiRecapEmail(json.data);
        } catch (err) { console.error('[RecapEmail]', err); }
        setAiRecapEmailLoading(false);
    }, [savedTranscriptions]);

    const fetchAiRewrite = useCallback(async (logId: string, tone: string) => {
        setAiRewriteLoading(true);
        setAiRewrite(null);
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/rewrite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tone })
            });
            const json = await res.json();
            if (json.success) setAiRewrite(json.data.content);
        } catch (err) { console.error('[AiRewrite]', err); }
        setAiRewriteLoading(false);
    }, []);

    const fetchAiDraft = useCallback(async (logId: string, documentType: string) => {
        setAiDraftLoading(true);
        setAiDraft(null);
        try {
            const res = await fetch(`${API_TRANSCRIBE}/logs/${logId}/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentType })
            });
            const json = await res.json();
            if (json.success) setAiDraft({ content: json.data.content, title: json.data.title });
        } catch (err) { console.error('[AiDraft]', err); }
        setAiDraftLoading(false);
    }, []);

    const openPostMeetingPanel = useCallback((logId: string) => {
        setPostMeetingLogId(logId);
        setAiSummary(null);
        setAiActionItems([]);
        setAiDecisions([]);
        setAiRecapEmail(null);
        setAiRewrite(null);
        setAiDraft(null);
    }, []);

    // ---- CLEANUP ----
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => { });
            }
            cancelAnimationFrame(animFrameRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            // Cleanup live recognition
            liveRestartRef.current = false;
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch { /* ok */ }
            }
            // Cleanup Moonshine
            if (moonshineRef.current) {
                try { moonshineRef.current.stop(); } catch { /* ok */ }
            }
        };
    }, []);

    // Detect speaker turn changes for visual grouping
    const isNewSpeaker = (i: number) => i === 0 || segments[i].speaker !== segments[i - 1].speaker;

    // ---- RENDER ----
    return (
        <div className="transcription-hub">
            {backendOffline && (
                <div role="status" style={{ padding: '8px 14px', background: 'rgba(251,191,36,0.12)', borderBottom: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24', fontSize: 12.5 }}>
                    ⚠ Backend transcription is offline — live/local capture still works, but upload &amp; saved logs need the backend running. Check <strong>System Health</strong> to reconnect.
                </div>
            )}
            {/* ========== TAB BAR ========== */}
            <div className="th-tabs">
                <button
                    className={`th-tabs__btn ${activeTab === 'recorder' ? 'th-tabs__btn--active' : ''}`}
                    onClick={() => setActiveTab('recorder')}
                >
                    🎙️ Recorder
                </button>
                <button
                    className={`th-tabs__btn ${activeTab === 'log' ? 'th-tabs__btn--active' : ''}`}
                    onClick={() => setActiveTab('log')}
                >
                    📋 Log {savedTranscriptions.length > 0 && <span className="th-tabs__badge">{savedTranscriptions.length}</span>}
                </button>
                <button
                    className={`th-tabs__btn ${activeTab === 'upload' ? 'th-tabs__btn--active' : ''}`}
                    onClick={() => setActiveTab('upload')}
                >
                    📤 Upload
                </button>
                <button
                    className={`th-tabs__btn ${activeTab === 'meeting_manager' ? 'th-tabs__btn--active' : ''}`}
                    onClick={() => setActiveTab('meeting_manager')}
                >
                    🎯 Live Coaching
                    {coachingStatus === 'danger' && <span className="th-tabs__badge th-tabs__badge--danger">!</span>}
                    {coachingStatus === 'needs_pivot' && <span className="th-tabs__badge th-tabs__badge--warning">!</span>}
                </button>
            </div>

            {/* ========== RECORDER TAB ========== */}
            {activeTab === 'recorder' && (
                <div className="th-recorder-tab">
                    {/* Controls Bar */}
                    <div className="th-controls">
                        <div className="th-controls__buttons">
                            {state === 'idle' ? (
                                <button className="th-controls__btn th-controls__btn--record" onClick={startRecording} title="Start Recording">
                                    <span className="th-controls__btn-icon">●</span>
                                </button>
                            ) : (
                                <>
                                    <button className={`th-controls__btn th-controls__btn--record ${state === 'recording' ? 'active' : ''}`}
                                        onClick={state === 'recording' ? pauseRecording : resumeRecording}
                                        title={state === 'recording' ? 'Pause' : 'Resume'}>
                                        <span className="th-controls__btn-icon">{state === 'recording' ? '⏸' : '▶'}</span>
                                    </button>
                                    <button className="th-controls__btn th-controls__btn--stop" onClick={stopRecording} title="Stop">
                                        <span className="th-controls__btn-icon">■</span>
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="th-controls__info">
                            <div className="th-controls__status-row">
                                <span className={`th-controls__status-text th-controls__status-text--${state}`}>
                                    {state === 'idle' ? 'Ready' : state === 'recording' ? 'Recording' : 'Paused'}
                                </span>
                                {sendingChunk && <span className="th-controls__sending-badge">Transcribing…</span>}
                            </div>
                            <span className="th-controls__timer">{formatTime(elapsed)}</span>
                        </div>

                        {/* Live Transcription + Fact Check Toggles */}
                        <div className="th-controls__toggles">
                            {liveSupported && (
                                <button
                                    className={`th-live-toggle ${isLiveEnabled ? 'th-live-toggle--on' : ''}`}
                                    onClick={() => {
                                        setIsLiveEnabled(prev => {
                                            const next = !prev;
                                            if (!next) stopLiveRecognition();
                                            else if (state === 'recording') startLiveRecognition();
                                            return next;
                                        });
                                    }}
                                    title={isLiveEnabled ? 'Disable live captions' : 'Enable live captions'}
                                >
                                    💬 {isLiveEnabled ? 'Live ON' : 'Live OFF'}
                                </button>
                            )}
                            <button
                                className={`th-fact-toggle ${factCheckEnabled ? 'th-fact-toggle--on' : ''}`}
                                onClick={() => setFactCheckEnabled(prev => !prev)}
                                title={factCheckEnabled ? 'Disable live fact-check' : 'Enable live fact-check'}
                            >
                                🔍 {factCheckEnabled ? 'Fact Check ON' : 'Fact Check OFF'}
                            </button>
                            <button
                                className={`th-legal-toggle ${legalShieldEnabled ? 'th-legal-toggle--on' : ''}`}
                                onClick={() => setLegalShieldEnabled(prev => !prev)}
                                title={legalShieldEnabled ? 'Disable Legal Shield (Georgia Law)' : 'Enable Legal Shield (Georgia Law)'}
                            >
                                ⚖️ {legalShieldEnabled ? 'Legal Shield ON' : 'Legal Shield OFF'}
                                {legalScanRunning && <span className="th-legal-spinner">⟳</span>}
                            </button>
                            {legalShieldEnabled && !hasActiveLlm(integrations.llm) && (
                                <span className="th-legal-hint" role="status">
                                    ⚖️ Add an LLM key in Settings → API Keys to enable statute matching.
                                </span>
                            )}
                            <button
                                className="th-legal-toggle"
                                onClick={() => {
                                    // Build a query from the most-recent ~12 segments — empty array if none yet
                                    const recent = segments.slice(-12).map(s => ({ segment: (s as any).text || '' })).filter(s => s.segment);
                                    const q = buildNotebookLmQuery(recent.length > 0 ? recent : [{ segment: 'Georgia landlord-tenant law: summarize the most-cited statutes for property managers in 2026.' }]);
                                    openNotebookLmWithQuery(googleEmail, q);
                                }}
                                title={googleEmail
                                    ? `Open ${googleEmail}'s NotebookLM with this transcript queued (copied to clipboard)`
                                    : 'Open NotebookLM (configure Google Calendar email in Settings to auto-route to your account)'}
                            >
                                📚 Consult NotebookLM
                            </button>
                            <button
                                className={`th-live-toggle ${cloudSTTEnabled ? 'th-live-toggle--on' : ''}`}
                                onClick={() => setCloudSTTEnabled(prev => !prev)}
                                title={cloudSTTEnabled ? 'Using Cloud STT (Leon)' : 'Using Browser STT'}
                            >
                                ☁️ {cloudSTTEnabled ? 'Cloud STT' : 'Browser STT'}
                            </button>
                            <button
                                className={`th-live-toggle th-moonshine-toggle ${moonshineEnabled ? 'th-live-toggle--on' : ''}`}
                                onClick={() => {
                                    setMoonshineEnabled(prev => {
                                        const next = !prev;
                                        if (!next) stopMoonshine();
                                        else if (state === 'recording') void startMoonshine();
                                        return next;
                                    });
                                }}
                                title={moonshineEnabled ? 'Moonshine AI active (local STT + speaker ID)' : 'Enable Moonshine AI'}
                            >
                                {moonshineLoading ? '⏳' : '🌙'} {moonshineEnabled ? (moonshineLoading ? 'Loading…' : 'Moonshine') : 'Moonshine'}
                            </button>
                        </div>

                        {/* Audio Level Meter */}
                        <div className="th-level-meter" title={`Audio Level: ${(audioLevel * 100).toFixed(0)}%`}>
                            <div className="th-level-meter__track">
                                <div className="th-level-meter__fill"
                                    style={{ height: `${audioLevel * 100}%` }}
                                />
                                <div className="th-level-meter__peak"
                                    style={{ bottom: `${Math.min(audioLevel * 100, 100)}%` }}
                                />
                            </div>
                            <div className="th-level-meter__ticks">
                                <span>0</span>
                                <span>—</span>
                                <span>dB</span>
                            </div>
                        </div>
                    </div>

                    {/* Error Banner */}
                    {error && (
                        <div className="th-error-banner">
                            <span className="th-error-banner__icon">⚠️</span>
                            <span>{error}</span>
                            <button className="th-error-banner__dismiss" onClick={() => setError(null)}>✕</button>
                        </div>
                    )}

                    {/* Waveform Visualizer */}
                    <div className="th-waveform">
                        {state !== 'idle' ? (
                            <canvas ref={canvasRef} />
                        ) : (
                            <div className="th-waveform__idle">
                                <span className="th-waveform__idle-icon">🎙️</span>
                                <span>Click record to start capturing audio</span>
                            </div>
                        )}
                    </div>

                    {/* Live Transcription Caption Overlay */}
                    {state === 'recording' && isLiveEnabled && liveSupported && (liveTranscript || liveFinalParts.length > 0) && (
                        <div className="th-live-caption">
                            <div className="th-live-caption__indicator">
                                <span className="th-live-caption__dot" />
                                LIVE
                            </div>
                            <div className="th-live-caption__text">
                                {liveFinalParts.length > 0 && (
                                    <span className="th-live-caption__final">
                                        {liveFinalParts.slice(-3).join(' ')}{' '}
                                    </span>
                                )}
                                {liveTranscript && (
                                    <span className="th-live-caption__interim">
                                        {liveTranscript}
                                        <span className="th-live-caption__cursor">|</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Session Stats Bar */}
                    {segments.length > 0 && (
                        <div className="th-stats">
                            <div className="th-stats__item">
                                <span className="th-stats__label">Words</span>
                                <span className="th-stats__value">{stats.wordCount}</span>
                            </div>
                            <div className="th-stats__item">
                                <span className="th-stats__label">Segments</span>
                                <span className="th-stats__value">{segments.length}</span>
                            </div>
                            <div className="th-stats__item">
                                <span className="th-stats__label">Confidence</span>
                                <span className="th-stats__value">{(stats.avgConfidence * 100).toFixed(0)}%</span>
                            </div>
                            <div className="th-stats__divider" />
                            {Array.from(stats.speakers.entries()).map(([speaker, duration]) => (
                                <div key={speaker} className="th-stats__speaker">
                                    <span className="th-stats__speaker-dot" style={{ background: getSpeakerColor(speaker).ring }} />
                                    <span className="th-stats__speaker-name">{getSpeakerDisplayName(speaker)}</span>
                                    <span className="th-stats__speaker-time">{formatTime(Math.round(duration))}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ========== MAIN CONTENT SPLIT: Transcript + Fact Check Panel ========== */}
                    <div className={`th-main-split ${factCheckPanelOpen && factChecks.size > 0 ? 'th-main-split--with-panel' : ''}`}>
                        {/* Transcript */}
                        <div className="th-transcript">
                            {segments.length === 0 ? (
                                <div className="th-transcript__empty">
                                    <div className="th-transcript__empty-icon">📝</div>
                                    <div className="th-transcript__empty-title">Transcript</div>
                                    <div className="th-transcript__empty-sub">
                                        Segments will appear here as you speak…
                                    </div>
                                </div>
                            ) : (
                                segments.map((seg, i) => {
                                    const newTurn = isNewSpeaker(i);
                                    const colors = getSpeakerColor(seg.speaker);
                                    const fc = factChecks.get(seg.text);
                                    const la = legalAlerts.get(seg.text);
                                    const alertCfg = la ? LEGAL_ALERT_CONFIG[la.alert] : null;

                                    return (
                                        <div key={seg.id}
                                            className={`th-segment ${newTurn ? 'th-segment--new-turn' : ''} ${la ? `th-segment--${la.alert}` : ''}`}
                                            style={{ '--speaker-bg': colors.bg, '--speaker-text': colors.text, '--speaker-ring': colors.ring, ...(alertCfg ? { '--legal-bg': alertCfg.bg, '--legal-border': alertCfg.border, '--legal-color': alertCfg.color } : {}) } as React.CSSProperties}>

                                            {newTurn && (
                                                <div className="th-segment__turn-marker">
                                                    <div className="th-segment__avatar" style={{ background: colors.ring }}>
                                                        {getSpeakerDisplayName(seg.speaker).charAt(0).toUpperCase()}
                                                    </div>
                                                    {editingSpeaker === seg.speaker ? (
                                                        <input
                                                            className="th-segment__speaker-edit"
                                                            value={editSpeakerValue}
                                                            onChange={e => setEditSpeakerValue(e.target.value)}
                                                            onBlur={saveSpeakerName}
                                                            onKeyDown={e => e.key === 'Enter' && saveSpeakerName()}
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <span className="th-segment__speaker"
                                                            style={{ background: colors.bg, color: colors.text }}
                                                            onClick={() => startEditSpeaker(seg.speaker)}
                                                            title="Click to rename speaker">
                                                            {getSpeakerDisplayName(seg.speaker)}
                                                        </span>
                                                    )}
                                                    <span className="th-segment__turn-time">{formatTimestamp(seg.start)}</span>
                                                </div>
                                            )}

                                            <div className="th-segment__body">
                                                {!newTurn && (
                                                    <span className="th-segment__inline-time">{formatTimestamp(seg.start)}</span>
                                                )}
                                                <span className="th-segment__text">{seg.text}</span>

                                                {/* Inline fact-check badge */}
                                                {fc && (
                                                    <span className={`th-segment__fact-badge th-segment__fact-badge--${fc.verdict}`}
                                                        title={fc.explanation || `Confidence: ${(fc.confidence * 100).toFixed(0)}%`}>
                                                        {VERDICT_CONFIG[fc.verdict]?.icon || '⚠️'}
                                                        {fc.verdict}
                                                    </span>
                                                )}

                                                {/* Inline legal shield badge */}
                                                {la && alertCfg && (
                                                    <span
                                                        className={`th-segment__legal-badge th-segment__legal-badge--${la.alert}`}
                                                        title={`${la.statute}: ${la.advice}`}
                                                    >
                                                        {alertCfg.icon} {alertCfg.label}
                                                        {la.statute !== 'N/A' && la.statute !== '' && <span className="th-segment__legal-statute">{la.statute}</span>}
                                                    </span>
                                                )}

                                                {/* Cycle 9: matched-statute detail — similarity + excerpt */}
                                                {la && la.matchedStatutes && la.matchedStatutes.length > 0 && (
                                                    <ul className="th-segment__legal-matches" aria-label="Matched Georgia statutes">
                                                        {la.matchedStatutes.map((ms, mi) => (
                                                            <li key={`${ms.volumeId}-${mi}`} className="th-segment__legal-match" title={ms.excerpt || undefined}>
                                                                <span className="th-segment__legal-match-id">{ms.volumeId}</span>
                                                                <span
                                                                    className="th-segment__legal-match-sim"
                                                                    aria-label={`Match confidence ${formatSimilarity(ms.similarity)}`}
                                                                >
                                                                    {formatSimilarity(ms.similarity)}
                                                                </span>
                                                                {ms.excerpt && <span className="th-segment__legal-match-excerpt">{ms.excerpt}</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}

                                                {/* Inline contradiction badge */}
                                                {contradictionAlerts.has(seg.text) && contradictionAlerts.get(seg.text)!.map((ca, ci) => (
                                                    <span key={ci}
                                                        className={`th-segment__contradiction-badge th-segment__contradiction-badge--${ca.severity}`}
                                                        title={`${ca.discrepancy}\n\nOriginal: "${ca.originalStatement}" (${new Date(ca.originalTimestamp).toLocaleDateString()})`}
                                                    >
                                                        ⚠️ CONTRADICTION: {ca.discrepancy}
                                                    </span>
                                                ))}

                                                {/* Confidence meter */}
                                                <div className="th-segment__confidence" title={`Confidence: ${(seg.confidence * 100).toFixed(0)}%`}>
                                                    <div className="th-segment__confidence-bar"
                                                        style={{
                                                            width: `${seg.confidence * 100}%`,
                                                            background: seg.confidence > 0.8 ? '#34d399' : seg.confidence > 0.5 ? '#fbbf24' : '#ef4444'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={transcriptEndRef} />
                        </div>

                        {/* ========== LIVE FACT CHECK PANEL ========== */}
                        {factChecks.size > 0 && (
                            <div className={`th-factpanel ${factCheckPanelOpen ? '' : 'th-factpanel--collapsed'}`}>
                                <div className="th-factpanel__header">
                                    <button className="th-factpanel__toggle" onClick={() => setFactCheckPanelOpen(prev => !prev)}>
                                        {factCheckPanelOpen ? '▶' : '◀'}
                                    </button>
                                    <span className="th-factpanel__title">🔍 Fact Check Agent</span>
                                    {factCheckRunning && <span className="th-factpanel__spinner">⟳</span>}
                                </div>

                                {factCheckPanelOpen && (
                                    <>
                                        {/* Summary */}
                                        <div className="th-factpanel__summary">
                                            <div className="th-factpanel__stat">
                                                <span className="th-factpanel__stat-num" style={{ color: '#34d399' }}>{factCheckStats.verified}</span>
                                                <span className="th-factpanel__stat-lbl">Verified</span>
                                            </div>
                                            <div className="th-factpanel__stat">
                                                <span className="th-factpanel__stat-num" style={{ color: '#ef4444' }}>{factCheckStats.disputed}</span>
                                                <span className="th-factpanel__stat-lbl">Disputed</span>
                                            </div>
                                            <div className="th-factpanel__stat">
                                                <span className="th-factpanel__stat-num" style={{ color: '#fbbf24' }}>{factCheckStats.unverifiable}</span>
                                                <span className="th-factpanel__stat-lbl">Unknown</span>
                                            </div>
                                            <div className="th-factpanel__stat">
                                                <span className="th-factpanel__stat-num" style={{ color: '#fb923c' }}>{factCheckStats.partial}</span>
                                                <span className="th-factpanel__stat-lbl">Partial</span>
                                            </div>
                                        </div>

                                        {/* Results List */}
                                        <div className="th-factpanel__results">
                                            {Array.from(factChecks.entries()).map(([claim, result]) => {
                                                const vc = VERDICT_CONFIG[result.verdict] || VERDICT_CONFIG.unverifiable;
                                                return (
                                                    <div key={claim} className="th-factpanel__result">
                                                        <div className="th-factpanel__result-header">
                                                            <span className="th-factpanel__result-icon">{vc.icon}</span>
                                                            <span className="th-factpanel__verdict-badge" style={{ color: vc.color }}>
                                                                {vc.label}
                                                            </span>
                                                            <span className="th-factpanel__confidence">
                                                                {(result.confidence * 100).toFixed(0)}%
                                                            </span>
                                                        </div>
                                                        <div className="th-factpanel__claim">{claim.length > 120 ? claim.slice(0, 120) + '…' : claim}</div>
                                                        {result.explanation && (
                                                            <div className="th-factpanel__explanation">{result.explanation}</div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Export Bar */}
                    {segments.length > 0 && (
                        <div className="th-export">
                            <div className="th-export__group">
                                <button className="th-export__btn" onClick={() => exportTranscript('text')}>
                                    📋 Copy
                                </button>
                                <button className="th-export__btn" onClick={saveAsNote}>
                                    📝 Save Note
                                </button>
                                <button className="th-export__btn" onClick={() => saveTranscription()}>
                                    💾 Save to Log
                                </button>
                                {audioChunksRef.current.length > 0 && (
                                    <button className="th-export__btn" onClick={downloadRecording}>
                                        💾 Save Audio
                                    </button>
                                )}
                                <button className="th-export__btn" onClick={saveToFileManager}>
                                    📁 Save to Files
                                </button>
                                <div className="th-export__dropdown-wrap">
                                    <button className="th-export__btn th-export__btn--dropdown" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
                                        📤 Export ▾
                                    </button>
                                    {exportMenuOpen && (
                                        <div className="th-export__dropdown">
                                            <button onClick={() => exportTranscript('text')}>Plain Text (.txt)</button>
                                            <button onClick={() => exportTranscript('srt')}>SubRip (.srt)</button>
                                            <button onClick={() => exportTranscript('vtt')}>WebVTT (.vtt)</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className="th-export__count">
                                {segments.length} segment{segments.length !== 1 ? 's' : ''}
                                {' • '}
                                {stats.wordCount} word{stats.wordCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* ========== LOG TAB ========== */}
            {activeTab === 'log' && (
                <div className="th-log-tab">
                    <div className="th-log__header">
                        <h3 className="th-log__title">📋 Transcription History</h3>
                        <span className="th-log__count">{savedTranscriptions.length} saved</span>
                    </div>

                    {savedTranscriptions.length === 0 ? (
                        <div className="th-log__empty">
                            <div className="th-log__empty-icon">📂</div>
                            <p>No saved transcriptions yet</p>
                            <p className="th-log__empty-sub">Recordings are auto-saved when you stop them</p>
                        </div>
                    ) : (
                        <div className="th-log__list">
                            {savedTranscriptions.map(entry => (
                                <div key={entry.id} className="th-log__entry">
                                    <div className="th-log__entry-main" onClick={() => loadTranscription(entry)}>
                                        <div className="th-log__entry-title-row">
                                            <div className="th-log__entry-title">{entry.title}</div>
                                            <span
                                                className="th-log__status-pill"
                                                style={{
                                                    color: SUMMARY_STATUS_CONFIG[entry.summaryStatus || 'draft']?.color,
                                                    background: SUMMARY_STATUS_CONFIG[entry.summaryStatus || 'draft']?.bg,
                                                }}
                                            >
                                                {SUMMARY_STATUS_CONFIG[entry.summaryStatus || 'draft']?.label || 'Draft'}
                                            </span>
                                        </div>
                                        <div className="th-log__entry-meta">
                                            <span>⏱ {formatTime(entry.duration)}</span>
                                            <span>•</span>
                                            <span>{entry.wordCount} words</span>
                                            <span>•</span>
                                            <span>{entry.segments.length} segments</span>
                                            {entry.factChecks.length > 0 && (
                                                <>
                                                    <span>•</span>
                                                    <span>🔍 {entry.factChecks.length} checks</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="th-log__entry-date">
                                            {new Date(entry.createdAt).toLocaleString()}
                                        </div>
                                        {entry.approvedBy && (
                                            <div className="th-log__entry-reviewer">Reviewed by {entry.approvedBy}</div>
                                        )}
                                    </div>
                                    <div className="th-log__entry-tags" onClick={(e) => e.stopPropagation()} style={{ padding: '4px 12px' }}>
                                        <TagInput source="transcription" sourceId={entry.id} title={entry.title} />
                                    </div>
                                    <div className="th-log__entry-actions">
                                        <button
                                            className="th-log__action-btn th-log__action-btn--load"
                                            onClick={() => loadTranscription(entry)}
                                            title="Load transcription"
                                        >
                                            ▶ Load
                                        </button>
                                        <button
                                            className="th-log__action-btn"
                                            onClick={() => void exportLogToNote(entry.id)}
                                            title="Save transcript as a note"
                                        >
                                            📝 Note
                                        </button>
                                        <button
                                            className="th-log__action-btn"
                                            onClick={() => void exportLogToWorkitem(entry.id)}
                                            title="Create a workitem from this transcript"
                                        >
                                            ✅ Workitem
                                        </button>
                                        <button
                                            className="th-log__action-btn"
                                            onClick={() => void setTranscriptReviewStatus(entry.id, 'approved')}
                                            title="Approve transcript summary"
                                        >
                                            ✔ Approve
                                        </button>
                                        <button
                                            className="th-log__action-btn th-log__action-btn--ai"
                                            onClick={() => openPostMeetingPanel(entry.id)}
                                            title="AI Post-Meeting Actions"
                                        >
                                            🧠 AI Actions
                                        </button>
                                        <button
                                            className="th-log__action-btn th-log__action-btn--delete"
                                            onClick={() => deleteTranscription(entry.id)}
                                            title="Delete"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ========== POST-MEETING ACTIONS PANEL ========== */}
                    {postMeetingLogId && (
                        <div className="th-post-meeting">
                            <div className="th-post-meeting__header">
                                <h3>🧠 AI Post-Meeting Actions</h3>
                                <span className="th-post-meeting__subtitle">
                                    {savedTranscriptions.find(t => t.id === postMeetingLogId)?.title || 'Selected Log'}
                                </span>
                                <button className="th-post-meeting__close" onClick={() => setPostMeetingLogId(null)}>✕</button>
                            </div>

                            <div className="th-post-meeting__actions">
                                <button className="th-pm-btn" onClick={() => fetchAiSummary(postMeetingLogId)} disabled={aiSummaryLoading}>
                                    {aiSummaryLoading ? '⏳' : '📝'} Summary
                                </button>
                                <button className="th-pm-btn" onClick={() => fetchAiActionItems(postMeetingLogId)} disabled={aiActionItemsLoading}>
                                    {aiActionItemsLoading ? '⏳' : '✅'} Action Items
                                </button>
                                <button className="th-pm-btn" onClick={() => fetchAiDecisions(postMeetingLogId)} disabled={aiDecisionsLoading}>
                                    {aiDecisionsLoading ? '⏳' : '⚖️'} Decisions
                                </button>
                                <button className="th-pm-btn" onClick={() => fetchAiRecapEmail(postMeetingLogId)} disabled={aiRecapEmailLoading}>
                                    {aiRecapEmailLoading ? '⏳' : '📧'} Recap Email
                                </button>
                                <button className="th-pm-btn" onClick={() => fetchAiRewrite(postMeetingLogId, 'executive')} disabled={aiRewriteLoading}>
                                    {aiRewriteLoading ? '⏳' : '✏️'} Executive Rewrite
                                </button>
                                <button className="th-pm-btn" onClick={() => fetchAiDraft(postMeetingLogId, 'memo')} disabled={aiDraftLoading}>
                                    {aiDraftLoading ? '⏳' : '📄'} Draft Memo
                                </button>
                                <button className="th-pm-btn" onClick={() => void exportLogToNote(postMeetingLogId)}>
                                    📝 Save Note
                                </button>
                                <button className="th-pm-btn" onClick={() => void exportLogToWorkitem(postMeetingLogId)}>
                                    ✅ Workitem
                                </button>
                                <button className="th-pm-btn" onClick={() => void setTranscriptReviewStatus(postMeetingLogId, 'pending_review')}>
                                    👀 Pending Review
                                </button>
                                <button className="th-pm-btn" onClick={() => void setTranscriptReviewStatus(postMeetingLogId, 'approved')}>
                                    ✔ Approve
                                </button>
                            </div>

                            {/* Results Panels */}
                            <div className="th-post-meeting__results">
                                {aiSummary && (
                                    <div className="th-pm-result">
                                        <div className="th-pm-result__header">📝 AI Summary</div>
                                        <div className="th-pm-result__body th-pm-result__body--pre">{aiSummary}</div>
                                        <button className="th-pm-copy" onClick={() => { navigator.clipboard.writeText(aiSummary); }}>📋 Copy</button>
                                    </div>
                                )}

                                {aiActionItems.length > 0 && (
                                    <div className="th-pm-result">
                                        <div className="th-pm-result__header">✅ Action Items ({aiActionItems.length})</div>
                                        <div className="th-pm-result__body">
                                            {aiActionItems.map((item, i) => (
                                                <div key={i} className="th-pm-action-item">
                                                    <span className={`th-pm-priority th-pm-priority--${item.priority}`}>{item.priority}</span>
                                                    <span className="th-pm-action-desc">{item.description}</span>
                                                    {item.assignee && <span className="th-pm-assignee">→ {item.assignee}</span>}
                                                </div>
                                            ))}
                                        </div>
                                        <button className="th-pm-copy" onClick={() => { navigator.clipboard.writeText(aiActionItems.map(i => `[${i.priority}] ${i.description}${i.assignee ? ` → ${i.assignee}` : ''}`).join('\n')); }}>📋 Copy</button>
                                    </div>
                                )}

                                {aiDecisions.length > 0 && (
                                    <div className="th-pm-result">
                                        <div className="th-pm-result__header">⚖️ Decisions ({aiDecisions.length})</div>
                                        <div className="th-pm-result__body">
                                            {aiDecisions.map((d, i) => (
                                                <div key={i} className="th-pm-decision">
                                                    <strong>{d.decision}</strong>
                                                    {d.madeBy && <span className="th-pm-assignee">— {d.madeBy}</span>}
                                                    {d.context && <p className="th-pm-context">{d.context}</p>}
                                                </div>
                                            ))}
                                        </div>
                                        <button className="th-pm-copy" onClick={() => { navigator.clipboard.writeText(aiDecisions.map(d => `${d.decision}${d.madeBy ? ` (${d.madeBy})` : ''}: ${d.context}`).join('\n')); }}>📋 Copy</button>
                                    </div>
                                )}

                                {aiRecapEmail && (
                                    <div className="th-pm-result">
                                        <div className="th-pm-result__header">📧 Recap Email</div>
                                        <div className="th-pm-result__subheader">Subject: {aiRecapEmail.subject}</div>
                                        <div className="th-pm-result__body th-pm-result__body--pre">{aiRecapEmail.body}</div>
                                        <button className="th-pm-copy" onClick={() => { navigator.clipboard.writeText(`Subject: ${aiRecapEmail.subject}\n\n${aiRecapEmail.body}`); }}>📋 Copy Email</button>
                                    </div>
                                )}

                                {aiRewrite && (
                                    <div className="th-pm-result">
                                        <div className="th-pm-result__header">✏️ Executive Rewrite</div>
                                        <div className="th-pm-result__body th-pm-result__body--pre">{aiRewrite}</div>
                                        <button className="th-pm-copy" onClick={() => { navigator.clipboard.writeText(aiRewrite); }}>📋 Copy</button>
                                    </div>
                                )}

                                {aiDraft && (
                                    <div className="th-pm-result">
                                        <div className="th-pm-result__header">📄 {aiDraft.title}</div>
                                        <div className="th-pm-result__body th-pm-result__body--pre">{aiDraft.content}</div>
                                        <button className="th-pm-copy" onClick={() => { navigator.clipboard.writeText(aiDraft.content); }}>📋 Copy</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========== UPLOAD TAB ========== */}
            {activeTab === 'upload' && (
                <div className="th-upload-view">
                    <h2>Process Existing Audio</h2>
                    <p>Upload a recorded meeting, voicemail, or interview to generate a transcript.</p>

                    {/* Hidden file input */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".mp3,.wav,.m4a,.flac,.webm,.mp4,.txt,.srt,.vtt"
                        style={{ display: 'none' }}
                    />

                    <div
                        className={`th-mock-upload-area${uploadDragOver ? ' th-upload-dragover' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setUploadDragOver(true); }}
                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setUploadDragOver(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setUploadDragOver(false); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setUploadDragOver(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) processUploadedFile(file);
                        }}
                    >
                        <div className="th-upload-icon">{uploadDragOver ? '📥' : '📁'}</div>
                        <h3>{uploadDragOver ? 'Drop file here' : 'Drag & drop audio file here'}</h3>
                        <p>Supports MP3, WAV, M4A, FLAC, TXT (Max 500MB)</p>
                        <button
                            className="th-upload__browse-btn"
                            style={{ marginTop: '1rem' }}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadStatus === 'uploading' || uploadStatus === 'transcribing'}
                        >
                            Browse Files
                        </button>
                    </div>

                    {/* Upload Progress / Status */}
                    {uploadStatus !== 'idle' && (
                        <div className="th-upload-progress-card">
                            <div className="th-upload-progress-header">
                                <span className="th-upload-progress-filename">
                                    {uploadStatus === 'uploading' ? '⬆️' : uploadStatus === 'transcribing' ? '🧠' : uploadStatus === 'done' ? '✅' : '❌'}
                                    {' '}{uploadFileName}
                                </span>
                                <span className="th-upload-progress-size">{formatFileSize(uploadFileSize)}</span>
                            </div>

                            <div className="th-upload-progress-bar-track">
                                <div
                                    className={`th-upload-progress-bar-fill ${uploadStatus === 'error' ? 'th-upload-progress-error' : ''} ${uploadStatus === 'transcribing' ? 'th-upload-progress-pulse' : ''}`}
                                    style={{ width: `${uploadStatus === 'error' ? 100 : uploadProgress}%` }}
                                />
                            </div>

                            <div className="th-upload-progress-status">
                                {uploadStatus === 'uploading' && `Uploading… ${uploadProgress}%`}
                                {uploadStatus === 'transcribing' && '🧠 Processing with Whisper AI — this may take a moment…'}
                                {uploadStatus === 'done' && `✅ Transcription complete — ${uploadTranscript.length} segments`}
                                {uploadStatus === 'error' && (
                                    <span className="th-upload-error-text">❌ {uploadError}</span>
                                )}
                            </div>

                            {uploadStatus === 'error' && (
                                <button
                                    className="th-upload__browse-btn"
                                    style={{ marginTop: 8, alignSelf: 'flex-start' }}
                                    onClick={() => { setUploadStatus('idle'); setUploadError(null); }}
                                >
                                    Try Again
                                </button>
                            )}
                        </div>
                    )}

                    {/* Transcription Results */}
                    {uploadTranscript.length > 0 && (
                        <div className="th-upload-transcript-results">
                            <h3>📝 Transcription ({uploadTranscript.length} segments)</h3>
                            <div className="th-upload-transcript-scroll">
                                {uploadTranscript.map((seg) => {
                                    const sc = getSpeakerColor(seg.speaker);
                                    return (
                                        <div key={seg.id} className="th-upload-transcript-seg">
                                            <span className="th-upload-seg-time">{formatTimestamp(seg.start)}</span>
                                            <span className="th-upload-seg-speaker" style={{ color: sc.text, background: sc.bg }}>
                                                {getSpeakerDisplayName(seg.speaker)}
                                            </span>
                                            <span className="th-upload-seg-text">{seg.text}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {/* ── Divider ── */}
                    <div className="th-upload-divider">
                        <span className="th-upload-divider__line" />
                        <span className="th-upload-divider__text">OR</span>
                        <span className="th-upload-divider__line" />
                    </div>

                    {/* ── Paste Text Directly ── */}
                    <div className="th-paste-section">
                        <div className="th-paste-section__header">
                            <span className="th-paste-section__icon">📋</span>
                            <span className="th-paste-section__title">Paste text directly</span>
                            {uploadText.trim() && (
                                <span className="th-paste-section__count">
                                    {uploadText.trim().split(/\s+/).length} words
                                </span>
                            )}
                        </div>
                        <textarea
                            className="th-upload__textarea"
                            placeholder="Paste or type your text here for fact-checking…"
                            value={uploadText}
                            onChange={e => setUploadText(e.target.value)}
                            rows={8}
                        />
                    </div>

                    <div className="th-upload__actions">
                        <button
                            className="th-upload__check-btn"
                            onClick={runUploadFactCheck}
                            disabled={!uploadText.trim() || uploadChecking}
                        >
                            {uploadChecking ? '⏳ Checking…' : '🔍 Run Fact Check'}
                        </button>
                    </div>

                    {/* ── Action Status Bar ── */}
                    {actionStatus && (
                        <div className={`th-action-status th-action-status--${actionStatus.type}`}>
                            <div className="th-action-status__content">
                                {actionStatus.type === 'loading' && (
                                    <span className="th-action-status__spinner">⟳</span>
                                )}
                                {actionStatus.type === 'success' && <span>✅</span>}
                                {actionStatus.type === 'error' && <span>❌</span>}
                                {actionStatus.type === 'info' && <span>💡</span>}
                                <span className="th-action-status__msg">{actionStatus.message}</span>
                                {actionStatus.detail && (
                                    <span className="th-action-status__detail">{actionStatus.detail}</span>
                                )}
                            </div>
                            <div className="th-action-status__actions">
                                {actionStatus.type === 'error' && (
                                    <button className="th-action-status__retry" onClick={runUploadFactCheck}>Retry</button>
                                )}
                                <button className="th-action-status__dismiss" onClick={() => setActionStatus(null)}>✕</button>
                            </div>
                            {actionStatus.type === 'loading' && (
                                <div className="th-action-status__progress-bar" />
                            )}
                        </div>
                    )}

                    {/* Fact check results */}
                    {uploadFactResults.length > 0 && (
                        <div className="th-upload-results">
                            <h3>Fact Check Results ({uploadFactResults.length})</h3>
                            {uploadFactResults.map((r, i) => {
                                const cfg = VERDICT_CONFIG[r.verdict] || VERDICT_CONFIG.unverifiable;
                                return (
                                    <div key={i} className="th-upload-result-card" style={{ borderLeft: `3px solid ${cfg.color}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <span>{cfg.icon}</span>
                                            <span style={{ color: cfg.color, fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{cfg.label}</span>
                                            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>{(r.confidence * 100).toFixed(0)}%</span>
                                        </div>
                                        <p style={{ color: '#e2e8f0', fontSize: 13, margin: '4px 0' }}>{r.claim}</p>
                                        {r.explanation && <p style={{ color: '#94a3b8', fontSize: 12, margin: '4px 0' }}>{r.explanation}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {/* ── Save Document Button ── */}
                    {(uploadText.trim() || uploadTranscript.length > 0) && (
                        <div className="th-upload__save-section">
                            <button
                                className="th-upload__save-btn"
                                onClick={() => void saveUploadDocumentToFiles()}
                            >
                                📁 Save to Files
                            </button>
                        </div>
                    )}

                    {/* ── Speaker Library ── */}
                    <SpeakerLibraryPanel apiBase={API_TRANSCRIBE} />
                    <LocalVoiceLibrary
                        getLatestEmbedding={() => latestEmbeddingRef.current}
                        getUnknownEmbeddings={() => segments
                            .filter(s => s.speaker === 'Unknown' && s.embedding && s.embedding.length > 0)
                            .map(s => s.embedding as number[])}
                    />
                </div>
            )}

            {/* ========== LIVE COACHING TAB ========== */}
            {activeTab === 'meeting_manager' && (
                <div className="th-meeting-manager">
                    <div className="mm-header">
                        <h3>🎯 Meeting Intelligence Hub</h3>
                        <div className={`mm-status-badge ${coachingStatus || 'idle'}`}>
                            {coachingStatus === 'on_track' && '✅ On Track'}
                            {coachingStatus === 'needs_pivot' && '⚠️ Pivot Needed'}
                            {coachingStatus === 'danger' && '🚨 Danger Zone'}
                            {!coachingStatus && state === 'recording' && '⏳ Analyzing...'}
                            {!coachingStatus && state !== 'recording' && '🎙️ Start Recording to Begin'}
                        </div>
                    </div>

                    {/* Dynamic Script Editor */}
                    <div className="mm-script-editor">
                        <div className="mm-script-editor__header">
                            <h4>📜 Meeting Script / Talking Points</h4>
                            <span className="mm-script-editor__hint">
                                {meetingScript.trim() ? `${meetingScript.trim().split('\n').length} lines` : 'Paste your script below'}
                            </span>
                        </div>
                        <textarea
                            className="mm-script-editor__textarea"
                            value={meetingScript}
                            onChange={e => setMeetingScript(e.target.value)}
                            placeholder={`Paste your meeting script, talking points, or rules here…\n\nExample:\n1. "Open with gratitude for attendance"\n2. "Present the revised 6-lot plan"\n3. "Address traffic and drainage concerns"\n\nNEVER SAY: "Rights," "Taking," or make promises\n\nThis script is saved automatically and used by the AI coach during recordings.`}
                            rows={8}
                        />
                    </div>

                    {/* Live Coaching Panel */}
                    <div className={`mm-coaching-box mm-coaching-box--${coachingStatus || 'idle'}`}>
                        <h4>🤖 ARA's Live Coaching</h4>
                        <p className="mm-feedback-text">{coachingFeedback}</p>
                    </div>

                    {coachingFlags && coachingFlags.length > 0 && (
                        <div className="mm-flags-box">
                            <h4>🚩 Flags</h4>
                            <ul>
                                {coachingFlags.map((flag, idx) => (
                                    <li key={`flag-${idx}`}>❌ {flag}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Intelligence Action Buttons */}
                    <div className="mm-intel-actions">
                        <button className="mm-intel-btn" onClick={fetchTalkingPoints} disabled={talkingPointsLoading || !meetingScript.trim()}>
                            {talkingPointsLoading ? '⏳' : '💡'} Suggest Talking Points
                        </button>
                        <button className="mm-intel-btn" onClick={fetchRebuttals} disabled={rebuttalsLoading || !meetingScript.trim()}>
                            {rebuttalsLoading ? '⏳' : '⚔️'} Generate Rebuttals
                        </button>
                        <button className="mm-intel-btn" onClick={fetchOnDemandSummary} disabled={onDemandSummaryLoading || segments.length === 0}>
                            {onDemandSummaryLoading ? '⏳' : '📊'} Summarize Now
                        </button>
                    </div>

                    {/* Talking Points Results */}
                    {talkingPoints.length > 0 && (
                        <div className="mm-intel-result">
                            <h4>💡 Suggested Talking Points</h4>
                            <div className="mm-intel-result__list">
                                {talkingPoints.map((tp, i) => (
                                    <div key={i} className={`mm-tp-card mm-tp-card--${tp.priority}`}>
                                        <div className="mm-tp-card__point">{tp.point}</div>
                                        <div className="mm-tp-card__reason">{tp.reason}</div>
                                        <span className={`mm-tp-badge mm-tp-badge--${tp.priority}`}>{tp.priority}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Rebuttals Results */}
                    {rebuttals.length > 0 && (
                        <div className="mm-intel-result">
                            <h4>⚔️ Rebuttal Suggestions</h4>
                            <div className="mm-intel-result__list">
                                {rebuttals.map((rb, i) => (
                                    <div key={i} className={`mm-rebuttal-card mm-rebuttal-card--${rb.strength}`}>
                                        <div className="mm-rebuttal-card__their"><strong>They said:</strong> {rb.theirArgument}</div>
                                        <div className="mm-rebuttal-card__yours"><strong>You say:</strong> {rb.suggestedRebuttal}</div>
                                        <span className={`mm-rb-badge mm-rb-badge--${rb.strength}`}>{rb.strength}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* On-Demand Summary */}
                    {onDemandSummary && (
                        <div className="mm-intel-result">
                            <h4>📊 Live Summary</h4>
                            <p className="mm-summary-text">{onDemandSummary.summary}</p>
                            {onDemandSummary.keyPoints.length > 0 && (
                                <div className="mm-summary-section">
                                    <strong>Key Points:</strong>
                                    <ul>{onDemandSummary.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}</ul>
                                </div>
                            )}
                            {onDemandSummary.unansweredQuestions.length > 0 && (
                                <div className="mm-summary-section">
                                    <strong>❓ Unanswered:</strong>
                                    <ul>{onDemandSummary.unansweredQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                                </div>
                            )}
                            {onDemandSummary.suggestedNextTopics.length > 0 && (
                                <div className="mm-summary-section">
                                    <strong>➡️ Discuss Next:</strong>
                                    <ul>{onDemandSummary.suggestedNextTopics.map((t, i) => <li key={i}>{t}</li>)}</ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};
