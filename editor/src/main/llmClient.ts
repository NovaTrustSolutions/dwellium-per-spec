import { ragQuery } from './ragDb'

export type Provider = 'gemini' | 'anthropic' | 'lmstudio'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  provider: Provider
  model: string
  apiKey?: string
  baseUrl?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  task?: string
  onToken?: (token: string) => void
  abortSignal?: AbortSignal
}

export interface ChatResponse {
  content: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  error?: string
}

export interface BudgetStatus {
  allowed: boolean
  spentToday: number
  limit: number
  hardStop: boolean
}

// USD per 1M tokens. Manual update when rates change.
export const PRICING: Record<Provider, { input: number; output: number }> = {
  gemini:    { input: 0.075, output: 0.30 },
  anthropic: { input: 3.0,   output: 15.0 },
  lmstudio:  { input: 0,     output: 0 },
}

const DEFAULT_DAILY_LIMIT_USD = 5.0
const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1'
const ANTHROPIC_VERSION = '2023-06-01'

export function estimateCostUsd(
  provider: Provider,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING[provider]
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

// ── Budget ────────────────────────────────────────────────────────────────

async function ensureBudgetDefaults(): Promise<void> {
  // Idempotent: ON CONFLICT DO NOTHING leaves user-edited values alone.
  await ragQuery(
    `INSERT INTO rag_config (key, value) VALUES
       ('daily_budget_usd', $1),
       ('budget_hard_stop', 'false')
     ON CONFLICT (key) DO NOTHING`,
    [String(DEFAULT_DAILY_LIMIT_USD)]
  )
}

export async function checkBudget(): Promise<BudgetStatus> {
  await ensureBudgetDefaults().catch(() => {})

  const cfg = await ragQuery<{ key: string; value: string }>(
    "SELECT key, value FROM rag_config WHERE key IN ('daily_budget_usd','budget_hard_stop')"
  )
  const spent = await ragQuery<{ total: string | null }>(
    "SELECT COALESCE(SUM(cost_usd), 0)::text AS total FROM rag_operations_log " +
      "WHERE created_at >= date_trunc('day', NOW())"
  )

  const cfgMap = new Map<string, string>((cfg?.rows ?? []).map((r) => [r.key, r.value]))
  const limit = cfgMap.has('daily_budget_usd')
    ? Number(cfgMap.get('daily_budget_usd'))
    : DEFAULT_DAILY_LIMIT_USD
  const hardStop = cfgMap.get('budget_hard_stop') === 'true'
  const spentToday = spent?.rows[0]?.total ? Number(spent.rows[0].total) : 0

  return {
    allowed: !hardStop || spentToday < limit,
    spentToday,
    limit,
    hardStop,
  }
}

async function logOperation(args: {
  provider: Provider
  task?: string
  model: string
  duration: number
  costUsd: number
  inputTokens: number
  outputTokens: number
  error?: string
}): Promise<void> {
  // Best-effort. Never let a logging failure surface to the caller.
  try {
    await ragQuery(
      `INSERT INTO rag_operations_log
         (operation, target_id, target_type, details, duration_ms, cost_usd, provider)
       VALUES ('query', NULL, NULL, $1::jsonb, $2, $3, $4)`,
      [
        JSON.stringify({
          model: args.model,
          task: args.task ?? null,
          input_tokens: args.inputTokens,
          output_tokens: args.outputTokens,
          ...(args.error ? { error: args.error } : {}),
        }),
        args.duration,
        args.costUsd,
        args.provider,
      ]
    )
  } catch (err) {
    console.warn('[llmClient] cost log insert failed:', (err as Error).message)
  }
}

// ── OpenAI-compatible adapter (Gemini + LM Studio) ────────────────────────

async function openAICompatAdapter(req: ChatRequest): Promise<ChatResponse> {
  if (!req.baseUrl) return { content: '', error: 'baseUrl required for OpenAI-compatible providers' }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (req.apiKey) headers['Authorization'] = `Bearer ${req.apiKey}`

  // Cloud providers (Gemini) report token usage when stream_options.include_usage
  // is set. LM Studio's parser rejects unknown fields on some builds, so only
  // request usage on cloud providers — LM Studio bypasses cost tracking anyway.
  const requestUsage = req.provider === 'gemini'

  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: req.stream ?? false,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 1024,
  }
  if (requestUsage) {
    body.stream_options = { include_usage: true }
  }

  const url = `${req.baseUrl}/chat/completions`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.abortSignal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { content: '', error: '__aborted__' }
    return { content: '', error: (err as Error).message }
  }

  if (!response.ok) {
    const text = await response.text()
    let errMsg = `HTTP ${response.status}`
    try {
      errMsg = (JSON.parse(text) as { error?: { message?: string } })?.error?.message ?? errMsg
    } catch { /* */ }
    return { content: '', error: errMsg }
  }

  if (!req.stream) {
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    }
  }

  // Streaming: parse SSE lines, accumulate content, capture usage from the
  // final chunk (when include_usage is on the choices array can be empty and
  // usage lives at the top level).
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  const reader = (response.body as unknown as ReadableStream<Uint8Array>).getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
            usage?: { prompt_tokens?: number; completion_tokens?: number }
          }
          const delta = parsed.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            accumulated += delta
            req.onToken?.(delta)
          }
          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens ?? inputTokens
            outputTokens = parsed.usage.completion_tokens ?? outputTokens
          }
        } catch { /* malformed chunk — skip */ }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { content: accumulated, error: '__aborted__', inputTokens, outputTokens }
    }
    return { content: accumulated, error: (err as Error).message, inputTokens, outputTokens }
  }

  return { content: accumulated, inputTokens, outputTokens }
}

