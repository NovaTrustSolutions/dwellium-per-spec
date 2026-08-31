/**
 * Scheduling widget (plan 047 phase 2 — hosted cal.com free plan).
 *
 * VITE_CALCOM_URL unset → "Connect Cal.com" needs-setup card whose button
 * opens the Tools hub; set → the booking page in an iframe + "Open ↗".
 * Env is injected via the component's `env` prop (same shape as
 * ToolsHub::toolStatuses(env)) so no import.meta.env stubbing is needed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Scheduling, { calcomUrl } from '../components/Scheduling/Scheduling';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { resetWidgetMemory } from '../lib/widgetMemory';

const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));
beforeEach(() => { resetWidgetMemory(); opened.length = 0; window.addEventListener('dwellium:open-widget', onOpen); });
afterEach(() => window.removeEventListener('dwellium:open-widget', onOpen));

describe('calcomUrl', () => {
    it('returns undefined when unset/blank and the trimmed URL when set', () => {
        expect(calcomUrl({})).toBeUndefined();
        expect(calcomUrl({ VITE_CALCOM_URL: '   ' })).toBeUndefined();
        expect(calcomUrl({ VITE_CALCOM_URL: ' https://cal.com/andy/unit-showing ' })).toBe('https://cal.com/andy/unit-showing');
    });
});

describe('Scheduling widget', () => {
    it('is registered as "scheduler" (Tools hub row: needs-setup until VITE_CALCOM_URL)', () => {
        expect(WIDGET_REGISTRY['scheduler']).toBeDefined();
        expect(WIDGET_REGISTRY['scheduler'].label).toBe('Scheduling');
        expect(WIDGET_REGISTRY['scheduler'].icon).toBe('calendar-days');
    });

    it('renders the Connect Cal.com card when the env is unset; its button opens the Tools hub', () => {
        render(<Scheduling env={{}} />);
        expect(screen.getByText('Connect Cal.com')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Create a free cal\.com account/ })).toHaveAttribute('href', 'https://cal.com/signup');
        expect(document.querySelector('iframe')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('renders the booking-page iframe + Open ↗ when VITE_CALCOM_URL is set', () => {
        const url = 'https://cal.com/andy/unit-showing';
        render(<Scheduling env={{ VITE_CALCOM_URL: url }} />);
        expect(screen.getByTitle('Scheduling booking page')).toHaveAttribute('src', url);
        expect(screen.getByRole('link', { name: 'Open ↗' })).toHaveAttribute('href', url);
        expect(screen.queryByText('Connect Cal.com')).toBeNull();
    });
});
