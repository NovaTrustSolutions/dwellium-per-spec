/**
 * personaEngine — PURE helpers for the Dwellium Persona Studio (Anam-lab-style
 * conversational assistant shared by ARA/Aura + Stella).
 *
 * Everything here is DOM-free and injectable so it unit-tests without a
 * browser (mirrors stellaHermesSpawn / araLinkage discipline):
 *   - buildPersonaSystemPrompt: composes the call-time system prompt from the
 *     persona config (prompt / style / expressivity / cues / knowledge) + the
 *     tool protocol + the live Dwellium widget catalog.
 *   - parseAssistantReply: extracts an optional TOOL:{...} directive and
 *     [bracketed] performance cues from a raw LLM reply, returning clean
 *     speakable text.
 *   - pickIdleNudge: the "Are you there?" idle-nudge rotation observed on the
 *     reference Anam persona (2026-07-05 recording).
 *
 * 2026-07-05 created (Persona Studio arc).
 */

// ── Config types ──────────────────────────────────────────────────────

import { defaultFaceRegions, type FaceRegions } from './personaFaceEngine';

export type PersonaStyle =
    | 'neutral'
    | 'cheerful'
    | 'professional'
    | 'empathetic'
    | 'energetic'
    | 'calm';

export interface PersonaToolsConfig {
    endCall: boolean;
    skipTurn: boolean;
    changeLanguage: boolean;
    openWidget: boolean;
    hermes: boolean;
}

/**
 * User-defined HTTP tool exposed to the persona through the same TOOL:{...}
 * protocol as the built-ins. The persona supplies free-form JSON args; the
 * caller performs the actual fetch against `url`.
 */
export interface PersonaCustomTool {
    id: string;
    name: string;        // e.g. "check_weather" — lowercase snake_case enforced by UI
    description: string;
    method: 'GET' | 'POST';
    url: string;
}

export interface PersonaConfig {
    /** Persona display name (default "Liv" — mirrors the reference persona). */
    name: string;
    systemPrompt: string;
    useDefaultPrompt: boolean;
    /** Exact opening line. Empty → persona generates its own greeting. */
    greeting: string;
    skipGreeting: boolean;
    /** When true, user speech/text interrupts the persona mid-reply. */
    interruptible: boolean;
    style: PersonaStyle;
    /** 0..1 — how animated the persona's delivery is. */
    expressivity: number;
    /** Include inline [performance cues] in replies (shown, never spoken). */
    addCues: boolean;
    /** Free-text knowledge the persona should treat as ground truth. */
    knowledge: string;
    /** Visualizer theme id acting as the persona's "avatar" look. */
    avatarThemeId: string;
    /** 'photo' = user's own portrait with lip-sync; 'viz' = live visual. */
    avatarMode: 'viz' | 'photo';
    /** Portrait data-URL (user-owned image; downscaled before storing). */
    faceImage: string;
    /** Eye/mouth placement on the portrait (fractions of image size). */
    faceRegions: FaceRegions;
    /** Voice id from PERSONA_VOICE_CATALOG. */
    voiceId: string;
    /** Speech speed multiplier (0.5–2.0). */
    speechRate: number;
    /** Model override applied when the active integrations provider is OpenAI. */
    modelOverride: string;
    tools: PersonaToolsConfig;
    /** User-defined HTTP tools appended to the TOOL protocol list. */
    customTools: PersonaCustomTool[];
    /** When true, the persona never calls the LLM (caller picks the fallback). */
    llmDisabled: boolean;
}

export const DEFAULT_PERSONA_SYSTEM_PROMPT =
    'You are a helpful, concise, and reliable assistant for Dwellium, a property-management workspace. ' +
    'You are approachable, professional, and focused on providing accurate information in a friendly manner.';

export function defaultPersonaConfig(): PersonaConfig {
    return {
        name: 'Liv',
        systemPrompt: DEFAULT_PERSONA_SYSTEM_PROMPT,
        useDefaultPrompt: true,
        greeting: '',
        skipGreeting: false,
        interruptible: true,
        style: 'neutral',
        expressivity: 0.5,
        addCues: false,
        knowledge: '',
        avatarThemeId: 'galaxy',
        avatarMode: 'viz',
        faceImage: '',
        faceRegions: defaultFaceRegions(),
        voiceId: 'browser-samantha',
        speechRate: 1,
        modelOverride: 'gpt-4.1-mini',
        tools: { endCall: true, skipTurn: true, changeLanguage: true, openWidget: true, hermes: true },
        customTools: [],
        llmDisabled: false,
    };
}

// ── Style + voice catalogs ────────────────────────────────────────────

