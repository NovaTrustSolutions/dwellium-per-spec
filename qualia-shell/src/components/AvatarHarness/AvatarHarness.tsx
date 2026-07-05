/**
 * AvatarHarness — the ONE reusable interactive-avatar component
 * (plan 040, reworked backendless in plan 041).
 *
 * Any agent gets a live, photo-derived avatar by mounting:
 *   <AvatarHarness agentId="ara" />
 *   <AvatarHarness agentId="stella" systemPromptDefault="..." />
 *
 * Consolidates the Anam session/stream logic previously duplicated inside
 * ARAConsole.tsx into a single provider-agnostic harness (AnamAdapter is the
 * only current AvatarProviderAdapter implementation — see AnamAdapter.ts).
 *
 * FULLY BACKENDLESS (plan 041): the harness reads the Anam key from the
 * user's own per-user integrations vault (`useIntegrations()`, the same vault
 * that holds Anthropic/OpenAI/etc. keys) and calls `avatarClient.ts`, which
 * talks to `api.anam.ai` directly from the browser. There is no backend
 * "configured" check anymore — "unconfigured" now means "no Anam key in your
 * vault", with a CTA that opens the Control Panel's API-Keys section (the
 * same `dwellium:open-widget` bus every other "open Settings" affordance in
 * this app uses).
 *
 * States: unconfigured (no vault key -> CTA opens Settings) -> idle ->
 * connecting -> live (video + mic/mute/interrupt/stop) -> error. Session
 * lifecycle ALWAYS tears down on unmount (stop streams, close client) — this
 * repo has a history of unmount-leak findings, so the cleanup function is the
 * single place disconnect() is called from.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, Square, Loader2, TriangleAlert, Settings } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { getConfigured, createSessionToken, type PersonaConfigInput } from '../../lib/avatarClient';
import { getAvatarProfile } from '../../lib/avatarProfilesStore';
import { AnamAdapter, type AvatarConnectionState } from './AnamAdapter';
import AvatarSetupPanel from './AvatarSetupPanel';
import './AvatarHarness.css';

export interface AvatarHarnessProps {
    /** Stable id for the agent mounting this harness, e.g. "ara" or "stella". */
    agentId: string;
    /** Default system-prompt override shown in the setup panel for first-time save. */
    systemPromptDefault?: string;
    /** 'compact' renders a smaller video area (e.g. docked panels); 'full' is the default. */
    size?: 'compact' | 'full';
}

/**
 * Imperative handle so a mounting agent's own chat logic can pipe its reply
 * text through the live avatar (e.g. ARAConsole's sendPrompt calling
 * `avatarRef.current?.talk(reply)` instead of/alongside browser TTS) without
 * the harness needing to know anything about that agent's chat internals.
 */
export interface AvatarHarnessHandle {
    /** Speak `content` through the live avatar. No-op if not currently connected. */
    talk(content: string): Promise<void>;
    /** Whether the avatar is currently connected and streaming. */
    isLive(): boolean;
}

type HarnessState = 'unconfigured' | 'idle' | 'connecting' | 'live' | 'error';

/** Open the Control Panel's API-Keys section — same bus every other "open Settings" CTA uses. */
function openApiKeysSettings(): void {
    window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: 'control-panel', label: 'Settings' } }));
}

