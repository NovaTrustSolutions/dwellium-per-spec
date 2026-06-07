/**
 * Integration types — per-user configuration for LLM providers + external
 * services. Persisted in localStorage namespaced by user.id; load on login,
 * read by any widget that needs to talk to an LLM or external service.
 *
 * 2026-05-26 created (PR-pending — "Integrations section in Settings").
 */

export type LlmProvider =
    | 'anthropic'
    | 'openai'
    | 'gemini'
    | 'local'
    | 'custom';

export interface LlmAnthropicConfig {
    apiKey: string;
    model: string;                      // e.g. "claude-opus-4-6", "claude-haiku-4-5-20251001"
    enabled: boolean;
}

export interface LlmOpenAIConfig {
    apiKey: string;
    model: string;                      // e.g. "gpt-4o-mini", "gpt-4o"
    enabled: boolean;
}

export interface LlmGeminiConfig {
    apiKey: string;
    model: string;                      // e.g. "gemini-1.5-pro", "gemini-1.5-flash"
    enabled: boolean;
}

export interface LlmLocalConfig {
    baseUrl: string;                    // e.g. "http://localhost:11434" (Ollama default)
    model: string;                      // e.g. "llama3.2", "qwen2.5"
    enabled: boolean;
}

export interface LlmCustomConfig {
    name: string;                       // user-supplied label, e.g. "OpenRouter"
    baseUrl: string;                    // e.g. "https://openrouter.ai/api/v1"
    apiKey: string;
    model: string;                      // e.g. "anthropic/claude-3-5-sonnet"
    enabled: boolean;
}

export interface GoogleGmailConfig {
    // OAuth tokens — populated after backend redirect flow completes.
    // For Phase-1 we store the placeholders; full OAuth wiring TBD.
    accessToken?: string;
    refreshToken?: string;
    email?: string;                     // watched mailbox
    expiresAt?: number;                 // unix ms
    enabled: boolean;
}

export interface GoogleCalendarConfig {
    accessToken?: string;
    refreshToken?: string;
    email?: string;
    defaultCalendarId?: string;
    expiresAt?: number;
    enabled: boolean;
}

/**
 * Google Drive storage box — back up / restore the user's local data (Wiki,
 * Thought Weaver, File Explorer cache, Honcho memory) to a folder on their own
 * Google Drive. Frontend-only via Google Identity Services + the Drive REST API
 * with the narrow `drive.file` scope (app only sees files it created). The user
 * supplies a Google OAuth Client ID (one-time Google Cloud Console setup), just
 * like an LLM API key. Access tokens are session-only and never persisted.
 */
export interface GoogleDriveConfig {
    clientId: string;           // OAuth 2.0 Web client ID from Google Cloud Console
    folderId?: string;          // resolved on first backup (the "Dwellium" folder)
    folderName?: string;        // default 'Dwellium'
    lastSyncAt?: number;        // unix ms of last successful backup/restore
    enabled: boolean;
}

export interface SupabaseConfig {
    url: string;                        // e.g. "https://abc.supabase.co"
    anonKey: string;                    // public anon key
    serviceKey?: string;                // optional; admin server-side key
    enabled: boolean;
}

/**
 * Postgres config — single cloud-hosted instance shared between the Electron
 * app and the web version. Browsers can't speak the Postgres wire protocol
 * directly, so the actual connection lives in the backend OR (for Electron)
 * the main process. This config is the per-user definition of WHICH cloud
 * Postgres to talk to; the connection itself goes through a transport layer
 * that consumes these fields.
 *
 * Accepts either a full connection string OR discrete host/port/database/
 * user/password fields. Connection string takes precedence when set.
 */
export interface PostgresConfig {
    /** Full URL — postgres://user:pass@host:port/db?sslmode=require */
    connectionString?: string;
    /** Discrete fields — used if connectionString is empty. */
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    /** SSL mode for discrete-field shape. Strings match libpq: disable/require/verify-ca/verify-full. */
    sslMode?: 'disable' | 'require' | 'verify-ca' | 'verify-full';
    /**
     * Whether the Electron app should sync state to this Postgres in
     * addition to the web frontend. Both endpoints write to the same DB.
     */
    syncEnabled?: boolean;
    enabled: boolean;
}

/** Test-result metadata, attached separately so it doesn't pollute config. */
export interface IntegrationTestResult {
    ok: boolean;
    testedAt: number;                   // unix ms
    error?: string;                     // present iff ok === false
}

/**
 * Full per-user integrations bundle. Every field is optional at construction;
 * empty defaults via `emptyIntegrations()`.
 */
export interface IntegrationsBundle {
    llm: {
        active: LlmProvider | null;     // which provider is preferred when multiple are configured
        anthropic?: LlmAnthropicConfig;
        openai?: LlmOpenAIConfig;
        gemini?: LlmGeminiConfig;
        local?: LlmLocalConfig;
        custom?: LlmCustomConfig;
    };
    google: {
        gmail?: GoogleGmailConfig;
        calendar?: GoogleCalendarConfig;
    };
    supabase?: SupabaseConfig;
    postgres?: PostgresConfig;
    /** Storage backends — where the user's local data can be backed up. */
    storage?: {
        googleDrive?: GoogleDriveConfig;
    };
    tests: {
        anthropic?: IntegrationTestResult;
        openai?: IntegrationTestResult;
        gemini?: IntegrationTestResult;
        local?: IntegrationTestResult;
        custom?: IntegrationTestResult;
        gmail?: IntegrationTestResult;
        calendar?: IntegrationTestResult;
        supabase?: IntegrationTestResult;
        postgres?: IntegrationTestResult;
    };
}

export function emptyIntegrations(): IntegrationsBundle {
    return {
        llm: { active: null },
        google: {},
        tests: {},
    };
}

/**
 * Default models by provider — used when user hasn't picked one. Conservative
 * choices (cheap + fast) so accidental usage stays low-cost.
 */
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-1.5-flash',
    local: 'llama3.2',
    custom: '',                         // user must supply for custom
};

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    gemini: 'Google Gemini',
    local: 'Local LLM',
    custom: 'Custom (OpenRouter, etc.)',
};

/** Mask an API key for display: shows last 4 chars only. */
export function maskKey(key: string | undefined): string {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return '••••••••' + key.slice(-4);
}
