/**
 * WidgetTip — plan 047 §4: renders once per user per widget (3 bullets from the
 * registry), "Got it" persists seen + logs; null when seen; suppressed until a
 * role is picked and for windows mounted before the pick; titlebar/⌘K force
 * re-opens via `dwellium:show-tip`; related chips open widgets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), history: vi.fn() },
}));
const USER = vi.hoisted(() => ({ id: 'u-tip', name: 'Zed', email: 'zed@example.com', role: 'management' }));
vi.mock('../context/UserContext', async () => {
    const React = await import('react');
    return { UserContext: React.createContext({ user: USER }) };
});

import WidgetTip from '../components/Window/WidgetTip';
import { onboardingStore, resetOnboarding, setOnboardingRole, markTipSeen } from '../lib/onboardingStore';
import { showWidgetTip, SHOW_TIP_EVENT } from '../lib/helpCommands';
import { activityLogStore, resetActivityLog } from '../lib/activityLogStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';


// `openWidget()` dispatches a plain `dwellium:open-widget` CustomEvent (not a typed-bus emit) — capture it.
const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));
beforeEach(() => {
    localStorage.clear();
    setPerUserIdentity(USER.id);
    onboardingStore.reset(); resetOnboarding();
    resetActivityLog(); activityLogStore.reset();
    opened.length = 0;
    window.addEventListener('dwellium:open-widget', onOpen);
});
afterEach(() => window.removeEventListener('dwellium:open-widget', onOpen));

describe('WidgetTip', () => {
    it('renders the three bullets once a role is set, "Got it" persists + logs, then null', () => {
        setOnboardingRole('owner');
        const { container, rerender } = render(<WidgetTip widgetId="scribe" />);
        const reg = WIDGET_REGISTRY['scribe'];
        expect(screen.getByRole('note')).toBeInTheDocument();
        expect(container.textContent).toContain(reg.description);
        expect(container.textContent).toContain(reg.tip!.tryThis);
        expect(screen.getByRole('button', { name: 'Notepad' })).toBeInTheDocument(); // related chip
        fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
        expect(onboardingStore.getSnapshot().seenTips).toEqual(['scribe']);
        expect(activityLogStore.getSnapshot().find(e => e.action === 'onboarding:tip-seen')?.details).toEqual({ widgetId: 'scribe', dismissed: 'button' });
        rerender(<WidgetTip widgetId="scribe" />);
        expect(container.querySelector('.widget-tip')).toBeNull();
        // fresh mount, already seen → null
        const again = render(<WidgetTip widgetId="scribe" />);
        expect(again.container.querySelector('.widget-tip')).toBeNull();
    });

    it('is suppressed until a role is picked, and for windows mounted BEFORE the pick', () => {
        const { container } = render(<WidgetTip widgetId="scribe" />);
        expect(container.querySelector('.widget-tip')).toBeNull();
        act(() => setOnboardingRole('owner'));
        expect(container.querySelector('.widget-tip')).toBeNull(); // mounted pre-pick → stays quiet
        const later = render(<WidgetTip widgetId="notepad" />);
        expect(later.container.querySelector('.widget-tip')).not.toBeNull();
    });

    it('dwellium:show-tip forces it open (even when seen / no role); related chip opens the widget', () => {
        markTipSeen('scribe');
        const { container } = render(<WidgetTip widgetId="scribe" />);
        expect(container.querySelector('.widget-tip')).toBeNull();
        act(() => { window.dispatchEvent(new CustomEvent(SHOW_TIP_EVENT, { detail: { widgetId: 'scribe' } })); });
        expect(container.querySelector('.widget-tip')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Notepad' }));
        expect(opened).toEqual(['notepad']);
    });

    it('showWidgetTip() re-arms the seen flag and dispatches the event after a beat', async () => {
        vi.useFakeTimers();
        try {
            markTipSeen('scribe');
            const seen: string[] = [];
            const on = (e: Event) => seen.push((e as CustomEvent<{ widgetId: string }>).detail.widgetId);
            window.addEventListener(SHOW_TIP_EVENT, on);
            showWidgetTip('scribe');
            expect(onboardingStore.getSnapshot().seenTips).toEqual([]);
            vi.advanceTimersByTime(400);
            expect(seen).toEqual(['scribe']);
            window.removeEventListener(SHOW_TIP_EVENT, on);
        } finally { vi.useRealTimers(); }
    });

    it('renders nothing for an id without a registry tip', () => {
        setOnboardingRole('owner');
        const { container } = render(<WidgetTip widgetId="no-such-widget" />);
        expect(container.querySelector('.widget-tip')).toBeNull();
    });
});
