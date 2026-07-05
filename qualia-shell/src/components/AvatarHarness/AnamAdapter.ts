/**
 * AnamAdapter — the Anam implementation of AvatarProviderAdapter (plan 040).
 * Wraps `@anam-ai/js-sdk@4.10.0`'s `createClient` / `AnamClient` behind the
 * shared provider-agnostic seam (interface now lives in `providerTypes.ts`,
 * extracted at plan 042 so `LocalPhotoAvatarAdapter` can implement the same
 * seam without inheriting Anam's video-element-specific connect signature).
 *
 * SDK surface pinned from the installed .d.ts
 * (node_modules/@anam-ai/js-sdk/dist/module/{index,AnamClient}.d.ts):
 *   - `createClient(sessionToken: string, options?): AnamClient`
 *   - `client.streamToVideoElement(videoElementId: string): Promise<void>`
 *   - `client.stopStreaming(): Promise<void>`
 *   - `client.addListener<K>(event: AnamEvent, cb): void`
 *   - `client.muteInputAudio(): InputAudioState`
 *   - `client.unmuteInputAudio(): InputAudioState`
 *   - `client.interruptPersona(): void`
 *   - `client.talk(content: string): Promise<void>` — makes the persona speak
 *     arbitrary text (used to pipe an agent's chat reply through the live
 *     avatar instead of/alongside browser TTS)
 *   - `AnamEvent.CONNECTION_ESTABLISHED` / `CONNECTION_CLOSED` / `SESSION_READY`
 */

import type { AvatarProviderAdapter, AvatarConnectionState } from './providerTypes';

export type { AvatarConnectionState } from './providerTypes';

export class AnamAdapter implements AvatarProviderAdapter {
    private client: any = null;
    private listeners: Array<(state: AvatarConnectionState, detail?: string) => void> = [];
    private cancelled = false;

    private emit(state: AvatarConnectionState, detail?: string): void {
        for (const cb of this.listeners) {
            try { cb(state, detail); } catch { /* listener error must not break the adapter */ }
        }
    }

    onStateChange(cb: (state: AvatarConnectionState, detail?: string) => void): () => void {
        this.listeners.push(cb);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== cb);
        };
    }

    async connect(sessionToken: string, videoElementId: string): Promise<void> {
        this.cancelled = false;
        this.emit('connecting');

        const anamModule = await import('@anam-ai/js-sdk').catch(() => null);
        if (!anamModule) {
            this.emit('error', 'Anam SDK not installed. Run: npm install @anam-ai/js-sdk');
            return;
        }
        if (this.cancelled) return;

        const { createClient, AnamEvent } = anamModule as any;
        const client = createClient(sessionToken);
        this.client = client;

        client.addListener?.(AnamEvent?.CONNECTION_ESTABLISHED || 'CONNECTION_ESTABLISHED', () => {
            if (!this.cancelled) this.emit('connected');
        });
        client.addListener?.(AnamEvent?.CONNECTION_CLOSED || 'CONNECTION_CLOSED', () => {
            if (!this.cancelled) this.emit('disconnected');
        });

        try {
            await client.streamToVideoElement(videoElementId);
            if (!this.cancelled) this.emit('connected');
        } catch (err: any) {
            if (!this.cancelled) this.emit('error', err?.message || 'Failed to start avatar stream');
        }
    }

    async disconnect(): Promise<void> {
        this.cancelled = true;
        const client = this.client;
        this.client = null;
        if (client) {
            try { await client.stopStreaming?.(); } catch { /* best-effort teardown */ }
        }
        this.emit('idle');
    }

    mute(muted: boolean): void {
        if (!this.client) return;
        try {
            if (muted) this.client.muteInputAudio?.();
            else this.client.unmuteInputAudio?.();
        } catch { /* non-fatal */ }
    }

    interrupt(): void {
        if (!this.client) return;
        try { this.client.interruptPersona?.(); } catch { /* non-fatal */ }
    }

    async talk(content: string): Promise<void> {
        if (!this.client || !content) return;
        try { await this.client.talk?.(content); } catch { /* non-fatal — caller may fall back to TTS */ }
    }
}
