/**
 * personaShare — PURE export/import/share-code helpers for Persona Studio.
 *
 * DOM-free (string in, string out) so it unit-tests without a browser:
 *   - encodePersonaShare: PersonaConfig → UTF-8-safe base64 share code.
 *   - decodePersonaShare: share code → validated PersonaConfig (null on any
 *     parse/validation failure — garbage never throws).
 *   - mergePersonaImport: unknown parsed JSON → PersonaConfig merged over
 *     defaultPersonaConfig() the same schema-forward way personaConfigStore's
 *     deserializer merges stored blobs (tools/faceRegions shallow-merged,
 *     customTools array-validated, llmDisabled coerced).
 *
 * 2026-07-06 created (B-11 persona export / import / share).
 */

import { defaultPersonaConfig, type PersonaConfig } from './personaEngine';

/**
 * Merge a raw imported value over the default config. Returns null unless the
 * value is an object carrying at least a string `name` or `systemPrompt`
 * (minimal proof it is a persona, not arbitrary JSON).
 */
export function mergePersonaImport(raw: unknown): PersonaConfig | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const parsed = raw as Record<string, unknown>;
    const hasName = typeof parsed.name === 'string' && parsed.name.trim().length > 0;
    const hasPrompt = typeof parsed.systemPrompt === 'string' && parsed.systemPrompt.trim().length > 0;
    if (!hasName && !hasPrompt) return null;

    const defaults = defaultPersonaConfig();
    const merged: PersonaConfig = {
        ...defaults,
        ...(parsed as Partial<PersonaConfig>),
        tools: { ...defaults.tools, ...(parsed.tools && typeof parsed.tools === 'object' ? parsed.tools : {}) },
        faceRegions: {
            ...defaults.faceRegions,
            ...(parsed.faceRegions && typeof parsed.faceRegions === 'object' ? parsed.faceRegions : {}),
        },
        customTools: Array.isArray(parsed.customTools) ? parsed.customTools as PersonaConfig['customTools'] : defaults.customTools,
        llmDisabled: parsed.llmDisabled === undefined ? defaults.llmDisabled : !!parsed.llmDisabled,
    };
    // Guard the two scalars downstream code renders directly.
    if (typeof merged.name !== 'string' || !merged.name.trim()) merged.name = defaults.name;
    if (typeof merged.systemPrompt !== 'string') merged.systemPrompt = defaults.systemPrompt;
    return merged;
}

/**
 * Serialize a config to a UTF-8-safe base64 share code. btoa only accepts
 * Latin-1, so the JSON is percent-encoded to UTF-8 bytes first and each %XX
 * escape collapsed to its raw byte (the standard encodeURIComponent trick).
 */
export function encodePersonaShare(config: PersonaConfig): string {
    const json = JSON.stringify(config);
    const bytes = encodeURIComponent(json).replace(
        /%([0-9A-F]{2})/g,
        (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)),
    );
    return btoa(bytes);
}

/**
 * Decode a share code back into a validated PersonaConfig. Any failure —
 * bad base64, invalid UTF-8, malformed JSON, non-persona payload — yields
 * null instead of throwing.
 */
export function decodePersonaShare(code: string): PersonaConfig | null {
    try {
        const bytes = atob((code ?? '').trim());
        const json = decodeURIComponent(
            bytes.split('').map(ch => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(''),
        );
        return mergePersonaImport(JSON.parse(json));
    } catch {
        return null;
    }
}
