/**
 * calcomLinks — Andy's cal.com event types + prefilled booking-link builder
 * (plan 053). Pure data + one pure function, imported by the Scheduling widget
 * AND by the Strata bridges (Leasing guest card, Maintenance work order), so
 * the link shape is defined once.
 *
 * Prefill is via `?name=` / `?email=` query params on the booking page — see
 * https://cal.com/docs/developing/guides/appstore-and-integration/how-to-show-assigned-people-from-a-crm.md
 * ("By prefilling your booking link with ?email=…").
 */

type Env = Record<string, string | undefined>;
const viteEnv = (): Env => (import.meta as unknown as { env?: Env }).env ?? {};

/** Booking-page URL from env (embed gate). Blank/unset → undefined. */
export function calcomUrl(env: Env = viteEnv()): string | undefined {
    const raw = env.VITE_CALCOM_URL?.trim();
    return raw ? raw : undefined;
}

/**
 * The user page (https://cal.com/<user>) that all event-type slugs hang off.
 *
 * ponytail: if VITE_CALCOM_URL already points at one event type
 * (https://cal.com/andy/unit-showing) we drop the last segment to get back to
 * the user page. Two segments is the only shape cal.com booking URLs take.
 */
export function calcomBase(env: Env = viteEnv()): string | undefined {
    const url = calcomUrl(env);
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        parsed.pathname = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : `/${segments.join('/')}`;
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/+$/, '');
    } catch {
        return undefined;
    }
}

export interface CalcomEventType {
    /** cal.com event-type slug — must match what Andy creates in cal.com. */
    slug: string;
    label: string;
    minutes: number;
    /** What it is for, shown under the label in the Links tab. */
    purpose: string;
}

/** Andy's four event types (plan 053) — created once in cal.com, referenced here by slug. */
export const ANDY_EVENT_TYPES: CalcomEventType[] = [
    { slug: 'showing-30min', label: 'Showing', minutes: 30, purpose: 'Prospect tours a vacant unit' },
    { slug: 'maintenance-window-2h', label: 'Maintenance window', minutes: 120, purpose: 'Resident picks a 2-hour repair window' },
    { slug: 'vendor-visit-1h', label: 'Vendor visit', minutes: 60, purpose: 'Vendor books access for a scheduled job' },
    { slug: 'move-in-out-walkthrough-45min', label: 'Move-in/out walkthrough', minutes: 45, purpose: 'Condition report at move-in or move-out' },
];

/** Andy's Georgia multifamily properties (AstraStrata) — the per-property link rows. */
export const ANDY_PROPERTIES = ['Woodland Parc Townhomes', 'Riverwood Club Apartments'];

export interface BookingPrefill {
    name?: string;
    email?: string;
    notes?: string;
}

/** `<base>/<slug>?name=&email=&notes=` — blank prefill fields are omitted. */
export function buildBookingLink(base: string, slug: string, prefill: BookingPrefill = {}): string {
    const url = new URL(`${base.replace(/\/+$/, '')}/${slug.replace(/^\/+/, '')}`);
    if (prefill.name?.trim()) url.searchParams.set('name', prefill.name.trim());
    if (prefill.email?.trim() && prefill.email.trim() !== '—') url.searchParams.set('email', prefill.email.trim());
    if (prefill.notes?.trim()) url.searchParams.set('notes', prefill.notes.trim());
    return url.toString();
}

/**
 * Bridge helper — the prefilled link for one event type, or undefined when
 * VITE_CALCOM_URL is unset (callers then show the honest "not configured" hint).
 */
export function bookingLinkFor(slug: string, prefill: BookingPrefill = {}, env: Env = viteEnv()): string | undefined {
    const base = calcomBase(env);
    return base ? buildBookingLink(base, slug, prefill) : undefined;
}
