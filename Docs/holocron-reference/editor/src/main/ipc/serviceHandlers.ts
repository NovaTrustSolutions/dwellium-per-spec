import { ipcMain } from 'electron'
import { getDockerStatus, dockerStart, dockerStop } from '../docker'
import { firecrawlScrape, firecrawlSearch, testFirecrawl } from '../firecrawl'

export function registerServiceIpcHandlers(): void {
  ipcMain.handle('connection:test-ai', async (_, args: { baseUrl: string; model: string; apiKey: string }) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (args.apiKey) headers['Authorization'] = `Bearer ${args.apiKey}`
      const res = await fetch(`${args.baseUrl}/models`, { headers })
      if (res.ok) return { ok: true, message: 'Connected' }
      if (res.status === 401) return { ok: false, message: 'Invalid API key' }
      return { ok: true, message: `Reachable (${res.status})` }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  })

  ipcMain.handle('connection:test-honcho', async (_, args: { url: string }) => {
    try {
      const res = await fetch(`${args.url}/v1/apps/holocron/users`, { signal: AbortSignal.timeout(5000) })
      return res.ok || res.status === 404
        ? { ok: true, message: 'Connected' }
        : { ok: false, message: `HTTP ${res.status}` }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  })

  ipcMain.handle('connection:test-firecrawl', async (_, args: { apiKey: string; baseUrl: string }) =>
    testFirecrawl(args.apiKey, args.baseUrl)
  )

  ipcMain.handle('docker:status', () => getDockerStatus())
  ipcMain.handle('docker:start', () => dockerStart())
  ipcMain.handle('docker:stop', () => dockerStop())

  ipcMain.handle('firecrawl:scrape', async (_, args: { apiKey: string; baseUrl: string; url: string }) => {
    try {
      return await firecrawlScrape(args.apiKey, args.baseUrl, args.url)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('firecrawl:search', async (_, args: { apiKey: string; baseUrl: string; query: string }) => {
    try {
      return await firecrawlSearch(args.apiKey, args.baseUrl, args.query)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
}
