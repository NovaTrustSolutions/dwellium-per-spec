/**
 * busChannels — the canonical typed registry of every `dwellium:*` window
 * event channel (assessment sweep 2026-06-12, weakness #4).
 *
 * One import site per channel name + one payload type per channel kills the
 * "stringly-typed CustomEvent" coupling: a typo'd channel name or a wrong
 * detail field is now a compile error instead of a silent no-op.
 *
 * Interop: these channels wrap window CustomEvents 1:1 (see typedBus.ts) —
 * legacy `window.dispatchEvent(new CustomEvent('dwellium:x', { detail }))`
 * and `window.addEventListener('dwellium:x', …)` call sites keep working
 * unchanged in both directions. Migration is incremental and reversible.
 *
 * Payload types are transcribed from the live dispatch/listener sites
 * (Desktop.tsx, WindowContext.tsx, dwelliumCommands.ts, llmRouter.ts,
 * morningBriefStore.ts, agents/spawn.ts) — NOT invented.
 */

import { busChannel } from './typedBus';

/* ── Window / layout conductor channels (Desktop.tsx + WindowContext.tsx) ── */

export interface OpenWidgetPayload {
    widgetId: string;
    /** Optional window title override (StellaAgent settings deep-link). */
    label?: string;
}

export interface ApplySpacePayload {
    widgets: string[];
    /** 'tabbed' stacks into one region as browser-style tabs (additive). */
    mode?: 'tabbed';
    /** P11-1: optional target region in the CURRENT layout (tabbed mode). */
    regionId?: string;
}

export interface PlaceWidgetPayload {
    widgetId: string;
    regionId: string;
    /** RegionLayout name, e.g. 'halves-h' | 'thirds-h' | 'quadrants'. */
    layout: string;
}

export interface WidgetIdPayload {
    widgetId: string;
}

export interface TilePayload {
    components: string[];
}

export const openWidgetBus = busChannel<OpenWidgetPayload>('dwellium:open-widget');
export const applySpaceBus = busChannel<ApplySpacePayload>('dwellium:apply-space');
export const placeWidgetBus = busChannel<PlaceWidgetPayload>('dwellium:place-widget');
export const closeWidgetBus = busChannel<WidgetIdPayload>('dwellium:close-widget');
export const minimizeWidgetBus = busChannel<WidgetIdPayload>('dwellium:minimize-widget');
export const maximizeWidgetBus = busChannel<WidgetIdPayload>('dwellium:maximize-widget');
export const tileBus = busChannel<TilePayload>('dwellium:tile');

/* ── ARA / agent hand-off channels (pending-slot family) ───────────────── */

export interface AraPromptPayload {
    text: string;
}

/** Brief date key; ARA resolves the full brief from morningBriefStore. */
export interface MorningBriefPayload {
    date: string;
}

export const araPromptBus = busChannel<AraPromptPayload>('dwellium:ara-prompt');
export const araSpawnBus = busChannel<unknown>('dwellium:ara-spawn'); // SpawnRequest — typed at lib/agents/spawn.ts to avoid an import cycle
export const morningBriefBus = busChannel<MorningBriefPayload>('dwellium:morning-brief');

/* ── Feature-local channels (single dispatcher → single listener) ──────── */

export interface TerminalRunPayload {
    command: string;
}

export interface OpenTranscriptionLogPayload {
    logId?: string;
}

export interface TaskmenuViewPayload {
    view: string;
}

export interface WidgetActionPayload {
    widgetId: string;
    verb: string;
    args?: unknown;
}

export interface StrataModulePayload {
    module: string;
}

export interface SpeakerRenamedPayload {
    speakerId?: string;
    name?: string;
}

export const terminalRunBus = busChannel<TerminalRunPayload>('dwellium:terminal-run');
export const openTranscriptionLogBus = busChannel<OpenTranscriptionLogPayload>('dwellium:open-transcription-log');
export const taskmenuViewBus = busChannel<TaskmenuViewPayload>('dwellium:taskmenu-view');
export const widgetActionBus = busChannel<WidgetActionPayload>('dwellium:widget-action');
export const strataModuleBus = busChannel<StrataModulePayload>('dwellium:strata-module');
export const speakerRenamedBus = busChannel<SpeakerRenamedPayload>('dwellium:speaker-renamed');
