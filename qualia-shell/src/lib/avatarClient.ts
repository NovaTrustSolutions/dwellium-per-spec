/**
 * avatarClient — thin typed client for the backend's provider-agnostic
 * avatar harness routes (plan 040). Every call takes the caller's
 * `authFetch` (from `useUser()`) so requests carry the session's auth
 * header exactly like every other API client in this repo.
 *
 * The harness never talks to Anam directly from the browser except via the
 * SDK's own WebRTC session (using the sessionToken these routes return) —
 * the Anam REST API key never leaves the backend.
 */

import { API_BASE } from '../config';

const AVATAR_API = `${API_BASE}/api/avatar`;

export type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface AvatarHealth {
    configured: boolean;
}

export interface AvatarProfile {
    userId: string;
    agentId: string;
    avatarId: string | null;
    voiceId: string | null;
    systemPrompt: string | null;
    displayName: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AvatarApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

async function parseJson<T>(res: Response): Promise<AvatarApiResult<T>> {
    try {
        return (await res.json()) as AvatarApiResult<T>;
    } catch {
        return { success: false, error: `Unexpected response (HTTP ${res.status})` };
    }
}

/** GET /api/avatar/health — whether the Anam engine is configured server-side. */
export async function getAvatarHealth(authFetch: AuthFetch): Promise<AvatarApiResult<AvatarHealth>> {
    const res = await authFetch(`${AVATAR_API}/health`);
    return parseJson<AvatarHealth>(res);
}

/** POST /api/avatar/session-token — mint a session token for the given agent. */
export async function createAvatarSessionToken(
    authFetch: AuthFetch,
    agentId: string,
): Promise<AvatarApiResult<{ sessionToken: string }>> {
    const res = await authFetch(`${AVATAR_API}/session-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
    });
    return parseJson<{ sessionToken: string }>(res);
}

export interface CreateAvatarFromImageInput {
    imageBase64: string;
    mimeType?: string;
    displayName?: string;
    /** REQUIRED — the backend rejects the request unless this is exactly `true`. */
    consent: true;
}

/** POST /api/avatar/create-from-image — one-shot custom avatar from a photo. */
export async function createAvatarFromImage(
    authFetch: AuthFetch,
    input: CreateAvatarFromImageInput,
): Promise<AvatarApiResult<{ id: string; [key: string]: unknown }>> {
    const res = await authFetch(`${AVATAR_API}/create-from-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    return parseJson<{ id: string; [key: string]: unknown }>(res);
}

export interface AvatarOptions {
    avatars: unknown;
    voices: unknown;
}

/** GET /api/avatar/options — stock avatar + voice catalogs for the picker. */
export async function getAvatarOptions(authFetch: AuthFetch): Promise<AvatarApiResult<AvatarOptions>> {
    const res = await authFetch(`${AVATAR_API}/options`);
    return parseJson<AvatarOptions>(res);
}

/** GET /api/avatar/profiles/:agentId — the caller's saved profile for an agent. */
export async function getAvatarProfile(
    authFetch: AuthFetch,
    agentId: string,
): Promise<AvatarApiResult<AvatarProfile | null>> {
    const res = await authFetch(`${AVATAR_API}/profiles/${encodeURIComponent(agentId)}`);
    return parseJson<AvatarProfile | null>(res);
}

export interface SaveAvatarProfileInput {
    avatarId?: string | null;
    voiceId?: string | null;
    systemPrompt?: string | null;
    displayName?: string | null;
}

/** PUT /api/avatar/profiles/:agentId — save the caller's profile for an agent. */
export async function saveAvatarProfile(
    authFetch: AuthFetch,
    agentId: string,
    input: SaveAvatarProfileInput,
): Promise<AvatarApiResult<AvatarProfile>> {
    const res = await authFetch(`${AVATAR_API}/profiles/${encodeURIComponent(agentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    return parseJson<AvatarProfile>(res);
}
