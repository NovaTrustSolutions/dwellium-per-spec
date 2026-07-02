/**
 * ModelSelect — Task B UI. Covers the four behaviors from SPEC §B9:
 *   • dynamic list render (curated ∪ fetched ∪ current selection),
 *   • fallback-on-error (fetch fails → curated list still usable + notice),
 *   • custom override ("Custom…" reveals a free-text input),
 *   • selection + fetched-list persistence hooks fire (onSelect / onModelsFetched).
 * The <select> is queried by its label to also assert the a11y association.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ModelSelect } from '../components/ControlPanel/ModelSelect';
import type { ModelListResult } from '../lib/llmClient';

beforeEach(() => cleanup());

function optionValues(): string[] {
    const select = screen.getByLabelText('Model') as HTMLSelectElement;
    return Array.from(select.querySelectorAll('option')).map(o => o.value);
}

describe('ModelSelect — dynamic list render', () => {
    it('merges curated + cached + current value and always offers Custom…', () => {
        render(
            <ModelSelect
                value="my-saved-model"
                curated={['curated-a', 'curated-b']}
                cachedModels={['fetched-x']}
                canFetch={false}
                fetchModels={async () => ({ models: [] })}
                onSelect={() => {}}
                onModelsFetched={() => {}}
            />,
        );
        const values = optionValues();
        expect(values).toContain('curated-a');
        expect(values).toContain('curated-b');
        expect(values).toContain('fetched-x');
        expect(values).toContain('my-saved-model'); // saved value never dropped (SPEC §B4.5)
        expect(values).toContain('__custom__');       // Custom… escape hatch (SPEC §B4.4)
        // Current value is the selected one.
        expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('my-saved-model');
    });
});

describe('ModelSelect — fallback on error', () => {
    it('shows the curated list + a notice when the live fetch fails', async () => {
        const fetchModels = vi.fn(async (): Promise<ModelListResult> => ({ models: [], error: 'boom' }));
        render(
            <ModelSelect
                value="gpt-4o-mini"
                curated={['gpt-4o-mini', 'gpt-4o']}
                canFetch={true}
                fetchModels={fetchModels}
                onSelect={() => {}}
                onModelsFetched={() => {}}
            />,
        );
        // Auto-fetch fires once because the cache is empty + canFetch.
        await waitFor(() => expect(fetchModels).toHaveBeenCalledTimes(1));
        await screen.findByText(/Using fallback list/);
        // Curated options remain usable.
        expect(optionValues()).toEqual(expect.arrayContaining(['gpt-4o-mini', 'gpt-4o', '__custom__']));
    });
});

describe('ModelSelect — custom override', () => {
    it('reveals a free-text input on Custom… and routes typing through onSelect', () => {
        const onSelect = vi.fn();
        render(
            <ModelSelect
                value="curated-a"
                curated={['curated-a']}
                canFetch={false}
                fetchModels={async () => ({ models: [] })}
                onSelect={onSelect}
                onModelsFetched={() => {}}
            />,
        );
        // No custom input until Custom… is chosen.
        expect(screen.queryByLabelText('Model (custom)')).toBeNull();
        fireEvent.change(screen.getByLabelText('Model'), { target: { value: '__custom__' } });
        const custom = screen.getByLabelText('Model (custom)');
        fireEvent.change(custom, { target: { value: 'org/my-fine-tune:v3' } });
        expect(onSelect).toHaveBeenCalledWith('org/my-fine-tune:v3');
    });

    it('persists a normal selection via onSelect', () => {
        const onSelect = vi.fn();
        render(
            <ModelSelect
                value="curated-a"
                curated={['curated-a', 'curated-b']}
                canFetch={false}
                fetchModels={async () => ({ models: [] })}
                onSelect={onSelect}
                onModelsFetched={() => {}}
            />,
        );
        fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'curated-b' } });
        expect(onSelect).toHaveBeenCalledWith('curated-b');
    });
});

describe('ModelSelect — live fetch caches into the bundle', () => {
    it('calls onModelsFetched with the fetched list (persistence hook)', async () => {
        const onModelsFetched = vi.fn();
        const fetchModels = vi.fn(async (): Promise<ModelListResult> => ({ models: ['m1', 'm2'] }));
        render(
            <ModelSelect
                value="m1"
                curated={[]}
                canFetch={true}
                fetchModels={fetchModels}
                onSelect={() => {}}
                onModelsFetched={onModelsFetched}
            />,
        );
        await waitFor(() => expect(onModelsFetched).toHaveBeenCalledWith(['m1', 'm2']));
    });

    it('does not auto-fetch when it cannot (no key / base URL)', async () => {
        const fetchModels = vi.fn(async (): Promise<ModelListResult> => ({ models: [] }));
        render(
            <ModelSelect
                value="x"
                curated={['x']}
                canFetch={false}
                fetchModels={fetchModels}
                onSelect={() => {}}
                onModelsFetched={() => {}}
            />,
        );
        // Give any stray effect a tick.
        await new Promise(r => setTimeout(r, 0));
        expect(fetchModels).not.toHaveBeenCalled();
    });
});
