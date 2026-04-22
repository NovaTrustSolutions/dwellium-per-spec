/**
 * Sentry — Frontend error monitoring integration
 *
 * Initializes @sentry/react when VITE_SENTRY_DSN is set.
 * Fully no-op when DSN is empty (dev mode / unconfigured).
 *
 * Usage:
 *   import { initSentry, captureError, isEnabled } from './sentry';
 *   initSentry();  // call once at startup, before React renders
 */
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN || '';
const ENVIRONMENT = import.meta.env.MODE || 'development';

let initialized = false;

/**
 * Initialize Sentry. Safe to call multiple times — only runs once.
 * Does nothing if VITE_SENTRY_DSN is not set.
 */
export function initSentry(): void {
    if (initialized || !DSN) {
        if (!DSN) console.log('[Sentry] Skipped — VITE_SENTRY_DSN not set');
        return;
    }

    Sentry.init({
        dsn: DSN,
        environment: ENVIRONMENT,
        integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({
                maskAllText: false,
                blockAllMedia: false,
            }),
        ],
        // Performance sampling
        tracesSampleRate: ENVIRONMENT === 'production' ? 0.2 : 1.0,
        // Session replay sampling
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        // Don't send PII
        sendDefaultPii: false,
        // Filter noisy errors
        beforeSend(event) {
            // Skip errors from browser extensions
            if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
                (f) => f.filename?.includes('chrome-extension://'),
            )) {
                return null;
            }
            return event;
        },
    });

    initialized = true;
    console.log(`[Sentry] Initialized (env: ${ENVIRONMENT})`);
}

/**
 * Report an error to Sentry with optional context.
 * No-op if Sentry is not initialized.
 */
export function captureError(
    error: Error | string,
    component?: string,
    metadata?: Record<string, any>,
): void {
    if (!initialized) return;

    const err = error instanceof Error ? error : new Error(String(error));

    Sentry.withScope((scope) => {
        if (component) scope.setTag('component', component);
        if (metadata) scope.setExtras(metadata);
        Sentry.captureException(err);
    });
}

/**
 * Set the authenticated user for Sentry context.
 */
export function setSentryUser(user: { id: string; email?: string; role?: string } | null): void {
    if (!initialized) return;
    if (user) {
        Sentry.setUser({ id: user.id, email: user.email, username: user.role });
    } else {
        Sentry.setUser(null);
    }
}

/**
 * Whether Sentry is currently active.
 */
export function isEnabled(): boolean {
    return initialized;
}

/**
 * Re-export Sentry for direct access (e.g., ErrorBoundary component).
 */
export { Sentry };
