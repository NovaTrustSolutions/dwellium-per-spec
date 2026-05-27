import { useSettingsStore } from '../store/settingsStore'
import { useSidebarStore } from '../store/sidebarStore'
import { useScribeStore } from '../store/scribeStore'
import { useSessionStore } from '../store/sessionStore'
import { useDomainesStore } from '../store/domainesStore'

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'thread'

/**
 * Trim a memory summary to a single orienting paragraph for the system
 * prompt. Pre-fix we loaded all 5 most-recent summaries verbatim into every
 * request, which left context at 62% post-compression. Now: at most one
 * summary, capped at ~400 chars or the first paragraph break. Honest
 * "directional" truncation — full text stays on disk in the Memory file.
 */
export function trimSummaryForPrompt(raw: string): string {
  const CAP = 400
  if (!raw) return ''
  // Strip the leading "[reset 2026-05-13]\n" header that loadThread used to
  // prepend — it's noise inside the prompt; the orienting note shouldn't
  // re-stamp the same date the agent doesn't need.
  const stripped = raw.replace(/^\[[^\]]+\]\s*\n?/, '').trim()
  // Prefer the first paragraph if it ends within the cap.
  const firstBreak = stripped.indexOf('\n\n')
  if (firstBreak > 0 && firstBreak <= CAP) return stripped.slice(0, firstBreak).trim()
  if (stripped.length <= CAP) return stripped
  // Cut on a sentence boundary if one is near the cap.
  const slice = stripped.slice(0, CAP)
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (lastStop > CAP - 120) return slice.slice(0, lastStop + 1).trim() + ' …'
  return slice.trim() + ' …'
}

// Module-level dedupe for the Dreaming Agent's first-load query. We fire
// honchoDream at most once per app launch per thread — switching threads
// repeatedly during a session should NOT re-query Honcho's /chat endpoint
// (it's a non-trivial call). Cleared on full app restart.
//
// Attached to `window` so Vite's HMR doesn't reset it on file saves. A
// plain module-level `new Set<string>()` gets re-evaluated when this
// module hot-reloads in dev — which made every dev-mode thread switch
// re-fire a dream because the Set was empty again. Production builds
// (no HMR) behaved correctly all along; this fix targets the dev-mode
// false-positive. The window-attached singleton outlives any file save.
declare global {
  interface Window {
    __holocronDreamFired__?: Set<string>
  }
}
const dreamFiredThisLaunch: Set<string> =
  (typeof window !== 'undefined'
    ? (window.__holocronDreamFired__ ??= new Set<string>())
    : new Set<string>())

/**
 * Fire-and-forget Dreaming Agent trigger. Used by loadThread() (first thread
 * load of the session) and by the Memory panel's manual "Dream now" button.
 *
 * Session 3 behaviour: the main-process `honchoDream` IPC now prefers the
 * `schedule_dream` endpoint (returns 204, async server-side processing) over
 * the dialectic `/chat` path. When `schedule_dream` succeeds the result is
 * `{ ok: true, mode: 'scheduled' }` with no synchronous insight — we don't
 * write anything to `dreamInsights[]` in that case (the insight will arrive
 * when the server's dream pool produces one — currently not surfaced; future
 * work). When `schedule_dream` is unavailable, the IPC falls back to `/chat`
 * and returns `{ ok: true, mode: 'sync', insight: string }` — same Session 2
 * behaviour as before, and we DO persist the insight.
 *
 * Returns:
 *   - `{ ok: true, mode: 'sync', insight }` → wrote to dreamInsights[]
 *   - `{ ok: true, mode: 'scheduled' }` → server-side dream in flight
 *   - `{ ok: false }` → trigger failed; nothing happened
 */
export type DreamOnceResult =
  | { ok: true; mode: 'scheduled' }
  | { ok: true; mode: 'sync'; insight: string }
  | { ok: false }

