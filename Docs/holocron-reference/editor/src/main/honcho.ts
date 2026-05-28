const WORKSPACE_ID = 'holocron'
const PEER_USER = 'andy'
const PEER_ASSISTANT = 'holocron'
const SESSION_MAIN = 'main-session'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || SESSION_MAIN
}

async function hFetch(baseUrl: string, path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${baseUrl}${path}`
  const method = options.method ?? 'GET'
  console.log(`[Honcho] → ${method} ${url}`, options.body ? options.body : '')
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json' }
  })
  console.log(`[Honcho] ← ${res.status} ${method} ${path}`)
  return res
}

// ── Init (idempotent — safe to call on every startup) ────────────────────────

export async function initHoncho(baseUrl: string, sessionId?: string): Promise<{ sessionId: string }> {
  console.log('[Honcho] initHoncho start, baseUrl:', baseUrl)

  const sid = sessionId ? slugify(sessionId) : SESSION_MAIN

  const wsRes = await hFetch(baseUrl, '/v3/workspaces', {
    method: 'POST',
    body: JSON.stringify({ id: WORKSPACE_ID })
  })
  const wsText = await wsRes.text()
  console.log('[Honcho] workspace status:', wsRes.status, wsRes.status === 409 ? '(already exists)' : '(created)', wsText)

  const peerRes = await hFetch(baseUrl, `/v3/workspaces/${WORKSPACE_ID}/peers`, {
    method: 'POST',
    body: JSON.stringify({ id: PEER_USER })
  })
  const peerText = await peerRes.text()
  console.log('[Honcho] peer andy status:', peerRes.status, peerText)

  const sessRes = await hFetch(baseUrl, `/v3/workspaces/${WORKSPACE_ID}/sessions`, {
    method: 'POST',
    body: JSON.stringify({ id: sid, peers: { [PEER_USER]: {}, [PEER_ASSISTANT]: {} } })
  })
  const sessText = await sessRes.text()
  console.log('[Honcho] session main-session status:', sessRes.status, sessText)

  console.log('[Honcho] initHoncho complete, sessionId:', sid)
  return { sessionId: sid }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function createNewSession(baseUrl: string): Promise<string> {
  const sessionId = `session-${Date.now()}`
  console.log('[Honcho] createNewSession:', sessionId)
  const res = await hFetch(baseUrl, `/v3/workspaces/${WORKSPACE_ID}/sessions`, {
    method: 'POST',
    body: JSON.stringify({ id: sessionId, peers: { [PEER_USER]: {}, [PEER_ASSISTANT]: {} } })
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Honcho createNewSession ${res.status}: ${text}`)
  console.log('[Honcho] createNewSession OK:', sessionId)
  return sessionId
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function addMessage(
  baseUrl: string,
  sessionId: string,
  peerId: string,
  content: string
): Promise<void> {
  console.log(`[Honcho] addMessage workspace=${WORKSPACE_ID} session=${sessionId} peer=${peerId} content="${content.slice(0, 80)}${content.length > 80 ? '…' : ''}"`)
  const res = await hFetch(baseUrl, `/v3/workspaces/${WORKSPACE_ID}/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ content, peer_id: peerId }] })
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Honcho addMessage ${res.status}: ${text}`)
  console.log('[Honcho] addMessage OK')
}

