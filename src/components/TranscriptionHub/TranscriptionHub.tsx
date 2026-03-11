import { useState, useRef, useEffect, useCallback, useMemo, ChangeEvent } from 'react';
import { MicrophoneTranscriber } from '@moonshine-ai/moonshine-js';
import './TranscriptionHub.css';
import { API_BASE } from '../../config';

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
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';
type ExportFormat = 'text' | 'srt' | 'vtt';
type TabView = 'recorder' | 'log' | 'upload' | 'meeting_manager';

const API_TRANSCRIBE = `${API_BASE}/api/transcribe`;
const API_GEORGIA_CODE = `${API_BASE}/api/georgia-code`;
const STORAGE_KEY = 'dwellium-transcription-log';

const SPEAKER_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
    'User': { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', ring: '#6366f1' },
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
    const [liveSupported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));

    // --- Cloud STT state (Leon-powered Google Cloud Speech) ---
    const [cloudSTTEnabled, setCloudSTTEnabled] = useState(false);

    // --- Moonshine AI state ---
    const [moonshineEnabled, setMoonshineEnabled] = useState(false);
    const [moonshineLoading, setMoonshineLoading] = useState(false);
    const [moonshineReady, setMoonshineReady] = useState(false);
    const moonshineRef = useRef<MicrophoneTranscriber | null>(null);
    const moonshineSegCountRef = useRef(0);
    const moonshineStartTimeRef = useRef(0);

    // --- Speaker identification state ---
    const speakerProfilesRef = useRef<Map<string, number[]>>(new Map());
    const currentSpeakerRef = useRef('User');
    const speakerCountRef = useRef(1);

    // --- Transcription Log state ---
    const [savedTranscriptions, setSavedTranscriptions] = useState<SavedTranscription[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    // --- Load transcriptions from backend on mount (source of truth) ---
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API_TRANSCRIBE}/logs?limit=200`);
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
    const webmInitSegmentRef = useRef<Blob | null>(null);
    const chunkIndexRef = useRef(0);
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
    useEffect(() => {
        if (!legalShieldEnabled || legalScanRunning || legalScanQueue.length === 0) return;

        const processLegalQueue = async () => {
            setLegalScanRunning(true);
            const segments = [...legalScanQueue];
            setLegalScanQueue([]);

            try {
                const res = await fetch(`${API_GEORGIA_CODE}/legal-scan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ segments })
                });
                const json = await res.json();
                if (json.success && json.data.results) {
                    setLegalAlerts(prev => {
                        const next = new Map(prev);
                        const currentFlags: string[] = [];
                        for (const r of json.data.results as LegalScanResult[]) {
                            if (r.alert !== 'clear') {
                                next.set(r.segment, r);
                                currentFlags.push(r.alert); // Collect flags for UI badge
                            }
                        }
                        setLegalFlags(currentFlags); // Update legal flags state
                        return next;
                    });
                    console.log(`[LegalShield] Scan complete: ${json.data.scanTimeMs}ms, ${json.data.results.length} segments`);
                }
            } catch (err) {
                console.warn('[LegalShield] Scan failed:', err);
            } finally {
                setLegalScanRunning(false);
            }
        };

        const timer = setTimeout(processLegalQueue, 500); // 500ms debounce
        return () => clearTimeout(timer);
    }, [legalScanQueue, legalShieldEnabled, legalScanRunning]);

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
    useEffect(() => {
        const processMeetingQueue = async () => {
            if (isProcessingMeeting.current || state !== 'recording') return;

            const now = Date.now();
            if (now - lastMeetingCheckRef.current < 5000) return; // Check every 5s for near real-time

            // Get last ~3 minutes of conversation for context
            const recentSegments = segments
                .filter(s => s.end >= elapsed - 180) // Use elapsed instead of recordingTime
                .map(s => `[${s.speaker}] ${s.text}`)
                .join('\n');

            if (!recentSegments.trim()) return;

            isProcessingMeeting.current = true;
            lastMeetingCheckRef.current = now;

            const MEETING_SCRIPT = `
NPU-B Hearing: 6 Lot Subdivision (10-Line Screen)

1. "Thank you. We know the main concerns are traffic, drainage, and trees."
2. "We began with 7 lots. The stream buffer changed, forcing a reduction to 6."
3. "We redesigned and submitted this 6-lot plan to the City."
4. "This is already the reduced plan, not the maximum concept."
5. (If pushed for 5): "This plan has already been reduced once. Six is the result."
6. (If pressed on impact): "That is a fair concern. We will address it directly."
7. (If asked to change it now): "We are here to explain the 6-lot plan we moved forward with."
8. REPEAT: "This plan has already been reduced once."
9. REPEAT: "We understand the practical concerns."
10. NEVER SAY: "Rights," "Taking," "CID's plan," or "Engineer said 5."
`;

            try {
                const authToken = localStorage.getItem('dwellium-token') || '';
                const response = await fetch(`${API_BASE}/api/ara/meeting-manager`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                    },
                    body: JSON.stringify({
                        transcript: recentSegments,
                        scriptContent: MEETING_SCRIPT
                    })
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

        const interval = setInterval(() => {
            // processQueue(); // This is handled by a separate debounced useEffect
            // processLegalQueue(); // This is handled by a separate debounced useEffect
            // processContradictionQueue(); // This is handled by a separate debounced useEffect
            processMeetingQueue();
        }, 1000); // Check every second, but processMeetingQueue has its own 15s internal debounce

        return () => clearInterval(interval);
    }, [segments, state, elapsed, legalScanQueue, legalShieldEnabled, legalScanRunning, contradictionQueue, contradictionRunning]);


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

            ctx.fillStyle = 'rgba(10, 10, 20, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, '#6366f1');
            gradient.addColorStop(0.5, '#818cf8');
            gradient.addColorStop(1, '#a78bfa');

            ctx.lineWidth = 2.5;
            ctx.strokeStyle = gradient;
            ctx.shadowColor = '#818cf8';
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

        // WebM fix: The first chunk from MediaRecorder contains the EBML/Segment
        // initialization headers. Subsequent chunks are headerless Cluster elements.
        let audioBlob = blob;
        const currentMimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const isWebm = currentMimeType.includes('webm');

        if (isWebm) {
            if (chunkIndexRef.current === 0) {
                webmInitSegmentRef.current = blob;
            } else if (webmInitSegmentRef.current) {
                audioBlob = new Blob([webmInitSegmentRef.current, blob], { type: currentMimeType });
            }
        }
        chunkIndexRef.current++;

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
                const newSegs: TranscriptionSegment[] = json.data.segments;
                setSegments(prev => [...prev, ...newSegs]);

                // Only clear the *interim* live transcript — NOT the final accumulated parts.
                // Previously this wiped liveFinalParts which erased all live Web Speech words.
                setLiveTranscript('');

                // Queue claims for live fact-checking
                if (factCheckEnabled) {
                    const claimsText = newSegs.map(s => s.text).filter(t => t.length > 20);
                    if (claimsText.length > 0) {
                        setFactCheckQueue(prev => [...prev, ...claimsText]);
                    }
                }

                // Queue segments for legal shield scanning
                if (legalShieldEnabled) {
                    const legalTexts = newSegs.map(s => s.text).filter(t => t.length > 15);
                    if (legalTexts.length > 0) {
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

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    const transcript = result[0].transcript;
                    if (result.isFinal) {
                        setLiveFinalParts(prev => [...prev, transcript.trim()]);
                        liveRestartDelayRef.current = 0; // reset backoff on successful speech
                    } else {
                        interim += transcript;
                    }
                }
                setLiveTranscript(interim);
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

                        // Speaker identification from audio buffer
                        const speaker = identifySpeaker(buffer);

                        const now = Date.now();
                        const startSec = (now - moonshineStartTimeRef.current) / 1000;
                        moonshineSegCountRef.current++;

                        const segment: TranscriptionSegment = {
                            id: crypto.randomUUID(),
                            text: text.trim(),
                            start: Math.max(0, startSec - 3),
                            end: startSec,
                            speaker,
                            confidence: 0.92, // Moonshine typically has high accuracy
                        };

                        setSegments(prev => [...prev, segment]);
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
    }, [moonshineEnabled, factCheckEnabled, identifySpeaker, legalShieldEnabled, setContradictionQueue]);

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
            webmInitSegmentRef.current = null;
            chunkIndexRef.current = 0;
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
            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                    await sendAudioChunk(e.data);
                }
            };

            mediaRecorder.start(3000); // 3s timeslice for low latency transcription
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
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.pause();
            setState('paused');
            // Pause live transcription
            stopLiveRecognition();
            stopMoonshine();
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current?.state === 'paused') {
            mediaRecorderRef.current.resume();
            setState('recording');
            // Resume live transcription
            if (moonshineEnabled) {
                void startMoonshine();
            } else {
                startLiveRecognition();
            }
        }
    };

    const stopRecording = () => {
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
            setSpeakerNames(prev => ({ ...prev, [editingSpeaker]: editSpeakerValue.trim() }));
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
                                                        {la.statute !== 'N/A' && <span className="th-segment__legal-statute">{la.statute}</span>}
                                                    </span>
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
                                        <div className="th-log__entry-title">{entry.title}</div>
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
                                onClick={() => {
                                    const content = uploadText.trim() || uploadTranscript.map(s => `[${formatTimestamp(s.start)}] ${getSpeakerDisplayName(s.speaker)}: ${s.text}`).join('\n');
                                    const blob = new Blob([content], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = uploadFileName ? uploadFileName.replace(/\.[^.]+$/, '.txt') : 'transcription.txt';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                    setActionStatus({ type: 'success', message: 'Document saved successfully' });
                                    setTimeout(() => setActionStatus(prev => prev?.type === 'success' ? null : prev), 4000);
                                }}
                            >
                                💾 Save Document
                            </button>
                        </div>
                    )}

                    {/* ── Speaker Library ── */}
                    <SpeakerLibraryPanel apiBase={API_TRANSCRIBE} />
                </div>
            )}

            {/* ========== LIVE COACHING TAB ========== */}
            {activeTab === 'meeting_manager' && (
                <div className="th-meeting-manager">
                    <div className="mm-header">
                        <h3>NPU-B Hearing: 6 Lot Subdivision</h3>
                        <div className={`mm-status-badge ${coachingStatus || 'idle'}`}>
                            {coachingStatus === 'on_track' && '✅ On Track'}
                            {coachingStatus === 'needs_pivot' && '⚠️ Pivot Needed'}
                            {coachingStatus === 'danger' && '🚨 Danger: Forbidden Phrase'}
                            {!coachingStatus && state === 'recording' && '⏳ Analyzing...'}
                            {!coachingStatus && state !== 'recording' && '🎙️ Start Recording to Begin'}
                        </div>
                    </div>

                    <div className="mm-coaching-box">
                        <h4>ARA's Live Feedback</h4>
                        <p className="mm-feedback-text">{coachingFeedback}</p>
                    </div>

                    {coachingFlags && coachingFlags.length > 0 && (
                        <div className="mm-flags-box">
                            <h4>Forbidden Phrases Detected</h4>
                            <ul>
                                {coachingFlags.map((flag, idx) => (
                                    <li key={`flag-${idx}`}>❌ {flag}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="mm-script-preview">
                        <h4>Talking Points Reminder (10-Line)</h4>
                        <ul className="points-list">
                            <li>1. "Thank you. We know the main concerns are traffic, drainage, and trees."</li>
                            <li>2. "We began with 7 lots. The stream buffer changed, forcing a reduction to 6."</li>
                            <li>3. "We redesigned and submitted this 6-lot plan to the City."</li>
                            <li>4. "This is already the reduced plan, not the maximum concept."</li>
                            <li>5. (If pushed for 5): "This plan has already been reduced once. Six is the result."</li>
                            <li>6. (If pressed on impact): "That is a fair concern. We will address it directly."</li>
                            <li>7. (If asked to change it now): "We are here to explain the 6-lot plan we moved forward with."</li>
                            <li>8. <strong>REPEAT:</strong> "This plan has already been reduced once."</li>
                            <li>9. <strong>REPEAT:</strong> "We understand the practical concerns."</li>
                            <li><strong style={{ color: 'var(--red)' }}>NEVER SAY:</strong> "Rights," "Taking," "CID's plan," or "Engineer said 5."</li>
                        </ul>
                    </div>
                </div>
            )}

        </div>
    );
};
