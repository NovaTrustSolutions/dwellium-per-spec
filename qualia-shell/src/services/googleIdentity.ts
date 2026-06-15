/** Shared Google Identity Services script loader for login + Drive OAuth. */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisPromise: Promise<void> | null = null;

export function getGoogleClientId(): string {
    return ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '').trim();
}

export function loadGoogleIdentityServices(): Promise<void> {
    if (typeof document === 'undefined') return Promise.reject(new Error('Google sign-in requires a browser'));
    if ((window as any).google?.accounts) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = GIS_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
    });
    return gisPromise;
}
