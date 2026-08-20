/**
 * ToolsHub — plan 047 §5: 10 rows from data/toolsHub.ts, status resolution,
 * coming-soon disabled, needs-setup → Guide, ready → widget, help rows,
 * first open unlocks the `tools` tier, clicks log tools-hub:open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), history: vi.fn() },
}));

import ToolsHub, { toolStatuses } from '../components/ToolsHub/ToolsHub';
import { TOOLS, HELP_ENTRIES, resolveToolStatus } from '../data/toolsHub';
import { onboardingStore, resetOnboarding } from '../lib/onboardingStore';
import { activityLogStore, resetActivityLog } from '../lib/activityLogStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';


// `openWidget()` dispatches a plain `dwellium:open-widget` CustomEvent (not a typed-bus emit) — capture it.
const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));
beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity('u-hub');
    onboardingStore.reset(); resetOnboarding();
    resetActivityLog(); activityLogStore.reset();
    opened.length = 0;
    window.addEventListener('dwellium:open-widget', onOpen);
});
afterEach(() => window.removeEventListener('dwellium:open-widget', onOpen));

describe('data', () => {
    it('lists exactly the ten plan-047 tools with license + phase', () => {
        expect(TOOLS).toHaveLength(10);
        expect(TOOLS.map(t => t.id)).toEqual(['whiteboard', 'esign', 'dictation', 'scheduling', 'broadcasts', 'links', 'photo-vault', 'design-studio', 'remote-support', 'appflowy']);
        for (const t of TOOLS) { expect(t.license).toMatch(/MIT|AGPL-3\.0|GPL-3\.0|MPL-2\.0/); expect([1, 2, 3]).toContain(t.phase); }
        expect(HELP_ENTRIES.map(h => h.action)).toEqual(['shortcuts', 'guide']);
    });
    it('resolveToolStatus: no widget → coming-soon; widget without env → needs-setup; both → ready', () => {
        const t = TOOLS.find(x => x.id === 'esign')!;
        expect(resolveToolStatus(t, () => false, {})).toBe('coming-soon');
        expect(resolveToolStatus(t, () => true, {})).toBe('needs-setup');
        expect(resolveToolStatus(t, () => true, { VITE_DOCUMENSO_URL: 'https://sign.example' })).toBe('ready');
        const wb = TOOLS.find(x => x.id === 'whiteboard')!; // no env gate
        expect(resolveToolStatus(wb, () => true, {})).toBe('ready');
        const fv = TOOLS.find(x => x.id === 'dictation')!; // companion install, never a widget — ready since its setup card shipped (plan 047 phase 1)
        expect(fv.companion).toBe(true);
        expect(resolveToolStatus(fv, () => true, {})).toBe('ready');
        expect(resolveToolStatus(fv, () => false, {})).toBe('ready');
    });
    it('today: whiteboard + dictation + design-studio ready; esign + scheduling + remote-support needs-setup; the rest coming-soon', () => {
        // Phase 2 launcher trio: design-studio has no env gate (launcher defaults to
        // Penpot's free cloud) so registering it alone makes it ready; scheduling +
        // remote-support wait on VITE_CALCOM_URL / VITE_RUSTDESK_RELAY.
        const READY = new Set(['whiteboard', 'dictation', 'design-studio']);
        const NEEDS_SETUP = new Set(['esign', 'scheduling', 'remote-support']);
        for (const { tool, status } of toolStatuses({})) {
            const want = READY.has(tool.id) ? 'ready' : NEEDS_SETUP.has(tool.id) ? 'needs-setup' : 'coming-soon';
            expect(status, tool.id).toBe(want);
        }
    });
    it('esign flips to ready once VITE_DOCUMENSO_URL is set (no code change)', () => {
        const esign = toolStatuses({ VITE_DOCUMENSO_URL: 'https://sign.example' }).find(r => r.tool.id === 'esign')!;
        expect(esign.status).toBe('ready');
    });
    it('scheduling + remote-support flip to ready off their envs (no code change)', () => {
        const rows = toolStatuses({ VITE_CALCOM_URL: 'https://cal.com/andy', VITE_RUSTDESK_RELAY: 'remote.example.com:21116,KEY' });
        expect(rows.find(r => r.tool.id === 'scheduling')!.status).toBe('ready');
        expect(rows.find(r => r.tool.id === 'remote-support')!.status).toBe('ready');
    });
});

describe('window', () => {
    it('renders 10 rows, disables coming-soon, offers Set up for the env-gated tools, shows help rows, unlocks the tools tier', () => {
        render(<ToolsHub />);
        expect(document.querySelectorAll('tbody tr')).toHaveLength(10);
        // Phase 2: whiteboard + dictation + design-studio ready, esign + scheduling
        // + remote-support needs-setup ("Set up"), 4 still coming-soon.
        const comingSoon = screen.getAllByRole('button', { name: 'Coming soon' });
        expect(comingSoon).toHaveLength(4);
        comingSoon.forEach(b => expect(b).toBeDisabled());
        expect(document.querySelector('tr[data-tool="whiteboard"]')?.getAttribute('data-status')).toBe('ready');
        expect(document.querySelector('tr[data-tool="dictation"]')?.getAttribute('data-status')).toBe('ready');
        expect(document.querySelector('tr[data-tool="design-studio"]')?.getAttribute('data-status')).toBe('ready');
        expect(document.querySelector('tr[data-tool="scheduling"]')?.getAttribute('data-status')).toBe('needs-setup');
        expect(document.querySelector('tr[data-tool="remote-support"]')?.getAttribute('data-status')).toBe('needs-setup');
        const setUp = screen.getAllByRole('button', { name: 'Set up' });
        expect(setUp).toHaveLength(3); // esign + scheduling + remote-support
        setUp.forEach(b => expect(b).toBeEnabled());
        fireEvent.click(setUp[0]); // needs-setup → opens the Guide's setup notes
        expect(opened).toEqual(['guide']);
        expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Guide' })).toBeInTheDocument();
        expect(onboardingStore.getSnapshot().unlockedTiers).toEqual(['tools']);
    });
    it('ready companion (dictation) opens the Control Panel — its setup card lives there', () => {
        render(<ToolsHub />);
        const row = document.querySelector('tr[data-tool="dictation"]')!;
        fireEvent.click(row.querySelector('button')!);
        expect(opened).toEqual(['control-panel']);
    });
    it('help rows: shortcuts dispatches dwellium:open-shortcuts; Guide opens the guide widget', () => {
        const sheet = vi.fn();
        window.addEventListener('dwellium:open-shortcuts', sheet);
        render(<ToolsHub />);
        fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
        expect(sheet).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
        expect(opened).toEqual(['guide']);
        window.removeEventListener('dwellium:open-shortcuts', sheet);
    });
});
