/**
 * briefNotifier — real Web Notification for the morning brief (plan 046 B3).
 *
 * Platform API only (no service worker): fires while a Dwellium tab is open or
 * in the background. Gated by the Activation Center toggles
 * (notifications.enabled && notifications.morningBrief) AND a granted permission.
 * Permission is requested ONLY when the user flips the toggle on.
 */
import { activationStore } from './activationStore';
import type { MorningBrief } from './morningBriefStore';
import { markBriefSeen, requestBriefInAra } from './morningBriefStore';

function notificationApi(): typeof Notification | null {
    return typeof Notification === 'undefined' ? null : Notification;
}

export function canNotify(): boolean {
    const N = notificationApi();
    if (!N) return false;
    const cfg = activationStore.getSnapshot().notifications;
    return !!cfg.enabled && !!cfg.morningBrief && N.permission === 'granted';
}

/** Ask once when the toggle is switched on; no-op where unsupported. */
export function requestBriefNotificationPermission(): void {
    const N = notificationApi();
    if (!N) return;
    try { void N.requestPermission(); } catch { /* older callback-style / sandboxed */ }
}

/** Desktop notification for a new brief; click opens the brief in ARA. */
export function notifyNewBrief(b: MorningBrief): void {
    if (!canNotify()) return;
    try {
        const n = new Notification('Your morning brief is ready', {
            body: b.insights[0]?.title ?? b.dataLines[0] ?? b.date,
            tag: `dwellium-brief-${b.date}`, // same-day dedupe
        });
        n.onclick = () => {
            try { window.focus(); } catch { /* ignore */ }
            requestBriefInAra(b.date); // ARA mount-race leg picks it up when ARA opens
            markBriefSeen(b.date);
        };
    } catch { /* a background nicety must never surface */ }
}
