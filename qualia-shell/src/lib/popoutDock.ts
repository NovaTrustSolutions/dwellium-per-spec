/**
 * popoutDock.ts — the ONE "dock this popped-out widget back into the shell"
 * protocol. Counterpart to popoutWindow.ts (which handles the tear-OFF half).
 *
 * Routing happens at RECEIVE time in the main window, not at send time: the
 * receiver simply re-fires the existing `dwellium:open-widget` intent bus,
 * which every layout already answers natively —
 *   - Cockpit (Fluid OS) enabled → we re-open the cockpit first; the widget
 *     window WindowContext opens is adopted as a cockpit tab.
 *   - Holocron OS enabled → its always-registered bus listener opens the
 *     widget as a Holocron tab AND re-opens the shell overlay.
 *   - Neither → WindowContext's bus listener opens a Classic desktop window
 *     (the original dock-back behavior, unchanged).
 *
 * Transport + handshake:
 *   popup with a live opener  → direct postMessage → receiver adopts + acks.
 *   popup with no opener      → BroadcastChannel('dwellium-dock-back'):
 *     popup broadcasts a request; every main window answers with an OFFER;
 *     the popup COMMITs to the FIRST offer only, so exactly one window
 *     adopts even when several Dwellium windows are open.
 *   No ack/offer within the timeout → the popup keeps the widget and shows
 *   an honest notice instead of losing it.
 */
import { fluidOsStore } from './fluidOsStore';

export const DOCK_CHANNEL = 'dwellium-dock-back';
export const DOCK_ACK_TIMEOUT_MS = 1500;

export interface DockBackRequest {
    type: 'qualia-dock-back';
    nonce: string;
    component: string;
    title: string;
    icon: string;
}
interface DockAck { type: 'qualia-dock-ack'; nonce: string }
interface DockOffer { type: 'qualia-dock-offer'; nonce: string; receiverId: string }
interface DockCommit extends Omit<DockBackRequest, 'type'> { type: 'qualia-dock-commit'; receiverId: string }

function isDockBackRequest(msg: unknown): msg is DockBackRequest {
    const m = msg as DockBackRequest | null;
    return Boolean(m && m.type === 'qualia-dock-back'
        && typeof m.component === 'string' && m.component
        && typeof m.nonce === 'string');
}

/** Route a docked widget into whichever layout is active RIGHT NOW. */
function adoptDockedWidget(msg: { component: string; title: string; icon: string }): void {
    try { window.focus(); } catch { /* headless */ }
    // Cockpit must be OPEN before the widget window appears so FluidOS's
    // adopt-while-open effect turns it into a cockpit tab (not a hidden
    // window behind a closed overlay). Holocron re-opens itself in its own
    // bus listener; Classic needs nothing.
    if (fluidOsStore.getSnapshot().enabled) fluidOsStore.setOpen(true);
    window.dispatchEvent(new CustomEvent('dwellium:open-widget', {
        detail: { widgetId: msg.component, label: msg.title || msg.component, icon: msg.icon || '' },
    }));
    window.dispatchEvent(new CustomEvent('qualia-toast', {
        detail: `"${msg.title || msg.component}" docked back ↩`,
    }));
}

/**
 * Install the main-window receiver (mounted once by AdminShell).
 * Returns a cleanup function.
 */
export function installDockBackReceiver(): () => void {
    const receiverId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    // Direct path: popup posts to its opener. Same-origin only; adopt + ack.
    const onMessage = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (!isDockBackRequest(e.data)) return;
        adoptDockedWidget(e.data);
        try {
            (e.source as Window | null)?.postMessage(
                { type: 'qualia-dock-ack', nonce: e.data.nonce } satisfies DockAck,
                window.location.origin,
            );
        } catch { /* popup already gone — widget is adopted either way */ }
    };
    window.addEventListener('message', onMessage);

    // Broadcast path: offer, adopt only when the popup commits to US.
    let ch: BroadcastChannel | null = null;
    try {
        if (typeof BroadcastChannel !== 'undefined') ch = new BroadcastChannel(DOCK_CHANNEL);
    } catch { /* engine without BroadcastChannel — direct path still works */ }
    if (ch) {
        ch.onmessage = (e: MessageEvent) => {
            const msg = e.data as DockOffer | DockCommit | DockBackRequest;
            if (isDockBackRequest(msg)) {
                ch!.postMessage({ type: 'qualia-dock-offer', nonce: msg.nonce, receiverId } satisfies DockOffer);
                return;
            }
            if (msg?.type === 'qualia-dock-commit' && msg.receiverId === receiverId) {
                adoptDockedWidget(msg);
            }
        };
    }

    return () => {
        window.removeEventListener('message', onMessage);
        ch?.close();
    };
}

/**
 * Popup side: ask a main window to adopt this widget.
 * Resolves true when a main window acked (safe to close the popup),
 * false when none answered within the timeout (keep the widget, show notice).
 */
export function requestDockBack(
    fields: { component: string; title: string; icon: string },
    timeoutMs: number = DOCK_ACK_TIMEOUT_MS,
): Promise<boolean> {
    const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const req: DockBackRequest = { type: 'qualia-dock-back', nonce, ...fields };

    return new Promise((resolve) => {
        let settled = false;
        let ch: BroadcastChannel | null = null;
        const timer = setTimeout(() => settle(false), timeoutMs);
        const onAck = (e: MessageEvent) => {
            if (e.origin !== window.location.origin) return;
            const msg = e.data as DockAck;
            if (msg?.type === 'qualia-dock-ack' && msg.nonce === nonce) settle(true);
        };
        const settle = (ok: boolean) => {
            if (settled) return; // first ack/offer wins; later ones ignored
            settled = true;
            clearTimeout(timer);
            window.removeEventListener('message', onAck);
            ch?.close();
            resolve(ok);
        };

        let opener: Window | null = null;
        try { opener = window.opener && !window.opener.closed ? window.opener : null; } catch { opener = null; }

        if (opener) {
            window.addEventListener('message', onAck);
            try { opener.postMessage(req, window.location.origin); } catch { settle(false); return; }
        } else {
            try {
                if (typeof BroadcastChannel === 'undefined') { settle(false); return; }
                ch = new BroadcastChannel(DOCK_CHANNEL);
            } catch { settle(false); return; }
            ch.onmessage = (e: MessageEvent) => {
                const msg = e.data as DockOffer;
                if (settled || msg?.type !== 'qualia-dock-offer' || msg.nonce !== nonce) return;
                // First offer wins — commit to that window only, then done.
                ch!.postMessage({ type: 'qualia-dock-commit', receiverId: msg.receiverId, nonce, ...fields } satisfies DockCommit);
                settle(true);
            };
            ch.postMessage(req);
        }
    });
}
