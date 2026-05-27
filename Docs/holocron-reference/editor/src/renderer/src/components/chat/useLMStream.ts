import { useCallback, useState } from 'react'
import { useScribeStore, type DocComment } from '../../store/scribeStore'
import { useSettingsStore, AppMode, HolocronConfig, GEMINI_BASE_URL, ANTHROPIC_BASE_URL } from '../../store/settingsStore'
import type { ThreadMeta } from '../../types/ipc'
import { extractRedlineBlocks } from '../../utils/redlineParser'

interface ThreadIdentity {
  projectName: string
  threadName: string
  threadFiles: string[]
  inheritedContext: string | null
}

function formatCommentsBlock(comments: DocComment[]): string {
  if (comments.length === 0) return ''
  const unresolved = comments.filter((c) => !c.resolved).length
  const lines = comments.map((c, i) => {
    const range = c.fromLine === c.toLine ? `Line ${c.fromLine}` : `Lines ${c.fromLine}-${c.toLine}`
    const status = c.resolved ? 'resolved' : 'unresolved'
    // Trim original text excerpt so the block stays small. Agents can ask for
    // the full file content if they need more context.
    const excerpt = c.originalText.length > 160 ? c.originalText.slice(0, 160) + '…' : c.originalText
    const feedback = c.comment.trim() || '(no feedback text)'
    return `Comment ${i + 1} [${status}] — ${range}\n  Original text: ${JSON.stringify(excerpt)}\n  Feedback: ${feedback}`
  }).join('\n')
  return `\n\nInline comments on this document (${comments.length} total, ${unresolved} unresolved):\n${lines}`
}

interface MemoryReference {
  /** Absolute path to Memory_<Project>_<Thread>.json, or '' if unresolved. */
  filePath: string
  /** True when the file exists on disk with at least one summary. */
  hasSummariesOnDisk: boolean
}

