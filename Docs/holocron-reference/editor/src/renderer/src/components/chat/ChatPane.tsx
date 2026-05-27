import { useState, useRef, useEffect, useCallback } from 'react'
import type { KeyboardEvent, ChangeEvent } from 'react'
import { useScribeStore } from '../../store/scribeStore'
import { useSettingsStore, GEMINI_BASE_URL, ANTHROPIC_BASE_URL } from '../../store/settingsStore'
import { ChatMessage } from './ChatMessage'
import { useLMStream } from './useLMStream'
import { SessionDrawer } from './SessionDrawer'
import { ModelSelector } from './ModelSelector'
import { IconSettings, IconPanelLeft } from '../Icons'
import { loadThread, trimSummaryForPrompt } from '../../utils/threadActions'

const MAX_TEXTAREA_HEIGHT = 200

function getBarColor(pct: number): string {
  if (pct > 80) return 'var(--accent-pink)'
  if (pct > 60) return 'var(--accent-orange)'
  return 'var(--accent-green)'
}

const WRITE_KEYWORDS_RE = /\b(save|write|generate|create|draft|document|report)\b/i

function deriveFilename(content: string): string {
  const match = content.match(/^#{1,3}\s+(.+)/m)
  const title = match?.[1]?.trim() ?? 'document'
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) + '.md'
}

/**
 * Session 8 Part B — `onToggleCollapsed` lifted from Shell via prop so the
 * chat-collapse button can live in ChatPane's sub-header next to ⚙ per
 * HANDOFF_v20 §3.7. When chat is collapsed (width:0 wrapper in Shell), the
 * ChatPane is invisible and unreachable — the re-expand affordance is the
 * ChatReExpandStrip rendered by Shell itself as a sibling of this pane.
 */
interface ChatPaneProps {
  onToggleCollapsed: () => void
}

