/**
 * Hermes — architecture-v4 §4.5 + §10 + Session 5.
 *
 * Three jobs:
 *   1. Telegram bridge — long-poll listener that dispatches /dream, /status,
 *      /note, /ingest, and plain messages (→ active thread's Honcho session
 *      + Sonnet reply).
 *   2. iCloud Drive watcher — chokidar polling on a configured directory →
 *      routes each new file to the Foundry triage queue + optional Telegram
 *      notification.
 *   3. Inter-agent router — deferred. Today's agent calls are direct; this
 *      module is the eventual home for the normalized `{channel, sender,
 *      kind, payload}` queue when Phase 5 Orchestrator work starts.
 *
 * Plumbing only — no LLM of its own. Sonnet replies come from `llmClient`;
 * dream synthesis comes from Honcho's `schedule_dream`.
 *
 * Auth model (architecture-v4 §13 Q5, decided config-only):
 *   - Bot token + allowed-user-ID both live in `holocron-config.json`
 *     (Settings → Connections), never in source / env-committed files.
 *   - Hermes only responds to that single user-ID. Every other sender is
 *     ignored *silently* (a bounce message would tell attackers the bot is
 *     listening; logging the rejection in the terminal is plenty).
 *
 * Lifecycle:
 *   - `startHermesBot()` on boot when both fields are populated (see
 *     `main/index.ts`). Idempotent.
 *   - `startIcloudWatcher()` on boot when `icloudInboxPath` is populated.
 *     Independent of the Telegram bot — either can run alone.
 *   - Renderer can manually flip both via `hermes:start` / `hermes:stop`
 *     after a config change (the Hive card shows the Start/Stop toggle).
 *
 * Gotcha refs:
 *   - chokidar config mirrors `workspace.ts` per gotcha.md line 39
 *     (`usePolling: true`, no fsevents on macOS).
 *   - This watcher is a SEPARATE chokidar instance — must NOT call
 *     `workspace.ts:startWatcher` (gotcha line 41 — that function kills the
 *     previous watcher and would disable Codex ingestion).
 *   - Console logs use the `[Hermes]` prefix and land in the TERMINAL, not
 *     DevTools — main-process module (gotcha line 19, Session 4 prior).
 */

import fs from 'fs'
import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { loadConfig, type HolocronConfig } from './config'
import { initHoncho, addMessage, getSessionContext, scheduleDream } from './honcho'
import { bindThreadHoncho, appendNote } from './projectFs'
import { chat } from './llmClient'
import { captureUrl, captureFile, captureFileBinary } from './foundry'
import { getDashboardStatus, getDashboardStats } from './dashboard'
import { gatherFoundryStats } from './hive'

// ── Config accessors ─────────────────────────────────────────────────────
// Centralizing the awkward telegram/icloud reads keeps the unsafe casts
// confined to one place. (These fields ARE on `HolocronConfig` now — but
// callers from other modules sometimes pass a half-merged cfg, so the
// optional-chain reads stay defensive.)

interface TelegramFields { botToken?: string; allowedUserId?: string }

function readTelegram(cfg: HolocronConfig): { token: string; userId: string } {
  const tg = (cfg.telegram ?? {}) as TelegramFields
  return {
    token:  (tg.botToken ?? '').trim(),
    userId: (tg.allowedUserId ?? '').trim(),
  }
}

function readIcloudInbox(cfg: HolocronConfig): string {
  return (cfg.icloudInboxPath ?? '').trim()
}

// Expand a leading `~/` to `$HOME`. chokidar doesn't expand tildes, and
// `path.resolve` doesn't either — we have to do it ourselves.
function expandHome(p: string): string {
  if (!p) return p
  if (p === '~') return process.env.HOME ?? p
  if (p.startsWith('~/')) return path.join(process.env.HOME ?? '', p.slice(2))
  return p
}

// ── Telegram primitives (minimal shape — only what we read) ──────────────

interface TelegramUser   { id: number; first_name?: string; username?: string }
interface TelegramChat   { id: number; type: string }
interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
}
interface TelegramUpdate { update_id: number; message?: TelegramMessage }

