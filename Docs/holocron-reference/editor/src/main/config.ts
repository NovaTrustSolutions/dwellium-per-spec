import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'

export type ThemeId = 'holocron-dark' | 'tokyo-night' | 'dracula' | 'nord' | 'solarized-dark' | 'light' | 'midnight-blue' | 'fey'
export type AppMode = 'main' | 'sandbox' | 'research'
export type Provider = 'lmstudio' | 'ollama' | 'openai' | 'anthropic' | 'custom'
export type CrossThreadMode = 'always-ask' | 'free' | 'current-only'

export interface HolocronConfig {
  ai: {
    provider: Provider
    baseUrl: string
    model: string
    apiKey: string
    temperature: number
    maxTokens: number
    contextWindow: number
  }
  /** Second provider — Gemini via the OpenAI-compatible endpoint. Persisted
   *  alongside `ai` so the active provider can be flipped at runtime without
   *  losing the other key. Session 9 (Code Health) declares this on the main
   *  HolocronConfig so the five `cfg as unknown as { gemini }` workarounds in
   *  ragIngest, ragWiki, foundry, dashboard, ipc + hermes can collapse. Shape
   *  mirrors `settingsStore.ts`'s HolocronConfig.gemini exactly. */
  gemini: {
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
    contextWindow: number
  }
  /** Third provider — Anthropic Claude. Same Session 9 consolidation as
   *  `gemini` above; shape mirrors the renderer-side declaration. */
  anthropic: {
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
    contextWindow: number
  }
  honcho: {
    url: string
    enabled: boolean
    token: string
  }
  firecrawl: {
    apiKey: string
    baseUrl: string
  }
  /** Hermes — Telegram relay (architecture-v4 §4.5 §10). Both fields must
   *  be populated for the bot to start. `allowedUserId` is the *only*
   *  security boundary — Hermes ignores every other sender silently. The
   *  user ID is a stringified Telegram user-ID integer; stored as a string
   *  to dodge JSON int53 issues even though Telegram IDs comfortably fit
   *  in a JS number today. */
  telegram: {
    botToken: string
    allowedUserId: string
  }
  /** iCloud Drive watcher inbox (architecture-v4 §10.1). When non-empty,
   *  Hermes starts a chokidar polling watcher on this directory and routes
   *  every new file into the Foundry triage queue. Leading `~/` is
   *  expanded to `$HOME`. The default points at a folder iOS Files / macOS
   *  Files can browse. */
  icloudInboxPath: string
  appearance: { theme: ThemeId }
  agent: {
    userName: string
    agentName: string
    systemPrompt: string
  }
  holocronRoot: string
  /** Library cache root — holds `Wiki/<slug>.md` (compiled wiki pages) and,
   *  starting in architecture-v4 Session 3, `Syntheses/<slug>.md` (agent-
   *  written synthesis docs). Defaults to a sibling directory of
   *  `holocronRoot` named `_Codex`; user-configurable via Settings →
   *  Connections so Andy can point at an iCloud Drive folder for cross-
   *  device sync without moving the Domaines root. Empty string =
   *  "derive at use site" (the legacy behavior). `syncWorkspaceRoots`
   *  populates this on first boot so subsequent reads can rely on it,
   *  and heals a stale `_Library` value left behind by the v14→v15 folder
   *  rename. The config key name stays `libraryPath` for source-stability;
   *  only the on-disk folder name changed. */
  libraryPath: string
  activeSessionId: string
  activeSessionName: string
  // Projects/Threads model — replaces the flat Sessions model.
  projectsRoot: string
  activeProjectName: string
  activeProjectPath: string
  activeThreadName: string
  activeThreadPath: string
  // Last Domaine the user drilled into. Empty string = at Domaines index.
  // Restored on launch so the user lands back where they left off.
  activeDomaineId: string
  workspace: { path: string }
  mode: AppMode
  crossThreadMode: CrossThreadMode
  intake: { showPromptOnNewThread: boolean }
}

export const DEFAULT_CONFIG: HolocronConfig = {
  ai: {
    provider: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'gemma-4-31b-it',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 1024,
    contextWindow: 8192,
  },
  // Defaults mirror the renderer-side settingsStore.ts DEFAULT_CONFIG so a
  // fresh main-side load() returns the same shape as a renderer hydrate.
  gemini: {
    apiKey: '',
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 2048,
    contextWindow: 1048576,
  },
  anthropic: {
    apiKey: '',
    model: 'claude-sonnet-4-6',
    temperature: 0.7,
    maxTokens: 4096,
    contextWindow: 200000,
  },
  honcho: { url: 'http://localhost:8000', enabled: true, token: '' },
  firecrawl: { apiKey: '', baseUrl: 'https://api.firecrawl.dev' },
  telegram: { botToken: '', allowedUserId: '' },
  icloudInboxPath: '',
  appearance: { theme: 'holocron-dark' },
  agent: { userName: 'Andy', agentName: 'Holocron', systemPrompt: '' },
  holocronRoot: '',
  libraryPath: '',
  activeSessionId: '',
  activeSessionName: '',
  projectsRoot: '',
  activeProjectName: '',
  activeProjectPath: '',
  activeThreadName: '',
  activeThreadPath: '',
  activeDomaineId: '',
  workspace: { path: '' },
  mode: 'main',
  crossThreadMode: 'always-ask',
  intake: { showPromptOnNewThread: true },
}

