/**
 * Persona Studio engine tests — pure helpers (no DOM, no fetch).
 *
 * Covers: system-prompt composition (tool protocol gating, style/expressivity
 * directives, knowledge injection), TOOL:{...} + [cue] reply parsing, idle
 * nudge rotation, and the per-user persona config store (dynamic-key factory;
 * `.reset()` called in beforeEach per the v2.72.1 standing convention).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildPersonaSystemPrompt,
    defaultPersonaConfig,
    drainSentences,
    parseAssistantReply,
    pickIdleNudge,
    stripForSpeech,
    getVoiceOption,
    IDLE_NUDGES,
    DEFAULT_PERSONA_SYSTEM_PROMPT,
    PERSONA_VOICE_CATALOG,
    type PersonaConfig,
    type PersonaCustomTool,
} from '../components/PersonaStudio/personaEngine';
import { personaConfigStore, personaUserIdHolder } from '../components/PersonaStudio/personaConfigStore';
import { resampleTo16k } from '../components/PersonaStudio/personaWhisperStt';
import { extractAnthropicDelta, extractOpenAiCompatDelta } from '../components/PersonaStudio/personaStream';
import { decodePersonaShare, encodePersonaShare, mergePersonaImport } from '../components/PersonaStudio/personaShare';

const WIDGETS = [
    { id: 'inbox', label: 'Inbox Zero' },
    { id: 'stella-agent', label: 'Stella Agent' },
];

function cfg(partial: Partial<PersonaConfig> = {}): PersonaConfig {
    return { ...defaultPersonaConfig(), ...partial };
}

beforeEach(() => {
    personaConfigStore.reset();
    personaUserIdHolder.current = null;
    localStorage.clear();
});

describe('buildPersonaSystemPrompt', () => {
    it('uses the default prompt when useDefaultPrompt is on, custom otherwise', () => {
        const withDefault = buildPersonaSystemPrompt(cfg({ systemPrompt: 'CUSTOM', useDefaultPrompt: true }), { host: 'ara', widgetCatalog: [] });
        expect(withDefault).toContain(DEFAULT_PERSONA_SYSTEM_PROMPT);
        expect(withDefault).not.toContain('CUSTOM');

        const withCustom = buildPersonaSystemPrompt(cfg({ systemPrompt: 'CUSTOM', useDefaultPrompt: false }), { host: 'ara', widgetCatalog: [] });
        expect(withCustom).toContain('CUSTOM');
    });

    it('lists only enabled tools and gates the widget catalog on open_widget', () => {
        const allOff = buildPersonaSystemPrompt(
            cfg({ tools: { endCall: false, skipTurn: false, changeLanguage: false, openWidget: false, hermes: false } }),
            { host: 'stella', widgetCatalog: WIDGETS },
        );
        expect(allOff).not.toContain('TOOL:');
        expect(allOff).not.toContain('inbox — Inbox Zero');

        const some = buildPersonaSystemPrompt(
            cfg({ tools: { endCall: true, skipTurn: false, changeLanguage: false, openWidget: true, hermes: false } }),
            { host: 'stella', widgetCatalog: WIDGETS },
        );
        expect(some).toContain('end_call');
        expect(some).toContain('open_widget');
        expect(some).not.toContain('skip_turn');
        expect(some).not.toContain('change_language');
        expect(some).toContain('inbox — Inbox Zero');
    });

    it('injects knowledge, cue instructions, and expressivity band', () => {
        const p = buildPersonaSystemPrompt(
            cfg({ knowledge: 'Rent is due on the 1st.', addCues: true, expressivity: 0.9 }),
            { host: 'ara', widgetCatalog: [], userName: 'Andy' },
        );
        expect(p).toContain('Rent is due on the 1st.');
        expect(p).toContain('PERFORMANCE CUES');
        expect(p).toContain('highly animated');
        expect(p).toContain('Andy');
    });
});

describe('parseAssistantReply', () => {
    it('extracts a TOOL directive and strips it from speech', () => {
        const parsed = parseAssistantReply('Sure, opening your inbox now.\nTOOL:{"name":"open_widget","args":{"widgetId":"inbox"}}');
        expect(parsed.tool).toEqual({ name: 'open_widget', args: { widgetId: 'inbox' } });
        expect(parsed.speech).toBe('Sure, opening your inbox now.');
        expect(parsed.display).not.toContain('TOOL:');
    });

    it('treats malformed tool JSON as plain text', () => {
        const parsed = parseAssistantReply('TOOL:{not json}');
        expect(parsed.tool).toBeNull();
        expect(parsed.display).toContain('TOOL:');
    });

    it('collects [cues] for display but removes them from speech', () => {
        const parsed = parseAssistantReply('[smiles] Great news! [thoughtful pause] Rates dropped.');
        expect(parsed.cues).toEqual(['smiles', 'thoughtful pause']);
        expect(parsed.speech).toBe('Great news! Rates dropped.');
        expect(parsed.display).toContain('[smiles]');
    });

    it('handles replies with no tool and no cues', () => {
        const parsed = parseAssistantReply('Hello! What would you like to talk about today?');
        expect(parsed.tool).toBeNull();
        expect(parsed.cues).toEqual([]);
        expect(parsed.speech).toBe('Hello! What would you like to talk about today?');
    });
});

describe('pickIdleNudge', () => {
    it('walks the nudge rotation and clamps at the last entry', () => {
        expect(pickIdleNudge(0)).toBe(IDLE_NUDGES[0]);
        expect(pickIdleNudge(1)).toBe(IDLE_NUDGES[1]);
        expect(pickIdleNudge(99)).toBe(IDLE_NUDGES[IDLE_NUDGES.length - 1]);
    });
});

describe('stripForSpeech', () => {
    it('removes markdown artifacts so TTS never reads symbols', () => {
        expect(stripForSpeech('**Bold** and `code` and *stars*')).toBe('Bold and code and stars');
    });
});

describe('personaConfigStore (per-user dynamic key)', () => {
    it('returns defaults when nothing is stored', () => {
        const snap = personaConfigStore.getSnapshot();
        expect(snap.name).toBe('Liv');
        expect(snap.modelOverride).toBe('gpt-4.1-mini');
        expect(snap.tools.openWidget).toBe(true);
    });

    it('namespaces per user id and merges stored partials over defaults', () => {
        localStorage.setItem('persona-studio:user-andy', JSON.stringify({ name: 'Dwelly', tools: { hermes: false } }));
        personaUserIdHolder.current = 'user-andy';
        personaConfigStore.reset();
        const snap = personaConfigStore.getSnapshot();
        expect(snap.name).toBe('Dwelly');
        expect(snap.tools.hermes).toBe(false);
        // Missing keys fall back to defaults (schema-forward merge).
        expect(snap.tools.endCall).toBe(true);
        expect(snap.interruptible).toBe(true);
    });

    it('getServerSnapshot returns SSR-safe defaults', () => {
        const snap = personaConfigStore.getServerSnapshot();
        expect(snap.name).toBe('Liv');
    });
});

describe('drainSentences', () => {
    it('splits completed sentences and keeps each terminator (plus closing quotes)', () => {
        const { sentences, rest } = drainSentences('Hello there! How are you? He said "Stop." All good.\nStill typing');
        expect(sentences).toEqual(['Hello there!', 'How are you?', 'He said "Stop."', 'All good.']);
        expect(rest).toBe('Still typing');
    });

    it('does not split on decimal points inside numbers', () => {
        const { sentences, rest } = drainSentences('It costs 1.5 million today. Next.');
        expect(sentences).toEqual(['It costs 1.5 million today.']);
        expect(rest).toBe('Next.');
    });

    it('does not split common abbreviations', () => {
        const { sentences, rest } = drainSentences('Dr. Smith arrived. Then left.');
        expect(sentences).toEqual(['Dr. Smith arrived.']);
        expect(rest).toBe('Then left.');
    });

    it('keeps a trailing fragment without a terminator in rest', () => {
        const { sentences, rest } = drainSentences('Done. And then we');
        expect(sentences).toEqual(['Done.']);
        expect(rest).toBe('And then we');
    });

    it('emits a TOOL: line as its own sentence', () => {
        const { sentences, rest } = drainSentences('Okay.\nTOOL:{"name":"end_call","args":{}}\nBye. ');
        expect(sentences).toEqual(['Okay.', 'TOOL:{"name":"end_call","args":{}}', 'Bye.']);
        expect(rest).toBe('');
    });

    it('returns empty results for empty input', () => {
        expect(drainSentences('')).toEqual({ sentences: [], rest: '' });
    });
});

describe('extractOpenAiCompatDelta', () => {
    it('extracts the content delta from a data line', () => {
        expect(extractOpenAiCompatDelta('data: {"choices":[{"delta":{"content":"Hi"}}]}')).toBe('Hi');
    });

    it('returns null for [DONE], non-data lines, and malformed JSON', () => {
        expect(extractOpenAiCompatDelta('data: [DONE]')).toBeNull();
        expect(extractOpenAiCompatDelta('event: message')).toBeNull();
        expect(extractOpenAiCompatDelta(': keep-alive comment')).toBeNull();
        expect(extractOpenAiCompatDelta('data: {not json')).toBeNull();
    });
});

describe('extractAnthropicDelta', () => {
    it('extracts text from content_block_delta events', () => {
        expect(extractAnthropicDelta('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}')).toBe('Yo');
    });

    it('returns null for other event types', () => {
        expect(extractAnthropicDelta('data: {"type":"message_start","message":{}}')).toBeNull();
        expect(extractAnthropicDelta('data: {"type":"content_block_stop","index":0}')).toBeNull();
    });
});

describe('buildPersonaSystemPrompt with custom tools', () => {
    const weather: PersonaCustomTool = {
        id: 'ct-1',
        name: 'check_weather',
        description: 'Get the current weather',
        method: 'GET',
        url: 'https://api.example.com/weather',
    };

    it('appends custom tools to the TOOLS list', () => {
        const p = buildPersonaSystemPrompt(cfg({ customTools: [weather] }), { host: 'ara', widgetCatalog: [] });
        expect(p).toContain('check_weather');
        expect(p).toContain("Get the current weather (calls the user's API)");
    });

    it('shows the TOOLS section for custom tools even when all built-ins are off', () => {
        const p = buildPersonaSystemPrompt(
            cfg({
                tools: { endCall: false, skipTurn: false, changeLanguage: false, openWidget: false, hermes: false },
                customTools: [weather],
            }),
            { host: 'stella', widgetCatalog: [] },
        );
        expect(p).toContain('TOOL:');
        expect(p).toContain('check_weather');
        expect(p).not.toContain('end_call');
    });
});

describe('kokoro neural voice catalog', () => {
    // NOTE: personaNeuralTts is deliberately NOT imported here — it must stay
    // out of the vitest graph (kokoro-js loads only via dynamic import).
    it('contains exactly 8 on-device kokoro voices, each with a model voice id', () => {
        const kokoro = PERSONA_VOICE_CATALOG.filter(v => v.provider === 'kokoro');
        expect(kokoro).toHaveLength(8);
        for (const v of kokoro) {
            expect(typeof v.kokoroVoice).toBe('string');
            expect((v.kokoroVoice ?? '').length).toBeGreaterThan(0);
        }
    });

    it('maps kokoro-heart to the af_heart model voice', () => {
        expect(getVoiceOption('kokoro-heart').kokoroVoice).toBe('af_heart');
    });
});

describe('customTools + llmDisabled config plumbing', () => {
    it('defaults customTools to [] and llmDisabled to false', () => {
        const d = defaultPersonaConfig();
        expect(d.customTools).toEqual([]);
        expect(d.llmDisabled).toBe(false);
    });

    it('store deserializer preserves stored customTools and defaults them when missing', () => {
        const tools: PersonaCustomTool[] = [
            { id: 'ct-1', name: 'check_weather', description: 'Weather', method: 'GET', url: 'https://x.test' },
        ];
        localStorage.setItem('persona-studio:user-andy', JSON.stringify({ customTools: tools, llmDisabled: true }));
        personaUserIdHolder.current = 'user-andy';
        personaConfigStore.reset();
        const snap = personaConfigStore.getSnapshot();
        expect(snap.customTools).toEqual(tools);
        expect(snap.llmDisabled).toBe(true);

        // A stored blob predating the fields falls back to schema defaults.
        localStorage.setItem('persona-studio:user-lisa', JSON.stringify({ name: 'Old' }));
        personaUserIdHolder.current = 'user-lisa';
        personaConfigStore.reset();
        const lisa = personaConfigStore.getSnapshot();
        expect(lisa.customTools).toEqual([]);
        expect(lisa.llmDisabled).toBe(false);
    });
});

describe('whisper STT resampleTo16k', () => {
    // NOTE: personaWhisperStt only loads @huggingface/transformers via
    // dynamic import(), so pulling this pure helper into the vitest graph
    // is safe — the transformers runtime is never touched here.
    it('returns the input untouched when already at 16 kHz', () => {
        const input = new Float32Array([0.1, -0.2, 0.3, -0.4]);
        expect(resampleTo16k(input, 16000)).toBe(input);
    });

    it('halves the length (±1) when downsampling from 32 kHz', () => {
        const input = new Float32Array(1000).fill(0.5);
        const out = resampleTo16k(input, 32000);
        expect(Math.abs(out.length - 500)).toBeLessThanOrEqual(1);
    });

    it('preserves the rough shape of a ramp across the resample', () => {
        const input = new Float32Array(800);
        for (let i = 0; i < input.length; i++) input[i] = i / (input.length - 1);
        const out = resampleTo16k(input, 32000);
        expect(Math.abs(out[0] - input[0])).toBeLessThan(0.01);
        expect(Math.abs(out[out.length - 1] - input[input.length - 1])).toBeLessThan(0.01);
    });

    it('maps empty input to empty output', () => {
        const out = resampleTo16k(new Float32Array(0), 48000);
        expect(out.length).toBe(0);
    });
});

describe('personaShare (export / import / share code)', () => {
    it('round-trips encode → decode, including unicode in the greeting', () => {
        const original = cfg({
            name: 'Dwelly Deluxe',
            greeting: '¡Hola! 你好 — καλημέρα 👋',
            useDefaultPrompt: false,
            systemPrompt: 'You are a bilingual concierge.',
            expressivity: 0.85,
        });
        const code = encodePersonaShare(original);
        expect(typeof code).toBe('string');
        // Base64 alphabet only — safe to paste anywhere.
        expect(code).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(decodePersonaShare(code)).toEqual(original);
    });

    it('decodes garbage to null instead of throwing', () => {
        expect(decodePersonaShare('not base64 at all!!!')).toBeNull();
        expect(decodePersonaShare(btoa('{"broken json'))).toBeNull();
        // Valid base64 + valid JSON, but not persona-shaped → null.
        expect(decodePersonaShare(btoa('{"foo":1}'))).toBeNull();
        expect(decodePersonaShare('')).toBeNull();
    });

    it('merge fills missing fields from defaults and preserves nested partials', () => {
        const merged = mergePersonaImport({
            name: 'Dwelly',
            tools: { hermes: false },
            faceRegions: { leftEye: { x: 0.11, y: 0.22 } },
        });
        expect(merged).not.toBeNull();
        expect(merged!.name).toBe('Dwelly');
        // Nested partials merge over defaults (same shape as the store deserializer).
        expect(merged!.tools.hermes).toBe(false);
        expect(merged!.tools.endCall).toBe(true);
        expect(merged!.faceRegions.leftEye).toEqual({ x: 0.11, y: 0.22 });
        expect(merged!.faceRegions.mouth).toEqual(defaultPersonaConfig().faceRegions.mouth);
        // Missing scalars fall back to defaults.
        expect(merged!.voiceId).toBe(defaultPersonaConfig().voiceId);
        expect(merged!.customTools).toEqual([]);
        expect(merged!.llmDisabled).toBe(false);
    });

    it('accepts a systemPrompt-only payload and rejects non-persona values', () => {
        const promptOnly = mergePersonaImport({ systemPrompt: 'You are terse.' });
        expect(promptOnly).not.toBeNull();
        expect(promptOnly!.systemPrompt).toBe('You are terse.');
        expect(promptOnly!.name).toBe('Liv');

        expect(mergePersonaImport(null)).toBeNull();
        expect(mergePersonaImport(42)).toBeNull();
        expect(mergePersonaImport('Liv')).toBeNull();
        expect(mergePersonaImport([{ name: 'Liv' }])).toBeNull();
        expect(mergePersonaImport({ foo: 'bar' })).toBeNull();
    });
});