// ── Module state ─────────────────────────────────────────────────────────
//
// All long-lived state lives at module scope (one Hermes per process). The
// shape is intentionally flat so `getHermesStatus()` can serialize it
// cheaply for the Hive card poll. Booleans + last-action timestamps only;
// no message history (Telegram replays via offset).

let pollingActive = false
let pollAbortController: AbortController | null = null
let lastUpdateId = 0
let lastMessageAt: string | null = null
let lastError: string | null = null
let icloudWatcher: FSWatcher | null = null
let icloudWatchPath: string | null = null

// Telegram getUpdates uses a 30 s long-poll; we set the fetch timeout to
// 60 s as a belt-and-suspenders catch for a hung connection (Cloudflare
// proxies sometimes hold past 30 s).
const TELEGRAM_POLL_TIMEOUT_S = 30
const FETCH_TIMEOUT_MS        = 60_000

// ── Public status surface (Hive card consumer) ───────────────────────────

export interface HermesStatus {
  /** True when the long-poll loop is running. */
  running: boolean
  /** True when both telegram.botToken AND telegram.allowedUserId are set. */
  configured: boolean
  /** ISO timestamp of the most recent inbound message; null = never. */
  lastMessageAt: string | null
  /** Most recent poll-loop error (cleared on the next successful poll). */
  lastError: string | null
  /** Resolved iCloud watch directory when active; null = not watching. */
  icloudWatching: string | null
}

export function getHermesStatus(): HermesStatus {
  const cfg = loadConfig()
  const { token, userId } = readTelegram(cfg)
  return {
    running: pollingActive,
    configured: !!(token && userId),
    lastMessageAt,
    lastError,
    icloudWatching: icloudWatcher ? icloudWatchPath : null,
  }
}

// ── Send helper ──────────────────────────────────────────────────────────

async function sendTelegram(token: string, chatId: number, text: string): Promise<void> {
  // Telegram caps messages at 4096 chars — chunk if longer rather than
  // letting the API truncate silently. Plain Sonnet replies can absolutely
  // exceed this on long syntheses.
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 4000) {
    chunks.push(remaining.slice(0, 4000))
    remaining = remaining.slice(4000)
  }
  chunks.push(remaining)

  for (const chunk of chunks) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.warn(`[Hermes/tg] sendMessage ${res.status}: ${body.slice(0, 200)}`)
      }
    } catch (err) {
      console.warn('[Hermes/tg] sendMessage failed:', (err as Error).message)
    }
  }
}

/** Fire-and-forget notification to the configured user — used by the iCloud
 *  watcher to surface "new file in inbox" without the user prompting. No-ops
 *  when Telegram isn't configured. */
async function notifyTelegram(text: string): Promise<void> {
  const cfg = loadConfig()
  const { token, userId } = readTelegram(cfg)
  if (!token || !userId) return
  const id = Number(userId)
  if (!Number.isFinite(id)) return
  await sendTelegram(token, id, text)
}

// ── Bot lifecycle ────────────────────────────────────────────────────────

export async function startHermesBot(cfg?: HolocronConfig): Promise<{ ok: boolean; error?: string }> {
  if (pollingActive) return { ok: true }
  const c = cfg ?? loadConfig()
  const { token, userId } = readTelegram(c)
  if (!token || !userId) {
    return {
      ok: false,
      error: 'Telegram bot token and allowed-user-ID must both be configured (Settings → Connections).',
    }
  }

  pollingActive = true
  pollAbortController = new AbortController()
  lastError = null
  console.log(`[Hermes] Telegram bot starting (allowed user: ${userId})`)

  void runPollLoop(token, userId)
  return { ok: true }
}

export function stopHermesBot(): void {
  if (!pollingActive) return
  pollingActive = false
  pollAbortController?.abort()
  pollAbortController = null
  console.log('[Hermes] Telegram bot stopped')
}

