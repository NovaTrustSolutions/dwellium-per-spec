/**
 * OpenJarvis — Global floating AI assistant for Dwellium
 * Adapted from the Stanford OpenJarvis project (Apache 2.0)
 * https://github.com/open-jarvis/OpenJarvis
 *
 * Architecture: Floating pill → expandable slide-out panel
 * Available globally across all Dwellium modules.
 *
 * Features:
 * - SSE streaming chat with OpenAI-compatible API
 * - Markdown rendering with code block copy
 * - Voice input (mic → transcription)
 * - Tool call visualization
 * - Conversation history (localStorage)
 * - Context-aware (knows active module)
 * - Theme-aware (uses Dwellium CSS variables)
 * - Resizable panel
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './OpenJarvis.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface ToolCallInfo {
  id: string;
  tool: string;
  arguments: string;
  status: 'running' | 'success' | 'error';
  result?: string;
  latency?: number;
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface MessageTelemetry {
  engine?: string;
  model_id?: string;
  tokens_per_sec?: number;
  ttft_ms?: number;
  total_ms?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  usage?: TokenUsage;
  telemetry?: MessageTelemetry;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface StreamState {
  isStreaming: boolean;
  phase: string;
  content: string;
  activeToolCalls: ToolCallInfo[];
}

type SpeechState = 'idle' | 'recording' | 'transcribing';

// ─── Config ─────────────────────────────────────────────────────────────

const JARVIS_STORAGE_KEY = 'dwellium-jarvis-conversations';
const JARVIS_PANEL_STATE_KEY = 'dwellium-jarvis-panel';
const DWELLIUM_API = 'http://127.0.0.1:3000';
const JARVIS_API_BASE_KEY = 'dwellium-jarvis-api-base';
const JARVIS_MODEL_KEY = 'dwellium-jarvis-model';

type ConnectionStatus = 'connected' | 'disconnected' | 'checking';
const HEALTH_CHECK_INTERVAL = 30_000; // 30s

function getApiBase(): string {
  try {
    const saved = localStorage.getItem(JARVIS_API_BASE_KEY);
    if (saved) return saved.replace(/\/+$/, '');
  } catch {}
  return DWELLIUM_API;
}

function getModel(): string {
  try {
    const saved = localStorage.getItem(JARVIS_MODEL_KEY);
    if (saved) return saved;
  } catch {}
  return 'gpt-4o-mini';
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── Persistence ────────────────────────────────────────────────────────

function loadConversations(): { conversations: Record<string, Conversation>; activeId: string | null } {
  try {
    const raw = localStorage.getItem(JARVIS_STORAGE_KEY);
    if (!raw) return { conversations: {}, activeId: null };
    return JSON.parse(raw);
  } catch {
    return { conversations: {}, activeId: null };
  }
}

function saveConversations(data: { conversations: Record<string, Conversation>; activeId: string | null }): void {
  localStorage.setItem(JARVIS_STORAGE_KEY, JSON.stringify(data));
}

function getAuthToken(): string | null {
  try { return localStorage.getItem('dwellium-auth-token'); } catch { return null; }
}

// ─── SSE Streaming ──────────────────────────────────────────────────────

async function* streamChat(
  apiBase: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): AsyncGenerator<{ event?: string; data: string }> {
  // Try ARA endpoint first (Dwellium backend)
  try {
    const latestMessage = messages[messages.length - 1]?.content || '';
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) authHeaders['Authorization'] = `Bearer ${token}`;

    const araResponse = await fetch(`${apiBase}/api/ara/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        mode: 'chief-of-staff',
        message: latestMessage,
      }),
      signal,
    });

    if (araResponse.ok) {
      const json = await araResponse.json();
      const reply = json.data?.content || json.reply || '';
      if (reply) {
        yield {
          data: JSON.stringify({
            choices: [{ delta: { content: reply }, finish_reason: 'stop' }],
            usage: json.data?.usage || json.usage,
          }),
        };
      }
      return;
    }
  } catch {
    // ARA endpoint not available, fall through
  }

  // Fallback: OpenAI-compatible streaming endpoint
  const fallbackHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const fbToken = getAuthToken();
  if (fbToken) fallbackHeaders['Authorization'] = `Bearer ${fbToken}`;

  const response = await fetch(`${apiBase}/v1/chat/completions`, {
    method: 'POST',
    headers: fallbackHeaders,
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!response.ok) throw new Error(`Chat request failed: ${response.status}`);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      let currentEvent: string | undefined;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          yield { event: currentEvent, data };
          currentEvent = undefined;
        } else if (line.trim() === '') {
          currentEvent = undefined;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────

function getTextContent(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (node?.props?.children) return getTextContent(node.props.children);
  return '';
}

function CodeBlockPre({ children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || '';
  const match = /language-([\w-]+)/.exec(className);
  const lang = match ? match[1] : '';
  const code = getTextContent(codeElement?.props?.children).replace(/\n$/, '');

  return (
    <div className="oj-code-block">
      <div className="oj-code-header">
        <span className="oj-code-lang">{lang || 'code'}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="oj-code-copy-btn">
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      </div>
      <pre {...props} className="oj-code-pre">{children}</pre>
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const emoji = toolCall.status === 'running' ? '⏳' : toolCall.status === 'success' ? '✅' : '❌';

  return (
    <div className="oj-tool-card">
      <button onClick={() => setExpanded(!expanded)} className="oj-tool-header">
        <span className="oj-tool-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="oj-tool-icon">🔧</span>
        <span className="oj-tool-name">{toolCall.tool}</span>
        <span style={{ flex: 1 }} />
        <span>{emoji}</span>
        {toolCall.latency != null && (
          <span className="oj-tool-latency">
            {toolCall.latency < 1000 ? `${Math.round(toolCall.latency)}ms` : `${(toolCall.latency / 1000).toFixed(1)}s`}
          </span>
        )}
      </button>
      {expanded && (
        <div className="oj-tool-body">
          {toolCall.arguments && <div className="oj-tool-section"><div className="oj-tool-label">Arguments</div><pre className="oj-tool-pre">{toolCall.arguments}</pre></div>}
          {toolCall.result && <div className="oj-tool-section"><div className="oj-tool-label">Result</div><pre className="oj-tool-pre">{toolCall.result}</pre></div>}
        </div>
      )}
    </div>
  );
}

function XRayFooter({ usage, telemetry }: { usage?: TokenUsage; telemetry?: MessageTelemetry }) {
  const [expanded, setExpanded] = useState(false);
  const parts: string[] = [];
  if (telemetry?.model_id) parts.push(telemetry.model_id);
  if (telemetry?.total_ms) parts.push(telemetry.total_ms < 1000 ? `${Math.round(telemetry.total_ms)}ms` : `${(telemetry.total_ms / 1000).toFixed(1)}s`);
  if (usage) parts.push(`${usage.total_tokens} tokens`);
  if (parts.length === 0) return null;

  return (
    <div className="oj-xray">
      <button onClick={() => setExpanded(!expanded)} className="oj-xray-toggle">
        <span className="oj-xray-dot" />
        <span className="oj-xray-text">{parts.join(' · ')}</span>
        <span className="oj-xray-chevron">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <div className="oj-xray-detail">
          {telemetry?.tokens_per_sec && <div><span className="oj-xray-label">Speed</span> {Math.round(telemetry.tokens_per_sec)} tok/s</div>}
          {telemetry?.ttft_ms != null && <div><span className="oj-xray-label">TTFT</span> {Math.round(telemetry.ttft_ms)}ms</div>}
          {usage && <div><span className="oj-xray-label">Tokens</span> {usage.prompt_tokens} in · {usage.completion_tokens} out</div>}
        </div>
      )}
    </div>
  );
}

function StreamingDots({ phase }: { phase: string }) {
  return (
    <div className="oj-streaming-dots">
      <div className="oj-dots">
        <span className="oj-dot" style={{ animationDelay: '0ms' }} />
        <span className="oj-dot" style={{ animationDelay: '150ms' }} />
        <span className="oj-dot" style={{ animationDelay: '300ms' }} />
      </div>
      {phase && <span className="oj-phase-text">{phase}</span>}
    </div>
  );
}

function stripThinkTags(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  cleaned = cleaned.replace(/^[\s\S]*?<\/think>\s*/i, '');
  return cleaned.trim();
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="oj-msg-row oj-msg-user">
        <div className="oj-user-bubble">{message.content}</div>
      </div>
    );
  }

  if (message.role === 'system') return null;
  const cleanContent = stripThinkTags(message.content);

  return (
    <div className="oj-msg-row oj-msg-assistant">
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="oj-tool-calls">
          {message.toolCalls.map((tc) => <ToolCallCard key={tc.id} toolCall={tc} />)}
        </div>
      )}
      {cleanContent && (
        <div className="oj-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlockPre }}>
            {cleanContent}
          </ReactMarkdown>
        </div>
      )}
      <div className="oj-msg-actions">
        <button onClick={() => { navigator.clipboard.writeText(cleanContent); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="oj-copy-btn" title="Copy">
          {copied ? '✓' : '⎘'}
        </button>
      </div>
      <XRayFooter usage={message.usage} telemetry={message.telemetry} />
    </div>
  );
}

