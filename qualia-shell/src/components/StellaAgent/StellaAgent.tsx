/**
 * Stella Assistant — Personal AI assistant widget for Dwellium
 * Integrates Stella (Python/AgentScope) into the Qualia shell.
 */
import { useContext, useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { Search, Trash2 } from 'lucide-react';
import './StellaAgent.css';
import { FileUploadButton } from '../shared/FileUploadButton';
import '../shared/FileUploadButton.css';
import { renderSafeMarkdown, sanitizeSvg } from '../../utils/safeMarkdown';
import { getAuthToken, UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { TTS_VOICE_CATALOG, HUMANIZE_PREFIX, speakText } from '../../lib/ttsVoices';
import { buildContextWarning, sumTokens } from '../../lib/contextWindow';
import {
    dreamStore,
    dreamUserIdHolder,
    appendDream,
    deleteDream,
    clearDreams,
} from './honchoDreamStore';
import type { DreamEntry } from './honchoDreamStore';
import { detectWidgetHandoffs, openWidgetHandoff, type WidgetHandoff } from './stellaLinkage';
import { hermesLearningUserIdHolder } from '../HonchoHermesPanel/hermesLearningStore';
import { parseHermesCommand, spawnHermesFromStella } from './stellaHermesSpawn';
import AgentEta from '../common/AgentEta';
import { matchSkill, runSkillForInput } from '../../lib/agents/skills';
import { buildReactLoopFn, mergedToolNames } from '../HonchoHermesPanel/hermesReact';
import {
    filterTools,
    groupByCategory,
    toolCount,
    type StellaTool,
} from './stellaToolCatalog';

const API_BASE = '/api/stella';

/** Build auth headers for every Stella API call */
function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    const token = getAuthToken();
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
    };
}

/**
 * Backend is reachable for chat when the agent reports `online` OR `degraded`.
 * A degraded agent is still up and answering /status (e.g. circuit-breaker
 * tripped or a provider is impaired) — chat may still succeed, so we don't
 * hard-block it the way a true `offline`/`starting`/`loading` state does.
 */
function isBackendReachable(s: ConnectionStatus): boolean {
    return s === 'online' || s === 'degraded';
}

