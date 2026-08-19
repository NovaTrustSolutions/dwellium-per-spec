/**
 * Interactive Docs wave 2 — CommentsPanel drives the store (add / reply /
 * resolve / delete-own / show-resolved / block scope) and the editor surfaces
 * unresolved badges (top bar, outline, block toolbar). Real timers only.
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import CommentsPanel from '../components/Scribe/idocs/CommentsPanel';
import InteractiveDocs from '../components/Scribe/idocs/InteractiveDocs';
import { addComment, createDoc, findCard, idocsStore, idocsUserIdHolder, unresolvedCount } from '../components/Scribe/idocs/idocsStore';
import { createEmptyCard, type Card } from '../components/Scribe/idocs/idocTypes';

class MockResizeObserver { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
beforeAll(() => { vi.stubGlobal('ResizeObserver', MockResizeObserver); });
afterEach(cleanup);
// holder = null: InteractiveDocs (no UserContext in tests) resolves the `_anonymous` key too.
beforeEach(() => { localStorage.clear(); idocsStore.reset(); idocsUserIdHolder.current = null; });

const cardA = (): Card => createEmptyCard({ id: 'a', title: 'Alpha', blocks: [{ id: 'b1', type: 'heading', level: 2, text: 'Hello' }, { id: 'b2', type: 'text', md: 'body' }] });
const cardOf = () => findCard(idocsStore.getSnapshot().docs[0].cards, 'a')!;

describe('CommentsPanel', () => {
    it('add (card + block scoped) → reply → resolve/unresolve → delete own only; Show resolved toggle', () => {
        const d = createDoc({ title: 'T', cards: [cardA()] });
        const onScope = vi.fn(); const onClose = vi.fn();
        const { rerender } = render(<CommentsPanel docId={d.id} card={cardOf()} author="Ann" onScope={onScope} onClose={onClose} />);
        expect(screen.getByText('No comments yet.')).toBeInTheDocument();
        // add on the whole card
        fireEvent.change(screen.getByLabelText('New comment'), { target: { value: 'first' } });
        fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
        expect(cardOf().comments).toMatchObject([{ author: 'Ann', text: 'first' }]);
        expect(cardOf().comments![0].blockId).toBeUndefined();
        expect((screen.getByLabelText('New comment') as HTMLTextAreaElement).value).toBe('');
        // scope select → parent decides; re-render scoped to b2 and add with ⌘⏎
        fireEvent.change(screen.getByLabelText('Comment scope'), { target: { value: 'b2' } });
        expect(onScope).toHaveBeenCalledWith('b2');
        rerender(<CommentsPanel docId={d.id} card={cardOf()} author="Ann" blockId="b2" onScope={onScope} onClose={onClose} />);
        fireEvent.change(screen.getByLabelText('New comment'), { target: { value: 'on b2' } });
        fireEvent.keyDown(screen.getByLabelText('New comment'), { key: 'Enter', metaKey: true });
        expect(cardOf().comments).toHaveLength(2);
        expect(cardOf().comments![1]).toMatchObject({ text: 'on b2', blockId: 'b2' });
        rerender(<CommentsPanel docId={d.id} card={cardOf()} author="Ann" blockId="b2" onScope={onScope} onClose={onClose} />);
        // scoped list hides the card-level thread
        expect(screen.queryByText('first')).toBeNull();
        expect(screen.getByText('on b2')).toBeInTheDocument();
        // back to whole card: both visible, block thread labelled
        rerender(<CommentsPanel docId={d.id} card={cardOf()} author="Ann" onScope={onScope} onClose={onClose} />);
        expect(screen.getByText('first')).toBeInTheDocument();
        expect(screen.getByText(/on text · body/)).toBeInTheDocument();
        // reply
        const [t1] = cardOf().comments!;
        const thread1 = () => screen.getByTestId(`idoc-comment-${t1.id}`);
        fireEvent.click(within(thread1()).getByRole('button', { name: 'Reply' }));
        fireEvent.change(within(thread1()).getByLabelText('Reply text'), { target: { value: 'ack' } });
        fireEvent.click(within(thread1()).getByRole('button', { name: 'Send' }));
        expect(cardOf().comments![0].replies).toMatchObject([{ author: 'Ann', text: 'ack' }]);
        rerender(<CommentsPanel docId={d.id} card={cardOf()} author="Ann" onScope={onScope} onClose={onClose} />);
        expect(within(thread1()).getByText('ack')).toBeInTheDocument();
        // resolve → hidden unless "Show resolved"
        fireEvent.click(within(thread1()).getByRole('button', { name: 'Resolve' }));
        expect(cardOf().comments![0].resolved).toBe(true);
        expect(unresolvedCount(cardOf())).toBe(1);
        rerender(<CommentsPanel docId={d.id} card={cardOf()} author="Ann" onScope={onScope} onClose={onClose} />);
        expect(screen.queryByTestId(`idoc-comment-${t1.id}`)).toBeNull();
        fireEvent.click(screen.getByLabelText(/Show resolved \(1\)/));
        expect(thread1()).toHaveClass('is-resolved');
        fireEvent.click(within(thread1()).getByRole('button', { name: 'Unresolve' }));
        expect(cardOf().comments![0].resolved).toBe(false);
        // delete: only own comments get the button
        addComment(d.id, 'a', { author: 'Bob', text: 'from bob' });
        rerender(<CommentsPanel docId={d.id} card={cardOf()} author="Ann" onScope={onScope} onClose={onClose} />);
        const bobId = cardOf().comments![2].id;
        expect(within(screen.getByTestId(`idoc-comment-${bobId}`)).queryByRole('button', { name: 'Delete comment' })).toBeNull();
        fireEvent.click(within(thread1()).getByRole('button', { name: 'Delete comment' }));
        expect(cardOf().comments!.map((c) => c.text)).toEqual(['on b2', 'from bob']);
        fireEvent.click(screen.getByRole('button', { name: 'Close comments' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('editor: Comments (n) button opens the drawer; block 💬 scopes it; unresolved badges on outline + block + top bar', async () => {
        const d = createDoc({ title: 'T', cards: [cardA(), createEmptyCard({ id: 'z', title: 'Zeta' })] });
        addComment(d.id, 'a', { author: 'Bob', text: 'open one', blockId: 'b1' });
        addComment(d.id, 'a', { author: 'Bob', text: 'closed one', resolved: true });
        addComment(d.id, 'z', { author: 'Bob', text: 'zeta open' });
        render(<InteractiveDocs />);
        await screen.findByLabelText('Document title');
        expect(screen.getByRole('button', { name: 'Comments (2)' })).toBeInTheDocument();
        expect(within(screen.getByTestId('idoc-outline-a')).getByLabelText('1 open comment')).toBeInTheDocument();
        expect(within(screen.getByTestId('idoc-outline-z')).getByLabelText('1 open comment')).toBeInTheDocument();
        // block toolbar 💬 with count → drawer scoped to b1
        fireEvent.click(screen.getByRole('button', { name: 'Comments on this block (1 open)' }));
        const drawer = await screen.findByTestId('idoc-comments');
        expect((within(drawer).getByLabelText('Comment scope') as HTMLSelectElement).value).toBe('b1');
        expect(within(drawer).getByText('open one')).toBeInTheDocument();
        expect(within(drawer).queryByText('closed one')).toBeNull();
        // add via the drawer → badge + top-bar count update; author = "You" (no user ctx)
        fireEvent.change(within(drawer).getByLabelText('New comment'), { target: { value: 'me too' } });
        fireEvent.click(within(drawer).getByRole('button', { name: 'Comment' }));
        expect(cardOf().comments![cardOf().comments!.length - 1]).toMatchObject({ author: 'You', text: 'me too', blockId: 'b1' });
        expect(screen.getByRole('button', { name: 'Comments (3)' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Comments on this block (2 open)' })).toBeInTheDocument();
        // top-bar button toggles the drawer closed; ⌘F find highlights matching outline items
        fireEvent.click(screen.getByRole('button', { name: 'Comments (3)' }));
        expect(screen.queryByTestId('idoc-comments')).toBeNull();
        fireEvent.keyDown(screen.getByTestId('idoc-editor'), { key: 'f', metaKey: true });
        fireEvent.change(screen.getByLabelText('Find in doc'), { target: { value: 'hello' } });
        expect(screen.getByText('1 match')).toBeInTheDocument();
        expect(screen.getByTestId('idoc-outline-a')).toHaveClass('is-match');
        expect(screen.getByTestId('idoc-outline-z')).toHaveClass('is-nomatch');
        fireEvent.keyDown(screen.getByLabelText('Find in doc'), { key: 'Escape' });
        expect(screen.queryByLabelText('Find in doc')).toBeNull();
    });

    it('editor: collapse/expand nested groups in the outline', async () => {
        createDoc({ title: 'T', cards: [createEmptyCard({ id: 'p', title: 'Parent', children: [createEmptyCard({ id: 'k', title: 'Kid' })] })] });
        render(<InteractiveDocs />);
        await screen.findByLabelText('Document title');
        expect(screen.getByTestId('idoc-outline-k')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Collapse nested cards of Parent' }));
        expect(screen.queryByTestId('idoc-outline-k')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Expand nested cards of Parent' }));
        expect(screen.getByTestId('idoc-outline-k')).toBeInTheDocument();
    });
});
