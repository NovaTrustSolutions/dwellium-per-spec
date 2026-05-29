/**
 * stellaLinkage — Stella's cross-widget handoffs (Cycle 5 / LINKAGE gap S2).
 *
 * 🔒 PROTECTED widget: this is a STRICTLY ADDITIVE linkage capability — no restyle, no
 * structural change to Stella. Stella can answer ABOUT the inbox / files / docs / ARA but,
 * until now, could only OPEN Settings (StellaAgent.tsx control-panel dispatch). S2 lets
 * Stella also hand off to the widgets it references in a reply.
 *
 * `detectWidgetHandoffs` scans Stella's latest assistant reply for references to other
 * widgets and returns the openable targets; `openWidgetHandoff` fires the shell's existing
 * `dwellium:open-widget` intent bus (reusing `workspaceScribe.dispatchOpenWidget` — no new
 * plumbing, mirrors ARA's Cycle-3 araLinkage exactly).
 *
 * Both halves are pure / injectable so they unit-test without a DOM listener or a live
 * Stella backend (mirrors araLinkage.ts + Workspace.scribe.test.ts).
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
    /** Lower-case word-boundary keywords that signal this widget in a Stella reply. */
    keywords: string[];
}

/**
 * Widgets Stella commonly references and can hand off to. `widgetId`s are the LIVE
 * (non-deprecated) registry ids. Mirrors ARA's catalog but targets `ara-console` (Stella's
 * sibling assistant) instead of `stella-agent` (self).
 */
export const STELLA_HANDOFF_CATALOG: ReadonlyArray<HandoffRule> = [
    { widgetId: 'inbox',        label: 'Inbox Zero', icon: 'mail-open',   keywords: ['inbox zero', 'inbox', 'unread email', 'email triage'] },
    { widgetId: 'file-manager', label: 'Files',      icon: 'folder-open', keywords: ['file manager', 'your files', 'your documents'] },
    { widgetId: 'doc-viewer',   label: 'Doc Viewer', icon: 'file-text',   keywords: ['doc viewer', 'document viewer', 'pdf viewer'] },
    { widgetId: 'scribe',       label: 'Scribe',     icon: 'pen-tool',    keywords: ['scribe', 'in the editor', 'draft a document'] },
    { widgetId: 'ara-console',  label: 'ARA',        icon: 'bot',         keywords: ['ara console', 'ara'] },
];

/** Cap so a chatty reply mentioning many widgets doesn't produce a wall of chips. */
export const MAX_HANDOFFS = 3;

function containsKeyword(haystackLower: string, keywordLower: string): boolean {
    const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(haystackLower);
}

/**
 * Scan a Stella reply for widget references and return the openable handoffs, deduped by
 * widgetId, in catalog order, capped at MAX_HANDOFFS. Empty/whitespace input → [].
 */
export function detectWidgetHandoffs(
    replyText: string | null | undefined,
    catalog: ReadonlyArray<HandoffRule> = STELLA_HANDOFF_CATALOG,
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