type SecureStoredValue = {
  __agenteryxSecure: 'safeStorage:v1'
  data: string
}

const SENSITIVE_CONFIG_PATHS = [
  ['ai', 'apiKey'],
  ['gemini', 'apiKey'],
  ['anthropic', 'apiKey'],
  ['honcho', 'token'],
  ['firecrawl', 'apiKey'],
  ['telegram', 'botToken'],
  ['telegram', 'allowedUserId'],
] as const

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'holocron-config.json')
}

function deepMerge<T extends object>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults }
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const ov = overrides[key]
    if (ov !== null && typeof ov === 'object' && !Array.isArray(ov)
      && typeof defaults[key] === 'object' && defaults[key] !== null) {
      result[key] = deepMerge(defaults[key] as object, ov as object) as T[typeof key]
    } else if (ov !== undefined) {
      result[key] = ov as T[typeof key]
    }
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getNestedValue(obj: unknown, pathParts: readonly string[]): unknown {
  let cur = obj
  for (const part of pathParts) {
    if (!isRecord(cur)) return undefined
    cur = cur[part]
  }
  return cur
}

function setNestedValue(obj: Record<string, unknown>, pathParts: readonly string[], value: unknown): void {
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i]
    if (!isRecord(cur[part])) cur[part] = {}
    cur = cur[part] as Record<string, unknown>
  }
  cur[pathParts[pathParts.length - 1]] = value
}

function canUseSafeStorage(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function isSecureStoredValue(value: unknown): value is SecureStoredValue {
  return isRecord(value) &&
    value.__agenteryxSecure === 'safeStorage:v1' &&
    typeof value.data === 'string'
}

function encryptConfigValue(value: string): string | SecureStoredValue {
  if (!value || !canUseSafeStorage()) return value
  const encrypted = safeStorage.encryptString(value)
  return {
    __agenteryxSecure: 'safeStorage:v1',
    data: encrypted.toString('base64'),
  }
}

function decryptConfigValue(value: unknown): unknown {
  if (!isSecureStoredValue(value)) return value
  if (!canUseSafeStorage()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value.data, 'base64'))
  } catch {
    return ''
  }
}

function configHasPlaintextSecrets(raw: unknown): boolean {
  return SENSITIVE_CONFIG_PATHS.some((pathParts) => {
    const value = getNestedValue(raw, pathParts)
    return typeof value === 'string' && value.trim().length > 0
  })
}

function decryptStoredConfig(raw: unknown): Partial<HolocronConfig> {
  if (!isRecord(raw)) return {}
  const copy = structuredClone(raw) as Record<string, unknown>
  for (const pathParts of SENSITIVE_CONFIG_PATHS) {
    const value = getNestedValue(copy, pathParts)
    setNestedValue(copy, pathParts, decryptConfigValue(value))
  }
  return copy as Partial<HolocronConfig>
}

function encryptConfigForDisk(config: HolocronConfig): Record<string, unknown> {
  const copy = structuredClone(config) as unknown as Record<string, unknown>
  for (const pathParts of SENSITIVE_CONFIG_PATHS) {
    const value = getNestedValue(copy, pathParts)
    if (typeof value === 'string') setNestedValue(copy, pathParts, encryptConfigValue(value))
  }
  return copy
}

function writeStoredConfig(config: HolocronConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(encryptConfigForDisk(config), null, 2), 'utf-8')
}

export function loadConfig(): HolocronConfig {
  try {
    const p = getConfigPath()
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as unknown
      const config = deepMerge(DEFAULT_CONFIG, decryptStoredConfig(raw))
      if (configHasPlaintextSecrets(raw) && canUseSafeStorage()) {
        writeStoredConfig(config)
      }
      return config
    }
  } catch { /* fall through */ }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(config: HolocronConfig): void {
  writeStoredConfig(config)
}

