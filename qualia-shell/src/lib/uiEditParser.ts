/**
 * uiEditParser — 2026-06-12 (Ilya): turn natural language into UiEdit ops.
 * "change the header color to yellow" → { selector: '.window__titlebar',
 * css: { 'background-color': 'yellow' } }; "move the text container to the
 * right corner" → margin-auto alignment on the picked/named target.
 *
 * Two passes, the established Dwellium routing shape:
 *   1. parseUiEdit() — zero-latency heuristics over named targets, color
 *      words, size/visibility/move verbs. Handles the everyday phrasings.
 *   2. parseUiEditWithLlm() — for anything the heuristics miss, ask the
 *      user's LLM to emit a CONSTRAINED JSON op; the result still passes the
 *      uiEditStore whitelist/sanitizer, so a hallucinated property dies at
 *      the boundary instead of reaching the page.
 *
 * "Picked element" support: the panel's click-to-pick stores the selection in
 * pickedElementHolder; words like "this / that / it / the selected element"
 * (or an utterance with no named target at all) resolve to it.
 */
import { callLlm, hasActiveLlm } from './llmClient';
import type { IntegrationsBundle } from '../types/integrations';
import { sanitizeCss } from './uiEditStore';

/* ─── Named targets (verified against the real chrome selectors) ─── */

export interface NamedTarget {
    /** Words the user may say. First alias is the canonical label. */
    aliases: string[];
    selector: string;
    label: string;
}

export const NAMED_TARGETS: NamedTarget[] = [
    { aliases: ['header', 'headers', 'titlebar', 'title bar', 'window header'], selector: '.window__titlebar', label: 'Window headers' },
    { aliases: ['sidebar', 'side bar', 'nav', 'navigation'], selector: '.sidebar', label: 'Sidebar' },
    { aliases: ['desktop', 'background', 'canvas', 'wallpaper'], selector: '.desktop', label: 'Desktop' },
    { aliases: ['dock', 'taskbar'], selector: '.dock', label: 'Dock' },
    { aliases: ['window', 'windows', 'card', 'cards'], selector: '.window', label: 'Windows' },
    { aliases: ['content', 'content area', 'text container', 'container', 'body'], selector: '.window-app', label: 'Window content' },
];

/** Click-to-pick result the panel publishes before parsing "this/that/it". */
export const pickedElementHolder: { current: { selector: string; label: string } | null } = { current: null };

export function resolveTarget(text: string): { selector: string; label: string } | null {
    const t = text.toLowerCase();
    for (const target of NAMED_TARGETS) {
        if (target.aliases.some(a => t.includes(a))) return { selector: target.selector, label: target.label };
    }
    // No named target — fall back to the picked element when one is active
    // (covers "make it yellow" AND "make the thingy yellow" alike).
    return pickedElementHolder.current;
}

/* ─── Vocabulary ─── */

export const COLOR_WORDS: Record<string, string> = {
    yellow: '#facc15', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
    green: '#22c55e', lime: '#D6FE51', teal: '#14b8a6', cyan: '#06b6d4',
    blue: '#3b82f6', navy: '#1e3a8a', indigo: '#6366f1', purple: '#a855f7',
    violet: '#8b5cf6', pink: '#ec4899', magenta: '#d946ef', rose: '#f43f5e',
    white: '#ffffff', black: '#000000', gray: '#6b7280', grey: '#6b7280',
    silver: '#c0c0c0', gold: '#eab308', brown: '#92400e', transparent: 'transparent',
};

const COLOR_PATTERN = new RegExp(
    `\\b(${Object.keys(COLOR_WORDS).join('|')})\\b|(#[0-9a-fA-F]{3,8})\\b|\\b(rgba?\\([^)]{1,40}\\))`,
    'i',
);

function extractColor(text: string): string | null {
    const m = text.match(COLOR_PATTERN);
    if (!m) return null;
    if (m[1]) return COLOR_WORDS[m[1].toLowerCase()] ?? null;
    return (m[2] || m[3]) ?? null;
}

export interface UiEditOp {
    selector: string;
    label: string;
    css: Record<string, string>;
    /** Human summary for the chat/panel ack. */
    summary: string;
}

/* ─── Pass 1: heuristics ─── */

