/**
 * providerTypes — shared adapter interface for AvatarHarness providers
 * (plan 042 extraction from AnamAdapter.ts).
 *
 * AnamAdapter (plan 040/041, video-element based, session-token connect) and
 * LocalPhotoAvatarAdapter (plan 042, canvas-based, profile+host connect) both
 * implement `AvatarProviderAdapter`. `connect()`'s first two args are
 * intentionally typed as `unknown` at the interface level — each concrete
 * adapter narrows them in its own implementation (Anam: `(sessionToken:
 * string, videoElementId: string)`; Local: `(profile: AvatarProfile | null,
 * host: HTMLCanvasElement)`). AvatarHarness.tsx (the only caller) knows which
 * concrete adapter it holds via the active `provider` and calls `connect`
 * with the matching argument shapes, so this stays type-safe at the call
 * site without forcing one adapter's signature onto the other.
 */

export type AvatarConnectionState =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'error';

export interface AvatarProviderAdapter {
    /**
     * Connect / start the provider. Anam: `(sessionToken, videoElementId)`.
     * Local: `(profile, canvasHost)`. See file header for why this is
     * intentionally loose at the shared-interface altitude.
     */
    connect(arg1: unknown, arg2: unknown): Promise<void>;
    /** Tear down the session and release all resources. Idempotent. */
    disconnect(): Promise<void>;
    /** Mute/unmute the user's microphone input. */
    mute(muted: boolean): void;
    /** Interrupt the persona mid-speech (barge-in). */
    interrupt(): void;
    /** Make the persona speak the given text (e.g. an agent's chat reply). No-op if not connected. */
    talk(content: string): Promise<void>;
    /** Subscribe to connection lifecycle changes. Returns an unsubscribe function. */
    onStateChange(cb: (state: AvatarConnectionState, detail?: string) => void): () => void;
}
