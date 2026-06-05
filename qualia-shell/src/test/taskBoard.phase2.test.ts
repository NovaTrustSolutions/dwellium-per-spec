import { describe, it, expect, beforeEach } from 'vitest';
import {
    createInitialBoard, makeCard, applyAction, undo, cardTimeline, subtasksOf,
    type ActionContext, type BoardState, type Attachment,
} from '../components/TaskBoard/taskBoardModel';
import {
    buildGmailComposeUrl, composeCardEmail, composeCardPrompt, describeRoute, routeKind, aiEndpoint, BUILT_IN_TARGETS,
} from '../components/TaskBoard/taskRouting';
import {
    taskBoardStore, taskBoardUserIdHolder, addCard, assignCard, addSubtask, attachToCard, removeAttachment,
} from '../components/TaskBoard/taskBoardStore';

function det(): ActionContext { let c = 0, i = 0; return { now: () => `t${++c}`, id: () => `id${++i}` }; }
const USER = { kind: 'user' } as const;

function seed(ctx: ActionContext, title = 'Card', columnId = 'todo'): { board: BoardState; id: string } {
    let board = createInitialBoard();
    const card = makeCard(ctx, { title, columnId }, 0);
    board = applyAction(board, { type: 'ADD_CARD', card }, USER, ctx);
    return { board, id: card.id };
}

describe('taskRouting — pure helpers', () => {
    it('buildGmailComposeUrl encodes recipient, subject, body', () => {
        const url = buildGmailComposeUrl({ to: 'lisa@acme.com', subject: 'Task: Fix bug', body: 'line one' });
        expect(url).toContain('mail.google.com/mail/');
        expect(url).toContain('view=cm');
        expect(url).toContain('to=lisa%40acme.com');
        expect(url).toContain('su=Task%3A+Fix+bug');
        expect(url).toContain('body=line+one');
    });
    it('composeCardEmail / composeCardPrompt build sane content', () => {
        const email = composeCardEmail({ title: 'Renew lease', description: 'Unit 4B' });
        expect(email.subject).toBe('Task: Renew lease');
        expect(email.body).toContain('Unit 4B');
        expect(composeCardPrompt({ title: 'Renew lease' })).toContain('Renew lease');
    });
    it('describeRoute / routeKind / aiEndpoint', () => {
        expect(describeRoute(null)).toBe('Unassigned');
        expect(describeRoute(BUILT_IN_TARGETS[0])).toBe('AI · ARA');
        expect(describeRoute({ kind: 'person', id: 'lisa', label: 'Lisa', email: 'l@x.com' })).toContain('l@x.com');
        expect(routeKind(null)).toBe('none');
        expect(aiEndpoint('stella')).toBe('/api/stella/chat');
        expect(aiEndpoint('ara')).toBe('/api/ara/chat');
    });
});

describe('taskBoardModel — LOG_EVENT (routing audit primitive)', () => {
    it('records an audit entry with cardId + null inverse and does NOT change board state', () => {
        const ctx = det();
        const { board, id } = seed(ctx);
        const cardsBefore = JSON.stringify(board.cards);
        const after = applyAction(board, { type: 'LOG_EVENT', summary: 'Sent to AI · ARA', cardId: id }, USER, ctx);
        const entry = after.audit[after.audit.length - 1];
        expect(entry.type).toBe('LOG_EVENT');
        expect(entry.summary).toBe('Sent to AI · ARA');
        expect(entry.cardId).toBe(id);
        expect(entry.inverse).toBeNull();
        expect(JSON.stringify(after.cards)).toBe(cardsBefore); // state unchanged
    });
});

describe('taskBoardModel — per-card timeline', () => {
    it('cardTimeline returns only entries linked to that card', () => {
        const ctx = det();
        const { board, id } = seed(ctx, 'A');
        let b = applyAction(board, { type: 'MOVE_CARD', cardId: id, toColumnId: 'done' }, USER, ctx);
        b = applyAction(b, { type: 'LOG_EVENT', summary: 'note', cardId: id }, USER, ctx);
        // a second card's add should NOT appear in card A's timeline
        const other = makeCard(ctx, { title: 'B', columnId: 'todo' }, 1);
        b = applyAction(b, { type: 'ADD_CARD', card: other }, USER, ctx);
        const tl = cardTimeline(b, id);
        expect(tl.length).toBe(3); // ADD_CARD(A) + MOVE_CARD + LOG_EVENT
        expect(tl.every(e => e.cardId === id)).toBe(true);
    });
});

