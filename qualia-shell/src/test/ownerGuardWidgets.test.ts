/**
 * Owner-race guard coverage for the agent widgets that await (LLM call / file
 * decode) and then write a per-user store: BuilderAgents + Synthesis (CoPaw
 * facts), Stella Dream mode (dreamStore), the Agent Lab avatar upload
 * (AvatarDossier → upsertPersona) and Persona Studio (usePersonaConfig.patch).
 * Each starts as user-a, switches to user-b mid-await, resolves, and asserts
 * NEITHER account got the late write; each has a no-switch control.
 * See ownerGuard.test.ts for the base primitive.
 */
import { createElement, type ComponentType, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callLlm = vi.fn();
vi.mock('../lib/llmClient', async (orig) => ({
    ...(await orig<object>()),
    callLlm: (...args: unknown[]) => callLlm(...args),
    hasActiveLlm: () => true,
}));
vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: { active: 'openai' } } }),
}));
// AvatarHarness calls useUser(), which needs the full provider — not under test here.
vi.mock('../components/AvatarHarness/AvatarHarness', () => ({ default: () => null }));

import { setPerUserIdentity, ACCOUNT_CHANGED } from '../lib/perUserIdentity';
import { UserContext } from '../context/UserContext';
import BuilderAgents from '../components/BuilderAgents/BuilderAgents';
import Synthesis from '../components/Synthesis/Synthesis';
import StellaAgent from '../components/StellaAgent/StellaAgent';
import AvatarDossier from '../components/AgentLab/AvatarDossier';
import { copawStore } from '../components/Hive/copawStore';
import { dreamStore } from '../components/StellaAgent/honchoDreamStore';
import { personaConfigStore, usePersonaConfig } from '../components/PersonaStudio/personaConfigStore';

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

/** The component tree for `id` (null = signed out), the way the shell provides it. */
const asUser = (C: ComponentType<any>, id: string | null) =>
    createElement(UserContext.Provider, { value: (id ? { user: { id } } : null) as any }, createElement(C));

/** Logout render then login-as-B render, mid-await. */
function switchToB(rerender: (ui: ReturnType<typeof asUser>) => void, C: ComponentType<any>) {
    setPerUserIdentity(null); rerender(asUser(C, null));
    setPerUserIdentity('user-b'); rerender(asUser(C, 'user-b'));
}

const LLM_TEXT = 'The work order schema has seven required fields. Vendors are linked through a foreign key on assignment.';
const COPAW_A = 'dwellium:copaw-memory:user-a';
const COPAW_B = 'dwellium:copaw-memory:user-b';

beforeEach(() => {
    localStorage.clear();
    copawStore.reset();
    dreamStore.reset();
    personaConfigStore.reset();
    callLlm.mockReset();
    setPerUserIdentity('user-a');
});
afterEach(() => {
    cleanup();
    setPerUserIdentity(null);
    vi.unstubAllGlobals();
});

describe('owner-race guard — BuilderAgents run → captureFacts', () => {
    const start = () => {
        const d = deferred<{ text: string } | null>();
        callLlm.mockReturnValueOnce(d.promise);
        const view = render(asUser(BuilderAgents, 'user-a'));
        fireEvent.change(screen.getByPlaceholderText(/maintenance work order/), { target: { value: 'a work order' } });
        fireEvent.click(screen.getByRole('button', { name: /Run Schema Producer/ }));
        expect(callLlm).toHaveBeenCalledTimes(1);
        return { d, ...view };
    };

    it('account switches mid-LLM-call → no facts in either account, output hidden, busy clears', async () => {
        const { d, rerender } = start();
        switchToB(rerender, BuilderAgents);
        await act(async () => { d.resolve({ text: LLM_TEXT }); });
        await waitFor(() => expect(screen.getByRole('button', { name: /Run Schema Producer/ })).toBeInTheDocument());
        expect(localStorage.getItem(COPAW_A)).toBeNull();
        expect(localStorage.getItem(COPAW_B)).toBeNull();
        expect(copawStore.getSnapshot()).toEqual([]);
        expect(screen.queryByText(LLM_TEXT)).toBeNull();
        expect(screen.getByText(ACCOUNT_CHANGED)).toBeInTheDocument();
    });

    it('control: no switch → facts land in user-a\'s CoPaw memory', async () => {
        const { d } = start();
        await act(async () => { d.resolve({ text: LLM_TEXT }); });
        await waitFor(() => expect(screen.getByText(LLM_TEXT)).toBeInTheDocument());
        expect(JSON.parse(localStorage.getItem(COPAW_A) ?? '[]')).toHaveLength(2);
    });
});

