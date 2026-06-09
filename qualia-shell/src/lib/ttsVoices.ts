/**
 * ttsVoices — shared text-to-speech voice catalog + speak helper + humanize
 * directive. Lifted from ARAConsole so Stella (and any future agent) offers the
 * exact same voices and the same "humanize" reply style.
 *
 * Two tiers: OpenAI TTS (6 high-quality voices, needs the user's OpenAI key from
 * Settings → API Keys) and browser SpeechSynthesis (enhanced macOS voices) as a
 * keyless fallback. Selection is persisted per-consumer (e.g. dwellium-stella-voice).
 */

export interface TtsVoiceOption {
    id: string;
    label: string;
    description: string;
    provider: 'openai' | 'browser';
    openaiVoice?: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer';
    browserVoiceMatch?: string[];
}

/** The full voice catalog ARA exposes — shared verbatim so agents stay in sync. */
export const TTS_VOICE_CATALOG: TtsVoiceOption[] = [
    { id: 'openai-alloy', label: 'Alloy', description: 'OpenAI — warm, neutral, balanced', provider: 'openai', openaiVoice: 'alloy' },
    { id: 'openai-nova', label: 'Nova', description: 'OpenAI — bright, energetic female', provider: 'openai', openaiVoice: 'nova' },
    { id: 'openai-shimmer', label: 'Shimmer', description: 'OpenAI — soft, breathy female', provider: 'openai', openaiVoice: 'shimmer' },
    { id: 'openai-fable', label: 'Fable', description: 'OpenAI — British, expressive storyteller', provider: 'openai', openaiVoice: 'fable' },
    { id: 'openai-echo', label: 'Echo', description: 'OpenAI — calm, conversational male', provider: 'openai', openaiVoice: 'echo' },
    { id: 'openai-onyx', label: 'Onyx', description: 'OpenAI — deep, authoritative male', provider: 'openai', openaiVoice: 'onyx' },
    { id: 'browser-samantha', label: 'Samantha (macOS)', description: 'Apple — Siri-quality enhanced female', provider: 'browser', browserVoiceMatch: ['Samantha (Enhanced)', 'Samantha'] },
    { id: 'browser-karen', label: 'Karen (macOS)', description: 'Apple — natural Australian female', provider: 'browser', browserVoiceMatch: ['Karen (Enhanced)', 'Karen'] },
    { id: 'browser-daniel', label: 'Daniel (macOS)', description: 'Apple — calm British male', provider: 'browser', browserVoiceMatch: ['Daniel (Enhanced)', 'Daniel'] },
];

/**
 * Prepended to the outgoing user message when "Humanize" is on. Pure style
 * guidance the LLM honors so replies land warm and conversational instead of
 * robotic. Identical to ARA's directive so both agents sound the same.
 */
export const HUMANIZE_PREFIX =
    "[Reply style: warm and conversational. Use contractions (don't, you're, we'll). " +
    "Short sentences. Plain language — no corporate jargon, no hedging, no excessive bullet lists. " +
    "Sound like a thoughtful friend talking, not a chatbot. " +
    "If you must list things, lead with a single sentence first, then the list.]\n\n";

const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const LEGACY_VOICE_MAP: Record<string, string> = { female: 'openai-alloy', male: 'openai-onyx' };

/** Flatten Markdown to plain prose so the TTS reads it naturally. */
export function stripMarkdownForSpeech(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, ' code block ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_#>~|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface SpeakHandle { stop: () => void; }

/**
 * Speak `text` with the chosen voice. Uses OpenAI TTS when the voice is an
 * OpenAI voice AND an OpenAI key is present; otherwise browser SpeechSynthesis.
 * Returns a handle whose .stop() halts playback. Mirrors ARA's speakText.
 */
export async function speakText(
    text: string,
    voiceId: string,
    openaiKey: string | undefined,
    opts: { onStart?: () => void; onEnd?: () => void } = {},
): Promise<SpeakHandle> {
    const handle: SpeakHandle = { stop: () => { /* replaced below */ } };
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }

    const cleaned = stripMarkdownForSpeech(text);
    if (!cleaned) { opts.onEnd?.(); return handle; }
    opts.onStart?.();

    const resolvedId = LEGACY_VOICE_MAP[voiceId] ?? voiceId;
    const option = TTS_VOICE_CATALOG.find(v => v.id === resolvedId) ?? TTS_VOICE_CATALOG[0];

    // ── Path A: OpenAI TTS (browser-direct, same pattern as llmClient) ──
    if (option.provider === 'openai' && openaiKey) {
        try {
            const res = await fetch(OPENAI_TTS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: cleaned.length > 4000 ? cleaned.slice(0, 4000) : cleaned,
                    voice: option.openaiVoice,
                    response_format: 'mp3',
                }),
            });
            if (res.ok) {
                const url = URL.createObjectURL(await res.blob());
                const audio = new Audio(url);
                handle.stop = () => { try { audio.pause(); } catch { /* ignore */ } URL.revokeObjectURL(url); opts.onEnd?.(); };
                audio.onended = () => { URL.revokeObjectURL(url); opts.onEnd?.(); };
                audio.onerror = () => { URL.revokeObjectURL(url); opts.onEnd?.(); };
                await audio.play();
                return handle;
            }
            // non-OK → fall through to browser TTS
        } catch { /* fall through to browser TTS */ }
    }

    // ── Path B: Browser SpeechSynthesis with the closest matching voice ──
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = 0.92;
    utterance.pitch = 1.06;
    const voices = window.speechSynthesis.getVoices();
    let preferred: SpeechSynthesisVoice | undefined;
    if (option.provider === 'browser' && option.browserVoiceMatch) {
        for (const needle of option.browserVoiceMatch) {
            preferred = voices.find(v => v.name.includes(needle));
            if (preferred) break;
        }
    }
    if (!preferred) {
        preferred =
            voices.find(v => v.name.includes('Samantha (Enhanced)')) ||
            voices.find(v => v.name.includes('Karen (Enhanced)')) ||
            voices.find(v => v.name.includes('Samantha')) ||
            voices.find(v => v.name.includes('Karen')) ||
            voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
            voices.find(v => v.lang.startsWith('en-US') && v.localService) ||
            voices.find(v => v.lang.startsWith('en'));
    }
    if (preferred) utterance.voice = preferred;
    utterance.onend = () => opts.onEnd?.();
    utterance.onerror = () => opts.onEnd?.();
    handle.stop = () => { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } opts.onEnd?.(); };
    window.speechSynthesis.speak(utterance);
    return handle;
}