export const PERSONA_STYLE_OPTIONS: { id: PersonaStyle; label: string; directive: string }[] = [
    { id: 'neutral',      label: 'Neutral',      directive: 'Keep a balanced, natural tone.' },
    { id: 'cheerful',     label: 'Cheerful',     directive: 'Sound upbeat and warm; smile through your words.' },
    { id: 'professional', label: 'Professional', directive: 'Sound composed, precise, and businesslike.' },
    { id: 'empathetic',   label: 'Empathetic',   directive: 'Sound caring and validating; acknowledge feelings first.' },
    { id: 'energetic',    label: 'Energetic',    directive: 'Sound lively and enthusiastic, with momentum.' },
    { id: 'calm',         label: 'Calm',         directive: 'Sound unhurried and soothing; soften your phrasing.' },
];

export interface PersonaVoiceOption {
    id: string;
    label: string;
    description: string;
    provider: 'openai' | 'browser' | 'kokoro';
    openaiVoice?: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer';
    browserVoiceMatch?: string[];
    /** kokoro-js voice id (e.g. 'af_heart') for the on-device neural tier. */
    kokoroVoice?: string;
}

/**
 * Three-tier catalog: free browser voices always, free on-device neural
 * voices (Kokoro-82M, ~90 MB one-time download), OpenAI TTS when a key exists.
 */
export const PERSONA_VOICE_CATALOG: PersonaVoiceOption[] = [
    { id: 'browser-samantha', label: 'Samantha', description: 'Apple — Siri-quality female (free)', provider: 'browser', browserVoiceMatch: ['Samantha (Enhanced)', 'Samantha'] },
    { id: 'browser-karen',    label: 'Karen',    description: 'Apple — Australian female (free)',   provider: 'browser', browserVoiceMatch: ['Karen (Enhanced)', 'Karen'] },
    { id: 'browser-daniel',   label: 'Daniel',   description: 'Apple — calm British male (free)',   provider: 'browser', browserVoiceMatch: ['Daniel (Enhanced)', 'Daniel'] },
    { id: 'browser-system',   label: 'System',   description: 'Your OS default voice (free)',       provider: 'browser' },
    { id: 'kokoro-heart',     label: 'Heart',    description: 'Neural — warm US female (free, on-device)',        provider: 'kokoro', kokoroVoice: 'af_heart' },
    { id: 'kokoro-bella',     label: 'Bella',    description: 'Neural — bright US female (free, on-device)',      provider: 'kokoro', kokoroVoice: 'af_bella' },
    { id: 'kokoro-nicole',    label: 'Nicole',   description: 'Neural — soft-spoken US female (free, on-device)', provider: 'kokoro', kokoroVoice: 'af_nicole' },
    { id: 'kokoro-michael',   label: 'Michael',  description: 'Neural — steady US male (free, on-device)',        provider: 'kokoro', kokoroVoice: 'am_michael' },
    { id: 'kokoro-puck',      label: 'Puck',     description: 'Neural — playful US male (free, on-device)',       provider: 'kokoro', kokoroVoice: 'am_puck' },
    { id: 'kokoro-fenrir',    label: 'Fenrir',   description: 'Neural — deep US male (free, on-device)',          provider: 'kokoro', kokoroVoice: 'am_fenrir' },
    { id: 'kokoro-emma',      label: 'Emma',     description: 'Neural — British female (free, on-device)',        provider: 'kokoro', kokoroVoice: 'bf_emma' },
    { id: 'kokoro-george',    label: 'George',   description: 'Neural — British male (free, on-device)',          provider: 'kokoro', kokoroVoice: 'bm_george' },
    { id: 'openai-nova',      label: 'Nova',     description: 'OpenAI — bright, friendly female',   provider: 'openai', openaiVoice: 'nova' },
    { id: 'openai-shimmer',   label: 'Shimmer',  description: 'OpenAI — soft, breathy female',      provider: 'openai', openaiVoice: 'shimmer' },
    { id: 'openai-alloy',     label: 'Alloy',    description: 'OpenAI — warm, neutral',             provider: 'openai', openaiVoice: 'alloy' },
    { id: 'openai-echo',      label: 'Echo',     description: 'OpenAI — calm male',                 provider: 'openai', openaiVoice: 'echo' },
    { id: 'openai-fable',     label: 'Fable',    description: 'OpenAI — expressive storyteller',    provider: 'openai', openaiVoice: 'fable' },
    { id: 'openai-onyx',      label: 'Onyx',     description: 'OpenAI — deep male',                 provider: 'openai', openaiVoice: 'onyx' },
];

export function getVoiceOption(id: string): PersonaVoiceOption {
    return PERSONA_VOICE_CATALOG.find(v => v.id === id) ?? PERSONA_VOICE_CATALOG[0];
}

// ── System-prompt composition ─────────────────────────────────────────

export interface WidgetCatalogEntry { id: string; label: string }