export function ChatPane({ onToggleCollapsed }: ChatPaneProps): JSX.Element {
  const {
    chatHistory, isStreaming, pendingChatInput, setPendingChatInput, pendingChatPill, setPendingChatPill,
    clearChatHistory,
    honchoCtx, setHonchoCtx, sessionSummaries, memoryHasSummaries,
    activeFilePath, commentsByFile, redlines, fileContents,
  } = useScribeStore()

  // Count unresolved comments on the currently active file — drives the
  // contextual "Address all comments" button next to the chat input.
  const unresolvedCount = activeFilePath
    ? (commentsByFile[activeFilePath] ?? []).filter((c) => !c.resolved).length
    : 0
  // While there are pending redlines on the active file, the user has
  // already asked for a pass — hide the button until they accept/reject so
  // we don't double-send.
  const hasPendingRedlines = activeFilePath
    ? redlines.some((r) => r.filePath === activeFilePath && r.state === 'pending')
    : false
  const showAddressAllButton = unresolvedCount > 0 && !hasPendingRedlines
  const { config } = useSettingsStore()
  const { mode, honcho, firecrawl, ai, gemini, anthropic, activeProvider } = config
  // Session 7 second-pass Item 4 — `tokenCount` (streaming-chunk count from
  // useLMStream) is no longer surfaced anywhere; the Working Memory panel +
  // honest context bar replaced it. If you need it back for debugging,
  // re-destructure here.
  const { sendMessage, abortStream } = useLMStream()
  const [input, setInput] = useState('')
  const [attachedRefs, setAttachedRefs] = useState<Array<{ id: string; name: string; path: string; isDir: boolean; agentText?: string }>>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  // Session 8 / Part A — single ⚙ drawer replaces the prior `memoryPanelOpen`
  // toggle, the `workingMemoryExpanded` toggle, the ModelSelector pill, and
  // the ⟲ Reset button. All session-scoped controls consolidate inside
  // `SessionDrawer` per architecture-v4 Part 14 / HANDOFF_v20 §3.1.
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false)
  // `sessionStartTs` tracks when the current chat session started for the
  // Working Memory duration display (now inside the drawer's Session section);
  // initialized on the first message after a reset, cleared when chatHistory
  // empties (Reset Context).
  const [sessionStartTs, setSessionStartTs] = useState<number | null>(null)
  // contextWarningDismissed = user clicked "Later" on the compress prompt.
  // Re-armed by (a) thread change, (b) bar drops back below 80 (the next
  // threshold crossing). Per spec: don't nag while they keep chatting past 80.
  const [contextWarningDismissed, setContextWarningDismissed] = useState(false)
  const [autoCompressBusy, setAutoCompressBusy] = useState(false)
  const [autoCompressError, setAutoCompressError] = useState<string | null>(null)
  const [showQuickThreadCreate, setShowQuickThreadCreate] = useState(false)
  const [quickThreadName, setQuickThreadName] = useState('')
  const [quickThreadBusy, setQuickThreadBusy] = useState(false)
  const dragCounterRef = useRef(0)
  const listEndRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Firecrawl web search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const hasFirecrawl = !!firecrawl.apiKey

  // Agent save feedback
  const [agentSaved, setAgentSaved] = useState<string | null>(null)

  // Side-effects when chat mode toggles. Thread history is loaded by loadThread()
  // (utils/threadActions.ts) — never here. This effect only handles the cases
  // where chat is decoupled from a thread (sandbox / honcho disabled / research).
  useEffect(() => {
    if (mode === 'sandbox' || !honcho.enabled) {
      setHonchoCtx(null)
      return
    }
    if (mode === 'research') {
      // Research mode is throwaway — fresh ephemeral Honcho session.
      window.electronAPI.honchoNewSession()
        .then((newId) => { if (newId) setHonchoCtx({ sessionId: newId }) })
        .catch(() => {})
      return
    }
    // mode === 'main': honchoCtx is owned by loadThread(); leave it alone.
  }, [mode, honcho.enabled, setHonchoCtx])

  // Before-quit: signal ready immediately
  useEffect(() => {
    const removeListener = window.electronAPI.onBeforeQuit(() => {
      window.electronAPI.signalQuitReady()
    })
    return removeListener
  }, [])

  const resetHeight = useCallback(() => {
    if (textareaRef.current) textareaRef.current.style.height = '44px'
  }, [])

  const expandHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // Track whether the chat scroll container is parked at the bottom. Drives
  // visibility of the floating ↓ button. Threshold = 24px to forgive sub-
  // pixel rounding and the bottom padding inside the container.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const onScroll = (): void => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setIsAtBottom(distanceFromBottom < 24)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [chatHistory.length])

  const scrollChatToBottom = (): void => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Session 7 second-pass Item 4 — track when the current chat session
  // began so the Working Memory panel can show its duration. Initialize
  // on the transition from empty → non-empty (first message of a session),
  // clear when chatHistory empties (Reset Context). ChatMessage doesn't
  // carry timestamps so we record it locally instead of pulling from msg[0].
  useEffect(() => {
    if (chatHistory.length === 0) {
      if (sessionStartTs !== null) setSessionStartTs(null)
    } else if (sessionStartTs === null) {
      setSessionStartTs(Date.now())
    }
  }, [chatHistory.length, sessionStartTs])

  useEffect(() => {
    if (pendingChatInput == null) return
    setInput(pendingChatInput)
    setPendingChatInput(null)
    requestAnimationFrame(() => {
      expandHeight()
      textareaRef.current?.focus()
      const el = textareaRef.current
      if (el) el.selectionStart = el.selectionEnd = el.value.length
    })
  }, [pendingChatInput, setPendingChatInput, expandHeight])

  // Reset the 80% context warning whenever the active thread changes.
  useEffect(() => {
    setContextWarningDismissed(false)
    setShowQuickThreadCreate(false)
    setAutoCompressError(null)
  }, [config.activeThreadPath])

  useEffect(() => {
    if (!pendingChatPill) return
    setAttachedRefs((prev) => [
      ...prev,
      { id: pendingChatPill.id, name: pendingChatPill.displayLabel, path: '', isDir: false, agentText: pendingChatPill.agentText },
    ])
    setPendingChatPill(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [pendingChatPill, setPendingChatPill])

  // (Session 9 audit) — the standalone `handleChange` helper was unused;
  // the textarea wires `onChange={(e) => setInput(e.target.value)}` inline
  // at the input row. Removed to drop the dead binding.

  const appendFileReference = (name: string, path: string, isDir: boolean): void => {
    setAttachedRefs((prev) => [...prev, { id: crypto.randomUUID(), name, path, isDir }])
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handlePanelDragEnter = (): void => {
    dragCounterRef.current++
    setIsDragOver(true)
  }

  const handlePanelDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handlePanelDragLeave = (): void => {
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }

  const handlePanelDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)

    // Sidebar drag: custom data takes priority (includes isDirectory flag)
    const holocronRaw = e.dataTransfer.getData('application/x-holocron-path')
    if (holocronRaw) {
      try {
        const { name, path, isDirectory } = JSON.parse(holocronRaw) as { name: string; path: string; isDirectory: boolean }
        appendFileReference(name, path, isDirectory)
      } catch { /* ignore malformed */ }
      return
    }

    // Finder drag: use items API for isDirectory detection
    const items = Array.from(e.dataTransfer.items)
    for (const item of items) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (!file) continue
      const path = (file as File & { path: string }).path
      if (!path) continue
      const isDir = item.webkitGetAsEntry()?.isDirectory ?? false
      appendFileReference(file.name, path, isDir)
    }
  }

  const handleQuickThreadOpen = (): void => {
    const suggested = config.activeThreadName ? `${config.activeThreadName} - continued` : ''
    setQuickThreadName(suggested)
    setShowQuickThreadCreate(true)
  }

  const handleQuickThreadCreate = async (): Promise<void> => {
    const name = quickThreadName.trim()
    if (!name || quickThreadBusy) return
    if (!config.activeProjectPath || !config.activeThreadPath) return
    setQuickThreadBusy(true)
    try {
      // Branch: fetches predecessor's summary + last 5 messages, writes thread.json
      // with continuedFrom + inheritedContext, writes Memory file, binds new Honcho session.
      const result = await window.electronAPI.threadBranch(
        config.activeProjectPath,
        name,
        config.activeThreadPath,
      )
      if (!result.ok) { setQuickThreadBusy(false); return }
      await loadThread(config.activeProjectName, config.activeProjectPath, name, result.path)
      // loadThread restores chat history; for a brand-new branch this is empty,
      // and the inherited context is surfaced via the system prompt.
      setShowQuickThreadCreate(false)
      setContextWarningDismissed(true)
      setQuickThreadName('')
    } finally {
      setQuickThreadBusy(false)
    }
  }

  const buildAgentMessage = async (text: string, refs: typeof attachedRefs): Promise<string> => {
    if (refs.length === 0) return text
    const parts = text ? [text] : []
    for (const ref of refs) {
      if (ref.agentText) {
        parts.push(`\n${ref.agentText}`)
      } else if (ref.isDir) {
        try {
          const entries = await window.electronAPI.fsReaddir(ref.path)
          const lines = entries.map((e) => `  ${e.type === 'dir' ? '📁' : '📄'} ${e.name}`).join('\n')
          parts.push(`\n--- Attached Folder: ${ref.name} ---\nPath: ${ref.path}\nContents:\n${lines}\n---`)
        } catch {
          parts.push(`\n--- Attached Folder: ${ref.name} ---\nPath: ${ref.path}\n---`)
        }
      } else {
        try {
          const result = await window.electronAPI.readFile(ref.path)
          parts.push(`\n--- Attached File: ${ref.name} ---\n${result.content}\n---`)
        } catch {
          parts.push(`\n--- Attached File: ${ref.name} ---\nPath: ${ref.path}\n---`)
        }
      }
    }
    return parts.join('\n')
  }

  const handleSend = async (presetText?: string, opts?: { silent?: boolean }): Promise<void> => {
    // When called with a preset (e.g. the "Address all comments" button), we
    // ignore whatever's in the input box and skip clearing it — the user may
    // still have a draft they don't want to lose. Refs are also bypassed.
    const usingPreset = presetText !== undefined
    const silent = opts?.silent === true
    const text = (usingPreset ? presetText : input).trim()
    const refs = usingPreset ? [] : attachedRefs
    if ((!text && refs.length === 0) || isStreaming) return

    if (!usingPreset) {
      setInput('')
      setAttachedRefs([])
      resetHeight()
    }

    // Display version: clean text + icon+name lines for each ref (shown in bubble)
    const refLabel = (r: typeof refs[0]): string =>
      r.agentText != null ? r.name : `${r.isDir ? '📁' : '📄'} ${r.name}`
    const refLabels = refs.map((r) => `\`${refLabel(r)}\``).join('  ')
    const displayText = [text, refLabels].filter(Boolean).join('\n\n')

    // Agent version: full context with file contents
    const agentText = await buildAgentMessage(text, refs)

    const sessionId = honchoCtx?.sessionId ?? null
    const saveEnabled = !!sessionId && honcho.enabled && mode !== 'sandbox' && !silent

    if (saveEnabled) {
      console.log('[ChatPane] saving user message to Honcho, session:', sessionId)
      await window.electronAPI.honchoSaveMessage(sessionId, 'andy', displayText).catch((err) => {
        console.error('[ChatPane] user save failed:', err)
      })
    }

    const userHasWriteKeyword = WRITE_KEYWORDS_RE.test(text)

    sendMessage(
      agentText,
      async (response) => {
        // Save assistant message to Honcho
        if (saveEnabled) {
          console.log('[ChatPane] saving assistant message to Honcho, session:', sessionId)
          await window.electronAPI.honchoSaveMessage(sessionId, 'holocron', response).catch((err) => {
            console.error('[ChatPane] assistant save failed:', err)
          })
        }

        // Auto-save: user mentioned a write keyword AND response looks like a document
        const responseIsDocument = /^#{1,3}\s+\S/m.test(response) && response.trim().length > 100
        const workspacePath = useSettingsStore.getState().config.workspace?.path
        if (userHasWriteKeyword && responseIsDocument && workspacePath) {
          const filename = deriveFilename(response)
          const result = await window.electronAPI.workspaceWriteFile(filename, response).catch(() => null)
          if (result?.ok) {
            setAgentSaved(filename)
            setTimeout(() => setAgentSaved(null), 4000)
          }
        }
      },
      displayText,
      { silent }
    )
  }

  // Mode B trigger: canonical prompt that the multi-comment fallback path in
  // detectAndStoreRedlines pairs to unresolved comments by document order.
  // Silent: leaves no trace in chat history or Honcho — the agent's REDLINE
  // blocks turn into in-document decorations and that's the only signal.
  const handleAddressAllComments = (): void => {
    if (unresolvedCount === 0 || isStreaming) return
    // CRITICAL: clear any stale `lastRedlineSource` left over from a prior
    // Cmd+L or per-comment Submit-to-Agent click. If it's set, detectAndStore-
    // Redlines takes the single-anchor path (Path 1) and stacks ALL the agent's
    // REDLINE blocks on that one stale selection — wrong positions, no
    // commentId, no auto-resolve on accept. We explicitly want the multi-
    // comment path (Path 2) here.
    useScribeStore.getState().setLastRedlineSource(null)
    console.log('[Address all] cleared lastRedlineSource — forcing multi-comment path')
    const prompt =
      `Address all ${unresolvedCount} unresolved inline comment${unresolvedCount === 1 ? '' : 's'} on this document. ` +
      `For each comment, follow the feedback to rewrite the original text. Output one REDLINE/END_REDLINE block per comment, ` +
      `in the SAME ORDER the comments appear in the document (top to bottom by line number). Do not include any text between or around the REDLINE blocks.`
    void handleSend(prompt, { silent: true })
  }

  // Brief in-chat toast after a successful auto-compress. The bar may not
  // visibly drop on cloud models when the active doc dominates the budget,
  // so we surface explicit confirmation that the action took.
  const [compressNote, setCompressNote] = useState<string | null>(null)
  // Note: the old "Reset conversation" button (local-UI clear that retained
  // Honcho memory) was removed in the UX consolidation pass — it added
  // confusion next to the persistent ⟲ Reset button (orange), which already
  // does the right thing. The Memory panel + Settings → Maintenance own
  // every memory-clearing affordance now.

  // Reset Context pipeline — folds the session's summary into thread.json's
  // inheritedContext and rotates to a fresh Honcho session so future loads
  // start clean. Used both by the manual ⟲ Reset button AND the auto-prompt
  // at >=80% context (Option B: prompt-then-reset). Caller passes silent=true
  // when there should be no confirm dialog (auto path).
  const runResetContext = useCallback(async (opts?: { silent?: boolean; trigger?: string }): Promise<boolean> => {
    if (!config.activeThreadPath || !config.activeThreadName) return false
    if (mode === 'sandbox' || !honcho.enabled) return false
    // Pass the active provider's config so the main process can fall back to
    // a one-shot summarization if Honcho's server-side summary isn't ready.
    const lm = config.activeProvider === 'gemini'
      ? { provider: 'gemini' as const,    baseUrl: GEMINI_BASE_URL,    model: config.gemini.model,    apiKey: config.gemini.apiKey }
      : config.activeProvider === 'anthropic'
      ? { provider: 'anthropic' as const, baseUrl: ANTHROPIC_BASE_URL, model: config.anthropic.model, apiKey: config.anthropic.apiKey }
      : { provider: 'lmstudio' as const,  baseUrl: config.ai.baseUrl,  model: config.ai.model,        apiKey: '' }
    const result = await window.electronAPI
      .threadResetContext(config.activeThreadPath, config.activeThreadName, config.activeProjectName, lm)
      .catch(() => null)
    if (!result?.ok || !result.newSessionId) {
      console.warn('[ChatPane] reset context failed:', result?.error, 'trigger:', opts?.trigger)
      if (opts?.silent) setAutoCompressError(result?.error ?? 'Compression failed')
      return false
    }
    clearChatHistory()
    setHonchoCtx({ sessionId: result.newSessionId })
    // After Reset: pull the FULL memory file so we know what's on disk vs.
    // what's in active context. Then load AT MOST one brief orienting
    // paragraph into sessionSummaries (the just-archived summary itself).
    // Older summaries stay on disk only — this is the fix for the 62%-
    // after-compress bug. Per spec: "Honcho is designed to hold memory
    // SERVER-SIDE and surface it on demand."
    const memRes = await window.electronAPI
      .threadReadMemoryFile(config.activeThreadPath, config.activeProjectName, config.activeThreadName)
      .catch(() => null)
    if (memRes?.filePath) {
      useScribeStore.getState().setMemoryFilePath(memRes.filePath)
    }
    const summaries = memRes?.memoryFile?.summaries ?? []
    if (summaries.length > 0) {
      const latest = summaries[summaries.length - 1]
      const brief = trimSummaryForPrompt(latest.summary)
      useScribeStore.getState().setSessionSummaries(brief ? [brief] : [])
      useScribeStore.getState().setMemoryHasSummaries(true)
      console.log(`[ChatPane] reset → 1 brief summary loaded (${brief.length}c), ${summaries.length - 1} older on disk only`)
    } else {
      useScribeStore.getState().setSessionSummaries([])
      useScribeStore.getState().setMemoryHasSummaries(false)
    }
    console.log('[ChatPane] reset context complete:', result.newSessionId, 'summary source:', result.summarySource, 'trigger:', opts?.trigger ?? 'manual')
    return true
  }, [config.activeThreadPath, config.activeThreadName, config.activeProjectName, config.activeProvider,
      config.gemini.model, config.gemini.apiKey, config.anthropic.model, config.anthropic.apiKey,
      config.ai.baseUrl, config.ai.model, mode, honcho.enabled, clearChatHistory, setHonchoCtx])

  const handleResetContext = async (): Promise<void> => {
    if (!config.activeThreadPath || !config.activeThreadName) return
    if (mode === 'sandbox' || !honcho.enabled) return
    const proceed = window.confirm(
      'Reset context?\n\n' +
      'The current chat will be summarized into thread memory and replaced with a fresh session. ' +
      'The agent keeps the gist; raw turns won\'t replay on restart.\n\n' +
      'Use this when the agent starts hallucinating from saturated chat history.'
    )
    if (!proceed) return
    await runResetContext({ trigger: 'manual' })
  }

  // Auto-compress: same pipeline as the manual Reset, but no confirm dialog —
  // the user has already opted in by clicking [Compress] on the 80% prompt.
  const handleAutoCompress = async (): Promise<void> => {
    if (autoCompressBusy) return
    setAutoCompressBusy(true)
    setAutoCompressError(null)
    try {
      const ok = await runResetContext({ silent: true, trigger: 'auto-80' })
      if (ok) {
        // Suppress the 80 % prompt now that the user has acted. Re-arming
        // happens automatically via the drop-below-80 effect — so if the
        // bar climbs back above 80 later (more chat, doc reopen), the
        // prompt fires again on the next crossing. Pre-fix used `false`
        // here, which caused the prompt to immediately re-appear on
        // cloud models when the active doc held the bar high (Symptom 2
        // from the diagnostic — "Compress button not responding").
        setContextWarningDismissed(true)
        // Visible confirmation: clicking Compress on a doc-saturated bar
        // doesn't move the needle (file content dominates, not chat), so
        // surface a brief toast inside the chat area so the user knows
        // the action took. Mirrors the resetNote pattern.
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        setCompressNote(`Compressed at ${hh}:${mm} — Honcho session rotated, prior turns archived to Memory file.`)
        setTimeout(() => setCompressNote(null), 5000)
      }
    } finally {
      setAutoCompressBusy(false)
    }
  }

  const handleWebSearch = async (): Promise<void> => {
    const q = searchQuery.trim()
    if (!q || searchLoading) return
    setSearchLoading(true)

    try {
      let content = ''
      if (q.startsWith('http://') || q.startsWith('https://')) {
        const result = await window.electronAPI.firecrawlScrape(firecrawl.apiKey, firecrawl.baseUrl, q)
        if (result.error) throw new Error(result.error)
        content = `[Web Research]\nSource: ${result.url}\nTitle: ${result.title}\n\n${result.markdown}`

        // Save scraped content to workspace/research/
        const workspacePath = useSettingsStore.getState().config.workspace?.path
        if (workspacePath) {
          try {
            const domain = new URL(q).hostname.replace(/^www\./, '')
            const relPath = `research/scraped-${domain}-${Date.now()}.md`
            const fileContent = `# ${result.title}\n\nSource: ${result.url}\nScraped: ${new Date().toISOString()}\n\n${result.markdown}`
            await window.electronAPI.workspaceWriteFile(relPath, fileContent)
          } catch { /* non-fatal */ }
        }
      } else {
        const result = await window.electronAPI.firecrawlSearch(firecrawl.apiKey, firecrawl.baseUrl, q)
        if (result.error) throw new Error(result.error)
        const sources = result.results.map((r) =>
          `### ${r.title}\nSource: ${r.url}\n\n${r.markdown}`
        ).join('\n\n---\n\n')
        content = `[Web Research — "${q}"]\n\n${sources}`
      }
      setSearchQuery('')
      setSearchOpen(false)
      setInput(content)
      requestAnimationFrame(() => { expandHeight(); textareaRef.current?.focus() })
    } catch (err) {
      setInput(`[Firecrawl error: ${(err as Error).message}]`)
    } finally {
      setSearchLoading(false)
    }
  }

  // Context usage — honest estimate of what actually leaves the renderer
  // each turn (system prompt + history). The chat-history-only count we used
  // before understates massively when a long doc is open or many session
  // summaries have been folded in. We don't try to match the agent's tokeniser
  // exactly (different per provider); 4 chars/token is directional and
  // matches what the bar has always implied.
  const chatChars = chatHistory.reduce((sum, msg) => sum + msg.content.length, 0)
  const activeFileChars = activeFilePath ? (fileContents[activeFilePath]?.length ?? 0) : 0
  const commentsChars = activeFilePath
    ? (commentsByFile[activeFilePath] ?? []).reduce(
        (s, c) => s + c.originalText.length + c.comment.length + 80, // +80 ≈ formatting overhead
        0,
      )
    : 0
  const summariesChars = sessionSummaries.reduce((s, x) => s + x.length, 0)
  // System-prompt floor: base agent instructions + thread identity + redline
  // instructions when applicable + inherited context (we don't have meta here
  // cheaply, so use a conservative 800-char floor for prompt scaffolding).
  const systemScaffoldChars = 800 + (config.agent?.systemPrompt?.length ?? 0)
  const totalChars = chatChars + activeFileChars + commentsChars + summariesChars + systemScaffoldChars
  const tokenEstimate = Math.round(totalChars / 4)
  // Model-aware context window. Pre-fix: always `ai.contextWindow` (8192) —
  // wrong for Gemini Flash (1M) and Claude (200K) and made the bar lie at
  // 90 %+ on cloud models just from opening a doc. Each provider's
  // contextWindow already lives in the config (settable in Settings →
  // Connections, defaults: lmstudio=8192, gemini=1,048,576, anthropic=200,000)
  // so we just route through `activeProvider`. The 80 % compress threshold
  // uses this same value via `contextPct`, so Gemini Flash needs ~800K
  // tokens before the prompt fires — i.e. essentially never in normal use.
  const contextWindow =
    activeProvider === 'gemini'    ? (gemini.contextWindow    || 1_048_576) :
    activeProvider === 'anthropic' ? (anthropic.contextWindow || 200_000) :
                                     (ai.contextWindow         || 8_192)
  const contextPct = Math.min(100, Math.round((tokenEstimate / contextWindow) * 100))
  const barColor = getBarColor(contextPct)

  // Session 7 second-pass Item 4 — Working Memory panel derived values.
  // Exchange count = user messages this session (resets on Reset Context
  // since chatHistory clears). Coherence label maps per Andy's thresholds:
  // < 10 = Fresh, 10–30 = Extended, > 30 = Long-session. Duration is the
  // elapsed time since the first message landed (sessionStartTs above).
  const exchangeCount = chatHistory.reduce((n, m) => n + (m.role === 'user' ? 1 : 0), 0)
  const coherenceLabel: 'Fresh' | 'Extended' | 'Long session' =
    exchangeCount < 10  ? 'Fresh' :
    exchangeCount <= 30 ? 'Extended' :
                          'Long session'
  const coherenceFull = coherenceLabel === 'Long session'
    ? 'Long session — consider a checkpoint'
    : coherenceLabel
  const sessionDurationLabel = (() => {
    if (!sessionStartTs) return '—'
    const ms = Date.now() - sessionStartTs
    const mins = Math.floor(ms / 60_000)
    if (mins < 1)   return '< 1 min'
    if (mins < 60)  return `${mins} min`
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return remMins === 0 ? `${hrs} hr` : `${hrs} hr ${remMins} min`
  })()
  // Memory-active signal — "Active" whenever the conversation has produced
  // anything Honcho would have recorded (one user message is enough — the
  // save path runs after the first assistant reply). Honest "Inactive"
  // before that since nothing has been written yet.
  const memoryActiveLabel: string =
    honchoCtx?.sessionId && (chatHistory.length > 0 || memoryHasSummaries)
      ? (memoryHasSummaries ? 'Active — prior summaries on disk' : 'Active — session bound')
      : 'Inactive — no Honcho session'

  // Re-arm the compress prompt when the bar drops back below 80 (after a
  // compress, a thread switch handled separately, or in theory if history
  // shrinks). Spec: "don't show it again until the next threshold crossing".
  useEffect(() => {
    if (contextPct < 80 && contextWarningDismissed) {
      setContextWarningDismissed(false)
    }
  }, [contextPct, contextWarningDismissed])

  const disabled = isStreaming || (!input.trim() && attachedRefs.length === 0)

  return (
    <div
      className="flex flex-col h-full"
      onDragEnter={handlePanelDragEnter}
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
      style={{
        position: 'relative', // Session 8 Part A — anchors the SessionDrawer overlay.
        backgroundColor: 'var(--bg-2)',
        boxShadow: isDragOver ? 'inset 0 0 0 1px #00d4ff40' : 'none',
        background: isDragOver ? 'linear-gradient(var(--bg-2), var(--bg-2)), #00d4ff05' : undefined,
        transition: 'box-shadow 120ms ease',
      }}
    >
      {/* SessionDrawer — slide-out from the right, overlays the chat. All
       *  session-scoped controls (Working Memory + Reset Context, Memory
       *  inspection via MemoryPanel reuse, Agent provider/model picker)
       *  consolidate here per architecture-v4 Part 14 / HANDOFF_v20 §3.1. */}
      <SessionDrawer
        open={sessionDrawerOpen}
        onClose={() => setSessionDrawerOpen(false)}
        sessionDurationLabel={sessionDurationLabel}
        exchangeCount={exchangeCount}
        coherenceLabel={coherenceLabel}
        coherenceFull={coherenceFull}
        memoryActiveLabel={memoryActiveLabel}
        onResetContext={() => { setSessionDrawerOpen(false); void handleResetContext() }}
        resetEnabled={!!config.activeThreadPath && mode !== 'sandbox' && honcho.enabled}
      />
      {/* Header — Session 8 Part A slim chrome.
       *  All session-scoped controls (agent selector, Memory inspection, Reset
       *  Context, Working Memory readout) now live inside SessionDrawer behind
       *  the ⚙ icon. Sub-header itself shows only the save-feedback toast and
       *  the drawer trigger; everything else moved per architecture-v4 Part 14
       *  / HANDOFF_v20 §3.1. */}
      <div
        className="flex items-center flex-shrink-0 px-3"
        style={{ height: 36, borderBottom: '1px solid var(--border-1)', gap: 6 }}
      >
        {/* Session 8 Part C revision 4 — live ModelSelector inline in the
         *  sub-header (one-tap model switching). Replaces the prior read-
         *  only AgentPill + drawer-Agent-section pattern. The drawer now
         *  hosts ONLY Session + Memory; the model picker lives here
         *  permanently, never buried. */}
        <ModelSelector />
        {agentSaved && (
          <span style={{ fontSize: 10, color: 'var(--accent-green)', background: 'rgba(48,209,88,0.12)', borderRadius: 10, padding: '2px 8px' }}>
            💾 Saved: {agentSaved}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setSessionDrawerOpen((v) => !v)}
            title="Session controls — agent, memory, reset, working memory"
            style={{
              width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: sessionDrawerOpen ? 'var(--bg-3)' : 'transparent',
              border: 'none', borderRadius: 5,
              cursor: 'pointer',
              color: sessionDrawerOpen ? 'var(--text-1)' : 'var(--text-3)',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
            onMouseLeave={(e) => {
              if (!sessionDrawerOpen) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-3)'
              }
            }}
          >
            <IconSettings size={14} />
          </button>
          {/* Session 8 Part B — chat collapse toggle relocated from the deleted
           *  Shell tab bar per HANDOFF_v20 §3.7. When the user clicks this the
           *  pane vanishes; re-expansion is via the ChatReExpandStrip rendered
           *  by Shell at the editor's right edge (always reachable). */}
          <button
            onClick={onToggleCollapsed}
            title="Collapse chat (⌘⇧3)"
            style={{
              width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: 5,
              cursor: 'pointer', color: 'var(--text-3)',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
          >
            <IconPanelLeft size={14} />
          </button>
        </div>
      </div>

      {/* Messages — wrapped in a relative flex container so the floating
       *  scroll-to-bottom button can position against the visible chat area. */}
      <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Session 8 Part C revision 3 — scroll container itself has padding:0
       *  so the sticky user-message band can pin flush at the visual top
       *  edge (position:sticky pins relative to the scroll container's
       *  PADDING BOX; any padding-top here would create a gap above the
       *  sticky element). The inner message-list wrapper carries the px-3
       *  py-3 breathing room instead. */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto" style={{ padding: 0 }}>
      <div className="px-3 py-3">
        {chatHistory.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-5)', textAlign: 'center', marginTop: 40, lineHeight: 1.7, padding: '0 16px' }}>
            Ask the agent anything about your documents.<br />
            <span style={{ color: 'var(--text-5)' }}>Select text + ⌘L to quote a passage.</span>
          </p>
        )}

        {chatHistory.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Thinking indicator — shown while streaming and content is still empty.
            Session 7 second-pass Item 4 — removed the streaming `tokenCount`
            chunk-count indicator (the "old standalone token counter" per
            architecture-v4 §9, which measured output chunks rather than
            input/context size and was a v3 Trust failure). Working Memory
            panel + context bar above are the honest replacements. */}
        {isStreaming && chatHistory[chatHistory.length - 1]?.content === '' && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
            <div style={{
              background: 'var(--bg-3)', borderRadius: '18px 18px 18px 4px',
              padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-4)', fontStyle: 'italic' }}>
                Thinking…
              </span>
            </div>
          </div>
        )}
        {compressNote && (
          <div style={{
            padding: '6px 10px',
            margin: '8px 0',
            fontSize: 11,
            color: 'var(--accent-orange)',
            background: 'rgba(255,159,10,0.08)',
            border: '1px solid rgba(255,159,10,0.35)',
            borderRadius: 6,
            textAlign: 'center',
            fontStyle: 'italic',
          }}>
            {compressNote}
          </div>
        )}
        <div ref={listEndRef} />
      </div>
      </div>

        {/* Scroll-to-bottom button — visible only when chat is scrolled away
         *  from the bottom. Sits over the visible chat area, not inside the
         *  scrolling content, so it stays put as the user scrolls. */}
        {!isAtBottom && (
          <button
            onClick={scrollChatToBottom}
            title="Scroll to latest"
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 32,
              height: 32,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(120,120,128,0.55)',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              transition: 'background 120ms, transform 80ms',
              zIndex: 5,
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(150,150,158,0.7)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(120,120,128,0.55)' }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'translateX(-50%) scale(0.94)' }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'translateX(-50%) scale(1)' }}
          >
            ↓
          </button>
        )}
      </div>

      {/* Firecrawl web search input */}
      {searchOpen && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-1)', background: 'var(--bg-1)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>🔍</span>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleWebSearch(); if (e.key === 'Escape') setSearchOpen(false) }}
              placeholder="Enter URL to scrape or search query…"
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '5px 9px', color: 'var(--text-1)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={() => void handleWebSearch()}
              disabled={searchLoading || !searchQuery.trim()}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: searchLoading ? 'wait' : 'pointer', opacity: (!searchQuery.trim() || searchLoading) ? 0.5 : 1 }}
            >
              {searchLoading ? '…' : 'Go'}
            </button>
            <button onClick={() => setSearchOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>
        </div>
      )}

      {/* 80% context prompt — Option B: prompt-then-reset. On Compress we run
       *  the existing Reset Context pipeline silently (no confirm). On Later
       *  we dismiss until the bar drops below 80 and crosses again. The
       *  "+ New Thread" affordance is still available via the secondary
       *  expansion path (kept for parity with v14 muscle memory). */}
      {contextPct >= 80 && !contextWarningDismissed && config.activeProjectPath && honcho.enabled && mode !== 'sandbox' && (
        <div style={{ flexShrink: 0, padding: '8px 12px', borderTop: '1px solid rgba(255,159,10,0.25)', background: 'rgba(255,159,10,0.08)' }}>
          {!showQuickThreadCreate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--accent-orange)' }}>
                Context is at {contextPct}%. Compress this conversation?
                {autoCompressError && (
                  <span style={{ color: 'var(--accent-pink)', marginLeft: 8 }}>· {autoCompressError}</span>
                )}
              </span>
              <button
                onClick={() => void handleAutoCompress()}
                disabled={autoCompressBusy}
                title="Summarize the current chat into thread memory and start a fresh Honcho session. Same as ⟲ Reset, triggered automatically."
                style={{
                  background: autoCompressBusy ? 'var(--bg-3)' : 'var(--accent-orange)',
                  color: autoCompressBusy ? 'var(--text-5)' : '#000',
                  border: 'none', borderRadius: 6, padding: '4px 10px',
                  fontSize: 11, fontWeight: 700,
                  cursor: autoCompressBusy ? 'wait' : 'pointer', flexShrink: 0,
                }}
              >
                {autoCompressBusy ? 'Compressing…' : 'Compress'}
              </button>
              <button
                onClick={() => setContextWarningDismissed(true)}
                title="Dismiss. Won't reprompt until the bar drops below 80% and crosses again."
                style={{
                  background: 'transparent',
                  color: 'var(--accent-orange)',
                  border: '1px solid rgba(255,159,10,0.45)',
                  borderRadius: 6, padding: '3px 10px',
                  fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                Later
              </button>
              <button
                onClick={handleQuickThreadOpen}
                title="Branch into a fresh thread instead of compressing"
                style={{ background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
              >
                + New Thread
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                autoFocus
                value={quickThreadName}
                onChange={(e) => setQuickThreadName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleQuickThreadCreate()
                  if (e.key === 'Escape') setShowQuickThreadCreate(false)
                }}
                placeholder="Thread name"
                style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '5px 9px', color: 'var(--text-1)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={() => void handleQuickThreadCreate()}
                disabled={!quickThreadName.trim() || quickThreadBusy}
                style={{ background: quickThreadName.trim() && !quickThreadBusy ? 'var(--accent-orange)' : 'var(--bg-3)', color: quickThreadName.trim() && !quickThreadBusy ? '#000' : 'var(--text-dim)', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: quickThreadName.trim() && !quickThreadBusy ? 'pointer' : 'not-allowed', flexShrink: 0 }}
              >
                {quickThreadBusy ? '…' : 'Create'}
              </button>
              <button
                onClick={() => setShowQuickThreadCreate(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid var(--border-1)' }}>
        {/* Session 8 Part A — the inline Working Memory panel that lived here
         *  (Session 7 second-pass Item 4) is now consolidated into the
         *  SessionDrawer's "Session" section, opened via the ⚙ in the
         *  sub-header above. Working Memory derived values (duration,
         *  exchange count, coherence, memory-active label) are still
         *  computed in this component and passed to the drawer as props. */}

        {/* Context usage bar — kept (architecture-v4 §9: "context bar stays,
            already model-aware from Session 2"). Session 8 Part A cosmetic
            thin-down: tighter margins + smaller font, no semantic change. */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ height: 2, background: 'var(--bg-3)', borderRadius: 2, marginBottom: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${contextPct}%`, background: barColor, borderRadius: 2, transition: 'width 400ms ease, background 400ms ease' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
              Context: ~{tokenEstimate.toLocaleString()} / {contextWindow.toLocaleString()} tokens ({contextPct}%)
              {/* Honest label: at most one brief summary is in active context;
               *  older summaries live on disk only. Replaces the pre-fix
               *  "N summaries from Honcho" cyan badge which implied multiple
               *  entries were eagerly loaded. */}
              {memoryHasSummaries && (
                <span style={{ color: 'var(--accent-cyan)', marginLeft: 6 }}>
                  · {sessionSummaries.length > 0
                    ? 'Fresh session — prior context in Memory file'
                    : 'Prior context in Memory file (on disk only)'}
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {mode === 'research' && hasFirecrawl && (
                <button
                  onClick={() => setSearchOpen((v) => !v)}
                  title="Web research (Firecrawl)"
                  style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                >
                  🔍 Search Web
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Contextual "Address all comments" chip — Mode B trigger.
         *  Hidden while pending redlines exist on the active file (the user
         *  has already requested a pass; deal with the redlines first). */}
        {showAddressAllButton && (
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={handleAddressAllComments}
              disabled={isStreaming}
              title="Send all unresolved comments to the agent in one silent pass — no chat trace"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: isStreaming ? 'var(--bg-3)' : '#0a84ff',
                color: isStreaming ? 'var(--text-5)' : '#ffffff',
                border: 'none',
                borderRadius: 999,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                transition: 'background 120ms, transform 80ms',
              }}
              onMouseEnter={(e) => { if (!isStreaming) e.currentTarget.style.background = '#3399ff' }}
              onMouseLeave={(e) => { if (!isStreaming) e.currentTarget.style.background = '#0a84ff' }}
              onMouseDown={(e) => { if (!isStreaming) e.currentTarget.style.transform = 'scale(0.97)' }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {isStreaming ? (
                <><span>⟳</span><span>Processing {unresolvedCount}…</span></>
              ) : (
                <><span>📝</span><span>Address all comments ({unresolvedCount})</span></>
              )}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          {/* Composite input: pill shelf + textarea in one rounded box */}
          <div
            style={{
              flex: 1, borderRadius: 10, background: 'var(--bg-3)',
              border: `1px solid ${inputFocused ? 'var(--accent)' : 'transparent'}`,
              transition: 'border-color 150ms ease', display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Pill shelf — shown only when files/folders are attached */}
            {attachedRefs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px 4px' }}>
                {attachedRefs.map((ref) => (
                  <span
                    key={ref.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: '#1e3a5f', border: '1px solid #0a84ff60',
                      borderRadius: 12, padding: '2px 6px 2px 8px',
                      fontSize: 12, color: '#00d4ff', lineHeight: 1.4,
                    }}
                  >
                    {ref.agentText == null && <span>{ref.isDir ? '📁' : '📄'}</span>}
                    <span>{ref.name}</span>
                    <button
                      onClick={() => setAttachedRefs((prev) => prev.filter((r) => r.id !== ref.id))}
                      onMouseDown={(e) => e.preventDefault()}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#00d4ff', padding: '0 0 0 2px', lineHeight: 1,
                        fontSize: 14, opacity: 0.7, display: 'flex', alignItems: 'center',
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
              }}
              onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Message…"
              style={{
                width: '100%',
                height: '44px',
                minHeight: '44px',
                maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
                resize: 'none',
                overflowY: 'auto',
                boxSizing: 'border-box',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: attachedRefs.length > 0 ? '4px 12px 8px' : '8px 12px',
                fontSize: 13,
                color: 'var(--text-1)',
                fontFamily: 'inherit',
              }}
            />
          </div>
          {isStreaming ? (
            <button
              onClick={abortStream}
              style={{
                flexShrink: 0, padding: '8px 14px', borderRadius: 10, border: 'none',
                background: 'rgba(255,45,120,0.15)', color: '#ff2d78',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'background 150ms ease',
              }}
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => void handleSend()}
              disabled={disabled}
              style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 10, border: 'none',
                background: disabled ? 'var(--bg-3)' : 'var(--accent)',
                color: disabled ? 'var(--text-5)' : '#ffffff',
                fontSize: 13, fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'background 150ms ease, color 150ms ease',
              }}
            >
              Send
            </button>
          )}
        </div>
        {isStreaming ? (
          <p style={{ fontSize: 10, color: 'var(--accent)', marginTop: 6, paddingLeft: 2 }}>
            Generating…
          </p>
        ) : (
          <p style={{ fontSize: 10, color: 'var(--text-5)', marginTop: 6, paddingLeft: 2 }}>↵ send · ⇧↵ newline</p>
        )}
      </div>
    </div>
  )
}

