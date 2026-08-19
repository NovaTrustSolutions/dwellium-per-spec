/**
 * DemoBanner — plan 046 D2: dismiss-proof "Demo data" strip on Strata + Astra.
 * Off → renders nothing. On → role=status, two CTAs, no close/dismiss control.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

import { DemoBanner } from '../components/common/DemoBanner';
import { demoWorkspaceStore, setDemoWorkspace } from '../lib/demoWorkspaceStore';

beforeEach(() => {
    demoWorkspaceStore.reset();
    localStorage.clear();
});

describe('DemoBanner', () => {
    it('renders nothing when the demo workspace is off', () => {
        const { container } = render(<DemoBanner />);
        expect(container.firstChild).toBeNull();
    });

    it('on: status banner, two CTAs, no dismiss control', () => {
        setDemoWorkspace(true);
        render(<DemoBanner />);
        const status = screen.getByRole('status');
        expect(status.textContent).toMatch(/Demo data/);
        expect(screen.getAllByRole('button')).toHaveLength(2);
        expect(screen.queryByLabelText(/close|dismiss/i)).toBeNull();
    });

    it('"Replace with your data" opens the Control Panel via dwellium:open-widget', () => {
        setDemoWorkspace(true);
        const seen: string[] = [];
        const listener = (e: Event) => { seen.push((e as CustomEvent).detail?.widgetId); };
        window.addEventListener('dwellium:open-widget', listener);
        render(<DemoBanner />);
        fireEvent.click(screen.getByRole('button', { name: /Replace with your data/i }));
        window.removeEventListener('dwellium:open-widget', listener);
        expect(seen).toContain('control-panel');
    });
});
