import { useState, useEffect } from 'react'
import { useSettingsStore, HolocronConfig, Provider, GEMINI_BASE_URL } from '../../store/settingsStore'
import { useSidebarStore } from '../../store/sidebarStore'

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

function TestButton({ state, onClick }: { state: TestState; onClick: () => void }): JSX.Element {
  const label = state === 'testing' ? '…' : state === 'ok' ? '✓' : state === 'fail' ? '✗' : 'Test'
  const color = state === 'ok' ? '#30d158' : state === 'fail' ? '#ff2d78' : 'var(--text-3)'
  return (
    <button onClick={onClick} style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '4px 12px', color, fontSize: 12, cursor: 'pointer', fontWeight: 600, minWidth: 52 }}>
      {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginBottom: 5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }): JSX.Element {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
      onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
      onBlur={(e) => { e.target.style.borderColor = 'var(--border-1)' }}
    />
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</h3>
      <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '16px' }}>
        {children}
      </div>
    </div>
  )
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'lmstudio', label: 'LM Studio' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'custom', label: 'Custom' },
]

/** Client-side mirror of main/config.ts deriveDefaultLibraryPath. Returns
 *  `<dirname(root)>/_Codex` (sibling of the Domaines root) or '' when no
 *  root is configured. Used to preview the resolved path in the Settings
 *  UI without an extra IPC round-trip. The main process is the source of
 *  truth — this is just for display. macOS-only project, so '/' separator
 *  is safe. v15 renamed the on-disk folder from `_Library` to `_Codex`. */
function deriveLibraryPathClientSide(holocronRoot: string): string {
  if (!holocronRoot) return ''
  const i = holocronRoot.lastIndexOf('/')
  if (i <= 0) return ''
  return holocronRoot.slice(0, i) + '/_Codex'
}