/** Markdown → HTML via DOMPurify-protected utility (XSS-safe) */
function renderMarkdown(text: string): string { return renderSafeMarkdown(text); }
function _renderMarkdown_DEPRECATED(text: string): string {
    let html = text
        // Sanitize: remove script/iframe/style tags
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');

    // Code blocks: ```lang\ncode\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
        (_m, lang, code) => `<pre><code class="lang-${lang || 'text'}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()}</code></pre>`);

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/(?<![\w*])\*([^*\n]+?)\*(?![\w*])/g, '<em>$1</em>');
    html = html.replace(/(?<![\w_])_([^_\n]+?)_(?![\w_])/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Headings
    html = html.replace(/^#### (.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^## (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^# (.+)$/gm, '<h4>$1</h4>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr/>');

    // Blockquotes
    html = html.replace(/^> ?(.+)$/gm, '<blockquote>$1</blockquote>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists: group consecutive `- ` or `* ` lines
    html = html.replace(/((?:^[\t ]*[-*+] .+\n?)+)/gm, (block) => {
        const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[\t ]*[-*+] /, '')}</li>`).join('');
        return `<ul>${items}</ul>`;
    });

    // Ordered lists: group consecutive `1. ` lines
    html = html.replace(/((?:^[\t ]*\d+\. .+\n?)+)/gm, (block) => {
        const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[\t ]*\d+\. /, '')}</li>`).join('');
        return `<ol>${items}</ol>`;
    });

    // Paragraphs: convert double newlines to paragraph breaks
    html = html.replace(/\n{2,}/g, '</p><p>');
    // Single newlines to <br>
    html = html.replace(/\n/g, '<br/>');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) html = `<p>${html}</p>`;
    else html = `<p>${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<(?:h[1-6]|ul|ol|pre|blockquote|hr))/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|ul|ol|pre|blockquote|hr)(?:\/?)>)<\/p>/g, '$1');

    return html;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

interface Skill {
    name: string;
    content: string;
    source: string;
    enabled: boolean;
}

interface MemoryFile {
    filename: string;
    path: string;
    size: number;
    created_time: string;
    modified_time: string;
}

type Tab = 'chat' | 'skills' | 'memory' | 'automation' | 'mcp' | 'voice' | 'settings' | 'honcho' | 'hermes';
type ConnectionStatus = 'online' | 'offline' | 'loading' | 'starting' | 'degraded';

interface StellaPermissions {
    role: string;
    canChat: boolean;
    canViewSkills: boolean;
    canViewMemory: boolean;
    canEditMemory: boolean;
    canViewAutomation: boolean;
    canManageAutomation: boolean;
    canViewMCP: boolean;
    canManageMCP: boolean;
    canBootstrap: boolean;
    canDeleteCron: boolean;
    canManageSettings: boolean;
    canViewVoice: boolean;
    canNotify: boolean;
    properties: string[];
}

interface CronJob {
    id: string;
    name: string;
    enabled: boolean;
    schedule?: { cron: string; timezone?: string };
    task_type?: string;
    text?: string;
    meta?: Record<string, any>;
}

interface CronJobState {
    next_run_at?: string;
    last_run_at?: string;
    last_status?: string;
    last_error?: string;
}

interface MCPServer {
    key: string;
    name: string;
    description?: string;
    enabled: boolean;
    transport: string;
    url?: string;
    command?: string;
}

interface SkillSearchResult {
    slug: string;
    name: string;
    description?: string;
    version?: string;
    source_url?: string;
}

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3.5-sonnet', 'claude-3-haiku', 'claude-3-opus'] },
    { id: 'ollama', name: 'Ollama (Local)', models: ['llama3', 'mistral', 'codellama', 'gemma2'] },
    { id: 'google', name: 'Google', models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'] },
    { id: 'dashscope', name: 'DashScope (Qianwen)', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
    { id: 'lmstudio', name: 'LM Studio', models: ['local-model'] },
    { id: 'llamacpp', name: 'llama.cpp', models: ['local'] },
    { id: 'custom', name: 'Custom (OpenAI-compat)', models: ['custom-model'] },
];

const TAB_CONFIG: { id: Tab; label: string; icon: string }[] = [
    { id: 'chat', label: 'Chat', icon: '' },
    { id: 'honcho', label: 'Honcho', icon: '' },
    { id: 'hermes', label: 'Hermes', icon: '' },
    { id: 'skills', label: 'Skills', icon: '' },
    { id: 'memory', label: 'Memory', icon: '' },
    { id: 'automation', label: 'Cron', icon: '' },
    { id: 'mcp', label: 'MCP', icon: '' },
    { id: 'voice', label: 'Voice', icon: '' },
    { id: 'settings', label: 'Settings', icon: '' },
];

export default function StellaAgent() {
    const { integrations } = useIntegrations();
    // Per-user dream store — pattern matches ThoughtWeaver/integrations
    const userCtx = useContext(UserContext);
    const userIdForDreams = userCtx?.user?.id ?? null;
    dreamUserIdHolder.current = userIdForDreams;
    // Per-user Hermes learning store key (dynamic-key holder discipline) — Stella-
    // spawned runs record into the SAME local store the standalone widget uses.
    hermesLearningUserIdHolder.current = userIdForDreams;
    const dreams: DreamEntry[] = useSyncExternalStore(
        dreamStore.subscribe,
        dreamStore.getSnapshot,
        dreamStore.getServerSnapshot,
    );
    const [dreaming, setDreaming] = useState(false);
    const [dreamAutoEnabled, setDreamAutoEnabled] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try { return localStorage.getItem('honcho-dream-auto') === '1'; } catch { return false; }
    });
    const dreamAutoRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Browser-interaction recorder — captures clicks at #widgets / titlebars / buttons
    const [interactionsEnabled, setInteractionsEnabled] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try { return localStorage.getItem('honcho-interactions-on') === '1'; } catch { return false; }
    });
    const [interactionsLog, setInteractionsLog] = useState<Array<{ id: string; label: string; widget: string | null; ts: string }>>([]);

    const [tab, setTab] = useState<Tab>('chat');
    const [status, setStatus] = useState<ConnectionStatus>('loading');
    const [version, setVersion] = useState<string>('');

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'system',
            content: 'Stella connected. Ask me anything — I can help with tasks, research, file management, and more. Tip: type `/hermes <task>` to spawn the Hermes agent.',
            timestamp: Date.now(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Skills state
    const [skills, setSkills] = useState<Skill[]>([]);
    const [skillsLoading, setSkillsLoading] = useState(false);

    // Memory state
    const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [expandedMemory, setExpandedMemory] = useState<string | null>(null);
    const [memoryContent, setMemoryContent] = useState<Record<string, string>>({});

    // Provider state
    const [provider, setProvider] = useState('openai');
    const [model, setModel] = useState('gpt-4o-mini');
    const [healthMs, setHealthMs] = useState<number | null>(null);
    const [pid, setPid] = useState<number | null>(null);
    const [initLoading, setInitLoading] = useState(false);

    // Voice state
    const [voiceOnline, setVoiceOnline] = useState(false);
    const [voiceUrl, setVoiceUrl] = useState('http://localhost:3001');
    const [voiceChecked, setVoiceChecked] = useState(false);

    // ── TTS voice + Humanize (ARA-parity: the same 9 voices + humanize reply style) ──
    const openaiKey = integrations?.llm?.openai?.apiKey ?? (integrations?.llm as any)?.providers?.openai?.apiKey ?? '';
    const [ttsVoice, setTtsVoice] = useState<string>(() => { try { return localStorage.getItem('dwellium-stella-voice') || 'openai-alloy'; } catch { return 'openai-alloy'; } });
    const [ttsSpeak, setTtsSpeak] = useState<boolean>(() => { try { return localStorage.getItem('dwellium-stella-tts') === 'true'; } catch { return false; } });
    const [humanizeEnabled, setHumanizeEnabled] = useState<boolean>(() => { try { const s = localStorage.getItem('dwellium-stella-humanize'); return s === null ? true : s === 'true'; } catch { return true; } });
    const [stellaSpeaking, setStellaSpeaking] = useState(false);
    const speakHandleRef = useRef<{ stop: () => void } | null>(null);
    const lastSpokenIdRef = useRef<string>('');
    const setVoicePersist = (v: string) => { setTtsVoice(v); try { localStorage.setItem('dwellium-stella-voice', v); } catch { /* ignore */ } };
    const toggleTts = () => setTtsSpeak(p => { const n = !p; try { localStorage.setItem('dwellium-stella-tts', String(n)); } catch { /* ignore */ } if (!n) { speakHandleRef.current?.stop(); setStellaSpeaking(false); } return n; });
    const toggleHumanize = () => setHumanizeEnabled(p => { const n = !p; try { localStorage.setItem('dwellium-stella-humanize', String(n)); } catch { /* ignore */ } return n; });
    const speakStella = useCallback((t: string) => {
        speakHandleRef.current?.stop();
        speakText(t, ttsVoice, openaiKey, { onStart: () => setStellaSpeaking(true), onEnd: () => setStellaSpeaking(false) }).then(h => { speakHandleRef.current = h; });
    }, [ttsVoice, openaiKey]);

    // Automation (cron) state
    const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
    const [cronLoading, setCronLoading] = useState(false);
    const [cronSummary, setCronSummary] = useState<any>(null);

    // MCP state
    const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
    const [mcpLoading, setMcpLoading] = useState(false);

    // Skill search state
    const [skillSearchQuery, setSkillSearchQuery] = useState('');
    const [skillSearchResults, setSkillSearchResults] = useState<SkillSearchResult[]>([]);
    const [skillSearching, setSkillSearching] = useState(false);
    const [installingSkill, setInstallingSkill] = useState<string | null>(null);
    // Tool-catalog filter (Cycle 18 — Stella's organized tool library)
    const [toolCatalogQuery, setToolCatalogQuery] = useState('');

    // Memory editing state
    const [editingMemory, setEditingMemory] = useState<string | null>(null);

    // Phase 3: Permissions state
    const [permissions, setPermissions] = useState<StellaPermissions | null>(null);
    const [bootstrapLoading, setBootstrapLoading] = useState(false);
    const [bootstrapResult, setBootstrapResult] = useState<string | null>(null);
    const [bootstrapOk, setBootstrapOk] = useState(false);
    const [circuitState, setCircuitState] = useState<string | null>(null);
    const [editMemoryDraft, setEditMemoryDraft] = useState('');

    // ─── HONCHO STATE ─────────────────────────────────
    type HonchoSection = 'memory-explorer' | 'memory-network' | 'peers-sessions' | 'chat' | 'data-ingestion' | 'ambient' | 'setup' | 'search' | 'memory-map' | 'dream' | 'interactions';
    const [honchoSection, setHonchoSection] = useState<HonchoSection>('memory-explorer');
    const [honchoMemories, setHonchoMemories] = useState<any[]>([]);
    const [honchoStats, setHonchoStats] = useState<any>(null);
    const [honchoFilter, setHonchoFilter] = useState('');
    const [honchoTypeFilter, setHonchoTypeFilter] = useState('all');
    const [honchoLoading, setHonchoLoading] = useState(false);
    const [showAddHonchoMemory, setShowAddHonchoMemory] = useState(false);
    const [newHonchoMemory, setNewHonchoMemory] = useState({ content: '', memoryType: 'fact', importance: 0.5 });
    const [honchoLearnActive, setHonchoLearnActive] = useState(() => {
        // SSR guard: useState lazy initializer fires during render(), which
        // runs server-side in dev/SSR mode. localStorage doesn't exist there.
        // CSR fallback rehydrates with the same default; client effect would
        // re-sync if we needed to mirror real storage on hydration.
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('honcho-learn-active') === 'true';
    });
    const honchoLearnRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [honchoLearnStats, setHonchoLearnStats] = useState({ captured: 0, lastCapture: '' });
    // Extended state for full platform
    const [honchoPeers, setHonchoPeers] = useState<any[]>([]);
    const [honchoSessions, setHonchoSessions] = useState<any[]>([]);
    const [honchoCollections, setHonchoCollections] = useState<any[]>([]);
    const [honchoSearchQuery, setHonchoSearchQuery] = useState('');
    const [honchoSearchResults, setHonchoSearchResults] = useState<any[]>([]);
    const [honchoChatInput, setHonchoChatInput] = useState('');
    const [honchoChatMessages, setHonchoChatMessages] = useState<any[]>([]);
    const [honchoChatLoading, setHonchoChatLoading] = useState(false);
    const [honchoIngestText, setHonchoIngestText] = useState('');
    const [honchoIngestSource, setHonchoIngestSource] = useState('manual');

    // ─── HERMES STATE ─────────────────────────────────
    const [hermesOnline, setHermesOnline] = useState(false);
    const [hermesTools, setHermesTools] = useState<any[]>([]);
    const [hermesPrompt, setHermesPrompt] = useState('');
    const [hermesSteps, setHermesSteps] = useState<any[]>([]);
    const [hermesRunning, setHermesRunning] = useState(false);
    const [hermesResult, setHermesResult] = useState('');
    const hermesStepsEndRef = useRef<HTMLDivElement>(null);

    // ─── TELEGRAM STATE ───────────────────────────────
    const [tgBotToken, setTgBotToken] = useState('');
    const [tgWebhookUrl, setTgWebhookUrl] = useState('');
    const [tgTestChatId, setTgTestChatId] = useState('');
    const [tgStatus, setTgStatus] = useState<null | { connected: boolean; enabled: boolean; bot?: { username: string; firstName: string }; webhook?: { configured: boolean; url: string; pendingCount: number; lastError?: string }; error?: string }>(null);
    const [tgLoading, setTgLoading] = useState(false);
    const [tgSaveMsg, setTgSaveMsg] = useState('');
    const [tgLogs, setTgLogs] = useState<any[]>([]);
    const [tgShowLogs, setTgShowLogs] = useState(false);

    const TG_API = '/api/v1/telegram';

    const loadTgStatus = async () => {
        try {
            const res = await fetch(`${TG_API}/status`, { headers: getAuthHeaders() });
            const json = await res.json();
            if (json.success) setTgStatus(json.data);
        } catch { /* offline */ }
    };

    const saveTgConfig = async () => {
        if (!tgBotToken.trim()) { setTgSaveMsg('Bot token is required'); return; }
        setTgLoading(true);
        setTgSaveMsg('');
        try {
            const res = await fetch(`${TG_API}/config`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ botToken: tgBotToken, webhookUrl: tgWebhookUrl }),
            });
            const json = await res.json();
            if (json.success) {
                setTgSaveMsg(`@${json.data.bot.username} connected`);
                await loadTgStatus();
            } else {
                setTgSaveMsg(`${json.error}`);
            }
        } catch { setTgSaveMsg('Network error'); }
        finally { setTgLoading(false); }
    };

    const connectTgWebhook = async () => {
        setTgLoading(true);
        setTgSaveMsg('');
        try {
            const res = await fetch(`${TG_API}/connect`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ webhookUrl: tgWebhookUrl }),
            });
            const json = await res.json();
            setTgSaveMsg(json.success ? `Webhook registered` : `${json.error}`);
            if (json.success) await loadTgStatus();
        } catch { setTgSaveMsg('Network error'); }
        finally { setTgLoading(false); }
    };

    const disconnectTg = async () => {
        setTgLoading(true);
        try {
            await fetch(`${TG_API}/disconnect`, { method: 'POST', headers: getAuthHeaders() });
            setTgSaveMsg('Disconnected');
            setTgStatus(null);
            await loadTgStatus();
        } catch { setTgSaveMsg('Failed to disconnect'); }
        finally { setTgLoading(false); }
    };

    const sendTgTest = async () => {
        if (!tgTestChatId.trim()) { setTgSaveMsg('Enter a Chat ID for the test'); return; }
        setTgLoading(true);
        try {
            const res = await fetch(`${TG_API}/test`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ chatId: tgTestChatId }),
            });
            const json = await res.json();
            setTgSaveMsg(json.success ? 'Test message sent!' : `${json.error}`);
        } catch { setTgSaveMsg('Network error'); }
        finally { setTgLoading(false); }
    };

    const loadTgLogs = async () => {
        try {
            const res = await fetch(`${TG_API}/logs?limit=20`, { headers: getAuthHeaders() });
            const json = await res.json();
            if (json.success) setTgLogs(json.data);
        } catch { /* silent */ }
    };

    // ─── Status Check ─────────────────────────────────
    const checkStatus = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/status`, { headers: getAuthHeaders() });
            // Guard non-2xx before parsing — a 5xx with an HTML/empty body would
            // otherwise throw in resp.json() and only be caught as a generic offline.
            if (!resp.ok) { setStatus('offline'); return; }
            const data = await resp.json();
            if (data.success && data.data) {
                const d = data.data;
                const live = d.liveCheck;
                // Honor a backend-reported `degraded` state (process up + answering
                // /status but a health signal is impaired). The status dot + label
                // already style this distinctly; collapsing it to `offline` lost it.
                setStatus(
                    live?.ok ? 'online'
                        : d.status === 'degraded' ? 'degraded'
                            : d.status === 'starting' ? 'starting'
                                : 'offline'
                );
                setVersion(live?.version || d.version || '');
                setHealthMs(live?.ms ?? null);
                setPid(d.pid ?? null);
                if (d.provider) setProvider(d.provider);
                if (d.model) setModel(d.model);
            } else {
                setStatus('offline');
            }
        } catch {
            setStatus('offline');
        }
    }, []);

    // Phase 4.2: Check circuit breaker state
    const loadCircuitState = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/circuit`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && data.data) setCircuitState(data.data.state);
        } catch { /* circuit endpoint may not be accessible for non-admin */ }
    }, []);
    // Phase 3: Load permissions on mount
    const loadPermissions = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/permissions`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && data.data) setPermissions(data.data);
        } catch { /* permissions unavailable, defaults to viewer */ }
    }, []);

    useEffect(() => {
        // Auto-initialize on mount — this triggers CoPaw spawn if not running
        (async () => {
            try {
                setStatus('loading');
                await fetch(`${API_BASE}/init`, {
                    method: 'POST',
                    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ provider, model }),
                });
                await checkStatus();
                await loadPermissions();
                await loadCircuitState();
            } catch {
                setStatus('offline');
            }
        })();
        const interval = setInterval(checkStatus, 30000);
        return () => clearInterval(interval);
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-scroll chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // Speak new assistant replies aloud when TTS is on (covers both LLM + backend paths)
    useEffect(() => {
        if (!ttsSpeak) return;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                if (messages[i].id !== lastSpokenIdRef.current) {
                    lastSpokenIdRef.current = messages[i].id;
                    speakStella(messages[i].content);
                }
                break;
            }
        }
    }, [messages, ttsSpeak, speakStella]);

    // ─── Chat ─────────────────────────────────────────
    // ── Stella → Hermes first-class spawn (Cycle 17B) ──
    // Dispatch the ONE shared self-improving Hermes run path (hermesRunner via
    // stellaHermesSpawn) and surface the result in chat. Few-shot injection +
    // proven-tool weighting + record-back into the LOCAL per-user learning store
    // all live in the shared runner — Stella adds no second fetch path.
    const runStellaHermes = async (task: string, originalText: string) => {
        setMessages(prev => [...prev, {
            id: `user-${Date.now()}`, role: 'user', content: originalText, timestamp: Date.now(),
        }]);
        setInput('');
        if (!task) {
            setMessages(prev => [...prev, {
                id: `system-${Date.now()}`, role: 'system',
                content: 'Usage: `/hermes <task>` — e.g. `/hermes summarize the latest maintenance reports`.',
                timestamp: Date.now(),
            }]);
            return;
        }
        setIsTyping(true);
        const authFetch = (url: string, init?: RequestInit) => fetch(url, {
            ...init,
            headers: getAuthHeaders({ 'Content-Type': 'application/json', ...((init?.headers as Record<string, string>) ?? {}) }),
        });
        try {
            const { reply } = await spawnHermesFromStella(task, {
                authFetch,
                // P11-6: merged registry + offline chain (skill → ReAct → LLM)
                toolNames: mergedToolNames(hermesTools.map((t: any) => t.name)),
                skillFallbackFn: async (t) => {
                    const hit = await runSkillForInput(t, { llm: integrations.llm, search: integrations.search });
                    return hit ? { ok: hit.ok, text: hit.text, skillName: hit.skill.name } : null;
                },
                reactLoopFn: hasActiveLlm(integrations.llm) ? buildReactLoopFn(integrations.llm) : undefined,
            });
            setMessages(prev => [...prev, {
                id: `assistant-${Date.now()}`, role: 'assistant', content: reply, timestamp: Date.now(),
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || isTyping) return;

        // Stella → Hermes spawn intercept (`/hermes <task>`). Hermes is independent
        // of the Stella backend + personal LLM, so it runs even when both are down.
        const hermesCmd = parseHermesCommand(text);
        if (hermesCmd.isHermes) { await runStellaHermes(hermesCmd.task, text); return; }

        // P11-5: mirror ARA's AGENT_SKILLS hook — browser-side skills
        // (calculator / web search / weather / code / memory) run before any
        // LLM round-trip. Stella's Skills tab showed them; now her chat path
        // actually executes them.
        const skillHit = matchSkill(text);
        if (skillHit) {
            setMessages(prev => [...prev, {
                id: `user-${Date.now()}`, role: 'user', content: text, timestamp: Date.now(),
            }]);
            setInput('');
            setIsTyping(true);
            try {
                const result = await skillHit.skill.run(skillHit.arg, { llm: integrations.llm, search: integrations.search });
                setMessages(prev => [...prev, {
                    id: `assistant-${Date.now()}`, role: 'assistant',
                    content: result.text, timestamp: Date.now(),
                }]);
            } catch (err) {
                setMessages(prev => [...prev, {
                    id: `error-${Date.now()}`, role: 'system',
                    content: `${skillHit.skill.name} failed: ${err instanceof Error ? err.message : 'error'}`,
                    timestamp: Date.now(),
                }]);
            } finally {
                setIsTyping(false);
            }
            return;
        }

        // 2026-05-26: relax `status !== 'online'` gate when user has LLM configured.
        // Stella backend can be offline AND the chat still works via the user's
        // personal LLM key (Settings → API Keys).
        const llmReady = hasActiveLlm(integrations.llm);
        if (!isBackendReachable(status) && !llmReady) return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        // ── 1) Try user-configured LLM first ──
        // When a personal LLM is configured, route directly. Drops SSE streaming
        // (single-shot response), but preserves chat continuity even when the
        // Stella backend is offline. Falls through to backend on LLM error.
        if (llmReady) {
            try {
                const llmRes = await callLlm({
                    systemPrompt: `You are Stella, a helpful personal AI assistant inside the Dwellium property-management app. Be concise, direct, and useful. Help with tasks, research, file management, and general questions. Use Markdown for formatting when appropriate.`,
                    prompt: humanizeEnabled ? HUMANIZE_PREFIX + text : text,
                    maxTokens: 1024,
                    temperature: 0.4,
                }, integrations.llm);
                if (llmRes) {
                    setMessages(prev => [...prev, {
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        content: llmRes.text,
                        timestamp: Date.now(),
                    }]);
                    setIsTyping(false);
                    return;
                }
            } catch (err) {
                // LLM call failed — surface to UI only if backend is also unreachable.
                if (!isBackendReachable(status)) {
                    setMessages(prev => [...prev, {
                        id: `error-${Date.now()}`,
                        role: 'system',
                        content: `LLM error: ${err instanceof Error ? err.message : 'Failed'}`,
                        timestamp: Date.now(),
                    }]);
                    setIsTyping(false);
                    return;
                }
                // Otherwise fall through to backend.
            }
        }

        // ── 2) Fall back to backend (existing SSE-aware path) ──
        try {
            const resp = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ message: humanizeEnabled ? HUMANIZE_PREFIX + text : text, humanize: humanizeEnabled }),
            });

            const contentType = resp.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
                // Handle SSE streaming
                const reader = resp.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let assistantContent = '';
                const assistantId = `assistant-${Date.now()}`;

                setMessages(prev => [...prev, {
                    id: assistantId,
                    role: 'assistant',
                    content: '',
                    timestamp: Date.now(),
                }]);

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    // Parse SSE events
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const eventData = JSON.parse(line.slice(6));
                                const fragment = eventData.text ?? eventData.content ?? null;
                                if (fragment !== null) {
                                    // Only concat strings — skip objects/arrays that would show as [object Object]
                                    const safeFragment = typeof fragment === 'string' ? fragment : '';
                                    if (safeFragment) {
                                        assistantContent += safeFragment;
                                        setMessages(prev => prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, content: assistantContent }
                                                : m
                                        ));
                                    }
                                }
                            } catch {
                                // Not JSON, treat as raw text
                                const raw = line.slice(6).trim();
                                if (raw && raw !== '[DONE]') {
                                    assistantContent += raw;
                                    setMessages(prev => prev.map(m =>
                                        m.id === assistantId
                                            ? { ...m, content: assistantContent }
                                            : m
                                    ));
                                }
                            }
                        }
                    }
                }
                reader.releaseLock();
            } else {
                // Handle regular JSON response
                const data = await resp.json();
                let content: string;
                if (!data.success) {
                    content = `Error: ${data.error}`;
                } else {
                    const d = data.data;
                    // Extract only string fields — never show raw JSON/objects to the user
                    const raw = d?.text ?? d?.response ?? d?.content ?? null;
                    content = typeof raw === 'string' ? raw
                        : typeof raw === 'number' ? String(raw)
                            : d?.message ?? 'Response received.';
                }

                setMessages(prev => [...prev, {
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content,
                    timestamp: Date.now(),
                }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                role: 'system',
                content: `${err instanceof Error ? err.message : 'Failed to reach Stella'}`,
                timestamp: Date.now(),
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // ─── S2 cross-widget handoffs (additive; LINKAGE gap S2) ───────────────
    // Scan Stella's latest assistant reply for widget references and offer "Open:" chips
    // on the existing `dwellium:open-widget` bus. Strictly additive — no restyle.
    const suggestedHandoffs = useMemo<WidgetHandoff[]>(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                return detectWidgetHandoffs(messages[i].content);
            }
        }
        return [];
    }, [messages]);
    const handleHandoffClick = useCallback((handoff: WidgetHandoff) => {
        openWidgetHandoff(handoff);
    }, []);

    // Run a tool-catalog entry via an EXISTING Stella mechanism (Cycle 18). No new plumbing:
    // chat-command → prefill the composer + jump to chat; open-widget → the open-widget
    // intent bus (same path as suggested handoffs); info → switch to the owning tab.
    const runCatalogTool = useCallback((tool: StellaTool) => {
        const a = tool.action;
        if (a.kind === 'chat-command' && a.command) {
            setTab('chat');
            setInput(a.command);
            requestAnimationFrame(() => inputRef.current?.focus());
        } else if (a.kind === 'open-widget' && a.widgetId) {
            openWidgetHandoff({ widgetId: a.widgetId, label: a.widgetLabel ?? tool.name, icon: a.widgetIcon ?? '' });
        } else if (a.kind === 'info' && a.tab) {
            setTab(a.tab as Tab);
        }
    }, []);
    const catalogGroups = useMemo(() => groupByCategory(filterTools(toolCatalogQuery)), [toolCatalogQuery]);

    // ─── Skills ───────────────────────────────────────
    const loadSkills = useCallback(async () => {
        if (status !== 'online') return;
        setSkillsLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/skills`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && Array.isArray(data.data)) {
                setSkills(data.data);
            }
        } catch {
            // silently fail
        } finally {
            setSkillsLoading(false);
        }
    }, [status]);

    const toggleSkill = async (name: string, currentlyEnabled: boolean) => {
        const action = currentlyEnabled ? 'disable' : 'enable';
        try {
            await fetch(`${API_BASE}/skills/${encodeURIComponent(name)}/${action}`, { method: 'POST', headers: getAuthHeaders() });
            setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled: !currentlyEnabled } : s));
        } catch {
            // silently fail
        }
    };

    useEffect(() => {
        if (tab === 'skills') loadSkills();
    }, [tab, loadSkills]);

    // ─── Memory ───────────────────────────────────────
    const loadMemory = useCallback(async () => {
        if (status !== 'online') return;
        setMemoryLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/memory`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && Array.isArray(data.data)) {
                setMemoryFiles(data.data);
            }
        } catch {
            // silently fail
        } finally {
            setMemoryLoading(false);
        }
    }, [status]);

    const loadMemoryContent = async (filename: string) => {
        if (memoryContent[filename]) {
            setExpandedMemory(expandedMemory === filename ? null : filename);
            return;
        }
        try {
            const resp = await fetch(`${API_BASE}/memory/${encodeURIComponent(filename)}`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success && data.data?.content) {
                setMemoryContent(prev => ({ ...prev, [filename]: data.data.content }));
                setExpandedMemory(filename);
            }
        } catch {
            // silently fail
        }
    };

    // ─── Cron Loader ──────────────────────────────────
    const loadCronJobs = useCallback(async () => {
        setCronLoading(true);
        try {
            const [jobsResp, summaryResp] = await Promise.all([
                fetch(`${API_BASE}/cron/jobs`, { headers: getAuthHeaders() }),
                fetch(`${API_BASE}/cron/summary`, { headers: getAuthHeaders() }),
            ]);
            const jobsData = await jobsResp.json();
            const summaryData = await summaryResp.json();
            if (jobsData.success) setCronJobs(jobsData.data || []);
            if (summaryData.success) setCronSummary(summaryData.data || null);
        } catch { /* offline */ }
        setCronLoading(false);
    }, []);

    // ─── MCP Loader ──────────────────────────────────
    const loadMcpServers = useCallback(async () => {
        setMcpLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/mcp`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success) setMcpServers(data.data || []);
        } catch { /* offline */ }
        setMcpLoading(false);
    }, []);

    // ─── Skill Search & Install ──────────────────────
    const searchSkills = useCallback(async (q: string) => {
        if (!q.trim()) { setSkillSearchResults([]); return; }
        setSkillSearching(true);
        try {
            const resp = await fetch(`${API_BASE}/skills/search?q=${encodeURIComponent(q)}`, { headers: getAuthHeaders() });
            const data = await resp.json();
            if (data.success) setSkillSearchResults(data.data || []);
        } catch { /* offline */ }
        setSkillSearching(false);
    }, []);

    const installSkill = useCallback(async (urlOrSlug: string) => {
        setInstallingSkill(urlOrSlug);
        try {
            await fetch(`${API_BASE}/skills/install`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ url_or_slug: urlOrSlug }),
            });
            await loadSkills();
        } catch { /* offline */ }
        setInstallingSkill(null);
    }, [loadSkills]);

    const uninstallSkill = useCallback(async (name: string) => {
        if (!confirm(`Uninstall skill "${name}"?`)) return;
        try {
            await fetch(`${API_BASE}/skills/${encodeURIComponent(name)}/uninstall`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            await loadSkills();
        } catch { /* offline */ }
    }, [loadSkills]);

    // ─── Memory Save ─────────────────────────────────
    const saveMemory = useCallback(async (name: string, content: string) => {
        try {
            await fetch(`${API_BASE}/memory/${encodeURIComponent(name)}`, {
                method: 'PUT',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ content }),
            });
            setMemoryContent(prev => ({ ...prev, [name]: content }));
            setEditingMemory(null);
        } catch { /* offline */ }
    }, []);

    useEffect(() => {
        if (tab === 'memory') loadMemory();
        if (tab === 'automation') loadCronJobs();
        if (tab === 'mcp') loadMcpServers();
        if (tab === 'voice' && !voiceChecked) {
            fetch(`${API_BASE}/voice-status`, { headers: getAuthHeaders() })
                .then(r => r.json())
                .then(d => {
                    if (d.success && d.data) {
                        setVoiceOnline(d.data.online);
                        if (d.data.url) setVoiceUrl(d.data.url);
                    }
                    setVoiceChecked(true);
                })
                .catch(() => setVoiceChecked(true));
        }
    }, [tab, loadMemory, loadCronJobs, loadMcpServers]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── HONCHO DATA ──────────────────────────────────
    const HONCHO_API = '/api/honcho';
    const HERMES_API = '/api/hermes';

    const TYPE_ICONS: Record<string, string> = {
        fact: '', preference: '', decision: '', observation: '', insight: '', manual: '',
    };
    const TYPE_COLORS: Record<string, string> = {
        fact: '#3b82f6', preference: '#f59e0b', decision: '#ef4444',
        observation: '#D6FE51', insight: '#10b981', manual: '#D6FE51',
    };

    const fetchHonchoMemories = useCallback(async () => {
        setHonchoLoading(true);
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const params = new URLSearchParams({ limit: '50' });
            if (honchoFilter) params.set('search', honchoFilter);
            const res = await fetch(`${HONCHO_API}/memories?${params}`, { headers });
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setHonchoMemories(data.data);
        } catch { /* silent */ }
        setHonchoLoading(false);
    }, [honchoFilter]);

    const fetchHonchoStats = useCallback(async () => {
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${HONCHO_API}/stats`, { headers });
            if (!res.ok) return;
            const data = await res.json();
            if (data.success) setHonchoStats(data.data);
        } catch { /* silent */ }
    }, []);

    const addHonchoMemory = async () => {
        if (!newHonchoMemory.content.trim()) return;
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            await fetch(`${HONCHO_API}/memories`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    userId: 'default', content: newHonchoMemory.content,
                    memoryType: newHonchoMemory.memoryType,
                    importance: newHonchoMemory.importance, source: 'manual',
                }),
            });
            setNewHonchoMemory({ content: '', memoryType: 'fact', importance: 0.5 });
            setShowAddHonchoMemory(false);
            fetchHonchoMemories();
            fetchHonchoStats();
        } catch { /* silent */ }
    };

    const deleteHonchoMemory = async (id: string) => {
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            await fetch(`${HONCHO_API}/memories/${id}`, { method: 'DELETE', headers });
            fetchHonchoMemories();
            fetchHonchoStats();
        } catch { /* silent */ }
    };

    // Extended Honcho fetchers
    const fetchHonchoPeers = useCallback(async () => {
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${HONCHO_API}/peers`, { headers });
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setHonchoPeers(data.data);
        } catch { /* silent */ }
    }, []);

    const fetchHonchoSessions = useCallback(async () => {
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${HONCHO_API}/sessions`, { headers });
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setHonchoSessions(data.data);
        } catch { /* silent */ }
    }, []);

    const fetchHonchoCollections = useCallback(async () => {
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${HONCHO_API}/collections`, { headers });
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setHonchoCollections(data.data);
        } catch { /* silent */ }
    }, []);

    const honchoSemanticSearch = async () => {
        if (!honchoSearchQuery.trim()) return;
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            const res = await fetch(`${HONCHO_API}/query`, {
                method: 'POST', headers,
                body: JSON.stringify({ query: honchoSearchQuery, limit: 20 }),
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setHonchoSearchResults(data.data);
        } catch { /* silent */ }
    };

    const honchoChatSend = async () => {
        if (!honchoChatInput.trim() || honchoChatLoading) return;
        const userMsg = { role: 'user', content: honchoChatInput, timestamp: Date.now() };
        setHonchoChatMessages(prev => [...prev, userMsg]);
        setHonchoChatInput('');
        setHonchoChatLoading(true);
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            const res = await fetch(`${HONCHO_API}/chat`, {
                method: 'POST', headers,
                body: JSON.stringify({ message: honchoChatInput }),
            });
            const data = await res.json();
            setHonchoChatMessages(prev => [...prev, {
                role: 'assistant',
                content: data.data?.response || data.data?.answer || data.error || 'No response.',
                timestamp: Date.now(),
            }]);
        } catch { setHonchoChatMessages(prev => [...prev, { role: 'assistant', content: 'Chat failed.', timestamp: Date.now() }]); }
        setHonchoChatLoading(false);
    };

    const honchoIngest = async () => {
        if (!honchoIngestText.trim()) return;
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            await fetch(`${HONCHO_API}/memories`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    userId: 'default', content: honchoIngestText,
                    memoryType: 'fact', importance: 0.5, source: honchoIngestSource,
                }),
            });
            setHonchoIngestText('');
            fetchHonchoMemories();
            fetchHonchoStats();
        } catch { /* silent */ }
    };

    // ─── HERMES DATA ──────────────────────────────────
    const fetchHermesStatus = useCallback(async () => {
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${HERMES_API}/status`, { headers });
            if (!res.ok) { setHermesOnline(false); return; }
            const data = await res.json();
            setHermesOnline(data.data?.ollamaOnline || false);
        } catch { setHermesOnline(false); }
    }, []);

    const fetchHermesTools = useCallback(async () => {
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${HERMES_API}/tools`, { headers });
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) setHermesTools(data.data);
        } catch { /* silent */ }
    }, []);

    const delegateToHermes = async () => {
        if (!hermesPrompt.trim() || hermesRunning) return;
        setHermesRunning(true);
        setHermesResult('');
        setHermesSteps([{ type: 'thought', content: `Processing: "${hermesPrompt}"`, timestamp: new Date().toISOString() }]);

        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            const res = await fetch(`${HERMES_API}/delegate`, {
                method: 'POST', headers,
                body: JSON.stringify({ task: hermesPrompt, context: '' }),
            });
            const data = await res.json();
            if (data.success && data.data) {
                const steps: any[] = [];
                if (data.data.thought) steps.push({ type: 'thought', content: data.data.thought, timestamp: new Date().toISOString() });
                if (data.data.action) steps.push({ type: 'action', content: data.data.action, timestamp: new Date().toISOString() });
                if (data.data.observation) steps.push({ type: 'observation', content: data.data.observation, timestamp: new Date().toISOString() });
                steps.push({ type: 'final_answer', content: data.data.answer || data.data.result || 'Task completed.', timestamp: new Date().toISOString() });
                setHermesSteps(steps);
                setHermesResult(data.data.answer || data.data.result || 'Done');

                // Write memory after task completion
                if (honchoLearnActive && (data.data.answer || data.data.result)) {
                    fetch(`${HONCHO_API}/memories`, {
                        method: 'POST', headers,
                        body: JSON.stringify({
                            userId: 'default',
                            content: `Hermes completed task: "${hermesPrompt}" → ${(data.data.answer || data.data.result || '').substring(0, 200)}`,
                            memoryType: 'observation', source: 'agent', importance: 0.6,
                            metadata: { agent: 'hermes', task: hermesPrompt },
                        }),
                    }).catch(() => {});
                }
            } else {
                setHermesSteps(prev => [...prev, { type: 'final_answer', content: data.error || 'Task failed.', timestamp: new Date().toISOString() }]);
            }
        } catch (err: any) {
            setHermesSteps(prev => [...prev, { type: 'final_answer', content: `Error: ${err.message}`, timestamp: new Date().toISOString() }]);
        } finally {
            setHermesRunning(false);
            setHermesPrompt('');
        }
    };

    // Load Honcho/Hermes data when tabs switch
    useEffect(() => {
        if (tab === 'honcho') {
            fetchHonchoMemories(); fetchHonchoStats();
            fetchHonchoPeers(); fetchHonchoSessions(); fetchHonchoCollections();
        }
        if (tab === 'hermes') { fetchHermesStatus(); fetchHermesTools(); }
    }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-scroll Hermes steps
    useEffect(() => {
        hermesStepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [hermesSteps]);

    // ─── HONCHO LEARN DAEMON ──────────────────────────
    // When honchoLearnActive is true, this daemon polls the backend
    // every 15s to capture desktop activity, file edits, messages sent,
    // and external app usage into Honcho memories.
    useEffect(() => {
        if (honchoLearnActive) {
            localStorage.setItem('honcho-learn-active', 'true');

            const captureActivity = async () => {
                try {
                    const token = getAuthToken();
                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    };

                    // 1. Capture open windows / active document context
                    const windowTitles = document.title;
                    const activeElements = document.querySelectorAll('.window__title');
                    const openWidgets = Array.from(activeElements).map(el => el.textContent).filter(Boolean).join(', ');

                    // 2. Capture recent file manager activity
                    let recentFiles = '';
                    try {
                        const fmRes = await fetch('/api/files?path=.&limit=5', { headers });
                        const fmData = await fmRes.json();
                        if (fmData.files) recentFiles = fmData.files.slice(0, 5).map((f: any) => f.name).join(', ');
                    } catch { /* silent */ }

                    // 3. Capture recent inbox items
                    let recentInbox = '';
                    try {
                        const inRes = await fetch('/api/v1/inbox?limit=3', { headers });
                        const inData = await inRes.json();
                        if (inData.success && inData.data) {
                            recentInbox = inData.data.slice(0, 3).map((i: any) => `${i.subject} (${i.sender})`).join('; ');
                        }
                    } catch { /* silent */ }

                    // 4. Build activity snapshot
                    const snapshot = [
                        `Desktop: ${windowTitles}`,
                        openWidgets ? `Open widgets: ${openWidgets}` : '',
                        recentFiles ? `Recent files: ${recentFiles}` : '',
                        recentInbox ? `Recent inbox: ${recentInbox}` : '',
                        `Timestamp: ${new Date().toISOString()}`,
                    ].filter(Boolean).join('\n');

                    // 5. Send to Honcho ambient extraction endpoint
                    await fetch(`${HONCHO_API}/memories/extract`, {
                        method: 'POST', headers,
                        body: JSON.stringify({
                            text: snapshot,
                            source: 'honcho-learn-daemon',
                            context: 'desktop-activity-monitoring',
                        }),
                    });

                    setHonchoLearnStats(prev => ({
                        captured: prev.captured + 1,
                        lastCapture: new Date().toLocaleTimeString(),
                    }));
                } catch { /* daemon silently continues */ }
            };

            // Capture immediately, then every 15 seconds
            captureActivity();
            honchoLearnRef.current = setInterval(captureActivity, 15000);

            return () => {
                if (honchoLearnRef.current) clearInterval(honchoLearnRef.current);
            };
        } else {
            localStorage.setItem('honcho-learn-active', 'false');
            if (honchoLearnRef.current) {
                clearInterval(honchoLearnRef.current);
                honchoLearnRef.current = null;
            }
        }
    }, [honchoLearnActive]);

    // ─── Dream mode (LLM reflection over recent memories + captures) ───
    // Composes a short prompt from the last 12 memories + ThoughtWeaver captures
    // and asks the user's configured LLM to find a pattern, a connection, or
    // an unsurfaced to-do. Results land in dreamStore (per-user persistent).
    const runDream = useCallback(async () => {
        if (dreaming) return;
        setDreaming(true);
        try {
            const recent = honchoMemories.slice(0, 12);
            let twCaptures: string[] = [];
            try {
                // Read any per-user TW captures already in localStorage (without
                // re-importing the TW store from here — read by key directly).
                const twKey = userIdForDreams ? `thought-weaver:captures:${userIdForDreams}` : 'thought-weaver:captures:_anonymous';
                const raw = localStorage.getItem(twKey);
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) twCaptures = arr.slice(0, 10).map((c: any) => c.text).filter(Boolean);
                }
            } catch { /* sandboxed / no TW yet */ }

            const memoryText = recent.length === 0
                ? '(no Honcho memories yet)'
                : recent.map((m: any, i: number) => `${i + 1}. [${m.memoryType || 'fact'}] ${m.content || ''}`).join('\n');
            const captureText = twCaptures.length === 0
                ? '(no recent captures)'
                : twCaptures.map((c, i) => `${i + 1}. ${c}`).join('\n');

            const prompt = `You are the user's dream loop. Reflect over the following inputs and surface ONE non-obvious connection, pattern, or to-do the user may not have noticed. Be concise (1-2 short paragraphs). Output JSON only.

Recent Honcho memories:
${memoryText}

Recent ThoughtWeaver captures:
${captureText}

Schema: { "title": "3-6 word headline", "text": "1-2 short paragraphs of reflection" }`;

            if (hasActiveLlm(integrations.llm)) {
                const res = await callLlm({
                    systemPrompt: 'You are an introspective assistant looking for patterns across memories and captures. Respond JSON only.',
                    prompt,
                    responseFormat: 'json',
                    maxTokens: 400,
                    temperature: 0.7,
                }, integrations.llm);
                if (res) {
                    try {
                        const parsed = JSON.parse(res.text);
                        appendDream({
                            title: parsed.title || 'Untitled dream',
                            text: parsed.text || res.text,
                            sources: recent.map((m: any) => m.id).filter(Boolean),
                        });
                    } catch {
                        // LLM returned non-JSON — store the raw text
                        appendDream({ title: 'Reflection', text: res.text, sources: [] });
                    }
                }
            } else {
                // No LLM configured — store a stub so the user sees something
                appendDream({
                    title: 'Configure an LLM to dream',
                    text: 'Add an OpenAI/Anthropic key in Settings → API Keys, then click "Dream now" again. Dream mode runs the model over recent Honcho memories + ThoughtWeaver captures to surface patterns.',
                    sources: [],
                });
            }
        } finally {
            setDreaming(false);
        }
    }, [dreaming, honchoMemories, integrations.llm, userIdForDreams]);

    // Optional auto-dream every 10 minutes
    useEffect(() => {
        if (dreamAutoEnabled) {
            localStorage.setItem('honcho-dream-auto', '1');
            dreamAutoRef.current = setInterval(() => { void runDream(); }, 10 * 60 * 1000);
            return () => { if (dreamAutoRef.current) clearInterval(dreamAutoRef.current); };
        } else {
            try { localStorage.setItem('honcho-dream-auto', '0'); } catch { /* sandboxed */ }
            if (dreamAutoRef.current) { clearInterval(dreamAutoRef.current); dreamAutoRef.current = null; }
        }
    }, [dreamAutoEnabled, runDream]);

    // ─── Browser interaction recorder ───
    // Captures clicks within the Dwellium shell — button labels, widget context,
    // route changes. Stores in-memory + per-user localStorage rolling buffer
    // (200 events). Source for Dream + Mind-map enrichment.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try { localStorage.setItem('honcho-interactions-on', interactionsEnabled ? '1' : '0'); } catch { /* sandboxed */ }
        if (!interactionsEnabled) return;

        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            // Best-effort label resolution
            const label = (target.getAttribute('aria-label')
                || (target.textContent || '').trim().slice(0, 80)
                || target.tagName.toLowerCase()) ?? '(unlabeled)';
            const widgetEl = target.closest('[data-widget-id], [data-dwellium-widget]') as HTMLElement | null;
            const widget = widgetEl?.getAttribute('data-widget-id') ?? widgetEl?.getAttribute('data-dwellium-widget') ?? null;
            const entry = { id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, widget, ts: new Date().toISOString() };
            setInteractionsLog(prev => [entry, ...prev].slice(0, 200));
            // Persist rolling buffer
            try {
                const key = userIdForDreams ? `honcho:interactions:${userIdForDreams}` : 'honcho:interactions:_anonymous';
                const raw = localStorage.getItem(key);
                const arr = raw ? JSON.parse(raw) : [];
                const next = [entry, ...(Array.isArray(arr) ? arr : [])].slice(0, 200);
                localStorage.setItem(key, JSON.stringify(next));
            } catch { /* sandboxed */ }
        };
        window.addEventListener('click', onClick, true);
        return () => { window.removeEventListener('click', onClick, true); };
    }, [interactionsEnabled, userIdForDreams]);

    // Restore interactions log on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const key = userIdForDreams ? `honcho:interactions:${userIdForDreams}` : 'honcho:interactions:_anonymous';
            const raw = localStorage.getItem(key);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) setInteractionsLog(arr.slice(0, 200));
            }
        } catch { /* sandboxed */ }
    }, [userIdForDreams]);

    const filteredHonchoMemories = honchoMemories.filter(m => {
        if (honchoTypeFilter !== 'all' && m.memoryType !== honchoTypeFilter) return false;
        if (honchoFilter && !m.content?.toLowerCase().includes(honchoFilter.toLowerCase())) return false;
        return true;
    });

    const getImportanceLabel = (imp: number) => {
        if (imp >= 0.8) return 'Critical';
        if (imp >= 0.6) return 'High';
        if (imp >= 0.4) return 'Medium';
        return 'Low';
    };

    // ─── Render ───────────────────────────────────────
    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / 1024).toFixed(1)} KB`;
    };

    return (
        <div className="stella">
            {/* Tabs */}
            <div className="stella__tabs">
                {TAB_CONFIG.map(tc => (
                    <button
                        key={tc.id}
                        className={`stella__tab ${tab === tc.id ? 'stella__tab--active' : ''}`}
                        onClick={() => setTab(tc.id)}
                        title={tc.label}
                    >
                        {tc.icon} {tc.label}
                    </button>
                ))}
            </div>

            {/* Status Bar */}
            <div className="stella__status-bar">
                <span className={`stella__status-dot stella__status-dot--${status}`} />
                <span>Stella {status === 'online' ? 'Online' : status === 'degraded' ? 'Degraded' : status === 'loading' ? 'Connecting…' : status === 'starting' ? 'Starting…' : 'Offline'}</span>
                {version && <span className="stella__version">v{version}</span>}
                {healthMs !== null && status === 'online' && <span className="stella__latency">{healthMs}ms</span>}
                {pid && <span className="stella__pid">PID {pid}</span>}
            </div>

            {/* Offline Banner — wording calls out the missing service so the
                operator knows this isn't a transient hiccup but a setup gap.
                Stella's chat path needs the sibling Python agent (+ Honcho/
                Hermes) running; backend A doesn't ship it.
                2026-05-26: when the user has an LLM configured in Settings →
                API Keys, chat works via the personal LLM key — surface a
                softer banner that explains the fallback rather than blocking. */}
            {status === 'offline' && !hasActiveLlm(integrations.llm) && (
                <div className="stella__offline-banner">
                    Stella agent is offline — requires the Stella Python agent service, OR configure a personal LLM in Settings → API Keys.
                    <button className="stella__retry-btn" onClick={checkStatus}>Retry</button>
                    <button className="stella__retry-btn" onClick={async () => {
                        setInitLoading(true);
                        try {
                            await fetch(`${API_BASE}/init`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ provider, model }) });
                            await checkStatus();
                        } catch { } finally { setInitLoading(false); }
                    }} disabled={initLoading}>{initLoading ? 'Initializing…' : 'Initialize'}</button>
                </div>
            )}
            {status === 'offline' && hasActiveLlm(integrations.llm) && (
                <div className="stella__offline-banner" style={{ background: 'rgba(214,254,81,0.08)', borderColor: 'rgba(214,254,81,0.3)' }}>
                    Stella's Python agent is offline — chat is using your personal LLM ({integrations.llm.active}) instead. Skills/memory tabs require the agent.
                    <button className="stella__retry-btn" onClick={checkStatus}>Retry agent</button>
                </div>
            )}
            {status === 'degraded' && (
                <div className="stella__offline-banner" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
                    Stella agent is degraded — it's reachable, but a health signal is impaired. Chat still works; some replies may be slower or fall back.
                    <button className="stella__retry-btn" onClick={checkStatus}>Retry</button>
                </div>
            )}

            {/* Chat Tab */}
            {tab === 'chat' && (
                <div className="stella__chat">
                    <div className="stella__messages">
                        {messages.map(msg => (
                            <div key={msg.id} className={`stella__msg stella__msg--${msg.role}`}>
                                {msg.role === 'assistant'
                                    ? <div className="stella__msg-html" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                    : msg.content
                                }
                                {msg.role !== 'system' && (
                                    <span className="stella__msg-time">{formatTime(msg.timestamp)}</span>
                                )}
                            </div>
                        ))}
                        {isTyping && (
                            <div className="stella__typing">
                                <div className="stella__typing-dot" />
                                <div className="stella__typing-dot" />
                                <div className="stella__typing-dot" />
                                <span style={{ marginLeft: 8, fontSize: 12 }}><AgentEta label="Stella is working" estimateSec={16} /></span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    {/* Context-window warning at 80% / 95% — start a new chat to avoid truncation. */}
                    {(() => {
                        const STELLA_SYSTEM = 'You are Stella, a helpful personal AI assistant inside the Dwellium property-management app.';
                        const tokens = sumTokens([STELLA_SYSTEM, ...messages.map(m => m.content)]);
                        const w = buildContextWarning(tokens, integrations.llm);
                        if (w.level === 'ok') return null;
                        return (
                            <div className={`stella__ctx-warn stella__ctx-warn--${w.level}`}>
                                <span>{w.level === 'warn' ? '' : ''}</span>
                                <span style={{ flex: 1 }}>{w.message}</span>
                                <button
                                    className="stella__ctx-warn-btn"
                                    onClick={() => setMessages([])}
                                    title="Start a fresh conversation"
                                >
                                    New chat
                                </button>
                            </div>
                        );
                    })()}
                    {/* Self-diagnosing banner: when Stella has no path to answer (no backend AND no LLM key),
                        show a clear CTA to fix it. Replaces silent disabled input. */}
                    {!isBackendReachable(status) && !hasActiveLlm(integrations.llm) && (
                        <div className="stella__diagnose-banner">
                            <span className="stella__diagnose-icon"></span>
                            <div className="stella__diagnose-body">
                                <strong>Stella can't answer right now</strong>
                                <p>Backend is offline and no LLM key is configured. Add a key in Settings → API Keys to chat with Stella.</p>
                            </div>
                            <button
                                className="stella__diagnose-cta"
                                onClick={() => {
                                    // Best-effort: emit a custom event the shell can handle to open Settings.
                                    window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: 'control-panel', label: 'Settings' } }));
                                }}
                            >
                                Open Settings
                            </button>
                        </div>
                    )}
                    {/* S2: additive cross-widget handoff row (no restyle; mirrors ARA). */}
                    {suggestedHandoffs.length > 0 && (
                        <div className="stella__handoff-row" role="group" aria-label="Open referenced widget">
                            <span className="stella__handoff-label">Open:</span>
                            {suggestedHandoffs.map((h) => (
                                <button
                                    key={h.widgetId}
                                    type="button"
                                    className="stella__handoff-btn"
                                    onClick={() => handleHandoffClick(h)}
                                    aria-label={`Open ${h.label}`}
                                >
                                    {h.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="stella__input-area">
                        <FileUploadButton
                            size="sm"
                            iconOnly
                            defaultPrompt="Please analyze this file and provide insights relevant to property management."
                            onResult={(result) => {
                                const analysisMsg: ChatMessage = {
                                    id: `upload-${Date.now()}`,
                                    role: 'assistant',
                                    content: `**${result.originalName}** analyzed\n\n${result.analysis}${result.savedDocumentId ? `\n\n*Saved as document (ID: ${result.savedDocumentId.slice(0, 8)}…)*` : ''}`,
                                    timestamp: Date.now(),
                                };
                                setMessages(prev => [...prev, analysisMsg]);
                            }}
                        />
                        <textarea
                            ref={inputRef}
                            className="stella__input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                isBackendReachable(status) ? 'Ask Stella anything…' :
                                hasActiveLlm(integrations.llm) ? `Ask anything (via ${integrations.llm.active})…` :
                                'Stella is offline — type /hermes <task> to spawn Hermes, or configure an LLM in Settings'
                            }
                            // Always typeable: Hermes spawn (`/hermes <task>`) is independent of
                            // the Stella backend + personal LLM, so the composer must stay usable
                            // offline — otherwise the advertised /hermes tip is a dead affordance.
                            rows={1}
                        />
                        <button
                            className="stella__send-btn"
                            onClick={sendMessage}
                            disabled={
                                !input.trim() || isTyping ||
                                // Offline + no LLM only blocks ordinary chat — never a /hermes spawn.
                                (!isBackendReachable(status) && !hasActiveLlm(integrations.llm) && !parseHermesCommand(input).isHermes)
                            }
                            title="Send"
                        >
                           
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ HONCHO TAB — Full Context Engineering Platform ═══ */}
            {tab === 'honcho' && (
                <div className="stella__honcho-platform">
                    {/* Sub-Navigation Sidebar */}
                    <div className="stella__honcho-nav">
                        <div className="stella__honcho-nav-header">
                            <span className="stella__honcho-nav-logo"></span>
                            <div><strong>Honcho</strong><p>Context engineering</p></div>
                        </div>
                        {([
                            { id: 'memory-explorer', label: 'Memory Explorer', icon: '' },
                            { id: 'memory-network', label: 'Memory Network', icon: '' },
                            { id: 'peers-sessions', label: 'Peers & Sessions', icon: '' },
                            { id: 'chat', label: 'Chat', icon: '' },
                            { id: 'data-ingestion', label: 'Data Ingestion', icon: '' },
                            { id: 'ambient', label: 'Ambient', icon: '' },
                            { id: 'search', label: 'Semantic Search', icon: '' },
                            { id: 'memory-map', label: 'Memory Map', icon: '' },
                            { id: 'dream', label: 'Dream', icon: '' },
                            { id: 'interactions', label: 'Interactions', icon: '' },
                            { id: 'setup', label: 'Setup', icon: '' },
                        ] as { id: typeof honchoSection; label: string; icon: string }[]).map(s => (
                            <button key={s.id} className={`stella__honcho-nav-item ${honchoSection === s.id ? 'stella__honcho-nav-item--active' : ''}`}
                                onClick={() => setHonchoSection(s.id)}><span className="stella__honcho-nav-icon">{s.icon}</span><span>{s.label}</span></button>
                        ))}
                    </div>
                    {/* Content Area */}
                    <div className="stella__honcho-content stella__panel">
                        {honchoSection === 'memory-explorer' && (<>
                            <h5 className="stella__skill-hub-title">Memory Explorer</h5>
                            {honchoStats && (<div className="stella__honcho-stats">
                                <div className="stella__honcho-stat"><span className="stella__honcho-stat-val">{honchoStats.totalMemories || 0}</span><span className="stella__honcho-stat-key">Memories</span></div>
                                <div className="stella__honcho-stat"><span className="stella__honcho-stat-val">{honchoStats.totalSessions || 0}</span><span className="stella__honcho-stat-key">Sessions</span></div>
                                <div className="stella__honcho-stat"><span className="stella__honcho-stat-val">{honchoStats.totalPeers || 0}</span><span className="stella__honcho-stat-key">Peers</span></div>
                                <div className="stella__honcho-stat"><span className="stella__honcho-stat-val">{honchoStats.totalConnections || 0}</span><span className="stella__honcho-stat-key">Links</span></div>
                            </div>)}
                            <div className="stella__honcho-toolbar">
                                <input className="stella__honcho-search" placeholder="Search memories..." value={honchoFilter} onChange={e => setHonchoFilter(e.target.value)} />
                                <select className="stella__honcho-type-filter" value={honchoTypeFilter} onChange={e => setHonchoTypeFilter(e.target.value)}>
                                    <option value="all">All Types</option><option value="fact">Facts</option><option value="preference">Preferences</option>
                                    <option value="decision">Decisions</option><option value="observation">Observations</option><option value="insight">Insights</option>
                                </select>
                                <button className="stella__btn-sm" aria-label={showAddHonchoMemory ? 'Cancel adding memory' : 'Add memory'} aria-expanded={showAddHonchoMemory} onClick={() => setShowAddHonchoMemory(!showAddHonchoMemory)}>{showAddHonchoMemory ? '' : '+ Add'}</button>
                            </div>
                            {showAddHonchoMemory && (<div className="stella__honcho-add-form">
                                <textarea className="stella__honcho-textarea" placeholder="What should Honcho remember?" value={newHonchoMemory.content} onChange={e => setNewHonchoMemory({ ...newHonchoMemory, content: e.target.value })} rows={3} />
                                <div className="stella__honcho-add-row">
                                    <select value={newHonchoMemory.memoryType} onChange={e => setNewHonchoMemory({ ...newHonchoMemory, memoryType: e.target.value })}>
                                        <option value="fact">Fact</option><option value="preference">Preference</option><option value="decision">Decision</option>
                                        <option value="observation">Observation</option><option value="insight">Insight</option>
                                    </select>
                                    <label>Importance: {(newHonchoMemory.importance * 100).toFixed(0)}%<input type="range" min={0} max={1} step={0.1} value={newHonchoMemory.importance} onChange={e => setNewHonchoMemory({ ...newHonchoMemory, importance: parseFloat(e.target.value) })} /></label>
                                    <button className="stella__btn-sm stella__btn-sm--install" onClick={addHonchoMemory} disabled={!newHonchoMemory.content.trim()}>Save</button>
                                </div>
                            </div>)}
                            <div className="stella__honcho-list">{honchoLoading ? (<div className="stella__loading"><div className="stella__spinner" /> Loading…</div>
                            ) : filteredHonchoMemories.length === 0 ? (<div className="stella__empty"><span className="stella__empty-icon"></span><p className="stella__empty-text">No memories yet.</p></div>
                            ) : filteredHonchoMemories.map(m => (
                                <div key={m.id} className="stella__honcho-memory" style={{ borderLeftColor: TYPE_COLORS[m.memoryType] || '#D6FE51' }}>
                                    <div className="stella__honcho-memory-top"><span className="stella__honcho-memory-type">{TYPE_ICONS[m.memoryType] || ''} {m.memoryType}</span>
                                        <span className={`stella__honcho-importance imp-${getImportanceLabel(m.importance).toLowerCase()}`}>{getImportanceLabel(m.importance)}</span>
                                        <span className="stella__honcho-source">{m.source}</span></div>
                                    <p className="stella__honcho-content">{m.content}</p>
                                    <div className="stella__honcho-meta"><span>{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ''}</span>
                                        <button className="stella__btn-sm stella__btn-sm--danger" aria-label="Delete memory" onClick={() => deleteHonchoMemory(m.id)}><Trash2 size={14} /></button></div>
                                </div>))}</div>
                        </>)}
                        {honchoSection === 'memory-network' && (<>
                            <h5 className="stella__skill-hub-title">Memory Network</h5>
                            <p className="stella__honcho-learn-desc" style={{ marginBottom: 12 }}>Memory connections, associations, and semantic clusters.</p>
                            {honchoStats && (<div className="stella__honcho-stats">
                                <div className="stella__honcho-stat"><span className="stella__honcho-stat-val">{honchoStats.totalConnections || 0}</span><span className="stella__honcho-stat-key">Connections</span></div>
                                <div className="stella__honcho-stat"><span className="stella__honcho-stat-val">{honchoStats.totalMemories || 0}</span><span className="stella__honcho-stat-key">Nodes</span></div>
                                <div className="stella__honcho-stat"><span className="stella__honcho-stat-val">{honchoStats.totalPeers || 0}</span><span className="stella__honcho-stat-key">Clusters</span></div>
                            </div>)}
                            <div className="stella__honcho-network-viz">
                                {filteredHonchoMemories.slice(0, 20).map((m, i) => (
                                    <div key={m.id} className="stella__honcho-network-node" style={{
                                        left: `${15 + (i % 5) * 18}%`, top: `${10 + Math.floor(i / 5) * 22}%`,
                                        borderColor: TYPE_COLORS[m.memoryType] || '#D6FE51',
                                    }}><span>{TYPE_ICONS[m.memoryType] || ''}</span><span className="stella__honcho-network-text">{m.content?.substring(0, 30)}…</span></div>
                                ))}
                                {filteredHonchoMemories.length === 0 && (<div className="stella__empty"><span className="stella__empty-icon"></span><p className="stella__empty-text">No memories to visualize.</p></div>)}
                            </div>
                        </>)}
                        {honchoSection === 'peers-sessions' && (<>
                            <h5 className="stella__skill-hub-title">Peers ({honchoPeers.length})</h5>
                            <div className="stella__honcho-list">{honchoPeers.length === 0 ? (
                                <div className="stella__empty"><span className="stella__empty-icon"></span><p className="stella__empty-text">No peers registered.</p></div>
                            ) : honchoPeers.map((p: any) => (<div key={p.id} className="stella__honcho-memory">
                                <div className="stella__honcho-memory-top"><span className="stella__honcho-memory-type">{p.name || p.id}</span><span className="stella__honcho-source">{p.type || 'peer'}</span></div>
                                <p className="stella__honcho-content">{p.description || p.representation || `Peer ${p.id}`}</p>
                            </div>))}</div>
                            <h5 className="stella__skill-hub-title" style={{ marginTop: 14 }}>Sessions ({honchoSessions.length})</h5>
                            <div className="stella__honcho-list">{honchoSessions.length === 0 ? (
                                <div className="stella__empty"><span className="stella__empty-icon"></span><p className="stella__empty-text">No sessions yet.</p></div>
                            ) : honchoSessions.map((s: any) => (<div key={s.id} className="stella__honcho-memory">
                                <div className="stella__honcho-memory-top"><span className="stella__honcho-memory-type">{s.summary || `Session ${s.id?.substring(0, 8)}`}</span><span className="stella__honcho-source">{s.messageCount || 0} msgs</span></div>
                                <p className="stella__honcho-content">{s.createdAt ? new Date(s.createdAt).toLocaleString() : 'Active'}</p>
                            </div>))}</div>
                        </>)}
                        {honchoSection === 'chat' && (<>
                            <h5 className="stella__skill-hub-title">Chat with Honcho</h5>
                            <div className="stella__honcho-chat-messages stella__messages">
                                {honchoChatMessages.length === 0 && (<div className="stella__empty"><span className="stella__empty-icon"></span><p className="stella__empty-text">Ask Honcho about your memories.</p></div>)}
                                {honchoChatMessages.map((m: any, i: number) => (<div key={i} className={`stella__msg stella__msg--${m.role}`}>{m.content}</div>))}
                                {honchoChatLoading && <div className="stella__typing"><div className="stella__typing-dot" /><div className="stella__typing-dot" /><div className="stella__typing-dot" /></div>}
                            </div>
                            <div className="stella__input-area"><textarea className="stella__input" value={honchoChatInput} onChange={e => setHonchoChatInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); honchoChatSend(); } }} placeholder="Ask about your memories…" rows={1} />
                                <button className="stella__send-btn" aria-label="Send" onClick={honchoChatSend} disabled={!honchoChatInput.trim() || honchoChatLoading}>▶</button></div>
                        </>)}
                        {honchoSection === 'data-ingestion' && (<>
                            <h5 className="stella__skill-hub-title">Data Ingestion</h5>
                            <div className="stella__honcho-add-form"><textarea className="stella__honcho-textarea" placeholder="Paste text, notes, or data to ingest…"
                                value={honchoIngestText} onChange={e => setHonchoIngestText(e.target.value)} rows={6} />
                                <div className="stella__honcho-add-row">
                                    <select value={honchoIngestSource} onChange={e => setHonchoIngestSource(e.target.value)}>
                                        <option value="manual">Manual</option><option value="document">Document</option><option value="email">Email</option><option value="trello">Trello</option>
                                    </select>
                                    <button className="stella__btn-sm stella__btn-sm--install" onClick={honchoIngest} disabled={!honchoIngestText.trim()}>Ingest</button>
                                </div>
                            </div>
                            <h5 className="stella__skill-hub-title" style={{ marginTop: 14, fontSize: 12 }}>Collections ({honchoCollections.length})</h5>
                            <div className="stella__honcho-list">{honchoCollections.length === 0 ? (
                                <div className="stella__empty"><span className="stella__empty-icon"></span><p className="stella__empty-text">No collections yet.</p></div>
                            ) : honchoCollections.map((c: any) => (<div key={c.id} className="stella__honcho-memory">
                                <div className="stella__honcho-memory-top"><span className="stella__honcho-memory-type">{c.name || c.id}</span><span className="stella__honcho-source">{c.documentCount || 0} docs</span></div>
                            </div>))}</div>
                        </>)}
                        {honchoSection === 'ambient' && (<>
                            <h5 className="stella__skill-hub-title">Ambient Learning</h5>
                            <div className={`stella__honcho-learn ${honchoLearnActive ? 'stella__honcho-learn--active' : ''}`}>
                                <div className="stella__honcho-learn-info"><span className="stella__honcho-learn-icon">{honchoLearnActive ? '' : ''}</span><div><strong>Honcho Learn</strong>
                                    <p className="stella__honcho-learn-desc">{honchoLearnActive ? `Active — ${honchoLearnStats.captured} snapshots${honchoLearnStats.lastCapture ? `, last: ${honchoLearnStats.lastCapture}` : ''}` : 'Off — click to start monitoring'}</p></div></div>
                                <button className={`stella__honcho-learn-btn ${honchoLearnActive ? 'stella__honcho-learn-btn--on' : ''}`}
                                    onClick={() => setHonchoLearnActive(!honchoLearnActive)}>{honchoLearnActive ? 'Stop' : '▶ Learn'}</button>
                            </div>
                            <div className="stella__honcho-list" style={{ marginTop: 14 }}>
                                <div className="stella__honcho-memory"><p className="stella__honcho-content">Monitors open windows and widgets every 15s</p></div>
                                <div className="stella__honcho-memory"><p className="stella__honcho-content">Tracks file edits and document activity</p></div>
                                <div className="stella__honcho-memory"><p className="stella__honcho-content">Captures inbox items and communication</p></div>
                                <div className="stella__honcho-memory"><p className="stella__honcho-content">Extracts observations as low-importance memories</p></div>
                                <div className="stella__honcho-memory"><p className="stella__honcho-content">Persists across sessions until stopped</p></div>
                            </div>
                        </>)}
                        {honchoSection === 'search' && (<>
                            <h5 className="stella__skill-hub-title">Semantic Search</h5>
                            <div className="stella__hermes-delegate-row"><input className="stella__hermes-input" placeholder="Semantic search across workspace…"
                                value={honchoSearchQuery} onChange={e => setHonchoSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && honchoSemanticSearch()} />
                                <button className="stella__send-btn" aria-label="Search" onClick={honchoSemanticSearch} disabled={!honchoSearchQuery.trim()}><Search size={14} /></button></div>
                            <div className="stella__honcho-list">{honchoSearchResults.length === 0 ? (
                                <div className="stella__empty"><span className="stella__empty-icon"></span><p className="stella__empty-text">Enter a query to search.</p></div>
                            ) : honchoSearchResults.map((r: any, i: number) => (
                                <div key={i} className="stella__honcho-memory" style={{ borderLeftColor: '#D6FE51' }}>
                                    <div className="stella__honcho-memory-top"><span className="stella__honcho-memory-type">{r.memoryType || 'result'}</span>
                                        {r.score && <span className="stella__honcho-importance imp-medium">{(r.score * 100).toFixed(0)}%</span>}</div>
                                    <p className="stella__honcho-content">{r.content || r.text}</p></div>))}</div>
                        </>)}
                        {honchoSection === 'memory-map' && (() => {
                            // Build nodes from peers + memory sources
                            const peerSources = honchoPeers.length > 0
                                ? honchoPeers.map((p: any) => ({ id: p.id || p.name, label: p.name || p.id, type: p.type || 'peer' }))
                                : [
                                    { id: 'user', label: 'user', type: 'user' },
                                    { id: 'desktop', label: 'desktop', type: 'system' },
                                    { id: 'antigravity', label: 'antigravity', type: 'agent' },
                                ];
                            // Add memory type groups as nodes
                            const typeNodes = Object.entries(TYPE_ICONS)
                                .map(([type, icon]) => {
                                    const count = honchoMemories.filter(m => m.memoryType === type).length;
                                    return count > 0 ? { id: `type-${type}`, label: `${icon} ${type} (${count})`, type: 'memory' } : null;
                                })
                                .filter(Boolean) as { id: string; label: string; type: string }[];
                            const allNodes = [
                                { id: 'default', label: 'default', type: 'center' },
                                ...peerSources,
                                ...typeNodes,
                            ];
                            const edges = allNodes.slice(1).map(n => ({ from: 'default', to: n.id }));
                            const totalNodes = allNodes.length;
                            const totalEdges = edges.length;

                            return (<>
                                <div className="stella__memory-map-header">
                                    <h5 className="stella__skill-hub-title">Memory Map</h5>
                                    <span className="stella__memory-map-counts">{totalNodes} nodes &nbsp; {totalEdges} edges</span>
                                </div>
                                <div className="stella__memory-map-canvas-wrap" ref={(el) => {
                                    if (!el) return;
                                    const existing = el.querySelector('canvas');
                                    if (existing) existing.remove();
                                    const canvas = document.createElement('canvas');
                                    const dpr = window.devicePixelRatio || 1;
                                    const w = el.clientWidth || 500;
                                    const h = el.clientHeight || 400;
                                    canvas.width = w * dpr;
                                    canvas.height = h * dpr;
                                    canvas.style.width = w + 'px';
                                    canvas.style.height = h + 'px';
                                    el.appendChild(canvas);
                                    const ctx = canvas.getContext('2d');
                                    if (!ctx) return;
                                    ctx.scale(dpr, dpr);

                                    // Layout — center node + radial
                                    const cx = w / 2, cy = h / 2;
                                    const radius = Math.min(w, h) * 0.36;
                                    const nodeColors: Record<string, string> = {
                                        center: '#f59e0b',
                                        user: '#D6FE51',
                                        agent: '#D6FE51',
                                        system: '#D6FE51',
                                        peer: '#22d3ee',
                                        memory: '#22d3ee',
                                        external: '#22d3ee',
                                    };
                                    const positions: { x: number; y: number; color: string; label: string; isCenter: boolean }[] = [];
                                    allNodes.forEach((node, i) => {
                                        if (i === 0) {
                                            positions.push({ x: cx, y: cy, color: nodeColors[node.type] || '#D6FE51', label: node.label, isCenter: true });
                                        } else {
                                            const angle = ((i - 1) / (allNodes.length - 1)) * Math.PI * 2 - Math.PI / 2;
                                            positions.push({
                                                x: cx + Math.cos(angle) * radius,
                                                y: cy + Math.sin(angle) * radius,
                                                color: nodeColors[node.type] || '#22d3ee',
                                                label: node.label,
                                                isCenter: false,
                                            });
                                        }
                                    });

                                    // Draw edges
                                    positions.slice(1).forEach(p => {
                                        ctx.beginPath();
                                        ctx.moveTo(positions[0].x, positions[0].y);
                                        ctx.lineTo(p.x, p.y);
                                        ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
                                        ctx.lineWidth = 1.5;
                                        ctx.stroke();
                                    });

                                    // Draw glow behind center
                                    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.35);
                                    grd.addColorStop(0, 'rgba(245, 158, 11, 0.12)');
                                    grd.addColorStop(1, 'rgba(245, 158, 11, 0)');
                                    ctx.fillStyle = grd;
                                    ctx.beginPath();
                                    ctx.arc(cx, cy, radius * 0.35, 0, Math.PI * 2);
                                    ctx.fill();

                                    // Draw nodes
                                    positions.forEach(p => {
                                        const r = p.isCenter ? 22 : 14;
                                        // Outer ring
                                        ctx.beginPath();
                                        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
                                        ctx.strokeStyle = p.color;
                                        ctx.lineWidth = 2;
                                        ctx.stroke();
                                        // Fill
                                        ctx.beginPath();
                                        ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
                                        ctx.fillStyle = p.color;
                                        ctx.fill();
                                        // Inner darker circle for 3D effect
                                        ctx.beginPath();
                                        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                                        ctx.fillStyle = 'rgba(20, 24, 40, 0.7)';
                                        ctx.fill();
                                        // Color dot center
                                        ctx.beginPath();
                                        ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
                                        ctx.fillStyle = p.color;
                                        ctx.fill();
                                        // Label
                                        ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
                                        ctx.font = `${p.isCenter ? 13 : 11}px "Inter", sans-serif`;
                                        ctx.textAlign = 'center';
                                        ctx.fillText(p.label, p.x, p.y + r + 18);
                                    });
                                }} />
                            </>);
                        })()}

                        {honchoSection === 'dream' && (<>
                            <div className="stella__honcho-dream-header">
                                <h5 className="stella__skill-hub-title">Dream Mode</h5>
                                <div className="stella__honcho-dream-actions">
                                    <button
                                        className="stella__honcho-dream-btn"
                                        onClick={() => void runDream()}
                                        disabled={dreaming}
                                        title="Run LLM reflection over recent memories + captures"
                                    >
                                        {dreaming ? 'Dreaming…' : 'Dream now'}
                                    </button>
                                    <label className="stella__honcho-dream-auto">
                                        <input
                                            type="checkbox"
                                            checked={dreamAutoEnabled}
                                            onChange={e => setDreamAutoEnabled(e.target.checked)}
                                        />
                                        <span>Auto every 10 min</span>
                                    </label>
                                    {dreams.length > 0 && (
                                        <button
                                            className="stella__honcho-dream-clear"
                                            onClick={() => { if (window.confirm(`Clear all ${dreams.length} dreams?`)) clearDreams(); }}
                                        >
                                            Clear all
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="stella__honcho-dream-desc">
                                Dream synthesizes patterns from your recent Honcho memories + ThoughtWeaver captures. Each dream is saved per user — only you can delete it.
                            </p>
                            {dreams.length === 0 ? (
                                <div className="stella__honcho-empty">
                                    <span></span>
                                    <p>No dreams yet. Click "Dream now" to surface a pattern.</p>
                                </div>
                            ) : (
                                <div className="stella__honcho-dreams">
                                    {dreams.map(d => (
                                        <div key={d.id} className="stella__honcho-dream-card">
                                            <div className="stella__honcho-dream-card-header">
                                                <strong>{d.title}</strong>
                                                <span className="stella__honcho-dream-time">{new Date(d.createdAt).toLocaleString()}</span>
                                                <button className="stella__honcho-dream-del" onClick={() => deleteDream(d.id)} title="Delete" aria-label="Delete dream"><Trash2 size={14} /></button>
                                            </div>
                                            <p className="stella__honcho-dream-text">{d.text}</p>
                                            {d.sources.length > 0 && (
                                                <p className="stella__honcho-dream-sources">based on {d.sources.length} memor{d.sources.length === 1 ? 'y' : 'ies'}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>)}

                        {honchoSection === 'interactions' && (<>
                            <div className="stella__honcho-interactions-header">
                                <h5 className="stella__skill-hub-title">Desktop Interactions</h5>
                                <button
                                    className={`stella__honcho-interactions-btn ${interactionsEnabled ? 'stella__honcho-interactions-btn--on' : ''}`}
                                    onClick={() => setInteractionsEnabled(!interactionsEnabled)}
                                >
                                    {interactionsEnabled ? 'Stop recording' : '▶ Start recording'}
                                </button>
                            </div>
                            <p className="stella__honcho-dream-desc">
                                Records every click within Dwellium — button labels + the widget you were in. Last 200 events stored per user. Source for Dream reflections + Mind Map enrichment.
                                {' '}
                                {interactionsEnabled
                                    ? <strong style={{ color: '#d6fe51' }}>● Recording</strong>
                                    : <span style={{ color: '#9ca3af' }}>○ Stopped</span>}
                            </p>
                            {interactionsLog.length === 0 ? (
                                <div className="stella__honcho-empty">
                                    <span></span>
                                    <p>No interactions captured yet. Start recording, then click around.</p>
                                </div>
                            ) : (
                                <div className="stella__honcho-interactions-list">
                                    {interactionsLog.slice(0, 60).map(e => (
                                        <div key={e.id} className="stella__honcho-interaction-row">
                                            <span className="stella__honcho-interaction-label">{e.label}</span>
                                            {e.widget && <span className="stella__honcho-interaction-widget">in {e.widget}</span>}
                                            <span className="stella__honcho-interaction-time">{new Date(e.ts).toLocaleTimeString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>)}

                        {honchoSection === 'setup' && (<>
                            <h5 className="stella__skill-hub-title">Setup</h5>
                            <div className="stella__settings"><div className="stella__settings-status">
                                <strong>Honcho Status</strong><span>API: {HONCHO_API}</span>
                                <span>Memories: {honchoStats?.totalMemories || 0} | Sessions: {honchoStats?.totalSessions || 0} | Peers: {honchoStats?.totalPeers || 0}</span>
                                <span>Ambient: {honchoLearnActive ? 'On' : 'Off'} ({honchoLearnStats.captured} snapshots)</span>
                            </div><hr className="stella__settings-divider" /><div className="stella__settings-actions">
                                <button className="stella__settings-btn" onClick={() => { fetchHonchoMemories(); fetchHonchoStats(); fetchHonchoPeers(); fetchHonchoSessions(); }}>Refresh</button>
                                <button className="stella__settings-btn" onClick={async () => { const t = getAuthToken(); await fetch(`${HONCHO_API}/memories/reindex`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } }); fetchHonchoStats(); }}>Reindex</button>
                                <button className="stella__settings-btn" onClick={async () => { const t = getAuthToken(); await fetch(`${HONCHO_API}/deriver/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } }); }}>▶ Start Deriver</button>
                                <button className="stella__settings-btn stella__settings-btn--danger" onClick={async () => { const t = getAuthToken(); await fetch(`${HONCHO_API}/deriver/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } }); }}>Stop Deriver</button>
                            </div></div>
                        </>)}
                    </div>
                </div>
            )}


            {/* ═══ HERMES TAB ═══ */}
            {tab === 'hermes' && (
                <div className="stella__panel">
                    {/* Status */}
                    <div className={`stella__hermes-status ${hermesOnline ? 'stella__hermes-status--online' : 'stella__hermes-status--offline'}`}>
                        <span className="stella__hermes-status-icon">{hermesOnline ? '' : ''}</span>
                        <div>
                            <strong>{hermesOnline ? 'Hermes Online' : 'Hermes Offline'}</strong>
                            <p>{hermesOnline ? 'ReAct reasoning loop ready. Local LLM connected.' : 'Ollama not available. Start Ollama to enable Hermes.'}</p>
                        </div>
                    </div>

                    {/* Tool Registry */}
                    <div className="stella__hermes-section">
                        <h5 className="stella__skill-hub-title">Registered Tools ({hermesTools.length})</h5>
                        <div className="stella__hermes-tools">
                            {hermesTools.map((t: any) => (
                                <div key={t.name} className="stella__hermes-tool">
                                    <span className="stella__hermes-tool-name">{t.name}</span>
                                    <span className="stella__hermes-tool-desc">{t.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Task Delegation */}
                    <div className="stella__hermes-section">
                        <h5 className="stella__skill-hub-title">Delegate Task</h5>
                        <div className="stella__hermes-delegate-row">
                            <input className="stella__hermes-input" placeholder="Ask Hermes to investigate, analyze, or search..."
                                value={hermesPrompt} onChange={e => setHermesPrompt(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && delegateToHermes()}
                                disabled={!hermesOnline || hermesRunning} />
                            <button className="stella__send-btn" onClick={delegateToHermes}
                                disabled={!hermesOnline || hermesRunning || !hermesPrompt.trim()}>
                                {hermesRunning ? '' : ''}
                            </button>
                        </div>

                        {/* ReAct Steps Trace */}
                        {hermesSteps.length > 0 && (
                            <div className="stella__hermes-steps">
                                {hermesSteps.map((step: any, i: number) => (
                                    <div key={i} className={`stella__hermes-step stella__hermes-step--${step.type}`}>
                                        <span className="stella__hermes-step-icon">
                                            {{ thought: '', action: '', observation: '', final_answer: '' }[step.type as string] || ''}
                                        </span>
                                        <div className="stella__hermes-step-body">
                                            <span className="stella__hermes-step-label">{(step.type as string).replace('_', ' ').toUpperCase()}</span>
                                            <p>{step.content}</p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={hermesStepsEndRef} />
                            </div>
                        )}

                        {/* Final Result */}
                        {hermesResult && !hermesRunning && (
                            <div className="stella__hermes-result">
                                <h5>Result</h5>
                                <pre>{hermesResult}</pre>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Skills Tab */}
            {tab === 'skills' && (
                <div className="stella__panel">
                    {/* Skill Hub Search */}
                    <div className="stella__skill-search">
                        <input
                            className="stella__skill-search-input"
                            type="text"
                            placeholder="Search skill hub…"
                            value={skillSearchQuery}
                            onChange={e => setSkillSearchQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') searchSkills(skillSearchQuery); }}
                        />
                        <button className="stella__btn-sm" onClick={() => searchSkills(skillSearchQuery)}>
                            {skillSearching ? '' : ''} Search
                        </button>
                    </div>
                    {skillSearchResults.length > 0 && (
                        <div className="stella__skill-hub-results">
                            <h5 className="stella__skill-hub-title">Hub Results</h5>
                            {skillSearchResults.map(r => (
                                <div key={r.slug} className="stella__skill-card stella__skill-card--hub">
                                    <div className="stella__skill-info">
                                        <div className="stella__skill-name">{r.name || r.slug}</div>
                                        {r.description && <div className="stella__skill-source">{r.description}</div>}
                                    </div>
                                    <button
                                        className="stella__btn-sm stella__btn-sm--install"
                                        onClick={() => installSkill(r.slug)}
                                        disabled={installingSkill === r.slug}
                                    >
                                        {installingSkill === r.slug ? 'Installing…' : 'Install'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Stella Tool Catalog (Cycle 18) — broad, organized library of
                        built-in capabilities; each entry runs via an existing mechanism.
                        Additive section, always available (independent of backend skills). */}
                    <div className="stella__tool-catalog" role="region" aria-label="Stella tool catalog">
                        <h5 className="stella__skill-hub-title">Tool Catalog ({toolCount()})</h5>
                        <div className="stella__skill-search">
                            <input
                                className="stella__skill-search-input"
                                type="text"
                                placeholder="Filter tools…"
                                aria-label="Filter Stella tools"
                                value={toolCatalogQuery}
                                onChange={e => setToolCatalogQuery(e.target.value)}
                            />
                        </div>
                        {catalogGroups.length === 0 ? (
                            <div className="stella__empty">
                                <span className="stella__empty-icon"></span>
                                <p className="stella__empty-text">No tools match “{toolCatalogQuery}”.</p>
                            </div>
                        ) : (
                            catalogGroups.map(group => (
                                <div key={group.category} className="stella__tool-cat-group">
                                    <div className="stella__tool-cat-label">{group.category}</div>
                                    {group.tools.map(tool => (
                                        <button
                                            key={tool.id}
                                            type="button"
                                            className="stella__tool-card"
                                            onClick={() => runCatalogTool(tool)}
                                            aria-label={`Run ${tool.name}`}
                                            title={tool.description}
                                        >
                                            <span className="stella__tool-icon" aria-hidden="true">{tool.icon}</span>
                                            <span className="stella__tool-info">
                                                <span className="stella__tool-name">{tool.name}</span>
                                                <span className="stella__tool-desc">{tool.description}</span>
                                            </span>
                                            <span className="stella__tool-go" aria-hidden="true">↗</span>
                                        </button>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>

                    <h5 className="stella__skill-hub-title">Installed Skills</h5>
                    {skillsLoading ? (
                        <div className="stella__loading">
                            <div className="stella__spinner" /> Loading skills…
                        </div>
                    ) : skills.length === 0 ? (
                        <div className="stella__empty">
                            <span className="stella__empty-icon"></span>
                            <p className="stella__empty-text">
                                {status === 'online'
                                    ? 'No skills found. Use the search bar above to discover and install skills.'
                                    : 'Connect to Stella to view skills.'}
                            </p>
                        </div>
                    ) : (
                        skills.map(skill => (
                            <div key={skill.name} className="stella__skill-card">
                                <div className="stella__skill-icon">
                                    {skill.source === 'builtin' ? '' : ''}
                                </div>
                                <div className="stella__skill-info">
                                    <div className="stella__skill-name">{skill.name}</div>
                                    <div className="stella__skill-source">{skill.source}</div>
                                </div>
                                <div className="stella__skill-actions">
                                    <button
                                        className={`stella__skill-toggle stella__skill-toggle--${skill.enabled ? 'on' : 'off'}`}
                                        onClick={() => toggleSkill(skill.name, skill.enabled)}
                                        title={skill.enabled ? 'Disable' : 'Enable'}
                                    />
                                    {skill.source !== 'builtin' && (
                                        <button
                                            className="stella__btn-sm stella__btn-sm--danger"
                                            onClick={() => uninstallSkill(skill.name)}
                                            title="Uninstall"
                                            aria-label="Uninstall skill"
                                        ></button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Memory Tab */}
            {tab === 'memory' && (
                <div className="stella__panel">
                    {memoryLoading ? (
                        <div className="stella__loading">
                            <div className="stella__spinner" /> Loading memory…
                        </div>
                    ) : memoryFiles.length === 0 ? (
                        <div className="stella__empty">
                            <span className="stella__empty-icon"></span>
                            <p className="stella__empty-text">
                                {status === 'online'
                                    ? 'No memory files yet. Stella stores context here as you interact.'
                                    : 'Connect to Stella to view memory.'}
                            </p>
                        </div>
                    ) : (
                        memoryFiles.map(file => (
                            <div
                                key={file.filename}
                                className="stella__memory-file"
                            >
                                <div className="stella__memory-header" onClick={() => loadMemoryContent(file.filename)}>
                                    <div className="stella__memory-filename">
                                        {file.filename}
                                    </div>
                                    <div className="stella__memory-meta">
                                        {formatSize(file.size)} • Modified {file.modified_time}
                                    </div>
                                </div>
                                {expandedMemory === file.filename && memoryContent[file.filename] && (
                                    <div className="stella__memory-content-wrap">
                                        {editingMemory === file.filename ? (
                                            <>
                                                <textarea
                                                    className="stella__memory-editor"
                                                    value={editMemoryDraft}
                                                    onChange={e => setEditMemoryDraft(e.target.value)}
                                                    rows={10}
                                                />
                                                <div className="stella__memory-edit-actions">
                                                    <button className="stella__btn-sm stella__btn-sm--install" onClick={() => saveMemory(file.filename, editMemoryDraft)}>Save</button>
                                                    <button className="stella__btn-sm" onClick={() => setEditingMemory(null)}>Cancel</button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="stella__memory-content">
                                                    {memoryContent[file.filename]}
                                                </div>
                                                <button className="stella__btn-sm" onClick={() => {
                                                    setEditingMemory(file.filename);
                                                    setEditMemoryDraft(memoryContent[file.filename] || '');
                                                }}>Edit</button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Voice Tab */}
            {tab === 'voice' && (
                <div className="stella__voice-panel">
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-default, rgba(255,255,255,0.08))' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Text-to-Speech</div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Read Stella's replies aloud{openaiKey ? '' : ' · browser voices (add an OpenAI key in Settings → API Keys for premium voices)'}</div>
                            </div>
                            <button onClick={toggleTts} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--border-default, rgba(255,255,255,0.15))', background: ttsSpeak ? 'var(--accent)' : 'transparent', color: ttsSpeak ? 'var(--text-inverse, #000)' : 'var(--text-primary)' }}>
                                {ttsSpeak ? 'Speaking On' : 'Speak Off'}{stellaSpeaking ? ' …' : ''}
                            </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Voice</label>
                            <select value={ttsVoice} onChange={e => setVoicePersist(e.target.value)} style={{ flex: 1, minWidth: 180, fontSize: 12, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-surface, #1a1a1a)', color: 'var(--text-primary)', border: '1px solid var(--border-default, rgba(255,255,255,0.15))' }}>
                                <optgroup label="OpenAI — premium (needs OpenAI key)">
                                    {TTS_VOICE_CATALOG.filter(v => v.provider === 'openai').map(v => <option key={v.id} value={v.id}>{v.label} — {v.description.replace('OpenAI — ', '')}</option>)}
                                </optgroup>
                                <optgroup label="Browser — macOS (no key needed)">
                                    {TTS_VOICE_CATALOG.filter(v => v.provider === 'browser').map(v => <option key={v.id} value={v.id}>{v.label} — {v.description.replace('Apple — ', '')}</option>)}
                                </optgroup>
                            </select>
                            <button onClick={() => speakStella('Hi, this is Stella. This is how I sound with this voice.')} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-default, rgba(255,255,255,0.15))', background: 'transparent', color: 'var(--text-primary)' }}>▶︎ Preview</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.05))' }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Humanize replies</div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Warmer and more conversational — less robotic. Applies to every Stella reply.</div>
                            </div>
                            <button onClick={toggleHumanize} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--border-default, rgba(255,255,255,0.15))', background: humanizeEnabled ? 'var(--accent)' : 'transparent', color: humanizeEnabled ? 'var(--text-inverse, #000)' : 'var(--text-primary)' }}>
                                {humanizeEnabled ? 'On' : 'Off'}
                            </button>
                        </div>
                    </div>
                    {!voiceChecked ? (
                        <div className="stella__loading">
                            <div className="stella__spinner" /> Checking voice service…
                        </div>
                    ) : voiceOnline ? (
                        <iframe
                            className="stella__voice-iframe"
                            src={voiceUrl}
                            title="Stella Voice"
                            allow="microphone; camera; display-capture"
                        />
                    ) : (
                        <div className="stella__empty">
                            <span className="stella__empty-icon"></span>
                            <p className="stella__empty-text">
                                Stella Voice service is not running.
                                Start it with: <code>cd stella-livekit && npm run dev</code>
                            </p>
                            <button
                                className="stella__settings-btn"
                                onClick={() => {
                                    setVoiceChecked(false);
                                    fetch(`${API_BASE}/voice-status`, { headers: getAuthHeaders() })
                                        .then(r => r.json())
                                        .then(d => {
                                            if (d.success && d.data) {
                                                setVoiceOnline(d.data.online);
                                                if (d.data.url) setVoiceUrl(d.data.url);
                                            }
                                            setVoiceChecked(true);
                                        })
                                        .catch(() => setVoiceChecked(true));
                                }}
                            >
                                Retry Connection
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Automation Tab (Phase 2.2) */}
            {tab === 'automation' && (
                <div className="stella__panel stella__automation">
                    <h4 className="stella__panel-title">Automation &amp; Cron Jobs
                        {permissions && !permissions.canManageAutomation && (
                            <span className="stella__rbac-badge" title="Read-only: manager role required">View Only</span>
                        )}
                    </h4>

                    {/* Summary Dashboard */}
                    {cronSummary && (
                        <div className="stella__cron-summary">
                            <div className="stella__cron-stat">
                                <span className="stella__cron-stat-value">{cronSummary.total ?? 0}</span>
                                <span className="stella__cron-stat-label">Total</span>
                            </div>
                            <div className="stella__cron-stat">
                                <span className="stella__cron-stat-value stella__cron-stat--active">{cronSummary.active ?? 0}</span>
                                <span className="stella__cron-stat-label">Active</span>
                            </div>
                            <div className="stella__cron-stat">
                                <span className="stella__cron-stat-value stella__cron-stat--paused">{cronSummary.paused ?? 0}</span>
                                <span className="stella__cron-stat-label">Paused</span>
                            </div>
                            {cronSummary.nextJob && (
                                <div className="stella__cron-stat">
                                    <span className="stella__cron-stat-value"></span>
                                    <span className="stella__cron-stat-label">{cronSummary.nextJob.name}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {cronLoading ? (
                        <div className="stella__loading">Loading cron jobs…</div>
                    ) : cronJobs.length === 0 ? (
                        <div className="stella__empty">
                            <div className="stella__empty-icon"></div>
                            <p>No scheduled jobs yet.</p>
                            <p className="stella__empty-hint">Cron jobs automate Stella tasks on a schedule.</p>
                        </div>
                    ) : (
                        <div className="stella__cron-list">
                            {cronJobs.map(job => (
                                <div key={job.id} className={`stella__cron-card ${!job.enabled ? 'stella__cron-card--paused' : ''}`}>
                                    <div className="stella__cron-card-header">
                                        <strong>{job.name}</strong>
                                        <span className={`stella__cron-badge ${job.enabled ? 'stella__cron-badge--active' : 'stella__cron-badge--paused'}`}>
                                            {job.enabled ? '● Active' : '○ Paused'}
                                        </span>
                                    </div>
                                    {job.schedule && <div className="stella__cron-schedule">{job.schedule.cron} ({job.schedule.timezone || 'UTC'})</div>}
                                    <div className="stella__cron-actions">
                                        <button className="stella__btn-sm" onClick={async () => {
                                            await fetch(`${API_BASE}/cron/jobs/${job.id}/${job.enabled ? 'pause' : 'resume'}`, { method: 'POST', headers: getAuthHeaders() });
                                            await loadCronJobs();
                                        }} disabled={!permissions?.canManageAutomation}>{job.enabled ? 'Pause' : '▶️ Resume'}</button>
                                        <button className="stella__btn-sm" onClick={async () => {
                                            await fetch(`${API_BASE}/cron/jobs/${job.id}/run`, { method: 'POST', headers: getAuthHeaders() });
                                        }} disabled={!permissions?.canManageAutomation}>▶▶ Run Now</button>
                                        <button className="stella__btn-sm stella__btn-sm--danger" aria-label="Delete job" onClick={async () => {
                                            if (!confirm(`Delete job "${job.name}"?`)) return;
                                            await fetch(`${API_BASE}/cron/jobs/${job.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                                            await loadCronJobs();
                                        }} disabled={!permissions?.canDeleteCron}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <button className="stella__btn-primary" onClick={loadCronJobs}>Refresh</button>
                </div>
            )}

            {/* MCP Servers Tab (Phase 2.3) */}
            {tab === 'mcp' && (
                <div className="stella__panel stella__mcp">
                    <h4 className="stella__panel-title">MCP Servers
                        {permissions && !permissions.canManageMCP && (
                            <span className="stella__rbac-badge" title="Read-only: admin role required">View Only</span>
                        )}
                    </h4>
                    {mcpLoading ? (
                        <div className="stella__loading">Loading MCP servers…</div>
                    ) : mcpServers.length === 0 ? (
                        <div className="stella__empty">
                            <div className="stella__empty-icon"></div>
                            <p>No MCP servers configured.</p>
                            <p className="stella__empty-hint">MCP servers extend Stella with external tools and data sources.</p>
                        </div>
                    ) : (
                        <div className="stella__mcp-list">
                            {mcpServers.map(srv => (
                                <div key={srv.key} className="stella__mcp-card">
                                    <div className="stella__mcp-card-header">
                                        <strong>{srv.name}</strong>
                                        <span className={`stella__mcp-badge ${srv.enabled ? 'stella__mcp-badge--on' : 'stella__mcp-badge--off'}`}>
                                            {srv.enabled ? '● On' : '○ Off'}
                                        </span>
                                    </div>
                                    <div className="stella__mcp-transport">
                                        {srv.transport}{srv.url ? ` → ${srv.url}` : srv.command ? ` → ${srv.command}` : ''}
                                    </div>
                                    {srv.description && <div className="stella__mcp-desc">{srv.description}</div>}
                                    <div className="stella__mcp-actions">
                                        <button className="stella__btn-sm" onClick={async () => {
                                            await fetch(`${API_BASE}/mcp/${encodeURIComponent(srv.key)}/toggle`, { method: 'PATCH', headers: getAuthHeaders() });
                                            await loadMcpServers();
                                        }} disabled={!permissions?.canManageMCP}>{srv.enabled ? 'Disable' : '▶️ Enable'}</button>
                                        <button className="stella__btn-sm stella__btn-sm--danger" aria-label="Delete MCP server" onClick={async () => {
                                            if (!confirm(`Delete MCP server "${srv.name}"?`)) return;
                                            await fetch(`${API_BASE}/mcp/${encodeURIComponent(srv.key)}`, { method: 'DELETE', headers: getAuthHeaders() });
                                            await loadMcpServers();
                                        }} disabled={!permissions?.canManageMCP}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <button className="stella__btn-primary" onClick={loadMcpServers}>Refresh</button>
                </div>
            )}

            {/* Settings Tab */}
            {tab === 'settings' && (
                <div className="stella__panel stella__settings">
                    <h4 className="stella__settings-title">Stella Configuration</h4>

                    <div className="stella__settings-group">
                        <label className="stella__settings-label">LLM Provider</label>
                        <select
                            className="stella__settings-select"
                            value={provider}
                            onChange={e => setProvider(e.target.value)}
                        >
                            {PROVIDERS.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="stella__settings-group">
                        <label className="stella__settings-label">Model</label>
                        <select
                            className="stella__settings-select"
                            value={model}
                            onChange={e => setModel(e.target.value)}
                        >
                            {(PROVIDERS.find(p => p.id === provider)?.models || []).map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        className="stella__settings-btn stella__settings-btn--primary"
                        onClick={async () => {
                            try {
                                await fetch(`${API_BASE}/provider`, {
                                    method: 'PUT',
                                    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                                    body: JSON.stringify({ provider, model }),
                                });
                                await checkStatus();
                            } catch { }
                        }}
                    >
                        Apply Provider
                    </button>

                    <hr className="stella__settings-divider" />

                    <h4 className="stella__settings-title">Lifecycle</h4>
                    <div className="stella__settings-actions">
                        <button
                            className="stella__settings-btn"
                            onClick={async () => {
                                setInitLoading(true);
                                try {
                                    await fetch(`${API_BASE}/init`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ provider, model }) });
                                    await checkStatus();
                                } catch { } finally { setInitLoading(false); }
                            }}
                            disabled={initLoading}
                        >
                            {initLoading ? 'Initializing...' : 'Initialize'}
                        </button>
                        <button
                            className="stella__settings-btn stella__settings-btn--danger"
                            onClick={async () => {
                                try {
                                    await fetch(`${API_BASE}/cleanup`, { method: 'POST', headers: getAuthHeaders() });
                                    await checkStatus();
                                } catch { }
                            }}
                        >
                            Port Cleanup
                        </button>
                        <button
                            className="stella__settings-btn"
                            onClick={async () => {
                                const result = await fetch(`${API_BASE}/health`, { headers: getAuthHeaders() }).then(r => r.json());
                                if (result.data?.ok) {
                                    setHealthMs(result.data.ms);
                                    setStatus('online');
                                } else {
                                    setStatus('offline');
                                }
                            }}
                        >
                            Health Ping
                        </button>
                    </div>

                    {/* Phase 3.4: Dwellium Bootstrap (admin+) */}
                    {permissions?.canBootstrap && (
                        <>
                            <hr className="stella__settings-divider" />
                            <h4 className="stella__settings-title">Dwellium Integration</h4>
                            <p className="stella__settings-hint">Sync Dwellium property data into Stella's memory for property-aware AI responses.</p>
                            <div className="stella__settings-actions">
                                <button
                                    className="stella__settings-btn stella__settings-btn--primary"
                                    onClick={async () => {
                                        setBootstrapLoading(true);
                                        setBootstrapResult(null); setBootstrapOk(false);
                                        try {
                                            const resp = await fetch(`${API_BASE}/bootstrap`, { method: 'POST', headers: getAuthHeaders() });
                                            const data = await resp.json();
                                            if (data.success) {
                                                setBootstrapResult(`Bootstrapped: ${data.data.propertiesLoaded} properties, ${data.data.unitsLoaded} units loaded`); setBootstrapOk(true);
                                            } else {
                                                setBootstrapResult(`${data.error}`);
                                            }
                                        } catch (err) {
                                            setBootstrapResult('Bootstrap failed — is Stella running?');
                                        } finally {
                                            setBootstrapLoading(false);
                                        }
                                    }}
                                    disabled={bootstrapLoading || status !== 'online'}
                                >
                                    {bootstrapLoading ? 'Syncing…' : 'Bootstrap Dwellium Context'}
                                </button>
                            </div>
                            {bootstrapResult && (
                                <div className={`stella__bootstrap-result ${bootstrapOk ? 'stella__bootstrap-result--ok' : 'stella__bootstrap-result--err'}`}>
                                    {bootstrapResult}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Telegram Integration ── */}
                    <hr className="stella__settings-divider" />
                    <h4 className="stella__settings-title">Telegram Integration</h4>
                    <p className="stella__settings-hint">Connect a Telegram bot so Stella can receive and reply to messages from Telegram.</p>

                    {/* Connection Status Badge */}
                    {tgStatus && (
                        <div className={`stella__tg-badge ${tgStatus.connected ? 'stella__tg-badge--connected' : 'stella__tg-badge--offline'}`}>
                            {tgStatus.connected ? (
                                <>@{tgStatus.bot?.username} connected{tgStatus.webhook?.configured ? ` · webhook active` : ' · no webhook'}</>
                            ) : (
                                <>Not connected{tgStatus.error ? `: ${tgStatus.error}` : ''}</>
                            )}
                        </div>
                    )}
                    {!tgStatus && (
                        <button className="stella__settings-btn" onClick={loadTgStatus}>Check Status</button>
                    )}

                    {/* Bot Token */}
                    <div className="stella__settings-group">
                        <label className="stella__settings-label">Bot Token</label>
                        <input
                            className="stella__settings-input"
                            type="password"
                            value={tgBotToken}
                            onChange={e => setTgBotToken(e.target.value)}
                            placeholder="1234567890:ABCdef…  (from @BotFather)"
                        />
                    </div>

                    {/* Webhook URL */}
                    <div className="stella__settings-group">
                        <label className="stella__settings-label">Public Webhook URL</label>
                        <input
                            className="stella__settings-input"
                            type="url"
                            value={tgWebhookUrl}
                            onChange={e => setTgWebhookUrl(e.target.value)}
                            placeholder="https://your-domain.com/api/v1/telegram/webhook"
                        />
                        <small className="stella__settings-hint" style={{ marginTop: 4 }}>Must be a public HTTPS URL. Use ngrok or a VPS if running locally.</small>
                    </div>

                    {/* Action Buttons */}
                    <div className="stella__settings-actions">
                        <button
                            className="stella__settings-btn stella__settings-btn--primary"
                            onClick={saveTgConfig}
                            disabled={tgLoading}
                        >
                            {tgLoading ? '…' : 'Save & Verify Token'}
                        </button>
                        {tgStatus?.connected && (
                            <>
                                <button
                                    className="stella__settings-btn"
                                    onClick={connectTgWebhook}
                                    disabled={tgLoading || !tgWebhookUrl}
                                >
                                    {tgLoading ? '…' : 'Register Webhook'}
                                </button>
                                <button
                                    className="stella__settings-btn stella__settings-btn--danger"
                                    onClick={disconnectTg}
                                    disabled={tgLoading}
                                >
                                    Disconnect
                                </button>
                            </>
                        )}
                    </div>

                    {/* Test Message */}
                    {tgStatus?.connected && (
                        <div className="stella__settings-group" style={{ marginTop: 8 }}>
                            <label className="stella__settings-label">Test Message → Chat ID</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    className="stella__settings-input"
                                    value={tgTestChatId}
                                    onChange={e => setTgTestChatId(e.target.value)}
                                    placeholder="e.g. 123456789  (send /start to your bot first)"
                                    style={{ flex: 1 }}
                                />
                                <button
                                    className="stella__settings-btn"
                                    onClick={sendTgTest}
                                    disabled={tgLoading}
                                >
                                    Send Test
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Status message */}
                    {tgSaveMsg && (
                        <div className={`stella__tg-toast ${!/error|fail|required|enter a/i.test(tgSaveMsg) ? 'stella__tg-toast--ok' : 'stella__tg-toast--err'}`}>
                            {tgSaveMsg}
                        </div>
                    )}

                    {/* Message Log */}
                    {tgStatus?.connected && (
                        <div style={{ marginTop: 8 }}>
                            <button
                                className="stella__settings-btn"
                                onClick={async () => { setTgShowLogs(!tgShowLogs); if (!tgShowLogs) await loadTgLogs(); }}
                            >
                                {tgShowLogs ? '▲ Hide' : 'View'} Message Log
                            </button>
                            {tgShowLogs && (
                                <div className="stella__tg-log">
                                    {tgLogs.length === 0 ? (
                                        <div className="stella__tg-log-empty">No messages yet. Send a message to your bot on Telegram.</div>
                                    ) : (
                                        tgLogs.map((entry, i) => (
                                            <div key={i} className={`stella__tg-log-row stella__tg-log-row--${entry.direction}`}>
                                                <span className="stella__tg-log-dir">{entry.direction === 'in' ? '' : ''}</span>
                                                <span className="stella__tg-log-user">@{entry.username}</span>
                                                <span className="stella__tg-log-text">{entry.message_text}</span>
                                                <span className="stella__tg-log-time">{new Date(entry.created_at).toLocaleTimeString()}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Setup Guide */}
                    <details className="stella__tg-guide">
                        <summary>Setup Guide</summary>
                        <ol className="stella__tg-guide-list">
                            <li>Open Telegram → search for <strong>@BotFather</strong></li>
                            <li>Send <code>/newbot</code> → follow prompts → copy your <strong>Bot Token</strong></li>
                            <li>Paste the token above → click <strong>Save & Verify Token</strong></li>
                            <li>Enter your public HTTPS URL (e.g. <code>https://yourserver.com/api/v1/telegram/webhook</code>)</li>
                            <li>Click <strong>Register Webhook</strong></li>
                            <li>Open your bot in Telegram → send <code>/start</code></li>
                            <li>Copy your Chat ID from the test field → click <strong>Send Test</strong></li>
                        </ol>
                    </details>

                    {/* Status Details */}
                    <div className="stella__settings-status">
                        <div>Status: <strong>{status}</strong></div>
                        {healthMs !== null && <div>Latency: <strong>{healthMs}ms</strong></div>}
                        {pid && <div>PID: <strong>{pid}</strong></div>}
                        {version && <div>Version: <strong>{version}</strong></div>}
                        <div>Provider: <strong>{provider} / {model}</strong></div>
                        {permissions && <div>Role: <strong>{permissions.role}</strong></div>}
                        {permissions?.properties?.length ? <div>Properties: <strong>{permissions.properties.length}</strong></div> : null}
                        {circuitState && (
                            <div>
                                Circuit: <strong className={circuitState === 'CLOSED' ? 'stella__circuit-ok' : 'stella__circuit-warn'}>{circuitState}</strong>
                                {circuitState === 'OPEN' && permissions?.canBootstrap && (
                                    <button className="stella__btn-sm" style={{marginLeft: 8}} onClick={async () => {
                                        await fetch(`${API_BASE}/circuit/reset`, { method: 'POST', headers: getAuthHeaders() });
                                        await loadCircuitState();
                                    }}>Reset</button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