export async function getMessages(
  baseUrl: string,
  sessionId: string
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  console.log('[Honcho] getMessages session:', sessionId)
  const res = await hFetch(baseUrl, `/v3/workspaces/${WORKSPACE_ID}/sessions/${sessionId}/messages/list`, {
    method: 'POST',
    body: JSON.stringify({})
  })
  if (!res.ok) {
    const text = await res.text()
    console.warn('[Honcho] getMessages failed:', res.status, text)
    return []
  }
  const data = await res.json() as { items?: Array<{ content: string; peer_id: string }> }
  console.log('[Honcho] getMessages returned', data.items?.length ?? 0, 'messages')
  const items = data.items ?? []
  const mapped = items.map((m) => ({
    role: (m.peer_id === PEER_ASSISTANT ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content
  }))
  // ChatDiag: detect anomalies in what Honcho returns. If the role pattern
  // breaks user/assistant alternation (e.g. "uuaau"), Honcho's ingest order
  // is wrong. If we see the same content string twice in a row, Honcho is
  // duplicating writes. Either is a server-side bug, not a renderer one.
  const rolePattern = mapped.map((m) => m.role[0]).join('')
  const dupes = mapped.reduce((count, m, i) => {
    if (i > 0 && mapped[i - 1].content === m.content) return count + 1
    return count
  }, 0)
  const totalChars = mapped.reduce((sum, m) => sum + m.content.length, 0)
  console.log(`[ChatDiag] honcho-fetch session=${sessionId.slice(0, 8)} count=${mapped.length} roles="${rolePattern}" totalChars=${totalChars} adjacentDupes=${dupes}`)
  return mapped
}

// ── Conclusions (CoPaw write-target) ─────────────────────────────────────────
//
// Honcho v3 memory is built on Conclusions — logical facts the system derives
// from interactions. The dialectic /chat endpoint synthesizes FROM the
// conclusions corpus, not from raw messages. Writing conclusions explicitly
// (rather than relying on Honcho's auto-derivation from message text) makes
// the memory layer denser and produces materially better dream output.
//
// CoPaw is the auto-capture client: after every assistant response, it
// regex-extracts key facts and posts them here. See `src/renderer/.../useLMStream.ts`.

export interface ConclusionPayload {
  content: string
  /** Session the conclusion derives from. Optional — Honcho accepts free-floating
   *  conclusions but session-scoped ones thread better through the dreamer. */
  session_id?: string
}

export async function postConclusion(
  baseUrl: string,
  conclusion: ConclusionPayload,
): Promise<{ ok: boolean; error?: string }> {
  const path = `/v3/workspaces/${WORKSPACE_ID}/conclusions`
  const body = {
    conclusions: [{
      content: conclusion.content,
      observer_id: PEER_USER,    // 'andy'
      observed_id: PEER_USER,    // 'andy' — self-observed conclusions
      ...(conclusion.session_id ? { session_id: conclusion.session_id } : {}),
    }],
  }
  console.log(`[Honcho/Conclusion] → POST ${path} content="${conclusion.content.slice(0, 60)}${conclusion.content.length > 60 ? '…' : ''}"`)
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[Honcho/Conclusion] ← ${res.status} ${path} (degrading)`, text.slice(0, 200))
      return { ok: false, error: `HTTP ${res.status}` }
    }
    console.log(`[Honcho/Conclusion] ← ${res.status} OK`)
    return { ok: true }
  } catch (err) {
    console.warn('[Honcho/Conclusion] failed (degrading):', (err as Error).message)
    return { ok: false, error: (err as Error).message }
  }
}

// ── Schedule Dream (preferred trigger) ───────────────────────────────────────
//
// `POST /v3/workspaces/{ws}/schedule_dream` is the canonical Honcho v3
// dream trigger. Returns 204 on success — the dream runs server-side and
// the result is then queryable. Older Honcho deployments without this
// endpoint will 404/405 — `honchoDream()` falls back to the dialectic
// `/chat` endpoint in that case (preserves Session 2 behaviour).

export async function scheduleDream(
  baseUrl: string,
  dreamType: 'omni' | 'theme' = 'omni',
): Promise<{ ok: boolean; status: number; error?: string }> {
  const path = `/v3/workspaces/${WORKSPACE_ID}/schedule_dream`
  console.log(`[Honcho/ScheduleDream] → POST ${path} dream_type=${dreamType}`)
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observer: PEER_USER, dream_type: dreamType }),
    })
    if (res.status === 204 || res.ok) {
      console.log(`[Honcho/ScheduleDream] ← ${res.status} scheduled`)
      return { ok: true, status: res.status }
    }
    const text = await res.text().catch(() => '')
    console.warn(`[Honcho/ScheduleDream] ← ${res.status} (caller may fall back)`, text.slice(0, 200))
    return { ok: false, status: res.status, error: `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message }
  }
}

// ── Dreaming Agent (Honcho dialectic /chat endpoint) ─────────────────────────
//
// Honcho v3 exposes a per-peer dialectic chat endpoint that synthesizes the
// peer's representation across sessions ("what does this peer's model of the
// world say about X"). We use it as the Dreaming Agent: ask Honcho to surface
// patterns across the user's sessions, scoped to the current thread context.
//
// Endpoint: POST /v3/workspaces/{ws}/peers/{peerId}/chat
// Body:     { queries: [string], stream: false, session_id?: string }
// Returns:  { content: string } (or 404/500 if the deployment doesn't have it
//           wired — we degrade gracefully).
//
// Per Session 2 spec: fail silently with console.warn — don't break chat flow.

export interface DreamContext {
  threadName: string
  projectName: string
  domaineName: string | null
}

/**
 * Result of a dream trigger. Honcho v3 has two relevant endpoints:
 *
 *   - `schedule_dream` is the canonical "trigger a dream" primitive — returns
 *     204 with no body, server processes asynchronously, result is queryable
 *     later. **Preferred** when available.
 *   - `/chat` (dialectic) returns a synthesized response synchronously — the
 *     fallback for deployments without `schedule_dream`, and the path that
 *     produces the immediate `insight` string Session 2 callers wired against.
 *
 * Callers must handle both modes:
 *   - `mode: 'scheduled'` → server-side dream is in flight, no immediate
 *     content; surface "scheduled" UX. Don't write to dreamInsights[] yet.
 *   - `mode: 'sync'` → immediate insight returned; persist to dreamInsights[].
 */
