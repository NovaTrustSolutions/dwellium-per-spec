/**
 * Interactive Docs wave 2 — presenter view. BroadcastChannel is stubbed with a
 * synchronous in-memory fan-out so main ⇄ presenter messaging is deterministic
 * (real timers only; the panel's 1 s clock/timer interval is never advanced).
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import PresenterHost, { PresenterPanel, blockText, fmtTimer, openPresenterTransport, type PresenterMsg } from '../components/Scribe/idocs/PresenterView';
import InteractiveDocs from '../components/Scribe/idocs/InteractiveDocs';
import { createDoc, findCard, idocsStore, idocsUserIdHolder } from '../components/Scribe/idocs/idocsStore';
import { createEmptyCard, createEmptyDoc } from '../components/Scribe/idocs/idocTypes';

// ── BroadcastChannel stub: every instance with the same name receives everyone else's posts ──
const channels = new Map<string, Set<StubChannel>>();
class StubChannel {
    onmessage: ((e: { data: PresenterMsg }) => void) | null = null;
    constructor(public name: string) { if (!channels.has(name)) channels.set(name, new Set()); channels.get(name)!.add(this); }
    postMessage(data: PresenterMsg) { channels.get(this.name)?.forEach((c) => { if (c !== this) c.onmessage?.({ data }); }); }
    close() { channels.get(this.name)?.delete(this); }
}
class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('BroadcastChannel', StubChannel); vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(() => { cleanup(); channels.clear(); });
beforeEach(() => { localStorage.clear(); idocsStore.reset(); idocsUserIdHolder.current = null; });

const deck = () => createEmptyDoc({
    id: 'doc1', title: 'Deck',
    cards: [
        createEmptyCard({ id: 'c1', title: 'One', notes: 'say hi', blocks: [{ id: 'b1', type: 'heading', level: 2, text: 'Welcome' }, { id: 'b2', type: 'text', md: 'intro' }] }),
        createEmptyCard({ id: 'c2', title: 'Two', blocks: [{ id: 'b3', type: 'button', label: 'Go', href: '#', variant: 'primary' }] }),
        createEmptyCard({ id: 'c3', title: 'Three', blocks: [] }),
    ],
});

describe('PresenterView', () => {
    it('helpers: blockText per type, fmtTimer, transport fan-out (own posts are not echoed)', () => {
        expect(blockText({ id: 'x', type: 'heading', level: 1, text: 'H' })).toBe('H');
        expect(blockText({ id: 'x', type: 'text', md: 'm' })).toBe('m');
        expect(blockText({ id: 'x', type: 'image', src: 's', alt: 'alt' })).toBe('alt');
        expect(blockText({ id: 'x', type: 'steps', items: [{ title: 'a', md: '' }, { title: 'b', md: '' }] })).toBe('a · b');
        expect(blockText({ id: 'x', type: 'divider' })).toBe('―');
        expect(fmtTimer(0)).toBe('00:00');
        expect(fmtTimer(125)).toBe('02:05');
        const a = vi.fn(); const b = vi.fn();
        const ta = openPresenterTransport(a); const tb = openPresenterTransport(b);
        ta.post({ type: 'nav', delta: 1 });
        expect(b).toHaveBeenCalledWith({ type: 'nav', delta: 1 });
        expect(a).not.toHaveBeenCalled();
        ta.close(); tb.close();
    });

    it('main → presenter: a state message updates the presenter index; presenter ← → posts nav', () => {
        const doc = deck();
        const seen: PresenterMsg[] = [];
        const main = openPresenterTransport((m) => seen.push(m));
        render(<PresenterPanel doc={doc} initialIndex={0} inline />);
        expect(screen.getByTestId('idoc-presenter-count')).toHaveTextContent('1 / 3');
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('One');
        expect(screen.getByRole('region', { name: 'Next card' })).toHaveTextContent('Two');
        expect(screen.getByRole('region', { name: 'Current card' })).toHaveTextContent('Welcome');
        act(() => main.post({ type: 'state', docId: 'doc1', index: 2 }));
        expect(screen.getByTestId('idoc-presenter-count')).toHaveTextContent('3 / 3');
        expect(screen.getByRole('region', { name: 'Next card' })).toHaveTextContent('End of deck');
        act(() => main.post({ type: 'state', docId: 'other', index: 0 })); // other doc → ignored
        expect(screen.getByTestId('idoc-presenter-count')).toHaveTextContent('3 / 3');
        fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
        expect(seen).toEqual([{ type: 'nav', delta: -1 }]);
        expect(screen.getByTestId('idoc-presenter-count')).toHaveTextContent('2 / 3');
        // timer controls exist and toggle
        const start = screen.getByRole('button', { name: 'Start' });
        fireEvent.click(start);
        expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
        expect(screen.getByTestId('idoc-presenter-timer')).toHaveTextContent('00:00');
        expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
        main.close();
    });

    it('notes edit calls updateCard (live) — store reflects the change', () => {
        const d = createDoc({ title: deck().title, cards: deck().cards });
        render(<PresenterPanel doc={d} initialIndex={0} inline />);
        const notes = screen.getByLabelText('Presenter notes (live)') as HTMLTextAreaElement;
        expect(notes.value).toBe('say hi');
        fireEvent.change(notes, { target: { value: 'say hello' } });
        expect(findCard(idocsStore.getSnapshot().docs[0].cards, 'c1')!.notes).toBe('say hello');
        fireEvent.change(notes, { target: { value: '' } });
        expect(findCard(idocsStore.getSnapshot().docs[0].cards, 'c1')!.notes).toBeUndefined();
    });

    it('PresenterHost: popup blocked → inline panel; presenter nav drives the main index; main index broadcasts state', () => {
        vi.spyOn(window, 'open').mockReturnValue(null);
        const doc = deck();
        const onIndex = vi.fn(); const onClose = vi.fn();
        const seen: PresenterMsg[] = [];
        const spy = openPresenterTransport((m) => seen.push(m));
        const { rerender } = render(<PresenterHost doc={doc} index={0} onIndex={onIndex} onClose={onClose} />);
        expect(screen.getByTestId('idoc-presenter')).toHaveClass('scribe-idocs-pv--inline');
        expect(seen).toContainEqual({ type: 'state', docId: 'doc1', index: 0 });
        fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
        expect(onIndex).toHaveBeenCalledWith(1);
        rerender(<PresenterHost doc={doc} index={1} onIndex={onIndex} onClose={onClose} />);
        expect(seen).toContainEqual({ type: 'state', docId: 'doc1', index: 1 });
        expect(screen.getByTestId('idoc-presenter-count')).toHaveTextContent('2 / 3');
        // clamps at the end
        rerender(<PresenterHost doc={doc} index={2} onIndex={onIndex} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
        expect(onIndex).toHaveBeenLastCalledWith(1);
        fireEvent.click(screen.getByRole('button', { name: 'Close presenter view' }));
        expect(onClose).toHaveBeenCalled();
        spy.close();
    });

    it('PresenterHost: popup available → renders into the popup document (stylesheets copied) and closes it on unmount', () => {
        const popDoc = document.implementation.createHTMLDocument('popup');
        const style = document.createElement('style'); style.textContent = '.x{}'; document.head.appendChild(style);
        const listeners: Record<string, () => void> = {};
        const fakeWin = {
            document: popDoc, closed: false,
            close: vi.fn(), addEventListener: (n: string, f: () => void) => { listeners[n] = f; }, removeEventListener: vi.fn(),
        } as unknown as Window;
        vi.spyOn(window, 'open').mockReturnValue(fakeWin);
        const doc = deck();
        const onClose = vi.fn();
        const { unmount, rerender } = render(<PresenterHost doc={doc} index={0} onIndex={vi.fn()} onClose={onClose} />);
        expect(screen.queryByTestId('idoc-presenter')).toBeNull(); // nothing inline
        expect(popDoc.title).toBe('Presenter — Deck');
        expect(popDoc.head.querySelector('style')?.textContent).toBe('.x{}');
        expect(popDoc.querySelector('[data-testid="idoc-presenter-count"]')?.textContent).toBe('1 / 3');
        rerender(<PresenterHost doc={doc} index={1} onIndex={vi.fn()} onClose={onClose} />);
        expect(popDoc.querySelector('[data-testid="idoc-presenter-count"]')?.textContent).toBe('2 / 3');
        // user closes the popup → host reports close
        act(() => listeners.pagehide?.());
        expect(onClose).toHaveBeenCalled();
        unmount();
        expect((fakeWin.close as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
        style.remove();
    });

    it('InteractiveDocs: Present is controlled + "Presenter view" button toggles the (blocked-popup) inline panel in sync', async () => {
        vi.spyOn(window, 'open').mockReturnValue(null);
        const d = createDoc({ title: deck().title, cards: deck().cards });
        render(<InteractiveDocs />);
        await screen.findByLabelText('Document title');
        fireEvent.click(screen.getByRole('button', { name: '▶ Present' }));
        await screen.findByTestId('idoc-present');
        const btn = screen.getByRole('button', { name: 'Presenter view' });
        fireEvent.click(btn);
        const panel = await screen.findByTestId('idoc-presenter');
        expect(panel).toHaveClass('scribe-idocs-pv--inline');
        // presenter → main
        fireEvent.click(screen.getAllByRole('button', { name: 'Next card' }).find((b) => panel.contains(b))!);
        expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
        // main → presenter (renderer keyboard)
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('idoc-presenter-count')).toHaveTextContent('3 / 3');
        // toggle off + Esc exits present → presenter state resets
        fireEvent.click(btn);
        expect(screen.queryByTestId('idoc-presenter')).toBeNull();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByTestId('idoc-present')).toBeNull();
        expect(idocsStore.getSnapshot().docs[0].id).toBe(d.id);
    });
});
