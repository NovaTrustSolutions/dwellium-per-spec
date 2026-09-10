/**
 * Hosts whose CSP `frame-ancestors` / `X-Frame-Options` forbid embedding.
 * A no-cors fetch cannot read those headers, so this static list is the
 * cheapest honest signal; the embed surfaces show an "Open ↗" card instead of
 * the browser's "refused to connect" page. Shared by the Cockpit preview
 * (FluidOS) and the Terminal widget's CrewAI tab.
 *
 * Verified: www.appfolio.com 2026-08-22 (`frame-ancestors 'self' *.appfolio.com`);
 * app.crewai.com 2026-09-08 (`x-frame-options: SAMEORIGIN` + `frame-ancestors`
 * limited to bolt.new / lovable.dev / replit.com / riff.new / v0.app).
 * Upgrade path if the list grows: a backend HEAD probe (`/api/preview/probe`).
 */
export const FRAME_BLOCKED_HOSTS = [
    'appfolio.com', 'google.com', 'gmail.com', 'youtube.com', 'office.com', 'live.com',
    'microsoft.com', 'github.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'x.com',
    'twitter.com', 'dropbox.com', 'apple.com', 'icloud.com', 'app.crewai.com',
];

export function isKnownFrameBlocked(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return FRAME_BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
        return false;
    }
}

/** Hostname for display; falls back to the raw string when it is not a URL. */
export function hostOf(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
}
