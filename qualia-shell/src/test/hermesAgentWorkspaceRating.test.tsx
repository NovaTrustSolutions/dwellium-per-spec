/**
 * Background-runner answers are logged with no Sources (not fact-checked), so
 * they are never reused — unless the user 👍s one. The Hermes Agent workspace
 * is where those answers are read, so a completed task carries its Hermes run
 * id and shows 👍/👎 next to the answer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { UserContext } from '../context/UserContext';
import { HermesAgentWorkspace } from '../components/HonchoHermesPanel/HermesAgentWorkspace';
import { HERMES_PERSONA_IDS } from '../lib/agents/personas';
import { agentTeamsStore } from '../lib/agents/agentTeamsStore';
import { personaWorkStore, addTask, startTask, completeTask } from '../lib/agents/personaWorkStore';
import { hermesLearningStore, recordRun, relevantPastRuns } from '../components/HonchoHermesPanel/hermesLearningStore';

const PID = HERMES_PERSONA_IDS[0];

function renderWorkspace() {
    return render(
        <StrictMode>
            <UserContext.Provider value={{ user: null } as never}>
                <HermesAgentWorkspace />
            </UserContext.Provider>
        </StrictMode>,
    );
}

beforeEach(() => {
    cleanup();
    try { localStorage.clear(); } catch { /* */ }
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
    (personaWorkStore as unknown as { reset?: () => void }).reset?.();
    (hermesLearningStore as unknown as { reset?: () => void }).reset?.();
});

describe('HermesAgentWorkspace — 👍 on a completed autonomous task', () => {
    it('shows the not-fact-checked note and 👍/👎; a 👍 makes the answer reusable, a 👎 takes it back', () => {
        const rec = recordRun({ prompt: '[research] Map the launch', outcome: 'fail', unchecked: true, summary: 'Launch map', toolsUsed: [PID] });
        const id = addTask(PID, 'Map the launch');
        startTask(PID, id);
        completeTask(PID, id, 'Launch map', rec.id);
        renderWorkspace();

        const done = screen.getByText('Map the launch').closest('details')!;
        expect(within(done).getByText(/not fact-checked \(no Sources\)/)).toBeInTheDocument();
        expect(relevantPastRuns('[research] Map the launch', 3).map(r => r.id)).not.toContain(rec.id);

        fireEvent.click(within(done).getByRole('button', { name: /Rate this answer up/ }));
        expect(within(done).getByRole('button', { name: /Rate this answer up/ })).toHaveAttribute('aria-pressed', 'true');
        expect(relevantPastRuns('[research] Map the launch', 3).map(r => r.id)).toContain(rec.id);

        fireEvent.click(within(done).getByRole('button', { name: /Rate this answer down/ }));
        expect(relevantPastRuns('[research] Map the launch', 3).map(r => r.id)).not.toContain(rec.id);
    });

    it('a completed task with no Hermes run (e.g. marked done by hand) shows no rating', () => {
        const id = addTask(PID, 'Tidy notes');
        completeTask(PID, id, 'Done');
        renderWorkspace();
        const done = screen.getByText('Tidy notes').closest('details')!;
        expect(within(done).queryByRole('button', { name: /Rate this answer up/ })).toBeNull();
    });

    it('each button names its task, for screen readers', () => {
        const rec = recordRun({ prompt: '[research] Map the launch', outcome: 'fail', unchecked: true, toolsUsed: [PID] });
        const id = addTask(PID, 'Map the launch');
        completeTask(PID, id, 'Launch map', rec.id);
        renderWorkspace();
        expect(screen.getByRole('button', { name: 'Rate this answer up: Map the launch' })).toBeInTheDocument();
    });

    it('lists the NEWEST completed tasks, so a new answer\'s 👍 is reachable', () => {
        for (let i = 1; i <= 7; i++) {
            vi.setSystemTime(new Date(2026, 8, 24, 10, i));
            const rec = recordRun({ prompt: `[research] Task ${i}`, outcome: 'fail', unchecked: true, toolsUsed: [PID] });
            const id = addTask(PID, `Task ${i}`);
            completeTask(PID, id, `Answer ${i}`, rec.id);
        }
        vi.useRealTimers();
        renderWorkspace();
        const newest = screen.getByText('Task 7').closest('details')!;
        expect(within(newest).getByRole('button', { name: /Rate this answer up/ })).toBeInTheDocument();
        expect(screen.queryByText('Task 1')).toBeNull(); // only six are listed — the oldest drops off
    });

    it('a task whose Hermes record is gone (pruned or not synced yet) still renders, without a rating', () => {
        const id = addTask(PID, 'Old task');
        completeTask(PID, id, 'Old answer', 'hrun-missing');
        renderWorkspace();
        const done = screen.getByText('Old task').closest('details')!;
        expect(within(done).getByText('Old answer')).toBeInTheDocument();
        expect(within(done).queryByRole('button', { name: /Rate this answer up/ })).toBeNull();
    });

    it('no 👍 on an answer the fact-check disputed — a 👍 could not make it reusable', () => {
        const rec = recordRun({ prompt: '[research] Check hours', outcome: 'fail', summary: '[unverified] Open Saturdays', toolsUsed: [PID] });
        const id = addTask(PID, 'Check hours');
        completeTask(PID, id, 'Open Saturdays', rec.id);
        renderWorkspace();
        const done = screen.getByText('Check hours').closest('details')!;
        expect(within(done).queryByRole('button', { name: /Rate this answer up/ })).toBeNull();
    });
});