export function ConnectionsTab(): JSX.Element {
  const { config, saveConfig } = useSettingsStore()
  const [aiTest, setAiTest] = useState<TestState>('idle')
  const [honchoTest, setHonchoTest] = useState<TestState>('idle')
  const [fcTest, setFcTest] = useState<TestState>('idle')
  const [dockerStatus, setDockerStatus] = useState<{ database: boolean; redis: boolean; api: boolean; deriver: boolean } | null>(null)
  const [dockerLoading, setDockerLoading] = useState(false)
  const [dockerMsg, setDockerMsg] = useState('')
  const [rootExists, setRootExists] = useState<boolean | null>(null)
  const [libraryExists, setLibraryExists] = useState<boolean | null>(null)

  useEffect(() => {
    window.electronAPI.dockerStatus().then(setDockerStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (!config.holocronRoot) { setRootExists(null); return }
    window.electronAPI.fsExists(config.holocronRoot)
      .then((r) => setRootExists(r.exists && r.isDirectory))
      .catch(() => setRootExists(false))
  }, [config.holocronRoot])

  // Resolved library path = explicit cfg.libraryPath if set, else sibling-
  // of-Domaines derivation (mirrors main/config.ts deriveDefaultLibraryPath).
  // Surfaced as the "current resolved path" string so Andy can verify
  // where wiki + future syntheses cache lives.
  const resolvedLibraryPath = config.libraryPath || deriveLibraryPathClientSide(config.holocronRoot)

  useEffect(() => {
    if (!resolvedLibraryPath) { setLibraryExists(null); return }
    window.electronAPI.fsExists(resolvedLibraryPath)
      .then((r) => setLibraryExists(r.exists && r.isDirectory))
      .catch(() => setLibraryExists(false))
  }, [resolvedLibraryPath])

  const handleChangeRoot = async (): Promise<void> => {
    const folderPath = await window.electronAPI.workspaceBrowse()
    if (!folderPath) return
    // Keep all three workspace-root keys in lockstep — they drifted in the
    // past and Bug 1 fell out of a stale `projectsRoot` while `holocronRoot`
    // was current. Single picker → single value across the board.
    // libraryPath is left alone: an explicit user-set value (e.g. iCloud)
    // should survive a Domaines-root change; empty libraryPath auto-derives
    // from the new root via getLibraryRoot in the main process.
    saveConfig({
      holocronRoot: folderPath,
      projectsRoot: folderPath,
      workspace:    { ...config.workspace, path: folderPath },
    })
    useSidebarStore.getState().initWithPath(folderPath)
  }

  const handleChangeLibraryPath = async (): Promise<void> => {
    const folderPath = await window.electronAPI.workspaceBrowse()
    if (!folderPath) return
    // Just libraryPath — the workspace-root trio is unaffected; users may
    // legitimately want _Codex on iCloud while _Domaines stays local.
    saveConfig({ libraryPath: folderPath })
  }

  const handleResetLibraryPath = (): void => {
    // Clearing to '' falls back to the sibling-of-Domaines derivation
    // resolved by main-process getLibraryRoot.
    saveConfig({ libraryPath: '' })
  }

  const [geminiTest, setGeminiTest] = useState<TestState>('idle')

  const setAi = (partial: Partial<HolocronConfig['ai']>): void =>
    saveConfig({ ai: { ...config.ai, ...partial } })
  const setGemini = (partial: Partial<HolocronConfig['gemini']>): void =>
    saveConfig({ gemini: { ...config.gemini, ...partial } })
  const setAnthropic = (partial: Partial<HolocronConfig['anthropic']>): void =>
    saveConfig({ anthropic: { ...config.anthropic, ...partial } })
  const setHoncho = (partial: Partial<HolocronConfig['honcho']>): void =>
    saveConfig({ honcho: { ...config.honcho, ...partial } })
  const setFirecrawl = (partial: Partial<HolocronConfig['firecrawl']>): void =>
    saveConfig({ firecrawl: { ...config.firecrawl, ...partial } })
  const setTelegram = (partial: Partial<HolocronConfig['telegram']>): void =>
    saveConfig({ telegram: { ...config.telegram, ...partial } })
  const setIcloudPath = (v: string): void => saveConfig({ icloudInboxPath: v })

  const testAi = async (): Promise<void> => {
    setAiTest('testing')
    const r = await window.electronAPI.connectionTestAi(config.ai.baseUrl, config.ai.model, '')
    setAiTest(r.ok ? 'ok' : 'fail')
    setTimeout(() => setAiTest('idle'), 3000)
  }

  const testGemini = async (): Promise<void> => {
    setGeminiTest('testing')
    const r = await window.electronAPI.connectionTestAi(GEMINI_BASE_URL, config.gemini.model, config.gemini.apiKey)
    setGeminiTest(r.ok ? 'ok' : 'fail')
    setTimeout(() => setGeminiTest('idle'), 3000)
  }

  const testHoncho = async (): Promise<void> => {
    setHonchoTest('testing')
    const r = await window.electronAPI.connectionTestHoncho(config.honcho.url)
    setHonchoTest(r.ok ? 'ok' : 'fail')
    setTimeout(() => setHonchoTest('idle'), 3000)
  }

  const testFirecrawl = async (): Promise<void> => {
    setFcTest('testing')
    const r = await window.electronAPI.connectionTestFirecrawl(config.firecrawl.apiKey, config.firecrawl.baseUrl)
    setFcTest(r.ok ? 'ok' : 'fail')
    setTimeout(() => setFcTest('idle'), 3000)
  }

  const handleDockerStart = async (): Promise<void> => {
    setDockerLoading(true); setDockerMsg('')
    const r = await window.electronAPI.dockerStart()
    setDockerMsg(r.ok ? 'Started' : r.output.slice(0, 80))
    const status = await window.electronAPI.dockerStatus()
    setDockerStatus(status)
    setDockerLoading(false)
  }

  const handleDockerStop = async (): Promise<void> => {
    setDockerLoading(true); setDockerMsg('')
    const r = await window.electronAPI.dockerStop()
    setDockerMsg(r.ok ? 'Stopped' : r.output.slice(0, 80))
    const status = await window.electronAPI.dockerStatus()
    setDockerStatus(status)
    setDockerLoading(false)
  }

  const refreshDockerStatus = async (): Promise<void> => {
    const status = await window.electronAPI.dockerStatus()
    setDockerStatus(status)
  }

  const Dot = ({ on }: { on: boolean }): JSX.Element => (
    <span style={{ color: on ? 'var(--accent-green)' : '#ff2d78', fontSize: 16, lineHeight: 1 }}>{on ? '●' : '●'}</span>
  )

  return (
    <div style={{ paddingRight: 4, overflowY: 'auto', maxHeight: '100%' }}>
      <Section title="Agenteryx Root">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              flex: 1, minWidth: 0,
              fontSize: 12, fontFamily: 'monospace',
              color: config.holocronRoot ? 'var(--text-1)' : 'var(--text-4)',
              background: 'var(--bg-0)', border: '1px solid var(--border-1)',
              borderRadius: 6, padding: '7px 10px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={config.holocronRoot || 'No folder selected'}
          >
            {config.holocronRoot || 'No folder selected'}
          </div>
          <button
            onClick={() => void handleChangeRoot()}
            style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            Change Folder
          </button>
        </div>
        {config.holocronRoot && rootExists === false && (
          <p style={{ fontSize: 11, color: '#ff2d78', margin: '10px 0 0' }}>
            ⚠ This folder no longer exists on disk. Choose a new location.
          </p>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '10px 0 0' }}>
          All sessions are stored as subfolders inside this directory. Changing the root does not move or delete your existing folders.
        </p>
      </Section>

      <Section title="Codex Cache">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              flex: 1, minWidth: 0,
              fontSize: 12, fontFamily: 'monospace',
              color: resolvedLibraryPath ? 'var(--text-1)' : 'var(--text-4)',
              background: 'var(--bg-0)', border: '1px solid var(--border-1)',
              borderRadius: 6, padding: '7px 10px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={resolvedLibraryPath || 'Will derive from the Agenteryx Root once set'}
          >
            {resolvedLibraryPath || 'Not configured'}
          </div>
          <button
            onClick={() => void handleChangeLibraryPath()}
            style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            Change Folder
          </button>
          {config.libraryPath && (
            <button
              onClick={handleResetLibraryPath}
              title="Clear the explicit path; falls back to the sibling-of-Domains default"
              style={{ background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}
            >
              Reset
            </button>
          )}
        </div>
        {resolvedLibraryPath && libraryExists === false && (
          <p style={{ fontSize: 11, color: '#ffb84d', margin: '10px 0 0' }}>
            ⚠ This folder doesn't exist yet — it will be created automatically when the first wiki page or synthesis is written.
          </p>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '10px 0 0' }}>
          Holds the wiki cache (<span style={{ fontFamily: 'monospace' }}>Wiki/</span>) and, starting in Session 3, agent-written syntheses (<span style={{ fontFamily: 'monospace' }}>Syntheses/</span>). Defaults to <span style={{ fontFamily: 'monospace' }}>_Codex</span> as a sibling of the Agenteryx Root.
          {!config.libraryPath && config.holocronRoot && (
            <> Currently using the default derivation; click <span style={{ fontWeight: 600 }}>Change Folder</span> to point at iCloud Drive or another location.</>
          )}
        </p>
      </Section>

      <Section title="LM Studio (local)">
        <Field label="Provider Type">
          <select
            value={config.ai.provider}
            onChange={(e) => setAi({ provider: e.target.value as Provider })}
            style={{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-1)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          >
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Base URL">
          <Input value={config.ai.baseUrl} onChange={(v) => setAi({ baseUrl: v })} placeholder="http://127.0.0.1:1234/v1" />
        </Field>
        <Field label="Model Name">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={config.ai.model} onChange={(v) => setAi({ model: v })} placeholder="gemma-4-31b-it" />
            <TestButton state={aiTest} onClick={testAi} />
          </div>
        </Field>
      </Section>

      <Section title="Gemini (cloud)">
        <Field label="Model Name">
          <Input value={config.gemini.model} onChange={(v) => setGemini({ model: v })} placeholder="gemini-2.5-flash" />
        </Field>
        <Field label="API Key">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input type="password" value={config.gemini.apiKey} onChange={(v) => setGemini({ apiKey: v })} placeholder="AIza…" />
            <TestButton state={geminiTest} onClick={testGemini} />
          </div>
        </Field>
        <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '8px 0 0' }}>
          Uses Google's OpenAI-compatible endpoint. Get your key from <span style={{ fontFamily: 'monospace' }}>aistudio.google.com</span>. Common models: <span style={{ fontFamily: 'monospace' }}>gemini-2.5-flash</span>, <span style={{ fontFamily: 'monospace' }}>gemini-2.5-pro</span>.
        </p>
      </Section>

      <Section title="Anthropic Claude (cloud)">
        <Field label="Model Name">
          <Input value={config.anthropic.model} onChange={(v) => setAnthropic({ model: v })} placeholder="claude-sonnet-4-6" />
        </Field>
        <Field label="API Key">
          <Input type="password" value={config.anthropic.apiKey} onChange={(v) => setAnthropic({ apiKey: v })} placeholder="sk-ant-…" />
        </Field>
        <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '8px 0 0' }}>
          Used for synthesis essays and report generation (Phase 3a step 5 wires this end-to-end).
          Get your key from <span style={{ fontFamily: 'monospace' }}>console.anthropic.com</span>.
          Common models: <span style={{ fontFamily: 'monospace' }}>claude-sonnet-4-5</span>, <span style={{ fontFamily: 'monospace' }}>claude-haiku-4-5</span>.
        </p>
      </Section>

      <Section title="Memory (Honcho)">
        <Field label="Honcho URL">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={config.honcho.url} onChange={(v) => setHoncho({ url: v })} placeholder="http://localhost:8000" />
            <TestButton state={honchoTest} onClick={testHoncho} />
          </div>
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--text-1)' }}>Persistent Memory</span>
          <button
            onClick={() => setHoncho({ enabled: !config.honcho.enabled })}
            style={{
              width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative',
              background: config.honcho.enabled ? 'var(--accent-green)' : 'var(--bg-0)',
              transition: 'background 200ms',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: config.honcho.enabled ? 21 : 3,
              width: 20, height: 20, borderRadius: 10, background: '#fff',
              transition: 'left 200ms', display: 'block',
            }} />
          </button>
        </div>
      </Section>

      <Section title="Firecrawl">
        <Field label="API Key">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input type="password" value={config.firecrawl.apiKey} onChange={(v) => setFirecrawl({ apiKey: v })} placeholder="fc-…" />
            <TestButton state={fcTest} onClick={testFirecrawl} />
          </div>
        </Field>
        <Field label="Base URL">
          <Input value={config.firecrawl.baseUrl} onChange={(v) => setFirecrawl({ baseUrl: v })} placeholder="https://api.firecrawl.dev" />
        </Field>
        <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '8px 0 0' }}>When API key is present, enables web research in Research mode.</p>
      </Section>

      {/* Hermes — Telegram bridge + iCloud Drive watcher (architecture-v4 §4.5 §10).
          Both Telegram fields gate bot start; the iCloud watcher runs whenever
          the path is non-empty (and the directory exists). After saving, use
          the Hive → Hermes card's Start/Stop toggle to (re)connect — or just
          restart `npm run dev` and the boot wiring picks them up. */}
      <Section title="Hermes — Telegram + iCloud (Session 5)">
        <Field label="Telegram Bot Token">
          <Input
            type="password"
            value={config.telegram.botToken}
            onChange={(v) => setTelegram({ botToken: v })}
            placeholder="123456789:ABCdef…"
          />
        </Field>
        <Field label="Allowed Telegram User ID">
          <Input
            value={config.telegram.allowedUserId}
            onChange={(v) => setTelegram({ allowedUserId: v.replace(/\D+/g, '') })}
            placeholder="123456789"
          />
        </Field>
        <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '4px 0 12px' }}>
          Create the bot via @BotFather in Telegram. Find your User ID by messaging @userinfobot. Hermes only responds to that single ID — every other sender is ignored silently.
        </p>
        <Field label="iCloud Drive Inbox Path">
          <Input
            value={config.icloudInboxPath}
            onChange={setIcloudPath}
            placeholder="e.g. /Users/you/Library/Mobile Documents/com~apple~CloudDocs/_Agenteryx/Inbox"
          />
        </Field>
        <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '4px 0 0' }}>
          Files dropped into this directory (`.txt`, `.md`, `.pdf`, `.docx`) auto-route to the Foundry triage queue. Leave empty to disable. Leading `~/` expands to your home directory.
        </p>
      </Section>

      <Section title="Docker Services">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 14 }}>
          {(['database', 'redis', 'api', 'deriver'] as const).map((svc) => (
            <div key={svc} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Dot on={dockerStatus?.[svc] ?? false} />
              <span style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{svc}</span>
              <span style={{ fontSize: 11, color: dockerStatus?.[svc] ? 'var(--accent-green)' : 'var(--text-4)' }}>
                {dockerStatus ? (dockerStatus[svc] ? 'Running' : 'Stopped') : '…'}
              </span>
            </div>
          ))}
        </div>
        {dockerMsg && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px', fontFamily: 'monospace' }}>{dockerMsg}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleDockerStart} disabled={dockerLoading} style={{ flex: 1, background: 'var(--accent-green)', color: '#000', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, fontWeight: 600, cursor: dockerLoading ? 'not-allowed' : 'pointer', opacity: dockerLoading ? 0.6 : 1 }}>Start All</button>
          <button onClick={handleDockerStop} disabled={dockerLoading} style={{ flex: 1, background: 'var(--bg-0)', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '7px', fontSize: 12, fontWeight: 600, cursor: dockerLoading ? 'not-allowed' : 'pointer', opacity: dockerLoading ? 0.6 : 1 }}>Stop All</button>
          <button onClick={refreshDockerStatus} style={{ background: 'transparent', color: 'var(--text-4)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>↻</button>
        </div>
      </Section>
    </div>
  )
}