export async function dreamOnce(
  threadPath: string,
  projectName: string,
  threadName: string,
  sessionId: string,
  trigger: 'thread_load' | 'manual' | 'branch',
  opts?: { force?: boolean },
): Promise<DreamOnceResult> {
  const key = `${threadPath}::${threadName}`
  if (!opts?.force && trigger === 'thread_load' && dreamFiredThisLaunch.has(key)) {
    return { ok: false }
  }
  dreamFiredThisLaunch.add(key)

  // Resolve Domain name via cached Domaines store (cheap; no IPC).
  const settings = useSettingsStore.getState().config
  const domStore = useDomainesStore.getState()
  await domStore.loadIfNeeded().catch(() => { /* non-fatal */ })
  const domaine = useDomainesStore.getState().domaines.find((d) => d.id === settings.activeDomaineId) ?? null
  const domaineName = domaine?.name ?? null

  try {
    const result = await window.electronAPI.honchoDream(sessionId, { threadName, projectName, domaineName })
    if (!result.ok) {
      console.warn(`[Dream] honchoDream failed (${trigger}):`, result.error ?? '(no error)')
      return { ok: false }
    }
    if (result.mode === 'scheduled') {
      console.log(`[Dream] ${trigger} scheduled for ${threadName} (no synchronous insight to persist)`)
      return { ok: true, mode: 'scheduled' }
    }
    // mode === 'sync' — persist the immediate insight.
    await window.electronAPI
      .threadAppendDreamInsight(threadPath, projectName, threadName, trigger, result.insight)
      .catch((err) => console.warn('[Dream] append failed:', err))
    console.log(`[Dream] ${trigger} insight stored for ${threadName} (${result.insight.length} chars, sync)`)
    return { ok: true, mode: 'sync', insight: result.insight }
  } catch (err) {
    console.warn('[Dream] fire-and-forget failed (degrading):', (err as Error).message)
    return { ok: false }
  }
}

/**
 * Single source of truth for "open a thread" — used by Projects tab, footer
 * thread switcher, and the chat panel's "+ New Thread" warning. Mirrors
 * activeProject/Thread fields, mirrors back-compat session fields, points
 * the sidebar + workspace at the thread folder, and binds Honcho.
 */
export async function loadThread(
  projectName: string,
  projectPath: string,
  threadName: string,
  threadPath: string,
  domaineId?: string,
): Promise<void> {
  await window.electronAPI.threadsLoad(projectName, projectPath, threadName, threadPath)

  const threadSlug = slug(threadName)
  useSettingsStore.getState().saveConfig({
    activeProjectName: projectName,
    activeProjectPath: projectPath,
    activeThreadName: threadName,
    activeThreadPath: threadPath,
    activeSessionId: threadSlug,
    activeSessionName: threadName,
    workspace: { path: threadPath },
    // When the caller knows which Domaine this thread lives under (e.g. the
    // header thread-picker or Codex Search → Open in Scribe), keep
    // activeDomaineId in lockstep with activeProject/Thread*. Older callers
    // omit the arg and leave it untouched.
    ...(domaineId ? { activeDomaineId: domaineId } : {}),
  })

  useSidebarStore.getState().initWithPath(threadPath)

  // Bind Honcho via thread.json (idempotent — uses existing ID if already bound).
  const bound = await window.electronAPI
    .threadBindHoncho(threadPath, threadName, projectName)
    .catch(() => null)

  if (bound?.ok && bound.sessionId) {
    useScribeStore.getState().setHonchoCtx({ sessionId: bound.sessionId })

    // Restore this thread's chat history from Honcho.
    try {
      const messages = await window.electronAPI.honchoGetMessages(bound.sessionId)
      const restored = messages.map((m) => ({
        id: crypto.randomUUID(),
        role: m.role,
        content: m.content,
      }))
      useScribeStore.getState().setChatHistory(restored)
      console.log(`[Thread] Restored ${restored.length} messages for ${threadName}`)
      // ChatDiag: roles + sizes so we can spot duplication, ordering breaks,
      // or oversized content blobs. If alternation breaks (e.g. user→user)
      // that's a Honcho ingest bug. If a single message is >50k chars,
      // something is wrong upstream.
      const rolePattern = restored.map((m) => m.role[0]).join('')
      const totalChars = restored.reduce((sum, m) => sum + m.content.length, 0)
      const oversized = restored.filter((m) => m.content.length > 5000)
      console.log(`[ChatDiag] thread-load roles="${rolePattern}" totalChars=${totalChars} oversized=${oversized.length}`)
      if (restored.length > 0) {
        const first = restored[0]
        const last = restored[restored.length - 1]
        console.log(`[ChatDiag] thread-load first(${first.role}, ${first.content.length}c): ${JSON.stringify(first.content.slice(0, 120))}`)
        console.log(`[ChatDiag] thread-load last(${last.role}, ${last.content.length}c): ${JSON.stringify(last.content.slice(0, 120))}`)
      }
    } catch (err) {
      console.error('[Thread] history restore failed:', err)
      useScribeStore.getState().setChatHistory([])
    }
  } else {
    // Bind failed or Honcho disabled — start with empty chat for this thread.
    useScribeStore.getState().setChatHistory([])
    useScribeStore.getState().setHonchoCtx(null)
  }

  // Memory file: read the latest summary as a single orienting paragraph
  // (≤400 chars) for the system prompt, plus the resolved path so the
  // agent can cite the file on demand. All older summaries stay on disk —
  // they are NOT loaded eagerly. This is the fix for the 62%-after-compress
  // bug: dumping 5 verbatim summaries into every request defeated the
  // compression they came from. Honcho holds memory server-side; we surface
  // a brief hook + a path, and rely on Honcho retrieval for the rest.
  try {
    const memResult = await window.electronAPI.threadReadMemoryFile(threadPath, projectName, threadName)
    if (memResult?.filePath) {
      useScribeStore.getState().setMemoryFilePath(memResult.filePath)
    } else {
      useScribeStore.getState().setMemoryFilePath('')
    }
    const summaries = memResult?.memoryFile?.summaries ?? []
    if (summaries.length > 0) {
      const latest = summaries[summaries.length - 1]
      const brief = trimSummaryForPrompt(latest.summary)
      useScribeStore.getState().setSessionSummaries(brief ? [brief] : [])
      useScribeStore.getState().setMemoryHasSummaries(true)
      console.log(`[Thread] Loaded 1 brief summary (${brief.length}c) — ${summaries.length - 1} older summaries remain on disk only`)
      console.log(`[ChatDiag] memory-load summaries-on-disk=${summaries.length} loaded-into-context=1 briefChars=${brief.length}`)
    } else {
      useScribeStore.getState().setSessionSummaries([])
      useScribeStore.getState().setMemoryHasSummaries(false)
    }
  } catch (err) {
    console.error('[Thread] memory load failed:', err)
    useScribeStore.getState().setSessionSummaries([])
    useScribeStore.getState().setMemoryHasSummaries(false)
    useScribeStore.getState().setMemoryFilePath('')
  }

  // Dreaming Agent: fire once per (thread, app-launch). Runs fire-and-forget
  // after Honcho is bound — chat history restoration already completed above.
  // The fn itself dedupes via a module-level Set, so calling on every thread
  // load is safe (it'll no-op for threads already queried this launch).
  if (useScribeStore.getState().honchoCtx?.sessionId) {
    const sessionId = useScribeStore.getState().honchoCtx?.sessionId ?? ''
    if (sessionId) {
      void dreamOnce(threadPath, projectName, threadName, sessionId, 'thread_load')
    }
  }

  // P3-C: one-time intake prompt for never-prompted threads, gated by user setting.
  const settings = useSettingsStore.getState().config
  if (settings.intake?.showPromptOnNewThread !== false) {
    const meta = await window.electronAPI.threadReadMeta(threadPath).catch(() => null)
    if (meta && !meta.intakePromptShown) {
      useSessionStore.getState().setPendingIntakeForThread({
        projectName, threadName, threadPath,
      })
    }
  }
}