describe('owner-race guard — Synthesis runSynthesis → captureFacts', () => {
    const start = () => {
        const d = deferred<{ text: string } | null>();
        callLlm.mockReturnValueOnce(d.promise);
        const view = render(asUser(Synthesis, 'user-a'));
        fireEvent.change(screen.getByPlaceholderText(/synthesize across your corpus/), { target: { value: 'what now' } });
        fireEvent.click(screen.getByRole('button', { name: /Synthesize/ }));
        expect(callLlm).toHaveBeenCalledTimes(1);
        return { d, ...view };
    };

    it('account switches mid-LLM-call → no facts in either account, result hidden, busy clears', async () => {
        const { d, rerender } = start();
        switchToB(rerender, Synthesis);
        await act(async () => { d.resolve({ text: LLM_TEXT }); });
        await waitFor(() => expect(screen.getByRole('button', { name: /^Synthesize$/ })).toBeInTheDocument());
        expect(localStorage.getItem(COPAW_A)).toBeNull();
        expect(localStorage.getItem(COPAW_B)).toBeNull();
        expect(copawStore.getSnapshot()).toEqual([]);
        expect(screen.queryByText(LLM_TEXT)).toBeNull();
        expect(screen.getByText(ACCOUNT_CHANGED)).toBeInTheDocument();
    });

    it('control: no switch → facts land in user-a\'s CoPaw memory', async () => {
        const { d } = start();
        await act(async () => { d.resolve({ text: LLM_TEXT }); });
        await waitFor(() => expect(screen.getByText(LLM_TEXT)).toBeInTheDocument());
        expect(JSON.parse(localStorage.getItem(COPAW_A) ?? '[]')).toHaveLength(2);
    });
});

describe('owner-race guard — Stella Dream mode runDream → appendDream', () => {
    const DREAM = '{"title":"A pattern","text":"user-a reflection"}';
    const start = async () => {
        Element.prototype.scrollIntoView = vi.fn();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ success: false }), headers: new Headers() })));
        const d = deferred<{ text: string } | null>();
        callLlm.mockReturnValueOnce(d.promise);
        const view = render(asUser(StellaAgent, 'user-a'));
        fireEvent.click(screen.getByRole('button', { name: 'Honcho' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Dream' }));
        fireEvent.click(screen.getByRole('button', { name: /Dream now/ }));
        expect(callLlm).toHaveBeenCalledTimes(1);
        return { d, ...view };
    };

    it('account switches mid-LLM-call → no dream in either account, Dreaming… clears', async () => {
        const { d, rerender } = await start();
        switchToB(rerender, StellaAgent);
        await act(async () => { d.resolve({ text: DREAM }); });
        await waitFor(() => expect(screen.getByRole('button', { name: /Dream now/ })).toBeEnabled());
        expect(localStorage.getItem('honcho:dreams:user-a')).toBeNull();
        expect(localStorage.getItem('honcho:dreams:user-b')).toBeNull();
        expect(dreamStore.getSnapshot()).toEqual([]);
    });

    it('control: no switch → the dream lands in user-a\'s dreams', async () => {
        const { d } = await start();
        await act(async () => { d.resolve({ text: DREAM }); });
        await waitFor(() => expect(screen.getByRole('button', { name: /Dream now/ })).toBeEnabled());
        expect(JSON.parse(localStorage.getItem('honcho:dreams:user-a') ?? '[]')).toHaveLength(1);
    });
});

