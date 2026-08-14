/**
 * AvatarHarness — the ONE reusable interactive-avatar component
 * (plan 040, reworked backendless in plan 041; plan 042 makes the keyless
 * local photo-avatar provider the DEFAULT, Anam an optional upgrade).
 *
 * Any agent gets a live, photo-derived avatar by mounting:
 *   <AvatarHarness agentId="ara" />
 *   <AvatarHarness agentId="stella" systemPromptDefault="..." />
 *
 * Consolidates the avatar session/render logic previously duplicated inside
 * ARAConsole.tsx into a single provider-agnostic harness. Two current
 * `AvatarProviderAdapter` implementations (see `providerTypes.ts`):
 *   - `LocalPhotoAvatarAdapter` (plan 042, DEFAULT) — zero API keys, canvas
 *     talking-head warped from an uploaded photo, browser speechSynthesis,
 *     brain = the user's own configured LLM via `llmClient`.
 *   - `AnamAdapter` (plan 040/041) — neural video from Anam, requires the
 *     user's own Anam vault key. Optional upgrade only — never mentioned in
 *     the UI unless a key already exists in the vault.
 *
 * FULLY BACKENDLESS: both providers talk directly from the browser (Anam to
 * api.anam.ai using the user's own vault key via `avatarClient.ts`; Local to
 * nothing at all — no network call in its render/speech path). There is no
 * "unconfigured" state for the local provider — it's live the moment a photo
 * exists. The Anam "add a key" CTA only ever shows if this agent's profile
 * has `provider === 'anam'` (which can only happen if the user explicitly
 * chose Anam in the setup panel — gated there behind an existing vault key).
 *
 * Harness states:
 *   - Local (default): `no-photo` (CTA -> setup panel) -> `live` (canvas
 *     animating immediately, idle life even before any speech) -> `error`
 *     (photo/landmark failure).
 *   - Anam (opt-in only): `unconfigured` (no vault key -> CTA opens
 *     Settings) -> `idle` -> `connecting` -> `live` (video +
 *     mic/mute/interrupt/stop) -> `error`.
 *
 * Session lifecycle ALWAYS tears down on unmount (rAF/streams/speech/mic) —
 * this repo has a history of unmount-leak findings, so the cleanup function
 * is the single place disconnect() is called from.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, Square, Loader2, TriangleAlert, Settings } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import { getConfigured, createSessionToken, type PersonaConfigInput } from '../../lib/avatarClient';
import { getAvatarProfile, type AvatarProfile, type AvatarProviderKind } from '../../lib/avatarProfilesStore';
import { hasActiveLlm, callLlm } from '../../lib/llmClient';
import { AnamAdapter } from './AnamAdapter';
import { LocalPhotoAvatarAdapter } from './LocalPhotoAvatarAdapter';
import { EvolveAvatarAdapter } from './EvolveAvatarAdapter';

/** Bundled default face for the Evolve tier — the persona from the closing
 * shot of the welcome video (`ara-intro.mp4`), extracted to a still. Lets a
 * brand-new agent show a living, named face with ZERO setup; replaced the
 * moment the user uploads their own photo in Avatar setup. */
export const EVOLVE_DEFAULT_FACE_URL = '/assets/evolve-default-face.jpg';
import type { AvatarConnectionState, AvatarProviderAdapter } from './providerTypes';
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

type HarnessState = 'no-photo' | 'unconfigured' | 'idle' | 'connecting' | 'live' | 'error';

/** Open the Control Panel's API-Keys section — same bus every other "open Settings" CTA uses. */
function openApiKeysSettings(): void {
    window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: 'control-panel', label: 'Settings' } }));
}

/** Fixed friendly line spoken (still animated) when no LLM key is configured — plan 042 no-key fallback. */
function noLlmFallbackLine(): string {
    return "I don't have a language model connected yet — add one in Settings and I'll be able to actually chat with you. I can still see and hear you in the meantime.";
}

/** Which concrete adapter a profile resolves to. A SAVED profile's choice is
 * always respected (stored provider defaults to 'local' at creation, so we
 * can't tell chosen-local from default-local — don't silently override it).
 * A brand-new agent: Anam when a key is already in the vault (real neural
 * video), otherwise Evolve with the bundled welcome-video face — a living
 * default that needs zero setup. One click back to either in Setup. */
function resolveProvider(profile: AvatarProfile | null, anamConfigured: boolean): AvatarProviderKind {
    if (profile) return profile.provider; // store normalizes unknown values to 'local'
    return anamConfigured ? 'anam' : 'evolve';
}

