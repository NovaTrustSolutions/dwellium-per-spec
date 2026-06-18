import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, Keyboard, MousePointerClick, RefreshCw, RotateCcw } from 'lucide-react';
import { API_BASE } from '../../config';
import { useUser } from '../../context/UserContext';
import './CloudBrowser.css';

interface CloudBrowserSession {
    id: string;
    url: string;
    title: string;
    width: number;
    height: number;
    createdAt: string;
    lastActiveAt: string;
}

interface CloudBrowserFrame {
    mimeType: 'image/png';
    base64: string;
    width: number;
    height: number;
}

interface CloudBrowserResponse {
    success?: boolean;
    error?: string;
    session?: CloudBrowserSession;
    frame?: CloudBrowserFrame;
    data?: {
        session?: CloudBrowserSession;
        frame?: CloudBrowserFrame;
    };
}

const API = `${API_BASE}/api/cloud-browser`;
const DEFAULT_URL = 'https://example.com';
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

function responseParts(json: CloudBrowserResponse): { session?: CloudBrowserSession; frame?: CloudBrowserFrame } {
    return {
        session: json.session ?? json.data?.session,
        frame: json.frame ?? json.data?.frame,
    };
}

function keyToBrowserKey(event: React.KeyboardEvent): string | null {
    if (event.metaKey || event.ctrlKey || event.altKey) return null;
    if (event.key.length === 1) return null;
    if (['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete'].includes(event.key)) {
        return event.key;
    }
    return null;
}

