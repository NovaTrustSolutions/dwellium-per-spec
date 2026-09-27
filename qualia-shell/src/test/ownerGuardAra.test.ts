/**
 * Owner-race guard coverage for the ARA/skills recordArtifact call sites
 * added alongside perUserIdentity.ts's `captureOwner()` (see its doc comment
 * + src/test/ownerGuard.test.ts for the base primitive). Drives the
 * skills.ts compose-into-widget skill (which calls `callLlm` then
 * `recordArtifact`) through a deferred LLM call, switches the active user
 * mid-await, and asserts nothing lands in either user's artifact store.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setPerUserIdentity, artifactsUserIdHolder } from '../lib/perUserIdentity';
import { artifactStore } from '../lib/artifactStore';
import { AGENT_SKILLS, type SkillContext } from '../lib/agents/skills';
import { callLlm } from '../lib/llmClient';

vi.mock('../lib/llmClient', () => ({
    callLlm: vi.fn(),
}));

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

/** Read a user's artifact snapshot without disturbing the live holder. */
function artifactsFor(userId: string | null): ReturnType<typeof artifactStore.getSnapshot> {
    const prev = artifactsUserIdHolder.current;
    artifactsUserIdHolder.current = userId;
    const snap = artifactStore.getSnapshot();
    artifactsUserIdHolder.current = prev;
    return snap;
}

const composeSkill = AGENT_SKILLS.find(s => s.id === 'skill-compose-widget')!;
const ctx: SkillContext = { llm: {} as SkillContext['llm'] };

describe('owner-race guard — skills.ts recordArtifact sites', () => {
    beforeEach(() => {
        artifactStore.reset();
        setPerUserIdentity(null);
        vi.mocked(callLlm).mockReset();
    });

    it('account switches mid-LLM-call (A → B) → the draft is dropped, neither user gets it', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<{ text: string }>();
        vi.mocked(callLlm).mockReturnValue(d.promise as any);

        const run = composeSkill.run('a thank-you note in notepad', ctx);
        setPerUserIdentity(null);      // logout mid-await
        setPerUserIdentity('user-b');  // switch account mid-await
        d.resolve({ text: 'Dear tenant, thank you...' });
        await run;

        expect(artifactsFor('user-a')).toEqual([]);
        expect(artifactsFor('user-b')).toEqual([]);
    });

    it('control: no switch → the draft IS recorded under the original owner', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<{ text: string }>();
        vi.mocked(callLlm).mockReturnValue(d.promise as any);

        const run = composeSkill.run('a thank-you note in notepad', ctx);
        d.resolve({ text: 'Dear tenant, thank you for your payment.' });
        await run;

        const recorded = artifactsFor('user-a');
        expect(recorded).toHaveLength(1);
        expect(recorded[0].content).toBe('Dear tenant, thank you for your payment.');
    });
});
