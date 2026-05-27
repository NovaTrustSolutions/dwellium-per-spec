// Node-only stub for `electron`. The dev/main code imports `app` (for the
// userData path that holocron-config.json lives in) and `BrowserWindow`
// (workspace.ts uses it to broadcast fs-change events). Neither has a sensible
// implementation under vitest; we just satisfy the types and route file paths
// to an isolated temp dir.

import { tmpdir } from 'os'
import path from 'path'
import fs from 'fs'

const stubUserData = path.join(tmpdir(), 'holocron-test-userdata')
if (!fs.existsSync(stubUserData)) fs.mkdirSync(stubUserData, { recursive: true })

export const app = {
  getPath(name: string): string {
    if (name === 'userData') return stubUserData
    return tmpdir()
  },
}

export const safeStorage = {
  isEncryptionAvailable(): boolean {
    return true
  },
  encryptString(value: string): Buffer {
    return Buffer.from(value, 'utf-8')
  },
  decryptString(value: Buffer): string {
    return value.toString('utf-8')
  },
}

export const BrowserWindow = {
  getAllWindows(): unknown[] {
    return []
  },
}
