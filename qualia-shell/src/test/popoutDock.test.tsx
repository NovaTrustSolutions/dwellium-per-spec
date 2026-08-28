/**
 * popoutDock.test.tsx — dock-back protocol for popped-out widgets.
 *
 * Covers: origin + shape validation on the receiver, receive-time routing
 * (cockpit open-first vs the plain `dwellium:open-widget` bus every shell
 * answers), the ack round-trip (popup closes only on ack; honest notice on
 * timeout), the BroadcastChannel fallback when the opener is gone, and
 * first-ack-wins when several main windows are listening.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

function makeWidget(label: string, className: string) {
    return function MockWidget() {
        return <div className={className}>{label} content</div>;
    };
}

vi.mock('../registry/widgetRegistry', () => ({
    WIDGET_REGISTRY: {
        alpha: { id: 'alpha', label: 'Alpha', icon: 'layout-grid' },
    },
    WINDOW_COMPONENTS: {},
}));
vi.mock('../components/Shell/Desktop', () => ({
    WINDOW_COMPONENTS: { alpha: makeWidget('Alpha', 'alpha-widget') },
}));
vi.mock('../context/LayoutContext', () => ({
    LayoutProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../context/HierarchyContext', () => ({
    HierarchyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../context/WindowContext', () => ({
    WindowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { installDockBackReceiver, requestDockBack, DOCK_CHANNEL } from '../lib/popoutDock';
import { fluidOsStore } from '../lib/fluidOsStore';
import { halocronOsStore } from '../lib/halocronOsStore';
import { PopupShell } from '../components/PopupShell/PopupShell';

// ── BroadcastChannel stub (presenterView pattern): same-name instances hear each other ──
const stubChannels: StubChannel[] = [];
class StubChannel {
    name: string;
    onmessage: ((e: MessageEvent) => void) | null = null;
    closed = false;
    constructor(name: string) { this.name = name; stubChannels.push(this); }
    postMessage(data: unknown) {
        stubChannels.forEach((c) => {
            if (c !== this && c.name === this.name && !c.closed) c.onmessage?.({ data } as MessageEvent);
        });
    }
    close() { this.closed = true; }
}

/** Fire a same-origin dock-back postMessage at the receiver. */
function fireDockMessage(data: unknown, opts: { origin?: string; source?: unknown } = {}) {
    const ev = new MessageEvent('message', { data, origin: opts.origin ?? window.location.origin });
    if (opts.source) Object.defineProperty(ev, 'source', { value: opts.source });
    window.dispatchEvent(ev);
}

const dockReq = (component = 'alpha', nonce = 'n1') => ({
    type: 'qualia-dock-back', nonce, component, title: 'Alpha', icon: '',
});

let openWidgetEvents: Array<{ widgetId: string; label?: string; icon?: string }> = [];
const onOpenWidget = (e: Event) => { openWidgetEvents.push((e as CustomEvent).detail); };

let cleanups: Array<() => void> = [];

beforeEach(() => {
    localStorage.clear();
    fluidOsStore.reset();
    halocronOsStore.reset();
    openWidgetEvents = [];
    stubChannels.length = 0;
    window.addEventListener('dwellium:open-widget', onOpenWidget);
    vi.stubGlobal('BroadcastChannel', StubChannel);
    vi.stubGlobal('opener', null);
});

