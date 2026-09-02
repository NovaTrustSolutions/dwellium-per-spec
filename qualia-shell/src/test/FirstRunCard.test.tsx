/**
 * FirstRunCard — plan 046 F1 "Get to your first win".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

const USER = vi.hoisted(() => ({ id: 'u-first', name: 'Zed', email: 'zed@example.com', role: 'management' }));
vi.mock('../context/UserContext', async () => {
    const React = await import('react');
    return { UserContext: React.createContext({ user: USER }) };
});

const live = vi.hoisted(() => ({
    properties: [] as Array<{ id: string }>,
    araRuns: [] as Array<{ id: string }>,
    holderSeenAtRead: [] as Array<string | null>,
}));
vi.mock('../components/StrataDashboard/useStrataQueries', () => ({
    useProperties: () => ({ data: live.properties }),
}));
vi.mock('../components/ARAConsole/araHermes', async () => {
    const { hermesLearningUserIdHolder } = await import('../components/HonchoHermesPanel/hermesLearningStore');
    return {
        araChatRuns: () => {
            live.holderSeenAtRead.push(hermesLearningUserIdHolder.current);
            return live.araRuns;
        },
    };
});

import FirstRunCard, { ARA_HELLO_PROMPT } from '../components/Shell/FirstRunCard';
import { firstRunStore, firstRunUserIdHolder, markDone, resetFirstRun, FIRST_RUN_DISMISSED_SESSION_KEY } from '../lib/firstRunStore';
import { integrationsStore, saveIntegrations } from '../utils/integrationsStore';
import { emptyIntegrations } from '../types/integrations';
import { araPromptBus, openWidgetBus } from '../lib/busChannels';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.removeItem(FIRST_RUN_DISMISSED_SESSION_KEY);
    firstRunUserIdHolder.current = USER.id;
    resetFirstRun();
    firstRunStore.reset();
    integrationsStore.reset();
    live.properties = [];
    live.araRuns = [];
    live.holderSeenAtRead = [];
    araPromptBus.consume();
    openWidgetBus.consume();
});

describe('FirstRunCard', () => {
    it('renders three steps at 0/3 with the exact copy', () => {
        render(<FirstRunCard />);
        expect(screen.getByText('Get to your first win')).toBeInTheDocument();
        expect(screen.getByText('Three steps, about five minutes.')).toBeInTheDocument();
        expect(screen.getByText('0/3')).toBeInTheDocument();
        expect(screen.getByText('Add an AI key')).toBeInTheDocument();
        expect(screen.getByText('Bring your data')).toBeInTheDocument();
        expect(screen.getAllByText('Ask ARA')).toHaveLength(2); // step title + CTA
        expect(document.querySelectorAll('.firstrun-step')).toHaveLength(3);
    });

    it('sets the hermes holder to the user BEFORE araChatRuns() is read', () => {
        render(<FirstRunCard />);
        expect(live.holderSeenAtRead.length).toBeGreaterThan(0);
        expect(live.holderSeenAtRead.every(v => v === USER.id)).toBe(true);
    });

    it('an enabled anthropic key ticks step 1 without reload and sticks in the store', () => {
        render(<FirstRunCard />);
        expect(screen.getByText('0/3')).toBeInTheDocument();
        act(() => {
            saveIntegrations({
                ...emptyIntegrations(),
                llm: { active: 'anthropic', anthropic: { enabled: true, apiKey: 'sk-ant-test', model: 'x' } },
            });
        });
        expect(screen.getByText('1/3')).toBeInTheDocument();
        expect(document.querySelectorAll('.firstrun-step.is-done')).toHaveLength(1);
        expect(firstRunStore.getSnapshot().done).toContain('key');
    });

    it('step-1 CTA opens the api-keys widget on the open-widget bus', () => {
        render(<FirstRunCard />);
        fireEvent.click(screen.getByRole('button', { name: 'Open API Keys' }));
        expect(openWidgetBus.consume()).toEqual({ widgetId: 'api-keys', label: 'API Keys' });
    });

    it('"Ask ARA" opens ARA and queues the hello prompt', () => {
        render(<FirstRunCard />);
        fireEvent.click(screen.getByRole('button', { name: 'Ask ARA' }));
        expect(openWidgetBus.consume()?.widgetId).toBe('ara-console');
        expect(araPromptBus.consume()?.text).toBe(ARA_HELLO_PROMPT);
        expect(ARA_HELLO_PROMPT).toBe('What can you help me with in Dwellium?');
    });

    it('"Don\'t show again" unmounts the card and persists neverShow', () => {
        const { container } = render(<FirstRunCard />);
        fireEvent.click(screen.getByRole('button', { name: "Don't show again" }));
        expect(container.querySelector('.firstrun-card')).toBeNull();
        expect(firstRunStore.getSnapshot().neverShow).toBe(true);
    });

    it('"Dismiss" hides for this session only', () => {
        const { container } = render(<FirstRunCard />);
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(container.querySelector('.firstrun-card')).toBeNull();
        expect(sessionStorage.getItem(FIRST_RUN_DISMISSED_SESSION_KEY)).toBe('1');
        expect(firstRunStore.getSnapshot().neverShow).toBe(false);
    });

    // Plan 056 §1: the shared backend's global /properties list (158 units on
    // the prod backend) is NOT the user's data — it must never self-tick step 2.
    it('step 2 "Bring your data": global backend properties alone do NOT tick it', () => {
        live.properties = [{ id: 'p1' }, { id: 'p2' }];
        render(<FirstRunCard />);
        expect(screen.getByText('0/3')).toBeInTheDocument();
        expect(firstRunStore.getSnapshot().done).not.toContain('data');
        expect(screen.getByRole('button', { name: 'Add a property' })).toBeInTheDocument();
    });

    it('step 2 ticks when the USER adds a property (per-user marker from the Strata add flow)', () => {
        render(<FirstRunCard />);
        act(() => { markDone('data'); }); // what PropertiesModule.handleCreate calls on success
        expect(screen.getByText('1/3')).toBeInTheDocument();
        expect(firstRunStore.getSnapshot().done).toEqual(['data']);
    });

    it('step 3 ticks on the first ARA reply in either mode (hello-mode replies are recorded the same way)', () => {
        live.araRuns = [{ id: 'r1' }];
        render(<FirstRunCard />);
        expect(screen.getByText('1/3')).toBeInTheDocument();
        expect(firstRunStore.getSnapshot().done).toEqual(['ara']);
        expect(screen.getByText('Say hello — ARA answers in seconds, no key needed.')).toBeInTheDocument();
    });

    it('PropertiesModule stamps the per-user data marker on create (source guard)', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const src = readFileSync(resolve(process.cwd(), 'src/components/StrataDashboard/modules/PropertiesModule.tsx'), 'utf8');
        expect(src).toMatch(/markFirstRunDone\('data'\)/);
    });
});
