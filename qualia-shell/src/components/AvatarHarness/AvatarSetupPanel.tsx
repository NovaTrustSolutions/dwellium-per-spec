/**
 * AvatarSetupPanel — per-agent avatar setup (plan 040).
 *
 * Upload a photo -> REQUIRED likeness-consent checkbox -> create a custom
 * Anam avatar from it -> pick a voice -> optional system-prompt override ->
 * Save (PUT /api/avatar/profiles/:agentId). The consent checkbox is a hard
 * gate: the Create button stays disabled until it is checked, AND the
 * backend independently re-validates `consent === true` on
 * POST /create-from-image, so the requirement can never be bypassed by
 * calling the API directly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import {
    createAvatarFromImage,
    getAvatarOptions,
    getAvatarProfile,
    saveAvatarProfile,
} from '../../lib/avatarClient';
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
            // Strip the "data:<mime>;base64," prefix — the backend wants raw base64.
            const commaIdx = result.indexOf(',');
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export default function AvatarSetupPanel({ agentId, systemPromptDefault, onClose }: AvatarSetupPanelProps) {
    const { authFetch } = useUser();

    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string>('');
    const [consent, setConsent] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string>('');

    const [avatarId, setAvatarId] = useState<string>('');
    const [voiceId, setVoiceId] = useState<string>('');
    const [displayName, setDisplayName] = useState<string>('');
    const [systemPrompt, setSystemPrompt] = useState<string>(systemPromptDefault || '');
    const [voices, setVoices] = useState<Array<{ id: string; name?: string }>>([]);

    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cancelledRef = useRef(false);

    useEffect(() => {
        cancelledRef.current = false;
        getAvatarProfile(authFetch, agentId).then((res) => {
            if (cancelledRef.current || !res.success || !res.data) return;
            setAvatarId(res.data.avatarId || '');
            setVoiceId(res.data.voiceId || '');
            setDisplayName(res.data.displayName || '');
            setSystemPrompt(res.data.systemPrompt || systemPromptDefault || '');
        });
        getAvatarOptions(authFetch).then((res) => {
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
    }, [authFetch, agentId, systemPromptDefault]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(file));
        setCreateError('');
    }, []);

    const handleCreate = useCallback(async () => {
        if (!photoFile || !consent) return;
        setCreating(true);
        setCreateError('');
        try {
            const imageBase64 = await fileToBase64(photoFile);
            const res = await createAvatarFromImage(authFetch, {
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
    }, [photoFile, consent, authFetch, displayName]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaveStatus('idle');
        try {
            const res = await saveAvatarProfile(authFetch, agentId, {
                avatarId: avatarId || null,
                voiceId: voiceId || null,
                systemPrompt: systemPrompt || null,
                displayName: displayName || null,
            });
            setSaveStatus(res.success ? 'saved' : 'error');
        } catch {
            setSaveStatus('error');
        } finally {
            setSaving(false);
        }
    }, [authFetch, agentId, avatarId, voiceId, systemPrompt, displayName]);

    return (
        <div className="avatar-setup-panel">
            <div className="avatar-setup-panel__header">
                <span>Avatar setup — {agentId}</span>
                <button className="avatar-setup-panel__close" onClick={onClose} aria-label="Close avatar setup">
                    <X size={14} aria-hidden />
                </button>
            </div>

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
                {photoPreview && (
                    <img src={photoPreview} alt="Selected photo preview" className="avatar-setup-panel__preview" />
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
                disabled={saving}
            >
                {saving ? 'Saving…' : 'Save'}
            </button>
            {saveStatus === 'saved' && <span className="avatar-setup-panel__saved">Saved.</span>}
            {saveStatus === 'error' && <span className="avatar-setup-panel__error">Failed to save.</span>}
        </div>
    );
}
