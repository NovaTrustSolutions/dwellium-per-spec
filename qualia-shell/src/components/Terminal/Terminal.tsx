import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import PaperclipPanel from './PaperclipPanel';
import LangFlowPanel from './LangFlowPanel';
import CrewAIPanel from './CrewAIPanel';
import { API_BASE } from '../../config';
import { useUser } from '../../context/UserContext';
import { runLocalCommand } from './localShell';
import './Terminal.css';

interface TerminalToolCapability {
    name: string;
    available: boolean;
}

interface TerminalCapabilities {
    shell: string;
    cwd: string;
    tools: TerminalToolCapability[];
}

interface TerminalSession {
    id: string;
    shell: string;
    cwd: string;
    cols: number;
    rows: number;
    startedAt: string;
    lastActiveAt: string;
    closedAt: string | null;
    exitCode: number | null;
}

const API_TERMINAL = `${API_BASE}/api/terminal`;
const OUTPUT_LIMIT = 200_000;
const POLL_INTERVAL_MS = 350;

function trimOutput(next: string): string {
    if (next.length <= OUTPUT_LIMIT) return next;
    return next.slice(next.length - OUTPUT_LIMIT);
}

function keyToControlSequence(event: React.KeyboardEvent<HTMLTextAreaElement>): string | null {
    if (event.key === 'Enter') return '\r';
    if (event.key === 'Backspace') return '\u007f';
    if (event.key === 'Tab') return '\t';
    if (event.key === 'Escape') return '\u001b';
    if (event.key === 'ArrowUp') return '\u001b[A';
    if (event.key === 'ArrowDown') return '\u001b[B';
    if (event.key === 'ArrowRight') return '\u001b[C';
    if (event.key === 'ArrowLeft') return '\u001b[D';
    if (event.key === 'Delete') return '\u001b[3~';
    if (event.key === 'Home') return '\u001b[H';
    if (event.key === 'End') return '\u001b[F';
    if (event.ctrlKey && event.key.toLowerCase() === 'c') return '\u0003';
    if (event.ctrlKey && event.key.toLowerCase() === 'd') return '\u0004';
    if (event.ctrlKey && event.key.toLowerCase() === 'l') return '\u000c';
    if (!event.metaKey && !event.altKey && !event.ctrlKey && event.key.length === 1) {
        return event.key;
    }
    return null;
}