export interface BuildPromptOptions {
    host: 'ara' | 'stella';
    widgetCatalog: WidgetCatalogEntry[];
    userName?: string | null;
}

function expressivityDirective(x: number): string {
    if (x < 0.34) return 'Delivery: measured and even. Short sentences, minimal exclamation.';
    if (x < 0.67) return 'Delivery: naturally expressive. Vary rhythm; react genuinely but stay grounded.';
    return 'Delivery: highly animated. React vividly, use emphasis and exclamations where natural.';
}

/**
 * Compose the call-time system prompt. Pure — widget catalog + user name are
 * injected so this composes identically in tests and at runtime.
 */
export function buildPersonaSystemPrompt(config: PersonaConfig, opts: BuildPromptOptions): string {
    const sections: string[] = [];

    sections.push(
        `You are "${config.name}", a real-time voice assistant embedded in the Dwellium property-management app` +
        ` (currently hosted inside the ${opts.host === 'ara' ? 'ARA console' : 'Stella agent'}).` +
        (opts.userName ? ` You are speaking with ${opts.userName}.` : ''),
    );

    sections.push(config.useDefaultPrompt ? DEFAULT_PERSONA_SYSTEM_PROMPT : (config.systemPrompt || DEFAULT_PERSONA_SYSTEM_PROMPT));

    if (config.knowledge.trim()) {
        sections.push(`KNOWLEDGE (treat as ground truth):\n${config.knowledge.trim()}`);
    }

    const style = PERSONA_STYLE_OPTIONS.find(s => s.id === config.style) ?? PERSONA_STYLE_OPTIONS[0];
    sections.push(`STYLE: ${style.directive} ${expressivityDirective(config.expressivity)}`);

    sections.push(
        'VOICE-CALL RULES: This is a live spoken conversation. Answer in 1–3 conversational sentences. ' +
        'Never use markdown, headings, bullet points, or emoji. Ask a short clarifying question when the request is ambiguous. ' +
        'If the user goes quiet mid-task, you may briefly check in.',
    );

    if (config.addCues) {
        sections.push(
            'PERFORMANCE CUES: Weave short bracketed stage cues into replies where natural, e.g. [smiles], [nods], [thoughtful pause]. ' +
            'Cues are displayed to the user but never spoken.',
        );
    }

    const enabled: string[] = [];
    if (config.tools.endCall) enabled.push('end_call {} — end the call when the user asks to stop or says goodbye.');
    if (config.tools.skipTurn) enabled.push('skip_turn {} — stay quiet and wait when the user asks for a moment.');
    if (config.tools.changeLanguage) enabled.push('change_language {"lang":"<BCP-47 code, e.g. es-ES>"} — switch the conversation language on request.');
    if (config.tools.openWidget) enabled.push('open_widget {"widgetId":"<id from WIDGETS>"} — open a Dwellium widget for the user.');
    if (config.tools.hermes) enabled.push('hermes {"task":"<task text>"} — delegate a multi-step research/ops task to the Hermes agent.');
    for (const tool of config.customTools) {
        enabled.push(`${tool.name} {"...free-form args"} — ${tool.description} (calls the user's API)`);
    }

    if (enabled.length > 0) {
        sections.push(
            'TOOLS: To call a tool, put a single line anywhere in your reply of the exact form ' +
            'TOOL:{"name":"<tool>","args":{...}} — at most one tool per reply. Available tools:\n- ' +
            enabled.join('\n- '),
        );
    }

    if (config.tools.openWidget && opts.widgetCatalog.length > 0) {
        sections.push(
            'WIDGETS (id — label):\n' +
            opts.widgetCatalog.map(w => `${w.id} — ${w.label}`).join('\n'),
        );
    }

    return sections.join('\n\n');
}

// ── Reply parsing ─────────────────────────────────────────────────────

export interface ParsedToolCall {
    name: string;
    args: Record<string, unknown>;
}

export interface ParsedAssistantReply {
    /** Clean text safe to speak + display (tool line and cues removed). */
    speech: string;
    /** Text for display: cues kept inline (Anam "add cues" behavior). */
    display: string;
    tool: ParsedToolCall | null;
    cues: string[];
}

const TOOL_LINE_RE = /^\s*TOOL:\s*(\{.*\})\s*$/m;
const CUE_RE = /\[([^\][\n]{1,40})\]/g;

/**
 * Parse a raw LLM reply: extract the (optional) TOOL directive and bracketed
 * cues. Malformed tool JSON is ignored gracefully (treated as plain text).
 */
