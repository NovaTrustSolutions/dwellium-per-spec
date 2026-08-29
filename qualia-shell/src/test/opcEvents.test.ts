/**
 * opcEvents — OpenOPC stream-json reducer (Automation Hub · AI Company).
 *
 * Feeds a sample `opc exec --stream-json` transcript (the VERIFIED envelope:
 * type/seq/timestamp/project_id/task_id/session_id/payload) through the
 * normalizer + reducer and asserts the org chart + kanban it produces. The
 * runtime_update sub-event shapes are read defensively (upstream doesn't pin
 * them), so the fixtures use a spread of plausible field names to prove the
 * defensive extraction holds.
 */
import { describe, it, expect } from 'vitest';
import {
    reduceRawEvents,
    normalizeOpcEvent,
    toColumn,
    type OpcRawEvent,
} from '../components/AutomationHub/opcEvents';

// A realistic company-mode transcript.
const TRANSCRIPT: OpcRawEvent[] = [
    { type: 'session_created', seq: 1, task_id: 'tk_1', session_id: 'sess_1', payload: { task_id: 'tk_1' } },
    { type: 'runtime_update', seq: 2, payload: { kind: 'role_spawned', role_id: 'ceo', title: 'CEO' } },
    { type: 'runtime_update', seq: 3, payload: { event: 'role_hired', role_id: 'cto', name: 'CTO', reports_to: 'ceo' } },
    { type: 'runtime_update', seq: 4, payload: { kind: 'work_item_created', work_item_id: 'wi_1', title: 'Draft the SOP', phase: 'planning', owner: 'cto' } },
    { type: 'runtime_update', seq: 5, payload: { event: 'role_status', role_id: 'cto', status: 'active' } },
    { type: 'runtime_update', seq: 6, payload: { kind: 'work_item_phase', work_item_id: 'wi_1', phase: 'in_progress' } },
    { type: 'runtime_update', seq: 7, payload: { kind: 'delegate', work_item_id: 'wi_1', to_role_id: 'eng' } },
    { type: 'runtime_update', seq: 8, payload: { kind: 'review_verdict', work_item_id: 'wi_1', verdict: 'accept' } },
    { type: 'runtime_update', seq: 9, payload: { kind: 'work_item_created', work_item_id: 'wi_2', title: 'Ship it', phase: 'blocked', depends_on: ['wi_1'] } },
    { type: 'escalation', seq: 10, payload: { id: 'esc_1', message: 'Approve deploy to prod?', options: [{ id: 'yes', label: 'Approve' }, { id: 'no', label: 'Hold' }] } },
    { type: 'message', seq: 11, payload: { role: 'assistant', content: 'SOP drafted and reviewed.' } },
    { type: 'final', seq: 12, payload: { ok: true } },
];

describe('normalizeOpcEvent — top-level envelope types (verified from source)', () => {
    it('maps session_created / message / final / error / escalation', () => {
        expect(normalizeOpcEvent({ type: 'session_created', session_id: 's', task_id: 't', payload: {} })).toMatchObject({ kind: 'session', sessionId: 's', taskId: 't' });
        expect(normalizeOpcEvent({ type: 'message', seq: 3, payload: { role: 'assistant', content: 'hi' } })).toMatchObject({ kind: 'message', content: 'hi' });
        expect(normalizeOpcEvent({ type: 'final', payload: {} })).toMatchObject({ kind: 'done' });
        expect(normalizeOpcEvent({ type: 'error', payload: { error: 'boom' } })).toMatchObject({ kind: 'error', message: 'boom' });
        expect(normalizeOpcEvent({ type: 'escalation', payload: { id: 'e1', message: 'q', options: [] } })).toMatchObject({ kind: 'escalation', id: 'e1' });
    });
    it('ignores unknown top-level types', () => {
        expect(normalizeOpcEvent({ type: 'heartbeat', payload: {} })).toBeNull();
    });
});

describe('toColumn maps arbitrary runtime phase strings', () => {
    it('folds aliases onto canonical columns', () => {
        expect(toColumn('Todo')).toBe('planning');
        expect(toColumn('running')).toBe('in_progress');
        expect(toColumn('integrating')).toBe('review');
        expect(toColumn('AWAITING_PEER')).toBe('blocked');
        expect(toColumn('completed')).toBe('done');
        expect(toColumn(42)).toBeUndefined();
    });
});

describe('reduceRawEvents — builds the org chart + kanban', () => {
    const state = reduceRawEvents(TRANSCRIPT);

    it('captures the session and task', () => {
        expect(state.sessionId).toBe('sess_1');
        expect(state.taskId).toBe('tk_1');
    });

    it('renders the org chart with reporting lines and live status', () => {
        expect(Object.keys(state.roles).sort()).toEqual(['ceo', 'cto', 'eng']);
        expect(state.roles.cto.title).toBe('CTO');
        expect(state.roles.cto.parentRoleId).toBe('ceo');
        expect(state.roles.cto.status).toBe('active');
        // eng was created implicitly by the delegate and owns wi_1
        expect(state.roles.eng.workItemId).toBe('wi_1');
    });

    it('renders the kanban: wi_1 accepted → done, wi_2 blocked with a dependency', () => {
        expect(state.workItems.wi_1.title).toBe('Draft the SOP');
        expect(state.workItems.wi_1.column).toBe('done');
        expect(state.workItems.wi_1.lastVerdict).toBe('accept');
        expect(state.workItems.wi_1.ownerRoleId).toBe('eng'); // delegated
        expect(state.workItems.wi_2.column).toBe('blocked');
        expect(state.workItems.wi_2.dependsOn).toEqual(['wi_1']);
    });

    it('surfaces the escalation, the message, and the done flag', () => {
        expect(state.escalations).toHaveLength(1);
        expect(state.escalations[0]).toMatchObject({ id: 'esc_1', message: 'Approve deploy to prod?' });
        expect(state.escalations[0].options.map(o => o.id)).toEqual(['yes', 'no']);
        expect(state.messages.map(m => m.content)).toContain('SOP drafted and reviewed.');
        expect(state.done).toBe(true);
    });

    it('is a pure fold — replaying the transcript yields the same state', () => {
        expect(reduceRawEvents(TRANSCRIPT)).toEqual(state);
    });
});
