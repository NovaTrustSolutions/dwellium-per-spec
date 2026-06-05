/**
 * thoughtWeaverLinkage — ThoughtWeaver's cross-widget handoffs (Block B Cycle 15).
 *
 * Wires TW ↔ ARA ↔ Honcho WITHOUT coupling the three widgets:
 *
 *  • TW → ARA.   `sendToAra` fires the EXISTING `scribe:send-to-ara` intent bus that
 *    ARAConsole already listens for (ARAConsole.tsx:1057 → composeAraPrompt). No new
 *    event and no ARA code change — TW just reuses the Scribe→ARA contract (decision
 *    D15-1). `composeCaptureContext` / `composeInsightContext` build the `{ text, preface }`
 *    payload that ARA blockquotes.
 *
 *  • TW → Honcho. `saveToHonchoMemory` appends a memory to the LOCAL per-user
 *    `honchoDreamStore` (decision D15-2) — Honcho's only local store, surfaced in the
 *    standalone Honcho widget's Dreams tab (Cycle 8). Backend `/api/honcho/memories` is
 *    optional sync, deliberately out of scope here. The widget is then surfaced via the
 *    `dwellium:open-widget` bus so the saved memory is immediately visible.
 *
 *  • ARA/Honcho ← pull. `buildTwContextDigest` is a pure helper that renders recent TW
 *    captures + insights as a compact Markdown digest, so ARA (or Honcho) can pull TW
 *    context on demand (decision D15-3). The active wiring is the user-driven push above;
 *    this digest makes an auto-pull a one-liner later without coupling ARA to the store now.
 *
 * Everything is pure / injectable so it unit-tests with no DOM listener, no live ARA
 * backend, and no real localStorage (mirrors araLinkage.ts / stellaLinkage.ts /
 * Workspace.scribe.test.ts — decision D15-4).
 */
import { dispatchOpenWidget } from '../Workspace/workspaceScribe';
import { appendDream, type DreamEntry } from '../StellaAgent/honchoDreamStore';
import type { LocalCapture } from './thoughtWeaverStore';
import type { InsightEntry } from './reportStore';

/** The `scribe:send-to-ara` payload ARAConsole consumes (preface + blockquoted text). */
export interface AraContext {
    text: string;
    preface: string;
}

const CAPTURE_PREFACE = 'Here is a thought I captured — what should I do with it?';
const INSIGHT_PREFACE = 'ThoughtWeaver surfaced this insight about my notes — your take?';

/**
 * Build the ARA handoff payload for a single capture. Includes the bucket it was filed to
 * (and the suggested destination) so ARA has the same context the user sees. Returns null
 * when the capture has no usable text (so callers can no-op / disable the button).
 */
export function composeCaptureContext(capture: Pick<LocalCapture, 'text' | 'filed_to' | 'destination_name'>): AraContext | null {
    const text = capture?.text?.trim();
    if (!text) return null;
    const dest = capture.destination_name ? ` → ${capture.destination_name}` : '';
    const filed = capture.filed_to ? ` (filed under ${capture.filed_to}${dest})` : '';
    return { text: `${text}${filed}`, preface: CAPTURE_PREFACE };
}

/** Build the ARA handoff payload for one insight. Null when the insight is empty. */
export function composeInsightContext(insight: Pick<InsightEntry, 'text' | 'kind'>): AraContext | null {
    const text = insight?.text?.trim();
    if (!text) return null;
    const kind = insight.kind ? `[${insight.kind}] ` : '';
    return { text: `${kind}${text}`, preface: INSIGHT_PREFACE };
}

export interface SendToAraDeps {
    /** Inject in tests; defaults to firing the `scribe:send-to-ara` intent bus. */
    dispatch: (ctx: AraContext) => void;
}

/** Default dispatch: fire the `scribe:send-to-ara` event ARAConsole already listens for. */
export function dispatchSendToAra(ctx: AraContext): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('scribe:send-to-ara', { detail: ctx }));
}

/**
 * Send a composed context to ARA. No-ops (returns false) for null context so the caller
 * doesn't have to guard. Returns true when a handoff was dispatched.
 */
