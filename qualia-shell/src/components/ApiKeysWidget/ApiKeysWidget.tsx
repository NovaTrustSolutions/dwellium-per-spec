/**
 * ApiKeysWidget — a standalone window that surfaces the per-user API-key
 * panel directly on the desktop (registered as the `api-keys` widget, placed
 * immediately below Inbox Zero). It is a thin shell around the reusable,
 * prop-less <ApiKeysPanel/> (Active-LLM picker + 5 write-only provider cards)
 * — it does NOT re-implement any key field or storage; the panel owns all of
 * that via useIntegrations().
 *
 * ZERO-DOM-wrapper contract: the single root <div className="cp-section …">
 * becomes the window content (`.window__content > *`), so there's exactly one
 * sensible container and no redundant nesting.
 *
 * SSR-safe: no init-time window/localStorage access in render — the panel's
 * useIntegrations() is itself SSR-safe (useSyncExternalStore + getServerSnapshot).
 *
 * Styling: reuses the existing ControlPanel `cp-*` classes, which resolve to
 * the fey palette (--accent acid-lime #D6FE51 + --font-primary). No new colors.
 *
 * 2026-06-15 created.
 */

import * as React from 'react';
import ApiKeysPanel from '../ControlPanel/ApiKeysPanel';

export default function ApiKeysWidget(): React.JSX.Element {
    return (
        <div
            className="cp-section api-keys-widget"
            style={{
                height: '100%',
                overflowY: 'auto',
                padding: 16,
                fontFamily: 'var(--font-primary, "Hanken Grotesk", -apple-system, sans-serif)',
                color: 'var(--text-primary)',
                background: 'var(--bg-canvas)',
            }}
        >
            <header style={{ marginBottom: 14 }}>
                <h2
                    className="cp-section__title"
                    style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}
                >
                    API Keys
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Your saved keys are encrypted and never shown — enter a key to replace it.
                </p>
            </header>

            <ApiKeysPanel />
        </div>
    );
}
