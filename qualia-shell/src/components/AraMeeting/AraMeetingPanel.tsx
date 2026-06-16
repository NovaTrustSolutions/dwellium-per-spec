/**
 * AraMeetingPanel — ARA's meeting note-taker, front end.
 *
 * Starts a meeting-assist session in one of two modes and then shows the live
 * transcript + ARA's coaching while the meeting runs:
 *
 *   ① Visible note-taker  — a Recall.ai bot JOINS the call as a visible
 *      participant ("ARA Notetaker"). The user pastes the meeting URL; on Start
 *      we POST /api/ara/meeting/bot/start { meetingUrl, recallApiKey? } and get
 *      back { sessionId, botId }. Everyone in the call can see the bot, which is
 *      the consent-friendly default.
 *
 *   ② Background (private) — the Dwellium DESKTOP app captures call audio
 *      locally with no visible bot. This needs Electron — window.electronAPI
 *      .startBackgroundMeeting({ sessionId, apiBase }). In a web build the
 *      bridge is absent, so this mode is disabled with a "needs the desktop app"
 *      note.
 *
 * Once a session is live we poll GET /api/ara/meeting/session/:sessionId every
 * ~3s and render { transcript, utterances, coaching, status }. Stop ends the
 * session (bot/stop for visible, electronAPI.stopBackgroundMeeting for
 * background).
 *
 * Recording is consent-sensitive: a prominent indicator shows while active, and
 * a FIRST-USE acknowledgment (persisted per-user) must be accepted once — it
 * reminds the user that recording other participants may require THEIR consent.
 *
 * Framing: ARA is a listen-only note-taker + coach. It does not speak in the
 * call; it transcribes and surfaces private coaching to the user.
 *
 * Auth/fetch mirrors ARAConsole: useUser().authFetch + API_BASE. The Recall key
 * is read write-only from the per-user integrations bundle (Settings → API
 * Keys → Recall.ai). SSR-safe: no window/localStorage access during render
 * (the consent ack reads via useSyncExternalStore-free effect-time guard, and
 * Electron detection is computed in an effect, not at module/render top-level).
 *
 * 2026-06-15 created.
 */

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { API_BASE } from '../../config';
import './AraMeetingPanel.css';

const API_MEETING = `${API_BASE}/api/ara/meeting`;
const POLL_MS = 3000;
/** localStorage flag — the first-use recording-consent acknowledgment. */
const CONSENT_ACK_KEY = 'dwellium-ara-meeting-consent-ack';

type MeetingMode = 'visible' | 'background';

/** One transcript line as the backend session endpoint returns it. */
interface Utterance {
    speaker?: string;
    text: string;
    /** epoch ms or relative seconds — rendered only if present. */
    ts?: number;
}

/** ARA's coaching block from analyzeMeeting (status / feedback / flags). */
interface Coaching {
    /** A short headline ARA surfaces — e.g. "On track" / "Watch the time". */
    status?: string;
    /** Longer coaching prose. */
    feedback?: string;
    /** Discrete callouts — e.g. ["Unanswered question from Sam", "3 action items"]. */
    flags?: string[];
}

interface SessionSnapshot {
    transcript?: string;
    utterances?: Utterance[];
    coaching?: Coaching;
    status?: string;
}

/** Detect the Electron bridge without tripping SSR (called inside an effect). */
function getElectronApi(): {
    isElectron?: boolean;
    startBackgroundMeeting?: (args: { sessionId: string; apiBase: string }) => Promise<unknown>;
    stopBackgroundMeeting?: () => Promise<unknown>;
} | null {
    try {
        if (typeof window === 'undefined') return null;
        return (window as unknown as { electronAPI?: ReturnType<typeof getElectronApi> }).electronAPI ?? null;
    } catch {
        return null;
    }
}

