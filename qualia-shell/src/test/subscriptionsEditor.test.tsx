/**
 * SubscriptionsEditor — plan 068 phase 2 (D4). Uses the REAL subscriptionsStore
 * (reset per test) with a mocked oneSaveClient, sister pattern to
 * subscriptionsPerUser.test.ts. ONE_SAVE_ENABLED is false here so `set()`
 * behaves as plain localStorage — no debounced network writes to await.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), history: vi.fn() },
}));

import { setPerUserIdentity } from '../lib/perUserIdentity';
import { saveSubscriptions, subscriptionsStore, type Subscription } from '../lib/subscriptionsStore';
import SubscriptionsEditor from '../components/AiSpend/SubscriptionsEditor';

// The exact sample list plan 068 phase 1 stopped shipping as a default —
// withoutUnconfirmedDefaults hides it even if it's already persisted.
const OLD_SHIPPED_DEFAULTS: Subscription[] = [
    { id: 'claude-max', name: 'Claude Max 20x', vendor: '', monthly: 200 },
    { id: 'chatgpt-plus', name: 'ChatGPT Plus', vendor: '', monthly: 20 },
    { id: 'codex', name: 'Codex', vendor: '', monthly: 0 },
];

beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity(null);
    subscriptionsStore.reset();
});

afterEach(() => {
    vi.clearAllMocks();
});

function nameInputFor(row: number) {
    return screen.getByLabelText(`Name for row ${row}`);
}
function priceInputFor(row: number) {
    return screen.getByLabelText(`Monthly price for row ${row}`);
}

describe('SubscriptionsEditor — empty state', () => {
    it('shows the honest empty-state copy with no default subscriptions', () => {
        render(<SubscriptionsEditor />);
        expect(screen.getByText('No subscriptions yet — add the AI plans you pay for.')).toBeInTheDocument();
        expect(screen.queryByText(/Claude Max/)).not.toBeInTheDocument();
    });
});

describe('SubscriptionsEditor — add + save', () => {
    it('persists a trimmed name and a price rounded to cents', () => {
        render(<SubscriptionsEditor />);
        fireEvent.click(screen.getByRole('button', { name: 'Add subscription' }));

        fireEvent.change(nameInputFor(1), { target: { value: '  Claude Max  ' } });
        fireEvent.change(priceInputFor(1), { target: { value: '19.995' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        const stored = subscriptionsStore.getSnapshot();
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe('Claude Max');
        expect(stored[0].monthly).toBeCloseTo(20, 2);
        expect(stored[0].id).toMatch(/^claude-max-\d+$/);
        expect(screen.getByText('Saved')).toBeInTheDocument();
    });
});

describe('SubscriptionsEditor — remove + save', () => {
    it('removes a row from the draft and persists the shorter list', () => {
        saveSubscriptions([
            { id: 'a', name: 'Claude Max', vendor: '', monthly: 200 },
            { id: 'b', name: 'ChatGPT Plus', vendor: '', monthly: 20 },
        ]);
        render(<SubscriptionsEditor />);

        fireEvent.click(screen.getByRole('button', { name: 'Remove Claude Max' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        const stored = subscriptionsStore.getSnapshot();
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe('ChatGPT Plus');
    });
});

describe('SubscriptionsEditor — cancel', () => {
    it('reverts the draft to the store value without saving', () => {
        saveSubscriptions([{ id: 'a', name: 'Claude Max', vendor: '', monthly: 200 }]);
        render(<SubscriptionsEditor />);

        fireEvent.change(nameInputFor(1), { target: { value: 'Something else' } });
        expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect((nameInputFor(1) as HTMLInputElement).value).toBe('Claude Max');
        expect(subscriptionsStore.getSnapshot()[0].name).toBe('Claude Max');
    });
});

describe('SubscriptionsEditor — Save disabled + reason', () => {
    it('disables Save for an empty name and shows the reason', () => {
        render(<SubscriptionsEditor />);
        fireEvent.click(screen.getByRole('button', { name: 'Add subscription' }));

        const save = screen.getByRole('button', { name: 'Save' });
        expect(save).toBeDisabled();
        expect(screen.getByText('Row 1: name is required')).toBeInTheDocument();
        expect(save).toHaveAttribute('aria-describedby', 'subed-save-reason');
    });

    it('disables Save for a negative price and shows the reason', () => {
        render(<SubscriptionsEditor />);
        fireEvent.click(screen.getByRole('button', { name: 'Add subscription' }));
        fireEvent.change(nameInputFor(1), { target: { value: 'Claude Max' } });
        fireEvent.change(priceInputFor(1), { target: { value: '-5' } });

        const save = screen.getByRole('button', { name: 'Save' });
        expect(save).toBeDisabled();
        expect(screen.getByText('Row 1: monthly price must be 0 or more')).toBeInTheDocument();
    });

    it('disables Save when nothing has changed', () => {
        saveSubscriptions([{ id: 'a', name: 'Claude Max', vendor: '', monthly: 200 }]);
        render(<SubscriptionsEditor />);
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
});

describe('SubscriptionsEditor — external store changes', () => {
    it('a clean draft follows an external store change', () => {
        render(<SubscriptionsEditor />);
        expect(screen.getByText('No subscriptions yet — add the AI plans you pay for.')).toBeInTheDocument();

        act(() => {
            saveSubscriptions([{ id: 'a', name: 'Claude Max', vendor: '', monthly: 200 }]);
        });

        expect(screen.getByText('$200.00 / month')).toBeInTheDocument();
        expect((nameInputFor(1) as HTMLInputElement).value).toBe('Claude Max');
    });

    it('unsaved edits survive an external store change', () => {
        saveSubscriptions([{ id: 'a', name: 'Claude Max', vendor: '', monthly: 200 }]);
        render(<SubscriptionsEditor />);

        fireEvent.change(nameInputFor(1), { target: { value: 'Still typing' } });

        // Another device/tab writes to the store while this draft is dirty.
        act(() => {
            saveSubscriptions([
                { id: 'a', name: 'Claude Max', vendor: '', monthly: 200 },
                { id: 'b', name: 'ChatGPT Plus', vendor: '', monthly: 20 },
            ]);
        });

        expect((nameInputFor(1) as HTMLInputElement).value).toBe('Still typing');
    });
});

describe('SubscriptionsEditor — old sample list', () => {
    it('renders as empty and saving replaces the persisted sample list', () => {
        saveSubscriptions(OLD_SHIPPED_DEFAULTS);
        render(<SubscriptionsEditor />);
        expect(screen.getByText('No subscriptions yet — add the AI plans you pay for.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Add subscription' }));
        fireEvent.change(nameInputFor(1), { target: { value: 'Real Plan' } });
        fireEvent.change(priceInputFor(1), { target: { value: '9' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        const stored = subscriptionsStore.getSnapshot();
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe('Real Plan');
    });
});

describe('SubscriptionsEditor — heading', () => {
    it('shows its own heading by default and hides it when a parent titles it', () => {
        const { unmount } = render(<SubscriptionsEditor />);
        expect(screen.getByRole('heading', { name: 'Subscriptions' })).toBeTruthy();
        unmount();
        render(<SubscriptionsEditor showHeading={false} />);
        expect(screen.queryByRole('heading', { name: 'Subscriptions' })).toBeNull();
    });
});

describe('SubscriptionsEditor — new ids are unique', () => {
    it('two new rows with the same name saved in the same millisecond get different ids', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        render(<SubscriptionsEditor />);
        fireEvent.click(screen.getByRole('button', { name: /add subscription/i }));
        fireEvent.change(screen.getByLabelText('Name for row 1'), { target: { value: 'Same Plan' } });
        fireEvent.change(screen.getByLabelText('Monthly price for row 1'), { target: { value: '10' } });
        fireEvent.click(screen.getByRole('button', { name: /add subscription/i }));
        fireEvent.change(screen.getByLabelText('Name for row 2'), { target: { value: 'Same Plan' } });
        fireEvent.change(screen.getByLabelText('Monthly price for row 2'), { target: { value: '20' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        const ids = subscriptionsStore.getSnapshot().map((s) => s.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        vi.restoreAllMocks();
    });
});