function MicButton({ state, onClick, disabled }: { state: SpeechState; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled || state === 'transcribing'} className={`oj-mic-btn ${state === 'recording' ? 'oj-mic-recording' : ''}`} title={state === 'recording' ? 'Stop' : 'Voice'}>
      {state === 'transcribing' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite" /></circle></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z" /><path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z" /></svg>
      )}
    </button>
  );
}

// ─── Conversation History Drawer ────────────────────────────────────────

function HistoryDrawer({
  open, conversations, activeId, onSelect, onNew, onDelete, onClose,
}: {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="oj-history-drawer">
      <div className="oj-history-header">
        <span>History</span>
        <button onClick={onClose} className="oj-history-close">×</button>
      </div>
      <button onClick={() => { onNew(); onClose(); }} className="oj-new-chat-btn">+ New Chat</button>
      <div className="oj-history-list">
        {conversations.map((conv) => (
          <div key={conv.id} className={`oj-history-item ${conv.id === activeId ? 'oj-history-active' : ''}`} onClick={() => { onSelect(conv.id); onClose(); }}>
            <span className="oj-history-title">{conv.title}</span>
            <span className="oj-history-time">{new Date(conv.updatedAt).toLocaleDateString()}</span>
            <button onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }} className="oj-history-delete" title="Delete">×</button>
          </div>
        ))}
        {conversations.length === 0 && <div className="oj-history-empty">No conversations yet</div>}
      </div>
    </div>
  );
}

