/**
 * araLinkage — ARAConsole's cross-widget handoffs (Cycle 3 / LINKAGE gaps A2 + A3).
 *
 * A2 (ARA → other widgets). ARA can answer ABOUT the inbox / files / docs but, until
 * now, could not OPEN them. `detectWidgetHandoffs` scans an ARA reply for references to
 * other widgets and returns the openable targets; `openWidgetHandoff` fires the shell's
 * existing `dwellium:open-widget` intent bus (reusing `workspaceScribe.dispatchOpenWidget`
 * — no new plumbing, per arc decision D2).
 *
 * A3 (ARA ← selection handoff). `composeAraPrompt` mirrors AraMiniPanel's
 * `scribe:send-to-ara` contract (preface + blockquoted text) so the FULL ARAConsole
 * widget — not only the Scribe-embedded mini panel — can act on a selection sent to ARA.
 *
 * Both halves are pure / injectable so they unit-test without a DOM listener or a live
 * ARA backend (mirrors `Workspace.scribe.test.ts`).
 */
import { dispatchOpenWidget } from '../Workspace/workspaceScribe';

export interface WidgetHandoff {
    /** Canonical registry widget id (verified against widgetRegistry.ts). */
    widgetId: string;
    label: string;
    /** lucide icon name, matching the widget's registry entry. */
    icon: string;
}

interface HandoffRule extends WidgetHandoff {
    /** Lower-case word-boundary keywords that signal this widget in an ARA reply. */
    keywords: string[];
}

/**
 * Widgets ARA commonly references and can hand off to. `widgetId`s are the LIVE
 * (non-deprecated) registry ids: the inbox handoff targets `inbox` (label "Inbox Zero"),
 * NOT the `inbox-zero` entry which is @deprecated in widgetRegistry.ts.
 */
export const ARA_HANDOFF_CATALOG: ReadonlyArray<HandoffRule> = [
    { widgetId: 'inbox',        label: 'Inbox Zero', icon: 'mail-open',   keywords: ['inbox zero', 'inbox', 'unread email', 'email triage'] },
    { widgetId: 'file-manager', label: 'Files',      icon: 'folder-open', keywords: ['file manager', 'your files', 'your documents'] },
    { widgetId: 'doc-viewer',   label: 'Doc Viewer', icon: 'file-text',   keywords: ['doc viewer', 'document viewer', 'pdf viewer'] },
    { widgetId: 'scribe',       label: 'Scribe',     icon: 'pen-tool',    keywords: ['scribe', 'in the editor', 'draft a document'] },
    { widgetId: 'stella-agent', label: 'Stella',     icon: 'sparkles',    keywords: ['stella'] },
];

/** Cap so a chatty reply mentioning many widgets doesn't produce a wall of chips. */
export const MAX_HANDOFFS = 3;

function containsKeyword(haystackLower: string, keywordLower: string): boolean {
    const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(haystackLower);
}

/**
 * Scan an ARA reply for widget references and return the openable handoffs, deduped by
 * widgetId, in catalog order, capped at MAX_HANDOFFS. Empty/whitespace input → [].
 */
export function detectWidgetHandoffs(
    replyText: string | null | undefined,
    catalog: ReadonlyArray<HandoffRule> = ARA_HANDOFF_CATALOG,
): WidgetHandoff[] {
    if (!replyText || !replyText.trim()) return [];
    const text = replyText.toLowerCase();
    const out: WidgetHandoff[] = [];
    const seen = new Set<string>();
    for (const rule of catalog) {
        if (seen.has(rule.widgetId)) continue;
        if (rule.keywords.some((kw) => containsKeyword(text, kw))) {
            seen.add(rule.widgetId);
            out.push({ widgetId: rule.widgetId, label: rule.label, icon: rule.icon });
            if (out.length >= MAX_HANDOFFS) break;
        }
    }
    return out;
}

export interface OpenWidgetDeps {
    /** Inject in tests; defaults to the `dwellium:open-widget` intent bus. */
    openWidget: (widgetId: string, label?: string, icon?: string) => void;
}

/** Open/focus the handed-off widget via the shell's cross-widget intent bus. */
export function openWidgetHandoff(handoff: WidgetHandoff, deps?: OpenWidgetDeps): void {
    const open = deps?.openWidget ?? dispatchOpenWidget;
    open(handoff.widgetId, handoff.label, handoff.icon);
}

/**
 * Compose the prompt for a `scribe:send-to-ara` selection handoff. Mirrors
 * AraMiniPanel.tsx exactly: an optional preface, then the selected text as a Markdown
 * blockquote. Returns null when there is no usable text (so the listener can no-op).
 */
export function composeAraPrompt(detail: { text?: string; preface?: string } | null | undefined): string | null {
    const text = detail?.text;
    if (!text || !text.trim()) return null;
    const preface = detail.preface;
    return preface ? `${preface}\n\n> ${text.replace(/\n/g, '\n> ')}` : text;
}
