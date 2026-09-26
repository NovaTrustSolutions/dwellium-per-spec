/**
 * Owner-race guard coverage for the voice + skills batch: ARA voice clone upload/delete
 * (araPrefsStore 'voice'), TranscriptionHub's per-segment speaker auto-enroll
 * (speakerLibraryStore — a biometric voiceprint) and the compose-into-widget skill's
 * widget delivery. Each run starts as user-a, holds its await open, switches the
 * account, resolves, and asserts NEITHER account (nor _anonymous) got the write.
 * Each has a no-switch control. Base primitive: ownerGuard.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, act, fireEvent, waitFor, cleanup } from '@testing-library/react';

const authFetch = vi.fn();
const embedAudioMock = vi.fn();
let moonshineCallbacks: { onTranscriptionCommitted: (text: string, buffer?: AudioBuffer) => void } | null = null;

vi.mock('../lib/llmClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/llmClient')>()),
    callLlm: vi.fn(),
    hasActiveLlm: () => false,
}));
vi.mock('../context/UserContext', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../context/UserContext')>()),
    useUser: () => ({ authFetch, isAuthenticated: true }),
}));
vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({
        selectedId: 'riverwood',
        getSelectedItem: () => ({ id: 'riverwood', name: 'Riverwood', type: 'project' }),
        getBreadcrumb: () => [{ id: 'riverwood', name: 'Riverwood', type: 'project' }],
    }),
}));
vi.mock('../lib/araDailyGlance', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/araDailyGlance')>()),
    runDailyGlance: async () => {},
}));
vi.mock('@moonshine-ai/moonshine-js', () => ({
    MicrophoneTranscriber: class {
        constructor(_model: string, callbacks: typeof moonshineCallbacks) { moonshineCallbacks = callbacks; }
        async start() {}
        stop() {}
    },
}));
vi.mock('../components/TranscriptionHub/speakerEmbedder', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../components/TranscriptionHub/speakerEmbedder')>()),
    embedAudio: (...args: unknown[]) => embedAudioMock(...args),
    audioBufferToMono16k: () => new Float32Array(16000),
    trimSilence: (s: Float32Array) => s,
    shouldEmbed: () => true,
}));

import { setPerUserIdentity, ACCOUNT_CHANGED } from '../lib/perUserIdentity';
import { UserContext } from '../context/UserContext';
import { callLlm } from '../lib/llmClient';
import { oneSaveSync } from '../lib/oneSaveStore';
import { araPrefsStore } from '../lib/araPrefsStore';
import { recentActivityStore, readRecentActivity } from '../lib/recentActivityStore';
import { AGENT_SKILLS, type SkillContext } from '../lib/agents/skills';
import { WIDGET_ACTION_EVENT, peekPendingWidgetAction, consumePendingWidgetAction } from '../lib/widgetActions';
import { speakerLibraryStore } from '../components/TranscriptionHub/speakerLibraryStore';
import ARAConsole from '../components/ARAConsole/ARAConsole';
import TranscriptionHub from '../components/TranscriptionHub/TranscriptionHub';

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const switchToB = () => { setPerUserIdentity(null); setPerUserIdentity('user-b'); };
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data, headers: new Headers() }) as Response;
const as = (uid: string, component: Parameters<typeof createElement>[0]) =>
    createElement(UserContext.Provider, { value: { user: { id: uid } } as never }, createElement(component));

beforeEach(() => {
    localStorage.clear();
    araPrefsStore.reset();
    recentActivityStore.reset();
    speakerLibraryStore.reset();
    consumePendingWidgetAction('notepad');
    vi.mocked(callLlm).mockReset();
    authFetch.mockReset();
    embedAudioMock.mockReset();
    moonshineCallbacks = null;
    setPerUserIdentity(null);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setPerUserIdentity(null);
});

// ── skills.ts compose-into-widget ────────────────────────────────────────────
describe('owner-race guard — compose-into-widget skill delivery', () => {
    const composeSkill = AGENT_SKILLS.find(s => s.id === 'skill-compose-widget')!;
    const ctx: SkillContext = { llm: {} as SkillContext['llm'] };
    const recentFor = (uid: string) => { setPerUserIdentity(uid); return readRecentActivity(); };

    const runCompose = async (switchMidDraft: boolean) => {
        setPerUserIdentity('user-a');
        const d = deferred<{ text: string }>();
        vi.mocked(callLlm).mockReturnValue(d.promise as never);
        const events: string[] = [];
        const onOpen = () => events.push('open-widget');
        const onAction = () => events.push('widget-action');
        window.addEventListener('dwellium:open-widget', onOpen);
        window.addEventListener(WIDGET_ACTION_EVENT, onAction);
        const run = composeSkill.run('a thank-you note in notepad', ctx);
        if (switchMidDraft) switchToB();
        d.resolve({ text: 'Dear tenant, thank you for your payment.' });
        const out = await run;
        window.removeEventListener('dwellium:open-widget', onOpen);
        window.removeEventListener(WIDGET_ACTION_EVENT, onAction);
        return { out, events };
    };

    it('account switches mid-draft (A → B) → nothing is opened or inserted, no recent-activity entry for either user', async () => {
        const { out, events } = await runCompose(true);
        expect(events).toEqual([]);
        expect(peekPendingWidgetAction('notepad')).toBeNull();
        expect(out).toMatchObject({ ok: false, text: ACCOUNT_CHANGED });
        expect(recentFor('user-a')).toEqual([]);
        expect(recentFor('user-b')).toEqual([]);
    });

    it('control: no switch → the draft is delivered into Notepad', async () => {
        const { out, events } = await runCompose(false);
        expect(events).toEqual(['open-widget', 'widget-action']);
        expect(peekPendingWidgetAction('notepad')?.payload.text).toBe('Dear tenant, thank you for your payment.');
        expect(out.ok).toBe(true);
        expect(recentFor('user-a').map(e => e.id)).toContain('notepad');
    });
});

// ── ARAConsole voice clone upload / delete ───────────────────────────────────
describe('owner-race guard — ARA voice clone upload/delete', () => {
    const voiceOf = (uid: string) => JSON.parse(localStorage.getItem(`dwellium-ara-prefs:${uid}`) ?? '{}').voice;
    const seedVoice = (uid: string, voice: string) => {
        setPerUserIdentity(uid);
        araPrefsStore.set('ttsEnabled', false);
        araPrefsStore.set('voice', voice);
    };
    beforeEach(() => {
        Object.defineProperty(window, 'speechSynthesis', {
            configurable: true,
            value: { cancel: vi.fn(), getVoices: vi.fn(() => []), speak: vi.fn() },
        });
    });

    /** Backend double: /voice/clone (POST + DELETE) waits on `gate`. */
    const backend = (clones: string[], gate: Promise<void>) => {
        authFetch.mockImplementation(async (url: string) => {
            if (url.endsWith('/voice/clones')) return json({ success: true, data: clones.map(id => ({ id, path: null })) });
            if (/\/voice\/clone(\/|$)/.test(url)) { await gate; return json({ success: true, data: { voice_id: 'a-clone' } }); }
            return json({ success: false });
        });
    };
    const cloneCalled = (method: string) => authFetch.mock.calls.some(
        ([url, opts]) => /\/voice\/clone(\/|$)/.test(String(url)) && ((opts as RequestInit | undefined)?.method ?? 'GET') === method);

    const upload = async (switchMidClone: boolean) => {
        seedVoice('user-b', 'nova');
        seedVoice('user-a', 'female');
        const gate = deferred<void>();
        backend(['default'], gate.promise);
        const { rerender } = render(as('user-a', ARAConsole));
        fireEvent.click(await screen.findByRole('button', { name: 'Voice settings' }));
        const input = document.querySelector('input[type="file"][accept*="wav"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File(['RIFF'], 'my-voice.wav', { type: 'audio/wav' })] } });
        await waitFor(() => expect(cloneCalled('POST')).toBe(true));
        if (switchMidClone) { switchToB(); rerender(as('user-b', ARAConsole)); }
        await act(async () => { gate.resolve(); await tick(); await tick(); });
    };

    it('upload: account switches during the clone → B\'s voice pref is untouched, A\'s too, spinner clears', async () => {
        await upload(true);
        expect(voiceOf('user-b')).toBe('nova');
        expect(voiceOf('user-a')).toBe('female');
        expect(screen.queryByText('Cloning voice…')).toBeNull();
    });

    it('control: upload with no switch selects the cloned voice for A', async () => {
        await upload(false);
        expect(voiceOf('user-a')).toBe('a-clone');
        expect(screen.queryByText('Cloning voice…')).toBeNull();
    });

    const del = async (switchMidDelete: boolean) => {
        seedVoice('user-b', 'nova');
        seedVoice('user-a', 'a-clone');
        const gate = deferred<void>();
        backend(['default', 'a-clone'], gate.promise);
        const { rerender } = render(as('user-a', ARAConsole));
        fireEvent.click(await screen.findByRole('button', { name: 'Voice settings' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete cloned voice a-clone' }));
        await waitFor(() => expect(cloneCalled('DELETE')).toBe(true));
        if (switchMidDelete) { switchToB(); rerender(as('user-b', ARAConsole)); }
        await act(async () => { gate.resolve(); await tick(); await tick(); });
    };

    it('delete: account switches during the DELETE → B\'s voice pref is not reset to default', async () => {
        await del(true);
        expect(voiceOf('user-b')).toBe('nova');
        expect(voiceOf('user-a')).toBe('a-clone');
    });

    it('control: deleting the active cloned voice with no switch resets A to default', async () => {
        await del(false);
        expect(voiceOf('user-a')).toBe('default');
    });
});

// ── TranscriptionHub identifyAndTag → autoEnrollUnknown ──────────────────────
describe('owner-race guard — TranscriptionHub speaker auto-enroll', () => {
    const speakersAt = (key: string) => JSON.parse(localStorage.getItem(`tw:speakers:${key}`) ?? '[]');

    /** Start recording as user-a and commit one segment; its voice embedding is held open. */
    const commitSegmentAsA = async () => {
        setPerUserIdentity('user-a'); // what AdminShell's usePerUserIdentity does
        const d = deferred<number[] | null>();
        embedAudioMock.mockReturnValue(d.promise);
        vi.stubGlobal('AudioContext', class {
            createMediaStreamSource() { return { connect() {} }; }
            createAnalyser() { return { fftSize: 0, frequencyBinCount: 0, getByteTimeDomainData() {} }; }
            close() { return Promise.resolve(); }
        });
        vi.stubGlobal('MediaRecorder', class {
            static isTypeSupported() { return false; }
            state = 'inactive'; mimeType = '';
            start() { this.state = 'recording'; }
            stop() { this.state = 'inactive'; }
        });
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: async () => ({ getTracks: () => [] }) },
        });
        const view = render(as('user-a', TranscriptionHub));
        fireEvent.click(screen.getByTitle('Start Recording'));
        await waitFor(() => expect(moonshineCallbacks).not.toBeNull());
        act(() => moonshineCallbacks!.onTranscriptionCommitted('hello, this is a new speaker talking', {} as AudioBuffer));
        await waitFor(() => expect(embedAudioMock).toHaveBeenCalled());
        return { view, resolveEmbedding: (v: number[]) => act(async () => { d.resolve(v); await tick(); }) };
    };

    it('account switches mid-embed (A → B) → A\'s voiceprint lands in neither library', async () => {
        const { view, resolveEmbedding } = await commitSegmentAsA();
        switchToB();
        view.rerender(as('user-b', TranscriptionHub));
        await resolveEmbedding([0.1, 0.2, 0.3, 0.4]);
        expect(speakersAt('user-a')).toEqual([]);
        expect(speakersAt('user-b')).toEqual([]);
        expect(speakersAt('_anonymous')).toEqual([]);
    });

    it('sign-out mid-embed (holder → null, captureOwner unchanged) → nothing lands in _anonymous', async () => {
        const { view, resolveEmbedding } = await commitSegmentAsA();
        view.unmount();                    // AuthGate swaps in LoginScreen (no usePerUserIdentity there)
        await oneSaveSync.bootstrap(null); // UserContext's logout effect: every store holder → null
        await resolveEmbedding([0.1, 0.2, 0.3, 0.4]);
        expect(speakersAt('_anonymous')).toEqual([]);
        expect(speakersAt('user-a')).toEqual([]);
    });

    it('control: no switch → the unknown voice is auto-enrolled in A\'s library', async () => {
        const { resolveEmbedding } = await commitSegmentAsA();
        await resolveEmbedding([0.1, 0.2, 0.3, 0.4]);
        expect(speakersAt('user-a').map((s: { label: string }) => s.label)).toEqual(['Unknown Speaker 1']);
    });
});
