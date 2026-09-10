/**
 * AutomationHub — sample-catalog isolation (item 3 fix).
 *
 * Old behavior: AUTOMATIONS_SEED (9 Andy + 14 Lisa hardcoded rows) was
 * merged into the user's own localStorage-backed automation list on every
 * mount whenever any AUTOMATIONS_SEED id was missing from the cache — which
 * is always true for a user who only ever created their own rows. The
 * summary bar's "Total" / "Andy's Workflows" stats then counted the merged
 * total, e.g. "9 total · 9 Andy's workflows" even before the user added a
 * single real automation, and any real rows a user did add got silently
 * padded with 9 more.
 *
 * Fix: the catalog is seeded only into an EMPTY store; seeded rows carry
 * `seeded: true` and a visible "Sample" badge; Total/Workflows count only
 * non-seeded rows, with seeded rows reported separately as "Samples".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AutomationHub from '../components/AutomationHub/AutomationHub';

const STORAGE_KEY = 'qualia_automation_hub_automations';
// The exact title of one AUTOMATIONS_SEED row — used to prove the catalog
// never leaks into a store that already has the user's own data.
const KNOWN_SEED_TITLE = 'Zero-Touch Transcript Pipeline';

function realAutomation(id: string, name: string) {
    return {
        id, name, description: 'A real, user-created automation.', category: 'software',
        icon: 'bolt', setupTime: '1h', annualSaved: '10h', integrations: [],
        status: 'draft',
        schedule: { enabled: false, frequency: 'manual', time: '09:00' },
        notifications: { onSuccess: false, onFailure: true, email: '' },
        retryPolicy: { maxRetries: 0, retryDelay: 30 },
        timeout: 300, envVars: {}, tags: [], notes: '',
        requiresApproval: false, owner: 'andy', setupGuide: [],
        // Deliberately no `seeded` flag — this is real, user-owned data.
    };
}

/** Reads a "<value>\n<label>" summary-bar stat by its label text. */
function statValueFor(label: string | RegExp): string {
    const labelEl = screen.getByText(label);
    return labelEl.previousElementSibling?.textContent ?? '';
}

beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('backend offline'))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('AutomationHub · sample catalog stays out of real data (item 3 fix)', () => {
    it('does not merge the sample catalog into a store that already has real rows', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([
            realAutomation('real-1', 'Real Automation One'),
            realAutomation('real-2', 'Real Automation Two'),
        ]));
        render(<AutomationHub />);

        expect(screen.getByText('Real Automation One')).toBeTruthy();
        expect(screen.getByText('Real Automation Two')).toBeTruthy();
        // Old bug: this well-known seed title would also render here.
        expect(screen.queryByText(KNOWN_SEED_TITLE)).toBeNull();
    });

    it('Total and Workflows read 2/2 for a store holding 2 real rows + the catalog, not 11', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([
            realAutomation('real-1', 'Real Automation One'),
            realAutomation('real-2', 'Real Automation Two'),
        ]));
        render(<AutomationHub />);

        expect(statValueFor('Total')).toBe('2');
        expect(statValueFor(/Workflows/)).toBe('2');
        expect(statValueFor('Total')).not.toBe('11');
    });

    it('an empty store still seeds the catalog, tags rows seeded, and reports them as Samples (not Total)', () => {
        render(<AutomationHub />); // no localStorage entry at all → empty-store branch

        expect(statValueFor('Total')).toBe('0');
        expect(statValueFor(/Workflows/)).toBe('0');
        const samples = Number(statValueFor('Samples'));
        expect(samples).toBeGreaterThan(0); // Andy's 9 seed rows
        expect(screen.getAllByText('Sample').length).toBe(samples);
        expect(screen.getByText(KNOWN_SEED_TITLE)).toBeTruthy();
    });
});
