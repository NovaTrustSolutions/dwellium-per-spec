/**
 * Interactive Docs — mode root smoke: library → Blank → editor → Present →
 * Esc; widget-action bus verb registered + consumed. Real timers only.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach } from 'vitest';
import InteractiveDocs from '../components/Scribe/idocs/InteractiveDocs';
import { idocsStore, idocsUserIdHolder } from '../components/Scribe/idocs/idocsStore';
import { consumePendingWidgetAction, performWidgetAction, supportsWidgetAction } from '../lib/widgetActions';

class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(cleanup);
beforeEach(() => {
    localStorage.clear();
    idocsStore.reset();
    idocsUserIdHolder.current = null;
    consumePendingWidgetAction('scribe');
});

describe('InteractiveDocs', () => {
    it('library → Blank → editor autosaves → Present overlay → Esc back to editor', async () => {
        render(<InteractiveDocs />);
        expect(screen.getByRole('heading', { name: 'Interactive Docs' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Blank' }));
        const title = await screen.findByLabelText('Document title');
        fireEvent.change(title, { target: { value: 'My First Doc' } });
        expect(idocsStore.getSnapshot().docs[0].title).toBe('My First Doc');
        fireEvent.click(screen.getByRole('button', { name: '▶ Present' }));
        expect(await screen.findByTestId('idoc-present')).toBeInTheDocument();
        await waitFor(() => expect(idocsStore.getSnapshot().docs[0].analytics.views).toBe(1));
        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByTestId('idoc-present')).toBeNull());
        expect(screen.getByLabelText('Document title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '← Library' }));
        expect(await screen.findByText('My First Doc')).toBeInTheDocument();
    });

    it('registers scribe.create-interactive-doc and, without an LLM, prefills the composer', async () => {
        expect(supportsWidgetAction('scribe', 'create-interactive-doc')).toBe(true);
        expect(performWidgetAction('scribe', 'create-interactive-doc', { text: 'Onboarding for new tenants' })).toBe(true);
        render(<InteractiveDocs />);
        const prompt = await screen.findByLabelText('Prompt');
        expect((prompt as HTMLTextAreaElement).value).toBe('Onboarding for new tenants');
        expect(consumePendingWidgetAction('scribe')).toBeNull(); // consumed on mount
    });
});