async function runPollLoop(token: string, allowedUserId: string): Promise<void> {
  // Exponential backoff on hard failures (network down, 5xx, Telegram
  // rate-limit). Reset to 0 on the next successful poll so the next
  // hiccup doesn't start from a long backoff.
  let backoffMs = 0

  while (pollingActive) {
    try {
      if (backoffMs > 0) {
        await sleep(backoffMs, pollAbortController?.signal)
      }
      const url = `https://api.telegram.org/bot${token}/getUpdates`
        + `?offset=${lastUpdateId + 1}`
        + `&timeout=${TELEGRAM_POLL_TIMEOUT_S}`

      const res = await fetch(url, { signal: pollAbortController?.signal })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        lastError = `getUpdates ${res.status}: ${body.slice(0, 200)}`
        console.warn('[Hermes]', lastError)
        backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 5_000, 60_000)
        continue
      }
      const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] }
      if (!data.ok) {
        lastError = 'getUpdates returned ok=false'
        backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 5_000, 60_000)
        continue
      }
      backoffMs = 0
      lastError = null
      for (const update of data.result ?? []) {
        // Advance offset BEFORE dispatch so a hang in the handler doesn't
        // cause Telegram to redeliver the same update on the next poll.
        if (update.update_id >= lastUpdateId) lastUpdateId = update.update_id
        void handleUpdate(token, allowedUserId, update).catch((err) => {
          console.warn('[Hermes] handler crashed:', (err as Error).message)
        })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') break
      lastError = (err as Error).message
      console.warn('[Hermes] poll error:', lastError)
      backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 5_000, 60_000)
    }
  }
  console.log('[Hermes] poll loop exited')
}

