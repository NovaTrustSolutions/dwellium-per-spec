/**
 * CommunicationModule — honest Forms tab (follow-up to 945c6d2 / ea6cb34 /
 * 069c3e9 / bd5601a; same bug class, the one hit left by the 2026-09-06 sweep
 * of every Strata module — see Docs/code.md).
 *
 * Old behavior: FORM_TEMPLATES carried invented `submissions` counts (12 / 8 /
 * 34 / 19 / 6 / 3) rendered as "N submissions" beside every form template on
 * every account, next to a dead "New Form" button with no handler.
 *
 * Fix: the six templates stay (a catalog, not data); the counts and the dead
 * button are gone and the card header carries the shared <NotYet> chip. No
 * forms / submissions route exists in strataApi.static.ts, strataApi.backend.ts
 * or the sibling backend's dwelliumRoutes.ts (it serves only /communications
 * and /communication-log).
 *
 * Same day: the inbox row was a mouse-only div and the letter buttons only
 * highlighted on hover (4 jsx-a11y errors). The row is now role=button with an
 * Enter/Space handler sharing the click path; the buttons have focus/blur twins.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../context/UserContext')>();
    return { ...actual, useUser: () => ({ hasPermission: () => true, user: { id: 'test' } }) };
});

vi.mock('../../services/sentry', () => ({
    Sentry: { addBreadcrumb: () => {} },
    isEnabled: () => false,
}));

// Mutable per-test fixture — the strataApi mock reads it at call time.
let messages: unknown = [];

vi.mock('../../components/StrataDashboard/strataApi', () => ({
    strataGet: async (path: string) => (path === '/communications' ? messages : []),
    strataPost: async () => ({}),
    strataPut: async () => ({}),
    strataDelete: async () => ({}),
}));

import CommunicationModule from '../../components/StrataDashboard/modules/CommunicationModule';

const FORM_NAMES = [
    'Move-In Inspection Form', 'Move-Out Inspection Form', 'Maintenance Request Form',
    'Rental Application', 'Pet Agreement Form', 'Parking Spot Request',
];
const OLD_FAKE_STRINGS = ['12 submissions', '8 submissions', '34 submissions', '19 submissions', '6 submissions', '3 submissions'];

beforeEach(() => { messages = []; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Render, wait for the /communications fetch to settle, then optionally open a
 * sub-tab by its button label. */
async function renderAndOpen(tabName?: string) {
    render(<CommunicationModule />);
    await waitFor(() => expect(screen.queryByText('Loading messages…')).toBeNull());
    if (tabName) fireEvent.click(screen.getByRole('button', { name: tabName }));
}

describe('CommunicationModule · Forms is a template catalog, never invented submission counts', () => {
    it('Forms: the six template names render with no "N submissions" counter, no dead New Form button, and a Coming-soon chip', async () => {
        await renderAndOpen('Forms');
        for (const name of FORM_NAMES) expect(screen.getByText(name), name).toBeTruthy();
        for (const s of OLD_FAKE_STRINGS) expect(screen.queryByText(s), s).toBeNull();
        expect(screen.queryByText(/[0-9]+ submissions/)).toBeNull(); // the NotYet chip may say "submissions" honestly; a counter may not
        expect(screen.queryByRole('button', { name: /New Form/ })).toBeNull();
        expect(screen.getByRole('note')).toHaveTextContent(/Coming soon/);
    });

    it('Letters: the template catalog renders without counters', async () => {
        await renderAndOpen('Letters');
        expect(screen.getByText('3-Day Notice to Pay or Quit')).toBeTruthy();
        expect(screen.getByText('Welcome Letter')).toBeTruthy();
        expect(screen.queryByText(/submissions|sent [0-9]/)).toBeNull();
    });

    it('Inbox: empty account → honest empty state', async () => {
        await renderAndOpen();
        expect(screen.getByText('No messages found')).toBeTruthy();
    });

    it('Inbox: real /communications rows render and open', async () => {
        messages = [{
            id: 'c1', channel: 'email', direction: 'inbound', subject: 'Water heater question',
            fromAddress: 'tenant@dwellium.example', toAddress: 'office@dwellium.example',
            preview: '', body: 'Is the heater covered by the lease?', createdAt: '2026-09-01T12:00:00.000Z',
        }];
        await renderAndOpen();
        expect(await screen.findByText('Water heater question')).toBeTruthy();
        fireEvent.click(screen.getByText('Water heater question'));
        expect(screen.getByText('Is the heater covered by the lease?')).toBeTruthy();
        expect(screen.queryByText('No messages found')).toBeNull();
    });

    it('Inbox: message rows are keyboard-operable — role=button, tab stop, Enter and Space open them', async () => {
        messages = [
            { id: 'c1', channel: 'email', direction: 'inbound', subject: 'Water heater question', fromAddress: 'tenant@dwellium.example', toAddress: 'office@dwellium.example', preview: '', body: 'Is the heater covered by the lease?', createdAt: '2026-09-01T12:00:00.000Z' },
            { id: 'c2', channel: 'sms', direction: 'outbound', subject: 'Parking reminder', fromAddress: 'office@dwellium.example', toAddress: 'tenant@dwellium.example', preview: '', body: 'Lot B closes Friday for restriping.', createdAt: '2026-09-02T12:00:00.000Z' },
        ];
        await renderAndOpen();
        const first = await screen.findByRole('button', { name: /Water heater question/ });
        const second = screen.getByRole('button', { name: /Parking reminder/ });
        expect(first).toHaveAttribute('tabindex', '0');

        fireEvent.keyDown(first, { key: 'Enter' });
        expect(screen.getByText('Is the heater covered by the lease?')).toBeTruthy();

        fireEvent.keyDown(second, { key: ' ' });
        expect(screen.getByText('Lot B closes Friday for restriping.')).toBeTruthy();
        expect(screen.queryByText('Is the heater covered by the lease?')).toBeNull();
    });

    it('Letters: template buttons highlight on keyboard focus and reset on blur (twins of the hover handlers)', async () => {
        await renderAndOpen('Letters');
        const btn = screen.getByRole('button', { name: /3-Day Notice to Pay or Quit/ });
        fireEvent.focus(btn);
        expect(btn.style.borderColor).toMatch(/239, 68, 68|#ef4444/); // lt.color for the 3-day notice
        fireEvent.blur(btn);
        expect(btn.style.borderColor).toMatch(/255, ?255, ?255, ?0\.06/);
    });
});
