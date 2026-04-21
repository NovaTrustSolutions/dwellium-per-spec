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

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>,
)