export default function Terminal() {
    const { authFetch } = useUser();
    const [capabilities, setCapabilities] = useState<TerminalCapabilities | null>(null);
    const [session, setSession] = useState<TerminalSession | null>(null);
    const [cursor, setCursor] = useState(0);
    const [output, setOutput] = useState('');
    const [commandInput, setCommandInput] = useState('');
    const [isConnecting, setIsConnecting] = useState(true);
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    // True when the backend PTY routes are unreachable — the widget falls back
    // to a clearly-labeled local offline shell instead of looking dead.
    const [offline, setOffline] = useState(false);
    const [tab, setTab] = useState<'terminal' | 'paperclip' | 'langflow' | 'crewai'>('terminal');
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    const inputCaptureRef = useRef<HTMLTextAreaElement | null>(null);
    const scrollRef = useRef<HTMLPreElement | null>(null);
    const cursorRef = useRef(0);
    const sessionIdRef = useRef<string | null>(null);
    const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closedRef = useRef(false);

    const toolMap = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const tool of capabilities?.tools || []) {
            map.set(tool.name, tool.available);
        }
        return map;
    }, [capabilities]);

    const focusTerminal = useCallback(() => {
        inputCaptureRef.current?.focus();
    }, []);

    const sendRawInput = useCallback(async (input: string) => {
        if (!sessionIdRef.current || !input) return;
        try {
            await authFetch(`${API_TERMINAL}/sessions/${sessionIdRef.current}/input`, {
                method: 'POST',
                body: JSON.stringify({ input }),
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send terminal input');
        }
    }, [authFetch]);

    const pollOutput = useCallback(async () => {
        if (!sessionIdRef.current || closedRef.current) return;
        try {
            const res = await authFetch(`${API_TERMINAL}/sessions/${sessionIdRef.current}/output?cursor=${cursorRef.current}`);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success || !json?.data) {
                if (res.status === 404) {
                    closedRef.current = true;
                } else {
                    throw new Error(json?.error || `Terminal poll failed (${res.status})`);
                }
                return;
            }

            const nextChunks = Array.isArray(json.data.chunks) ? json.data.chunks : [];
            if (nextChunks.length > 0) {
                const chunkText = nextChunks.map((chunk: { data: string }) => chunk.data).join('');
                startTransition(() => {
                    setOutput(prev => trimOutput(prev + chunkText));
                });
            }

            cursorRef.current = json.data.nextCursor || cursorRef.current;
            setCursor(cursorRef.current);
            setSession(json.data.session || null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Terminal poll failed');
        }
    }, [authFetch]);

    const resizeSession = useCallback(async () => {
        if (!surfaceRef.current || !sessionIdRef.current) return;
        const rect = surfaceRef.current.getBoundingClientRect();
        const cols = Math.max(40, Math.floor((rect.width - 24) / 9));
        const rows = Math.max(12, Math.floor((rect.height - 24) / 19));
        try {
            await authFetch(`${API_TERMINAL}/sessions/${sessionIdRef.current}/resize`, {
                method: 'POST',
                body: JSON.stringify({ cols, rows }),
            });
        } catch {
            // Keep the session usable even if resize fails.
        }
    }, [authFetch]);

    const closeSession = useCallback(async () => {
        const sessionId = sessionIdRef.current;
        sessionIdRef.current = null;
        cursorRef.current = 0;
        closedRef.current = true;
        if (!sessionId) return;
        try {
            await authFetch(`${API_TERMINAL}/sessions/${sessionId}`, { method: 'DELETE' });
        } catch {
            // Ignore cleanup failures on teardown.
        }
    }, [authFetch]);

    const createSession = useCallback(async () => {
        setIsConnecting(true);
        setIsBusy(true);
        setError(null);
        setSaveMsg(null);
        setOutput('');
        setCursor(0);
        cursorRef.current = 0;
        closedRef.current = false;

        try {
            const capsRes = await authFetch(`${API_TERMINAL}/capabilities`);
            // Detect the "backend not wired" case BEFORE attempting JSON parse:
            // Vite's dev proxy hands back index.html for unknown /api/ paths in
            // some configs, which yields an uninterpretable JSON parse error.
            if (capsRes.status === 404) {
                throw new Error('Terminal backend not available — no /api/terminal route configured on the backend.');
            }
            const ct = capsRes.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
                throw new Error('Terminal backend not available — capabilities endpoint did not return JSON.');
            }
            const capsJson = await capsRes.json();
            if (!capsRes.ok || !capsJson?.success) {
                throw new Error(capsJson?.error || `Failed to load terminal capabilities (${capsRes.status})`);
            }
            // Backend responded but the payload is malformed (no cwd). The old
            // code crashed here with "Cannot read properties of undefined
            // (reading 'cwd')" — surfaced live this session. Fail clearly and
            // fall through to the offline shell instead.
            if (!capsJson.data || typeof capsJson.data.cwd === 'undefined') {
                throw new Error('Terminal backend unavailable — capabilities response was malformed (no cwd).');
            }
            setCapabilities(capsJson.data);

            const res = await authFetch(`${API_TERMINAL}/sessions`, {
                method: 'POST',
                body: JSON.stringify({ cwd: capsJson.data.cwd }),
            });
            const json = await res.json();
            if (!res.ok || !json?.success || !json?.data?.session) {
                throw new Error(json?.error || `Failed to start terminal session (${res.status})`);
            }

            sessionIdRef.current = json.data.session.id;
            setSession(json.data.session);
            setOffline(false);
            cursorRef.current = json.data.nextCursor || 0;
            setCursor(cursorRef.current);
            const initialOutput = (json.data.chunks || []).map((chunk: { data: string }) => chunk.data).join('');
            setOutput(initialOutput);
            setSaveMsg('Live session connected');
            setTimeout(() => setSaveMsg(null), 2500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start terminal session');
            // No backend session → switch to the local offline shell.
            setOffline(true);
        } finally {
            setIsConnecting(false);
            setIsBusy(false);
        }
    }, [authFetch]);

    useEffect(() => {
        void createSession();
        return () => {
            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
            void closeSession();
        };
    }, [createSession, closeSession]);

    useEffect(() => {
        if (!sessionIdRef.current || closedRef.current) return;
        const timer = setInterval(() => {
            void pollOutput();
        }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [pollOutput, session?.id]);

    useEffect(() => {
        const observer = new ResizeObserver(() => {
            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
            resizeTimerRef.current = setTimeout(() => {
                void resizeSession();
            }, 120);
        });
        if (surfaceRef.current) observer.observe(surfaceRef.current);
        return () => observer.disconnect();
    }, [resizeSession]);

    useEffect(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [output]);

    const runCommand = useCallback(async (command: string) => {
        const trimmed = command.trim();
        if (!trimmed) return;
        setCommandInput('');
        focusTerminal();
        // Offline (no backend session): interpret a small set of commands locally
        // so the widget is usable + honest instead of silently doing nothing.
        if (offline || !sessionIdRef.current) {
            const result = runLocalCommand(trimmed, { cwd: '~' });
            if (result.clear) {
                setOutput('');
            } else {
                setOutput(prev => trimOutput(`${prev}${prev ? '\n' : ''}$ ${trimmed}\n${result.output}`));
            }
            return;
        }
        await sendRawInput(`${trimmed}\r`);
    }, [offline, focusTerminal, sendRawInput]);

    const sendSignal = useCallback(async (signal: 'SIGINT' | 'SIGTERM' | 'EOF') => {
        if (!sessionIdRef.current) return;
        try {
            await authFetch(`${API_TERMINAL}/sessions/${sessionIdRef.current}/signal`, {
                method: 'POST',
                body: JSON.stringify({ signal }),
            });
            focusTerminal();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send signal');
        }
    }, [authFetch, focusTerminal]);

    const quickCommands = useMemo(() => {
        if (offline) return ['help', 'date', 'clear'];
        const commands = ['pwd', 'ls -la', 'git status'];
        if (toolMap.get('claude')) commands.push('claude');
        return commands;
    }, [offline, toolMap]);

    return (
        <div className="qualia-terminal">
            <div style={{ display: 'flex', gap: 4, padding: '6px 10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                {(['terminal', 'paperclip', 'langflow', 'crewai'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            border: 'none', background: 'transparent',
                            borderBottom: tab === t ? '2px solid #D6FE51' : '2px solid transparent',
                            color: tab === t ? '#D6FE51' : '#888',
                        }}
                    >{({ terminal: 'Terminal', paperclip: 'Paperclip', langflow: 'LangFlow', crewai: 'CrewAI' } as const)[t]}</button>
                ))}
            </div>
            {tab === 'paperclip' ? <PaperclipPanel /> : tab === 'langflow' ? <LangFlowPanel /> : tab === 'crewai' ? <CrewAIPanel /> : (
            <>
            <div className="qualia-terminal__header">
                <div>
                    <div className="qualia-terminal__title">Workspace Terminal</div>
                    <div className="qualia-terminal__meta">
                        <span>{capabilities?.shell || session?.shell || 'shell'}</span>
                        <span>•</span>
                        <span>{session?.cwd || capabilities?.cwd || 'Loading…'}</span>
                        <span>•</span>
                        <span>{session?.closedAt ? `Exited (${session.exitCode ?? 'unknown'})` : 'Live'}</span>
                    </div>
                </div>
                <div className="qualia-terminal__header-actions">
                    {saveMsg && <span className="qualia-terminal__status qualia-terminal__status--ok">{saveMsg}</span>}
                    {error && <span className="qualia-terminal__status qualia-terminal__status--error">{error}</span>}
                    <button className="qualia-terminal__action" onClick={() => void createSession()} disabled={isBusy}>
                        Restart
                    </button>
                    <button className="qualia-terminal__action" onClick={focusTerminal}>
                        Focus
                    </button>
                </div>
            </div>

            <div className="qualia-terminal__toolbar">
                <div className="qualia-terminal__tools">
                    {(capabilities?.tools || []).map(tool => (
                        <span
                            key={tool.name}
                            className={`qualia-terminal__tool ${tool.available ? 'qualia-terminal__tool--available' : ''}`}
                        >
                            {tool.name}
                        </span>
                    ))}
                </div>
                <div className="qualia-terminal__quick-actions">
                    {quickCommands.map(command => (
                        <button
                            key={command}
                            className="qualia-terminal__quick-btn"
                            onClick={() => void runCommand(command)}
                            disabled={isConnecting || (!session && !offline)}
                        >
                            {command}
                        </button>
                    ))}
                </div>
            </div>

            {offline && (
                <div
                    className="qualia-terminal__offline"
                    role="status"
                    style={{ padding: '6px 12px', background: 'rgba(249,115,22,0.12)', borderTop: '1px solid rgba(249,115,22,0.4)', borderBottom: '1px solid rgba(249,115,22,0.4)', color: '#fdba74', fontSize: 12 }}
                >
                    ⚠ Backend terminal unavailable — running a limited <strong>offline shell</strong>. Type <code>help</code>; connect the backend for a full PTY shell.
                </div>
            )}
            <div
                ref={surfaceRef}
                className="qualia-terminal__surface"
                onClick={focusTerminal}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        focusTerminal();
                    }
                }}
            >
                <pre ref={scrollRef} className="qualia-terminal__output">
                    {output || (isConnecting ? 'Connecting terminal…' : offline ? 'Offline shell ready — type "help" then press Run. Connect the backend for a full PTY shell.' : 'Terminal ready. Click here and start typing.')}
                </pre>
                <textarea
                    ref={inputCaptureRef}
                    className="qualia-terminal__input-capture"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    onPaste={(event) => {
                        const text = event.clipboardData.getData('text');
                        if (text) {
                            event.preventDefault();
                            void sendRawInput(text);
                        }
                    }}
                    onKeyDown={(event) => {
                        const sequence = keyToControlSequence(event);
                        if (!sequence) return;
                        event.preventDefault();
                        void sendRawInput(sequence);
                    }}
                />
            </div>

            <div className="qualia-terminal__footer">
                <form
                    className="qualia-terminal__command-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void runCommand(commandInput);
                    }}
                >
                    <input
                        className="qualia-terminal__command-input"
                        value={commandInput}
                        onChange={(event) => setCommandInput(event.target.value)}
                        placeholder="Run a command or launch a CLI like claude"
                    />
                    <button className="qualia-terminal__send" type="submit" disabled={!commandInput.trim()}>
                        Run
                    </button>
                </form>
                <div className="qualia-terminal__signal-actions">
                    <button className="qualia-terminal__signal" onClick={() => void sendSignal('SIGINT')}>
                        Ctrl+C
                    </button>
                    <button className="qualia-terminal__signal" onClick={() => void sendSignal('EOF')}>
                        Ctrl+D
                    </button>
                    <span className="qualia-terminal__cursor">cursor {cursor}</span>
                </div>
            </div>
            </>
            )}
        </div>
    );
}