function buildSystemMessage(
  mode: AppMode,
  agent: HolocronConfig['agent'],
  activeFilePath: string | null,
  fileContents: Record<string, string>,
  sessionSummaries: string[],
  thread: ThreadIdentity,
  comments: DocComment[],
  currentUserText: string,
  memory: MemoryReference,
): string {
  if (mode === 'sandbox') {
    return 'You are a helpful assistant. This is a temporary sandbox session. No information will be saved.'
  }

  if (mode === 'research') {
    return `You are a research assistant named ${agent.agentName}. Help collect, analyze and summarize information. Save findings as markdown reports when asked.`
  }

  const base = agent.systemPrompt ||
    `You are the ${agent.agentName}, a personal AI assistant and second brain for ${agent.userName}. ` +
    `You have access to ${agent.userName}'s documents and conversation history. ` +
    `You remember previous conversations. ` +
    `Be concise, intelligent, and helpful. Address ${agent.userName} by name occasionally.`

  // Anti-bleed: prior turns full of redlines bias models (esp. Gemini Flash)
  // toward returning more redlines even on clarifying questions. Hard rule
  // here, plus the conditional redline instruction below.
  const antiBleed =
    `\n\nFocus on ${agent.userName}'s current message and the active document shown below. ` +
    `Do not reference unrelated topics from earlier in this conversation unless ${agent.userName} explicitly asks about them. ` +
    `If the current message is a clarifying question, answer it as a question — do not produce a REDLINE block.`

  // The redline format only triggers when the user message carries an editor-
  // injected marker ("Citation from ..." for Cmd+L, "REDLINE/END_REDLINE" for
  // the Address-all preset). Plain chat messages skip this entirely so the
  // model isn't primed to keep emitting redlines turn after turn.
  const isRedlineRequest =
    currentUserText.includes('Citation from ') ||
    currentUserText.includes('REDLINE/END_REDLINE')

  const redlineInstruction = isRedlineRequest
    ? `\n\nWhen ${agent.userName} asks you to edit, improve, or rewrite selected text, ` +
      `respond ONLY in this exact format with no additional text before or after:\n` +
      `REDLINE:\n[your suggested replacement text]\nEND_REDLINE\n` +
      `Strict rules:\n` +
      `- The literal word REDLINE: must appear on its own line as the very first thing in your response.\n` +
      `- Do NOT prefix REDLINE with emojis, decorative characters, markdown formatting (no **, no headers), or any other text.\n` +
      `- Do NOT explain what you changed. Do NOT add any text outside the REDLINE markers.\n` +
      `- END_REDLINE must appear on its own line, exactly as written, with no surrounding formatting.\n` +
      `If proposing multiple alternative edits for the same passage, output multiple REDLINE/END_REDLINE blocks back-to-back with no text between them.\n\n` +
      `When ${agent.userName} asks you to address multiple inline comments at once (e.g. "address all comments", ` +
      `"fix the outstanding comments", "do all of them"), output one REDLINE/END_REDLINE block per unresolved comment, ` +
      `in the SAME ORDER the comments appear in the document (top to bottom by line number). Do not interleave any ` +
      `prose between blocks. Do not skip comments. The Nth REDLINE block will be paired with the Nth unresolved comment ` +
      `by line order, so the count and order must match exactly.`
    : ''

  let content = base + antiBleed + redlineInstruction

  // Thread identity block — agent always knows where it is.
  if (thread.projectName || thread.threadName) {
    const fileList = thread.threadFiles.length > 0
      ? thread.threadFiles.map((f) => `- ${f}`).join('\n')
      : '(none yet)'
    content += `\n\nYou are working in:\nProject: ${thread.projectName || '(none)'}\nThread: ${thread.threadName || '(none)'}\n\n` +
      `Your knowledge and responses are scoped to this thread unless ${agent.userName} explicitly asks you to reference another thread. ` +
      `Files available in this thread are listed in the file explorer to your left.\n\n` +
      `Files in this thread:\n${fileList}`
  }

  // Inherited context from a Branch parent — see Fix 4.
  if (thread.inheritedContext) {
    content += `\n\n${thread.inheritedContext}`
  }

  // Memory block — minimal by design.
  //
  // Pre-fix (v14 and earlier): we eagerly stamped the 5 most-recent summaries
  // verbatim into every request as "Previous Session Memories". That left
  // context at ~62% post-compression — the summaries themselves consumed
  // ~40% of the budget before the user typed anything, defeating the
  // compression they came from.
  //
  // Now: at most ONE brief orienting paragraph (the most-recent summary,
  // trimmed in the populator) + a one-line pointer to the Memory file path.
  // Older summaries stay on disk; Honcho holds memory server-side and
  // surfaces it on demand. Claude Code pattern: write to disk, start fresh,
  // reference on demand.
  if (memory.hasSummariesOnDisk && memory.filePath) {
    const orienting = sessionSummaries[0] ?? ''
    const memoryRef =
      `\n\n--- Thread Memory ---\n` +
      `A memory file for this thread exists at:\n${memory.filePath}\n` +
      `Prior conversation history is summarized there. Reference it if ${agent.userName} asks about something from a previous session.`
    const orientingBlock = orienting
      ? `\n\n[Previous session summary] ${orienting}`
      : ''
    content = `${content}${memoryRef}${orientingBlock}\n---`
  }

  if (!activeFilePath) return content

  const title = activeFilePath.split('/').pop() ?? activeFilePath
  const fileContent = fileContents[activeFilePath] ?? ''
  const commentsBlock = formatCommentsBlock(comments)
  return `${content}\n\n${agent.userName} currently has the following document open:\n\n${title}\n\n${fileContent}${commentsBlock}\n\nAnswer questions about it directly.`
}