describe('owner-race guard — AvatarDossier upload → onAvatarChange (Agent Lab upsertPersona)', () => {
    // jsdom never loads images; this fake lets the test decide when the decode finishes.
    const pending: { onerror?: () => void }[] = [];
    class FakeImage { onload?: () => void; onerror?: () => void; width = 1; height = 1; set src(_v: string) { pending.push(this); } }

    const start = async () => {
        pending.length = 0;
        vi.stubGlobal('Image', FakeImage);
        Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
        HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
        HTMLMediaElement.prototype.pause = vi.fn();
        const onAvatarChange = vi.fn();
        const { container } = render(createElement(AvatarDossier, {
            dossier: { subjectId: 'T', scanMode: 'Wireframe', clearance: 'Visual', title: 'T', description: '', identity: [], traits: [], tags: [], metrics: [], readout: [], channels: [], notes: [], hidden: [] },
            onChange: () => {}, avatar: { kind: 'wireframe' }, onAvatarChange,
            neuralVideo: '/assets/neural/neural-1.mp4', onNeuralVideoChange: () => {},
        }));
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
        await waitFor(() => expect(pending).toHaveLength(1)); // FileReader done; decode pending
        return { onAvatarChange, decode: () => act(async () => { pending[0].onerror?.(); }) };
    };

    it('account switches mid-decode → the avatar is never handed to the persona store', async () => {
        const { onAvatarChange, decode } = await start();
        setPerUserIdentity(null); setPerUserIdentity('user-b');
        await decode();
        expect(onAvatarChange).not.toHaveBeenCalled();
    });

    it('control: no switch → the avatar is saved', async () => {
        const { onAvatarChange, decode } = await start();
        await decode();
        expect(onAvatarChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'image' }));
    });
});

describe('owner-race guard — Persona Studio usePersonaConfig.patch', () => {
    const PA = 'persona-studio:user-a';
    const PB = 'persona-studio:user-b';
    const mount = () => {
        let uid = 'user-a';
        const wrapper = ({ children }: { children: ReactNode }) =>
            createElement(UserContext.Provider, { value: { user: { id: uid } } as any }, children);
        const hook = renderHook(() => usePersonaConfig(), { wrapper });
        return { ...hook, signInAs: (id: string) => { setPerUserIdentity(null); setPerUserIdentity(id); uid = id; hook.rerender(); } };
    };
    /** What handleGenerate / handlePortraitUpload / handleKnowledgeFiles / file import do: await, then patch. */
    const startGenerate = (patch: ReturnType<typeof usePersonaConfig>['patch']) => {
        const d = deferred<string>();
        const done = (async () => { patch({ systemPrompt: await d.promise, useDefaultPrompt: false }); })();
        return { d, done };
    };

    it('account switches mid-await → the patch from A\'s render writes to neither account', async () => {
        const { result, signInAs } = mount();
        const { d, done } = startGenerate(result.current.patch);
        act(() => signInAs('user-b'));
        d.resolve('A generated prompt');
        await act(async () => { await done; });
        expect(localStorage.getItem(PA)).toBeNull();
        expect(localStorage.getItem(PB)).toBeNull();
        expect(result.current.config.systemPrompt).not.toBe('A generated prompt');
        // B's own edits still save.
        act(() => result.current.patch({ name: 'B persona' }));
        expect(JSON.parse(localStorage.getItem(PB) ?? '{}').name).toBe('B persona');
    });

    it('control: no switch → the patch lands in user-a\'s persona', async () => {
        const { result } = mount();
        const { d, done } = startGenerate(result.current.patch);
        d.resolve('A generated prompt');
        await act(async () => { await done; });
        expect(JSON.parse(localStorage.getItem(PA) ?? '{}').systemPrompt).toBe('A generated prompt');
        expect(result.current.config.systemPrompt).toBe('A generated prompt');
    });
});