export function parseAssistantReply(raw: string): ParsedAssistantReply {
    let text = raw ?? '';
    let tool: ParsedToolCall | null = null;

    const m = TOOL_LINE_RE.exec(text);
    if (m) {
        try {
            const parsed = JSON.parse(m[1]);
            if (parsed && typeof parsed.name === 'string') {
                tool = { name: parsed.name, args: (parsed.args && typeof parsed.args === 'object') ? parsed.args : {} };
                text = text.replace(m[0], '').trim();
            }
        } catch {
            // Malformed JSON — leave the line in place as plain text.
        }
    }

    const cues: string[] = [];
    const display = text.trim();
    const speech = display.replace(CUE_RE, (_all, cue: string) => {
        cues.push(cue.trim());
        return '';
    }).replace(/\s{2,}/g, ' ').trim();

    return { speech, display, tool, cues };
}

// ── Idle nudges (observed on the reference persona) ───────────────────

export const IDLE_NUDGES = [
    'Are you there? Feel free to say anything.',
    "Okay, I'll wait.",
    "Take your time — I'm here when you're ready.",
] as const;

export function pickIdleNudge(nudgeCount: number): string {
    return IDLE_NUDGES[Math.min(nudgeCount, IDLE_NUDGES.length - 1)];
}

// ── Speech hygiene ────────────────────────────────────────────────────

/** Strip markdown remnants so TTS never reads asterisks or pound signs. */
export function stripForSpeech(text: string): string {
    return (text ?? '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^[-•]\s/gm, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, '. ')
        .trim();
}

// ── Streaming sentence drain ──────────────────────────────────────────

/** Quotes/parens that belong to the sentence they close (kept with the terminator). */
const SENTENCE_TRAILERS = new Set(['"', "'", '’', '”', ')', ']']);

/** Common abbreviations whose trailing period never ends a sentence. */
const SPEECH_ABBREVIATIONS = ['Mr.', 'Mrs.', 'Dr.', 'St.', 'vs.', 'e.g.', 'i.e.'];

/** True when the '.' at dotIndex sits between two digits (e.g. "1.5"). */
function isDecimalPoint(buffer: string, dotIndex: number): boolean {
    return /\d/.test(buffer[dotIndex - 1] ?? '') && /\d/.test(buffer[dotIndex + 1] ?? '');
}

/** True when the text ending at dotIndex is a known abbreviation ("Dr.", "e.g."). */
function isAbbreviationAt(buffer: string, dotIndex: number): boolean {
    for (const abbr of SPEECH_ABBREVIATIONS) {
        const from = dotIndex + 1 - abbr.length;
        if (from < 0) continue;
        if (buffer.slice(from, dotIndex + 1) !== abbr) continue;
        const before = from === 0 ? '' : buffer[from - 1];
        if (before === '' || !/[A-Za-z0-9]/.test(before)) return true;
    }
    return false;
}

/**
 * Split completed sentences off the front of a streaming text buffer so TTS
 * can start speaking before the LLM reply finishes. A sentence ends at
 * `.` `!` `?` `:` or newline — terminator kept, plus any immediately-following
 * quotes/parens — when followed by whitespace. Decimal points ("1.5") and the
 * SPEECH_ABBREVIATIONS list never split. Lines starting with "TOOL:" are
 * emitted whole (their own sentence) so the caller can filter them from
 * speech. Anything unconfirmed stays in `rest`; callers prepend `rest` to the
 * next stream chunk and drain again. Pure.
 */
export function drainSentences(buffer: string): { sentences: string[]; rest: string } {
    const sentences: string[] = [];
    let start = 0;

    /** Emit [start, endExclusive) trimmed, then advance past inter-sentence whitespace. */
    const emit = (endExclusive: number, nextStart: number) => {
        const trimmed = buffer.slice(start, endExclusive).trim();
        if (trimmed) sentences.push(trimmed);
        start = nextStart;
        while (start < buffer.length && /\s/.test(buffer[start])) start += 1;
    };

    let i = 0;
    while (i < buffer.length) {
        // TOOL: lines are drained whole so callers can filter them from speech.
        if (i === start && buffer.slice(start).trimStart().startsWith('TOOL:')) {
            const nl = buffer.indexOf('\n', start);
            if (nl === -1) break;                       // incomplete tool line → rest
            emit(nl, nl + 1);
            i = start;
            continue;
        }
        const ch = buffer[i];
        if (ch === '\n') {
            emit(i, i + 1);
            i = start;
            continue;
        }
        if (ch === '.' || ch === '!' || ch === '?' || ch === ':') {
            if (ch === '.' && (isDecimalPoint(buffer, i) || isAbbreviationAt(buffer, i))) {
                i += 1;
                continue;
            }
            let end = i + 1;
            while (end < buffer.length && SENTENCE_TRAILERS.has(buffer[end])) end += 1;
            if (end >= buffer.length) break;            // boundary unconfirmed until more text arrives
            if (!/\s/.test(buffer[end])) { i = end; continue; }
            emit(end, end);
            i = start;
            continue;
        }
        i += 1;
    }

    return { sentences, rest: buffer.slice(start) };
}