export default function AraMeetingPanel(): React.JSX.Element {
    const { authFetch } = useUser();
    const { integrations } = useIntegrations();

    // Recall.ai key from the per-user integrations bundle (write-only in the UI;
    // we only forward it, never render it). When present we pass it to the
    // backend so it can spawn the bot with the user's own Recall account.
    const recallApiKey = integrations?.recall?.apiKey ?? '';

    const [mode, setMode] = useState<MeetingMode>('visible');
    const [meetingUrl, setMeetingUrl] = useState('');

    // First-use consent acknowledgment. Read at mount in an effect (SSR-safe),
    // not during render. Until acknowledged, Start is blocked behind the notice.
    const [consentAcked, setConsentAcked] = useState(false);
    const [consentChecked, setConsentChecked] = useState(false);

    // Electron availability — resolved in an effect so the first server/SSR pass
    // never touches window. Background mode stays disabled until this is true.
    const [isElectron, setIsElectron] = useState(false);

    // Live session state.
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [botId, setBotId] = useState<string | null>(null);
    const [active, setActive] = useState(false);
    const [starting, setStarting] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);

    const transcriptEndRef = useRef<HTMLDivElement>(null);

    // ── Mount-time, SSR-safe reads ────────────────────────────────────────
    useEffect(() => {
        try {
            setConsentAcked(localStorage.getItem(CONSENT_ACK_KEY) === 'true');
        } catch { /* sandboxed */ }
        const api = getElectronApi();
        setIsElectron(!!api?.isElectron && typeof api?.startBackgroundMeeting === 'function');
    }, []);

    const acceptConsent = useCallback(() => {
        setConsentAcked(true);
        try { localStorage.setItem(CONSENT_ACK_KEY, 'true'); } catch { /* sandboxed */ }
    }, []);

    // Auto-scroll transcript to the newest line.
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [snapshot?.utterances?.length, snapshot?.transcript]);

    // ── Poll the live session every ~3s while active ──────────────────────
    useEffect(() => {
        if (!active || !sessionId) return;
        let cancelled = false;

        const poll = async () => {
            try {
                const res = await authFetch(`${API_MEETING}/session/${encodeURIComponent(sessionId)}`);
                if (!res.ok) throw new Error(`Session poll failed (${res.status})`);
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                // Accept either a bare snapshot or the app's { success, data } envelope.
                const snap: SessionSnapshot = (data && typeof data === 'object' && 'data' in data && data.data)
                    ? data.data
                    : data;
                setSnapshot(snap);
                setError(null);
                // The backend reports the meeting ended → flip out of active.
                const status = (snap?.status || '').toLowerCase();
                if (status === 'ended' || status === 'done' || status === 'stopped' || status === 'failed') {
                    setActive(false);
                }
            } catch (err) {
                if (cancelled) return;
                // A transient poll failure shouldn't tear the session down — surface
                // it softly and keep polling (the meeting may still be live).
                setError(err instanceof Error ? err.message : 'Lost contact with the session.');
            }
        };

        void poll();
        const id = window.setInterval(poll, POLL_MS);
        return () => { cancelled = true; window.clearInterval(id); };
    }, [active, sessionId, authFetch]);

    // ── Start ─────────────────────────────────────────────────────────────
    const start = useCallback(async () => {
        setError(null);
        if (!consentAcked) { setError('Please acknowledge the recording notice first.'); return; }

        if (mode === 'visible') {
            const url = meetingUrl.trim();
            if (!url) { setError('Paste the meeting link (Zoom / Meet / Teams) to send the note-taker.'); return; }
            setStarting(true);
            try {
                const res = await authFetch(`${API_MEETING}/bot/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        meetingUrl: url,
                        // Forward the user's own Recall key when they've set one.
                        ...(recallApiKey ? { recallApiKey } : {}),
                    }),
                });
                const data = await res.json().catch(() => ({}));
                const payload = (data && 'data' in data && data.data) ? data.data : data;
                if (!res.ok || !payload?.sessionId) {
                    throw new Error(payload?.error || data?.error || `Couldn't start the note-taker (${res.status}).`);
                }
                setSessionId(payload.sessionId);
                setBotId(payload.botId ?? null);
                setSnapshot(null);
                setActive(true);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to start the meeting bot.');
            } finally {
                setStarting(false);
            }
            return;
        }

        // ── Background (private) — desktop only ──
        const api = getElectronApi();
        if (!api?.isElectron || typeof api.startBackgroundMeeting !== 'function') {
            setError('Background mode requires the Dwellium desktop app.');
            return;
        }
        setStarting(true);
        try {
            // Background capture mints its own session id client-side; the desktop
            // agent streams audio to the backend under it (apiBase tells the main
            // process where to POST).
            const localSessionId = `bg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
            await api.startBackgroundMeeting({ sessionId: localSessionId, apiBase: API_BASE });
            setSessionId(localSessionId);
            setBotId(null);
            setSnapshot(null);
            setActive(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start background capture.');
        } finally {
            setStarting(false);
        }
    }, [consentAcked, mode, meetingUrl, recallApiKey, authFetch]);

    // ── Stop ────────────────────────────────────────────────────────────────
    const stop = useCallback(async () => {
        setStopping(true);
        setError(null);
        try {
            if (mode === 'background') {
                const api = getElectronApi();
                try { await api?.stopBackgroundMeeting?.(); } catch { /* best-effort */ }
            } else if (botId) {
                await authFetch(`${API_MEETING}/bot/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ botId }),
                }).catch(() => { /* best-effort — we still end the session locally */ });
            }
        } finally {
            setActive(false);
            setStopping(false);
        }
    }, [mode, botId, authFetch]);

    const utterances = snapshot?.utterances ?? [];
    const coaching = snapshot?.coaching;
    const hasTranscript = utterances.length > 0 || !!snapshot?.transcript;

    const backgroundDisabledNote = useMemo(
        // Show whenever the desktop bridge is absent, so a web user sees WHY the
        // Background option is greyed out — not only after selecting it (a web
        // build can't, since the option is disabled). Matches the header doc.
        () => (!isElectron
            ? 'Background mode requires the Dwellium desktop app.'
            : null),
        [isElectron],
    );

    return (
        <div className="ara-meeting" style={rootStyle}>
            <header style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Meeting Notetaker
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    ARA listens in, takes the notes, and coaches you privately — it never speaks in the call.
                </p>
                <div style={{ marginTop: 8 }}>
                    <button
                        type="button"
                        className="cp-btn cp-btn--ghost"
                        style={{
                            width: 'auto',
                            padding: '4px 10px',
                            fontSize: '11px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--accent-subtle, color-mix(in srgb, var(--accent) 10%, transparent))',
                            color: 'var(--accent-text, var(--accent))',
                            border: '1px solid var(--accent)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }}
                        onClick={() => window.open('/__eye-contact/index.html', '_blank', 'width=1200,height=800,resizable=yes')}
                    >
                        Configure Eye-Correction Module
                    </button>
                </div>
            </header>

            {/* ── First-use consent acknowledgment ── */}
            {!consentAcked && (
                <div style={consentBoxStyle} role="region" aria-label="Recording consent notice">
                    <strong style={{ display: 'block', marginBottom: 6, color: 'var(--text-primary)' }}>
                        Before you record
                    </strong>
                    <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                        ARA's note-taker records and transcribes the meeting so it can summarize and coach you.
                        Recording other participants may require <em>their</em> consent depending on where you and
                        they are. You're responsible for getting it — the visible note-taker mode helps by making
                        the recording obvious to everyone in the call.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox"
                            checked={consentChecked}
                            onChange={e => setConsentChecked(e.target.checked)}
                            style={{ marginTop: 2 }}
                        />
                        <span>I understand and will get participant consent where it's required.</span>
                    </label>
                    <button
                        type="button"
                        className="cp-btn"
                        style={{ width: 'auto', marginTop: 10, padding: '6px 14px' }}
                        disabled={!consentChecked}
                        onClick={acceptConsent}
                    >
                        Got it
                    </button>
                </div>
            )}

            {/* ── Active: recording indicator + live view ── */}
            {active ? (
                <>
                    <div style={recordingBannerStyle} role="status" aria-live="polite">
                        <span style={recordingDotStyle} aria-hidden="true" />
                        <span style={{ fontWeight: 600 }}>
                            {mode === 'visible'
                                ? 'Recording — ARA Notetaker is in this call'
                                : 'Recording in background'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {snapshot?.status ? `status: ${snapshot.status}` : 'connecting…'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <button
                            type="button"
                            className="cp-btn cp-btn--danger"
                            style={{ width: 'auto', padding: '6px 16px' }}
                            onClick={stop}
                            disabled={stopping}
                        >
                            {stopping ? 'Stopping…' : 'Stop & save notes'}
                        </button>
                    </div>

                    {/* Live transcript */}
                    <section aria-label="Live transcript" style={{ marginBottom: 12 }}>
                        <div style={sectionLabelStyle}>Live transcript</div>
                        <div style={transcriptBoxStyle}>
                            {hasTranscript ? (
                                utterances.length > 0 ? (
                                    utterances.map((u, i) => (
                                        <div key={i} style={{ marginBottom: 6, fontSize: 12.5, lineHeight: 1.5 }}>
                                            {u.speaker && (
                                                <span style={{ fontWeight: 600, color: 'var(--accent-text, var(--accent))' }}>
                                                    {u.speaker}:{' '}
                                                </span>
                                            )}
                                            <span style={{ color: 'var(--text-secondary)' }}>{u.text}</span>
                                        </div>
                                    ))
                                ) : (
                                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                        {snapshot?.transcript}
                                    </p>
                                )
                            ) : (
                                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                                    Waiting for the first words…
                                </p>
                            )}
                            <div ref={transcriptEndRef} />
                        </div>
                    </section>

                    {/* ARA coaching */}
                    <section aria-label="ARA coaching" style={{ marginBottom: 4 }}>
                        <div style={sectionLabelStyle}>ARA coaching</div>
                        <div style={coachingBoxStyle}>
                            {coaching?.status && (
                                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                                    {coaching.status}
                                </div>
                            )}
                            {coaching?.feedback && (
                                <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                    {coaching.feedback}
                                </p>
                            )}
                            {coaching?.flags && coaching.flags.length > 0 && (
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                    {coaching.flags.map((f, i) => (
                                        <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{f}</li>
                                    ))}
                                </ul>
                            )}
                            {!coaching?.status && !coaching?.feedback && !(coaching?.flags && coaching.flags.length) && (
                                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                                    ARA will chime in with coaching as the conversation develops.
                                </p>
                            )}
                        </div>
                    </section>
                </>
            ) : (
                /* ── Idle: mode toggle + start control ── */
                <>
                    <div style={sectionLabelStyle}>Mode</div>
                    <div role="radiogroup" aria-label="Note-taker mode" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <ModeOption
                            selected={mode === 'visible'}
                            onSelect={() => { setMode('visible'); setError(null); }}
                            title="① Visible note-taker"
                            desc="A bot joins the call as “ARA Notetaker” — everyone can see it."
                        />
                        <ModeOption
                            selected={mode === 'background'}
                            onSelect={() => { setMode('background'); setError(null); }}
                            title="② Background (private)"
                            desc="The desktop app captures audio quietly — no bot in the call."
                            disabled={!isElectron}
                        />
                    </div>

                    {mode === 'visible' && (
                        <div className="cp-field" style={{ marginBottom: 12 }}>
                            <label className="cp-label" htmlFor="ara-meeting-url">Meeting link</label>
                            <input
                                id="ara-meeting-url"
                                className="cp-input"
                                type="url"
                                inputMode="url"
                                placeholder="https://zoom.us/j/…  ·  meet.google.com/…  ·  teams.microsoft.com/…"
                                value={meetingUrl}
                                onChange={e => setMeetingUrl(e.target.value)}
                                spellCheck={false}
                                autoComplete="off"
                            />
                            {!recallApiKey && (
                                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                    No Recall.ai key set — the server will use its own if configured. Add yours in
                                    Settings → API Keys → Recall.ai to use your account.
                                </p>
                            )}
                        </div>
                    )}

                    {backgroundDisabledNote && (
                        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {backgroundDisabledNote}
                        </p>
                    )}

                    <button
                        type="button"
                        className="cp-btn"
                        style={{ width: 'auto', padding: '8px 18px' }}
                        onClick={start}
                        disabled={
                            starting ||
                            !consentAcked ||
                            (mode === 'background' && !isElectron) ||
                            (mode === 'visible' && meetingUrl.trim().length === 0)
                        }
                    >
                        {starting ? 'Starting…' : 'Start meeting assist'}
                    </button>
                </>
            )}

            {error && (
                <p role="alert" style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: 'var(--danger, #ef4444)' }}>
                    {error}
                </p>
            )}
        </div>
    );
}

// ── Mode toggle option (radio-styled card) ────────────────────────────────
function ModeOption({
    selected,
    onSelect,
    title,
    desc,
    disabled = false,
}: {
    selected: boolean;
    onSelect: () => void;
    title: string;
    desc: string;
    disabled?: boolean;
}): React.JSX.Element {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={disabled ? undefined : onSelect}
            disabled={disabled}
            style={{
                flex: 1,
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md, 8px)',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-default)'}`,
                background: selected ? 'var(--accent-subtle, color-mix(in srgb, var(--accent) 12%, transparent))' : 'var(--bg-surface)',
                color: 'var(--text-primary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                font: 'inherit',
            }}
        >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{title}</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--text-tertiary)' }}>{desc}</div>
        </button>
    );
}

// ── Styles (CSS-var driven → fey palette + theme aware) ───────────────────
const rootStyle: React.CSSProperties = {
    height: '100%',
    overflowY: 'auto',
    padding: 16,
    fontFamily: 'var(--font-primary, "Hanken Grotesk", -apple-system, sans-serif)',
    color: 'var(--text-primary)',
    background: 'var(--bg-canvas)',
};

const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-tertiary)',
    marginBottom: 6,
};

const consentBoxStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md, 8px)',
    background: 'var(--bg-surface)',
    padding: 14,
    marginBottom: 14,
};

const recordingBannerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 'var(--radius-md, 8px)',
    border: '1px solid var(--danger, #ef4444)',
    background: 'color-mix(in srgb, #ef4444 10%, transparent)',
    color: 'var(--text-primary)',
    fontSize: 13,
    marginBottom: 12,
};

const recordingDotStyle: React.CSSProperties = {
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: 'var(--danger, #ef4444)',
    boxShadow: '0 0 0 0 color-mix(in srgb, #ef4444 70%, transparent)',
    animation: 'ara-meeting-pulse 1.6s ease-out infinite',
    flex: '0 0 auto',
};

const transcriptBoxStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md, 8px)',
    background: 'var(--bg-surface)',
    padding: 12,
    maxHeight: 240,
    overflowY: 'auto',
};

const coachingBoxStyle: React.CSSProperties = {
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-md, 8px)',
    background: 'var(--accent-subtle, color-mix(in srgb, var(--accent) 8%, transparent))',
    padding: 12,
};
