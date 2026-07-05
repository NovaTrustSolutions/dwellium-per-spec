/**
 * AvatarSetupPanel — per-agent avatar setup (plan 040/041 Anam flow;
 * plan 042 adds the keyless local photo-avatar path as the DEFAULT).
 *
 * Provider segment ('Local (built-in)' | 'Anam (your key)') renders ONLY
 * when an Anam vault key exists — with no key, this panel never mentions
 * Anam anywhere, matching the plan's "no Anam mention in the keyless flow"
 * requirement. The consent checkbox is required for BOTH providers (likeness
 * consent applies to the local canvas-warp path exactly as much as to
 * creating a remote Anam avatar).
 *
 * Local path: upload a photo -> consent -> downscale client-side (longest
 * edge 768px, JPEG ~0.85 — `imageDownscale.ts`) -> store `photoDataUrl` on
 * the profile -> pick a browser voice (`speechSynthesis.getVoices()`,
 * async-safe: `voiceschanged` may fire after the initial empty list) ->
 * optional system-prompt override -> Save. No network call at all.
 *
 * Anam path: unchanged from plan 041 — upload a photo -> consent -> create a
 * custom Anam avatar from it (browser-direct to api.anam.ai) -> pick an Anam
 * voice -> Save.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { useIntegrations } from '../../hooks/useIntegrations';
import {
    createAvatarFromImage,
    listOptions,
    getConfigured as getAnamConfigured,
} from '../../lib/avatarClient';
import { useAvatarProfile, type AvatarProviderKind } from '../../lib/avatarProfilesStore';
import { downscaleImageDataUrl, fileToDataUrl } from '../../lib/imageDownscale';
import './AvatarSetupPanel.css';

export interface AvatarSetupPanelProps {
    agentId: string;
    systemPromptDefault?: string;
    onClose: () => void;
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Strip the "data:<mime>;base64," prefix — Anam wants raw base64.
            const commaIdx = result.indexOf(',');
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/** Async-safe browser voice list — `getVoices()` can return [] before `voiceschanged` fires. */
function useBrowserVoices(): SpeechSynthesisVoice[] {
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return [];
        return window.speechSynthesis.getVoices();
    });

    useEffect(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        const update = () => setVoices(window.speechSynthesis.getVoices());
        update();
        window.speechSynthesis.addEventListener?.('voiceschanged', update);
        return () => {
            window.speechSynthesis.removeEventListener?.('voiceschanged', update);
        };
    }, []);

    return voices;
}