afterEach(() => {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    window.removeEventListener('dwellium:open-widget', onOpenWidget);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const installReceiver = () => { cleanups.push(installDockBackReceiver()); };

describe('dock-back receiver — validation', () => {
    it('ignores messages from a foreign origin', () => {
        installReceiver();
        fireDockMessage(dockReq(), { origin: 'https://evil.example' });
        expect(openWidgetEvents).toHaveLength(0);
    });

    it('ignores same-origin messages that do not match the typed shape', () => {
        installReceiver();
        fireDockMessage({ type: 'qualia-dock-back', nonce: 'n1' });          // no component
        fireDockMessage({ type: 'something-else', component: 'alpha' });
        fireDockMessage('qualia-dock-back');
        expect(openWidgetEvents).toHaveLength(0);
    });
});

describe('dock-back receiver — receive-time routing', () => {
    it('neither shell enabled → routes onto the open-widget bus (Classic path) and leaves the OS stores alone', () => {
        installReceiver();
        fireDockMessage(dockReq());
        expect(openWidgetEvents).toEqual([{ widgetId: 'alpha', label: 'Alpha', icon: '' }]);
        expect(fluidOsStore.getSnapshot().open).toBe(false);
        expect(halocronOsStore.getSnapshot().open).toBe(false);
    });

    it('cockpit enabled → re-opens the cockpit BEFORE the widget opens so it is adopted as a cockpit tab', () => {
        fluidOsStore.setEnabled(true);
        fluidOsStore.setOpen(false); // collapsed at dock time
        let cockpitOpenAtDispatch: boolean | null = null;
        const probe = () => { cockpitOpenAtDispatch = fluidOsStore.getSnapshot().open; };
        window.addEventListener('dwellium:open-widget', probe);
        installReceiver();
        fireDockMessage(dockReq());
        window.removeEventListener('dwellium:open-widget', probe);
        expect(fluidOsStore.getSnapshot().open).toBe(true);
        expect(cockpitOpenAtDispatch).toBe(true);
        expect(openWidgetEvents).toEqual([{ widgetId: 'alpha', label: 'Alpha', icon: '' }]);
    });

    it('holocron enabled (cockpit off) → routes onto the bus Holocron natively answers with a tab + open shell', () => {
        halocronOsStore.setEnabled(true);
        halocronOsStore.setOpen(false);
        installReceiver();
        fireDockMessage(dockReq());
        // The HalocronOS component owns the tab + setOpen(true) half — asserted
        // in halocronOS.test.tsx. Here: bus fired, cockpit untouched.
        expect(openWidgetEvents).toEqual([{ widgetId: 'alpha', label: 'Alpha', icon: '' }]);
        expect(fluidOsStore.getSnapshot().open).toBe(false);
    });

    it('acks back to the popup that sent the request', () => {
        installReceiver();
        const source = { postMessage: vi.fn() };
        fireDockMessage(dockReq('alpha', 'nonce-42'), { source });
        expect(source.postMessage).toHaveBeenCalledWith(
            { type: 'qualia-dock-ack', nonce: 'nonce-42' },
            window.location.origin,
        );
    });
});

describe('requestDockBack — popup side', () => {
    it('resolves true when the opener acks (round-trip), ignoring later duplicate acks', async () => {
        const sent: any[] = [];
        vi.stubGlobal('opener', {
            closed: false,
            postMessage: (msg: any) => {
                sent.push(msg);
                // Main window acks twice — first ack wins, second is ignored.
                const ack = { type: 'qualia-dock-ack', nonce: msg.nonce };
                fireDockMessage(ack);
                fireDockMessage(ack);
            },
        });
        await expect(requestDockBack({ component: 'alpha', title: 'Alpha', icon: '' })).resolves.toBe(true);
        expect(sent[0]).toMatchObject({ type: 'qualia-dock-back', component: 'alpha' });
    });

    it('resolves false when no main window acks within the timeout', async () => {
        vi.stubGlobal('opener', { closed: false, postMessage: vi.fn() }); // opener never answers
        await expect(requestDockBack({ component: 'alpha', title: 'Alpha', icon: '' }, 25)).resolves.toBe(false);
    });

    it('falls back to BroadcastChannel when the opener is gone and docks into a surviving main window', async () => {
        installReceiver(); // surviving main window (no opener relationship)
        await expect(requestDockBack({ component: 'alpha', title: 'Alpha', icon: '' }, 25)).resolves.toBe(true);
        expect(openWidgetEvents).toEqual([{ widgetId: 'alpha', label: 'Alpha', icon: '' }]);
    });

    it('first offer wins with two main windows listening — exactly ONE adopts', async () => {
        installReceiver();
        installReceiver();
        await expect(requestDockBack({ component: 'alpha', title: 'Alpha', icon: '' }, 25)).resolves.toBe(true);
        expect(openWidgetEvents).toHaveLength(1);
    });

    it('resolves false when the opener is gone and no BroadcastChannel exists', async () => {
        vi.stubGlobal('BroadcastChannel', undefined);
        await expect(requestDockBack({ component: 'alpha', title: 'Alpha', icon: '' }, 25)).resolves.toBe(false);
    });

    it('uses the shared channel name popoutDock receivers listen on', () => {
        expect(DOCK_CHANNEL).toBe('dwellium-dock-back');
    });
});

describe('PopupShell dock-back control', () => {
    it('closes the popup only after a main window acks', async () => {
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
        vi.stubGlobal('opener', {
            closed: false,
            postMessage: (msg: any) => fireDockMessage({ type: 'qualia-dock-ack', nonce: msg.nonce }),
        });
        render(<PopupShell component="alpha" />);
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Dock Back/i })); });
        expect(closeSpy).toHaveBeenCalled();
    });

    it('keeps the widget and shows the honest notice when no main window answers', async () => {
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
        vi.stubGlobal('BroadcastChannel', undefined); // no opener, no channel → immediate honest failure
        render(<PopupShell component="alpha" />);
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Dock Back/i })); });
        expect(await screen.findByText("Couldn't dock — main window not found")).toBeInTheDocument();
        expect(screen.getByText('Alpha content')).toBeInTheDocument();
        expect(closeSpy).not.toHaveBeenCalled();
        // The control stays clickable as the retry path.
        expect(screen.getByRole('button', { name: /Dock Back/i })).toBeEnabled();
    });
});
