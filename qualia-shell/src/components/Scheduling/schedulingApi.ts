/**
 * schedulingApi — thin client for the plan-053 cal.com backend proxy
 * (/api/scheduling). Same authFetch shape as shortLinksApi.ts / esignApi.ts:
 * the cal.com API key never reaches the browser.
 *
 * The backend answers 503 while CALCOM_API_KEY is unset, so callers key a
 * needs-setup UI on the typed result. This is a SEPARATE gate from the
 * VITE_CALCOM_URL embed gate — the booking iframe can work while the API does
 * not, and vice versa.
 */
import { getAuthToken } from '../../context/UserContext';
import { API_BASE } from '../../config';

/** Subset of cal.com's BookingOutput_2024_08_13 the widget renders. */
export interface CalBooking {
    uid: string;
    title: string;
    start: string;
    end: string;
    status: string;
    attendees?: Array<{ name?: string; email?: string }>;
    eventType?: { slug?: string; title?: string };
}

export interface CalEventType {
    id: number;
    slug: string;
    title: string;
    lengthInMinutes?: number;
}

export type SchedulingResult<T> =
    | { kind: 'ok'; data: T }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string };

/** Authenticated fetch — attaches the session token (shortLinksApi.ts pattern). */
function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const token = getAuthToken();
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...init, headers });
}

async function call<T>(path: string, init?: RequestInit, fallback?: T): Promise<SchedulingResult<T>> {
    try {
        const res = await authFetch(`${API_BASE}/api/scheduling${path}`, init);
        if (res.status === 503) return { kind: 'needs-setup' };
        const body = await res.json().catch(() => null);
        if (!res.ok) return { kind: 'error', message: body?.error || `Backend answered ${res.status}` };
        return { kind: 'ok', data: (body?.data ?? fallback) as T };
    } catch {
        return { kind: 'error', message: 'Backend unreachable' };
    }
}

/** Upcoming bookings (cal.com `?status=upcoming`). */
export function listUpcomingBookings(): Promise<SchedulingResult<CalBooking[]>> {
    return call<CalBooking[]>('/bookings?status=upcoming', undefined, []);
}

export function listEventTypes(): Promise<SchedulingResult<CalEventType[]>> {
    return call<CalEventType[]>('/event-types', undefined, []);
}

export function cancelBooking(uid: string, reason: string): Promise<SchedulingResult<unknown>> {
    return call(`/bookings/${encodeURIComponent(uid)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}
