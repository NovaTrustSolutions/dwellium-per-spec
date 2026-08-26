/**
 * toolsHub — plan 047 data: the ten planned open-source tools + the help
 * entries the Tools hub window lists. ONE file so statuses flip here (or
 * automatically, once a tool's widget is registered / its env URL is set).
 *
 * Status rule (plan 047 §0): a tool is `ready` only when its widget is in the
 * registry AND (no env gate, or the `VITE_<TOOL>_URL` env is set);
 * `needs-setup` when the widget exists but the env gate is missing;
 * `coming-soon` otherwise. Companion tools (no widget by design — FluidVoice)
 * are `ready` once their Dwellium-side setup card ships (plan 047 tier table:
 * "GPL-3 companion install, no widget — a setup card in Control Panel").
 */

export type ToolStatus = 'ready' | 'needs-setup' | 'coming-soon';

export interface ToolEntry {
    id: string;
    label: string;
    /** Exact SPDX id + how we consume it (plan 047 license rule of thumb). */
    license: string;
    phase: 1 | 2 | 3;
    blurb: string;
    /** Registry widget id once shipped (plan 047 per-tool sections). */
    widgetId?: string;
    /** Companion install (never a widget) — `ready` once its setup card ships. */
    companion?: boolean;
    /** Vite env var that must be set before an iframe/proxy tool counts as ready. */
    envVar?: string;
    /** Anchor in the Guide (getting-started.md) for setup notes. */
    setupDoc?: string;
}

export const TOOLS: ReadonlyArray<ToolEntry> = [
    { id: 'whiteboard', label: 'Whiteboard', license: 'MIT (Excalidraw, embedded)', phase: 1, blurb: 'Hand-drawn whiteboard for floor plans, maintenance markup and doc diagrams.', widgetId: 'whiteboard', setupDoc: 'whiteboard' },
    { id: 'esign', label: 'E-Sign', license: 'AGPL-3.0-only (Documenso, unmodified image)', phase: 1, blurb: 'Send leases, renewals and vendor agreements for signature; track who signed.', widgetId: 'esign', envVar: 'VITE_DOCUMENSO_URL', setupDoc: 'e-sign' },
    { id: 'dictation', label: 'Dictation', license: 'GPL-3.0 (FluidVoice, Mac companion install)', phase: 1, blurb: 'System-wide voice dictation into any Dwellium text field (macOS 15+).', companion: true, setupDoc: 'dictation' },
    // Zero-cost addendum 2026-08-20: hosted cal.com free plan (not self-hosted cal.diy); env renamed to match.
    { id: 'scheduling', label: 'Scheduling', license: 'MIT (Cal.com, hosted free plan)', phase: 2, blurb: 'Showings, maintenance windows and vendor visits — bookable links inside Dwellium.', widgetId: 'scheduler', envVar: 'VITE_CALCOM_URL', setupDoc: 'scheduling' },
    { id: 'broadcasts', label: 'Broadcasts', license: 'AGPL-3.0-only (listmonk, via API)', phase: 2, blurb: 'Resident, owner and vendor mailing lists plus transactional email.', widgetId: 'broadcasts', envVar: 'VITE_LISTMONK_URL', setupDoc: 'broadcasts' },
    { id: 'links', label: 'Links & QR', license: 'AGPL-3.0-only (Dub, hosted API)', phase: 2, blurb: 'Branded short links and QR codes for notices, unit signage and work orders.', widgetId: 'short-links', envVar: 'VITE_DUB_URL', setupDoc: 'links-qr' },
    { id: 'photo-vault', label: 'Photo Vault', license: 'AGPL-3.0-only (Immich, unmodified image)', phase: 2, blurb: 'Inspection, move-in/out and before/after photos, searchable by unit.', widgetId: 'photo-vault', envVar: 'VITE_IMMICH_URL', setupDoc: 'photo-vault' },
    // No envVar: the launcher defaults to Penpot's free cloud (design.penpot.app) — nothing to set up, so
    // registering the widget alone makes it `ready`. VITE_PENPOT_URL only re-points it (phase-3 self-host).
    { id: 'design-studio', label: 'Design Studio', license: 'MPL-2.0 (Penpot, launcher)', phase: 2, blurb: 'Flyers, notices and a Dwellium design system — Figma-class, self-hostable.', widgetId: 'penpot-studio', setupDoc: 'design-studio' },
    // `ready` once VITE_RUSTDESK_RELAY (`host:port,key` — hbbs/hbbr on the free e2-micro, tools/rustdesk/) is set.
    { id: 'remote-support', label: 'Remote Support', license: 'AGPL-3.0-only (RustDesk, stock build)', phase: 2, blurb: 'Remote control for office PCs, kiosks and resident tech support.', widgetId: 'remote-support', envVar: 'VITE_RUSTDESK_RELAY', setupDoc: 'remote-support' },
    { id: 'appflowy', label: 'AppFlowy Workspace', license: 'AGPL-3.0-only (AppFlowy-Cloud, unmodified)', phase: 3, blurb: 'Notion-style docs, databases and kanban — lease trackers, vendor boards, property wikis. Templates ship in tools/appflowy.', widgetId: 'appflowy', envVar: 'VITE_APPFLOWY_URL', setupDoc: 'appflowy' },
];

/** Pure: resolve a tool's status from registry presence + env. */
export function resolveToolStatus(
    tool: ToolEntry,
    hasWidget: (widgetId: string) => boolean,
    env: Record<string, string | undefined>,
): ToolStatus {
    if (tool.companion) return 'ready'; // companion install — setup card in Control Panel, no widget/env gate
    if (!tool.widgetId || !hasWidget(tool.widgetId)) return 'coming-soon';
    if (tool.envVar && !env[tool.envVar]) return 'needs-setup';
    return 'ready';
}

/** Static help rows the Tools hub lists under the tools (plan 047 §5/§6). */
export const HELP_ENTRIES: ReadonlyArray<{ id: string; label: string; blurb: string; action: 'shortcuts' | 'guide' }> = [
    { id: 'shortcuts', label: 'Keyboard shortcuts', blurb: 'Every global hotkey — also on the ? key.', action: 'shortcuts' },
    { id: 'guide', label: 'Guide', blurb: 'Getting started: first five minutes, sidebar tiers, ⌘K.', action: 'guide' },
];