export default function AvatarSetupPanel({ agentId, systemPromptDefault, onClose }: AvatarSetupPanelProps) {
    const { integrations } = useIntegrations();
    const { profile, save } = useAvatarProfile(agentId);
    const anamConfigured = getAnamConfigured(integrations);

    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string>('');
    const [consent, setConsent] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string>('');

    const [provider, setProvider] = useState<AvatarProviderKind>('local');
    const [avatarId, setAvatarId] = useState<string>('');
    const [voiceId, setVoiceId] = useState<string>('');
    const [browserVoiceURI, setBrowserVoiceURI] = useState<string>('');
    const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
    const [displayName, setDisplayName] = useState<string>('');
    const [systemPrompt, setSystemPrompt] = useState<string>(systemPromptDefault || '');
    const [voices, setVoices] = useState<Array<{ id: string; name?: string }>>([]);
    const browserVoices = useBrowserVoices();

    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cancelledRef = useRef(false);
    const hydratedRef = useRef(false);

    // Hydrate the local fields from the profile store once on mount (not on
    // every store change — the user is actively editing these fields).
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        if (profile) {
            setProvider(profile.provider ?? 'local');
            setAvatarId(profile.avatarId || '');
            setVoiceId(profile.voiceId || '');
            setBrowserVoiceURI(profile.browserVoiceURI || '');
            setPhotoDataUrl(profile.photoDataUrl || '');
            setDisplayName(profile.displayName || '');
            setSystemPrompt(profile.systemPrompt || systemPromptDefault || '');
        }
    }, [profile, systemPromptDefault]);

    // Anam voice list — only fetched when the Anam path is actually selected
    // (no point hitting the network for a provider the user isn't using).
    useEffect(() => {
        if (provider !== 'anam') return;
        cancelledRef.current = false;
        listOptions(integrations).then((res) => {
            if (cancelledRef.current || !res.success) return;
            const list = Array.isArray((res.data?.voices as any)?.data)
                ? (res.data!.voices as any).data
                : Array.isArray(res.data?.voices)
                    ? (res.data!.voices as any)
                    : [];
            setVoices(list);
        }).catch(() => { /* options are a nice-to-have; setup still works without them */ });
        return () => {
            cancelledRef.current = true;
        };
    }, [integrations, provider]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(file));
        setCreateError('');
    }, []);

    // Local path: downscale the uploaded photo client-side and stash it as a
    // data URL on save (no network call — the whole point of this provider).
    useEffect(() => {
        if (provider !== 'local' || !photoFile) return;
        let cancelled = false;
        (async () => {
            try {
                const rawDataUrl = await fileToDataUrl(photoFile);
                if (cancelled) return;
                const downscaled = await downscaleImageDataUrl(rawDataUrl);
                if (cancelled) return;
                setPhotoDataUrl(downscaled);
            } catch {
                // best-effort — leave photoDataUrl unset; Save stays disabled
                // by the consent+photo gate below until a photo is ready.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [provider, photoFile]);

    const handleCreate = useCallback(async () => {
        if (!photoFile || !consent) return;
        setCreating(true);
        setCreateError('');
        try {
            const imageBase64 = await fileToBase64(photoFile);
            const res = await createAvatarFromImage(integrations, {
                imageBase64,
                mimeType: photoFile.type || 'image/jpeg',
                displayName: displayName || undefined,
                consent: true,
            });
            if (!res.success || !res.data?.id) {
                setCreateError(res.error || 'Failed to create avatar.');
                return;
            }
            setAvatarId(res.data.id);
        } catch (err: any) {
            setCreateError(err?.message || 'Failed to create avatar.');
        } finally {
            setCreating(false);
        }
    }, [photoFile, consent, integrations, displayName]);

    const canSaveLocal = provider === 'local' && consent && !!photoDataUrl;
    const canSaveAnam = provider === 'anam';

    const handleSave = useCallback(() => {
        setSaving(true);
        setSaveStatus('idle');
        try {
            save({
                provider,
                avatarId: provider === 'anam' ? (avatarId || null) : null,
                voiceId: provider === 'anam' ? (voiceId || null) : null,
                browserVoiceURI: provider === 'local' ? (browserVoiceURI || null) : null,
                photoDataUrl: provider === 'local' ? (photoDataUrl || null) : null,
                systemPrompt: systemPrompt || null,
                displayName: displayName || null,
            });
            setSaveStatus('saved');
        } catch {
            setSaveStatus('error');
        } finally {
            setSaving(false);
        }
    }, [save, provider, avatarId, voiceId, browserVoiceURI, photoDataUrl, systemPrompt, displayName]);

    // Local path can save once a photo is downscaled+consented, OR if the
    // agent already has a saved photo from a previous session (re-saving
    // display name/system prompt without re-uploading a photo).
    const localSaveBlocked = provider === 'local' && !canSaveLocal && !profile?.photoDataUrl;
    const anamSaveBlocked = provider === 'anam' && !canSaveAnam;

    return (
        <div className="avatar-setup-panel">
            <div className="avatar-setup-panel__header">
                <span>Avatar setup — {agentId}</span>
                <button className="avatar-setup-panel__close" onClick={onClose} aria-label="Close avatar setup">
                    <X size={14} aria-hidden />
                </button>
            </div>

            {anamConfigured && (
                <div className="avatar-setup-panel__section">
                    <label className="avatar-setup-panel__label" htmlFor={`avatar-provider-${agentId}`}>Provider</label>
                    <select
                        id={`avatar-provider-${agentId}`}
                        value={provider}
                        onChange={(e) => setProvider(e.target.value as AvatarProviderKind)}
                        className="avatar-setup-panel__select"
                    >
                        <option value="local">Local (built-in)</option>
                        <option value="anam">Anam (your key)</option>
                    </select>
                </div>
            )}

            <div className="avatar-setup-panel__section">
                <label className="avatar-setup-panel__label" htmlFor={`avatar-photo-input-${agentId}`}>Photo</label>
                <input
                    id={`avatar-photo-input-${agentId}`}
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="avatar-setup-panel__file-input"
                />
                {(photoPreview || photoDataUrl) && (
                    <img src={photoPreview || photoDataUrl} alt="Selected photo preview" className="avatar-setup-panel__preview" />
                )}
            </div>

            <label className="avatar-setup-panel__consent">
                <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                />
                I have the right to use this person's likeness
            </label>

            {provider === 'anam' && (
                <>
                    <button
                        className="avatar-setup-panel__btn avatar-setup-panel__btn--primary"
                        onClick={handleCreate}
                        disabled={!photoFile || !consent || creating}
                    >
                        {creating ? <><Loader2 size={14} className="avatar-setup-panel__spin" aria-hidden /> Creating…</> : <><Upload size={14} aria-hidden /> Create avatar</>}
                    </button>

                    {createError && <div className="avatar-setup-panel__error">{createError}</div>}
                    {avatarId && <div className="avatar-setup-panel__avatar-id">Avatar ID: <code>{avatarId}</code></div>}

                    <div className="avatar-setup-panel__section">
                        <label className="avatar-setup-panel__label" htmlFor={`avatar-voice-select-${agentId}`}>Voice</label>
                        <select
                            id={`avatar-voice-select-${agentId}`}
                            value={voiceId}
                            onChange={(e) => setVoiceId(e.target.value)}
                            className="avatar-setup-panel__select"
                        >
                            <option value="">Default</option>
                            {voices.map((v) => (
                                <option key={v.id} value={v.id}>{v.name || v.id}</option>
                            ))}
                        </select>
                    </div>
                </>
            )}

            {provider === 'local' && (
                <div className="avatar-setup-panel__section">
                    <label className="avatar-setup-panel__label" htmlFor={`avatar-browser-voice-select-${agentId}`}>Voice (built-in)</label>
                    <select
                        id={`avatar-browser-voice-select-${agentId}`}
                        value={browserVoiceURI}
                        onChange={(e) => setBrowserVoiceURI(e.target.value)}
                        className="avatar-setup-panel__select"
                    >
                        <option value="">Browser default</option>
                        {browserVoices.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="avatar-setup-panel__section">
                <label className="avatar-setup-panel__label" htmlFor={`avatar-display-name-${agentId}`}>Display name</label>
                <input
                    id={`avatar-display-name-${agentId}`}
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="avatar-setup-panel__text-input"
                />
            </div>

            <div className="avatar-setup-panel__section">
                <label className="avatar-setup-panel__label" htmlFor={`avatar-system-prompt-${agentId}`}>System prompt override</label>
                <textarea
                    id={`avatar-system-prompt-${agentId}`}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="avatar-setup-panel__textarea"
                    rows={3}
                />
            </div>

            <button
                className="avatar-setup-panel__btn avatar-setup-panel__btn--primary"
                onClick={handleSave}
                disabled={saving || localSaveBlocked || anamSaveBlocked}
            >
                {saving ? 'Saving…' : 'Save'}
            </button>
            {saveStatus === 'saved' && <span className="avatar-setup-panel__saved">Saved.</span>}
            {saveStatus === 'error' && <span className="avatar-setup-panel__error">Failed to save.</span>}
        </div>
    );
}