export function parseUiEdit(text: string): UiEditOp | null {
    const t = text.trim();
    if (t.length < 4) return null;
    const target = resolveTarget(t);
    if (!target) return null;
    const lower = t.toLowerCase();

    // Hide / show.
    if (/\b(?:hide|remove)\b/.test(lower) && !/\bcolor|background\b/.test(lower)) {
        return { ...target, css: { display: 'none' }, summary: `Hid ${target.label}` };
    }
    if (/\b(?:show|unhide|bring back)\b/.test(lower)) {
        return { ...target, css: { display: 'revert' }, summary: `Showed ${target.label}` };
    }

    // Move / alignment ("move X to the right corner", "put it on the left").
    const move = lower.match(/\b(?:move|put|shift|slide|align)\b[\s\S]*\b(?:to|on|into)?\s*(?:the\s+)?(top|bottom)?\s*[- ]?\s*(left|right|center|centre|middle)\b/);
    if (move) {
        const horizontal = move[2];
        const css: Record<string, string> = {};
        if (horizontal === 'right') { css['margin-left'] = 'auto'; css['margin-right'] = '0'; }
        else if (horizontal === 'left') { css['margin-right'] = 'auto'; css['margin-left'] = '0'; }
        else { css['margin-left'] = 'auto'; css['margin-right'] = 'auto'; }
        if (move[1] === 'top') css['align-self'] = 'flex-start';
        if (move[1] === 'bottom') css['align-self'] = 'flex-end';
        return { ...target, css, summary: `Moved ${target.label} to the ${move[1] ? `${move[1]} ` : ''}${horizontal}` };
    }

    // Text alignment ("center the text in…").
    const align = lower.match(/\b(?:center|centre)\b[\s\S]*\btext\b|\btext\b[\s\S]*\b(?:center|centre)\b/);
    if (align) return { ...target, css: { 'text-align': 'center' }, summary: `Centered text in ${target.label}` };

    // Size ("bigger/smaller text", "increase the font size").
    if (/\b(?:bigger|larger|increase)\b[\s\S]*\b(?:text|font)\b|\b(?:text|font)\b[\s\S]*\b(?:bigger|larger)\b/.test(lower)) {
        return { ...target, css: { 'font-size': '1.15em' }, summary: `Larger text in ${target.label}` };
    }
    if (/\b(?:smaller|decrease|shrink)\b[\s\S]*\b(?:text|font)\b|\b(?:text|font)\b[\s\S]*\bsmaller\b/.test(lower)) {
        return { ...target, css: { 'font-size': '0.85em' }, summary: `Smaller text in ${target.label}` };
    }

    // Rounded corners.
    if (/\bround(?:ed)?\b[\s\S]*\bcorners?\b/.test(lower)) {
        return { ...target, css: { 'border-radius': '12px' }, summary: `Rounded corners on ${target.label}` };
    }

    // Transparency.
    const opacity = lower.match(/\b(?:transparent|see[- ]through|opacity)\b/);
    if (opacity && !extractColor(lower)) {
        return { ...target, css: { opacity: '0.6' }, summary: `Made ${target.label} translucent` };
    }

    // Color — the headline case. "text color" → color; otherwise background.
    const color = extractColor(lower);
    if (color && /\b(?:color|colour|paint|make|change|set|turn)\b/.test(lower)) {
        const isText = /\b(?:text|font|letters?)\b/.test(lower);
        const css: Record<string, string> = isText ? { color } : { 'background-color': color };
        return { ...target, css, summary: `${isText ? 'Text' : 'Background'} of ${target.label} → ${color}` };
    }

    return null;
}

/* ─── Pass 2: LLM fallback (constrained JSON, sanitized at the boundary) ─── */

const LLM_SYSTEM = `You translate one natural-language UI edit into JSON. Reply with ONLY a JSON object:
{"css": {"<css-property>": "<value>", ...}, "summary": "<short past-tense description>"}
Rules: presentation properties only (color, background-color, font-*, border*, margin*, padding, opacity, display, text-align, width, height, justify-content, align-items, align-self). NEVER use url(), @import, or javascript. If the request is not a UI style edit, reply {"css":{}}.`;

export async function parseUiEditWithLlm(text: string, llm: IntegrationsBundle['llm'] | undefined): Promise<UiEditOp | null> {
    if (!llm || !hasActiveLlm(llm)) return null;
    const target = resolveTarget(text);
    if (!target) return null;
    try {
        const res = await callLlm({
            systemPrompt: LLM_SYSTEM,
            prompt: `Target element: ${target.label} (selector ${target.selector})\nRequest: ${text}`,
            responseFormat: 'json',
            maxTokens: 300,
            temperature: 0,
        }, llm);
        if (!res?.text) return null;
        const jsonMatch = res.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]) as { css?: Record<string, string>; summary?: string };
        const css = sanitizeCss(parsed.css || {});
        if (!css) return null;
        return { ...target, css, summary: parsed.summary || `Updated ${target.label}` };
    } catch {
        return null;
    }
}
