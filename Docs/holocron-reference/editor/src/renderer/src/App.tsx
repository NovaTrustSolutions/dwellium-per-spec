import { useEffect, useRef } from 'react'
import { Shell } from './components/layout/Shell'
import { SettingsModal } from './components/settings/SettingsModal'
import { StartupModal } from './components/layout/StartupModal'
import { IntakeModal } from './components/layout/IntakeModal'
import { useSettingsStore } from './store/settingsStore'
import { useSessionStore } from './store/sessionStore'
import { applyTheme } from './themes'
import { loadThread } from './utils/threadActions'
import { applyEditorThemeToAllViews } from './components/scribe/markdownConfig'
import { resolveTheme, type ScribeColorTheme } from './components/scribe/scribeThemes'

export function App(): JSX.Element {
  const { loadConfig, config, loaded } = useSettingsStore()
  const { showStartupModal } = useSessionStore()
  const restoredOnce = useRef(false)

  useEffect(() => {
    loadConfig().catch(() => {})
  }, [])

  useEffect(() => {
    if (loaded) applyTheme(config.appearance.theme)
  }, [config.appearance.theme, loaded])

  // Apply the active editor color theme to all registered CodeMirror views.
  // Runs on every config change to editorTheme.activeName / customs — covers
  // initial load (default preset until config arrives), preset switching,
  // custom-theme creation/deletion, and any color edit (which mutates the
  // active custom and triggers this effect).
  useEffect(() => {
    if (!loaded) return
    const customs = config.editorTheme.customs as Record<string, ScribeColorTheme>
    const theme = resolveTheme(config.editorTheme.activeName, customs)
    applyEditorThemeToAllViews(theme)
  }, [loaded, config.editorTheme.activeName, config.editorTheme.customs])

  useEffect(() => {
    if (loaded && !config.holocronRoot) {
      useSessionStore.getState().setShowStartupModal(true)
    }
  }, [loaded, config.holocronRoot])

  // P1-B: restore the active thread on first launch — binds Honcho + reloads chat history.
  useEffect(() => {
    if (!loaded || restoredOnce.current) return
    if (!config.activeThreadPath || !config.activeThreadName) return
    restoredOnce.current = true
    void loadThread(
      config.activeProjectName,
      config.activeProjectPath,
      config.activeThreadName,
      config.activeThreadPath,
    )
  }, [loaded, config.activeThreadPath, config.activeThreadName, config.activeProjectName, config.activeProjectPath])

  return (
    <>
      <Shell />
      <SettingsModal />
      {showStartupModal && <StartupModal />}
      <IntakeModal />
    </>
  )
}
