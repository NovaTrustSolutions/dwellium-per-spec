/**
 * imageSources — Wave 2 stock / GIF / placeholder image sources for the
 * ImagePicker. Pure fetchers with an injectable `fetchFn` (tests are
 * network-free). Every fetcher resolves to `StockImage[]` or throws a plain
 * Error with a user-readable message (HTTP status / network); the UI catches.
 *
 *   searchOpenverse(q)            — free, keyless, CC-licensed (api.openverse.org)
 *   searchUnsplash(q, accessKey)  — needs an Unsplash access key
 *   searchGiphy(q, apiKey)        — needs a Giphy API key
 *   picsumUrl(w, h, seed?)        — placeholder photo (picsum.photos)
 *   attributionFor(img)           — "Photo: creator · CC BY 4.0 · via Openverse"
 *   loadMediaKeys / saveMediaKeys — localStorage['scribe-idocs:media-keys'] {unsplash?, giphy?}
 */

export type StockSource = 'openverse' | 'unsplash' | 'giphy';

export interface StockImage {
    /** Full-size URL to store in the block. */
    url: string;
    thumb: string;
    title: string;
    creator: string;
    license: string;
    source: StockSource;
    /** Landing page for attribution links. */
    link?: string;
}

export interface MediaKeys { unsplash?: string; giphy?: string }
export const MEDIA_KEYS_STORAGE = 'scribe-idocs:media-keys';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

async function getJson(fetchFn: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
    let res: Response;
    try { res = await fetchFn(url, init); } catch (e) { throw new Error(`Network error: ${(e as Error)?.message || e}`); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export async function searchOpenverse(q: string, fetchFn: typeof fetch = fetch): Promise<StockImage[]> {
    const query = q.trim();
    if (!query) return [];
    const json = await getJson(fetchFn, `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=24&mature=false`) as { results?: unknown[] };
    return (json.results ?? []).map((r) => {
        const o = r as Record<string, unknown>;
        const license = [str(o.license).toUpperCase(), str(o.license_version)].filter(Boolean).join(' ');
        return { url: str(o.url), thumb: str(o.thumbnail) || str(o.url), title: str(o.title), creator: str(o.creator), license: license ? (license.startsWith('CC') || license.startsWith('PDM') ? license : `CC ${license}`) : 'CC', source: 'openverse' as const, link: str(o.foreign_landing_url) };
    }).filter((i) => i.url);
}

export async function searchUnsplash(q: string, accessKey: string, fetchFn: typeof fetch = fetch): Promise<StockImage[]> {
    const query = q.trim();
    if (!query) return [];
    if (!accessKey) throw new Error('Unsplash access key required');
    const json = await getJson(fetchFn, `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=24`, { headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' } }) as { results?: unknown[] };
    return (json.results ?? []).map((r) => {
        const o = r as { urls?: Record<string, string>; alt_description?: string; description?: string; user?: { name?: string; links?: { html?: string } }; links?: { html?: string } };
        return { url: str(o.urls?.regular) || str(o.urls?.full), thumb: str(o.urls?.small) || str(o.urls?.thumb), title: str(o.alt_description) || str(o.description), creator: str(o.user?.name), license: 'Unsplash License', source: 'unsplash' as const, link: str(o.links?.html) };
    }).filter((i) => i.url);
}

export async function searchGiphy(q: string, apiKey: string, fetchFn: typeof fetch = fetch): Promise<StockImage[]> {
    const query = q.trim();
    if (!query) return [];
    if (!apiKey) throw new Error('Giphy API key required');
    const json = await getJson(fetchFn, `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&limit=24&rating=g`) as { data?: unknown[] };
    return (json.data ?? []).map((r) => {
        const o = r as { title?: string; url?: string; user?: { display_name?: string; username?: string }; images?: Record<string, { url?: string }> };
        return { url: str(o.images?.downsized?.url) || str(o.images?.original?.url), thumb: str(o.images?.fixed_width?.url) || str(o.images?.downsized?.url), title: str(o.title), creator: str(o.user?.display_name) || str(o.user?.username), license: 'via GIPHY', source: 'giphy' as const, link: str(o.url) };
    }).filter((i) => i.url);
}

/** Deterministic placeholder photo — same seed = same picture. */
export function picsumUrl(w: number, h: number, seed?: string | number): string {
    const W = Math.max(16, Math.round(w) || 800), H = Math.max(16, Math.round(h) || 450);
    return seed !== undefined && seed !== '' ? `https://picsum.photos/seed/${encodeURIComponent(String(seed))}/${W}/${H}` : `https://picsum.photos/${W}/${H}`;
}

const SOURCE_LABEL: Record<StockSource, string> = { openverse: 'Openverse', unsplash: 'Unsplash', giphy: 'GIPHY' };

/** Caption-ready attribution string. */
export function attributionFor(img: Pick<StockImage, 'creator' | 'license' | 'source'>): string {
    const who = img.creator ? `Photo: ${img.creator}` : '';
    return [who, img.license, `via ${SOURCE_LABEL[img.source]}`].filter(Boolean).join(' · ');
}

export function loadMediaKeys(): MediaKeys {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MEDIA_KEYS_STORAGE) : null;
        const p = raw ? JSON.parse(raw) as MediaKeys : {};
        return { unsplash: str(p.unsplash) || undefined, giphy: str(p.giphy) || undefined };
    } catch { return {}; }
}

export function saveMediaKeys(keys: MediaKeys): void {
    try {
        const clean: MediaKeys = {};
        if (keys.unsplash?.trim()) clean.unsplash = keys.unsplash.trim();
        if (keys.giphy?.trim()) clean.giphy = keys.giphy.trim();
        localStorage.setItem(MEDIA_KEYS_STORAGE, JSON.stringify(clean));
    } catch { /* storage unavailable */ }
}