export function sendToAra(ctx: AraContext | null, deps?: SendToAraDeps): boolean {
    if (!ctx || !ctx.text.trim()) return false;
    (deps?.dispatch ?? dispatchSendToAra)(ctx);
    return true;
}

/** A memory ready to persist into Honcho's local store. */
export interface HonchoMemorySeed {
    title: string;       // short headline
    text: string;        // body
    sources: string[];   // capture / insight ids this memory came from
}

export interface SaveToHonchoDeps {
    /** Inject in tests; defaults to the real local-store appender. */
    append: (entry: Omit<DreamEntry, 'id' | 'createdAt'>) => DreamEntry;
    /** Inject in tests; defaults to the `dwellium:open-widget` bus. Pass null to skip surfacing. */
    openWidget?: ((widgetId: string, label?: string, icon?: string) => void) | null;
}

/**
 * Persist a memory into Honcho's LOCAL per-user store and (by default) surface the Honcho
 * widget so it's immediately visible. Returns the created entry, or null for an empty seed.
 */
export function saveToHonchoMemory(seed: HonchoMemorySeed | null, deps?: SaveToHonchoDeps): DreamEntry | null {
    if (!seed || !seed.text.trim()) return null;
    const append = deps?.append ?? appendDream;
    const entry = append({
        title: seed.title.trim() || 'Captured note',
        text: seed.text.trim(),
        sources: seed.sources ?? [],
    });
    // Surface the Honcho widget unless explicitly suppressed (deps.openWidget === null).
    const open = deps && 'openWidget' in deps ? deps.openWidget : dispatchOpenWidget;
    if (open) open('honcho', 'Honcho', '🧠');
    return entry;
}

/** Build a Honcho memory seed from a single capture. Null when there's no text. */
export function captureToHonchoSeed(capture: Pick<LocalCapture, 'id' | 'text' | 'destination_name' | 'filed_to'>): HonchoMemorySeed | null {
    const text = capture?.text?.trim();
    if (!text) return null;
    const title = capture.destination_name?.trim() || `${(capture.filed_to || 'note')}: ${text.slice(0, 40)}`;
    return { title, text, sources: [capture.id] };
}

/** Build a Honcho memory seed from one insight. Null when there's no text. */
export function insightToHonchoSeed(insight: Pick<InsightEntry, 'id' | 'text' | 'kind'>): HonchoMemorySeed | null {
    const text = insight?.text?.trim();
    if (!text) return null;
    return { title: `Insight (${insight.kind})`, text, sources: [insight.id] };
}

export interface DigestOptions {
    /** Max captures to include (newest-first). Default 8. */
    maxCaptures?: number;
    /** Max insights to include (newest-first). Default 5. */
    maxInsights?: number;
}

/**
 * Render recent TW captures + insights as a compact Markdown digest other widgets can pull
 * as context (decision D15-3). Pure — no store/DOM access; callers pass the arrays. Returns
 * an empty string when there's nothing to share so callers can no-op.
 */
export function buildTwContextDigest(
    captures: ReadonlyArray<Pick<LocalCapture, 'text' | 'filed_to'>>,
    insights: ReadonlyArray<Pick<InsightEntry, 'text' | 'kind'>>,
    opts?: DigestOptions,
): string {
    const maxC = opts?.maxCaptures ?? 8;
    const maxI = opts?.maxInsights ?? 5;
    const caps = (captures ?? []).filter((c) => c?.text?.trim()).slice(0, maxC);
    const ins = (insights ?? []).filter((i) => i?.text?.trim()).slice(0, maxI);
    if (caps.length === 0 && ins.length === 0) return '';
    const parts: string[] = ['# ThoughtWeaver context'];
    if (caps.length) {
        parts.push('\n## Recent captures');
        for (const c of caps) {
            const filed = c.filed_to ? ` _(${c.filed_to})_` : '';
            parts.push(`- ${c.text.trim()}${filed}`);
        }
    }
    if (ins.length) {
        parts.push('\n## Insights');
        for (const i of ins) {
            parts.push(`- **${i.kind}:** ${i.text.trim()}`);
        }
    }
    return parts.join('\n');
}
