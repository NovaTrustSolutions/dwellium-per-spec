/**
 * PropertyPhoto — the exterior picture on a Strata property card, row and
 * detail hero. Order of truth: a photo the office uploaded (metadata.photos,
 * first one) wins; otherwise the backend's Street View proxy
 * (`GET /properties/:id/street-photo`, services/streetView.ts on the backend —
 * Google imagery, key server-side, cached per property).
 *
 * Honest states, never a stock picture: `none` (Google has no imagery for the
 * address) renders a quiet tile that keeps the grid aligned; `unconfigured`
 * (backend has no GOOGLE_MAPS_API_KEY) renders nothing at all — the cards look
 * exactly as before — and is remembered for the session so the other cards
 * don't ask again. Object URLs are revoked on unmount.
 */
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { strataGetBlob } from '../strataApi';

export type PhotoVariant = 'card' | 'row' | 'hero';
type Loaded =
    | { state: 'loading' }
    | { state: 'image'; url: string; source: 'uploaded' | 'street'; copyright: string | null; date: string | null }
    | { state: 'none' }
    | { state: 'unconfigured' }
    | { state: 'error' };

interface PhotoSubject { id: string; name: string; address?: string | null; metadata?: Record<string, any> | null }

// Session memory: one 503 means every property is unconfigured until reload.
let unconfiguredForSession = false;
// One in-flight/settled request per property, shared by card + row + hero.
const streetCache = new Map<string, Promise<{ status: number; blob?: Blob; headers?: Headers; body?: string }>>();

/** Test hook — forget session state between tests. */
export function __resetPropertyPhotoCache(): void { unconfiguredForSession = false; streetCache.clear(); }

/** The backend URL-encodes these headers (they carry "©"); tolerate a plain value too. */
function headerText(headers: Headers | undefined, name: string): string | null {
    const raw = headers?.get(name);
    if (!raw) return null;
    try { return decodeURIComponent(raw); } catch { return raw; }
}

function uploadedPhoto(p: PhotoSubject): { dataUrl: string; name?: string } | null {
    const photos = p.metadata?.photos;
    if (!Array.isArray(photos)) return null;
    const first = photos.find((x: any) => x && typeof x.dataUrl === 'string' && x.dataUrl.startsWith('data:image/'));
    return first ? { dataUrl: first.dataUrl, name: first.name } : null;
}

function fetchStreet(id: string) {
    let p = streetCache.get(id);
    if (!p) {
        p = strataGetBlob(`/properties/${encodeURIComponent(id)}/street-photo`).catch(() => ({ status: 0 }));
        streetCache.set(id, p);
    }
    return p;
}

export function PropertyPhoto({ property, variant }: { property: PhotoSubject; variant: PhotoVariant }) {
    const uploaded = uploadedPhoto(property);
    const [loaded, setLoaded] = useState<Loaded>(() => (uploaded
        ? { state: 'image', url: uploaded.dataUrl, source: 'uploaded', copyright: null, date: null }
        : unconfiguredForSession ? { state: 'unconfigured' } : { state: 'loading' }));

    useEffect(() => {
        if (uploaded || unconfiguredForSession) return;
        let objectUrl: string | null = null;
        let alive = true;
        fetchStreet(property.id).then((r) => {
            if (!alive) return;
            if (r.status === 200 && r.blob) {
                objectUrl = URL.createObjectURL(r.blob);
                setLoaded({ state: 'image', url: objectUrl, source: 'street', copyright: headerText(r.headers, 'X-Photo-Copyright'), date: headerText(r.headers, 'X-Photo-Date') });
            } else if (r.status === 503 || (r.status === 404 && !/imagery/i.test(r.body ?? ''))) {
                // 503 = backend has no key. A 404 WITHOUT the backend's "no imagery" wording is
                // the route itself missing (backend not yet deployed) — also "not configured",
                // never a "No street photo" claim about the address.
                unconfiguredForSession = true;
                setLoaded({ state: 'unconfigured' });
            } else if (r.status === 404) {
                setLoaded({ state: 'none' });
            } else {
                setLoaded({ state: 'error' });
            }
        });
        return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [property.id, !!uploaded]);

    if (loaded.state === 'unconfigured') return null;
    const cls = `s-prop-photo s-prop-photo--${variant}`;
    if (loaded.state === 'loading') {
        return <div className={`${cls} s-prop-photo--loading`} aria-hidden="true" data-state="loading" />;
    }
    if (loaded.state === 'none' || loaded.state === 'error') {
        if (variant === 'row') return null;
        return (
            <div className={`${cls} s-prop-photo--empty`} data-state={loaded.state} role="img" aria-label={loaded.state === 'none' ? `${property.name}: no street photo available` : `${property.name}: street photo could not be loaded`}>
                <Building2 size={variant === 'hero' ? 26 : 20} aria-hidden />
                <span>{loaded.state === 'none' ? 'No street photo' : 'Photo unavailable'}</span>
            </div>
        );
    }
    const alt = loaded.source === 'uploaded' ? `${property.name} — photo` : `${property.name} — street view`;
    return (
        <figure className={cls} data-state="image" data-source={loaded.source}>
            <img src={loaded.url} alt={alt} loading="lazy" decoding="async" />
            {variant === 'hero' && loaded.source === 'street' && (
                <figcaption className="s-prop-photo__caption">
                    Street View{loaded.date ? ` · ${loaded.date}` : ''}{loaded.copyright ? ` · ${loaded.copyright}` : ' · © Google'}
                </figcaption>
            )}
        </figure>
    );
}

export default PropertyPhoto;
