/**
 * Fact Check Log — say what actually failed.
 *
 * Before 2026-09-08 the widget printed "No LLM configured and backend offline"
 * whenever BOTH its paths failed, even when an LLM was configured and had
 * simply errored (bad key, model, CORS…) and the backend had answered with a
 * 5xx / HTML page. The explanation must name the real failure so the user can
 * act on it.
 */

export interface FactCheckFailure {
    /** `hasActiveLlm()` at the moment of the check. */
    llmActive: boolean;
    /** Provider label when active (e.g. "anthropic"). */
    llmProvider?: string | null;
    /** Error text from the LLM call, if it was attempted and failed. */
    llmError?: string | null;
    /** What went wrong with the backend fallback (`describeBackendFailure`). */
    backendError: string;
}

/** One line for a failed backend request: HTTP status, non-JSON body, or network error. */
export function describeBackendFailure(kind: 'network' | 'http' | 'not-json' | 'rejected', detail?: string | number): string {
    switch (kind) {
        case 'network': return `backend unreachable (${detail || 'network error'})`;
        case 'http': return `backend answered HTTP ${detail}`;
        case 'not-json': return `backend answered with a non-JSON body${detail ? ` (HTTP ${detail})` : ''}`;
        case 'rejected': return `backend rejected the request${detail ? ` (${detail})` : ''}`;
    }
}

export function describeFactCheckFailure(f: FactCheckFailure): string {
    if (!f.llmActive) {
        return `No LLM provider is active for your account (Settings → API Keys), and the ${f.backendError}. ` +
            'Activate a provider, or bring the backend back, and check again.';
    }
    const provider = f.llmProvider ? `${f.llmProvider} ` : '';
    if (f.llmError) {
        return `Your ${provider}LLM call failed: ${f.llmError}. The ${f.backendError}. ` +
            'Fix the key/model in Settings → API Keys, or bring the backend back, and check again.';
    }
    return `Your ${provider}LLM returned nothing usable, and the ${f.backendError}.`;
}