// ── CoPaw (auto-capture key facts → Honcho Conclusions) ─────────────────────
//
// Architecture-v4 §4.6. After every assistant response, regex-extract a few
// durable facts and POST each as a Honcho Conclusion (`observer_id=andy`,
// `observed_id=andy`). The dialectic / dream synthesis improves with a
// denser conclusion corpus, per the gotcha entry on Honcho v3 internals.
//
// Heuristic v1 (no LLM). Patterns we extract:
//   - Bullet list items (lines starting with `- `, `* `, or `• `)
//   - Numbered list items (lines starting with `1.`, `2.`, etc.)
//   - Sentences containing decision verbs: decided, will, should, agreed,
//     "the deadline", "Andy prefers", "Andy wants", "we need"
//
// Filters:
//   - Min length 20 chars (drops "yes", "no", short list-fillers)
//   - Max 5 conclusions per response (caps noise)
//   - Strips leading bullet/number markers and trailing punctuation
//   - Dedupes within the extraction (case-insensitive content match)
//
// Fire-and-forget — we never await any of the posts; the renderer never
// blocks on CoPaw. Errors are logged but don't surface to the user.

const COPAW_DECISION_RE = /\b(decided|will|should|agreed|the deadline|andy prefers|andy wants|we need)\b/i
const COPAW_BULLET_RE   = /^\s*[-*•]\s+(.+?)\s*$/
const COPAW_NUMBERED_RE = /^\s*\d+\.\s+(.+?)\s*$/
const COPAW_MIN_LEN     = 20
const COPAW_MAX_PER_RESPONSE = 5

function extractCoPawConclusions(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  const push = (raw: string): void => {
    const trimmed = raw.trim().replace(/[\s,;.]+$/, '')
    if (trimmed.length < COPAW_MIN_LEN) return
    // Skip "yes/no" + obvious filler even if length passes (rare but cheap to guard).
    if (/^(yes|no|ok|sure|maybe)\b/i.test(trimmed)) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(trimmed)
  }

  const lines = text.split('\n')
  for (const line of lines) {
    if (out.length >= COPAW_MAX_PER_RESPONSE) break
    const bm = line.match(COPAW_BULLET_RE)
    if (bm) { push(bm[1]); continue }
    const nm = line.match(COPAW_NUMBERED_RE)
    if (nm) { push(nm[1]); continue }
    // Sentence-level decision phrases. Split on sentence terminators so a
    // multi-sentence line surfaces each decision separately.
    if (COPAW_DECISION_RE.test(line)) {
      const sentences = line.split(/(?<=[.!?])\s+/)
      for (const s of sentences) {
        if (out.length >= COPAW_MAX_PER_RESPONSE) break
        if (COPAW_DECISION_RE.test(s)) push(s)
      }
    }
  }

  return out
}

/**
 * Fire-and-forget CoPaw post-response capture. Exported so callers can run
 * it (or tests can exercise the extractor — though we don't add tests this
 * session; behaviour is straightforward and the IPC is best-effort).
 */
function fireCoPaw(response: string, sessionId: string | null): void {
  const conclusions = extractCoPawConclusions(response)
  if (conclusions.length === 0) {
    return
  }
  console.log(`[CoPaw] extracted ${conclusions.length} conclusion${conclusions.length === 1 ? '' : 's'} from response (${response.length} chars)`)
  // Fire each — no await, no Promise.all (we don't even care if they all
  // succeed; CoPaw is bulk + cheap + idempotent on the server side).
  for (const content of conclusions) {
    void window.electronAPI.honchoPostConclusion(content, sessionId ?? undefined)
      .catch((err) => console.warn('[CoPaw] post failed (degrading):', err))
  }
}