function AvatarHarness({ agentId, systemPromptDefault, size = 'full' }: AvatarHarnessProps, ref: React.Ref<AvatarHarnessHandle>) {
    const { integrations } = useIntegrations();
    const initialProfile = getAvatarProfile(agentId);
    const initialProvider = resolveProvider(initialProfile, getConfigured(integrations));
    const [provider, setProviderState] = useState<AvatarProviderKind>(initialProvider);
    const [state, setState] = useState<HarnessState>(() => {
        if (initialProvider === 'anam') return getConfigured(integrations) ? 'idle' : 'unconfigured';
        // NOT 'live' yet even if a photo exists — no adapter has connected
        // to the canvas at this point. The mount-time auto-connect effect
        // below does the actual connectLocal() work and flips this to
        // 'live' once the (mocked or real) adapter emits 'connected'.
        return (initialProfile?.photoDataUrl || initialProvider === 'evolve') ? 'connecting' : 'no-photo';
    });
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [muted, setMuted] = useState(false);
    const [setupOpen, setSetupOpen] = useState(false);
    const [listening, setListening] = useState(false);
    const [chatInput, setChatInput] = useState('');

    const adapterRef = useRef<AvatarProviderAdapter | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const videoElementId = `avatar-harness-video-${agentId}`;
    const cancelledRef = useRef(false);
    const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

    // Vault key presence drives the unconfigured/idle split for Anam ONLY —
    // no network call (getConfigured only checks the in-memory bundle).
    // Local mode never depends on the vault, so it's excluded from this
    // effect entirely (re-deriving 'live' vs 'no-photo' from vault changes
    // would be a no-op anyway, but skipping it also avoids yanking a live
    // local session out from under itself). Re-derive whenever the
    // bundle changes (e.g., the user just saved a key in Settings) so the
    // harness flips out of the unconfigured state without a remount.
    useEffect(() => {
        if (provider !== 'anam') return;
        if (state === 'connecting' || state === 'live') return; // don't yank the rug mid-session
        setState(getConfigured(integrations) ? 'idle' : 'unconfigured');
    }, [integrations, state, provider]);

    const teardown = useCallback(async () => {
        const adapter = adapterRef.current;
        adapterRef.current = null;
        if (adapter) {
            await adapter.disconnect();
        }
    }, []);

    const connectAnam = useCallback(async () => {
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

    const connectLocal = useCallback(async () => {
        const canvas = canvasRef.current;
        const savedProfile = getAvatarProfile(agentId);
        // Evolve ships a face: no uploaded photo → the welcome-video persona.
        const photoUrl = savedProfile?.photoDataUrl
            || (provider === 'evolve' ? EVOLVE_DEFAULT_FACE_URL : null);
        if (!canvas || !photoUrl) {
            setState('no-photo');
            return;
        }
        const profile: AvatarProfile = savedProfile
            ? { ...savedProfile, photoDataUrl: photoUrl }
            : {
                avatarId: null, voiceId: null, systemPrompt: null, displayName: null,
                provider: 'evolve', photoDataUrl: photoUrl, browserVoiceURI: null,
                updatedAt: Date.now(),
            };

        setErrorMessage('');
        setState('connecting');

        // 'evolve' shares the whole photo-canvas path; its adapter adds real
        // neural TTS + analyser lipsync + viseme shaping on top.
        const adapter = provider === 'evolve' ? new EvolveAvatarAdapter() : new LocalPhotoAvatarAdapter();
        if (adapter instanceof EvolveAvatarAdapter) {
            adapter.openaiApiKey = integrations.llm?.openai?.apiKey || null;
        }
        adapter.selectedVoiceURI = profile.browserVoiceURI || null;
        adapterRef.current = adapter;
        adapter.onStateChange((next: AvatarConnectionState, detail?: string) => {
            if (cancelledRef.current) return;
            if (next === 'connected') setState('live');
            else if (next === 'error') {
                setState('error');
                setErrorMessage(detail || 'Avatar connection failed.');
            } else if (next === 'disconnected') {
                setState('no-photo');
            }
        });

        await adapter.connect(profile, canvas);
    }, [agentId, provider, integrations]);

    const connect = useCallback(async () => {
        if (provider === 'anam') await connectAnam();
        else await connectLocal();
    }, [provider, connectAnam, connectLocal]);

    const stop = useCallback(async () => {
        await teardown();
        setState(provider === 'anam' ? 'idle' : 'no-photo');
        setMuted(false);
    }, [teardown, provider]);

    // Local mode auto-connects the moment a photo exists — no manual "Start"
    // step (plan 042: "canvas animating immediately"). Re-runs whenever the
    // agent's provider/photo changes (e.g., just saved in the setup panel).
    // Gated on `adapterRef.current` (an actual attached adapter), NOT on
    // React `state` — `state` starts as 'connecting' on the very first
    // render when a photo already exists, which would make a state-based
    // guard skip the real connectLocal() call that's supposed to produce
    // the adapter in the first place.
    useEffect(() => {
        if (provider === 'anam') return;
        const profile = getAvatarProfile(agentId);
        if (!profile?.photoDataUrl && provider !== 'evolve') {
            setState('no-photo');
            return;
        }
        if (adapterRef.current) return; // already connected/connecting
        void connectLocal();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider, agentId, setupOpen]);

    // Mic transcript -> callLlm(profile.systemPrompt) -> adapter.talk(reply).
    // If no LLM key is configured, speak the fixed fallback line — the
    // avatar keeps animating regardless (plan 042: "AVATAR STILL ANIMATES").
    const sendToLlmAndSpeak = useCallback(async (userText: string) => {
        const profile = getAvatarProfile(agentId);
        historyRef.current.push({ role: 'user', content: userText });
        historyRef.current = historyRef.current.slice(-10);

        if (!hasActiveLlm(integrations.llm)) {
            const fallback = noLlmFallbackLine();
            await adapterRef.current?.talk(fallback);
            return;
        }

        try {
            const rollingHistory = historyRef.current
                .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
                .join('\n');
            const res = await callLlm(
                {
                    prompt: `${rollingHistory}\nAssistant:`,
                    systemPrompt: profile?.systemPrompt || systemPromptDefault || undefined,
                },
                integrations.llm,
            );
            const reply = res?.text?.trim();
            if (reply) {
                historyRef.current.push({ role: 'assistant', content: reply });
                historyRef.current = historyRef.current.slice(-10);
                await adapterRef.current?.talk(reply);
            }
        } catch {
            await adapterRef.current?.talk("Sorry, I had trouble reaching my language model just now.");
        }
    }, [agentId, integrations.llm, systemPromptDefault]);

    const sendChatInput = useCallback(async () => {
        const text = chatInput.trim();
        if (!text) return;
        setChatInput('');
        await sendToLlmAndSpeak(text);
    }, [chatInput, sendToLlmAndSpeak]);

    const toggleListening = useCallback(() => {
        const adapter = adapterRef.current;
        if (!(adapter instanceof LocalPhotoAvatarAdapter)) return;
        if (listening) {
            adapter.stopListening();
            setListening(false);
            return;
        }
        const started = adapter.startListening((transcript) => {
            setListening(false);
            void sendToLlmAndSpeak(transcript);
        });
        setListening(started);
    }, [listening, sendToLlmAndSpeak]);

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
        // Reset on every mount: refs SURVIVE StrictMode's dev double-mount, so
        // the cleanup's cancelled=true from the throwaway first mount would
        // otherwise mute every state event of the real second mount — the
        // adapter connects and animates but the UI stays on "Connecting…".
        cancelledRef.current = false;
        return () => {
            cancelledRef.current = true;
            const adapter = adapterRef.current;
            adapterRef.current = null;
            if (adapter) {
                adapter.disconnect().catch(() => { /* best-effort on unmount */ });
            }
        };
    }, []);

    const onSetupClose = useCallback(() => {
        setSetupOpen(false);
        // Setup may have just switched provider or saved a new photo — re-sync
        // local state from the freshly-saved profile without a remount.
        const profile = getAvatarProfile(agentId);
        setProviderState(resolveProvider(profile, getConfigured(integrations)));
    }, [agentId, integrations]);

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

            {state === 'no-photo' && (
                <div className="avatar-harness__cta">
                    <Video size={18} aria-hidden />
                    <span>Upload a photo to bring this agent's avatar to life — no API key needed.</span>
                    <button
                        className="avatar-harness__btn avatar-harness__btn--primary"
                        onClick={() => setSetupOpen(true)}
                    >
                        Add a photo
                    </button>
                </div>
            )}

            {state !== 'unconfigured' && state !== 'no-photo' && (
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
                                {provider !== 'anam' && (
                                    <button
                                        className="avatar-harness__btn"
                                        onClick={toggleListening}
                                        aria-label={listening ? 'Stop listening' : 'Start listening'}
                                    >
                                        {listening ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
                                    </button>
                                )}
                                {provider === 'anam' && (
                                    <button className="avatar-harness__btn" onClick={toggleMute} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>
                                        {muted ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
                                    </button>
                                )}
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

                    {provider === 'anam' ? (
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
                    ) : (
                        <div className="avatar-harness__video-wrap" data-visible={state === 'live' || state === 'connecting'}>
                            <canvas
                                ref={canvasRef}
                                className="avatar-harness__video"
                                aria-label={`${agentId} animated avatar`}
                            />
                            {state !== 'live' && (
                                <div className="avatar-harness__video-placeholder">
                                    <VideoOff size={20} aria-hidden />
                                </div>
                            )}
                        </div>
                    )}

                    {provider !== 'anam' && state === 'live' && (
                        <div className="avatar-harness__chat-row">
                            <input
                                type="text"
                                className="avatar-harness__chat-input"
                                placeholder="Type a message…"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void sendChatInput(); }}
                                aria-label="Message the avatar"
                            />
                            <button className="avatar-harness__btn avatar-harness__btn--primary" onClick={() => void sendChatInput()}>
                                Send
                            </button>
                        </div>
                    )}
                </>
            )}

            {setupOpen && (
                <AvatarSetupPanel
                    agentId={agentId}
                    systemPromptDefault={systemPromptDefault}
                    onClose={onSetupClose}
                />
            )}
        </div>
    );
}

export default forwardRef(AvatarHarness);
