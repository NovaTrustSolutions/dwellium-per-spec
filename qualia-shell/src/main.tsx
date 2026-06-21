import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'
import { initSentry } from './services/sentry'
import { initGlobalErrorHandlers } from './services/errorReporter'
import App from './App'

// Initialize Sentry first (no-op if VITE_SENTRY_DSN is empty)
initSentry();

// Register global error & unhandled rejection handlers
initGlobalErrorHandlers();

// Delegated handler for code-block "Copy" buttons rendered by renderSafeMarkdown.
// The button carries its payload in an inert `data-copy` attribute (no inline JS),
// so this single listener replaces the previous per-button onclick handler that
// required allowlisting `onclick` in the DOMPurify config. See safeMarkdown.ts.
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement)?.closest?.('.code-copy-btn') as HTMLElement | null;
        if (btn?.dataset.copy) {
            navigator.clipboard?.writeText(decodeURIComponent(btn.dataset.copy));
        }
    });
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>,
)
