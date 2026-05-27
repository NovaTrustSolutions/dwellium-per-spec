import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { DEFAULT_CONFIG, loadConfig, saveConfig, type HolocronConfig } from '../src/main/config'

const configPath = path.join(tmpdir(), 'holocron-test-userdata', 'holocron-config.json')

function readRawConfig(): string {
  return fs.readFileSync(configPath, 'utf-8')
}

describe('secure config storage', () => {
  it('encrypts sensitive fields on disk and decrypts them on load', () => {
    const config: HolocronConfig = {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai, apiKey: 'local-secret' },
      gemini: { ...DEFAULT_CONFIG.gemini, apiKey: 'gemini-secret' },
      anthropic: { ...DEFAULT_CONFIG.anthropic, apiKey: 'anthropic-secret' },
      honcho: { ...DEFAULT_CONFIG.honcho, token: 'honcho-secret' },
      firecrawl: { ...DEFAULT_CONFIG.firecrawl, apiKey: 'firecrawl-secret' },
      telegram: { botToken: 'telegram-secret', allowedUserId: '123456' },
    }

    saveConfig(config)

    const raw = readRawConfig()
    expect(raw).not.toContain('gemini-secret')
    expect(raw).not.toContain('anthropic-secret')
    expect(raw).not.toContain('firecrawl-secret')
    expect(raw).toContain('__agenteryxSecure')

    const loaded = loadConfig()
    expect(loaded.gemini.apiKey).toBe('gemini-secret')
    expect(loaded.anthropic.apiKey).toBe('anthropic-secret')
    expect(loaded.firecrawl.apiKey).toBe('firecrawl-secret')
    expect(loaded.telegram.botToken).toBe('telegram-secret')
    expect(loaded.telegram.allowedUserId).toBe('123456')
  })
})
