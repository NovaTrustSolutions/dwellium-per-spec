export interface ScrapeResult {
  markdown: string
  title: string
  url: string
}

export interface SearchResult {
  results: Array<{ title: string; url: string; markdown: string }>
}

export async function firecrawlScrape(apiKey: string, baseUrl: string, url: string): Promise<ScrapeResult> {
  const res = await fetch(`${baseUrl}/v1/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ['markdown'] }),
  })
  if (!res.ok) throw new Error(`Firecrawl scrape ${res.status}: ${await res.text()}`)
  const data = await res.json() as { data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } } }
  return {
    markdown: data.data?.markdown ?? '',
    title: data.data?.metadata?.title ?? url,
    url: data.data?.metadata?.sourceURL ?? url,
  }
}

export async function firecrawlSearch(apiKey: string, baseUrl: string, query: string): Promise<SearchResult> {
  const res = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ['markdown'] } }),
  })
  if (!res.ok) throw new Error(`Firecrawl search ${res.status}: ${await res.text()}`)
  const data = await res.json() as { data?: Array<{ title: string; url: string; markdown: string }> }
  return {
    results: (data.data ?? []).map((r) => ({ title: r.title ?? r.url, url: r.url, markdown: r.markdown ?? '' })),
  }
}

export async function testFirecrawl(apiKey: string, baseUrl: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${baseUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'] }),
    })
    if (res.status === 401) return { ok: false, message: 'Invalid API key' }
    if (res.ok || res.status === 429) return { ok: true, message: 'Connected' }
    return { ok: false, message: `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}
