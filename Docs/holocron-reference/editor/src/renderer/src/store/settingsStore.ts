import { create } from 'zustand'

export type ThemeId = 'holocron-dark' | 'tokyo-night' | 'dracula' | 'nord' | 'solarized-dark' | 'light' | 'midnight-blue' | 'fey'
export type AppMode = 'main' | 'sandbox' | 'research'
export type Provider = 'lmstudio' | 'ollama' | 'openai' | 'anthropic' | 'custom'
export type ActiveProvider = 'lmstudio' | 'gemini' | 'anthropic'
export type CrossThreadMode = 'always-ask' | 'free' | 'current-only'

// Gemini uses an OpenAI-compatible endpoint, so the existing lm:start handler
// works without changes — only the URL/key/model differ from LM Studio.
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

// Anthropic native REST endpoint. Used by the main-process anthropicAdapter
// in llmClient.ts; surfaced here so the renderer's IPC payload carries the
// right baseUrl when activeProvider === 'anthropic'.
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'

export interface HolocronConfig {
  ai: {
    provider: Provider
    baseUrl: string
    model: string
    temperature: number
    maxTokens: number
    contextWindow: number
  }
  // Second provider — Gemini via OpenAI-compatible endpoint. Both configs are
  // stored persistently; `activeProvider` flips which one the chat uses.
  gemini: {
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
    contextWindow: number
  }
  // Third provider — Anthropic Claude. Wired in Phase 3a step 5; the key
  // field is here ahead of time so the user can configure it whenever ready.
  anthropic: {
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
    contextWindow: number
  }
  activeProvider: ActiveProvider
  honcho: { url: string; enabled: boolean; token: string }
  firecrawl: { apiKey: string; baseUrl: string }
  /** Hermes Telegram relay (architecture-v4 §4.5 §10 — Session 5). Both
   *  fields gate bot start: if either is empty, Hermes stays dormant.
   *  `allowedUserId` is a stringified numeric Telegram user-ID. */
  telegram: { botToken: string; allowedUserId: string }
  /** iCloud Drive inbox path (architecture-v4 §10.1). Empty = watcher
   *  disabled; non-empty = chokidar polling watcher routes new files
   *  into the Foundry triage queue. Leading `~/` expands to $HOME. */
  icloudInboxPath: string
  appearance: { theme: ThemeId }
  agent: { userName: string; agentName: string; systemPrompt: string }
  holocronRoot: string
  /** Library cache root — see main/config.ts HolocronConfig.libraryPath
   *  for the full doc. Empty = derive at use site (sibling of
   *  holocronRoot named `_Codex`); explicit = user picked a custom
   *  location (typically iCloud Drive). Surfaced in Settings → Connections
   *  as "Codex Cache" so Andy can confirm the resolved path. The config
   *  key name stays `libraryPath` for source-stability; only the on-disk
   *  folder name and the user-facing label changed in v15. */
  libraryPath: string
  activeSessionId: string
  activeSessionName: string
  // Projects/Threads model
  projectsRoot: string
  activeProjectName: string
  activeProjectPath: string
  activeThreadName: string
  activeThreadPath: string
  // Last Domaine the user drilled into. Empty string = at Domaines index.
  // Restored on launch.
  activeDomaineId: string
  workspace: { path: string }
  mode: AppMode
  crossThreadMode: CrossThreadMode
  intake: { showPromptOnNewThread: boolean }
  // Editor color theme — separate axis from appearance.theme. Customizes
  // CodeMirror syntax highlighting only. See architecture-v2.md
  // §"Planned: Editor Enhancements — Feature 1".
  editorTheme: {
    activeName: string
    customs: Record<string, { name: string; isCustom: boolean; tokens: Record<string, string> }>
  }
}

export interface DockerStatus {
  database: boolean
  redis: boolean
  api: boolean
  deriver: boolean
}

export const DEFAULT_CONFIG: HolocronConfig = {
  ai: {
    provider: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'gemma-4-31b-it',
    temperature: 0.7,
    maxTokens: 1024,
    contextWindow: 8192,
  },
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
  activeProvider: 'lmstudio',
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
  editorTheme: { activeName: 'holocron-default', customs: {} },
}

/**
 * Tabs that callers can deep-link to via `openSettingsAt`. Kept as a string
 * union here (not imported from SettingsModal.tsx) so the store has no
 * dependency on a component. SettingsModal initialises its local activeTab
 * from this when the modal opens, then clears the field.
 */
export type SettingsTabId = 'general' | 'connections' | 'modes' | 'appearance' | 'scribe' | 'agent' | 'maintenance'

interface SettingsState {
  config: HolocronConfig
  loaded: boolean
  settingsOpen: boolean
  /** When non-null, SettingsModal opens with this tab active and immediately
   *  clears the field. Lets distant surfaces (e.g. MemoryPanel's
   *  "Nuclear resets → Settings → Maintenance" link) deep-link without
   *  hoisting activeTab state up. */
  settingsInitialTab: SettingsTabId | null
  loadConfig: () => Promise<void>
  saveConfig: (partial: Partial<HolocronConfig>) => void
  setSettingsOpen: (open: boolean) => void
  /** Open the modal landing on a specific tab. */
  openSettingsAt: (tab: SettingsTabId) => void
  /** Called by SettingsModal once it has consumed `settingsInitialTab`. */
  clearSettingsInitialTab: () => void
  setMode: (mode: AppMode) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: DEFAULT_CONFIG,
  loaded: false,
  settingsOpen: false,
  settingsInitialTab: null,

  loadConfig: async () => {
    try {
      const cfg = await window.electronAPI.configLoad()
      // Merge with defaults so configs written before new keys (gemini,
      // activeProvider) existed don't end up with `undefined` fields.
      const merged: HolocronConfig = {
        ...DEFAULT_CONFIG,
        ...cfg,
        ai: { ...DEFAULT_CONFIG.ai, ...(cfg as Partial<HolocronConfig>).ai },
        gemini: { ...DEFAULT_CONFIG.gemini, ...(cfg as Partial<HolocronConfig>).gemini },
        anthropic: { ...DEFAULT_CONFIG.anthropic, ...(cfg as Partial<HolocronConfig>).anthropic },
        telegram: { ...DEFAULT_CONFIG.telegram, ...(cfg as Partial<HolocronConfig>).telegram },
        editorTheme: {
          ...DEFAULT_CONFIG.editorTheme,
          ...(cfg as Partial<HolocronConfig>).editorTheme,
        },
      }
      set({ config: merged, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  saveConfig: (partial) => {
    const next = { ...get().config, ...partial }
    set({ config: next })
    window.electronAPI.configSave(next).catch(() => {})
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  openSettingsAt: (tab) => set({ settingsOpen: true, settingsInitialTab: tab }),
  clearSettingsInitialTab: () => set({ settingsInitialTab: null }),

  setMode: (mode) => {
    const next = { ...get().config, mode }
    set({ config: next })
    window.electronAPI.configSave(next).catch(() => {})
  },
}))
