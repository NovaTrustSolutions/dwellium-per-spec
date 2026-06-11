/**
 * systemHealth — registry + probes for the pre-launch AI health check.
 *
 * Each AI widget declares what it needs to be operational: the backend server,
 * a per-user LLM key, an external service (LangFlow/Paperclip/Open Notebook), or
 * nothing (local-only). `resolveStatus` is pure (no IO) so it's unit-testable;
 * the probes (`probeBackend`, `probeUrl`) do the network checks.
 */

export type HealthStatus = 'ok' | 'degraded' | 'down' | 'checking';
export type HealthRequires = 'backend' | 'llm' | 'external' | 'local';

export interface HealthItem {
    id: string;
    label: string;
    requires: HealthRequires;
    /** backend-required widgets that still work via a personal LLM key when the backend is down */
    llmFallback?: boolean;
    /** for requires === 'external' */
    externalDefaultUrl?: string;
    externalLsKey?: string;       // localStorage key the user may override the URL with
    /** registry widget id to open when the user clicks "Connect" (= open the right settings) */
    connectWidget?: string;
    connectLabel?: string;
    okText?: string;
    downText: string;
}

export interface HealthCtx {
    backendOk: boolean;
    llmOk: boolean;
    externalOk: Record<string, boolean>;
}

export const HEALTH_ITEMS: HealthItem[] = [
    { id: 'backend', label: 'Backend server', requires: 'backend', connectWidget: 'control-panel', connectLabel: 'Open Settings',
      okText: 'Connected on :3000', downText: 'Backend not reachable on :3000 — start it (or reconnect in Settings).' },
    { id: 'llm', label: 'AI model key (LLM)', requires: 'llm', connectWidget: 'control-panel', connectLabel: 'Add key',
      okText: 'An LLM provider is configured', downText: 'No LLM key set — add one in Settings → API Keys.' },
    { id: 'stella-agent', label: 'Stella Agent', requires: 'backend', llmFallback: true, connectWidget: 'control-panel', connectLabel: 'Open Settings',
      okText: 'Ready', downText: 'Needs the backend running, or a personal LLM key.' },
    { id: 'ara-console', label: 'ARA Console', requires: 'backend', llmFallback: true, connectWidget: 'control-panel', connectLabel: 'Open Settings',
      okText: 'Ready', downText: 'Needs the backend running, or a personal LLM key.' },
    { id: 'antigravity', label: 'Antigravity (Gemini)', requires: 'llm', connectWidget: 'control-panel', connectLabel: 'Add key',
      okText: 'LLM key configured', downText: 'Add a Gemini/LLM key in Settings → API Keys.' },
    { id: 'inbox', label: 'Inbox Zero (Gmail)', requires: 'backend', connectWidget: 'control-panel', connectLabel: 'Open Settings',
      okText: 'Backend connected', downText: 'Needs the backend + Gmail authorized (Settings).' },
    { id: 'transcription', label: 'Transcription Hub', requires: 'backend', connectWidget: 'control-panel', connectLabel: 'Open Settings',
      okText: 'Backend connected (local capture always works)', downText: 'Backend offline — local capture still works; start the backend for upload + saved logs.' },
    { id: 'honcho', label: 'Honcho memory', requires: 'llm', connectWidget: 'control-panel', connectLabel: 'Add key',
      okText: 'LLM key configured', downText: 'Background reflection needs an LLM key (Settings → API Keys).' },
    { id: 'hydra-ai', label: 'Hydra AI', requires: 'llm', connectWidget: 'control-panel', connectLabel: 'Add key',
      okText: 'LLM key configured', downText: 'Multi-LLM needs at least one LLM key.' },
    { id: 'thought-weaver', label: 'Thought Weaver', requires: 'backend', llmFallback: true, connectWidget: 'control-panel', connectLabel: 'Open Settings',
      okText: 'Ready', downText: 'Needs the backend running, or a personal LLM key.' },
    { id: 'memory-graph-rag', label: 'Cognitive M Network', requires: 'local',
      okText: 'Local engine ready', downText: 'Local engine unavailable.' },
    { id: 'open-notebook', label: 'Open Notebook', requires: 'external', externalDefaultUrl: 'http://localhost:8502', externalLsKey: 'dwellium-open-notebook-url',
      connectWidget: 'notebooklm-context', connectLabel: 'Open tab', okText: 'Running', downText: 'Not running — start it (Docker) from NotebookLM → Open Notebook tab.' },
    { id: 'langflow', label: 'LangFlow', requires: 'external', externalDefaultUrl: 'http://localhost:7860', externalLsKey: 'dwellium-langflow-url',
      connectWidget: 'terminal', connectLabel: 'Open tab', okText: 'Running', downText: 'Not running — Terminal → LangFlow tab (uv tool install langflow; langflow run).' },
    { id: 'paperclip', label: 'Paperclip', requires: 'external', externalDefaultUrl: 'http://localhost:3100', externalLsKey: 'dwellium-paperclip-url',
      connectWidget: 'terminal', connectLabel: 'Open tab', okText: 'Running', downText: 'Not running — Terminal → Paperclip tab (npx paperclipai onboard --yes).' },
];

/** Pure status resolution from probe results. */
export function resolveStatus(item: HealthItem, ctx: HealthCtx): HealthStatus {
    switch (item.requires) {
        case 'local': return 'ok';
        case 'llm': return ctx.llmOk ? 'ok' : 'down';
        case 'external': return ctx.externalOk[item.id] ? 'ok' : 'down';
        case 'backend':
            if (ctx.backendOk) return 'ok';
            if (item.llmFallback && ctx.llmOk) return 'degraded';
            return 'down';
        default: return 'down';
    }
}

/** Overall readiness: how many items are ok/degraded vs down. */
export function summarize(statuses: HealthStatus[]): { ok: number; degraded: number; down: number; total: number; allReady: boolean } {
    const ok = statuses.filter(s => s === 'ok').length;
    const degraded = statuses.filter(s => s === 'degraded').length;
    const down = statuses.filter(s => s === 'down').length;
    return { ok, degraded, down, total: statuses.length, allReady: down === 0 };
}

/** Probe the backend /health endpoint (4s timeout). */
export async function probeBackend(apiBase: string): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(`${apiBase}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        return r.ok;
    } catch { return false; }
}

/** Probe an external URL for reachability (no-cors; resolves if the server answers). */
export async function probeUrl(url: string): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        await fetch(url, { mode: 'no-cors', signal: ctrl.signal });
        clearTimeout(t);
        return true;
    } catch { return false; }
}

/** Resolve the effective URL for an external item (user override → default). */
export function externalUrl(item: HealthItem): string {
    if (item.externalLsKey) {
        try { const v = localStorage.getItem(item.externalLsKey); if (v) return v; } catch { /* ignore */ }
    }
    return item.externalDefaultUrl || '';
}
