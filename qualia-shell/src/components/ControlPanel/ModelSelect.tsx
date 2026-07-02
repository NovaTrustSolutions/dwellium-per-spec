/**
 * ModelSelect — the Model dropdown for an LLM provider card (Task B).
 *
 * Replaces the old free-text Model input. It shows a <select> populated from
 * three merged sources (dedup + preserve current selection):
 *   1. a live fetch of the provider's own model list (source of truth), cached
 *      in the integrations bundle via `onModelsFetched`,
 *   2. a curated fallback list (CURATED_MODELS) for when there's no key / the
 *      fetch fails / offline,
 *   3. the currently-saved model (so a user's value is never silently dropped —
 *      SPEC §B4.5).
 * A "Custom…" option always reveals a free-text input so any model id can still
 * be entered (SPEC §B4.4). A "Refresh models" button re-runs the live fetch.
 *
 * The <select> is labelled via htmlFor/id (jsx-a11y/label-has-associated-control,
 * enforced in CI — SPEC §B7). No secrets are read or logged here.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ModelListResult } from '../../lib/llmClient';

const CUSTOM_SENTINEL = '__custom__';
/** Re-fetch the model list if the cache is older than this (1 hour). */
const STALE_MS = 60 * 60 * 1000;

export interface ModelSelectProps {
    label?: string;
    /** Currently-saved model id. */
    value: string;
    /** Curated fallback ids for this provider. */
    curated: string[];
    /** Live-fetched ids cached in the bundle (may be undefined). */
    cachedModels?: string[];
    /** unix ms of the last successful fetch (drives staleness + "last refreshed"). */
    modelsFetchedAt?: number;
    /** True when a live fetch is possible (a key / base URL is configured). */
    canFetch: boolean;
    /** Provider-specific model-list fetch (see llmClient.listModels). */
    fetchModels: () => Promise<ModelListResult>;
    /** Persist a newly-selected / typed model id. */
    onSelect: (model: string) => void;
    /** Persist a freshly-fetched model list (cache) into the bundle. */
    onModelsFetched: (models: string[]) => void;
    /** Placeholder for the custom free-text input. */
    placeholder?: string;
}

export function ModelSelect({
    label = 'Model',
    value,
    curated,
    cachedModels,
    modelsFetchedAt,
    canFetch,
    fetchModels,
    onSelect,
    onModelsFetched,
    placeholder,
}: ModelSelectProps) {
    const selectId = useId();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [customMode, setCustomMode] = useState(false);

    // Latest-closure refs so runFetch can stay identity-stable (no effect loops).
    const fetchRef = useRef(fetchModels);
    fetchRef.current = fetchModels;
    const onFetchedRef = useRef(onModelsFetched);
    onFetchedRef.current = onModelsFetched;

    const runFetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchRef.current();
            if (res.models.length > 0) onFetchedRef.current(res.models);
            else setError(res.error || 'No models returned');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-fetch once when a key is present and the cache is empty or stale.
    const autoRanRef = useRef(false);
    useEffect(() => {
        if (autoRanRef.current || !canFetch) return;
        const stale = !modelsFetchedAt || Date.now() - modelsFetchedAt > STALE_MS;
        const hasCache = !!cachedModels && cachedModels.length > 0;
        if (hasCache && !stale) return;
        autoRanRef.current = true;
        void runFetch();
    }, [canFetch, modelsFetchedAt, cachedModels, runFetch]);

    // Merge curated + fetched + current selection; keep the saved value listed.
    const options = useMemo(() => {
        const merged = [...curated, ...(cachedModels ?? [])];
        if (value) merged.push(value);
        return Array.from(new Set(merged.filter(Boolean)));
    }, [curated, cachedModels, value]);

    const selectValue = customMode ? CUSTOM_SENTINEL : value;

    const handleSelect = (next: string) => {
        if (next === CUSTOM_SENTINEL) {
            setCustomMode(true);   // reveal free-text; keep current value as starting point
            return;
        }
        setCustomMode(false);
        onSelect(next);
    };

    return (
        <div className="cp-field">
            <label className="cp-label" htmlFor={selectId}>{label}</label>
            <select
                id={selectId}
                className="cp-select"
                value={selectValue}
                onChange={e => handleSelect(e.target.value)}
            >
                {options.length === 0 && <option value="">{placeholder || '— select a model —'}</option>}
                {options.map(m => (
                    <option key={m} value={m}>{m}</option>
                ))}
                <option value={CUSTOM_SENTINEL}>Custom…</option>
            </select>

            {customMode && (
                <input
                    className="cp-input"
                    style={{ marginTop: 6 }}
                    type="text"
                    value={value}
                    onChange={e => onSelect(e.target.value)}
                    placeholder={placeholder}
                    aria-label={`${label} (custom)`}
                />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <button
                    type="button"
                    className="cp-btn cp-btn--subtle"
                    style={{ fontSize: 11 }}
                    onClick={() => { autoRanRef.current = true; void runFetch(); }}
                    disabled={loading || !canFetch}
                >
                    {loading ? 'Loading…' : 'Refresh models'}
                </button>
                {error && (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Using fallback list ({error})
                    </span>
                )}
                {!error && !loading && modelsFetchedAt && (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {cachedModels?.length ?? 0} models
                    </span>
                )}
            </div>
        </div>
    );
}

export default ModelSelect;