/** Promise-based sleep that respects the bot's abort signal. Resolves
 *  immediately on abort so the loop exit isn't gated on the full backoff
 *  delay. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
  })
}

// ── Dispatch ─────────────────────────────────────────────────────────────

async function handleUpdate(
  token: string,
  allowedUserId: string,
  update: TelegramUpdate,
): Promise<void> {
  const msg = update.message
  if (!msg) return                                          // edited messages / callback queries etc. — ignored
  const senderId = String(msg.from?.id ?? '')
  if (!senderId || senderId !== allowedUserId) {
    // Silent reject: don't tell the unauthorized sender the bot is here.
    console.log(`[Hermes] ignored message from unauthorized sender ${senderId || '(unknown)'}`)
    return
  }
  lastMessageAt = new Date().toISOString()

  const text = (msg.text ?? '').trim()
  if (!text) {
    // Future: handle msg.document / msg.photo for file uploads (would
    // route through captureFileBinary). Out of scope for Session 5.
    await sendTelegram(token, msg.chat.id, 'Send text, or use /dream, /status, /note <text>, /ingest <URL>.')
    return
  }

  try {
    if (text === '/dream' || text.startsWith('/dream ')) {
      await handleDream(token, msg.chat.id)
    } else if (text === '/status' || text.startsWith('/status ')) {
      await handleStatus(token, msg.chat.id)
    } else if (text.startsWith('/note ')) {
      await handleNote(token, msg.chat.id, text.slice('/note '.length).trim())
    } else if (text === '/note') {
      await sendTelegram(token, msg.chat.id, 'Usage: /note <text>')
    } else if (text.startsWith('/ingest ')) {
      await handleIngest(token, msg.chat.id, text.slice('/ingest '.length).trim())
    } else if (text === '/ingest') {
      await sendTelegram(token, msg.chat.id, 'Usage: /ingest <URL>')
    } else if (text === '/help' || text === '/start') {
      await sendTelegram(token, msg.chat.id,
        'Holocron Hermes.\n' +
        '/dream — schedule a Honcho dream\n' +
        '/status — system health summary\n' +
        '/note <text> — append to active thread Notes\n' +
        '/ingest <URL> — capture to Foundry queue\n' +
        '(plain text) — chat with the active thread (Sonnet)')
    } else if (text.startsWith('/')) {
      await sendTelegram(token, msg.chat.id, `Unknown command. Try /help.`)
    } else {
      await handlePlainMessage(token, msg.chat.id, text)
    }
  } catch (err) {
    console.warn('[Hermes] handler error:', (err as Error).message)
    await sendTelegram(token, msg.chat.id, `Error: ${(err as Error).message}`)
  }
}

// ── Command handlers ─────────────────────────────────────────────────────

async function handleDream(token: string, chatId: number): Promise<void> {
  const cfg = loadConfig()
  const res = await scheduleDream(cfg.honcho.url, 'omni')
  if (res.ok) {
    await sendTelegram(token, chatId,
      '🌀 Dream scheduled. Honcho is synthesizing in the background — check the Hive Dreams panel later.')
  } else {
    await sendTelegram(token, chatId, `Dream failed: ${res.error ?? `HTTP ${res.status}`}`)
  }
}

async function handleStatus(token: string, chatId: number): Promise<void> {
  // Pull every metric from existing main-side functions — no new DB
  // queries (per Andy's Part D constraint).
  const [status, stats, foundry] = await Promise.all([
    getDashboardStatus().catch(() => null),
    getDashboardStats().catch(() => null),
    gatherFoundryStats().catch(() => null),
  ])

  const lines: string[] = []
  lines.push('🛰  HOLOCRON STATUS')

  if (status) {
    const spend = `$${status.spendToday.toFixed(2)} / $${status.dailyBudget.toFixed(2)}`
    lines.push(`Spend today: ${spend}${status.hardStop ? ' (hard-stop on)' : ''}`)
    const downServices: string[] = []
    if (!status.postgres) downServices.push('postgres')
    if (!status.honcho)   downServices.push('honcho')
    if (!status.redis)    downServices.push('redis')
    if (downServices.length > 0) {
      lines.push(`⚠ Services down: ${downServices.join(', ')}`)
    }
    const missingKeys: string[] = []
    if (!status.geminiKey)    missingKeys.push('Gemini')
    if (!status.anthropicKey) missingKeys.push('Anthropic')
    if (missingKeys.length > 0) {
      lines.push(`⚠ API keys missing: ${missingKeys.join(', ')}`)
    }
  } else {
    lines.push('⚠ Dashboard probe failed')
  }

  if (stats) {
    lines.push(`Docs ${stats.documents} · Wiki ${stats.wikiPages} · Syntheses ${stats.syntheses}`)
    lines.push(`Tags ${stats.tags} · Edges ${stats.relationships} · Notes/wk ${stats.notesThisWeek}`)
  }

  if (foundry) {
    lines.push(
      `Foundry pending ${foundry.pendingCount} · admitted ${foundry.admittedCount} · rejected ${foundry.rejectedCount}`,
    )
    if (foundry.lastCapturedAt) {
      lines.push(`Last capture: ${formatRelative(foundry.lastCapturedAt)}`)
    }
  }

  const allHealthy = status && status.postgres && status.honcho && status.redis && foundry?.pendingCount === 0
  lines.push(allHealthy ? '✅ All systems nominal.' : '')

  await sendTelegram(token, chatId, lines.filter((l) => l !== '').join('\n'))
}

/** Render an ISO timestamp as a relative phrase ("4 min ago", "2 hr ago",
 *  "yesterday", "3 days ago"). Falls back to the raw timestamp if parsing
 *  fails. Tiny utility — kept inline to avoid pulling in date-fns just for
 *  the /status reply. */