export default function CloudBrowser() {
    const { authFetch } = useUser();
    const [url, setUrl] = useState(DEFAULT_URL);
    const [session, setSession] = useState<CloudBrowserSession | null>(null);
    const [frame, setFrame] = useState<CloudBrowserFrame | null>(null);
    const [status, setStatus] = useState('Idle');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const frameRef = useRef<HTMLImageElement | null>(null);
    const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    const imageSrc = useMemo(() => {
        if (!frame?.base64) return '';
        return `data:${frame.mimeType};base64,${frame.base64}`;
    }, [frame]);

    const applyFrame = useCallback((json: CloudBrowserResponse) => {
        if (!json.success) throw new Error(json.error || 'Cloud Browser request failed');
        const parts = responseParts(json);
        if (!parts.session || !parts.frame) throw new Error('Cloud Browser response was incomplete');
        setSession(parts.session);
        sessionIdRef.current = parts.session.id;
        setFrame(parts.frame);
        setUrl(parts.session.url);
        setError(null);
    }, []);

    const requestFrame = useCallback(async (path: string, init?: RequestInit) => {
        const res = await authFetch(`${API}${path}`, init);
        const json = await res.json().catch(() => null) as CloudBrowserResponse | null;
        if (!res.ok || !json) throw new Error(json?.error || `Cloud Browser request failed (${res.status})`);
        applyFrame(json);
    }, [applyFrame, authFetch]);

    const start = useCallback(async (nextUrl = url) => {
        setBusy(true);
        setStatus('Opening');
        try {
            await requestFrame('/sessions', {
                method: 'POST',
                body: JSON.stringify({ url: nextUrl, ...DEFAULT_VIEWPORT }),
            });
            setStatus('Live');
            viewportRef.current?.focus();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Cloud Browser failed');
            setStatus('Blocked');
        } finally {
            setBusy(false);
        }
    }, [requestFrame, url]);

    const act = useCallback(async (path: string, body?: Record<string, unknown>, nextStatus = 'Live') => {
        if (!sessionIdRef.current) return;
        setBusy(true);
        setStatus(nextStatus);
        try {
            await requestFrame(`/sessions/${sessionIdRef.current}${path}`, {
                method: 'POST',
                body: JSON.stringify(body ?? {}),
            });
            setStatus('Live');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Cloud Browser action failed');
            setStatus('Check');
        } finally {
            setBusy(false);
        }
    }, [requestFrame]);

    const refreshFrame = useCallback(async () => {
        if (!sessionIdRef.current) return;
        try {
            await requestFrame(`/sessions/${sessionIdRef.current}/frame`);
        } catch {
            // Polling failure should not steal focus from the user's current task.
        }
    }, [requestFrame]);

    useEffect(() => {
        void start(DEFAULT_URL);
        return () => {
            const id = sessionIdRef.current;
            if (!id) return;
            void authFetch(`${API}/sessions/${id}`, { method: 'DELETE' }).catch(() => undefined);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!session?.id) return;
        const timer = setInterval(() => { void refreshFrame(); }, 3000);
        return () => clearInterval(timer);
    }, [refreshFrame, session?.id]);

    const navigate = useCallback(async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!sessionIdRef.current) {
            await start(url);
            return;
        }
        await act('/navigate', { url }, 'Navigating');
    }, [act, start, url]);

    const clickViewport = useCallback((event: React.MouseEvent<HTMLImageElement>) => {
        if (!frame || !sessionIdRef.current) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = Math.round(((event.clientX - rect.left) / rect.width) * frame.width);
        const y = Math.round(((event.clientY - rect.top) / rect.height) * frame.height);
        void act('/click', { x, y }, 'Clicking');
        viewportRef.current?.focus();
    }, [act, frame]);

    const wheelViewport = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        if (!sessionIdRef.current) return;
        event.preventDefault();
        if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
        const deltaX = Math.round(event.deltaX);
        const deltaY = Math.round(event.deltaY);
        wheelTimerRef.current = setTimeout(() => {
            void act('/scroll', { deltaX, deltaY }, 'Scrolling');
        }, 80);
    }, [act]);

    const keyViewport = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!sessionIdRef.current) return;
        const browserKey = keyToBrowserKey(event);
        if (browserKey) {
            event.preventDefault();
            void act('/key', { key: browserKey }, 'Key');
            return;
        }
        if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
            event.preventDefault();
            void act('/type', { text: event.key }, 'Typing');
        }
    }, [act]);

    return (
        <div className="cloud-browser">
            <form className="cloud-browser__toolbar" onSubmit={navigate}>
                <label className="cloud-browser__url-label">
                    <span>URL</span>
                    <input
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        className="cloud-browser__url"
                        type="url"
                        inputMode="url"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                </label>
                <button className="cloud-browser__button cloud-browser__button--primary" type="submit" disabled={busy} aria-label="Go">
                    <ArrowRight size={16} aria-hidden />
                    <span>Go</span>
                </button>
                <button className="cloud-browser__icon-button" type="button" disabled={!session || busy} onClick={() => act('/reload', {}, 'Refreshing')} aria-label="Refresh">
                    <RefreshCw size={16} aria-hidden />
                </button>
                <button className="cloud-browser__icon-button" type="button" disabled={busy} onClick={() => start(url)} aria-label="New cloud browser session">
                    <RotateCcw size={16} aria-hidden />
                </button>
                {session?.url && (
                    <a className="cloud-browser__icon-button" href={session.url} target="_blank" rel="noopener noreferrer" aria-label="Open current page in browser">
                        <ExternalLink size={16} aria-hidden />
                    </a>
                )}
            </form>

            <div className="cloud-browser__meta">
                <span className={`cloud-browser__status ${busy ? 'is-busy' : ''}`}>{status}</span>
                <span className="cloud-browser__title">{session?.title || 'Cloud Browser'}</span>
                <span className="cloud-browser__hint"><MousePointerClick size={13} aria-hidden /> <Keyboard size={13} aria-hidden /></span>
            </div>

            {error && <div className="cloud-browser__error" role="alert">{error}</div>}

            <div
                ref={viewportRef}
                className="cloud-browser__viewport"
                tabIndex={0}
                onWheel={wheelViewport}
                onKeyDown={keyViewport}
                onPaste={(event) => {
                    const text = event.clipboardData.getData('text');
                    if (text) {
                        event.preventDefault();
                        void act('/type', { text }, 'Typing');
                    }
                }}
            >
                {imageSrc ? (
                    <img
                        ref={frameRef}
                        className="cloud-browser__frame"
                        src={imageSrc}
                        alt="Cloud Browser viewport"
                        onClick={clickViewport}
                        draggable={false}
                    />
                ) : (
                    <div className="cloud-browser__empty">{busy ? 'Opening' : 'No session'}</div>
                )}
            </div>
        </div>
    );
}