// ─── Settings Panel ─────────────────────────────────────────────────────

function SettingsPanel({
  open, onClose, apiBase, setApiBase, model, setModel,
}: {
  open: boolean; onClose: () => void;
  apiBase: string; setApiBase: (v: string) => void;
  model: string; setModel: (v: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="oj-settings-overlay" onClick={onClose}>
      <div className="oj-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="oj-settings-header">
          <h3>Jarvis Settings</h3>
          <button onClick={onClose} className="oj-settings-close">×</button>
        </div>
        <div className="oj-settings-body">
          <label className="oj-settings-label">
            API Base URL
            <input className="oj-settings-input" value={apiBase} onChange={(e) => { setApiBase(e.target.value); localStorage.setItem(JARVIS_API_BASE_KEY, e.target.value); }} placeholder="http://127.0.0.1:3000" />
          </label>
          <label className="oj-settings-label">
            Model
            <input className="oj-settings-input" value={model} onChange={(e) => { setModel(e.target.value); localStorage.setItem(JARVIS_MODEL_KEY, e.target.value); }} placeholder="gpt-4o-mini" />
          </label>
          <div className="oj-settings-hint">
            Connects to Dwellium ARA backend by default, or any OpenAI-compatible endpoint including a local OpenJarvis server.
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Main Export: Global Floating Jarvis Widget ──────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export default function OpenJarvisWidget() {
  // Panel state
  const [isOpen, setIsOpen] = useState(() => {
    try { return localStorage.getItem(JARVIS_PANEL_STATE_KEY) === 'open'; } catch { return false; }
  });
  const [isMinimized, setIsMinimized] = useState(false);

  // Chat state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamState, setStreamState] = useState<StreamState>({
    isStreaming: false, phase: '', content: '', activeToolCalls: [],
  });

  // UI state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiBase, setApiBase] = useState(getApiBase);
  const [model, setModel] = useState(getModel);

  // Speech
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Refs
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const shouldAutoScroll = useRef(true);

  // Pulse animation counter
  const [unreadCount, setUnreadCount] = useState(0);

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');

  // ─── Lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    const data = loadConversations();
    const convList = Object.values(data.conversations).sort((a, b) => b.updatedAt - a.updatedAt);
    setConversations(convList);
    setActiveId(data.activeId);
    if (data.activeId && data.conversations[data.activeId]) {
      setMessages(data.conversations[data.activeId].messages);
    }
  }, []);

  // Health check — ping backend every 30s to track connection status
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(5000) });
        if (active) setConnectionStatus(res.ok ? 'connected' : 'disconnected');
      } catch {
        if (active) setConnectionStatus('disconnected');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);
    return () => { active = false; clearInterval(interval); };
  }, [apiBase]);

  useEffect(() => {
    if (shouldAutoScroll.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamState.content]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  // Persist panel state
  useEffect(() => {
    localStorage.setItem(JARVIS_PANEL_STATE_KEY, isOpen ? 'open' : 'closed');
  }, [isOpen]);

  // Keyboard shortcut: Cmd+J to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setIsMinimized(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  // ─── Conversation CRUD ───────────────────────────────────────────────

  const refreshConversations = useCallback(() => {
    const data = loadConversations();
    setConversations(Object.values(data.conversations).sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);

  const createConversation = useCallback(() => {
    const data = loadConversations();
    const conv: Conversation = {
      id: generateId(), title: 'New chat',
      createdAt: Date.now(), updatedAt: Date.now(), messages: [],
    };
    data.conversations[conv.id] = conv;
    data.activeId = conv.id;
    saveConversations(data);
    setActiveId(conv.id);
    setMessages([]);
    refreshConversations();
    return conv.id;
  }, [refreshConversations]);

  const selectConversation = useCallback((id: string) => {
    const data = loadConversations();
    data.activeId = id;
    saveConversations(data);
    setActiveId(id);
    setMessages(data.conversations[id]?.messages || []);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    const data = loadConversations();
    delete data.conversations[id];
    if (data.activeId === id) {
      const remaining = Object.keys(data.conversations);
      data.activeId = remaining.length > 0 ? remaining[0] : null;
    }
    saveConversations(data);
    setActiveId(data.activeId);
    setMessages(data.activeId && data.conversations[data.activeId] ? data.conversations[data.activeId].messages : []);
    refreshConversations();
  }, [refreshConversations]);

  // ─── Streaming ────────────────────────────────────────────────────────

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreamState({ isStreaming: false, phase: '', content: '', activeToolCalls: [] });
  }, []);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || streamState.isStreaming) return;
    setInput('');

    let convId = activeId;
    if (!convId) convId = createConversation();

    const userMsg: ChatMessage = { id: generateId(), role: 'user', content, timestamp: Date.now() };

    const data = loadConversations();
    const conv = data.conversations[convId!];
    if (!conv) return;
    conv.messages.push(userMsg);
    conv.updatedAt = Date.now();
    if (conv.title === 'New chat') conv.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');

    const apiMessages = conv.messages.filter(m => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));

    const assistantMsg: ChatMessage = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now() };
    conv.messages.push(assistantMsg);
    saveConversations(data);
    setMessages([...conv.messages]);
    refreshConversations();

    const startTime = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;

    let accumulatedContent = '';
    let usage: TokenUsage | undefined;
    const toolCalls: ToolCallInfo[] = [];
    let ttftMs: number | undefined;

    setStreamState({ isStreaming: true, phase: 'Generating...', content: '', activeToolCalls: [] });

    try {
      for await (const sseEvent of streamChat(apiBase, model, apiMessages, controller.signal)) {
        const eventName = sseEvent.event;

        if (eventName === 'tool_call_start') {
          try {
            const d = JSON.parse(sseEvent.data);
            toolCalls.push({ id: generateId(), tool: d.tool, arguments: d.arguments || '', status: 'running' });
            setStreamState((s) => ({ ...s, phase: `Calling ${d.tool}...`, activeToolCalls: [...toolCalls] }));
          } catch {}
        } else if (eventName === 'tool_call_end') {
          try {
            const d = JSON.parse(sseEvent.data);
            const tc = toolCalls.find((t) => t.tool === d.tool && t.status === 'running');
            if (tc) { tc.status = d.success ? 'success' : 'error'; tc.latency = d.latency; tc.result = d.result; }
            setStreamState((s) => ({ ...s, phase: 'Generating...', activeToolCalls: [...toolCalls] }));
          } catch {}
        } else {
          try {
            const d = JSON.parse(sseEvent.data);
            const delta = d.choices?.[0]?.delta;
            if (d.usage) usage = d.usage;
            if (delta?.content) {
              if (!ttftMs) ttftMs = Date.now() - startTime;
              accumulatedContent += delta.content;
              setStreamState((s) => ({ ...s, content: accumulatedContent, phase: '' }));

              const updData = loadConversations();
              const updConv = updData.conversations[convId!];
              if (updConv) {
                const last = updConv.messages[updConv.messages.length - 1];
                if (last?.role === 'assistant') {
                  last.content = accumulatedContent;
                  if (toolCalls.length > 0) last.toolCalls = [...toolCalls];
                  saveConversations(updData);
                  setMessages([...updConv.messages]);
                }
              }
            }
            if (d.choices?.[0]?.finish_reason === 'stop') break;
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        accumulatedContent = accumulatedContent || `Error: ${err?.message || String(err)}`;
      } else if (!accumulatedContent) {
        accumulatedContent = '(Generation stopped)';
      }
    } finally {
      if (!accumulatedContent) accumulatedContent = 'No response was generated. Please try again.';

      const totalMs = Date.now() - startTime;
      const telemetry: MessageTelemetry = {
        model_id: model, total_ms: totalMs, ttft_ms: ttftMs,
        tokens_per_sec: usage?.completion_tokens ? usage.completion_tokens / (totalMs / 1000) : undefined,
      };

      const finalData = loadConversations();
      const finalConv = finalData.conversations[convId!];
      if (finalConv) {
        const last = finalConv.messages[finalConv.messages.length - 1];
        if (last?.role === 'assistant') {
          last.content = accumulatedContent;
          if (toolCalls.length > 0) last.toolCalls = toolCalls;
          if (usage) last.usage = usage;
          last.telemetry = telemetry;
          finalConv.updatedAt = Date.now();
          saveConversations(finalData);
          setMessages([...finalConv.messages]);
        }
      }

      setStreamState({ isStreaming: false, phase: '', content: '', activeToolCalls: [] });
      refreshConversations();
      abortRef.current = null;

      // If panel is closed, show unread badge
      if (!isOpen) setUnreadCount((c) => c + 1);
    }
  }, [input, activeId, apiBase, model, streamState.isStreaming, createConversation, refreshConversations, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ─── Mic ──────────────────────────────────────────────────────────────

  const handleMicClick = useCallback(async () => {
    if (speechState === 'recording') {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') return;
      recorder.onstop = async () => {
        setSpeechState('transcribing');
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        try {
          const res = await fetch(`${apiBase}/v1/speech/transcribe`, { method: 'POST', body: (() => { const fd = new FormData(); fd.append('file', blob, 'recording.webm'); return fd; })() });
          if (res.ok) { const r = await res.json(); if (r.text) setInput((p) => (p ? p + ' ' + r.text : r.text)); }
        } catch {}
        setSpeechState('idle');
      };
      recorder.stop();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setSpeechState('recording');
      } catch { setSpeechState('idle'); }
    }
  }, [speechState, apiBase]);

  // ─── Toggle ──────────────────────────────────────────────────────────

  const togglePanel = () => {
    setIsOpen(!isOpen);
    setIsMinimized(false);
    if (!isOpen) setUnreadCount(0);
  };

  const isEmpty = messages.length === 0 && !streamState.isStreaming;

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning, Andy';
    if (hour < 18) return 'Good afternoon, Andy';
    return 'Good evening, Andy';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ─── Render ───────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <>
      {/* ── Floating Pill Button ────────────────────────────────────────── */}
      {!isOpen && (
        <button
          className={`oj-fab ${unreadCount > 0 ? 'oj-fab-pulse' : ''}`}
          onClick={togglePanel}
          title="Open Jarvis (⌘J)"
        >
          <span className="oj-fab-icon">✦</span>
          <span className={`oj-status-dot oj-status-dot-${connectionStatus}`} />
          {unreadCount > 0 && <span className="oj-fab-badge">{unreadCount}</span>}
        </button>
      )}

      {/* ── Slide-out Panel ─────────────────────────────────────────────── */}
      {isOpen && (
        <div className={`oj-panel ${isMinimized ? 'oj-panel-minimized' : ''}`}>
          {/* Panel Header */}
          <div className="oj-panel-header">
            <div className="oj-panel-header-left">
              <button onClick={() => setHistoryOpen(!historyOpen)} className="oj-panel-btn" title="History">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" /></svg>
              </button>
              <div className="oj-panel-title">
                <span className="oj-panel-logo">✦</span>
                <span>Jarvis</span>
                <span className={`oj-status-dot oj-status-dot-${connectionStatus}`} title={connectionStatus === 'connected' ? 'Connected to Dwellium' : connectionStatus === 'checking' ? 'Connecting...' : 'Disconnected'} />
              </div>
            </div>
            <div className="oj-panel-header-right">
              <span className="oj-model-badge">{model}</span>
              <button onClick={() => setSettingsOpen(true)} className="oj-panel-btn" title="Settings">⚙</button>
              <button onClick={() => setIsMinimized(!isMinimized)} className="oj-panel-btn" title="Minimize">─</button>
              <button onClick={togglePanel} className="oj-panel-btn oj-panel-close" title="Close (⌘J)">×</button>
            </div>
          </div>

          {/* History Drawer */}
          <HistoryDrawer
            open={historyOpen}
            conversations={conversations}
            activeId={activeId}
            onSelect={selectConversation}
            onNew={createConversation}
            onDelete={deleteConversation}
            onClose={() => setHistoryOpen(false)}
          />

          {/* Chat Body */}
          {!isMinimized && (
            <>
              <div ref={listRef} onScroll={handleScroll} className="oj-panel-body">
                {isEmpty ? (
                  <div className="oj-empty">
                    <div className="oj-empty-icon">✦</div>
                    <h2 className="oj-empty-title">{getGreeting()}</h2>
                    <p className="oj-empty-desc">
                      Your AI property assistant. Ask about tenants, maintenance, leases, financials — anything across Dwellium.
                    </p>
                    <div className="oj-suggestions">
                      {['Show overdue work orders', 'Lease expiry summary', 'Vacancy rate across properties'].map((s) => (
                        <button key={s} className="oj-suggestion-btn" onClick={() => { setInput(s); }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="oj-messages">
                    {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
                    {streamState.isStreaming && streamState.content === '' && (
                      <div className="oj-msg-row oj-msg-assistant">
                        <StreamingDots phase={streamState.phase} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="oj-panel-input">
                <div className="oj-input-box">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message Jarvis..."
                    rows={1}
                    className="oj-textarea"
                    disabled={streamState.isStreaming}
                  />
                  {streamState.isStreaming ? (
                    <button onClick={stopStreaming} className="oj-stop-btn" title="Stop">■</button>
                  ) : (
                    <div className="oj-input-actions">
                      <MicButton state={speechState} onClick={handleMicClick} disabled={streamState.isStreaming} />
                      <button onClick={sendMessage} disabled={!input.trim()} className={`oj-send-btn ${input.trim() ? 'oj-send-active' : ''}`} title="Send">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className="oj-input-hint">
                  <kbd>⌘J</kbd> toggle · <kbd>Enter</kbd> send · <kbd>Shift+Enter</kbd> new line
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Settings overlay */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} apiBase={apiBase} setApiBase={setApiBase} model={model} setModel={setModel} />
    </>
  );
}
