/**
 * pendingDeepLink — one-deep "open item X" slot per widget, for links fired
 * before the target widget's lazy chunk has mounted (plan 069 phase 3). The
 * sender sets the slot AND dispatches the widget's live event; a mounted
 * widget handles the event and takes the slot, an unmounted one takes it on
 * mount. Same idea as Wiki's pending path and widgetActions' pending map.
 */
// ponytail: 15 s TTL — long enough for a lazy chunk to load, short enough that a link
// whose widget never mounted can't hijack an unrelated open later.
const TTL_MS = 15_000;
const pending = new Map<string, { id: string; at: number }>();

function live(widget: string): string | undefined {
    const p = pending.get(widget);
    if (!p) return undefined;
    if (Date.now() - p.at > TTL_MS) { pending.delete(widget); return undefined; }
    return p.id;
}

export function setPendingDeepLink(widget: string, itemId: string): void {
    pending.set(widget, { id: itemId, at: Date.now() });
}

export function peekPendingDeepLink(widget: string): string | undefined {
    return live(widget);
}

export function takePendingDeepLink(widget: string): string | undefined {
    const id = live(widget);
    pending.delete(widget);
    return id;
}
