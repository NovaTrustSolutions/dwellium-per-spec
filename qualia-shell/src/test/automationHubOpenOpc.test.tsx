/**
 * Automation Hub — OpenOPC "AI Company" row + console wiring.
 *
 * Asserts the seeded `auto-opc-company` automation renders in the existing hub
 * (Andy's Software Automations) with no regression, exposes an "Open console"
 * button, and that clicking it mounts the OpenOpcPanel (safety banner shown).
 * fetch is stubbed 503 so the panel's config probe lands in the honest
 * unconfigured state without ever touching a network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import AutomationHub from '../components/AutomationHub/AutomationHub';

beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ needsSetup: true }) } as Response)));
    vi.stubGlobal('EventSource', class { close() {} } as unknown as typeof EventSource);
    cleanup();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('AutomationHub · AI Company (OpenOPC)', () => {
    it('renders the AI Company row with an Open console button', () => {
        render(<AutomationHub />);
        expect(screen.getByText('AI Company (OpenOPC)')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Open console/i })).toBeTruthy();
    });

    it('Open console mounts the panel with the mandatory safety banner', async () => {
        render(<AutomationHub />);
        fireEvent.click(screen.getByRole('button', { name: /Open console/i }));
        expect(await screen.findByText(/execute code, edit files, and drive a browser autonomously/i)).toBeTruthy();
        // Non-negotiable framing (banner wording): never inside Dwellium / against tenant data.
        expect(screen.getByText(/never inside Dwellium\s+or against tenant\/financial data/i)).toBeTruthy();
    });
});