/**
 * Returns a copy of `cfg` with `holocronRoot`, `projectsRoot`, and
 * `workspace.path` all pointing at the same folder, and `libraryPath`
 * populated to its default derivation when empty. Historically the three
 * workspace-root keys were distinct (flat-Sessions migration set
 * `projectsRoot` to a sibling of `holocronRoot`; some code reads
 * `workspace.path` as a fallback) and they drifted out of sync — Andy hit
 * this when picking a workspace via Settings → Connections updated only
 * `holocronRoot` while the Domaines backend kept using a stale
 * `projectsRoot` from migration. v14 adds `libraryPath` (the cache root for
 * `_Codex/Wiki/` + `_Codex/Syntheses/` — was `_Library/*` in v14, renamed
 * to `_Codex` in v15); when the user hasn't picked an explicit value, we
 * materialize the sibling-of-Domaines default here so every code path can
 * rely on a real string instead of re-deriving. v15 also heals an existing
 * `libraryPath` still ending in `/_Library` to `/_Codex` so the folder
 * rename takes effect without a manual "Reset" in Settings.
 *
 * The source of truth is:
 *   1. `sourceOfTruth` arg (when explicitly picked, e.g. folder dialog)
 *   2. `holocronRoot` (the Settings → Connections control)
 *   3. `projectsRoot` (legacy)
 *   4. `workspace.path` (legacy fallback)
 *
 * `libraryPath` behavior: if non-empty, preserved as-is (user picked a
 * custom location, typically iCloud Drive) — EXCEPT when the value still
 * ends with `/_Library`, in which case it's healed to `/_Codex` for the
 * v14→v15 folder rename. If empty, populated to `<dirname(root)>/_Codex`
 * so the materialized config has it. The user can clear it from the
 * Settings UI to fall back to the derived value after a root change.
 *
 * Returns the cfg unchanged if all four are already aligned.
 */
export function syncWorkspaceRoots(
  cfg: HolocronConfig,
  sourceOfTruth?: string,
): { config: HolocronConfig; changed: boolean } {
  const root =
    (sourceOfTruth ?? '').trim() ||
    cfg.holocronRoot ||
    cfg.projectsRoot ||
    cfg.workspace?.path ||
    ''

  // v14→v15 transitional heal: a libraryPath ending in `/_Library` (the
  // v14-materialized default) gets flipped to `/_Codex`. A user-set custom
  // libraryPath that doesn't end in `/_Library` is preserved as-is. Empty
  // libraryPath gets the new derivation directly.
  const healedLibrary = healLegacyLibraryPath(cfg.libraryPath)
  const desiredLibrary = healedLibrary || deriveDefaultLibraryPath(root)

  const already =
    cfg.holocronRoot === root &&
    cfg.projectsRoot === root &&
    (cfg.workspace?.path ?? '') === root &&
    cfg.libraryPath === desiredLibrary

  if (already) return { config: cfg, changed: false }

  return {
    config: {
      ...cfg,
      holocronRoot: root,
      projectsRoot: root,
      workspace:   { ...cfg.workspace, path: root },
      libraryPath: desiredLibrary,
    },
    changed: true,
  }
}

/** Transitional: an old libraryPath ending in `/_Library` is healed to
 *  `/_Codex` so the v14→v15 folder rename takes effect without the user
 *  having to click "Reset" in Settings. Returns the input unchanged for
 *  any other value (including empty). One-time check; once the saved
 *  config carries the `/_Codex` value, this is a no-op. */
function healLegacyLibraryPath(libraryPath: string): string {
  if (libraryPath.endsWith('/_Library')) {
    return libraryPath.slice(0, -'_Library'.length) + '_Codex'
  }
  return libraryPath
}

/** Default derivation: `<dirname(root)>/_Codex`. Returns '' when the
 *  root is empty so callers can detect "no library configured" without
 *  matching against a synthetic path. Used by `syncWorkspaceRoots` (to
 *  materialize the default into config on first boot) and by the
 *  Settings UI (to show the derived value when libraryPath is empty).
 *  v15 renamed the folder from `_Library` to `_Codex`; existing configs
 *  with a `/_Library`-ending libraryPath are healed by
 *  `healLegacyLibraryPath` on boot. */
export function deriveDefaultLibraryPath(root: string): string {
  if (!root) return ''
  return path.join(path.dirname(root), '_Codex')
}

/** Resolves the library cache root from config. Reads `libraryPath` when
 *  set; falls back to the sibling-of-Domaines derivation. Returns '' when
 *  no workspace root is configured at all — callers should handle that
 *  gracefully (most disable wiki/synthesis features when no library is
 *  resolvable). Use this in preference to inlining `path.dirname(root)`
 *  computations — those don't pick up the user-configured `libraryPath`. */
export function getLibraryRoot(cfg: HolocronConfig): string {
  if (cfg.libraryPath) return cfg.libraryPath
  const root = cfg.holocronRoot || cfg.projectsRoot || cfg.workspace?.path || ''
  return deriveDefaultLibraryPath(root)
}

/** Resolves the wiki cache directory (`<libraryRoot>/Wiki`). Mirrors the
 *  prior hardcoded `path.join(path.dirname(root), '_Codex', 'Wiki')`
 *  computation in ragWiki/graphQueries/ingestQueries — those callers now
 *  route through here so a user-configured `libraryPath` flows through. */
export function getWikiCacheDir(cfg: HolocronConfig): string {
  const lib = getLibraryRoot(cfg)
  return lib ? path.join(lib, 'Wiki') : ''
}
