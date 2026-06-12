/**
 * widgetActions — P11-7: the widget-action bus + compose-into-widget skill
 * triggers ("open notepad and draft a letter in it").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    performWidgetAction,
    consumePendingWidgetAction,
    supportsWidgetAction,
    resolveComposeTarget,
    lastOpenedWidgetHolder,
    WIDGET_ACTION_EVENT,
} from '../lib/widgetActions';
import { matchSkill } from '../lib/agents/skills';
import { parseChain } from '../lib/conductorChain';
import { openWidget } from '../lib/dwelliumCommands';
import { agentTeamsStore, agentLabUserIdHolder } from '../lib/agents/agentTeamsStore';

beforeEach(() => {
    lastOpenedWidgetHolder.current = null;
    agentLabUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
    consumePendingWidgetAction('notepad');
});

describe('bus mechanics', () => {
    it('performWidgetAction opens the widget, dispatches the event, and stocks the pending slot', () => {
        const open = vi.fn(); const act = vi.fn();
        window.addEventListener('dwellium:open-widget', open);
        window.addEventListener(WIDGET_ACTION_EVENT, act);
        try {
            expect(performWidgetAction('notepad', 'insert-text', { text: 'hello' })).toBe(true);
        } finally {
            window.removeEventListener('dwellium:open-widget', open);
            window.removeEventListener(WIDGET_ACTION_EVENT, act);
        }
        expect(open).toHaveBeenCalled();
        expect((act.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ widget: 'notepad', verb: 'insert-text' });
        expect(consumePendingWidgetAction('notepad')?.payload.text).toBe('hello');
        expect(consumePendingWidgetAction('notepad')).toBeNull(); // one-shot
    });

    it('unknown widget/verb pairs are rejected', () => {
        expect(supportsWidgetAction('strata-dashboard', 'insert-text')).toBe(false);
        expect(performWidgetAction('strata-dashboard', 'insert-text', { text: 'x' })).toBe(false);
    });

    it('openWidget records the last-opened widget for "…in it"', () => {
        openWidget('notepad');
        expect(lastOpenedWidgetHolder.current).toBe('notepad');
    });
});

describe('resolveComposeTarget', () => {
    it('explicit target wins; "it" falls to last-opened; default notepad', () => {
        expect(resolveComposeTarget('notepad', null)).toBe('notepad');
        expect(resolveComposeTarget('it', 'notepad')).toBe('notepad');
        expect(resolveComposeTarget(null, null)).toBe('notepad');
        // last-opened widget that does NOT support insert-text → default
        expect(resolveComposeTarget('it', 'strata-dashboard')).toBe('notepad');
    });
});

describe('compose-into-widget skill routing', () => {
    it('claims "draft a letter in it" and "write a thank you note in notepad"', () => {
        expect(matchSkill('draft a letter to my tenant in it')?.skill.id).toBe('skill-compose-widget');
        expect(matchSkill('write a thank you note in notepad')?.skill.id).toBe('skill-compose-widget');
    });

    it('does NOT claim plain drafting requests (those stay chat)', () => {
        expect(matchSkill('draft a friendly late-rent reminder for unit 4B')).toBeNull();
    });

    it('the headline chain parses: open notepad and draft a letter in it', () => {
        const chain = parseChain('open notepad and draft a letter in it');
        expect(chain).not.toBeNull();
        expect(chain!.steps.map(s => s.kind)).toEqual(['command', 'skill']);
        expect(chain!.steps[1].skill!.skill.id).toBe('skill-compose-widget');
    });
});