async function fetchThreadFiles(threadPath: string): Promise<string[]> {
  if (!threadPath) return []
  try {
    const entries = await window.electronAPI.fsReaddir(threadPath)
    return entries
      .filter((e) => e.type === 'file' && !e.name.startsWith('.') && e.name !== 'thread.json')
      .map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * Convert a 1-indexed line range to character offsets in the doc text. Mirrors
 * the offsets CodeMirror uses, so redlines created here align with the editor.
 */
function lineRangeToCharRange(text: string, fromLine: number, toLine: number): { from: number; to: number } {
  const lines = text.split('\n')
  const total = lines.length
  const f = Math.max(1, Math.min(fromLine, total))
  const t = Math.max(f, Math.min(toLine, total))
  let from = 0
  for (let i = 0; i < f - 1; i++) from += lines[i].length + 1
  let to = from
  for (let i = f - 1; i < t; i++) {
    to += lines[i].length
    if (i < t - 1) to += 1
  }
  return { from, to }
}

/**
 * Scan the agent's final response for REDLINE/END_REDLINE blocks and create
 * a redline state per block. Two anchoring modes:
 *
 *   1. Single-anchor (Cmd+L or per-comment Submit-to-Agent set
 *      `lastRedlineSource`): all blocks anchor to that one range. Multiple
 *      blocks are treated as alternative edits for the same passage.
 *
 *   2. Multi-comment fallback (no `lastRedlineSource`, but the active file
 *      has unresolved comments): pair REDLINE blocks to comments in document
 *      order. First block → first comment by line, second block → second,
 *      etc. Each redline anchors to its paired comment's range.
 *
 * Returns true if at least one redline was created.
 */
function detectAndStoreRedlines(response: string): boolean {
  console.log('[Redline] checking response for REDLINE blocks, len:', response.length)
  const blocks = extractRedlineBlocks(response)
  console.log(`[Redline] parser found ${blocks.length} block(s)`)
  if (blocks.length === 0) return false

  const state = useScribeStore.getState()
  const { lastRedlineSource, addRedlines, setLastRedlineSource, activeFilePath, commentsByFile, fileContents } = state

  // Path 1 — single anchor.
  if (lastRedlineSource) {
    console.log(`[Redline] anchoring at ${lastRedlineSource.filePath}:${lastRedlineSource.from}-${lastRedlineSource.to} commentId=${lastRedlineSource.commentId ?? 'none'}`)
    const now = new Date().toISOString()
    addRedlines(blocks.map((proposed) => ({
      id: crypto.randomUUID(),
      filePath: lastRedlineSource.filePath,
      from: lastRedlineSource.from,
      to: lastRedlineSource.to,
      originalText: lastRedlineSource.text,
      proposedText: proposed,
      state: 'pending' as const,
      timestamp: now,
      commentId: lastRedlineSource.commentId,
    })))
    setLastRedlineSource(null)
    console.log(`[Redline] created ${blocks.length} redline(s) for ${lastRedlineSource.filePath}`)
    return true
  }

  // Path 2 — pair blocks to unresolved comments by document order.
  if (activeFilePath) {
    const unresolved = (commentsByFile[activeFilePath] ?? [])
      .filter((c) => !c.resolved)
      .sort((a, b) => a.fromLine - b.fromLine || a.toLine - b.toLine)

    if (unresolved.length > 0) {
      const text = fileContents[activeFilePath] ?? ''
      const pairs = Math.min(blocks.length, unresolved.length)
      const now = new Date().toISOString()
      const created = []
      for (let i = 0; i < pairs; i++) {
        const c = unresolved[i]
        const { from, to } = lineRangeToCharRange(text, c.fromLine, c.toLine)
        if (from >= to) continue
        created.push({
          id: crypto.randomUUID(),
          filePath: activeFilePath,
          from,
          to,
          originalText: c.originalText,
          proposedText: blocks[i],
          state: 'pending' as const,
          timestamp: now,
          commentId: c.id,
        })
      }
      if (created.length > 0) {
        addRedlines(created)
        console.log(`[Redline] created ${created.length} redline(s) paired to unresolved comments`)
        if (blocks.length > unresolved.length) {
          console.warn(`[Redline] ${blocks.length - unresolved.length} extra block(s) ignored — only ${unresolved.length} unresolved comment(s) to anchor to`)
        }
        return true
      }
    }
  }

  console.warn('[Redline] agent returned REDLINE blocks but no anchor (no source selection and no unresolved comments)')
  return false
}

function formatInheritedContext(meta: ThreadMeta): string | null {
  // The Branch IPC writes the formatted block to thread.json on branch creation;
  // we just surface it back into the system prompt as-is.
  return meta.inheritedContext ?? null
}

export interface SendMessageOpts {
  /** When true, skip adding user/assistant messages to chat history and skip
   *  any UI streaming updates. The LLM call still runs, REDLINE detection
   *  still fires, but nothing reaches the chat panel or Honcho. Used by the
   *  "Address all comments" button so redline-only flows leave no chat trace. */
  silent?: boolean
}

export function useLMStream(): {
  sendMessage: (agentText: string, onComplete?: (response: string) => void, displayText?: string, opts?: SendMessageOpts) => void
  abortStream: () => void
  tokenCount: number
} {
  const { addChatMessage, updateLastAssistantMessage, setIsStreaming } = useScribeStore()
  const [tokenCount, setTokenCount] = useState(0)

  const abortStream = useCallback((): void => {
    window.electronAPI.abortLMStream()
  }, [])

  const sendMessage = useCallback(
    (agentText: string, onComplete?: (response: string) => void, displayText?: string, opts?: SendMessageOpts): void => {
      const silent = opts?.silent === true
      const { chatHistory, activeFilePath, fileContents, sessionSummaries, commentsByFile, memoryFilePath, memoryHasSummaries, honchoCtx } = useScribeStore.getState()
      const { config } = useSettingsStore.getState()
      const { mode, ai, gemini, anthropic, activeProvider, agent, activeProjectName, activeThreadName, activeThreadPath } = config

      // Resolve which provider's URL/key/model the stream should use. The
      // explicit `provider` field tells the main-process IPC handler exactly
      // which adapter to call — no URL-based heuristic in the path.
      const lm = activeProvider === 'gemini'
        ? { provider: 'gemini' as const,    baseUrl: GEMINI_BASE_URL,    model: gemini.model,    apiKey: gemini.apiKey,    temperature: gemini.temperature,    maxTokens: gemini.maxTokens }
        : activeProvider === 'anthropic'
        ? { provider: 'anthropic' as const, baseUrl: ANTHROPIC_BASE_URL, model: anthropic.model, apiKey: anthropic.apiKey, temperature: anthropic.temperature, maxTokens: anthropic.maxTokens }
        : { provider: 'lmstudio' as const,  baseUrl: ai.baseUrl,         model: ai.model,        apiKey: '',               temperature: ai.temperature,        maxTokens: ai.maxTokens }

      // Chat bubble shows displayText (clean); LLM receives agentText (full context with file contents)
      const displayContent = displayText ?? agentText
      const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: displayContent }
      const agentUserMsg = { ...userMsg, content: agentText }
      if (!silent) {
        addChatMessage(userMsg)
        addChatMessage({ id: crypto.randomUUID(), role: 'assistant' as const, content: '' })
      }
      setIsStreaming(true)
      setTokenCount(0)

      void (async (): Promise<void> => {
      // Resolve thread identity for system prompt: project, thread, file list, branch context.
      const threadFiles = await fetchThreadFiles(activeThreadPath)
      const meta = activeThreadPath
        ? await window.electronAPI.threadReadMeta(activeThreadPath).catch(() => null)
        : null
      // Inherited context is populated by the Branch flow AND by Reset Context
      // (which folds the prior session's summary in). Surface it whenever
      // present, regardless of how it got there.
      const inheritedContext = meta ? formatInheritedContext(meta) : null
      const threadIdentity: ThreadIdentity = {
        projectName: activeProjectName,
        threadName: activeThreadName,
        threadFiles,
        inheritedContext,
      }

      const activeComments = activeFilePath ? (commentsByFile[activeFilePath] ?? []) : []
      const memoryRef: MemoryReference = { filePath: memoryFilePath, hasSummariesOnDisk: memoryHasSummaries }
      const systemMsg = { role: 'system', content: buildSystemMessage(mode, agent, activeFilePath, fileContents, sessionSummaries, threadIdentity, activeComments, agentText, memoryRef) }

      const historyMsgs = mode === 'sandbox'
        ? [agentUserMsg]
        : [...chatHistory, agentUserMsg]

      const messages = [systemMsg, ...historyMsgs.map((m) => ({ role: m.role, content: m.content }))]

      // ChatDiag: log the full constructed prompt shape immediately before
      // it leaves the renderer. This is what the agent sees. If hallucination
      // looks like "responding to the previous message instead of the current
      // one," check that the LAST message here is the user's intended ask
      // and the role pattern alternates cleanly user/assistant/user/…
      const rolePattern = messages.map((m) => m.role[0]).join('')
      const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
      const sysLen = systemMsg.content.length
      const lastUser = messages[messages.length - 1]
      console.log(`[ChatDiag] send-build msgs=${messages.length} roles="${rolePattern}" totalChars=${totalChars} sysLen=${sysLen} provider=${lm.provider} model=${lm.model}`)
      console.log(`[ChatDiag] send-build sysHead: ${JSON.stringify(systemMsg.content.slice(0, 240))}`)
      console.log(`[ChatDiag] send-build sysTail: ${JSON.stringify(systemMsg.content.slice(-240))}`)
      console.log(`[ChatDiag] send-build lastMsg(${lastUser.role}, ${lastUser.content.length}c): ${JSON.stringify(lastUser.content.slice(0, 240))}`)
      if (messages.length > 2) {
        const firstHistory = messages[1]
        console.log(`[ChatDiag] send-build firstHistory(${firstHistory.role}, ${firstHistory.content.length}c): ${JSON.stringify(firstHistory.content.slice(0, 160))}`)
      }

      let accumulated = ''
      let chunkCount = 0

      const removeTokenListener = window.electronAPI.onLMToken((token) => {
        accumulated += token
        chunkCount++
        if (!silent) updateLastAssistantMessage(accumulated)
        setTokenCount(chunkCount)
      })

      const removeEndListener = window.electronAPI.onLMEnd((error) => {
        removeTokenListener()
        removeEndListener()
        if (error === '__aborted__') {
          // User cancelled — leave partial text visible, skip onComplete
        } else if (error) {
          if (!silent) updateLastAssistantMessage(`⚠ ${error}`)
          else console.warn('[silent stream] error:', error)
        } else {
          // Redline detection runs at the exact point we have the final
          // accumulated text — no isStreaming-edge dance, no race window.
          const wasRedline = detectAndStoreRedlines(accumulated)
          if (wasRedline) {
            // Redlines render in the document, not as a chat bubble. Drop
            // the assistant message and skip onComplete so it doesn't get
            // persisted to Honcho either.
            if (!silent) useScribeStore.getState().removeLastAssistantMessage()
          } else if (onComplete && !silent) {
            onComplete(accumulated)
            // CoPaw auto-capture — fire after the assistant message has
            // landed in the chat (and Honcho via onComplete's
            // honchoSaveMessage path). Fire-and-forget; never awaits.
            // Skips redline responses (their content is editor-targeted,
            // not durable facts) and silent flows (Address-all preset etc.).
            fireCoPaw(accumulated, honchoCtx?.sessionId ?? null)
          } else if (silent) {
            console.warn('[silent stream] no redlines created — agent response:', accumulated.slice(0, 200))
          }
        }
        setIsStreaming(false)
      })

      window.electronAPI.startLMStream(messages, { ...lm, task: 'chat' })
      })()
    },
    [addChatMessage, updateLastAssistantMessage, setIsStreaming]
  )

  return { sendMessage, abortStream, tokenCount }
}