export type DreamResult =
  | { ok: true; mode: 'scheduled' }
  | { ok: true; mode: 'sync'; insight: string }
  | { ok: false; error: string }

export async function honchoDream(
  baseUrl: string,
  peerId: string,
  sessionId: string,
  context: DreamContext,
): Promise<DreamResult> {
  // Step 1 — try schedule_dream first (the architecturally-correct trigger).
  // 204 = scheduled; non-204 means the deployment doesn't have this endpoint
  // and we should fall back to /chat for the synchronous path.
  const sched = await scheduleDream(baseUrl, 'omni')
  if (sched.ok) {
    console.log('[Honcho/Dream] scheduled via schedule_dream (no synchronous insight)')
    return { ok: true, mode: 'scheduled' }
  }

  // Step 2 — fallback: dialectic /chat endpoint. Synchronous synthesis.
  const scopeBits: string[] = []
  if (context.domaineName) scopeBits.push(`Domain: ${context.domaineName}`)
  if (context.projectName) scopeBits.push(`Project: ${context.projectName}`)
  if (context.threadName)  scopeBits.push(`Current thread: ${context.threadName}`)
  const scope = scopeBits.length > 0 ? scopeBits.join(' · ') + '\n\n' : ''
  const query =
    `${scope}Synthesize patterns across my prior sessions that are relevant to this context. ` +
    `Surface recurring themes, unresolved questions, decisions I've revisited, and any insight I might be missing. ` +
    `Be concrete and brief — 3-6 sentences, no preamble.`

  const path = `/v3/workspaces/${WORKSPACE_ID}/peers/${peerId}/chat`
  console.log(`[Honcho/Dream] → POST ${baseUrl}${path} (schedule_dream returned ${sched.status}, falling back) scope="${scope.replace(/\n/g, ' / ')}"`)
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: [query], stream: false, session_id: sessionId }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[Honcho/Dream] ← ${res.status} ${path} (both endpoints unavailable; degrading)`, text.slice(0, 200))
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const data = await res.json() as { content?: string }
    const insight = (data.content ?? '').trim()
    if (!insight) {
      console.warn('[Honcho/Dream] empty insight content')
      return { ok: false, error: 'empty content' }
    }
    console.log(`[Honcho/Dream] ← 200 insight (${insight.length} chars)`)
    return { ok: true, mode: 'sync', insight }
  } catch (err) {
    console.warn('[Honcho/Dream] failed (degrading):', (err as Error).message)
    return { ok: false, error: (err as Error).message }
  }
}

// ── Session deletion (best-effort; Honcho v3 may not expose this) ────────────
//
// Honcho's "Clear" semantics live in two places: (1) message-level deletion
// inside a session, (2) session-level deletion. v3's DELETE on session is the
// canonical "wipe this session server-side" call. Older deployments may
// reject — we treat any non-2xx as "not supported" and fall back to "start a
// new session" semantics at the call site.

export async function deleteSession(
  baseUrl: string,
  sessionId: string,
): Promise<{ ok: boolean; supported: boolean; error?: string }> {
  const path = `/v3/workspaces/${WORKSPACE_ID}/sessions/${sessionId}`
  console.log(`[Honcho] → DELETE ${baseUrl}${path}`)
  try {
    const res = await fetch(`${baseUrl}${path}`, { method: 'DELETE' })
    if (res.status === 404 || res.status === 405) {
      console.warn(`[Honcho] deleteSession unsupported (${res.status}) — caller should rotate session instead`)
      return { ok: false, supported: false }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, supported: true, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    console.log(`[Honcho] deleteSession OK: ${sessionId}`)
    return { ok: true, supported: true }
  } catch (err) {
    return { ok: false, supported: true, error: (err as Error).message }
  }
}

// ── Context (server-side compression) ────────────────────────────────────────

export async function getSessionContext(
  baseUrl: string,
  sessionId: string,
  tokens = 6000
): Promise<{
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  summary: string | null
}> {
  console.log('[Honcho] getSessionContext session:', sessionId, 'tokens:', tokens)
  const res = await hFetch(
    baseUrl,
    `/v3/workspaces/${WORKSPACE_ID}/sessions/${sessionId}/context?tokens=${tokens}&summary=true`
  )
  if (!res.ok) {
    const text = await res.text()
    console.warn('[Honcho] getSessionContext failed:', res.status, text)
    return { messages: [], summary: null }
  }
  const data = await res.json() as {
    messages?: Array<{ content: string; peer_id: string }>
    summary?: string | null
  }
  console.log('[Honcho] getSessionContext returned', data.messages?.length ?? 0, 'messages, summary:', !!data.summary)
  return {
    messages: (data.messages ?? []).map((m) => ({
      role: (m.peer_id === PEER_ASSISTANT ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content
    })),
    summary: data.summary ?? null
  }
}