function formatRelative(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  const dMs = Date.now() - t
  if (dMs < 60_000) return 'just now'
  const m = Math.floor(dMs / 60_000)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

async function handleNote(token: string, chatId: number, content: string): Promise<void> {
  if (!content) {
    await sendTelegram(token, chatId, 'Usage: /note <text>')
    return
  }
  const cfg = loadConfig()
  if (!cfg.activeThreadPath || !cfg.activeProjectName || !cfg.activeThreadName) {
    await sendTelegram(token, chatId,
      'No active thread on desktop. Switch to a thread first, or pop into Scribe and create one.')
    return
  }
  const res = await appendNote(cfg.activeThreadPath, cfg.activeProjectName, cfg.activeThreadName, content)
  if (res.ok) {
    const where = `${cfg.activeProjectName} / ${cfg.activeThreadName}`
    await sendTelegram(token, chatId, `📝 Noted → ${where}${res.createdFile ? ' (created Notes file)' : ''}`)
  } else {
    await sendTelegram(token, chatId, `Note failed: ${res.error ?? 'unknown error'}`)
  }
}

async function handleIngest(token: string, chatId: number, url: string): Promise<void> {
  if (!url) {
    await sendTelegram(token, chatId, 'Usage: /ingest <URL>')
    return
  }
  const res = await captureUrl(url, 'extract')
  if (res.ok) {
    await sendTelegram(token, chatId, `🔗 Captured — triage queued in Foundry. Review in the desktop app.`)
  } else {
    await sendTelegram(token, chatId, `Ingest failed: ${res.error ?? 'unknown error'}`)
  }
}

async function handlePlainMessage(token: string, chatId: number, text: string): Promise<void> {
  const cfg = loadConfig()
  if (!cfg.activeThreadPath || !cfg.activeProjectName || !cfg.activeThreadName) {
    await sendTelegram(token, chatId,
      'No active thread on desktop. Switch to a thread first, or use /note for a quick capture.')
    return
  }

  const apiKey = cfg.anthropic.apiKey.trim()
  if (!apiKey) {
    await sendTelegram(token, chatId,
      'Anthropic API key not configured. Set it in Settings → Connections on the desktop.')
    return
  }
  const model = cfg.anthropic.model || 'claude-sonnet-4-6'

  // Resolve / create the Honcho session for the active thread, mirroring
  // the renderer's `thread:bind-honcho` flow so a phone reply lands on the
  // same session the desktop chat is talking to.
  const baseUrl = cfg.honcho.url
  let honchoSessionId: string
  try {
    const bound = await bindThreadHoncho(
      cfg.activeThreadPath,
      cfg.activeThreadName,
      cfg.activeProjectName,
      async (candidate) => (await initHoncho(baseUrl, candidate)).sessionId,
    )
    honchoSessionId = bound.honchoSessionId
  } catch (err) {
    await sendTelegram(token, chatId, `Honcho bind failed: ${(err as Error).message}`)
    return
  }

  // Save the user's message to Honcho FIRST so the context fetch below
  // includes it. Failure here is logged but non-fatal — we still want to
  // reply (better degraded than mute).
  await addMessage(baseUrl, honchoSessionId, 'andy', text).catch((err) => {
    console.warn('[Hermes/plain] honcho addMessage (user) failed:', (err as Error).message)
  })

  // Pull rolling Honcho context. 6000 tokens matches the renderer's
  // Reset-Context call shape — Honcho's server-side compression gives us
  // a summary + the most recent turns inside that budget.
  const ctx = await getSessionContext(baseUrl, honchoSessionId, 6000).catch(() => null)
  const history = ctx?.messages ?? []
  const summaryBlock = ctx?.summary
    ? `\n\nPrior-session summary:\n${ctx.summary}`
    : ''

  const system =
    `You are Holocron, Andy's local-first AI research partner. ` +
    `This message is coming from Telegram on his phone; the desktop's active thread is ` +
    `"${cfg.activeProjectName} / ${cfg.activeThreadName}". ` +
    `Reply concisely — Telegram message length matters. Keep markdown light (Telegram doesn't render headings).` +
    summaryBlock

  const reply = await chat({
    provider: 'anthropic',
    model,
    apiKey,
    messages: [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: text },
    ],
    temperature: 0.7,
    maxTokens: 1024,
    stream: false,
    task: 'hermes-chat',
  })

  if (reply.error || !reply.content.trim()) {
    await sendTelegram(token, chatId, `Sonnet error: ${reply.error ?? 'empty response'}`)
    return
  }

  // Save the assistant reply back so the next plain-message turn (and
  // the desktop chat, when Andy switches back) both see it.
  await addMessage(baseUrl, honchoSessionId, 'holocron', reply.content).catch((err) => {
    console.warn('[Hermes/plain] honcho addMessage (assistant) failed:', (err as Error).message)
  })

  await sendTelegram(token, chatId, reply.content)
}

