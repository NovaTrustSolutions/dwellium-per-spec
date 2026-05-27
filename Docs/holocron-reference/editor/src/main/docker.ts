import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import os from 'os'

const execAsync = promisify(exec)
const COMPOSE_DIR = path.join(os.homedir(), 'holocron_link')

export interface DockerStatus {
  database: boolean
  redis: boolean
  api: boolean
  deriver: boolean
}

export async function getDockerStatus(): Promise<DockerStatus> {
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"')
    const names = stdout.toLowerCase()
    return {
      database: /postgres|database|db/.test(names),
      redis: names.includes('redis'),
      api: /\bapi\b|holocron.api/.test(names),
      deriver: names.includes('deriver'),
    }
  } catch {
    return { database: false, redis: false, api: false, deriver: false }
  }
}

export async function dockerStart(): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync('docker compose up -d', { cwd: COMPOSE_DIR, timeout: 30000 })
    return { ok: true, output: (stdout + stderr).trim() }
  } catch (err) {
    return { ok: false, output: (err as Error).message }
  }
}

export async function dockerStop(): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync('docker compose down', { cwd: COMPOSE_DIR, timeout: 30000 })
    return { ok: true, output: (stdout + stderr).trim() }
  } catch (err) {
    return { ok: false, output: (err as Error).message }
  }
}