/**
 * Best-effort active-context switch from a document's file path. Used by
 * the Codex Search → "Open in Scribe" flow so opening a doc from another
 * thread also moves the user's active Domaine/Project/Thread to that doc's
 * home, not just opening the file in Scribe.
 *
 * Returns false when:
 *  - projectsRoot isn't configured
 *  - the source path lives outside projectsRoot (bridge docs: wiki, library,
 *    inbox); these have no thread to switch to
 *  - the path doesn't have at least three nested segments under projectsRoot
 *    (domaine/project/thread/...)
 *  - the Domaine name in the path can't be resolved to a known domaine id
 *
 * Falls back gracefully in those cases — the caller still opens the file.
 */
export async function loadThreadForPath(sourcePath: string): Promise<boolean> {
  const cfg = useSettingsStore.getState().config
  const projectsRoot = cfg.projectsRoot
  if (!projectsRoot) return false

  const rootPrefix = projectsRoot.endsWith('/') ? projectsRoot : projectsRoot + '/'
  if (!sourcePath.startsWith(rootPrefix)) return false

  const segments = sourcePath.slice(rootPrefix.length).split('/').filter(Boolean)
  if (segments.length < 3) return false

  const [domaineName, projectName, threadName] = segments

  // Resolve domaineId via the cached domaine list. loadIfNeeded is idempotent —
  // safe to call here so a cold-start "Open in Scribe" still works.
  const domStore = useDomainesStore.getState()
  await domStore.loadIfNeeded()
  const domaine = useDomainesStore.getState().domaines.find((d) => d.name === domaineName)
  if (!domaine) return false

  const projectPath = `${rootPrefix}${domaineName}/${projectName}`
  const threadPath  = `${projectPath}/${threadName}`

  await loadThread(projectName, projectPath, threadName, threadPath, domaine.id)
  return true
}