function AvatarHarness({ agentId, systemPromptDefault, size = 'full' }: AvatarHarnessProps, ref: React.Ref<AvatarHarnessHandle>) {
    const { integrations } = useIntegrations();
    const [state, setState] = useState<HarnessState>(() => (getConfigured(integrations) ? 'idle' : 'unconfigured'));
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [muted, setMuted] = useState(false);
    const [setupOpen, setSetupOpen] = useState(false);

    const adapterRef = useRef<AnamAdapter | null>(null);
    const videoElementId = `avatar-harness-video-${agentId}`;
    const cancelledRef = useRef(false);

    // Vault key presence drives the unconfigured/idle split — no network call
    // (getConfigured only checks the in-memory bundle). Re-derive whenever the
    // bundle changes (e.g., the user just saved a key in Settings) so the
    // harness flips out of the unconfigured state without a remount.
    useEffect(() => {
        if (state === 'connecting' || state === 'live') return; // don't yank the rug mid-session
        setState(getConfigured(integrations) ? 'idle' : 'unconfigured');
    }, [integrations, state]);

    const teardown = useCallback(async () => {
        const adapter = adapterRef.current;
        adapterRef.current = null;
        if (adapter) {
            await adapter.disconnect();
        }
    }, []);

    const connect = useCallback(async () => {
        setErrorMessage('');
        setState('connecting');

        const profile = getAvatarProfile(agentId);
        const personaConfig: PersonaConfigInput = {
            personaId: agentId,
            name: profile?.displayName || agentId,
            avatarId: profile?.avatarId || '',
            voiceId: profile?.voiceId || '',
            systemPrompt: profile?.systemPrompt || systemPromptDefault || undefined,
        };

        const tokenRes = await createSessionToken(integrations, personaConfig);
        if (cancelledRef.current) return;
        if (!tokenRes.success || !tokenRes.data?.sessionToken) {
            setState(tokenRes.error?.includes('not configured') ? 'unconfigured' : 'error');
            setErrorMessage(tokenRes.error || 'Failed to get a session token.');
            return;
        }

        const adapter = new AnamAdapter();
        adapterRef.current = adapter;
        adapter.onStateChange((next: AvatarConnectionState, detail?: string) => {
            if (cancelledRef.current) return;
            if (next === 'connected') setState('live');
            else if (next === 'error') {
                setState('error');
                setErrorMessage(detail || 'Avatar connection failed.');
            } else if (next === 'disconnected') {
                setState('idle');
            }
        });

        await adapter.connect(tokenRes.data.sessionToken, videoElementId);
    }, [integrations, agentId, systemPromptDefault, videoElementId]);

    const stop = useCallback(async () => {
        await teardown();
        setState('idle');
        setMuted(false);
    }, [teardown]);

    const toggleMute = useCallback(() => {
        setMuted((prev) => {
            const next = !prev;
            adapterRef.current?.mute(next);
            return next;
        });
    }, []);

    const interrupt = useCallback(() => {
        adapterRef.current?.interrupt();
    }, []);

    useImperativeHandle(ref, () => ({
        talk: async (content: string) => {
            if (state !== 'live') return;
            await adapterRef.current?.talk(content);
        },
        isLive: () => state === 'live',
    }), [state]);

    // Unmount teardown — ALWAYS stop streams and close the client, whatever
    // state we were in. This repo has a documented history of unmount-leak
    // findings; this cleanup is the single authoritative teardown path.
    useEffect(() => {
        return () => {
            cancelledRef.current = true;
            const adapter = adapterRef.current;
            adapterRef.current = null;
            if (adapter) {
                adapter.disconnect().catch(() => { /* best-effort on unmount */ });
            }
        };
    }, []);

    return (
        <div className={`avatar-harness avatar-harness--${size}`} data-agent-id={agentId}>
            {state === 'unconfigured' && (
                <div className="avatar-harness__cta">
                    <Video size={18} aria-hidden />
                    <span>Add your Anam Avatar Engine API key to enable a live avatar for this agent.</span>
                    <button
                        className="avatar-harness__btn avatar-harness__btn--primary"
                        onClick={openApiKeysSettings}
                    >
                        Open Settings
                    </button>
                </div>
            )}

            {state !== 'unconfigured' && (
                <>
                    <div className="avatar-harness__toolbar">
                        {state === 'idle' && (
                            <button className="avatar-harness__btn avatar-harness__btn--primary" onClick={connect}>
                                <Video size={14} aria-hidden /> Start avatar
                            </button>
                        )}
                        {state === 'connecting' && (
                            <span className="avatar-harness__status">
                                <Loader2 size={14} className="avatar-harness__spin" aria-hidden /> Connecting…
                            </span>
                        )}
                        {state === 'live' && (
                            <>
                                <button className="avatar-harness__btn" onClick={toggleMute} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>
                                    {muted ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
                                </button>
                                <button className="avatar-harness__btn" onClick={interrupt} aria-label="Interrupt avatar">
                                    Interrupt
                                </button>
                                <button className="avatar-harness__btn avatar-harness__btn--danger" onClick={stop} aria-label="Stop avatar session">
                                    <Square size={14} aria-hidden /> Stop
                                </button>
                            </>
                        )}
                        {state === 'error' && (
                            <button className="avatar-harness__btn" onClick={connect}>Retry</button>
                        )}
                        <button
                            className="avatar-harness__btn avatar-harness__btn--ghost"
                            onClick={() => setSetupOpen((v) => !v)}
                            aria-label="Avatar setup"
                        >
                            <Settings size={14} aria-hidden />
                        </button>
                    </div>

                    {state === 'error' && (
                        <div className="avatar-harness__error">
                            <TriangleAlert size={14} aria-hidden /> {errorMessage || 'Avatar connection failed.'}
                        </div>
                    )}

                    <div className="avatar-harness__video-wrap" data-visible={state === 'live' || state === 'connecting'}>
                        <video
                            id={videoElementId}
                            className="avatar-harness__video"
                            autoPlay
                            playsInline
                        />
                        {state !== 'live' && (
                            <div className="avatar-harness__video-placeholder">
                                <VideoOff size={20} aria-hidden />
                            </div>
                        )}
                    </div>

                    {setupOpen && (
                        <AvatarSetupPanel
                            agentId={agentId}
                            systemPromptDefault={systemPromptDefault}
                            onClose={() => setSetupOpen(false)}
                        />
                    )}
                </>
            )}
        </div>
    );
}

export default forwardRef(AvatarHarness);
