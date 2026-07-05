/**
 * imageDownscale — client-side photo downscale for avatar profiles
 * (plan 042 — keyless local photo-avatar provider).
 *
 * `AvatarSetupPanel` uses this to shrink an uploaded photo to a JPEG data URL
 * BEFORE it's written to `avatarProfilesStore` — the store is One-Save-synced
 * localStorage, so an un-downscaled multi-MB photo would bloat every sync
 * payload. Longest edge capped at 768px, JPEG quality ~0.85 (per plan).
 *
 * Pure DOM-canvas implementation — no new npm dependency. Falls back to the
 * original data URL (no throw) if canvas 2D context creation fails, since a
 * slightly-oversized photo is better than a hard failure on setup.
 */

export const DOWNSCALE_MAX_EDGE_PX = 768;
export const DOWNSCALE_JPEG_QUALITY = 0.85;

/** Load a data URL (or any image src) into an HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image for downscale'));
        img.src = src;
    });
}

/**
 * Downscale an image data URL so its longest edge is at most
 * `DOWNSCALE_MAX_EDGE_PX`, re-encoded as JPEG at `DOWNSCALE_JPEG_QUALITY`.
 * Images already smaller than the cap are still re-encoded as JPEG (keeps
 * the stored payload format predictable) but are not upscaled.
 */
export async function downscaleImageDataUrl(
    dataUrl: string,
    maxEdge: number = DOWNSCALE_MAX_EDGE_PX,
    quality: number = DOWNSCALE_JPEG_QUALITY,
): Promise<string> {
    const img = await loadImage(dataUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return dataUrl;

    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl; // best-effort — never block setup on a canvas failure

    ctx.drawImage(img, 0, 0, outW, outH);
    return canvas.toDataURL('image/jpeg', quality);
}

/** Read a File as a data URL (used ahead of `downscaleImageDataUrl`). */
export function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
