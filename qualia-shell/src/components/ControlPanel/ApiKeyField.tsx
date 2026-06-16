/**
 * ApiKeyField — a WRITE-ONLY API-key input.
 *
 * Unlike the legacy ControlPanel `ApiKeyInput`, this field NEVER renders the
 * full plaintext key and has NO reveal / 👁 toggle. Once a key is configured it
 * shows only `maskKey(value)` (••••1234) with Replace / Remove actions; entering
 * a new value goes through a fresh empty `type="password"` input. This keeps
 * keys write-only from the UI even though the in-memory bundle still holds the
 * plaintext for the providers that consume it.
 *
 * Stable signature — a sibling "API Keys" widget imports this directly, so the
 * `ApiKeyFieldProps` contract must not change shape.
 *
 * Styling: reuses the existing `cp-*` ControlPanel classes (which resolve to the
 * fey palette via --accent acid-lime + --font-primary). No violet/indigo.
 *
 * 2026-06-15 created.
 */

import * as React from 'react';
import { useState } from 'react';
import { maskKey } from '../../types/integrations';

export interface ApiKeyFieldProps {
    /** Visible label, e.g. "Anthropic API key". */
    label: string;
    /** Provider slug used for the input id/name, e.g. "anthropic". */
    provider: string;
    /** Current plaintext key from the bundle (may be ""). */
    value: string;
    /** Commit a new key. */
    onChange: (next: string) => void;
    /** Clear this provider's key. */
    onRemove: () => void;
    /** Optional placeholder for the entry input. */
    placeholder?: string;
    /** Optional autoComplete; defaults to "off". */
    autoComplete?: string;
}

export function ApiKeyField({
    label,
    provider,
    value,
    onChange,
    onRemove,
    placeholder = 'sk-…',
    autoComplete = 'off',
}: ApiKeyFieldProps): React.JSX.Element {
    const hasKey = value.length > 0;
    // `editing` is true when we're showing the empty write-only entry box:
    // always true with no stored key; toggled on via Replace when one exists.
    const [editing, setEditing] = useState(false);
    // Local draft for the entry box; never seeded from `value`, so the
    // plaintext key is never placed into a rendered input.
    const [draft, setDraft] = useState('');

    const inputId = `apikey-${provider}`;

    const commit = () => {
        const next = draft.trim();
        if (next.length > 0) {
            onChange(next);
        }
        setDraft('');
        setEditing(false);
    };

    const cancel = () => {
        setDraft('');
        setEditing(false);
    };

    // ── Configured + not editing → masked summary with Replace / Remove ──
    if (hasKey && !editing) {
        return (
            <div className="cp-field">
                {label && <label className="cp-label" htmlFor={inputId}>{label}</label>}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span
                        id={inputId}
                        style={{
                            flex: 1,
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: 'var(--fs-sm, 13px)',
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-canvas)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm, 4px)',
                            padding: 'var(--sp-2, 6px) var(--sp-2, 8px)',
                            letterSpacing: '0.04em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                        aria-label={`${label || provider} configured, ending ${value.slice(-4)}`}
                    >
                        {maskKey(value)}
                    </span>
                    <button
                        type="button"
                        className="cp-btn cp-btn--subtle"
                        style={{ width: 'auto', flex: '0 0 auto', fontSize: 11, padding: '4px 10px' }}
                        onClick={() => { setDraft(''); setEditing(true); }}
                    >
                        Replace
                    </button>
                    <button
                        type="button"
                        className="cp-btn cp-btn--subtle cp-btn--danger"
                        style={{ width: 'auto', flex: '0 0 auto', fontSize: 11, padding: '4px 10px' }}
                        onClick={onRemove}
                        title={`Remove ${label || provider}`}
                    >
                        Remove
                    </button>
                </div>
            </div>
        );
    }

    // ── No key, OR Replace pressed → empty write-only entry box ──
    const showCancel = hasKey; // only offer Cancel when we're replacing an existing key
    return (
        <div className="cp-field">
            {label && <label className="cp-label" htmlFor={inputId}>{label}</label>}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                    id={inputId}
                    name={inputId}
                    className="cp-input"
                    type="password"
                    placeholder={hasKey ? 'Enter new key…' : placeholder}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(); }
                        else if (e.key === 'Escape' && showCancel) { e.preventDefault(); cancel(); }
                    }}
                    style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)' }}
                    autoComplete={autoComplete}
                    spellCheck={false}
                    // Mounting straight into Replace should focus the box.
                    autoFocus={hasKey}
                    aria-label={label || `${provider} API key`}
                />
                <button
                    type="button"
                    className="cp-btn cp-btn--subtle"
                    style={{ width: 'auto', flex: '0 0 auto', fontSize: 11, padding: '4px 10px' }}
                    onMouseDown={e => e.preventDefault() /* keep focus so onBlur->commit doesn't double-fire */}
                    onClick={commit}
                    disabled={draft.trim().length === 0}
                >
                    Save
                </button>
                {showCancel && (
                    <button
                        type="button"
                        className="cp-btn cp-btn--subtle"
                        style={{ width: 'auto', flex: '0 0 auto', fontSize: 11, padding: '4px 10px' }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={cancel}
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}

export default ApiKeyField;