describe('taskBoardModel — attachments are reversible', () => {
    it('ADD_ATTACHMENT then undo removes it; REMOVE_ATTACHMENT then undo restores it', () => {
        const ctx = det();
        const { board, id } = seed(ctx);
        const att: Attachment = { id: 'att1', name: 'lease.pdf', size: 1234, type: 'application/pdf', addedAt: 't0' };
        const b1 = applyAction(board, { type: 'ADD_ATTACHMENT', cardId: id, attachment: att }, USER, ctx);
        expect(b1.cards.find(c => c.id === id)!.attachments).toHaveLength(1);
        const { state: b2 } = undo(b1, ctx, USER);
        expect(b2.cards.find(c => c.id === id)!.attachments).toHaveLength(0);

        // remove then undo restores
        const b3 = applyAction(b1, { type: 'REMOVE_ATTACHMENT', cardId: id, attachmentId: 'att1' }, USER, ctx);
        expect(b3.cards.find(c => c.id === id)!.attachments).toHaveLength(0);
        const { state: b4 } = undo(b3, ctx, USER);
        expect(b4.cards.find(c => c.id === id)!.attachments).toHaveLength(1);
    });
});

describe('taskBoardModel — assignment is reversible', () => {
    it('EDIT_CARD assignee sets it and the inverse restores the prior value', () => {
        const ctx = det();
        const { board, id } = seed(ctx);
        const b1 = applyAction(board, { type: 'EDIT_CARD', cardId: id, patch: { assignee: { kind: 'ai', id: 'ara', label: 'ARA' } } }, USER, ctx);
        expect(b1.cards.find(c => c.id === id)!.assignee?.label).toBe('ARA');
        const { state: b2 } = undo(b1, ctx, USER);
        expect(b2.cards.find(c => c.id === id)!.assignee ?? null).toBeNull();
    });
});

describe('taskBoardStore — assignment, subtasks, attachments (per-user)', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
        taskBoardUserIdHolder.current = 'user-andy';
        taskBoardStore.reset();
    });

    it('assignCard persists the assignee', () => {
        addCard({ title: 'Route me', columnId: 'todo' });
        const id = taskBoardStore.getSnapshot().cards[0].id;
        assignCard(id, { kind: 'person', id: 'lisa', label: 'Lisa', email: 'lisa@acme.com' });
        expect(taskBoardStore.getSnapshot().cards[0].assignee?.email).toBe('lisa@acme.com');
    });

    it('addSubtask creates a child in the parent column with parentId set', () => {
        addCard({ title: 'Parent', columnId: 'in-progress' });
        const parentId = taskBoardStore.getSnapshot().cards[0].id;
        addSubtask(parentId, 'Child A');
        const snap = taskBoardStore.getSnapshot();
        const subs = subtasksOf(snap.cards, parentId);
        expect(subs).toHaveLength(1);
        expect(subs[0].title).toBe('Child A');
        expect(subs[0].columnId).toBe('in-progress'); // inherits parent column
    });

    it('attachToCard + removeAttachment update the card', () => {
        addCard({ title: 'Has files', columnId: 'todo' });
        const id = taskBoardStore.getSnapshot().cards[0].id;
        attachToCard(id, { name: 'a.txt', size: 10, type: 'text/plain', dataUrl: 'data:,hi' });
        expect(taskBoardStore.getSnapshot().cards[0].attachments).toHaveLength(1);
        const attId = taskBoardStore.getSnapshot().cards[0].attachments![0].id;
        removeAttachment(id, attId);
        expect(taskBoardStore.getSnapshot().cards[0].attachments).toHaveLength(0);
    });
});
