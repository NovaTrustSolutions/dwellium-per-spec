/**
 * avatarClient — backendless, browser-direct client for the Anam Avatar
 * Engine (plan 041; rework of plan 040's backend-mediated avatar routes).
 *
 * Every function reads the user's OWN Anam API key from the per-user
 * integrations vault (`IntegrationsBundle['anam']`, same accessor pattern as
 * `llmClient.ts`'s per-provider keys) and calls `https://api.anam.ai`
 * directly from the browser — the SAME trust model this app already uses for
 * Anthropic/OpenAI/Gemini: the user's own key, their own browser, TLS to the
 * provider. The key NEVER appears in errors, logs, or thrown messages.
 *
 * CORS verified empirically 2026-07-04: `OPTIONS /v1/auth/session-token` and
 * `OPTIONS /v1/avatars` both return `access-control-allow-origin: *` with
 * `Authorization` in the allowed headers — browser-direct is supported.
 *
 * Pinned Anam REST surface (SDK v4.10.0 `dist/module/lib/constants.d.ts`:
 * `DEFAULT_API_BASE_URL = "https://api.anam.ai"`, `DEFAULT_API_VERSION =
 * "/v1"`):
 *   - POST /v1/auth/session-token   { personaConfig } w/ Authorization: Bearer
 *   - POST /v1/avatars              JSON { imageBase64, mimeType, displayName? }
 *   - GET  /v1/avatars
 *   - GET  /v1/voices
 *
 * Timeouts: every request races a 10s AbortController against the fetch so a
 * hung network call can't leave the harness stuck in "connecting" forever.
 */

import type { IntegrationsBundle } from '../types/integrations';

const ANAM_API_BASE = 'https://api.anam.ai';
const ANAM_API_VERSION = '/v1';
const REQUEST_TIMEOUT_MS = 10_000;

export interface AvatarApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

/** Read the active user's Anam key from their vault bundle. Never logged. */
function getAnamKey(bundle: IntegrationsBundle | null | undefined): string | null {
    const key = bundle?.anam?.apiKey;
    return typeof key === 'string' && key.length > 0 ? key : null;
}

/**
 * Whether the Anam engine is configured for this user — vault key present,
 * NO network call. Mirrors `hasActiveLlm` in llmClient.ts.
 */
export function getConfigured(bundle: IntegrationsBundle | null | undefined): boolean {
    return getAnamKey(bundle) !== null;
}

async function anamFetch(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(`${ANAM_API_BASE}${ANAM_API_VERSION}${path}`, {
            ...init,
            headers: {
                ...(init.headers || {}),
                Authorization: `Bearer ${apiKey}`,
            },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

/** Map a failed/aborted request to a friendly message. Never includes the key. */
function friendlyError(err: unknown, fallback: string): string {
    if (err instanceof DOMException && err.name === 'AbortError') {
        return 'Request to the Anam avatar engine timed out. Check your connection and try again.';
    }
    if (err instanceof Error) return err.message || fallback;
    return fallback;
}

async function parseJson<T>(res: Response): Promise<AvatarApiResult<T>> {
    let body: unknown;
    try {
        body = await res.json();
    } catch {
        body = undefined;
    }
    if (!res.ok) {
        // Never surface response bodies verbatim if they happen to echo the
        // Authorization header back (they shouldn't, but stay defensive) —
        // only pass through a short, provider-shaped message.
        const message =
            (body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string')
                ? (body as { message: string }).message
                : `Anam API error (HTTP ${res.status})`;
        return { success: false, error: message };
    }
    return { success: true, data: body as T };
}

export interface PersonaConfigInput {
    personaId?: string;
    name?: string;
    avatarId: string;
    voiceId: string;
    llmId?: string;
    systemPrompt?: string;
    maxSessionLengthSeconds?: number;
    languageCode?: string;
}

/**
 * POST /v1/auth/session-token — mint a session token for the given persona
 * config. Requires a vault key; returns a friendly "not configured" error
 * otherwise (the harness maps this to its unconfigured/CTA state).
 */
export async function createSessionToken(
    bundle: IntegrationsBundle | null | undefined,
    personaConfig: PersonaConfigInput,
): Promise<AvatarApiResult<{ sessionToken: string }>> {
    const apiKey = getAnamKey(bundle);
    if (!apiKey) {
        return { success: false, error: 'Anam Avatar Engine is not configured. Add your API key in Settings.' };
    }
    try {
        const res = await anamFetch('/auth/session-token', apiKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personaConfig }),
        });
        return parseJson<{ sessionToken: string }>(res);
    } catch (err) {
        return { success: false, error: friendlyError(err, 'Failed to get a session token from Anam.') };
    }
}

export interface CreateAvatarFromImageInput {
    imageBase64: string;
    mimeType?: string;
    displayName?: string;
    /** REQUIRED — createAvatarFromImage refuses to call Anam unless this is exactly `true`. */
    consent: true;
}

/**
 * POST /v1/avatars — one-shot custom avatar from a photo. The likeness-consent
 * gate is enforced here (not just in the UI) so it can never be bypassed by
 * calling this function directly.
 */
export async function createAvatarFromImage(
    bundle: IntegrationsBundle | null | undefined,
    input: CreateAvatarFromImageInput,
): Promise<AvatarApiResult<{ id: string; [key: string]: unknown }>> {
    const apiKey = getAnamKey(bundle);
    if (!apiKey) {
        return { success: false, error: 'Anam Avatar Engine is not configured. Add your API key in Settings.' };
    }
    if (input.consent !== true) {
        return { success: false, error: 'Likeness consent is required to create an avatar from a photo.' };
    }
    try {
        const res = await anamFetch('/avatars', apiKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageBase64: input.imageBase64,
                mimeType: input.mimeType || 'image/jpeg',
                displayName: input.displayName,
            }),
        });
        return parseJson<{ id: string; [key: string]: unknown }>(res);
    } catch (err) {
        return { success: false, error: friendlyError(err, 'Failed to create the avatar.') };
    }
}

export interface AvatarOptions {
    avatars: unknown;
    voices: unknown;
}

/** GET /v1/avatars + GET /v1/voices — stock avatar + voice catalogs for the picker. */
export async function listOptions(
    bundle: IntegrationsBundle | null | undefined,
): Promise<AvatarApiResult<AvatarOptions>> {
    const apiKey = getAnamKey(bundle);
    if (!apiKey) {
        return { success: false, error: 'Anam Avatar Engine is not configured. Add your API key in Settings.' };
    }
    try {
        const [avatarsRes, voicesRes] = await Promise.all([
            anamFetch('/avatars', apiKey),
            anamFetch('/voices', apiKey),
        ]);
        const avatarsResult = await parseJson<unknown>(avatarsRes);
        const voicesResult = await parseJson<unknown>(voicesRes);
        if (!avatarsResult.success && !voicesResult.success) {
            return { success: false, error: avatarsResult.error || voicesResult.error || 'Failed to load avatar options.' };
        }
        return {
            success: true,
            data: {
                avatars: avatarsResult.success ? avatarsResult.data : [],
                voices: voicesResult.success ? voicesResult.data : [],
            },
        };
    } catch (err) {
        return { success: false, error: friendlyError(err, 'Failed to load avatar options.') };
    }
}