// ── iCloud Drive watcher (Part C) ────────────────────────────────────────
//
// Dedicated chokidar instance, intentionally NOT routed through
// `workspace.ts:startWatcher` — that function kills its previous watcher
// on every call (gotcha line 41), so calling it here would silently
// disable Codex ingestion for the rest of the session. Same polling
// config as the workspace watcher (gotcha line 39 — never fsevents on
// macOS, especially not for iCloud paths which are stuttery).

const ICLOUD_TEXT_EXTS   = new Set(['.txt', '.md'])
const ICLOUD_BINARY_EXTS = new Set(['.pdf', '.docx'])

export async function startIcloudWatcher(cfg?: HolocronConfig): Promise<{ ok: boolean; error?: string; path?: string }> {
  if (icloudWatcher) {
    return { ok: true, path: icloudWatchPath ?? undefined }
  }
  const c = cfg ?? loadConfig()
  const raw = readIcloudInbox(c)
  if (!raw) return { ok: false, error: 'iCloud inbox path not configured' }
  const expanded = expandHome(raw)

  try {
    // Auto-create. iCloud Drive will pick it up server-side; the user
    // doesn't need to mkdir manually.
    await fs.promises.mkdir(expanded, { recursive: true })
  } catch (err) {
    return { ok: false, error: `cannot create iCloud inbox: ${(err as Error).message}` }
  }

  icloudWatcher = chokidar.watch(expanded, {
    ignoreInitial: true,
    depth: 1,                                              // top-level files only — no recursion into subfolders
    usePolling: true,                                      // gotcha line 39 — never fsevents on macOS
    interval: 1000,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  })
  icloudWatchPath = expanded

  icloudWatcher.on('add', (filePath) => {
    void handleIcloudFile(filePath)
  })

  console.log(`[Hermes/iCloud] watching ${expanded}`)
  return { ok: true, path: expanded }
}

export function stopIcloudWatcher(): void {
  if (!icloudWatcher) return
  void icloudWatcher.close().catch((err) => {
    console.warn('[Hermes/iCloud] close failed:', (err as Error).message)
  })
  icloudWatcher = null
  icloudWatchPath = null
  console.log('[Hermes/iCloud] watcher stopped')
}

async function handleIcloudFile(filePath: string): Promise<void> {
  const basename = path.basename(filePath)
  // iCloud Drive sprinkles `.icloud` placeholder files (the file isn't yet
  // downloaded locally) and .DS_Store; ignore hidden files entirely.
  if (basename.startsWith('.')) return
  const ext = path.extname(basename).toLowerCase()

  console.log(`[Hermes/iCloud] new file: ${basename}`)
  try {
    let res: { ok: boolean; id?: string; error?: string }
    if (ICLOUD_TEXT_EXTS.has(ext)) {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      if (!content.trim()) {
        console.log(`[Hermes/iCloud] skip ${basename} — empty`)
        return
      }
      res = await captureFile(content, basename, 'extract')
    } else if (ICLOUD_BINARY_EXTS.has(ext)) {
      const bytes = await fs.promises.readFile(filePath)
      res = await captureFileBinary(new Uint8Array(bytes), basename, 'extract')
    } else {
      console.log(`[Hermes/iCloud] skip ${basename} — unsupported ext ${ext || '(none)'}`)
      return
    }

    if (res.ok) {
      // Best-effort Telegram heads-up. No-op when Telegram isn't configured.
      await notifyTelegram(`📥 New file in iCloud inbox: ${basename} — triage queued`)
    } else {
      console.warn(`[Hermes/iCloud] capture failed for ${basename}: ${res.error}`)
      await notifyTelegram(`⚠ iCloud capture failed for ${basename}: ${res.error}`)
    }
  } catch (err) {
    console.warn(`[Hermes/iCloud] handler error for ${basename}:`, (err as Error).message)
  }
}