// ── Anthropic native adapter ──────────────────────────────────────────────

async function anthropicAdapter(req: ChatRequest): Promise<ChatResponse> {
  if (!req.apiKey) return { content: '', error: 'Anthropic API key required' }

  // Pull system messages out of the conversation; concatenate (with blank-line
  // separators) and send as the top-level `system` parameter.
  const systemParts = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .filter((c) => c.trim().length > 0)
  const convo = req.messages.filter((m) => m.role !== 'system')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': req.apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  }

  const body: Record<string, unknown> = {
    model: req.model,
    messages: convo.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: req.maxTokens ?? 1024,
    temperature: req.temperature ?? 0.7,
    stream: req.stream ?? false,
  }
  if (systemParts.length > 0) body.system = systemParts.join('\n\n')

  const url = `${req.baseUrl ?? ANTHROPIC_API_BASE}/messages`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.abortSignal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { content: '', error: '__aborted__' }
    return { content: '', error: (err as Error).message }
  }

  if (!response.ok) {
    const text = await response.text()
    let errMsg = `HTTP ${response.status}`
    try {
      errMsg = (JSON.parse(text) as { error?: { message?: string } })?.error?.message ?? errMsg
    } catch { /* */ }
    return { content: '', error: errMsg }
  }

  if (!req.stream) {
    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const content = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
    return {
      content,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    }
  }

  // Streaming: Anthropic SSE event types we care about —
  //   message_start: includes usage.input_tokens
  //   content_block_delta: { delta: { type: 'text_delta', text: '...' } }
  //   message_delta: includes usage.output_tokens (cumulative final count)
  //   message_stop: end marker
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  const reader = (response.body as unknown as ReadableStream<Uint8Array>).getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data) continue
        try {
          const parsed = JSON.parse(data) as {
            type?: string
            delta?: { type?: string; text?: string }
            message?: { usage?: { input_tokens?: number; output_tokens?: number } }
            usage?: { input_tokens?: number; output_tokens?: number }
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const text = parsed.delta.text ?? ''
            if (text) {
              accumulated += text
              req.onToken?.(text)
            }
          } else if (parsed.type === 'message_start' && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens ?? inputTokens
            outputTokens = parsed.message.usage.output_tokens ?? outputTokens
          } else if (parsed.type === 'message_delta' && parsed.usage) {
            outputTokens = parsed.usage.output_tokens ?? outputTokens
          }
        } catch { /* malformed chunk — skip */ }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { content: accumulated, error: '__aborted__', inputTokens, outputTokens }
    }
    return { content: accumulated, error: (err as Error).message, inputTokens, outputTokens }
  }

  return { content: accumulated, inputTokens, outputTokens }
}

// ── Public entry ──────────────────────────────────────────────────────────

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  // Pre-check budget for cloud calls only. Local model bypasses entirely.
  if (req.provider !== 'lmstudio') {
    const b = await checkBudget().catch(() => null)
    if (b && b.hardStop && !b.allowed) {
      const msg = `Daily budget exceeded ($${b.spentToday.toFixed(4)} / $${b.limit.toFixed(2)}). Disable hard-stop in Settings or wait until tomorrow.`
      return { content: '', error: msg, inputTokens: 0, outputTokens: 0, costUsd: 0 }
    }
  }

  const start = Date.now()
  const adapter = req.provider === 'anthropic' ? anthropicAdapter : openAICompatAdapter
  const res = await adapter(req)
  const duration = Date.now() - start

  // Estimate tokens if the adapter didn't capture them. ~4 chars per token is
  // a rough approximation; good enough for budget tracking when usage telemetry
  // is missing.
  const inputTokens = res.inputTokens ?? Math.ceil(
    req.messages.reduce((n, m) => n + m.content.length, 0) / 4
  )
  const outputTokens = res.outputTokens ?? Math.ceil(res.content.length / 4)
  const costUsd = estimateCostUsd(req.provider, inputTokens, outputTokens)

  res.inputTokens = inputTokens
  res.outputTokens = outputTokens
  res.costUsd = costUsd

  // LM Studio is local — zero cost. Skip the log row entirely so the table
  // stays meaningful (only cloud spend lives there).
  if (req.provider !== 'lmstudio') {
    void logOperation({
      provider: req.provider,
      task: req.task,
      model: req.model,
      duration,
      costUsd,
      inputTokens,
      outputTokens,
      error: res.error && res.error !== '__aborted__' ? res.error : undefined,
    })
  }

  return res
}
