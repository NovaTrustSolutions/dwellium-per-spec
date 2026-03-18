/**
 * Error Reporter — Frontend error tracking client
 *
 * Captures runtime errors and sends them to the backend error tracking API.
 * Rate-limited to 10 errors/minute to prevent flooding.
 *
 * Usage:
 *   import { reportError, initGlobalErrorHandlers } from '../services/errorReporter';
 *   initGlobalErrorHandlers();   // call once at startup
 *   reportError(error, 'MyComponent', { extra: 'context' });
 */

const ERROR_ENDPOINT = '/api/errors/report';
const RATE_LIMIT = 10;          // max errors per window
const RATE_WINDOW_MS = 60_000;  // 1 minute window

let errorCount = 0;
let windowStart = Date.now();

function isRateLimited(): boolean {
    const now = Date.now();
    if (now - windowStart > RATE_WINDOW_MS) {
        errorCount = 0;
        windowStart = now;
    }
    errorCount++;
    return errorCount > RATE_LIMIT;
}

/**
 * Report an error to the backend. Fire-and-forget.
 */
export function reportError(
    error: Error | string,
    component?: string,
    metadata?: Record<string, any>,
): void {
    if (isRateLimited()) return;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // Fire and forget — don't let reporting failures affect the app
    try {
        const token = localStorage.getItem('dwellium-auth-token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        fetch(ERROR_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                message: message.slice(0, 2000),
                stack: stack?.slice(0, 8000),
                component: component?.slice(0, 200),
                url: window.location.href,
                level: 'error',
                metadata: {
                    ...metadata,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                },
            }),
        }).catch(() => { /* swallow — reporting must never break the app */ });
    } catch { /* swallow */ }
}

/**
 * Register global handlers for unhandled errors and promise rejections.
 * Call once at application startup (e.g., in main.tsx).
 */
export function initGlobalErrorHandlers(): void {
    // Unhandled JS errors
    window.addEventListener('error', (event: ErrorEvent) => {
        reportError(
            event.error instanceof Error ? event.error : new Error(event.message),
            'window:onerror',
            {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            },
        );
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        reportError(
            reason instanceof Error ? reason : new Error(message),
            'window:unhandledrejection',
        );
    });

    console.log('[ErrorReporter] Global error handlers registered');
}
