/**
 * inboxLinkage — Inbox Zero's cross-widget handoffs (Cycle 7 / LINKAGE gaps I2 + I3).
 *
 * Unlike ARA/Stella (which scan a chat reply), Inbox Zero's handoffs are ACTION-driven:
 * once SmartActions has generated an AI reply draft, the operator should be able to take
 * that draft into an assistant/editor to refine and send it. Until now SmartActions only
 * POSTed to `/api/inbox/actions/<id>/draft` with no onward handoff.
 *
 * `getDraftHandoffs` returns the openable targets for a generated draft (Scribe to edit,
 * ARA or Stella to refine — gaps I2 + I3). `openWidgetHandoff` fires the shell's existing
 * `dwellium:open-widget` intent bus (reusing `workspaceScribe.dispatchOpenWidget` — no new
 * plumbing, mirrors araLinkage.ts / stellaLinkage.ts exactly).
 *
 * Both halves are pure / injectable so they unit-test without a DOM listener or a live
 * inbox backend (mirrors araLinkage.ts + stellaLinkage.ts + Workspace.scribe.test.ts).
 *
 * NOTE: a calendar handoff for SmartActions' "Extract Events" feature is intentionally
 * NOT offered — no calendar widget exists in widgetRegistry.ts (verified Cycle 7). Tracked
 * as a blocked link in LINKAGE.md.
 */
import { dispatchOpenWidget } from '../Workspace/workspaceScribe';

export interface WidgetHandoff {
    /** Canonical registry widget id (verified against widgetRegistry.ts). */
    widgetId: string;
    label: string;
    /** lucide icon name, matching the widget's registry entry. */
    icon: string;
}

/** A draft shaped like SmartActions' `DraftResult` (subject/body/confidence). */
export interface DraftLike {
    subject?: string;
    body?: string;
}

/**
 * Targets an AI-generated reply draft can be handed off to, in display order. All
 * `widgetId`s are LIVE (non-deprecated) registry ids verified against widgetRegistry.ts:
 * `scribe` (Scribe editor), `ara-console` (ARA Console), `stella-agent` (Stella Agent).
 */
export const DRAFT_HANDOFF_TARGETS: ReadonlyArray<WidgetHandoff> = [
    { widgetId: 'scribe',       label: 'Edit in Scribe',  icon: 'pen-tool' },
    { widgetId: 'ara-console',  label: 'Refine with ARA', icon: 'brain-circuit' },
    { widgetId: 'stella-agent', label: 'Ask Stella',      icon: 'sparkles' },
];

/**
 * Return the handoff targets for a generated draft. A draft with no usable body (null /
 * empty / whitespace) yields no handoffs (so SmartActions renders nothing pre-draft).
 */
export function getDraftHandoffs(
    draft: DraftLike | null | undefined,
    targets: ReadonlyArray<WidgetHandoff> = DRAFT_HANDOFF_TARGETS,
): WidgetHandoff[] {
    if (!draft || !draft.body || !draft.body.trim()) return [];
    return targets.map((t) => ({ ...t }));
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
