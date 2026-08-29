/**
 * OpenOpcPanel — Automation Hub · AI Company console.
 *
 * Covers the unconfigured state (backend 503 → install/setup, never a runner
 * call), the configured launch form + exact command it builds, and the
 * escalation approve flow (a mock EventSource feeds one escalation event; the
 * Approve button POSTs the answer to /runs/:id/input). The mandatory safety
 * banner is asserted in every state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import OpenOpcPanel, { buildOpcCommand } from '../components/AutomationHub/OpenOpcPanel';

const ENV = { OPC_RUNNER_URL: '', OPC_PROJECT: 'dwellium', OPC_MODE: 'company', OPC_COMPANY_PROFILE: 'corporate', OPC_AGENT_BACKEND: 'native' };

// ── Controllable EventSource stand-in (jsdom has none) ──
class MockEventSource {
    static last: MockEventSource | null = null;
    url: string;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(url: string) { this.url = url; MockEventSource.last = this; }
    emit(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
    close() { this.closed = true; }
}

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
    MockEventSource.last = null;
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
    cleanup();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('buildOpcCommand', () => {
    it('builds the exact `opc exec --stream-json` invocation', () => {
        expect(buildOpcCommand({ goal: 'Do the thing', mode: 'company', companyProfile: 'corporate', agentBackend: 'native', project: 'dwellium' }))
            .toBe('opc exec -p dwellium --mode company --company-profile corporate --agent native --stream-json "Do the thing"');
    });
    it('omits --company-profile in task mode', () => {
        expect(buildOpcCommand({ goal: 'x', mode: 'task', companyProfile: 'corporate', agentBackend: 'codex', project: 'demo' }))
            .toBe('opc exec -p demo --mode task --agent codex --stream-json "x"');
    });
});

describe('unconfigured (backend 503)', () => {
    it('renders the install/setup state and never calls a runner', async () => {
        const fetchMock = vi.fn(() => jsonResponse({ success: false, needsSetup: true }, 503));
        vi.stubGlobal('fetch', fetchMock);
        render(<OpenOpcPanel envVars={ENV} onClose={() => {}} />);
        expect(await screen.findByText(/runner isn’t configured yet/i)).toBeTruthy();
        // Safety banner present.
        expect(screen.getByText(/execute code, edit files, and drive a browser autonomously/i)).toBeTruthy();
        // Only the config probe fired — no launch, no stream.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(MockEventSource.last).toBeNull();
    });
});

describe('configured', () => {
    it('shows the launch form + the command preview + the safety banner', async () => {
        vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ success: true, data: { runs: [] } }, 200)));
        render(<OpenOpcPanel envVars={ENV} onClose={() => {}} />);
        expect(await screen.findByRole('button', { name: /Launch run/i })).toBeTruthy();
        expect(screen.getByText(/opc exec -p dwellium --mode company/)).toBeTruthy();
        expect(screen.getByText(/execute code, edit files, and drive a browser autonomously/i)).toBeTruthy();
    });

    it('launch → escalation event → Approve POSTs the answer to /input', async () => {
        const calls: { url: string; method: string; body?: unknown }[] = [];
        const fetchMock = vi.fn((url: string, init?: RequestInit) => {
            calls.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
            if (String(url).endsWith('/runs') && init?.method === 'POST') return jsonResponse({ success: true, data: { id: 'run_42' } }, 200);
            if (String(url).includes('/input')) return jsonResponse({ success: true }, 200);
            return jsonResponse({ success: true, data: { runs: [] } }, 200); // GET /runs probe
        });
        vi.stubGlobal('fetch', fetchMock);

        render(<OpenOpcPanel envVars={ENV} onClose={() => {}} />);
        const goal = await screen.findByPlaceholderText(/Draft a vendor-onboarding/i);
        fireEvent.change(goal, { target: { value: 'Draft an SOP' } });
        fireEvent.click(screen.getByRole('button', { name: /Launch run/i }));

        // Wait for the POST /runs to resolve and the stream to open.
        await waitFor(() => expect(MockEventSource.last).not.toBeNull());
        expect(MockEventSource.last!.url).toContain('/runs/run_42/stream');

        // The runner escalates a blocker to the human.
        act(() => {
            MockEventSource.last!.emit({ type: 'escalation', seq: 5, payload: { id: 'esc_1', message: 'Approve deploy to prod?', options: [{ id: 'yes', label: 'Approve' }, { id: 'no', label: 'Hold' }] } });
        });
        expect(await screen.findByText(/Approve deploy to prod\?/i)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        await waitFor(() => expect(calls.some(c => c.url.includes('/runs/run_42/input') && c.method === 'POST')).toBe(true));
        const inputCall = calls.find(c => c.url.includes('/input'))!;
        expect(inputCall.body).toEqual({ escalationId: 'esc_1', answer: 'yes' });
    });
});
